/**
 * Start Safari - Bulk Player Initialization & Removal
 * Allows hosts to initialize or remove multiple players from the Safari map at once.
 */

import { getCustomTerms, loadSafariContent } from './safariManager.js';
import { loadPlayerData } from './storage.js';
import { getInitializedPlayers, buildPlayerSelectOptions } from './safariPlayerUtils.js';

// In-memory store for user selections (keyed by mode_guildId_userId)
const selections = new Map();

function selKey(mode, guildId, userId) {
  return `${mode}_${guildId}_${userId}`;
}

// ==================== SHARED UI BUILDERS ====================

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

function buildNoSelectionPanel(backButtonId) {
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

async function loadStartConfig(guildId) {
  const { getStaminaConfig } = await import('./safariManager.js');
  const customTerms = await getCustomTerms(guildId);
  const staminaConfig = await getStaminaConfig(guildId);
  const safariData = await loadSafariContent();
  const items = safariData[guildId]?.items || {};
  const defaultItemCount = Object.values(items).filter(i => i?.metadata?.defaultItem === 'Yes').length;
  const coordinate = staminaConfig.defaultStartingCoordinate || 'A1';
  return { customTerms, defaultItemCount, coordinate, safariData };
}

function buildStartInfoText(config) {
  const { customTerms, defaultItemCount, coordinate } = config;
  return [
    `## 🦁 Start Safari`,
    ``,
    `Bulk initialize multiple players onto the Safari map at the same time.`,
    ``,
    `The following starting settings can be changed in \`/menu\` > Settings. You can set individual starting locations for each player from \`/menu\` > Players > *(select player)* > Safari Map > Starting Location.`,
    `> * **Starting Location:** ${coordinate}`,
    `> * **Starting ${customTerms.currencyName}:** ${customTerms.defaultStartingCurrencyValue} ${customTerms.currencyEmoji}`,
    ``,
    `Items can be set as starting items from \`/menu\` > Items:`,
    `> * **Starting Items:** ${defaultItemCount} default item${defaultItemCount !== 1 ? 's' : ''}.`,
    ``,
    `-# Players can be individually initialized at any time from \`/menu\` > Players > *(select player)* > Safari Map > Initialize Safari.`
  ].join('\n');
}

function buildStartPanel(config, selectedUserIds, playerLines) {
  const infoText = buildStartInfoText(config);
  const hasSelection = selectedUserIds && selectedUserIds.length > 0;

  const components = [
    { type: 10, content: infoText },
    { type: 14 },
  ];

  if (hasSelection) {
    components.push({ type: 10, content: `**Players to be added to Safari:**\n${playerLines.join('\n')}` });
  }

  components.push({
    type: 1,
    components: [{
      type: 5, // User Select — can pick any server member
      custom_id: 'safari_start_user_select',
      max_values: 25,
      placeholder: 'Select players to initialize...',
      ...(hasSelection && { default_values: selectedUserIds.map(id => ({ id, type: 'user' })) })
    }]
  });

  components.push({ type: 14 });
  components.push({
    type: 1,
    components: [
      { type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2 },
      { type: 2, custom_id: 'safari_start_safari_go', label: hasSelection ? `▶️ Start Safari (${selectedUserIds.length})` : '▶️ Start Safari', style: 1, disabled: !hasSelection }
    ]
  });

  return {
    flags: (1 << 15),
    components: [{ type: 17, accent_color: 0xF5A623, components }]
  };
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
  selections.delete(selKey('start', context.guildId, context.userId));
  const config = await loadStartConfig(context.guildId);
  return buildStartPanel(config, null, null);
}

export async function handleUserSelect(context) {
  console.log(`🦁 START: safari_start_user_select - user ${context.userId}`);
  const selectedUserIds = context.values || [];
  console.log(`🦁 Selected ${selectedUserIds.length} players for initialization`);

  selections.set(selKey('start', context.guildId, context.userId), selectedUserIds);

  const config = await loadStartConfig(context.guildId);
  const playerLines = await buildStartPlayerLines(context.guildId, selectedUserIds, config);
  return buildStartPanel(config, selectedUserIds, playerLines);
}

export async function handleStartSafariGo(context) {
  console.log(`🦁 START: safari_start_safari_go - user ${context.userId}`);

  const key = selKey('start', context.guildId, context.userId);
  const selectedUserIds = selections.get(key) || [];
  selections.delete(key);

  if (selectedUserIds.length === 0) {
    return buildNoSelectionPanel('safari_start_safari');
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

const REMOVE_INFO = `## 🚪 Remove Players

De-initialize selected players from Safari. This removes their currency, inventory, points, stamina, and map location.

⚠️ **This action cannot be undone.** Per-player starting locations are preserved.

-# Players can be individually removed at any time from \`/menu\` > Players > *(select player)* > Safari Map > De-initialize from Safari.`;

function buildRemovePanel(players, selectedIds) {
  const hasPlayers = players.length > 0;
  const hasSelection = selectedIds && selectedIds.length > 0;

  const options = buildPlayerSelectOptions(players, {
    selectedIds,
    descriptionFn: (p) => {
      const parts = [];
      if (p.location) parts.push(p.location);
      parts.push(`${p.currency} ${p.currencyName}`);
      if (p.itemCount > 0) parts.push(`${p.itemCount} item${p.itemCount !== 1 ? 's' : ''}`);
      if (p.isPaused) parts.push('Paused');
      return parts.join(' · ');
    }
  });

  const components = [
    { type: 10, content: REMOVE_INFO },
    { type: 14 },
  ];

  if (hasPlayers) {
    if (hasSelection) {
      const selectedNames = players
        .filter(p => selectedIds.includes(p.userId))
        .map(p => `> <@${p.userId}>`);
      components.push({ type: 10, content: `**Players to be removed (${selectedIds.length}):**\n${selectedNames.join('\n')}` });
    }

    components.push({
      type: 1,
      components: [{
        type: 3, // String Select — only initialized players
        custom_id: 'safari_remove_user_select',
        placeholder: 'Select players to remove...',
        min_values: 0,
        max_values: Math.min(25, players.length),
        options
      }]
    });
  } else {
    components.push({ type: 10, content: '⚠️ No players are currently initialized on Safari.' });
  }

  components.push({ type: 14 });
  components.push({
    type: 1,
    components: [
      { type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2 },
      { type: 2, custom_id: 'safari_remove_players_go', label: hasSelection ? `🗑️ Remove Players (${selectedIds.length})` : '🗑️ Remove Players', style: 4, disabled: !hasSelection }
    ]
  });

  return {
    flags: (1 << 15),
    components: [{ type: 17, accent_color: 0xed4245, components }]
  };
}

export async function handleRemovePlayers(context) {
  console.log(`🚪 START: safari_remove_players - user ${context.userId}`);
  selections.delete(selKey('remove', context.guildId, context.userId));

  const players = await getInitializedPlayers(context.guildId, context.client);
  return buildRemovePanel(players, []);
}

export async function handleRemoveUserSelect(context) {
  console.log(`🚪 START: safari_remove_user_select - user ${context.userId}`);
  const selectedIds = context.values || [];
  console.log(`🚪 Selected ${selectedIds.length} players for removal`);

  selections.set(selKey('remove', context.guildId, context.userId), selectedIds);

  const players = await getInitializedPlayers(context.guildId, context.client);
  return buildRemovePanel(players, selectedIds);
}

export async function handleRemovePlayersGo(context) {
  console.log(`🚪 START: safari_remove_players_go - user ${context.userId}`);

  const key = selKey('remove', context.guildId, context.userId);
  const selectedIds = selections.get(key) || [];
  selections.delete(key);

  if (selectedIds.length === 0) {
    return buildNoSelectionPanel('safari_remove_players');
  }

  const { bulkDeinitializePlayers } = await import('./safariDeinitialization.js');
  const results = await bulkDeinitializePlayers(context.guildId, selectedIds, context.client);

  const successCount = results.success.length;
  const totalCount = selectedIds.length;

  const resultLines = selectedIds.map(userId => {
    if (results.success.includes(userId)) {
      return `✅ <@${userId}> — Removed from Safari`;
    }
    const failure = results.failed.find(f => f.userId === userId);
    return `❌ <@${userId}> — ${failure?.reason || 'Unknown error'}`;
  }).join('\n');

  console.log(`🚪 SUCCESS: safari_remove_players_go - ${successCount}/${totalCount} removed`);

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
