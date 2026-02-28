/**
 * Start Safari - Bulk Player Initialization
 * Allows hosts to initialize multiple players onto the Safari map at once.
 */

import { getCustomTerms, loadSafariContent } from './safariManager.js';

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
  return { customTerms, defaultItemCount, coordinate };
}

/**
 * Build the Start Safari panel container components
 */
function buildPanelComponents(config, selectedUserIds = null) {
  const { customTerms, defaultItemCount, coordinate } = config;

  const infoText = `## 🦁 Start Safari\n\n> Initialize players onto the Safari map. Each player receives:\n> - **Starting Location:** ${coordinate} *(change in Settings)*\n> - **Starting ${customTerms.currencyName}:** ${customTerms.defaultStartingCurrencyValue} ${customTerms.currencyEmoji} *(change in Settings)*\n> - **Starting Items:** ${defaultItemCount} default item${defaultItemCount !== 1 ? 's' : ''} *(change in Items screen)*\n>\n> -# Players can also be added individually from **Player Admin** at any time.`;

  const selectionText = selectedUserIds
    ? `> **Selected:** ${selectedUserIds.map(id => `<@${id}>`).join(', ')}`
    : '> **Select players to initialize**';

  const userSelect = {
    type: 5,
    custom_id: 'safari_start_user_select',
    max_values: 25,
    placeholder: 'Select players to initialize...',
    ...(selectedUserIds && { default_values: selectedUserIds.map(id => ({ id, type: 'user' })) })
  };

  const goLabel = selectedUserIds
    ? `▶️ Start Safari (${selectedUserIds.length})`
    : '▶️ Start Safari';

  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: 0xF5A623,
      components: [
        { type: 10, content: infoText },
        { type: 14 },
        { type: 10, content: selectionText },
        { type: 1, components: [userSelect] },
        { type: 14 },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2 },
            { type: 2, custom_id: 'safari_start_safari_go', label: goLabel, style: 1, disabled: !selectedUserIds }
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
  return buildPanelComponents(config);
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
  return buildPanelComponents(config, selectedUserIds);
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
