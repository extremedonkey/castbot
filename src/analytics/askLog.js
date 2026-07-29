/**
 * 👾 Ask CastBot event log — append-only JSONL corpus for ad-hoc analysis.
 *
 * WHY A NEW SINK, NOT user-analytics.log: that file is human prose, pipe-delimited, and
 * re-parsed by a fragile regex (analyticsLogger.js:365-373, which has had parse bugs).
 * This corpus exists to be machine-read — so it is JSONL, one event per line, with a
 * schema version. It is the first structured log in the repo.
 *
 * WHAT IT ANSWERS: which questions Ask CastBot handles well, and — the signal that
 * exists nowhere else today — whether the admin ACCEPTED or REJECTED what the model
 * proposed (plan.proposed → plan.applied / plan.cancelled / no terminal row = abandoned).
 *
 * FOUR HARD RULES (each earned):
 *  1. NEVER throws, NEVER rejects, and callers NEVER await it. A logging fault must not
 *     be able to slow or break an answer (house precedent: safariPlanApplier's
 *     "analytics is never fatal" catch).
 *  2. Writes are chained through one module-level promise. O_APPEND puts each write(2)
 *     at EOF, but Node's appendFile loops on partial writes — two concurrent 8KB appends
 *     CAN interleave, and one interleaved line corrupts a JSONL segment permanently.
 *  3. Async appendFile, not appendFileSync — the analytics logger blocks the event loop
 *     on every interaction; don't copy that.
 *  4. Every text field is truncated and redacted. This corpus leaves the box (S3) and is
 *     later fed to an LLM.
 *
 * READERS MUST STREAM. Never JSON.parse the whole file — that is precisely the OOM of
 * docs/incidents/06-HeapDriftGCDeathSpiral.md (20MB → 109k objects on a box with <5MB
 * headroom). Use utils/fileTail.js + utils/memoryGuard.js.
 *
 * @module askLog
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolved from the module, not process.cwd() — pm2 and the scripts run from different
// working directories, and a log that lands in two places is worse than no log.
export const ASK_LOG_FILE = path.join(__dirname, '..', '..', 'logs', 'ask-castbot.jsonl');

/** Bump ONLY on a breaking change to the envelope. Additive fields don't need it. */
export const SCHEMA_VERSION = 1;

/** Per-field caps. Generous — the point is a corpus, not a metrics counter. */
export const FIELD_CAPS = {
  query: 4000,        // modal max_length is 2000; never hit in practice
  response: 20000,
  reply: 4000,
  plan: 8000,
  message: 500,
  summary: 300
};

const MAX_TOOL_TRACE = 60;
const MAX_LIST_ITEMS = 40;

/**
 * Truncate without splitting a surrogate pair.
 *
 * Plain .substring() can cut a 4-byte emoji in half, producing a lone surrogate that
 * survives JSON.stringify as an invalid \uD83D and breaks strict parsers downstream.
 * (askCastBot.js's display-only `truncate` has this bug; don't inherit it in stored data.)
 * @returns {{value: string, truncated: boolean}}
 */
export function truncateField(value, max) {
  const str = String(value ?? '');
  if (str.length <= max) return { value: str, truncated: false };
  let end = max;
  const code = str.charCodeAt(end - 1);
  if (code >= 0xD800 && code <= 0xDBFF) end -= 1; // don't strand a high surrogate
  return { value: str.slice(0, end), truncated: true };
}

/**
 * Strip credential-shaped strings from anything user- or model-authored.
 * The CLI deny rules make a leak unlikely, but this corpus goes off-box.
 */
export function redact(text) {
  return String(text ?? '')
    .replace(/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/g, '[REDACTED:token]')
    .replace(/sk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED:key]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED:awskey]');
}

/** Which env produced this row — S3 keys partition on it. */
function resolveEnv() {
  if (process.env.PRODUCTION === 'TRUE') return 'prod';
  if (process.env.INSTANCE_ROLE === 'test') return 'test';
  return 'dev';
}

const TEXT_FIELDS = new Set(['query', 'response', 'reply', 'plan', 'message', 'summary']);

/**
 * Build one event object. PURE — no I/O, no throw. This is the whole testable core.
 *
 * @param {string} type - e.g. 'ask.request', 'plan.applied'
 * @param {Object} payload - ctx fields + event-specific fields
 * @param {number} [now] - injectable clock for tests
 * @returns {Object}
 */
export function buildAskEvent(type, payload = {}, now = Date.now()) {
  const event = {
    v: SCHEMA_VERSION,
    ts: new Date(now).toISOString(),
    ev: String(type),
    env: resolveEnv()
  };
  const truncated = [];

  for (const [key, raw] of Object.entries(payload || {})) {
    if (raw === undefined || raw === null) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    if (TEXT_FIELDS.has(key)) {
      const cap = FIELD_CAPS[key] ?? 2000;
      const { value, truncated: cut } = truncateField(redact(raw), cap);
      event[key] = value;
      if (cut) truncated.push(key);
      continue;
    }
    if (key === 'tool_trace' && Array.isArray(raw)) {
      event[key] = raw.slice(0, MAX_TOOL_TRACE).map(t => truncateField(t, 60).value);
      if (raw.length > MAX_TOOL_TRACE) truncated.push(key);
      continue;
    }
    if ((key === 'lines' || key === 'warnings') && Array.isArray(raw)) {
      event[key] = raw.slice(0, MAX_LIST_ITEMS).map(l => truncateField(redact(l), 150).value);
      if (raw.length > MAX_LIST_ITEMS) truncated.push(key);
      continue;
    }
    if (key === 'errors' && Array.isArray(raw)) {
      // The validator's per-op messages: the single best signal for "where the op schema
      // falls short" — currently rendered to the admin and then discarded.
      event[key] = raw.slice(0, 20).map(e => ({
        op: e?.opIndex ?? -1,
        msg: truncateField(e?.message, 200).value
      }));
      if (raw.length > 20) truncated.push(key);
      continue;
    }
    event[key] = raw;
  }

  if (truncated.length) event._trunc = truncated;
  return event;
}

/**
 * Serialize one event to a single JSONL line.
 * JSON.stringify escapes newlines, so the result is guaranteed to be exactly one line —
 * a raw \n would silently split one event into two malformed ones.
 */
export function serializeEvent(event) {
  return `${JSON.stringify(event)}\n`;
}

/** Is logging on? Set ASK_LOG_DISABLED=TRUE to mute it entirely. */
export function isAskLogEnabled() {
  return process.env.ASK_LOG_DISABLED !== 'TRUE';
}

// --- write path -------------------------------------------------------------

let writeQueue = Promise.resolve();
let dirEnsured = false;
let lastErrorAt = 0;

/** Rate-limited error surface: a full disk must not produce 100k console lines. */
function noteError(error) {
  const now = Date.now();
  if (now - lastErrorAt < 60_000) return;
  lastErrorAt = now;
  console.error(`📓 [ASKLOG] write failed (further errors muted 60s): ${error?.message}`);
}

/**
 * Append one event. Fire-and-forget by contract: do NOT await this at call sites.
 * Returns a promise only so tests can settle it.
 *
 * @param {string} type
 * @param {Object} payload
 * @returns {Promise<void>} always resolves
 */
export function logAskEvent(type, payload = {}) {
  if (!isAskLogEnabled()) return Promise.resolve();
  let line;
  try {
    line = serializeEvent(buildAskEvent(type, payload));
  } catch (error) {
    noteError(error);
    return Promise.resolve();
  }
  writeQueue = writeQueue
    .then(async () => {
      if (!dirEnsured) {
        await fs.mkdir(path.dirname(ASK_LOG_FILE), { recursive: true });
        dirEnsured = true;
      }
      await fs.appendFile(ASK_LOG_FILE, line);
    })
    .catch(noteError);
  return writeQueue;
}

/** Test seam — settle any in-flight appends. */
export function flushAskLog() {
  return writeQueue;
}
