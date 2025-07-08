import { PermissionFlagsBits } from 'discord.js';
import { loadPlayerData, savePlayerData } from './storage.js';
import { loadSafariContent } from './safariManager.js';
import { hasEnoughPoints, usePoints, getTimeUntilRegeneration, initializeEntityPoints } from './pointsManager.js';

/**
 * Map Movement System for Safari
 * Handles player movement between grid coordinates with Discord permission management
 */

// Get player's current location on the map
export async function getPlayerLocation(guildId, userId) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const player = playerData[guildId]?.players?.[userId];
    
    if (!player?.safari) {
        return null;
    }
    
    // Get active map
    const activeMapId = safariData[guildId]?.maps?.active;
    if (!activeMapId) {
        return null;
    }
    
    // Get map progress for active map
    const mapProgress = player.safari.mapProgress?.[activeMapId];
    if (!mapProgress) {
        return null;
    }
    
    // Return in expected format
    return {
        currentCoordinate: mapProgress.currentLocation,
        lastMovement: mapProgress.movementHistory?.slice(-1)[0]?.timestamp || 0,
        visitedCoordinates: mapProgress.exploredCoordinates || []
    };
}

// Set player location (for initialization or admin commands)
export async function setPlayerLocation(guildId, userId, coordinate, mapId = null) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const player = playerData[guildId]?.players?.[userId];
    
    if (!player?.safari) {
        throw new Error("Player not found in safari system");
    }
    
    // Get active map if not provided
    const activeMapId = mapId || safariData[guildId]?.maps?.active;
    if (!activeMapId) {
        throw new Error("No active map in this server");
    }
    
    // Ensure mapProgress structure exists
    if (!player.safari.mapProgress) {
        player.safari.mapProgress = {};
    }
    
    // Get or create map progress for this map
    if (!player.safari.mapProgress[activeMapId]) {
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
    } else {
        const mapProgress = player.safari.mapProgress[activeMapId];
        const previousLocation = mapProgress.currentLocation;
        
        // Update location
        mapProgress.currentLocation = coordinate;
        
        // Track explored coordinates
        if (!mapProgress.exploredCoordinates.includes(coordinate)) {
            mapProgress.exploredCoordinates.push(coordinate);
        }
        
        // Add to movement history
        mapProgress.movementHistory.push({
            from: previousLocation,
            to: coordinate,
            timestamp: new Date().toISOString()
        });
    }
    
    await savePlayerData(playerData);
    return player.safari.mapProgress[activeMapId];
}

// Get valid moves from current position based on movement schema
export function getValidMoves(currentCoordinate, movementSchema = 'adjacent_8') {
    const col = currentCoordinate.charCodeAt(0) - 65; // A=0, B=1, etc.
    const row = parseInt(currentCoordinate.substring(1)) - 1; // 1-based to 0-based
    
    const moves = {
        northwest: { col: col - 1, row: row - 1, direction: '↖️ Northwest' },
        north: { col: col, row: row - 1, direction: '⬆️ North' },
        northeast: { col: col + 1, row: row - 1, direction: '↗️ Northeast' },
        west: { col: col - 1, row: row, direction: '⬅️ West' },
        east: { col: col + 1, row: row, direction: '➡️ East' },
        southwest: { col: col - 1, row: row + 1, direction: '↙️ Southwest' },
        south: { col: col, row: row + 1, direction: '⬇️ South' },
        southeast: { col: col + 1, row: row + 1, direction: '↘️ Southeast' }
    };
    
    const validMoves = [];
    const directionsToCheck = movementSchema === 'cardinal_4' 
        ? ['north', 'east', 'south', 'west']
        : Object.keys(moves);
    
    for (const direction of directionsToCheck) {
        const move = moves[direction];
        
        // Check if move is within grid bounds (assumes 5x5 for MVP)
        if (move.col >= 0 && move.col < 5 && move.row >= 0 && move.row < 5) {
            const coordinate = String.fromCharCode(65 + move.col) + (move.row + 1);
            validMoves.push({
                direction: move.direction,
                coordinate: coordinate,
                customId: `safari_move_${coordinate}`,
                // Add label with coordinate for button display
                label: `${move.direction.split(' ')[1]} (${coordinate})`
            });
        }
    }
    
    return validMoves;
}

// Check if player can move (has stamina)
export async function canPlayerMove(guildId, userId) {
    const entityId = `player_${userId}`;
    const safariData = await loadSafariContent();
    const movementCost = safariData[guildId]?.pointsConfig?.movementCost?.stamina || 1;
    
    return await hasEnoughPoints(guildId, entityId, 'stamina', movementCost);
}

// Execute player movement
export async function movePlayer(guildId, userId, newCoordinate, client, options = {}) {
    const { bypassStamina = false, adminMove = false } = options;
    const entityId = `player_${userId}`;
    const safariData = await loadSafariContent();
    const movementCost = safariData[guildId]?.pointsConfig?.movementCost?.stamina || 1;
    
    // Check stamina (unless bypassed for admin moves)
    if (!bypassStamina) {
        const canMove = await canPlayerMove(guildId, userId);
        if (!canMove) {
            const timeUntil = await getTimeUntilRegeneration(guildId, entityId, 'stamina');
            return { 
                success: false, 
                message: `You're too tired to move! Rest for ${timeUntil} before moving again.` 
            };
        }
    }
    
    // Get current location
    const mapState = await getPlayerLocation(guildId, userId);
    const oldCoordinate = mapState.currentCoordinate;
    
    // Validate move is allowed (unless admin move)
    if (!adminMove) {
        const validMoves = getValidMoves(oldCoordinate);
        const isValidMove = validMoves.some(move => move.coordinate === newCoordinate);
        
        if (!isValidMove) {
            return { 
                success: false, 
                message: `You cannot move to ${newCoordinate} from ${oldCoordinate}.` 
            };
        }
    }
    
    // Use stamina (unless bypassed)
    if (!bypassStamina) {
        const pointsResult = await usePoints(guildId, entityId, 'stamina', movementCost);
        if (!pointsResult.success) {
            return { 
                success: false, 
                message: pointsResult.message 
            };
        }
    }
    
    // Update location
    await setPlayerLocation(guildId, userId, newCoordinate);
    
    // Update Discord permissions
    await updateChannelPermissions(guildId, userId, oldCoordinate, newCoordinate, client);
    
    const message = adminMove 
        ? `📍 You have been moved by the Production team to **${newCoordinate}**!`
        : `You move to ${newCoordinate}!`;
    
    return { 
        success: true, 
        message,
        oldCoordinate,
        newCoordinate,
        adminMove
    };
}

// Update Discord channel permissions based on movement
export async function updateChannelPermissions(guildId, userId, oldCoordinate, newCoordinate, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        const safariData = await loadSafariContent();
        const activeMap = safariData[guildId]?.maps?.active;
        
        if (!activeMap) {
            console.error('No active map found for permission update');
            return;
        }
        
        const mapData = safariData[guildId].maps[activeMap];
        
        // Get Discord member object for permission operations
        const member = await guild.members.fetch(userId);
        
        // Remove permissions from old channel
        if (oldCoordinate && mapData.coordinates[oldCoordinate]?.channelId) {
            const oldChannel = await guild.channels.fetch(mapData.coordinates[oldCoordinate].channelId);
            if (oldChannel) {
                await oldChannel.permissionOverwrites.edit(member, {
                    [PermissionFlagsBits.ViewChannel]: false,
                    [PermissionFlagsBits.SendMessages]: false
                });
                console.log(`🚪 Removed permissions for ${member.displayName} from ${oldCoordinate} channel`);
            }
        }
        
        // Add permissions to new channel
        if (newCoordinate && mapData.coordinates[newCoordinate]?.channelId) {
            const newChannel = await guild.channels.fetch(mapData.coordinates[newCoordinate].channelId);
            if (newChannel) {
                await newChannel.permissionOverwrites.edit(member, {
                    [PermissionFlagsBits.ViewChannel]: true,
                    [PermissionFlagsBits.SendMessages]: true
                });
                console.log(`🔓 Granted permissions for ${member.displayName} to ${newCoordinate} channel`);
            }
        }
    } catch (error) {
        console.error('Error updating channel permissions:', error);
        // Don't throw - movement should still succeed even if permissions fail
    }
}

// Get movement display for a coordinate channel (Components V2 format)
export async function getMovementDisplay(guildId, userId, coordinate, isInteractionResponse = false) {
    const canMove = await canPlayerMove(guildId, userId);
    const entityId = `player_${userId}`;
    const validMoves = getValidMoves(coordinate);
    
    let description = '';
    let actionRows = [];
    
    if (canMove) {
        description = 'Choose a direction to move:';
        
        // Create 3x3 grid layout for movement buttons
        const movesByDirection = {};
        validMoves.forEach(move => {
            const directionKey = move.direction.split(' ')[1].toLowerCase(); // northwest, north, etc.
            movesByDirection[directionKey] = move;
        });
        
        // Row 1: Northwest, North, Northeast
        const row1 = ['northwest', 'north', 'northeast'].map(dir => 
            movesByDirection[dir] ? {
                type: 2,
                custom_id: movesByDirection[dir].customId,
                label: movesByDirection[dir].label,
                style: 1 // Primary
            } : null
        ).filter(Boolean);
        
        // Row 2: West, East (current position is center)
        const row2 = ['west', 'east'].map(dir => 
            movesByDirection[dir] ? {
                type: 2,
                custom_id: movesByDirection[dir].customId,
                label: movesByDirection[dir].label,
                style: 1 // Primary
            } : null
        ).filter(Boolean);
        
        // Row 3: Southwest, South, Southeast
        const row3 = ['southwest', 'south', 'southeast'].map(dir => 
            movesByDirection[dir] ? {
                type: 2,
                custom_id: movesByDirection[dir].customId,
                label: movesByDirection[dir].label,
                style: 1 // Primary
            } : null
        ).filter(Boolean);
        
        // Add non-empty rows
        if (row1.length > 0) {
            actionRows.push({
                type: 1, // Action Row
                components: row1
            });
        }
        if (row2.length > 0) {
            actionRows.push({
                type: 1, // Action Row
                components: row2
            });
        }
        if (row3.length > 0) {
            actionRows.push({
                type: 1, // Action Row
                components: row3
            });
        }
    } else {
        const timeUntil = await getTimeUntilRegeneration(guildId, entityId, 'stamina');
        description = `*You need to rest! You can move again in ${timeUntil}*`;
        
        // Show disabled movement buttons in same 3x3 grid layout
        const movesByDirection = {};
        validMoves.forEach(move => {
            const directionKey = move.direction.split(' ')[1].toLowerCase();
            movesByDirection[directionKey] = move;
        });
        
        // Disabled button rows
        const row1 = ['northwest', 'north', 'northeast'].map(dir => 
            movesByDirection[dir] ? {
                type: 2,
                custom_id: movesByDirection[dir].customId,
                label: movesByDirection[dir].label,
                style: 2, // Secondary
                disabled: true
            } : null
        ).filter(Boolean);
        
        const row2 = ['west', 'east'].map(dir => 
            movesByDirection[dir] ? {
                type: 2,
                custom_id: movesByDirection[dir].customId,
                label: movesByDirection[dir].label,
                style: 2, // Secondary
                disabled: true
            } : null
        ).filter(Boolean);
        
        const row3 = ['southwest', 'south', 'southeast'].map(dir => 
            movesByDirection[dir] ? {
                type: 2,
                custom_id: movesByDirection[dir].customId,
                label: movesByDirection[dir].label,
                style: 2, // Secondary
                disabled: true
            } : null
        ).filter(Boolean);
        
        // Add non-empty rows
        if (row1.length > 0) {
            actionRows.push({
                type: 1, // Action Row
                components: row1
            });
        }
        if (row2.length > 0) {
            actionRows.push({
                type: 1, // Action Row
                components: row2
            });
        }
        if (row3.length > 0) {
            actionRows.push({
                type: 1, // Action Row
                components: row3
            });
        }
    }
    
    description += '\n\n*You can move once every 12 hours*';
    
    // For interaction responses, we can't use Container at top level
    // Discord only allows Action Rows (type 1) at the top level for interactions
    if (isInteractionResponse) {
        // Return standard format with content field for interaction responses
        return {
            content: `## 🗺️ Current Location: ${coordinate}\n\n${description}`,
            components: actionRows
        };
    }
    
    // For channel messages, use full Components V2 format with Container
    const components = [{
        type: 17, // Container
        accent_color: 0x2ecc71, // Green for movement/exploration
        components: [
            // Location header
            {
                type: 10, // Text Display
                content: `## 🗺️ Current Location: ${coordinate}`
            },
            
            // Movement description
            {
                type: 10, // Text Display
                content: description
            },
            
            // Add separator before movement buttons
            { type: 14 }, // Separator
            
            // Movement button rows
            ...actionRows
        ]
    }];
    
    return {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components
    };
}

// Initialize player on map (admin function)
export async function initializePlayerOnMap(guildId, userId, startingCoordinate, client) {
    const entityId = `player_${userId}`;
    
    // Initialize stamina
    await initializeEntityPoints(guildId, entityId, ['stamina']);
    
    // Set starting location
    await setPlayerLocation(guildId, userId, startingCoordinate);
    
    // Grant initial channel permissions
    const safariData = await loadSafariContent();
    const activeMap = safariData[guildId]?.maps?.active;
    
    if (activeMap && safariData[guildId].maps[activeMap].coordinates[startingCoordinate]?.channelId) {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        const channel = await guild.channels.fetch(
            safariData[guildId].maps[activeMap].coordinates[startingCoordinate].channelId
        );
        
        if (channel) {
            await channel.permissionOverwrites.edit(member, {
                [PermissionFlagsBits.ViewChannel]: true,
                [PermissionFlagsBits.SendMessages]: true
            });
            console.log(`🔓 Granted initial permissions for ${member.displayName} to ${startingCoordinate} channel`);
        }
    }
    
    return { 
        success: true, 
        message: `Player initialized at ${startingCoordinate}` 
    };
}

// Get grid size for active map
export async function getMapGridSize(guildId) {
    const safariData = await loadSafariContent();
    const activeMap = safariData[guildId]?.maps?.active;
    
    if (!activeMap) return 5; // Default to 5x5
    
    return safariData[guildId].maps[activeMap]?.gridSize || 5;
}