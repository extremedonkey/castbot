/**
 * Start Safari - Bulk Player Initialization & Removal
 * Allows hosts to initialize or remove multiple players from the Safari map at once.
 */

import { getCustomTerms, loadSafariContent } from './safariManager.js';
import { loadPlayerData } from './storage.js';

// In-memory store for user selections (keyed by mode_guildId_userId)
const selections = new Map();

function selectionKey(mode, guildId, userId) {
  return `${mode}_${guildId}_${userId}`;
}

// ==================== SHARED ====================

/**
 * Load config needed for Start/Remove Safari panels
 */
async function loadConfig(guildId) {
  const { getStaminaConfig } = await import('./safariManager.js');
  const customTerms = await getCustomTerms(guildId);
  const staminaConfig = await getStaminaConfig(guildId);
  const safariData = await loadSafariContent();
  const items = safariData[guildId]?.items || {};
  const defaultItemCount = Object.values(items).filter(i => i?.metadata?.defaultItem === 'Yes').length;
  const coordinate = staminaConfig.defaultStartingCoordinate || 'A1';
  return { customTerms, defaultItemCount, coordinate, safariData };
}

/**
 * Check if a player is initialized on Safari
 */
function isPlayerInitialized(playerData, guildId, userId) {
  const safari = playerData[guildId]?.players?.[userId]?.safari;
  return safari && (safari.currency !== undefined || safari.inventory !== undefined || safari.points !== undefined);
}

/**
 * Get all initialized player IDs for a guild
 */
async function getInitializedPlayerIds(guildId) {
  const playerData = await loadPlayerData();
  const players = playerData[guildId]?.players || {};
  return Object.keys(players).filter(userId => isPlayerInitialized(playerData, guildId, userId));
}

/**
 * Get a player's current location on the active map, or null
 */
function getPlayerLocation(playerData, safariData, guildId, userId) {
  const activeMapId = safariData[guildId]?.maps?.active;
  if (!activeMapId) return null;
  return playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]?.currentLocation || null;
}

/**
 * Build a generic select+action panel
 */
function buildPanel({ accentColor, infoContent, playerListContent, selectCustomId, selectDefaults, selectPlaceholder, backButtonId, backLabel, goButtonId, goLabel, goDisabled, goStyle }) {
  const components = [
    { type: 10, content: infoContent },
    { type: 14 },
  ];

  if (playerListContent) {
    components.push({ type: 10, content: playerListContent });
  }

  components.push({
    type: 1,
    components: [{
      type: 5,
      custom_id: selectCustomId,
      max_values: 25,
      placeholder: selectPlaceholder,
      ...(selectDefaults?.length && { default_values: selectDefaults.map(id => ({ id, type: 'user' })) })
    }]
  });

  components.push({ type: 14 });
  components.push({
    type: 1,
    components: [
      { type: 2, custom_id: backButtonId, label: backLabel, style: 2 },
      { type: 2, custom_id: goButtonId, label: goLabel, style: goStyle || 1, disabled: goDisabled }
    ]
  });

  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: accentColor,
      components
    }]
  };
}

/**
 * Build a result summary panel
 */
function buildResultPanel({ title, accentColor, successCount, totalCount, resultLines, backButtonId, backLabel }) {
  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: accentColor,
      components: [
        { type: 10, content: `## ${title}\n\n**${successCount}/${totalCount}** player${totalCount !== 1 ? 's' : ''} processed successfully\n\n${resultLines}` },
        { type: 14 },
        { type: 1, components: [{ type: 2, custom_id: backButtonId, label: backLabel, style: 2 }] }
      ]
    }]
  };
}

/**
 * Build empty selection error panel
 */
function buildNoSelectionPanel(backButtonId, backLabel) {
  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: 0xe74c3c,
      components: [
        { type: 10, content: '## ❌ No Players Selected\n\nPlease go back and select players first.' },
        { type: 14 },
        { type: 1, components: [{ type: 2, custom_id: backButtonId, label: '← Back', style: 2 }] }
      ]
    }]
  };
}

// ==================== START SAFARI ====================

function buildStartInfoText(config) {
  const { customTerms, defaultItemCount, coordinate } = config;
  return [
    `## 🦁 Start Safari`,
    ``,
    `Bulk initialize multiple players onto the Safari map at the same time.`,
    ``,
    `The following starting settings can be changed in \`/menu\` > Settings. You can set individual starting locations for each player from \`/menu\` > Player Admin.`,
    `> * **Starting Location:** ${coordinate}`,
    `> * **Starting ${customTerms.currencyName}:** ${customTerms.defaultStartingCurrencyValue} ${customTerms.currencyEmoji}`,
    ``,
    `Items can be set as starting items from \`/menu\` > Items:`,
    `> * **Starting Items:** ${defaultItemCount} default item${defaultItemCount !== 1 ? 's' : ''}.`,
    ``,
    `-# Players can be individually initialized at any time from \`/menu\` > Player Admin.`
  ].join('\n');
}

async function buildStartPlayerLines(guildId, userIds, config) {
  const { customTerms, defaultItemCount, coordinate, safariData } = config;
  const playerData = await loadPlayerData();
  const activeMapId = safariData[guildId]?.maps?.active;

  return userIds.map(userId => {
    const playerMapData = activeMapId
      ? playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]
      : null;
    const startCoord = playerMapData?.startingLocation || coordinate;
    const currentItems = Object.keys(playerData[guildId]?.players?.[userId]?.safari?.inventory || {}).length;

    let line = `> <@${userId}> — Location: **${startCoord}**, ${customTerms.currencyName}: **${customTerms.defaultStartingCurrencyValue}** ${customTerms.currencyEmoji}, Items: **${defaultItemCount}**`;
    if (currentItems > 0) {
      line += `, Current Items: **${currentItems}**`;
    }
    return line;
  });
}

export async function handleStartSafari(context) {
  console.log(`🦁 START: safari_start_safari - user ${context.userId}`);
  selections.delete(selectionKey('start', context.guildId, context.userId));
  const config = await loadConfig(context.guildId);

  return buildPanel({
    accentColor: 0xF5A623,
    infoContent: buildStartInfoText(config),
    playerListContent: null,
    selectCustomId: 'safari_start_user_select',
    selectDefaults: null,
    selectPlaceholder: 'Select players to initialize...',
    backButtonId: 'safari_map_explorer',
    backLabel: '← Map Explorer',
    goButtonId: 'safari_start_safari_go',
    goLabel: '▶️ Start Safari',
    goDisabled: true
  });
}

export async function handleUserSelect(context) {
  console.log(`🦁 START: safari_start_user_select - user ${context.userId}`);
  const selectedUserIds = context.values || [];
  console.log(`🦁 Selected ${selectedUserIds.length} players for initialization`);

  selections.set(selectionKey('start', context.guildId, context.userId), selectedUserIds);

  const config = await loadConfig(context.guildId);
  const playerLines = await buildStartPlayerLines(context.guildId, selectedUserIds, config);

  return buildPanel({
    accentColor: 0xF5A623,
    infoContent: buildStartInfoText(config),
    playerListContent: `**Players to be added to Safari:**\n${playerLines.join('\n')}`,
    selectCustomId: 'safari_start_user_select',
    selectDefaults: selectedUserIds,
    selectPlaceholder: 'Select players to initialize...',
    backButtonId: 'safari_map_explorer',
    backLabel: '← Map Explorer',
    goButtonId: 'safari_start_safari_go',
    goLabel: `▶️ Start Safari (${selectedUserIds.length})`,
    goDisabled: false
  });
}

export async function handleStartSafariGo(context) {
  console.log(`🦁 START: safari_start_safari_go - user ${context.userId}`);

  const key = selectionKey('start', context.guildId, context.userId);
  const selectedUserIds = selections.get(key) || [];
  selections.delete(key);

  if (selectedUserIds.length === 0) {
    return buildNoSelectionPanel('safari_start_safari', '← Back');
  }

  const { bulkInitializePlayers } = await import('./safariMapAdmin.js');
  const { results, customTerms } = await bulkInitializePlayers(context.guildId, selectedUserIds, context.client);

  const successCount = results.filter(r => r.success).length;
  const resultLines = results.map(r => {
    if (r.success) {
      return `✅ <@${r.userId}> → **${r.coordinate}** with ${r.currency} ${customTerms.currencyEmoji}, ${r.itemCount} item${r.itemCount !== 1 ? 's' : ''}`;
    }
    const reason = r.error === 'Already initialized'
      ? `Already initialized${r.coordinate && r.coordinate !== '?' ? ` at ${r.coordinate}` : ''}`
      : r.error;
    return `⏭️ <@${r.userId}> — ${reason}`;
  }).join('\n');

  console.log(`🦁 SUCCESS: safari_start_safari_go - ${successCount}/${results.length} initialized`);

  return buildResultPanel({
    title: '🦁 Safari Started',
    accentColor: successCount > 0 ? 0x2ecc71 : 0xe74c3c,
    successCount,
    totalCount: results.length,
    resultLines,
    backButtonId: 'safari_map_explorer',
    backLabel: '← Map Explorer'
  });
}

// ==================== REMOVE PLAYERS ====================

async function buildRemovePlayerLines(guildId, userIds) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const customTerms = await getCustomTerms(guildId);

  return userIds.map(userId => {
    const safari = playerData[guildId]?.players?.[userId]?.safari;
    const location = getPlayerLocation(playerData, safariData, guildId, userId);
    const currency = safari?.currency ?? 0;
    const itemCount = Object.keys(safari?.inventory || {}).length;

    let line = `> <@${userId}>`;
    if (location) line += ` — Location: **${location}**`;
    line += `, ${customTerms.currencyName}: **${currency}** ${customTerms.currencyEmoji}`;
    if (itemCount > 0) line += `, Items: **${itemCount}**`;
    return line;
  });
}

export async function handleRemovePlayers(context) {
  console.log(`🦁 START: safari_remove_players - user ${context.userId}`);
  selections.delete(selectionKey('remove', context.guildId, context.userId));

  // Pre-select all initialized players
  const initializedIds = await getInitializedPlayerIds(context.guildId);

  return buildPanel({
    accentColor: 0xed4245,
    infoContent: `## 🚪 Remove Players\n\nDe-initialize selected players from Safari. This removes their currency, inventory, points, stamina, and map location.\n\n⚠️ **This action cannot be undone.** Per-player starting locations are preserved.\n\n-# Players can be individually removed at any time from \`/menu\` > Player Admin.`,
    playerListContent: null,
    selectCustomId: 'safari_remove_user_select',
    selectDefaults: initializedIds,
    selectPlaceholder: 'Select players to remove...',
    backButtonId: 'safari_map_explorer',
    backLabel: '← Map Explorer',
    goButtonId: 'safari_remove_players_go',
    goLabel: initializedIds.length > 0 ? `🗑️ Remove Players (${initializedIds.length})` : '🗑️ Remove Players',
    goDisabled: initializedIds.length === 0,
    goStyle: 4 // Danger (red)
  });
}

export async function handleRemoveUserSelect(context) {
  console.log(`🦁 START: safari_remove_user_select - user ${context.userId}`);
  const selectedUserIds = context.values || [];
  console.log(`🦁 Selected ${selectedUserIds.length} players for removal`);

  selections.set(selectionKey('remove', context.guildId, context.userId), selectedUserIds);

  const playerLines = await buildRemovePlayerLines(context.guildId, selectedUserIds);

  return buildPanel({
    accentColor: 0xed4245,
    infoContent: `## 🚪 Remove Players\n\nDe-initialize selected players from Safari. This removes their currency, inventory, points, stamina, and map location.\n\n⚠️ **This action cannot be undone.** Per-player starting locations are preserved.\n\n-# Players can be individually removed at any time from \`/menu\` > Player Admin.`,
    playerListContent: selectedUserIds.length > 0 ? `**Players to be removed from Safari:**\n${playerLines.join('\n')}` : null,
    selectCustomId: 'safari_remove_user_select',
    selectDefaults: selectedUserIds,
    selectPlaceholder: 'Select players to remove...',
    backButtonId: 'safari_map_explorer',
    backLabel: '← Map Explorer',
    goButtonId: 'safari_remove_players_go',
    goLabel: `🗑️ Remove Players (${selectedUserIds.length})`,
    goDisabled: selectedUserIds.length === 0,
    goStyle: 4
  });
}

export async function handleRemovePlayersGo(context) {
  console.log(`🦁 START: safari_remove_players_go - user ${context.userId}`);

  const key = selectionKey('remove', context.guildId, context.userId);
  const selectedUserIds = selections.get(key) || [];
  selections.delete(key);

  if (selectedUserIds.length === 0) {
    return buildNoSelectionPanel('safari_remove_players', '← Back');
  }

  const { bulkDeinitializePlayers } = await import('./safariDeinitialization.js');
  const results = await bulkDeinitializePlayers(context.guildId, selectedUserIds, context.client);

  const successCount = results.success.length;
  const totalCount = selectedUserIds.length;

  const resultLines = selectedUserIds.map(userId => {
    if (results.success.includes(userId)) {
      return `✅ <@${userId}> — Removed from Safari`;
    }
    const failure = results.failed.find(f => f.userId === userId);
    return `❌ <@${userId}> — ${failure?.reason || 'Unknown error'}`;
  }).join('\n');

  console.log(`🦁 SUCCESS: safari_remove_players_go - ${successCount}/${totalCount} removed`);

  return buildResultPanel({
    title: '🚪 Players Removed',
    accentColor: successCount > 0 ? 0x2ecc71 : 0xe74c3c,
    successCount,
    totalCount,
    resultLines,
    backButtonId: 'safari_map_explorer',
    backLabel: '← Map Explorer'
  });
}
