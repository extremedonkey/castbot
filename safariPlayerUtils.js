/**
 * Safari Player Utilities
 * Shared functions for player state detection, display name resolution,
 * and select menu building used across Start Safari, Remove Players, and Paused Players.
 */

import { loadPlayerData } from './storage.js';
import { loadSafariContent, getCustomTerms } from './safariManager.js';

/**
 * Check if a player is initialized on Safari.
 * Single source of truth — a player is initialized when they have
 * safari data beyond just mapProgress.startingLocation.
 */
export function isPlayerInitialized(player) {
  const safari = player?.safari;
  if (!safari) return false;
  return safari.currency !== undefined || safari.inventory !== undefined || safari.points !== undefined;
}

/**
 * Get enriched data for all initialized players in a guild.
 * Resolves display names via Discord API when client is provided.
 *
 * @param {string} guildId
 * @param {Object} [client] - Discord client for name resolution
 * @returns {Promise<Array<{userId, displayName, location, currency, itemCount, isPaused}>>}
 */
export async function getInitializedPlayers(guildId, client = null) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const customTerms = await getCustomTerms(guildId);
  const activeMapId = safariData[guildId]?.maps?.active;
  const players = playerData[guildId]?.players || {};
  const guild = client?.guilds?.cache?.get(guildId);

  const result = [];

  for (const [userId, player] of Object.entries(players)) {
    // Skip non-snowflake keys (e.g. "admin")
    if (!/^\d{17,20}$/.test(userId)) continue;
    if (!isPlayerInitialized(player)) continue;

    const safari = player.safari;
    const location = activeMapId
      ? safari.mapProgress?.[activeMapId]?.currentLocation || null
      : null;

    // Resolve display name
    let displayName = player.displayName || player.username || userId;
    if (guild) {
      try {
        const member = await guild.members.fetch(userId);
        displayName = member.displayName || member.user.username;
      } catch { /* use cached/fallback */ }
    }

    result.push({
      userId,
      displayName,
      location,
      currency: safari.currency ?? 0,
      itemCount: Object.keys(safari.inventory || {}).length,
      isPaused: safari.isPaused === true,
      currencyName: customTerms.currencyName,
      currencyEmoji: customTerms.currencyEmoji
    });
  }

  return result;
}

/**
 * Build String Select options from a list of enriched players.
 *
 * @param {Array} players - From getInitializedPlayers()
 * @param {Object} opts
 * @param {Set|Array} [opts.selectedIds] - IDs to pre-select (default: none)
 * @param {Function} [opts.descriptionFn] - Custom description builder (player) => string
 * @param {Function} [opts.emojiFn] - Custom emoji builder (player) => { name: string }
 * @returns {Array} Discord String Select options
 */
export function buildPlayerSelectOptions(players, opts = {}) {
  const selectedSet = new Set(opts.selectedIds || []);

  return players.map(p => {
    const description = opts.descriptionFn
      ? opts.descriptionFn(p)
      : buildDefaultDescription(p);

    const emoji = opts.emojiFn
      ? opts.emojiFn(p)
      : { name: p.isPaused ? '⏸️' : '⚡' };

    return {
      label: p.displayName,
      value: p.userId,
      description,
      emoji,
      default: selectedSet.has(p.userId)
    };
  });
}

/**
 * Default description for a player select option
 */
function buildDefaultDescription(p) {
  const parts = [];
  if (p.location) parts.push(p.location);
  parts.push(`${p.currency} ${p.currencyName}`);
  if (p.itemCount > 0) parts.push(`${p.itemCount} item${p.itemCount !== 1 ? 's' : ''}`);
  if (p.isPaused) parts.push('Paused');
  return parts.join(' · ');
}
