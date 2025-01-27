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
import { Client, GatewayIntentBits, EmbedBuilder, SnowflakeUtil, PermissionFlagsBits } from 'discord.js';
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
import fs from 'fs';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

// Update ensureServerData function
async function ensureServerData(guild) {
  const playerData = await loadPlayerData();
  
  // Prepare server metadata
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
    lastUpdated: Date.now()
  };

  if (!playerData[guild.id]) {
    // New server initialization
    playerData[guild.id] = {
      ...serverMetadata,
      players: {},
      tribes: {
        tribe1: null,
        tribe1emoji: null,
        tribe2: null,
        tribe2emoji: null,
        tribe3: null,
        tribe3emoji: null,
        tribe4: null,
        tribe4emoji: null
      },
      timezones: {},
      pronounRoleIDs: []
    };
    await savePlayerData(playerData);
    console.log(`Initialized new server: ${guild.name} (${guild.id})`);
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

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

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
// const timezoneOffsets = { ... };
// const timezoneRoleIds = [ ... ];

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
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.use(express.json());

// Define handleSetTribe before the route handlers
async function handleSetTribe(guildId, tribeNumber, options) {
    const tribeRoleId = options.find(option => option.name === 'role')?.value || options[0].value;
    const emojiOption = options.find(option => option.name === 'emoji');
    const tribeEmoji = emojiOption?.value || null;

    console.log(`Setting tribe${tribeNumber} for guild ${guildId} to role ${tribeRoleId}`);

    // Get guild and verify role
    const guild = await client.guilds.fetch(guildId);
    const role = await guild.roles.fetch(tribeRoleId);
    const guildData = await loadPlayerData(guildId);
    
    if (!role) {
        throw new Error(`Role ${tribeRoleId} not found in guild ${guildId}`);
    }

    console.log(`Found role: ${role.name} (${role.id})`);

    // Update tribe data
    await updateGuildTribes(guildId, {
        [`tribe${tribeNumber}`]: tribeRoleId,
        [`tribe${tribeNumber}emoji`]: tribeEmoji
    });

    // Verify the update
    const updatedTribes = await getGuildTribes(guildId);
    console.log('Tribes after update:', updatedTribes);

    // Use the existing guild instance
    const members = await guild.members.fetch();
    const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));

    let resultLines = [];
    let existingLines = [];
    let errorLines = [];
    let maxEmojiReached = false;

    for (const [_, member] of targetMembers) {
        try {
            // Check if player already has an emoji
            const existingPlayer = guildData.players[member.id];
            if (existingPlayer?.emojiCode) {
                existingLines.push(`${member.displayName}: Already has emoji \`${existingPlayer.emojiCode}\``);
                continue;
            }

            const result = await createEmojiForUser(member, guild);
            await updatePlayer(guildId, member.id, { emojiCode: result.emojiCode });
            resultLines.push(`${member.displayName} ${result.emojiCode} (${result.isAnimated ? 'animated' : 'static'})`);

        } catch (error) {
            if (error.code === 50138) {
                errorLines.push(`${error.memberName}: Failed to upload emoji - File size too large`);
            } else {
                errorLines.push(`${error.memberName}: Failed to upload emoji - ${error.message}`);
            }
            console.error('Emoji creation error:', error);
        }
    }

    return {
        resultLines,
        existingLines,
        errorLines,
        maxEmojiReached,
        tribeRoleId
    };
}

async function handleClearTribe(interaction, tribeNumber) {
    const guildId = interaction.guild_id;
    const guildData = await loadPlayerData();
    
    if (!guildData[guildId]?.tribes) {
        return interaction.editReply('No tribe data found');
    }

    // Clear tribe data
    guildData[guildId].tribes[`tribe${tribeNumber}`] = null;
    guildData[guildId].tribes[`tribe${tribeNumber}emoji`] = null;

    await savePlayerData(guildData);
    return interaction.editReply(`Tribe ${tribeNumber} cleared`);
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
    // Strip "dev_" if present
    const name = rawName.replace(/^dev_/, '');

    console.log(`Received command: ${rawName}`);

    // Only check permissions for commands that modify data
    const readOnlyCommands = ['castlist', 'getting_started'];
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
              name: 'About CastBot',
              value: 'CastBot provides a dynamically updating castlist - no need to manually update your castlist every time a player is booted!'
            },
            {
              name: '1️⃣ Set up Pronouns',
              value: 'Create roles in your server representing each pronoun (e.g., She/Her), run `/pronouns_add`, select all of the pronouns roles you just added, then within Discord assign the relevant pronoun role to each player.'
            },
            {
              name: '2️⃣ Set up Timezones',
              value: 'Create roles in your server representing each timezone, run `/timezones_add`, select all of the timezone roles you just added, then within Discord assign the relevant timezone role to each player.'
            },
            {
              name: '3️⃣ Set player ages',
              value: 'Run the `/set_players_age` command and select each player (user) from discord, then type their age. You can do this for upto 12 players at a time, so you\'ll need to run the command twice assuming your season has more than 12 players.'
            },
            {
              name: '4️⃣ Set Tribes',
              value: 'Run `/set_tribe1`, `/set_tribe2`, `/set_tribe3`, and `/set_tribe4` commands (for as many tribes as you have). Any players with the tribe roles will then immediately show up in `/castlist`.'
            },
            {
              name: 'Final Step',
              value: 'Type the `/castlist` command in a channel to show the players how to summon it and you\'re good to go!'
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
      try {
        console.log('Processing castlist command');
        const guildId = req.body.guild_id;

        // Load tribe IDs from guild data
        const tribesCfg = await getGuildTribes(guildId);
        const tribeIDs = {
          tribe1: tribesCfg.tribe1,
          tribe2: tribesCfg.tribe2,
          tribe3: tribesCfg.tribe3,
          tribe4: tribesCfg.tribe4,
        };
        console.log('Loaded tribe IDs:', tribeIDs);

        // After loading tribeIDs, check if any tribes exist
        const hasTribes = Object.values(tribeIDs).some(id => id !== null);
        
        if (!hasTribes) {
          // Send initial response
          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [{
                title: 'CastBot: Dynamic Castlist',
                description: 'No tribes have been added yet. Please have production run the `/set_tribe1`, `/set_tribe2`, `/set_tribe3`, or `/set_tribe4` command and select the Tribe role for them to show up in this list.',
                color: 0x7ED321
              }]
            }
          });
          return;
        }

        // Define the createMemberFields function first
        const createMemberFields = async (members, guild) => {
          const fields = [];
          const pronounRoleIDs = await getGuildPronouns(guild.id);
          const timezones = await getGuildTimezones(guild.id);
          
          console.log('Loaded timezones for guild:', guild.id, timezones); // Add debug logging
          
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
              console.log(`Checking roles for member ${member.displayName}:`);
              for (const [roleId] of member.roles.cache) {
                console.log(`- Checking role ${roleId}`);
                if (timezones[roleId]) {
                  console.log(`  Found timezone with offset:`, timezones[roleId].offset);
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
              
              // Create name field with emoji if it exists
              const nameWithEmoji = playerData?.emojiCode ? 
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
        };

        // Send initial response
        res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        const guild = await client.guilds.fetch(guildId);
        console.log('Guild:', guild); // Debug log

        if (!guild) {
          throw new Error('Could not fetch guild');
        }

        // Fetch the full guild with roles cache
        const fullGuild = await client.guilds.fetch(guildId, { force: true });
        await fullGuild.roles.fetch();
        const members = await fullGuild.members.fetch();

        // Save all player data to JSON
        const allMembers = Array.from(members.values());
        const savedData = await saveAllPlayerData(allMembers, fullGuild, roleConfig);
        console.log('Saved all player data to JSON:', savedData);

        // Create arrays to store tribe data
        const tribeRoles = [];
        const tribeMembers = [];

        // Fetch roles and members for each tribe
        for (const [key, tribeId] of Object.entries(tribeIDs)) {
          if (tribeId) {  // Only process tribes that have IDs
            const tribeRole = fullGuild.roles.cache.get(tribeId);
            if (tribeRole) {
              console.log(`Processing tribe ${key} with ID ${tribeId}:`);
              console.log(`- Role name: ${tribeRole.name}`);
              const tribeMemberCollection = members.filter(member => member.roles.cache.has(tribeId));
              
              // Debug member filtering
              const memberArray = Array.from(tribeMemberCollection.values());
              console.log(`- Member count: ${memberArray.length}`);
              console.log(`- Members: ${memberArray.map(m => `${m.displayName} (${m.id})`).join(', ')}`);
              console.log(`- Raw member roles: ${memberArray.map(m => Array.from(m.roles.cache.keys())).join(', ')}`);
              
              tribeRoles.push(tribeRole);
              tribeMembers.push(tribeMemberCollection);
            } else {
              console.log(`Could not find role for tribe ${key} with ID ${tribeId}`);
            }
          }
        }

        // Create the embed
        const embed = new EmbedBuilder()
          .setTitle('CastBot: Dynamic Castlist')
          .setAuthor({ 
            name: fullGuild.name || 'Unknown Server', 
            iconURL: fullGuild.iconURL() || undefined 
          })
          .setColor('#7ED321')
          .setFooter({ 
            text: 'Want dynamic castlist for your ORG? Simply click on \'CastBot\' and click +Add App!',
            iconURL: client.user.displayAvatarURL()
          });

        // Add each tribe that has members
        for (let i = 0; i < tribeRoles.length; i++) {
          try {
            console.log(`Adding tribe ${i + 1} to embed: ${tribeRoles[i].name}`);
            // Add spacer if this isn't the first tribe
            if (i > 0) {
              embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
            }
            
            // Add tribe header and members
            const tribeEmoji = tribesCfg[`tribe${i + 1}emoji`] || '';
            const header = tribeEmoji
              ? `${tribeEmoji}  ${tribeRoles[i].name}  ${tribeEmoji}`
              : tribeRoles[i].name;
            embed.addFields({ name: header, value: '\u200B', inline: false });
            const memberFields = await createMemberFields(tribeMembers[i], fullGuild);
            console.log(`Generated ${memberFields.length} member fields for tribe ${i + 1}`);
            
            // Check if adding these fields would exceed the limit
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
                  content: 'Cannot display castlist: Too many fields (maximum 25). Consider splitting tribes into separate castlists using the castlist parameter in /set_tribe.',
                  flags: InteractionResponseFlags.EPHEMERAL
                },
              });
              return;
            }
            throw error;
          }
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
        console.error('Error handling castlist command:', error);
      }
      return;
    } else if (name === 'playericons') {
      try {
        const userId1 = data.options[0].value;
        const userId2 = data.options[1]?.value; // Optional second user ID
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        // Process first member (always required)
        const member1 = await guild.members.fetch(userId1);
        const avatarURL1 = member1.avatarURL({ size: 128 }) || member1.user.avatarURL({ size: 128 });

        if (!avatarURL1) {
          throw new Error('Could not fetch avatar for first user');
        }

        // Create first emoji and store data
        const emoji1 = await guild.emojis.create({ attachment: avatarURL1, name: userId1 });
        await updatePlayer(guildId, userId1, { 
          emojiCode: `<:${emoji1.name}:${emoji1.id}>`
        });
        console.log(`Stored emoji for ${member1.displayName}: <:${emoji1.name}:${emoji1.id}>`);

        // Process second member if provided
        let member2, emoji2;
        if (userId2) {
          member2 = await guild.members.fetch(userId2);
          const avatarURL2 = member2.avatarURL({ size: 128 }) || member2.user.avatarURL({ size: 128 });
          
          if (!avatarURL2) {
            throw new Error('Could not fetch avatar for second user');
          }

          emoji2 = await guild.emojis.create({ attachment: avatarURL2, name: userId2 });
          await updatePlayer(guildId, userId2, { 
            emojiCode: `<:${emoji2.name}:${emoji2.id}>`
          });
          console.log(`Stored emoji for ${member2.displayName}: <:${emoji2.name}:${emoji2.id}>`);
        }

        // Verify storage
        const verifyData1 = await getPlayer(guildId, userId1);
        console.log('Stored data verification for user 1:', verifyData1);
        
        if (userId2) {
          const verifyData2 = await getPlayer(guildId, userId2);
          console.log('Stored data verification for user 2:', verifyData2);
        }

        // Prepare response content based on whether there's one or two users
        const content = userId2 ? 
          `Created emojis for ${member1.displayName} and ${member2.displayName}!\n<:${emoji1.name}:${emoji1.id}> <:${emoji2.name}:${emoji2.id}>\n\nEmoji codes:\n\`<:${emoji1.name}:${emoji1.id}>\`\n\`<:${emoji2.name}:${emoji2.id}>\`` :
          `Created emoji for ${member1.displayName}!\n<:${emoji1.name}:${emoji1.id}>\n\nEmoji code:\n\`<:${emoji1.name}:${emoji1.id}>\``;

        // Prepare embeds based on whether there's one or two users
        const embeds = userId2 ? 
          [{ image: { url: avatarURL1 } }, { image: { url: member2.avatarURL({ size: 128 }) || member2.user.avatarURL({ size: 128 }) } }] :
          [{ image: { url: avatarURL1 } }];

        // Send success message
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content,
            embeds
          },
        });

      } catch (error) {
        console.error('Error in playericons command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error creating emojis. This might be because:\n- The server has reached its emoji limit\n- One or more images are too large\n- The bot lacks permissions\n- Invalid user IDs provided',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      return;
    } else if (/^set_tribe[1-4]$/.test(name)) {
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      });
      const guildId = req.body.guild_id;
      const tribeNumber = name.charAt(name.length - 1);
      try {
          const {
              resultLines,
              existingLines,
              errorLines,
              maxEmojiReached,
              tribeRoleId
          } = await handleSetTribe(guildId, tribeNumber, data.options);

          const messageLines = [
              `Tribe${tribeNumber} role updated to <@&${tribeRoleId}> (${tribeRoleId})`,
              ''
          ];

          if (resultLines.length > 0) {
              messageLines.push('New emojis created:');
              messageLines.push(...resultLines);
              messageLines.push('');
          }

          if (existingLines.length > 0) {
              messageLines.push('Existing emojis found:');
              messageLines.push(...existingLines);
              messageLines.push('');
          }

          if (errorLines.length > 0) {
              messageLines.push('Errors encountered:');
              messageLines.push(...errorLines);
          }

          if (maxEmojiReached) {
              messageLines.push('');
              messageLines.push('⚠️ Server emoji limit reached. Some emojis could not be created.');
          }

          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
              method: 'PATCH',
              body: {
                  content: messageLines.join('\n'),
                  flags: InteractionResponseFlags.EPHEMERAL
              },
          });

          return;
      } catch (error) {
          console.error(`Error setting tribe: ${error}`);
          return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                  content: 'Error updating tribe role',
                  flags: InteractionResponseFlags.EPHEMERAL
              },
          });
      }
  } else if (name === 'clear_tribe1' || name === 'clear_tribe2' || name === 'clear_tribe3' || name === 'clear_tribe4') {
    try {
      console.log(`Received /${name} command`);
      await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      });

      const guildId = req.body.guild_id;
      const guild = await client.guilds.fetch(guildId);
      const tribeNumber = name.replace('clear_tribe', '');
      
      console.log(`Processing cleartribe${tribeNumber} for guild ${guildId}`);

      // Load full data structure
      const playerData = await loadPlayerData();
      if (!playerData[guildId]) {
        console.log('No guild data found');
        return;
      }

      // Get tribe role ID before we clear it!
      const tribeRoleId = playerData[guildId].tribes[`tribe${tribeNumber}`];
      if (!tribeRoleId) {
        console.log('No tribe role ID found to clear');
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `No tribe${tribeNumber} role found to clear`,
            flags: InteractionResponseFlags.EPHEMERAL
          }
        });
        return;
      }

      console.log(`Found tribe${tribeNumber} role ID: ${tribeRoleId}`);

      // Get all members with this tribe role
      const members = await guild.members.fetch();
      const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
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

      // Clear tribe data
      playerData[guildId].tribes[`tribe${tribeNumber}`] = null;
      playerData[guildId].tribes[`tribe${tribeNumber}emoji`] = null;

      // Save updated data
      await savePlayerData(playerData);
      console.log('Saved updated player data');

      // Send response
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: resultLines.length > 0 
            ? `Tribe ${tribeNumber} cleared.\n${resultLines.join('\n')}`
            : `Tribe ${tribeNumber} cleared. No emojis needed to be removed.`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });

    } catch (error) {
      console.error(`Error in cleartribe${name.slice(-1)}:`, error);
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: {
          content: `Error clearing tribe${name.slice(-1)}`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }
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
        console.log('Processing addpronouns command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });
    
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const roleOptions = ['role1', 'role2', 'role3']
          .map(roleName => data.options.find(opt => opt.name === roleName))
          .filter(opt => opt !== undefined)
          .map(opt => opt.value);
    
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
        console.error('Error processing addpronouns command:', error);
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
    } else if (name.startsWith('settribe') && /settribe[1-4]$/.test(name)) {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const tribeNumber = name.charAt(name.length - 1);
        const guildId = req.body.guild_id;
        
        const {
            resultLines,
            existingLines,
            errorLines,
            maxEmojiReached,
            tribeRoleId
        } = await handleSetTribe(guildId, tribeNumber, data.options);

        const messageLines = [
            `Tribe${tribeNumber} role updated to <@&${tribeRoleId}> (${tribeRoleId})`,
            ''
        ];

        if (resultLines.length > 0) {
            messageLines.push('New emojis created:');
            messageLines.push(...resultLines);
            messageLines.push('');
        }

        if (existingLines.length > 0) {
            messageLines.push('Existing emojis found:');
            messageLines.push(...existingLines);
            messageLines.push('');
        }

        if (errorLines.length > 0) {
            messageLines.push('Errors encountered:');
            messageLines.push(...errorLines);
        }

        if (maxEmojiReached) {
            messageLines.push('');
            messageLines.push('⚠️ Server emoji limit reached. Some emojis could not be created.');
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: messageLines.join('\n'),
                flags: InteractionResponseFlags.EPHEMERAL
            },
        });

        return;
    } catch (error) {
        console.error(`Error setting tribe: ${error}`);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: 'Error updating tribe role',
                flags: InteractionResponseFlags.EPHEMERAL
            },
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
        
        // Clean up the offset value (remove + if present)
        const cleanOffset = parseInt(offsetOption.value.replace(/^\+/, ''));
        
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
} else if (name === 'remove_timezones') { // Changed from removetimezone
  try {
    console.log('Processing removetimezone command');
    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    
    // Get all timezone role options
    const roleOptions = Array.from({ length: 12 }, (_, i) => 
      data.options?.find(opt => opt.name === `timezone${i + 1}`)
    ).filter(opt => opt !== undefined);

    console.log('Roles to remove:', roleOptions);

    // Load current timezone data
    const storageData = await loadPlayerData();
    if (!storageData[guildId]?.timezones) {
      storageData[guildId] = { ...storageData[guildId], timezones: {} };
    }

    const results = [];

    // Process each role
    for (const roleOption of roleOptions) {
      const roleId = roleOption.value;
      const role = await guild.roles.fetch(roleId);
      const roleName = role ? role.name : roleId;

      if (storageData[guildId].timezones[roleId]) {
        delete storageData[guildId].timezones[roleId];
        const message = `Timezone <@&${roleId}> (${roleId}) removed from the timezone list.`;
        console.log(message);
        results.push(message);
      } else {
        const message = `Timezone <@&${roleId}> (${roleId}) was not found in the list of Timezones, so nothing has been removed.`;
        console.log(message);
        results.push(message);
      }
    }

    // Save changes
    await savePlayerData(storageData);
    
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: results.join('\n'),
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
    
  } catch (err) {
    console.error('Error processing removetimezone command:', err);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Failed to remove timezones.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
} else if (name === 'set_tribe') {
  try {
    const guildId = req.body.guild_id;
    const guild = await client.guilds.fetch(guildId);
    const roleId = data.options.find(opt => opt.name === 'role').value;
    const castlistName = data.options.find(opt => opt.name === 'castlist')?.value || 'default';

    // Calculate total fields that would be used
    const totalFields = await calculateCastlistFields(guild, roleId, castlistName);
    
    let message = `Number of fields that would be used: ${totalFields}`;
    if (totalFields > 25) {
      message += ' (more than 25 fields used)';
    }

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: message,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  } catch (error) {
    console.error('Error in set_tribe command:', error);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'An error occurred while processing the command.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
}

  } // end if APPLICATION_COMMAND

  // ...rest of interaction handling...
}); // end app.post

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

// Log in to Discord with your client's token
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

async function createEmojiForUser(member, guild) {
    try {
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

        console.log(`Processing ${isAnimated ? 'animated' : 'static'} avatar for ${member.displayName}`);
        console.log('Avatar URL:', avatarURL);

        try {
            const response = await fetch(avatarURL);
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
                        name: member.id
                    });
                    
                    const emojiCode = `<a:${member.id}:${emoji.id}>`;
                    console.log(`Successfully created animated emoji directly: ${emojiCode}`);
                    
                    return {
                        success: true,
                        emoji,
                        emojiCode,
                        isAnimated: true
                    };
                } catch (directUploadError) {
                    console.log('Direct upload failed:', directUploadError.message);
                    // Fall back to static version
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
                        .toBuffer();
                    finalIsAnimated = false;
                }
            } else {
                // Handle static images
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
                    .toBuffer();
            }

            // Create emoji with processed buffer
            const emoji = await guild.emojis.create({
                attachment: processedBuffer,
                name: member.id
            });

            const emojiCode = finalIsAnimated ? 
                `<a:${member.id}:${emoji.id}>` : 
                `<:${member.id}:${emoji.id}>`;

            console.log(`Created ${finalIsAnimated ? 'animated' : 'static'} emoji (${processedBuffer.length} bytes): ${emojiCode}`);

            return {
                success: true,
                emoji,
                emojiCode,
                isAnimated: finalIsAnimated
            };

        } catch (emojiError) {
            throw {
                code: emojiError.code || 'UNKNOWN',
                message: emojiError.message,
                rawError: emojiError,
                memberName: member.displayName,
                avatarUrl: avatarURL
            };
        }
    } catch (error) {
        console.error('Detailed emoji error:', error);
        throw error;
    }
}

// Add this helper function
async function calculateCastlistFields(guild, tribeRoleId, castlistName = 'default') {
  try {
    const guildData = await loadPlayerData();
    const guildTribes = guildData[guild.id]?.tribes || {};
    let totalFields = 0;
    const uniquePlayers = new Set();
    
    // Count existing tribe fields and their players
    for (const [key, value] of Object.entries(guildTribes)) {
      // Skip emoji entries and empty tribes
      if (key.endsWith('emoji') || !value) continue;
      
      // Add 1 for the tribe header
      totalFields++;
      
      // Get members with this role
      const role = await guild.roles.fetch(value);
      if (role) {
        role.members.forEach(member => uniquePlayers.add(member.id));
      }
    }
    
    // Count new tribe's members
    const newRole = await guild.roles.fetch(tribeRoleId);
    if (newRole) {
      // Add 1 for the new tribe header
      totalFields++;
      newRole.members.forEach(member => uniquePlayers.add(member.id));
    }
    
    // Add the count of unique players
    totalFields += uniquePlayers.size;
    
    return totalFields;
  } catch (error) {
    console.error('Error calculating castlist fields:', error);
    throw error;
  }
}
