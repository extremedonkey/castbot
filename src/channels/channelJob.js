/**
 * Channel Administration — paced bulk job runner.
 *
 * Streams live progress by PATCHing the interaction's @original message, copying
 * channelArchiver.js:308 (the only streaming-progress implementation in the repo —
 * mapExplorer accumulates strings and PATCHes once at the very end, so the host stares at a
 * spinner for 3 minutes).
 *
 * Progress goes via the WEBHOOK TOKEN, never a channel post: the token is channel-independent,
 * so progress survives deleting the very channel the host ran the job from.
 */
import { PACE_CREATE, PROGRESS_THROTTLE_MS } from './channelAdminConfig.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * In-flight jobs, keyed `${guildId}:${action}`.
 *
 * withStorageLock cannot help here — a bulk run spans Discord calls, so its read-then-create
 * is TOCTOU: two hosts clicking "Create all" simultaneously would both see "nothing exists"
 * and create duplicate channels.
 */
export const jobLocks = new Map();

export class JobBusyError extends Error {
  constructor(holder) {
    super(`A ${holder.action} job is already running (started by <@${holder.userId}>).`);
    this.name = 'JobBusyError';
    this.holder = holder;
  }
}

export function acquireJobLock(guildId, action, userId) {
  const key = `${guildId}:${action}`;
  const holder = jobLocks.get(key);
  if (holder) throw new JobBusyError(holder);
  jobLocks.set(key, { action, userId, startedAt: Date.now() });
  return key;
}

export function releaseJobLock(guildId, action) {
  jobLocks.delete(`${guildId}:${action}`);
}

/**
 * PATCH the deferred interaction's original message.
 * Swallows failures (notably 401 once the 15-minute token expires) — the registry and the
 * tab's lastRun line are the durable record, not this message.
 */
async function patchOriginal(container, { interactionToken, applicationId }) {
  try {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: (1 << 15) | (1 << 6), components: [container] })
    });
    if (!res.ok && res.status !== 401) {
      console.warn(`⚠️ [CHANNEL_ADMIN] Progress PATCH ${res.status}`);
    }
  } catch (e) {
    console.warn(`⚠️ [CHANNEL_ADMIN] Progress PATCH failed: ${e.message}`);
  }
}

/** Build the progress Container (type 17). */
export function renderProgress({ title, done, total, created = 0, skipped = 0, failed = 0, note = '' }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const lines = [
    `## ${title}`,
    `\`${bar}\` ${done}/${total} (${pct}%)`,
    `-# ✅ ${created} created/updated · ⏭️ ${skipped} already correct${failed ? ` · ❌ ${failed} failed` : ''}`
  ];
  if (note) lines.push(`-# ${note}`);
  return { type: 17, accent_color: 0x9B59B6, components: [{ type: 10, content: lines.join('\n') }] };
}

/**
 * Run `step` over `items` with rate-limit pacing, streaming progress and flushing registry
 * deltas between batches (NEVER during — flush takes the storage lock, which forbids network).
 *
 * @param {Object} cfg
 * @param {Array} cfg.items
 * @param {(item, index) => Promise<{ok: boolean, created?: boolean, skipped?: boolean, label?: string, error?: string}>} cfg.step
 * @param {{n: number, ms: number}} [cfg.pace]
 * @param {Object} [cfg.progress] - { interactionToken, applicationId, title }
 * @param {Object} [cfg.buffer] - makeDeltaBuffer()
 * @param {(deltas: Array) => Promise<any>} [cfg.flush]
 * @param {string} [cfg.abortKey]
 * @returns {Promise<{created: number, skipped: number, failed: number, aborted: boolean, errors: Array, results: Array}>}
 */
export async function runPacedJob({
  items,
  step,
  pace = PACE_CREATE,
  progress = null,
  buffer = null,
  flush = null,
  abortKey = null
}) {
  const list = items || [];
  const summary = { created: 0, skipped: 0, failed: 0, aborted: false, errors: [], results: [] };
  let lastPatch = 0;

  const flushNow = async () => {
    if (!buffer || !flush || buffer.size() === 0) return;
    const drained = buffer.drain();
    try {
      await flush(drained);
    } catch (e) {
      // Re-push so the next flush retries. Even total loss is recoverable: ensureChannel
      // adopts orphans by name on the next run.
      buffer.push(...drained);
      console.warn(`⚠️ [CHANNEL_ADMIN] Registry flush failed (will retry): ${e.message}`);
    }
  };

  for (let i = 0; i < list.length; i++) {
    if (abortKey && global.abortChannelJob?.has(abortKey)) {
      summary.aborted = true;
      break;
    }

    // Pace, then flush what the previous batch produced (between batches, never inside one).
    if (i > 0 && i % pace.n === 0) {
      await sleep(pace.ms);
      await flushNow();
    }

    try {
      const r = await step(list[i], i);
      summary.results.push(r);
      if (!r?.ok) {
        summary.failed++;
        if (r?.error) summary.errors.push(r.error);
      } else if (r.skipped) summary.skipped++;
      else summary.created++;
    } catch (e) {
      summary.failed++;
      summary.errors.push(e.message);
    }

    if (progress && Date.now() - lastPatch >= PROGRESS_THROTTLE_MS) {
      lastPatch = Date.now();
      await patchOriginal(
        renderProgress({ title: progress.title, done: i + 1, total: list.length, ...summary }),
        progress
      );
    }
  }

  await flushNow();
  return summary;
}

export { patchOriginal, sleep };
