/**
 * Whisper Manager
 * 
 * Handles player-to-player whisper communication in Safari locations
 * Features:
 * - Location-based whispers
 * - Reply functionality
 * - Whisper detection (activity indicators)
 * - Whisper logging for production
 */

import { 
  ButtonBuilder, 
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle 
} from 'discord.js';
import { getPlayersAtLocation, arePlayersAtSameLocation } from './playerLocationManager.js';
import { loadPlayerData } from './storage.js';
import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { logger } from './logger.js';
import { DiscordRequest } from './utils.js';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

/**
 * Show player selection UI for whispers
 */
export async function showWhisperPlayerSelect(context, coordinate, client) {
  logger.info('WHISPER', 'Showing player select', { userId: context.userId, coordinate });
  
  try {
    // Check if user is a player in the safari game
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const activeMapId = safariData[context.guildId]?.maps?.active;
    
    if (!playerData[context.guildId]?.players?.[context.userId]?.safari?.mapProgress?.[activeMapId]) {
      return {
        content: '❌ You must be initialized in the Safari game to use whispers.',
        ephemeral: true
      };
    }
    
    // Get players at this location
    const playersAtLocation = await getPlayersAtLocation(context.guildId, coordinate, client);
    
    // Filter out the sender
    const otherPlayers = playersAtLocation.filter(p => p.userId !== context.userId);
    
    if (otherPlayers.length === 0) {
      return {
        content: '❌ There are no other players at this location to whisper to.',
        ephemeral: true
      };
    }
    
    // Create player select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`whisper_player_select_${coordinate}`)
      .setPlaceholder('Select a player to whisper to...')
      .addOptions(
        otherPlayers.map(player => ({
          label: player.displayName,
          value: player.userId,
          description: `Whisper to ${player.displayName}`,
          emoji: '💬'
        }))
      );
    
    logger.info('WHISPER', 'Player select shown', { 
      userId: context.userId, 
      coordinate, 
      playerCount: otherPlayers.length 
    });
    
    return {
      components: [{
        type: 17, // Container
        components: [
          {
            type: 10, // Text Display
            content: `## Select a Player to chat with\n\n_Choose from players at this location:_`
          },
          { type: 14 }, // Separator
          {
            type: 1, // Action Row
            components: [selectMenu.toJSON()]
          }
        ]
      }],
      flags: (1 << 15), // IS_COMPONENTS_V2
      ephemeral: true
    };
  } catch (error) {
    logger.error('WHISPER', 'Failed to show player select', { error: error.message });
    return {
      content: '❌ An error occurred while preparing the whisper interface.',
      ephemeral: true
    };
  }
}

/**
 * Show whisper modal after player selection
 */
export async function showWhisperModal(context, targetUserId, coordinate, client) {
  logger.info('WHISPER', 'Showing whisper modal', { 
    senderId: context.userId, 
    targetUserId, 
    coordinate 
  });
  
  try {
    // Get target player info
    const playerData = await loadPlayerData();
    const targetPlayer = playerData[context.guildId]?.players?.[targetUserId];
    
    // Try to get display name from Discord
    let targetDisplayName = 'Unknown Player';
    if (client) {
      try {
        const guild = await client.guilds.fetch(context.guildId);
        const member = await guild.members.fetch(targetUserId);
        targetDisplayName = member.displayName || member.user.username || 'Unknown Player';
      } catch (error) {
        logger.debug('WHISPER', 'Could not fetch member for modal', { targetUserId });
      }
    }
    
    // Create modal
    const modal = new ModalBuilder()
      .setCustomId(`whisper_send_modal_${targetUserId}_${coordinate}`)
      .setTitle(`Send message to ${targetDisplayName}`);
    
    const messageInput = new TextInputBuilder()
      .setCustomId('whisper_message')
      .setLabel('Your message')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Type your whisper...')
      .setMinLength(1)
      .setMaxLength(1000)
      .setRequired(true);
    
    modal.addComponents({
      type: 1, // Action Row
      components: [messageInput.toJSON()]
    });
    
    return {
      type: InteractionResponseType.MODAL,
      data: modal.toJSON()
    };
  } catch (error) {
    logger.error('WHISPER', 'Failed to show whisper modal', { error: error.message });
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ An error occurred while preparing the message interface.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    };
  }
}

/**
 * Process and deliver whisper message
 */
export async function sendWhisper(context, targetUserId, coordinate, message, client) {
  logger.info('WHISPER', 'Processing whisper', { 
    senderId: context.userId, 
    targetUserId, 
    coordinate,
    messageLength: message.length 
  });
  
  try {
    // Verify both players are still at the same location
    const { sameLocation, coordinate: currentCoord } = await arePlayersAtSameLocation(
      context.guildId, 
      context.userId, 
      targetUserId
    );
    
    if (!sameLocation || currentCoord !== coordinate) {
      return {
        content: '❌ The player has moved to a different location.',
        flags: InteractionResponseFlags.EPHEMERAL
      };
    }
    
    // Get player display names
    let senderName = 'Unknown Player';
    let recipientName = 'Unknown Player';
    
    if (client) {
      try {
        const guild = await client.guilds.fetch(context.guildId);
        const senderMember = await guild.members.fetch(context.userId);
        const recipientMember = await guild.members.fetch(targetUserId);
        
        senderName = senderMember.displayName || senderMember.user.username;
        recipientName = recipientMember.displayName || recipientMember.user.username;
      } catch (error) {
        logger.debug('WHISPER', 'Could not fetch member names', { error: error.message });
      }
    }
    
    // Store whisper data globally for retrieval when Read Message is clicked
    logger.info('WHISPER', 'Step 1: Creating whisper storage');
    global.activeWhispers = global.activeWhispers || new Map();
    const whisperId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('WHISPER', 'Step 2: Storing whisper data');
    global.activeWhispers.set(whisperId, {
      senderId: context.userId,
      senderName,
      targetUserId,
      recipientName,
      message,
      coordinate,
      timestamp: Date.now()
    });
    
    // Get the channel for this coordinate
    logger.info('WHISPER', 'Step 3: Loading safari data');
    const safariData = await loadSafariContent();
    const activeMapId = safariData[context.guildId]?.maps?.active;
    const channelId = safariData[context.guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate]?.channelId;
    
    if (!channelId) {
      throw new Error('Could not find channel for coordinate');
    }
    
    logger.info('WHISPER', 'Step 4: Found channel', { channelId });
    
    // Post non-ephemeral notification in the channel
    logger.info('WHISPER', 'Step 5: Fetching channel');
    const channel = await client.channels.fetch(channelId);
    
    logger.info('WHISPER', 'Step 6: Sending notification message');
    const notificationMessage = await channel.send({
      content: `💬 **<@${context.userId}> whispers to <@${targetUserId}>**`,
      components: [{
        type: 1, // Action Row
        components: [{
          type: 2, // Button
          custom_id: `whisper_read_${whisperId}_${targetUserId}`,
          label: 'Read Message',
          emoji: { name: '💬' },
          style: 1 // Primary
        }]
      }]
    });
    
    logger.info('WHISPER', 'Step 7: Notification sent successfully');
    
    // Store message ID for deletion when read
    global.activeWhispers.get(whisperId).messageId = notificationMessage.id;
    global.activeWhispers.get(whisperId).channelId = channelId;
    
    logger.info('WHISPER', 'Whisper notification posted', { 
      senderId: context.userId, 
      targetUserId,
      whisperId,
      messageId: notificationMessage.id 
    });
    
    // Post detection and log messages (temporarily disabled for debugging)
    // await postWhisperDetection(context.guildId, coordinate, client);
    // await postWhisperLog(context.guildId, senderName, recipientName, coordinate, message);
    
    logger.info('WHISPER', 'Whisper delivered successfully', { 
      senderId: context.userId, 
      targetUserId 
    });
    
    return {
      content: `✅ Your whisper has been sent to ${recipientName}.`,
      flags: InteractionResponseFlags.EPHEMERAL
    };
  } catch (error) {
    logger.error('WHISPER', 'Failed to send whisper', { error: error.message });
    return {
      content: '❌ An error occurred while sending your whisper.',
      flags: InteractionResponseFlags.EPHEMERAL
    };
  }
}

/**
 * Post whisper detection notification in map channel
 */
async function postWhisperDetection(guildId, coordinate, client) {
  try {
    const safariData = await loadSafariContent();
    const whisperSettings = safariData[guildId]?.whisperSettings;
    
    if (!whisperSettings?.detectionEnabled) {
      return;
    }
    
    const activeMapId = safariData[guildId]?.maps?.active;
    const channelId = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate]?.channelId;
    
    if (!channelId || !client) {
      return;
    }
    
    const channel = await client.channels.fetch(channelId);
    const detectionMessage = await channel.send({
      components: [{
        type: 17, // Container
        components: [{
          type: 10, // Text Display
          content: `👀 *Players are whispering at ${coordinate}*`
        }]
      }],
      flags: (1 << 15) // IS_COMPONENTS_V2
    });
    
    // Schedule deletion
    const deletionTime = whisperSettings.detectionDuration || 30000;
    setTimeout(async () => {
      try {
        await detectionMessage.delete();
      } catch (error) {
        logger.debug('WHISPER', 'Could not delete detection message', { error: error.message });
      }
    }, deletionTime);
    
    logger.info('WHISPER', 'Detection posted', { guildId, coordinate, channelId });
  } catch (error) {
    logger.error('WHISPER', 'Failed to post detection', { error: error.message });
  }
}

/**
 * Post full whisper log for production/spectators
 */
async function postWhisperLog(guildId, senderName, recipientName, coordinate, message) {
  try {
    const safariData = await loadSafariContent();
    const whisperSettings = safariData[guildId]?.whisperSettings;
    
    if (!whisperSettings?.logEnabled || !whisperSettings?.logChannelId) {
      return;
    }
    
    // Post to log channel via REST API
    const timestamp = Math.floor(Date.now() / 1000);
    
    await DiscordRequest(`channels/${whisperSettings.logChannelId}/messages`, {
      method: 'POST',
      body: {
        components: [{
          type: 17, // Container
          accent_color: 0x9B59B6, // Purple for whispers
          components: [
            {
              type: 10, // Text Display
              content: `## 📝 Whisper Log\n\n**From:** ${senderName}\n**To:** ${recipientName}\n**Location:** ${coordinate}\n**Time:** <t:${timestamp}:t>`
            },
            { type: 14 }, // Separator
            {
              type: 9, // Section
              components: [{
                type: 10,
                content: `> ${message}`
              }]
            }
          ]
        }],
        flags: (1 << 15) // IS_COMPONENTS_V2
      }
    });
    
    logger.info('WHISPER', 'Log posted', { guildId, senderName, recipientName });
  } catch (error) {
    logger.error('WHISPER', 'Failed to post log', { error: error.message });
  }
}

/**
 * Show reply modal with previous message preview
 */
export async function showReplyModal(context, originalSenderId, coordinate, client) {
  logger.info('WHISPER', 'Showing reply modal', { 
    replyingUserId: context.userId, 
    originalSenderId, 
    coordinate 
  });
  
  try {
    // Get original sender info
    let senderDisplayName = 'Unknown Player';
    if (client) {
      try {
        const guild = await client.guilds.fetch(context.guildId);
        const member = await guild.members.fetch(originalSenderId);
        senderDisplayName = member.displayName || member.user.username || 'Unknown Player';
      } catch (error) {
        logger.debug('WHISPER', 'Could not fetch member for reply', { originalSenderId });
      }
    }
    
    // Create modal (reuse the same send modal structure)
    const modal = new ModalBuilder()
      .setCustomId(`whisper_send_modal_${originalSenderId}_${coordinate}`)
      .setTitle(`Reply to ${senderDisplayName}`);
    
    const messageInput = new TextInputBuilder()
      .setCustomId('whisper_message')
      .setLabel('Your reply')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Type your reply...')
      .setMinLength(1)
      .setMaxLength(1000)
      .setRequired(true);
    
    modal.addComponents({
      type: 1, // Action Row
      components: [messageInput.toJSON()]
    });
    
    return {
      type: InteractionResponseType.MODAL,
      data: modal.toJSON()
    };
  } catch (error) {
    logger.error('WHISPER', 'Failed to show reply modal', { error: error.message });
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ An error occurred while preparing the reply interface.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    };
  }
}

/**
 * Handle Read Message button click
 */
export async function handleReadWhisper(context, whisperId, targetUserId, client) {
  logger.info('WHISPER', 'Read message button clicked', { 
    clickerId: context.userId, 
    whisperId,
    targetUserId 
  });
  
  try {
    // Check if clicker is the intended recipient
    if (context.userId !== targetUserId) {
      return {
        content: '❌ This whisper is not for you.',
        flags: InteractionResponseFlags.EPHEMERAL
      };
    }
    
    // Get whisper data
    if (!global.activeWhispers || !global.activeWhispers.has(whisperId)) {
      return {
        content: '❌ This whisper has expired or already been read.',
        flags: InteractionResponseFlags.EPHEMERAL
      };
    }
    
    const whisperData = global.activeWhispers.get(whisperId);
    
    // Prepare whisper content (using same pattern as player select)
    const whisperContent = {
      components: [{
        type: 17, // Container
        components: [
          {
            type: 10, // Text Display
            content: `## 💬 ${whisperData.senderName} whispers to you\n\n> **${whisperData.senderName}:** ${whisperData.message}`
          },
          { type: 14 }, // Separator
          {
            type: 1, // Action Row
            components: [{
              type: 2, // Button
              custom_id: `whisper_reply_${whisperData.senderId}_${whisperData.coordinate}`,
              label: 'Reply',
              emoji: { name: '💬' },
              style: 2 // Secondary
            }]
          }
        ]
      }],
      flags: (1 << 15), // IS_COMPONENTS_V2
      ephemeral: true
    };
    
    // Delete the notification message
    try {
      const channel = await client.channels.fetch(whisperData.channelId);
      const message = await channel.messages.fetch(whisperData.messageId);
      await message.delete();
      logger.info('WHISPER', 'Deleted notification message', { messageId: whisperData.messageId });
    } catch (error) {
      logger.error('WHISPER', 'Failed to delete notification', { error: error.message });
    }
    
    // Clean up whisper data
    global.activeWhispers.delete(whisperId);
    
    // Deliver the whisper content
    logger.info('WHISPER', 'Delivering whisper content', { 
      recipientId: context.userId, 
      senderId: whisperData.senderId 
    });
    
    return whisperContent;
  } catch (error) {
    logger.error('WHISPER', 'Failed to handle read whisper', { error: error.message });
    return {
      content: '❌ An error occurred while reading the whisper.',
      flags: InteractionResponseFlags.EPHEMERAL
    };
  }
}

/**
 * Check and deliver pending whispers for a user (deprecated - keeping for backwards compatibility)
 * Should be called early in interaction handling
 */
export async function checkAndDeliverWhispers(userId, interactionToken) {
  // This function is now deprecated as we use the notification pattern
  // Keeping it to prevent errors during transition
  return null;
}