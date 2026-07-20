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
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { PersistentStore } from './persistentStore.js';

// Persistent whisper store — survives restarts.
// Cache the LOAD PROMISE (not the instance) so concurrent first callers all
// await the same disk load — caching the instance let a second caller query
// the store before load() finished and get a false "already been read".
let whisperStorePromise = null;
function getWhisperStore() {
  if (!whisperStorePromise) {
    whisperStorePromise = PersistentStore.create('whispers').load();
  }
  return whisperStorePromise;
}

// Unread whispers are pruned at this age. Read whispers (readAt set) are kept
// briefly so a lost/failed delivery can be re-read (RaP 0893), then pruned.
const WHISPER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const READ_RETENTION_MS = 24 * 60 * 60 * 1000;

// TEST-ONLY stress simulator (RaP 0893 smoke drill): injects delay into the
// send/read handler work to reproduce under-load timing in calm conditions.
// The deferred ack has already gone out when this runs, so post-fix nothing
// fails — pre-fix the same delay guaranteed "This interaction failed".
const SIM_LATENCY_MS = Math.min(parseInt(process.env.WHISPER_SIM_LATENCY_MS || '0', 10) || 0, 8000);
if (SIM_LATENCY_MS > 0) {
  logger.warn('WHISPER', `SIMULATED LATENCY ACTIVE: ${SIM_LATENCY_MS}ms per whisper operation — unset WHISPER_SIM_LATENCY_MS for normal operation`);
}
const simLatency = () => SIM_LATENCY_MS > 0 ? new Promise(r => setTimeout(r, SIM_LATENCY_MS)) : Promise.resolve();

// Prune decision (logic mirrored in tests/whisperManager.test.js)
export function shouldPruneWhisper(whisper, nowMs) {
  if (!whisper?.timestamp) return true;
  if (whisper.readAt) return nowMs - whisper.readAt > READ_RETENTION_MS;
  return nowMs - whisper.timestamp > WHISPER_MAX_AGE_MS;
}

// Claim a whisper for reading. The check+mark is SYNCHRONOUS on the in-memory
// store, so two concurrent read handlers can never both see 'unread' — the race
// behind duplicate read receipts and the "Unknown Message" delete error
// (four clicks in 2.2s produced three concurrent reads on prod, 2026-07-20).
export function claimWhisper(store, whisperId, nowMs = Date.now()) {
  const data = store.get(whisperId);
  if (!data) return { status: 'missing' };
  if (data.readAt) return { status: 'already', data };
  data.readAt = nowMs;
  store.set(whisperId, data);
  return { status: 'unread', data };
}

/**
 * Eagerly load the whisper store (call from the ready handler) and prune
 * stale entries (old unread whispers, read whispers past retention).
 */
export async function preloadWhisperStore() {
  const store = await getWhisperStore();
  let pruned = 0;
  for (const [id, whisper] of store.entries()) {
    if (shouldPruneWhisper(whisper, Date.now())) {
      store.delete(id);
      pruned++;
    }
  }
  if (pruned > 0) await store.flush();
  logger.info('WHISPER', 'Store preloaded', { entries: store.size, pruned });
  return store;
}

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

    // Feature gate (covers stale whisper buttons on old messages) — ABSENT means ON
    if (safariData[context.guildId]?.safariConfig?.whispersEnabled === false) {
      return {
        content: '❌ Whispers are currently disabled in this server.',
        ephemeral: true
      };
    }

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
    await simLatency();

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
    
    // Store whisper data persistently for retrieval when Read Message is clicked
    logger.info('WHISPER', 'Step 1: Loading whisper store');
    const store = await getWhisperStore();
    const whisperId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('WHISPER', 'Step 2: Storing whisper data');
    store.set(whisperId, {
      senderId: context.userId,
      senderName,
      targetUserId,
      recipientName,
      message,
      coordinate,
      timestamp: Date.now()
    });
    // Write-through: whispers are low-volume and must survive a restart landing
    // inside the store's 1s save debounce (e.g. a deploy right after send)
    await store.flush();

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
    const whisperData = store.get(whisperId);
    whisperData.messageId = notificationMessage.id;
    whisperData.channelId = channelId;
    store.set(whisperId, whisperData);
    await store.flush();

    logger.info('WHISPER', 'Whisper notification posted', { 
      senderId: context.userId, 
      targetUserId,
      whisperId,
      messageId: notificationMessage.id 
    });
    
    // Log whisper to Safari Log channel — DETACHED (RaP 0893): the log fan-out
    // (up to two channels, rate-limited) was adding seconds before the ack and
    // is best-effort by design. Nothing the sender waits on depends on it.
    const { logWhisper } = await import('./safariLogger.js');
    logWhisper({
      guildId: context.guildId,
      senderId: context.userId,
      senderName: context.username,
      senderDisplayName: context.displayName || context.username,
      recipientId: targetUserId,
      recipientName,
      location: coordinate,
      message,
      channelName: context.channelName
    }).catch(logError => {
      logger.error('WHISPER', 'Failed to log whisper send', { error: logError.message });
    });
    
    // Post detection messages (temporarily disabled for debugging)
    // await postWhisperDetection(context.guildId, coordinate, client);
    
    logger.info('WHISPER', 'Whisper delivered successfully', { 
      senderId: context.userId, 
      targetUserId 
    });
    
    return {
      content: `## 🤫 Whisper Sent\nYour whisper has been sent to ${recipientName}. Other players in the location may be able to see you're whispering -- if they're paying attention.\n\n> ${message}`,
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
    await simLatency();

    // Check if clicker is the intended recipient (previously a silent branch —
    // shared-channel notifications invite other players' clicks, log them)
    if (context.userId !== targetUserId) {
      logger.warn('WHISPER', 'Read clicked by non-recipient', { clickerId: context.userId, whisperId, targetUserId });
      return {
        content: '❌ This whisper is not for you.',
        flags: InteractionResponseFlags.EPHEMERAL
      };
    }

    // Claim the whisper (sync check+mark — see claimWhisper). Reads no longer
    // delete: a re-click RE-DELIVERS the same content instead of "already read",
    // so a lost delivery is retryable and double-clicks can't duplicate receipts.
    const store = await getWhisperStore();
    const claim = claimWhisper(store, whisperId);
    if (claim.status === 'missing') {
      logger.warn('WHISPER', 'Read clicked for unknown whisperId (pruned or lost)', { whisperId, targetUserId });
      return {
        content: '❌ This whisper has expired. If a whisper log is configured, the message is preserved there.',
        flags: InteractionResponseFlags.EPHEMERAL
      };
    }
    const whisperData = claim.data;
    const alreadyRead = claim.status === 'already';

    const whisperContent = {
      components: [{
        type: 17, // Container
        components: [
          {
            type: 10, // Text Display
            content: `## 💬 ${whisperData.senderName} whispers to you\n\n> **${whisperData.senderName}:** ${whisperData.message}${alreadyRead ? '\n-# Already read — showing it again.' : ''}`
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

    if (!alreadyRead) {
      // Persist the claim before delivery — a crash here at worst leaves the
      // whisper re-readable for its retention window, never lost
      await store.flush();

      // One-time side effects run DETACHED, after delivery. Pre-RaP-0893 these
      // 4-6 REST calls ran BEFORE the ack: a slow log post consumed the whisper
      // and deleted its notification while the reader saw "interaction failed".
      (async () => {
        try {
          const channel = await client.channels.fetch(whisperData.channelId);
          const message = await channel.messages.fetch(whisperData.messageId);
          await message.delete();
          logger.info('WHISPER', 'Deleted notification message', { messageId: whisperData.messageId });
        } catch (error) {
          logger.error('WHISPER', 'Failed to delete notification', { error: error.message });
        }
        try {
          const { logWhisperRead } = await import('./safariLogger.js');
          await logWhisperRead({
            guildId: context.guildId,
            readerId: context.userId,
            readerName: context.username,
            readerDisplayName: context.displayName || context.username,
            senderId: whisperData.senderId,
            senderName: whisperData.senderName,
            location: whisperData.coordinate,
            channelName: context.channelName,
            message: whisperData.message
          });
        } catch (logError) {
          logger.error('WHISPER', 'Failed to log whisper read', { error: logError.message });
        }
      })();
    }

    logger.info('WHISPER', 'Delivering whisper content', {
      recipientId: context.userId,
      senderId: whisperData.senderId,
      whisperId,
      alreadyRead
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

