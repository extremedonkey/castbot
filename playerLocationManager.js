/**
 * Player Location Manager
 * 
 * Centralized system for managing and querying player locations on the Safari Map.
 * Designed to support various features like whispers, trades, battles, and admin monitoring.
 */

import { loadPlayerData } from './storage.js';
import { loadSafariContent } from './safariManager.js';
import { getEntityPoints } from './pointsManager.js';
import { logger } from './logger.js';

/**
 * Get all players on the map with their current locations
 * @param {string} guildId - The guild ID
 * @param {boolean} includeOffline - Whether to include offline players
 * @returns {Map<string, Object>} Map of userId -> location data
 */
export async function getAllPlayerLocations(guildId, includeOffline = true) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) {
        logger.debug('LOCATION_MANAGER', 'No active map found', { guildId });
        return new Map();
    }
    
    const guildPlayers = playerData[guildId]?.players || {};
    const playerLocations = new Map();
    
    for (const [userId, player] of Object.entries(guildPlayers)) {
        const mapProgress = player.safari?.mapProgress?.[activeMapId];
        if (!mapProgress?.currentLocation) continue;
        
        const locationData = {
            userId,
            coordinate: mapProgress.currentLocation,
            lastMovement: mapProgress.movementHistory?.slice(-1)[0]?.timestamp || null,
            exploredCount: mapProgress.exploredCoordinates?.length || 0,
            stamina: await getPlayerStamina(guildId, userId),
            displayName: player.displayName || 'Unknown Player',
            avatar: player.avatar || null
        };
        
        playerLocations.set(userId, locationData);
    }
    
    logger.debug('LOCATION_MANAGER', 'Retrieved player locations', { 
        guildId, 
        playerCount: playerLocations.size 
    });
    
    return playerLocations;
}

/**
 * Get all players at a specific coordinate
 * @param {string} guildId - The guild ID
 * @param {string} coordinate - The map coordinate (e.g., 'A1', 'B3')
 * @returns {Array<Object>} Array of player data at the coordinate
 */
export async function getPlayersAtLocation(guildId, coordinate) {
    const allLocations = await getAllPlayerLocations(guildId);
    const playersAtLocation = [];
    
    for (const [userId, locationData] of allLocations) {
        if (locationData.coordinate === coordinate) {
            playersAtLocation.push(locationData);
        }
    }
    
    logger.debug('LOCATION_MANAGER', 'Players at location', { 
        guildId, 
        coordinate, 
        count: playersAtLocation.length 
    });
    
    return playersAtLocation;
}

/**
 * Check if two players are at the same location
 * @param {string} guildId - The guild ID
 * @param {string} userId1 - First player's user ID
 * @param {string} userId2 - Second player's user ID
 * @returns {Object} { sameLocation: boolean, coordinate: string|null }
 */
export async function arePlayersAtSameLocation(guildId, userId1, userId2) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) {
        return { sameLocation: false, coordinate: null };
    }
    
    const player1Location = playerData[guildId]?.players?.[userId1]?.safari?.mapProgress?.[activeMapId]?.currentLocation;
    const player2Location = playerData[guildId]?.players?.[userId2]?.safari?.mapProgress?.[activeMapId]?.currentLocation;
    
    const sameLocation = player1Location && player2Location && player1Location === player2Location;
    
    return {
        sameLocation,
        coordinate: sameLocation ? player1Location : null
    };
}

/**
 * Get detailed location information for a specific player
 * @param {string} guildId - The guild ID
 * @param {string} userId - The player's user ID
 * @returns {Object|null} Detailed location data or null if not found
 */
export async function getPlayerLocationDetails(guildId, userId) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) return null;
    
    const player = playerData[guildId]?.players?.[userId];
    if (!player?.safari?.mapProgress?.[activeMapId]) return null;
    
    const mapProgress = player.safari.mapProgress[activeMapId];
    const coordinate = mapProgress.currentLocation;
    
    // Get other players at same location
    const othersAtLocation = await getPlayersAtLocation(guildId, coordinate);
    const otherPlayers = othersAtLocation.filter(p => p.userId !== userId);
    
    // Get coordinate details from map
    const mapData = safariData[guildId].maps[activeMapId];
    const coordData = mapData.coordinates?.[coordinate] || {};
    
    return {
        userId,
        coordinate,
        channelId: coordData.channelId || null,
        displayName: player.displayName || 'Unknown Player',
        avatar: player.avatar || null,
        stamina: await getPlayerStamina(guildId, userId),
        exploredCoordinates: mapProgress.exploredCoordinates || [],
        movementHistory: mapProgress.movementHistory || [],
        lastMovement: mapProgress.movementHistory?.slice(-1)[0] || null,
        otherPlayersHere: otherPlayers,
        buttons: coordData.buttons || [],
        currency: player.safari?.currency || 0,
        items: Object.keys(player.safari?.items || {}).length
    };
}

/**
 * Format player location data for Discord display
 * @param {Array<Object>} players - Array of player location data
 * @param {Object} options - Display options
 * @returns {string} Formatted string for Discord
 */
export function formatPlayerLocationDisplay(players, options = {}) {
    const {
        showStamina = true,
        showLastMove = true,
        showExplored = false,
        groupByLocation = false,
        maxPerLocation = 10
    } = options;
    
    if (players.length === 0) {
        return '_No players found on the map_';
    }
    
    if (groupByLocation) {
        // Group players by coordinate
        const locationGroups = {};
        for (const player of players) {
            if (!locationGroups[player.coordinate]) {
                locationGroups[player.coordinate] = [];
            }
            locationGroups[player.coordinate].push(player);
        }
        
        let display = '';
        for (const [coord, playersAtCoord] of Object.entries(locationGroups)) {
            display += `\n**📍 ${coord}** (${playersAtCoord.length} player${playersAtCoord.length !== 1 ? 's' : ''}):\n`;
            
            const displayPlayers = playersAtCoord.slice(0, maxPerLocation);
            for (const player of displayPlayers) {
                display += formatSinglePlayer(player, { showStamina, showLastMove, showExplored });
            }
            
            if (playersAtCoord.length > maxPerLocation) {
                display += `_...and ${playersAtCoord.length - maxPerLocation} more_\n`;
            }
        }
        
        return display.trim();
    } else {
        // List all players
        let display = '';
        for (const player of players) {
            display += formatSinglePlayer(player, { showStamina, showLastMove, showExplored });
        }
        return display.trim();
    }
}

/**
 * Create a visual map showing player positions
 * @param {string} guildId - The guild ID
 * @returns {Object} Components V2 formatted map display
 */
export async function createPlayerLocationMap(guildId) {
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) {
        return {
            type: 10, // Text Display
            content: '⚠️ No active map found'
        };
    }
    
    const mapData = safariData[guildId].maps[activeMapId];
    const gridSize = mapData.gridSize || 7;
    const allLocations = await getAllPlayerLocations(guildId);
    
    // Count players per coordinate
    const playerCounts = {};
    for (const [userId, locationData] of allLocations) {
        const coord = locationData.coordinate;
        playerCounts[coord] = (playerCounts[coord] || 0) + 1;
    }
    
    // Build grid display
    let gridDisplay = '```\n   ';
    
    // Column headers
    for (let col = 0; col < gridSize; col++) {
        gridDisplay += ` ${String.fromCharCode(65 + col)} `;
    }
    gridDisplay += '\n';
    
    // Grid rows
    for (let row = 0; row < gridSize; row++) {
        gridDisplay += ` ${row + 1} `;
        for (let col = 0; col < gridSize; col++) {
            const coord = String.fromCharCode(65 + col) + (row + 1);
            const count = playerCounts[coord] || 0;
            
            if (count === 0) {
                gridDisplay += ' · ';
            } else if (count === 1) {
                gridDisplay += ' 👤';
            } else if (count <= 9) {
                gridDisplay += ` ${count}👥`;
            } else {
                gridDisplay += ' 9+';
            }
        }
        gridDisplay += '\n';
    }
    
    gridDisplay += '```';
    
    // Build legend
    let legend = '\n**Legend:**\n';
    legend += '· = Empty cell\n';
    legend += '👤 = 1 player\n';
    legend += '#👥 = Multiple players\n';
    
    // List coordinates with players
    const occupiedCoords = Object.entries(playerCounts)
        .filter(([coord, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b));
    
    if (occupiedCoords.length > 0) {
        legend += '\n**Occupied Cells:**\n';
        for (const [coord, count] of occupiedCoords) {
            const playersHere = await getPlayersAtLocation(guildId, coord);
            const names = playersHere.slice(0, 3).map(p => p.displayName).join(', ');
            const more = playersHere.length > 3 ? ` +${playersHere.length - 3}` : '';
            legend += `${coord}: ${names}${more}\n`;
        }
    }
    
    return {
        type: 10, // Text Display
        content: `## 🗺️ Player Locations\n\n${gridDisplay}${legend}`
    };
}

// Helper functions

async function getPlayerStamina(guildId, userId) {
    try {
        const entityId = `player_${userId}`;
        const stamina = await getEntityPoints(guildId, entityId, 'stamina');
        return stamina;
    } catch (error) {
        return { current: 0, max: 10 };
    }
}

function formatSinglePlayer(player, options) {
    let display = `• **${player.displayName}** @ ${player.coordinate}`;
    
    if (options.showStamina && player.stamina) {
        display += ` ⚡${player.stamina.current}/${player.stamina.max}`;
    }
    
    if (options.showLastMove && player.lastMovement) {
        const moveTime = new Date(player.lastMovement);
        const now = new Date();
        const minutesAgo = Math.floor((now - moveTime) / 60000);
        
        if (minutesAgo < 1) {
            display += ' _(just moved)_';
        } else if (minutesAgo < 60) {
            display += ` _(${minutesAgo}m ago)_`;
        } else {
            const hoursAgo = Math.floor(minutesAgo / 60);
            display += ` _(${hoursAgo}h ago)_`;
        }
    }
    
    if (options.showExplored) {
        display += ` 🗺️${player.exploredCount}`;
    }
    
    display += '\n';
    return display;
}

/**
 * Get nearby players within a certain distance
 * @param {string} guildId - The guild ID
 * @param {string} userId - The player's user ID
 * @param {number} distance - Maximum distance (1 = adjacent only)
 * @returns {Array<Object>} Array of nearby players
 */
export async function getNearbyPlayers(guildId, userId, distance = 1) {
    const playerLocation = await getPlayerLocationDetails(guildId, userId);
    if (!playerLocation) return [];
    
    const coord = playerLocation.coordinate;
    const col = coord.charCodeAt(0) - 65;
    const row = parseInt(coord.substring(1)) - 1;
    
    const allLocations = await getAllPlayerLocations(guildId);
    const nearbyPlayers = [];
    
    for (const [otherUserId, locationData] of allLocations) {
        if (otherUserId === userId) continue;
        
        const otherCoord = locationData.coordinate;
        const otherCol = otherCoord.charCodeAt(0) - 65;
        const otherRow = parseInt(otherCoord.substring(1)) - 1;
        
        // Calculate Chebyshev distance (max of row/col difference)
        const dist = Math.max(Math.abs(col - otherCol), Math.abs(row - otherRow));
        
        if (dist <= distance) {
            nearbyPlayers.push({
                ...locationData,
                distance: dist
            });
        }
    }
    
    return nearbyPlayers.sort((a, b) => a.distance - b.distance);
}

// Export utilities for future features
export const LocationUtils = {
    getAllPlayerLocations,
    getPlayersAtLocation,
    arePlayersAtSameLocation,
    getPlayerLocationDetails,
    formatPlayerLocationDisplay,
    createPlayerLocationMap,
    getNearbyPlayers
};