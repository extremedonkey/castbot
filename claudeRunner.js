/**
 * Shared Claude CLI runner for Discord-facing features (Ask CastBot, the Moai).
 *
 * WHY THIS EXISTS — the timing story:
 * A Discord interaction token lives for **15 minutes** after you defer. That is the real
 * ceiling, and it is the ONLY hard gate in this design. The old Moai code killed the CLI
 * at 4 minutes and showed a single "still thinking" nudge at 2 minutes — so it threw away
 * 11 minutes of budget and, in between those two moments, the user stared at a silent
 * spinner with no idea whether anything was happening.
 *
 * This runner fixes both halves:
 *   1. BUDGET  — hard kill at HARD_KILL_MS (13 min), which is the 15-minute token window
 *                minus a 2-minute margin to render and deliver the answer. Everything
 *                still lands inside the token, so no delivery path can go stale.
 *   2. VISIBILITY — the CLI is run with --output-format stream-json, so we see every tool
 *                call as it happens and report REAL activity ("📖 Reading Safari.md")
 *                on a HEARTBEAT_MS cadence instead of a generic timer tick.
 *
 * Delivery is deliberately NOT this module's job — each feature owns its own containers.
 * See safeDeliver() for the one shared piece: token-edit with a channel-post fallback,
 * so a dead/expired token still gets the answer to the user.
 *
 * @module claudeRunner
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Model choice offered in the Moai / Ask CastBot modals. Values are bare CLI aliases, not
 * dated model IDs — the `claude` CLI resolves each alias to its own current highest-version
 * snapshot (e.g. picks Sonnet 5.1 over 5.0 the moment it ships), so this list never needs
 * updating when Anthropic ships a new point release. That resolution IS the "which version"
 * logic; we don't duplicate it here.
 */
export const MODEL_OPTIONS = [
  { value: 'haiku', label: 'Haiku', description: 'Fastest, cheapest — quick lookups', emoji: { name: '🍃' } },
  { value: 'sonnet', label: 'Sonnet', description: 'Balanced speed and intelligence', emoji: { name: '⚖️' }, default: true },
  { value: 'opus', label: 'Opus', description: 'Most capable — hard problems', emoji: { name: '🧠' } },
  { value: 'fable', label: 'Fable', description: "Anthropic's most capable model", emoji: { name: '📖' } }
];

export const DEFAULT_MODEL = 'sonnet';
const MODEL_VALUES = new Set(MODEL_OPTIONS.map(m => m.value));

/** Guard a modal-supplied model value against forgery or a stale option — fall back to sonnet. */
export function resolveModelChoice(value) {
  return MODEL_VALUES.has(value) ? value : DEFAULT_MODEL;
}

/** Display label for the response footer, e.g. "Sonnet". */
export function modelLabel(value) {
  return (MODEL_OPTIONS.find(m => m.value === value) || MODEL_OPTIONS.find(m => m.value === DEFAULT_MODEL)).label;
}

/**
 * Build the Label+StringSelect modal field for picking a model.
 * @param {string} customId - unique within the modal (e.g. 'moai_model', 'askcb_model')
 * @param {string} [chosen] - re-selects the prior pick on a Follow Up / Ask Another
 */
export function buildModelSelectField(customId, chosen = DEFAULT_MODEL) {
  return {
    type: 18,
    label: 'Model',
    description: 'Which Claude model should answer?',
    component: {
      type: 3,
      custom_id: customId,
      required: false,
      options: MODEL_OPTIONS.map(({ value, label, description, emoji }) => ({
        value, label, description, emoji, default: value === chosen
      }))
    }
  };
}

/** Discord interaction tokens are valid for 15 minutes after the deferred response. */
export const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
/** Reserve time to render + PATCH the answer before the token dies. */
export const DELIVERY_MARGIN_MS = 2 * 60 * 1000;
/** Hard kill for the CLI. Anything slower than this cannot be delivered in-token. */
export const HARD_KILL_MS = TOKEN_LIFETIME_MS - DELIVERY_MARGIN_MS; // 13 min
/** How often to refresh the "working on it" message. */
export const HEARTBEAT_MS = 20 * 1000;

/**
 * Resolve the Claude binary.
 *
 * PM2 captures its PATH at daemon start, which on castbot-blue does NOT include
 * ~/.local/bin — so a bot spawning bare `claude` silently gets whatever stale global
 * npm install is on the system PATH (2.1.177 there on 2026-07-16), while the native
 * installer keeps ~/.local/bin/claude current. Prefer the native install explicitly,
 * then fall back to PATH so this still works anywhere it isn't installed.
 * @returns {string}
 */
export function resolveClaudeBin() {
  const native = path.join(os.homedir(), '.local', 'bin', 'claude');
  return existsSync(native) ? native : 'claude';
}

/** Human-readable elapsed time, e.g. "2m 05s" / "45s". */
export function formatElapsed(ms) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** Just the file name from a path, for compact progress labels. */
function baseName(p) {
  return typeof p === 'string' ? p.split('/').filter(Boolean).pop() || p : '';
}

/**
 * Turn one stream-json event into a short human activity label.
 * Returns null for events that shouldn't change what the user sees.
 * @param {Object} event
 * @returns {string|null}
 */
export function describeActivity(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'system' && event.subtype === 'init') return '🚀 Starting up';

  const content = event.message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'tool_use') {
      const input = block.input || {};
      switch (block.name) {
        case 'Read': return `📖 Reading ${baseName(input.file_path) || 'a file'}`;
        case 'Grep': return `🔍 Searching for "${String(input.pattern ?? '').substring(0, 40)}"`;
        case 'Glob': return `📂 Looking for ${String(input.pattern ?? 'files').substring(0, 40)}`;
        default: return `🔧 Using ${block.name}`;
      }
    }
    if (block.type === 'thinking') return '💭 Thinking it through';
    if (block.type === 'text' && String(block.text || '').trim()) return '✍️ Writing the answer';
  }
  return null;
}

/**
 * Run a Claude CLI job, reporting real progress as it goes.
 *
 * @param {Object} opts
 * @param {string} opts.prompt                 - the full prompt
 * @param {string} [opts.tools]                - hard allowlist for --tools (omit = CLI default)
 * @param {string[]} [opts.deny]               - --disallowed-tools rules
 * @param {string} [opts.cwd]                  - working directory
 * @param {string} [opts.model]                - CLI --model value (e.g. 'sonnet', 'opus'); omit for CLI default
 * @param {Function} [opts.onHeartbeat]        - ({elapsedMs, activity, toolCount}) => void|Promise
 * @param {number} [opts.heartbeatMs]
 * @param {number} [opts.hardKillMs]
 * @returns {Promise<{text: string, durationMs: number, numTurns: number, denials: Array, costUsd: number|null}>}
 */
export async function runClaudeJob(opts) {
  const { model } = opts || {};
  try {
    return await spawnClaudeJob(opts);
  } catch (error) {
    // A picked model that's misspelled, retired, or not yet recognized by this CLI install
    // shouldn't kill the whole request — retry once on the safe default before giving up.
    if (model && model !== DEFAULT_MODEL) {
      console.warn(`⚠️ Claude CLI failed with model "${model}" (${error.message}) — retrying with ${DEFAULT_MODEL}`);
      return spawnClaudeJob({ ...opts, model: DEFAULT_MODEL });
    }
    throw error;
  }
}

function spawnClaudeJob({
  prompt,
  tools,
  deny = [],
  cwd = process.cwd(),
  model,
  onHeartbeat,
  heartbeatMs = HEARTBEAT_MS,
  hardKillMs = HARD_KILL_MS
} = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--print', '--output-format', 'stream-json', '--verbose'];
    if (model) args.push('--model', model);
    if (tools) args.push('--tools', tools);
    if (deny.length) args.push('--disallowed-tools', ...deny);
    args.push('-p', prompt);

    const startedAt = Date.now();
    const child = spawn(resolveClaudeBin(), args, {
      cwd,
      env: { ...process.env, HOME: process.env.HOME || os.homedir() },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    let stderr = '';
    let activity = '🚀 Starting up';
    let toolCount = 0;
    let result = null;
    const assistantText = [];  // fallback if the result event never lands

    // --- live progress from the JSONL stream ---
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // keep the partial line for the next chunk

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }  // tolerate non-JSON noise

        if (event.type === 'result') result = event;

        const content = event.message?.content;
        if (Array.isArray(content)) {
          for (const b of content) {
            if (b?.type === 'tool_use') toolCount++;
            if (b?.type === 'text' && typeof b.text === 'string') assistantText.push(b.text);
          }
        }

        const next = describeActivity(event);
        if (next) activity = next;
      }
    });
    child.stderr.on('data', d => { stderr += d.toString(); });

    // --- heartbeat: tell the user what's happening, on a cadence ---
    const beat = onHeartbeat
      ? setInterval(() => {
          Promise.resolve(onHeartbeat({ elapsedMs: Date.now() - startedAt, activity, toolCount }))
            .catch(e => console.error('⏳ heartbeat failed (continuing):', e?.message));
        }, heartbeatMs)
      : null;

    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
      // SIGTERM can be ignored; make sure the process actually dies.
      setTimeout(() => child.kill('SIGKILL'), 5000).unref?.();
    }, hardKillMs);

    const cleanup = () => {
      clearTimeout(killTimer);
      if (beat) clearInterval(beat);
    };

    child.on('close', code => {
      cleanup();
      const durationMs = Date.now() - startedAt;

      if (durationMs >= hardKillMs) {
        return reject(new Error(
          `Timed out after ${formatElapsed(durationMs)}. The question may be too broad — try narrowing it.`
        ));
      }
      if (result?.is_error) {
        return reject(new Error(String(result.result || 'Claude reported an error').substring(0, 500)));
      }
      if (code !== 0 && !result) {
        return reject(new Error(stderr.trim() || `Claude CLI exited with code ${code}`));
      }

      const text = String(result?.result ?? assistantText.join('\n')).trim();
      if (!text) return reject(new Error('Claude returned an empty response'));

      resolve({
        text,
        durationMs,
        numTurns: result?.num_turns ?? 0,
        denials: result?.permission_denials ?? [],
        costUsd: result?.total_cost_usd ?? null
      });
    });

    child.on('error', err => {
      cleanup();
      reject(new Error(`Could not start Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Deliver a payload to a token-owned message, surviving a dead interaction token.
 *
 * The token edit is the nice path (the answer replaces the "working on it" message in
 * place). If it fails, fall back to posting straight into the channel with the bot's own
 * credentials, which needs no token. Losing a 13-minute answer to a webhook hiccup is not
 * acceptable.
 *
 * ⚠️ DiscordRequest RETURNS null ON TOKEN EXPIRY — it does not throw (utils.js handles
 * "Unknown Webhook"/"Invalid Webhook Token"/10015/50027 gracefully and returns null). A
 * try/catch alone therefore never sees the 15-minute expiry it exists to catch, which is
 * exactly the case the fallback is for. Treat a null result as failure.
 *
 * @param {Object} opts
 * @param {string} opts.token
 * @param {string} opts.channelId
 * @param {Object} opts.data          - message payload (components etc.)
 * @param {string} [opts.messageId]   - follow-up message id; omit to edit @original
 * @param {string} [opts.userId]      - mentioned on the fallback path so they see the answer
 * @param {boolean} [opts.fallback]   - post to the channel if the token edit fails.
 *   MUST be false for heartbeats: a per-heartbeat fallback would spam the channel with a
 *   new progress message every 20s. Only final delivery is worth a fallback message.
 * @returns {Promise<'token'|'channel'|'failed'>} which path delivered
 */
export async function safeDeliver({ token, channelId, data, messageId, userId, fallback = true }) {
  const { editWebhookMessage } = await import('./buttonHandlerFactory.js');
  try {
    const result = await editWebhookMessage(token, messageId || '@original', data);
    if (result) return 'token';
    console.warn('⏰ Webhook edit returned null (token expired or message gone)');
  } catch (tokenError) {
    console.error('⚠️ Webhook edit failed:', tokenError?.message);
  }

  if (!fallback || !channelId) return 'failed';
  try {
    const { DiscordRequest } = await import('./utils.js');
    const posted = await DiscordRequest(`channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        ...data,
        ...(userId ? { content: `<@${userId}>`, allowed_mentions: { users: [userId] } } : {}),
        flags: (1 << 15)  // IS_COMPONENTS_V2
      }
    });
    return posted ? 'channel' : 'failed';
  } catch (channelError) {
    console.error('❌ Channel fallback also failed:', channelError?.message);
    return 'failed';
  }
}
