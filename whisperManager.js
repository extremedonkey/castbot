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
  ActionRowBuilder, 
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
    
    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    
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
          selectRow.toJSON()
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
    
    const actionRow = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(actionRow);
    
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
        ephemeral: true
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
    
    // Create reply button
    const replyButton = new ButtonBuilder()
      .setCustomId(`whisper_reply_${context.userId}_${coordinate}`)
      .setLabel('Reply')
      .setEmoji('💬')
      .setStyle(2); // Secondary
    
    const buttonRow = new ActionRowBuilder().addComponents(replyButton);
    
    // Deliver whisper to recipient
    const whisperContent = {
      components: [{
        type: 17, // Container
        accent_color: 0x9B59B6, // Purple for whispers
        components: [
          {
            type: 10, // Text Display
            content: `## 💬 ${senderName} whispers to you`
          },
          {
            type: 9, // Section
            components: [{
              type: 10,
              content: `> **@${senderName} is whispering to you**\n${message}`
            }]
          },
          { type: 14 }, // Separator
          buttonRow.toJSON()
        ]
      }],
      flags: (1 << 15), // IS_COMPONENTS_V2
      ephemeral: true
    };
    
    // Store whisper for delivery when recipient interacts
    // Since we can't send ephemeral messages to other users directly,
    // we'll store the whisper and deliver it on their next interaction
    global.pendingWhispers = global.pendingWhispers || new Map();
    const recipientWhispers = global.pendingWhispers.get(targetUserId) || [];
    recipientWhispers.push({
      senderId: context.userId,
      senderName,
      message,
      coordinate,
      timestamp: Date.now(),
      whisperContent
    });
    global.pendingWhispers.set(targetUserId, recipientWhispers);
    
    logger.info('WHISPER', 'Whisper stored for delivery', { 
      senderId: context.userId, 
      targetUserId,
      pendingCount: recipientWhispers.length 
    });
    
    // Post detection and log messages
    await postWhisperDetection(context.guildId, coordinate, client);
    await postWhisperLog(context.guildId, senderName, recipientName, coordinate, message);
    
    logger.info('WHISPER', 'Whisper delivered successfully', { 
      senderId: context.userId, 
      targetUserId 
    });
    
    return {
      content: `✅ Your whisper has been sent to ${recipientName}.`,
      ephemeral: true
    };
  } catch (error) {
    logger.error('WHISPER', 'Failed to send whisper', { error: error.message });
    return {
      content: '❌ An error occurred while sending your whisper.',
      ephemeral: true
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
    
    const actionRow = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(actionRow);
    
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
 * Check and deliver pending whispers for a user
 * Should be called early in interaction handling
 */
export async function checkAndDeliverWhispers(userId, interactionToken) {
  if (!global.pendingWhispers || !global.pendingWhispers.has(userId)) {
    return null;
  }
  
  const whispers = global.pendingWhispers.get(userId);
  if (whispers.length === 0) {
    return null;
  }
  
  // Get the oldest whisper
  const whisper = whispers.shift();
  
  // Remove from pending if no more whispers
  if (whispers.length === 0) {
    global.pendingWhispers.delete(userId);
  }
  
  logger.info('WHISPER', 'Delivering pending whisper', { 
    recipientId: userId, 
    senderId: whisper.senderId,
    remainingWhispers: whispers.length 
  });
  
  // Deliver the whisper as a follow-up message
  try {
    await DiscordRequest(`webhooks/${process.env.APP_ID}/${interactionToken}`, {
      method: 'POST',
      body: {
        ...whisper.whisperContent,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
    
    // If there are more whispers, inform the user
    if (whispers.length > 0) {
      setTimeout(async () => {
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${interactionToken}`, {
            method: 'POST',
            body: {
              content: `💬 You have ${whispers.length} more whisper${whispers.length > 1 ? 's' : ''} waiting. Interact with something to see them.`,
              flags: InteractionResponseFlags.EPHEMERAL
            }
          });
        } catch (error) {
          logger.debug('WHISPER', 'Could not send whisper notification', { error: error.message });
        }
      }, 1000);
    }
    
    return true;
  } catch (error) {
    logger.error('WHISPER', 'Failed to deliver pending whisper', { error: error.message });
    // Put the whisper back if delivery failed
    whispers.unshift(whisper);
    return false;
  }
}