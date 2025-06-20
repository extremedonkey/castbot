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
  const castlistRows = createCastlistRows(allCastlists, castlistTribes, true);
  
  // Debug logging for castlist pagination
  console.log(`Created ${castlistRows.length} castlist row(s) for ${allCastlists.size} castlist(s)`);
  if (castlistRows.length > 1) {
    console.log('Pagination active: castlists split across multiple rows to prevent Discord ActionRow limit');
  }
  
  // Check if pronouns/timezones exist for conditional buttons
  const hasPronouns = playerData[guildId]?.pronounRoleIDs?.length > 0;
  const hasTimezones = playerData[guildId]?.timezones && Object.keys(playerData[guildId].timezones).length > 0;
  const hasRoles = hasPronouns || hasTimezones;
  
  // Create admin control buttons (moved Need Help to bottom row)
  const adminButtons = [
    new ButtonBuilder()
      .setCustomId('prod_setup')
      .setLabel('Setup')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🪛'),
    new ButtonBuilder()
      .setCustomId('prod_manage_pronouns_timezones')
      .setLabel('Manage Pronouns/Timezones')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💜'),
    new ButtonBuilder()
      .setCustomId('prod_manage_tribes')
      .setLabel('Manage Tribes')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔥')
  ];
  
  // Add Manage Players button conditionally (3rd position)
  if (hasRoles) {
    adminButtons.splice(2, 0, 
      new ButtonBuilder()
        .setCustomId('admin_manage_player')
        .setLabel('Manage Players')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🧑‍🤝‍🧑')
    );
  }
  
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
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🦁'),
    new ButtonBuilder()
      .setCustomId('prod_player_menu')
      .setLabel('My Profile')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👤'),
    new ButtonBuilder()
      .setLabel('Need Help?')
      .setStyle(ButtonStyle.Link)
      .setEmoji('❓')
      .setURL('https://discord.gg/H7MpJEjkwT')
  ];
  
  // Add special buttons only for specific user (Reece) - goes at the end
  if (userId === '391415444084490240') {
    adminActionButtons.push(
      new ButtonBuilder()
        .setCustomId('reece_stuff_menu')
        .setLabel('Reece Stuff')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('😌')
    );
  }
  
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
      content: `> **\`View Castlists\`**`
    },
    ...castlistRows, // Multiple castlist rows with pagination
    {
      type: 14 // Separator after castlist rows
    },
    {
      type: 10, // Text Display component
      content: `> **\`Configure Castlists\`**`
    },
    adminRow.toJSON(), // Admin management buttons
    {
      type: 14 // Separator after admin management row
    },
    {
      type: 10, // Text Display component
      content: `> **\`Misc\`**`
    },
    adminActionRow.toJSON() // New administrative action buttons
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
    flags: (1 << 15), // IS_COMPONENTS_V2 flag
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
      .setLabel('Analytics')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('📊'),
    new ButtonBuilder()
      .setCustomId('prod_live_analytics')
      .setLabel('Live Analytics')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔴'),
    new ButtonBuilder()
      .setCustomId('prod_server_usage_stats')
      .setLabel('Server Usage Stats')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📈')
  ];

  const analyticsButtonsRow2 = [
    new ButtonBuilder()
      .setCustomId('prod_toggle_live_analytics')
      .setLabel('Toggle Live Analytics')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🪵')
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
      content: `## Reece Stuff`
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
async function createSafariMenu() {
  // Create safari management buttons
  const safariButtons = [
    new ButtonBuilder()
      .setCustomId('safari_create_button')
      .setLabel('Create Custom Button')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId('safari_post_button')
      .setLabel('Post Custom Button')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📤'),
    new ButtonBuilder()
      .setCustomId('safari_manage_currency')
      .setLabel('Manage Currency')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💰'),
    new ButtonBuilder()
      .setCustomId('safari_view_buttons')
      .setLabel('View All Buttons')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📊'),
    new ButtonBuilder()
      .setCustomId('prod_setup_tycoons')
      .setLabel('Setup Tycoons')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💰')
  ];
  
  const safariRow = new ActionRowBuilder().addComponents(safariButtons);
  
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
      content: `## 🦁 Safari - Dynamic Content Manager\n\nCreate interactive experiences with custom buttons, currency systems, and chained actions.`
    },
    safariRow.toJSON(), // Safari management buttons
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

// Add these constants near the top with other constants
const REACTION_NUMBERS = [
  '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
  '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯',
  '🇰', '🇱', '🇲', '🇳', '🇴', '🇵', '🇶', '🇷', '🇸', '🇹'
];

/**
 * Send castlist2 response with dynamic component optimization
 * @param {Object} req - Request object with Discord interaction data
 * @param {Object} guild - Discord guild object
 * @param {Array} tribes - Array of tribe data with members
 * @param {string} castlistName - Name of the castlist
 * @param {Object} navigationState - Current navigation state
 */
async function sendCastlist2Response(req, guild, tribes, castlistName, navigationState) {
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
  
  // Send response
  const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
  await DiscordRequest(endpoint, {
    method: 'PATCH',
    body: responseData,
  });
}

// Add this near other constants
const STANDARD_PRONOUN_ROLES = [
  'He/Him',
  'She/Her',
  'They/Them',
  'They/He',
  'She/They',
  'Ask',
  'Any',
  'All Pronouns'
];

// Add this near other constants
const STANDARD_TIMEZONE_ROLES = [
  { name: 'PDT (UTC-7)', offset: -7 },
  { name: 'MDT (UTC-6)', offset: -6 },
  { name: 'CDT (UTC-5)', offset: -5 },
  { name: 'EDT (UTC-4)', offset: -4 },
  { name: 'GMT (UTC+0)', offset: 0 },
  { name: 'BST (UTC+1)', offset: 1 },
  { name: 'CEST (UTC+2)', offset: 2 },
  { name: 'GMT+8 (UTC+8)', offset: 8 },
  { name: 'AEST (UTC+10)', offset: 10 }
];

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
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package!
 */
app.use(express.json());

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
      
      // Get channel name from Discord API if possible
      let channelName = null;
      if (channelId) {
        try {
          // Try to get channel info from Discord API
          const channelResponse = await DiscordRequest(`channels/${channelId}`, { method: 'GET' });
          if (channelResponse.ok) {
            const channelData = await channelResponse.json();
            channelName = channelData.name;
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
    const readOnlyCommands = ['castlist', 'castlist2', 'getting_started', 'player_set_age', 'player_set_pronouns','player_set_timezone', 'menu'];  // Updated from set_age
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

    if (name === 'getting_started') {
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
              value: 'Use `/set_players_age` to bulk set ages for up to 12 players at a time (run the command twice to set up to 24 players). Or you can have players set their own age using `/player_set_age`.'
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
            embeds: [embed]
          }
        });

      } catch (error) {
        console.error('Error handling getting_started command:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error displaying getting started guide.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (name === 'castlist') {
    // ROUTE TO CASTLIST2: /castlist now uses Components V2 functionality
    try {
      console.log('Processing castlist command (routed to Components V2)');
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
              { type: 10, content: 'No tribes have been added yet. Please have production run the `/add_tribe` command and select the Tribe role for them to show up in this list.' }
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
      
      await sendCastlist2Response(req, fullGuild, orderedTribes, castlistToShow, navigationState);

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
            { type: 10, content: 'No tribes have been added yet. Please have production run the `/add_tribe` command and select the Tribe role for them to show up in this list.' }
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
    
    await sendCastlist2Response(req, fullGuild, orderedTribes, castlistToShow, navigationState);

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
      // Admin user - show production menu (public message)
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
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
          components: []
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
} else if (name === 'set_players_age') {  // Changed from setageall
      try {
        console.log('Processing setageall command');
        const guildId = req.body.guild_id;
        const updates = [];
        
        console.log('Command options:', data.options);
        
        // Process each player-age pair
        for (let i = 1; i <= 12; i++) {
          const playerOption = data.options?.find(opt => opt.name === `player${i}`);
          const ageOption = data.options?.find(opt => opt.name === `player${i}_age`); // Changed from player1age to player1_age
          
          if (playerOption && ageOption) {
            console.log(`Found player${i} data:`, {
              player: playerOption,
              age: ageOption
            });
            
            updates.push({
              playerId: playerOption.value,
              age: ageOption.value
            });
          }
        }
        
        if (updates.length === 0) {
          console.log('No valid player-age pairs found in options');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No valid player-age pairs provided',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Load and ensure guild data exists
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) {
          playerData[guildId] = { players: {} };
        }
        
        // Process updates
        const results = [];
        for (const update of updates) {
          if (!playerData[guildId].players) {
            playerData[guildId].players = {};
          }
          if (!playerData[guildId].players[update.playerId]) {
            playerData[guildId].players[update.playerId] = {};
          }
          
          playerData[guildId].players[update.playerId].age = update.age;
          results.push(`<@${update.playerId}> age set to ${update.age}`);
        }
        
        // Save changes
        await savePlayerData(playerData);
        
        console.log('Updates processed:', results);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Ages updated:\n${results.join('\n')}`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (err) {
        console.error('Error processing setageall command:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Failed to update ages.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
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

    if (sortedRoles.length > REACTION_NUMBERS.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Too many timezone roles (maximum ${REACTION_NUMBERS.length} supported)`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Timezone Role Selection')
      .setDescription('React with the emoji corresponding to your timezone:\n\n' + 
        sortedRoles.map((role, i) => `${REACTION_NUMBERS[i]} - ${role.name}`).join('\n'))
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
        `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${message.id}/reactions/${encodeURIComponent(REACTION_NUMBERS[i])}/@me`,
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
      Object.fromEntries(sortedRoles.map((role, i) => [REACTION_NUMBERS[i], role.id]))
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

    if (sortedRoles.length > REACTION_NUMBERS.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Too many pronoun roles (maximum ${REACTION_NUMBERS.length} supported)`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Pronoun Role Selection')
      .setDescription('React with the emoji corresponding to your pronouns:\n\n' + 
        sortedRoles.map((role, i) => `${REACTION_NUMBERS[i]} - ${role.name}`).join('\n'))
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
          `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${messageId}/reactions/${encodeURIComponent(REACTION_NUMBERS[i])}/@me`,
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
        console.error(`Failed to add reaction ${REACTION_NUMBERS[i]}:`, error);
      }
    }

    // Store role-emoji mappings in memory for reaction handler
    if (!client.roleReactions) client.roleReactions = new Map();
    client.roleReactions.set(messageId, 
      Object.fromEntries(sortedRoles.map((role, i) => [REACTION_NUMBERS[i], role.id]))
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

    if (sortedRoles.length > REACTION_NUMBERS.length) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Too many timezone roles (maximum ${REACTION_NUMBERS.length} supported)`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Timezone Role Selection')
      .setDescription('React with the emoji corresponding to your timezone:\n\n' + 
        sortedRoles.map((role, i) => `${REACTION_NUMBERS[i]} - ${role.name}`).join('\n'))
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
          `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${messageId}/reactions/${encodeURIComponent(REACTION_NUMBERS[i])}/@me`,
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
        console.error(`Failed to add reaction ${REACTION_NUMBERS[i]}:`, error);
      }
    }

    // Store role-emoji mappings in memory for reaction handler with timezone metadata
    if (!client.roleReactions) client.roleReactions = new Map();
    const roleMapping = Object.fromEntries(sortedRoles.map((role, i) => [REACTION_NUMBERS[i], role.id]));
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
    console.log('Processing setup_castbot command');
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    
    // Track results for both pronouns and timezones
    const created = { pronouns: [], timezones: [] };
    const failed = { pronouns: [], timezones: [] };
    const existingRoles = { pronouns: [], timezones: [] };

    // Create pronoun roles
    console.log('Creating pronoun roles...');
    for (const pronounRole of STANDARD_PRONOUN_ROLES) {
      try {
        const existing = guild.roles.cache.find(r => r.name === pronounRole);
        if (existing) {
          console.log(`Pronoun role ${pronounRole} already exists with ID ${existing.id}`);
          existingRoles.pronouns.push({ name: pronounRole, id: existing.id });
          continue;
        }

        const newRole = await guild.roles.create({
          name: pronounRole,
          mentionable: true,
          reason: 'CastBot pronoun role generation'
        });
        console.log(`Created pronoun role ${pronounRole} with ID ${newRole.id}`);
        created.pronouns.push({ name: pronounRole, id: newRole.id });
      } catch (error) {
        console.error(`Failed to create pronoun role ${pronounRole}:`, error);
        failed.pronouns.push(pronounRole);
      }
    }

    // Create timezone roles
    console.log('Creating timezone roles...');
    for (const timezone of STANDARD_TIMEZONE_ROLES) {
      try {
        const existing = guild.roles.cache.find(r => r.name === timezone.name);
        if (existing) {
          console.log(`Timezone role ${timezone.name} already exists with ID ${existing.id}`);
          existingRoles.timezones.push({ ...timezone, id: existing.id });
          continue;
        }

        const newRole = await guild.roles.create({
          name: timezone.name,
          mentionable: true,
          reason: 'CastBot timezone role generation'
        });
        console.log(`Created timezone role ${timezone.name} with ID ${newRole.id}`);
        created.timezones.push({ ...timezone, id: newRole.id });
      } catch (error) {
        console.error(`Failed to create timezone role ${timezone.name}:`, error);
        failed.timezones.push(timezone.name);
      }
    }

    // Update storage
    const playerData = await loadPlayerData();
    if (!playerData[guildId]) {
      playerData[guildId] = { pronounRoleIDs: [], timezones: {} };
    }

    // Update pronounRoleIDs
    const allPronounIds = [...created.pronouns, ...existingRoles.pronouns].map(role => role.id);
    playerData[guildId].pronounRoleIDs = [
      ...new Set([...playerData[guildId].pronounRoleIDs || [], ...allPronounIds])
    ];

    // Update timezones
    if (!playerData[guildId].timezones) {
      playerData[guildId].timezones = {};
    }
    
    // Add new and existing timezone roles
    [...created.timezones, ...existingRoles.timezones].forEach(tz => {
      playerData[guildId].timezones[tz.id] = {
        offset: tz.offset
      };
    });

    await savePlayerData(playerData);

    // Prepare response message
    const messageLines = [];
    
    // Pronouns section
    if (created.pronouns.length > 0) {
      messageLines.push('Created pronoun roles:');
      messageLines.push(...created.pronouns.map(role => `• ${role.name} (<@&${role.id}>)`));
    }
    if (existingRoles.pronouns.length > 0) {
      messageLines.push('\nExisting pronoun roles found:');
      messageLines.push(...existingRoles.pronouns.map(role => `• ${role.name} (<@&${role.id}>)`));
    }
    if (failed.pronouns.length > 0) {
      messageLines.push('\nFailed to create pronoun roles:');
      messageLines.push(...failed.pronouns.map(name => `• ${name}`));
    }

    // Timezone section
    messageLines.push('\n--- Timezones ---');
    if (created.timezones.length > 0) {
      messageLines.push('\nCreated timezone roles:');
      messageLines.push(...created.timezones.map(tz => 
        `• ${tz.name} (<@&${tz.id}>) [offset: ${tz.offset}]`));
    }
    if (existingRoles.timezones.length > 0) {
      messageLines.push('\nExisting timezone roles found:');
      messageLines.push(...existingRoles.timezones.map(tz => 
        `• ${tz.name} (<@&${tz.id}>) [offset: ${tz.offset}]`));
    }
    if (failed.timezones.length > 0) {
      messageLines.push('\nFailed to create timezone roles:');
      messageLines.push(...failed.timezones.map(name => `• ${name}`));
    }

    messageLines.push('\nCastBot has finished setting up Pronoun and Timezone Roles! Assign these roles to players to have them show up on the castlist.');

    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: messageLines.join('\n'),
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });

  } catch (error) {
    console.error('Error in role_generator command:', error);
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: 'Error generating roles.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  return;
} else if (name === 'setup_tycoons') {
  try {
    console.log('Processing setup_tycoons command');
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    
    // Check if we're in production mode and this command should be disabled
    const isProduction = process.env.PRODUCTION === 'TRUE';
    if (isProduction) {
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: 'This command is only available in development mode.',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
      return;
    }
    
    // Call the helper function to create the roles
    const result = await handleSetupTycoons(guild);
    
    // Send the formatted output back to the user
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: `Tycoons roles have been created successfully. Here are the role IDs in the format you requested:\n\n${result.formattedOutput}`,
      }
    });
  } catch (error) {
    console.error('Error in setup_tycoons command:', error);
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: 'Error setting up Tycoons roles.',
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
      
      // Get channel name from Discord API if possible
      let channelName = null;
      if (channelId) {
        try {
          // Try to get channel info from Discord API
          const channelResponse = await DiscordRequest(`channels/${channelId}`, { method: 'GET' });
          if (channelResponse.ok) {
            const channelData = await channelResponse.json();
            channelName = channelData.name;
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
    
    // Handle safari dynamic buttons (format: safari_guildId_buttonId_timestamp)
    if (custom_id.startsWith('safari_') && custom_id.split('_').length >= 4 && !custom_id.startsWith('safari_add_action_') && !custom_id.startsWith('safari_finish_button_') && !custom_id.startsWith('safari_action_modal_')) {
      try {
        const parts = custom_id.split('_');
        const guildId = parts[1];
        const buttonId = parts[2];
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
                description: 'No tribes have been added to the default Castlist yet. Please have production add tribes via the \'/prod_menu\' command!',
                color: 0x7ED321
              }],
              flags: InteractionResponseFlags.EPHEMERAL
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
        
        await sendCastlist2Response(req, fullGuild, orderedTribes, castlistToShow, navigationState);

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
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          console.log('🔍 DEBUG: User lacks admin permissions, sending error response');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need admin permissions to rank applicants.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
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
                description: 'No tribes have been added yet. Please have production run the `/add_tribe` command and select the Tribe role for them to show up in this list.',
                color: 0x7ED321
              }],
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Send deferred response
        res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

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
          await res.send({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
          });
          
          const guild = await client.guilds.fetch(guildId);
          const playerData = await loadPlayerData();
          
          // Create the full Components V2 admin interface (same as prod_menu)
          const userId = member?.user?.id;
          const menuResponse = await createProductionMenuInterface(guild, playerData, guildId, userId);
          
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: menuResponse
          });
        } else {
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
            data: managementUI
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
              value: 'Use `/set_players_age` to bulk set ages for up to 12 players at a time (run the command twice to set up to 24 players). Or you can have players set their own age using `/player_set_age`.'
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
      // Execute the same logic as the setup_castbot command
      try {
        // Send deferred response first
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        // Track results for both pronouns and timezones
        const created = { pronouns: [], timezones: [] };
        const failed = { pronouns: [], timezones: [] };
        const existingRoles = { pronouns: [], timezones: [] };

        // Create pronoun roles
        console.log('Creating pronoun roles...');
        for (const pronounRole of STANDARD_PRONOUN_ROLES) {
          try {
            const existing = guild.roles.cache.find(r => r.name === pronounRole);
            if (existing) {
              console.log(`Pronoun role ${pronounRole} already exists with ID ${existing.id}`);
              existingRoles.pronouns.push({ name: pronounRole, id: existing.id });
              continue;
            }

            const newRole = await guild.roles.create({
              name: pronounRole,
              mentionable: true,
              reason: 'CastBot pronoun role generation'
            });
            console.log(`Created pronoun role ${pronounRole} with ID ${newRole.id}`);
            created.pronouns.push({ name: pronounRole, id: newRole.id });
          } catch (error) {
            console.error(`Failed to create pronoun role ${pronounRole}:`, error);
            failed.pronouns.push(pronounRole);
          }
        }

        // Create timezone roles
        console.log('Creating timezone roles...');
        for (const timezone of STANDARD_TIMEZONE_ROLES) {
          try {
            const existing = guild.roles.cache.find(r => r.name === timezone.name);
            if (existing) {
              console.log(`Timezone role ${timezone.name} already exists with ID ${existing.id}`);
              existingRoles.timezones.push({ ...timezone, id: existing.id });
              continue;
            }

            const newRole = await guild.roles.create({
              name: timezone.name,
              mentionable: true,
              reason: 'CastBot timezone role generation'
            });
            console.log(`Created timezone role ${timezone.name} with ID ${newRole.id}`);
            created.timezones.push({ ...timezone, id: newRole.id });
          } catch (error) {
            console.error(`Failed to create timezone role ${timezone.name}:`, error);
            failed.timezones.push(timezone.name);
          }
        }

        // Update storage
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) {
          playerData[guildId] = { pronounRoleIDs: [], timezones: {} };
        }

        // Update pronounRoleIDs
        const allPronounIds = [...created.pronouns, ...existingRoles.pronouns].map(role => role.id);
        playerData[guildId].pronounRoleIDs = [
          ...new Set([...playerData[guildId].pronounRoleIDs || [], ...allPronounIds])
        ];

        // Update timezones
        if (!playerData[guildId].timezones) {
          playerData[guildId].timezones = {};
        }
        
        // Add new and existing timezone roles
        [...created.timezones, ...existingRoles.timezones].forEach(tz => {
          playerData[guildId].timezones[tz.id] = {
            offset: tz.offset
          };
        });

        await savePlayerData(playerData);

        // Prepare response message
        const messageLines = [];
        
        // Pronouns section
        if (created.pronouns.length > 0) {
          messageLines.push('Created pronoun roles:');
          messageLines.push(...created.pronouns.map(role => `• ${role.name} (<@&${role.id}>)`));
        }
        if (existingRoles.pronouns.length > 0) {
          messageLines.push('\nExisting pronoun roles found:');
          messageLines.push(...existingRoles.pronouns.map(role => `• ${role.name} (<@&${role.id}>)`));
        }
        if (failed.pronouns.length > 0) {
          messageLines.push('\nFailed to create pronoun roles:');
          messageLines.push(...failed.pronouns.map(name => `• ${name}`));
        }

        // Timezone section
        messageLines.push('\n--- Timezones ---');
        if (created.timezones.length > 0) {
          messageLines.push('\nCreated timezone roles:');
          messageLines.push(...created.timezones.map(tz => 
            `• ${tz.name} (<@&${tz.id}>) [offset: ${tz.offset}]`));
        }
        if (existingRoles.timezones.length > 0) {
          messageLines.push('\nExisting timezone roles found:');
          messageLines.push(...existingRoles.timezones.map(tz => 
            `• ${tz.name} (<@&${tz.id}>) [offset: ${tz.offset}]`));
        }
        if (failed.timezones.length > 0) {
          messageLines.push('\nFailed to create timezone roles:');
          messageLines.push(...failed.timezones.map(name => `• ${name}`));
        }

        messageLines.push('\nCastBot has finished setting up Pronoun and Timezone Roles! Assign these roles to players to have them show up on the castlist.');

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: messageLines.join('\n'),
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
      } catch (error) {
        console.error('Error handling setup_castbot button:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error setting up roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'prod_setup') {
      // Smart setup - check if roles exist and run setup accordingly
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const playerData = await loadPlayerData();
        
        const hasPronouns = playerData[guildId]?.pronounRoleIDs?.length > 0;
        const hasTimezones = playerData[guildId]?.timezones && Object.keys(playerData[guildId].timezones).length > 0;
        
        if (!hasPronouns && !hasTimezones) {
          // Run full setup_castbot logic (reuse existing code)
          // This would duplicate the setup_castbot handler logic here
          // For now, let's redirect to that handler
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: 'Click the Setup button to automatically create pronoun and timezone roles for your server.',
              components: [
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId('setup_castbot')
                      .setLabel('Run Full Setup')
                      .setStyle(ButtonStyle.Primary)
                      .setEmoji('⚙️')
                  )
              ]
            }
          });
        } else {
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: '# Setup\n\n✅ Server already has roles configured!\n☐ Players have assigned pronouns / timezones\n☐ You\'ve officially kicked off marooning\n☐ You\'ve assigned players from Discord their tribe roles\n☐ You\'ve used Castbot to add tribes to the castlist.',
              components: []
            }
          });
        }
        
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to access Safari features.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        const channelId = req.body.channel_id;
        const guildId = req.body.guild_id;
        const shouldUpdateMessage = await shouldUpdateProductionMenuMessage(channelId);
        
        console.log('🦁 DEBUG: Creating Safari submenu');
        
        // Create Safari submenu
        const safariMenuData = await createSafariMenu();
        
        const responseType = shouldUpdateMessage ? 
          InteractionResponseType.UPDATE_MESSAGE : 
          InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;
        
        return res.send({
          type: responseType,
          data: safariMenuData
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
        if (userId !== '391415444084490240') {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Access denied. This feature is restricted.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
          data: reeceMenuData
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
        if (userId !== '391415444084490240') {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Access denied. This feature is restricted.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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

        console.log('✅ DEBUG: User authorized, importing server usage analytics...');
        // Import and run server usage analytics
        const { generateServerUsageSummary, formatServerUsageForDiscord } = await import('./serverUsageAnalytics.js');
        console.log('✅ DEBUG: Server usage analytics imported successfully');
        
        // Generate 7-day usage summary
        console.log('✅ DEBUG: Generating server usage summary...');
        const summary = await generateServerUsageSummary(7);
        console.log('✅ DEBUG: Summary generated, formatting for Discord...');
        
        // Format for Discord display
        const discordResponse = formatServerUsageForDiscord(summary);
        console.log('✅ DEBUG: Formatted for Discord, sending response...');
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: discordResponse
        });
        
      } catch (error) {
        console.error('Error running server usage stats:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Error running server usage analytics. Check logs for details.',
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to create custom buttons.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to post custom buttons.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ **No custom buttons found**\n\nCreate a custom button first using **📝 Create Custom Button**.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
        // Create button selection dropdown (limit to 25 options for Discord)
        const buttonOptions = buttons.slice(0, 25).map(button => ({
          label: button.label,
          value: button.id,
          description: `${button.actions.length} action${button.actions.length !== 1 ? 's' : ''} • Created ${new Date(button.metadata.createdAt).toLocaleDateString()}`,
          emoji: button.emoji ? { name: button.emoji } : undefined
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
        
        // Create response with Components V2
        const containerComponents = [
          {
            type: 10, // Text Display component
            content: `## 📤 Post Custom Button\n\nSelect a button to post to a channel:`
          },
          {
            type: 10, // Text Display component
            content: `> **Available Buttons:** ${buttons.length}\n> **Showing:** ${Math.min(buttons.length, 25)}`
          },
          selectRow.toJSON(), // Button selection dropdown
          {
            type: 14 // Separator
          },
          cancelRow.toJSON() // Cancel button
        ];
        
        const container = {
          type: 17, // Container component
          accent_color: 0xf39c12, // Orange accent color
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to manage currency.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
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
    } else if (custom_id === 'safari_view_buttons') {
      // Handle View All Buttons - MVP1 implementation
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to view custom buttons.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
    } else if (custom_id === 'safari_currency_view_all') {
      // Handle View All Currency Balances
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to view currency balances.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to set player currency.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to reset currency.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
    } else if (custom_id.startsWith('safari_add_action_')) {
      // Handle adding actions to safari buttons
      try {
        const member = req.body.member;
        
        // Check admin permissions
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to add actions.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Match against known action types that may contain underscores
        let actionType, buttonId;
        if (custom_id.endsWith('_display_text')) {
          actionType = 'display_text';
          buttonId = custom_id.replace('safari_add_action_', '').replace('_display_text', '');
        } else if (custom_id.endsWith('_update_currency')) {
          actionType = 'update_currency';
          buttonId = custom_id.replace('safari_add_action_', '').replace('_update_currency', '');
        } else if (custom_id.endsWith('_follow_up')) {
          actionType = 'follow_up';
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
          
        } else if (actionType === 'follow_up') {
          // For follow-up buttons, we'll show a simple message for now
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '🚧 **Follow-up Button Action**\n\nThis feature will allow you to chain to other buttons. Coming in next update!',
              flags: InteractionResponseFlags.EPHEMERAL
            }
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to finish buttons.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
          data: managementUI
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
    } else if (custom_id === 'prod_add_castlist') {
      // Placeholder for future castlist creation functionality
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'ℹ️ Castlist creation feature coming soon!',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
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

        if (sortedRoles.length > REACTION_NUMBERS.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Too many timezone roles (maximum ${REACTION_NUMBERS.length} supported)`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Create embed
        const embed = new EmbedBuilder()
          .setTitle('Timezone Role Selection')
          .setDescription('React with the emoji corresponding to your timezone:\n\n' + 
            sortedRoles.map((role, i) => `${REACTION_NUMBERS[i]} - ${role.name}`).join('\n'))
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
              `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${messageId}/reactions/${encodeURIComponent(REACTION_NUMBERS[i])}/@me`,
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
            console.error(`Failed to add reaction ${REACTION_NUMBERS[i]}:`, error);
          }
        }

        // Store role-emoji mappings in memory for reaction handler with timezone metadata
        if (!client.roleReactions) client.roleReactions = new Map();
        const roleMapping = Object.fromEntries(sortedRoles.map((role, i) => [REACTION_NUMBERS[i], role.id]));
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
      // Execute same logic as player_set_pronouns command (available to all users)
      try {
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);

        // Get pronoun roles from storage
        const pronounRoleIDs = await getGuildPronouns(guildId);
        if (!pronounRoleIDs?.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No pronoun roles found. Ask an admin to add some using /pronouns_add first!',
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

        if (sortedRoles.length > REACTION_NUMBERS.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Too many pronoun roles (maximum ${REACTION_NUMBERS.length} supported)`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Create embed
        const embed = new EmbedBuilder()
          .setTitle('Pronoun Role Selection')
          .setDescription('React with the emoji corresponding to your pronouns:\n\n' + 
            sortedRoles.map((role, i) => `${REACTION_NUMBERS[i]} - ${role.name}`).join('\n'))
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
              `https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${messageId}/reactions/${encodeURIComponent(REACTION_NUMBERS[i])}/@me`,
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
            console.error(`Failed to add reaction ${REACTION_NUMBERS[i]}:`, error);
          }
        }

        // Store role-emoji mappings in memory for reaction handler
        if (!client.roleReactions) client.roleReactions = new Map();
        client.roleReactions.set(messageId, 
          Object.fromEntries(sortedRoles.map((role, i) => [REACTION_NUMBERS[i], role.id]))
        );

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
        
        // Set default values if any exist
        if (existingTimezoneRoles.length > 0) {
          roleSelect.setDefaultRoles(existingTimezoneRoles);
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
        
        // Set default values if any exist
        if (pronounRoleIDs && pronounRoleIDs.length > 0) {
          roleSelect.setDefaultRoles(pronounRoleIDs);
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
          roleSelect.setDefaultRoles(currentVanityRoles);
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to post custom buttons.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
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
            flags: (1 << 15), // IS_COMPONENTS_V2 flag
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to post custom buttons.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to set player currency.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
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
    } else if (custom_id === 'safari_currency_reset_confirm') {
      // Handle confirmation to reset all currency
      try {
        const member = req.body.member;
        const guildId = req.body.guild_id;
        
        // Check admin permissions
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to reset currency.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
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
        await sendCastlist2Response(req, guild, orderedTribes, castlistName, navigationState);
        
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
        
        // Update the message with Components V2 flag
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            flags: 1 << 15, // IS_COMPONENTS_V2 flag
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to create custom buttons.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to add actions.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Match against known action types that may contain underscores  
        let actionType, buttonId;
        if (custom_id.endsWith('_display_text')) {
          actionType = 'display_text';
          buttonId = custom_id.replace('safari_action_modal_', '').replace('_display_text', '');
        } else if (custom_id.endsWith('_update_currency')) {
          actionType = 'update_currency';
          buttonId = custom_id.replace('safari_action_modal_', '').replace('_update_currency', '');
        } else if (custom_id.endsWith('_follow_up')) {
          actionType = 'follow_up';
          buttonId = custom_id.replace('safari_action_modal_', '').replace('_follow_up', '');
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
        if (!member.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ You need Manage Roles permission to set player currency.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }
        
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

// Add this helper function near the top with other helpers
function parseEmojiCode(emojiCode) {
    // Match both static and animated emoji patterns
    const staticMatch = emojiCode.match(/<:(\w+):(\d+)>/);
    const animatedMatch = emojiCode.match(/<a:(\w+):(\d+)>/);
    const match = staticMatch || animatedMatch;
    
    if (match) {
        return {
            name: match[1],
            id: match[2],
            animated: !!animatedMatch
        };
    }
    return null;
}

// Sanitize username for emoji naming (Discord requirements: 2-32 chars, alphanumeric + underscores only)
function sanitizeEmojiName(username) {
    return username
        .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace invalid chars with underscores
        .substring(0, 32)               // Discord's 32-character limit
        .replace(/^_+|_+$/g, '')        // Remove leading/trailing underscores
        || 'user';                      // Fallback if everything gets stripped
}

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


async function createEmojiForUser(member, guild) {
    try {
        // Create sanitized emoji name from server display name (not username)
        const displayName = member.displayName || member.user.username;
        const emojiName = sanitizeEmojiName(displayName);
        console.log(`Using emoji name: ${emojiName} (from display name: ${displayName})`);
        
        // Check both user and member avatars for animation
        const userHasAnimatedAvatar = member.user.avatar?.startsWith('a_');
        const memberHasAnimatedAvatar = member.avatar?.startsWith('a_');
        const isAnimated = userHasAnimatedAvatar || memberHasAnimatedAvatar;

        // Force GIF format for animated avatars
        const avatarOptions = {
            format: isAnimated ? 'gif' : 'png',
            size: 128,
            dynamic: true,
            forceStatic: false
        };

        // Try member avatar first, fall back to user avatar
        const avatarURL = member.avatarURL(avatarOptions) || 
                         member.user.avatarURL(avatarOptions);

        if (!avatarURL) {
            console.log(`No avatar URL found for ${member.displayName}`);
            throw new Error('No avatar URL found');
        }

        console.log(`Processing ${isAnimated ? 'animated' : 'static'} avatar for ${member.displayName}`);
        console.log('Avatar URL:', avatarURL);

        try {
            // Count existing emojis and check server emoji limits
            const emojis = await guild.emojis.fetch();
            const staticCount = emojis.filter(e => !e.animated).size;
            const animatedCount = emojis.filter(e => e.animated).size;
            
            // Calculate emoji limits based on server boost level
            // Base limits: 50 static, 50 animated
            // Level 1: +50 (100 each)
            // Level 2: +100 (150 each)
            // Level 3: +150 (200 each)
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
            
            console.log(`Server emoji info - Guild: ${guild.name} (${guild.id})`);
            console.log(`Boost tier: ${guild.premiumTier}`);
            console.log(`Static emojis: ${staticCount}/${staticLimit} (${staticLimit - staticCount} remaining)`);
            console.log(`Animated emojis: ${animatedCount}/${animatedLimit} (${animatedLimit - animatedCount} remaining)`);

            // Check if we've hit the emoji limit for this type
            if (isAnimated && animatedCount >= animatedLimit) {
                console.log(`Cannot create animated emoji: Server limit reached (${animatedCount}/${animatedLimit})`);
                throw { code: 30008, message: `Maximum emoji limit reached for server (${animatedCount}/${animatedLimit} animated)` };
            } else if (!isAnimated && staticCount >= staticLimit) {
                console.log(`Cannot create static emoji: Server limit reached (${staticCount}/${staticLimit})`);
                throw { code: 30008, message: `Maximum emoji limit reached for server (${staticCount}/${staticLimit} static)` };
            }

            // Add timeout to the fetch operation
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch(avatarURL, { 
                signal: controller.signal 
            }).catch(err => {
                console.error(`Fetch error for ${member.displayName}: ${err.message}`);
                throw new Error(`Failed to fetch avatar: ${err.message}`);
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch avatar: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            console.log(`Original file size: ${buffer.length} bytes`);
            console.log('Content type:', response.headers.get('content-type'));

            let processedBuffer = buffer;
            let finalIsAnimated = isAnimated;

            if (isAnimated) {
                try {
                    // Try direct upload for animated avatars
                    console.log('Attempting direct upload of animated GIF');
                    const emoji = await guild.emojis.create({
                        attachment: buffer,
                        name: emojiName,
                        reason: `CastBot emoji for ${member.displayName}`
                    }).catch(err => {
                        // Special handling for emoji limit errors
                        if (err.code === 30008) {
                            throw { code: 30008, message: err.message || "Maximum emoji limit reached for server" };
                        }
                        console.error(`Error creating animated emoji for ${member.displayName}: ${err.message}`);
                        throw err;
                    });
                    
                    const emojiCode = `<a:${emojiName}:${emoji.id}>`;
                    console.log(`Successfully created animated emoji directly: ${emojiCode}`);
                    
                    return {
                        success: true,
                        emoji,
                        emojiCode,
                        isAnimated: true
                    };
                } catch (directUploadError) {
                    // Re-throw if it's a limit error
                    if (directUploadError.code === 30008) {
                        console.error(`Emoji limit error: ${directUploadError.message}`);
                        throw directUploadError;
                    }
                    
                    console.log('Direct upload failed, falling back to static version:', directUploadError.message);
                    
                    // Fall back to static if we still have room in static emoji limit
                    if (staticCount >= staticLimit) {
                        throw { code: 30008, message: `Maximum emoji limit reached for server (${staticCount}/${staticLimit} static)` };
                    }
                    
                    try {
                        const sharp = (await import('sharp')).default;
                        processedBuffer = await sharp(buffer, { 
                            animated: true,  // Recognize it's an animated image
                            pages: 1        // Only take first frame
                        })
                            .resize(96, 96, { 
                                fit: 'contain',
                                withoutEnlargement: true,
                                position: 'center'
                            })
                            .png({ 
                                quality: 80, 
                                colors: 128,
                                effort: 10
                            })
                            .toBuffer()
                            .catch(err => {
                                console.error(`Sharp processing error for ${member.displayName}: ${err.message}`);
                                throw err;
                            });
                        finalIsAnimated = false;
                    } catch (sharpError) {
                        console.error(`Sharp processing error for ${member.displayName}: ${sharpError.message}`);
                        throw new Error(`Failed to process animated avatar: ${sharpError.message}`);
                    }
                }
            } else {
                // Handle static images
                try {
                    const sharp = (await import('sharp')).default;
                    processedBuffer = await sharp(buffer)
                        .resize(96, 96, { 
                            fit: 'contain',
                            withoutEnlargement: true,
                            position: 'center'
                        })
                        .png({ 
                            quality: 80, 
                            colors: 128,
                            effort: 10
                        })
                        .toBuffer()
                        .catch(err => {
                            console.error(`Sharp processing error for ${member.displayName}: ${err.message}`);
                            throw err;
                        });
                } catch (sharpError) {
                    console.error(`Sharp processing error for ${member.displayName}: ${sharpError.message}`);
                    throw new Error(`Failed to process static avatar: ${sharpError.message}`);
                }
            }

            // Create emoji with processed buffer
            const emoji = await guild.emojis.create({
                attachment: processedBuffer,
                name: emojiName,
                reason: `CastBot emoji for ${member.displayName}`
            }).catch(err => {
                if (err.code === 30008) {
                    throw { code: 30008, message: err.message || "Maximum emoji limit reached for server" };
                }
                console.error(`Error creating emoji for ${member.displayName}: ${err.message}`);
                throw err;
            });

            const emojiCode = finalIsAnimated ? 
                `<a:${emojiName}:${emoji.id}>` : 
                `<:${emojiName}:${emoji.id}>`;

            console.log(`Created ${finalIsAnimated ? 'animated' : 'static'} emoji (${processedBuffer.length} bytes): ${emojiCode}`);

            return {
                success: true,
                emoji,
                emojiCode,
                isAnimated: finalIsAnimated
            };

        } catch (emojiError) {
            const error = {
                code: emojiError.code || 'UNKNOWN',
                message: emojiError.message || 'Unknown error creating emoji',
                rawError: emojiError,
                memberName: member.displayName,
                avatarUrl: avatarURL
            };
            console.error(`Emoji creation error details:`, error);
            throw error;
        }
    } catch (error) {
        console.error(`Complete emoji creation failure for ${member.displayName}:`, error);
        throw error;
    }
}

// Check if a role has existing emojis generated for its members
async function checkRoleHasEmojis(guild, role) {
  try {
    const guildId = guild.id;
    const roleId = role.id;
    
    // Load current player data
    const data = await loadPlayerData();
    if (!data[guildId] || !data[guildId].players) {
      return false;
    }
    
    // Fetch all members to ensure we have fresh data
    await guild.members.fetch();
    
    // Get members with this role
    const targetMembers = guild.members.cache.filter(member => 
      member.roles.cache.has(roleId) && !member.user.bot
    );
    
    // Check if any members with this role have emojis
    for (const [memberId, member] of targetMembers) {
      const playerData = data[guildId].players[memberId];
      if (playerData?.emojiCode) {
        console.log(`Found existing emoji for role ${role.name}: ${member.displayName} has ${playerData.emojiCode}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking role emojis:', error);
    return false;
  }
}

// Clear emojis for all members with a specific role
async function clearEmojisForRole(guild, role) {
  const deletedLines = [];
  const errorLines = [];
  
  try {
    const guildId = guild.id;
    const roleId = role.id;
    
    // Load current player data
    const data = await loadPlayerData();
    if (!data[guildId] || !data[guildId].players) {
      return {
        deletedLines: [],
        errorLines: ['No player data found for this server']
      };
    }
    
    // Fetch all members to ensure we have fresh data
    await guild.members.fetch();
    
    // Get members with this role
    const targetMembers = guild.members.cache.filter(member => 
      member.roles.cache.has(roleId) && !member.user.bot
    );
    
    console.log(`Clearing emojis for ${targetMembers.size} members with role ${role.name} (${roleId})`);
    
    if (targetMembers.size === 0) {
      return {
        deletedLines: [],
        errorLines: ['No members found with this role']
      };
    }
    
    // Process each member with the role
    for (const [memberId, member] of targetMembers) {
      try {
        const playerData = data[guildId].players[memberId];
        
        if (playerData?.emojiCode) {
          const emojiCode = playerData.emojiCode;
          const emoji = parseEmojiCode(emojiCode);
          
          if (emoji?.id) {
            try {
              const guildEmoji = await guild.emojis.fetch(emoji.id);
              if (guildEmoji) {
                await guildEmoji.delete();
                console.log(`Deleted ${emoji.animated ? 'animated' : 'static'} emoji for ${member.displayName}`);
                deletedLines.push(`${member.displayName}: Deleted ${emoji.animated ? 'animated' : 'static'} emoji ${emojiCode}`);
              } else {
                console.log(`Emoji ${emoji.id} not found in guild for ${member.displayName}`);
                deletedLines.push(`${member.displayName}: Emoji was already removed from server`);
              }
            } catch (err) {
              console.error(`Error deleting emoji for ${member.displayName}:`, {
                error: err,
                emojiCode: emojiCode,
                emojiData: emoji
              });
              errorLines.push(`${member.displayName}: Failed to delete emoji`);
            }
          } else {
            console.log(`Invalid emoji code for ${member.displayName}: ${emojiCode}`);
            errorLines.push(`${member.displayName}: Invalid emoji code format`);
          }
          
          // Clear emoji code from player data regardless of deletion success
          data[guildId].players[memberId].emojiCode = null;
        } else {
          console.log(`No emoji found for ${member.displayName}`);
          // Don't add to error lines, just skip silently
        }
      } catch (error) {
        console.error(`Error processing member ${member.displayName}:`, error);
        errorLines.push(`${member.displayName}: Error processing emoji removal`);
      }
    }
    
    // Save updated player data
    await savePlayerData(data);
    
    return {
      deletedLines,
      errorLines
    };
    
  } catch (error) {
    console.error('Error clearing role emojis:', error);
    return {
      deletedLines: [],
      errorLines: ['Error accessing player data']
    };
  }
}

// Update calculateCastlistFields to handle role ID correctly and manage spacers intelligently
async function calculateCastlistFields(guild, roleIdOrOption, castlistName = 'default') {
  try {
    // Extract the actual role ID from the option object if needed
    let roleId;
    if (typeof roleIdOrOption === 'object' && roleIdOrOption.value) {
      roleId = roleIdOrOption.value;
      console.log(`Extracted roleId ${roleId} from roleIdOrOption object`);
    } else {
      roleId = roleIdOrOption;
    }

    const guildData = await loadPlayerData();
    const guildTribes = guildData[guild.id]?.tribes || {};
    
    // Count existing tribes in this castlist (excluding the one being updated)
    const existingTribes = Object.entries(guildTribes)
      .filter(([id, tribe]) => tribe.castlist === castlistName && id !== roleId)
      .map(([id]) => id);
    
    console.log(`Found ${existingTribes.length} existing tribes in castlist "${castlistName}"`);
    
    // Get all members for the new/updated tribe
    const newRole = await guild.roles.fetch(roleId);
    const newRoleMembers = newRole ? newRole.members.size : 0;
    console.log(`New tribe "${newRole?.name}" has ${newRoleMembers} members`);
    
    // Count fields without spacers first
    let fieldsWithoutSpacers = 0;
    
    // Count existing tribes and their members
    for (const tribeId of existingTribes) {
      try {
        const role = await guild.roles.fetch(tribeId);
        if (role) {
          // Header + members
          const memberCount = role.members.size;
          fieldsWithoutSpacers += 1 + memberCount;
          console.log(`Existing tribe ${role.name}: 1 header + ${memberCount} members = ${1 + memberCount} fields`);
        }
      } catch (err) {
        console.warn(`Could not fetch role ${tribeId}:`, err.message);
      }
    }
    
    // Add the new tribe's fields
    fieldsWithoutSpacers += 1 + newRoleMembers;
    console.log(`New tribe ${newRole?.name}: 1 header + ${newRoleMembers} members = ${1 + newRoleMembers} fields`);
    
    // Calculate total number of fields with spacers
    const totalTribes = existingTribes.length + 1;
    const spacerFields = Math.max(0, totalTribes - 1);
    const fieldsWithSpacers = fieldsWithoutSpacers + spacerFields;
    
    console.log(`Fields without spacers: ${fieldsWithoutSpacers}`);
    console.log(`Number of spacers needed: ${spacerFields}`);
    console.log(`Fields with spacers: ${fieldsWithSpacers}`);
    
    // Check if we need to omit spacers to fit within Discord's 25 field limit
    if (fieldsWithSpacers > 25 && fieldsWithoutSpacers <= 25) {
      console.log(`Will need to omit spacers to fit within 25 field limit`);
      // Return fields without spacers (we'll handle spacers in the castlist command)
      return fieldsWithoutSpacers;
    }
    
    // Otherwise return the total count with spacers
    return fieldsWithSpacers;
  } catch (error) {
    console.error('Error calculating castlist fields:', error);
    throw error;
  }
}

// Add this helper function before handling the castlist command
async function createMemberFields(members, guild, tribeData = null) {
  const fields = [];
  const pronounRoleIDs = await getGuildPronouns(guild.id);
  const timezones = await getGuildTimezones(guild.id);
  
  // Convert members to array for sorting
  const membersArray = Array.from(members.values());
  // Sort members by displayName
  membersArray.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  for (const member of membersArray) {
    try {
      let pronouns = pronounRoleIDs
        .filter(pronounRoleID => member.roles.cache.has(pronounRoleID))
        .map(pronounRoleID => {
          const role = guild.roles.cache.get(pronounRoleID);
          return role ? role.name : '';
        })
        .filter(name => name !== '')
        .join(', ');

      // Add friendly message if no pronoun roles
      if (!pronouns) {
        pronouns = 'No pronoun roles';
      }

      // Update timezone handling to properly check roleId against timezones
      let timezone = 'No timezone roles';
      let memberTime = Math.floor(Date.now() / 1000);

      // Check member's roles against the timezones object
      for (const [roleId] of member.roles.cache) {
        if (timezones[roleId]) {
          const role = guild.roles.cache.get(roleId);
          timezone = role ? role.name : 'Unknown timezone';
          memberTime = Math.floor(Date.now() / 1000) + (timezones[roleId].offset * 3600);
          break;
        }
      }

      const date = new Date(memberTime * 1000);
      const hours = date.getUTCHours() % 12 || 12;
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      const ampm = date.getUTCHours() >= 12 ? 'PM' : 'AM';
      const formattedTime = `\`🕐 ${hours}:${minutes} ${ampm} 🕐\``;

      // Get player data from storage
      const playerData = await getPlayer(guild.id, member.id);
      const age = playerData?.age ? `${playerData.age}` : 'No age set';
      
      // Create name field with emoji if it exists and tribe allows it!
      const shouldShowEmoji = playerData?.emojiCode && (tribeData?.showPlayerEmojis !== false);
      const nameWithEmoji = shouldShowEmoji ? 
        `${playerData.emojiCode} ${capitalize(member.displayName)}` : 
        capitalize(member.displayName);

      let value = `> * ${age}\n> * ${pronouns}\n> * ${timezone}\n> * ${formattedTime}`;
      fields.push({
        name: nameWithEmoji,
        value: value,
        inline: true
      });
    } catch (err) {
      console.error(`Error processing member ${member.displayName}:`, err);
    }
  }
  return fields;
}

// Add this helper function before the castlist command handler!
async function determineCastlistToShow(guildId, userId, requestedCastlist = null) {
  const data = await loadPlayerData();
  const tribes = data[guildId]?.tribes || {};
  
  // If specific castlist requested, always use that
  if (requestedCastlist) {
    return requestedCastlist;
  }

  // Get all unique castlists in this guild
  const castlists = new Set(
    Object.values(tribes)
      .filter(tribe => tribe?.castlist)
      .map(tribe => tribe.castlist)
  );

  // If only one castlist exists, use it
  if (castlists.size <= 1) {
    return Array.from(castlists)[0] || 'default';
  }

  // Find which castlists the user appears in
  const userCastlists = new Set();
  for (const [tribeId, tribe] of Object.entries(tribes)) {
    if (!tribe?.castlist) continue;
    
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    if (member.roles.cache.has(tribeId)) {
      userCastlists.add(tribe.castlist);
    }
  }

  // If user not in any castlist, show default
  if (userCastlists.size === 0) {
    return 'default';
  }

  // If user in exactly one castlist, show that
  if (userCastlists.size === 1) {
    return Array.from(userCastlists)[0];
  }

  // If user in multiple castlists including default, show default
  if (userCastlists.has('default')) {
    return 'default';
  }

  // Otherwise show first alphabetically
  return Array.from(userCastlists).sort()[0];
}

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
async function checkRoleHierarchyPermission(guild, roleId) {
  const bot = await guild.members.fetch(client.user.id);
  const role = await guild.roles.fetch(roleId);
  
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { 
      allowed: false, 
      reason: 'Bot is missing Manage Roles permission' 
    };
  }

  if (role.position >= bot.roles.highest.position) {
    return { 
      allowed: false, 
      reason: `Cannot assign role ${role.name} as it is higher than or equal to the bot's highest role. Go to Server Settings > Roles and drag the CastBot role to the very top of the list, so it is above your timezone and pronoun roles.` 
    };
  }

  return { allowed: true };
}

// Add this function to check if spacers should be omitted to fit within field limits
async function shouldOmitSpacers(tribes, guild) {
  // Calculate total fields without spacers
  let totalFields = 0;
  let tribeCount = 0;
  
  for (const tribe of tribes) {
    try {
      const tribeRole = await guild.roles.fetch(tribe.roleId);
      if (!tribeRole) continue;
      
      // Add tribe header (1 field)
      totalFields++;
      tribeCount++;
      
      // Get members with this role
      const tribeMembers = guild.members.cache.filter(member => member.roles.cache.has(tribe.roleId));
      totalFields += tribeMembers.size;
    } catch (error) {
      console.error(`Error processing tribe ${tribe.roleId}:`, error);
    }
  }
  
  // Calculate fields with spacers (spacers = tribeCount - 1)
  const totalFieldsWithSpacers = totalFields + (tribeCount - 1);
  
  // Check if removing spacers would help stay within the 25 field limit
  return totalFieldsWithSpacers > 25 && totalFields <= 25;
}

// Add this helper function at the end of the file before the last closing bracket
async function handleSetupTycoons(guild) {
  // Arrays to hold the role IDs for each category
  const moneyRoles = [];
  const safeFarmRoles = [];
  const riskyFarmRoles = [];
  const siloRoles = [];
  const attackRoles = [];

  try {
    // Create money balance roles: b.0 - b.9
    for (let i = 0; i <= 9; i++) {
      const roleName = `b.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons money balance role"
        });
      }
      moneyRoles.push(role.id);
    }

    // Create safe farm roles: pr.0 - pr.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `pr.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons safe farm role"
        });
      }
      safeFarmRoles.push(role.id);
    }

    // Create risky farm roles: lr.0 - lr.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `lr.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons risky farm role"
        });
      }
      riskyFarmRoles.push(role.id);
    }

    // Create silo roles: sr.0 - sr.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `sr.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons silo role"
        });
      }
      siloRoles.push(role.id);
    }

    // Create attack roles: ar.0 - ar.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `ar.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons attack role"
        });
      }
      attackRoles.push(role.id);
    }

    // Format the output in the required format
    return {
      moneyRoles,
      safeFarmRoles,
      riskyFarmRoles,
      siloRoles,
      attackRoles,
      formattedOutput: `Money Balance:\n{=(b):${moneyRoles.join('|')}}\n\nSafe Farm Balance:\n{=(pr):${safeFarmRoles.join('|')}}\n\nRisky Farm Balance:\n{=(lr):${riskyFarmRoles.join('|')}}\n\nSilo balance:\n{=(sr):${siloRoles.join('|')}}\n\nAttack name:\n{=(ar):${attackRoles.join('|')}}`
    };
  } catch (error) {
    console.error('Error setting up Tycoons roles:', error);
    throw error;
  }
}