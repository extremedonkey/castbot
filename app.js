import 'dotenv/config';
import express from 'express';
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
  getTimezoneOffset // Add this import
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
import {
  calculateComponentsForTribe,
  determineDisplayScenario,
  calculateTribePages,
  createNavigationState,
  reorderTribes,
  createTribeSection,
  createNavigationButtons,
  processMemberData,
  createCastlistV2Layout
} from './castlistV2.js';
import fs from 'fs';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

// Add these constants near the top with other constants
const REACTION_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

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
      scenario
    );
  }
  
  // Create navigation buttons
  const navigationRow = createNavigationButtons(navigationState, castlistName);
  
  // Create complete layout
  const responseData = createCastlistV2Layout(
    [tribeSection],
    castlistName,
    guild,
    [navigationRow.toJSON()],
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
} else if (name === 'prod_menu') {
  try {
    console.log('Processing prod_menu command');
    
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });
    
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
          emoji: tribeData.emoji
        });
      });
    }
    
    // If no castlists found, show default button
    if (allCastlists.size === 0) {
      const castlistRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('show_castlist2_default')
            .setLabel('Show Castlist')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋')
        );
      
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('getting_started')
            .setLabel('Getting Started')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🚀'),
          new ButtonBuilder()
            .setCustomId('setup_castbot')
            .setLabel('Setup')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚙️')
        );
      
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          components: [castlistRow, actionRow]
        }
      });
      return;
    }
    
    // Always show default castlist button regardless of tribes
    const castlistButtons = [
      new ButtonBuilder()
        .setCustomId('show_castlist2_default')
        .setLabel('Show Castlist')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋')
    ];
    
    // Add custom castlist buttons (excluding default which is already added)
    const customCastlists = Array.from(allCastlists).filter(name => name !== 'default').sort();
    
    for (const castlistName of customCastlists) {
      const tribes = castlistTribes[castlistName] || [];
      const tribeWithEmoji = tribes.find(tribe => tribe.emoji);
      const emoji = tribeWithEmoji?.emoji || '📋';
      
      castlistButtons.push(
        new ButtonBuilder()
          .setCustomId(`show_castlist2_${castlistName}`)
          .setLabel(`Show ${castlistName.charAt(0).toUpperCase() + castlistName.slice(1)}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji)
      );
    }
    
    const castlistRow = new ActionRowBuilder().addComponents(castlistButtons);
    
    // Check if pronouns/timezones exist for conditional buttons
    const hasPronouns = playerData[guildId]?.pronounRoleIDs?.length > 0;
    const hasTimezones = playerData[guildId]?.timezones && Object.keys(playerData[guildId].timezones).length > 0;
    const hasRoles = hasPronouns || hasTimezones;
    
    // Create admin control buttons
    const adminButtons = [
      new ButtonBuilder()
        .setCustomId('prod_setup')
        .setLabel('Setup')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚙️'),
      new ButtonBuilder()
        .setCustomId('prod_manage_pronouns_timezones')
        .setLabel('Manage Pronouns/Timezones')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('💜'),
      new ButtonBuilder()
        .setCustomId('prod_manage_tribes')
        .setLabel('Manage Tribes')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔥'),
      new ButtonBuilder()
        .setLabel('Need Help?')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❓')
        .setURL('https://discord.gg/vJjUPS6zK9')
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
    
    const adminRow = new ActionRowBuilder().addComponents(adminButtons);
    
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: '**Production Menu**',
        components: [castlistRow, adminRow]
      }
    });
    
  } catch (error) {
    console.error('Error handling prod_menu command:', error);
    
    try {
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: '❌ Error loading production menu. Please try again.',
          components: []
        }
      });
    } catch (updateError) {
      console.error('Failed to update message with error:', updateError);
    }
  }
} else if (name === 'menu') {
  try {
    console.log('Processing menu command');
    
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });
    
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
    
    // Always include default castlist even if no tribes exist yet
    if (allCastlists.size === 0) {
      allCastlists.add('default');
    }
    
    // If only default castlist exists, show single button layout
    if (allCastlists.size === 1 && allCastlists.has('default')) {
      const castlistRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('show_castlist2_default')
            .setLabel('Show Castlist')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋')
        );
      
      // Add second row with player action buttons
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('player_set_pronouns')
            .setLabel('Set Your Pronouns')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💜'),
          new ButtonBuilder()
            .setCustomId('player_set_timezone')
            .setLabel('Set Your Timezone')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🗺️'),
          new ButtonBuilder()
            .setCustomId('player_set_age')
            .setLabel('Set Your Age')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎂')
        );
      
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: '**Player Menu**',
          components: [castlistRow, actionRow]
        }
      });
      return;
    }
    
    // Create buttons for each castlist
    const buttons = [];
    const castlistArray = Array.from(allCastlists).sort((a, b) => {
      // Sort so 'default' comes first
      if (a === 'default') return -1;
      if (b === 'default') return 1;
      return a.localeCompare(b);
    });
    
    for (const castlistName of castlistArray) {
      if (castlistName === 'default') {
        // Default castlist gets the primary blue button with 📋 emoji
        buttons.push(
          new ButtonBuilder()
            .setCustomId('show_castlist2_default')
            .setLabel('Show Castlist')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋')
        );
      } else {
        // Custom castlists get grey buttons with tribe emoji if available
        const tribes = castlistTribes[castlistName] || [];
        const tribeWithEmoji = tribes.find(tribe => tribe.emoji);
        const emoji = tribeWithEmoji?.emoji || '📋';
        
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`show_castlist2_${castlistName}`)
            .setLabel(`Show ${castlistName.charAt(0).toUpperCase() + castlistName.slice(1)}`)
            .setStyle(ButtonStyle.Secondary) // Grey button
            .setEmoji(emoji)
        );
      }
    }
    
    const castlistRow = new ActionRowBuilder().addComponents(buttons);
    
    // Add second row with player action buttons
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('player_set_pronouns')
          .setLabel('Set Your Pronouns')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('💜'),
        new ButtonBuilder()
          .setCustomId('player_set_timezone')
          .setLabel('Set Your Timezone')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🗺️'),
        new ButtonBuilder()
          .setCustomId('player_set_age')
          .setLabel('Set Your Age')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🎂')
      );
    
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: '**Player Menu**',
        components: [castlistRow, actionRow]
      }
    });
    
  } catch (error) {
    console.error('Error handling menu command:', error);
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: 'Error creating menu.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
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
          content: 'No timezone roles found. Add some using /timezones_add first!',
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
          content: 'No timezone roles found. Add some using /timezones_add first!',
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

  /**
   * Handle button interactions (MESSAGE_COMPONENT) 
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data;
    
    if (custom_id.startsWith('show_castlist2')) {
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
      // Admin player management - show user select menu
      try {
        const guild = await client.guilds.fetch(req.body.guild_id);
        
        // Check admin permissions
        const member = await guild.members.fetch(req.body.member.user.id);
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

        // Create user select menu with Components V2
        const userSelectRow = new ActionRowBuilder()
          .addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('admin_select_player')
              .setPlaceholder('Select user to manage..')
              .setMinValues(1)
              .setMaxValues(1)
          );

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '**Player Management**\n\nSelect a player to manage their details:',
            components: [userSelectRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
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
              content: '✅ Server already has roles configured!\n\nUse **Manage Pronouns/Timezones** to view or edit existing roles.',
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
        const managementRow1 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('prod_view_timezones')
              .setLabel('View Timezones')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🌍'),
            new ButtonBuilder()
              .setCustomId('prod_edit_timezones')
              .setLabel('Edit Timezones')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⏲️'),
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

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '## Manage Pronouns & Timezones\n\nSelect an action to manage your server\'s pronoun and timezone roles:',
            components: [managementRow1, managementRow2],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
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
              .setEmoji('🧹')
          );

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '## Tribe Management\n\n> **⚠️ Warning:** Spectators will be able to view your tribe names if you add them before marooning using `/castlist`. It is recommended not adding any tribes until players have been assigned the tribe role, after marooning.\n\nSelect an action to manage your tribes:',
            components: [tribeRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        
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
              content: 'No timezone roles found. Ask an admin to add some using /timezones_add first!',
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
        console.error('Error in prod_timezone_react:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating timezone reaction message',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
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
    } else if (custom_id.startsWith('admin_set_pronouns_')) {
      // Admin pronoun management
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_set_pronouns_${playerId}
        
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
        const validRoles = roles
          .filter(role => role) // Remove any null roles
          .sort((a, b) => a.name.localeCompare(b.name));

        if (validRoles.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No valid pronoun roles found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        if (validRoles.length > 25) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Too many pronoun roles (maximum 25 supported)',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get target's current pronoun roles for pre-selection
        const userPronounRoles = targetMember.roles.cache
          .filter(role => pronounRoleIDs.includes(role.id))
          .map(role => role.id);

        // Create select menu with pronoun roles
        const pronounSelect = new StringSelectMenuBuilder()
          .setCustomId(`admin_select_pronouns_${targetPlayerId}`)
          .setPlaceholder(userPronounRoles.length > 0 ? 
            `Current: ${targetMember.roles.cache.filter(r => pronounRoleIDs.includes(r.id)).map(r => r.name).join(', ')}` : 
            'Choose player pronouns')
          .setMinValues(0)
          .setMaxValues(Math.min(validRoles.length, 3)) // Allow up to 3 pronoun roles
          .addOptions(
            validRoles.map(role => ({
              label: role.name,
              value: role.id,
              emoji: '💜',
              default: userPronounRoles.includes(role.id)
            }))
          );

        const selectRow = new ActionRowBuilder().addComponents(pronounSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Set pronoun roles for **${targetMember.displayName}**:`,
            components: [selectRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error handling admin_set_pronouns button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating pronoun selection',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('admin_set_timezone_')) {
      // Admin timezone management
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_set_timezone_${playerId}
        
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

        // Get timezone roles from storage
        const timezoneRoles = await getGuildTimezones(guildId);
        const timezoneEntries = Object.entries(timezoneRoles || {});
        
        if (timezoneEntries.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No timezone roles found. Add some using /timezones_add first!',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get role objects and sort by UTC offset
        const rolePromises = timezoneEntries.map(async ([roleId, data]) => {
          try {
            const role = await guild.roles.fetch(roleId);
            return role ? { role, offset: data.offset } : null;
          } catch (error) {
            console.error(`Failed to fetch timezone role ${roleId}:`, error);
            return null;
          }
        });

        const roleData = (await Promise.all(rolePromises))
          .filter(item => item !== null)
          .sort((a, b) => a.offset - b.offset);

        if (roleData.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No valid timezone roles found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        if (roleData.length > 25) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Too many timezone roles (maximum 25 supported)',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get target's current timezone role for pre-selection
        const timezoneRoleIds = roleData.map(item => item.role.id);
        const userTimezoneRoles = targetMember.roles.cache
          .filter(role => timezoneRoleIds.includes(role.id))
          .map(role => role.id);

        // Create select menu with timezone roles
        const timezoneSelect = new StringSelectMenuBuilder()
          .setCustomId(`admin_select_timezone_${targetPlayerId}`)
          .setPlaceholder(userTimezoneRoles.length > 0 ? 
            `Current: ${targetMember.roles.cache.filter(r => timezoneRoleIds.includes(r.id)).map(r => r.name).join(', ')}` : 
            'Choose player timezone')
          .setMinValues(0)
          .setMaxValues(1) // Only one timezone allowed
          .addOptions(
            roleData.map(({ role, offset }) => ({
              label: role.name,
              value: role.id,
              description: `UTC${offset >= 0 ? '+' : ''}${offset}`,
              emoji: '🌍',
              default: userTimezoneRoles.includes(role.id)
            }))
          );

        const selectRow = new ActionRowBuilder().addComponents(timezoneSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Set timezone role for **${targetMember.displayName}**:`,
            components: [selectRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error handling admin_set_timezone button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating timezone selection',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id.startsWith('admin_set_age_')) {
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
    } else if (custom_id.startsWith('admin_manage_vanity_')) {
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
        const playerData = getPlayer(guildId, targetPlayerId);
        const currentVanityRoles = playerData?.vanityRoles || [];

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
      // Show select menu for pronoun roles
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
        const validRoles = roles
          .filter(role => role) // Remove any null roles
          .sort((a, b) => a.name.localeCompare(b.name));

        if (validRoles.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No valid pronoun roles found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        if (validRoles.length > 25) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Too many pronoun roles (maximum 25 supported)',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get user's current pronoun roles for pre-selection
        const userId = req.body.member.user.id;
        const member = await guild.members.fetch(userId);
        const userPronounRoles = member.roles.cache
          .filter(role => pronounRoleIDs.includes(role.id))
          .map(role => role.id);

        // Create select menu with pronoun roles
        const pronounSelect = new StringSelectMenuBuilder()
          .setCustomId('select_pronouns')
          .setPlaceholder(userPronounRoles.length > 0 ? 
            `Current: ${member.roles.cache.filter(r => pronounRoleIDs.includes(r.id)).map(r => r.name).join(', ')}` : 
            'Choose your pronouns')
          .setMinValues(0)
          .setMaxValues(Math.min(validRoles.length, 3)) // Allow up to 3 pronoun roles
          .addOptions(
            validRoles.map(role => ({
              label: role.name,
              value: role.id,
              emoji: '💜',
              default: userPronounRoles.includes(role.id)
            }))
          );

        const selectRow = new ActionRowBuilder().addComponents(pronounSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Select your pronoun roles:',
            components: [selectRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error handling player_set_pronouns button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating pronoun selection',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'player_set_timezone') {
      // Show select menu for timezone roles
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        // Get timezone roles from storage
        const timezones = await getGuildTimezones(guildId);
        const timezoneEntries = Object.entries(timezones);
        
        if (!timezoneEntries?.length) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No timezone roles found. Ask an admin to add some using /timezones_add first!',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get role objects, sort by offset, and validate existence
        const timezoneRoles = await Promise.all(
          timezoneEntries.map(async ([roleId, data]) => {
            try {
              const role = await guild.roles.fetch(roleId);
              return role ? { role, offset: data.offset } : null;
            } catch (error) {
              console.warn(`Could not fetch timezone role ${roleId}:`, error);
              return null;
            }
          })
        );

        const validTimezones = timezoneRoles
          .filter(item => item !== null)
          .sort((a, b) => a.offset - b.offset);

        if (validTimezones.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No valid timezone roles found.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        if (validTimezones.length > 25) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Too many timezone roles (maximum 25 supported)',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Get user's current timezone role for pre-selection
        const timezoneRoleIds = Object.keys(timezones);
        const userTimezoneRole = member.roles.cache.find(role => timezoneRoleIds.includes(role.id));

        // Create select menu with timezone roles
        const timezoneSelect = new StringSelectMenuBuilder()
          .setCustomId('select_timezone')
          .setPlaceholder(userTimezoneRole ? 
            `Current: ${userTimezoneRole.name}` : 
            'Choose your timezone')
          .setMinValues(0)
          .setMaxValues(1) // Only one timezone allowed
          .addOptions(
            validTimezones.map(item => ({
              label: item.role.name,
              description: `UTC${item.offset >= 0 ? '+' : ''}${item.offset}`,
              value: item.role.id,
              emoji: '🗺️',
              default: userTimezoneRole ? userTimezoneRole.id === item.role.id : false
            }))
          );

        const selectRow = new ActionRowBuilder().addComponents(timezoneSelect);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Select your timezone:',
            components: [selectRow],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error handling player_set_timezone button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error creating timezone selection',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
    } else if (custom_id === 'player_set_age') {
      // Show modal dialog for setting age
      try {
        const modal = new ModalBuilder()
          .setCustomId('age_modal')
          .setTitle('Set Your Age');

        const ageInput = new TextInputBuilder()
          .setCustomId('age_input')
          .setLabel('Your Age')
          .setPlaceholder('Type your age')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(3);

        const ageRow = new ActionRowBuilder().addComponents(ageInput);
        modal.addComponents(ageRow);

        return res.send({
          type: InteractionResponseType.MODAL,
          data: modal.toJSON()
        });

      } catch (error) {
        console.error('Error handling player_set_age button:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error opening age dialog.',
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
    } else if (custom_id === 'admin_select_player') {
      // Handle admin player selection
      try {
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        const selectedPlayerIds = data.values || [];
        
        if (selectedPlayerIds.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Please select a player to manage.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        const selectedPlayerId = selectedPlayerIds[0];
        const guild = await client.guilds.fetch(guildId);
        
        // Get selected player info
        let selectedPlayer;
        try {
          selectedPlayer = await guild.members.fetch(selectedPlayerId);
        } catch (error) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Unable to find the selected player in this server.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

        // Create management interface with Components V2
        const managementRow1 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`admin_set_pronouns_${selectedPlayerId}`)
              .setLabel('Set Pronouns')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('💜'),
            new ButtonBuilder()
              .setCustomId(`admin_set_timezone_${selectedPlayerId}`)
              .setLabel('Set Timezone')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🌍'),
            new ButtonBuilder()
              .setCustomId(`admin_set_age_${selectedPlayerId}`)
              .setLabel('Set Age')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🎂')
          );

        const managementRow2 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`admin_manage_vanity_${selectedPlayerId}`)
              .setLabel('🕵️Manage Vanity Roles')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🕵️'),
            new ButtonBuilder()
              .setCustomId('admin_manage_player')
              .setLabel('Change Player')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔄')
          );

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `## Manage ${selectedPlayer.displayName}'s Details\n\nSelect an action to manage this player's profile:`,
            components: [managementRow1, managementRow2],
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });

      } catch (error) {
        console.error('Error handling admin player selection:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error processing admin player selection.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
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

        // Create the complete Components V2 layout
        const responseData = createCastlistV2Layout(
          tribeComponents,
          castlistName,
          fullGuild,
          navigationRows,
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
    }
  } // end if MESSAGE_COMPONENT

  /**
   * Handle modal submissions
   */
  if (type === InteractionType.MODAL_SUBMIT) {
    const { custom_id, components } = data;
    
    if (custom_id === 'age_modal') {
      try {
        const ageValue = components[0].components[0].value;
        const guildId = req.body.guild_id;
        const userId = req.body.member.user.id;
        const userName = req.body.member.nick || req.body.member.user.username;

        // Validate age input
        const age = parseInt(ageValue);
        if (isNaN(age) || age < 1 || age > 150) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Please enter a valid age between 1 and 150.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

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
        playerData[guildId].players[userId].age = ageValue;
        
        // Save data
        await savePlayerData(playerData);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `${userName} has set their age to ${ageValue}`
          }
        });

      } catch (error) {
        console.error('Error in age modal handler:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting age.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
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
      // Handle admin setting player age
      try {
        const guildId = req.body.guild_id;
        const adminUserId = req.body.member.user.id;
        const targetPlayerId = custom_id.split('_')[3]; // Extract player ID from admin_age_modal_${playerId}
        const ageValue = components[0]?.components[0]?.value || '';

        const guild = await client.guilds.fetch(guildId);
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

        // Validate age input (if provided)
        if (ageValue && ageValue.trim() !== '') {
          const age = parseInt(ageValue.trim());
          if (isNaN(age) || age < 1 || age > 150) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Please enter a valid age between 1 and 150.',
                flags: InteractionResponseFlags.EPHEMERAL
              }
            });
          }

          // Update player age
          updatePlayer(guildId, targetPlayerId, { age: age.toString() });

          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Set ${targetMember.displayName}'s age to ${age}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } else {
          // Clear age if empty input
          updatePlayer(guildId, targetPlayerId, { age: undefined });

          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Cleared age for ${targetMember.displayName}`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        }

      } catch (error) {
        console.error('Error handling admin age modal:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error setting player age.',
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
      }
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


async function createEmojiForUser(member, guild) {
    try {
        // Create sanitized emoji name from username
        const emojiName = sanitizeEmojiName(member.user.username);
        console.log(`Using emoji name: ${emojiName} (from username: ${member.user.username})`);
        
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