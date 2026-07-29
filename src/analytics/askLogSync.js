/**
 * 📤 Ask CastBot log → S3. Ships whatever has been appended since the last confirmed
 * upload, as byte-range segments.
 *
 * WHY BYTE RANGES AND NOT ROTATION: the local file is never renamed or truncated —
 * "full history stays on disk" is a deliberate standing decision (docs/incidents/06),
 * and rotation would add a rename race to the append hot path. Instead we track a byte
 * offset, exactly like pm2ErrorLogger does for the PM2 logs.
 *
 * IDEMPOTENCY IS IN THE KEY: the object name encodes its own byte range, so retrying a
 * timed-out upload re-PUTs identical bytes to an identical key — a no-op, not a
 * duplicate. The position only advances after a confirmed 200.
 *
 * The `f<birthtime>` prefix guards the one case that would otherwise corrupt the
 * archive: if the local file is ever REPLACED (the purge script rewrites it), offsets
 * restart from 0 and would collide with existing keys holding different data. A new
 * file has a new birthtime, so its ranges land under a fresh prefix.
 *
 * MEMORY: never reads more than SEGMENT_MAX_BYTES per tick, and always trims back to a
 * newline so a partial JSON line is never shipped. Incident 06 is the reason.
 *
 * Dormant unless configured — no bucket or credentials means one startup line and
 * nothing else, ever.
 *
 * @module askLogSync
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ASK_LOG_FILE } from './askLog.js';
import { putObject } from './awsSigV4.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSITION_FILE = path.join(__dirname, '..', '..', 'logs', 'ask-log-sync.json');

/** Hard cap per tick. 8MB of JSONL is ~1000 events — far more than a day produces. */
export const SEGMENT_MAX_BYTES = 8 * 1024 * 1024;
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6h
const STARTUP_DELAY_MS = 60_000;

/** Config from env. ASK_LOG_S3_* deliberately, NOT the generic AWS_* names — the Claude
 *  CLI subprocess inherits process.env, and a default credential chain must not find them. */
export function s3Config() {
  const bucket = process.env.ASK_LOG_S3_BUCKET;
  const region = process.env.ASK_LOG_S3_REGION;
  const accessKeyId = process.env.ASK_LOG_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.ASK_LOG_S3_SECRET_ACCESS_KEY;
  return { bucket, region, accessKeyId, secretAccessKey,
    enabled: !!(bucket && region && accessKeyId && secretAccessKey) };
}

/** prod | test | dev — partitions the S3 prefix so environments never interleave. */
export function envName() {
  if (process.env.PRODUCTION === 'TRUE') return 'prod';
  if (process.env.INSTANCE_ROLE === 'test') return 'test';
  return 'dev';
}

/**
 * Deterministic object key. Same inputs → same key, which is what makes a retry a no-op.
 * @returns {string} ask-castbot/env=prod/dt=2026-07-30/f<birth>-seg-<start>-<end>.jsonl
 */
export function buildSegmentKey({ env, fileBirthMs, start, end, at }) {
  const dt = new Date(at).toISOString().slice(0, 10);
  const pad = (n) => String(n).padStart(12, '0');
  return `ask-castbot/env=${env}/dt=${dt}/f${fileBirthMs}-seg-${pad(start)}-${pad(end)}.jsonl`;
}

/**
 * Trim a buffer back to its last newline so only whole JSON lines ship.
 * @returns {number} byte length to keep, or 0 when there's no complete line yet
 */
export function alignToLastNewline(buffer) {
  const idx = buffer.lastIndexOf(0x0a); // '\n'
  return idx === -1 ? 0 : idx + 1;
}

/**
 * How much to read this tick, given the file size and where we left off.
 * @returns {{start: number, length: number, reset: boolean}}
 */
export function planRead(size, position) {
  // File shrank → it was replaced (purge) or truncated. Start over rather than read
  // from an offset that now points into the middle of different content.
  if (size < position) return { start: 0, length: Math.min(size, SEGMENT_MAX_BYTES), reset: true };
  const pending = size - position;
  return { start: position, length: Math.min(pending, SEGMENT_MAX_BYTES), reset: false };
}

async function readPosition() {
  try {
    return JSON.parse(await fs.readFile(POSITION_FILE, 'utf8'));
  } catch {
    return { unit: 'bytes', fileBirthMs: null, position: 0, lastKey: null, uploadedAt: null };
  }
}

async function writePosition(state) {
  await fs.mkdir(path.dirname(POSITION_FILE), { recursive: true });
  await fs.writeFile(POSITION_FILE, JSON.stringify(state, null, 2));
}

/**
 * Ship one segment if there's anything to ship. Safe to call repeatedly.
 * @returns {Promise<{uploaded: boolean, reason?: string, key?: string, bytes?: number}>}
 */
export async function syncOnce({ log = console.log } = {}) {
  const config = s3Config();
  if (!config.enabled) return { uploaded: false, reason: 'not_configured' };

  let stat;
  try {
    stat = await fs.stat(ASK_LOG_FILE);
  } catch {
    return { uploaded: false, reason: 'no_log_file' };
  }

  const state = await readPosition();
  const fileBirthMs = Math.floor(stat.birthtimeMs || stat.ctimeMs || 0);
  // A different file (purge rewrote it) → its byte offsets are meaningless to us.
  const position = state.fileBirthMs === fileBirthMs ? (state.position || 0) : 0;

  const { start, length, reset } = planRead(stat.size, position);
  if (reset) log('📤 [ASKLOG] log file shrank — restarting sync from byte 0');
  if (length <= 0) return { uploaded: false, reason: 'nothing_pending' };

  const handle = await fs.open(ASK_LOG_FILE, 'r');
  let buffer;
  try {
    buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
  } finally {
    await handle.close();
  }

  const keep = alignToLastNewline(buffer);
  if (keep === 0) {
    // A single line longer than the whole window — pathological, but shipping a partial
    // line would corrupt the segment permanently. Wait for more data instead.
    log(`📤 [ASKLOG] no complete line in ${length} bytes from offset ${start} — skipping tick`);
    return { uploaded: false, reason: 'no_complete_line' };
  }

  const body = buffer.subarray(0, keep);
  const end = start + keep;
  const key = buildSegmentKey({ env: envName(), fileBirthMs, start, end, at: Date.now() });

  await putObject({ ...config, key, body });
  await writePosition({ unit: 'bytes', fileBirthMs, position: end, lastKey: key, uploadedAt: new Date().toISOString() });
  log(`📤 [ASKLOG] uploaded ${body.length} bytes → s3://${config.bucket}/${key}`);
  return { uploaded: true, key, bytes: body.length };
}

let timer = null;

/**
 * Arm the periodic sync. Called once at startup; silently does nothing when unconfigured
 * so an unprovisioned box produces exactly one informational line and no noise.
 */
export function startAskLogSync() {
  if (timer) return;
  if (!s3Config().enabled) {
    console.log('📤 [ASKLOG] S3 sync not configured — the event log stays local-only');
    return;
  }
  const tick = () => syncOnce().catch(e => console.error(`📤 [ASKLOG] sync failed: ${e.message}`));
  setTimeout(() => { tick(); timer = setInterval(tick, SYNC_INTERVAL_MS); }, STARTUP_DELAY_MS);
  console.log(`📤 [ASKLOG] S3 sync armed → s3://${s3Config().bucket} (every ${SYNC_INTERVAL_MS / 3600000}h)`);
}
