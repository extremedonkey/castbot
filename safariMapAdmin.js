/**
 * Safari Player Admin Panel
 * Admin interface for managing player map states using Entity Edit Framework
 */

import { 
  InteractionResponseType, 
  InteractionResponseFlags 
} from 'discord-interactions';
import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { setEntityPoints } from './pointsManager.js';
import { loadPlayerData, savePlayerData } from './storage.js';
import { getCustomTerms } from './safariManager.js';
import { logger } from './logger.js';

/**
 * Create the main Safari Map Admin interface
 * @param {Object} params - Parameters for the interface
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.userId - Selected user ID (if any)
 * @param {string} params.mode - Interface mode (user_select, player_view, etc.)
 * @returns {Object} Discord Components V2 interface
 */
export async function createMapAdminUI(params) {
  const { guildId, userId, mode = 'user_select' } = params;
  
  logger.debug('MAP_ADMIN', 'Creating UI', { guildId, userId, mode });
  
  switch (mode) {
    case 'user_select':
      return createUserSelectUI(guildId);
    case 'player_view':
      return createPlayerViewUI(guildId, userId);
    case 'edit_location':
      return createLocationEditUI(guildId, userId);
    case 'edit_stamina':
      return createStaminaEditUI(guildId, userId);
    default:
      return createUserSelectUI(guildId);
  }
}

/**
 * Create user selection interface
 */
function createUserSelectUI(guildId) {
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0x5865f2, // Discord blurple
      components: [
        {
          type: 10, // Text Display
          content: `## 🧭 Player Admin\n\n` +
                  `Select a player to manage their details such as Gold, Items, Map Location and more!`
        },
        {
          type: 1, // Action Row
          components: [{
            type: 5, // User Select
            custom_id: 'map_admin_user_select',
            placeholder: 'Select a player...',
            min_values: 1,
            max_values: 1
          }]
        },
        { type: 14 }, // Separator
        {
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: 'prod_menu_back',
            label: '← Menu',
            style: 2
          }]
        }
      ]
    }]
  };
}

/**
 * Create player view/edit interface
 */
async function createPlayerViewUI(guildId, userId) {
  // Load player data
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const customTerms = await getCustomTerms(guildId);
  
  // Get player's current state
  const player = playerData[guildId]?.players?.[userId] || {};
  const safari = player.safari || {};
  const mapProgress = safari.mapProgress || {};
  
  // Get active map data
  const activeMapId = safariData[guildId]?.maps?.active;
  const activeMap = activeMapId ? safariData[guildId]?.maps?.[activeMapId] : null;
  const playerMapData = activeMapId ? mapProgress[activeMapId] : null;
  
  // Get current location and stamina
  const currentLocation = playerMapData?.currentLocation || 'Not on map';
  const stamina = safari.points?.stamina || { current: 0, maximum: 0 };
  const exploredCount = playerMapData?.exploredCoordinates?.length || 0;
  const lastMove = playerMapData?.movementHistory?.slice(-1)[0];
  
  // Build status display
  let statusText = `## 🧭 Player Admin\n\n`;
  
  // Show player info
  statusText += `**Player:** <@${userId}>\n\n`;
  
  // Show Safari status if initialized
  if (safari && Object.keys(safari).length > 0) {
    statusText += `💰 **${customTerms.currencyName}:** ${safari.currency || 0} ${customTerms.currencyEmoji}\n`;
    statusText += `📦 **Items in ${customTerms.inventoryName}:** ${Object.keys(safari.inventory || {}).length}\n`;
    
    // Show map-specific info if available
    if (activeMap && playerMapData) {
      statusText += `\n📍 **Current Location:** ${currentLocation}\n`;
      statusText += `⚡ **Stamina:** ${stamina.current}/${stamina.maximum}\n`;
      statusText += `🗺️ **Explored Cells:** ${exploredCount}\n`;
      
      if (lastMove) {
        const moveTime = new Date(lastMove.timestamp).toLocaleString();
        statusText += `🕒 **Last Move:** ${lastMove.from} → ${lastMove.to} (${moveTime})\n`;
      }
    } else if (activeMap) {
      statusText += `\n⚠️ **Not placed on map yet**\n`;
    }
  } else {
    statusText += `⚠️ **Player not initialized in Safari system**\n`;
  }
  
  // Build management buttons
  const buttons = [];
  
  // Row 1: Map management (only show if map exists and player is initialized)
  const mapButtons = [];
  const isInitialized = player.safari !== undefined;
  
  if (!isInitialized) {
    mapButtons.push({
      type: 2, // Button
      custom_id: `safari_init_player_${userId}`,
      label: 'Initialize Safari',
      style: 3, // Success
      emoji: { name: '🚀' }
    });
  } else if (activeMap) {
    // Add De-initialize button first (to the left)
    mapButtons.push({
      type: 2, // Button
      custom_id: `safari_deinit_player_${userId}`,
      label: 'De-initialize',
      style: 4, // Danger
      emoji: { name: '🛬' }
    });
    
    // Add Pause/Unpause button if player is on the map
    if (playerMapData) {
      const isPaused = player.safari?.isPaused === true;
      mapButtons.push({
        type: 2, // Button
        custom_id: isPaused ? `safari_unpause_player_${userId}` : `safari_pause_player_${userId}`,
        label: isPaused ? 'Unpause Player' : 'Pause Player',
        style: 2, // Secondary/Grey
        emoji: { name: isPaused ? '⏯️' : '⏸️' }
      });
    }
    
    // Show place/move button based on whether player is on the map
    mapButtons.push({
      type: 2, // Button
      custom_id: `map_admin_move_player_${userId}`,
      label: playerMapData ? 'Move Player' : 'Place on Map',
      style: 1, // Primary
      emoji: { name: '📍' }
    });
    
    // Only show these buttons if player is already on the map
    if (playerMapData) {
      mapButtons.push({
        type: 2, // Button
        custom_id: `map_admin_grant_stamina_${userId}`,
        label: 'Set Stamina',
        style: 3, // Success
        emoji: { name: '⚡' }
      });
      
      mapButtons.push({
        type: 2, // Button
        custom_id: `map_admin_reset_explored_${userId}`,
        label: 'Reset Explored',
        style: 4, // Danger
        emoji: { name: '🔄' }
      });
    }
  } else if (isInitialized) {
    // Player is initialized but no map exists - still show de-initialize button
    mapButtons.push({
      type: 2, // Button
      custom_id: `safari_deinit_player_${userId}`,
      label: 'De-initialize Safari',
      style: 4, // Danger
      emoji: { name: '🛬' }
    });
  }
  
  if (mapButtons.length > 0) {
    buttons.push({
      type: 1, // Action Row
      components: mapButtons
    });
  }
  
  // Row 2: Safari management
  buttons.push({
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button
        custom_id: `map_admin_edit_currency_${userId}`,
        label: `Edit ${customTerms.currencyName}`,
        style: 2, // Secondary
        emoji: { name: customTerms.currencyEmoji || '💰' },
        disabled: !isInitialized // Disable if player not initialized in Safari
      },
      {
        type: 2, // Button
        custom_id: `map_admin_view_inventory_${userId}`,
        label: 'View Items',
        style: 2, // Secondary
        emoji: { name: customTerms.inventoryEmoji || '🧰' },
        disabled: !isInitialized // Disable if player not initialized in Safari
      },
      {
        type: 2, // Button
        custom_id: `map_admin_edit_items_${userId}`,
        label: 'Edit Items',
        style: 2, // Secondary
        emoji: { name: '📦' },
        disabled: !isInitialized // Active but shows coming soon message
      },
      {
        type: 2, // Button
        custom_id: `map_admin_view_raw_${userId}`,
        label: 'View Raw Data',
        style: 2, // Secondary
        emoji: { name: '📄' }
      }
    ]
  });
  
  // Row 3: Navigation - Select Different Player
  buttons.push({
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button
        custom_id: 'map_admin_select_new',
        label: 'Change Player',
        style: 2, // Secondary
        emoji: { name: '👤' }
      }
    ]
  });
  
  // Add separator before Map Explorer button
  buttons.push({ type: 14 }); // Separator
  
  // Row 4: Back to Safari (separate row)
  buttons.push({
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button
        custom_id: 'prod_menu_back',
        label: '← Menu',
        style: 2 // Secondary
      }
    ]
  });
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0x5865f2,
      components: [
        {
          type: 10, // Text Display
          content: statusText
        },
        { type: 14 }, // Separator
        ...buttons
      ]
    }]
  };
}

/**
 * Initialize player on map
 */
export async function initializePlayerOnMap(guildId, userId, coordinate = null, client = null) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();

  // Get stamina & location config (per-server with .env fallback)
  const { getStaminaConfig, initializePlayerSafari, grantDefaultItems } = await import('./safariManager.js');
  const staminaConfig = await getStaminaConfig(guildId);

  // Use configured starting coordinate if not explicitly provided
  if (!coordinate) {
    coordinate = staminaConfig.defaultStartingCoordinate;
    console.log(`🗺️ Using configured starting coordinate: ${coordinate}`);
  }

  // Get default starting currency from config
  const defaultCurrency = safariData[guildId]?.safariConfig?.defaultStartingCurrencyValue || 100;

  // Use universal safari initialization to ensure ALL required fields exist
  initializePlayerSafari(playerData, guildId, userId, defaultCurrency);

  // Grant default items to the player
  await grantDefaultItems(playerData, guildId, userId);

  const player = playerData[guildId].players[userId];
  // Ensure map-specific structures exist
  if (!player.safari.mapProgress) player.safari.mapProgress = {};
  if (!player.safari.points) player.safari.points = {};

  // Initialize stamina with per-server config values
  player.safari.points.stamina = {
    current: staminaConfig.startingStamina,
    maximum: staminaConfig.maxStamina,
    lastRegeneration: new Date().toISOString(),
    regenConfig: 'hourly' // Regenerate 1 stamina per hour
  };

  console.log(`⚡ Initialized player stamina: ${staminaConfig.startingStamina}/${staminaConfig.maxStamina} (regen: ${staminaConfig.regenerationMinutes}min)`);

  // Get active map (optional - no longer required)
  const activeMapId = safariData[guildId]?.maps?.active;

  // Only initialize map progress if a map exists
  if (activeMapId) {
    // Initialize map progress
    player.safari.mapProgress[activeMapId] = {
      currentLocation: coordinate,
      exploredCoordinates: [coordinate],
      itemsFound: [],
      movementHistory: [{
        from: null,
        to: coordinate,
        timestamp: new Date().toISOString()
      }]
    };
  }
  
  await savePlayerData(playerData);
  
  // If client is provided AND map exists, initialize movement system
  if (client && activeMapId) {
    const { initializePlayerOnMap: initMovementSystem, getMovementDisplay } = await import('./mapMovement.js');
    const { DiscordRequest } = await import('./utils.js');
    
    await initMovementSystem(guildId, userId, coordinate, client);
    
    // Post movement interface in the channel
    try {
      const mapData = safariData[guildId].maps[activeMapId];
      const channelId = mapData.coordinates[coordinate]?.channelId;
      
      if (channelId) {
        // Get movement display for channel message (not interaction response)
        const movementDisplay = await getMovementDisplay(guildId, userId, coordinate, false);
        
        // Create welcome message with Navigate button
        const welcomeMessage = {
          flags: (1 << 15), // IS_COMPONENTS_V2
          components: [{
            type: 17, // Container
            accent_color: 0x5865f2, // Discord blurple
            components: [
              {
                type: 10, // Text Display
                content: `🎉 **Welcome to the Safari Map!**\n\n<@${userId}> has been initialized at coordinate **${coordinate}**.\n\nYou have been granted **${player.safari.points.stamina.current} stamina** to start exploring!`
              },
              {
                type: 1, // Action Row
                components: [{
                  type: 2, // Button
                  custom_id: `safari_navigate_${userId}_${coordinate}`,
                  label: 'Navigate',
                  style: 1, // Primary
                  emoji: { name: '🗺️' }
                }]
              }
            ]
          }]
        };
        
        // Send the welcome message with movement options to the channel
        await DiscordRequest(`channels/${channelId}/messages`, {
          method: 'POST',
          body: welcomeMessage
        });
        
        logger.info('MAP_ADMIN', 'Posted movement interface for initialized player', {
          guildId,
          userId,
          coordinate,
          channelId
        });
      }
    } catch (error) {
      console.error('Error posting movement interface:', error);
      // Don't throw - initialization should still succeed even if posting fails
    }
  }
  
  logger.info('MAP_ADMIN', 'Player initialized on map', { 
    guildId, 
    userId, 
    coordinate,
    mapId: activeMapId 
  });
  
  return player.safari.mapProgress[activeMapId];
}

/**
 * Move player to specific coordinate
 */
export async function movePlayerToCoordinate(guildId, userId, coordinate, client = null) {
  // Check if player is already on the map
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  
  if (!activeMapId) {
    throw new Error('❌ No active map in this server');
  }
  
  const player = playerData[guildId]?.players?.[userId];
  const playerMapData = player?.safari?.mapProgress?.[activeMapId];
  
  let result;
  
  // If player not on map yet, initialize them first
  if (!playerMapData) {
    logger.info('MAP_ADMIN', 'Placing player on map for first time', { guildId, userId, coordinate });
    await initializePlayerOnMap(guildId, userId, coordinate);
    
    // For initial placement, we're done - no need to call movePlayer
    result = { success: true, message: 'Player placed on map successfully' };
  } else {
    // Player already on map, use normal movement system
    const { movePlayer } = await import('./mapMovement.js');
    
    result = await movePlayer(guildId, userId, coordinate, client, {
      bypassStamina: true,
      adminMove: true
    });
    
    if (!result.success) {
      throw new Error(result.message);
    }
  }
  
  // Send notification to player in their new channel
  if (client) {
    try {
      const mapData = safariData[guildId].maps[activeMapId];
      const newChannelId = mapData.coordinates[coordinate]?.channelId;
      
      if (newChannelId) {        
        // Determine message based on whether this was initial placement or move
        const messageContent = !playerMapData 
          ? `🎉 **Welcome to the Map!**\n\n<@${userId}> You have been placed at coordinate **${coordinate}** by the Production team.`
          : `📍 **Admin Move**\n\n<@${userId}> You have been moved by the Production team to coordinate **${coordinate}**.`;
        
        // Create a notification with Navigate button
        const notificationMessage = {
          flags: (1 << 15), // IS_COMPONENTS_V2
          components: [{
            type: 17, // Container
            accent_color: 0x5865f2, // Discord blurple
            components: [
              {
                type: 10, // Text Display
                content: messageContent
              },
              {
                type: 1, // Action Row
                components: [{
                  type: 2, // Button
                  custom_id: `safari_navigate_${userId}_${coordinate}`,
                  label: 'Navigate',
                  style: 1, // Primary
                  emoji: { name: '🗺️' }
                }]
              }
            ]
          }]
        };
        
        // Send the notification with movement options to the channel
        const { DiscordRequest } = await import('./utils.js');
        await DiscordRequest(`channels/${newChannelId}/messages`, {
          method: 'POST',
          body: notificationMessage
        });
      }
    } catch (error) {
      console.error('Error sending admin move notification:', error);
      // Don't throw - movement should still succeed even if notification fails
    }
  }
  
  logger.info('MAP_ADMIN', playerMapData ? 'Player moved by admin' : 'Player placed on map by admin', { 
    guildId, 
    userId, 
    from: playerMapData?.currentLocation || 'N/A',
    to: coordinate 
  });
  
  // Return updated map progress for UI
  const updatedPlayerData = await loadPlayerData();
  const updatedPlayer = updatedPlayerData[guildId]?.players?.[userId];
  return updatedPlayer?.safari?.mapProgress?.[activeMapId];
}

/**
 * Set stamina for player
 */
export async function setPlayerStamina(guildId, userId, amount) {
  // Use the new entity points system that the movement system uses
  const entityId = `player_${userId}`;
  
  // Special test mode: 99 sets stamina to a very high value for unlimited testing
  if (amount === 99) {
    await setEntityPoints(guildId, entityId, 'stamina', 999, 999);
  } else {
    // Set current stamina, keeping existing max
    await setEntityPoints(guildId, entityId, 'stamina', amount);
  }
  
  // Also update the old system for backwards compatibility
  const playerData = await loadPlayerData();
  const player = playerData[guildId]?.players?.[userId];
  let staminaResult = { current: amount, maximum: player?.safari?.points?.stamina?.maximum || 1 };
  
  if (player?.safari?.points?.stamina) {
    const stamina = player.safari.points.stamina;
    if (amount === 99) {
      stamina.current = 999;
      stamina.maximum = 999;
    } else {
      stamina.current = Math.max(0, Math.min(amount, stamina.maximum));
    }
    stamina.lastRegeneration = new Date().toISOString();
    staminaResult = stamina;
    await savePlayerData(playerData);
  }
  
  logger.info('MAP_ADMIN', 'Stamina set for player', { 
    guildId, 
    userId, 
    amount,
    newStamina: staminaResult.current 
  });
  
  return staminaResult;
}

/**
 * Reset player's explored coordinates
 */
export async function resetPlayerExploration(guildId, userId) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  
  const activeMapId = safariData[guildId]?.maps?.active;
  if (!activeMapId) {
    throw new Error('No active map in this server');
  }
  
  const player = playerData[guildId]?.players?.[userId];
  if (!player?.safari?.mapProgress?.[activeMapId]) {
    throw new Error('Player not initialized on map');
  }
  
  const mapProgress = player.safari.mapProgress[activeMapId];
  const currentLocation = mapProgress.currentLocation;
  
  // Reset to only current location
  mapProgress.exploredCoordinates = [currentLocation];
  mapProgress.itemsFound = [];
  
  await savePlayerData(playerData);
  
  logger.info('MAP_ADMIN', 'Player exploration reset', { 
    guildId, 
    userId,
    keptLocation: currentLocation 
  });
  
  return mapProgress;
}

/**
 * Create coordinate selection modal
 */
export async function createCoordinateModal(userId, currentLocation = '') {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId(`map_admin_coordinate_modal_${userId}`)
    .setTitle('Move Player to Coordinate');
  
  const coordinateInput = new TextInputBuilder()
    .setCustomId('coordinate')
    .setLabel('Grid Coordinate (e.g., B3, D5)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('A1')
    .setRequired(true)
    .setMaxLength(3);
  
  if (currentLocation) {
    coordinateInput.setValue(currentLocation);
  }
  
  modal.addComponents(
    new ActionRowBuilder().addComponents(coordinateInput)
  );
  
  return modal;
}

/**
 * Create stamina grant modal
 */
export async function createStaminaModal(userId) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId(`map_admin_stamina_modal_${userId}`)
    .setTitle('Set Player Stamina');
  
  const staminaInput = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('Stamina Amount (0-10, or 99 for test mode)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('5')
    .setRequired(true)
    .setMaxLength(2);
  
  modal.addComponents(
    new ActionRowBuilder().addComponents(staminaInput)
  );
  
  return modal;
}

/**
 * Create currency edit modal
 */
export async function createCurrencyModal(userId, currentAmount, currencyName) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId(`map_admin_currency_modal_${userId}`)
    .setTitle(`Set Player ${currencyName}`);
  
  const currencyInput = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel(`New ${currencyName} Amount`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('1000')
    .setValue(String(currentAmount))
    .setRequired(true)
    .setMaxLength(6);
  
  modal.addComponents(
    new ActionRowBuilder().addComponents(currencyInput)
  );
  
  return modal;
}

/**
 * Handle blacklisted coordinates management button
 * @param {Object} context - Interaction context
 * @returns {Object} Modal response for editing blacklisted coordinates
 */
export async function handleMapAdminBlacklist(context) {
  console.log(`🚫 START: map_admin_blacklist - user ${context.userId}`);
  
  // Load current blacklisted coordinates
  const { getBlacklistedCoordinates } = await import('./mapExplorer.js');
  const blacklistedCoords = await getBlacklistedCoordinates(context.guildId);
  
  return {
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: 'map_admin_blacklist_modal',
      title: 'Manage Blacklisted Coordinates',
      components: [
        {
          type: 18, // Label (modern modal component)
          label: 'Blacklisted Coordinates',
          description: "Players can't navigate to blacklisted coordinates - block sections until merge or unlock with items",
          component: {
            type: 4, // Text Input
            custom_id: 'blacklisted_coords',
            style: 2, // Paragraph
            placeholder: 'Enter comma-separated coordinates (e.g., A1, B3, C5)',
            value: blacklistedCoords.join(', '),
            required: false,
            min_length: 0,
            max_length: 1000
            // Note: 'label' field not allowed when inside Label component
          }
        }
      ]
    }
  };
}

/**
 * Handle blacklist modal submission
 * @param {Object} context - Interaction context
 * @param {Object} req - Request object containing modal data
 * @returns {Object} Response with update status
 */
export async function handleMapAdminBlacklistModal(context, req) {
  console.log(`🚫 START: map_admin_blacklist_modal - user ${context.userId}`);

  // Get the input value from Label component structure
  const blacklistedCoordsInput = req.body.data.components[0].component.value || '';
  
  // Parse coordinates - split by comma and clean up
  const coordinatesList = blacklistedCoordsInput
    .split(',')
    .map(coord => coord.trim().toUpperCase())
    .filter(coord => coord.match(/^[A-Z]\d+$/)); // Validate format (e.g., A1, B2)
  
  // Update blacklisted coordinates
  const { updateBlacklistedCoordinates } = await import('./mapExplorer.js');
  const result = await updateBlacklistedCoordinates(context.guildId, coordinatesList);
  
  console.log(`✅ SUCCESS: map_admin_blacklist_modal - updated ${coordinatesList.length} blacklisted coordinates`);
  
  return {
    content: result.message,
    ephemeral: true
  };
}

/**
 * Handle refresh anchors management button
 * @param {Object} context - Interaction context
 * @returns {Object} Modal response for refreshing anchor messages
 */
export async function handleMapAdminRefreshAnchors(context) {
  console.log(`🔄 START: map_admin_refresh_anchors - user ${context.userId}`);

  return {
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: 'map_admin_refresh_anchors_modal',
      title: 'Refresh Anchor Messages',
      components: [
        {
          type: 18, // Label (modern pattern)
          label: 'Coordinates to Refresh',
          description: "Enter coordinates separated by commas (e.g., G7, H8, A1) or type 'All' to update all anchors.",
          component: {
            type: 4, // Text Input
            custom_id: 'coordinates_to_refresh',
            style: 2, // Paragraph
            placeholder: 'Enter coordinates or type All',
            required: true,
            max_length: 500
          }
        }
      ]
    }
  };
}

/**
 * Handle refresh anchors modal submission
 * @param {Object} context - Interaction context
 * @param {Object} req - Request object containing modal data
 * @returns {Object} Response with refresh status
 */
export async function handleMapAdminRefreshAnchorsModal(context, req) {
  console.log(`🔄 START: map_admin_refresh_anchors_modal - user ${context.userId}`);

  // Get the input value
  const coordinatesInput = req.body.data.components[0].component.value || '';

  // Check for "All" keyword (case-insensitive)
  if (coordinatesInput.trim().toLowerCase() === 'all') {
    console.log(`🔄 User requested refresh of ALL anchors in guild ${context.guildId}`);

    // Use existing updateAllGuildAnchors function
    const { updateAllGuildAnchors } = await import('./anchorMessageManager.js');
    const results = await updateAllGuildAnchors(context.guildId);

    console.log(`✅ SUCCESS: map_admin_refresh_anchors_modal - refreshed ALL anchor messages: ${results.success} succeeded, ${results.failed} failed`);

    let responseContent = `## 🔄 Anchor Refresh Results (All Anchors)\n\n`;
    responseContent += `✅ **Successfully refreshed**: ${results.success}\n`;
    responseContent += `❌ **Failed to refresh**: ${results.failed}\n\n`;

    if (results.failed > 0 && results.errors.length > 0) {
      responseContent += `⚠️ **Failed coordinates**: ${results.errors.join(', ')}\n`;
      responseContent += `Check logs for detailed error information.`;
    } else if (results.success > 0) {
      responseContent += `🎉 **All anchor messages refreshed successfully!**`;
    }

    return {
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: [{
        type: 17, // Container
        accent_color: 0x2ecc71, // Green for success
        components: [{
          type: 10, // Text Display
          content: responseContent
        }]
      }],
      ephemeral: true
    };
  }

  // Otherwise, parse as comma-separated coordinates (existing logic)
  const coordinatesList = coordinatesInput
    .split(',')
    .map(coord => coord.trim().toUpperCase())
    .filter(coord => coord.match(/^[A-Z]\d+$/)); // Validate format (e.g., A1, B2)

  if (coordinatesList.length === 0) {
    return {
      content: '❌ **No valid coordinates found**\n\nPlease enter coordinates in format: A1, B2, C3, etc. or type "All" to refresh all anchors.',
      ephemeral: true
    };
  }

  // Refresh anchor messages using the anchor manager
  const { forceUpdateAnchors } = await import('./anchorMessageManager.js');
  const results = await forceUpdateAnchors(context.guildId, coordinatesList);

  console.log(`✅ SUCCESS: map_admin_refresh_anchors_modal - refreshed ${results.success}/${coordinatesList.length} anchor messages`);

  let responseContent = `## 🔄 Anchor Refresh Results\n\n`;
  responseContent += `✅ **Successfully refreshed**: ${results.success}\n`;
  responseContent += `❌ **Failed to refresh**: ${results.failed}\n`;
  responseContent += `📍 **Coordinates processed**: ${coordinatesList.join(', ')}\n\n`;

  if (results.failed > 0 && results.errors.length > 0) {
    responseContent += `⚠️ **Failed coordinates**: ${results.errors.join(', ')}\n`;
    responseContent += `Check logs for detailed error information.`;
  } else if (results.success > 0) {
    responseContent += `🎉 **All anchor messages refreshed successfully!**`;
  }

  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0x2ecc71, // Green for success
      components: [{
        type: 10, // Text Display
        content: responseContent
      }]
    }],
    ephemeral: true
  };
}