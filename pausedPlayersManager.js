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
  
  // Log the pause action
  if (pausedCount > 0 || unpausedCount > 0) {
    console.log(`⏸️ PAUSE_PLAYERS: Paused ${pausedCount}, Unpaused ${unpausedCount} players in guild ${guildId}`);
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
 * @param {Object} client - Discord client for fetching member data
 * @returns {Object} Discord Components V2 interface
 */
export async function createPausedPlayersUI(guildId, client = null) {
  const pausedPlayers = await getPausedPlayers(guildId);
  const safariPlayers = await getSafariPlayers(guildId);
  const playerData = await loadPlayerData();
  
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
  
  // Add string select with only Safari players if there are any
  if (safariPlayers.length > 0) {
    // Build options for only initialized players
    const selectOptions = [];
    
    for (const userId of safariPlayers) {
      const player = playerData[guildId]?.players?.[userId];
      let displayName = player?.displayName || player?.username || 'Unknown Player';
      
      // Try to get fresh Discord data if client available
      if (client) {
        try {
          const guild = await client.guilds.fetch(guildId);
          const member = await guild.members.fetch(userId);
          displayName = member.displayName || member.user.username;
        } catch (e) {
          // Use cached name if Discord fetch fails
        }
      }
      
      const isPaused = pausedPlayers.includes(userId);
      selectOptions.push({
        label: displayName,
        value: userId,
        description: isPaused ? '⏸️ Currently paused' : '▶️ Currently active',
        emoji: { name: isPaused ? '⏸️' : '▶️' },
        default: isPaused // Pre-select if currently paused (like store multiselect)
      });
    }
    
    components[0].components.push(
      { type: 14 }, // Separator
      {
        type: 1, // Action Row
        components: [{
          type: 3, // String Select (instead of User Select)
          custom_id: 'safari_pause_players_select',
          placeholder: 'Select players to pause/unpause',
          min_values: 0,
          max_values: Math.min(25, safariPlayers.length), // Discord limit is 25
          options: selectOptions
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

/**
 * Pause a single player - removes map channel permissions
 * Extracted logic from bulk pause function for individual use
 */
export async function pauseSinglePlayer(guildId, userId, client) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  
  if (!activeMapId) {
    return {
      success: false,
      message: 'No active map found'
    };
  }
  
  const player = playerData[guildId]?.players?.[userId];
  if (!player?.safari) {
    return {
      success: false,
      message: 'Player not initialized in Safari'
    };
  }
  
  // Already paused
  if (player.safari.isPaused === true) {
    return {
      success: false,
      message: 'Player is already paused'
    };
  }
  
  const mapData = safariData[guildId].maps[activeMapId];
  const currentLocation = player.safari.mapProgress?.[activeMapId]?.currentLocation;
  
  // Update pause status
  player.safari.isPaused = true;
  
  // Remove channel permissions if player is at a location
  if (currentLocation && mapData.coordinates[currentLocation]?.channelId) {
    const channelId = mapData.coordinates[currentLocation].channelId;
    
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      const channel = await guild.channels.fetch(channelId);
      
      if (channel) {
        await channel.permissionOverwrites.edit(member, {
          [PermissionFlagsBits.ViewChannel]: false,
          [PermissionFlagsBits.SendMessages]: false
        });
        
        logger.info('PAUSE_PLAYER', `Paused ${member.displayName} at ${currentLocation}`, {
          guildId,
          userId,
          location: currentLocation
        });
      }
    } catch (error) {
      logger.error('PAUSE_PLAYER', 'Error removing permissions', {
        guildId,
        userId,
        error: error.message
      });
      // Still save the paused state even if permissions fail
    }
  }
  
  // Save updated player data
  await savePlayerData(playerData);
  
  return {
    success: true,
    location: currentLocation || 'Unknown'
  };
}

/**
 * Unpause a single player - restores map channel permissions
 * Extracted logic from bulk unpause function for individual use
 */
export async function unpauseSinglePlayer(guildId, userId, client) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  
  if (!activeMapId) {
    return {
      success: false,
      message: 'No active map found'
    };
  }
  
  const player = playerData[guildId]?.players?.[userId];
  if (!player?.safari) {
    return {
      success: false,
      message: 'Player not initialized in Safari'
    };
  }
  
  // Not paused
  if (player.safari.isPaused !== true) {
    return {
      success: false,
      message: 'Player is not paused'
    };
  }
  
  const mapData = safariData[guildId].maps[activeMapId];
  const currentLocation = player.safari.mapProgress?.[activeMapId]?.currentLocation;
  
  // Update pause status
  player.safari.isPaused = false;
  
  // Restore channel permissions if player is at a location
  if (currentLocation && mapData.coordinates[currentLocation]?.channelId) {
    const channelId = mapData.coordinates[currentLocation].channelId;
    
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      const channel = await guild.channels.fetch(channelId);
      
      if (channel) {
        await channel.permissionOverwrites.edit(member, {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.SendMessages]: true
        });
        
        logger.info('UNPAUSE_PLAYER', `Unpaused ${member.displayName} at ${currentLocation}`, {
          guildId,
          userId,
          location: currentLocation
        });
      }
    } catch (error) {
      logger.error('UNPAUSE_PLAYER', 'Error restoring permissions', {
        guildId,
        userId,
        error: error.message
      });
      // Still save the unpaused state even if permissions fail
    }
  }
  
  // Save updated player data
  await savePlayerData(playerData);
  
  return {
    success: true,
    location: currentLocation || 'Unknown'
  };
}