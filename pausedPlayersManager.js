/**
 * Paused Players Manager
 * Handles pausing/unpausing Safari players by managing their channel permissions
 * while maintaining their location, currency, and interaction state
 */

import { loadPlayerData, savePlayerData } from './storage.js';
import { loadSafariContent } from './safariManager.js';
import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

/**
 * Get all paused players for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Array} Array of user IDs that are paused
 */
export async function getPausedPlayers(guildId) {
  const playerData = await loadPlayerData();
  const players = playerData[guildId]?.players || {};
  
  const pausedPlayers = [];
  for (const [userId, player] of Object.entries(players)) {
    if (player.safari?.isPaused === true) {
      pausedPlayers.push(userId);
    }
  }
  
  return pausedPlayers;
}

/**
 * Get all players with Safari data (initialized on map)
 * @param {string} guildId - Discord guild ID
 * @returns {Array} Array of user IDs with safari data
 */
export async function getSafariPlayers(guildId) {
  const playerData = await loadPlayerData();
  const players = playerData[guildId]?.players || {};
  
  const safariPlayers = [];
  for (const [userId, player] of Object.entries(players)) {
    // Check if player has been initialized (has map progress)
    if (player.safari?.mapProgress) {
      safariPlayers.push(userId);
    }
  }
  
  return safariPlayers;
}

/**
 * Update paused status for multiple players
 * @param {string} guildId - Discord guild ID
 * @param {Array} selectedUserIds - Array of user IDs to pause
 * @param {Object} client - Discord client for permission management
 * @returns {Object} Result with counts and any errors
 */
export async function updatePausedPlayers(guildId, selectedUserIds, client) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  
  if (!activeMapId) {
    return {
      success: false,
      message: 'No active map found',
      paused: 0,
      unpaused: 0
    };
  }
  
  const mapData = safariData[guildId].maps[activeMapId];
  const guild = await client.guilds.fetch(guildId);
  
  // Get all Safari players
  const safariPlayers = await getSafariPlayers(guildId);
  const currentlyPaused = await getPausedPlayers(guildId);
  
  // Convert selectedUserIds to Set for efficient lookup
  const selectedSet = new Set(selectedUserIds);
  
  let pausedCount = 0;
  let unpausedCount = 0;
  const errors = [];
  
  // Process all Safari players
  const permissionPromises = [];
  
  for (const userId of safariPlayers) {
    const player = playerData[guildId].players[userId];
    if (!player?.safari) continue;
    
    const wasPaused = player.safari.isPaused === true;
    const shouldBePaused = selectedSet.has(userId);
    
    // Skip if no change needed
    if (wasPaused === shouldBePaused) continue;
    
    // Update pause status
    player.safari.isPaused = shouldBePaused;
    
    // Get player's current location
    const currentLocation = player.safari.mapProgress?.[activeMapId]?.currentLocation;
    
    if (currentLocation && mapData.coordinates[currentLocation]?.channelId) {
      const channelId = mapData.coordinates[currentLocation].channelId;
      
      // Create permission update promise
      const permissionPromise = (async () => {
        try {
          const member = await guild.members.fetch(userId);
          const channel = await guild.channels.fetch(channelId);
          
          if (channel) {
            if (shouldBePaused) {
              // Remove permissions (pause player)
              await channel.permissionOverwrites.edit(member, {
                [PermissionFlagsBits.ViewChannel]: false,
                [PermissionFlagsBits.SendMessages]: false
              });
              pausedCount++;
              logger.info('PAUSE_PLAYER', `Paused ${member.displayName} at ${currentLocation}`);
            } else {
              // Grant permissions (unpause player)
              await channel.permissionOverwrites.edit(member, {
                [PermissionFlagsBits.ViewChannel]: true,
                [PermissionFlagsBits.SendMessages]: true
              });
              unpausedCount++;
              logger.info('UNPAUSE_PLAYER', `Unpaused ${member.displayName} at ${currentLocation}`);
            }
          }
        } catch (error) {
          console.error(`Error updating permissions for user ${userId}:`, error);
          errors.push(`Failed to update ${userId}: ${error.message}`);
        }
      })();
      
      permissionPromises.push(permissionPromise);
    }
  }
  
  // Execute all permission updates in parallel
  await Promise.all(permissionPromises);
  
  // Save updated player data
  await savePlayerData(playerData);
  
  // Log to Safari Log
  try {
    const { logAdminAction } = await import('./safariLogger.js');
    await logAdminAction({
      guildId,
      action: 'PAUSE_PLAYERS',
      details: `Paused: ${pausedCount}, Unpaused: ${unpausedCount}`,
      adminId: 'System'
    });
  } catch (error) {
    console.error('Error logging pause action:', error);
  }
  
  return {
    success: true,
    message: `Successfully updated player pause states`,
    paused: pausedCount,
    unpaused: unpausedCount,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Create the Paused Players management interface
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Discord Components V2 interface
 */
export async function createPausedPlayersUI(guildId) {
  const pausedPlayers = await getPausedPlayers(guildId);
  const safariPlayers = await getSafariPlayers(guildId);
  
  // Build the Components V2 interface
  const components = [
    {
      type: 17, // Container
      accent_color: 0x95a5a6, // Grey accent for pause theme
      components: [
        {
          type: 10, // Text Display
          content: `# ⏸️ Paused Players\n\nSelecting players in the list below will temporarily remove them from their current safari channel. They will maintain their location, currency and any interactions they have previously completed. Use this to suspend individual players from the game, such as players that have been voted out. You can also use this to suspend Safari Activity when you wish, e.g. following swaps or similar.\n\n**Paused Players:** ${pausedPlayers.length} of ${safariPlayers.length}`
        }
      ]
    }
  ];
  
  // Add user select if there are Safari players
  if (safariPlayers.length > 0) {
    components[0].components.push(
      { type: 14 }, // Separator
      {
        type: 1, // Action Row
        components: [{
          type: 5, // User Select
          custom_id: 'safari_pause_players_select',
          placeholder: 'Select players to pause/unpause',
          min_values: 0,
          max_values: Math.min(25, safariPlayers.length), // Discord limit is 25
          default_values: pausedPlayers.map(userId => ({
            id: userId,
            type: 'user'
          }))
        }]
      }
    );
  } else {
    components[0].components.push(
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: '⚠️ No players have been initialized on the Safari map yet.'
      }
    );
  }
  
  // Add back button
  components[0].components.push(
    { type: 14 }, // Separator
    {
      type: 1, // Action Row
      components: [{
        type: 2, // Button
        custom_id: 'safari_map_explorer',
        label: 'Back',
        style: 2, // Secondary
        emoji: { name: '⬅️' }
      }]
    }
  );
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components,
    ephemeral: true
  };
}