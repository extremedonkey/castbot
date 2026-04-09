/**
 * timerUtils.js — Snowflake timing utilities
 *
 * Pure functions for extracting timestamps from Discord snowflake IDs
 * and calculating durations between them. Zero dependencies.
 *
 * Discord snowflake format (64-bit):
 *   Bits 63-22: Milliseconds since Discord Epoch (2015-01-01T00:00:00.000Z)
 *   Bits 21-17: Worker ID
 *   Bits 16-12: Process ID
 *   Bits 11-0:  Increment
 *
 * Spec: docs/01-RaP/0925_20260403_SnowflakeTimer_Analysis.md
 */

const DISCORD_EPOCH = 1420070400000n;

/**
 * Known ORG bot IDs — filtered out when identifying the "player" for a timer result.
 * Many hosts use these bots to mark challenge start/end (e.g., carl-bot ?tag snowflake).
 * Users can extend this list if new bots become popular.
 */
export const KNOWN_ORG_BOT_IDS = new Set([
  '235148962103951360',  // CarlBot
  '784284227373367346',
  '155149108183695360',
  '695664345832620062',
  '443545183997657120',
  '1319912453248647170',
]);

/**
 * Extract creation timestamp from a Discord snowflake ID.
 * @param {string|bigint} snowflake - Discord snowflake ID
 * @returns {number} Unix timestamp in milliseconds
 */
export function snowflakeToTimestamp(snowflake) {
  return Number((BigInt(snowflake) >> 22n) + DISCORD_EPOCH);
}

/**
 * Full snowflake decode — all encoded fields.
 * @param {string|bigint} snowflake - Discord snowflake ID
 * @returns {{ timestamp: number, date: string, workerId: number, processId: number, increment: number }}
 */
export function parseSnowflake(snowflake) {
  const id = BigInt(snowflake);
  const timestamp = Number((id >> 22n) + DISCORD_EPOCH);
  return {
    timestamp,
    date: new Date(timestamp).toISOString(),
    workerId: Number((id >> 17n) & 0x1Fn),
    processId: Number((id >> 12n) & 0x1Fn),
    increment: Number(id & 0xFFFn),
  };
}

/**
 * Calculate time between two snowflakes.
 * @param {string|bigint} startId - Start message snowflake
 * @param {string|bigint} endId - End message snowflake
 * @returns {{ durationMs: number, formatted: string, formattedExcel: string, startTime: number, endTime: number, reversed: boolean }}
 */
export function timeBetweenSnowflakes(startId, endId) {
  const startTime = snowflakeToTimestamp(startId);
  const endTime = snowflakeToTimestamp(endId);
  const durationMs = Math.abs(endTime - startTime);
  return {
    durationMs,
    formatted: formatDuration(durationMs),
    formattedExcel: formatDurationExcel(durationMs),
    startTime,
    endTime,
    reversed: endTime < startTime,
  };
}

/**
 * Human-readable duration formatting.
 * Smart scaling: "45.2s" → "12m 34s" → "1h 23m 45s" → "1d 2h 15m"
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  if (ms < 0) ms = Math.abs(ms);
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const s = totalSeconds % 60;
  const m = minutes % 60;
  const h = hours % 24;

  if (totalSeconds < 60) return `${totalSeconds}.${Math.floor((ms % 1000) / 100)}s`;
  if (minutes < 60) return `${m}m ${s}s`;
  if (hours < 24) return `${h}h ${m}m ${s}s`;
  return `${days}d ${h}h ${m}m`;
}

/**
 * Format duration as HH:MM:SS for Excel copy-paste.
 * Excel auto-parses this format as a duration/time value.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} H:MM:SS formatted string (e.g., "0:10:11")
 */
export function formatDurationExcel(ms) {
  if (ms < 0) ms = Math.abs(ms);
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format a timestamp for display.
 * Uses Discord's <t:timestamp:format> syntax for auto-localization.
 * @param {number} timestampMs - Unix timestamp in milliseconds
 * @param {'F'|'f'|'D'|'d'|'T'|'t'|'R'} [style='F'] - Discord timestamp style
 * @returns {string} Discord timestamp markup
 */
export function discordTimestamp(timestampMs, style = 'F') {
  return `<t:${Math.floor(timestampMs / 1000)}:${style}>`;
}

/**
 * Format a timestamp with full date AND seconds (combines D + T styles).
 * Discord's F style has weekday but no seconds; D+T gives date with seconds.
 * Renders as "8 April 2026 at 11:53:42" (auto-localized per viewer).
 * @param {number} timestampMs - Unix timestamp in milliseconds
 * @returns {string} Combined D + T hammertime markup
 */
export function discordTimestampWithSeconds(timestampMs) {
  const unix = Math.floor(timestampMs / 1000);
  return `<t:${unix}:D> at <t:${unix}:T>`;
}

// ─────────────────────────────────────────────
// Bot detection and player resolution
// ─────────────────────────────────────────────

/**
 * Check if a Discord user object represents a bot.
 * Checks both the author.bot flag and the KNOWN_ORG_BOT_IDS allowlist.
 * @param {{ id?: string, bot?: boolean } | null | undefined} user
 * @returns {boolean} true if the user is a bot or missing
 */
export function isBot(user) {
  if (!user) return true; // missing user = treat as bot (no mention possible)
  if (user.bot === true) return true;
  if (user.id && KNOWN_ORG_BOT_IDS.has(user.id)) return true;
  return false;
}

/**
 * Check if a user ID alone (no user object) matches a known bot.
 * Used when we only have the ID encoded (e.g., in a custom_id payload).
 * Also treats "0" as missing — this is the placeholder used by timer_post encoding.
 * @param {string | null | undefined} userId
 * @returns {boolean}
 */
export function isBotId(userId) {
  if (!userId || userId === '0') return true;
  return KNOWN_ORG_BOT_IDS.has(userId);
}

/**
 * Resolve which user should be shown as the "Player" for a timer result.
 *
 * Logic:
 *  1. If BOTH start and end are real users → prefer END (the one who completed)
 *  2. If only one is a real user → use that one
 *  3. If both are bots → null (host will infer from channel context)
 *
 * @param {{ id?: string, bot?: boolean } | null} startAuthor
 * @param {{ id?: string, bot?: boolean } | null} endAuthor
 * @returns {string | null} Player user ID to mention, or null if neither is a real user
 */
export function resolvePlayerForResult(startAuthor, endAuthor) {
  const startIsBot = isBot(startAuthor);
  const endIsBot = isBot(endAuthor);

  if (!endIsBot) return endAuthor.id;     // prefer end (both cases when end is real)
  if (!startIsBot) return startAuthor.id; // end is bot, start is real
  return null;                            // both bots
}

/**
 * Same logic as resolvePlayerForResult but using only user IDs (no user objects).
 * Uses the KNOWN_ORG_BOT_IDS list to detect bots.
 * @param {string | null | undefined} startUserId
 * @param {string | null | undefined} endUserId
 * @returns {string | null}
 */
export function resolvePlayerFromIds(startUserId, endUserId) {
  const startIsBot = isBotId(startUserId);
  const endIsBot = isBotId(endUserId);

  if (!endIsBot) return endUserId;
  if (!startIsBot) return startUserId;
  return null;
}

// ─────────────────────────────────────────────
// In-memory pending starts (keyed by invoker)
// Lost on restart — acceptable for quick timing
// ─────────────────────────────────────────────

/**
 * @typedef {Object} PendingStart
 * @property {string} messageId      - The start message's snowflake
 * @property {number} timestamp      - Start time in unix ms (derived from snowflake)
 * @property {string} channelId      - Channel the start message lives in
 * @property {string|null} authorId  - Author of the start message (for player resolution)
 * @property {boolean} authorIsBot   - Whether the start message author is a bot
 */

// Map<invokerId, PendingStart>
const pendingStarts = new Map();

/**
 * Store a pending timer start for an invoker (overwrites any previous).
 * @param {string} invokerId - The user who clicked Start Timer (the host)
 * @param {PendingStart} data - Pending start data
 * @returns {PendingStart | null} The previous pending start if one was replaced, else null
 */
export function setPendingStart(invokerId, data) {
  const previous = pendingStarts.get(invokerId) || null;
  pendingStarts.set(invokerId, data);
  return previous;
}

/**
 * Retrieve the pending timer start for an invoker.
 * @param {string} invokerId
 * @returns {PendingStart | null}
 */
export function getPendingStart(invokerId) {
  return pendingStarts.get(invokerId) || null;
}

/**
 * Clear the pending timer start for an invoker (after Stop is marked).
 * @param {string} invokerId
 */
export function clearPendingStart(invokerId) {
  pendingStarts.delete(invokerId);
}
