/**
 * Safari De-initialization Module
 * 
 * Handles the complete removal of Safari data for individual players.
 * Designed to be reusable for future bulk de-initialization features.
 * 
 * Features:
 * - Safe de-initialization with confirmation
 * - Map-aware cleanup (channels, locations, etc.)
 * - Data backup before deletion
 * - Audit logging
 */

import { loadPlayerData, savePlayerData } from './storage.js';
import { loadSafariContent } from './safariManager.js';
import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

/**
 * Create the warning dialog for player de-initialization
 * Components V2 format with proper container structure
 */
export function createDeinitWarningUI(guildId, userId, playerName, hasMap = false) {
  const baseWarnings = [
    `• **${playerName}'s Currency** - All coins/points will be lost`,
    `• **Inventory Items** - All collected items will be deleted`,
    `• **Safari History** - All interaction logs will be removed`,
    `• **Points & Stamina** - All point balances will be reset`,
    `• **Progress Data** - All achievements and milestones cleared`
  ];

  const mapWarnings = hasMap ? [
    '',
    '**If you are using a map:**',
    `• **Channel Access** - Player will lose access to Safari channels`,
    `• **Map Location** - Player will be removed from the map`,
    `• **Explored Areas** - All explored coordinates will be forgotten`,
    `• **Movement History** - All movement logs will be deleted`
  ] : [];

  const warningContent = [
    `⚠️ **WARNING: De-initialize Safari Player**`,
    '',
    `This will **PERMANENTLY DELETE** all Safari data for <@${userId}>`,
    '',
    '**Standard Data to be Removed:**',
    ...baseWarnings,
    ...mapWarnings,
    '',
    '⚠️ **This action CANNOT be undone!**',
    '',
    '💡 **Note:** Only use this if the player has been permanently eliminated from the game.',
    `If you need to temporarily suspend a player (e.g., for a season break), use the **Pause Player** feature instead.`
  ].join('\n');

  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0xed4245, // Red for danger
      components: [
        {
          type: 10, // Text Display
          content: warningContent
        },
        {
          type: 14 // Separator
        },
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 4, // Danger
              label: 'Yes, De-initialize',
              custom_id: `safari_deinit_confirm_${userId}`,
              emoji: { name: '⚠️' }
            },
            {
              type: 2, // Button
              style: 2, // Secondary
              label: 'Cancel',
              custom_id: `safari_map_admin_player_${userId}`,
              emoji: { name: '❌' }
            }
          ]
        }
      ]
    }]
  };
}

/**
 * Create success message after de-initialization
 */
export function createDeinitSuccessUI(userId, playerName, backupData) {
  const itemCount = backupData?.inventory ? Object.keys(backupData.inventory).length : 0;
  const currency = backupData?.currency || 0;
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0x57f287, // Green for success
      components: [
        {
          type: 10, // Text Display
          content: [
            `✅ **Safari De-initialization Complete**`,
            '',
            `Successfully removed all Safari data for <@${userId}>`,
            '',
            '**Data Removed:**',
            `• ${currency} currency units`,
            `• ${itemCount} inventory items`,
            `• All map progress and locations`,
            `• All Safari history and interactions`,
            '',
            `Player can be re-initialized later if they return to the game.`
          ].join('\n')
        },
        {
          type: 14 // Separator
        },
        {
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'safari_map_admin',
            label: '← Back to Player Admin',
            style: 2, // Secondary
            emoji: { name: '🧭' }
          }]
        }
      ]
    }]
  };
}

/**
 * Remove channel permissions for a player
 * Helper function for map cleanup
 */
async function removeChannelPermissions(guildId, userId, coordinate, client) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const safariData = await loadSafariContent();
    const activeMap = safariData[guildId]?.maps?.active;
    
    if (!activeMap) return;
    
    const mapData = safariData[guildId].maps[activeMap];
    const member = await guild.members.fetch(userId);
    
    if (coordinate && mapData.coordinates[coordinate]?.channelId) {
      const channel = await guild.channels.fetch(mapData.coordinates[coordinate].channelId);
      if (channel) {
        logger.info('DEINIT', `Attempting to remove permissions for ${member.displayName} from channel ${channel.name}`, {
          guildId,
          userId,
          coordinate,
          channelId: channel.id
        });
        
        // Explicitly deny permissions to prevent access through role/everyone permissions
        await channel.permissionOverwrites.edit(userId, {
          [PermissionFlagsBits.ViewChannel]: false,
          [PermissionFlagsBits.SendMessages]: false,
          [PermissionFlagsBits.ReadMessageHistory]: false
        });
        
        logger.info('DEINIT', `Successfully removed channel permissions for ${member.displayName} from ${coordinate}`, {
          guildId,
          userId,
          coordinate,
          channelName: channel.name
        });
      } else {
        logger.warn('DEINIT', `Channel not found for coordinate ${coordinate}`, {
          guildId,
          userId,
          coordinate
        });
      }
    } else {
      logger.warn('DEINIT', `No channel ID found for coordinate ${coordinate}`, {
        guildId,
        userId,
        coordinate,
        hasCoordinate: !!coordinate,
        hasChannelId: !!mapData.coordinates[coordinate]?.channelId
      });
    }
  } catch (error) {
    logger.error('DEINIT', 'Error removing channel permissions', {
      guildId,
      userId,
      coordinate,
      error: error.message
    });
  }
}

/**
 * Core de-initialization function
 * Removes all Safari data for a player
 */
export async function deinitializePlayer(guildId, userId, client = null) {
  try {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    
    // Check if player exists and has Safari data
    if (!playerData[guildId]?.players?.[userId]?.safari) {
      return {
        success: false,
        message: 'Player has no Safari data to remove'
      };
    }
    
    // Create backup of Safari data
    const backupData = { ...playerData[guildId].players[userId].safari };
    
    // Handle map-specific cleanup if a map is active
    const activeMapId = safariData[guildId]?.maps?.active;
    if (activeMapId && client) {
      const playerMapData = playerData[guildId].players[userId].safari?.mapProgress?.[activeMapId];
      
      if (playerMapData?.currentLocation) {
        logger.info('DEINIT', `Player has map data, removing from coordinate ${playerMapData.currentLocation}`, {
          guildId,
          userId,
          coordinate: playerMapData.currentLocation
        });
        
        // Remove channel permissions
        await removeChannelPermissions(guildId, userId, playerMapData.currentLocation, client);
        
        // Location will be cleared when safari data is deleted
      } else {
        logger.info('DEINIT', 'Player has no current coordinate on map', {
          guildId,
          userId,
          hasMapProgress: !!playerMapData
        });
      }
    }
    
    // Remove Safari data from player
    delete playerData[guildId].players[userId].safari;
    
    // Save updated data
    await savePlayerData(playerData);
    
    // Log the de-initialization
    logger.info('DEINIT', 'Player de-initialized from Safari', {
      guildId,
      userId,
      hadMap: !!activeMapId,
      backupCurrency: backupData.currency || 0,
      backupItems: backupData.inventory ? Object.keys(backupData.inventory).length : 0
    });
    
    return {
      success: true,
      backup: backupData,
      hadMap: !!activeMapId
    };
    
  } catch (error) {
    logger.error('DEINIT', 'De-initialization failed', {
      guildId,
      userId,
      error: error.message
    });
    
    return {
      success: false,
      message: `De-initialization failed: ${error.message}`
    };
  }
}

/**
 * Bulk de-initialization function (for future use)
 * De-initializes multiple players at once
 */
export async function bulkDeinitializePlayers(guildId, userIds, client = null) {
  const results = {
    success: [],
    failed: [],
    backups: {}
  };
  
  for (const userId of userIds) {
    const result = await deinitializePlayer(guildId, userId, client);
    
    if (result.success) {
      results.success.push(userId);
      results.backups[userId] = result.backup;
    } else {
      results.failed.push({ userId, reason: result.message });
    }
  }
  
  logger.info('DEINIT', 'Bulk de-initialization completed', {
    guildId,
    totalProcessed: userIds.length,
    successful: results.success.length,
    failed: results.failed.length
  });
  
  return results;
}

/**
 * Check if a player can be de-initialized
 * Returns info about what will be deleted
 */
export async function getDeinitializationInfo(guildId, userId) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  
  const player = playerData[guildId]?.players?.[userId];
  if (!player?.safari) {
    return {
      canDeinit: false,
      reason: 'Player not initialized in Safari'
    };
  }
  
  const safari = player.safari;
  const activeMapId = safariData[guildId]?.maps?.active;
  const playerMapData = activeMapId ? safari.mapProgress?.[activeMapId] : null;
  
  return {
    canDeinit: true,
    data: {
      currency: safari.currency || 0,
      itemCount: safari.inventory ? Object.keys(safari.inventory).length : 0,
      hasMapProgress: !!playerMapData,
      currentLocation: playerMapData?.currentLocation || null,
      exploredCount: playerMapData?.exploredCoordinates?.length || 0,
      historyCount: safari.history?.length || 0
    }
  };
}