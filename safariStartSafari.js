/**
 * Start Safari - Bulk Player Initialization
 * Allows hosts to initialize multiple players onto the Safari map at once.
 */

import { getCustomTerms, loadSafariContent } from './safariManager.js';
import { loadPlayerData } from './storage.js';

// In-memory store for user selections (keyed by guildId_userId)
const selections = new Map();

/**
 * Load config needed for the Start Safari panel
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
 * Build per-player detail lines for the selection list
 */
async function buildPlayerLines(guildId, userIds, config, client) {
  const { customTerms, defaultItemCount, coordinate, safariData } = config;
  const playerData = await loadPlayerData();
  const activeMapId = safariData[guildId]?.maps?.active;
  const guild = client?.guilds?.cache?.get(guildId);

  const lines = [];
  for (const userId of userIds) {
    // Resolve display name
    let displayName = `<@${userId}>`;
    try {
      if (guild) {
        const member = await guild.members.fetch(userId);
        displayName = `<@${userId}>`;
      }
    } catch { /* use mention fallback */ }

    // Determine per-player starting location
    const playerMapData = activeMapId
      ? playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]
      : null;
    const playerStarting = playerMapData?.startingLocation;
    const startCoord = playerStarting || coordinate;

    // Current inventory count
    const safari = playerData[guildId]?.players?.[userId]?.safari;
    const currentItems = Object.keys(safari?.inventory || {}).length;

    // Build line
    let line = `> ${displayName} — Location: **${startCoord}**, ${customTerms.currencyName}: **${customTerms.defaultStartingCurrencyValue}** ${customTerms.currencyEmoji}, Items: **${defaultItemCount}**`;
    if (currentItems > 0) {
      line += `, Current Items: **${currentItems}**`;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Build the info text block (shared between initial panel and selection panel)
 */
function buildInfoText(config) {
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

/**
 * Build the Start Safari panel (no selection yet)
 */
function buildInitialPanel(config) {
  const infoText = buildInfoText(config);

  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: 0xF5A623,
      components: [
        { type: 10, content: infoText },
        { type: 14 },
        {
          type: 1,
          components: [{
            type: 5,
            custom_id: 'safari_start_user_select',
            max_values: 25,
            placeholder: 'Select players to initialize...'
          }]
        },
        { type: 14 },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2 },
            { type: 2, custom_id: 'safari_start_safari_go', label: '▶️ Start Safari', style: 1, disabled: true }
          ]
        }
      ]
    }]
  };
}

/**
 * Build the Start Safari panel with player selection
 */
function buildSelectionPanel(config, playerLines, selectedUserIds) {
  const infoText = buildInfoText(config);
  const playerListText = `**Players to be added to Safari:**\n${playerLines.join('\n')}`;

  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: 0xF5A623,
      components: [
        { type: 10, content: infoText },
        { type: 14 },
        { type: 10, content: playerListText },
        {
          type: 1,
          components: [{
            type: 5,
            custom_id: 'safari_start_user_select',
            max_values: 25,
            default_values: selectedUserIds.map(id => ({ id, type: 'user' })),
            placeholder: 'Select players to initialize...'
          }]
        },
        { type: 14 },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2 },
            { type: 2, custom_id: 'safari_start_safari_go', label: `▶️ Start Safari (${selectedUserIds.length})`, style: 1 }
          ]
        }
      ]
    }]
  };
}

/**
 * Handle the Start Safari button — show panel with user select
 */
export async function handleStartSafari(context) {
  console.log(`🦁 START: safari_start_safari - user ${context.userId}`);
  selections.delete(`${context.guildId}_${context.userId}`);
  const config = await loadConfig(context.guildId);
  return buildInitialPanel(config);
}

/**
 * Handle user select — store selection and re-render with Go button enabled
 */
export async function handleUserSelect(context) {
  console.log(`🦁 START: safari_start_user_select - user ${context.userId}`);
  const selectedUserIds = context.values || [];
  console.log(`🦁 Selected ${selectedUserIds.length} players for initialization`);

  selections.set(`${context.guildId}_${context.userId}`, selectedUserIds);

  const config = await loadConfig(context.guildId);
  const playerLines = await buildPlayerLines(context.guildId, selectedUserIds, config, context.client);
  return buildSelectionPanel(config, playerLines, selectedUserIds);
}

/**
 * Handle Go button — execute bulk initialization
 */
export async function handleStartSafariGo(context) {
  console.log(`🦁 START: safari_start_safari_go - user ${context.userId}`);

  const selectionKey = `${context.guildId}_${context.userId}`;
  const selectedUserIds = selections.get(selectionKey) || [];
  selections.delete(selectionKey);

  if (selectedUserIds.length === 0) {
    return {
      flags: (1 << 15),
      components: [{
        type: 17,
        accent_color: 0xe74c3c,
        components: [
          { type: 10, content: '## ❌ No Players Selected\n\nPlease go back and select players first.' },
          { type: 14 },
          { type: 1, components: [{ type: 2, custom_id: 'safari_start_safari', label: '← Back', style: 2 }] }
        ]
      }]
    };
  }

  const { bulkInitializePlayers } = await import('./safariMapAdmin.js');
  const { results, customTerms } = await bulkInitializePlayers(context.guildId, selectedUserIds, context.client);

  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  const resultLines = results.map(r => {
    if (r.success) {
      return `✅ <@${r.userId}> → **${r.coordinate}** with ${r.currency} ${customTerms.currencyEmoji}, ${r.itemCount} item${r.itemCount !== 1 ? 's' : ''}`;
    } else {
      const reason = r.error === 'Already initialized' ? `Already initialized at ${r.coordinate}` : r.error;
      return `⏭️ <@${r.userId}> — ${reason}`;
    }
  }).join('\n');

  console.log(`🦁 SUCCESS: safari_start_safari_go - ${successCount}/${totalCount} initialized`);

  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: successCount > 0 ? 0x2ecc71 : 0xe74c3c,
      components: [
        { type: 10, content: `## 🦁 Safari Started\n\n**${successCount}/${totalCount}** player${totalCount !== 1 ? 's' : ''} initialized successfully\n\n${resultLines}` },
        { type: 14 },
        { type: 1, components: [{ type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2 }] }
      ]
    }]
  };
}
