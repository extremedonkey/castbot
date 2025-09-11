/**
 * Castlist Display Handler
 * Centralized handler for displaying castlists (show_castlist2 logic)
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { DiscordRequest } from './utils.js';
import { getGuildTribes, loadPlayerData } from './storage.js';
import { castlistVirtualAdapter } from './castlistVirtualAdapter.js';
import { 
  calculateComponentsForTribe,
  determineDisplayScenario,
  createNavigationState,
  reorderTribes,
  sendCastlist2Response,
  determineCastlistToShow,
  canSendMessagesInChannel
} from './castlistV2.js';

/**
 * Display a castlist (handles both regular and virtual castlists)
 * This is the core logic from show_castlist2 handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} client - Discord client
 * @param {string} requestedCastlistId - The castlist ID or name to display
 */
export async function displayCastlist(req, res, client, requestedCastlistId) {
  try {
    // Decode virtual castlist ID if needed
    let requestedCastlist = requestedCastlistId;
    if (castlistVirtualAdapter.isVirtualId(requestedCastlistId)) {
      requestedCastlist = castlistVirtualAdapter.decodeVirtualId(requestedCastlistId);
      console.log(`Decoded virtual castlist ID to: ${requestedCastlist}`);
    }
    
    console.log('Processing castlist display for:', requestedCastlist);
    
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
        console.warn(`Role not found for tribe ${tribe.roleId} on server ${fullGuild.name} (${fullGuild.id}), skipping...`);
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
          content: 'No valid tribes found. Some tribe roles may have been deleted. Please use the Add Tribes button to set up tribes again.',
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
    console.error('Error displaying castlist:', error);
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
    await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        content: `Error displaying Components V2 castlist: ${error.message}`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
}