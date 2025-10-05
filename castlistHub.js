/**
 * Castlist Management Hub - Central UI for all castlist operations
 * Following Player Management UI pattern with hot-swappable interface
 */

import { ButtonBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { ButtonStyle } from 'discord-api-types/v10';
import { castlistManager } from './castlistManager.js';
import { loadPlayerData } from './storage.js';

/**
 * Button types for castlist management
 */
export const CastlistButtonType = {
  VIEW: 'view',
  EDIT_INFO: 'edit_info',
  ADD_TRIBE: 'add_tribe',
  CUSTOMIZE: 'customize',
  EDIT_PLAYERS: 'edit_players',
  SWAP_MERGE: 'swap_merge',
  ORDER: 'order',
  PLACEMENTS: 'placements'
};

/**
 * Create the main Castlist Management Hub menu
 * @param {string} guildId - The guild ID
 * @param {Object} options - Menu options
 * @returns {Object} Discord interaction response
 */
export async function createCastlistHub(guildId, options = {}) {
  const {
    selectedCastlistId = null,
    activeButton = null,
    showVirtual = true
  } = options;
  
  // Get all castlists (including virtual)
  const allCastlists = await castlistManager.getAllCastlists(guildId);
  
  // Get migration stats
  const stats = await castlistManager.getMigrationStats(guildId);
  
  // Build container
  const container = {
    type: 17, // Container
    accent_color: 0x9b59b6, // Purple for castlists
    components: []
  };
  
  // Header
  container.components.push({
    type: 10, // Text Display
    content: `## 📋 Castlists | Manage All Cast Lists\n-# ${stats.total} castlists (${stats.real} managed, ${stats.virtual} legacy)`
  });
  
  // Separator
  container.components.push({ type: 14 });
  
  // Castlist dropdown select
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('castlist_select')
    .setPlaceholder('Select a castlist to manage...')
    .setMinValues(0) // Allow deselection
    .setMaxValues(1);

  // Add Active Castlist (default) as FIRST option
  let addedCount = 0;
  const defaultCastlist = allCastlists.get('default');
  if (defaultCastlist) {
    selectMenu.addOptions({
      label: 'Active Castlist',
      value: 'default',
      description: 'Select if you don\'t know what you\'re doing. Castlist for active phase of the game.',
      emoji: '✅'
    });
    addedCount++;
  }

  // Sort remaining castlists: real first, then virtual (excluding default)
  const sortedCastlists = [...allCastlists.values()]
    .filter(c => c.id !== 'default') // Exclude default (already added)
    .sort((a, b) => {
      if (a.isVirtual !== b.isVirtual) {
        return a.isVirtual ? 1 : -1; // Real first
      }
      return a.name.localeCompare(b.name);
    });

  // Add remaining castlists to select menu (max 25 total)
  for (const castlist of sortedCastlists) {
    if (addedCount >= 25) break;

    // Skip virtual if not showing
    if (castlist.isVirtual && !showVirtual) continue;

    const emoji = castlist.metadata?.emoji || '📋';
    const label = castlist.isVirtual ? `${castlist.name} [Legacy]` : castlist.name;
    const description = castlist.metadata?.description ||
      (castlist.isVirtual ? 'Legacy castlist - click to upgrade' : 'Managed castlist');

    selectMenu.addOptions({
      label: label.substring(0, 100),
      value: castlist.id.substring(0, 100),
      description: description.substring(0, 100),
      emoji: emoji
    });

    addedCount++;
  }

  // If no castlists, add placeholder
  if (addedCount === 0) {
    selectMenu.addOptions({
      label: 'No castlists found',
      value: 'none',
      description: 'Create your first castlist'
    });
    selectMenu.setDisabled(true);
  }

  // Preserve selection if we have one (fix for dropdown persistence)
  if (selectedCastlistId && selectedCastlistId !== 'none') {
    selectMenu.setDisabled(false); // Ensure it's enabled
  }
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const selectComponent = selectRow.toJSON();

  // Add default_values for dropdown persistence if we have a selection
  if (selectedCastlistId && selectedCastlistId !== 'none' && selectComponent.components[0]) {
    selectComponent.components[0].default_values = [{
      id: selectedCastlistId,
      type: 'string'
    }];
  }

  container.components.push(selectComponent);
  
  // If a castlist is selected, show details and management options
  if (selectedCastlistId && selectedCastlistId !== 'none') {
    const castlist = await castlistManager.getCastlist(guildId, selectedCastlistId);
    
    if (castlist) {
      // Separator
      container.components.push({ type: 14 });
      
      // Castlist details section
      const detailsSection = await createCastlistDetailsSection(guildId, castlist);
      if (detailsSection) {
        container.components.push(detailsSection);
      }
      
      // Separator before buttons
      container.components.push({ type: 14 });
      
      // Management buttons
      const managementButtons = createManagementButtons(
        castlist.id,
        true, // enabled
        activeButton,
        castlist.isVirtual,
        castlist.name  // Pass castlist name for show_castlist2
      );
      container.components.push(managementButtons.buttonRow1.toJSON());
      container.components.push(managementButtons.buttonRow2.toJSON());
      container.components.push(managementButtons.deleteRow.toJSON());
      
      // Separator before hot-swappable area
      container.components.push({ type: 14 });
      
      // Hot-swappable interface based on active button
      const hotSwapInterface = await createHotSwappableInterface(
        guildId,
        castlist,
        activeButton
      );
      if (hotSwapInterface) {
        container.components.push(hotSwapInterface);
      } else if (!activeButton) {
        // Show placeholder when no button is active
        container.components.push({
          type: 1, // ActionRow
          components: [{
            type: 3, // String Select
            custom_id: 'castlist_action_inactive',
            placeholder: 'Click a button above to configure...',
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'No action selected', value: 'none' }]
          }]
        });
      }
    }
  } else {
    // No castlist selected - show disabled buttons
    container.components.push({ type: 14 });

    const disabledButtons = createManagementButtons(null, false, null, false, null);
    container.components.push(disabledButtons.buttonRow1.toJSON());
    container.components.push(disabledButtons.buttonRow2.toJSON());
    container.components.push(disabledButtons.deleteRow.toJSON());
    
    // Disabled placeholder
    container.components.push({ type: 14 });
    container.components.push({
      type: 1, // ActionRow
      components: [{
        type: 3, // String Select
        custom_id: 'castlist_action_pending',
        placeholder: 'Select a castlist first...',
        min_values: 0,
        max_values: 1,
        disabled: true,
        options: [{ label: 'No castlist selected', value: 'none' }]
      }]
    });
  }
  
  // Navigation
  container.components.push({ type: 14 });
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('prod_menu_back')
        .setLabel('← Menu')
        .setStyle(ButtonStyle.Secondary)
    );
  container.components.push(navButtons.toJSON());
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [container]
  };
}

/**
 * Create castlist details section
 * @param {string} guildId - The guild ID
 * @param {Object} castlist - The castlist object
 * @returns {Object} Details section component
 */
async function createCastlistDetailsSection(guildId, castlist) {
  const playerData = await loadPlayerData();
  const tribes = playerData[guildId]?.tribes || {};
  
  // Get tribes using this castlist
  const tribesUsingCastlist = await castlistManager.getTribesUsingCastlist(guildId, castlist.id);
  
  // Build tribes display
  let tribesDisplay = '';
  if (tribesUsingCastlist.length > 0) {
    const tribesList = tribesUsingCastlist.map(roleId => {
      const tribe = tribes[roleId];
      if (!tribe) return null;

      // Get tribe emoji (default to 🏕️ if not set)
      const emoji = tribe.emoji || '🏕️';
      return `${emoji} <@&${roleId}>`;
    }).filter(Boolean);

    tribesDisplay = tribesList.join('\n');
  } else {
    tribesDisplay = '-# No tribes currently using this castlist';
  }

  // Get season name if associated
  let seasonLine = '';
  if (castlist.seasonId) {
    const season = playerData[guildId]?.applicationConfigs?.[castlist.seasonId];

    if (season) {
      // Season exists - display with emoji
      const { getSeasonStageEmoji } = await import('./seasonSelector.js');
      const stageEmoji = getSeasonStageEmoji(season.stage || 'planning');
      seasonLine = `-# Season: ${stageEmoji} ${season.seasonName}\n`;
    } else {
      // Season was deleted
      seasonLine = `-# Season: ⚠️ Deleted season (ID: ${castlist.seasonId})\n`;
    }
  }

  // Build the details section
  const content = `> **\`${castlist.metadata?.emoji || '📋'} ${castlist.name}\`**\n` +
    `-# ${castlist.metadata?.description || 'No description'}\n` +
    `-# Type: ${castlist.type} | Created: <t:${Math.floor((castlist.createdAt || Date.now()) / 1000)}:R>\n` +
    seasonLine + // Season line (if any)
    (castlist.isVirtual ? `-# ⚠️ Legacy castlist - will be upgraded on first edit\n` : '') +
    `\n**Tribes Using This Castlist:**\n${tribesDisplay}`;
  
  return {
    type: 10, // Text Display
    content: content
  };
}

/**
 * Create management buttons
 * @param {string} castlistId - The castlist ID
 * @param {boolean} enabled - Whether buttons are enabled
 * @param {string} activeButton - Which button is active
 * @param {boolean} isVirtual - Whether castlist is virtual
 * @param {string} castlistName - The castlist name (for non-virtual castlists)
 * @returns {Object} Object with buttonRow1 and deleteRow
 */
function createManagementButtons(castlistId, enabled = true, activeButton = null, isVirtual = false, castlistName = null) {
  const buttonRow1 = new ActionRowBuilder();
  const suffix = castlistId ? `_${castlistId}` : '';

  // Row 1: View, Edit Info, Manage Tribes, Customize
  // For Post Castlist, use show_castlist2 directly to avoid redirect timeout
  let postCastlistCustomId = 'castlist_view'; // default when disabled
  if (enabled && castlistId) {
    // Special handling for Active/Default castlist - always use "default" as ID
    // For virtual castlists, use the encoded ID
    // For real castlists, use the castlist ID (not name)
    const targetId = castlistId === 'default' ? 'default' :
                    (isVirtual ? castlistId : (castlistName || castlistId));
    postCastlistCustomId = `show_castlist2_${targetId}`;
  }

  buttonRow1.addComponents(
    new ButtonBuilder()
      .setCustomId(postCastlistCustomId)
      .setLabel('Post Castlist')
      .setStyle(activeButton === CastlistButtonType.VIEW ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('📋')
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId(`castlist_edit_info${suffix}`)
      .setLabel('Edit Info')
      .setStyle(activeButton === CastlistButtonType.EDIT_INFO ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('✏️')
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId(`castlist_add_tribe${suffix}`)
      .setLabel('Manage Tribes')
      .setStyle(activeButton === CastlistButtonType.ADD_TRIBE ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('🏕️')
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId(`castlist_order${suffix}`)
      .setLabel('Order')
      .setStyle(activeButton === CastlistButtonType.ORDER ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('🔄')
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId(`castlist_swap_merge${suffix}`)
      .setLabel('Swap/Merge')
      .setStyle(activeButton === CastlistButtonType.SWAP_MERGE ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('🔀')
      .setDisabled(!enabled)
  );

  // Row 2: Tribes & Placements button and Delete button
  const buttonRow2 = new ActionRowBuilder();
  buttonRow2.addComponents(
    new ButtonBuilder()
      .setCustomId(`castlist_placements${suffix}`)
      .setLabel('Tribes & Placements')
      .setStyle(activeButton === CastlistButtonType.PLACEMENTS ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('🔥')
      .setDisabled(!enabled)
  );

  // Row 3: Delete button (red, disabled when no castlist selected OR when default)
  const deleteRow = new ActionRowBuilder();
  const isDefaultCastlist = castlistId === 'default';
  deleteRow.addComponents(
    new ButtonBuilder()
      .setCustomId(enabled ? `castlist_delete${suffix}` : 'castlist_delete')
      .setLabel('Delete Castlist')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
      .setDisabled(!enabled || isDefaultCastlist) // Disable for default
  );

  return { buttonRow1, buttonRow2, deleteRow };
}

/**
 * Create hot-swappable interface based on active button
 * @param {string} guildId - The guild ID
 * @param {Object} castlist - The castlist object
 * @param {string} activeButton - The active button type
 * @returns {Object|null} Hot-swap interface component
 */
async function createHotSwappableInterface(guildId, castlist, activeButton) {
  if (!activeButton) return null;
  
  switch (activeButton) {
    case CastlistButtonType.VIEW:
      // This case is no longer used since clicking "Post Castlist" directly posts
      // Keeping for backwards compatibility but returning null
      return null;
    
    case CastlistButtonType.ADD_TRIBE:
      // Create role select for adding/removing tribes
      // Get tribes currently using this castlist
      const tribesUsingCastlist = await castlistManager.getTribesUsingCastlist(guildId, castlist.id);
      
      return {
        type: 1, // ActionRow
        components: [{
          type: 6, // Role Select
          custom_id: `castlist_tribe_select_${castlist.id}`,
          placeholder: 'Select roles to manage as tribes (add/remove)...',
          min_values: 0,
          max_values: 25, // Discord limit
          default_values: tribesUsingCastlist.map(roleId => ({
            id: roleId,
            type: 'role'
          }))
        }]
      };
    
    case CastlistButtonType.ORDER:
      // Create sort strategy select
      const currentStrategy = castlist.settings?.sortStrategy || 'alphabetical';
      
      return {
        type: 1, // ActionRow
        components: [{
          type: 3, // String Select
          custom_id: `castlist_sort_${castlist.id}`,
          placeholder: 'Select sort order...',
          min_values: 1,
          max_values: 1,
          options: [
            {
              label: 'Alphabetical (A-Z)',
              value: 'alphabetical',
              description: 'Sort players by name',
              emoji: { name: '🔤' },
              default: currentStrategy === 'alphabetical'
            },
            {
              label: 'Reverse Alphabetical (Z-A)',
              value: 'reverse_alpha',
              description: 'Sort players by name in reverse',
              emoji: { name: '🔤' },
              default: currentStrategy === 'reverse_alpha'
            },
            {
              label: 'Placements',
              value: 'placements',
              description: 'Sort by ranking (1st, 2nd, 3rd...)',
              emoji: { name: '🏆' },
              default: currentStrategy === 'placements'
            },
            {
              label: 'Age',
              value: 'age',
              description: 'Sort by player age',
              emoji: { name: '🎂' },
              default: currentStrategy === 'age'
            },
            {
              label: 'Timezone',
              value: 'timezone',
              description: 'Sort by timezone offset',
              emoji: { name: '🌍' },
              default: currentStrategy === 'timezone'
            },
            {
              label: 'Join Date',
              value: 'join_date',
              description: 'Sort by server join date',
              emoji: { name: '📅' },
              default: currentStrategy === 'join_date'
            }
          ]
        }]
      };
    
    case CastlistButtonType.SWAP_MERGE:
      // Placeholder for Swap/Merge functionality
      return {
        type: 10, // Text Display
        content: '-# 🔀 Swap/Merge functionality coming soon...\n-# This will allow you to create new castlists from selected roles'
      };
    
    default:
      return null;
  }
}

/**
 * Create castlist creation wizard
 * @param {string} guildId - The guild ID
 * @param {string} createType - Type of creation (season/role/custom)
 * @returns {Object} Discord interaction response
 */
export async function createCastlistWizard(guildId, createType) {
  const containerComponents = [];
  
  // Header
  const typeEmoji = {
    season: '🎭',
    role: '👥',
    custom: '✨'
  }[createType] || '📋';
  
  const typeTitle = {
    season: 'Create from Season',
    role: 'Import from Role',
    custom: 'Create Custom Castlist'
  }[createType];
  
  containerComponents.push({
    type: 10,
    content: `## ${typeEmoji} ${typeTitle}`
  });
  containerComponents.push({ type: 14 });
  
  if (createType === 'season') {
    // Season selection
    const { createSeasonSelector } = await import('./seasonSelector.js');
    const selector = await createSeasonSelector(guildId, {
      customId: 'castlist_create_season_select',
      placeholder: 'Select a season to import from...',
      includeCreateNew: false
    });
    
    containerComponents.push({
      type: 10,
      content: `> **\`🎭 Select Season\`**\n-# Import accepted applications as castlist members`
    });
    
    const selectorRow = new ActionRowBuilder().addComponents(selector);
    containerComponents.push(selectorRow.toJSON());
    
  } else if (createType === 'role') {
    containerComponents.push({
      type: 10,
      content: `> **\`👥 Select Role\`**\n-# Import all members with this role\n\n⚠️ Role selection coming soon!`
    });
    
  } else if (createType === 'custom') {
    containerComponents.push({
      type: 10,
      content: `> **\`✨ Custom Castlist\`**\n` +
        `Enter details for your custom castlist:\n\n` +
        `• **Name**: Choose a unique name\n` +
        `• **Type**: winners, alumni, custom, etc.\n` +
        `• **Description**: Brief description\n` +
        `• **Sort**: How to order members\n\n` +
        `-# Click 'Create' to open the creation form`
    });
    
    const createButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('castlist_create_custom_form')
          .setLabel('Create Custom')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✨')
      );
    containerComponents.push(createButton.toJSON());
  }
  
  // Navigation
  containerComponents.push({ type: 14 });
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('castlist_hub_main')
        .setLabel('← Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
  containerComponents.push(navButtons.toJSON());
  
  // Build container
  const container = {
    type: 17,
    accent_color: 0x9b59b6,
    components: containerComponents
  };
  
  return {
    flags: (1 << 15),
    components: [container]
  };
}