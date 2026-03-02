/**
 * Activity Logger Module
 * Manages per-player activity log entries stored in player.safari.history[]
 * Provides add, query, format, backfill, and UI display functions.
 */

import { loadPlayerData, savePlayerData } from './storage.js';

// --- Constants ---

const MAX_ENTRIES = 200;
const DEFAULT_PAGE_SIZE = 15;

export const ACTIVITY_TYPES = {
  purchase: 'purchase',
  currency: 'currency',
  item: 'item',
  movement: 'movement',
  action: 'action',
  attack: 'attack',
  whisper: 'whisper',
  init: 'init',
  admin: 'admin'
};

const TYPE_EMOJI = {
  purchase: '🛒',
  currency: '🪙',
  item: '🧰',
  movement: '🗺️',
  action: '⚡',
  attack: '⚔️',
  whisper: '🤫',
  init: '🚀',
  admin: '🔧'
};

const TYPE_LABEL = {
  purchase: 'Purchase',
  currency: 'Currency',
  item: 'Item',
  movement: 'Movement',
  action: 'Action',
  attack: 'Attack',
  whisper: 'Whisper',
  init: 'Init',
  admin: 'Admin'
};

// --- Core Functions ---

/**
 * Add an activity entry to a player's history.
 * Mutates playerData in-place. Caller is responsible for saving.
 * @param {Object} playerData - Full playerData object (already loaded)
 * @param {string} guildId
 * @param {string} userId
 * @param {string} type - One of ACTIVITY_TYPES
 * @param {string} desc - Human-readable description
 * @param {Object} [opts] - Optional { stamina, cd, loc }
 */
export function addActivityEntry(playerData, guildId, userId, type, desc, opts = {}) {
  const player = playerData[guildId]?.players?.[userId];
  if (!player?.safari) return;

  if (!Array.isArray(player.safari.history)) {
    player.safari.history = [];
  }

  const entry = {
    t: Date.now(),
    type,
    desc
  };
  if (opts.loc) entry.loc = opts.loc;
  if (opts.stamina) entry.stamina = opts.stamina;
  if (opts.cd) entry.cd = opts.cd;

  player.safari.history.push(entry);

  // FIFO trim — keep newest
  if (player.safari.history.length > MAX_ENTRIES) {
    player.safari.history = player.safari.history.slice(-MAX_ENTRIES);
  }
}

/**
 * Convenience wrapper: loads playerData, adds entry, saves.
 * Use this from safariLogger hooks where playerData isn't already loaded.
 */
export async function addActivityEntryAndSave(guildId, userId, type, desc, opts = {}) {
  try {
    const playerData = await loadPlayerData();
    addActivityEntry(playerData, guildId, userId, type, desc, opts);
    await savePlayerData(playerData);
  } catch (error) {
    console.error(`Activity log error (${type}): ${error.message}`);
  }
}

/**
 * Get a page of activity entries (newest first).
 * @returns {{ entries: Array, page: number, totalPages: number, totalEntries: number }}
 */
export function getActivityPage(playerData, guildId, userId, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  const history = playerData[guildId]?.players?.[userId]?.safari?.history || [];
  const totalEntries = history.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / perPage));
  const safePage = Math.max(1, Math.min(page, totalPages));

  // Newest first
  const reversed = [...history].reverse();
  const start = (safePage - 1) * perPage;
  const entries = reversed.slice(start, start + perPage);

  return { entries, page: safePage, totalPages, totalEntries };
}

/**
 * Format a single activity entry as a Discord-friendly line.
 */
export function formatActivityEntry(entry) {
  const emoji = TYPE_EMOJI[entry.type] || '📝';
  const label = TYPE_LABEL[entry.type] || entry.type;
  const ts = Math.floor(entry.t / 1000); // Discord epoch is seconds
  const locTag = entry.loc ? ` (${entry.loc})` : '';
  let line = `<t:${ts}:R> ${emoji} **${label}**${locTag} — ${entry.desc}`;
  if (entry.stamina) line += ` \`⚡${entry.stamina}\``;
  if (entry.cd) line += ` \`cd: ${entry.cd}\``;
  return line;
}

// --- Backfill ---

/**
 * Backfill activity entries from existing storeHistory + movementHistory.
 * Merges with existing history, deduplicates, and trims to cap.
 * @returns {{ purchases: number, movements: number, total: number, oldest: number|null, newest: number|null }}
 */
export async function backfillFromExistingData(playerData, safariData, guildId, userId) {
  const empty = { purchases: 0, movements: 0, total: 0, oldest: null, newest: null };
  const player = playerData[guildId]?.players?.[userId];
  if (!player?.safari) return empty;

  // Resolve item names from entity data
  let resolveItemName;
  try {
    const { loadEntity } = await import('./entityManager.js');
    resolveItemName = async (itemId) => {
      try {
        const item = await loadEntity(guildId, 'item', itemId);
        return item?.name || itemId;
      } catch { return itemId; }
    };
  } catch {
    resolveItemName = async (id) => id;
  }

  const newEntries = [];
  let purchases = 0, movements = 0;

  // 1. storeHistory → purchase entries
  const storeHistory = player.safari.storeHistory || [];
  for (const record of storeHistory) {
    if (!record.timestamp) continue;
    const t = typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime();
    if (isNaN(t)) continue;

    const qty = record.quantity || 1;
    const itemName = record.itemName || await resolveItemName(record.itemId) || 'Unknown';
    const price = record.price || record.totalPrice || 0;
    newEntries.push({ t, type: ACTIVITY_TYPES.purchase, desc: `Bought ${itemName} x${qty} for ${price}` });
    purchases++;
  }

  // 2. movementHistory from all maps → movement + init entries
  const mapProgress = player.safari.mapProgress || {};
  for (const progress of Object.values(mapProgress)) {
    const movementHistory = progress.movementHistory || [];
    for (const record of movementHistory) {
      if (!record.timestamp) continue;
      const t = new Date(record.timestamp).getTime();
      if (isNaN(t)) continue;

      if (!record.from) {
        // Initial placement
        newEntries.push({ t, type: ACTIVITY_TYPES.init, desc: `Initialized at ${record.to}` });
      } else {
        newEntries.push({ t, type: ACTIVITY_TYPES.movement, desc: `Moved from ${record.from} to ${record.to}` });
      }
      movements++;
    }
  }

  if (newEntries.length === 0) return empty;

  // Merge with existing history — deduplicate by timestamp+type+desc
  const existing = player.safari.history || [];
  const seen = new Set(existing.map(e => `${e.t}|${e.type}|${e.desc}`));
  const merged = [...existing];
  for (const entry of newEntries) {
    const key = `${entry.t}|${entry.type}|${entry.desc}`;
    if (!seen.has(key)) {
      merged.push(entry);
      seen.add(key);
    }
  }

  // Sort and trim
  merged.sort((a, b) => a.t - b.t);
  player.safari.history = merged.slice(-MAX_ENTRIES);

  const final = player.safari.history;
  return {
    purchases,
    movements,
    total: final.length,
    oldest: final.length > 0 ? final[0].t : null,
    newest: final.length > 0 ? final[final.length - 1].t : null
  };
}

// --- UI ---

/**
 * Create the Components V2 activity log display.
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.userId - The player whose log we're viewing
 * @param {string} params.playerName
 * @param {number} params.page
 * @param {'admin'|'player'} params.mode
 * @param {string} [params.backButtonId] - Custom back button ID
 * @returns {Object} Components V2 response data
 */
export async function createActivityLogUI({ guildId, userId, playerName, page = 1, mode = 'player', backButtonId }) {
  const playerData = await loadPlayerData();
  const { entries, page: safePage, totalPages, totalEntries } = getActivityPage(playerData, guildId, userId, page);

  // Format entries
  let logText;
  if (entries.length === 0) {
    logText = '*No activity recorded yet. Actions will appear here as you play.*';
  } else {
    logText = entries.map(formatActivityEntry).join('\n');
  }

  // Build components
  const components = [];

  components.push({
    type: 10, // TextDisplay
    content: `## 📜 Activity Log — ${playerName}`
  });

  components.push({
    type: 10, // TextDisplay
    content: `Page ${safePage}/${totalPages} · ${totalEntries} entries`
  });

  components.push({ type: 14 }); // Separator

  components.push({
    type: 10, // TextDisplay
    content: logText
  });

  components.push({ type: 14 }); // Separator

  // Navigation buttons — LEAN order: Back (first/far-left), Prev, Next, Refresh
  const navButtons = [];

  // Back button FIRST (LEAN standard: far-left, no emoji)
  const backId = backButtonId || (mode === 'admin'
    ? `activity_log_back_${userId}`
    : 'activity_log_back_self');
  navButtons.push({
    type: 2, // Button
    style: 2, // Secondary
    label: '← Back',
    custom_id: backId
  });

  if (safePage > 1) {
    const prevId = mode === 'admin'
      ? `activity_log_prev_${userId}_${safePage - 1}`
      : `activity_log_prev_self_${safePage - 1}`;
    navButtons.push({
      type: 2, style: 2, label: '◀ Prev', custom_id: prevId
    });
  }

  if (safePage < totalPages) {
    const nextId = mode === 'admin'
      ? `activity_log_next_${userId}_${safePage + 1}`
      : `activity_log_next_self_${safePage + 1}`;
    navButtons.push({
      type: 2, style: 2, label: 'Next ▶', custom_id: nextId
    });
  }

  // Refresh button (emoji-only, far right)
  const refreshId = mode === 'admin'
    ? `activity_log_refresh_${userId}_${safePage}`
    : `activity_log_refresh_self_${safePage}`;
  navButtons.push({
    type: 2, style: 2, custom_id: refreshId, emoji: { name: '🔃' }
  });

  components.push({
    type: 1, // ActionRow
    components: navButtons
  });

  const container = {
    type: 17, // Container
    accent_color: 0x3498db, // Blue
    components
  };

  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [container]
  };
}
