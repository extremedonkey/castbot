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
import { hasStoresInGuild, getEligiblePlayersFixed, getCustomTerms } from './safariManager.js';

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
      const offset = timezones[timezoneRole.id].offset;
      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      const targetTime = new Date(utcTime + (offset * 3600000));
      formattedTime = targetTime.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
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
  const { allCastlists, castlistTribes } = extractCastlistData(playerData, guildId);

  // Create Menu button row
  const menuRow = {
    type: 1, // ActionRow
    components: []
  };

  // Add Menu button (far left)
  if (mode === PlayerManagementMode.ADMIN) {
    menuRow.components.push(new ButtonBuilder()
      .setCustomId('prod_menu_back')
      .setLabel('⬅️ Menu')
      .setStyle(ButtonStyle.Secondary));
  }

  // Only add menu row if it has buttons (admin mode)
  if (menuRow.components.length > 0) {
    container.components.push(menuRow);
  }

  if (mode === PlayerManagementMode.ADMIN) {
    // Admin mode (Player Management): No castlist buttons - focus on player management only
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2 only - ephemeral handled by caller
      components: [container]
    };
  } else {
    // Player mode (Player Menu): Add castlist buttons outside the container (unless hidden)
    let castlistRows = [];
    let inventoryRow = null;
    
    if (!hideBottomButtons) {
      if (allCastlists && allCastlists.size > 0) {
        // Player mode: don't include the "+" button (includeAddButton = false)
        castlistRows = createCastlistRows(allCastlists, castlistTribes, false, hasStores);
      } else {
        // Fallback: single default castlist button if no castlist data found
        castlistRows = [{
          type: 1, // ActionRow
          components: [new ButtonBuilder()
            .setCustomId('show_castlist2_default')
            .setLabel('📋 Castlist')
            .setStyle(ButtonStyle.Primary)]
        }];
      }
      
      // Check if user is eligible for Safari inventory access
      if (targetMember && client) {
        try {
          // Fast eligibility check - only check current user, avoid expensive getEligiblePlayersFixed
          const { loadPlayerData } = await import('./storage.js');
          const playerData = await loadPlayerData();
          const userData = playerData[guildId]?.players?.[targetMember.id];
          const safari = userData?.safari || {};
          const currency = safari.currency || 0;
          const inventory = safari.inventory || {};
          const { getItemQuantity } = await import('./safariManager.js');
          const hasInventory = Object.keys(inventory).length > 0 && Object.values(inventory).some(item => getItemQuantity(item) > 0);
          const isEligiblePlayer = (currency >= 1 || hasInventory);
          
          if (isEligiblePlayer) {
            // Get custom terms for inventory name and emoji
            const customTerms = await getCustomTerms(guildId);
            
            // Create inventory button with custom inventory emoji
            const inventoryButton = new ButtonBuilder()
              .setCustomId('safari_player_inventory')
              .setLabel(customTerms.inventoryName)
              .setStyle(ButtonStyle.Primary)
              .setEmoji(customTerms.inventoryEmoji || '📦'); // Use custom inventory emoji
            
            // Create Navigate button (check if player is initialized on map)
            const { loadSafariContent, getCoordinateFromChannelId } = await import('./safariManager.js');
            const safariData = await loadSafariContent();
            const activeMapId = safariData[guildId]?.maps?.active;
            const playerMapData = playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId];
            
            const navigateButton = new ButtonBuilder()
              .setCustomId(`safari_navigate_${userId}_${playerMapData?.currentLocation || 'none'}`)
              .setLabel('Navigate')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🗺️')
              .setDisabled(!playerMapData); // Disabled if not initialized
            
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
            
            // Create inventory row with Navigate, inventory, Location Actions, then store buttons
            const inventoryComponents = [];
            
            // For production menu (My Profile), replace Navigate with Location Actions
            if (title === 'CastBot | My Profile') {
              // Only add Location Actions button for production menu
              if (currentCoordinate) {
                inventoryComponents.push(locationActionsButton);
              }
            } else {
              // Regular player menu: add Navigate button
              inventoryComponents.push(navigateButton);
              
              // Add Location Actions button if we're in a map location
              if (currentCoordinate) {
                inventoryComponents.push(locationActionsButton);
              }
            }
            
            // Always add inventory button
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
    
    // Add castlist and inventory buttons if not hidden
    if (!hideBottomButtons) {
      finalComponents.push(...castlistRows);
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

      // Get role objects and sort by UTC offset
      const timezoneRoles = [];
      
      for (const [roleId, data] of timezoneEntries) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) {
            timezoneRoles.push({ role, offset: data.offset });
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
          options: timezoneRoles.map(({ role, offset }) => ({
            label: role.name,
            value: role.id,
            description: `UTC${offset >= 0 ? '+' : ''}${offset}`,
            emoji: { name: '🌍' },
            default: currentTimezone?.id === role.id
          }))
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

    default:
      return null;
  }
}

export {
  createHotSwappableSelect
};