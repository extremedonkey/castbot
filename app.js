import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  SnowflakeUtil, 
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ComponentType,
  ChannelType
} from 'discord.js';
import { capitalize, DiscordRequest } from './utils.js';  // Add DiscordRequest to imports
import { 
  loadPlayerData, 
  updatePlayer, 
  getPlayer, 
  saveAllPlayerData,
  getGuildTribes,
  updateGuildTribes,
  savePlayerData,    // Add this import
  getGuildPronouns,  // Add this import
  updateGuildPronouns, // Add this import
  getGuildTimezones, // Add this import
  getTimezoneOffset, // Add this import
  loadEnvironmentConfig,
  updateLiveLoggingStatus
} from './storage.js';
import {
  createApplicationButtonModal,
  handleApplicationButtonModalSubmit,
  createApplicationChannel,
  getApplicationConfig,
  saveApplicationConfig,
  createApplicationButton,
  BUTTON_STYLES
} from './applicationManager.js';
import { logInteraction, setDiscordClient } from './analyticsLogger.js';
import {
  calculateComponentsForTribe,
  determineDisplayScenario,
  calculateTribePages,
  createNavigationState,
  reorderTribes,
  createTribeSection,
  createNavigationButtons,
  processMemberData,
  createCastlistV2Layout,
  createPlayerCard,
  extractCastlistData,
  createCastlistRows
} from './castlistV2.js';
import {
  PlayerManagementMode,
  PlayerButtonType,
  createPlayerManagementUI,
  createPlayerDisplaySection,
  createManagementButtons,
  createAgeModal,
  handlePlayerButtonClick,
  handlePlayerModalSubmit
} from './playerManagement.js';
import {
  executeSetup,
  generateSetupResponse,
  checkRoleHierarchy,
  REACTION_EMOJIS,
  createTimezoneReactionMessage,
  createPronounReactionMessage,
  canBotManageRole,
  canBotManageRoles,
  generateHierarchyWarning,
  testRoleHierarchy
} from './roleManager.js';
import { 
  createPlayerInventoryDisplay,
  createRoundResultsV2 
} from './safariManager.js';
import { createEntityManagementUI } from './entityManagementUI.js';
import { 
  loadEntity, 
  updateEntityFields, 
  deleteEntity,
  searchEntities 
} from './entityManager.js';
import { 
  createFieldGroupModal, 
  parseModalSubmission, 
  validateFields,
  createConsumableSelect 
} from './fieldEditors.js';
// Helper function imports (Phase 1A refactoring)
import {
  createEmojiForUser,
  parseEmojiCode,
  sanitizeEmojiName,
  checkRoleHasEmojis,
  clearEmojisForRole
} from './utils/emojiUtils.js';
import {
  calculateCastlistFields,
  createMemberFields,
  determineCastlistToShow,
  shouldOmitSpacers
} from './utils/castlistUtils.js';
import {
  checkRoleHierarchyPermission,
  handleSetupTycoons
} from './utils/roleUtils.js';
import {
  requirePermission,
  requireAdminPermission,
  requireSpecificUser,
  hasPermission,
  PERMISSIONS
} from './utils/permissionUtils.js';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Helper function to get all applications from stored playerData
 * @param {string} guildId - Discord guild ID
 * @returns {Array} Array of application objects
 */
async function getAllApplicationsFromData(guildId) {
  const playerData = await loadPlayerData();
  const guildApplications = playerData[guildId]?.applications || {};
  return Object.values(guildApplications);
}

/**
 * Check if user has admin permissions (any of: Manage Channels, Manage Guild, Manage Roles, Administrator)
 * @param {Object} member - Discord member object from interaction
 * @returns {boolean} True if user has admin permissions
 */
function hasAdminPermissions(member) {
  if (!member || !member.permissions) return false;
  
  // Convert permissions string to BigInt for comparison
  const permissions = BigInt(member.permissions);
  const adminPermissions = 
    PermissionFlagsBits.ManageChannels | 
    PermissionFlagsBits.ManageGuild | 
    PermissionFlagsBits.ManageRoles | 
    PermissionFlagsBits.Administrator;
  
  return (permissions & BigInt(adminPermissions)) !== 0n;
}

/**
 * Check if user has a specific permission in a specific channel
 * @param {Object} member - Discord member object from interaction  
 * @param {string} channelId - Discord channel ID
 * @param {bigint} permission - Discord permission flag (e.g., PermissionFlagsBits.SendMessages)
 * @param {Object} client - Discord.js client instance
 * @returns {Promise<boolean>} True if user has the permission in that channel
 */
async function hasChannelPermission(member, channelId, permission, client) {
  try {
    if (!member || !member.user || !channelId || !client) return false;
    
    // Fetch the channel and guild member to get accurate permissions
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.guild) return false;
    
    const guildMember = await channel.guild.members.fetch(member.user.id);
    if (!guildMember) return false;
    
    // Get computed permissions for this member in this specific channel
    const memberPermissions = guildMember.permissionsIn(channel);
    
    return memberPermissions.has(permission);
  } catch (error) {
    console.error('Error checking channel permission:', error);
    return false; // Fail-safe: deny permission if we can't check
  }
}

/**
 * Check if user can send messages in a specific channel
 * @param {Object} member - Discord member object from interaction
 * @param {string} channelId - Discord channel ID  
 * @param {Object} client - Discord.js client instance
 * @returns {Promise<boolean>} True if user can send messages in that channel
 */
async function canSendMessagesInChannel(member, channelId, client) {
  return await hasChannelPermission(member, channelId, PermissionFlagsBits.SendMessages, client);
}

/**
 * PERMISSION SYSTEM ARCHITECTURE DOCUMENTATION
 * ============================================
 * 
 * This codebase implements a comprehensive, reusable permission checking system to prevent
 * channel spam and ensure proper Discord permission enforcement.
 * 
 * ## Core Functions:
 * 
 * 1. **hasAdminPermissions(member)** - Guild-level admin permission check
 *    - Checks: Manage Channels, Manage Guild, Manage Roles, Administrator
 *    - Usage: Production features, admin-only functionality
 * 
 * 2. **hasChannelPermission(member, channelId, permission, client)** - Channel-specific permission check
 *    - Uses Discord.js permissionsIn() for accurate channel-level permissions
 *    - Handles channel overwrites, role-based permissions, etc.
 *    - Reusable for any Discord permission flag
 * 
 * 3. **canSendMessagesInChannel(member, channelId, client)** - Specific helper for SEND_MESSAGES
 *    - Built on hasChannelPermission() for consistency
 *    - Primary function for anti-spam enforcement
 * 
 * ## Anti-Spam Implementation:
 * 
 * **Castlist Permission Logic:**
 * - IF user has SEND_MESSAGES permission in channel → Public castlist display
 * - ELSE user lacks SEND_MESSAGES permission → Ephemeral castlist (only visible to user)
 * 
 * **Handlers with Permission Checking:**
 * - show_castlist2_* (main castlist display)
 * - castlist2_nav_* (navigation between tribes/pages)
 * - castlist2_tribe_prev_*, castlist2_tribe_next_* (legacy tribe navigation)
 * - castlist2_prev_*, castlist2_next_* (legacy page navigation)
 * 
 * ## Implementation Pattern:
 * 
 * ```javascript
 * // Check permissions and apply ephemeral flag if needed
 * if (member && channelId) {
 *   const canSendMessages = await canSendMessagesInChannel(member, channelId, client);
 *   if (!canSendMessages) {
 *     responseData.flags = (responseData.flags || 0) | InteractionResponseFlags.EPHEMERAL;
 *   }
 * }
 * ```
 * 
 * ## Error Handling:
 * - Fail-safe: If permission check fails, deny permission (return false)
 * - Prevents security bypasses due to API errors
 * - Comprehensive error logging for troubleshooting
 * 
 * ## Future Extensibility:
 * - hasChannelPermission() supports any Discord permission flag
 * - Pattern easily adaptable to other features requiring channel permission checks
 * - Consistent architecture across admin vs channel-specific permissions
 */

// createPlayerDisplaySection has been moved to playerManagement.js module

/**
 * Create reusable CastBot menu components
 * @param {Object} playerData - Guild player data
 * @param {string} guildId - Discord guild ID
 * @param {boolean} isEphemeral - Whether menu should be ephemeral (user-only)
 * @returns {Object} Menu content and components
 */
/**
 * Create production menu interface with Components V2 structure
 * @param {Object} guild - Discord guild object
 * @param {Object} playerData - Guild player data
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - User ID for special features (optional)
 * @returns {Object} Production menu response object
 */
async function createProductionMenuInterface(guild, playerData, guildId, userId = null) {
  // Extract castlist data using reusable function
  const { allCastlists, castlistTribes } = extractCastlistData(playerData, guildId);

  // Create castlist rows with pagination support (include admin + button)
  const castlistRows = createCastlistRows(allCastlists, castlistTribes, true, false);
  
  // Debug logging for castlist pagination
  console.log(`Created ${castlistRows.length} castlist row(s) for ${allCastlists.size} castlist(s)`);
  if (castlistRows.length > 1) {
    console.log('Pagination active: castlists split across multiple rows to prevent Discord ActionRow limit');
  }
  
  // Check if pronouns/timezones exist for conditional buttons
  const hasPronouns = playerData[guildId]?.pronounRoleIDs?.length > 0;
  const hasTimezones = playerData[guildId]?.timezones && Object.keys(playerData[guildId].timezones).length > 0;
  const hasRoles = hasPronouns || hasTimezones;
  
  // Create admin control buttons (reorganized)
  const adminButtons = [
    new ButtonBuilder()
      .setCustomId('prod_setup')
      .setLabel('Initial Setup')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🪛'),
    new ButtonBuilder()
      .setCustomId('admin_manage_player')
      .setLabel('Players')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🧑‍🤝‍🧑'),
    new ButtonBuilder()
      .setCustomId('prod_manage_tribes')
      .setLabel('Tribes')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔥'),
    new ButtonBuilder()
      .setCustomId('prod_manage_pronouns_timezones')
      .setLabel('Pronouns & Timezones')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💜')
  ];
  
  // Live Analytics button moved to Reece Stuff submenu
  
  const adminRow = new ActionRowBuilder().addComponents(adminButtons);
  
  // Add new administrative action row (misc features)
  const adminActionButtons = [
    new ButtonBuilder()
      .setCustomId('prod_season_applications')
      .setLabel('Season Applications')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId('prod_safari_menu')
      .setLabel('Safari')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🦁')
  ];
  
  // Add special buttons only for specific user (Reece)
  if (userId === '391415444084490240') {
    adminActionButtons.push(
      new ButtonBuilder()
        .setCustomId('reece_stuff_menu')
        .setLabel('Analytics')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🧮')
    );
  }
  
  // Add Player Profile button after Reece Stuff
  adminActionButtons.push(
    new ButtonBuilder()
      .setCustomId('prod_player_menu')
      .setLabel('🪪 Player Profile')
      .setStyle(ButtonStyle.Secondary)
  );
  
  // Add Need Help button at the end
  adminActionButtons.push(
    new ButtonBuilder()
      .setLabel('Need Help?')
      .setStyle(ButtonStyle.Link)
      .setEmoji('❓')
      .setURL('https://discord.gg/H7MpJEjkwT')
  );
  
  const adminActionRow = new ActionRowBuilder().addComponents(adminActionButtons);
  
  /**
   * Validate container component limits to prevent Discord API errors
   * @param {Array} components - Array of components to validate
   * @returns {boolean} True if within limits, false otherwise
   */
  function validateContainerLimits(components) {
    const maxComponents = 25; // Discord's container component limit
    
    if (components.length > maxComponents) {
      console.error(`Container exceeds component limit: ${components.length}/${maxComponents}`);
      return false;
    }
    
    return true;
  }
  
  // Build container components array with pagination support
  const containerComponents = [
    {
      type: 10, // Text Display component
      content: `## CastBot | Production Menu`
    },
    {
      type: 14 // Separator after title
    },
    {
      type: 10, // Text Display component
      content: `> **\`📍 Post Castlists\`**`
    },
    ...castlistRows, // Multiple castlist rows with pagination
    {
      type: 14 // Separator after castlist rows
    },
    {
      type: 10, // Text Display component
      content: `> **\`✏️ Manage\`**`
    },
    adminRow.toJSON(), // Admin management buttons
    {
      type: 14 // Separator after admin management row
    },
    {
      type: 10, // Text Display component
      content: `> **\`💎 Advanced Features\`**`
    },
    adminActionRow.toJSON(), // New administrative action buttons
    {
      type: 14 // Separator before credit
    },
    {
      type: 10, // Text Display component
      content: `-# Made by Reece (@extremedonkey)`
    }
  ];
  
  // Validate component limits before creating container
  if (!validateContainerLimits(containerComponents)) {
    throw new Error('Container component limit exceeded - too many castlists or buttons');
  }
  
  // Create Components V2 Container for entire production menu
  const prodMenuContainer = {
    type: 17, // Container component
    accent_color: 0x3498DB, // Blue accent color
    components: containerComponents
  };
  
  return {
    flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 flag + EPHEMERAL flag
    components: [prodMenuContainer]
  };
}

/**
 * Create Reece Stuff submenu interface (admin-only special features)
 */
async function createReeceStuffMenu() {
  // Create analytics action buttons (split into rows due to 5-button limit)
  const analyticsButtonsRow1 = [
    new ButtonBuilder()
      .setCustomId('prod_analytics_dump')
      .setLabel('Server List')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🧵'),
    new ButtonBuilder()
      .setCustomId('prod_live_analytics')
      .setLabel('Print Logs')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🪵'),
    new ButtonBuilder()
      .setCustomId('prod_server_usage_stats')
      .setLabel('Server Stats')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('📈')
  ];

  const analyticsButtonsRow2 = [
    new ButtonBuilder()
      .setCustomId('prod_toggle_live_analytics')
      .setLabel('Toggle Channel Logs')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔃'),
    new ButtonBuilder()
      .setCustomId('test_role_hierarchy')
      .setLabel('Test Role Hierarchy')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔧')
  ];
  
  const analyticsRow1 = new ActionRowBuilder().addComponents(analyticsButtonsRow1);
  const analyticsRow2 = new ActionRowBuilder().addComponents(analyticsButtonsRow2);
  
  // Create back button
  const backButton = [
    new ButtonBuilder()
      .setCustomId('prod_menu_back')
      .setLabel('⬅ Menu')
      .setStyle(ButtonStyle.Secondary)
  ];
  
  const backRow = new ActionRowBuilder().addComponents(backButton);
  
  // Build container components
  const containerComponents = [
    {
      type: 10, // Text Display component
      content: `## CastBot Analytics`
    },
    analyticsRow1.toJSON(), // Analytics buttons row 1
    analyticsRow2.toJSON(), // Analytics buttons row 2
    {
      type: 14 // Separator
    },
    backRow.toJSON() // Back navigation
  ];
  
  // Create Components V2 Container
  const reeceMenuContainer = {
    type: 17, // Container component
    accent_color: 0xe74c3c, // Red accent color to match danger style
    components: containerComponents
  };
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2 flag
    components: [reeceMenuContainer]
  };
}

/**
 * Create Safari submenu interface for dynamic content management
 */
async function createSafariMenu(guildId, userId, member) {
  // Get the inventory name and current round for this guild
  let inventoryName = 'Nest'; // Default
  let inventoryEmoji = '🥚'; // Default emoji
  let currentRound = 1; // Default round
  
  try {
    const { loadSafariContent } = await import('./safariManager.js');
    const safariContent = await loadSafariContent();
    const guildConfig = safariContent[guildId]?.safariConfig;
    if (guildConfig?.inventoryName) {
      inventoryName = guildConfig.inventoryName;
      // Extract emoji if present in the inventory name
      const emojiMatch = inventoryName.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/u);
      if (emojiMatch) {
        inventoryEmoji = emojiMatch[0];
        inventoryName = inventoryName.replace(emojiMatch[0], '').trim();
      }
    }
    // Get current round for dynamic button label
    if (guildConfig?.currentRound) {
      currentRound = guildConfig.currentRound;
    }
  } catch (error) {
    console.error('Error loading safari config:', error);
  }
  
  // Use custom inventory name for everyone
  const inventoryLabel = `My ${inventoryName}`;
  
  // Create dynamic round results button label
  let roundResultsLabel;
  if (currentRound >= 1 && currentRound <= 3) {
    roundResultsLabel = `Round ${currentRound} Results`;
  } else if (currentRound === 4) {
    roundResultsLabel = 'Reset Game';
  } else {
    roundResultsLabel = 'Round Results'; // Fallback
  }
  
  // Create safari management buttons - Row 1: Core Functions
  const safariButtonsRow1 = [
    new ButtonBuilder()
      .setCustomId('safari_manage_safari_buttons')
      .setLabel('Manage Safari Buttons')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📌'),
    new ButtonBuilder()
      .setCustomId('safari_player_inventory')
      .setLabel(inventoryLabel)
      .setStyle(ButtonStyle.Success)
      .setEmoji(inventoryEmoji),
    new ButtonBuilder()
      .setCustomId('safari_manage_currency')
      .setLabel('Manage Currency')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💰'),
    new ButtonBuilder()
      .setCustomId('safari_view_player_inventory')
      .setLabel('Player Inventory')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👀'),
    new ButtonBuilder()
      .setCustomId('safari_round_results')
      .setLabel(roundResultsLabel)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏅')
  ];
  
  // Row 2: Admin & Management Functions
  const safariButtonsRow2 = [
    new ButtonBuilder()
      .setCustomId('safari_manage_stores')
      .setLabel('Manage Stores')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏪'),
    new ButtonBuilder()
      .setCustomId('safari_manage_items')
      .setLabel('Manage Items')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📦'),
    new ButtonBuilder()
      .setCustomId('safari_customize_terms')
      .setLabel('Customize Safari')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⚙️'),
    new ButtonBuilder()
      .setCustomId('safari_round_results_v2')
      .setLabel('Round Results V2')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎨')
  ];
  
  const safariRow1 = new ActionRowBuilder().addComponents(safariButtonsRow1);
  const safariRow2 = new ActionRowBuilder().addComponents(safariButtonsRow2);
  
  // Create back button
  const backButton = [
    new ButtonBuilder()
      .setCustomId('prod_menu_back')
      .setLabel('⬅ Menu')
      .setStyle(ButtonStyle.Secondary)
  ];
  
  const backRow = new ActionRowBuilder().addComponents(backButton);
  
  // Build container components
  const containerComponents = [
    {
      type: 10, // Text Display component
      content: `## 🦁 Safari - Dynamic Content Manager\n\nCreate interactive experiences with custom buttons, currency systems, stores, and chained actions.`
    },
    safariRow1.toJSON(), // Core safari buttons
    safariRow2.toJSON(), // Admin management buttons
    {
      type: 14 // Separator
    },
    backRow.toJSON() // Back navigation
  ];
  
  // Create Components V2 Container
  const safariMenuContainer = {
    type: 17, // Container component
    accent_color: 0xf39c12, // Orange accent color for safari theme
    components: containerComponents
  };
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2 flag
    components: [safariMenuContainer]
  };
}

// Viral growth buttons are now integrated into navigation buttons in castlistV2.js

// REACTION_EMOJIS moved to roleManager.js as REACTION_EMOJIS
// Using Discord's conservative 20-reaction limit for maximum compatibility

/**
 * Send castlist2 response with dynamic component optimization
 * @param {Object} req - Request object with Discord interaction data
 * @param {Object} guild - Discord guild object
 * @param {Array} tribes - Array of tribe data with members
 * @param {string} castlistName - Name of the castlist
 * @param {Object} navigationState - Current navigation state
 * @param {Object} member - Discord member object for permission checking (optional)
 * @param {string} channelId - Channel ID for permission checking (optional)
 */
async function sendCastlist2Response(req, guild, tribes, castlistName, navigationState, member = null, channelId = null) {
  const { currentTribeIndex, currentTribePage, scenario } = navigationState;
  const currentTribe = tribes[currentTribeIndex];
  
  // Get guild data for processing
  const pronounRoleIds = await getGuildPronouns(guild.id);
  const timezones = await getGuildTimezones(guild.id);
  
  // Calculate page info for current tribe
  let pageInfo;
  if (scenario === "multi-page" && currentTribe.memberCount > 0) {
    const paginationData = calculateTribePages(currentTribe, currentTribe.members, true);
    const currentPageMembers = paginationData.pages[currentTribePage] || [];
    
    pageInfo = {
      currentPage: currentTribePage,
      totalPages: paginationData.totalPages,
      playersOnPage: currentPageMembers
    };
  } else {
    // Single page tribe or ideal/no-separators scenario
    pageInfo = {
      currentPage: 0,
      totalPages: 1,
      playersOnPage: currentTribe.members
    };
  }
  
  // Create tribe section with current page
  let tribeSection;
  if (currentTribe.memberCount === 0) {
    // Empty tribe handling
    let accentColor = 0x7ED321;
    if (currentTribe.color) {
      if (typeof currentTribe.color === 'string' && currentTribe.color.startsWith('#')) {
        accentColor = parseInt(currentTribe.color.slice(1), 16);
      } else if (typeof currentTribe.color === 'number') {
        accentColor = currentTribe.color;
      }
    }
    
    tribeSection = {
      type: 17, // Container
      accent_color: accentColor,
      components: [
        { type: 10, content: `# ${currentTribe.emoji || ''} ${currentTribe.name} ${currentTribe.emoji || ''}`.trim() },
        { type: 14 }, // Separator
        { type: 10, content: '_No players yet_' }
      ]
    };
  } else {
    // Sort members by display name
    const sortedMembers = [...pageInfo.playersOnPage].sort((a, b) => 
      a.displayName.localeCompare(b.displayName)
    );
    
    pageInfo.playersOnPage = sortedMembers;
    
    tribeSection = await createTribeSection(
      currentTribe,
      currentTribe.members, // Full member list for context
      guild,
      pronounRoleIds,
      timezones,
      pageInfo,
      scenario,
      castlistName
    );
  }
  
  // Create navigation buttons (now includes viral growth buttons)
  const navigationRow = createNavigationButtons(navigationState, castlistName);
  
  // Create complete layout
  const responseData = createCastlistV2Layout(
    [tribeSection],
    castlistName,
    guild,
    [navigationRow.toJSON()],
    [], // No separate viral buttons needed
    client
  );
  
  console.log(`Sending castlist2 response: Tribe ${currentTribeIndex + 1}/${tribes.length}, Page ${currentTribePage + 1}/${pageInfo.totalPages}, Scenario: ${scenario}`);
  
  // Check permissions and apply ephemeral flag if user cannot send messages
  if (member && channelId) {
    const canSendMessages = await canSendMessagesInChannel(member, channelId, client);
    console.log(`Permission check: User ${member.user?.username} can send messages in channel ${channelId}: ${canSendMessages}`);
    
    if (!canSendMessages) {
      // Add ephemeral flag to response if user cannot send messages
      responseData.flags = (responseData.flags || 0) | InteractionResponseFlags.EPHEMERAL;
      console.log(`Applied ephemeral flag - castlist visible only to user ${member.user?.username}`);
    }
  }
  
  // Send response
  const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
  await DiscordRequest(endpoint, {
    method: 'PATCH',
    body: responseData,
  });
}

// Role constants moved to roleManager.js module

// Update ensureServerData function
async function ensureServerData(guild) {
  const playerData = await loadPlayerData();
  
  // Try to get owner information safely
  let ownerInfo = null;
  try {
    const owner = await guild.members.fetch(guild.ownerId);
    ownerInfo = {
      username: owner.user.username,
      globalName: owner.user.globalName || owner.user.username,
      discriminator: owner.user.discriminator,
      tag: owner.user.tag
    };
  } catch (error) {
    // Silently fail - owner might not be in cache or accessible
    console.debug(`Could not fetch owner info for guild ${guild.id}`);
  }
  
  // Prepare server metadata with enhanced analytics
  const serverMetadata = {
    serverName: guild.name,
    icon: guild.iconURL(),
    ownerId: guild.ownerId,
    memberCount: guild.memberCount,
    description: guild.description || null,
    vanityURLCode: guild.vanityURLCode || null,
    preferredLocale: guild.preferredLocale,
    partnered: guild.partnered || false,
    verified: guild.verified || false,
    createdTimestamp: guild.createdTimestamp,
    lastUpdated: Date.now(),
    // Analytics metadata (safe to log)
    ...(ownerInfo && { ownerInfo }),
    analyticsVersion: '1.0' // For future analytics upgrades
  };

  if (!playerData[guild.id]) {
    // New server initialization
    playerData[guild.id] = {
      ...serverMetadata,
      players: {},
      tribes: {},           // Now empty object (no fixed keys)
      timezones: {},
      pronounRoleIDs: [],
      // Analytics for new installations
      firstInstalled: Date.now(),
      installationMethod: 'command' // Could be 'invite', 'command', etc.
    };
    await savePlayerData(playerData);
    console.log(`🎉 NEW SERVER INSTALLED: ${guild.name} (${guild.id}) - Owner: ${ownerInfo?.tag || guild.ownerId}`);
    
    // Post new server install announcement to Discord analytics channel
    try {
      const { logNewServerInstall } = await import('./analyticsLogger.js');
      await logNewServerInstall(guild, ownerInfo);
    } catch (error) {
      console.error('Error posting server install announcement:', error);
      // Don't break server initialization if announcement fails
    }
  } else {
    // Update existing server metadata
    playerData[guild.id] = {
      ...playerData[guild.id],
      ...serverMetadata
    };
    await savePlayerData(playerData);
    console.log(`Updated server metadata: ${guild.name} (${guild.id})`);
  }
}

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

// Initialize Discord client with required intents and partials
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

// Add these event handlers after client initialization
client.once('ready', async () => {
  console.log('Discord client is ready!');
  
  // Set Discord client reference for analytics logging
  setDiscordClient(client);
  
  // Update all existing servers
  for (const guild of client.guilds.cache.values()) {
    await ensureServerData(guild);
  }
});

client.on('guildCreate', async (guild) => {
  await ensureServerData(guild);
});

// Remove hardcoded timezone configurations

// Update roleConfig to remove timezone references
const roleConfig = { 
  // any remaining config needed
};

// Add this near the top with other constants
const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
];

// Add this helper function
async function hasRequiredPermissions(guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    // Return true if they have ANY of the required permissions
    return REQUIRED_PERMISSIONS.some(perm => member.permissions.has(perm));
  } catch (error) {
    console.error('Error checking permissions:', error);
    return false;
  }
}

// Add a route to serve a test HTML page
app.get('/', (req, res) => {
    console.log('Root URL accessed');
    res.send('<h1>Castbot is running successfully!</h1>');
});

app.get("/interactions", (req, res) => {
  console.log("GET /interactions was accessed");
  res.send("OK, we see you!");
});

/**
 * Parse request body as JSON for all routes except /interactions
 * The /interactions endpoint needs raw buffer access for discord-interactions package
 */
app.use((req, res, next) => {
  if (req.path === '/interactions') {
    // Skip JSON parsing for interactions endpoint
    next();
  } else {
    // Apply JSON parsing for other routes
    express.json()(req, res, next);
  }
});

// Update handleSetTribe function to properly handle role options
async function handleSetTribe(guildId, roleIdOrOption, options) {
  const guild = await client.guilds.fetch(guildId);
  
  // Extract actual role ID from either direct ID or role option
  let roleId;
  if (typeof roleIdOrOption === 'object' && roleIdOrOption.value) {
    roleId = roleIdOrOption.value;
  } else {
    roleId = roleIdOrOption;
  }

  const role = await guild.roles.fetch(roleId);
  if (!role) {
    throw new Error(`Role ${roleId} not found in guild ${guildId}`);
  }

  const emojiOption = options.find(opt => opt.name === 'emoji');
  const castlistName = options.find(opt => opt.name === 'castlist')?.value || 'default';
  const colorOption = options.find(opt => opt.name === 'color');
  const showPlayerEmojisOption = options.find(opt => opt.name === 'show_player_emojis');

  // Load guild data
  const data = await loadPlayerData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId].tribes) data[guildId].tribes = {};

  // Check if tribe exists in a different castlist
  const existingTribe = Object.entries(data[guildId].tribes)
    .find(([id, tribe]) => id === roleId && tribe?.castlist !== castlistName);
  
  if (existingTribe) {
    throw new Error(`Tribe not added - this tribe already exists in ${existingTribe[1].castlist}. You can only have each tribe in one castlist.`);
  }

  // Note: 25-field limit check moved to /castlist display for better v1/v2 compatibility

  // Get role name for analytics logging (NEVER use this for functionality!)
  let analyticsName = null;
  try {
    const role = await guild.roles.fetch(roleId);
    if (role) {
      const emoji = emojiOption?.value || '';
      analyticsName = emoji ? `${emoji} ${role.name} ${emoji}` : role.name;
    }
  } catch (error) {
    console.debug(`Could not fetch role name for analytics: ${roleId}`);
  }

  // Check if this is a new tribe for analytics tracking
  const isNewTribe = !data[guildId].tribes[roleId];

  // Update or add tribe
  data[guildId].tribes[roleId] = {
    emoji: emojiOption?.value || null,
    castlist: castlistName,
    showPlayerEmojis: showPlayerEmojisOption?.value !== false,  // Default to true, only false if explicitly set to false
    // Analytics only - NEVER use for functionality, always fetch live role name!
    ...(analyticsName && { analyticsName }),
    // Add timestamp when tribe is first added (not on updates)
    ...(isNewTribe && { analyticsAdded: Date.now() })
  };

  // Handle color if provided, or use role color as fallback
  let colorMessage = "";
  if (colorOption?.value) {
    const colorRegex = /^#?([0-9A-Fa-f]{6})$/;
    const match = colorOption.value.match(colorRegex);
    
    if (match) {
      // Add # if it's missing
      const formattedColor = colorOption.value.startsWith('#') ? 
        colorOption.value : `#${colorOption.value}`;
      data[guildId].tribes[roleId].color = formattedColor;
    } else {
      colorMessage = " Invalid color entered - you must enter it as a 6 digit hexadecimal (e.g. #FFFFFF)";
    }
  } else if (role.color && role.color !== 0) {
    // Use role color if no custom color provided and role has a color
    const roleColorHex = `#${role.color.toString(16).padStart(6, '0')}`;
    data[guildId].tribes[roleId].color = roleColorHex;
    colorMessage = ` (using role color ${roleColorHex})`;
  }

  // Save the tribe data first - this ensures the tribe is created even if emoji creation fails
  await savePlayerData(data);
  console.log(`Added/updated tribe with role ID ${roleId} in castlist '${castlistName}'`);

  // Handle emoji creation
  const members = await guild.members.fetch();
  const targetMembers = members.filter(m => m.roles.cache.has(roleId));

  let resultLines = [];
  let existingLines = [];
  let errorLines = [];
  let maxEmojiReached = false;

  // Only proceed with emoji creation if show_player_emojis is enabled and we found members
  if (showPlayerEmojisOption?.value !== false && targetMembers.size > 0) {
    console.log(`Found ${targetMembers.size} members with tribe role ${role.name} (${roleId})`);
    
    for (const [memberId, member] of targetMembers) {
      try {
        // Check if player already has an emoji
        const existingPlayer = data[guildId].players?.[memberId];
        if (existingPlayer?.emojiCode) {
          existingLines.push(`${member.displayName}: Already has emoji ${existingPlayer.emojiCode}`);
          continue;
        }
        
        console.log(`Creating emoji for ${member.displayName} (${memberId})`);
        const result = await createEmojiForUser(member, guild);
        
        if (result && result.success) {
          // Only update player if emoji creation was successful
          await updatePlayer(guildId, memberId, { emojiCode: result.emojiCode });
          resultLines.push(`${member.displayName} ${result.emojiCode} (${result.isAnimated ? 'animated' : 'static'})`);
        }
      } catch (error) {
        console.error(`Error creating emoji for ${member.displayName}:`, error);
        
        // Handle specific error types
        let errorMessage = `${member.displayName}: Error creating emoji`;
        
        if (error.code === 30008) {
          errorMessage = `${member.displayName}: Maximum emoji limit reached for server`;
          maxEmojiReached = true;
        } else if (error.code === 50035) {
          errorMessage = `${member.displayName}: Invalid or missing image data`;
        } else if (error.message) {
          errorMessage = `${member.displayName}: ${error.message}`;
        }
        
        errorLines.push(errorMessage);
      }
    }
  } else if (showPlayerEmojisOption?.value === false) {
    console.log(`Emoji creation skipped for tribe role ${role.name} (${roleId}) - show_player_emojis set to false`);
  } else {
    console.log(`No members found with tribe role ${role.name} (${roleId})`);
  }

  return {
    resultLines,
    existingLines,
    errorLines,
    maxEmojiReached,
    tribeRoleId: roleId,
    isNew: true, // Always true now that we save before checking existing
    colorMessage
  };
}

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
    console.log("Got headers:", JSON.stringify(req.headers, null, 2));
    console.log("Got body:", req.body);
    
  // Interaction type and data
  const { type, id, data, guild_id } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }
  



  /**
   * Handle slash command requests !
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const rawName = data.name;
    const name = rawName.replace(/^dev_/, '');

    console.log(`Received command: ${rawName}`);

    // Analytics logging for slash commands
    const user = req.body.member?.user || req.body.user;
    const guild = req.body.guild;
    const member = req.body.member;
    const channelId = req.body.channel_id;
    
    
    if (user && guild) {
      // Get display name (nickname or global_name)
      const displayName = member?.nick || user.global_name || user.username;
      
      // Get channel name from Discord.js client (more reliable than REST API)
      let channelName = null;
      if (channelId) {
        try {
          // First try Discord.js client cache
          const channel = client?.channels?.cache?.get(channelId);
          if (channel?.name) {
            channelName = channel.name;
            console.log(`📍 DEBUG: Channel name from cache: #${channelName} (${channelId})`);
          } else {
            // Fallback to fetching via client
            if (client) {
              const fetchedChannel = await client.channels.fetch(channelId);
              if (fetchedChannel?.name) {
                channelName = fetchedChannel.name;
                console.log(`📍 DEBUG: Channel name from fetch: #${channelName} (${channelId})`);
              }
            }
          }
          
          // Last resort: Discord REST API
          if (!channelName) {
            const channelResponse = await DiscordRequest(`channels/${channelId}`, { method: 'GET' });
            if (channelResponse.ok) {
              const channelData = await channelResponse.json();
              channelName = channelData.name;
              console.log(`📍 DEBUG: Channel name from REST API: #${channelName} (${channelId})`);
            } else {
              console.log(`⚠️ DEBUG: REST API failed for channel ${channelId}, status:`, channelResponse.status);
            }
          }
        } catch (error) {
          console.log('Could not fetch channel name for analytics:', error.message);
        }
      }
      
      await logInteraction(
        user.id,
        req.body.guild_id,
        'SLASH_COMMAND',
        `/${name}`,
        user.username,
        guild.name || 'Unknown Server',
        null, // no components for slash commands
        channelName,
        displayName
      );
    }

    // Update the readOnlyCommands array to use new command names
    const readOnlyCommands = ['castlist', 'castlist2', 'player_set_age', 'player_set_pronouns','player_set_timezone', 'menu'];  // Updated from set_age
    if (!readOnlyCommands.includes(name)) {
      const hasPerms = await hasRequiredPermissions(req.body.guild_id, req.body.member.user.id);
      if (!hasPerms) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'You need Manage Channels, Manage Server, or Manage Roles permission to use this command.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
    }

    if (name === 'castlist') {
    // ROUTE TO CASTLIST2: /castlist now uses Components V2 functionality
    try {
      console.log('Processing castlist command (routed to Components V2)');
      const guildId = req.body.guild_id;
      const userId = req.body.member.user.id;
      const requestedCastlist = data.options?.find(opt => opt.name === 'castlist')?.value;

      // Determine which castlist to show
      const castlistToShow = await determineCastlistToShow(guildId, userId, requestedCastlist, client);
      console.log(`Selected castlist: ${castlistToShow}`);

      // Load initial tribe data
      const rawTribes = await getGuildTribes(guildId, castlistToShow);
      console.log('Loaded raw tribes:', JSON.stringify(rawTribes));

      if (rawTribes.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: 1 << 15,
            components: [
              { type: 10, content: '# No Tribes Found' },
              { type: 10, content: 'No tribes have been added to the default Castlist yet. Please have Production add tribes via the `/prod_menu` > `🔥 Tribes` Button > `🛠️ Add Tribe`.' }
            ]
          }
        });
      }

      // Check permissions BEFORE sending deferred response to determine response type
      const member = req.body.member;
      const channelId = req.body.channel_id;
      const canSendMessages = await canSendMessagesInChannel(member, channelId, client);
      console.log(`Pre-deferred permission check: User ${member?.user?.username} can send messages in channel ${channelId}: ${canSendMessages}`);
      
      // Send appropriate deferred response based on permissions
      if (canSendMessages) {
        // User can send messages - public deferred response
        res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
      } else {
        // User cannot send messages - ephemeral deferred response
        res.send({ 
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { flags: InteractionResponseFlags.EPHEMERAL }
        });
        console.log(`Sent ephemeral deferred response for user ${member?.user?.username}`);
      }

      const guild = await client.guilds.fetch(guildId);
      const fullGuild = await client.guilds.fetch(guildId, { force: true });
      await fullGuild.roles.fetch();
      
      // Ensure member cache is fully populated (post-restart fix)
      console.log(`Fetching members for guild ${fullGuild.name} (${fullGuild.memberCount} total)`);
      const members = await fullGuild.members.fetch({ force: true });

      // Process tribes and gather member data
      const tribesWithMembers = await Promise.all(rawTribes.map(async (tribe) => {
        const role = await fullGuild.roles.fetch(tribe.roleId);
        if (!role) {
          console.warn(`Role not found for tribe ${tribe.roleId}, skipping...`);
          return null;
        }
        
        const tribeMembers = members.filter(member => member.roles.cache.has(role.id));
        return {
          ...tribe,
          name: role.name,
          memberCount: tribeMembers.size,
          members: Array.from(tribeMembers.values())
        };
      }));

      // Filter out tribes with missing roles
      const validTribes = tribesWithMembers.filter(tribe => tribe !== null);
      
      if (validTribes.length === 0) {
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'No valid tribes found. Some tribe roles may have been deleted. Please use `/add_tribe` to set up tribes again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        return;
      }

      // Apply user-first tribe ordering for default castlists
      const orderedTribes = reorderTribes(validTribes, userId, "user-first", castlistToShow);

      // Determine display scenario based on component calculations
      const scenario = determineDisplayScenario(orderedTribes);
      console.log(`Component scenario: ${scenario}`);

      // Log component calculations for debugging
      orderedTribes.forEach(tribe => {
        const withSeparators = calculateComponentsForTribe(tribe.memberCount, true);
        const withoutSeparators = calculateComponentsForTribe(tribe.memberCount, false);
        console.log(`Tribe ${tribe.name}: ${tribe.memberCount} members = ${withSeparators} components (with separators), ${withoutSeparators} (without)`);
      });

      // Create navigation state for initial display (first tribe, first page)
      const navigationState = createNavigationState(orderedTribes, scenario, 0, 0);
      
      await sendCastlist2Response(req, fullGuild, orderedTribes, castlistToShow, navigationState, req.body.member, req.body.channel_id);

    } catch (error) {
      console.error('Error handling castlist command:', error);
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: `Error displaying castlist: ${error.message}`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }
    return;
} else if (name === 'castlist2') {
  try {
    console.log('Processing castlist2 command (Components V2 - Dynamic)');
    const guildId = req.body.guild_id;
    const userId = req.body.member.user.id;
    const requestedCastlist = data.options?.find(opt => opt.name === 'castlist')?.value;

    // Determine which castlist to show
    const castlistToShow = await determineCastlistToShow(guildId, userId, requestedCastlist);
    console.log(`Selected castlist: ${castlistToShow}`);

    // Load initial tribe data
    const rawTribes = await getGuildTribes(guildId, castlistToShow);
    console.log('Loaded raw tribes:', JSON.stringify(rawTribes));

    if (rawTribes.length === 0) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: 1 << 15,
          components: [
            { type: 10, content: '# No Tribes Found' },
            { type: 10, content: 'No tribes have been added to the default Castlist yet. Please have Production add tribes via the `/prod_menu` > `🔥 Tribes` Button > `🛠️ Add Tribe`.' }
          ]
        }
      });
    }

    // Send deferred response
    res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

    const guild = await client.guilds.fetch(guildId);
    const fullGuild = await client.guilds.fetch(guildId, { force: true });
    await fullGuild.roles.fetch();
    
    // Ensure member cache is fully populated (post-restart fix)
    console.log(`Fetching members for guild ${fullGuild.name} (${fullGuild.memberCount} total)`);
    const members = await fullGuild.members.fetch({ force: true });

    // Process tribes and gather member data
    const tribesWithMembers = await Promise.all(rawTribes.map(async (tribe) => {
      const role = await fullGuild.roles.fetch(tribe.roleId);
      if (!role) {
        console.warn(`Role not found for tribe ${tribe.roleId}, skipping...`);
        return null;
      }
      
      const tribeMembers = members.filter(member => member.roles.cache.has(role.id));
      return {
        ...tribe,
        name: role.name,
        memberCount: tribeMembers.size,
        members: Array.from(tribeMembers.values())
      };
    }));

    // Filter out tribes with missing roles
    const validTribes = tribesWithMembers.filter(tribe => tribe !== null);
    
    if (validTribes.length === 0) {
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: 'No valid tribes found. Some tribe roles may have been deleted. Please use `/add_tribe` to set up tribes again.',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
      return;
    }

    // Apply user-first tribe ordering for default castlists
    const orderedTribes = reorderTribes(validTribes, userId, "user-first", castlistToShow);

    // Determine display scenario based on component calculations
    const scenario = determineDisplayScenario(orderedTribes);
    console.log(`Component scenario: ${scenario}`);

    // Log component calculations for debugging
    orderedTribes.forEach(tribe => {
      const withSeparators = calculateComponentsForTribe(tribe.memberCount, true);
      const withoutSeparators = calculateComponentsForTribe(tribe.memberCount, false);
      console.log(`Tribe ${tribe.name}: ${tribe.memberCount} members = ${withSeparators} components (with separators), ${withoutSeparators} (without)`);
    });

    // Create navigation state for initial display (first tribe, first page)
    const navigationState = createNavigationState(orderedTribes, scenario, 0, 0);
    
    await sendCastlist2Response(req, fullGuild, orderedTribes, castlistToShow, navigationState, req.body.member, req.body.channel_id);

  } catch (error) {
    console.error('Error handling castlist2 command:', error);
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: `Error displaying Components V2 castlist: ${error.message}`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
// REMOVED: prod_menu command handler - merged into unified /menu command with admin detection
} else if (name === 'menu') {
  try {
    console.log('Processing unified menu command');
    
    const member = req.body.member;
    const isAdmin = hasAdminPermissions(member);
    
    console.log(`Menu access: Admin=${isAdmin}, User=${member?.user?.username || 'unknown'}`);
    
    if (isAdmin) {
      // Admin user - show production menu (ephemeral)
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    } else {
      // Regular user - show player menu (ephemeral)
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }
    
    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    
    // Get all tribes to find unique castlists
    const playerData = await loadPlayerData();
    const allCastlists = new Set();
    const castlistTribes = {}; // Track tribes per castlist to get emojis
    
    if (playerData[guildId]?.tribes) {
      Object.entries(playerData[guildId].tribes).forEach(([roleId, tribeData]) => {
        const castlistName = tribeData.castlist || 'default';
        allCastlists.add(castlistName);
        
        // Store tribe info for each castlist (for emojis)
        if (!castlistTribes[castlistName]) {
          castlistTribes[castlistName] = [];
        }
        castlistTribes[castlistName].push({
          roleId,
          emoji: tribeData.emoji,
          color: tribeData.color,
          showPlayerEmojis: tribeData.showPlayerEmojis
        });
      });
    }
    
    if (isAdmin) {
      // Admin user - use createProductionMenuInterface function
      const userId = req.body.member?.user?.id;
      const menuResponse = await createProductionMenuInterface(guild, playerData, guildId, userId);
      
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: menuResponse
      });
      
    } else {
      // Regular user - use new player management UI
      const userId = member.user.id;
      const targetMember = await guild.members.fetch(userId);
      
      // Create player management UI
      const managementUI = await createPlayerManagementUI({
        mode: PlayerManagementMode.PLAYER,
        targetMember,
        playerData,
        guildId,
        userId,
        showUserSelect: false,
        showVanityRoles: false,
        title: 'CastBot | Player Menu',
        client
      });
      
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: managementUI
      });
    }
    
  } catch (error) {
    console.error('Error handling menu command:', error);
    
    try {
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: '❌ Error loading menu. Please try again.',
          components: [],
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    } catch (updateError) {
      console.error('Failed to update message with error:', updateError);
    }
  }
  return;
} else if (name === 'clear_tribe') {
    try {
      console.log('Processing /clear_tribe command');
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      });

      const guildId = req.body.guild_id;
      const guild = await client.guilds.fetch(guildId);
      const roleOption = data.options.find(opt => opt.name === 'role');
      const roleId = roleOption.value;
      const token = req.body.token; // Store the token for later use
      
      console.log(`Processing clear_tribe for role ${roleId} in guild ${guildId}`);

      // Load full data structure
      const playerData = await loadPlayerData();
      if (!playerData[guildId]?.tribes) {
        console.log('No guild data found');
        try {
          const endpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: 'No tribe data found for this server',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } catch (webhookError) {
          console.error('Webhook response error:', webhookError);
          // If webhook fails, we can't do anything, just log it
        }
        return;
      }

      // Check if tribe exists
      if (!playerData[guildId].tribes[roleId]) {
        console.log('No tribe found with this role ID');
        try {
          const endpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `No tribe found with role <@&${roleId}>`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } catch (webhookError) {
          console.error('Webhook response error:', webhookError);
          // If webhook fails, we can't do anything, just log it
        }
        return;
      }

      // Store the tribe name and castlist before deletion for the message
      const tribeName = (await guild.roles.fetch(roleId))?.name || roleId;
      const castlist = playerData[guildId].tribes[roleId].castlist || 'default';

      // Get all members with this tribe role
      const members = await guild.members.fetch();
      const targetMembers = members.filter(m => m.roles.cache.has(roleId));
      console.log(`Found ${targetMembers.size} members with tribe role`);

      const resultLines = [];

      // Process each member with the tribe role
      for (const [memberId, member] of targetMembers) {
        if (playerData[guildId].players[memberId]?.emojiCode) {
          const emojiCode = playerData[guildId].players[memberId].emojiCode;
          const emoji = parseEmojiCode(emojiCode);
          
          if (emoji?.id) {
            try {
              const guildEmoji = await guild.emojis.fetch(emoji.id);
              if (guildEmoji) {
                await guildEmoji.delete();
                console.log(`Deleted ${emoji.animated ? 'animated' : 'static'} emoji for ${member.displayName}`);
                resultLines.push(`Deleted ${emoji.animated ? 'animated' : 'static'} emoji for ${member.displayName}`);
              }
            } catch (err) {
              console.error(`Error deleting emoji for ${member.displayName}:`, {
                error: err,
                emojiCode: emojiCode,
                emojiData: emoji
              });
              resultLines.push(`Failed to delete emoji for ${member.displayName}`);
            }
          }
          // Clear emoji code
          playerData[guildId].players[memberId].emojiCode = null;
        }
      }

      // Remove tribe
      delete playerData[guildId].tribes[roleId];

      // Save updated data
      await savePlayerData(playerData);
      console.log('Saved updated player data');

      // Send response
      try {
        const endpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: resultLines.length > 0 
              ? `Cleared tribe ${tribeName} from castlist '${castlist}'.\n${resultLines.join('\n')}`
              : `Cleared tribe ${tribeName} from castlist '${castlist}'. No emojis needed to be removed.`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      } catch (webhookError) {
        console.error('Error updating webhook response:', webhookError);
        // The webhook might have expired, but the operation has completed successfully
        console.log('However, tribe deletion was successful');
      }

    } catch (error) {
      console.error('Error in clear_tribe:', error);
      try {
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error clearing tribe. Please check server logs.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      } catch (webhookError) {
        console.error('Could not send error message via webhook:', webhookError);
        // Webhook has likely expired, nothing more we can do
      }
    }
    return;
// REMOVED: set_players_age command - functionality moved to /menu system
    } else if (name === 'pronouns_add') {     // Changed from addpronouns
      try {
        console.log('Processing pronouns_add command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });
    
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Process all possible role options (up to 12)
        const roleOptions = [];
        for (let i = 1; i <= 12; i++) {
          const roleOption = data.options.find(opt => opt.name === `role${i}`);
          if (roleOption) {
            roleOptions.push(roleOption.value);
          }
        }

        console.log('Roles to add:', roleOptions);
    
        // Load current pronouns from guild data
        const currentPronouns = new Set(await getGuildPronouns(guildId));
        const added = [];
        const alreadyExists = [];
    
        // Add new roles
        for (const roleId of roleOptions) {
          const role = await guild.roles.fetch(roleId);
          if (currentPronouns.has(roleId)) {
            alreadyExists.push(`<@&${roleId}> (${roleId})`);
          } else {
            currentPronouns.add(roleId);
            added.push(`<@&${roleId}> (${roleId})`);
          }
        }
    
        // Save updated pronouns
        await updateGuildPronouns(guildId, Array.from(currentPronouns));
    
        // Prepare response message  
        const addedMsg = added.length > 0 ? `Players can now be assigned the following roles which will show up on the dynamic castlist: ${added.join(', ')}` : '';
        const existsMsg = alreadyExists.length > 0 ? `Already existed: ${alreadyExists.join(', ')}` : '';
        const message = [addedMsg, existsMsg].filter(msg => msg).join('\n');
    
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: message || 'No changes made to pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      } catch (error) {
        console.error('Error processing pronouns_add command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error updating pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
      return;
    } else if (name === 'remove_pronouns') {   // Changed from removepronouns
      try {
        console.log('Processing removepronouns command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const removedPronouns = [];
        const notFoundPronouns = [];

        // Process each role parameter (up to 12)
        for (let i = 1; i <= 12; i++) {
          const roleOption = data.options?.find(opt => opt.name === `role${i}`);
          if (roleOption) {
            const roleId = roleOption.value;
            const role = await guild.roles.fetch(roleId);
            const roleName = role ? role.name : roleId;
            
            // Check if pronoun exists in playerData
            const currentPronouns = await getGuildPronouns(guildId);
            if (currentPronouns.includes(roleId)) {
              const updatedPronouns = currentPronouns.filter(id => id !== roleId);
              await updateGuildPronouns(guildId, updatedPronouns);
              removedPronouns.push(`<@&${roleId}> (${roleId})`);
            } else {
              notFoundPronouns.push(`<@&${roleId}> (${roleId})`);
            }
          }
        }

        // Construct response message
        let message = '';
        if (removedPronouns.length > 0) {
          message += `Successfully removed the following pronouns: ${removedPronouns.join(', ')}\n`;
        }
        if (notFoundPronouns.length > 0) {
          message += `The following pronouns were not found in the pronoun list, so nothing was removed: ${notFoundPronouns.join(', ')}`;
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: message || 'No pronouns were removed.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error in removepronouns command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'There was an error while removing pronouns.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (name === 'timezones_add') {    // Changed from addtimezone
  try {
    console.log('Processing addtimezone command');
    const guildId = req.body.guild_id;
    const updates = [];
    
    // Process each timezone-offset pair
    for (let i = 1; i <= 12; i++) {
      const tzOption = data.options?.find(opt => opt.name === `timezone${i}`);
      const offsetOption = data.options?.find(opt => opt.name === `timezone${i}_offset`);
      
      if (tzOption && offsetOption) {
        console.log(`Found timezone${i} data:`, {
          timezone: tzOption,
          offset: offsetOption
        });
        
        // Clean up the offset value (remove + if present) and preserve decimal portions
        const cleanOffset = parseFloat(offsetOption.value.replace(/^\+/, ''));
        
        if (isNaN(cleanOffset)) {
          console.error(`Invalid offset value for timezone${i}: ${offsetOption.value}`);
          continue;
        }
        
        updates.push({
          roleId: tzOption.value,
          offset: cleanOffset
        });
      }
    }
    
    if (updates.length === 0) {
      console.log('No valid timezone-offset pairs found');
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No valid timezone-offset pairs provided',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }
    
    // Load and ensure guild data exists
    const storageData = await loadPlayerData();  // Changed variable name from data to storageData
    if (!storageData[guildId]) {
      storageData[guildId] = { timezones: {} };
    }
    if (!storageData[guildId].timezones) {
      storageData[guildId].timezones = {};
    }
    
    // Process updates
    const results = [];
    for (const update of updates) {
      const isNew = !storageData[guildId].timezones[update.roleId];
      
      // Add or update timezone
      storageData[guildId].timezones[update.roleId] = {
        offset: update.offset
      };
      
      // Get role name for the message
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(update.roleId);
      const roleName = role ? role.name : update.roleId;
      
      results.push(
        isNew
          ? `Timezone <@&${update.roleId}> (${update.roleId}) added with offset ${update.offset}`
          : `Timezone <@&${update.roleId}> (${update.roleId}) updated with offset ${update.offset}`
      );
    }
    
    // Save changes
    await savePlayerData(storageData);
    
    console.log('Updates processed:', results);
    
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: results.join('\n'),
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
    
  } catch (err) {
    console.error('Error processing addtimezone command:', err);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Failed to update timezones.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
} else if (name === 'timezones_remove') {
  try {
    console.log('Processing timezones_remove command');
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    const removed = [];
    const notFound = [];

    // Process all possible role options (up to 12)
    const roleOptions = [];
    for (let i = 1; i <= 12; i++) {
      const roleOption = data.options?.find(opt => opt.name === `timezone${i}`);
      if (roleOption) {
        roleOptions.push(roleOption.value);
      }
    }

    console.log('Roles to remove:', roleOptions);

    // Load current timezone data
    const playerData = await loadPlayerData();
    if (!playerData[guildId]?.timezones) {
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: 'No timezones have been set up for this server yet.',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
      return;
    }

    // Process each role
    for (const roleId of roleOptions) {
      if (playerData[guildId].timezones[roleId]) {
        delete playerData[guildId].timezones[roleId];
        removed.push(`<@&${roleId}> (${roleId})`);
      } else {
        notFound.push(`<@&${roleId}> (${roleId})`);
      }
    }

    // Save changes
    await savePlayerData(playerData);

    // Prepare response message
    const removedMsg = removed.length > 0 ? `Successfully removed: ${removed.join(', ')}` : '';
    const notFoundMsg = notFound.length > 0 ? `Not found in timezone list: ${notFound.join(', ')}` : '';
    const message = [removedMsg, notFoundMsg].filter(msg => msg).join('\n');

    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: message || 'No timezone roles were specified for removal.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });

  } catch (error) {
    console.error('Error in timezones_remove:', error);
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: 'Error removing timezone roles.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
} else if (name === 'react_timezones') {
  try {
    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);

    // Get timezone roles from storage
    const timezones = await getGuildTimezones(guildId);
    if (!Object.keys(timezones).length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No timezone roles found. Ask an admin to add some using the "🗺️ Add Timezone" button in the admin menu first!',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Get role objects and sort alphabetically
    const roles = await Promise.all(
      Object.keys(timezones).map(id => guild.roles.fetch(id))
    );
    const sortedRoles = roles
      .filter(role => role) // Remove any null roles
      .sort((a, b) => a.name.localeCompare(b.name));

    if (sortedRoles.length > REACTION_EMOJIS.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Too many timezone roles (maximum ${REACTION_EMOJIS.length} supported due to Discord limits)`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Timezone Role Selection')
      .setDescription('React with the emoji corresponding to your timezone:\n\n' + 
        sortedRoles.map((role, i) => `${REACTION_EMOJIS[i]} - ${role.name}`).join('\n'))
      .setColor('#7ED321');

    // Send the message
    await res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [embed]
      }
    });

    // Get the message we just sent
    const response = await fetch(
      `https://discord.com/api/v10/channels/${req.body.channel_id}/messages`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const messages = await response.json();
    const message = messages[0];  // Get most recent message

    // Add reactions
    for (let i = 0; i < sortedRoles.length; i++) {
      await fetch(
        `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${message.id}/reactions/${encodeURIComponent(REACTION_EMOJIS[i])}/@me`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          },
        }
      );
    }

    // Store role-emoji mappings in memory for reaction handler
    if (!client.roleReactions) client.roleReactions = new Map();
    client.roleReactions.set(message.id, 
      Object.fromEntries(sortedRoles.map((role, i) => [REACTION_EMOJIS[i], role.id]))
    );

  } catch (error) {
    console.error('Error in react_timezones:', error);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Error creating reaction message',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
} else if (name === 'add_tribe') {  // Changed from set_tribe
  try {
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    const roleOption = data.options.find(opt => opt.name === 'role');
    const colorOption = data.options.find(opt => opt.name === 'color');
    const result = await handleSetTribe(req.body.guild_id, roleOption, data.options);

    // Prepare response message
    const castlistName = data.options.find(opt => opt.name === 'castlist')?.value || 'default';
    
    // Add color information to the message if a valid color was provided
    let colorInfo = '';
    if (colorOption?.value && !result.colorMessage) {
      const formattedColor = colorOption.value.startsWith('#') ? 
        colorOption.value : `#${colorOption.value}`;
      colorInfo = ` with color ${formattedColor}`;
    }
    
    const messageLines = [
      `Tribe <@&${result.tribeRoleId}> ${result.isNew ? 'added to' : 'updated in'} castlist '${castlistName}'${colorInfo}${result.colorMessage || ''}`,
      ''
    ];

    if (result.resultLines.length > 0) {
      messageLines.push('New emojis created:');
      messageLines.push(...result.resultLines);
      messageLines.push('');
    }

    if (result.existingLines.length > 0) {
      messageLines.push('Existing emojis found:');
      messageLines.push(...result.existingLines);
      messageLines.push('');
    }

    if (result.errorLines.length > 0) {
      messageLines.push('Errors encountered:');
      messageLines.push(...result.errorLines);
    }

    if (result.maxEmojiReached) {
      messageLines.push('');
      messageLines.push('⚠️ Server emoji limit reached. Some emojis could not be created.');
    }

    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: messageLines.join('\n'),
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });

  } catch (error) {
    const errorMessage = error.message || 'An error occurred while processing the command.';
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: errorMessage,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
} else if (name === 'player_set_pronouns') {  // Changed from react_pronouns
  try {
    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);

    // Get pronoun roles from storage
    const pronounRoleIDs = await getGuildPronouns(guildId);
    if (!pronounRoleIDs?.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No pronoun roles found. Add some using /pronouns_add first!',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Get role objects and sort alphabetically
    const roles = await Promise.all(
      pronounRoleIDs.map(id => guild.roles.fetch(id))
    );
    const sortedRoles = roles
      .filter(role => role) // Remove any null roles
      .sort((a, b) => a.name.localeCompare(b.name));

    if (sortedRoles.length > REACTION_EMOJIS.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Too many pronoun roles (maximum ${REACTION_EMOJIS.length} supported due to Discord limits)`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Pronoun Role Selection')
      .setDescription('React with the emoji corresponding to your pronouns:\n\n' + 
        sortedRoles.map((role, i) => `${REACTION_EMOJIS[i]} - ${role.name}`).join('\n'))
      .setColor('#7ED321');

    // Send initial response
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    // Send the embed as a follow-up and get the message directly
    const followUpResponse = await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}`, {
      method: 'POST',
      body: {
        embeds: [embed]
      }
    });

    if (!followUpResponse.id) {
      console.error('Failed to get message ID from follow-up response');
      return;
    }

    const messageId = followUpResponse.id;

    // Add reactions with proper error handling
    for (let i = 0; i < sortedRoles.length; i++) {
      try {
        await fetch(
          `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${messageId}/reactions/${encodeURIComponent(REACTION_EMOJIS[i])}/@me`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
            },
          }
        );
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to add reaction ${REACTION_EMOJIS[i]}:`, error);
      }
    }

    // Store role-emoji mappings in memory for reaction handler
    if (!client.roleReactions) client.roleReactions = new Map();
    client.roleReactions.set(messageId, 
      Object.fromEntries(sortedRoles.map((role, i) => [REACTION_EMOJIS[i], role.id]))
    );

  } catch (error) {
    console.error('Error in react_pronouns:', error);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Error creating reaction message',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
} else if (name === 'player_set_timezone') {  // Changed from react_timezones
  try {
    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);

    // Get timezone roles from storage
    const timezones = await getGuildTimezones(guildId);
    if (!Object.keys(timezones).length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No timezone roles found. Ask an admin to add some using the "🗺️ Add Timezone" button in the admin menu first!',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Get role objects and sort alphabetically
    const roles = await Promise.all(
      Object.keys(timezones).map(id => guild.roles.fetch(id))
    );
    const sortedRoles = roles
      .filter(role => role) // Remove any null roles
      .sort((a, b) => a.name.localeCompare(b.name));

    if (sortedRoles.length > REACTION_EMOJIS.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Too many timezone roles (maximum ${REACTION_EMOJIS.length} supported due to Discord limits)`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Timezone Role Selection')
      .setDescription('React with the emoji corresponding to your timezone:\n\n' + 
        sortedRoles.map((role, i) => `${REACTION_EMOJIS[i]} - ${role.name}`).join('\n'))
      .setColor('#7ED321');

    // Send initial response
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    // Send the embed as a follow-up and get the message directly
    const followUpResponse = await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}`, {
      method: 'POST',
      body: {
        embeds: [embed]
      }
    });

    if (!followUpResponse.id) {
      console.error('Failed to get message ID from follow-up response');
      return;
    }

    const messageId = followUpResponse.id;

    // Add reactions with proper error handling
    for (let i = 0; i < sortedRoles.length; i++) {
      try {
        await fetch(
          `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${messageId}/reactions/${encodeURIComponent(REACTION_EMOJIS[i])}/@me`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
            },
          }
        );
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to add reaction ${REACTION_EMOJIS[i]}:`, error);
      }
    }

    // Store role-emoji mappings in memory for reaction handler with timezone metadata
    if (!client.roleReactions) client.roleReactions = new Map();
    const roleMapping = Object.fromEntries(sortedRoles.map((role, i) => [REACTION_EMOJIS[i], role.id]));
    roleMapping.isTimezone = true;  // Mark this as a timezone role mapping
    client.roleReactions.set(messageId, roleMapping);

  } catch (error) {
    console.error('Error in player_set_timezone:', error);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Error creating reaction message',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
} else if (name === 'player_set_age') {  // Changed from set_age
  try {
    const guildId = req.body.guild_id;
    const userId = req.body.member.user.id;
    const userName = req.body.member.nick || req.body.member.user.username;
    const age = data.options.find(opt => opt.name === 'age').value;

    // Load player data
    const playerData = await loadPlayerData();
    
    // Ensure guild and player data structures exist
    if (!playerData[guildId]) {
      playerData[guildId] = { players: {} };
    }
    if (!playerData[guildId].players) {
      playerData[guildId].players = {};
    }
    if (!playerData[guildId].players[userId]) {
      playerData[guildId].players[userId] = {};
    }

    // Update age
    playerData[guildId].players[userId].age = age;
    
    // Save data
    await savePlayerData(playerData);

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `${userName} has set their age to ${age}` // Public message visible to all
      }
    });

  } catch (error) {
    console.error('Error in player_set_age command:', error);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Error setting age',
        flags: InteractionResponseFlags.EPHEMERAL // Only error messages are ephemeral
      }
    });
  }

} else if (name === 'pronouns_remove') {
      try {
        console.log('Processing pronouns_remove command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Process all possible role options (up to 12)
        const roleOptions = [];
        for (let i = 1; i <= 12; i++) {
          const roleOption = data.options.find(opt => opt.name === `role${i}`);
          if (roleOption) {
            roleOptions.push(roleOption.value);
          }
        }

        console.log('Roles to remove:', roleOptions);

        // Load current pronouns
        const currentPronouns = await getGuildPronouns(guildId);
        const removed = [];
        const notFound = [];

        // Process each role
        for (const roleId of roleOptions) {
          if (currentPronouns.includes(roleId)) {
            removed.push(`<@&${roleId}> (${roleId})`);
          } else {
            notFound.push(`<@&${roleId}> (${roleId})`);
          }
        }

        // Update pronouns list by removing the roles
        const updatedPronouns = currentPronouns.filter(id => !roleOptions.includes(id));
        await updateGuildPronouns(guildId, updatedPronouns);

        // Prepare response message
        const removedMsg = removed.length > 0 ? `Successfully removed: ${removed.join(', ')}` : '';
        const notFoundMsg = notFound.length > 0 ? `Not found in pronoun list: ${notFound.join(', ')}` : '';
        const message = [removedMsg, notFoundMsg].filter(msg => msg).join('\n');

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: message || 'No changes made to pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      } catch (error) {
        console.error('Error in pronouns_remove:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error removing pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
      return;
// ...existing code...
} else if (name === 'setup_castbot') {  // Changed from role_generator
  try {
    console.log('🔍 DEBUG: Processing setup_castbot slash command');
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    
    // Execute comprehensive setup using roleManager
    console.log('🔍 DEBUG: Calling executeSetup from roleManager (slash command)');
    const setupResults = await executeSetup(guildId, guild);
    
    // Generate detailed response message with new format
    const responseMessage = generateSetupResponse(setupResults);
    
    // Send response
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: responseMessage,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
    
    console.log('✅ DEBUG: Slash command setup completed successfully');

  } catch (error) {
    console.error('❌ ERROR: setup_castbot slash command failed:', error);
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: '❌ Error during role setup. Please check bot permissions and try again.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
} else if (name === 'apply_button') {
  try {
    console.log('Processing apply_button command');
    
    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    
    // Create and show the application button configuration modal
    const modal = createApplicationButtonModal();
    
    return res.send({
      type: InteractionResponseType.MODAL,
      data: modal.toJSON()
    });

  } catch (error) {
    console.error('Error in apply_button command:', error);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Error creating application button configuration.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }

// ...existing code...
}

  } // end if APPLICATION_COMMAND

  // Helper function for production menu message replacement logic
  async function shouldUpdateProductionMenuMessage(channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      const lastMessages = await channel.messages.fetch({ limit: 1 });
      const lastMessage = lastMessages.first();
      
      if (lastMessage && 
          lastMessage.author.id === client.user.id && 
          lastMessage.components && 
          lastMessage.components.length > 0) {
        
        // Check if this message contains production menu buttons
        const hasProductionMenuButton = lastMessage.components.some(row => 
          row.components && row.components.some(component => 
            component.customId && (
              component.customId === 'prod_season_applications' ||
              component.customId === 'prod_manage_pronouns_timezones' ||
              component.customId === 'prod_manage_tribes' ||
              component.customId === 'prod_setup' ||
              component.customId === 'prod_setup_tycoons' ||
              component.customId === 'admin_manage_player'
            )
          )
        );
        
        if (hasProductionMenuButton) {
          console.log('🔍 DEBUG: Last message is CastBot Production Menu, will update message');
          return true;
        } else {
          console.log('🔍 DEBUG: Last message is CastBot but not Production Menu, will create new message');
          return false;
        }
      } else {
        console.log('🔍 DEBUG: Last message is not from CastBot, will create new message');
        return false;
      }
    } catch (error) {
      console.log('🔍 DEBUG: Could not check last message, defaulting to new message:', error.message);
      return false;
    }
  }

  // Helper function to create back button for production submenus
  function createBackToMainMenuButton() {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('prod_menu_back')
          .setLabel('Menu')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );
  }

  // Helper function to send production submenu response with consistent UX
  async function sendProductionSubmenuResponse(res, channelId, components, shouldUpdateMessage = null) {
    // If shouldUpdateMessage not provided, check automatically
    if (shouldUpdateMessage === null) {
      shouldUpdateMessage = await shouldUpdateProductionMenuMessage(channelId);
    }
    
    const responseType = shouldUpdateMessage 
      ? InteractionResponseType.UPDATE_MESSAGE 
      : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;

    console.log(`🔍 DEBUG: Using response type: ${shouldUpdateMessage ? 'UPDATE_MESSAGE' : 'CHANNEL_MESSAGE_WITH_SOURCE'}`);
    
    // Prepare response data
    const responseData = {
      flags: (1 << 15), // IS_COMPONENTS_V2 flag
      components: components
    };
    
    // Add ephemeral flag for new messages (user-only visibility)
    if (!shouldUpdateMessage) {
      responseData.flags |= InteractionResponseFlags.EPHEMERAL;
      console.log('🔍 DEBUG: Adding ephemeral flag - only user can see this message');
    }
    
    return res.send({
      type: responseType,
      data: responseData
    });
  }

  /**
   * Handle button interactions (MESSAGE_COMPONENT) 
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data;
    console.log('Processing MESSAGE_COMPONENT with custom_id:', custom_id);
    console.log('🔍 BUTTON DEBUG: Checking handlers for', custom_id);

    // Analytics logging for button interactions
    const user = req.body.member?.user || req.body.user;
    const guild = req.body.guild;
    const member = req.body.member;
    const components = req.body.message?.components;
    const channelId = req.body.channel_id;
    
    
    if (user && guild) {
      // Get display name (nickname or global_name)
      const displayName = member?.nick || user.global_name || user.username;
      
      // Get channel name from Discord.js client (more reliable than REST API)
      let channelName = null;
      if (channelId) {
        try {
          // First try Discord.js client cache
          const channel = client?.channels?.cache?.get(channelId);
          if (channel?.name) {
            channelName = channel.name;
            console.log(`📍 DEBUG: Channel name from cache: #${channelName} (${channelId})`);
          } else {
            // Fallback to fetching via client
            if (client) {
              const fetchedChannel = await client.channels.fetch(channelId);
              if (fetchedChannel?.name) {
                channelName = fetchedChannel.name;
                console.log(`📍 DEBUG: Channel name from fetch: #${channelName} (${channelId})`);
              }
            }
          }
          
          // Last resort: Discord REST API
          if (!channelName) {
            const channelResponse = await DiscordRequest(`channels/${channelId}`, { method: 'GET' });
            if (channelResponse.ok) {
              const channelData = await channelResponse.json();
              channelName = channelData.name;
              console.log(`📍 DEBUG: Channel name from REST API: #${channelName} (${channelId})`);
            } else {
              console.log(`⚠️ DEBUG: REST API failed for channel ${channelId}, status:`, channelResponse.status);
            }
          }
        } catch (error) {
          console.log('Could not fetch channel name for analytics:', error.message);
        }
      }
      
      await logInteraction(
        user.id,
        req.body.guild_id,
        'BUTTON_CLICK',
        custom_id,
        user.username,
        guild.name || 'Unknown Server',
        components,
        channelName,
        displayName
      );
    }
    
    // Handle store browse buttons (format: safari_store_browse_guildId_storeId)
    if (custom_id.startsWith('safari_store_browse_')) {
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        
        // Parse storeId from custom_id: safari_store_browse_guildId_storeId
        const parts = custom_id.split('_');
        if (parts.length < 5) {
          throw new Error('Invalid store browse custom_id format');
        }
        const storeId = parts.slice(4).join('_'); // Rejoin in case storeId has underscores
        
        console.log(`🏪 DEBUG: User ${userId} browsing store ${storeId} in guild ${guildId}`);
        
        // Import Safari manager functions
        const { loadSafariContent, getCustomTerms, generateItemContent } = await import('./safariManager.js');
        const { getPlayer, loadPlayerData } = await import('./storage.js');
        const safariData = await loadSafariContent();
        const store = safariData[guildId]?.stores?.[storeId];
        const allItems = safariData[guildId]?.items || {};
        
        if (!store) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Get custom terms and player's currency for display
        const customTerms = await getCustomTerms(guildId);
        const playerData = await loadPlayerData();
        // Access player data directly from the loaded structure
        const player = playerData[guildId]?.players?.[userId];
        const playerCurrency = player?.safari?.currency || 0;
        
        // Build store display with Container -> Section pattern
        console.log('🏪 DEBUG: Building store display components...');
        
        console.log('🏪 DEBUG: Sending store browse response...');
        
        // Create simplified Components V2 structure to avoid nesting issues
        const containerComponents = [];
        
        // Header section - swapped description and storeownerText positions
        containerComponents.push({
          type: 10, // Text Display
          content: `## ${store.emoji || '🏪'} ${store.name}\n\n**${store.settings?.storeownerText || 'Welcome to the store!'}**\n\n${store.description || ''}\n\n> ${customTerms.currencyEmoji} **Your Balance:** ${playerCurrency} ${customTerms.currencyName}`
        });
        
        containerComponents.push({ type: 14 }); // Separator
        
        // Create one section per item - simplified structure
        const storeItems = store.items || [];
        for (let i = 0; i < Math.min(storeItems.length, 8); i++) { // Limit to 8 items to stay safe
          const storeItem = storeItems[i];
          const itemId = storeItem.itemId || storeItem;
          const item = allItems[itemId];
          const price = storeItem.price || item?.basePrice || 0;
          
          if (item) {
            // Generate detailed item content using shared function
            const itemContent = generateItemContent(item, customTerms, null, price);
            
            const itemSection = {
              type: 9, // Section component
              components: [{
                type: 10, // Text Display
                content: itemContent
              }],
              accessory: {
                type: 2, // Button accessory
                custom_id: `safari_store_buy_${guildId}_${storeId}_${itemId}`,
                label: `Buy ${item.name}`.slice(0, 80),
                style: 1,
                emoji: { name: item.emoji || '🛒' }
              }
            };
            
            containerComponents.push(itemSection);
            
            // Add separator between items (but not after the last item)
            if (i < Math.min(storeItems.length, 8) - 1) {
              containerComponents.push({ type: 14 }); // Separator
            }
          }
        }
        
        if (storeItems.length > 8) {
          containerComponents.push({
            type: 10,
            content: `*... and ${storeItems.length - 8} more items. Store pagination coming soon!*`
          });
        }
        
        const container = {
          type: 17, // Container
          accent_color: store.settings?.accentColor || 0x3498db,
          components: containerComponents
        };
        
        console.log(`🏪 DEBUG: Simplified container with ${containerComponents.length} components`);
        
        const response = {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + Ephemeral
            components: [container]
          }
        };
        
        console.log('🏪 DEBUG: Full response:', JSON.stringify(response, null, 2));
        return res.send(response);
        
      } catch (error) {
        console.error('Error in safari_store_browse handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading store display.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    }
    
    // Handle store purchase buttons (format: safari_store_buy_guildId_storeId_itemId)
    if (custom_id.startsWith('safari_store_buy_')) {
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        
        // Parse storeId and itemId from custom_id: safari_store_buy_guildId_storeId_itemId
        const parts = custom_id.split('_');
        if (parts.length < 6) {
          throw new Error('Invalid store buy custom_id format');
        }
        
        // Find the delimiter between storeId and itemId by checking which combination exists
        const { loadSafariContent, saveSafariContent, addItemToInventory } = await import('./safariManager.js');
        const { getPlayer, updatePlayer, savePlayerData, loadPlayerData } = await import('./storage.js');
        const safariData = await loadSafariContent();
        
        let storeId, itemId;
        for (let i = 4; i < parts.length - 1; i++) {
          const potentialStoreId = parts.slice(4, i + 1).join('_');
          const potentialItemId = parts.slice(i + 1).join('_');
          
          if (safariData[guildId]?.stores?.[potentialStoreId] && safariData[guildId]?.items?.[potentialItemId]) {
            storeId = potentialStoreId;
            itemId = potentialItemId;
            break;
          }
        }
        
        if (!storeId || !itemId) {
          throw new Error('Could not parse storeId and itemId from custom_id');
        }
        
        console.log(`🛒 DEBUG: User ${userId} attempting to buy item ${itemId} from store ${storeId}`);
        
        const store = safariData[guildId]?.stores?.[storeId];
        const item = safariData[guildId]?.items?.[itemId];
        
        if (!store || !item) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store or item not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Check if item is actually in the store
        const storeItem = store.items?.find(si => (si.itemId || si) === itemId);
        if (!storeItem) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Item is not available in this store.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const price = storeItem.price || item.basePrice || 0;
        
        // Get player data and check currency
        const playerData = await loadPlayerData();
        // Access player data directly from the loaded structure
        const player = playerData[guildId]?.players?.[userId];
        const currentCurrency = player?.safari?.currency || 0;
        
        if (currentCurrency < price) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ **Insufficient funds!**\n\nYou need 🪙 ${price} coins but only have 🪙 ${currentCurrency} coins.\n\nYou need 🪙 ${price - currentCurrency} more coins.`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Process purchase: deduct currency and add item to inventory
        const newCurrency = currentCurrency - price;
        
        // Initialize safari data if needed
        if (!player.safari) {
          player.safari = { currency: 0, inventory: {}, history: [], buttonUses: {}, storeHistory: [] };
        }
        if (!player.safari.inventory) {
          player.safari.inventory = {};
        }
        if (!player.safari.storeHistory) {
          player.safari.storeHistory = [];
        }
        
        // Update currency
        player.safari.currency = newCurrency;
        
        // Add item to inventory using proper function to avoid corruption (pass existing playerData to prevent race condition)
        const finalQuantity = await addItemToInventory(guildId, userId, itemId, 1, playerData);
        
        // Record purchase in store history
        player.safari.storeHistory.push({
          itemId: itemId,
          storeId: storeId,
          price: price,
          timestamp: Date.now()
        });
        
        // Update store sales count
        if (!store.metadata) {
          store.metadata = { totalSales: 0 };
        }
        store.metadata.totalSales = (store.metadata.totalSales || 0) + 1;
        
        // Update item sales count
        if (!item.metadata) {
          item.metadata = { totalSold: 0 };
        }
        item.metadata.totalSold = (item.metadata.totalSold || 0) + 1;
        
        // Save all changes
        await savePlayerData(playerData);
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Purchase successful - ${userId} bought ${itemId} for ${price} coins`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Purchase successful!**\n\n${item.emoji || '📦'} **${item.name}** purchased for 🪙 ${price} coins.\n\n🪙 **New balance:** ${newCurrency} coins\n📦 **${item.name} in inventory:** ${finalQuantity}`
          }
        });
        
      } catch (error) {
        console.error('Error in safari_store_buy handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error processing purchase. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    }
    
    // Handle safari dynamic buttons (format: safari_guildId_buttonId_timestamp)
    if (custom_id.startsWith('safari_') && custom_id.split('_').length >= 4 && 
        !custom_id.startsWith('safari_add_action_') && 
        !custom_id.startsWith('safari_finish_button_') && 
        !custom_id.startsWith('safari_action_modal_') && 
        !custom_id.startsWith('safari_currency_') && 
        !custom_id.startsWith('safari_create_') && 
        !custom_id.startsWith('safari_post_') && 
        !custom_id.startsWith('safari_manage_') && 
        !custom_id.startsWith('safari_view_') && 
        !custom_id.startsWith('safari_inventory_') &&
        !custom_id.startsWith('safari_my_') &&
        !custom_id.startsWith('safari_store_') &&
        !custom_id.startsWith('safari_item_') &&
        !custom_id.startsWith('safari_attack_') &&
        !custom_id.startsWith('safari_schedule_') &&
        !custom_id.startsWith('safari_button_') &&
        !custom_id.startsWith('safari_round_') &&
        !custom_id.startsWith('safari_edit_properties_') &&
        !custom_id.startsWith('safari_test_button_') &&
        !custom_id.startsWith('safari_delete_button_') &&
        !custom_id.startsWith('safari_confirm_delete_button_') &&
        !custom_id.startsWith('safari_confirm_delete_store_') &&
        !custom_id.startsWith('safari_action_') &&
        !custom_id.startsWith('safari_config_') &&
        custom_id !== 'safari_post_select_button' &&
        custom_id !== 'safari_confirm_reset_game' && 
        !custom_id.startsWith('safari_post_channel_')) {
      console.log(`🔍 DEBUG: Dynamic Safari handler processing custom_id: ${custom_id}`);
      try {
        const parts = custom_id.split('_');
        const guildId = parts[1];
        // Button ID is everything between guildId and timestamp (last part)
        const buttonId = parts.slice(2, -1).join('_');
        const userId = req.body.member.user.id;
          
          console.log(`🦁 DEBUG: Safari button interaction - Guild: ${guildId}, Button: ${buttonId}, User: ${userId}`);
          
          // Import safari manager and execute actions
          const { executeButtonActions } = await import('./safariManager.js');
          const result = await executeButtonActions(guildId, buttonId, userId, req.body);
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: result
          });
      } catch (error) {
        console.error('Error handling safari button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error executing safari action. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('show_castlist2')) {
      // Extract castlist name from custom_id if present
      const castlistMatch = custom_id.match(/^show_castlist2(?:_(.+))?$/);
      const requestedCastlist = castlistMatch?.[1] || 'default';
      
      console.log('Button clicked, processing castlist2 for:', requestedCastlist);
      
      // Execute the exact same logic as the castlist2 command
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;

        // Determine which castlist to show
        const castlistToShow = await determineCastlistToShow(guildId, userId, requestedCastlist);
        console.log(`Selected castlist: ${castlistToShow}`);

        // Load initial tribe data
        const rawTribes = await getGuildTribes(guildId, castlistToShow);
        console.log('Loaded raw tribes:', JSON.stringify(rawTribes));

        if (rawTribes.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [{
                title: 'CastBot: Dynamic Castlist',
                description: 'No tribes have been added to the default Castlist yet. Please have Production add tribes via the `/prod_menu` > `🔥 Tribes` Button > `🛠️ Add Tribe`.',
                color: 0x7ED321
              }],
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Check permissions BEFORE sending deferred response to determine response type
        const member = req.body.member;
        const channelId = req.body.channel_id;
        const canSendMessages = await canSendMessagesInChannel(member, channelId, client);
        console.log(`Pre-deferred permission check: User ${member.user?.username} can send messages in channel ${channelId}: ${canSendMessages}`);
        
        // Send appropriate deferred response based on permissions
        if (canSendMessages) {
          // User can send messages - public deferred response
          res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
        } else {
          // User cannot send messages - ephemeral deferred response
          res.send({ 
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: InteractionResponseFlags.EPHEMERAL }
          });
          console.log(`Sent ephemeral deferred response for user ${member.user?.username}`);
        }

        const guild = await client.guilds.fetch(guildId);
        const fullGuild = await client.guilds.fetch(guildId, { force: true });
        await fullGuild.roles.fetch();
        
        // Ensure member cache is fully populated (post-restart fix)
        console.log(`Fetching members for guild ${fullGuild.name} (${fullGuild.memberCount} total)`);
        const members = await fullGuild.members.fetch({ force: true });

        // Process tribes and gather member data
        const tribesWithMembers = await Promise.all(rawTribes.map(async (tribe) => {
          const role = await fullGuild.roles.fetch(tribe.roleId);
          if (!role) {
            console.warn(`Role not found for tribe ${tribe.roleId}, skipping...`);
            return null;
          }
          
          const tribeMembers = members.filter(member => member.roles.cache.has(role.id));
          return {
            ...tribe,
            name: role.name,
            memberCount: tribeMembers.size,
            members: Array.from(tribeMembers.values())
          };
        }));

        // Filter out tribes with missing roles
        const validTribes = tribesWithMembers.filter(tribe => tribe !== null);
        
        if (validTribes.length === 0) {
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: 'No valid tribes found. Some tribe roles may have been deleted. Please use `/add_tribe` to set up tribes again.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
          return;
        }

        // Apply user-first tribe ordering for default castlists
        const orderedTribes = reorderTribes(validTribes, userId, "user-first", castlistToShow);

        // Determine display scenario based on component calculations
        const scenario = determineDisplayScenario(orderedTribes);
        console.log(`Component scenario: ${scenario}`);

        // Log component calculations for debugging
        orderedTribes.forEach(tribe => {
          const withSeparators = calculateComponentsForTribe(tribe.memberCount, true);
          const withoutSeparators = calculateComponentsForTribe(tribe.memberCount, false);
          console.log(`Tribe ${tribe.name}: ${tribe.memberCount} members = ${withSeparators} components (with separators), ${withoutSeparators} (without)`);
        });

        // Create navigation state for initial display (first tribe, first page)
        const navigationState = createNavigationState(orderedTribes, scenario, 0, 0);
        
        await sendCastlist2Response(req, fullGuild, orderedTribes, castlistToShow, navigationState, req.body.member, req.body.channel_id);

      } catch (error) {
        console.error('Error handling castlist2 button:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `Error displaying Components V2 castlist: ${error.message}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      return;
    } else if (custom_id.startsWith('rank_')) {
      // Handle ranking button clicks (rank_1_channelId_appIndex, rank_2_channelId_appIndex, etc.)
      console.log('🔍 DEBUG: Processing rank button click:', custom_id);
      try {
        console.log('🔍 DEBUG: Extracting guild and user info...');
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const userId = req.body.member.user.id;
        console.log('🔍 DEBUG: Guild ID:', guildId, 'User ID:', userId);

        // Check admin permissions
        console.log('🔍 DEBUG: Checking admin permissions...');
        const member = await guild.members.fetch(userId);
        console.log('🔍 DEBUG: Member permissions:', member.permissions.bitfield.toString());
        if (!requireAdminPermission(req, res, 'You need admin permissions to rank applicants.')) return;
        console.log('🔍 DEBUG: Admin permissions verified');

        // Parse custom_id: rank_SCORE_CHANNELID_APPINDEX
        console.log('🔍 DEBUG: Parsing custom_id...');
        const rankMatch = custom_id.match(/^rank_(\d+)_(.+)_(\d+)$/);
        if (!rankMatch) {
          console.log('🔍 DEBUG: Invalid custom_id format, sending error response');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Invalid ranking button format.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        const [, score, channelId, appIndexStr] = rankMatch;
        const rankingScore = parseInt(score);
        const appIndex = parseInt(appIndexStr);
        console.log('🔍 DEBUG: Parsed values - Score:', rankingScore, 'Channel ID:', channelId, 'App Index:', appIndex);

        // Load and update ranking data
        console.log('🔍 DEBUG: Loading player data...');
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) playerData[guildId] = {};
        if (!playerData[guildId].rankings) playerData[guildId].rankings = {};
        if (!playerData[guildId].rankings[channelId]) playerData[guildId].rankings[channelId] = {};

        // Record the user's ranking for this application
        console.log('🔍 DEBUG: Recording ranking score...');
        playerData[guildId].rankings[channelId][userId] = rankingScore;
        await savePlayerData(playerData);
        console.log('🔍 DEBUG: Ranking data saved successfully');

        // Get updated application data using helper function
        console.log('🔍 DEBUG: Loading application data...');
        const allApplications = await getAllApplicationsFromData(guildId);
        console.log('🔍 DEBUG: Found', allApplications.length, 'applications');
        
        const currentApp = allApplications[appIndex];
        console.log('🔍 DEBUG: Current app:', currentApp ? 'Found' : 'Not found');

        if (!currentApp) {
          console.log('🔍 DEBUG: Application not found, sending error response');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Application not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Regenerate ranking interface with updated scores
        console.log('🔍 DEBUG: Creating Media Gallery component...');
        
        // Fetch the applicant as a guild member to get their current avatar
        let applicantMember;
        try {
          applicantMember = await guild.members.fetch(currentApp.userId);
          console.log('🔍 DEBUG: Ranking handler - Successfully fetched applicant member:', applicantMember.displayName || applicantMember.user.username);
        } catch (error) {
          console.log('🔍 DEBUG: Ranking handler - Could not fetch applicant member, using fallback:', error.message);
          // Fallback: create a basic user object for avatar URL generation
          applicantMember = {
            displayName: currentApp.displayName,
            user: { username: currentApp.username },
            displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`
          };
        }
        
        // Get applicant's current avatar URL (prefer guild avatar, fallback to global avatar, then default)
        const applicantAvatarURL = applicantMember.displayAvatarURL({ size: 512 });
        console.log('🔍 DEBUG: Ranking handler - Applicant avatar URL:', applicantAvatarURL);
        
        // Pre-fetch avatar to warm up Discord CDN cache
        try {
          console.log('🔍 DEBUG: Ranking handler - Pre-fetching applicant avatar to warm CDN cache...');
          const prefetchStart = Date.now();
          await fetch(applicantAvatarURL, { method: 'HEAD' }); // HEAD request to just check if URL is ready
          const prefetchTime = Date.now() - prefetchStart;
          console.log(`🔍 DEBUG: Ranking handler - Applicant avatar pre-fetch completed in ${prefetchTime}ms`);
        } catch (error) {
          console.log('🔍 DEBUG: Ranking handler - Applicant avatar pre-fetch failed (non-critical):', error.message);
        }
        
        // Media Gallery component for displaying applicant avatar
        const galleryComponent = {
          type: 12, // Media Gallery component
          items: [
            {
              media: {
                url: applicantAvatarURL
              },
              description: `Avatar of applicant ${currentApp.displayName || currentApp.username}`
            }
          ]
        };
        console.log('🔍 DEBUG: Media Gallery component created');

        // Create updated ranking buttons
        const rankingButtons = [];
        const userRanking = playerData[guildId]?.rankings?.[currentApp.channelId]?.[userId];
        
        for (let i = 1; i <= 5; i++) {
          const isSelected = userRanking === i;
          rankingButtons.push(
            new ButtonBuilder()
              .setCustomId(`rank_${i}_${currentApp.channelId}_${appIndex}`)
              .setLabel(i.toString())
              .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(isSelected)
          );
        }
        
        const rankingRow = new ActionRowBuilder().addComponents(rankingButtons);
        
        // Create navigation buttons
        const navButtons = [];
        if (allApplications.length > 1) {
          navButtons.push(
            new ButtonBuilder()
              .setCustomId(`ranking_prev_${appIndex}`)
              .setLabel('◀ Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(appIndex === 0),
            new ButtonBuilder()
              .setCustomId(`ranking_next_${appIndex}`)
              .setLabel('Next ▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(appIndex === allApplications.length - 1)
          );
        }
        
        navButtons.push(
          new ButtonBuilder()
            .setCustomId('ranking_view_all_scores')
            .setLabel('📊 View All Scores')
            .setStyle(ButtonStyle.Primary)
        );
        
        const navRow = new ActionRowBuilder().addComponents(navButtons);
        
        // Calculate updated average score
        const allRankings = playerData[guildId]?.rankings?.[currentApp.channelId] || {};
        const rankings = Object.values(allRankings).filter(r => r !== undefined);
        const avgScore = rankings.length > 0 ? (rankings.reduce((a, b) => a + b, 0) / rankings.length).toFixed(1) : 'No scores';
        
        // Create updated container
        const castRankingContainer = {
          type: 17,
          accent_color: 0x9B59B6,
          components: [
            {
              type: 10,
              content: `## Cast Ranking | ${guild.name}`
            },
            {
              type: 14
            },
            {
              type: 10,
              content: `> **Applicant ${appIndex + 1} of ${allApplications.length}**\n**Name:** ${currentApp.displayName || currentApp.username}\n**Average Score:** ${avgScore} (${rankings.length} vote${rankings.length !== 1 ? 's' : ''})\n**Your Score:** ${userRanking || 'Not rated'}\n**App:** <#${currentApp.channelId}>`
            },
            galleryComponent,
            {
              type: 10,
              content: `> **Rate this applicant (1-5):**`
            },
            rankingRow.toJSON(),
            {
              type: 14
            },
            navRow.toJSON()
          ]
        };
        
        console.log('🔍 DEBUG: Final container structure:', JSON.stringify(castRankingContainer, null, 2));
        console.log('🔍 DEBUG: Sending updated message response...');
        
        const response = {
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: (1 << 15),
            components: [castRankingContainer]
          }
        };
        
        console.log('🔍 DEBUG: Full response structure:', JSON.stringify(response, null, 2));
        return res.send(response);
        
      } catch (error) {
        console.error('Error handling ranking button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing ranking.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('ranking_')) {
      // Handle ranking navigation and view all scores
      console.log('🔍 DEBUG: Processing ranking navigation click:', custom_id);
      try {
        console.log('🔍 DEBUG: Extracting guild and user info for navigation...');
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const userId = req.body.member.user.id;
        console.log('🔍 DEBUG: Navigation - Guild ID:', guildId, 'User ID:', userId);

        // Check admin permissions
        console.log('🔍 DEBUG: Checking navigation admin permissions...');
        const member = await guild.members.fetch(userId);
        console.log('🔍 DEBUG: Navigation member permissions:', member.permissions.bitfield.toString());
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          console.log('🔍 DEBUG: Navigation user lacks admin permissions, sending error response');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need admin permissions to access rankings.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        console.log('🔍 DEBUG: Navigation admin permissions verified');

        console.log('🔍 DEBUG: Loading navigation data...');
        const playerData = await loadPlayerData();
        const allApplications = await getAllApplicationsFromData(guildId);
        console.log('🔍 DEBUG: Navigation found', allApplications.length, 'applications');

        if (custom_id === 'ranking_view_all_scores') {
          // Generate comprehensive score summary
          let scoreSummary = `## All Cast Rankings | ${guild.name}\n\n`;
          
          // Calculate scores for each applicant
          const applicantScores = allApplications.map((app, index) => {
            const rankings = playerData[guildId]?.rankings?.[app.channelId] || {};
            const scores = Object.values(rankings).filter(r => r !== undefined);
            const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            
            return {
              name: app.displayName || app.username,
              avgScore,
              voteCount: scores.length,
              index: index + 1
            };
          });
          
          // Sort by average score (highest first)
          applicantScores.sort((a, b) => b.avgScore - a.avgScore);
          
          // Build ranking display
          scoreSummary += '> **Ranked by Average Score:**\n\n';
          applicantScores.forEach((applicant, rank) => {
            const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`;
            const scoreDisplay = applicant.avgScore > 0 ? applicant.avgScore.toFixed(1) : 'Unrated';
            scoreSummary += `${medal} **${applicant.name}** - ${scoreDisplay}/5.0 (${applicant.voteCount} vote${applicant.voteCount !== 1 ? 's' : ''})\n`;
          });
          
          const summaryContainer = {
            type: 17,
            accent_color: 0xF39C12,
            components: [
              {
                type: 10,
                content: scoreSummary
              }
            ]
          };
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: (1 << 15), // IS_COMPONENTS_V2 flag only, remove EPHEMERAL to make public
              components: [summaryContainer]
            }
          });
        }
        
        // Handle navigation (prev/next)
        console.log('🔍 DEBUG: Checking for navigation match...');
        const navMatch = custom_id.match(/^ranking_(prev|next)_(\d+)$/);
        if (navMatch) {
          console.log('🔍 DEBUG: Navigation match found:', navMatch);
          const [, direction, currentIndexStr] = navMatch;
          const currentIndex = parseInt(currentIndexStr);
          const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
          console.log('🔍 DEBUG: Navigation - Direction:', direction, 'Current:', currentIndex, 'New:', newIndex);
          
          if (newIndex < 0 || newIndex >= allApplications.length) {
            console.log('🔍 DEBUG: Invalid navigation index, sending error');
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Invalid navigation.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          const currentApp = allApplications[newIndex];
          console.log('🔍 DEBUG: Navigation found current app:', currentApp.displayName || currentApp.username);
          
          // Regenerate interface for new applicant
          console.log('🔍 DEBUG: Creating navigation Media Gallery component...');
          
          // Fetch the applicant as a guild member to get their current avatar
          let applicantMember;
          try {
            applicantMember = await guild.members.fetch(currentApp.userId);
            console.log('🔍 DEBUG: Navigation handler - Successfully fetched applicant member:', applicantMember.displayName || applicantMember.user.username);
          } catch (error) {
            console.log('🔍 DEBUG: Navigation handler - Could not fetch applicant member, using fallback:', error.message);
            // Fallback: create a basic user object for avatar URL generation
            applicantMember = {
              displayName: currentApp.displayName,
              user: { username: currentApp.username },
              displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`
            };
          }
          
          // Get applicant's current avatar URL (prefer guild avatar, fallback to global avatar, then default)
          const applicantAvatarURL = applicantMember.displayAvatarURL({ size: 512 });
          console.log('🔍 DEBUG: Navigation handler - Applicant avatar URL:', applicantAvatarURL);
          
          // Pre-fetch avatar to warm up Discord CDN cache
          try {
            console.log('🔍 DEBUG: Navigation handler - Pre-fetching applicant avatar to warm CDN cache...');
            const prefetchStart = Date.now();
            await fetch(applicantAvatarURL, { method: 'HEAD' }); // HEAD request to just check if URL is ready
            const prefetchTime = Date.now() - prefetchStart;
            console.log(`🔍 DEBUG: Navigation handler - Applicant avatar pre-fetch completed in ${prefetchTime}ms`);
          } catch (error) {
            console.log('🔍 DEBUG: Navigation handler - Applicant avatar pre-fetch failed (non-critical):', error.message);
          }
          
          // Media Gallery component for displaying applicant avatar
          const galleryComponent = {
            type: 12, // Media Gallery component
            items: [
              {
                media: {
                  url: applicantAvatarURL
                },
                description: `Avatar of applicant ${currentApp.displayName || currentApp.username}`
              }
            ]
          };
          console.log('🔍 DEBUG: Navigation Media Gallery component created');

          const rankingButtons = [];
          const userRanking = playerData[guildId]?.rankings?.[currentApp.channelId]?.[userId];
          
          for (let i = 1; i <= 5; i++) {
            const isSelected = userRanking === i;
            rankingButtons.push(
              new ButtonBuilder()
                .setCustomId(`rank_${i}_${currentApp.channelId}_${newIndex}`)
                .setLabel(i.toString())
                .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(isSelected)
            );
          }
          
          const rankingRow = new ActionRowBuilder().addComponents(rankingButtons);
          
          const navButtons = [];
          if (allApplications.length > 1) {
            navButtons.push(
              new ButtonBuilder()
                .setCustomId(`ranking_prev_${newIndex}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newIndex === 0),
              new ButtonBuilder()
                .setCustomId(`ranking_next_${newIndex}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newIndex === allApplications.length - 1)
            );
          }
          
          navButtons.push(
            new ButtonBuilder()
              .setCustomId('ranking_view_all_scores')
              .setLabel('📊 View All Scores')
              .setStyle(ButtonStyle.Primary)
          );
          
          const navRow = new ActionRowBuilder().addComponents(navButtons);
          
          const allRankings = playerData[guildId]?.rankings?.[currentApp.channelId] || {};
          const rankings = Object.values(allRankings).filter(r => r !== undefined);
          const avgScore = rankings.length > 0 ? (rankings.reduce((a, b) => a + b, 0) / rankings.length).toFixed(1) : 'No scores';
          
          const castRankingContainer = {
            type: 17,
            accent_color: 0x9B59B6,
            components: [
              {
                type: 10,
                content: `## Cast Ranking | ${guild.name}`
              },
              {
                type: 14
              },
              {
                type: 10,
                content: `> **Applicant ${newIndex + 1} of ${allApplications.length}**\n**Name:** ${currentApp.displayName || currentApp.username}\n**Average Score:** ${avgScore} (${rankings.length} vote${rankings.length !== 1 ? 's' : ''})\n**Your Score:** ${userRanking || 'Not rated'}\n**App:** <#${currentApp.channelId}>`
              },
              galleryComponent,
              {
                type: 10,
                content: `> **Rate this applicant (1-5):**`
              },
              rankingRow.toJSON(),
              {
                type: 14
              },
              navRow.toJSON()
            ]
          };
          
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              flags: (1 << 15),
              components: [castRankingContainer]
            }
          });
        }
        
      } catch (error) {
        console.error('Error handling ranking navigation:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing ranking navigation.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('show_castlist')) {
      // Extract castlist name from custom_id if present
      const castlistMatch = custom_id.match(/^show_castlist(?:_(.+))?$/);
      const requestedCastlist = castlistMatch?.[1] || 'default';
      
      console.log('Button clicked, processing legacy castlist for:', requestedCastlist);
      
      // Execute the exact same logic as the legacy castlist command
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;

        // Determine which castlist to show
        const castlistToShow = await determineCastlistToShow(guildId, userId, requestedCastlist);
        console.log(`Selected castlist: ${castlistToShow}`);

        // Load tribe data based on selected castlist
        const tribes = await getGuildTribes(guildId, castlistToShow);
        console.log('Loaded tribes:', JSON.stringify(tribes));

        // Check if any tribes exist
        if (tribes.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [{
                title: 'CastBot: Dynamic Castlist',
                description: 'No tribes have been added to the default Castlist yet. Please have Production add tribes via the `/prod_menu` > `🔥 Tribes` Button > `🛠️ Add Tribe`.',
                color: 0x7ED321
              }],
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Check permissions BEFORE sending deferred response to determine response type
        const member = req.body.member;
        const channelId = req.body.channel_id;
        const canSendMessages = await canSendMessagesInChannel(member, channelId, client);
        console.log(`Pre-deferred permission check: User ${member?.user?.username} can send messages in channel ${channelId}: ${canSendMessages}`);
        
        // Send appropriate deferred response based on permissions
        if (canSendMessages) {
          // User can send messages - public deferred response
          res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
        } else {
          // User cannot send messages - ephemeral deferred response
          res.send({ 
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: InteractionResponseFlags.EPHEMERAL }
          });
          console.log(`Sent ephemeral deferred response for user ${member?.user?.username}`);
        }

        const guild = await client.guilds.fetch(guildId);
        console.log('Guild:', guild.name);

        if (!guild) {
          throw new Error('Could not fetch guild');
        }

        // Fetch the full guild with roles cache
        const fullGuild = await client.guilds.fetch(guildId, { force: true });
        await fullGuild.roles.fetch();
        const members = await fullGuild.members.fetch();

        // Check if we should omit spacers to fit within Discord's 25 field limit
        const omitSpacers = await shouldOmitSpacers(tribes, fullGuild);
        if (omitSpacers) {
          console.log('Omitting spacers to fit content within 25 field limit');
        }

        // Check if total fields would exceed 25 (moved from /add_tribe for v1/v2 compatibility)
        let totalTribes = 0;
        let totalPlayers = 0;
        
        for (const tribe of tribes) {
          try {
            const tribeRole = await fullGuild.roles.fetch(tribe.roleId);
            if (!tribeRole) continue;
            
            totalTribes++;
            const tribeMembers = members.filter(member => member.roles.cache.has(tribe.roleId));
            totalPlayers += tribeMembers.size;
          } catch (error) {
            console.error(`Error counting fields for tribe ${tribe.roleId}:`, error);
          }
        }
        
        const totalFields = totalTribes + totalPlayers;
        if (totalFields > 25) {
          console.log(`Castlist v1 field limit exceeded: ${totalTribes} tribes + ${totalPlayers} players = ${totalFields} fields (max 25)`);
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `You are trying to show too many players on your castlist at once. The maximum \`(number of tribes + number of players)\` must be 25 or less. Currently: \`${totalTribes} tribes + ${totalPlayers} players = ${totalFields} fields\`.

To fix this:
1) If you have any redundant / old tribes, remove them with \`/clear_tribe <@TribeRole>\`
2) If you are running a season with a large number of players / tribes, you can split these off to custom castlists. Use \`/clear_tribe <@TribeRole>\` to clear one or more tribes, then use \`/add_tribe <@TribeRole>\` and then under the slash command options click 'castlist' and type in a custom name (such as the tribe name). You can then display that castlist using \`/castlist <customname>\`, and any players who are on that castlist will see that with \`/castlist\` instead of the default.

**Tip:** Try using \`/castlist2\` which supports unlimited tribes with pagination!`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
          return;
        }

        // Default color (in hex format)
        const defaultColor = "#7ED321";
        let currentColor = defaultColor;

        // Create the embed first
        const embedTitle = castlistToShow === 'default' 
          ? 'CastBot: Dynamic Castlist'
          : `CastBot: Dynamic Castlist (${castlistToShow})`;
        
        const embed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setAuthor({ 
            name: fullGuild.name || 'Unknown Server', 
            iconURL: fullGuild.iconURL() || undefined 
          })
          .setColor(defaultColor)  // Start with default color
          .setFooter({ 
            text: 'Want dynamic castlist for your ORG? Simply click on \'CastBot\' and click +Add App!',
            iconURL: client.user.displayAvatarURL()
          });

        console.log('Starting to process tribes for castlist. Initial color:', defaultColor);
        
        // Track if any tribe has a color
        let hasFoundColor = false;
        
        // Add each tribe that has members
        for (const tribe of tribes) {
          try {
            const tribeRole = await fullGuild.roles.fetch(tribe.roleId);
            if (!tribeRole) {
              console.log(`Could not find role for tribe ${tribe.roleId}`);
              continue;
            }

            console.log(`Processing tribe role: ${tribeRole.name} (${tribe.roleId})`);
            console.log('Tribe data:', JSON.stringify(tribe));

            // Update the embed color if this tribe has a color specified
            if (tribe.color) {
              hasFoundColor = true;
              currentColor = tribe.color;
              
              try {
                // Convert hex color to a format Discord.js can understand
                // If it already has the # prefix, use it directly
                const colorValue = tribe.color.startsWith('#') ? 
                  tribe.color : `#${tribe.color}`;
                
                console.log(`Setting embed color to ${colorValue} for tribe ${tribeRole.name}`);
                embed.setColor(colorValue);
              } catch (colorErr) {
                console.error(`Error setting color ${tribe.color}:`, colorErr);
              }
            }

            // Add spacer if this isn't the first tribe and we're not omitting spacers
            if (embed.data.fields?.length > 0 && !omitSpacers) {
              embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
            }

            // Add tribe header
            const header = tribe.emoji
              ? `${tribe.emoji}  ${tribeRole.name}  ${tribe.emoji}`
              : tribeRole.name;
            
            embed.addFields({ name: header, value: '\u200B', inline: false });

            // Get members with this role
            const tribeMembers = members.filter(member => member.roles.cache.has(tribe.roleId));
            const memberFields = await createMemberFields(tribeMembers, fullGuild, tribe);
            console.log(`Generated ${memberFields.length} member fields for tribe ${tribeRole.name}`);

            if (embed.data.fields.length + memberFields.length > 25) {
              throw new Error('Embed field limit exceeded');
            }

            embed.addFields(memberFields);

          } catch (error) {
            if (error.message === 'Embed field limit exceeded') {
              console.error('Embed field limit exceeded, sending error message');
              const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
              await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: {
                  content: 'Cannot display castlist: Too many fields (maximum 25). Consider splitting tribes into separate castlists using the castlist parameter in /add_tribe.',
                  flags: InteractionResponseFlags.EPHEMERAL
                },
              });
              return;
            }
            console.error(`Error processing tribe:`, error);
          }
        }

        // Check the color that will be used in the embed
        console.log(`Final embed color settings:`);
        console.log(`- hasFoundColor: ${hasFoundColor}`);
        console.log(`- currentColor: ${currentColor}`);
        console.log(`- embed.data.color: ${embed.data.color || 'not set'}`);

        // If no tribe had a color, make sure we're using the default color
        if (!hasFoundColor) {
          embed.setColor(defaultColor);
          console.log(`No tribe colors found, setting to default: ${defaultColor}`);
        }

        // Edit the initial response with the embed
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            embeds: [embed],
          },
        });

      } catch (error) {
        console.error('Error handling legacy castlist button:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error displaying castlist.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
      return;
    } else if (custom_id === 'viral_menu') {
      // Handle menu button click from castlist (admin/user routing)
      try {
        const member = req.body.member;
        const isAdmin = hasAdminPermissions(member);
        const guildId = req.body.guild_id;
        
        console.log(`Menu button clicked: Admin=${isAdmin}, User=${member?.user?.username || 'unknown'}`);
        
        if (isAdmin) {
          // Admin user - redirect to production menu interface (same as /prod_menu command)
          const guild = await client.guilds.fetch(guildId);
          const playerData = await loadPlayerData();
          
          // Create the full Components V2 admin interface (same as prod_menu)
          const userId = member?.user?.id;
          const menuResponse = await createProductionMenuInterface(guild, playerData, guildId, userId);
          
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: menuResponse
          });
        } else { // Player Menu code
          // Regular user - use new player management UI
          const playerData = await loadPlayerData();
          const userId = member.user.id;
          const guild = await client.guilds.fetch(guildId);
          const targetMember = await guild.members.fetch(userId);
          
          // Create player management UI
          const managementUI = await createPlayerManagementUI({
            mode: PlayerManagementMode.PLAYER,
            targetMember,
            playerData,
            guildId,
            userId,
            showUserSelect: false,
            showVanityRoles: false,
            title: 'CastBot | Player Menu',
            client
          });
          
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              ...managementUI,
              flags: (managementUI.flags || 0) | InteractionResponseFlags.EPHEMERAL
            }
          });
        }
      } catch (error) {
        console.error('Error handling menu button:', error);
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating menu.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      return;
    } else if (custom_id === 'getting_started') {
      // Execute the same logic as the getting_started command
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        const embed = new EmbedBuilder()
          .setTitle('CastBot: Dynamic Castlist')
          .setAuthor({ 
            name: guild.name || 'Unknown Server', 
            iconURL: guild.iconURL() || undefined 
          })
          .setColor('#7ED321')
          .addFields([
            {
              name: 'Getting Started!',
              value: 'CastBot provides a simple to set up, dynamically updating castlist with auto-generated player emojis and live times for each player. Follow the instructions below to get the castlist setup for your next season!'
            },
            {
              name: 'Too Long; Didn\'t Read (tl;dr)',
              value: 'Run `/setup_castbot` to create your pronoun and timezone roles. Then assign your pronoun, timezone and tribe role to each player and type `/castlist`.'
            },
            {
              name: '1️⃣ Set up Pronouns and Timezone roles',
              value: 'CastBot uses Discord roles to track player Pronouns, Timezones and Tribes. Run `/setup_castbot` and CastBot will create the majority of pronouns and timezones roles needed in your server, and add them to its database. If you already have pronoun roles set up, it should automatically detect and add them.'
            },
            {
              name: '2️⃣ Assign Pronoun and Timezone roles to players',
              value: 'Now you must assign the corresponding Pronoun and Timezone roles to each player. You can do this either manually by assigning the player the relevant role in Discord (e.g., He/Him, EST), or you can have the players do the work for you by typing `/player_set_pronouns` and `/player_set_timezone` (such as in their subs) which will allow the players to self assign from a react for roles prompt! You can include these commands as instructions to applicants as part of your season application process so they set their own pronouns and timezones.'
            },
            {
              name: '3️⃣ Set Player Ages',
              value: 'Use `/menu` → Manage Players to set player ages individually through the admin interface, or have players set their own age using `/menu` → Age.'
            },
            {
              name: '4️⃣ Add Tribes to Castlist',
              value: 'Run `/add_tribe` for each tribe you want to add to your castlist, selecting the Discord Role for the tribe to add. Players with that role will appear in `/castlist`, and when the role is cleared (e.g., they are eliminated), they will no longer appear in the castlist. Use `/clear_tribe` to remove tribes from the castlist.'
            },
            {
              name: '📃 Final Step - view the Castlist!',
              value: 'Type the `/castlist` command in a channel to see your default dynamic castlist. Be sure to let players know they can use the command themselves, such as in their subs or confessionals.'
            },
            {
              name: '🔁 How to swap / merge / exile / redemption',
              value: 'Remove your old tribes with `/clear_tribe @TribeRole` and add your new swap tribe roles with `/add_tribe @NewTribeRole`. If you are using redemption or exile style twists, simply create and assign a role for those players (e.g. @Exile) and add the role to the castlist.'
            },
            {
              name: 'How to create additional castlists',
              value: 'You can create additional castlists - for example if you want to show the Production team pronoun information, creating ad-hoc teams for challenges post-merge, etc. To do this, use `/add_tribe`, select the Tribe Role and then click on the castlist option and type a name for your new castlist (e.g., production). You can then view that castlist by typing `/castlist *castlistname*`, e.g. /castlist production.'
            }            
          ])
          .setFooter({ 
            text: 'Want dynamic castlist for your ORG? Simply click on \'CastBot\' and click +Add App!',
            iconURL: client.user.displayAvatarURL()
          });

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [embed],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling getting_started button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error displaying getting started guide.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'admin_manage_player') {
      // Admin player management - use new modular system
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const channelId = req.body.channel_id;
        
        // Check admin permissions
        const member = await guild.members.fetch(req.body.member.user.id);
        if (!hasAdminPermissions(member)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Load player data
        const playerData = await loadPlayerData();

        // Create player management UI using the new module
        const managementUI = await createPlayerManagementUI({
          mode: PlayerManagementMode.ADMIN,
          targetMember: null, // No member selected initially
          playerData,
          guildId,
          userId: req.body.member.user.id,
          showUserSelect: true,
          showVanityRoles: true,
          title: `Player Management | ${guild.name}`,
          client
        });

        // Remove ephemeral flag for production menu context
        managementUI.flags = (1 << 15); // Only IS_COMPONENTS_V2

        return await sendProductionSubmenuResponse(res, channelId, managementUI.components);
        
      } catch (error) {
        console.error('Error handling admin_manage_player button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading player management interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'setup_castbot') {
      // Execute setup using new roleManager module
      try {
        console.log('🔍 DEBUG: Starting setup_castbot handler');
        
        // Send deferred response first
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Execute comprehensive setup using roleManager
        console.log('🔍 DEBUG: Calling executeSetup from roleManager');
        const setupResults = await executeSetup(guildId, guild);
        
        // Generate detailed response message with new format
        const responseMessage = generateSetupResponse(setupResults);
        
        // Send response with enhanced formatting
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: responseMessage,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
        console.log('✅ DEBUG: Setup completed successfully');
        
      } catch (error) {
        console.error('❌ ERROR: setup_castbot handler failed:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: '❌ Error during role setup. Please check bot permissions and try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_setup') {
      // Setup - always show setup interface (no "subsequent run" detection)
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

        // Always show setup button - removed first run vs subsequent run detection
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: '# Setup\n\nClick the Setup button to create/configure pronoun and timezone roles for your server.\n\n💡 This setup can be run multiple times safely - existing roles will be detected and added to CastBot.',
            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId('setup_castbot')
                    .setLabel('Run Setup')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚙️')
                )
            ]
          }
        });
        
      } catch (error) {
        console.error('Error handling prod_setup button:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error during setup.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_manage_pronouns_timezones') {
      // Show pronouns/timezones management menu
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const channelId = req.body.channel_id;
        
        const managementRow1 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('prod_view_timezones')
              .setLabel('View Timezones')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🌍'),
            new ButtonBuilder()
              .setCustomId('prod_edit_timezones')
              .setLabel('Bulk Modify (no offset)')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⏲️'),
            new ButtonBuilder()
              .setCustomId('prod_add_timezone')
              .setLabel('🗺️ Add Timezone (incl. Offset)')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('prod_timezone_react')
              .setLabel('Post React for Timezones')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('👍')
          );
          
        const managementRow2 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('prod_view_pronouns')
              .setLabel('View Pronouns')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('💜'),
            new ButtonBuilder()
              .setCustomId('prod_edit_pronouns')
              .setLabel('Edit Pronouns')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('💙'),
            new ButtonBuilder()
              .setCustomId('prod_pronoun_react')
              .setLabel('Post React for Pronouns')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('👍')
          );

        // Create Components V2 Container
        const pronounsTimezoneComponents = [
          {
            type: 10, // Text Display component
            content: `## Manage Pronouns & Timezones | ${guild.name}`
          },
          {
            type: 14 // Separator
          },
          {
            type: 10, // Text Display component
            content: `> **Select an action to manage your server's pronoun and timezone roles:**`
          },
          managementRow1.toJSON(),
          managementRow2.toJSON()
        ];
        
        // Always add Back to Main Menu button
        const backRow = createBackToMainMenuButton();
        pronounsTimezoneComponents.push(
          { type: 14 }, // Separator
          backRow.toJSON()
        );
        
        const pronounsTimezoneContainer = {
          type: 17, // Container component
          accent_color: 0x9B59B6, // Purple accent color for pronouns/timezones
          components: pronounsTimezoneComponents
        };

        return await sendProductionSubmenuResponse(res, channelId, [pronounsTimezoneContainer]);
        
      } catch (error) {
        console.error('Error handling prod_manage_pronouns_timezones button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading pronouns/timezones management interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_manage_tribes') {
      // Show tribe management menu
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const channelId = req.body.channel_id;
        
        const tribeRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('prod_view_tribes')
              .setLabel('View Tribes')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔥'),
            new ButtonBuilder()
              .setCustomId('prod_add_tribe')
              .setLabel('Add Tribe')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🛠️'),
            new ButtonBuilder()
              .setCustomId('prod_clear_tribe')
              .setLabel('Clear Tribe')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🧹'),
            new ButtonBuilder()
              .setCustomId('prod_create_emojis')
              .setLabel('Add/Remove Emojis')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('😀')
          );

        // Create Components V2 Container
        const tribesComponents = [
          {
            type: 10, // Text Display component
            content: `## Tribe Management | ${guild.name}`
          },
          {
            type: 14 // Separator
          },
          {
            type: 10, // Text Display component
            content: `> **⚠️ Warning:** Spectators will be able to view your tribe names if you add them before marooning using \`/castlist\`. It is recommended not adding any tribes until players have been assigned the tribe role, after marooning.`
          },
          {
            type: 10, // Text Display component
            content: `> **Select an action to manage your tribes:**`
          },
          tribeRow.toJSON()
        ];
        
        // Always add Back to Main Menu button
        const backRow = createBackToMainMenuButton();
        tribesComponents.push(
          { type: 14 }, // Separator
          backRow.toJSON()
        );
        
        const tribesContainer = {
          type: 17, // Container component
          accent_color: 0xE67E22, // Orange accent color for tribes
          components: tribesComponents
        };

        return await sendProductionSubmenuResponse(res, channelId, [tribesContainer]);
        
      } catch (error) {
        console.error('Error handling prod_manage_tribes button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading tribe management interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_season_applications') {
      // Show Season Applications submenu with two options
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const userId = req.body.member.user.id;
        const channelId = req.body.channel_id;

        // Use helper function to check if we should update the production menu
        const shouldUpdateMessage = await shouldUpdateProductionMenuMessage(channelId);

        // Check admin permissions
        const member = await guild.members.fetch(userId);
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Create Season Applications submenu with two buttons
        const seasonAppsButtons = [
          new ButtonBuilder()
            .setCustomId('season_app_creation')
            .setLabel('Create Application Process')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
          new ButtonBuilder()
            .setCustomId('season_app_ranking')
            .setLabel('Cast Ranking')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏆')
        ];
        
        const seasonAppsRow = new ActionRowBuilder().addComponents(seasonAppsButtons);
        
        // Create Components V2 Container for Season Applications submenu
        const seasonAppsComponents = [
          {
            type: 10, // Text Display component
            content: `## Season Applications | ${guild.name}`
          },
          {
            type: 14 // Separator
          },
          {
            type: 10, // Text Display component
            content: `> **Choose an option below:**`
          },
          seasonAppsRow.toJSON()
        ];
        
        // Always add Back to Main Menu button for consistent UX
        const backRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('prod_menu_back')
              .setLabel('← Back to Main Menu')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⬅️')
          );
        
        seasonAppsComponents.push(
          { type: 14 }, // Separator
          backRow.toJSON()
        );
        
        const seasonAppsContainer = {
          type: 17, // Container component
          accent_color: 0x3498DB, // Blue accent color
          components: seasonAppsComponents
        };
        
        return await sendProductionSubmenuResponse(res, channelId, [seasonAppsContainer], shouldUpdateMessage);
        
      } catch (error) {
        console.error('Error handling prod_season_applications button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading Season Applications interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_safari_menu') {
      // Handle Safari submenu - dynamic content management
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to access Safari features.')) return;

        const channelId = req.body.channel_id;
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const shouldUpdateMessage = await shouldUpdateProductionMenuMessage(channelId);
        
        console.log('🦁 DEBUG: Creating Safari submenu');
        
        // Create Safari submenu
        const safariMenuData = await createSafariMenu(guildId, userId, member);
        
        const responseType = shouldUpdateMessage ? 
          InteractionResponseType.UPDATE_MESSAGE : 
          InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;
        
        return res.send({
          type: responseType,
          data: {
            ...safariMenuData,
            flags: (safariMenuData.flags || 0) | InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error loading Safari interface:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading Safari interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'reece_stuff_menu') {
      // Handle Reece Stuff submenu - special admin features
      try {
        const userId = req.body.member.user.id;
        
        // Security check - only allow specific Discord ID
        if (!requireSpecificUser(req, res, '391415444084490240', 'Access denied. This feature is restricted.')) return;

        const channelId = req.body.channel_id;
        const guildId = req.body.guild_id;
        const shouldUpdateMessage = await shouldUpdateProductionMenuMessage(channelId);
        
        // Create Reece Stuff submenu
        const reeceMenuData = await createReeceStuffMenu();
        
        const responseType = shouldUpdateMessage ? 
          InteractionResponseType.UPDATE_MESSAGE : 
          InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;
        
        return res.send({
          type: responseType,
          data: {
            ...reeceMenuData,
            flags: (reeceMenuData.flags || 0) | InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling reece_stuff_menu button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading Reece Stuff interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_manage_safari_buttons') {
      // Handle Safari Button Management submenu
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage Safari buttons.')) return;
        
        console.log(`🎛️ DEBUG: Opening Safari button management interface`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const buttons = Object.values(safariData[guildId]?.buttons || {});
        
        // Create button management buttons
        const managementButtons = [
          new ButtonBuilder()
            .setCustomId('safari_create_button')
            .setLabel('Create Custom Button')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
          new ButtonBuilder()
            .setCustomId('safari_view_buttons')
            .setLabel('View All Buttons')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊'),
          new ButtonBuilder()
            .setCustomId('safari_button_manage_existing')
            .setLabel('Edit Existing Button')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✏️')
        ];
        
        const managementRow = new ActionRowBuilder().addComponents(managementButtons);
        
        // Create posting button row
        const postingButtons = [
          new ButtonBuilder()
            .setCustomId('safari_post_button')
            .setLabel('Post Custom Button')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤')
        ];
        
        const postingRow = new ActionRowBuilder().addComponents(postingButtons);
        
        // Create back button
        const backButton = new ButtonBuilder()
          .setCustomId('prod_safari_menu')
          .setLabel('⬅ Back to Safari')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        // Create button summary
        const buttonCount = buttons.length;
        const totalUsage = buttons.reduce((sum, btn) => sum + (btn.metadata?.usageCount || 0), 0);
        const buttonsWithActions = buttons.filter(btn => btn.actions && btn.actions.length > 0).length;
        
        // Build container components
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 📌 Manage Safari Buttons\n\nCreate, edit, and manage your interactive custom buttons.\n\n**📊 Statistics:**\n• **Total Buttons:** ${buttonCount}\n• **With Actions:** ${buttonsWithActions}\n• **Total Usage:** ${totalUsage} interactions`
          },
          managementRow.toJSON(), // Management buttons
          postingRow.toJSON(), // Posting buttons
          {
            type: 14 // Separator
          },
          backRow.toJSON() // Back navigation
        ];
        
        // Create Components V2 Container
        const container = {
          type: 17, // Container component
          accent_color: 0x3498db, // Blue accent color
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error handling safari_manage_safari_buttons:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading Safari button management interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_menu_back') {
      // Handle Back to Main Menu - restore production menu interface
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const userId = req.body.member.user.id;

        // Check admin permissions
        const member = await guild.members.fetch(userId);
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Load player data and create main production menu
        const playerData = await loadPlayerData();
        const menuData = await createProductionMenuInterface(guild, playerData, guildId, userId);

        // Always use UPDATE_MESSAGE for Back button since it should replace the current message
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: menuData
        });

      } catch (error) {
        console.error('Error handling prod_menu_back button:', error);
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: 'Error loading main menu interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'season_app_creation') {
      // Handle Creation Application Process - show the original application modal
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const userId = req.body.member.user.id;

        // Check admin permissions
        const member = await guild.members.fetch(userId);
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Show the application button configuration modal (original logic)
        const modal = createApplicationButtonModal();
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal
        });
        
      } catch (error) {
        console.error('Error handling season_app_creation button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading application creation interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'season_app_ranking') {
      // Handle Cast Ranking - show gallery with ranking system
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const userId = req.body.member.user.id;

        // Check admin permissions
        const member = await guild.members.fetch(userId);
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Load applications data - Use helper function to get all applications from stored data
        const allApplications = await getAllApplicationsFromData(guildId);
        
        console.log(`Found ${allApplications.length} applications for ranking`);
        console.log('Debug - Guild ID:', guildId);
        
        // Debug: Check what's actually in playerData
        const playerData = await loadPlayerData();
        console.log('Debug - Guild exists in playerData:', !!playerData[guildId]);
        console.log('Debug - Applications section exists:', !!playerData[guildId]?.applications);
        if (playerData[guildId]?.applications) {
          console.log('Debug - Application keys:', Object.keys(playerData[guildId].applications));
          console.log('Debug - Application data:', JSON.stringify(playerData[guildId].applications, null, 2));
        }
        
        if (allApplications.length > 0) {
          console.log('Applications:', allApplications.map(app => `${app.displayName} (${app.channelName})`).join(', '));
        }

        if (allApplications.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '📝 No applications found for this server. Create application buttons first using "Creation Application Process".',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get first application for initial display (we'll implement pagination later)
        const currentApp = allApplications[0];
        const appIndex = 0;
        
        // Fetch the applicant as a guild member to get their current avatar
        let applicantMember;
        try {
          applicantMember = await guild.members.fetch(currentApp.userId);
          console.log('🔍 DEBUG: Successfully fetched applicant member:', applicantMember.displayName || applicantMember.user.username);
        } catch (error) {
          console.log('🔍 DEBUG: Could not fetch applicant member, using fallback:', error.message);
          // Fallback: create a basic user object for avatar URL generation
          applicantMember = {
            displayName: currentApp.displayName,
            user: { username: currentApp.username },
            displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`
          };
        }
        
        // Get applicant's current avatar URL (prefer guild avatar, fallback to global avatar, then default)
        const applicantAvatarURL = applicantMember.displayAvatarURL({ size: 512 });
        console.log('🔍 DEBUG: Applicant avatar URL:', applicantAvatarURL);
        
        // Pre-fetch avatar to warm up Discord CDN cache
        try {
          console.log('🔍 DEBUG: Pre-fetching applicant avatar to warm CDN cache...');
          const prefetchStart = Date.now();
          await fetch(applicantAvatarURL, { method: 'HEAD' }); // HEAD request to just check if URL is ready
          const prefetchTime = Date.now() - prefetchStart;
          console.log(`🔍 DEBUG: Applicant avatar pre-fetch completed in ${prefetchTime}ms`);
        } catch (error) {
          console.log('🔍 DEBUG: Applicant avatar pre-fetch failed (non-critical):', error.message);
        }
        
        // Create Media Gallery component for displaying applicant avatar
        const avatarDisplayComponent = {
          type: 12, // Media Gallery component
          items: [
            {
              media: {
                url: applicantAvatarURL
              },
              description: `Avatar of applicant ${currentApp.displayName || currentApp.username}`
            }
          ]
        };

        // Create ranking buttons (1-5)
        const rankingButtons = [];
        const userRanking = playerData[guildId]?.rankings?.[currentApp.channelId]?.[userId];
        
        for (let i = 1; i <= 5; i++) {
          const isSelected = userRanking === i;
          rankingButtons.push(
            new ButtonBuilder()
              .setCustomId(`rank_${i}_${currentApp.channelId}_${appIndex}`)
              .setLabel(i.toString())
              .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(isSelected)
          );
        }
        
        const rankingRow = new ActionRowBuilder().addComponents(rankingButtons);
        
        // Create navigation buttons if there are multiple applications
        const navButtons = [];
        if (allApplications.length > 1) {
          navButtons.push(
            new ButtonBuilder()
              .setCustomId(`ranking_prev_${appIndex}`)
              .setLabel('◀ Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(appIndex === 0),
            new ButtonBuilder()
              .setCustomId(`ranking_next_${appIndex}`)
              .setLabel('Next ▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(appIndex === allApplications.length - 1)
          );
        }
        
        // Add View All Scores button
        navButtons.push(
          new ButtonBuilder()
            .setCustomId('ranking_view_all_scores')
            .setLabel('📊 View All Scores')
            .setStyle(ButtonStyle.Primary)
        );
        
        const navRow = new ActionRowBuilder().addComponents(navButtons);
        
        // Calculate average score for current applicant
        const allRankings = playerData[guildId]?.rankings?.[currentApp.channelId] || {};
        const rankings = Object.values(allRankings).filter(r => r !== undefined);
        const avgScore = rankings.length > 0 ? (rankings.reduce((a, b) => a + b, 0) / rankings.length).toFixed(1) : 'No scores';
        
        // Create Components V2 Container for Cast Ranking interface
        const castRankingContainer = {
          type: 17, // Container component
          accent_color: 0x9B59B6, // Purple accent color
          components: [
            {
              type: 10, // Text Display component
              content: `## Cast Ranking | ${guild.name}`
            },
            {
              type: 14 // Separator
            },
            {
              type: 10, // Text Display component
              content: `> **Applicant ${appIndex + 1} of ${allApplications.length}**\n**Name:** ${currentApp.displayName || currentApp.username}\n**Average Score:** ${avgScore} (${rankings.length} vote${rankings.length !== 1 ? 's' : ''})\n**Your Score:** ${userRanking || 'Not rated'}\n**App:** <#${currentApp.channelId}>`
            },
            avatarDisplayComponent, // Applicant avatar display
            {
              type: 10, // Text Display component  
              content: `> **Rate this applicant (1-5):**`
            },
            rankingRow.toJSON(), // Ranking buttons
            {
              type: 14 // Separator
            },
            navRow.toJSON() // Navigation and view all scores
          ]
        };
        
        console.log('Sending cast ranking interface...');
        console.log('Container component count:', castRankingContainer.components.length);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [castRankingContainer]
          }
        });
        
      } catch (error) {
        console.error('Error handling season_app_ranking button:', error);
        console.error('Error stack:', error.stack);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Error loading cast ranking interface: ${error.message}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_setup_tycoons') {
      // Execute same logic as setup_tycoons slash command
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const userId = req.body.member.user.id;

        // Check admin permissions
        const member = await guild.members.fetch(userId);
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Call the original handleSetupTycoons function to get the detailed role output
        const result = await handleSetupTycoons(guild);
        
        // Create the full response with original detailed output + new summary
        const responseMessage = `Tycoons roles have been created successfully. Here are the role IDs in the format you requested:

${result.formattedOutput}

## Tycoons Setup Complete!

✅ **Created roles:**
• Host
• Juror
• Spectator
• Pre-Jury

Your server is now ready for Tycoons gameplay!`;

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: responseMessage,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling prod_setup_tycoons button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting up Tycoons roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_analytics_dump') {
      // Special analytics dump button - only available to specific user ID
      try {
        console.log('🔍 DEBUG: Starting analytics dump for user:', req.body.member.user.id);
        const userId = req.body.member.user.id;
        
        // Security check - only allow specific Discord ID
        if (userId !== '391415444084490240') {
          console.log('❌ DEBUG: Access denied for user:', userId);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Access denied. This feature is restricted.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        console.log('✅ DEBUG: User authorized, importing analytics function...');
        // Import and run analytics function
        const { analyzePlayerData } = await import('./analytics.js');
        console.log('✅ DEBUG: Analytics function imported successfully');
        
        // Capture analytics output
        let analyticsOutput = '';
        const originalLog = console.log;
        console.log = (...args) => {
          analyticsOutput += args.join(' ') + '\n';
        };
        
        try {
          console.log('✅ DEBUG: Running analytics function...');
          await analyzePlayerData();
          console.log('✅ DEBUG: Analytics function completed');
        } finally {
          console.log = originalLog; // Restore original console.log
          console.log('✅ DEBUG: Console restored, analytics output length:', analyticsOutput.length);
        }
        
        // Format the output for Discord
        const formattedOutput = analyticsOutput
          .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
          .trim();
        
        // Split into chunks if too long (Discord has 2000 char limit)
        const chunks = [];
        const maxLength = 1900; // Leave room for formatting
        
        if (formattedOutput.length <= maxLength) {
          chunks.push(formattedOutput);
        } else {
          let remaining = formattedOutput;
          while (remaining.length > 0) {
            let chunk = remaining.substring(0, maxLength);
            // Try to break at a newline
            const lastNewline = chunk.lastIndexOf('\n');
            if (lastNewline > maxLength * 0.8) {
              chunk = chunk.substring(0, lastNewline);
            }
            chunks.push(chunk);
            remaining = remaining.substring(chunk.length);
          }
        }
        
        // Send first chunk as response
        console.log('✅ DEBUG: Sending response with', chunks.length, 'chunks');
        res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `## 📊 CastBot Analytics Report\n\n\`\`\`\n${chunks[0]}\n\`\`\``
          }
        });
        
        // Send additional chunks as follow-ups if needed
        for (let i = 1; i < chunks.length; i++) {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}`, {
            method: 'POST',
            body: {
              content: `\`\`\`\n${chunks[i]}\n\`\`\``
            }
          });
        }
        
      } catch (error) {
        console.error('Error running analytics dump:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error running analytics. Check logs for details.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_live_analytics') {
      // Special live analytics button - only available to specific user ID
      try {
        console.log('🔍 DEBUG: Starting live analytics for user:', req.body.member.user.id);
        const userId = req.body.member.user.id;
        
        // Security check - only allow specific Discord ID
        if (userId !== '391415444084490240') {
          console.log('❌ DEBUG: Access denied for live analytics user:', userId);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Access denied. This feature is restricted.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        console.log('✅ DEBUG: Live analytics user authorized...');

        // Import fs and capture live analytics output
        const fs = await import('fs');
        const { getLogFilePath } = await import('./analyticsLogger.js');
        
        const ANALYTICS_LOG_FILE = getLogFilePath();
        
        // Function to format analytics line with Markdown
        function formatAnalyticsLine(line) {
          // Parse format: [8:33AM] Thu 19 Jun 25 | User (username) in Server Name (1234567890) | ACTION_TYPE | details
          const match = line.match(/^(\[[\d:APM]+\]\s+\w{3}\s+\d{1,2}\s+\w{3}\s+\d{2})\s+\|\s+(.+?)\s+in\s+(.+?)\s+\((\d+)\)\s+\|\s+([\w_]+)\s+\|\s+(.+)$/);
          
          if (!match) {
            return line; // Return original if parsing fails
          }
          
          const [, timestamp, user, serverName, serverId, actionType, details] = match;
          
          // Format components with Markdown
          const formattedUser = `**\`${user}\`**`;
          const formattedServer = `__\`${serverName}\`__`;
          
          // Format the action details based on action type
          let formattedDetails;
          if (actionType === 'SLASH_COMMAND') {
            // Bold the entire command for slash commands (e.g., **/menu**)
            formattedDetails = `**${details}**`;
          } else if (actionType === 'BUTTON_CLICK') {
            // For button clicks, bold just the button name (first part before parentheses)
            const buttonMatch = details.match(/^(.+?)\s+\((.+)\)$/);
            if (buttonMatch) {
              const [, buttonName, buttonId] = buttonMatch;
              formattedDetails = `**${buttonName}** (${buttonId})`;
            } else {
              // Fallback if no parentheses found, bold the whole thing
              formattedDetails = `**${details}**`;
            }
          } else {
            // For other action types, keep details as-is
            formattedDetails = details;
          }
          
          return `${timestamp} | ${formattedUser} in ${formattedServer} (${serverId}) | ${actionType} | ${formattedDetails}`;
        }
        
        // Default buttons to filter out (same as liveAnalytics.js)
        const DEFAULT_FILTERED_BUTTONS = [
          'disabled_',
          'castlist2_nav_disabled',
        ];
        
        function shouldFilterOut(logLine, filterPatterns) {
          if (!filterPatterns || filterPatterns.length === 0) return false;
          return filterPatterns.some(pattern => logLine.includes(pattern));
        }
        
        function isWithinRecentDays(logLine, days) {
          if (!days) return true;
          
          // Match format: [8:18AM] Thu 19 Jun 25
          const timestampMatch = logLine.match(/^\[(\d{1,2}:\d{2}[AP]M)\] (\w{3}) (\d{1,2}) (\w{3}) (\d{2})/);
          if (!timestampMatch) return true;
          
          const [, time, dayName, day, month, year] = timestampMatch;
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthIndex = months.indexOf(month);
          
          if (monthIndex === -1) return true;
          
          const logDate = new Date(2000 + parseInt(year), monthIndex, parseInt(day));
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
          
          return logDate >= cutoffDate;
        }
        
        let analyticsOutput = '🔴 LIVE ANALYTICS - Last 3 Days\n';
        analyticsOutput += '═'.repeat(50) + '\n\n';
        
        if (!fs.default.existsSync(ANALYTICS_LOG_FILE)) {
          analyticsOutput += '📊 No analytics data found yet.\n';
          analyticsOutput += 'Use CastBot to generate some interactions!';
        } else {
          const logContent = fs.default.readFileSync(ANALYTICS_LOG_FILE, 'utf8');
          const lines = logContent.split('\n').filter(line => line.trim());
          let displayedCount = 0;
          
          lines.forEach(line => {
            // Check if line matches format: [8:18AM] Thu 19 Jun 25 | ...
            if (line.match(/^\[\d{1,2}:\d{2}[AP]M\]/)) {
              if (!shouldFilterOut(line, DEFAULT_FILTERED_BUTTONS) && isWithinRecentDays(line, 3)) {
                // Parse and format the log line with Markdown
                const formattedLine = formatAnalyticsLine(line);
                analyticsOutput += `* ${formattedLine}\n`;
                displayedCount++;
              }
            }
          });
          
          if (displayedCount === 0) {
            analyticsOutput += '💡 No interactions found in the last 3 days.\n';
            analyticsOutput += 'Try running CastBot commands to generate data!';
          } else {
            analyticsOutput += '\n' + '═'.repeat(50) + '\n';
            analyticsOutput += `📊 Displayed ${displayedCount} interactions from last 3 days`;
          }
        }
        
        // Format the output for Discord
        const formattedOutput = analyticsOutput.trim();
        
        // Split into chunks if too long (Discord has 2000 char limit)
        const chunks = [];
        const maxLength = 1900; // Leave room for formatting
        
        if (formattedOutput.length <= maxLength) {
          chunks.push(formattedOutput);
        } else {
          let remaining = formattedOutput;
          while (remaining.length > 0) {
            let chunk = remaining.substring(0, maxLength);
            // Try to break at a newline
            const lastNewline = chunk.lastIndexOf('\n');
            if (lastNewline > maxLength * 0.8) {
              chunk = remaining.substring(0, lastNewline);
              remaining = remaining.substring(lastNewline + 1);
            } else {
              remaining = remaining.substring(maxLength);
            }
            chunks.push(chunk);
          }
        }
        
        // Send initial response with first chunk
        console.log('✅ DEBUG: Sending live analytics response with', chunks.length, 'chunks, content length:', chunks[0].length);
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: chunks[0]
          }
        });
        
        // Send additional chunks as follow-ups if needed
        for (let i = 1; i < chunks.length; i++) {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}`, {
            method: 'POST',
            body: {
              content: chunks[i]
            }
          });
        }
        
      } catch (error) {
        console.error('Error running live analytics:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error running live analytics. Check logs for details.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_toggle_live_analytics') {
      // Toggle live analytics logging on/off
      try {
        const userId = req.body.member.user.id;
        
        // Security check - only allow specific Discord ID
        if (!requireSpecificUser(req, res, '391415444084490240', 'Access denied. This feature is restricted.')) return;

        console.log('🪵 DEBUG: Starting live analytics toggle for user:', userId);
        
        // Load current configuration
        const config = await loadEnvironmentConfig();
        const currentStatus = config.liveDiscordLogging.enabled;
        
        console.log('🪵 DEBUG: Current live logging status:', currentStatus);
        
        // Toggle the status
        const newStatus = !currentStatus;
        const updatedConfig = await updateLiveLoggingStatus(newStatus);
        
        console.log('🪵 DEBUG: New live logging status:', newStatus);
        
        // Prepare response message
        let responseMessage;
        if (newStatus) {
          responseMessage = `✅ **Live Analytics Logging ENABLED**\n\n` +
                          `📤 Analytics events will now be posted to <#${updatedConfig.targetChannelId}>\n` +
                          `🚫 Excluded users: ${updatedConfig.excludedUserIds.length}`;
        } else {
          responseMessage = `🔴 **Live Analytics Logging DISABLED**\n\n` +
                          `📄 Only file logging will continue\n` +
                          `🚫 Discord channel logging has been paused`;
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: responseMessage,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error toggling live analytics:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error toggling live analytics. Check logs for details.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_server_usage_stats') {
      // Server usage analytics button - only available to specific user ID
      try {
        console.log('📈 DEBUG: Starting server usage stats for user:', req.body.member.user.id);
        const userId = req.body.member.user.id;
        
        // Security check - only allow specific Discord ID
        if (userId !== '391415444084490240') {
          console.log('❌ DEBUG: Access denied for user:', userId);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Access denied. This feature is restricted.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        console.log('✅ DEBUG: User authorized, deferring response for background processing...');
        
        // Defer the response immediately to avoid 3-second timeout
        res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });
        
        // Process analytics in the background
        console.log('✅ DEBUG: Starting background analytics processing...');
        const { generateServerUsageSummary, formatServerUsageForDiscord, formatServerUsageForDiscordV2 } = await import('./serverUsageAnalytics.js');
        console.log('✅ DEBUG: Server usage analytics imported successfully');
        
        // Generate 6-week usage summary
        console.log('✅ DEBUG: Generating server usage summary...');
        const summary = await generateServerUsageSummary(42);
        console.log('✅ DEBUG: Summary generated, formatting for Discord...');
        
        // Format for Discord display - use Components V2 everywhere now
        const discordResponse = formatServerUsageForDiscordV2(summary);
        
        console.log(`✅ DEBUG: Formatted for Discord using Components V2, sending follow-up...`);
        
        // Send follow-up response with results
        const followUpUrl = `https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}`;
        console.log('🔗 DEBUG: Webhook URL:', followUpUrl);
        console.log('📦 DEBUG: Payload size:', JSON.stringify(discordResponse).length, 'characters');
        
        const webhookResponse = await fetch(followUpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(discordResponse)
        });
        
        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error('❌ DEBUG: Webhook failed:', webhookResponse.status, webhookResponse.statusText);
          console.error('❌ DEBUG: Error details:', errorText);
          throw new Error(`Webhook failed: ${webhookResponse.status} ${webhookResponse.statusText}`);
        }
        
        console.log('✅ DEBUG: Follow-up response sent successfully');
        
      } catch (error) {
        console.error('Error running server usage stats:', error);
        
        // If we haven't sent the deferred response yet, send an error response
        if (!res.headersSent) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Error running server usage analytics. Check logs for details.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } else {
          // If we already sent a deferred response, send error via webhook
          try {
            const followUpUrl = `https://discord.com/api/v10/webhooks/${req.body.application_id}/${req.body.token}`;
            await fetch(followUpUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: '❌ Error processing server usage analytics. Please check logs.',
                flags: InteractionResponseFlags.EPHEMERAL
              })
            });
          } catch (webhookError) {
            console.error('❌ DEBUG: Failed to send error via webhook:', webhookError);
          }
        }
      }
    } else if (custom_id === 'test_role_hierarchy') {
      // Test role hierarchy functionality - admin only
      try {
        const userId = req.body.member.user.id;
        
        // Security check - only allow specific Discord ID
        if (!requireSpecificUser(req, res, '391415444084490240', 'Access denied. This feature is restricted.')) return;

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        console.log('🔧 DEBUG: Starting role hierarchy test...');
        
        // Run the test function with your specified roles
        const testResults = testRoleHierarchy(guild, client);
        
        // Create comprehensive response
        const responseLines = [
          '# 🔧 Role Hierarchy Test Results',
          '',
          `**Tests Run:** ${testResults.details.length}`,
          `**Passed:** ${testResults.testsPassed} ✅`,
          `**Failed:** ${testResults.testsFailed} ❌`,
          ''
        ];

        // Add detailed results for each test
        for (const test of testResults.details) {
          const statusEmoji = test.passed ? '✅' : '❌';
          responseLines.push(`${statusEmoji} **${test.roleName}**`);
          responseLines.push(`   Expected: ${test.expected}, Got: ${test.actual}`);
          responseLines.push(`   Details: ${test.details}`);
          responseLines.push('');
        }

        // Add individual role checks using the new general-purpose function
        responseLines.push('## 🔍 Individual Role Analysis');
        responseLines.push('');

        const testRoleIds = ['1335645022774886490', '1385964464393949276'];
        for (const roleId of testRoleIds) {
          const check = canBotManageRole(guild, roleId, client);
          const statusEmoji = check.canManage ? '✅' : '⚠️';
          
          responseLines.push(`${statusEmoji} **Role:** ${check.targetRoleName} (ID: ${roleId})`);
          responseLines.push(`   **Can Manage:** ${check.canManage}`);
          responseLines.push(`   **Bot Role:** ${check.botRoleName} (position ${check.botPosition})`);
          responseLines.push(`   **Target Role:** ${check.targetRoleName} (position ${check.targetPosition})`);
          responseLines.push(`   **Position Difference:** ${check.positionDifference}`);
          
          if (!check.canManage && !check.error) {
            responseLines.push('   **Warning:** This role cannot be assigned to users!');
          }
          
          responseLines.push('');
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: responseLines.join('\n'),
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in role hierarchy test:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error running role hierarchy test. Check logs for details.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_create_button') {
      // Handle Create Custom Button - show initial modal
      console.log('🔍 DEBUG: safari_create_button handler reached');
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to create custom buttons.')) return;

        console.log('📝 DEBUG: Create Custom Button clicked');
        
        // Create button creation modal
        const modal = new ModalBuilder()
          .setCustomId('safari_button_modal')
          .setTitle('Create Custom Button');

        // Button label input
        const labelInput = new TextInputBuilder()
          .setCustomId('button_label')
          .setLabel('Button Label')
          .setPlaceholder('e.g., "Start Adventure"')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80);

        // Button emoji input
        const emojiInput = new TextInputBuilder()
          .setCustomId('button_emoji')
          .setLabel('Button Emoji (optional)')
          .setPlaceholder('e.g., 🗺️')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10);

        // Button description input
        const descInput = new TextInputBuilder()
          .setCustomId('button_description')
          .setLabel('Button Description (for your reference)')
          .setPlaceholder('e.g., "Starts the jungle adventure safari"')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(200);

        const labelRow = new ActionRowBuilder().addComponents(labelInput);
        const emojiRow = new ActionRowBuilder().addComponents(emojiInput);
        const descRow = new ActionRowBuilder().addComponents(descInput);

        modal.addComponents(labelRow, emojiRow, descRow);
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error in safari_create_button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error creating custom button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_post_button') {
      // Handle Post Custom Button - MVP1 placeholder
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to post custom buttons.')) return;

        console.log('📤 DEBUG: Post Custom Button clicked');
        
        const guildId = req.body.guild_id;
        console.log('📤 DEBUG: Guild ID:', guildId);
        
        // Import Safari manager functions
        console.log('📤 DEBUG: Importing safariManager...');
        const { listCustomButtons } = await import('./safariManager.js');
        console.log('📤 DEBUG: safariManager imported successfully');
        
        // Get all custom buttons for this guild
        console.log('📤 DEBUG: Listing custom buttons for guild...');
        const buttons = await listCustomButtons(guildId);
        console.log('📤 DEBUG: Found buttons:', buttons.length);
        
        if (buttons.length === 0) {
          console.log('📤 DEBUG: No buttons found, returning error message');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **No custom buttons found**\n\nCreate a custom button first using **📝 Create Custom Button**.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create working button selection interface
        console.log('📤 DEBUG: Creating working button selection interface...');
        
        // Create button selection dropdown (limit to 25 options for Discord)
        const buttonOptions = buttons.slice(0, 25).map(button => ({
          label: button.label.substring(0, 100), // Ensure label length is valid
          value: button.id,
          description: `${button.actions.length} action${button.actions.length !== 1 ? 's' : ''}`.substring(0, 100)
        }));
        
        const buttonSelect = new StringSelectMenuBuilder()
          .setCustomId('safari_post_select_button')
          .setPlaceholder('Choose a button to post...')
          .addOptions(buttonOptions);
        
        const selectRow = new ActionRowBuilder().addComponents(buttonSelect);
        
        // Create cancel button
        const cancelButton = new ButtonBuilder()
          .setCustomId('prod_safari_menu')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌');
        
        const cancelRow = new ActionRowBuilder().addComponents(cancelButton);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `## 📤 Post Custom Button\n\nSelect a button to post to a channel:\n\n**Available Buttons:** ${buttons.length}`,
            components: [selectRow, cancelRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in safari_post_button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error posting custom button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_manage_currency') {
      // Handle Manage Currency - MVP1 placeholder
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage currency.')) return;

        console.log('💰 DEBUG: Manage Currency clicked');
        
        const guildId = req.body.guild_id;
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const playerData = await loadPlayerData();
        
        // Get all players with safari currency data
        const guildPlayers = playerData[guildId]?.players || {};
        const playersWithCurrency = Object.entries(guildPlayers)
          .filter(([userId, player]) => player.safari?.currency !== undefined)
          .sort(([, a], [, b]) => (b.safari?.currency || 0) - (a.safari?.currency || 0)); // Sort by currency desc
        
        // Create currency management buttons
        const managementButtons = [
          new ButtonBuilder()
            .setCustomId('safari_currency_view_all')
            .setLabel('View All Balances')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👥'),
          new ButtonBuilder()
            .setCustomId('safari_currency_set_player')
            .setLabel('Set Player Currency')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💰'),
          new ButtonBuilder()
            .setCustomId('safari_currency_reset_all')
            .setLabel('Reset All Currency')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
        ];
        
        const managementRow = new ActionRowBuilder().addComponents(managementButtons);
        
        // Create back button
        const backButton = new ButtonBuilder()
          .setCustomId('prod_safari_menu')
          .setLabel('⬅ Back to Safari')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        // Create summary content
        const totalPlayers = playersWithCurrency.length;
        const totalCurrency = playersWithCurrency.reduce((sum, [, player]) => sum + (player.safari?.currency || 0), 0);
        const averageCurrency = totalPlayers > 0 ? Math.round(totalCurrency / totalPlayers) : 0;
        
        // Show top players (limit to 5)
        let topPlayersText = '';
        if (totalPlayers > 0) {
          const topPlayers = playersWithCurrency.slice(0, 5);
          topPlayersText = topPlayers.map(([userId, player], index) => {
            const rank = index + 1;
            const currency = player.safari?.currency || 0;
            return `**${rank}.** <@${userId}> - ${currency} coins`;
          }).join('\n');
        } else {
          topPlayersText = '*No players have currency yet.*';
        }
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 💰 Manage Currency\n\nCurrency system overview and management tools.`
          },
          {
            type: 10, // Text Display component
            content: `> **Players with Currency:** ${totalPlayers}\n> **Total Currency:** ${totalCurrency} coins\n> **Average per Player:** ${averageCurrency} coins`
          },
          {
            type: 10, // Text Display component
            content: `**🏆 Top Players:**\n${topPlayersText}`
          },
          {
            type: 14 // Separator
          },
          managementRow.toJSON(), // Currency management buttons
          {
            type: 14 // Separator
          },
          backRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0xf1c40f, // Gold accent color for currency theme
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL flags
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_manage_currency:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error managing currency.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_round_results') {
      // Handle Round Results - Challenge Game Logic Core Engine
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const channelId = req.body.channel_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to process round results.')) return;
        
        console.log(`🏅 DEBUG: Processing round results for guild ${guildId} in channel ${channelId}`);
        
        // Import Safari manager functions
        const { processRoundResults } = await import('./safariManager.js');
        
        // Process round results and get the result response
        const result = await processRoundResults(guildId, channelId, client);
        
        // The new processRoundResults returns a complete Discord response object
        return res.send(result);
        
      } catch (error) {
        console.error('Error in safari_round_results:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error processing round results. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_round_results_v2') {
      // Handle V2 Round Results - Player-Centric Card Display
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const channelId = req.body.channel_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to process round results.')) return;
        
        console.log(`🎨 DEBUG: Processing V2 round results for guild ${guildId} in channel ${channelId}`);
        
        // Import Safari manager functions - we need both the backend logic and V2 display
        const { processRoundResults } = await import('./safariManager.js');
        
        // Process round results using the same backend logic
        const roundData = await processRoundResults(guildId, channelId, client, true); // Pass flag for V2 mode
        
        // The V2 version should return the V2 display instead of the classic display
        return res.send(roundData);
        
      } catch (error) {
        console.error('Error in safari_round_results_v2:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error processing V2 round results. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_confirm_reset_game') {
      // Handle game reset confirmation
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to reset the game.')) return;
        
        console.log(`🔄 DEBUG: Confirming game reset for guild ${guildId}`);
        
        // Import Safari manager functions
        const { resetGameData } = await import('./safariManager.js');
        
        // Reset game data and get the result response
        const result = await resetGameData(guildId);
        
        // Log the action
        await logInteraction(req.body, 'safari_confirm_reset_game', { guildId });
        
        return res.send(result);
        
      } catch (error) {
        console.error('Error in safari_confirm_reset_game:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error resetting game data. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_view_buttons') {
      // Handle View All Buttons - MVP1 implementation
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to view custom buttons.')) return;

        console.log('📊 DEBUG: View All Buttons clicked');
        
        // Import safari manager and list buttons
        const { listCustomButtons } = await import('./safariManager.js');
        const buttons = await listCustomButtons(guildId);
        
        let content = '## 📊 Custom Buttons\n\n';
        
        if (buttons.length === 0) {
          content += '*No custom buttons created yet.*\n\nUse **Create Custom Button** to get started!';
        } else {
          buttons.forEach((button, index) => {
            const createdDate = new Date(button.metadata.createdAt).toLocaleDateString();
            content += `**${index + 1}.** ${button.label} ${button.emoji || ''}\n`;
            content += `└ Created: ${createdDate} | Actions: ${button.actions.length} | Used: ${button.metadata.usageCount} times\n\n`;
          });
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: content,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in safari_view_buttons:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error viewing custom buttons.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_player_inventory') {
      // Handle "My Nest" player inventory display
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const member = req.body.member;
        
        console.log(`🥚 DEBUG: User ${userId} viewing inventory in guild ${guildId}`);
        
        const inventoryDisplay = await createPlayerInventoryDisplay(guildId, userId, member);
        
        console.log(`📤 DEBUG: About to send inventory response for user ${userId}`);
        
        const response = {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: inventoryDisplay
        };
        
        console.log(`📋 DEBUG: Final response type: ${response.type}, data keys: ${Object.keys(inventoryDisplay)}`);
        
        return res.send(response);
        
      } catch (error) {
        console.error('Error in safari_player_inventory:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading your nest. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_attack_player_disabled_')) {
      // Handle disabled attack button click
      console.log(`⚔️ DEBUG: User clicked disabled attack button`);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ You have no attacks available for this item. Attacks will be available again after the next round results.',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    } else if (custom_id.startsWith('safari_attack_player_')) {
      // Handle attack player button click
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const itemId = custom_id.replace('safari_attack_player_', '');
        
        console.log(`⚔️ DEBUG: User ${userId} wants to attack with item ${itemId}`);
        
        // Import attack system functions
        const { createAttackPlanningUI } = await import('./safariManager.js');
        
        // Create attack planning UI
        const response = await createAttackPlanningUI(guildId, userId, itemId, client);
        
        return res.send(response);
        
      } catch (error) {
        console.error('Error in safari_attack_player handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading attack interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_attack_target')) {
      // Handle target player selection
      try {
        const guildId = req.body.guild_id;
        const attackerId = req.body.member?.user?.id || req.body.user?.id;
        const targetId = req.body.data.values[0];
        
        // Parse state from custom_id: safari_attack_target|itemId|quantity (pipe-separated to avoid underscore conflicts)
        const parts = custom_id.split('|');
        const itemId = parts[1];
        const previousQuantity = parseInt(parts[2]) || 0;
        
        console.log(`⚔️ DEBUG: Attacker ${attackerId} selected target ${targetId} for item ${itemId}, previous quantity: ${previousQuantity}`);
        
        // Update the UI with the selected target
        const { createOrUpdateAttackUI } = await import('./safariManager.js');
        const response = await createOrUpdateAttackUI(guildId, attackerId, itemId, targetId, previousQuantity, client);
        
        return res.send(response);
        
      } catch (error) {
        console.error('Error in safari_attack_target handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting target.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_attack_quantity')) {
      // Handle attack quantity selection
      try {
        const guildId = req.body.guild_id;
        const attackerId = req.body.member?.user?.id || req.body.user?.id;
        const quantity = parseInt(req.body.data.values[0]);
        
        // Parse state from custom_id: safari_attack_quantity|itemId|targetId (pipe-separated to avoid underscore conflicts)
        const parts = custom_id.split('|');
        const itemId = parts[1];
        const targetId = parts[2] !== 'none' ? parts[2] : null;
        
        console.log(`⚔️ DEBUG: Attacker ${attackerId} selected ${quantity} attacks with item ${itemId}, target: ${targetId}`);
        
        // Update the UI with the selected quantity
        const { createOrUpdateAttackUI } = await import('./safariManager.js');
        const response = await createOrUpdateAttackUI(guildId, attackerId, itemId, targetId, quantity, client);
        
        return res.send(response);
        
      } catch (error) {
        console.error('Error in safari_attack_quantity handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting attack quantity.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_schedule_attack_')) {
      // Handle attack scheduling
      try {
        const guildId = req.body.guild_id;
        const attackerId = req.body.member?.user?.id || req.body.user?.id;
        
        // Parse custom_id properly: safari_schedule_attack_itemId_targetId_quantity
        // Handle itemIds with underscores (e.g., raider_499497)
        const parts = custom_id.split('_');
        const itemId = parts[3] + '_' + parts[4]; // Reconstruct itemId (e.g., raider_499497)
        const targetId = parts[5] !== 'none' ? parts[5] : null;
        const quantity = parseInt(parts[6]) || 0;
        
        console.log(`⚔️ DEBUG: Scheduling attack - Attacker: ${attackerId}, Item: ${itemId}, Target: ${targetId}, Quantity: ${quantity}`);
        
        // Get attack details from message components
        // This will be implemented with proper state management
        const { scheduleAttack } = await import('./safariManager.js');
        const response = await scheduleAttack(guildId, attackerId, itemId, req.body, client);
        
        console.log(`📤 DEBUG: About to send response via Express:`, JSON.stringify(response, null, 2));
        
        try {
          const result = res.send(response);
          console.log(`✅ DEBUG: Express res.send() completed successfully`);
          return result;
        } catch (sendError) {
          console.error(`❌ DEBUG: Error in res.send():`, sendError);
          throw sendError;
        }
        
      } catch (error) {
        console.error('Error in safari_schedule_attack handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error scheduling attack.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_customize_terms') {
      // Handle "⚙️ Customize Terms" button - NEW Components V2 Interface
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to customize terms.')) return;
        
        console.log(`⚙️ DEBUG: User ${member.user.id} opening Safari customization interface for guild ${guildId}`);
        
        // Get current custom terms
        const { getCustomTerms } = await import('./safariManager.js');
        const currentTerms = await getCustomTerms(guildId);
        
        // Create new Components V2 Safari customization interface
        const { createSafariCustomizationUI } = await import('./safariConfigUI.js');
        const interfaceData = await createSafariCustomizationUI(guildId, currentTerms);
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: interfaceData
        });
        
      } catch (error) {
        console.error('Error in safari_customize_terms:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error opening Safari customization interface. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_config_group_')) {
      // Handle field group button clicks - Currency, Events, Rounds
      try {
        const guildId = req.body.guild_id;
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to customize Safari terms.')) return;
        
        // Extract group key from custom_id (safari_config_group_currency -> currency)
        const groupKey = custom_id.replace('safari_config_group_', '');
        
        console.log(`⚙️ DEBUG: Opening field group modal for ${groupKey}`);
        
        // Get current custom terms
        const { getCustomTerms } = await import('./safariManager.js');
        const currentTerms = await getCustomTerms(guildId);
        
        // Create field group modal
        const { createFieldGroupModal } = await import('./safariConfigUI.js');
        const modal = await createFieldGroupModal(groupKey, currentTerms);
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error in safari_config_group handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error opening customization modal. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_config_reset_defaults') {
      // Handle reset to defaults button
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to reset Safari settings.')) return;
        
        console.log(`⚙️ DEBUG: Showing reset confirmation interface`);
        
        // Create reset confirmation interface
        const { createResetConfirmationUI } = await import('./safariConfigUI.js');
        const confirmationData = createResetConfirmationUI();
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: confirmationData
        });
        
      } catch (error) {
        console.error('Error in safari_config_reset_defaults:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error showing reset confirmation. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_config_confirm_reset') {
      // Handle confirmed reset to defaults
      try {
        const guildId = req.body.guild_id;
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to reset Safari settings.')) return;
        
        console.log(`⚙️ DEBUG: Resetting Safari settings to defaults for guild ${guildId}`);
        
        // Reset to defaults using existing function
        const { resetCustomTerms } = await import('./safariManager.js');
        const success = await resetCustomTerms(guildId);
        
        if (!success) {
          throw new Error('Failed to reset custom terms');
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '✅ **Safari Settings Reset!**\n\nAll customizations have been reset to default values:\n• Currency: 🪙 coins\n• Inventory: Nest\n• Events: ☀️ Clear Skies / ☄️ Meteor Strike\n• Round probabilities: 75%, 50%, 25%',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in safari_config_confirm_reset:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error resetting Safari settings. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_export_data') {
      // Handle Safari data export
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to export Safari data.')) return;
        
        console.log(`📤 DEBUG: Exporting Safari data for guild ${guildId}`);
        
        // Export Safari data
        const { exportSafariData } = await import('./safariImportExport.js');
        const exportJson = await exportSafariData(guildId);
        
        console.log(`📤 DEBUG: Export data length: ${exportJson.length} characters`);
        
        // Create export modal with data
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        const modal = new ModalBuilder()
          .setCustomId('safari_export_modal')
          .setTitle('Safari Data Export');
        
        const exportInput = new TextInputBuilder()
          .setCustomId('export_data')
          .setLabel('Copy this data to import elsewhere:')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(exportJson)
          .setMaxLength(4000)
          .setRequired(false);
        
        modal.addComponents(new ActionRowBuilder().addComponents(exportInput));
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error in safari_export_data:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error exporting Safari data. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_import_data') {
      // Handle Safari data import
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to import Safari data.')) return;
        
        console.log(`📥 DEBUG: Opening Safari import modal for guild ${guildId}`);
        
        // Create import modal
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        const modal = new ModalBuilder()
          .setCustomId('safari_import_modal')
          .setTitle('Safari Data Import');
        
        const importInput = new TextInputBuilder()
          .setCustomId('import_data')
          .setLabel('Paste exported Safari data:')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('{"stores":{"store_123":{"name":"My Store",...}},"items":{...},"safariConfig":{...}}')
          .setMaxLength(4000)
          .setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(importInput));
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error in safari_import_data:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error opening import interface. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_clear_corrupted_attacks') {
      // Handle clearing corrupted attack queue entries
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to clear corrupted attacks.')) return;
        
        console.log(`🔧 DEBUG: Clearing corrupted attacks for guild ${guildId}`);
        
        // Clear corrupted attacks
        const { clearCorruptedAttacks } = await import('./safariManager.js');
        const summary = await clearCorruptedAttacks(guildId);
        
        // Log the action
        await logInteraction(req.body, 'safari_clear_corrupted_attacks', { 
          guildId,
          summary 
        });
        
        // Create success response
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15) | 64, // IS_COMPONENTS_V2 + EPHEMERAL
            components: [{
              type: 17, // Container
              accent_color: 0x2ecc71, // Green for success
              components: [
                {
                  type: 10, // Text Display
                  content: `# 🔧 Attack Queue Cleanup Complete\n\n**📊 Summary:**\n• **Total attacks scanned:** ${summary.totalAttacks}\n• **🗑️ Corrupted removed:** ${summary.corruptedRemoved}\n• **✅ Valid remaining:** ${summary.validRemaining}\n\n${summary.corruptedRemoved > 0 ? 'Corrupted attack data has been cleaned up!' : 'No corrupted attacks found - your attack queues are clean!'}`
                }
              ]
            }]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_clear_corrupted_attacks:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error clearing corrupted attacks. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_manage_stores') {
      // MVP2: Store management interface with full functionality
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage stores.')) return;
        
        console.log(`🏪 DEBUG: Opening store management interface`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const stores = safariData[guildId]?.stores || {};
        const items = safariData[guildId]?.items || {};
        
        // Create store management buttons (Row 1: Core Functions)
        const managementButtonsRow1 = [
          new ButtonBuilder()
            .setCustomId('safari_store_create')
            .setLabel('Create New Store')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏪'),
          new ButtonBuilder()
            .setCustomId('safari_store_manage_items')
            .setLabel('Manage Store Items')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📦'),
          new ButtonBuilder()
            .setCustomId('safari_store_list')
            .setLabel('View All Stores')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋')
        ];
        
        // Row 2: No longer needed - all buttons moved to row 1
        const managementButtonsRow2 = [];
        
        const managementRow1 = new ActionRowBuilder().addComponents(managementButtonsRow1);
        // Row 2 removed - all buttons now in row 1
        
        // Create back button
        const backButton = new ButtonBuilder()
          .setCustomId('prod_safari_menu')
          .setLabel('⬅ Back to Safari')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        // Create store summary
        const storeCount = Object.keys(stores).length;
        const itemCount = Object.keys(items).length;
        let totalSales = 0;
        
        Object.values(stores).forEach(store => {
          totalSales += store.metadata?.totalSales || 0;
        });
        
        // Show overview of existing stores
        let storesOverview = '';
        if (storeCount === 0) {
          storesOverview = '*No stores created yet.*';
        } else {
          const storeList = Object.values(stores).slice(0, 5); // Show first 5
          storesOverview = storeList.map(store => {
            const itemsInStore = store.items?.length || 0;
            const sales = store.metadata?.totalSales || 0;
            return `**${store.emoji || '🏪'} ${store.name}**\n└ ${itemsInStore} items • ${sales} sales`;
          }).join('\n\n');
          
          if (storeCount > 5) {
            storesOverview += `\n\n*...and ${storeCount - 5} more stores*`;
          }
        }
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 🏪 Store Management\n\nCreate and manage stores for your Safari adventures.`
          },
          {
            type: 10, // Text Display component
            content: `> **Total Stores:** ${storeCount}\n> **Available Items:** ${itemCount}\n> **Total Sales:** ${totalSales}`
          },
          {
            type: 10, // Text Display component
            content: `**📋 Current Stores:**\n${storesOverview}`
          },
          {
            type: 14 // Separator
          },
          managementRow1.toJSON(), // Store management buttons
          {
            type: 14 // Separator
          },
          backRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0x2ecc71, // Green accent color for store theme
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_manage_stores:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading store management.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_manage_items') {
      // Streamlined: Go directly to Item Management section (entity management UI)
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage items.')) return;
        
        console.log(`📦 DEBUG: Item management UI opened for guild ${guildId}`);
        
        // Create entity management UI
        const uiResponse = await createEntityManagementUI({
          entityType: 'item',
          guildId: guildId,
          selectedId: null,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error in safari_manage_items:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading item management.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_store_create') {
      // MVP2: Create new store interface
      console.log('🏪 DEBUG: safari_store_create handler called');
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to create stores.')) return;
        
        console.log(`🏪 DEBUG: Create new store clicked`);
        
        // Create store creation modal
        const modal = new ModalBuilder()
          .setCustomId('safari_store_modal')
          .setTitle('Create New Store');
        
        const storeNameInput = new TextInputBuilder()
          .setCustomId('store_name')
          .setLabel('Store Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setPlaceholder('e.g. Adventure Supplies');
        
        const storeEmojiInput = new TextInputBuilder()
          .setCustomId('store_emoji')
          .setLabel('Store Emoji')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder('🏪');
        
        const storeDescriptionInput = new TextInputBuilder()
          .setCustomId('store_description')
          .setLabel('Store Description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('A description of your store...');
        
        const storeownerTextInput = new TextInputBuilder()
          .setCustomId('storeowner_text')
          .setLabel('Store Owner Greeting')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200)
          .setPlaceholder('Welcome to my store!');
        
        const row1 = new ActionRowBuilder().addComponents(storeNameInput);
        const row2 = new ActionRowBuilder().addComponents(storeEmojiInput);
        const row3 = new ActionRowBuilder().addComponents(storeDescriptionInput);
        const row4 = new ActionRowBuilder().addComponents(storeownerTextInput);
        
        modal.addComponents(row1, row2, row3, row4);
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error in safari_store_create:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error creating store interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    /* COMMENTED OUT - REDUNDANT INTERFACE
    } else if (custom_id === 'safari_item_create') {
      // MVP2: Create new item interface
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to create items.')) return;
        
        console.log(`📦 DEBUG: Create new item clicked`);
        
        // Create enhanced item creation modal for Challenge Game Logic
        const modal = new ModalBuilder()
          .setCustomId('safari_item_modal')
          .setTitle('📦 Create New Game Item');
        
        const itemNameInput = new TextInputBuilder()
          .setCustomId('item_name')
          .setLabel('Item Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setPlaceholder('e.g. Territory Forager');
        
        const itemPriceInput = new TextInputBuilder()
          .setCustomId('item_price')
          .setLabel('Base Price')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('30');
        
        const goodOutcomeInput = new TextInputBuilder()
          .setCustomId('good_outcome_value')
          .setLabel('Good Outcome Yield')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder('Enter yield for good events (0 or blank for none)');
        
        const badOutcomeInput = new TextInputBuilder()
          .setCustomId('bad_outcome_value')
          .setLabel('Bad Outcome Yield')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder('Enter yield for bad events (0 or blank for none)');
        
        const attackValueInput = new TextInputBuilder()
          .setCustomId('attack_value')
          .setLabel('Attack Power')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder('Attack power (leave blank if no attack)');
        
        const row1 = new ActionRowBuilder().addComponents(itemNameInput);
        const row2 = new ActionRowBuilder().addComponents(itemPriceInput);
        const row3 = new ActionRowBuilder().addComponents(goodOutcomeInput);
        const row4 = new ActionRowBuilder().addComponents(badOutcomeInput);
        const row5 = new ActionRowBuilder().addComponents(attackValueInput);
        
        modal.addComponents(row1, row2, row3, row4, row5);
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error in safari_item_create:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error creating item interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    END COMMENTED OUT - REDUNDANT INTERFACE */
    } else if (custom_id === 'safari_store_list') {
      // MVP2: View all stores list interface
      console.log('📋 DEBUG: safari_store_list handler called');
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to view stores.')) return;
        
        console.log(`🏪 DEBUG: View all stores clicked for guild ${guildId}`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        console.log(`🔍 DEBUG: Safari data for guild ${guildId}:`, JSON.stringify(safariData[guildId], null, 2));
        const stores = safariData[guildId]?.stores || {};
        const items = safariData[guildId]?.items || {};
        console.log(`🔍 DEBUG: Found ${Object.keys(stores).length} stores:`, Object.keys(stores));
        
        // Create back button
        const backButton = new ButtonBuilder()
          .setCustomId('safari_manage_stores')
          .setLabel('⬅ Back to Store Management')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        let content = '## 🏪 All Stores\n\n';
        
        if (Object.keys(stores).length === 0) {
          content += '*No stores created yet.*\n\nCreate your first store using the **Create New Store** button in the Store Management interface.';
        } else {
          const storeList = Object.entries(stores)
            .sort(([, a], [, b]) => (b.metadata?.createdAt || 0) - (a.metadata?.createdAt || 0)); // Sort by creation date
          
          content += `**Total Stores:** ${storeList.length}\n\n`;
          
          storeList.forEach(([storeId, store], index) => {
            const itemsInStore = store.items?.length || 0;
            const totalSales = store.metadata?.totalSales || 0;
            const createdDate = store.metadata?.createdAt ? new Date(store.metadata.createdAt).toLocaleDateString() : 'Unknown';
            
            content += `**${index + 1}. ${store.emoji || '🏪'} ${store.name}**\n`;
            if (store.description) {
              content += `└ *${store.description}*\n`;
            }
            content += `└ **Store ID:** \`${storeId}\`\n`;
            content += `└ **Items:** ${itemsInStore} | **Sales:** ${totalSales} | **Created:** ${createdDate}\n\n`;
          });
        }
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: content
          },
          {
            type: 14 // Separator
          },
          backRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0x3498db, // Blue accent color
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_store_list:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading stores list.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    /* COMMENTED OUT - REDUNDANT INTERFACE
    } else if (custom_id === 'safari_item_list') {
      // MVP2: View all items list interface
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to view items.')) return;
        
        console.log(`📦 DEBUG: View all items clicked for guild ${guildId}`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        const stores = safariData[guildId]?.stores || {};
        
        // Create back button
        const backButton = new ButtonBuilder()
          .setCustomId('safari_manage_items')
          .setLabel('⬅ Back to Item Management')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        let content = '## 📦 All Items\n\n';
        
        if (Object.keys(items).length === 0) {
          content += '*No items created yet.*\n\nCreate your first item using the **Create New Item** button in the Item Management interface.';
        } else {
          // Group items by category
          const itemsByCategory = {};
          Object.entries(items).forEach(([itemId, item]) => {
            const category = item.category || 'General';
            if (!itemsByCategory[category]) {
              itemsByCategory[category] = [];
            }
            itemsByCategory[category].push([itemId, item]);
          });
          
          const totalItems = Object.keys(items).length;
          const totalCategories = Object.keys(itemsByCategory).length;
          
          content += `**Total Items:** ${totalItems} | **Categories:** ${totalCategories}\n\n`;
          
          // Display items by category
          Object.entries(itemsByCategory).forEach(([category, categoryItems]) => {
            content += `### ${category}\n`;
            
            categoryItems
              .sort(([, a], [, b]) => (b.metadata?.createdAt || 0) - (a.metadata?.createdAt || 0))
              .forEach(([itemId, item]) => {
                const createdDate = item.metadata?.createdAt ? new Date(item.metadata.createdAt).toLocaleDateString() : 'Unknown';
                const totalSales = item.metadata?.totalSales || 0;
                
                content += `**${item.emoji || '📦'} ${item.name}**\n`;
                if (item.description) {
                  content += `└ *${item.description}*\n`;
                }
                content += `└ **Item ID:** \`${itemId}\` | **Base Price:** ${item.basePrice} coins\n`;
                content += `└ **Sales:** ${totalSales} | **Created:** ${createdDate}\n\n`;
              });
          });
        }
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: content
          },
          {
            type: 14 // Separator
          },
          backRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0x9b59b6, // Purple accent color
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_item_list:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading items list.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    END COMMENTED OUT - REDUNDANT INTERFACE */
    // safari_store_manage_existing handler removed - functionality replaced by safari_store_manage_items
    } else if (custom_id === 'safari_store_manage_items') {
      // MVP2 Sprint 1: Manage store items (add/remove items from stores)
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage store items.')) return;
        
        console.log(`📦 DEBUG: Opening store items management interface`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const stores = safariData[guildId]?.stores || {};
        
        if (Object.keys(stores).length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **No stores to manage**\n\nCreate your first store using **🏪 Create New Store** before managing store items.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create store selection dropdown
        const storeOptions = Object.entries(stores).slice(0, 25).map(([storeId, store]) => {
          const itemCount = store.items?.length || 0;
          return {
            label: `${store.emoji || '🏪'} ${store.name}`.slice(0, 100),
            value: storeId,
            description: `${itemCount} item${itemCount !== 1 ? 's' : ''} currently in stock`.slice(0, 100)
          };
        });
        
        const storeSelect = new StringSelectMenuBuilder()
          .setCustomId('safari_store_items_select')
          .setPlaceholder('Choose a store to manage items...')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(storeOptions);
        
        const selectRow = new ActionRowBuilder().addComponents(storeSelect);
        
        // Create back button
        const backButton = new ButtonBuilder()
          .setCustomId('safari_manage_stores')
          .setLabel('⬅ Back to Store Management')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 🏪 Manage Store\n\nSelect Store:`
          },
          {
            type: 10, // Text Display component
            content: `> **Available Stores:** ${Object.keys(stores).length}`
          },
          {
            type: 14 // Separator
          },
          selectRow.toJSON(), // Store selection dropdown
          {
            type: 14 // Separator
          },
          backRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0x3498db, // Blue accent color for items theme
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 flag + ephemeral
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_store_manage_items:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading store items management.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_store_items_select') {
      // Handle store selection for items management
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const data = req.body.data;
        const selectedStoreId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage store items.')) return;
        
        console.log(`📦 DEBUG: Managing items for store ${selectedStoreId}`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const store = safariData[guildId]?.stores?.[selectedStoreId];
        const allItems = safariData[guildId]?.items || {};
        
        if (!store) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Initialize store.items if it doesn't exist
        if (!store.items) {
          store.items = [];
        }
        
        // Get items currently in store and available items
        const currentItems = store.items || [];
        const currentItemIds = new Set(currentItems.map(item => item.itemId || item));
        const availableItems = Object.entries(allItems).filter(([itemId]) => !currentItemIds.has(itemId));
        
        // Build simplified interface to avoid Discord component limits and timeout
        let currentItemsList = '';
        currentItems.forEach((storeItem, index) => {
          const itemId = storeItem.itemId || storeItem;
          const item = allItems[itemId];
          if (item) {
            const price = storeItem.price || item.basePrice || 0;
            currentItemsList += `${index + 1}. **${item.emoji || '📦'} ${item.name}** - 💰 ${price} coins\n`;
          }
        });
        
        let availableItemsList = '';
        availableItems.slice(0, 15).forEach(([itemId, item], index) => {
          availableItemsList += `${index + 1}. **${item.emoji || '📦'} ${item.name}** - 💰 ${item.basePrice || 0} coins\n`;
        });
        
        if (availableItems.length > 15) {
          availableItemsList += `\n*...and ${availableItems.length - 15} more items*`;
        }
        
        // Create action buttons (Discord limit: ~25-30 buttons max due to 40 component limit)
        const actionButtons = [];
        
        // Remove buttons for current items (show all current items)
        currentItems.forEach((storeItem, index) => {
          const itemId = storeItem.itemId || storeItem;
          const item = allItems[itemId];
          if (item) {
            actionButtons.push({
              type: 2, // Button
              custom_id: `safari_store_remove_item_${selectedStoreId}::${itemId}`,
              label: `Remove ${item.name}`.slice(0, 80),
              style: 4,
              emoji: { name: '🗑️' }
            });
          }
        });
        
        // Add buttons for available items (show more available items)
        // Conservative limit: 20 total buttons to stay well under 40 component limit
        const maxTotalButtons = 20;
        const remainingSlots = Math.max(0, maxTotalButtons - actionButtons.length);
        availableItems.slice(0, remainingSlots).forEach(([itemId, item]) => {
          actionButtons.push({
            type: 2, // Button
            custom_id: `safari_store_add_item_${selectedStoreId}::${itemId}`,
            label: `Add ${item.name}`.slice(0, 80),
            style: 3,
            emoji: { name: '➕' }
          });
        });
        
        // Split buttons into rows (max 5 per row)
        const buttonRows = [];
        for (let i = 0; i < actionButtons.length; i += 5) {
          const rowButtons = actionButtons.slice(i, i + 5);
          if (rowButtons.length > 0) {
            buttonRows.push({
              type: 1, // Action Row
              components: rowButtons
            });
          }
        }
        
        const containerComponents = [
          {
            type: 10, // Text Display
            content: `## 🏪 ${store.emoji || '🏪'} ${store.name} - Store Management\n\n**Store Items:** ${currentItems.length} • **Available to Add:** ${availableItems.length}`
          },
          {
            type: 10, // Text Display
            content: `### 🛍️ Current Items in Store\n${currentItemsList || '*No items in this store yet.*'}`
          },
          {
            type: 10, // Text Display
            content: `### ➕ Available Items to Add\n${availableItemsList || '*All items are already in this store.*'}`
          },
          ...buttonRows,
          {
            type: 14 // Separator
          },
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                custom_id: 'safari_store_manage_items',
                label: '⬅ Back to Store Selection',
                style: 2
              },
              {
                type: 2, // Button
                custom_id: `safari_store_open_${selectedStoreId}`,
                label: 'Open Store',
                style: 1,
                emoji: { name: '🏪' }
              },
              {
                type: 2, // Button
                custom_id: `safari_store_delete_${selectedStoreId}`,
                label: 'Delete Store',
                style: 4, // Red/Destructive style
                emoji: { name: '🗑️' }
              }
            ]
          }
        ];
        
        const container = {
          type: 17, // Container
          accent_color: 0x3498db, // Blue
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_store_items_select:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading store items.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_store_add_item_')) {
      // Add item to store
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage store items.')) return;
        
        // Parse custom_id: safari_store_add_item_${storeId}::${itemId}
        // Using :: delimiter to handle IDs with underscores
        const prefix = 'safari_store_add_item_';
        const afterPrefix = custom_id.substring(prefix.length);
        const delimiterIndex = afterPrefix.indexOf('::');
        if (delimiterIndex === -1) {
          throw new Error('Invalid custom_id format');
        }
        const storeId = afterPrefix.substring(0, delimiterIndex);
        const itemId = afterPrefix.substring(delimiterIndex + 2);
        
        console.log(`➕ DEBUG: Adding item ${itemId} to store ${storeId}`);
        
        // Import Safari manager functions
        const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        
        const store = safariData[guildId]?.stores?.[storeId];
        const item = safariData[guildId]?.items?.[itemId];
        
        if (!store || !item) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store or item not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Initialize store.items if needed
        if (!store.items) {
          store.items = [];
        }
        
        // Check if item already in store
        const existingItem = store.items.find(storeItem => 
          (storeItem.itemId || storeItem) === itemId
        );
        
        if (existingItem) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Item is already in this store.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Add item to store (using base price initially)
        store.items.push({
          itemId: itemId,
          price: item.basePrice || 0,
          addedAt: Date.now()
        });
        
        // Save updated data
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Successfully added ${itemId} to store ${storeId}`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Item Added!**\n\n**${item.emoji || '📦'} ${item.name}** has been added to **${store.emoji || '🏪'} ${store.name}** for **💰 ${item.basePrice || 0} coins**.`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error adding item to store:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error adding item to store.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_store_remove_item_')) {
      // Remove item from store
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage store items.')) return;
        
        // Parse custom_id: safari_store_remove_item_${storeId}::${itemId}
        // Using :: delimiter to handle IDs with underscores
        const prefix = 'safari_store_remove_item_';
        const afterPrefix = custom_id.substring(prefix.length);
        const delimiterIndex = afterPrefix.indexOf('::');
        if (delimiterIndex === -1) {
          throw new Error('Invalid custom_id format');
        }
        const storeId = afterPrefix.substring(0, delimiterIndex);
        const itemId = afterPrefix.substring(delimiterIndex + 2);
        
        console.log(`🗑️ DEBUG: Removing item ${itemId} from store ${storeId}`);
        
        // Import Safari manager functions
        const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        
        const store = safariData[guildId]?.stores?.[storeId];
        const item = safariData[guildId]?.items?.[itemId];
        
        if (!store || !item) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store or item not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Remove item from store
        const originalLength = store.items?.length || 0;
        store.items = (store.items || []).filter(storeItem => 
          (storeItem.itemId || storeItem) !== itemId
        );
        
        if (store.items.length === originalLength) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Item was not found in this store.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Save updated data
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Successfully removed ${itemId} from store ${storeId}`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Item Removed!**\n\n**${item.emoji || '📦'} ${item.name}** has been removed from **${store.emoji || '🏪'} ${store.name}**.`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error removing item from store:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error removing item from store.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_store_open_')) {
      // Open Store - post store button to channel
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to post store buttons.')) return;
        
        // Parse storeId from custom_id
        const storeId = custom_id.replace('safari_store_open_', '');
        console.log(`🏪 DEBUG: Opening store posting interface for store ${storeId}`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const store = safariData[guildId]?.stores?.[storeId];
        
        if (!store) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create channel posting interface
        const containerComponents = [
          {
            type: 10, // Text Display
            content: `## 🏪 Open Store\n\n**${store.emoji || '🏪'} ${store.name}**`
          },
          {
            type: 10, // Text Display
            content: `Select the channel to post your store button to - be sure to write up any context in the channel before posting the button.`
          },
          {
            type: 14 // Separator
          },
          {
            type: 1, // Action Row
            components: [{
              type: 8, // Channel Select
              custom_id: `safari_store_post_channel_${storeId}`,
              placeholder: 'Select channel to post store button...',
              channel_types: [0, 5] // Text and Announcement channels
            }]
          },
          {
            type: 14 // Separator
          },
          {
            type: 1, // Action Row
            components: [{
              type: 2, // Button
              custom_id: `safari_store_items_select`,
              label: '⬅ Back to Store Management',
              style: 2
            }]
          }
        ];
        
        const container = {
          type: 17, // Container
          accent_color: store.settings?.accentColor || 0x3498db,
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_store_open handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error opening store posting interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_store_delete_')) {
      // Handle store delete button - show confirmation dialog
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to delete stores.')) return;
        
        // Parse storeId from custom_id
        const storeId = custom_id.replace('safari_store_delete_', '');
        console.log(`🗑️ DEBUG: Showing delete confirmation for store ${storeId}`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const store = safariData[guildId]?.stores?.[storeId];
        
        if (!store) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create delete confirmation interface
        const containerComponents = [
          {
            type: 10, // Text Display
            content: `## ⚠️ Delete Store Confirmation\n\n**${store.emoji || '🏪'} ${store.name}**`
          },
          {
            type: 10, // Text Display
            content: `⚠️ **WARNING**: This will permanently delete the store and all its data:\n\n• Store configuration and settings\n• All items stocked in the store\n• Store metadata and statistics\n\n**This action cannot be undone!**`
          },
          {
            type: 14 // Separator
          },
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                custom_id: `safari_store_items_select`,
                label: '⬅ Cancel',
                style: 2
              },
              {
                type: 2, // Button
                custom_id: `safari_confirm_delete_store_${storeId}`,
                label: 'Delete Store',
                style: 4, // Red/Destructive style
                emoji: { name: '🗑️' }
              }
            ]
          }
        ];
        
        const container = {
          type: 17, // Container
          accent_color: 0xe74c3c, // Red accent for danger
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_store_delete handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading delete confirmation.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_confirm_delete_store_')) {
      // Handle confirmed store deletion
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to delete stores.')) return;
        
        // Parse storeId from custom_id
        const storeId = custom_id.replace('safari_confirm_delete_store_', '');
        console.log(`🗑️ DEBUG: Confirming delete for store ${storeId} by user ${userId}`);
        
        // Import Safari manager functions
        const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        
        if (!safariData[guildId]?.stores?.[storeId]) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const storeName = safariData[guildId].stores[storeId].name;
        
        // Delete the store - completely remove it from safariContent.json
        delete safariData[guildId].stores[storeId];
        
        // Save updated data
        await saveSafariContent(safariData);
        
        console.log(`🗑️ DEBUG: Deleted store ${storeId} (${storeName}) completely`);
        
        // Return to store management with success message
        const containerComponents = [
          {
            type: 10, // Text Display
            content: `## ✅ Store Deleted Successfully\n\n**${storeName}** has been permanently deleted from the system.`
          },
          {
            type: 14 // Separator
          },
          {
            type: 1, // Action Row
            components: [{
              type: 2, // Button
              custom_id: 'safari_manage_stores',
              label: '⬅ Back to Store Management',
              style: 2
            }]
          }
        ];
        
        const container = {
          type: 17, // Container
          accent_color: 0x27ae60, // Green accent for success
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error confirming store deletion:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error deleting store. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_store_post_channel_')) {
      // Handle channel selection for posting store button
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const data = req.body.data;
        const selectedChannelId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to post store buttons.')) return;
        
        // Parse storeId from custom_id
        const storeId = custom_id.replace('safari_store_post_channel_', '');
        console.log(`📤 DEBUG: Posting store ${storeId} button to channel ${selectedChannelId}`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const store = safariData[guildId]?.stores?.[storeId];
        
        if (!store) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create store button to post to channel
        const storeButton = {
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: `safari_store_browse_${guildId}_${storeId}`,
            label: `Browse ${store.name}`,
            style: 1,
            emoji: store.emoji ? { name: store.emoji } : { name: '🏪' }
          }]
        };
        
        // Post button to selected channel using Discord.js client
        try {
          const channel = client?.channels?.cache?.get(selectedChannelId);
          if (channel) {
            await channel.send({
              components: [storeButton]
            });
            
            return res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                flags: (1 << 15), // IS_COMPONENTS_V2
                components: [{
                  type: 17, // Container
                  accent_color: 0x00ff00, // Green
                  components: [{
                    type: 10, // Text Display
                    content: `## ✅ Store Button Posted!\n\n**${store.emoji || '🏪'} ${store.name}** has been posted to <#${selectedChannelId}>.`
                  }, {
                    type: 14 // Separator
                  }, {
                    type: 1, // Action Row
                    components: [{
                      type: 2, // Button
                      custom_id: 'safari_store_manage_items',
                      label: '⬅ Back to Store Management',
                      style: 2
                    }]
                  }]
                }]
              }
            });
          } else {
            throw new Error('Channel not found');
          }
        } catch (postError) {
          console.error('Error posting store button to channel:', postError);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Error posting button to channel. Make sure the bot has permission to send messages in that channel.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
      } catch (error) {
        console.error('Error in safari_store_post_channel handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error posting store button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_item_manage_existing') {
      // MVP2 Sprint 3: New entity management system for items
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit items.')) return;
        
        console.log(`✏️ DEBUG: Item management UI opened for guild ${guildId}`);
        
        // Create entity management UI
        const uiResponse = await createEntityManagementUI({
          entityType: 'item',
          guildId: guildId,
          selectedId: null,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error in safari_item_manage_existing:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading item management.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_button_manage_existing') {
      // Edit existing button interface following store/item pattern
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit buttons.')) return;
        
        console.log(`✏️ DEBUG: Edit existing button clicked for guild ${guildId}`);
        
        // Import Safari manager functions
        const { loadSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const buttons = safariData[guildId]?.buttons || {};
        
        if (Object.keys(buttons).length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **No buttons to edit**\n\nCreate your first custom button before you can edit existing ones.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create button selection dropdown
        const buttonOptions = Object.entries(buttons).slice(0, 25).map(([buttonId, button]) => ({
          label: `${button.emoji || '🔘'} ${button.label}`.slice(0, 100),
          value: buttonId,
          description: `${button.actions?.length || 0} action${(button.actions?.length || 0) !== 1 ? 's' : ''} | Used ${button.metadata?.usageCount || 0} times`.slice(0, 100)
        }));
        
        const buttonSelect = new StringSelectMenuBuilder()
          .setCustomId('safari_button_edit_select')
          .setPlaceholder('Choose a button to edit...')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(buttonOptions);
        
        const selectRow = new ActionRowBuilder().addComponents(buttonSelect);
        
        // Create back button
        const backButton = new ButtonBuilder()
          .setCustomId('safari_manage_safari_buttons')
          .setLabel('⬅ Back to Button Management')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## ✏️ Edit Existing Button\n\nSelect a button to edit from the dropdown below:`
          },
          selectRow.toJSON(), // Button selection dropdown
          {
            type: 14 // Separator
          },
          backRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0xf39c12, // Orange accent color for editing
          components: containerComponents
        };
        
        const userId = req.body.member?.user?.id || req.body.user?.id;
        console.log(`✅ SUCCESS: safari_button_manage_existing completed for user ${userId}`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in safari_button_manage_existing:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading button editor.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_button_edit_select') {
      // Handle button selection for editing
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const data = req.body.data;
        const selectedButtonId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit buttons.')) return;
        
        console.log(`✏️ DEBUG: Selected button ${selectedButtonId} for editing`);
        
        // Import Safari manager functions and universal edit framework
        const { getCustomButton } = await import('./safariManager.js');
        const { EditInterfaceBuilder, EDIT_TYPES } = await import('./editFramework.js');
        
        const button = await getCustomButton(guildId, selectedButtonId);
        
        if (!button) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log('🎛️ DEBUG: Creating edit interface for button:', selectedButtonId);
        
        // Create universal edit interface for buttons
        const editBuilder = new EditInterfaceBuilder(EDIT_TYPES.BUTTON);
        const editInterface = editBuilder.createEditInterface(button, selectedButtonId);
        
        // Add back button
        editInterface.components[0].components.push({
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'safari_button_manage_existing',
            label: '⬅ Back to Button List',
            style: 2,
            emoji: { name: '🔙' }
          }]
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: editInterface
        });
        
      } catch (error) {
        console.error('Error in safari_button_edit_select:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading button details.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    // ===================================================================
    // EDIT FRAMEWORK HANDLERS - Phase 1A: Action Management
    // ===================================================================
    } else if (custom_id.startsWith('safari_action_move_up_')) {
      // Handle moving action up
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to reorder actions.')) return;
        
        // Parse custom_id: safari_action_move_up_buttonId_actionIndex
        const parts = custom_id.split('_');
        const buttonId = parts.slice(4, -1).join('_');
        const actionIndex = parseInt(parts[parts.length - 1]);
        
        console.log(`⬆️ DEBUG: Moving action ${actionIndex} up for button ${buttonId}`);
        
        if (actionIndex <= 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Action is already at the top.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Import action management functions
        const { reorderButtonAction } = await import('./safariManager.js');
        const success = await reorderButtonAction(guildId, buttonId, actionIndex, actionIndex - 1);
        
        if (!success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to reorder action.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Refresh the edit interface
        const { getCustomButton } = await import('./safariManager.js');
        const { EditInterfaceBuilder, EDIT_TYPES } = await import('./editFramework.js');
        
        const button = await getCustomButton(guildId, buttonId);
        const editBuilder = new EditInterfaceBuilder(EDIT_TYPES.BUTTON);
        const editInterface = editBuilder.createEditInterface(button, buttonId);
        
        // Add back button
        editInterface.components[0].components.push({
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'safari_button_manage_existing',
            label: '⬅ Back to Button List',
            style: 2,
            emoji: { name: '🔙' }
          }]
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: editInterface
        });
        
      } catch (error) {
        console.error('Error moving action up:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error reordering action.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_action_move_down_')) {
      // Handle moving action down
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to reorder actions.')) return;
        
        // Parse custom_id: safari_action_move_down_buttonId_actionIndex
        const parts = custom_id.split('_');
        const buttonId = parts.slice(4, -1).join('_');
        const actionIndex = parseInt(parts[parts.length - 1]);
        
        console.log(`⬇️ DEBUG: Moving action ${actionIndex} down for button ${buttonId}`);
        
        // Get button to check if it's the last action
        const { getCustomButton } = await import('./safariManager.js');
        const button = await getCustomButton(guildId, buttonId);
        
        if (actionIndex >= button.actions.length - 1) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Action is already at the bottom.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Import action management functions
        const { reorderButtonAction } = await import('./safariManager.js');
        const success = await reorderButtonAction(guildId, buttonId, actionIndex, actionIndex + 1);
        
        if (!success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to reorder action.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Refresh the edit interface
        const { EditInterfaceBuilder, EDIT_TYPES } = await import('./editFramework.js');
        
        const updatedButton = await getCustomButton(guildId, buttonId);
        const editBuilder = new EditInterfaceBuilder(EDIT_TYPES.BUTTON);
        const editInterface = editBuilder.createEditInterface(updatedButton, buttonId);
        
        // Add back button
        editInterface.components[0].components.push({
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'safari_button_manage_existing',
            label: '⬅ Back to Button List',
            style: 2,
            emoji: { name: '🔙' }
          }]
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: editInterface
        });
        
      } catch (error) {
        console.error('Error moving action down:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error reordering action.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_edit_properties_')) {
      // Button property editing using universal framework
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit properties.')) return;
        
        const buttonId = custom_id.replace('safari_edit_properties_', '');
        console.log(`📝 DEBUG: Edit properties clicked for button ${buttonId}`);
        
        // Import functions
        const { getCustomButton } = await import('./safariManager.js');
        const { PropertiesEditor, EDIT_TYPES } = await import('./editFramework.js');
        
        const button = await getCustomButton(guildId, buttonId);
        
        if (!button) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create properties edit modal
        const propertiesEditor = new PropertiesEditor(EDIT_TYPES.BUTTON);
        const modal = await propertiesEditor.createPropertiesModal(button, buttonId);
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error in safari_button_edit_properties:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading property editor.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_action_edit_')) {
      // Handle editing individual actions
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit actions.')) return;
        
        // Parse custom_id: safari_action_edit_buttonId_actionIndex
        const parts = custom_id.split('_');
        const buttonId = parts.slice(3, -1).join('_');
        const actionIndex = parseInt(parts[parts.length - 1]);
        
        console.log(`✏️ DEBUG: Editing action ${actionIndex} for button ${buttonId}`);
        
        // Get current action data
        const { getCustomButton } = await import('./safariManager.js');
        const button = await getCustomButton(guildId, buttonId);
        
        if (!button || !button.actions || actionIndex >= button.actions.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Action not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const action = button.actions[actionIndex];
        
        // Create edit modal based on action type (reuse existing modal system)
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        const modal = new ModalBuilder()
          .setCustomId(`safari_edit_action_modal_${buttonId}_${actionIndex}_${action.type}`)
          .setTitle(`Edit ${action.type.replace('_', ' ')} Action`);
        
        const components = [];
        
        // Create fields based on action type
        if (action.type === 'display_text') {
          const titleInput = new TextInputBuilder()
            .setCustomId('action_title')
            .setLabel('Title (optional)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(false)
            .setValue(action.config.title || '');
          
          const contentInput = new TextInputBuilder()
            .setCustomId('action_content')
            .setLabel('Content')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(true)
            .setValue(action.config.content || '');
          
          components.push(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput)
          );
          
        } else if (action.type === 'update_currency') {
          const amountInput = new TextInputBuilder()
            .setCustomId('currency_amount')
            .setLabel('Currency Amount')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(10)
            .setRequired(true)
            .setValue(String(action.config.amount || 0));
          
          const messageInput = new TextInputBuilder()
            .setCustomId('currency_message')
            .setLabel('Message (optional)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(200)
            .setRequired(false)
            .setValue(action.config.message || '');
          
          components.push(
            new ActionRowBuilder().addComponents(amountInput),
            new ActionRowBuilder().addComponents(messageInput)
          );
          
        } else {
          // For other action types, show a simple edit interface
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `🚧 **Edit ${action.type} Action**\n\nEditing for this action type is not yet implemented. Please delete and recreate the action.`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        modal.addComponents(components);
        
        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error editing action:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading action editor.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_action_delete_')) {
      // Handle deleting individual actions
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to delete actions.')) return;
        
        // Parse custom_id: safari_action_delete_buttonId_actionIndex
        const parts = custom_id.split('_');
        const buttonId = parts.slice(3, -1).join('_');
        const actionIndex = parseInt(parts[parts.length - 1]);
        
        console.log(`🗑️ DEBUG: Deleting action ${actionIndex} for button ${buttonId}`);
        
        // Delete the action
        const { deleteButtonAction } = await import('./safariManager.js');
        const success = await deleteButtonAction(guildId, buttonId, actionIndex);
        
        if (!success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to delete action.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Refresh the edit interface
        const { getCustomButton } = await import('./safariManager.js');
        const { EditInterfaceBuilder, EDIT_TYPES } = await import('./editFramework.js');
        
        const button = await getCustomButton(guildId, buttonId);
        const editBuilder = new EditInterfaceBuilder(EDIT_TYPES.BUTTON);
        const editInterface = editBuilder.createEditInterface(button, buttonId);
        
        // Add back button
        editInterface.components[0].components.push({
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'safari_button_manage_existing',
            label: '⬅ Back to Button List',
            style: 2,
            emoji: { name: '🔙' }
          }]
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: editInterface
        });
        
      } catch (error) {
        console.error('Error deleting action:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error deleting action.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_button_edit_actions_')) {
      // Button action management placeholder (Coming Soon)
      try {
        const buttonId = custom_id.replace('safari_button_edit_actions_', '');
        console.log(`⚙️ DEBUG: Manage actions clicked for button ${buttonId}`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '🚧 **Manage Actions - Coming Soon!**\n\nAdvanced action management will be available in a future update.\n\nFor now, you can create a new button and configure actions during creation.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in safari_button_edit_actions:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading action manager.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_test_button_')) {
      // Button test functionality using universal framework
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to test buttons.')) return;
        
        const buttonId = custom_id.replace('safari_test_button_', '');
        console.log(`🧪 DEBUG: Test button clicked for button ${buttonId}`);
        
        // Import functions 
        const { getCustomButton, executeButtonActions } = await import('./safariManager.js');
        
        const button = await getCustomButton(guildId, buttonId);
        
        if (!button) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Execute button actions as a test
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const result = await executeButtonActions(guildId, buttonId, userId, req.body);
        
        // Add test indicator to the result
        const testResult = {
          ...result,
          content: `🧪 **TEST MODE**\n\n${result.content || ''}\n\n*This was a test execution. No permanent changes were made.*`
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            ...testResult,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in safari_test_button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error testing button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_delete_button_')) {
      // Button deletion using universal framework
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to delete buttons.')) return;
        
        const buttonId = custom_id.replace('safari_delete_button_', '');
        console.log(`🗑️ DEBUG: Delete button clicked for button ${buttonId}`);
        
        // Import functions
        const { getCustomButton } = await import('./safariManager.js');
        const { DeleteConfirmation, EDIT_TYPES } = await import('./editFramework.js');
        
        const button = await getCustomButton(guildId, buttonId);
        
        if (!button) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create delete confirmation interface
        const deleteConfirmation = new DeleteConfirmation(EDIT_TYPES.BUTTON);
        const confirmationInterface = deleteConfirmation.createDeleteConfirmation(button, buttonId);
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: confirmationInterface
        });
        
      } catch (error) {
        console.error('Error in safari_button_delete:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error loading delete interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_confirm_delete_button_')) {
      // Handle button delete confirmation
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to delete buttons.')) return;
        
        const buttonId = custom_id.replace('safari_confirm_delete_button_', '');
        console.log(`🗑️ DEBUG: Confirming delete for button ${buttonId} by user ${userId}`);
        
        // Import functions
        const { deleteCustomButton, getCustomButton } = await import('./safariManager.js');
        
        // Get button name for confirmation message
        const button = await getCustomButton(guildId, buttonId);
        const buttonName = button?.label || 'Unknown Button';
        
        // Delete the button
        const success = await deleteCustomButton(guildId, buttonId);
        
        if (!success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to delete button.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`✅ SUCCESS: Button ${buttonName} (${buttonId}) deleted successfully`);
        
        // Return to button management interface
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: `✅ Button **${buttonName}** has been deleted successfully.`,
            components: [{
              type: 1, // Action Row
              components: [{
                type: 2, // Button
                custom_id: 'safari_button_manage_existing',
                label: '⬅ Back to Button Management',
                style: 2,
                emoji: { name: '🔙' }
              }]
            }],
            flags: (1 << 15) // IS_COMPONENTS_V2
          }
        });
        
      } catch (error) {
        console.error('Error in safari_confirm_delete_button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error deleting button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_currency_view_all') {
      // Handle View All Currency Balances
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to view currency balances.')) return;

        console.log('👥 DEBUG: View All Currency Balances clicked');
        
        const playerData = await loadPlayerData();
        const guildPlayers = playerData[guildId]?.players || {};
        const playersWithCurrency = Object.entries(guildPlayers)
          .filter(([userId, player]) => player.safari?.currency !== undefined)
          .sort(([, a], [, b]) => (b.safari?.currency || 0) - (a.safari?.currency || 0));
        
        let content = '## 👥 All Currency Balances\n\n';
        
        if (playersWithCurrency.length === 0) {
          content += '*No players have currency yet.*\n\nPlayers will appear here once they interact with Safari buttons that grant currency.';
        } else {
          content += `**Total Players:** ${playersWithCurrency.length}\n\n`;
          playersWithCurrency.forEach(([userId, player], index) => {
            const rank = index + 1;
            const currency = player.safari?.currency || 0;
            const lastInteraction = player.safari?.lastInteraction 
              ? new Date(player.safari.lastInteraction).toLocaleDateString()
              : 'Unknown';
            content += `**${rank}.** <@${userId}>\n`;
            content += `└ Balance: **${currency} coins** | Last active: ${lastInteraction}\n\n`;
          });
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: content,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error viewing all currency balances:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error viewing currency balances.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_currency_set_player') {
      // Handle Set Player Currency - show user select and modal
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to set player currency.')) return;

        console.log('💰 DEBUG: Set Player Currency clicked');
        
        // Create user selection dropdown
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId('safari_currency_select_user')
          .setPlaceholder('Choose a player to set currency for...')
          .setMinValues(1)
          .setMaxValues(1);
        
        const userSelectRow = new ActionRowBuilder().addComponents(userSelect);
        
        // Create cancel button
        const cancelButton = new ButtonBuilder()
          .setCustomId('safari_manage_currency')
          .setLabel('⬅ Back')
          .setStyle(ButtonStyle.Secondary);
        
        const cancelRow = new ActionRowBuilder().addComponents(cancelButton);
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 💰 Set Player Currency\n\nSelect a player to modify their currency balance:`
          },
          userSelectRow.toJSON(), // User selection dropdown
          {
            type: 14 // Separator
          },
          cancelRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0xf1c40f, // Gold accent color
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in set player currency:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error setting player currency.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_currency_reset_all') {
      // Handle Reset All Currency - confirmation dialog
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to reset currency.')) return;

        console.log('🗑️ DEBUG: Reset All Currency clicked');
        
        const playerData = await loadPlayerData();
        const guildPlayers = playerData[guildId]?.players || {};
        const playersWithCurrency = Object.entries(guildPlayers)
          .filter(([userId, player]) => player.safari?.currency !== undefined);
        
        if (playersWithCurrency.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **No currency to reset**\n\nNo players have currency balances to reset.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
          .setCustomId('safari_currency_reset_confirm')
          .setLabel('Yes, Reset All Currency')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️');
        
        const cancelButton = new ButtonBuilder()
          .setCustomId('safari_manage_currency')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌');
        
        const confirmRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        
        const totalCurrency = playersWithCurrency.reduce((sum, [, player]) => sum + (player.safari?.currency || 0), 0);
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 🗑️ Reset All Currency\n\n⚠️ **Warning: This action cannot be undone!**`
          },
          {
            type: 10, // Text Display component
            content: `> **Players affected:** ${playersWithCurrency.length}\n> **Total currency to be reset:** ${totalCurrency} coins`
          },
          {
            type: 10, // Text Display component
            content: `**Are you sure you want to reset all player currency to 0?**`
          },
          {
            type: 14 // Separator
          },
          confirmRow.toJSON() // Confirmation buttons
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0xe74c3c, // Red accent color for warning
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in reset all currency:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error resetting currency.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_view_player_inventory') {
      // Handle View Player Inventory - show user select for inventory viewing
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to view player inventories.')) return;

        console.log('👀 DEBUG: View Player Inventory clicked');
        
        // Create user selection dropdown
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId('safari_inventory_user_select')
          .setPlaceholder('Choose a player to view their inventory...')
          .setMinValues(1)
          .setMaxValues(1);
        
        const userSelectRow = new ActionRowBuilder().addComponents(userSelect);
        
        // Create cancel button (back to safari menu)
        const cancelButton = new ButtonBuilder()
          .setCustomId('prod_safari_menu')
          .setLabel('⬅ Back to Safari')
          .setStyle(ButtonStyle.Secondary);
        
        const cancelRow = new ActionRowBuilder().addComponents(cancelButton);
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 👀 View Player Inventory\n\nSelect a player to view their complete inventory:`
          },
          userSelectRow.toJSON(), // User selection dropdown
          {
            type: 14 // Separator
          },
          cancelRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0x9b59b6, // Purple accent color for viewing
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error in view player inventory:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error viewing player inventory.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_item_player_qty_')) {
      // Handle Player Qty button click - show user select for item quantity management
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const itemId = custom_id.replace('safari_item_player_qty_', '');
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage player items.')) return;

        console.log(`📦 DEBUG: Player Qty clicked for item ${itemId}`);
        
        // Load item data to get item name
        const { loadEntity } = await import('./entityManager.js');
        const item = await loadEntity(guildId, 'item', itemId);
        console.log(`📦 DEBUG: loadEntity result for item ${itemId}:`, item);
        const itemName = item?.name || 'Unknown Item';
        
        console.log(`📦 DEBUG: About to create user selection dropdown`);
        
        // Create user selection dropdown
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId(`safari_item_qty_user_select_${guildId}_${itemId}`)
          .setPlaceholder(`Choose a player to manage their ${itemName} balance...`)
          .setMinValues(1)
          .setMaxValues(1);
        
        const userSelectRow = new ActionRowBuilder().addComponents(userSelect);
        
        console.log(`📦 DEBUG: User select created, about to create cancel button`);
        
        // Create cancel button (back to entity management)
        const cancelButton = new ButtonBuilder()
          .setCustomId(`entity_edit_mode_item_${itemId}`)
          .setLabel('⬅ Back')
          .setStyle(ButtonStyle.Secondary);
        
        const cancelRow = new ActionRowBuilder().addComponents(cancelButton);
        
        console.log(`📦 DEBUG: Cancel button created, about to build response`);
        
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 📦 Manage Player Items\n\nSelect a player to manage how many **${itemName}** they have:`
          },
          userSelectRow.toJSON(), // User selection dropdown
          {
            type: 14 // Separator
          },
          cancelRow.toJSON() // Back button
        ];
        
        // Get entity accent color or default to blue
        const accentColor = item?.accentColor || 0x3498db;
        
        const container = {
          type: 17, // Container component
          accent_color: accentColor,
          components: containerComponents
        };
        
        console.log(`📦 DEBUG: About to send response`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: [container]
          }
        });
        
        console.log(`📦 DEBUG: Response sent successfully`);
        
      } catch (error) {
        console.error('Error in player qty handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error managing player items.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_add_action_')) {
      // Handle adding actions to safari buttons
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to add actions.')) return;

        // Match against known action types that may contain underscores
        let actionType, buttonId;
        if (custom_id.endsWith('_display_text')) {
          actionType = 'display_text';
          buttonId = custom_id.replace('safari_add_action_', '').replace('_display_text', '');
        } else if (custom_id.endsWith('_update_currency')) {
          actionType = 'update_currency';
          buttonId = custom_id.replace('safari_add_action_', '').replace('_update_currency', '');
        } else if (custom_id.endsWith('_follow_up')) {
          actionType = 'follow_up_button';
          buttonId = custom_id.replace('safari_add_action_', '').replace('_follow_up', '');
        } else {
          // Fallback to old method for any unknown action types
          const parts = custom_id.split('_');
          actionType = parts[parts.length - 1];
          buttonId = parts.slice(3, parts.length - 1).join('_');
        }
        
        console.log(`🔧 DEBUG: Adding ${actionType} action to button ${buttonId}`);
        
        // Show appropriate modal based on action type
        if (actionType === 'display_text') {
          const modal = new ModalBuilder()
            .setCustomId(`safari_action_modal_${buttonId}_display_text`)
            .setTitle('Add Text Display Action');

          const titleInput = new TextInputBuilder()
            .setCustomId('action_title')
            .setLabel('Title (optional)')
            .setPlaceholder('e.g., "Welcome to the Adventure!"')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100);

          const contentInput = new TextInputBuilder()
            .setCustomId('action_content')
            .setLabel('Content')
            .setPlaceholder('The text to display when the button is clicked...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000);

          const colorInput = new TextInputBuilder()
            .setCustomId('action_color')
            .setLabel('Accent Color (optional)')
            .setPlaceholder('e.g., #3498db or 3447003')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

          modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput),
            new ActionRowBuilder().addComponents(colorInput)
          );
          
          return res.send({
            type: InteractionResponseType.MODAL,
            data: modal.toJSON()
          });
          
        } else if (actionType === 'update_currency') {
          const modal = new ModalBuilder()
            .setCustomId(`safari_action_modal_${buttonId}_update_currency`)
            .setTitle('Add Currency Change Action');

          const amountInput = new TextInputBuilder()
            .setCustomId('action_amount')
            .setLabel('Currency Amount')
            .setPlaceholder('e.g., 100 or -50 (positive adds, negative subtracts)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

          const messageInput = new TextInputBuilder()
            .setCustomId('action_message')
            .setLabel('Message to Player')
            .setPlaceholder('e.g., "You found a treasure chest!"')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(200);

          modal.addComponents(
            new ActionRowBuilder().addComponents(amountInput),
            new ActionRowBuilder().addComponents(messageInput)
          );
          
          return res.send({
            type: InteractionResponseType.MODAL,
            data: modal.toJSON()
          });
          
        } else if (actionType === 'follow_up_button') {
          // Get existing buttons to show in dropdown
          const { listCustomButtons } = await import('./safariManager.js');
          const guildId = req.body.guild_id; // Ensure guildId is defined
          const existingButtons = await listCustomButtons(guildId);
          
          if (existingButtons.length === 0) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ **No other buttons available**\n\nYou need to create at least one other button before adding follow-up actions. Create another button first, then come back to add the follow-up.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          const modal = new ModalBuilder()
            .setCustomId(`safari_action_modal_${buttonId}_follow_up`)
            .setTitle('Add Follow-up Button Action');

          // Create options for button selection (showing max 25 as per Discord limit)
          const buttonOptions = existingButtons
            .filter(btn => btn.id !== buttonId) // Don't include current button
            .slice(0, 25)
            .map(btn => `${btn.id}|${btn.label}`)
            .join('\n');

          const buttonSelectInput = new TextInputBuilder()
            .setCustomId('action_button_id')
            .setLabel('Target Button ID')
            .setPlaceholder('Enter the exact Button ID to chain to')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const delayInput = new TextInputBuilder()
            .setCustomId('action_delay')
            .setLabel('Delay (seconds)')
            .setPlaceholder('0-60 seconds delay before showing button')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(3);

          const replaceInput = new TextInputBuilder()
            .setCustomId('action_replace')
            .setLabel('Replace Current Message (true/false)')
            .setPlaceholder('true = replace message, false = add below')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(5);

          const availableButtonsInput = new TextInputBuilder()
            .setCustomId('available_buttons')
            .setLabel('Available Button IDs')
            .setValue(buttonOptions || 'No other buttons available')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

          modal.addComponents(
            new ActionRowBuilder().addComponents(buttonSelectInput),
            new ActionRowBuilder().addComponents(delayInput),
            new ActionRowBuilder().addComponents(replaceInput),
            new ActionRowBuilder().addComponents(availableButtonsInput)
          );
          
          return res.send({
            type: InteractionResponseType.MODAL,
            data: modal.toJSON()
          });
          
        } else if (actionType === 'conditional') {
          const modal = new ModalBuilder()
            .setCustomId(`safari_action_modal_${buttonId}_conditional`)
            .setTitle('Add Conditional Action');

          const conditionTypeInput = new TextInputBuilder()
            .setCustomId('condition_type')
            .setLabel('Condition Type')
            .setPlaceholder('currency_gte, currency_lte, has_item, not_has_item')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20);

          const conditionValueInput = new TextInputBuilder()
            .setCustomId('condition_value')
            .setLabel('Condition Value')
            .setPlaceholder('e.g., "100" for currency, "item_id" for items')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const successActionInput = new TextInputBuilder()
            .setCustomId('success_action')
            .setLabel('Success Action Type')
            .setPlaceholder('display_text, update_currency, follow_up_button')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20);

          const failureActionInput = new TextInputBuilder()
            .setCustomId('failure_action')
            .setLabel('Failure Action Type (optional)')
            .setPlaceholder('display_text, update_currency, follow_up_button')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(20);

          modal.addComponents(
            new ActionRowBuilder().addComponents(conditionTypeInput),
            new ActionRowBuilder().addComponents(conditionValueInput),
            new ActionRowBuilder().addComponents(successActionInput),
            new ActionRowBuilder().addComponents(failureActionInput)
          );
          
          return res.send({
            type: InteractionResponseType.MODAL,
            data: modal.toJSON()
          });
        }
        
      } catch (error) {
        console.error('Error adding action:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error adding action. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_finish_button_')) {
      // Handle finishing button creation
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to finish buttons.')) return;

        const buttonId = custom_id.replace('safari_finish_button_', '');
        
        console.log(`✅ DEBUG: Finishing button ${buttonId}`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `🎉 **Button "${buttonId}" created successfully!**\n\nYou can now:\n• View it in **📊 View All Buttons**\n• Post it to a channel with **📤 Post Custom Button**\n• Add more actions anytime`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error finishing button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error finishing button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_player_menu') {
      // My Profile button - available to users with admin permissions
      try {
        const userId = req.body.member.user.id;
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const member = req.body.member;
        
        // Security check - require admin permissions
        const userPermissions = BigInt(member.permissions || '0');
        const requiredPermissions = PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageGuild;
        
        if (!(userPermissions & requiredPermissions)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Access denied. This feature requires admin permissions (Manage Roles, Channels, or Guild).',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Load player data and current member
        console.log('🔍 DEBUG: My Profile button clicked, loading player interface...');
        const playerData = await loadPlayerData();
        const guildMember = await guild.members.fetch(userId);
        
        // Create player management UI using the new module
        const managementUI = await createPlayerManagementUI({
          mode: PlayerManagementMode.PLAYER,
          targetMember: guildMember,
          playerData,
          guildId,
          userId,
          showUserSelect: false,
          showVanityRoles: false,
          title: 'CastBot | My Profile',
          client
        });
        
        console.log('🔍 DEBUG: Player management UI created, sending...');
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            ...managementUI,
            flags: (managementUI.flags || 0) | InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error accessing My Profile:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error accessing My Profile. Check logs for details.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_timezone_react') {
      // Execute same logic as player_set_timezone command (available to all users)
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);

        // Get timezone roles from storage
        const timezones = await getGuildTimezones(guildId);
        if (!Object.keys(timezones).length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No timezone roles found. Ask an admin to add some using the "🗺️ Add Timezone" button in the admin menu first!',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get role objects and sort alphabetically
        const roles = await Promise.all(
          Object.keys(timezones).map(id => guild.roles.fetch(id))
        );
        const sortedRoles = roles
          .filter(role => role) // Remove any null roles
          .sort((a, b) => a.name.localeCompare(b.name));

        if (sortedRoles.length > REACTION_EMOJIS.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Too many timezone roles (maximum ${REACTION_EMOJIS.length} supported due to Discord limits)`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Create embed
        const embed = new EmbedBuilder()
          .setTitle('Timezone Role Selection')
          .setDescription('React with the emoji corresponding to your timezone:\n\n' + 
            sortedRoles.map((role, i) => `${REACTION_EMOJIS[i]} - ${role.name}`).join('\n'))
          .setColor('#7ED321');

        // Send initial response with embed directly
        res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [embed]
          }
        });

        // Get the message ID from the interaction response
        // Since this is the initial response, we need to fetch the message
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for message to be created
        
        const channel = await client.channels.fetch(req.body.channel_id);
        const messages = await channel.messages.fetch({ limit: 1 });
        const messageId = messages.first()?.id;

        if (!messageId) {
          console.error('Failed to get message ID from interaction response');
          return;
        }

        // Add reactions with proper error handling
        for (let i = 0; i < sortedRoles.length; i++) {
          try {
            await fetch(
              `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${messageId}/reactions/${encodeURIComponent(REACTION_EMOJIS[i])}/@me`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                },
              }
            );
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Failed to add reaction ${REACTION_EMOJIS[i]}:`, error);
          }
        }

        // Store role-emoji mappings in memory for reaction handler with timezone metadata
        if (!client.roleReactions) client.roleReactions = new Map();
        const roleMapping = Object.fromEntries(sortedRoles.map((role, i) => [REACTION_EMOJIS[i], role.id]));
        roleMapping.isTimezone = true;  // Mark this as a timezone role mapping
        client.roleReactions.set(messageId, roleMapping);

      } catch (error) {
        console.error('Error in prod_timezone_react:', error);
        // Only send error response if we haven't already sent a response
        if (!res.headersSent) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Error creating timezone reaction message',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
      }
    } else if (custom_id === 'prod_pronoun_react') {
      // Use the enhanced pronoun reaction function with heart emojis
      try {
        const guildId = req.body.guild_id;
        const channelId = req.body.channel_id;
        const token = req.body.token;
        
        // Load guild data for the enhanced function
        const playerData = await loadPlayerData();
        const guildData = { 
          ...playerData[guildId], 
          guildId // Add guildId for the function
        };
        
        // Call the enhanced function that includes heart emojis
        const response = await createPronounReactionMessage(guildData, channelId, token, client);
        
        return res.send(response);

      } catch (error) {
        console.error('Error in prod_pronoun_react:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating pronoun reaction message',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_view_timezones') {
      // Display all timezone roles with Components V2
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const timezones = await getGuildTimezones(guildId);
        
        if (!Object.keys(timezones).length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '## Timezone Roles\n\nNo timezone roles found. Use **Edit Timezones** to add some.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        let timezoneList = '## Timezone Roles\n\n';
        for (const [roleId, timezoneData] of Object.entries(timezones)) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            const offset = timezoneData.offset;
            const offsetStr = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
            timezoneList += `<@&${roleId}> - ${offsetStr}\n`;
          }
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: timezoneList,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error viewing timezones:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error displaying timezone roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_view_pronouns') {
      // Display all pronoun roles
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const pronounRoleIDs = await getGuildPronouns(guildId);
        
        if (!pronounRoleIDs?.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '## Pronoun Roles\n\nNo pronoun roles found. Use **Edit Pronouns** to add some.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        let pronounList = '## Pronoun Roles\n\n';
        for (const roleId of pronounRoleIDs) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            pronounList += `<@&${roleId}>\n`;
          }
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: pronounList,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error viewing pronouns:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error displaying pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_view_tribes') {
      // Display all tribes organized by castlist
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const playerData = await loadPlayerData();
        const tribes = playerData[guildId]?.tribes || {};
        
        if (!Object.keys(tribes).length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '## Tribes\n\nNo tribes found. Use **Add Tribe** to create some.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Group tribes by castlist
        const castlistGroups = {};
        for (const [roleId, tribeData] of Object.entries(tribes)) {
          const castlistName = tribeData.castlist || 'default';
          if (!castlistGroups[castlistName]) {
            castlistGroups[castlistName] = [];
          }
          castlistGroups[castlistName].push({ roleId, ...tribeData });
        }
        
        let tribeList = '## Tribes\n\n';
        
        // Sort castlists with default first
        const sortedCastlists = Object.keys(castlistGroups).sort((a, b) => {
          if (a === 'default') return -1;
          if (b === 'default') return 1;
          return a.localeCompare(b);
        });
        
        for (const castlistName of sortedCastlists) {
          const castlistDisplay = castlistName === 'default' ? 'Castlist (default)' : `Castlist (${castlistName})`;
          tribeList += `**${castlistDisplay}**\n`;
          
          for (const tribe of castlistGroups[castlistName]) {
            const role = guild.roles.cache.get(tribe.roleId);
            if (role) {
              const emoji = tribe.emoji ? `${tribe.emoji} ` : '';
              tribeList += `• ${emoji}${role.name}\n`;
            }
          }
          tribeList += '\n';
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: tribeList,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error viewing tribes:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error displaying tribes.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_edit_timezones') {
      // Show role select menu for timezone editing
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const timezones = await getGuildTimezones(guildId);
        
        // Get existing timezone role IDs
        const existingTimezoneRoles = Object.keys(timezones);
        
        // Use Discord.js RoleSelectMenuBuilder for better compatibility
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('prod_edit_timezones_select')
          .setPlaceholder('Select roles to add/remove as timezone roles')
          .setMinValues(0)
          .setMaxValues(25);
        
        // Set default values if any exist (limited to Discord's 25 role maximum)
        if (existingTimezoneRoles.length > 0) {
          const limitedRoles = existingTimezoneRoles.slice(0, 25);
          roleSelect.setDefaultRoles(limitedRoles);
        }

        const row = new ActionRowBuilder()
          .addComponents(roleSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '## Edit Timezone Roles\n\nSelect which roles should be timezone roles. Currently selected roles are already ticked. Add or remove roles as needed.\n\n**Note:** If you add any new timezones, you need to set the offset afterwards using the \'Add Timezone\' button.',
            components: [row.toJSON()],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in prod_edit_timezones:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading timezone role editor.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_edit_pronouns') {
      // Show role select menu for pronoun editing
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const pronounRoleIDs = await getGuildPronouns(guildId);
        
        // Use Discord.js RoleSelectMenuBuilder for better compatibility
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('prod_edit_pronouns_select')
          .setPlaceholder('Select roles to add/remove as pronoun roles')
          .setMinValues(0)
          .setMaxValues(25);
        
        // Set default values if any exist (limited to Discord's 25 role maximum)
        if (pronounRoleIDs && pronounRoleIDs.length > 0) {
          const limitedRoles = pronounRoleIDs.slice(0, 25);
          roleSelect.setDefaultRoles(limitedRoles);
        }

        const row = new ActionRowBuilder()
          .addComponents(roleSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '## Edit Pronoun Roles\n\nSelect which roles should be pronoun roles. Currently selected roles are already ticked. Add or remove roles as needed.',
            components: [row.toJSON()],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in prod_edit_pronouns:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading pronoun role editor.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_add_tribe') {
      // Step 1: Role selection for tribe
      try {
        // Use Discord.js RoleSelectMenuBuilder for better compatibility
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('prod_add_tribe_role_select')
          .setPlaceholder('Select the role of the tribe you want to add to the castlist')
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder()
          .addComponents(roleSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '## Select tribe to add to castlist\n\nPlease select the role corresponding to the tribe you want to add to the castlist. If you have not yet created the tribe role, please do so from the discord roles menu.\n\nYou can add your tribes to the castlist before players have been assigned the tribes, however they\'ll appear blank if any spectator views the castlist.',
            components: [row.toJSON()],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in prod_add_tribe:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading tribe addition interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_clear_tribe') {
      // Show role select with existing tribes only
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const playerData = await loadPlayerData();
        const tribes = playerData[guildId]?.tribes || {};
        
        if (Object.keys(tribes).length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '## Clear Tribe\n\nNo tribes found to clear. Add some tribes first using **Add Tribe**.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create string select with existing tribe roles (showing castlist names)
        const existingTribeRoles = Object.keys(tribes);
        
        // Build options with role names and castlist info
        const options = [];
        for (const roleId of existingTribeRoles) {
          const role = guild.roles.cache.get(roleId);
          const tribeData = tribes[roleId];
          if (role) {
            const castlistName = tribeData.castlist || 'default';
            const emoji = tribeData.emoji ? `${tribeData.emoji} ` : '';
            options.push({
              label: `${emoji}${role.name}`,
              description: `Remove from castlist: ${castlistName}`,
              value: roleId,
              emoji: { name: '🗑️' }
            });
          }
        }
        
        // Use string select instead of role select for better UX
        const stringSelect = new StringSelectMenuBuilder()
          .setCustomId('prod_clear_tribe_select')
          .setPlaceholder('Select tribe to clear from castlist')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options.slice(0, 25)); // Discord limit

        const row = new ActionRowBuilder()
          .addComponents(stringSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '## Clear Tribe\n\nSelect the tribe you want to remove from the castlist. This will remove it from CastBot but won\'t delete the Discord role.',
            components: [row.toJSON()],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in prod_clear_tribe:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading tribe clearing interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_create_emojis') {
      // Show emoji generation/removal interface
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Get emoji counts and limits
        const emojis = await guild.emojis.fetch();
        const staticCount = emojis.filter(e => !e.animated).size;
        const animatedCount = emojis.filter(e => e.animated).size;
        
        // Calculate emoji limits based on server boost level
        let staticLimit = 50;
        let animatedLimit = 50;
        
        if (guild.premiumTier === 1) {
          staticLimit = 100;
          animatedLimit = 100;
        } else if (guild.premiumTier === 2) {
          staticLimit = 150;
          animatedLimit = 150; 
        } else if (guild.premiumTier === 3) {
          staticLimit = 250;
          animatedLimit = 250;
        }
        
        // Get all roles in the server (excluding @everyone)
        const roles = await guild.roles.fetch();
        const selectableRoles = roles.filter(role => role.id !== guild.id && !role.managed)
          .sort((a, b) => b.position - a.position)
          .first(25); // Discord select menu limit
        
        if (selectableRoles.size === 0) {
          const errorContainer = {
            type: 17, // Container component
            accent_color: 0xFF6B6B, // Red accent color for error
            components: [
              {
                type: 10, // Text Display component
                content: `## Create or Remove Player Emojis\n\nNo selectable roles found in this server.`
              }
            ]
          };
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
              components: [errorContainer]
            }
          });
        }
        
        // Create role select menu
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('prod_emoji_role_select')
          .setPlaceholder('Select a role to generate/clear emojis for')
          .setMinValues(1)
          .setMaxValues(1);
        
        const row = new ActionRowBuilder()
          .addComponents(roleSelect);
        
        // Create Components V2 Container with all emoji management content
        const emojiContainer = {
          type: 17, // Container component
          accent_color: 0x7ED321, // Green accent color
          components: [
            {
              type: 10, // Text Display component
              content: `## Create or Remove Player Emojis

Select a role (tribe) in your server. CastBot will then automatically create emojis in your server based on each player's avatar, that can be used for trust rankings, fan favourite, etc.

Your server emoji limits are as follows:
\`${staticCount}/${staticLimit}\` static emojis
\`${animatedCount}/${animatedLimit}\` animated emojis

If you need more emoji space, delete existing ones from Server Settings > Emojis. If you want to remove castbot-created emojis, do it from this menu rather than manually.`
            },
            {
              type: 14 // Separator
            },
            row.toJSON() // Role select menu ActionRow
          ]
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
            components: [emojiContainer]
          }
        });
        
      } catch (error) {
        console.error('Error in prod_create_emojis:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading emoji generation interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('admin_set_pronouns_') || custom_id.startsWith('admin_set_timezone_') || custom_id.startsWith('admin_set_age_') || custom_id.startsWith('admin_manage_vanity_')) {
      // Use new modular handler for all admin buttons
      const playerData = await loadPlayerData();
      return await handlePlayerButtonClick(req, res, custom_id, playerData, client);
    // Removed disabled legacy vanity handler
    // Removed disabled legacy timezone handler
    } else if (custom_id.startsWith('admin_integrated_age') || custom_id.startsWith('player_integrated_age') ||
               custom_id.startsWith('admin_integrated_pronouns') || custom_id.startsWith('player_integrated_pronouns') ||
               custom_id.startsWith('admin_integrated_timezone') || custom_id.startsWith('player_integrated_timezone') ||
               custom_id.startsWith('admin_integrated_vanity')) {
      // 🔍 DEBUG: Log which integrated handler is being used
      console.log('🔍 DEBUG: Integrated select handler triggered for custom_id:', custom_id);
      // Handle ALL integrated select changes with auto-refresh
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const selectedValues = data.values || [];
        
        // Parse action type and target player
        let actionType, targetPlayerId, mode;
        
        if (custom_id.startsWith('player_integrated_')) {
          mode = 'player';
          targetPlayerId = req.body.member.user.id;
          actionType = custom_id.replace('player_integrated_', '').split('_')[0];
        } else {
          mode = 'admin';
          const parts = custom_id.split('_');
          actionType = parts[2]; // pronouns, timezone, age, or vanity
          targetPlayerId = parts[3];
        }

        const targetMember = await guild.members.fetch(targetPlayerId);

        // Handle the selection based on type
        if (actionType === 'pronouns') {
          // Remove all current pronoun roles
          const pronounRoleIDs = await getGuildPronouns(guildId);
          const currentPronounRoles = targetMember.roles.cache.filter(role => 
            pronounRoleIDs.includes(role.id)
          );
          if (currentPronounRoles.size > 0) {
            await targetMember.roles.remove(currentPronounRoles.map(role => role.id));
          }
          // Add new roles
          if (selectedValues.length > 0) {
            await targetMember.roles.add(selectedValues);
          }
        } else if (actionType === 'timezone') {
          // Remove current timezone role
          const timezones = await getGuildTimezones(guildId);
          const timezoneRoleIds = Object.keys(timezones);
          const currentTimezoneRole = targetMember.roles.cache.find(role => 
            timezoneRoleIds.includes(role.id)
          );
          if (currentTimezoneRole) {
            await targetMember.roles.remove(currentTimezoneRole.id);
          }
          // Add new timezone
          if (selectedValues.length > 0) {
            await targetMember.roles.add(selectedValues[0]);
          }
        } else if (actionType === 'age') {
          // Handle age selection
          if (selectedValues.length > 0) {
            const ageValue = selectedValues[0];
            if (ageValue === 'age_custom') {
              // Show modal for custom age
              const modal = new ModalBuilder()
                .setCustomId(mode === 'admin' ? `admin_age_modal_${targetPlayerId}` : 'player_age_modal')
                .setTitle('Set Player Age');

              const ageInput = new TextInputBuilder()
                .setCustomId('age')
                .setLabel('Enter your age')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10)
                .setPlaceholder("e.g. 25 or '30s'");

              const row = new ActionRowBuilder().addComponents(ageInput);
              modal.addComponents(row);

              return res.send({
                type: InteractionResponseType.MODAL,
                data: modal.toJSON()
              });
            } else {
              // Direct age selection
              const age = ageValue.replace('age_', '');
              await updatePlayer(guildId, targetPlayerId, { age });
            }
          }
        } else if (actionType === 'vanity') {
          // Handle vanity roles (admin only)
          const playerData = await loadPlayerData();
          if (!playerData[guildId].players[targetPlayerId]) {
            playerData[guildId].players[targetPlayerId] = {};
          }
          
          // Remove old vanity roles
          const oldVanityRoles = playerData[guildId].players[targetPlayerId].vanityRoles || [];
          if (oldVanityRoles.length > 0) {
            await targetMember.roles.remove(oldVanityRoles).catch(console.error);
          }
          
          // Save and add new vanity roles
          playerData[guildId].players[targetPlayerId].vanityRoles = selectedValues;
          await savePlayerData(playerData);
          
          if (selectedValues.length > 0) {
            await targetMember.roles.add(selectedValues);
          }
        }

        // Rebuild the interface with the same active button
        const freshPlayerData = await loadPlayerData();
        const activeButton = actionType === 'vanity' ? 'vanity' : actionType;
        
        const updatedUI = await createPlayerManagementUI({
          mode: mode === 'admin' ? PlayerManagementMode.ADMIN : PlayerManagementMode.PLAYER,
          targetMember,
          playerData: freshPlayerData,
          guildId,
          userId: req.body.member.user.id,
          showUserSelect: mode === 'admin',
          showVanityRoles: mode === 'admin',
          title: mode === 'admin' ? 
            `Player Management | ${targetMember.displayName}` : 
            'CastBot | Player Menu',
          activeButton,
          client
        });

        // Remove ephemeral flag for update
        updatedUI.flags = (1 << 15); // Only IS_COMPONENTS_V2

        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: updatedUI
        });

      } catch (error) {
        console.error('Error handling integrated select:', error);
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: 'Error updating selection.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    // Removed disabled legacy age handler
    } else if (false) { // DISABLED
      // Admin age management
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_set_age_${playerId}
        
        const guild = await client.guilds.fetch(guildId);
        
        // Check admin permissions
        const adminMember = await guild.members.fetch(adminUserId);
        if (!adminMember.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get target player
        let targetMember;
        try {
          targetMember = await guild.members.fetch(targetPlayerId);
        } catch (error) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Unable to find the target player in this server.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get current age if exists
        const currentAge = getPlayer(guildId, targetPlayerId)?.age || '';

        // Create age input modal
        const ageModal = new ModalBuilder()
          .setCustomId(`admin_age_modal_${targetPlayerId}`)
          .setTitle(`Set Age for ${targetMember.displayName}`);

        const ageInput = new TextInputBuilder()
          .setCustomId('age_input')
          .setLabel('Age')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter age (numbers only)')
          .setRequired(false)
          .setMaxLength(3);

        if (currentAge) {
          ageInput.setValue(currentAge);
        }

        const ageRow = new ActionRowBuilder().addComponents(ageInput);
        ageModal.addComponents(ageRow);

        return res.send({
          type: InteractionResponseType.MODAL,
          data: ageModal
        });

      } catch (error) {
        console.error('Error handling admin_set_age button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating age input',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    // Removed disabled legacy vanity handler  
    } else if (false) { // DISABLED
      // Admin vanity roles management
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_manage_vanity_${playerId}
        
        const guild = await client.guilds.fetch(guildId);
        
        // Check admin permissions
        const adminMember = await guild.members.fetch(adminUserId);
        if (!adminMember.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get target player
        let targetMember;
        try {
          targetMember = await guild.members.fetch(targetPlayerId);
        } catch (error) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Unable to find the target player in this server.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get current vanity roles
        const playerData = await loadPlayerData();
        const currentVanityRoles = playerData[guildId]?.players?.[targetPlayerId]?.vanityRoles || [];

        // Create role select menu
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId(`admin_select_vanity_${targetPlayerId}`)
          .setPlaceholder('Special roles to appear under the player in the castlist')
          .setMinValues(0)
          .setMaxValues(25);

        if (currentVanityRoles.length > 0) {
          const limitedRoles = currentVanityRoles.slice(0, 25);
          roleSelect.setDefaultRoles(limitedRoles);
        }

        const selectRow = new ActionRowBuilder().addComponents(roleSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Select vanity roles for **${targetMember.displayName}**:\n*These roles will appear under their name in the castlist.*`,
            components: [selectRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error handling admin_manage_vanity button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating vanity role selection',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'player_set_pronouns') {
      // Use new modular handler
      const playerData = await loadPlayerData();
      return await handlePlayerButtonClick(req, res, custom_id, playerData, client);
    } else if (custom_id === 'player_set_timezone') {
      // Use new modular handler
      const playerData = await loadPlayerData();
      return await handlePlayerButtonClick(req, res, custom_id, playerData, client);
    } else if (custom_id === 'player_set_age') {
      // Use new modular handler
      const playerData = await loadPlayerData();
      return await handlePlayerButtonClick(req, res, custom_id, playerData, client);
    } else if (custom_id === 'player_menu') {
      // Show player management menu
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        const playerData = await loadPlayerData();
        
        // Create player management UI
        const playerMenuUI = await createPlayerManagementUI({
          mode: PlayerManagementMode.PLAYER,
          targetMember: member,
          playerData,
          guildId,
          userId,
          showUserSelect: false,
          showVanityRoles: false,
          title: 'CastBot | Player Menu',
          activeButton: null,
          client
        });
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: playerMenuUI
        });
      } catch (error) {
        console.error('Error showing player menu:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error loading player menu.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'select_pronouns') {
      // Handle pronoun role selection
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        const userName = req.body.member.nick || req.body.member.user.username;
        const selectedRoleIds = data.values || [];

        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        // Check permissions for all selected roles before making any changes
        for (const roleId of selectedRoleIds) {
          const permissionCheck = await checkRoleHierarchyPermission(guild, roleId);
          if (!permissionCheck.allowed) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ ${permissionCheck.reason}`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
        }

        // Get all configured pronoun roles for this guild
        const pronounRoleIDs = await getGuildPronouns(guildId);
        
        // Remove all existing pronoun roles first
        const currentPronounRoles = member.roles.cache.filter(role => 
          pronounRoleIDs.includes(role.id)
        );
        
        if (currentPronounRoles.size > 0) {
          await member.roles.remove(currentPronounRoles.map(role => role.id));
        }

        // Add new selected roles
        if (selectedRoleIds.length > 0) {
          await member.roles.add(selectedRoleIds);
          
          // Get role names for confirmation message
          const selectedRoles = await Promise.all(
            selectedRoleIds.map(id => guild.roles.fetch(id))
          );
          const roleNames = selectedRoles.filter(role => role).map(role => role.name);
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `${userName} has set their pronouns to: ${roleNames.join(', ')}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `${userName} has removed all pronoun roles`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

      } catch (error) {
        console.error('Error handling pronoun selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'select_timezone') {
      // Handle timezone role selection
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        const userName = req.body.member.nick || req.body.member.user.username;
        const selectedRoleIds = data.values || [];

        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        // Check permissions for selected role before making any changes
        if (selectedRoleIds.length > 0) {
          const selectedRoleId = selectedRoleIds[0]; // Only take the first one
          const permissionCheck = await checkRoleHierarchyPermission(guild, selectedRoleId);
          if (!permissionCheck.allowed) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ ${permissionCheck.reason}`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
        }

        // Get all configured timezone roles for this guild
        const timezones = await getGuildTimezones(guildId);
        const timezoneRoleIds = Object.keys(timezones);
        
        // Remove all existing timezone roles first
        const currentTimezoneRoles = member.roles.cache.filter(role => 
          timezoneRoleIds.includes(role.id)
        );
        
        if (currentTimezoneRoles.size > 0) {
          await member.roles.remove(currentTimezoneRoles.map(role => role.id));
        }

        // Add new selected role (only one timezone allowed)
        if (selectedRoleIds.length > 0) {
          const selectedRoleId = selectedRoleIds[0]; // Only take the first one
          await member.roles.add(selectedRoleId);
          
          // Get role name and offset for confirmation message
          const selectedRole = await guild.roles.fetch(selectedRoleId);
          const timezoneData = timezones[selectedRoleId];
          const offset = timezoneData ? timezoneData.offset : 'Unknown';
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `${userName} has set their timezone to: ${selectedRole.name} (UTC${offset >= 0 ? '+' : ''}${offset})`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `${userName} has removed their timezone role`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

      } catch (error) {
        console.error('Error handling timezone selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting timezone role.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('admin_select_pronouns_')) {
      // Handle admin pronoun role selection
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_select_pronouns_${playerId}
        const selectedRoleIds = data.values || [];

        const guild = await client.guilds.fetch(guildId);
        const targetMember = await guild.members.fetch(targetPlayerId);
        const adminMember = await guild.members.fetch(adminUserId);

        // Check admin permissions
        if (!adminMember.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Check permissions for all selected roles before making any changes
        for (const roleId of selectedRoleIds) {
          const permissionCheck = await checkRoleHierarchyPermission(guild, roleId);
          if (!permissionCheck.allowed) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ ${permissionCheck.reason}`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
        }

        // Get all configured pronoun roles for this guild
        const pronounRoleIDs = await getGuildPronouns(guildId);
        
        // Remove all existing pronoun roles first
        const currentPronounRoles = targetMember.roles.cache.filter(role => 
          pronounRoleIDs.includes(role.id)
        );
        
        if (currentPronounRoles.size > 0) {
          await targetMember.roles.remove(currentPronounRoles.map(role => role.id));
        }

        // Add new selected roles
        if (selectedRoleIds.length > 0) {
          await targetMember.roles.add(selectedRoleIds);
          
          // Get role names for confirmation message
          const selectedRoles = await Promise.all(
            selectedRoleIds.map(id => guild.roles.fetch(id))
          );
          const roleNames = selectedRoles.filter(role => role).map(role => role.name);
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Set ${targetMember.displayName}'s pronouns to: ${roleNames.join(', ')}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Removed all pronoun roles from ${targetMember.displayName}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

      } catch (error) {
        console.error('Error handling admin pronoun selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('admin_select_timezone_')) {
      // Handle admin timezone role selection
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_select_timezone_${playerId}
        const selectedRoleIds = data.values || [];

        const guild = await client.guilds.fetch(guildId);
        const targetMember = await guild.members.fetch(targetPlayerId);
        const adminMember = await guild.members.fetch(adminUserId);

        // Check admin permissions
        if (!adminMember.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Check permissions for selected role before making changes
        if (selectedRoleIds.length > 0) {
          const permissionCheck = await checkRoleHierarchyPermission(guild, selectedRoleIds[0]);
          if (!permissionCheck.allowed) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ ${permissionCheck.reason}`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
        }

        // Get all configured timezone roles for this guild
        const timezoneRoles = await getGuildTimezones(guildId);
        const timezoneRoleIds = Object.keys(timezoneRoles || {});
        
        // Remove all existing timezone roles first
        const currentTimezoneRoles = targetMember.roles.cache.filter(role => 
          timezoneRoleIds.includes(role.id)
        );
        
        if (currentTimezoneRoles.size > 0) {
          await targetMember.roles.remove(currentTimezoneRoles.map(role => role.id));
        }

        // Add new selected role (only one timezone allowed)
        if (selectedRoleIds.length > 0) {
          await targetMember.roles.add(selectedRoleIds[0]);
          
          // Get role name and offset for confirmation message
          const selectedRole = await guild.roles.fetch(selectedRoleIds[0]);
          const offset = timezoneRoles[selectedRoleIds[0]]?.offset || 0;
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Set ${targetMember.displayName}'s timezone to: ${selectedRole.name} (UTC${offset >= 0 ? '+' : ''}${offset})`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Removed timezone role from ${targetMember.displayName}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

      } catch (error) {
        console.error('Error handling admin timezone selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting timezone role.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('admin_select_vanity_')) {
      // Handle admin vanity role selection
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_select_vanity_${playerId}
        const selectedRoleIds = data.values || [];

        const guild = await client.guilds.fetch(guildId);
        const targetMember = await guild.members.fetch(targetPlayerId);
        const adminMember = await guild.members.fetch(adminUserId);

        // Check admin permissions
        if (!adminMember.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !adminMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles, Manage Channels, or Manage Server permissions to use this feature.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Update player data with vanity roles (additive per user requirement)
        if (selectedRoleIds.length > 0) {
          // Get current vanity roles
          const currentPlayer = getPlayer(guildId, targetPlayerId) || {};
          const currentVanityRoles = currentPlayer.vanityRoles || [];
          
          // Add new roles to existing ones (additive) - avoid duplicates
          const newVanityRoles = [...new Set([...currentVanityRoles, ...selectedRoleIds])];
          
          // Update player data
          updatePlayer(guildId, targetPlayerId, { vanityRoles: newVanityRoles });
          
          // Get role names for confirmation (only show newly added roles)
          const rolePromises = selectedRoleIds.map(async (roleId) => {
            try {
              const role = await guild.roles.fetch(roleId);
              return role ? role.name : roleId;
            } catch {
              return roleId;
            }
          });
          
          const roleNames = await Promise.all(rolePromises);
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Added vanity roles to ${targetMember.displayName}: ${roleNames.join(', ')}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } else {
          // If no roles selected, treat as "clear all"
          updatePlayer(guildId, targetPlayerId, { vanityRoles: [] });
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Removed all vanity roles from ${targetMember.displayName}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

      } catch (error) {
        console.error('Error handling admin vanity role selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting vanity roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_edit_timezones_select') {
      // Handle timezone role selection for editing
      try {
        const guildId = req.body.guild_id;
        const selectedRoleIds = data.values || [];
        
        // Get current timezone roles
        const currentTimezones = await getGuildTimezones(guildId);
        const currentRoleIds = Object.keys(currentTimezones);
        
        // Determine which roles to add and remove
        const rolesToAdd = selectedRoleIds.filter(roleId => !currentRoleIds.includes(roleId));
        const rolesToRemove = currentRoleIds.filter(roleId => !selectedRoleIds.includes(roleId));
        
        // Update playerData
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) playerData[guildId] = {};
        if (!playerData[guildId].timezones) playerData[guildId].timezones = {};
        
        // Remove old roles
        for (const roleId of rolesToRemove) {
          delete playerData[guildId].timezones[roleId];
        }
        
        // Add new roles with default UTC offset (admins can adjust via slash commands)
        for (const roleId of rolesToAdd) {
          playerData[guildId].timezones[roleId] = { offset: 0 };
        }
        
        // Save data
        await savePlayerData(playerData);
        
        const addedCount = rolesToAdd.length;
        const removedCount = rolesToRemove.length;
        let resultMessage = '## Timezone Roles Updated!\n\n';
        
        if (addedCount > 0) {
          resultMessage += `✅ Added ${addedCount} timezone role(s)\n`;
        }
        if (removedCount > 0) {
          resultMessage += `🗑️ Removed ${removedCount} timezone role(s)\n`;
        }
        if (addedCount === 0 && removedCount === 0) {
          resultMessage += '✅ No changes made\n';
        }
        
        resultMessage += '\n**Note:** New timezone roles default to UTC+0. Use the "🗺️ Add Timezone" button to set specific offsets.';
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: resultMessage,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling timezone role selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error updating timezone roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_add_timezone') {
      // Show role select menu for adding a timezone with offset
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Use Discord.js RoleSelectMenuBuilder for selecting existing roles
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('prod_add_timezone_select')
          .setPlaceholder('Select an existing role from your server')
          .setMinValues(1)
          .setMaxValues(1);
        
        const row = new ActionRowBuilder().addComponents(roleSelect);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '## Add Timezone\n\nSelect an existing role from your server.\n\n**Example Positive UTC values:** 4 corresponds to UTC+4, 5.5 corresponds to UTC+5:30.\n**Example negative UTC values:** -5, -3.5.\n**Enter 0** where the offset is 0, like GMT.',
            components: [row.toJSON()],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in prod_add_timezone:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error displaying role selection.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_add_timezone_select') {
      // Handle role selection for adding timezone - show offset modal
      try {
        const selectedRoleId = data.values[0]; // Single role selection
        
        // Create offset input modal
        const modal = new ModalBuilder()
          .setCustomId(`prod_timezone_offset_modal_${selectedRoleId}`)
          .setTitle('Set Offset');

        const offsetInput = new TextInputBuilder()
          .setCustomId('offset')
          .setLabel('UTC Offset')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('e.g. 4, -5, 5.5, 0');

        const row = new ActionRowBuilder().addComponents(offsetInput);
        modal.addComponents(row);

        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error handling timezone role selection for offset:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error showing offset input.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_edit_pronouns_select') {
      // Handle pronoun role selection for editing
      try {
        const guildId = req.body.guild_id;
        const selectedRoleIds = data.values || [];
        
        // Update playerData
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) playerData[guildId] = {};
        
        // Set new pronoun roles (replace entirely)
        playerData[guildId].pronounRoleIDs = selectedRoleIds;
        
        // Save data
        await savePlayerData(playerData);
        
        const resultMessage = `## Pronoun Roles Updated!\n\n✅ Set ${selectedRoleIds.length} pronoun role(s)`;
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: resultMessage,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling pronoun role selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error updating pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_post_select_button') {
      // Handle Safari button selection for posting
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const selectedButtonId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to post custom buttons.')) return;
        
        console.log(`📤 DEBUG: Selected button ${selectedButtonId} to post`);
        
        // Import Safari manager functions
        const { getCustomButton } = await import('./safariManager.js');
        
        // Get the selected button details
        const button = await getCustomButton(guildId, selectedButtonId);
        if (!button) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Selected button not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create channel selection dropdown
        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId(`safari_post_channel_${selectedButtonId}`)
          .setPlaceholder('Choose a channel to post the button...')
          .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
        
        const channelSelectRow = new ActionRowBuilder().addComponents(channelSelect);
        
        // Create cancel button
        const cancelButton = new ButtonBuilder()
          .setCustomId('safari_post_button')
          .setLabel('⬅ Back')
          .setStyle(ButtonStyle.Secondary);
        
        const cancelRow = new ActionRowBuilder().addComponents(cancelButton);
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 📤 Post Custom Button\n\n**Selected:** ${button.label} ${button.emoji || ''}`
          },
          {
            type: 10, // Text Display component
            content: `> **Actions:** ${button.actions.length}\n> **Created:** ${new Date(button.metadata.createdAt).toLocaleDateString()}\n> **Usage:** ${button.metadata.usageCount} time${button.metadata.usageCount !== 1 ? 's' : ''}`
          },
          {
            type: 10, // Text Display component
            content: `**Choose a channel to post this button:**`
          },
          channelSelectRow.toJSON(), // Channel selection dropdown
          {
            type: 14 // Separator
          },
          cancelRow.toJSON() // Back button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0xf39c12, // Orange accent color
          components: containerComponents
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 flag + ephemeral
            components: [container]
          }
        });
        
      } catch (error) {
        console.error('Error handling safari button selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_post_channel_')) {
      // Handle Safari channel selection for posting button
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const buttonId = custom_id.replace('safari_post_channel_', '');
        const selectedChannelId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to post custom buttons.')) return;
        
        console.log(`📤 DEBUG: Posting button ${buttonId} to channel ${selectedChannelId}`);
        
        // Import Safari manager functions
        const { getCustomButton, postButtonToChannel } = await import('./safariManager.js');
        
        // Get the button details
        const button = await getCustomButton(guildId, buttonId);
        if (!button) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Post the button to the selected channel
        try {
          await postButtonToChannel(guildId, buttonId, selectedChannelId, client);
          
          // Get channel info for confirmation
          const channel = await client.channels.fetch(selectedChannelId);
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ **Button posted successfully!**\n\n**Button:** ${button.label} ${button.emoji || ''}\n**Channel:** <#${selectedChannelId}>\n\nPlayers can now interact with your custom button!`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
          
        } catch (postError) {
          console.error('Error posting button to channel:', postError);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to post button to channel. Please check bot permissions.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
      } catch (error) {
        console.error('Error handling safari channel selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error posting button.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_currency_select_user') {
      // Handle user selection for setting currency - show currency input modal
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const selectedUserId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to set player currency.')) return;
        
        console.log(`💰 DEBUG: Selected user ${selectedUserId} for currency setting`);
        
        // Get current currency balance
        const playerData = await loadPlayerData();
        const currentCurrency = playerData[guildId]?.players?.[selectedUserId]?.safari?.currency || 0;
        
        // Create currency input modal
        const modal = new ModalBuilder()
          .setCustomId(`safari_currency_modal_${selectedUserId}`)
          .setTitle('Set Player Currency');

        const currencyInput = new TextInputBuilder()
          .setCustomId('currency_amount')
          .setLabel('Currency Amount')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('Enter amount (0-999999)')
          .setValue(currentCurrency.toString());

        const row = new ActionRowBuilder().addComponents(currencyInput);
        modal.addComponents(row);

        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error handling currency user selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting user for currency.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_item_qty_user_select_')) {
      // Handle user selection for item quantity management - show quantity input modal
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const selectedUserId = data.values[0];
        
        // Extract item ID from custom_id: safari_item_qty_user_select_${guildId}_${itemId}
        const parts = custom_id.split('_');
        // Skip: safari(0), item(1), qty(2), user(3), select(4), guildId(5), then itemId starts at index 6
        const itemId = parts.slice(6).join('_'); // Everything after the guildId
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage player items.')) return;
        
        console.log(`📦 DEBUG: Selected user ${selectedUserId} for item ${itemId} quantity management`);
        
        // Load item data to get item name and attack info
        const { loadEntity } = await import('./entityManager.js');
        const item = await loadEntity(guildId, 'item', itemId);
        console.log(`📦 DEBUG: loadEntity result for item ${itemId}:`, item);
        const itemName = item?.name || 'Unknown Item';
        
        // Get current item quantity and check if it's an attack item
        const playerData = await loadPlayerData();
        const inventory = playerData[guildId]?.players?.[selectedUserId]?.safari?.inventory || {};
        const currentItem = inventory[itemId];
        
        let currentQuantity = '';
        let modalLabel = 'Qty';
        
        if (currentItem) {
          // Item exists - show current quantity
          currentQuantity = currentItem.quantity?.toString() || '0';
          
          // Check if it's an attack item (has numAttacksAvailable property)
          if (currentItem.numAttacksAvailable !== undefined) {
            modalLabel = `Qty (numAttacksAvailable = ${currentItem.numAttacksAvailable})`;
          }
        } else {
          // Item doesn't exist - blank modal (never interacted with this item)
          currentQuantity = '';
        }
        
        // Get target user info for modal title
        const guild = await client.guilds.fetch(guildId);
        const targetMember = await guild.members.fetch(selectedUserId);
        
        // Create quantity input modal
        const modal = new ModalBuilder()
          .setCustomId(`safari_item_qty_modal_${guildId}_${itemId}_${selectedUserId}`)
          .setTitle(`Set ${itemName} Quantity - ${targetMember.displayName}`);

        const quantityInput = new TextInputBuilder()
          .setCustomId('item_quantity')
          .setLabel(modalLabel)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('Enter quantity (0 or higher)');
        
        // Set value if item exists
        if (currentQuantity !== '') {
          quantityInput.setValue(currentQuantity);
        }

        const row = new ActionRowBuilder().addComponents(quantityInput);
        modal.addComponents(row);

        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });
        
      } catch (error) {
        console.error('Error handling item quantity user selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting user for item management.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_inventory_user_select') {
      // Handle user selection for inventory viewing - show complete player inventory
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const selectedUserId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to view player inventories.')) return;
        
        console.log(`👀 DEBUG: Selected user ${selectedUserId} for inventory viewing`);
        
        // Import and use the existing inventory display function
        const { createPlayerInventoryDisplay } = await import('./safariManager.js');
        
        // Get user info for display
        const guild = await client.guilds.fetch(guildId);
        const targetMember = await guild.members.fetch(selectedUserId);
        
        // Create inventory display for the selected player
        const inventoryDisplay = await createPlayerInventoryDisplay(guildId, selectedUserId);
        
        // Extract the inventory components (it's wrapped in containers already)
        const inventoryComponents = inventoryDisplay.components;
        
        // Create admin header container
        const adminContainer = {
          type: 17, // Container component
          accent_color: 0x9b59b6, // Purple accent color for viewing
          components: [
            {
              type: 10, // Text Display component
              content: `## 👀 Admin View: ${targetMember.displayName}'s Inventory\n\n**Player:** ${targetMember.displayName}\n**User ID:** ${selectedUserId}`
            }
          ]
        };
        
        // Create back button container
        const backButton = new ButtonBuilder()
          .setCustomId('safari_view_player_inventory')
          .setLabel('⬅ Back to Player Select')
          .setStyle(ButtonStyle.Secondary);
        
        const backRow = new ActionRowBuilder().addComponents(backButton);
        
        const backContainer = {
          type: 17, // Container component
          accent_color: 0x9b59b6, // Purple accent color for viewing
          components: [
            {
              type: 14 // Separator
            },
            backRow.toJSON()
          ]
        };
        
        // Combine all containers
        const allContainers = [
          adminContainer,
          ...inventoryComponents,
          backContainer
        ];
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
            components: allContainers
          }
        });
        
      } catch (error) {
        console.error('Error handling inventory user selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error viewing player inventory.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    // safari_store_edit_select handler removed - functionality replaced by safari_store_manage_items
    } else if (custom_id === 'safari_item_edit_select') {
      // Handle item selection for editing - redirect to new entity management UI
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const selectedItemId = data.values[0];
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit items.')) return;
        
        console.log(`✏️ DEBUG: Selected item ${selectedItemId} for editing`);
        
        // Create entity management UI with selected item - go directly to edit mode
        const uiResponse = await createEntityManagementUI({
          entityType: 'item',
          guildId: guildId,
          selectedId: selectedItemId,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error handling item edit selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting item for editing.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    // ==================== ENTITY MANAGEMENT HANDLERS ====================
    // New entity management system for Safari items, stores, and buttons
    
    } else if (custom_id.startsWith('entity_select_')) {
      // Handle entity selection from dropdown
      try {
        const parts = custom_id.split('_');
        const entityType = parts.slice(2).join('_'); // Handle entity types with underscores
        const guildId = req.body.guild_id;
        const selectedValue = data.values[0];
        
        // Check permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, `You need Manage Roles permission to manage ${entityType}s.`)) return;
        
        console.log(`📋 DEBUG: Entity select - Type: ${entityType}, Value: ${selectedValue}`);
        
        // Handle special actions
        if (selectedValue === 'search_entities') {
          // Show search modal
          return res.send({
            type: InteractionResponseType.MODAL,
            data: {
              title: `Search ${entityType}s`,
              custom_id: `entity_search_modal_${entityType}`,
              components: [{
                type: 1, // ActionRow
                components: [{
                  type: 4, // Text Input
                  custom_id: 'search_term',
                  label: 'Search Term',
                  style: 1, // Short
                  placeholder: 'Enter name or description to search...',
                  required: true,
                  max_length: 50
                }]
              }]
            }
          });
        } else if (selectedValue === 'create_new') {
          // Show creation modal with Item Info format (name, emoji, description)
          const { createFieldGroupModal } = await import('./fieldEditors.js');
          
          try {
            const modal = createFieldGroupModal(entityType, 'new', 'info', {});
            if (modal) {
              // Update modal title and custom_id for creation
              modal.data.title = `Create New ${entityType === 'safari_button' ? 'Button' : entityType.charAt(0).toUpperCase() + entityType.slice(1)}`;
              modal.data.custom_id = `entity_create_modal_${entityType}_info`;
              return res.send(modal);
            }
          } catch (modalError) {
            console.error('Error creating field group modal:', modalError);
          }
          
          // Fallback to simple modal if field group modal fails
          return res.send({
            type: InteractionResponseType.MODAL,
            data: {
              title: `Create New ${entityType === 'safari_button' ? 'Button' : entityType.charAt(0).toUpperCase() + entityType.slice(1)}`,
              custom_id: `entity_create_modal_${entityType}`,
              components: [{
                type: 1, // ActionRow
                components: [{
                  type: 4, // Text Input
                  custom_id: 'name',
                  label: entityType === 'safari_button' ? 'Button Label' : 'Name',
                  style: 1, // Short
                  placeholder: `Enter ${entityType === 'safari_button' ? 'button label' : 'name'}...`,
                  required: true,
                  max_length: entityType === 'safari_button' ? 80 : 100
                }]
              }]
            }
          });
        } else {
          // Regular entity selection - go straight to edit mode
          const uiResponse = await createEntityManagementUI({
            entityType: entityType,
            guildId: guildId,
            selectedId: selectedValue,
            activeFieldGroup: null,
            searchTerm: '',
            mode: 'edit'
          });
          
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: uiResponse
          });
        }
      } catch (error) {
        console.error('Error in entity_select handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting entity.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else if (custom_id.startsWith('entity_edit_mode_')) {
      // Switch to edit mode for an entity
      try {
        console.log('🔍 DEBUG: Processing entity_edit_mode_', custom_id);
        const parts = custom_id.split('_');
        const entityType = parts[3];
        const entityId = parts.slice(4).join('_');
        const guildId = req.body.guild_id;
        console.log('🔍 DEBUG: Entity type:', entityType, 'ID:', entityId, 'Guild:', guildId);
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        const uiResponse = await createEntityManagementUI({
          entityType: entityType,
          guildId: guildId,
          selectedId: entityId,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        console.log('🔍 DEBUG: UI Response created successfully, sending update');
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error switching to edit mode:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error entering edit mode.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else if (custom_id.startsWith('entity_view_mode_')) {
      // Switch back to view mode for an entity
      try {
        const parts = custom_id.split('_');
        const entityType = parts[3];
        const entityId = parts.slice(4).join('_');
        const guildId = req.body.guild_id;
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        const uiResponse = await createEntityManagementUI({
          entityType: entityType,
          guildId: guildId,
          selectedId: entityId,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error switching to view mode:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error returning to view mode.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else if (custom_id.startsWith('entity_field_group_')) {
      // Handle field group button click
      try {
        // Parse: entity_field_group_{entityType}_{entityId}_{fieldGroup}
        const withoutPrefix = custom_id.replace('entity_field_group_', '');
        const parts = withoutPrefix.split('_');
        const entityType = parts[0];
        const fieldGroup = parts[parts.length - 1]; // Last part is always fieldGroup
        const entityId = parts.slice(1, -1).join('_'); // Everything between is entityId
        const guildId = req.body.guild_id;
        
        console.log('🔍 DEBUG: Field group click - Type:', entityType, 'ID:', entityId, 'Group:', fieldGroup);
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        // For consumable property, show select menu instead of modal
        if (fieldGroup === 'properties' && entityType === 'item') {
          const entity = await loadEntity(guildId, entityType, entityId);
          if (!entity) throw new Error('Entity not found');
          
          const uiResponse = await createEntityManagementUI({
            entityType: entityType,
            guildId: guildId,
            selectedId: entityId,
            activeFieldGroup: fieldGroup,
            searchTerm: '',
            mode: 'edit'
          });
          
          // Add consumable select in the correct position (before the second separator)
          const consumableSelect = createConsumableSelect(entityId, entity.consumable);
          const containerComponents = uiResponse.components[0].components;
          
          // Find the position of the second separator (before Done button)
          let insertIndex = containerComponents.length - 2; // Before separator and Done button
          for (let i = containerComponents.length - 1; i >= 0; i--) {
            if (containerComponents[i].type === 14) { // Separator
              insertIndex = i;
              break;
            }
          }
          
          // Insert the consumable select before the separator
          containerComponents.splice(insertIndex, 0, consumableSelect);
          
          return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: uiResponse
          });
        } else {
          // Open modal directly for field group editing
          const entity = await loadEntity(guildId, entityType, entityId);
          if (!entity) throw new Error('Entity not found');
          
          const modalResponse = createFieldGroupModal(entityType, entityId, fieldGroup, entity);
          if (!modalResponse) throw new Error('No modal available for this field group');
          
          return res.send(modalResponse);
        }
        
      } catch (error) {
        console.error('Error handling field group selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error selecting field group.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else if (custom_id.startsWith('entity_edit_modal_')) {
      // Show modal for editing fields (legacy handler - should not be used)
      try {
        // Parse: entity_edit_modal_{entityType}_{entityId}_{fieldGroup}
        const withoutPrefix = custom_id.replace('entity_edit_modal_', '');
        const parts = withoutPrefix.split('_');
        const entityType = parts[0];
        const fieldGroup = parts[parts.length - 1]; // Last part is always fieldGroup
        const entityId = parts.slice(1, -1).join('_'); // Everything between is entityId
        const guildId = req.body.guild_id;
        
        console.log('🔍 DEBUG: Modal handler - Type:', entityType, 'ID:', entityId, 'Group:', fieldGroup);
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        // Load current entity values
        const entity = await loadEntity(guildId, entityType, entityId);
        if (!entity) throw new Error('Entity not found');
        
        // Create modal
        const modal = createFieldGroupModal(entityType, entityId, fieldGroup, entity);
        if (!modal) {
          throw new Error('Invalid field group');
        }
        
        return res.send(modal);
        
      } catch (error) {
        console.error('Error showing edit modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error opening editor.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else if (custom_id.startsWith('entity_consumable_select_')) {
      // Handle consumable select for items
      try {
        const parts = custom_id.split('_');
        const entityType = parts[3];
        const entityId = parts.slice(4).join('_');
        const guildId = req.body.guild_id;
        const consumableValue = data.values[0];
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        // Update consumable field
        await updateEntityFields(guildId, entityType, entityId, {
          consumable: consumableValue
        });
        
        // Refresh UI
        const uiResponse = await createEntityManagementUI({
          entityType: entityType,
          guildId: guildId,
          selectedId: entityId,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error updating consumable:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error updating consumable property.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else if (custom_id.startsWith('entity_delete_mode_')) {
      // Switch to delete confirmation mode
      try {
        const parts = custom_id.split('_');
        const entityType = parts[3];
        const entityId = parts.slice(4).join('_');
        const guildId = req.body.guild_id;
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        const uiResponse = await createEntityManagementUI({
          entityType: entityType,
          guildId: guildId,
          selectedId: entityId,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'delete_confirm'
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error entering delete mode:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error preparing deletion.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else if (custom_id.startsWith('entity_confirm_delete_')) {
      // Confirm and execute deletion
      try {
        const parts = custom_id.split('_');
        const entityType = parts[3];
        const entityId = parts.slice(4).join('_');
        const guildId = req.body.guild_id;
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        console.log(`🗑️ DEBUG: Deleting ${entityType} ${entityId}`);
        
        // Delete entity
        const success = await deleteEntity(guildId, entityType, entityId);
        
        if (!success) {
          throw new Error('Failed to delete entity');
        }
        
        // Go back to entity list
        const uiResponse = await createEntityManagementUI({
          entityType: entityType,
          guildId: guildId,
          selectedId: null,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error deleting entity:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error deleting entity.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    // ==================== END ENTITY MANAGEMENT HANDLERS ====================
    
    } else if (custom_id === 'safari_currency_reset_confirm') {
      // Handle confirmation to reset all currency
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to reset currency.')) return;
        
        console.log('🗑️ DEBUG: Currency reset confirmed');
        
        // Reset all currency
        const playerData = await loadPlayerData();
        const guildPlayers = playerData[guildId]?.players || {};
        
        let playersResetCount = 0;
        let totalCurrencyReset = 0;
        
        for (const [userId, player] of Object.entries(guildPlayers)) {
          if (player.safari?.currency !== undefined) {
            totalCurrencyReset += player.safari.currency;
            player.safari.currency = 0;
            player.safari.lastInteraction = Date.now();
            playersResetCount++;
          }
        }
        
        if (playersResetCount > 0) {
          await savePlayerData(playerData);
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Currency Reset Complete!**\n\n**Players affected:** ${playersResetCount}\n**Total currency reset:** ${totalCurrencyReset} coins\n\nAll player balances have been set to 0.`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error confirming currency reset:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error resetting currency.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_add_tribe_role_select') {
      // Step 2: After role selected, show castlist selection
      try {
        const guildId = req.body.guild_id;
        const selectedRoleIds = data.values || [];
        
        if (selectedRoleIds.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Please select a tribe role.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const selectedRoleId = selectedRoleIds[0];
        
        // Get existing castlists
        const playerData = await loadPlayerData();
        const existingCastlists = new Set();
        
        if (playerData[guildId]?.tribes) {
          Object.values(playerData[guildId].tribes).forEach(tribe => {
            if (tribe.castlist && tribe.castlist !== 'default') {
              existingCastlists.add(tribe.castlist);
            }
          });
        }
        
        // Build string select options
        const options = [
          {
            label: 'Default Castlist',
            description: 'Recommended if you don\'t know what you\'re doing',
            value: 'default',
            emoji: { name: '✅' }
          }
        ];
        
        // Add existing custom castlists
        for (const castlistName of Array.from(existingCastlists).sort()) {
          options.push({
            label: castlistName.charAt(0).toUpperCase() + castlistName.slice(1),
            description: 'Existing custom castlist',
            value: castlistName,
            emoji: { name: '📃' }
          });
        }
        
        // Add "New Custom Castlist" option
        options.push({
          label: 'New Custom Castlist',
          description: 'Custom castlist, typically used for prod / winner / custom challenge teams',
          value: 'new_custom',
          emoji: { name: '📝' }
        });
        
        // Use Discord.js StringSelectMenuBuilder for better compatibility
        const stringSelect = new StringSelectMenuBuilder()
          .setCustomId(`prod_add_tribe_castlist_select_${selectedRoleId}`)
          .setPlaceholder('Select castlist')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options.slice(0, 25)); // Discord limit

        const row = new ActionRowBuilder()
          .addComponents(stringSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `## Select Castlist\n\nRole selected: <@&${selectedRoleId}>\n\nNow choose which castlist to add this tribe to:`,
            components: [row.toJSON()],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in add tribe role select:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing tribe role selection.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('prod_add_tribe_castlist_select_')) {
      // Step 3: After castlist selected, show modal for emoji input
      try {
        const roleId = custom_id.split('_').pop();
        const selectedCastlist = data.values?.[0];
        
        if (!selectedCastlist) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Please select a castlist.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        let finalCastlist = selectedCastlist;
        
        // If "new_custom" was selected, we'll handle it in the modal submission
        // For now, show the modal
        
        const modal = {
          title: 'Add Tribe - Final Step',
          custom_id: `prod_add_tribe_modal_${roleId}_${selectedCastlist}`,
          components: [
            {
              type: 1, // Action Row
              components: [
                {
                  type: 4, // Text Input
                  custom_id: 'tribe_emoji',
                  label: 'Tribe Emoji (Optional)',
                  style: 1, // Short
                  min_length: 0,
                  max_length: 3,
                  required: false,
                  placeholder: 'Shows a custom emoji in the tribe header'
                }
              ]
            }
          ]
        };
        
        // Show additional text input for custom castlist name if needed
        if (selectedCastlist === 'new_custom') {
          modal.components.push({
            type: 1, // Action Row
            components: [
              {
                type: 4, // Text Input
                custom_id: 'custom_castlist_name',
                label: 'Custom Castlist Name',
                style: 1, // Short
                min_length: 1,
                max_length: 50,
                required: true,
                placeholder: 'e.g. Winners, Production, Alumni'
              }
            ]
          });
        }

        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal
        });
        
      } catch (error) {
        console.error('Error in add tribe castlist select:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing castlist selection.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_clear_tribe_select') {
      // Handle clear tribe selection
      try {
        const guildId = req.body.guild_id;
        const selectedRoleIds = data.values || [];
        
        if (selectedRoleIds.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Please select at least one tribe to clear.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Load and update playerData
        const playerData = await loadPlayerData();
        if (!playerData[guildId]?.tribes) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No tribes found to clear.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const removedTribes = [];
        
        // Remove selected tribes
        for (const roleId of selectedRoleIds) {
          if (playerData[guildId].tribes[roleId]) {
            const guild = await client.guilds.fetch(guildId);
            const role = guild.roles.cache.get(roleId);
            removedTribes.push(role?.name || 'Unknown Role');
            delete playerData[guildId].tribes[roleId];
          }
        }
        
        await savePlayerData(playerData);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `## Tribes Cleared!\n\n🗑️ Removed ${removedTribes.length} tribe(s):\n${removedTribes.map(name => `• ${name}`).join('\n')}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error clearing tribes:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error clearing tribes.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_emoji_role_select') {
      // Handle emoji generation/removal role selection
      try {
        const guildId = req.body.guild_id;
        const selectedRoleIds = data.values || [];
        
        if (selectedRoleIds.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Please select a role to generate/clear emojis for.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const roleId = selectedRoleIds[0]; // Only one role can be selected
        const guild = await client.guilds.fetch(guildId);
        
        // Fetch the role specifically to ensure we have the latest data
        const role = await guild.roles.fetch(roleId);
        
        console.log(`DEBUG: Selected role ID: ${roleId}`);
        console.log(`DEBUG: Fetched role: ${role?.name} (${role?.id})`);
        
        if (!role) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Selected role not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Check if role has existing emojis generated for it
        const hasExistingEmojis = await checkRoleHasEmojis(guild, role);
        
        if (hasExistingEmojis) {
          // Clear existing emojis
          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `## Clearing Emojis for ${role.name}\n\n⏳ Removing existing emojis for members with the **${role.name}** role. This may take a moment...`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
          
          const emojiResult = await clearEmojisForRole(guild, role);
          
          // Prepare response message
          const messageLines = [`## Emoji Removal Complete for ${role.name}\n`];
          
          if (emojiResult.deletedLines.length > 0) {
            messageLines.push('✅ **Emojis removed:**');
            messageLines.push(...emojiResult.deletedLines.map(line => `• ${line}`));
            messageLines.push('');
          }
          
          if (emojiResult.errorLines.length > 0) {
            messageLines.push('⚠️ **Errors encountered:**');
            messageLines.push(...emojiResult.errorLines.map(line => `• ${line}`));
            messageLines.push('');
          }
          
          if (emojiResult.deletedLines.length === 0 && emojiResult.errorLines.length === 0) {
            messageLines.push('ℹ️ No emojis found to remove for this role.');
          }
          
          // Send follow-up response with results
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}`, {
            method: 'POST',
            body: {
              content: messageLines.join('\n'),
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
          
        } else {
          // Generate new emojis
          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `## Generating Emojis for ${role.name}\n\n⏳ Processing emoji generation for members with the **${role.name}** role. This may take a moment...`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
          
          const emojiResult = await generateEmojisForRole(guild, role);
          
          // Prepare response message
          const messageLines = [`## Emoji Generation Complete for ${role.name}\n`];
          
          if (emojiResult.resultLines.length > 0) {
            messageLines.push('✅ **New emojis created:**');
            messageLines.push(...emojiResult.resultLines.map(line => `• ${line}`));
            messageLines.push('');
          }
          
          if (emojiResult.existingLines.length > 0) {
            messageLines.push('ℹ️ **Existing emojis found:**');
            messageLines.push(...emojiResult.existingLines.map(line => `• ${line}`));
            messageLines.push('');
          }
          
          if (emojiResult.errorLines.length > 0) {
            messageLines.push('⚠️ **Errors encountered:**');
            messageLines.push(...emojiResult.errorLines.map(line => `• ${line}`));
            messageLines.push('');
          }
          
          if (emojiResult.maxEmojiReached) {
            messageLines.push('🚨 **Server emoji limit reached.** Some emojis could not be created.');
          }
          
          // Send follow-up response with results
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}`, {
            method: 'POST',
            body: {
              content: messageLines.join('\n'),
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
      } catch (error) {
        console.error('Error managing emojis:', error);
        
        // Send error follow-up
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}`, {
            method: 'POST',
            body: {
              content: 'Error managing emojis. Please try again later.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } catch (followUpError) {
          console.error('Error sending follow-up error message:', followUpError);
        }
      }
    } else if (custom_id === 'admin_player_select_update') {
      // Handle admin player selection using new modular system
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const selectedPlayerIds = data.values || [];
        
        // Load player data
        const playerData = await loadPlayerData();
        let targetMember = null;
        let titleContent = `Player Management | ${guild.name}`;

        // Handle player selection/deselection
        if (selectedPlayerIds.length > 0) {
          const selectedPlayerId = selectedPlayerIds[0];
          
          // Get selected player info
          try {
            targetMember = await guild.members.fetch(selectedPlayerId);
            titleContent = `Player Management | ${targetMember.displayName}`;
          } catch (error) {
            console.log('Player not found, keeping no selection');
            targetMember = null;
          }
        }

        // Create player management UI using the new module
        const managementUI = await createPlayerManagementUI({
          mode: PlayerManagementMode.ADMIN,
          targetMember,
          playerData,
          guildId,
          showUserSelect: true,
          showVanityRoles: true,
          title: titleContent,
          bottomLeftButton: {
            label: '⬅️ Menu',
            customId: 'prod_menu_back',
            style: ButtonStyle.Secondary
          }
        });

        // Remove ephemeral flag for update message
        managementUI.flags = (1 << 15); // Only IS_COMPONENTS_V2

        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: managementUI
        });

      } catch (error) {
        console.error('Error handling admin player selection update:', error);
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: 'Error updating player management interface.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'admin_select_player') {
      // Legacy handler - redirect to new system
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '🔄 Please use the updated Player Management interface from the main menu.',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });

    } else if (custom_id.startsWith('apply_')) {
      try {
        console.log('Processing apply button click:', custom_id);
        
        const configId = custom_id.replace('apply_', '');
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        const userDisplayName = req.body.member.nick || req.body.member.user.username;
        
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        
        // Get the application configuration
        console.log('Looking for application config:', configId, 'in guild:', guildId);
        const config = await getApplicationConfig(guildId, configId);
        console.log('Found config:', config ? 'Yes' : 'No');
        
        if (!config) {
          console.error(`Application config not found: ${configId} in guild: ${guildId}`);
          
          // Debug: List all available configs
          const playerData = await loadPlayerData();
          const allConfigs = playerData[guildId]?.applicationConfigs || {};
          console.log('Available configs:', Object.keys(allConfigs));
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Application button configuration not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create the application channel
        const result = await createApplicationChannel(guild, member, config);
        
        if (!result.success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: result.error,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ Your application channel has been created: ${result.channel}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error in apply button handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing application request.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'select_target_channel' || custom_id === 'select_application_category' || custom_id === 'select_button_style') {
      try {
        console.log('Processing application configuration selection:', custom_id);
        console.log('Raw data received:', JSON.stringify(data, null, 2));
        
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        
        // Get selected value from Components v2
        let selectedValue;
        if (!data.values || data.values.length === 0) {
          console.error('No values found in component data');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Error: No selection received. Please try again.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        selectedValue = data.values[0];
        console.log('Selected value:', selectedValue);
        
        // Find the temporary config for this user
        const playerData = await loadPlayerData();
        const guildData = playerData[guildId];
        
        if (!guildData?.applicationConfigs) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Configuration session expired. Please run /apply-button again.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Find the temp config for this user
        const tempConfigId = Object.keys(guildData.applicationConfigs)
          .find(id => id.startsWith(`temp_`) && id.includes(userId));
        
        if (!tempConfigId) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Configuration session not found. Please run /apply-button again.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const tempConfig = guildData.applicationConfigs[tempConfigId];
        
        console.log('Current tempConfig before update:', JSON.stringify(tempConfig, null, 2));
        
        // Update the temp config with the selection
        if (custom_id === 'select_target_channel') {
          tempConfig.targetChannelId = selectedValue;
          console.log('Updated targetChannelId to:', selectedValue);
        } else if (custom_id === 'select_application_category') {
          tempConfig.categoryId = selectedValue;
          console.log('Updated categoryId to:', selectedValue);
        } else if (custom_id === 'select_button_style') {
          tempConfig.buttonStyle = selectedValue;
          console.log('Updated buttonStyle to:', selectedValue);
        }
        
        console.log('Updated tempConfig after selection:', JSON.stringify(tempConfig, null, 2));
        
        // Save the updated temp config first
        await saveApplicationConfig(guildId, tempConfigId, tempConfig);
        
        // Check if all required selections are made for auto-creation
        if (tempConfig.targetChannelId && tempConfig.categoryId && tempConfig.buttonStyle) {
          console.log('All 3 selections complete, creating application button...');
          try {
            // All selections complete, create the final configuration and button
            const guild = await client.guilds.fetch(guildId);
            const targetChannel = await guild.channels.fetch(tempConfig.targetChannelId);
            const category = await guild.channels.fetch(tempConfig.categoryId);
            
            // Generate a unique config ID
            const finalConfigId = `config_${Date.now()}_${userId}`;
            
            // Create final configuration
            const finalConfig = {
              buttonText: tempConfig.buttonText,
              explanatoryText: tempConfig.explanatoryText,
              channelFormat: tempConfig.channelFormat,
              targetChannelId: tempConfig.targetChannelId,
              categoryId: tempConfig.categoryId,
              buttonStyle: tempConfig.buttonStyle,
              createdBy: userId,
              stage: 'active'
            };
            
            console.log('Saving final configuration...');
            // Save the final configuration
            await saveApplicationConfig(guildId, finalConfigId, finalConfig);
            
            console.log('Creating application button...');
            // Create the application button
            const button = createApplicationButton(tempConfig.buttonText, finalConfigId);
            button.setStyle(BUTTON_STYLES[tempConfig.buttonStyle]);
            
            const row = new ActionRowBuilder().addComponents(button);
            
            console.log('Posting button to target channel...');
            // Post the button to the target channel
            await targetChannel.send({
              content: tempConfig.explanatoryText,
              components: [row]
            });
            
            console.log('Cleaning up temporary config...');
            // Clean up temporary config
            const freshPlayerData = await loadPlayerData();
            if (freshPlayerData[guildId]?.applicationConfigs?.[tempConfigId]) {
              delete freshPlayerData[guildId].applicationConfigs[tempConfigId];
              await savePlayerData(freshPlayerData);
            }
            
            console.log('Sending success response...');
            return res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                content: `✅ Application button successfully created in ${targetChannel}!\n\n**Button Text:** "${tempConfig.buttonText}"\n**Style:** ${tempConfig.buttonStyle}\n**Category:** ${category.name}`,
                components: [],
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          } catch (autoCreateError) {
            console.error('Error in auto-creation:', autoCreateError);
            return res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                content: `❌ Error creating application button: ${autoCreateError.message}`,
                components: [],
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
        } else {
          // Show selection components for remaining choices
          const guild = await client.guilds.fetch(guildId);
          
          // Create ALL selection components (keep them visible)
          const allComponents = [];
          
          // Components v2: Native channel select with updated placeholder
          const channelPlaceholder = tempConfig.targetChannelId 
            ? `✅ Selected: #${(await guild.channels.fetch(tempConfig.targetChannelId)).name}` 
            : 'Select channel to post your app button in';
          
          const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('select_target_channel')
            .setPlaceholder(channelPlaceholder)
            .setChannelTypes([ChannelType.GuildText])
            .setMinValues(1)
            .setMaxValues(1);
          allComponents.push(new ActionRowBuilder().addComponents(channelSelect));
          
          // Always show category select with updated placeholder
          const categories = guild.channels.cache
            .filter(channel => channel.type === ChannelType.GuildCategory)
            .sort((a, b) => a.position - b.position)
            .first(25);
          
          const categoryPlaceholder = tempConfig.categoryId 
            ? `✅ Selected: ${(await guild.channels.fetch(tempConfig.categoryId)).name}` 
            : 'Select the category new apps will be added to';
          
          const categorySelect = new StringSelectMenuBuilder()
            .setCustomId('select_application_category')
            .setPlaceholder(categoryPlaceholder)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              categories.map(category => ({
                label: category.name,
                description: `${category.children.cache.size} channels`,
                value: category.id
              }))
            );
          allComponents.push(new ActionRowBuilder().addComponents(categorySelect));
          
          // Always show button style select with updated placeholder
          const stylePlaceholder = tempConfig.buttonStyle 
            ? `✅ Selected: ${tempConfig.buttonStyle}` 
            : 'Select app button color/style';
          
          const styleSelect = new StringSelectMenuBuilder()
            .setCustomId('select_button_style')
            .setPlaceholder(stylePlaceholder)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions([
              {
                label: 'Primary (Blue)',
                description: 'Blue button style',
                value: 'Primary'
              },
              {
                label: 'Secondary (Gray)',
                description: 'Gray button style',
                value: 'Secondary'
              },
              {
                label: 'Success (Green)',
                description: 'Green button style',
                value: 'Success'
              },
              {
                label: 'Danger (Red)',
                description: 'Red button style',
                value: 'Danger'
              }
            ]);
          allComponents.push(new ActionRowBuilder().addComponents(styleSelect));
          
          // No Submit/Cancel buttons in Components v2 mode - auto-creates when complete
          console.log('Components v2 mode - auto-creation when all 3 selections complete');
          
          const responseData = {
            components: allComponents,
            flags: InteractionResponseFlags.EPHEMERAL
          };

          console.log('Sending response data:', JSON.stringify(responseData, null, 2));
          
          try {
            return res.send({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: responseData
            });
          } catch (responseError) {
            console.error('Error sending response:', responseError);
            throw responseError;
          }
        }

      } catch (error) {
        console.error('Error in application configuration selection handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing configuration selection.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('castlist2_nav_')) {
      // Handle new castlist2 navigation system
      try {
        const user = req.body.member?.user || req.body.user;
        console.log(`Processing castlist2 navigation: ${custom_id} | User: ${user?.username || 'Unknown'}#${user?.discriminator || '0000'} (${user?.id || 'Unknown ID'})`);
        
        // Parse new format: castlist2_nav_${action}_${tribeIndex}_${tribePage}_${castlistName}
        // Example: castlist2_nav_next_page_0_0_default
        // We need to be careful because action can contain underscores (next_page, last_tribe, etc.)
        
        // Remove the 'castlist2_nav_' prefix
        const withoutPrefix = custom_id.substring('castlist2_nav_'.length);
        const parts = withoutPrefix.split('_');
        
        // Since actions can have underscores, we need to work backwards from the end
        // Last part is castlistName, second-to-last is tribePage, third-to-last is tribeIndex
        if (parts.length < 3) {
          throw new Error('Invalid navigation custom_id format');
        }
        
        const castlistName = parts[parts.length - 1];
        const currentTribePage = parseInt(parts[parts.length - 2]);
        const currentTribeIndex = parseInt(parts[parts.length - 3]);
        
        // Everything before the last 3 parts is the action
        const action = parts.slice(0, parts.length - 3).join('_');
        
        console.log('Parsed navigation:', { action, currentTribeIndex, currentTribePage, castlistName, user: `${user?.username}#${user?.discriminator} (${user?.id})` });
        
        // Ignore disabled buttons
        if (action.startsWith('disabled_')) {
          return res.send({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
          });
        }
        
        // Send deferred response
        res.send({
          type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
        
        const guildId = req.body.guild_id;
        
        // Load and process tribe data (reuse castlist2 logic)
        const rawTribes = await getGuildTribes(guildId, castlistName);
        const guild = await client.guilds.fetch(guildId);
        
        // Use cached data where possible for better performance
        const roles = guild.roles.cache.size > 0 ? guild.roles.cache : await guild.roles.fetch();
        
        // Force member refresh if cache appears stale (post-restart fix)
        let members = guild.members.cache;
        if (guild.members.cache.size === 0) {
          console.log('Member cache empty (likely post-restart), forcing refresh...');
          members = await guild.members.fetch();
        } else if (guild.members.cache.size < guild.memberCount * 0.8) {
          console.log(`Member cache appears incomplete (${guild.members.cache.size}/${guild.memberCount}), forcing refresh...`);
          members = await guild.members.fetch();
        }

        // Process tribes and gather member data
        const tribesWithMembers = await Promise.all(rawTribes.map(async (tribe) => {
          const role = roles.get(tribe.roleId);
          if (!role) return null;
          
          const tribeMembers = members.filter(member => member.roles.cache.has(role.id));
          return {
            ...tribe,
            name: role.name,
            memberCount: tribeMembers.size,
            members: Array.from(tribeMembers.values())
          };
        }));

        const validTribes = tribesWithMembers.filter(tribe => tribe !== null);
        const orderedTribes = reorderTribes(validTribes, req.body.member.user.id, "user-first", castlistName);
        const scenario = determineDisplayScenario(orderedTribes);
        
        // Calculate new navigation position
        let newTribeIndex = currentTribeIndex;
        let newTribePage = currentTribePage;
        
        switch(action) {
          case 'next_page':
            newTribePage++;
            break;
          case 'last_page':
            newTribePage--;
            break;
          case 'next_tribe':
            newTribeIndex++;
            newTribePage = 0; // Reset to first page of new tribe
            break;
          case 'last_tribe':
            newTribeIndex--;
            newTribePage = 0; // Reset to first page of new tribe
            break;
        }
        
        // Validate bounds
        if (newTribeIndex < 0 || newTribeIndex >= orderedTribes.length) {
          throw new Error('Invalid tribe index');
        }
        
        // Create new navigation state
        const navigationState = createNavigationState(orderedTribes, scenario, newTribeIndex, newTribePage);
        
        // Send updated response
        await sendCastlist2Response(req, guild, orderedTribes, castlistName, navigationState, req.body.member, req.body.channel_id);
        
        console.log(`Successfully navigated to tribe ${newTribeIndex + 1}, page ${newTribePage + 1}`);

      } catch (error) {
        console.error('Error handling castlist2 navigation:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            flags: 1 << 15, // Keep IS_COMPONENTS_V2 flag
            components: [
              {
                type: 10, // Text Display
                content: `# Error\nError navigating castlist: ${error.message}`
              }
            ]
          }
        });
      }
    } else if (custom_id.startsWith('castlist2_tribe_prev_') || custom_id.startsWith('castlist2_tribe_next_')) {
      // Handle castlist2 tribe navigation buttons
      try {
        console.log('Processing castlist2 tribe navigation:', custom_id);
        
        // Parse the custom_id to extract components
        // Format: castlist2_tribe_prev_${currentTribePage}_${castlistName} or castlist2_tribe_next_${currentTribePage}_${castlistName}
        const isNext = custom_id.startsWith('castlist2_tribe_next_');
        const prefix = isNext ? 'castlist2_tribe_next_' : 'castlist2_tribe_prev_';
        const parts = custom_id.substring(prefix.length).split('_');
        
        if (parts.length < 2) {
          throw new Error('Invalid tribe navigation custom_id format');
        }
        
        const currentTribePage = parseInt(parts[0]);
        const castlistName = parts.slice(1).join('_');
        
        console.log('Parsed tribe navigation:', { currentTribePage, castlistName, isNext });
        
        // Calculate new tribe page
        const newTribePage = isNext ? currentTribePage + 1 : currentTribePage - 1;
        
        // Send deferred response
        await res.send({
          type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
        
        const guildId = req.body.guild_id;
        
        // Load tribe data
        const tribes = await getGuildTribes(guildId, castlistName);
        const totalTribes = tribes.length;
        
        if (newTribePage < 0 || newTribePage >= totalTribes) {
          throw new Error('Invalid tribe page');
        }
        
        // Get the tribe to display
        const currentTribe = tribes[newTribePage];
        
        // Fetch guild data
        const fullGuild = await client.guilds.fetch(guildId, { force: true });
        await fullGuild.roles.fetch();
        const members = await fullGuild.members.fetch();
        
        // Get tribe role and members
        const role = await fullGuild.roles.fetch(currentTribe.roleId);
        if (!role) {
          throw new Error('Tribe role not found');
        }
        
        const tribeMembers = members.filter(member => member.roles.cache.has(role.id));
        console.log(`Found ${tribeMembers.size} members in ${role.name}`);
        
        // Get pronoun and timezone data
        const pronounRoleIds = await getGuildPronouns(guildId);
        const timezones = await getGuildTimezones(guildId);
        
        let tribeSection;
        
        if (tribeMembers.size === 0) {
          // Convert hex color to integer if needed
          let accentColor = 0x7ED321; // Default green
          if (currentTribe.color) {
            if (typeof currentTribe.color === 'string' && currentTribe.color.startsWith('#')) {
              // Convert hex string to integer
              accentColor = parseInt(currentTribe.color.slice(1), 16);
            } else if (typeof currentTribe.color === 'number') {
              accentColor = currentTribe.color;
            }
          }

          // Create empty tribe container
          tribeSection = {
            type: 17, // Container
            accent_color: accentColor,
            components: [
              {
                type: 10, // Text Display
                content: `# ${currentTribe.emoji || ''} ${role.name} ${currentTribe.emoji || ''}`.trim()
              },
              {
                type: 14 // Separator after tribe name
              },
              {
                type: 10, // Text Display
                content: '_No players yet_'
              }
            ]
          };
        } else {
          // Convert to array and sort by display name
          const sortedMembers = Array.from(tribeMembers.values())
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

          // Create tribe section using Components V2
          tribeSection = await createTribeSection(
            { ...currentTribe, name: role.name }, // Use role name for accuracy
            sortedMembers, // Pass all members, let createTribeSection handle pagination
            fullGuild,
            pronounRoleIds,
            timezones,
            0, // page within tribe
            13 // playersPerPage
          );
        }

        const tribeComponents = [tribeSection];
        const navigationRows = [];

        // Add tribe navigation buttons
        if (totalTribes > 1) {
          const navRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`castlist2_tribe_prev_${newTribePage}_${castlistName}`)
                .setLabel('◀ Last Tribe')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newTribePage === 0),
              new ButtonBuilder()
                .setCustomId(`castlist2_tribe_indicator_${newTribePage}`)
                .setLabel(`Tribe ${newTribePage + 1}/${totalTribes}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`castlist2_tribe_next_${newTribePage}_${castlistName}`)
                .setLabel('Next Tribe ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newTribePage >= totalTribes - 1)
            );
          navigationRows.push(navRow.toJSON());
        }

        // Create the complete Components V2 layout (viral buttons now in navigation)
        const responseData = createCastlistV2Layout(
          tribeComponents,
          castlistName,
          fullGuild,
          navigationRows,
          [], // No separate viral buttons needed
          client
        );

        // Check permissions and apply ephemeral flag if user cannot send messages
        const member = req.body.member;
        const channelId = req.body.channel_id;
        if (member && channelId) {
          const canSendMessages = await canSendMessagesInChannel(member, channelId, client);
          console.log(`Permission check: User ${member.user?.username} can send messages in channel ${channelId}: ${canSendMessages}`);
          
          if (!canSendMessages) {
            // Add ephemeral flag to response if user cannot send messages
            responseData.flags = (responseData.flags || 0) | InteractionResponseFlags.EPHEMERAL;
            console.log(`Applied ephemeral flag - castlist visible only to user ${member.user?.username}`);
          }
        }

        // Update the message
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: responseData,
        });

      } catch (error) {
        console.error('Error handling castlist2 tribe navigation:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            flags: 1 << 15, // IS_COMPONENTS_V2 flag
            components: [
              {
                type: 10, // Text Display
                content: `# Error\nError navigating tribes: ${error.message}`
              }
            ]
          },
        });
      }
    } else if (custom_id.startsWith('castlist2_prev_') || custom_id.startsWith('castlist2_next_')) {
      // Handle castlist2 pagination buttons
      try {
        console.log('Processing castlist2 navigation:', custom_id);
        
        // Parse the custom_id to extract components
        // Format: castlist2_prev_${tribeId}_${currentPage}_${castlistName} or castlist2_next_${tribeId}_${currentPage}_${castlistName}
        const isNext = custom_id.startsWith('castlist2_next_');
        const prefix = isNext ? 'castlist2_next_' : 'castlist2_prev_';
        const parts = custom_id.substring(prefix.length).split('_');
        
        if (parts.length < 3) {
          throw new Error('Invalid button custom_id format');
        }
        
        // Extract components - handle tribeId that might contain underscores
        const castlistName = parts[parts.length - 1];
        const currentPage = parseInt(parts[parts.length - 2]);
        const tribeId = parts.slice(0, parts.length - 2).join('_');
        
        console.log('Parsed navigation:', { tribeId, currentPage, castlistName, isNext });
        
        // Calculate new page
        const newPage = isNext ? currentPage + 1 : currentPage - 1;
        
        if (newPage < 0) {
          throw new Error('Cannot go to negative page');
        }
        
        // Send deferred response
        await res.send({
          type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        });
        
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Fetch guild data
        const fullGuild = await client.guilds.fetch(guildId, { force: true });
        await fullGuild.roles.fetch();
        const members = await fullGuild.members.fetch();
        
        // Load tribe data
        const tribes = await getGuildTribes(guildId, castlistName);
        const targetTribe = tribes.find(tribe => tribe.roleId === tribeId);
        
        if (!targetTribe) {
          throw new Error('Tribe not found');
        }
        
        // Get tribe role and members
        const tribeRole = await fullGuild.roles.fetch(targetTribe.roleId);
        if (!tribeRole) {
          throw new Error('Tribe role not found');
        }
        
        const tribeMembers = members.filter(member => member.roles.cache.has(targetTribe.roleId));
        const sortedMembers = Array.from(tribeMembers.values())
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        // Validate new page
        const playersPerPage = 10;
        const totalPages = Math.ceil(sortedMembers.length / playersPerPage);
        
        if (newPage >= totalPages) {
          throw new Error('Page exceeds total pages');
        }
        
        // Get pronoun and timezone data
        const pronounRoleIds = await getGuildPronouns(guildId);
        const timezones = await getGuildTimezones(guildId);
        
        // Get players for the new page
        const startIndex = newPage * playersPerPage;
        const endIndex = Math.min(startIndex + playersPerPage, sortedMembers.length);
        const playersToShow = sortedMembers.slice(startIndex, endIndex);
        
        // Process member data for the new page
        const memberDataPromises = playersToShow.map(member => 
          processMemberData(member, pronounRoleIds, timezones, guildId)
        );
        const processedMembers = await Promise.all(memberDataPromises);
        
        // Create updated tribe section with Components V2
        const updatedTribeSection = await createTribeSection(
          { ...targetTribe, name: tribeRole.name },
          playersToShow,
          fullGuild,
          pronounRoleIds,
          timezones,
          newPage,
          playersPerPage
        );
        
        // Create updated navigation buttons
        const navRow = createNavigationButtons(targetTribe.roleId, newPage, totalPages, castlistName);
        
        // Get the original message components and update them
        const originalMessage = req.body.message;
        const originalComponents = originalMessage.components || [];
        let updatedComponents = [...originalComponents];
        
        // Find the tribe container to update (look for containers with matching tribe name)
        let tribeContainerIndex = -1;
        for (let i = 0; i < originalComponents.length; i++) {
          const component = originalComponents[i];
          if (component.type === 17) { // Container type
            // Check if this container has the tribe name in its header
            const headerComponent = component.components?.[0];
            if (headerComponent?.type === 10 && headerComponent.content?.includes(tribeRole.name)) {
              tribeContainerIndex = i;
              break;
            }
          }
        }
        
        if (tribeContainerIndex >= 0) {
          // Update the specific tribe container
          updatedComponents[tribeContainerIndex] = updatedTribeSection;
        }
        
        // Find and update the navigation row for this tribe
        let navRowIndex = -1;
        for (let i = 0; i < updatedComponents.length; i++) {
          const component = updatedComponents[i];
          if (component.type === 1 && component.components?.length > 0) { // Action Row
            const firstButton = component.components[0];
            if (firstButton.custom_id && 
                (firstButton.custom_id.includes(`castlist2_prev_${tribeId}_`) || 
                 firstButton.custom_id.includes(`castlist2_next_${tribeId}_`))) {
              navRowIndex = i;
              break;
            }
          }
        }
        
        if (navRowIndex >= 0) {
          // Update the existing navigation row
          updatedComponents[navRowIndex] = navRow.toJSON();
        } else {
          // Add new navigation row if not found
          updatedComponents.push(navRow.toJSON());
        }
        
        // Check permissions and apply ephemeral flag if user cannot send messages
        const member = req.body.member;
        const channelId = req.body.channel_id;
        let responseFlags = 1 << 15; // IS_COMPONENTS_V2 flag
        
        if (member && channelId) {
          const canSendMessages = await canSendMessagesInChannel(member, channelId, client);
          console.log(`Permission check: User ${member.user?.username} can send messages in channel ${channelId}: ${canSendMessages}`);
          
          if (!canSendMessages) {
            // Add ephemeral flag to response if user cannot send messages
            responseFlags = responseFlags | InteractionResponseFlags.EPHEMERAL;
            console.log(`Applied ephemeral flag - castlist visible only to user ${member.user?.username}`);
          }
        }

        // Update the message with Components V2 flag
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            flags: responseFlags,
            components: updatedComponents
          },
        });
        
        console.log(`Successfully navigated to page ${newPage + 1} for tribe ${tribeRole.name}`);

      } catch (error) {
        console.error('Error handling castlist2 navigation:', error);
        
        try {
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `Error navigating castlist: ${error.message}`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
        } catch (updateError) {
          console.error('Error sending error response:', updateError);
        }
      }
    } else {
      // Fallback for unhandled button interactions
      console.log('🔍 DEBUG: Unhandled MESSAGE_COMPONENT custom_id:', custom_id);
      console.log('🔍 DEBUG: Interaction data:', JSON.stringify(data, null, 2));
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `❌ Unknown button interaction: ${custom_id}`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }
  } // end if MESSAGE_COMPONENT

  /**
   * Handle modal submissions
   */
  if (type === InteractionType.MODAL_SUBMIT) {
    const { custom_id, components } = data;
    console.log(`🔍 DEBUG: MODAL_SUBMIT received - custom_id: ${custom_id}`);
    
    if (custom_id === 'safari_button_modal') {
      // Handle Safari button creation modal submission
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const userId = member.user.id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to create custom buttons.')) return;

        console.log('📝 DEBUG: Safari button modal submitted');
        
        const buttonLabel = components[0].components[0].value?.trim();
        const buttonEmoji = components[1].components[0].value?.trim() || null;
        const buttonDesc = components[2].components[0].value?.trim() || null;
        
        if (!buttonLabel) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button label is required.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Create basic button with no actions yet
        const { createCustomButton } = await import('./safariManager.js');
        const buttonId = await createCustomButton(guildId, {
          label: buttonLabel,
          emoji: buttonEmoji,
          style: 'Primary',
          actions: [],
          tags: buttonDesc ? [buttonDesc] : []
        }, userId);
        
        console.log(`✅ DEBUG: Created button ${buttonId} successfully`);
        
        // Show action selection menu
        const actionMenu = {
          flags: (1 << 15), // IS_COMPONENTS_V2
          components: [{
            type: 17, // Container
            accent_color: 0xf39c12,
            components: [
              {
                type: 10, // Text Display
                content: `## 🎉 Button Created: ${buttonLabel} ${buttonEmoji || ''}\n\nNow add actions to your button (up to 5):`
              },
              {
                type: 1, // Action Row
                components: [
                  {
                    type: 2, // Button
                    custom_id: `safari_add_action_${buttonId}_display_text`,
                    label: 'Add Text Display',
                    style: 1,
                    emoji: { name: '📄' }
                  },
                  {
                    type: 2, // Button
                    custom_id: `safari_add_action_${buttonId}_update_currency`,
                    label: 'Add Currency Change',
                    style: 1,
                    emoji: { name: '💰' }
                  },
                  {
                    type: 2, // Button
                    custom_id: `safari_add_action_${buttonId}_follow_up`,
                    label: 'Add Follow-up Button',
                    style: 1,
                    emoji: { name: '🔗' }
                  },
                  {
                    type: 2, // Button
                    custom_id: `safari_add_action_${buttonId}_conditional`,
                    label: 'Add Conditional Action',
                    style: 1,
                    emoji: { name: '🔀' }
                  }
                ]
              },
              {
                type: 14 // Separator
              },
              {
                type: 1, // Action Row
                components: [
                  {
                    type: 2, // Button
                    custom_id: `safari_finish_button_${buttonId}`,
                    label: 'Finish & Save Button',
                    style: 3,
                    emoji: { name: '✅' }
                  },
                  {
                    type: 2, // Button
                    custom_id: 'prod_safari_menu',
                    label: 'Cancel',
                    style: 4,
                    emoji: { name: '❌' }
                  }
                ]
              }
            ]
          }]
        };
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: actionMenu
        });
        
      } catch (error) {
        console.error('Error handling safari button modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error creating button. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_action_modal_')) {
      // Handle Safari action modal submissions
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to add actions.')) return;

        // Match against known action types that may contain underscores  
        let actionType, buttonId;
        if (custom_id.endsWith('_display_text')) {
          actionType = 'display_text';
          buttonId = custom_id.replace('safari_action_modal_', '').replace('_display_text', '');
        } else if (custom_id.endsWith('_update_currency')) {
          actionType = 'update_currency';
          buttonId = custom_id.replace('safari_action_modal_', '').replace('_update_currency', '');
        } else if (custom_id.endsWith('_follow_up')) {
          actionType = 'follow_up_button';
          buttonId = custom_id.replace('safari_action_modal_', '').replace('_follow_up', '');
        } else if (custom_id.endsWith('_conditional')) {
          actionType = 'conditional';
          buttonId = custom_id.replace('safari_action_modal_', '').replace('_conditional', '');
        } else {
          // Fallback to old method for any unknown action types
          const parts = custom_id.split('_');
          actionType = parts[parts.length - 1];
          buttonId = parts.slice(3, parts.length - 1).join('_');
        }
        
        console.log(`🔧 DEBUG: Processing ${actionType} action for button ${buttonId}`);
        
        // Import safari manager to update the button
        const { getCustomButton } = await import('./safariManager.js');
        const button = await getCustomButton(guildId, buttonId);
        
        if (!button) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        let actionConfig = {};
        
        if (actionType === 'display_text') {
          const title = components[0].components[0].value?.trim() || null;
          const content = components[1].components[0].value?.trim();
          const colorStr = components[2].components[0].value?.trim();
          
          if (!content) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Content is required for text display actions.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          actionConfig = {
            title: title,
            content: content
          };
          
          // Parse color if provided
          if (colorStr) {
            let accentColor = null;
            if (colorStr.startsWith('#')) {
              accentColor = parseInt(colorStr.slice(1), 16);
            } else if (/^\d+$/.test(colorStr)) {
              accentColor = parseInt(colorStr);
            }
            if (accentColor !== null && !isNaN(accentColor)) {
              actionConfig.accentColor = accentColor;
            }
          }
          
        } else if (actionType === 'update_currency') {
          const amountStr = components[0].components[0].value?.trim();
          const message = components[1].components[0].value?.trim();
          
          const amount = parseInt(amountStr);
          if (isNaN(amount)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Currency amount must be a valid number.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          if (!message) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Message is required for currency actions.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          actionConfig = {
            amount: amount,
            message: message
          };
        } else if (actionType === 'follow_up_button') {
          const buttonId = components[0].components[0].value?.trim();
          const delayStr = components[1].components[0].value?.trim() || '0';
          const replaceStr = components[2].components[0].value?.trim() || 'false';
          
          if (!buttonId) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Target Button ID is required for follow-up actions.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          // Validate that the target button exists
          const { getCustomButton } = await import('./safariManager.js');
          const targetButton = await getCustomButton(guildId, buttonId);
          
          if (!targetButton) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ Target button "${buttonId}" not found. Please check the Button ID and try again.`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          // Parse delay (default 0, max 60)
          let delay = parseInt(delayStr) || 0;
          delay = Math.max(0, Math.min(60, delay));
          
          // Parse replace message option
          const replaceMessage = replaceStr.toLowerCase() === 'true';
          
          actionConfig = {
            buttonId: buttonId,
            delay: delay,
            replaceMessage: replaceMessage
          };
        } else if (actionType === 'conditional') {
          const conditionType = components[0].components[0].value?.trim();
          const conditionValue = components[1].components[0].value?.trim();
          const successAction = components[2].components[0].value?.trim();
          const failureAction = components[3].components[0].value?.trim() || null;
          
          if (!conditionType || !conditionValue || !successAction) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Condition type, value, and success action are required for conditional actions.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          // Validate condition type
          const validConditionTypes = ['currency_gte', 'currency_lte', 'has_item', 'not_has_item', 'button_used', 'cooldown_expired'];
          if (!validConditionTypes.includes(conditionType)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ Invalid condition type. Valid types: ${validConditionTypes.join(', ')}`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          // Validate action types
          const validActionTypes = ['display_text', 'update_currency', 'follow_up_button'];
          if (!validActionTypes.includes(successAction)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ Invalid success action type. Valid types: ${validActionTypes.join(', ')}`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          if (failureAction && !validActionTypes.includes(failureAction)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ Invalid failure action type. Valid types: ${validActionTypes.join(', ')}`,
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          actionConfig = {
            conditionType: conditionType,
            conditionValue: conditionValue,
            successAction: successAction,
            failureAction: failureAction
          };
        }
        
        // Add action to button
        const newAction = {
          type: actionType,
          order: button.actions.length + 1,
          config: actionConfig
        };
        
        button.actions.push(newAction);
        
        // Save updated button
        const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        safariData[guildId].buttons[buttonId] = button;
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Added ${actionType} action to button ${buttonId}`);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **${actionType.replace('_', ' ')} action added!**\n\nAction count: ${button.actions.length}/5\n\nAdd more actions or click **Finish & Save Button** when ready.`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error processing action modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error adding action. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('prod_add_tribe_modal_')) {
      // Handle Add Tribe final submission
      try {
        const parts = custom_id.split('_');
        const roleId = parts[4]; // prod_add_tribe_modal_{roleId}_{castlist}
        const selectedCastlist = parts.slice(5).join('_'); // Handle multi-word castlist names
        
        const emojiValue = components[0].components[0].value?.trim() || null;
        let customCastlistName = null;
        
        // Check if custom castlist name was provided
        if (components[1]?.components[0]?.value) {
          customCastlistName = components[1].components[0].value.trim();
        }
        
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const role = guild.roles.cache.get(roleId);
        
        if (!role) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Error: Selected role not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Determine final castlist name
        let finalCastlist = selectedCastlist;
        if (selectedCastlist === 'new_custom' && customCastlistName) {
          finalCastlist = customCastlistName; // Preserve capitalization and spaces like /add_tribe command
        }
        
        // Load player data and check for conflicts
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) playerData[guildId] = {};
        if (!playerData[guildId].tribes) playerData[guildId].tribes = {};
        
        // Check if tribe already exists in a different castlist
        const existingTribe = playerData[guildId].tribes[roleId];
        if (existingTribe && existingTribe.castlist !== finalCastlist) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Tribe not added - this tribe already exists in ${existingTribe.castlist}. You can only have each tribe in one castlist.`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Get role color
        const roleColor = role.hexColor && role.hexColor !== '#000000' ? role.hexColor : null;
        
        // Add analytics name
        let analyticsName = null;
        try {
          const emoji = emojiValue || '';
          analyticsName = emoji ? `${emoji} ${role.name} ${emoji}` : role.name;
        } catch (error) {
          console.debug(`Could not set analytics name for role: ${roleId}`);
        }
        
        // Update tribe data (replicating add_tribe logic but without player emoji generation)
        playerData[guildId].tribes[roleId] = {
          emoji: emojiValue,
          castlist: finalCastlist,
          showPlayerEmojis: false, // Always false per new specification
          color: roleColor,
          analyticsName,
          analyticsAdded: Date.now()
        };
        
        // Save data
        await savePlayerData(playerData);
        
        const emojiDisplay = emojiValue ? ` with emoji ${emojiValue}` : '';
        const castlistDisplay = finalCastlist === 'default' ? 'default castlist' : `"${finalCastlist}" castlist`;
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `## ✅ Tribe Added Successfully!\n\n**${role.name}** has been added to the ${castlistDisplay}${emojiDisplay}.\n\nPlayers can now view this tribe in the castlist once members are assigned to the role.`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling add tribe modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error adding tribe. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'age_modal' || custom_id === 'player_age_modal') {
      // Use new modular handler for player age modal
      const playerData = await loadPlayerData();
      return await handlePlayerModalSubmit(req, res, custom_id, playerData, client);
    } else if (custom_id === 'application_button_modal') {
      try {
        console.log('Processing application_button_modal submission');
        
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Handle the modal submission
        const result = await handleApplicationButtonModalSubmit(req.body, guild);
        
        if (!result.success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: result.error,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: result.response
        });

      } catch (error) {
        console.error('Error in application_button_modal handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing application button configuration.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('admin_age_modal_')) {
      // Use new modular handler for admin age modal
      const playerData = await loadPlayerData();
      return await handlePlayerModalSubmit(req, res, custom_id, playerData, client);
    } else if (custom_id.startsWith('prod_timezone_offset_modal_')) {
      // Handle timezone offset modal submission
      try {
        const roleId = custom_id.replace('prod_timezone_offset_modal_', '');
        const offsetValue = components[0].components[0].value?.trim();
        
        // Validate offset input
        const offset = parseFloat(offsetValue);
        if (isNaN(offset) || offset < -12 || offset > 14) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **Invalid offset value**\n\nPlease enter a valid UTC offset between -12 and +14 (e.g., 4, -5, 5.5, -3.5, 0)',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const role = guild.roles.cache.get(roleId);
        
        if (!role) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Error: Selected role not found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Update playerData with timezone role and offset
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) playerData[guildId] = {};
        if (!playerData[guildId].timezones) playerData[guildId].timezones = {};
        
        // Check if timezone already exists
        const existingOffset = playerData[guildId].timezones[roleId]?.offset;
        const isUpdate = existingOffset !== undefined;
        
        // Add or update timezone with offset
        playerData[guildId].timezones[roleId] = { offset };
        
        // Save data
        await savePlayerData(playerData);
        
        const offsetText = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
        const actionText = isUpdate ? 'updated' : 'added';
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Timezone ${actionText}!**\n\n**Role:** ${role.name}\n**Offset:** ${offsetText}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling timezone offset modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error processing timezone offset.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_currency_modal_')) {
      // Handle Safari currency setting modal submission
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        const userId = custom_id.replace('safari_currency_modal_', '');
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to set player currency.')) return;
        
        // Get currency amount from modal
        const currencyAmount = components[0].components[0].value?.trim();
        
        // Validate currency input
        const amount = parseInt(currencyAmount, 10);
        if (isNaN(amount) || amount < 0 || amount > 999999) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **Invalid currency amount**\n\nPlease enter a number between 0 and 999,999.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`💰 DEBUG: Setting currency for user ${userId} to ${amount}`);
        
        // Import Safari manager functions
        const { updateCurrency, getCurrency } = await import('./safariManager.js');
        
        // Get current currency to calculate difference
        const currentCurrency = await getCurrency(guildId, userId);
        const difference = amount - currentCurrency;
        
        // Update currency (set to exact amount)
        await updateCurrency(guildId, userId, difference);
        
        // Get user info for confirmation
        const guild = await client.guilds.fetch(guildId);
        const targetMember = await guild.members.fetch(userId);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Currency Updated!**\n\n**Player:** ${targetMember.displayName}\n**Previous Balance:** ${currentCurrency} coins\n**New Balance:** ${amount} coins\n**Change:** ${difference >= 0 ? '+' : ''}${difference} coins`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling currency modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error setting player currency.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_item_qty_modal_')) {
      // Handle Safari item quantity setting modal submission
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Extract IDs from custom_id: safari_item_qty_modal_${guildId}_${itemId}_${userId}
        const parts = custom_id.replace('safari_item_qty_modal_', '').split('_');
        const modalGuildId = parts[0];
        const userId = parts[parts.length - 1];
        const itemId = parts.slice(1, -1).join('_'); // Everything between guildId and userId
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage player items.')) return;
        
        // Get quantity amount from modal
        const quantityValue = components[0].components[0].value?.trim();
        
        // Validate quantity input
        const quantity = parseInt(quantityValue, 10);
        if (isNaN(quantity) || quantity < 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **Invalid quantity**\n\nPlease enter a number 0 or higher.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`📦 DEBUG: Setting item ${itemId} quantity for user ${userId} to ${quantity}`);
        
        // Load item data to check if it's an attack item
        const { loadEntity } = await import('./entityManager.js');
        const item = await loadEntity(guildId, 'item', itemId);
        console.log(`📦 DEBUG: loadEntity result for item ${itemId}:`, item);
        const itemName = item?.name || 'Unknown Item';
        const isAttackItem = item?.attackValue !== undefined && item?.attackValue > 0;
        
        // Get current player data
        const playerData = await loadPlayerData();
        
        // Ensure player structure exists
        if (!playerData[guildId]) {
          playerData[guildId] = { players: {} };
        }
        if (!playerData[guildId].players) {
          playerData[guildId].players = {};
        }
        if (!playerData[guildId].players[userId]) {
          playerData[guildId].players[userId] = {};
        }
        if (!playerData[guildId].players[userId].safari) {
          playerData[guildId].players[userId].safari = {};
        }
        if (!playerData[guildId].players[userId].safari.inventory) {
          playerData[guildId].players[userId].safari.inventory = {};
        }
        
        const inventory = playerData[guildId].players[userId].safari.inventory;
        const currentItem = inventory[itemId];
        
        // Get previous values for change calculation
        const previousQuantity = currentItem?.quantity || 0;
        const quantityChange = quantity - previousQuantity;
        
        // Update quantity
        if (quantity === 0 && !currentItem) {
          // Setting to 0 for non-existent item - create with 0
          inventory[itemId] = { quantity: 0 };
          if (isAttackItem) {
            inventory[itemId].numAttacksAvailable = 0;
          }
        } else if (quantity === 0 && currentItem) {
          // Setting existing item to 0 - keep structure but set to 0
          inventory[itemId].quantity = 0;
          if (isAttackItem) {
            inventory[itemId].numAttacksAvailable = 0;
          }
        } else {
          // Setting to non-zero value
          if (!currentItem) {
            // Create new item
            inventory[itemId] = { quantity: quantity };
            if (isAttackItem) {
              inventory[itemId].numAttacksAvailable = quantity;
            }
          } else {
            // Update existing item
            inventory[itemId].quantity = quantity;
            
            // For attack items, adjust numAttacksAvailable proportionally
            if (isAttackItem) {
              const previousAttacks = currentItem.numAttacksAvailable || 0;
              const newAttacks = Math.max(0, previousAttacks + quantityChange);
              inventory[itemId].numAttacksAvailable = newAttacks;
            }
          }
        }
        
        // Save player data
        await savePlayerData(playerData);
        
        // Get user info for confirmation
        const guild = await client.guilds.fetch(guildId);
        const targetMember = await guild.members.fetch(userId);
        
        // Create confirmation message
        let changeText = '';
        if (quantityChange > 0) {
          changeText = `**Change:** +${quantityChange}`;
        } else if (quantityChange < 0) {
          changeText = `**Change:** ${quantityChange}`;
        } else {
          changeText = '**Change:** No change';
        }
        
        let attackInfo = '';
        if (isAttackItem && inventory[itemId]) {
          attackInfo = `\n**Attacks Available:** ${inventory[itemId].numAttacksAvailable}`;
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Item Quantity Updated!**\n\n**Player:** ${targetMember.displayName}\n**Item:** ${itemName}\n**Previous Quantity:** ${previousQuantity}\n**New Quantity:** ${quantity}\n${changeText}${attackInfo}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling item quantity modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error setting item quantity.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_buy_')) {
      // MVP2: Handle item purchases (format: safari_buy_guildId_storeId_itemId_timestamp)
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        
        // Parse custom ID to extract store and item info
        const parts = custom_id.split('_');
        if (parts.length < 5) {
          throw new Error('Invalid buy button custom ID format');
        }
        
        const extractedGuildId = parts[2];
        const storeId = parts[3];
        const itemId = parts[4];
        
        // Verify guild ID matches
        if (extractedGuildId !== guildId) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Invalid purchase request.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`💳 DEBUG: Processing purchase: ${itemId} from store ${storeId} by user ${userId}`);
        
        // Import Safari manager functions
        const { buyItem } = await import('./safariManager.js');
        
        const result = await buyItem(guildId, storeId, itemId, userId);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: result
        });
        
      } catch (error) {
        console.error('Error handling item purchase:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error processing purchase. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_store_modal') {
      // Handle Safari store creation modal submission
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to create stores.')) return;
        
        // Extract form data
        const storeName = components[0].components[0].value?.trim();
        const storeEmoji = components[1].components[0].value?.trim() || null;
        const storeDescription = components[2].components[0].value?.trim() || null;
        const storeownerText = components[3].components[0].value?.trim() || null;
        
        // Validate required fields
        if (!storeName) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Store name is required.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`🏪 DEBUG: Creating store "${storeName}" for guild ${guildId}`);
        
        // Import Safari manager functions
        const { createStore } = await import('./safariManager.js');
        
        const result = await createStore(guildId, {
          name: storeName,
          emoji: storeEmoji,
          description: storeDescription,
          storeownerText: storeownerText,
          createdBy: member.user.id
        });
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ **Store Created Successfully!**\n\n**${storeEmoji ? storeEmoji + ' ' : ''}${storeName}**\n${storeDescription ? storeDescription : ''}\n\nStore ID: \`${result}\`\n\nYou can now add items to this store and assign it to buttons.`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error creating store:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error creating store. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_item_modal') {
      // Handle Safari item creation modal submission
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to create items.')) return;
        
        // Extract form data - Updated for Challenge Game Logic
        const components = req.body.data.components;
        const itemName = components[0].components[0].value?.trim();
        const priceStr = components[1].components[0].value?.trim();
        const goodOutcomeStr = components[2].components[0].value?.trim() || '';
        const badOutcomeStr = components[3].components[0].value?.trim() || '';
        const attackValueStr = components[4].components[0].value?.trim() || '';
        
        // Validate required fields
        if (!itemName) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Item name is required.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Validate price
        const price = parseInt(priceStr, 10);
        if (isNaN(price) || price < 0 || price > 999999) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Price must be a number between 0 and 999,999.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Validate and parse game values
        const validateGameValue = (value, fieldName) => {
          if (!value || value.trim() === '') return null; // Allow blank
          const num = parseInt(value.trim(), 10);
          if (isNaN(num) || num < 0 || num > 999999) {
            throw new Error(`${fieldName} must be a number between 0 and 999,999.`);
          }
          return num;
        };
        
        let goodOutcomeValue = null;
        let badOutcomeValue = null;
        let attackValue = null;
        
        try {
          goodOutcomeValue = validateGameValue(goodOutcomeStr, 'Good Outcome Yield');
          badOutcomeValue = validateGameValue(badOutcomeStr, 'Bad Outcome Yield');
          attackValue = validateGameValue(attackValueStr, 'Attack Power');
        } catch (validationError) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Validation Error: ${validationError.message}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`🎒 DEBUG: Creating item "${itemName}" for guild ${guildId} with game values: good=${goodOutcomeValue}, bad=${badOutcomeValue}, attack=${attackValue}`);
        
        // Import Safari manager functions
        const { createItem } = await import('./safariManager.js');
        
        // Create item with enhanced game data
        const result = await createItem(guildId, {
          name: itemName,
          emoji: '📦', // Default emoji, can be customized later
          description: `Game item for Challenge system`, // Default description
          basePrice: price,
          category: 'General', // Default category
          // Challenge Game Logic fields
          goodOutcomeValue: goodOutcomeValue,
          badOutcomeValue: badOutcomeValue,
          attackValue: attackValue,
          defenseValue: null, // Will be added in advanced settings
          consumable: 'No', // Default to No
          goodYieldEmoji: '☀️', // Default emoji
          badYieldEmoji: '☄️', // Default emoji
          createdBy: member.user.id
        });
        
        // Build success message showing game mechanics
        let successMessage = `✅ **Game Item Created Successfully!**\n\n**📦 ${itemName}**\n\n**Base Price:** ${price} coins`;
        
        if (goodOutcomeValue !== null || badOutcomeValue !== null) {
          successMessage += `\n\n**Yield Values:**`;
          if (goodOutcomeValue !== null) successMessage += `\n☀️ Good Event: ${goodOutcomeValue} coins`;
          if (badOutcomeValue !== null) successMessage += `\n☄️ Bad Event: ${badOutcomeValue} coins`;
        }
        
        if (attackValue !== null) {
          successMessage += `\n\n**Combat:**`;
          successMessage += `\n⚔️ Attack: ${attackValue}`;
        }
        
        successMessage += `\n\nItem ID: \`${result}\`\n\n💡 Use "Manage Items" to add defense values, consumable status, and customize emojis.\n\nYou can now add this item to stores and use it in the Challenge Game!`;
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: successMessage,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error creating item:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error creating item. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_properties_modal_')) {
      // Handle properties edit modal submission
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit properties.')) return;
        
        const buttonId = custom_id.replace('safari_properties_modal_', '');
        console.log(`🔧 DEBUG: Processing properties update for button ${buttonId}`);
        
        // Extract field values
        const label = components[0].components[0].value?.trim();
        const emoji = components[1].components[0].value?.trim() || '';
        const style = components[2]?.components[0]?.value?.trim() || 'Primary';
        const tagsString = components[3]?.components[0]?.value?.trim() || '';
        
        if (!label) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Button label is required.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Parse tags
        const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(t => t) : [];
        
        // Update button properties
        const { updateButtonProperties } = await import('./safariManager.js');
        const success = await updateButtonProperties(guildId, buttonId, {
          label,
          emoji,
          style,
          tags
        });
        
        if (!success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to update button properties.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Return to edit interface
        const { getCustomButton } = await import('./safariManager.js');
        const { EditInterfaceBuilder, EDIT_TYPES } = await import('./editFramework.js');
        
        const button = await getCustomButton(guildId, buttonId);
        const editBuilder = new EditInterfaceBuilder(EDIT_TYPES.BUTTON);
        const editInterface = editBuilder.createEditInterface(button, buttonId);
        
        // Add back button
        editInterface.components[0].components.push({
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'safari_button_manage_existing',
            label: '⬅ Back to Button List',
            style: 2,
            emoji: { name: '🔙' }
          }]
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: editInterface
        });
        
      } catch (error) {
        console.error('Error updating button properties:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error updating button properties.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('safari_edit_action_modal_')) {
      // Handle action edit modal submission
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to edit actions.')) return;
        
        // Parse custom_id: safari_edit_action_modal_buttonId_actionIndex_actionType
        const parts = custom_id.replace('safari_edit_action_modal_', '').split('_');
        const actionType = parts[parts.length - 1];
        const actionIndex = parseInt(parts[parts.length - 2]);
        const buttonId = parts.slice(0, -2).join('_');
        
        console.log(`🔧 DEBUG: Processing ${actionType} action edit for button ${buttonId}, action ${actionIndex}`);
        
        let actionConfig = {};
        
        if (actionType === 'display_text') {
          const title = components[0].components[0].value?.trim() || null;
          const content = components[1].components[0].value?.trim();
          
          if (!content) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Content is required for text display actions.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          actionConfig = { title, content };
          
        } else if (actionType === 'update_currency') {
          const amountStr = components[0].components[0].value?.trim();
          const message = components[1].components[0].value?.trim() || '';
          
          const amount = parseInt(amountStr);
          if (isNaN(amount)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Currency amount must be a valid number.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }
          
          actionConfig = { amount, message };
        }
        
        // Update the action
        const { updateButtonAction } = await import('./safariManager.js');
        const success = await updateButtonAction(guildId, buttonId, actionIndex, {
          type: actionType,
          config: actionConfig
        });
        
        if (!success) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Failed to update action.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Return to edit interface
        const { getCustomButton } = await import('./safariManager.js');
        const { EditInterfaceBuilder, EDIT_TYPES } = await import('./editFramework.js');
        
        const button = await getCustomButton(guildId, buttonId);
        const editBuilder = new EditInterfaceBuilder(EDIT_TYPES.BUTTON);
        const editInterface = editBuilder.createEditInterface(button, buttonId);
        
        // Add back button
        editInterface.components[0].components.push({
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'safari_button_manage_existing',
            label: '⬅ Back to Button List',
            style: 2,
            emoji: { name: '🔙' }
          }]
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: editInterface
        });
        
      } catch (error) {
        console.error('Error updating action:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error updating action.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    // LEGACY HANDLER - COMMENTED OUT: safari_customize_terms_modal
    // This modal handler has been replaced by the new Components V2 field group interface
    // Remove after confirming new system works properly
    /*
    } else if (custom_id === 'safari_customize_terms_modal') {
      // Handle Safari terms customization modal - LEGACY IMPLEMENTATION
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to customize Safari terms.')) return;
        
        // Extract modal input values from comprehensive Safari settings
        const components = req.body.data.components;
        const gameSettings = components[0]?.components[0]?.value || '75,50,25';
        const eventNames = components[1]?.components[0]?.value || 'Clear Skies,Meteor Strike';
        const eventEmojis = components[2]?.components[0]?.value || '☀️,☄️';
        const currencySettings = components[3]?.components[0]?.value || 'coins,🪙';
        const inventoryName = components[4]?.components[0]?.value || 'Nest';
        
        // Parse comma-separated values
        const parseCommaSeparated = (value, expectedCount, fieldName) => {
          if (!value || value.trim() === '') return new Array(expectedCount).fill(null);
          const parts = value.split(',').map(p => p.trim());
          if (parts.length !== expectedCount) {
            throw new Error(`${fieldName} must have exactly ${expectedCount} comma-separated values.`);
          }
          return parts;
        };
        
        let round1Good = null, round2Good = null, round3Good = null;
        let goodEventName = 'Clear Skies', badEventName = 'Meteor Strike';
        let goodEventEmoji = '☀️', badEventEmoji = '☄️';
        let currencyName = 'coins', currencyEmoji = '🪙';
        
        try {
          // Parse game settings (probabilities)
          if (gameSettings && gameSettings.trim() !== '') {
            const probabilities = parseCommaSeparated(gameSettings, 3, 'Game Settings');
            for (let i = 0; i < 3; i++) {
              if (probabilities[i] && probabilities[i] !== '') {
                const num = parseInt(probabilities[i], 10);
                if (isNaN(num) || num < 0 || num > 100) {
                  throw new Error(`Round ${i + 1} probability must be between 0 and 100.`);
                }
                if (i === 0) round1Good = num;
                if (i === 1) round2Good = num;
                if (i === 2) round3Good = num;
              }
            }
          }
          
          // Parse event names
          if (eventNames && eventNames.trim() !== '') {
            const names = parseCommaSeparated(eventNames, 2, 'Event Names');
            goodEventName = names[0] || 'Clear Skies';
            badEventName = names[1] || 'Meteor Strike';
          }
          
          // Parse event emojis
          if (eventEmojis && eventEmojis.trim() !== '') {
            const emojis = parseCommaSeparated(eventEmojis, 2, 'Event Emojis');
            goodEventEmoji = emojis[0] || '☀️';
            badEventEmoji = emojis[1] || '☄️';
          }
          
          // Parse currency settings
          if (currencySettings && currencySettings.trim() !== '') {
            const currency = parseCommaSeparated(currencySettings, 2, 'Currency Settings');
            currencyName = currency[0] || 'coins';
            currencyEmoji = currency[1] || '🪙';
          }
          
        } catch (validationError) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Validation Error: ${validationError.message}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`⚙️ DEBUG: Customizing Safari settings for guild ${guildId}: Currency="${currencyName}:${currencyEmoji}", Events="${goodEventName}:${badEventName}", Rounds="${round1Good},${round2Good},${round3Good}"`);
        
        // Import Safari manager functions
        const { updateCustomTerms } = await import('./safariManager.js');
        
        // Update all Safari settings
        const updateData = {
          currencyName: currencyName,
          inventoryName: inventoryName,
          currencyEmoji: currencyEmoji,
          goodEventName: goodEventName,
          badEventName: badEventName,
          goodEventEmoji: goodEventEmoji,
          badEventEmoji: badEventEmoji
        };
        
        // Add round probabilities if provided
        if (round1Good !== null) updateData.round1GoodProbability = round1Good;
        if (round2Good !== null) updateData.round2GoodProbability = round2Good;
        if (round3Good !== null) updateData.round3GoodProbability = round3Good;
        
        const success = await updateCustomTerms(guildId, updateData);
        
        if (!success) {
          throw new Error('Failed to update custom terms');
        }
        
        console.log(`✅ DEBUG: Safari settings updated successfully for guild ${guildId}`);
        
        // Build comprehensive success message
        let successMessage = `✅ **Safari Settings Updated!**\n\n**Currency:** ${currencyEmoji} ${currencyName}\n**Inventory:** ${inventoryName}`;
        
        successMessage += `\n\n**Events:**\n• Good: ${goodEventEmoji} ${goodEventName}\n• Bad: ${badEventEmoji} ${badEventName}`;
        
        if (round1Good !== null || round2Good !== null || round3Good !== null) {
          successMessage += `\n\n**Round Probabilities:**`;
          if (round1Good !== null) successMessage += `\n• Round 1: ${round1Good}% good`;
          if (round2Good !== null) successMessage += `\n• Round 2: ${round2Good}% good`;
          if (round3Good !== null) successMessage += `\n• Round 3: ${round3Good}% good`;
        }
        
        successMessage += `\n\n🎮 All settings configured for Challenge Game Logic!`;
        
        // Return success message
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: successMessage,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error updating Safari terms:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error updating Safari terms. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    */
    } else if (custom_id.startsWith('safari_config_modal_')) {
      // Handle field group modal submissions - Currency, Events, Rounds
      try {
        const guildId = req.body.guild_id;
        const member = req.body.member;
        
        // Check admin permissions
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to customize Safari terms.')) return;
        
        // Extract group key from custom_id (safari_config_modal_currency -> currency)
        const groupKey = custom_id.replace('safari_config_modal_', '');
        
        console.log(`⚙️ DEBUG: Processing field group modal submission for ${groupKey}`);
        
        // Process modal submission
        const { processFieldGroupSubmission } = await import('./safariConfigUI.js');
        const updates = processFieldGroupSubmission(groupKey, req.body.data);
        
        // Update Safari settings using existing function
        const { updateCustomTerms } = await import('./safariManager.js');
        const success = await updateCustomTerms(guildId, updates);
        
        if (!success) {
          throw new Error('Failed to update Safari settings');
        }
        
        console.log(`✅ DEBUG: Safari ${groupKey} settings updated successfully for guild ${guildId}:`, updates);
        
        // Get updated custom terms and return refreshed interface
        const { getCustomTerms } = await import('./safariManager.js');
        const updatedTerms = await getCustomTerms(guildId);
        
        // Create updated Safari customization interface
        const { createSafariCustomizationUI } = await import('./safariConfigUI.js');
        const interfaceData = await createSafariCustomizationUI(guildId, updatedTerms);
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: interfaceData
        });
        
      } catch (error) {
        console.error('Error updating Safari field group:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error updating Safari settings. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('entity_create_modal_')) {
      // Handle modal submission for entity creation
      try {
        // Parse: entity_create_modal_{entityType}_info
        const withoutPrefix = custom_id.replace('entity_create_modal_', '');
        const parts = withoutPrefix.split('_');
        const entityType = parts[0];
        const fieldGroup = parts[parts.length - 1]; // Should be 'info'
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        
        console.log(`📝 DEBUG: Entity creation modal submit - Type: ${entityType}, Group: ${fieldGroup}, User: ${userId}`);
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        // Parse submission data using field editors
        const { parseModalSubmission, validateFields } = await import('./fieldEditors.js');
        const fields = parseModalSubmission(data, fieldGroup);
        const validation = validateFields(fields, entityType);
        
        if (!validation.valid) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ ${validation.errors.join(', ')}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create the entity using entity manager
        const { createEntity } = await import('./entityManager.js');
        const createdEntity = await createEntity(guildId, entityType, fields, userId);
        
        console.log(`✅ DEBUG: Entity '${createdEntity.id}' created successfully`);
        
        // Redirect to edit interface for the newly created entity
        const { createEntityManagementUI } = await import('./entityManagementUI.js');
        const uiResponse = await createEntityManagementUI({
          entityType: entityType,
          guildId: guildId,
          selectedId: createdEntity.id,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error in entity creation modal handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error creating entity. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('entity_modal_submit_')) {
      // Handle modal submission for field editing
      try {
        // Parse: entity_modal_submit_{entityType}_{entityId}_{fieldGroup}
        const withoutPrefix = custom_id.replace('entity_modal_submit_', '');
        const parts = withoutPrefix.split('_');
        const entityType = parts[0];
        const fieldGroup = parts[parts.length - 1]; // Last part is always fieldGroup
        const entityId = parts.slice(1, -1).join('_'); // Everything between is entityId
        const guildId = req.body.guild_id;
        
        console.log(`📝 DEBUG: Modal submit - Type: ${entityType}, ID: ${entityId}, Group: ${fieldGroup}`);
        
        if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
        
        // Parse and validate submission
        const fields = parseModalSubmission(data, fieldGroup);
        const validation = validateFields(fields, entityType);
        
        if (!validation.valid) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ **Validation Error**\n\n${validation.errors.join('\n')}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Update entity
        await updateEntityFields(guildId, entityType, entityId, fields);
        
        // Refresh UI
        const uiResponse = await createEntityManagementUI({
          entityType: entityType,
          guildId: guildId,
          selectedId: entityId,
          activeFieldGroup: null,
          searchTerm: '',
          mode: 'edit'
        });
        
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: uiResponse
        });
        
      } catch (error) {
        console.error('Error handling modal submission:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Error saving changes: ${error.message}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'safari_export_modal') {
      // Handle export modal submission (no processing needed, data pre-filled)
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '✅ Export data has been displayed above. Copy the JSON content for importing elsewhere.',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
      
    } else if (custom_id === 'safari_import_modal') {
      // Handle import modal submission
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const member = req.body.member;
        
        // Security check - require ManageRoles permission
        if (!member?.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to import Safari data.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        console.log(`🔍 DEBUG: Processing Safari import for guild ${guildId} by user ${userId}`);
        
        // Extract import data from modal
        const importData = data.components[0]?.components[0]?.value;
        if (!importData || importData.trim() === '') {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Please provide JSON data to import.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Import Safari data
        const { importSafariData, formatImportSummary } = await import('./safariImportExport.js');
        const summary = await importSafariData(guildId, importData.trim());
        
        console.log(`✅ DEBUG: Safari import completed for guild ${guildId}:`, summary);
        
        // Return success message with summary
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: formatImportSummary(summary),
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error in Safari import modal handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Import failed: ${error.message}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
      
    } else {
      console.log(`⚠️ DEBUG: Unhandled MODAL_SUBMIT custom_id: ${custom_id}`);
    }
  } // end if MODAL_SUBMIT
  // ...rest of interaction handling...
}); // end app.post

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

// Log in to Discord with your client's token
// Add reaction event handlers for role assignment

client.on('messageReactionRemove', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;

  try {
    // Check if this is a pronoun role reaction
    if (client.roleReactions && client.roleReactions.has(reaction.message.id)) {
      const roleMapping = client.roleReactions.get(reaction.message.id);
      const roleId = roleMapping[reaction.emoji.name];
      
      if (roleId) {
        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id);
        
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);
          const role = await guild.roles.fetch(roleId);
          console.log(`Removed pronoun role ${role.name} from ${user.username}`);
        }
      }
    }

    // Timezone roles don't need remove handler since they're exclusive
  } catch (error) {
    console.error('Error handling reaction role removal:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);

// Helper functions moved to utils/emojiUtils.js (Phase 1A refactoring)

// Generate emojis for all members with a specific role
async function generateEmojisForRole(guild, role) {
  const resultLines = [];
  const existingLines = [];
  const errorLines = [];
  let maxEmojiReached = false;
  
  const guildId = guild.id;
  const roleId = role.id;
  
  // Load current player data
  const data = await loadPlayerData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId].players) data[guildId].players = {};
  
  // Fetch all members to ensure we have fresh data
  await guild.members.fetch();
  
  // Get members with this role
  const targetMembers = guild.members.cache.filter(member => 
    member.roles.cache.has(roleId) && !member.user.bot
  );
  
  console.log(`Found ${targetMembers.size} members with role ${role.name} (${roleId})`);
  
  if (targetMembers.size === 0) {
    return {
      resultLines: [],
      existingLines: [],
      errorLines: ['No members found with this role'],
      maxEmojiReached: false
    };
  }
  
  // Generate emojis for each member (same logic as add_tribe)
  for (const [memberId, member] of targetMembers) {
    try {
      // Check if player already has an emoji
      const existingPlayer = data[guildId].players?.[memberId];
      if (existingPlayer?.emojiCode) {
        existingLines.push(`${member.displayName}: Already has emoji ${existingPlayer.emojiCode}`);
        continue;
      }
      
      console.log(`Creating emoji for ${member.displayName} (${memberId})`);
      const result = await createEmojiForUser(member, guild);
      
      if (result && result.success) {
        // Update player data with emoji
        await updatePlayer(guildId, memberId, { emojiCode: result.emojiCode });
        resultLines.push(`${member.displayName} ${result.emojiCode} (${result.isAnimated ? 'animated' : 'static'})`);
      }
    } catch (error) {
      console.error(`Error creating emoji for ${member.displayName}:`, error);
      
      // Handle specific error types
      let errorMessage = `${member.displayName}: Error creating emoji`;
      
      if (error.code === 30008) {
        errorMessage = `${member.displayName}: Maximum emoji limit reached for server`;
        maxEmojiReached = true;
      } else if (error.message?.includes('emoji name')) {
        errorMessage = `${member.displayName}: Invalid emoji name`;
      }
      
      errorLines.push(errorMessage);
    }
  }
  
  return {
    resultLines,
    existingLines,
    errorLines,
    maxEmojiReached
  };
}


// createEmojiForUser function moved to utils/emojiUtils.js (Phase 1A refactoring)

// Check if a role has existing emojis generated for its members
// checkRoleHasEmojis function moved to utils/emojiUtils.js (Phase 1A refactoring)

// clearEmojisForRole function moved to utils/emojiUtils.js (Phase 1A refactoring)

// Update calculateCastlistFields to handle role ID correctly and manage spacers intelligently
// calculateCastlistFields function moved to utils/castlistUtils.js (Phase 1A refactoring)

// Add this helper function before handling the castlist command
// createMemberFields function moved to utils/castlistUtils.js (Phase 1A refactoring)

// Add this helper function before the castlist command handler!
// determineCastlistToShow function moved to utils/castlistUtils.js (Phase 1A refactoring)

// Add reaction handlers near client.on('guildCreate') handlers
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;

    // When a reaction is received, check if the structure is partial
    if (reaction.partial) {
      // If the message this reaction belongs to was removed, the fetching might result in an API error
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Something went wrong when fetching the message:', error);
        return;
      }
    }

    if (!client.roleReactions?.has(reaction.message.id)) return;

    const roleMapping = client.roleReactions.get(reaction.message.id);
    const roleId = roleMapping[reaction.emoji.name];
    if (!roleId) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);

    // Add permission check
    const permCheck = await checkRoleHierarchyPermission(guild, roleId);
    if (!permCheck.allowed) {
      // Remove the user's reaction to indicate failure
      await reaction.users.remove(user.id);
      
      try {
        // Try to DM the user about the error
        await user.send(`Could not assign role in ${guild.name}: ${permCheck.reason}. Please contact a server admin to fix the bot's role position.`);
      } catch (dmError) {
        console.log('Could not DM user about role assignment failure');
      }
      
      // Also log the error
      console.error(`Role assignment failed in ${guild.name}: ${permCheck.reason}`);
      return;
    }

    try {
      // Check if this is a timezone role - if so, remove other timezone roles first
      const roleMapping = client.roleReactions.get(reaction.message.id);
      const isTimezoneRole = roleMapping.isTimezone;
      
      if (isTimezoneRole) {
        // Remove all other timezone roles first
        const timezones = await getGuildTimezones(guild.id);
        const timezoneRoleIds = Object.keys(timezones);
        const currentTimezoneRoles = member.roles.cache.filter(r => timezoneRoleIds.includes(r.id));
        
        if (currentTimezoneRoles.size > 0) {
          await member.roles.remove(currentTimezoneRoles.map(r => r.id));
        }
        
        await member.roles.add(roleId);
        console.log(`Set timezone role ${roleId} for user ${user.tag}`);
      } else {
        // Regular pronoun role - just add it
        await member.roles.add(roleId);
        console.log(`Added pronoun role ${roleId} to user ${user.tag}`);
      }
    } catch (error) {
      console.error('Error adding role:', error);
      await reaction.users.remove(user.id);
    }
  } catch (error) {
    console.error('Error in messageReactionAdd:', error);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;

    // When a reaction is received, check if the structure is partial
    if (reaction.partial) {
      // If the message this reaction belongs to was removed, the fetching might result in an API error
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Something went wrong when fetching the message:', error);
        return;
      }
    }

    if (!client.roleReactions?.has(reaction.message.id)) return;

    const roleMapping = client.roleReactions.get(reaction.message.id);
    const roleId = roleMapping[reaction.emoji.name];
    if (!roleId) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);

    // Add permission check here too
    const permCheck = await checkRoleHierarchyPermission(guild, roleId);
    if (!permCheck.allowed) {
      console.error(`Role removal failed in ${guild.name}: ${permCheck.reason}`);
      return;
    }

    try {
      await member.roles.remove(roleId);
      console.log(`Removed role ${roleId} from user ${user.tag}`);
    } catch (error) {
      console.error('Error removing role:', error);
    }
  } catch (error) {
    console.error('Error in messageReactionRemove:', error);
  }
});

// Add near other helper functions
// checkRoleHierarchyPermission function moved to utils/roleUtils.js (Phase 1A refactoring)

// Add this function to check if spacers should be omitted to fit within field limits
// shouldOmitSpacers function moved to utils/castlistUtils.js (Phase 1A refactoring)

// Helper functions for Safari config UI
function getGroupDisplayName(groupKey) {
  const names = {
    currency: 'Currency & Inventory Settings',
    events: 'Event Customization Settings', 
    rounds: 'Round Probability Settings'
  };
  return names[groupKey] || 'Safari Settings';
}

function getFieldDisplayName(fieldKey) {
  const labels = {
    currencyName: 'Currency Name',
    currencyEmoji: 'Currency Emoji', 
    inventoryName: 'Inventory Name',
    goodEventName: 'Good Event Name',
    badEventName: 'Bad Event Name',
    goodEventEmoji: 'Good Event Emoji',
    badEventEmoji: 'Bad Event Emoji',
    round1GoodProbability: 'Round 1 Probability',
    round2GoodProbability: 'Round 2 Probability',
    round3GoodProbability: 'Round 3 Probability'
  };
  return labels[fieldKey] || fieldKey;
}

// Add this helper function at the end of the file before the last closing bracket
// handleSetupTycoons function moved to utils/roleUtils.js (Phase 1A refactoring)
