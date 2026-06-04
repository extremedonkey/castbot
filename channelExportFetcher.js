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
