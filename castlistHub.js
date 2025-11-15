/**
 * Castlist Management Hub - Central UI for all castlist operations
 * Simplified architecture: Tribes always visible, all config actions via modals/redirects
 */

import { ButtonBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { ButtonStyle } from 'discord-api-types/v10';
import { castlistManager } from './castlistManager.js';
import { loadPlayerData } from './storage.js';
import { createBackButton } from './src/ui/backButtonFactory.js';
import { parseTextEmoji } from './utils/emojiUtils.js';

/**
 * Create the main Castlist Management Hub menu
 * @param {string} guildId - The guild ID
 * @param {Object} options - Menu options
 * @param {Object} client - Discord client (required for tribe operations)
 * @returns {Object} Discord interaction response
 */
export async function createCastlistHub(guildId, options = {}, client = null) {
  const {
    selectedCastlistId = null,
    showVirtual = true,
    skipMemberFetch = false  // Skip expensive member fetch for fast operations
  } = options;
  
  // Load player data for season lookups
  const playerData = await loadPlayerData();

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
    content: `## 📋 Castlist Manager`
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
      emoji: '✅',
      default: selectedCastlistId === 'default' // Mark as default if selected
    });
    addedCount++;
  }

  // Add "Create New Castlist" as SECOND option (if we haven't hit the limit)
  if (addedCount < 25) {
    selectMenu.addOptions({
      label: 'Create New Castlist',
      value: 'create_new',
      description: 'Create a new custom castlist',
      emoji: '✨'
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

    // Parse emoji (supports Unicode and Discord custom emoji format)
    const emojiRaw = castlist.metadata?.emoji || '📋';
    console.log(`[HUB EMOJI DEBUG] ${castlist.name} (${castlist.id}): emojiRaw="${emojiRaw}", metadata=`, JSON.stringify(castlist.metadata));
    const { emoji } = parseTextEmoji(emojiRaw, '📋');
    const label = castlist.isVirtual ? `${castlist.name} [Legacy]` : castlist.name;

    // Build description with priority: custom description > season name > fallback
    let description;
    if (castlist.metadata?.description) {
      // Priority 1: Use custom description if exists
      description = castlist.metadata.description;
    } else if (castlist.seasonId) {
      // Priority 2: Look up season name if seasonId exists
      const season = Object.values(playerData[guildId]?.applicationConfigs || {})
        .find(config => config.seasonId === castlist.seasonId);
      description = season ? season.seasonName : 'Managed castlist';
    } else {
      // Priority 3: Fallback based on castlist type
      description = castlist.isVirtual ? 'Legacy castlist - click to upgrade' : 'Managed castlist';
    }

    selectMenu.addOptions({
      label: label.substring(0, 100),
      value: castlist.id.substring(0, 100),
      description: description.substring(0, 100),
      emoji: emoji,
      default: selectedCastlistId === castlist.id // Mark as default if selected
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

  container.components.push(selectComponent);

  // Track selected castlist for navigation buttons
  let selectedCastlist = null;

  // If a castlist is selected, show details and management options
  if (selectedCastlistId && selectedCastlistId !== 'none') {
    // Note: "create_new" won't reach here - it triggers a modal directly from the select handler

    const castlist = await castlistManager.getCastlist(guildId, selectedCastlistId);
    selectedCastlist = castlist; // Store for navigation

    if (castlist) {
      // Management buttons
      const managementButtons = createManagementButtons(
        castlist.id,
        true, // enabled
        castlist.isVirtual,
        castlist.name  // Pass castlist name for show_castlist2
      );
      container.components.push(managementButtons.buttonRow1.toJSON());

      // Separator before info section
      container.components.push({ type: 14 });

      // Add info text showing sort method and season
      const { getSortStrategyName } = await import('./utils/tribeDataUtils.js');
      const sortStrategyName = getSortStrategyName(castlist.settings?.sortStrategy || 'placements');

      // Get season information
      let seasonText = 'No Season';
      if (castlist.seasonId) {
        const season = Object.values(playerData[guildId]?.applicationConfigs || {})
          .find(config => config.seasonId === castlist.seasonId);

        if (season) {
          const { getSeasonStageEmoji } = await import('./seasonSelector.js');
          const stageEmoji = getSeasonStageEmoji(season.stage || 'planning');
          seasonText = `${stageEmoji} ${season.seasonName}`;
        } else {
          seasonText = '⚠️ Deleted season';
        }
      }

      // Add info text - Using Text Display instead of Section to avoid accessory issues
      container.components.push({
        type: 10, // Text Display (not Section)
        content: `### 🏕️ Tribes on Castlist\n` +
                 `-# • Tribes sorted by **${sortStrategyName}**\n` +
                 `-# • Castlist is associated with **${seasonText}**`
      });

      // Separator before tribes section
      container.components.push({ type: 14 });

      // ALWAYS show tribes when castlist is selected
      // Get tribe roleIds currently using this castlist
      const tribeRoleIds = await castlistManager.getTribesUsingCastlist(guildId, castlist.id);

      // Load full tribe objects from playerData
      const tribes = [];
      for (const roleId of tribeRoleIds) {
        const tribeData = playerData[guildId]?.tribes?.[roleId];
        if (tribeData) {
          tribes.push({
            roleId,
            ...tribeData
          });
        }
      }

      // Component budget safety check
      let maxTribeLimit = 6;
      const estimatedTotal = 22 + tribes.length; // Base + sections
      if (estimatedTotal > 35) {
        console.warn(`[TRIBES] Component count high: ${estimatedTotal}/40, limiting to 5 tribes`);
        maxTribeLimit = 5;
      }

      // Fetch guild once for all tribes
      const guild = tribes.length > 0 ? await client.guilds.fetch(guildId) : null;

      // OPTIONAL: Fetch guild members for player name display
      // Skip for fast operations like switching castlists or removing tribes
      if (guild && !skipMemberFetch) {
        try {
          await guild.members.fetch({ timeout: 5000 }); // Reduced to 5 second timeout
          console.log(`[TRIBES] Successfully fetched ${guild.members.cache.size} members`);
        } catch (fetchError) {
          console.warn(`[TRIBES] Member fetch failed (continuing with cache): ${fetchError.message}`);
          // Continue with cached data - don't block the operation
        }
      } else if (skipMemberFetch) {
        console.log(`[TRIBES] Skipping member fetch for fast operation (using ${guild?.members.cache.size || 0} cached)`);
      }

      // Import utility functions for formatting
      const { formatPlayerList } = await import('./utils/tribeDataUtils.js');

      // Handle zero-tribe state
      if (tribes.length === 0) {
        container.components.push({
          type: 10, // Text Display
          content: `-# *No tribes assigned to this castlist yet. Use the role selector below to add tribes.*`
        });
      }

      // Section for each existing tribe with Edit button accessory
      for (const tribe of tribes) {
        // Get role name from Discord
        const role = guild ? await guild.roles.fetch(tribe.roleId).catch(() => null) : null;
        const roleName = role?.name || tribe.roleId;

        // Get members with this role (if available from cache)
        const members = role ? Array.from(role.members.values()) : [];

        // IMPORTANT: When skipMemberFetch is true, role.members only has CACHED members
        // This is often just 1 person (you) even if the tribe has 12+ members!
        // Better to show no count than wrong count
        let playerListText;
        if (skipMemberFetch) {
          // Don't show member info in fast mode - it's incorrect
          playerListText = '';
        } else {
          // Full fetch mode - show accurate member list
          playerListText = formatPlayerList(members, 38);
        }

        const tribeSection = {
          type: 9, // Section
          components: [{
            type: 10, // Text Display
            content: `${tribe.emoji || '🏕️'} **${tribe.displayName || roleName}**` +
                     (playerListText ? `\n-# ${playerListText}` : '')
          }]
        };

        // Only add accessory if all required fields are available and non-empty
        const hasValidRoleId = tribe.roleId && typeof tribe.roleId === 'string' && tribe.roleId.length > 0;
        const hasValidCastlistId = castlist.id && typeof castlist.id === 'string' && castlist.id.length > 0;

        if (hasValidRoleId && hasValidCastlistId) {
          // Create button with all required fields explicitly
          const buttonAccessory = {
            type: 2, // Button
            custom_id: `tribe_edit_button|${tribe.roleId}|${castlist.id}`,
            label: "Edit",
            style: 2, // Secondary style
            emoji: { name: "✏️" }
            // Note: disabled field is optional, removing it
          };

          // Validate button has all required fields
          if (buttonAccessory.type && buttonAccessory.custom_id && buttonAccessory.label && buttonAccessory.style) {
            tribeSection.accessory = buttonAccessory;
            console.log(`[TRIBES] Added accessory for ${roleName}`);
          } else {
            console.warn(`[TRIBES] Invalid button structure for ${roleName}:`, buttonAccessory);
          }
        } else {
          console.warn(`[TRIBES] Skipping accessory - roleId: "${tribe.roleId}" (${typeof tribe.roleId}), castlistId: "${castlist.id}" (${typeof castlist.id})`);
        }

        // Final safety check - ensure accessory is complete or absent
        if (tribeSection.accessory) {
          const acc = tribeSection.accessory;
          if (!acc.type || !acc.custom_id || !acc.label || !acc.style) {
            console.warn(`[TRIBES] Removing incomplete accessory for ${roleName}:`, acc);
            delete tribeSection.accessory;
          }
        }

        console.log(`[TRIBES] Adding Section for tribe ${roleName}:`, JSON.stringify(tribeSection, null, 2));

        // Validate Section structure before adding
        if (tribeSection.type === 9 && tribeSection.components && tribeSection.components.length === 1) {
          container.components.push(tribeSection);
        } else {
          console.error(`[TRIBES] Invalid Section structure for tribe ${roleName}, skipping`);
        }
      }

      // Separator before Role Select
      if (tribes.length > 0) {
        container.components.push({ type: 14 });
      }

      // Role Select with pre-selection for instant toggle
      container.components.push({
        type: 1, // ActionRow
        components: [{
          type: 6, // Role Select
          custom_id: `castlist_tribe_select_${castlist.id}`,
          placeholder: tribes.length > 0
            ? 'Add or remove tribes...'
            : 'Select roles to add as tribes...',
          min_values: 0, // CRITICAL: Allow deselecting all (enables remove)
          max_values: maxTribeLimit, // ENFORCED: Component budget limit
          default_values: tribes.map(tribe => ({
            id: tribe.roleId,
            type: "role"
          }))
        }]
      });
    }
  } else {
    // No castlist selected - show disabled buttons
    const disabledButtons = createManagementButtons(null, false, false, null);
    container.components.push(disabledButtons.buttonRow1.toJSON());

    // Disabled placeholder
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
  
  // Navigation (using centralized Back Button Factory)
  container.components.push({ type: 14 });
  const navButtons = new ActionRowBuilder()
    .addComponents(createBackButton('prod_menu_back'));

  // Add Delete button (disabled when no selection or when default)
  const suffix = selectedCastlist?.id ? `_${selectedCastlist.id}` : '';
  const isDefaultCastlist = selectedCastlist?.id === 'default';
  const noSelection = !selectedCastlist;

  navButtons.addComponents(
    new ButtonBuilder()
      .setCustomId(`castlist_delete${suffix}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
      .setDisabled(noSelection || isDefaultCastlist) // Disable when no selection OR default
  );

  container.components.push(navButtons.toJSON());

  // Debug: Log the final structure to identify the issue
  console.log(`[DEBUG] Final container has ${container.components.length} components`);
  container.components.forEach((comp, index) => {
    if (comp.type === 9) { // Section
      console.log(`[DEBUG] Component ${index} is Section:`, {
        hasAccessory: !!comp.accessory,
        accessoryType: comp.accessory?.type,
        accessoryCustomId: comp.accessory?.custom_id,
        accessoryLabel: comp.accessory?.label,
        content: comp.components?.[0]?.content?.substring(0, 50) + '...'
      });
    }
  });

  // Return just the components - ButtonHandlerFactory will handle flags appropriately
  // UPDATE_MESSAGE cannot have flags, CHANNEL_MESSAGE_WITH_SOURCE needs them
  return {
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
    // Find season by seasonId (not by config key)
    const season = Object.values(playerData[guildId]?.applicationConfigs || {})
      .find(config => config.seasonId === castlist.seasonId);

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
  let content;

  if (castlist.id === 'default') {
    // Special rendering for Active Castlist (default)
    content = `> **\`✅ Active Castlist\`**\n` +
      `-# Current castlist for the current phase of the game. Use the Tribes button for swaps and merge.\n` +
      seasonLine;
  } else {
    // Regular castlist rendering - only show description if it exists
    const descriptionLine = castlist.metadata?.description ? `-# ${castlist.metadata.description}\n` : '';

    content = `> ${castlist.metadata?.emoji || '📋'} **\`${castlist.name}\`**\n` +
      descriptionLine +
      seasonLine +
      (castlist.isVirtual ? `-# ⚠️ Legacy castlist - will be upgraded on first edit\n` : '');
  }

  return {
    type: 10, // Text Display
    content: content
  };
}

/**
 * Create management buttons
 * @param {string} castlistId - The castlist ID
 * @param {boolean} enabled - Whether buttons are enabled
 * @param {boolean} isVirtual - Whether castlist is virtual
 * @param {string} castlistName - The castlist name (for non-virtual castlists)
 * @returns {Object} Object with buttonRow1, castlistId, and enabled state
 */
function createManagementButtons(castlistId, enabled = true, isVirtual = false, castlistName = null) {
  const buttonRow1 = new ActionRowBuilder();
  const suffix = castlistId ? `_${castlistId}` : '';

  // Row 1: Post Castlist, Edit Info, Manage Tribes, Placements, Order
  // For Post Castlist, use show_castlist2 directly to avoid redirect timeout
  let postCastlistCustomId = 'castlist_view'; // default when disabled
  if (enabled && castlistId) {
    // Always use castlistId for consistency (show_castlist2 handles both IDs and names)
    // For default castlist, use "default"
    // For all others (virtual or real), use the castlistId
    const targetId = castlistId === 'default' ? 'default' : castlistId;
    postCastlistCustomId = `show_castlist2_${targetId}`;
  }

  const isDefaultCastlist = castlistId === 'default';

  buttonRow1.addComponents(
    new ButtonBuilder()
      .setCustomId(postCastlistCustomId)
      .setLabel('Post Castlist')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋')
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId(`castlist_edit_info${suffix}`)
      .setLabel('Edit')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✏️')
      .setDisabled(!enabled), // Now enabled for default castlist too
    new ButtonBuilder()
      .setCustomId(`castlist_placements${suffix}`)
      .setLabel('Placements')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🥇')
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId(`castlist_swap_merge${suffix}`)
      .setLabel('Swap/Merge')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔀')
      .setDisabled(!enabled || !isDefaultCastlist) // Only enabled for default castlist
  );

  return { buttonRow1, castlistId, enabled };
}

// DELETED: createHotSwappableInterface() function
// Hot-swappable pattern removed in favor of always-visible tribes
// Tribes now appear automatically when castlist is selected (see createCastlistHub above)

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