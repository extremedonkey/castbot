/**
 * Channel Export — Rate-Limit-Aware Message Fetcher
 *
 * Paginates a channel's full message history via REST, self-throttling from
 * Discord's rate-limit headers so it never trips a 429 on large channels.
 *
 * Empirically measured (CastBot-Dev, 2026-06-04 — see RaP 0915):
 *   GET /channels/{id}/messages  →  limit=5, window≈5s, per-channel bucket.
 *   Sustainable ≈ 1 req/s. Header-driven pacing bursts the 5-request budget
 *   then waits for reset → finishes as fast as Discord allows, zero 429s.
 *
 * Self-contained on purpose: does NOT route through the shared DiscordRequest()
 * (which is load-bearing across prod and throws on 429). Isolating the experiment
 * keeps the rest of the bot untouched.
 */
import 'dotenv/config';
import fetch from 'node-fetch';

const BASE = 'https://discord.com/api/v10';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Decide how long to wait before the NEXT request, from rate-limit headers.
 * Pure function — unit tested in tests/channelExportFetcher.test.js.
 *
 * @param {{remaining: number|null, resetAfter: number|null}} hdr
 * @param {number} bufferMs - safety margin added when waiting for a reset
 * @returns {number} milliseconds to sleep before the next request (0 = go now)
 */
export function computeRateLimitDelay({ remaining, resetAfter }, bufferMs = 150) {
  // Bucket exhausted → wait for it to refill (+ buffer). Treat unknown as exhausted-safe.
  if (remaining !== null && remaining <= 0) {
    return Math.ceil((resetAfter || 1) * 1000) + bufferMs;
  }
  // Budget remains — fire immediately.
  return 0;
}

/**
 * Decide pacing AFTER a message-create POST, from its rate-limit headers / status.
 * Pure function — unit tested in tests/channelExportFetcher.test.js.
 *
 * The write path (POST /channels/{id}/messages) has its own per-channel bucket
 * (~5 msgs / 5s). Archiving a whole category fires many POSTs at ONE channel, so
 * without this pacing they 429 in bursts. Same idea as computeRateLimitDelay, but
 * a 429 here means "retry the same POST" rather than "advance the cursor".
 *
 * @param {{status:number, remaining:number|null, resetAfter:number|null, retryAfter:number|null}} res
 * @param {number} bufferMs - safety margin
 * @returns {{retry: boolean, waitMs: number}} retry=true → resend the SAME request after waitMs
 */
export function computePostPacing({ status, remaining, resetAfter, retryAfter }, bufferMs = 200) {
  // Rate limited → must retry the same request after the server-stated delay.
  if (status === 429) {
    return { retry: true, waitMs: Math.ceil((retryAfter || resetAfter || 1) * 1000) + bufferMs };
  }
  // Budget exhausted → space out the NEXT request so we don't 429 next time.
  if (remaining !== null && remaining <= 0) {
    return { retry: false, waitMs: Math.ceil((resetAfter || 1) * 1000) + bufferMs };
  }
  // Budget remains → fire immediately.
  return { retry: false, waitMs: 0 };
}

/**
 * Create a header-aware, self-retrying poster bound to ONE channel.
 *
 * All archive writes in a run go to the same channel (the invoking channel), so a
 * single poster instance naturally serialises them and respects the shared bucket.
 * Carries pacing state between calls and transparently retries 429s — callers never
 * see a rate-limit error, they just wait. Handles both multipart (FormData) and JSON
 * bodies; the caller passes content headers only, the poster adds Authorization.
 *
 * @param {string} channelId
 * @param {object} [opts]
 * @param {string} [opts.token]
 * @param {number} [opts.maxRetries] - give up after this many consecutive 429s
 * @returns {(req: {body: any, headers: object}) => Promise<import('node-fetch').Response>}
 */
export function createMessagePoster(channelId, { token = process.env.DISCORD_TOKEN, maxRetries = 8 } = {}) {
  if (!token) throw new Error('DISCORD_TOKEN not set');
  let waitBeforeNext = 0; // ms to wait before the next POST (set from prior response)

  return async function postMessage({ body, headers = {} }) {
    let attempt = 0;
    while (true) {
      if (waitBeforeNext > 0) { await sleep(waitBeforeNext); waitBeforeNext = 0; }

      const res = await fetch(`${BASE}/channels/${channelId}/messages`, {
        method: 'POST',
        body,
        headers: { ...headers, Authorization: `Bot ${token}` },
      });

      const remaining = parseInt(res.headers.get('x-ratelimit-remaining'), 10);
      const resetAfter = parseFloat(res.headers.get('x-ratelimit-reset-after'));
      let retryAfter = null;
      if (res.status === 429) {
        const body429 = await res.clone().json().catch(() => ({}));
        retryAfter = body429.retry_after ?? parseFloat(res.headers.get('retry-after'));
      }

      const pacing = computePostPacing({
        status: res.status,
        remaining: Number.isNaN(remaining) ? null : remaining,
        resetAfter: Number.isNaN(resetAfter) ? null : resetAfter,
        retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
      });
      waitBeforeNext = pacing.waitMs;

      if (pacing.retry && attempt < maxRetries) {
        attempt++;
        console.log(`  ⏳ POST 429 on channel ${channelId} — waiting ${(waitBeforeNext / 1000).toFixed(2)}s (retry ${attempt}/${maxRetries})`);
        continue; // resend the SAME request
      }
      return res; // success, non-429 error (e.g. 413), or retries exhausted
    }
  };
}

/**
 * Fetch ALL messages from a channel, oldest-first, with header-aware throttling.
 *
 * @param {string} channelId
 * @param {object} [opts]
 * @param {(count:number)=>void} [opts.onProgress] - called with running total
 * @param {number} [opts.maxConsecutive429] - abort after this many back-to-back 429s
 * @returns {Promise<{messages: Array, total429: number, batches: number}>}
 */
export async function fetchAllChannelMessages(channelId, { onProgress, maxConsecutive429 = 10 } = {}) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');

  const all = [];
  let before = null;
  let batches = 0;
  let total429 = 0;
  let consecutive429 = 0;

  while (true) {
    const params = new URLSearchParams({ limit: '100' });
    if (before) params.set('before', before);

    const res = await fetch(`${BASE}/channels/${channelId}/messages?${params}`, {
      headers: { Authorization: `Bot ${token}` },
    });

    // --- 429 backstop (header-pacing should prevent this, but never throw on it) ---
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const retryAfter = body.retry_after ?? parseFloat(res.headers.get('retry-after')) ?? 1;
      total429++;
      consecutive429++;
      if (consecutive429 > maxConsecutive429) {
        throw new Error(`Channel export aborted: ${consecutive429} consecutive 429s on ${channelId}`);
      }
      console.log(`  ⏳ 429 — waiting ${retryAfter}s (retry ${consecutive429}/${maxConsecutive429})`);
      await sleep(Math.ceil(retryAfter * 1000) + 250);
      continue; // retry SAME cursor — do not advance `before`
    }
    consecutive429 = 0;

    if (!res.ok) {
      throw new Error(`Discord ${res.status} fetching messages: ${await res.text()}`);
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    before = batch[batch.length - 1].id;
    batches++;
    if (onProgress) onProgress(all.length);

    if (batch.length < 100) break; // last page

    // --- Header-aware pacing ---
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining'), 10);
    const resetAfter = parseFloat(res.headers.get('x-ratelimit-reset-after'));
    const delay = computeRateLimitDelay({
      remaining: Number.isNaN(remaining) ? null : remaining,
      resetAfter: Number.isNaN(resetAfter) ? null : resetAfter,
    });
    if (delay > 0) await sleep(delay);
  }

  all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return { messages: all, total429, batches };
}

/**
 * List ALL active threads in a guild (one call per archive run).
 * GET /guilds/{guildId}/threads/active → returns the raw `threads` array (filter by parent_id).
 */
export async function fetchGuildActiveThreads(guildId) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');
  const res = await fetch(`${BASE}/guilds/${guildId}/threads/active`, { headers: { Authorization: `Bot ${token}` } });
  if (!res.ok) { console.warn(`⚠️ active threads fetch ${res.status} for guild ${guildId}`); return []; }
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body.threads) ? body.threads : [];
}

/**
 * Discover all threads belonging to a channel: active (from the guild list) + public archived
 * + private archived (skipped gracefully without Manage Threads). Deduped by thread id.
 * Each thread is itself a channel — fetch its messages with fetchAllChannelMessages(thread.id).
 *
 * @param {string} channelId
 * @param {object} [opts]
 * @param {string} [opts.guildId]
 * @param {Array}  [opts.activeThreads] - result of fetchGuildActiveThreads (reused across channels)
 * @returns {Promise<Array>} thread channel objects ({ id, name, parent_id, thread_metadata, ... })
 */
export async function fetchChannelThreads(channelId, { activeThreads = [] } = {}) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');
  const byId = new Map();
  for (const t of activeThreads) if (t?.parent_id === channelId) byId.set(t.id, t);

  const listArchived = async (kind) => {
    let before = null;
    for (let guard = 0; guard < 50; guard++) {
      const params = new URLSearchParams({ limit: '100' });
      if (before) params.set('before', before);
      const res = await fetch(`${BASE}/channels/${channelId}/threads/archived/${kind}?${params}`, { headers: { Authorization: `Bot ${token}` } });
      if (res.status === 401 || res.status === 403) {
        if (kind === 'private') console.log(`ℹ️ private threads skipped for ${channelId} (bot lacks Manage Threads)`);
        return;
      }
      if (!res.ok) { console.warn(`⚠️ archived/${kind} threads ${res.status} for ${channelId}`); return; }
      const body = await res.json().catch(() => ({}));
      const threads = Array.isArray(body.threads) ? body.threads : [];
      for (const t of threads) if (!byId.has(t.id)) byId.set(t.id, t);
      if (!body.has_more || threads.length === 0) return;
      before = threads[threads.length - 1]?.thread_metadata?.archive_timestamp || null;
      if (!before) return;
      // Light header-aware pacing between pages (low volume).
      const remaining = parseInt(res.headers.get('x-ratelimit-remaining'), 10);
      const resetAfter = parseFloat(res.headers.get('x-ratelimit-reset-after'));
      const delay = computeRateLimitDelay({
        remaining: Number.isNaN(remaining) ? null : remaining,
        resetAfter: Number.isNaN(resetAfter) ? null : resetAfter,
      });
      if (delay > 0) await sleep(delay);
    }
  };

  await listArchived('public');
  await listArchived('private');
  return [...byId.values()];
}
