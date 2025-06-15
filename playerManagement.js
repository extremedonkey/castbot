import { 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionResponseType,
  InteractionResponseFlags
} from 'discord.js';
import { createPlayerCard } from './castlistV2.js';
import { getPlayer, updatePlayer, getGuildPronouns, getGuildTimezones, loadPlayerData } from './storage.js';

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
 * @returns {Object} ActionRow with buttons
 */
export function createManagementButtons(targetUserId, mode, enabled = true) {
  const prefix = mode === PlayerManagementMode.ADMIN ? 'admin' : 'player';
  const suffix = mode === PlayerManagementMode.ADMIN && !enabled ? '_pending' : '';
  const userIdPart = mode === PlayerManagementMode.ADMIN && enabled ? `_${targetUserId}` : '';
  
  return {
    type: 1, // ActionRow
    components: [
      {
        type: 2, // Button
        style: ButtonStyle.Secondary,
        label: 'Pronouns',
        custom_id: `${prefix}_set_pronouns${suffix}${userIdPart}`,
        emoji: { name: '💜' },
        disabled: !enabled
      },
      {
        type: 2, // Button
        style: ButtonStyle.Secondary,
        label: 'Timezone',
        custom_id: `${prefix}_set_timezone${suffix}${userIdPart}`,
        emoji: { name: '🌍' },
        disabled: !enabled
      },
      {
        type: 2, // Button
        style: ButtonStyle.Secondary,
        label: 'Age',
        custom_id: `${prefix}_set_age${suffix}${userIdPart}`,
        emoji: { name: '🎂' },
        disabled: !enabled
      }
    ]
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
    bottomLeftButton = mode === PlayerManagementMode.ADMIN ? 
      { label: '🔄 Refresh', customId: 'refresh_player_display', style: ButtonStyle.Primary } :
      { label: '📋 Show Castlist', customId: 'show_castlist2_default', style: ButtonStyle.Primary }
  } = options;

  // Create container
  const container = {
    type: 17, // Container
    accent_color: 0x9B59B6, // Purple accent
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

    // Add management buttons (enabled if we have a member)
    const managementButtons = createManagementButtons(
      targetMember.id, 
      mode, 
      true // Enabled since we have a member
    );
    container.components.push(managementButtons);

    // Add integrated select menus for admin mode
    if (mode === PlayerManagementMode.ADMIN) {
      // Pronouns select
      const pronounRoleIds = await getGuildPronouns(guildId);
      if (pronounRoleIds && pronounRoleIds.length > 0) {
        const currentPronouns = targetMember.roles.cache
          .filter(role => pronounRoleIds.includes(role.id))
          .map(role => role.id);

        container.components.push({
          type: 1, // ActionRow
          components: [{
            type: 6, // Role Select
            custom_id: `admin_integrated_pronouns_${targetMember.id}`,
            placeholder: 'Select pronouns to assign',
            min_values: 0,
            max_values: pronounRoleIds.length,
            default_values: currentPronouns.map(id => ({ id, type: 'role' }))
          }]
        });
      }

      // Timezone select
      const timezones = await getGuildTimezones(guildId);
      const timezoneRoleIds = Object.keys(timezones);
      if (timezoneRoleIds.length > 0) {
        const currentTimezone = targetMember.roles.cache
          .find(role => timezoneRoleIds.includes(role.id));

        container.components.push({
          type: 1, // ActionRow
          components: [{
            type: 6, // Role Select
            custom_id: `admin_integrated_timezone_${targetMember.id}`,
            placeholder: 'Select timezone to assign',
            min_values: 0,
            max_values: 1,
            default_values: currentTimezone ? [{ id: currentTimezone.id, type: 'role' }] : []
          }]
        });
      }
    }
  } else if (mode === PlayerManagementMode.ADMIN) {
    // No member selected - show disabled buttons
    container.components.push({
      type: 14 // Separator
    });

    const disabledButtons = createManagementButtons(null, mode, false);
    container.components.push(disabledButtons);
  }

  // Create bottom action row
  const bottomRow = {
    type: 1, // ActionRow
    components: []
  };

  // Add bottom left button
  bottomRow.components.push(new ButtonBuilder()
    .setCustomId(bottomLeftButton.customId)
    .setLabel(bottomLeftButton.label)
    .setStyle(bottomLeftButton.style));

  // Add vanity roles button for admin mode
  if (showVanityRoles && targetMember) {
    bottomRow.components.push(new ButtonBuilder()
      .setCustomId(`admin_manage_vanity_${targetMember.id}`)
      .setLabel('🎭 Vanity Roles')
      .setStyle(ButtonStyle.Secondary));
  }

  // Add close button
  bottomRow.components.push(new ButtonBuilder()
    .setCustomId('close_interaction')
    .setLabel('❌ Close')
    .setStyle(ButtonStyle.Danger));

  container.components.push(bottomRow);

  return {
    flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 | EPHEMERAL
    components: [container]
  };
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
  } else {
    console.error('Unknown button pattern:', customId);
    return;
  }

  switch (buttonType) {
    case 'pronouns': {
      const pronounRoleIds = await getGuildPronouns(guildId);
      if (!pronounRoleIds || pronounRoleIds.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "No pronoun roles have been set up by server administrators.",
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }

      // Create role select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(mode === PlayerManagementMode.ADMIN ? 
          `admin_select_pronouns_${targetUserId}` : 
          'player_select_pronouns')
        .setPlaceholder('Select your pronouns')
        .setMinValues(0)
        .setMaxValues(pronounRoleIds.length);

      // Fetch role names from interaction data if client not available
      if (client) {
        const guild = await client.guilds.fetch(guildId);
        for (const roleId of pronounRoleIds) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            selectMenu.addOptions({
              label: role.name,
              value: roleId
            });
          }
        }
      } else {
        // Fallback: use role IDs as labels (not ideal but functional)
        for (const roleId of pronounRoleIds) {
          selectMenu.addOptions({
            label: `Role ${roleId}`,
            value: roleId
          });
        }
      }

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Select your pronouns from the dropdown below:",
          components: [row],
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    case 'timezone': {
      const timezones = await getGuildTimezones(guildId);
      const timezoneRoleIds = Object.keys(timezones);
      
      if (timezoneRoleIds.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "No timezone roles have been set up by server administrators.",
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }

      // Create role select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(mode === PlayerManagementMode.ADMIN ? 
          `admin_select_timezone_${targetUserId}` : 
          'player_select_timezone')
        .setPlaceholder('Select your timezone')
        .setMinValues(0)
        .setMaxValues(1);

      // Fetch role names from interaction data if client not available
      if (client) {
        const guild = await client.guilds.fetch(guildId);
        for (const roleId of timezoneRoleIds) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            selectMenu.addOptions({
              label: role.name,
              value: roleId
            });
          }
        }
      } else {
        // Fallback: use role IDs as labels (not ideal but functional)
        for (const roleId of timezoneRoleIds) {
          selectMenu.addOptions({
            label: `Timezone ${roleId}`,
            value: roleId
          });
        }
      }

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Select your timezone from the dropdown below:",
          components: [row],
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    case 'age': {
      const modal = createAgeModal(targetUserId, mode);
      
      return res.send({
        type: InteractionResponseType.MODAL,
        data: modal.toJSON()
      });
    }

    default:
      console.error('Unknown button type:', buttonType);
  }
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