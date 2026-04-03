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
 * @returns {{ durationMs: number, formatted: string, startTime: number, endTime: number, reversed: boolean }}
 */
export function timeBetweenSnowflakes(startId, endId) {
  const startTime = snowflakeToTimestamp(startId);
  const endTime = snowflakeToTimestamp(endId);
  const durationMs = Math.abs(endTime - startTime);
  return {
    durationMs,
    formatted: formatDuration(durationMs),
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
 * Format a timestamp for display.
 * Uses Discord's <t:timestamp:format> syntax for auto-localization.
 * @param {number} timestampMs - Unix timestamp in milliseconds
 * @param {'F'|'f'|'D'|'d'|'T'|'t'|'R'} [style='F'] - Discord timestamp style
 * @returns {string} Discord timestamp markup
 */
export function discordTimestamp(timestampMs, style = 'F') {
  return `<t:${Math.floor(timestampMs / 1000)}:${style}>`;
}

// ─────────────────────────────────────────────
// In-memory pending starts (per host, per player)
// Lost on restart — acceptable for quick timing
// ─────────────────────────────────────────────

// Map<hostId, Map<playerId, { messageId, timestamp, channelId }>>
const pendingStarts = new Map();

/**
 * Store a pending timer start for a player (marked by a host).
 */
export function setPendingStart(hostId, playerId, messageId, timestamp, channelId) {
  if (!pendingStarts.has(hostId)) pendingStarts.set(hostId, new Map());
  pendingStarts.get(hostId).set(playerId, { messageId, timestamp, channelId });
}

/**
 * Retrieve a pending timer start for a player.
 * @returns {{ messageId: string, timestamp: number, channelId: string } | null}
 */
export function getPendingStart(hostId, playerId) {
  return pendingStarts.get(hostId)?.get(playerId) || null;
}

/**
 * Clear a pending timer start after end is marked.
 */
export function clearPendingStart(hostId, playerId) {
  const hostMap = pendingStarts.get(hostId);
  if (hostMap) {
    hostMap.delete(playerId);
    if (hostMap.size === 0) pendingStarts.delete(hostId);
  }
}

/**
 * Get all pending starts for a host (for UI listing).
 * @returns {Map<playerId, { messageId, timestamp, channelId }>}
 */
export function getAllPendingStarts(hostId) {
  return pendingStarts.get(hostId) || new Map();
}

/**
 * Clear all pending starts for a host.
 */
export function clearAllPendingStarts(hostId) {
  pendingStarts.delete(hostId);
}
