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
 * @param {Object} client - Discord client instance for fetching member data
 * @returns {Map<string, Object>} Map of userId -> location data
 */
export async function getAllPlayerLocations(guildId, includeOffline = true, client = null) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) {
        logger.debug('LOCATION_MANAGER', 'No active map found', { guildId });
        return new Map();
    }
    
    const guildPlayers = playerData[guildId]?.players || {};
    const playerLocations = new Map();

    // Collect userIds that have map locations first
    const activeUserIds = [];
    for (const [userId, player] of Object.entries(guildPlayers)) {
        const mapProgress = player.safari?.mapProgress?.[activeMapId];
        if (mapProgress?.currentLocation) {
            activeUserIds.push(userId);
        }
    }

    // Fetch only the specific members we need (not ALL guild members)
    let guild = null;
    let members = new Map();
    if (client && activeUserIds.length > 0) {
        try {
            guild = await client.guilds.fetch(guildId);
            // Batch fetch only active safari players
            const fetched = await guild.members.fetch({ user: activeUserIds });
            fetched.forEach((member, id) => members.set(id, member));
            logger.debug('LOCATION_MANAGER', 'Fetched active player members', { guildId, requested: activeUserIds.length, found: members.size });
        } catch (error) {
            logger.debug('LOCATION_MANAGER', 'Could not fetch members, trying cache', { guildId, error: error.message });
            // Fallback: check cache for each user
            if (guild) {
                for (const userId of activeUserIds) {
                    const cached = guild.members.cache.get(userId);
                    if (cached) members.set(userId, cached);
                }
                logger.debug('LOCATION_MANAGER', 'Cache fallback', { guildId, found: members.size });
            }
        }
    }

    for (const [userId, player] of Object.entries(guildPlayers)) {
        const mapProgress = player.safari?.mapProgress?.[activeMapId];
        if (!mapProgress?.currentLocation) continue;

        // Try to get display name from Discord member
        let displayName = 'Unknown Player';
        let avatar = null;

        const member = members.get(userId);
        if (member) {
            displayName = member.displayName || member.user.username || 'Unknown Player';
            avatar = member.user.displayAvatarURL({ size: 128 });
        }
        
        const locationData = {
            userId,
            coordinate: mapProgress.currentLocation,
            lastMovement: mapProgress.movementHistory?.slice(-1)[0]?.timestamp || null,
            exploredCount: mapProgress.exploredCoordinates?.length || 0,
            stamina: await getPlayerStamina(guildId, userId),
            displayName: displayName,
            avatar: avatar
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
 * @param {Object} client - Discord client instance for fetching member data
 * @returns {Array<Object>} Array of player data at the coordinate
 */
export async function getPlayersAtLocation(guildId, coordinate, client = null) {
    const allLocations = await getAllPlayerLocations(guildId, true, client);
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
 * @param {Object} client - Discord client instance for fetching member data
 * @returns {Object|null} Detailed location data or null if not found
 */
export async function getPlayerLocationDetails(guildId, userId, client = null) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) return null;
    
    const player = playerData[guildId]?.players?.[userId];
    if (!player?.safari?.mapProgress?.[activeMapId]) return null;
    
    const mapProgress = player.safari.mapProgress[activeMapId];
    const coordinate = mapProgress.currentLocation;
    
    // Get other players at same location
    const othersAtLocation = await getPlayersAtLocation(guildId, coordinate, client);
    const otherPlayers = othersAtLocation.filter(p => p.userId !== userId);
    
    // Get coordinate details from map
    const mapData = safariData[guildId].maps[activeMapId];
    const coordData = mapData.coordinates?.[coordinate] || {};
    
    // Try to get display name from Discord if client is provided
    let displayName = 'Unknown Player';
    let avatar = null;
    
    if (client) {
        try {
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            displayName = member.displayName || member.user.username || 'Unknown Player';
            avatar = member.user.displayAvatarURL({ size: 128 });
        } catch (error) {
            logger.debug('LOCATION_MANAGER', 'Could not fetch member in getPlayerLocationDetails', { userId, error: error.message });
        }
    }
    
    return {
        userId,
        coordinate,
        channelId: coordData.channelId || null,
        displayName: displayName,
        avatar: avatar,
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
 * @param {Object} client - Discord client instance for fetching member data
 * @param {Object} options - Display options
 * @param {boolean} options.showBlacklisted - Whether to show blacklisted coordinates
 * @param {string} options.blacklistSymbol - Symbol to use for blacklisted cells (default: X)
 * @returns {Object} Components V2 formatted map display
 */
export async function createPlayerLocationMap(guildId, client = null, options = {}) {
    const {
        showBlacklisted = true,
        blacklistSymbol = 'X',
        playerLocations = null  // Optional pre-fetched player locations to avoid duplicate API calls
    } = options;

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
    // Use pre-fetched locations if provided, otherwise fetch (for backward compatibility)
    const allLocations = playerLocations || await getAllPlayerLocations(guildId, true, client);
    
    // Get blacklisted coordinates if needed
    let blacklistedCoords = [];
    if (showBlacklisted) {
        try {
            const { getBlacklistedCoordinates } = await import('./mapExplorer.js');
            blacklistedCoords = await getBlacklistedCoordinates(guildId);
        } catch (error) {
            logger.debug('LOCATION_MANAGER', 'Could not fetch blacklisted coordinates', { guildId, error: error.message });
        }
    }
    
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
            const isBlacklisted = blacklistedCoords.includes(coord);
            
            if (isBlacklisted) {
                // Show blacklist symbol, or combine with player indicator if there are players
                if (count === 0) {
                    gridDisplay += ` ${blacklistSymbol} `;
                } else {
                    gridDisplay += ` ${blacklistSymbol}♟`;
                }
            } else {
                // Normal display for non-blacklisted cells
                if (count === 0) {
                    gridDisplay += ' · ';
                } else {
                    gridDisplay += ' ♟';
                }
            }
        }
        gridDisplay += '\n';
    }
    
    gridDisplay += '```';
    
    // Build legend
    let legend = '\n· = Empty  ♟ = Player(s)';
    if (showBlacklisted && blacklistedCoords.length > 0) {
        legend += `  ${blacklistSymbol} = Blacklisted`;
    }

    // List coordinates with players
    const occupiedCoords = Object.entries(playerCounts)
        .filter(([coord, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b));

    if (occupiedCoords.length > 0) {
        legend += '\n\n**Occupied Cells:**\n';
        for (const [coord, count] of occupiedCoords) {
            const playersHere = [];
            for (const [userId, locationData] of allLocations) {
                if (locationData.coordinate === coord) {
                    playersHere.push(locationData);
                }
            }
            const names = playersHere.map(p => p.displayName).join(', ');
            const blacklistNote = blacklistedCoords.includes(coord) ? ' *(blacklisted)*' : '';
            legend += `${coord}: ${names}${blacklistNote}\n`;
        }
    }

    return {
        type: 10, // Text Display
        content: `${gridDisplay}${legend}`
    };
}

// New helper function for reverse blacklist items
async function getReverseBlacklistItemSummary(guildId) {
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const items = safariData[guildId]?.items || {};

    return Object.entries(items)
        .filter(([id, item]) => item.reverseBlacklist?.length > 0)
        .map(([id, item]) => ({
            id,  // Item ID for color assignment
            name: item.name,
            emoji: item.emoji || '📦',
            coordinates: item.reverseBlacklist,
            metadata: item.metadata || {}  // Include metadata with lastModified timestamp
        }));
}

/**
 * Format reverse blacklist items legend text
 * @param {string} guildId - The guild ID
 * @returns {Promise<string>} Formatted legend text (empty string if no items)
 */
export async function formatReverseBlacklistLegend(guildId) {
    console.log(`🔍 DEBUG formatReverseBlacklistLegend: Called for guild ${guildId}`);
    const reverseBlacklistInfo = await getReverseBlacklistItemSummary(guildId);
    console.log(`🔍 DEBUG formatReverseBlacklistLegend: Found ${reverseBlacklistInfo.length} items:`, JSON.stringify(reverseBlacklistInfo, null, 2));

    if (reverseBlacklistInfo.length === 0) {
        console.log(`🔍 DEBUG formatReverseBlacklistLegend: No items found, returning empty string`);
        return '';
    }

    let legend = '**Reverse Blacklist Items:**\n';
    reverseBlacklistInfo.forEach(info => {
        legend += `• ${info.emoji} ${info.name}: ${info.coordinates.join(', ')}\n`;
    });

    console.log(`🔍 DEBUG formatReverseBlacklistLegend: Generated legend:\n${legend}`);
    return legend;
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
    let display = `${player.displayName}`;

    const details = [];
    if (options.showStamina && player.stamina) {
        details.push(`⚡${player.stamina.current}/${player.stamina.max}`);
    }
    if (options.showLastMove && player.lastMovement) {
        const moveTime = new Date(player.lastMovement);
        const now = new Date();
        const minutesAgo = Math.floor((now - moveTime) / 60000);
        if (minutesAgo < 1) {
            details.push('just moved');
        } else if (minutesAgo < 60) {
            details.push(`${minutesAgo}m ago`);
        } else {
            details.push(`${Math.floor(minutesAgo / 60)}h ago`);
        }
    }
    if (options.showExplored) {
        details.push(`🗺️${player.exploredCount}`);
    }

    if (details.length > 0) {
        display += ` | ${details.join(' ')}`;
    }

    display += '\n';
    return display;
}

/**
 * Get nearby players within a certain distance
 * @param {string} guildId - The guild ID
 * @param {string} userId - The player's user ID
 * @param {number} distance - Maximum distance (1 = adjacent only)
 * @param {Object} client - Discord client instance for fetching member data
 * @returns {Array<Object>} Array of nearby players
 */
export async function getNearbyPlayers(guildId, userId, distance = 1, client = null) {
    const playerLocation = await getPlayerLocationDetails(guildId, userId, client);
    if (!playerLocation) return [];
    
    const coord = playerLocation.coordinate;
    const col = coord.charCodeAt(0) - 65;
    const row = parseInt(coord.substring(1)) - 1;
    
    const allLocations = await getAllPlayerLocations(guildId, true, client);
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

// Export reverse blacklist utilities
export { getReverseBlacklistItemSummary };