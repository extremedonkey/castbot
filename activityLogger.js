/**
 * Activity Logger Module
 * Manages per-player activity log entries stored in player.safari.history[]
 * Provides add, query, format, backfill, and UI display functions.
 */

import { loadPlayerData, savePlayerData } from './storage.js';

// --- Constants ---

const MAX_ENTRIES = 200;
const DEFAULT_PAGE_SIZE = 15;
const FLUSH_DELAY_MS = 2000; // Batch activity entries, flush every 2s

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

// --- Batched write queue ---
// Activity entries are queued and flushed in a single load-modify-save cycle
// to avoid racing with other saves (which corrupts playerData.json).

let _pendingEntries = [];
let _flushTimer = null;

async function _flushActivityEntries() {
  _flushTimer = null;
  if (_pendingEntries.length === 0) return;

  const batch = _pendingEntries;
  _pendingEntries = [];

  try {
    // savePlayerData already uses the storage write mutex internally,
    // so no need for withStorageLock here — just load fresh data and save.
    const playerData = await loadPlayerData();
    for (const { guildId, userId, type, desc, opts } of batch) {
      addActivityEntry(playerData, guildId, userId, type, desc, opts);
    }
    await savePlayerData(playerData);
    console.log(`📝 Activity log: flushed ${batch.length} entries`);
  } catch (error) {
    console.error(`Activity log flush error (${batch.length} entries): ${error.message}`);
  }
}

/**
 * Queue an activity entry for batched save.
 * Entries are flushed after a short delay to avoid racing with other saves.
 * Use this from safariLogger hooks where playerData isn't already loaded.
 */
export function addActivityEntryAndSave(guildId, userId, type, desc, opts = {}) {
  _pendingEntries.push({ guildId, userId, type, desc, opts });

  if (!_flushTimer) {
    _flushTimer = setTimeout(_flushActivityEntries, FLUSH_DELAY_MS);
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
        newEntries.push({ t, type: ACTIVITY_TYPES.init, desc: `Initialized at ${record.to}`, loc: record.to });
      } else {
        newEntries.push({ t, type: ACTIVITY_TYPES.movement, desc: `Moved from ${record.from} to ${record.to}`, loc: record.to });
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

/**
 * Backfill activity entries by reading the Safari Log channel messages.
 * Parses formatted log messages and creates activity entries with original timestamps.
 * @param {string} guildId
 * @param {Object} client - Discord client
 * @param {number} [messageLimit=500] - Max messages to fetch
 * @returns {{ parsed: number, added: number, skipped: number, players: Object }}
 */
export async function backfillFromSafariLogChannel(guildId, client, messageLimit = 500) {
  const result = { parsed: 0, added: 0, skipped: 0, players: {} };

  // Get Safari Log channel ID
  const { loadSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const logChannelId = safariData[guildId]?.safariLogSettings?.logChannelId;
  if (!logChannelId) throw new Error('No Safari Log channel configured');

  // Fetch the channel
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(logChannelId);
  if (!channel) throw new Error(`Channel ${logChannelId} not found`);

  // Build name → userId lookup from playerData
  const playerData = await loadPlayerData();
  const guildPlayers = playerData[guildId]?.players || {};
  const nameMap = new Map(); // lowercased name → userId
  for (const [userId, p] of Object.entries(guildPlayers)) {
    if (userId === 'admin') continue;
    if (p.displayName) nameMap.set(p.displayName.toLowerCase(), userId);
    if (p.username) nameMap.set(p.username.toLowerCase(), userId);
    if (p.global_name) nameMap.set(p.global_name.toLowerCase(), userId);
  }

  // Fetch messages (newest first, paginate backwards)
  let allMessages = [];
  let lastId;
  while (allMessages.length < messageLimit) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  // Process oldest first for chronological order
  allMessages.reverse();
  console.log(`📡 Backfill: Fetched ${allMessages.length} messages from channel`);

  // Emoji detection regex - matches all Safari Log entry types
  const entryEmojiRegex = /^(?:🗺️|🗺|🪙|🧰|🎯|🤫|🛒|⌨️|⚔️|🧪)/;

  // Parse each message
  const newEntries = []; // { userId, entry }
  let debugUnmatched = 0;
  let debugNoTime = 0;
  let debugNoParse = 0;
  for (const msg of allMessages) {
    if (!msg.content) continue;
    const msgDate = msg.createdAt;
    const lines = msg.content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) { i++; continue; }

      // Detect entry type by emoji prefix
      let entryType = null;
      if (line.startsWith('🗺️') || line.startsWith('🗺')) entryType = 'movement';
      else if (line.startsWith('🪙')) entryType = 'currency';
      else if (line.startsWith('🧰')) entryType = 'item';
      else if (line.startsWith('🎯')) entryType = 'action';
      else if (line.startsWith('⌨️')) entryType = 'action';
      else if (line.startsWith('🤫')) entryType = 'whisper';
      else if (line.startsWith('🛒')) entryType = 'purchase';
      else if (line.startsWith('⚔️')) entryType = 'attack';

      if (!entryType) {
        // Only count as unmatched if it's not a detail/quote line
        if (!line.startsWith('>')) debugUnmatched++;
        i++; continue;
      }

      // Parse header: TYPE | [TIME] | PLAYER_INFO
      const timeMatch = line.match(/\[(\d{1,2}:\d{2}(?:AM|PM))\]/i);
      if (!timeMatch) { debugNoTime++; i++; continue; }

      // Parse timestamp combining message date + parsed time
      const t = _parseLogTimestamp(msgDate, timeMatch[1]);
      if (!t) { i++; continue; }

      // Collect detail lines (everything until next emoji header)
      const detailLines = [];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) { i++; continue; }
        // Check if this is a new entry header
        if (entryEmojiRegex.test(next)) break;
        // Strip leading "> " quote prefix from detail lines
        detailLines.push(next.startsWith('> ') ? next.slice(2) : next);
        i++;
      }

      // Parse the entry based on type
      const parsed = _parseSafariLogEntry(entryType, line, detailLines, nameMap);
      if (parsed) {
        newEntries.push({ userId: parsed.userId, entry: { t, type: parsed.type, desc: parsed.desc, ...(parsed.loc ? { loc: parsed.loc } : {}) } });
        result.parsed++;
      } else {
        debugNoParse++;
        if (debugNoParse <= 5) console.log(`📡 Backfill: Failed to parse ${entryType}: ${line.slice(0, 120)}`);
      }
    }
  }
  console.log(`📡 Backfill: ${result.parsed} parsed, ${debugNoParse} parse failures, ${debugNoTime} no-time, ${debugUnmatched} unmatched lines`);

  if (newEntries.length === 0) return result;

  // Group entries by userId and merge into player history
  const entriesByUser = {};
  for (const { userId, entry } of newEntries) {
    if (!entriesByUser[userId]) entriesByUser[userId] = [];
    entriesByUser[userId].push(entry);
  }

  for (const [userId, entries] of Object.entries(entriesByUser)) {
    const player = guildPlayers[userId];
    if (!player?.safari) continue;

    if (!Array.isArray(player.safari.history)) player.safari.history = [];
    const existing = player.safari.history;
    const seen = new Set(existing.map(e => `${e.t}|${e.type}|${e.desc}`));

    let added = 0;
    for (const entry of entries) {
      const key = `${entry.t}|${entry.type}|${entry.desc}`;
      if (!seen.has(key)) {
        existing.push(entry);
        seen.add(key);
        added++;
      }
    }

    // Sort and trim
    existing.sort((a, b) => a.t - b.t);
    player.safari.history = existing.slice(-MAX_ENTRIES);

    result.added += added;
    result.skipped += entries.length - added;
    const name = player.displayName || player.username || userId;
    result.players[name] = { added, skipped: entries.length - added, total: player.safari.history.length };
  }

  await savePlayerData(playerData);
  return result;
}

/**
 * Parse a time string like "1:13AM" combined with a message date.
 */
function _parseLogTimestamp(msgDate, timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  // Use the message's date but with the parsed time
  // The Safari Log uses the guild's configured timezone, but the message timestamp is UTC
  // For simplicity, construct from the message date adjusted to match the log time
  const d = new Date(msgDate);
  d.setHours(hours, minutes, 0, 0);

  // If the resulting time is more than 12 hours ahead of msgDate, it's probably yesterday
  if (d.getTime() - msgDate.getTime() > 12 * 60 * 60 * 1000) {
    d.setDate(d.getDate() - 1);
  }
  // If more than 12 hours behind, it's probably tomorrow
  if (msgDate.getTime() - d.getTime() > 12 * 60 * 60 * 1000) {
    d.setDate(d.getDate() + 1);
  }

  return d.getTime();
}

/**
 * Parse a single Safari Log entry from its header line and detail lines.
 * Detail lines should already have "> " prefix stripped.
 * Returns { userId, type, desc, loc } or null.
 */
function _parseSafariLogEntry(entryType, headerLine, detailLines, nameMap) {
  try {
    // Extract location from "at **COORD**" pattern
    const locMatch = headerLine.match(/\bat\s+\*?\*?([A-Z]\d+)\*?\*?/i);
    const loc = locMatch ? locMatch[1].toUpperCase() : null;

    // Helper: extract player name from "| **Name** " pattern (last pipe-delimited segment before keyword)
    const extractName = (line, beforeKeyword) => {
      const re = new RegExp(`\\|\\s*\\*?\\*?(.+?)\\*?\\*?\\s+${beforeKeyword}`, 'i');
      const m = line.match(re);
      return m ? m[1].replace(/\*+/g, '').trim() : null;
    };

    const lookupUser = (name) => {
      if (!name) return null;
      // Handle Discord mention format: <@391415444084490240> or <@!391415444084490240>
      const mentionMatch = name.match(/^<@!?(\d+)>$/);
      if (mentionMatch) return mentionMatch[1];
      return nameMap.get(name.toLowerCase());
    };

    switch (entryType) {
      case 'movement': {
        // 🗺️ **MOVEMENT** | [TIME] | **Name** moved from **D3** (#channel) to **E3** (#channel)
        // Key fix: allow arbitrary text (channel display) between from-coord and "to"
        const moveMatch = headerLine.match(/\*?\*?(\S+(?:\s+\S+)*?)\*?\*?\s+moved from\s+\*?\*?([A-Z]\d+)\*?\*?.*?\bto\s+\*?\*?([A-Z]\d+)\*?\*?/i);
        if (!moveMatch) return null;
        const name = moveMatch[1].replace(/\*+/g, '').trim();
        const userId = lookupUser(name);
        if (!userId) return null;
        return { userId, type: ACTIVITY_TYPES.movement, desc: `Moved from ${moveMatch[2].toUpperCase()} to ${moveMatch[3].toUpperCase()}`, loc: moveMatch[3].toUpperCase() };
      }

      case 'currency': {
        // 🪙 **CURRENCY** | [TIME] | **Name** at **D3** (#channel)
        // > Gained 50 Gold from "Open Chest"
        const name = extractName(headerLine, 'at\\s+');
        const userId = lookupUser(name);
        if (!userId) return null;

        const detail = detailLines[0] || '';
        // Allow multi-word currency names (e.g. "Survival Coins")
        const currMatch = detail.match(/(Gained|Lost)\s+(\d+)\s+(.+?)\s+from\s+"(.+?)"/i);
        if (currMatch) {
          return { userId, type: ACTIVITY_TYPES.currency, desc: `${currMatch[1]} ${currMatch[2]} ${currMatch[3]} from ${currMatch[4]}`, loc };
        }
        return { userId, type: ACTIVITY_TYPES.currency, desc: detail || 'Currency change', loc };
      }

      case 'item': {
        // 🧰 **ITEM PICKUP** | [TIME] | **Name** (username) at <#channel> or **COORD**
        // > Collected: 🔮 **Thunder Materia** (x1)
        // Name is before "(" or "at"
        let name = extractName(headerLine, '\\(');
        if (!name) name = extractName(headerLine, 'at\\s+');
        const userId = lookupUser(name);
        if (!userId) return null;

        const detail = detailLines[0] || '';
        const itemMatch = detail.match(/Collected:\s*(.+?)\s*\(x(\d+)\)/i);
        if (itemMatch) {
          // Clean up bold markers from item name
          const itemName = itemMatch[1].replace(/\*+/g, '').trim();
          return { userId, type: ACTIVITY_TYPES.item, desc: `Picked up ${itemName} x${itemMatch[2]}`, loc };
        }
        return { userId, type: ACTIVITY_TYPES.item, desc: detail || 'Item pickup', loc };
      }

      case 'action': {
        // 🎯 **CUSTOM ACTION** | [TIME] | **Name** at **D3** (#channel)
        // > Button: 🗃️ Open Chest (open_chest_123)
        // > Display Text: "Title" - Content...
        // Also handles: 🎯 **SAFARI ACTION** | [TIME] | **Name** at **D3**
        // > Clicked: "Button Label" - Result
        // Also handles: ⌨️ **PLAYER COMMAND** | [TIME] | **Name** at **D3**
        // > Command: "command_name"
        const name = extractName(headerLine, 'at\\s+');
        const userId = lookupUser(name);
        if (!userId) return null;

        let buttonLabel = 'Unknown action';
        let actionDetails = [];
        for (const dl of detailLines) {
          if (dl.startsWith('Button:')) {
            const btnMatch = dl.match(/Button:\s*(?:<[^>]+>\s*)?(.+?)(?:\s*\([^)]+\))?$/);
            buttonLabel = btnMatch ? btnMatch[1].trim() : dl.replace('Button:', '').trim();
          } else if (dl.startsWith('Clicked:')) {
            // SAFARI_BUTTON format: Clicked: "label" - result
            const clickMatch = dl.match(/Clicked:\s*"(.+?)"/);
            buttonLabel = clickMatch ? clickMatch[1] : dl.replace('Clicked:', '').trim();
          } else if (dl.startsWith('Command:')) {
            // PLAYER_COMMAND format: Command: "command_id"
            const cmdMatch = dl.match(/Command:\s*"(.+?)"/);
            buttonLabel = cmdMatch ? `/${cmdMatch[1]}` : dl.replace('Command:', '').trim();
          } else if (dl.startsWith('Display Text:')) {
            const textMatch = dl.match(/Display Text:\s*"(.+?)"\s*-\s*(.*)/);
            if (textMatch) {
              const preview = textMatch[2].length > 50 ? textMatch[2].slice(0, 47) + '...' : textMatch[2];
              actionDetails.push(`Text: "${preview}"`);
            }
          } else if (dl.startsWith('give_item:')) {
            try {
              const json = JSON.parse(dl.replace('give_item:', '').trim());
              actionDetails.push(`Give Item: ${json.itemId} (x${json.quantity || 1})`);
            } catch { actionDetails.push('Give Item'); }
          } else if (dl.startsWith('give_currency:')) {
            try {
              const json = JSON.parse(dl.replace('give_currency:', '').trim());
              actionDetails.push(`Currency: ${json.amount > 0 ? '+' : ''}${json.amount}`);
            } catch { actionDetails.push('Give Currency'); }
          } else if (dl.startsWith('calculate_results:')) {
            actionDetails.push('Calculate Results');
          }
        }

        let desc = buttonLabel;
        if (actionDetails.length > 0) {
          desc += '\n' + actionDetails.map(d => `> • ${d}`).join('\n');
        }
        return { userId, type: ACTIVITY_TYPES.action, desc, loc };
      }

      case 'purchase': {
        // 🛒 **PURCHASE** | [TIME] | **Name** at **StoreName** (COORD (#channel))
        // > Bought: 🔮 **Item** (x1) for 50 Gold
        const name = extractName(headerLine, 'at\\s+');
        const userId = lookupUser(name);
        if (!userId) return null;

        const detail = detailLines[0] || '';
        const buyMatch = detail.match(/Bought:\s*(.+?)\s*\(x(\d+)\)\s*for\s+(\d+)\s+(.+)/i);
        if (buyMatch) {
          const itemName = buyMatch[1].replace(/\*+/g, '').trim();
          return { userId, type: ACTIVITY_TYPES.purchase, desc: `Bought ${itemName} x${buyMatch[2]} for ${buyMatch[3]} ${buyMatch[4]}`, loc };
        }
        return { userId, type: ACTIVITY_TYPES.purchase, desc: detail || 'Purchase', loc };
      }

      case 'attack': {
        // ⚔️ **ATTACK** | [TIME] | **Name** scheduled an attack...
        const name = extractName(headerLine, 'scheduled\\s+');
        const userId = lookupUser(name);
        if (!userId) return null;
        const detail = detailLines[0] || '';
        return { userId, type: ACTIVITY_TYPES.action, desc: `Attack: ${detail || 'scheduled'}`, loc };
      }

      case 'whisper': {
        // 🤫 **WHISPER** | [TIME] | **Name** → **Recipient** at **D3**
        const whisperMatch = headerLine.match(/\|\s*\*?\*?(.+?)\*?\*?\s+→\s+(.+?)\s+at\s+/i);
        if (!whisperMatch) return null;
        const name = whisperMatch[1].replace(/\*+/g, '').trim();
        const recipient = whisperMatch[2].replace(/\*+/g, '').trim();
        const userId = lookupUser(name);
        if (!userId) return null;
        return { userId, type: ACTIVITY_TYPES.whisper, desc: `Whispered to ${recipient}`, loc };
      }
    }
  } catch (e) {
    console.error('Safari log parse error:', e.message);
  }
  return null;
}

// --- Map Overlay & Stamina ---

/**
 * Generate a map overlay image showing visited coordinates and current location.
 * Uses Sharp compositing (same pattern as mapExplorer.js:generateBlacklistOverlay).
 * @returns {{ imageUrl: string, currentLocation: string, exploredCount: number, totalCells: number } | null}
 */
async function generatePlayerOverlay(guildId, userId, client) {
  try {
    const { default: sharp } = await import('sharp');
    const { default: fsNode } = await import('fs');
    const fs = fsNode.promises;
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    // Load safari data for map info
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    const mapData = safariData[guildId]?.maps?.[activeMapId];
    if (!mapData?.discordImageUrl) return null;

    // Load player data for map progress
    const playerData = await loadPlayerData();
    const player = playerData[guildId]?.players?.[userId];
    const progress = player?.safari?.mapProgress?.[activeMapId];
    if (!progress?.currentLocation) return null;

    const exploredCoords = progress.exploredCoordinates || [];
    const currentLocation = progress.currentLocation;

    // Get grid dimensions
    const gridWidth = mapData.gridWidth || mapData.gridSize || 7;
    const gridHeight = mapData.gridHeight || mapData.gridSize || 7;

    // Fetch fresh CDN URL from storage message (URLs expire after 24h)
    let freshImageUrl = mapData.discordImageUrl;
    try {
      if (mapData.mapStorageMessageId && mapData.mapStorageChannelId) {
        const { DiscordRequest } = await import('./utils.js');
        const message = await DiscordRequest(
          `channels/${mapData.mapStorageChannelId}/messages/${mapData.mapStorageMessageId}`,
          { method: 'GET' }
        );
        if (message?.attachments?.[0]?.url) {
          freshImageUrl = message.attachments[0].url.trim().replace(/&+$/, '');
        }
      }
    } catch (e) {
      console.warn(`⚠️ Activity log overlay: could not fetch fresh URL: ${e.message}`);
    }

    // Download map image
    const imageResponse = await fetch(freshImageUrl);
    if (!imageResponse.ok) return null;
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (!imageBuffer.length) return null;

    // Calculate cell dimensions (80px border on each side)
    const metadata = await sharp(imageBuffer).metadata();
    const borderSize = 80;
    const innerWidth = metadata.width - (borderSize * 2);
    const innerHeight = metadata.height - (borderSize * 2);
    const cellWidth = innerWidth / gridWidth;
    const cellHeight = innerHeight / gridHeight;

    const coordToPosition = (coord) => {
      const col = coord.charCodeAt(0) - 65;
      const row = parseInt(coord.substring(1)) - 1;
      return {
        left: Math.floor(borderSize + (col * cellWidth)),
        top: Math.floor(borderSize + (row * cellHeight))
      };
    };

    const overlays = [];

    // Visited cells (excluding current) — translucent white
    for (const coord of exploredCoords) {
      if (coord === currentLocation) continue;
      const pos = coordToPosition(coord);
      const buf = await sharp({
        create: {
          width: Math.floor(cellWidth),
          height: Math.floor(cellHeight),
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 0.35 }
        }
      }).png().toBuffer();
      overlays.push({ input: buf, top: pos.top, left: pos.left });
    }

    // Current location — bright orange
    {
      const pos = coordToPosition(currentLocation);
      const buf = await sharp({
        create: {
          width: Math.floor(cellWidth),
          height: Math.floor(cellHeight),
          channels: 4,
          background: { r: 255, g: 165, b: 0, alpha: 0.5 }
        }
      }).png().toBuffer();
      overlays.push({ input: buf, top: pos.top, left: pos.left });
    }

    if (overlays.length === 0) return null;

    // Composite overlays onto map
    const overlaidImage = await sharp(imageBuffer).composite(overlays).png().toBuffer();

    // Save to temp file
    const tempDir = path.join(__dirname, 'temp');
    try { await fs.access(tempDir); } catch { await fs.mkdir(tempDir, { recursive: true }); }
    const tempFilePath = path.join(tempDir, `activity_overlay_${guildId}_${userId}_${Date.now()}.png`);
    await sharp(overlaidImage).toFile(tempFilePath);

    // Upload to Discord CDN
    const { uploadImageToDiscord } = await import('./mapExplorer.js');
    const guild = await client.guilds.fetch(guildId);
    const uploadResult = await uploadImageToDiscord(guild, tempFilePath, `activity_overlay_${Date.now()}.png`);
    const imageUrl = uploadResult.url || uploadResult;

    // Cleanup temp file
    try { await fs.unlink(tempFilePath); } catch {}

    return {
      imageUrl,
      currentLocation,
      exploredCount: exploredCoords.length,
      totalCells: gridWidth * gridHeight
    };
  } catch (error) {
    console.error('Activity log overlay error:', error.message);
    return null;
  }
}

/**
 * Get formatted stamina display string for a player.
 * @returns {string|null} e.g. "⚡ Stamina: 0/1 (Resets in 11h 59m)"
 */
async function getStaminaDisplay(guildId, userId) {
  try {
    const { getEntityPoints, getTimeUntilRegeneration } = await import('./pointsManager.js');
    const entityId = `player_${userId}`;
    const stamina = await getEntityPoints(guildId, entityId, 'stamina');
    if (!stamina) return null;

    let display = `⚡ Stamina: ${stamina.current}/${stamina.max}`;
    if (stamina.current < stamina.max) {
      const timeUntil = await getTimeUntilRegeneration(guildId, entityId, 'stamina');
      if (timeUntil) display += ` (Resets in ${timeUntil})`;
    }
    return display;
  } catch (error) {
    console.error('Activity log stamina error:', error.message);
    return null;
  }
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
 * @param {Object} [params.client] - Discord client (needed for admin overlay generation)
 * @returns {Object} Components V2 response data
 */
export async function createActivityLogUI({ guildId, userId, playerName, page = 1, mode = 'player', backButtonId, client }) {
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

  // Map gallery with visited locations, stamina, legend (admin and player)
  if (client) {
    try {
      const overlay = await generatePlayerOverlay(guildId, userId, client);
      if (overlay) {
        components.push({
          type: 12, // Media Gallery
          items: [{ media: { url: overlay.imageUrl } }]
        });

        // Stamina display
        const staminaText = await getStaminaDisplay(guildId, userId);
        const locationInfo = `📍 Current: **${overlay.currentLocation}** · Explored: **${overlay.exploredCount}/${overlay.totalCells}** cells`;
        components.push({
          type: 10, // TextDisplay
          content: staminaText ? `${locationInfo}\n${staminaText}` : locationInfo
        });

        // Legend
        components.push({
          type: 10, // TextDisplay
          content: '⬜ Visited · 🟧 Current Location'
        });

        components.push({ type: 14 }); // Separator
      }
    } catch (error) {
      console.error('Activity log gallery error:', error.message);
    }
  }

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
