/**
 * Safari Map Admin Panel
 * Admin interface for managing player map states using Entity Edit Framework
 */

import { 
  InteractionResponseType, 
  InteractionResponseFlags 
} from 'discord-interactions';
import { loadSafariContent, saveSafariContent } from './safariManager.js';
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
          content: `## 🛡️ Safari Map Admin Panel\n\n` +
                  `Select a player to manage their map state:`
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
            custom_id: 'safari_map_explorer',
            label: 'Back to Map Explorer',
            style: 2,
            emoji: { name: '◀️' }
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
  const stamina = safari.points?.stamina || { current: 0, maximum: 10 };
  const exploredCount = playerMapData?.exploredCoordinates?.length || 0;
  const lastMove = playerMapData?.movementHistory?.slice(-1)[0];
  
  // Build status display
  let statusText = `## 🛡️ Map Admin: <@${userId}>\n\n`;
  
  if (!activeMap) {
    statusText += `⚠️ **No active map in this server**\n\n`;
  } else {
    statusText += `📍 **Current Location:** ${currentLocation}\n`;
    statusText += `⚡ **Stamina:** ${stamina.current}/${stamina.maximum}\n`;
    statusText += `🗺️ **Explored Cells:** ${exploredCount}\n`;
    
    if (lastMove) {
      const moveTime = new Date(lastMove.timestamp).toLocaleString();
      statusText += `🕒 **Last Move:** ${lastMove.from} → ${lastMove.to} (${moveTime})\n`;
    }
    
    statusText += `\n💰 **${customTerms.currencyName}:** ${safari.currency || 0} ${customTerms.currencyEmoji}\n`;
    statusText += `📦 **Items in ${customTerms.inventoryName}:** ${Object.keys(safari.items || {}).length}\n`;
  }
  
  // Build management buttons
  const buttons = [];
  
  // Row 1: Map management
  const mapButtons = [];
  if (!playerMapData) {
    mapButtons.push({
      type: 2, // Button
      custom_id: `map_admin_init_player_${userId}`,
      label: 'Initialize on Map',
      style: 3, // Success
      emoji: { name: '🚀' }
    });
  } else {
    mapButtons.push({
      type: 2, // Button
      custom_id: `map_admin_move_player_${userId}`,
      label: 'Move Player',
      style: 1, // Primary
      emoji: { name: '📍' }
    });
    
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
        emoji: { name: customTerms.currencyEmoji || '💰' }
      },
      {
        type: 2, // Button
        custom_id: `map_admin_edit_items_${userId}`,
        label: 'Edit Items',
        style: 2, // Secondary
        emoji: { name: '📦' }
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
  
  // Row 3: Navigation
  buttons.push({
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button
        custom_id: 'map_admin_select_new',
        label: 'Select Different Player',
        style: 2, // Secondary
        emoji: { name: '👤' }
      },
      {
        type: 2, // Button
        custom_id: 'safari_map_explorer',
        label: 'Back to Map Explorer',
        style: 2, // Secondary
        emoji: { name: '◀️' }
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
export async function initializePlayerOnMap(guildId, userId, coordinate = 'A1', client = null) {
  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  
  // Ensure structures exist
  if (!playerData[guildId]) {
    playerData[guildId] = { players: {} };
  }
  if (!playerData[guildId].players[userId]) {
    playerData[guildId].players[userId] = { safari: {} };
  }
  
  const player = playerData[guildId].players[userId];
  if (!player.safari) player.safari = {};
  if (!player.safari.mapProgress) player.safari.mapProgress = {};
  if (!player.safari.points) player.safari.points = {};
  
  // Initialize stamina
  player.safari.points.stamina = {
    current: 10,
    maximum: 10,
    lastRegeneration: new Date().toISOString(),
    regenConfig: 'hourly' // Regenerate 1 stamina per hour
  };
  
  // Get active map
  const activeMapId = safariData[guildId]?.maps?.active;
  if (!activeMapId) {
    throw new Error('No active map in this server');
  }
  
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
  
  await savePlayerData(playerData);
  
  // If client is provided, also initialize using the movement system for proper permission handling
  if (client) {
    const { initializePlayerOnMap: initMovementSystem } = await import('./mapMovement.js');
    await initMovementSystem(guildId, userId, coordinate, client);
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
  const previousLocation = mapProgress.currentLocation;
  
  // Update location
  mapProgress.currentLocation = coordinate;
  
  // Add to explored if not already
  if (!mapProgress.exploredCoordinates.includes(coordinate)) {
    mapProgress.exploredCoordinates.push(coordinate);
  }
  
  // Add to movement history
  mapProgress.movementHistory.push({
    from: previousLocation,
    to: coordinate,
    timestamp: new Date().toISOString(),
    adminMove: true
  });
  
  await savePlayerData(playerData);
  
  // Update Discord channel permissions if client is provided
  if (client) {
    const { updateChannelPermissions } = await import('./mapMovement.js');
    await updateChannelPermissions(guildId, userId, previousLocation, coordinate, client);
  }
  
  logger.info('MAP_ADMIN', 'Player moved by admin', { 
    guildId, 
    userId, 
    from: previousLocation,
    to: coordinate 
  });
  
  return mapProgress;
}

/**
 * Set stamina for player
 */
export async function setPlayerStamina(guildId, userId, amount) {
  const playerData = await loadPlayerData();
  
  const player = playerData[guildId]?.players?.[userId];
  if (!player?.safari?.points?.stamina) {
    throw new Error('Player stamina not initialized');
  }
  
  const stamina = player.safari.points.stamina;
  // Ensure amount is within valid range (0 to maximum)
  stamina.current = Math.max(0, Math.min(amount, stamina.maximum));
  stamina.lastRegeneration = new Date().toISOString();
  
  await savePlayerData(playerData);
  
  logger.info('MAP_ADMIN', 'Stamina set for player', { 
    guildId, 
    userId, 
    amount,
    newStamina: stamina.current 
  });
  
  return stamina;
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
    .setLabel('Stamina Amount (0-10)')
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