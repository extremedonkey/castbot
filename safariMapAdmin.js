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
import { isPlayerInitialized } from './safariPlayerUtils.js';

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

  // Get current location and stamina (use getEntityPoints for authoritative values)
  const currentLocation = playerMapData?.currentLocation || 'Not on map';
  let stamina = { current: 0, maximum: 0 };
  let regenTime = 'MAX';
  try {
    const { getEntityPoints, getTimeUntilRegeneration } = await import('./pointsManager.js');
    const entityStamina = await getEntityPoints(guildId, `player_${userId}`, 'stamina');
    if (entityStamina) stamina = { current: entityStamina.current, maximum: entityStamina.max };
    regenTime = await getTimeUntilRegeneration(guildId, `player_${userId}`, 'stamina');
  } catch {
    stamina = safari.points?.stamina || { current: 0, maximum: 0 };
  }
  const exploredCount = playerMapData?.exploredCoordinates?.length || 0;
  const lastMove = playerMapData?.movementHistory?.slice(-1)[0];

  // Get starting location info
  const { getStaminaConfig } = await import('./safariManager.js');
  const staminaConfig = await getStaminaConfig(guildId);
  const serverDefault = staminaConfig.defaultStartingCoordinate || 'A1';
  const playerStartingLocation = playerMapData?.startingLocation;

  // Determine starting location display
  let startingLocationDisplay;
  if (playerStartingLocation) {
    startingLocationDisplay = `${playerStartingLocation} (Player-specific starting location)`;
  } else if (serverDefault !== 'A1') {
    startingLocationDisplay = `${serverDefault} (Default server starting location)`;
  } else {
    startingLocationDisplay = `A1 (No default starting location set)`;
  }

  // Build status display
  let statusText = `## 🧭 Player Admin\n\n`;

  // Show player info
  statusText += `**Player:** <@${userId}>\n`;

  // Show Safari-specific info
  // A player is "initialized" when they have safari.points (set only by initializePlayerOnMap)
  // Currency and inventory can exist pre-initialization via Edit Gil / Edit Items
  const isInitialized = safari && safari.points !== undefined;

  if (isInitialized) {
    // Show current values for initialized players
    statusText += `💰 **${customTerms.currencyName}:** ${safari.currency || 0} ${customTerms.currencyEmoji}\n`;
    statusText += `📦 **Items in ${customTerms.inventoryName}:** ${Object.keys(safari.inventory || {}).length}\n`;
    statusText += `🚩 **Starting Location:** ${startingLocationDisplay}\n`;

    // Show map-specific info if available
    if (activeMap && playerMapData) {
      statusText += `\n📍 **Current Location:** ${currentLocation}\n`;
      const regenDisplay = (regenTime === 'Full' || regenTime === 'Ready!') ? 'MAX' : regenTime;
      statusText += `⚡ **Stamina:** ${stamina.current}/${stamina.maximum} (♻️ ${regenDisplay})\n`;
      statusText += `🗺️ **Explored Cells:** ${exploredCount}\n`;

      if (lastMove) {
        const moveTime = new Date(lastMove.timestamp).toLocaleString();
        statusText += `🕒 **Last Move:** ${lastMove.from} → ${lastMove.to} (${moveTime})\n`;
      }
    } else if (activeMap) {
      statusText += `\n⚠️ **Not placed on map yet**\n`;
    }
  } else {
    // Show current + starting values for uninitialized players
    const items = safariData[guildId]?.items || {};
    const defaultItemCount = Object.values(items).filter(i => i?.metadata?.defaultItem === 'Yes').length;

    statusText += `💰 **Current ${customTerms.currencyName}:** ${safari.currency || 0} ${customTerms.currencyEmoji}\n`;
    statusText += `💰 **Starting ${customTerms.currencyName}:** +${customTerms.defaultStartingCurrencyValue} ${customTerms.currencyEmoji}\n`;
    statusText += `📦 **Items in ${customTerms.inventoryName}:** ${Object.keys(safari.inventory || {}).length}\n`;
    statusText += `📦 **Starting Items:** ${defaultItemCount}\n`;
    statusText += `🚩 **Starting Location:** ${startingLocationDisplay}\n`;
    statusText += `\n> ⚠️ **Player not initialized in Safari system**\n`;
  }
  
  // Build management buttons
  const buttons = [];

  // Row 1: Init/De-init + Starting Info + Location (init only) + Pause + Stamina
  const mapButtons = [];

  if (!isInitialized) {
    mapButtons.push({
      type: 2, // Button
      custom_id: `safari_init_player_${userId}`,
      label: 'Initialize Safari',
      style: 3, // Success
      emoji: { name: '🚀' }
    });
  } else if (activeMap) {
    mapButtons.push({
      type: 2, // Button
      custom_id: `safari_deinit_player_${userId}`,
      label: 'De-initialize',
      style: 4, // Danger
      emoji: { name: '🛬' }
    });
  } else if (isInitialized) {
    mapButtons.push({
      type: 2, // Button
      custom_id: `safari_deinit_player_${userId}`,
      label: 'De-initialize Safari',
      style: 4, // Danger
      emoji: { name: '🛬' }
    });
  }

  // Starting Info — always visible (both initialized and uninitialized)
  mapButtons.push({
    type: 2, // Button
    custom_id: `safari_starting_info_${userId}`,
    label: 'Starting Info',
    style: 2, // Secondary
    emoji: { name: '🚩' }
  });

  // Location — only for initialized players
  if (isInitialized && activeMap) {
    mapButtons.push({
      type: 2, // Button
      custom_id: `map_admin_move_player_${userId}`,
      label: playerMapData ? 'Location' : 'Place on Map',
      style: 2, // Secondary
      emoji: { name: '📍' }
    });

    if (playerMapData) {
      const isPaused = player.safari?.isPaused === true;
      mapButtons.push({
        type: 2, // Button
        custom_id: isPaused ? `safari_unpause_player_${userId}` : `safari_pause_player_${userId}`,
        label: isPaused ? 'Unpause' : 'Pause',
        style: 2, // Secondary/Grey
        emoji: { name: isPaused ? '⏯️' : '⏸️' }
      });

      mapButtons.push({
        type: 2, // Button
        custom_id: `map_admin_grant_stamina_${userId}`,
        label: 'Stamina',
        style: 2, // Secondary
        emoji: { name: '⚡' }
      });
    }
  }

  if (mapButtons.length > 0) {
    buttons.push({
      type: 1, // Action Row
      components: mapButtons
    });
  }

  // Row 2: Safari management (Reset Explored replaces View Raw Data)
  const safariManagementButtons = [
    {
      type: 2, // Button
      custom_id: `map_admin_edit_currency_${userId}`,
      label: `Edit ${customTerms.currencyName}`,
      style: 2, // Secondary
      emoji: { name: customTerms.currencyEmoji || '💰' }
    },
    {
      type: 2, // Button
      custom_id: `map_admin_view_inventory_${userId}`,
      label: 'View Items',
      style: 2, // Secondary
      emoji: { name: customTerms.inventoryEmoji || '🧰' }
    },
    {
      type: 2, // Button
      custom_id: `map_admin_edit_items_${userId}`,
      label: 'Edit Items',
      style: 2, // Secondary
      emoji: { name: '📦' }
    }
  ];

  // Reset Explored — only for initialized players on map
  if (isInitialized && activeMap && playerMapData) {
    safariManagementButtons.push({
      type: 2, // Button
      custom_id: `map_admin_reset_explored_${userId}`,
      label: 'Reset Explored',
      style: 2, // Secondary
      emoji: { name: '🔄' }
    });
  }

  buttons.push({
    type: 1, // Action Row
    components: safariManagementButtons
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
  const { getStaminaConfig, getStartingCurrency, initializePlayerSafari, grantDefaultItems } = await import('./safariManager.js');
  const staminaConfig = await getStaminaConfig(guildId);

  // Resolve starting coordinate: per-player override > explicit param > server default > 'A1'
  if (!coordinate) {
    const activeMapId = safariData[guildId]?.maps?.active;
    const playerStartingLoc = playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]?.startingLocation;
    if (playerStartingLoc) {
      coordinate = playerStartingLoc;
      console.log(`📍 Using per-player starting location: ${coordinate}`);
    } else {
      coordinate = staminaConfig.defaultStartingCoordinate;
      console.log(`🗺️ Using configured starting coordinate: ${coordinate}`);
    }
  }

  // Get default starting currency from centralized config getter
  const defaultCurrency = await getStartingCurrency(guildId);

  // Get existing currency before initialization (may have been granted via other means)
  const existingCurrency = playerData[guildId]?.players?.[userId]?.safari?.currency || 0;

  // Use universal safari initialization to ensure ALL required fields exist
  initializePlayerSafari(playerData, guildId, userId, defaultCurrency);

  // Starting currency is ADDITIVE: existing + default (not replacement)
  const player_ = playerData[guildId].players[userId];
  player_.safari.currency = existingCurrency + defaultCurrency;
  console.log(`💰 Starting currency: ${existingCurrency} existing + ${defaultCurrency} starting = ${player_.safari.currency}`);

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
    // Preserve startingLocation if it exists from a previous de-init cycle
    const existingStartingLocation = player.safari.mapProgress?.[activeMapId]?.startingLocation;

    // Initialize map progress
    player.safari.mapProgress[activeMapId] = {
      currentLocation: coordinate,
      exploredCoordinates: [coordinate],
      itemsFound: [],
      movementHistory: [{
        from: null,
        to: coordinate,
        timestamp: new Date().toISOString()
      }],
      ...(existingStartingLocation && { startingLocation: existingStartingLocation })
    };
  }
  
  // Add activity log entry for initialization (atomic with the save)
  try {
    const { addActivityEntry, ACTIVITY_TYPES } = await import('./activityLogger.js');
    const { getCustomTerms } = await import('./safariManager.js');
    const { formatStaminaTag, createStaminaSnapshot } = await import('./pointsManager.js');
    const customTerms = await getCustomTerms(guildId);
    const totalCurrency = playerData[guildId].players[userId].safari.currency;
    const staminaInfo = player.safari.points?.stamina;
    const snapshot = staminaInfo ? createStaminaSnapshot(0, staminaInfo.current, staminaInfo.maximum, 'Ready!') : null;
    const staminaTag = formatStaminaTag(snapshot);
    const activityOpts = { loc: coordinate };
    if (snapshot) activityOpts.stamina = `${snapshot.after}/${snapshot.max}`;
    addActivityEntry(playerData, guildId, userId, ACTIVITY_TYPES.init, `Initialized at ${coordinate} with +${defaultCurrency} ${customTerms.currencyName} (total: ${totalCurrency})${staminaTag ? ' ' + staminaTag : ''}`, activityOpts);
  } catch (e) { console.error('Activity log error (init):', e); }

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
 * @param {string} guildId
 * @param {string} userId
 * @param {number} amount - Current stamina to set
 * @param {number|null} maxAmount - Max stamina (base, before item boosts). Null = keep existing.
 */
export async function setPlayerStamina(guildId, userId, amount, maxAmount = null) {
  // Use the new entity points system that the movement system uses
  const entityId = `player_${userId}`;

  // Special test mode: 99 sets stamina to a very high value for unlimited testing
  if (amount === 99) {
    await setEntityPoints(guildId, entityId, 'stamina', 999, 999);
  } else if (maxAmount !== null) {
    // Set both current and max (base max — item boosts are added on top by getEntityPoints)
    // allowOverMax: true so admin can set current above max (like granting bonus stamina)
    await setEntityPoints(guildId, entityId, 'stamina', amount, maxAmount, true);
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
      if (maxAmount !== null) stamina.maximum = maxAmount;
      stamina.current = amount;
    }
    stamina.lastRegeneration = new Date().toISOString();
    staminaResult = stamina;
    await savePlayerData(playerData);
  }

  logger.info('MAP_ADMIN', 'Stamina set for player', {
    guildId,
    userId,
    amount,
    maxAmount,
    newStamina: staminaResult.current,
    newMax: staminaResult.maximum
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
 * Create coordinate selection modal (move player only)
 */
export async function createCoordinateModal(userId, currentLocation = '') {
  return {
    custom_id: `map_admin_coordinate_modal_${userId}`,
    title: 'Move Player',
    components: [
      {
        type: 18, // Label
        label: 'Move Player to Location (e.g., B3, D5)',
        description: 'Immediately moves the player to the new location on submission',
        component: {
          type: 4, // Text Input
          custom_id: 'coordinate',
          style: 1, // Short
          placeholder: 'A1',
          required: true,
          max_length: 3,
          ...(currentLocation && currentLocation !== 'Not on map' ? { value: currentLocation } : {})
        }
      }
    ]
  };
}

/**
 * Create Starting Info modal (starting location + future: starting gold override)
 */
export async function createStartingInfoModal(userId, currentStartingLocation = '') {
  return {
    custom_id: `safari_starting_info_modal_${userId}`,
    title: 'Starting Info',
    components: [
      {
        type: 18, // Label
        label: 'Player Starting Location',
        description: 'Overrides the server default starting location for this player',
        component: {
          type: 4, // Text Input
          custom_id: 'starting_location',
          style: 1, // Short
          placeholder: 'A1',
          required: false,
          max_length: 3,
          ...(currentStartingLocation ? { value: currentStartingLocation } : {})
        }
      }
    ]
  };
}

/**
 * Create stamina grant modal
 * @param {string} userId - Target player's user ID
 * @param {string} guildId - Guild ID (for looking up current stamina and config)
 */
export async function createStaminaModal(userId, guildId) {
  // Look up current stamina from entityPoints (authoritative source)
  let currentStamina = '';
  let playerMax = '';
  let serverMax = '?';
  let itemBoost = 0;
  try {
    const { getEntityPoints, calculatePermanentStaminaBoost: calcBoost } = await import('./pointsManager.js');
    const { getStaminaConfig } = await import('./safariManager.js');
    const entityId = `player_${userId}`;
    const stamina = await getEntityPoints(guildId, entityId, 'stamina');
    const config = await getStaminaConfig(guildId);
    serverMax = String(config.maxStamina);
    if (stamina) {
      currentStamina = String(stamina.current);
      // Use stamina.max from getEntityPoints (authoritative, includes server config sync)
      // Subtract item boosts to get the base max (what the admin should edit)
      itemBoost = await calcBoost(guildId, entityId);
      const baseMax = config.maxStamina; // Server config is the true base — not stamina.max which may be stale
      playerMax = String(baseMax);
    }
  } catch (e) {
    console.error('Stamina modal lookup error:', e.message);
  }

  const maxDescription = itemBoost > 0
    ? `Base capacity before item boosts. Items currently add +${itemBoost} on top. Server default: ${serverMax}`
    : `Base capacity (the denominator). Server default: ${serverMax}`;

  return {
    custom_id: `map_admin_stamina_modal_${userId}`,
    title: 'Set Player Stamina',
    components: [
      {
        type: 18, // Label
        label: 'Current stamina',
        description: `How much stamina the player has right now. Use 99 for unlimited test mode.`,
        component: {
          type: 4, // Text Input
          custom_id: 'amount',
          style: 1, // Short
          placeholder: `e.g. ${serverMax}`,
          value: currentStamina,
          required: true,
          max_length: 3
        }
      },
      {
        type: 18, // Label
        label: 'Max stamina',
        description: maxDescription,
        component: {
          type: 4, // Text Input
          custom_id: 'max_stamina',
          style: 1, // Short
          placeholder: `Server default: ${serverMax}`,
          value: playerMax,
          required: true,
          max_length: 3
        }
      }
    ]
  };
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

/**
 * Bulk initialize multiple players onto the Safari map
 * @param {string} guildId - Discord guild ID
 * @param {string[]} userIds - Array of user IDs to initialize
 * @param {Object} client - Discord client for member resolution
 * @returns {Promise<Object[]>} Array of result objects per player
 */
export async function bulkInitializePlayers(guildId, userIds, client) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const customTerms = await getCustomTerms(guildId);
  const items = safariData[guildId]?.items || {};
  const defaultItemCount = Object.values(items).filter(i => i?.metadata?.defaultItem === 'Yes').length;
  const activeMapId = safariData[guildId]?.maps?.active;

  const guild = client?.guilds?.cache?.get(guildId);
  const results = [];

  for (const userId of userIds) {
    try {
      // Check if already initialized (canonical check via safariPlayerUtils)
      const player = playerData[guildId]?.players?.[userId];

      if (isPlayerInitialized(player)) {
        // Already initialized — get current location for display
        const currentLocation = activeMapId
          ? player.safari.mapProgress?.[activeMapId]?.currentLocation || '?'
          : '?';
        let displayName = userId;
        try {
          if (guild) {
            const member = await guild.members.fetch(userId);
            displayName = member.displayName || member.user.username;
          }
        } catch { /* member not found */ }
        results.push({ userId, displayName, success: false, coordinate: currentLocation, error: 'Already initialized' });
        continue;
      }

      // Coordinate resolution handled inside initializePlayerOnMap
      // (per-player startingLocation > server default > 'A1')
      await initializePlayerOnMap(guildId, userId, null, client);

      // Reload player data to get results (including resolved coordinate)
      const updatedData = await loadPlayerData();
      const updatedPlayer = updatedData[guildId]?.players?.[userId];
      const currency = updatedPlayer?.safari?.currency || 0;
      const itemCount = Object.keys(updatedPlayer?.safari?.inventory || {}).length;
      const coordinate = activeMapId
        ? updatedPlayer?.safari?.mapProgress?.[activeMapId]?.currentLocation || '?'
        : '?';

      // Resolve display name
      let displayName = userId;
      let username = userId;
      try {
        if (guild) {
          const member = await guild.members.fetch(userId);
          displayName = member.displayName || member.user.username;
          username = member.user.username;
        }
      } catch { /* member not found */ }

      // Log initialization with stamina snapshot
      const { logPlayerInitialization } = await import('./safariLogger.js');
      const { createStaminaSnapshot } = await import('./pointsManager.js');
      const staminaData = updatedPlayer?.safari?.points?.stamina;
      const staminaSnapshot = staminaData
        ? createStaminaSnapshot(0, staminaData.current, staminaData.maximum, 'Ready!')
        : null;
      await logPlayerInitialization({
        guildId, userId, username, displayName,
        coordinate, currency, currencyName: customTerms.currencyName,
        staminaSnapshot
      });

      results.push({ userId, displayName, success: true, coordinate, currency, itemCount });
    } catch (error) {
      logger.error('MAP_ADMIN', `Failed to initialize player ${userId}`, { error: error.message });
      let displayName = userId;
      try {
        if (guild) {
          const member = await guild.members.fetch(userId);
          displayName = member.displayName || member.user.username;
        }
      } catch { /* ignore */ }
      results.push({ userId, displayName, success: false, error: error.message });
    }
  }

  return { results, customTerms, defaultItemCount };
}