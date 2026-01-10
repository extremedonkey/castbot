import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  InteractionResponseType,
  InteractionResponseFlags
} from 'discord-interactions';
import { createPlayerCard, extractCastlistData, createCastlistRows } from './castlistV2.js';
import { getPlayer, updatePlayer, getGuildPronouns, getGuildTimezones, loadPlayerData } from './storage.js';
import { hasStoresInGuild, getEligiblePlayersFixed, getCustomTerms, getPlayerAttributes, getAttributeDefinitions } from './safariManager.js';
import { createBackButton } from './src/ui/backButtonFactory.js';
import { getTimeUntilRegeneration } from './pointsManager.js';

/**
 * Player management modes
 */
export const PlayerManagementMode = {
  ADMIN: 'admin',
  PLAYER: 'player'
};

/**
 * Button types for player management
 */
export const PlayerButtonType = {
  PRONOUNS: 'pronouns',
  TIMEZONE: 'timezone',
  AGE: 'age',
  VANITY: 'vanity'
};

/**
 * Creates a player display section using castlistV2 components
 * @param {Object} player - Discord member object
 * @param {Object} playerData - Guild player data
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Player display section component
 */
export async function createPlayerDisplaySection(player, playerData, guildId) {
  if (!player) {
    return null;
  }

  // Prepare parameters for castlistV2 createPlayerCard
  const pronounRoleIds = playerData[guildId]?.pronounRoleIDs || [];
  const timezones = playerData[guildId]?.timezones || {};
  
  // Get player pronouns
  const memberPronouns = player.roles.cache
    .filter(role => pronounRoleIds.includes(role.id))
    .map(role => role.name)
    .join(', ') || '';
    
  // Get player timezone and calculate current time
  let memberTimezone = '';
  let formattedTime = '';
  const timezoneRole = player.roles.cache.find(role => timezones[role.id]);
  
  if (timezoneRole) {
    memberTimezone = timezoneRole.name;

    try {
      const tzData = timezones[timezoneRole.id];
      let offset;

      // Feature toggle: Check if this timezone uses new DST system
      if (tzData.timezoneId) {
        // New system: read from dstState.json via getDSTOffset
        const { getDSTOffset, loadDSTState } = await import('./storage.js');

        // Ensure DST state is loaded
        await loadDSTState();
        offset = getDSTOffset(tzData.timezoneId);

        console.log(`🌍 DST lookup for ${tzData.timezoneId}: offset=${offset}, stored=${tzData.offset}`);

        // Fallback to stored offset if DST state not found
        if (offset === null) {
          console.log(`⚠️ No DST state for ${tzData.timezoneId}, using stored offset`);
          offset = tzData.offset;
        }
      } else {
        // Legacy system: read offset directly from playerData
        offset = tzData.offset;
      }

      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      const targetTime = new Date(utcTime + (offset * 3600000));
      formattedTime = targetTime.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error calculating timezone:', error);
      formattedTime = '';
    }
  }
  
  // Get stored player data
  const storedPlayerData = playerData[guildId]?.players?.[player.id] || {};
  
  // Create player card using castlistV2 function
  const playerCard = createPlayerCard(
    player,
    storedPlayerData,
    memberPronouns,
    memberTimezone,
    formattedTime,
    false // Never show emoji in player management
  );
  
  // Fix avatar URL for webhook context
  const avatarHash = player.user.avatar;
  const userId = player.user.id;
  const avatarUrl = avatarHash 
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${userId % 5}.png`;
  
  return {
    ...playerCard,
    accessory: {
      ...playerCard.accessory,
      media: {
        url: avatarUrl
      }
    }
  };
}

/**
 * Creates an attribute display section showing player's attributes
 * Only shows if the guild has attributes configured
 * @param {string} guildId - Discord guild ID
 * @param {string} playerId - Player's Discord user ID
 * @param {string} [label] - Optional label override (defaults to "Your Stats", use player name for admin view)
 * @returns {Object|null} Text display component or null if no attributes
 */
export async function createAttributeDisplaySection(guildId, playerId, label = 'Your Stats') {
  try {
    // Clear safari cache before reading attributes to ensure fresh data
    // This prevents showing stale values after admin modifications
    const { clearSafariCache } = await import('./safariManager.js');
    clearSafariCache();

    // Check if guild has any attributes configured
    const definitions = await getAttributeDefinitions(guildId);
    const definitionEntries = Object.entries(definitions);

    if (definitionEntries.length === 0) {
      return null; // No attributes configured for this server
    }

    // Get player's attribute values
    const attributes = await getPlayerAttributes(guildId, playerId);
    const attributeEntries = Object.entries(attributes);

    if (attributeEntries.length === 0) {
      return null;
    }

    // Sort by display order
    attributeEntries.sort((a, b) => {
      const orderA = a[1].display?.order || 100;
      const orderB = b[1].display?.order || 100;
      return orderA - orderB;
    });

    // Phase 5: Import calculateAttributeModifiers for item bonus display
    const { calculateAttributeModifiers } = await import('./pointsManager.js');
    const entityId = `player_${playerId}`;

    // Build attribute lines
    const attrLines = [];
    for (const [attrId, attr] of attributeEntries) {
      const emoji = attr.emoji || '📊';
      const name = attr.name;
      const value = attr.value;

      // Phase 5: Get item modifiers for this attribute
      const itemModifiers = await calculateAttributeModifiers(guildId, entityId, attrId);
      const hasItemBonus = itemModifiers.add > 0 || itemModifiers.addMax > 0;

      if (attr.category === 'resource') {
        // Resource type - show current/max with optional bar
        const current = value.current ?? attr.defaultCurrent ?? 0;
        const max = value.max ?? attr.defaultMax ?? current;
        const percentage = max > 0 ? Math.floor((current / max) * 100) : 0;

        // Create simple bar
        const filledBlocks = Math.floor(percentage / 10);
        const emptyBlocks = 10 - filledBlocks;
        const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

        let line = `${emoji} **${name}**: ${bar} ${current}/${max}`;

        // Phase 5: Show item bonus for max capacity
        if (itemModifiers.addMax > 0) {
          line += ` *(+${itemModifiers.addMax} max from items)*`;
        }
        // Add regen time if not at max (only if no item bonus shown)
        else if (current < max && attr.regeneration?.type !== 'none') {
          try {
            const regenTime = await getTimeUntilRegeneration(guildId, entityId, attrId);
            if (regenTime && regenTime !== 'Full') {
              line += ` *(${regenTime})*`;
            }
          } catch (e) {
            // Ignore regen time errors
          }
        }

        attrLines.push(line);
      } else {
        // Stat type - show single value with item bonuses
        const baseValue = value.current ?? value ?? attr.defaultValue ?? 0;
        const totalValue = baseValue + itemModifiers.add;

        let line = `${emoji} **${name}**: ${totalValue}`;

        // Phase 5: Show item bonus breakdown
        if (itemModifiers.add > 0) {
          line += ` *(+${itemModifiers.add} from items)*`;
        }

        attrLines.push(line);
      }
    }

    if (attrLines.length === 0) {
      return null;
    }

    return {
      type: 10, // Text Display
      content: `> **\`📊 ${label}\`**\n${attrLines.join('\n')}`
    };
  } catch (error) {
    console.error('Error creating attribute display:', error);
    return null;
  }
}

/**
 * Creates management buttons based on mode and state
 * @param {string} targetUserId - Target user ID
 * @param {string} mode - PlayerManagementMode
 * @param {boolean} enabled - Whether buttons should be enabled
 * @param {string} activeButton - Which button is currently active
 * @param {boolean} showVanityRoles - Whether to show vanity roles button (admin only)
 * @returns {Object} ActionRow with buttons
 */
export function createManagementButtons(targetUserId, mode, enabled = true, activeButton = null, showVanityRoles = false) {
  const prefix = mode === PlayerManagementMode.ADMIN ? 'admin' : 'player';
  const suffix = mode === PlayerManagementMode.ADMIN && !enabled ? '_pending' : '';
  const userIdPart = mode === PlayerManagementMode.ADMIN && enabled ? `_${targetUserId}` : '';
  
  const components = [
    {
      type: 2, // Button
      style: activeButton === 'pronouns' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Pronouns',
      custom_id: `${prefix}_set_pronouns${suffix}${userIdPart}`,
      emoji: { name: '💜' },
      disabled: !enabled
    },
    {
      type: 2, // Button
      style: activeButton === 'timezone' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Timezone',
      custom_id: `${prefix}_set_timezone${suffix}${userIdPart}`,
      emoji: { name: '🌍' },
      disabled: !enabled
    },
    {
      type: 2, // Button
      style: activeButton === 'age' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Age',
      custom_id: `${prefix}_set_age${suffix}${userIdPart}`,
      emoji: { name: '🎂' },
      disabled: !enabled
    }
  ];

  // Add vanity roles button for admin mode
  if (mode === PlayerManagementMode.ADMIN && showVanityRoles) {
    components.push({
      type: 2, // Button
      style: activeButton === 'vanity' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Vanity Roles',
      custom_id: `admin_manage_vanity${suffix}${userIdPart}`,
      emoji: { name: '🎭' },
      disabled: !enabled
    });
  }

  // Add attributes button for admin mode (5th button - at max for ActionRow)
  if (mode === PlayerManagementMode.ADMIN) {
    components.push({
      type: 2, // Button
      style: activeButton === 'attributes' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Stats',
      custom_id: `admin_set_attributes${suffix}${userIdPart}`,
      emoji: { name: '📊' },
      disabled: !enabled
    });
  }

  return {
    type: 1, // ActionRow
    components
  };
}

/**
 * Creates the complete player management UI
 * @param {Object} options - Configuration options
 * @returns {Object} Components V2 message structure
 */
export async function createPlayerManagementUI(options) {
  const {
    mode = PlayerManagementMode.PLAYER,
    targetMember,
    playerData,
    guildId,
    userId,
    showUserSelect = (mode === PlayerManagementMode.ADMIN),
    showVanityRoles = (mode === PlayerManagementMode.ADMIN),
    title = mode === PlayerManagementMode.ADMIN ? 'CastBot | Player Management' : 'CastBot | Player Menu',
    activeButton = null, // Which button is currently active
    client = null, // Discord client for fetching data
    channelId = null, // Discord channel ID for location context
    // Application context options
    isApplicationContext = false, // Whether this is being used in application channel
    hideBottomButtons = false // Whether to hide bottom action row buttons
  } = options;

  // Check if this guild has stores
  const hasStores = await hasStoresInGuild(guildId);

  // Create container
  const container = {
    type: 17, // Container
    accent_color: 0x3498DB, // Blue accent (matching production menu)
    components: []
  };

  // Add header
  container.components.push({
    type: 10, // Text Display
    content: `## ${title}`
  });

  // Add user select for admin mode
  if (showUserSelect) {
    container.components.push({
      type: 14 // Separator
    });
    
    const userSelectRow = {
      type: 1, // ActionRow
      components: [{
        type: 5, // User Select
        custom_id: 'admin_player_select_update',
        placeholder: 'Select a player to manage',
        min_values: 0, // Allow deselection
        max_values: 1
      }]
    };
    
    // Preserve selection if we have a target member
    if (targetMember) {
      userSelectRow.components[0].default_values = [{
        id: targetMember.id,
        type: 'user'
      }];
    }
    
    container.components.push(userSelectRow);
  }

  // Add player display if we have a target member
  if (targetMember) {
    container.components.push({
      type: 14 // Separator
    });

    const playerSection = await createPlayerDisplaySection(targetMember, playerData, guildId);
    if (playerSection) {
      container.components.push(playerSection);
    }

    // Add attribute display section (only shows if guild has attributes configured)
    // Use "Your Stats" for player mode, player name for admin mode
    const statsLabel = mode === PlayerManagementMode.ADMIN
      ? `${targetMember.displayName || targetMember.user?.username || 'Player'}'s Stats`
      : 'Your Stats';
    const attributeSection = await createAttributeDisplaySection(guildId, targetMember.id, statsLabel);
    if (attributeSection) {
      container.components.push({
        type: 14 // Separator
      });
      container.components.push(attributeSection);
    }

    // Add separator before buttons
    container.components.push({
      type: 14 // Separator
    });

    // Add management buttons with active state
    const managementButtons = createManagementButtons(
      targetMember.id, 
      mode, 
      true, // Enabled since we have a member
      activeButton,
      showVanityRoles
    );
    container.components.push(managementButtons);

    // Add separator before hot-swappable select
    container.components.push({
      type: 14 // Separator
    });

    // Add hot-swappable select based on active button
    const selectMenu = await createHotSwappableSelect(
      activeButton,
      targetMember,
      playerData,
      guildId,
      mode,
      client
    );
    if (selectMenu) {
      container.components.push(selectMenu);
    } else if (!activeButton) {
      // Show disabled placeholder select when member is selected but no button is active
      container.components.push({
        type: 1, // ActionRow
        components: [{
          type: 6, // Role Select
          custom_id: 'admin_integrated_select_inactive',
          placeholder: 'Click a button above to configure..',
          min_values: 0,
          max_values: 1,
          disabled: true
        }]
      });
    }

    // Don't add any select menus here - they're handled by hot-swappable select
  } else if (mode === PlayerManagementMode.ADMIN) {
    // No member selected - show disabled buttons
    container.components.push({
      type: 14 // Separator
    });

    const disabledButtons = createManagementButtons(null, mode, false, null, showVanityRoles);
    container.components.push(disabledButtons);

    // Add separator and disabled select placeholder
    container.components.push({
      type: 14 // Separator
    });

    container.components.push({
      type: 1, // ActionRow
      components: [{
        type: 6, // Role Select
        custom_id: 'admin_integrated_select_pending',
        placeholder: 'Select player first..',
        min_values: 0,
        max_values: 1,
        disabled: true
      }]
    });
  }

  // Extract castlist data for multiple castlist support
  const { allCastlists } = await extractCastlistData(playerData, guildId);

  // Create Menu button row
  const menuRow = {
    type: 1, // ActionRow
    components: []
  };

  // Add Menu button (far left) - using centralized factory
  if (mode === PlayerManagementMode.ADMIN) {
    menuRow.components.push(createBackButton('prod_menu_back'));
  }

  // Only add menu row if it has buttons (admin mode)
  if (menuRow.components.length > 0) {
    container.components.push(menuRow);
  }

  console.log(`🔍 createPlayerManagementUI mode check: mode=${mode}, PlayerManagementMode.ADMIN=${PlayerManagementMode.ADMIN}, is admin=${mode === PlayerManagementMode.ADMIN}`);

  if (mode === PlayerManagementMode.ADMIN) {
    // Admin mode (Player Management): No castlist buttons - focus on player management only
    console.log(`🔍 Admin mode detected - returning early WITHOUT castlist buttons`);
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2 only - ephemeral handled by caller
      components: [container]
    };
  } else {
    console.log(`🔍 Player mode detected - creating castlist buttons`);
    // Player mode (Player Menu): Add castlist buttons outside the container (unless hidden)
    let castlistRows = [];
    let globalStoreRows = [];
    let inventoryRow = null;

    // Load safari configuration for castlist filtering and global stores
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const safariConfig = safariData[guildId]?.safariConfig || {};

    if (!hideBottomButtons) {
      console.log(`🔍 Player Menu castlist check: allCastlists=${allCastlists}, size=${allCastlists?.size}, hideBottomButtons=${hideBottomButtons}`);

      // Apply castlist visibility filter based on configuration
      const showCustomCastlists = safariConfig.showCustomCastlists !== false; // Default true (show all)
      let filteredCastlists = allCastlists;
      let castlistsPreSorted = false;  // Track if castlists were sorted by timestamp

      if (!showCustomCastlists) {
        // Admin wants to hide custom castlists - show only default
        console.log(`🔍 Filtering castlists: showCustomCastlists=false, showing default only`);
        const defaultOnly = allCastlists?.get('default');
        filteredCastlists = defaultOnly
          ? new Map([['default', defaultOnly]])  // Show default button
          : new Map();  // Empty → triggers fallback button below
      } else {
        // Limit to 4 custom castlists (+ default = max 5 total) to prevent Discord 40-component limit
        const { limitAndSortCastlists } = await import('./castlistV2.js');
        filteredCastlists = limitAndSortCastlists(allCastlists, 4);
        castlistsPreSorted = true;  // Castlists are now sorted by timestamp (newest first)
        console.log(`🔍 Limited castlists: showing ${filteredCastlists.size} of ${allCastlists?.size || 0} total (max 4 custom + default)`);
      }

      if (filteredCastlists && filteredCastlists.size > 0) {
        console.log(`✅ Creating castlist rows for ${filteredCastlists.size} castlists`);
        // Player mode: don't include the "+" button (includeAddButton = false)
        // Pass preSorted flag to preserve timestamp order from limitAndSortCastlists
        castlistRows = createCastlistRows(filteredCastlists, false, hasStores, castlistsPreSorted);
        console.log(`✅ Created ${castlistRows.length} castlist row(s)`);
      } else {
        // Fallback: single default castlist button if no castlist data found
        console.log(`⚠️ No castlists found after filtering, showing fallback button`);
        castlistRows = [{
          type: 1, // ActionRow
          components: [new ButtonBuilder()
            .setCustomId('show_castlist2_default')
            .setLabel('📃 Post Castlist')
            .setStyle(ButtonStyle.Primary)]
        }];
      }

      // Add global store buttons (only if not Round 0)
      const currentRound = safariConfig.currentRound;
      
      // Only show global stores if currentRound exists and is not 0
      if (currentRound && currentRound !== 0) {
        const globalStores = safariData[guildId]?.globalStores || [];
        const stores = safariData[guildId]?.stores || {};
        
        if (globalStores.length > 0) {
          const storeButtons = [];
          let currentRow = [];
          
          for (const storeId of globalStores) {
            const store = stores[storeId];
            if (!store) continue;
            
            const button = new ButtonBuilder()
              .setCustomId(`safari_store_browse_${guildId}_${storeId}`)
              .setLabel(store.name.slice(0, 80))
              .setStyle(ButtonStyle.Secondary)  // Grey style for global stores
              .setEmoji(store.emoji || '🏪');
            
            currentRow.push(button);
            
            // Max 5 buttons per row
            if (currentRow.length === 5) {
              globalStoreRows.push({
                type: 1, // ActionRow
                components: currentRow
              });
              currentRow = [];
            }
          }
          
          // Add remaining buttons
          if (currentRow.length > 0) {
            globalStoreRows.push({
              type: 1, // ActionRow
              components: currentRow
            });
          }
        }
      }
      
      // Check if user is eligible for Safari inventory access
      if (targetMember && client) {
        try {
          // Check if player has been initialized in Safari system
          const { getCoordinateFromChannelId } = await import('./safariManager.js');
          const { loadPlayerData } = await import('./storage.js');
          const playerData = await loadPlayerData();

          // Player is initialized if they have Safari data structure
          const isInitialized = playerData[guildId]?.players?.[targetMember.id]?.safari !== undefined;
          const activeMapId = safariData[guildId]?.maps?.active;
          const playerMapData = activeMapId ? playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId] : null;
          const hasMapLocation = playerMapData?.currentLocation !== undefined;

          // Get inventory visibility mode from configuration (default to 'always' - most user-friendly for new servers)
          const inventoryVisibilityMode = safariConfig.inventoryVisibilityMode || 'always';

          // Determine if inventory button should be shown based on configuration
          let showInventory = false;
          switch (inventoryVisibilityMode) {
            case 'always':
              showInventory = true;
              break;
            case 'never':
              showInventory = false;
              break;
            case 'initialized_only':
              showInventory = isInitialized;
              break;
            case 'standard':
            default:
              // Original logic: initialized AND round started (not 0)
              showInventory = isInitialized && currentRound && currentRound !== 0;
              break;
          }

          console.log(`🔍 Safari button check for ${targetMember.displayName}: initialized=${isInitialized}, hasMap=${hasMapLocation}, round=${currentRound}, mode=${inventoryVisibilityMode}, showInventory=${showInventory}`);

          // Show Safari buttons based on configuration
          if (showInventory) {
            // Get custom terms for inventory name and emoji
            const customTerms = await getCustomTerms(guildId);
            
            // Create inventory button with custom inventory emoji
            const inventoryButton = new ButtonBuilder()
              .setCustomId('safari_player_inventory')
              .setLabel(customTerms.inventoryName)
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(customTerms.inventoryEmoji || '🧰'); // Use custom inventory emoji
            
            // Create inventory row components
            const inventoryComponents = [];
            
            // Only create map-specific buttons if player has a map location
            if (hasMapLocation) {
              const navigateButton = new ButtonBuilder()
                .setCustomId(`safari_navigate_${userId}_${playerMapData.currentLocation}`)
                .setLabel('Navigate')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🗺️');
              
              // Create Location Actions button
              // Use channelId parameter passed from the interaction context
              const currentCoordinate = channelId ? await getCoordinateFromChannelId(guildId, channelId) : null;
              
              // Add suffix for prod menu to control ephemeral behavior
              const prodSuffix = title === 'CastBot | My Profile' ? '_prod' : '';
              const locationActionsButton = new ButtonBuilder()
                .setCustomId(currentCoordinate ? `map_location_display_${currentCoordinate}${prodSuffix}` : 'map_location_display_none')
                .setLabel('Location')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚓')
                .setDisabled(!currentCoordinate); // Disabled if not in a map channel
              
              // For production menu (My Profile), replace Navigate with Location Actions
              if (title === 'CastBot | My Profile') {
                // Only add Location Actions button for production menu
                if (currentCoordinate) {
                  inventoryComponents.push(locationActionsButton);
                }
              } else {
                // Regular player menu: add Navigate button and Location Actions if in a map channel
                inventoryComponents.push(navigateButton);
                if (currentCoordinate) {
                  inventoryComponents.push(locationActionsButton);
                }
              }
            }

            // Add global command button if enabled (for player-facing menus only)
            try {
              const { loadSafariContent } = await import('./safariManager.js');
              const safariData = await loadSafariContent();
              const safariConfig = safariData[guildId]?.safariConfig || {};

              // Check if global commands are enabled (default to true for backward compatibility)
              const enableGlobalCommands = safariConfig.enableGlobalCommands !== false;

              if (enableGlobalCommands) {
                // Add global command button for both Regular Player Menu and Player Profile Preview
                // These are the only player-facing menus that should show this button
                const globalCommandButton = new ButtonBuilder()
                  .setCustomId('player_enter_command_global')
                  .setLabel('Enter Command')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('🕹️');

                inventoryComponents.push(globalCommandButton);
              }
            } catch (error) {
              console.error('Error checking global commands configuration:', error);
              // Don't add the button if there's an error loading config
            }

            // Always add inventory button for initialized players
            inventoryComponents.push(inventoryButton);
            
            inventoryRow = {
              type: 1, // ActionRow
              components: inventoryComponents
            };
          }
        } catch (error) {
          console.error('Error checking Safari eligibility:', error);
          // Don't show inventory button if there's an error
        }
      }
    }
    
    // Add "Move on to main questions" button if in application context
    let applicationContinueRow = null;
    if (isApplicationContext) {
      applicationContinueRow = {
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            custom_id: `app_continue_${guildId}_${userId}`, // Include guildId and userId to retrieve config
            label: 'Move on to the main questions',
            style: 1, // Primary (blue)
            emoji: { name: '❔' }
          }
        ]
      };
    }
    
    // Build final component array
    const finalComponents = [container];
    
    // Add application continue button if in application context (before other buttons)
    if (applicationContinueRow) {
      finalComponents.push(applicationContinueRow);
    }
    
    // Add castlist, global stores, and inventory buttons if not hidden
    if (!hideBottomButtons) {
      finalComponents.push(...castlistRows);
      finalComponents.push(...globalStoreRows); // Add global store buttons
      if (inventoryRow) {
        finalComponents.push(inventoryRow);
      }
    }
    
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2 only - ephemeral handled by caller
      components: finalComponents
    };
  }
}

/**
 * Creates the age input modal
 * @param {string} userId - Target user ID
 * @param {string} mode - PlayerManagementMode
 * @returns {Object} Modal object
 */
export function createAgeModal(userId, mode) {
  const modalId = mode === PlayerManagementMode.ADMIN ? 
    `admin_age_modal_${userId}` : 
    'player_age_modal';

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle('Set Player Age');

  const ageInput = new TextInputBuilder()
    .setCustomId('age')
    .setLabel('Enter your age')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setPlaceholder('e.g. 25');

  const row = new ActionRowBuilder().addComponents(ageInput);
  modal.addComponents(row);

  return modal;
}

/**
 * Handles player button clicks
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {string} customId - Button custom ID
 * @param {Object} playerData - Guild player data
 * @param {Object} client - Discord client (optional, for fetching guild)
 * @returns {Promise<void>}
 */
export async function handlePlayerButtonClick(req, res, customId, playerData, client = null) {
  const guildId = req.body.guild_id;
  const userId = req.body.member.user.id;
  
  // Parse the custom ID to extract mode, button type, and target user
  let mode, buttonType, targetUserId;
  
  if (customId.startsWith('player_set_')) {
    mode = PlayerManagementMode.PLAYER;
    targetUserId = userId;
    buttonType = customId.replace('player_set_', '');
  } else if (customId.startsWith('admin_set_')) {
    mode = PlayerManagementMode.ADMIN;
    const parts = customId.split('_');
    buttonType = parts[2]; // pronouns, timezone, or age
    targetUserId = parts[3] || userId;
  } else if (customId.startsWith('admin_manage_vanity_')) {
    mode = PlayerManagementMode.ADMIN;
    buttonType = 'vanity';
    targetUserId = customId.replace('admin_manage_vanity_', '');
  } else {
    console.error('Unknown button pattern:', customId);
    return;
  }

  // Special handling for age button - show modal for custom age
  if (buttonType === 'age' && req.body.data?.values?.[0] === 'age_custom') {
    const modal = createAgeModal(targetUserId, mode);
    return res.send({
      type: InteractionResponseType.MODAL,
      data: modal.toJSON()
    });
  }

  // For all other buttons, rebuild the UI with the active button
  if (!client) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Error: Discord client not available",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }

  const guild = await client.guilds.fetch(guildId);
  const targetMember = await guild.members.fetch(targetUserId);

  // Check if this is an application channel context (same logic as player_menu handler)
  const channelId = req.body.channel_id;
  const isApplicationChannel = playerData[guildId]?.applications && 
    Object.values(playerData[guildId].applications).some(app => app.channelId === channelId);
  
  // Use custom title and hide bottom buttons if in application context
  const applicationTitle = 'Set your age, pronouns and timezone.';
  const defaultTitle = mode === PlayerManagementMode.ADMIN ? 
    `Player Management | ${targetMember.displayName}` : 
    'CastBot | Player Menu';
  
  const title = isApplicationChannel ? applicationTitle : defaultTitle;
  const hideBottomButtons = isApplicationChannel;
  
  console.log(`🔍 Player Button Context: Channel ${channelId}, Application Channel: ${isApplicationChannel}, Title: "${title}"`);

  // Rebuild the UI with the active button
  const updatedUI = await createPlayerManagementUI({
    mode,
    targetMember,
    playerData,
    guildId,
    userId: mode === PlayerManagementMode.PLAYER ? userId : req.body.member.user.id,
    showUserSelect: mode === PlayerManagementMode.ADMIN,
    showVanityRoles: mode === PlayerManagementMode.ADMIN,
    title: title,
    activeButton: buttonType,
    hideBottomButtons: hideBottomButtons,
    isApplicationContext: isApplicationChannel,
    client
  });

  // Remove ephemeral flag for update
  if (mode === PlayerManagementMode.ADMIN) {
    updatedUI.flags = (1 << 15); // Only IS_COMPONENTS_V2
  }

  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: updatedUI
  });
}

/**
 * Handles player modal submissions
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {string} customId - Modal custom ID
 * @param {Object} playerData - Guild player data
 * @param {Object} client - Discord client
 * @returns {Promise<void>}
 */
export async function handlePlayerModalSubmit(req, res, customId, playerData, client) {
  const guildId = req.body.guild_id;
  const submitterId = req.body.member.user.id;
  
  // Extract age value
  const age = req.body.data.components[0].components[0].value;
  
  // Validate age
  const ageNum = parseInt(age);
  if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Please enter a valid age between 1 and 120.",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }

  // Determine mode and target user
  let mode, targetUserId;
  
  if (customId === 'player_age_modal') {
    mode = PlayerManagementMode.PLAYER;
    targetUserId = submitterId;
  } else if (customId.startsWith('admin_age_modal_')) {
    mode = PlayerManagementMode.ADMIN;
    targetUserId = customId.replace('admin_age_modal_', '');
  } else {
    console.error('Unknown modal pattern:', customId);
    return;
  }

  // Update player data
  await updatePlayer(guildId, targetUserId, { age: age.toString() });

  // For admin mode, rebuild the interface
  if (mode === PlayerManagementMode.ADMIN) {
    // Fetch the target member
    const guild = await client.guilds.fetch(guildId);
    const targetMember = await guild.members.fetch(targetUserId);
    
    // Reload player data
    const freshPlayerData = await loadPlayerData();
    
    // Rebuild the UI
    const updatedUI = await createPlayerManagementUI({
      mode: PlayerManagementMode.ADMIN,
      targetMember,
      playerData: freshPlayerData,
      guildId,
      showUserSelect: true,
      showVanityRoles: true
    });

    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: updatedUI
    });
  } else {
    // For player mode, just confirm
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Your age has been updated to ${age}.`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
}

/**
 * Creates a hot-swappable select menu based on the active button
 * @param {string} activeButton - Which button is active
 * @param {Object} targetMember - Target Discord member
 * @param {Object} playerData - Guild player data
 * @param {string} guildId - Guild ID
 * @param {string} mode - Player management mode
 * @param {Object} client - Discord client
 * @returns {Object|null} ActionRow with select menu or null
 */
async function createHotSwappableSelect(activeButton, targetMember, playerData, guildId, mode, client) {
  if (!activeButton || !targetMember) return null;

  const prefix = mode === PlayerManagementMode.ADMIN ? 'admin' : 'player';
  const userIdPart = mode === PlayerManagementMode.ADMIN ? `_${targetMember.id}` : '';

  switch (activeButton) {
    case 'pronouns': {
      const pronounRoleIds = await getGuildPronouns(guildId);
      if (!pronounRoleIds || pronounRoleIds.length === 0) return null;

      // Check if more than 25 pronoun roles exist
      if (pronounRoleIds.length > 25) {
        console.error(`❌ Too many pronoun roles (${pronounRoleIds.length}). Discord String Select limit is 25.`);
        return {
          type: 1, // ActionRow
          components: [{
            type: 10, // Text Display
            content: `❌ **Error:** This server has ${pronounRoleIds.length} pronoun roles, but Discord only supports 25 in a select menu.\n\n**Please notify the production team to remove some pronoun roles to fix this issue.**`
          }]
        };
      }

      // Get role objects and filter by configured pronoun roles
      const guild = await client.guilds.fetch(guildId);
      const pronounRoles = [];
      for (const roleId of pronounRoleIds) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) pronounRoles.push(role);
        } catch (error) {
          console.warn(`Could not fetch pronoun role ${roleId}:`, error.message);
        }
      }
      
      if (pronounRoles.length === 0) return null;
      
      const currentPronouns = targetMember.roles.cache
        .filter(role => pronounRoleIds.includes(role.id))
        .map(role => role.id);

      const customId = `${prefix}_integrated_pronouns${userIdPart}`;
      console.log('🔍 DEBUG: Creating pronouns select with custom_id:', customId);

      return {
        type: 1, // ActionRow
        components: [{
          type: 3, // String Select (not Role Select)
          custom_id: customId,
          placeholder: 'Select pronouns',
          min_values: 0,
          max_values: Math.min(pronounRoles.length, 3),
          options: pronounRoles.sort((a, b) => a.name.localeCompare(b.name)).map(role => ({
            label: role.name,
            value: role.id,
            emoji: { name: '💜' },
            default: currentPronouns.includes(role.id)
          }))
        }]
      };
    }

    case 'timezone': {
      // Get guild for cleanup and role fetching
      const guild = await client.guilds.fetch(guildId);
      
      // Clean up any missing roles first
      const { cleanupMissingRoles } = await import('./storage.js');
      const cleanupResult = await cleanupMissingRoles(guildId, guild);
      if (cleanupResult.cleaned > 0) {
        console.log(`🧹 CLEANUP: Cleaned up ${cleanupResult.cleaned} missing roles before creating timezone select`);
      }

      // Get timezone roles (after potential cleanup)
      const timezones = await getGuildTimezones(guildId);
      const timezoneEntries = Object.entries(timezones || {});
      if (timezoneEntries.length === 0) return null;

      // Check if more than 25 timezone roles exist (after cleanup)
      if (timezoneEntries.length > 25) {
        console.error(`❌ Too many timezone roles (${timezoneEntries.length}). Discord String Select limit is 25.`);
        return {
          type: 1, // ActionRow
          components: [{
            type: 10, // Text Display
            content: `❌ **Error:** This server has ${timezoneEntries.length} timezone roles, but Discord only supports 25 in a select menu.\n\n**Please notify the production team to remove some timezone roles to fix this issue.**`
          }]
        };
      }

      // Load DST state for enhanced descriptions
      const { loadDSTState } = await import('./storage.js');
      const dstState = await loadDSTState();

      // Get role objects and sort by UTC offset
      const timezoneRoles = [];

      for (const [roleId, data] of timezoneEntries) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) {
            timezoneRoles.push({ role, offset: data.offset, data }); // Include data for timezoneId
          }
        } catch (error) {
          console.warn(`🚨 Skipping invalid timezone role ${roleId}:`, error.message);
          // Role doesn't exist anymore - skip it
        }
      }
      
      if (timezoneRoles.length === 0) {
        console.error('❌ No valid timezone roles found!');
        return null;
      }
      
      timezoneRoles.sort((a, b) => a.offset - b.offset);
      
      const currentTimezone = targetMember.roles.cache
        .find(role => Object.keys(timezones).includes(role.id));

      const customId = `${prefix}_integrated_timezone${userIdPart}`;
      console.log('🔍 DEBUG: Creating timezone select with custom_id:', customId);

      return {
        type: 1, // ActionRow
        components: [{
          type: 3, // String Select (not Role Select)
          custom_id: customId,
          placeholder: 'Select timezone',
          min_values: 0,
          max_values: 1,
          options: timezoneRoles.map(({ role, offset, data }) => {
            // Use displayName from dstState if role has been converted to new system
            let description;
            if (data.timezoneId && dstState[data.timezoneId]) {
              description = dstState[data.timezoneId].displayName;
            } else {
              // Fallback to UTC offset for legacy roles
              description = `UTC${offset >= 0 ? '+' : ''}${offset}`;
            }

            return {
              label: role.name,
              value: role.id,
              description,
              emoji: { name: '🌍' },
              default: currentTimezone?.id === role.id
            };
          })
        }]
      };
    }

    case 'age': {
      // Create age select menu with 16-40 + Custom Age option
      const ageOptions = [];
      
      // Add ages 16-39 (24 options to stay within Discord's 25 option limit)
      for (let age = 16; age <= 39; age++) {
        ageOptions.push({
          label: age.toString(),
          value: `age_${age}`,
          description: `${age} years old`
        });
      }

      // Add Custom Age option
      ageOptions.push({
        label: 'Custom Age',
        value: 'age_custom',
        description: "Age not shown or '30s' style age",
        emoji: { name: '✏️' }
      });

      // Get current age
      const currentAge = playerData[guildId]?.players?.[targetMember.id]?.age;

      const customId = `${prefix}_integrated_age${userIdPart}`;
      console.log('🔍 DEBUG: Creating age select with custom_id:', customId);

      return {
        type: 1, // ActionRow
        components: [{
          type: 3, // String Select
          custom_id: customId,
          placeholder: currentAge ? `Current age: ${currentAge}` : 'Select age',
          min_values: 0,
          max_values: 1,
          options: ageOptions
        }]
      };
    }

    case 'vanity': {
      if (mode !== PlayerManagementMode.ADMIN) return null;

      // Get current vanity roles
      const currentVanityRoles = playerData[guildId]?.players?.[targetMember.id]?.vanityRoles || [];

      return {
        type: 1, // ActionRow
        components: [{
          type: 6, // Role Select
          custom_id: `admin_integrated_vanity_${targetMember.id}`,
          placeholder: 'Select vanity roles',
          min_values: 0,
          max_values: 25, // Discord limit
          default_values: currentVanityRoles.map(id => ({ id, type: 'role' }))
        }]
      };
    }

    case 'attributes': {
      if (mode !== PlayerManagementMode.ADMIN) return null;

      // Get guild's attribute definitions
      const attributes = await getAttributeDefinitions(guildId);
      const attrEntries = Object.entries(attributes);

      if (attrEntries.length === 0) {
        return {
          type: 1, // ActionRow
          components: [{
            type: 3, // String Select
            custom_id: `admin_integrated_attributes_${targetMember.id}`,
            placeholder: 'No attributes configured - use Tools → Attributes',
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'No attributes', value: 'none', description: 'Configure attributes in Tools menu' }]
          }]
        };
      }

      // Build attribute options
      const attrOptions = attrEntries.slice(0, 25).map(([id, attr]) => {
        const isResource = attr.category === 'resource';
        return {
          label: attr.name,
          value: id,
          description: `${isResource ? 'Resource' : 'Stat'} - Click to modify`,
          emoji: { name: attr.emoji || '📊' }
        };
      });

      return {
        type: 1, // ActionRow
        components: [{
          type: 3, // String Select
          custom_id: `admin_integrated_attributes_${targetMember.id}`,
          placeholder: 'Select attribute to modify',
          min_values: 1,
          max_values: 1,
          options: attrOptions
        }]
      };
    }

    default:
      return null;
  }
}

export {
  createHotSwappableSelect
};