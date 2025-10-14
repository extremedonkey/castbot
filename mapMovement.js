import { PermissionFlagsBits } from 'discord.js';
import { loadPlayerData, savePlayerData } from './storage.js';
import { loadSafariContent } from './safariManager.js';
import { hasEnoughPoints, usePoints, getTimeUntilRegeneration, initializeEntityPoints, getEntityPoints } from './pointsManager.js';

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
export async function getValidMoves(currentCoordinate, movementSchema = 'adjacent_8', guildId = null) {
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
    
    // Get the actual grid dimensions for this guild's map
    const gridDimensions = guildId ? await getMapGridDimensions(guildId) : { width: 7, height: 7 };
    
    // Import isCoordinateBlacklisted to check for restricted coordinates
    const { isCoordinateBlacklisted } = await import('./mapExplorer.js');
    
    const validMoves = [];
    const directionsToCheck = movementSchema === 'cardinal_4' 
        ? ['north', 'east', 'south', 'west']
        : Object.keys(moves);
    
    for (const direction of directionsToCheck) {
        const move = moves[direction];
        
        // Check if move is within grid bounds using proper width and height
        if (move.col >= 0 && move.col < gridDimensions.width && move.row >= 0 && move.row < gridDimensions.height) {
            const coordinate = String.fromCharCode(65 + move.col) + (move.row + 1);
            
            // Check if coordinate is blacklisted
            const isBlacklisted = guildId ? await isCoordinateBlacklisted(guildId, coordinate) : false;
            
            validMoves.push({
                direction: move.direction,
                coordinate: coordinate,
                customId: `safari_move_${coordinate}`,
                // Add label with coordinate for button display
                label: `${move.direction.split(' ')[1]} (${coordinate})`,
                disabled: isBlacklisted, // Mark as disabled if blacklisted
                blacklisted: isBlacklisted // Additional flag for UI handling
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
    if (!mapState) {
        return { 
            success: false, 
            message: `❌ You are not currently on the map. Please use Map Explorer to initialize your position.` 
        };
    }
    
    const oldCoordinate = mapState.currentCoordinate;
    
    // Validate move is allowed (unless admin move)
    if (!adminMove) {
        const validMoves = await getValidMoves(oldCoordinate, 'adjacent_8', guildId);
        const isValidMove = validMoves.some(move => move.coordinate === newCoordinate);
        
        if (!isValidMove) {
            return { 
                success: false, 
                message: `❌ You cannot move to ${newCoordinate} from ${oldCoordinate}. Your current location may have changed.` 
            };
        }
        
        // Check if target coordinate is blacklisted
        const targetMove = validMoves.find(move => move.coordinate === newCoordinate);
        if (targetMove && targetMove.blacklisted) {
            // Check for reverse blacklist unlock
            const reverseBlacklistCoverage = await getPlayerReverseBlacklistCoverage(guildId, userId);

            if (!reverseBlacklistCoverage.includes(newCoordinate)) {
                return {
                    success: false,
                    message: `⛔ You cannot access that location. It has been restricted.`
                };
            }

            // Player has item that unlocks this coordinate
            console.log(`✅ Player ${userId} using reverse blacklist item to access ${newCoordinate}`);
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
    
    // Update location first
    await setPlayerLocation(guildId, userId, newCoordinate);
    
    // Grant permissions to new channel BEFORE removing old
    if (client && oldCoordinate !== newCoordinate) {
        // First grant access to new channel
        await grantNewChannelPermissions(guildId, userId, newCoordinate, client);
        
        // Then remove old channel permissions
        await removeOldChannelPermissions(guildId, userId, oldCoordinate, client);
    }
    
    const message = adminMove 
        ? `📍 You have been moved by the Production team to **${newCoordinate}**!`
        : `You move to ${newCoordinate}!`;
    
    // Log player movement to Safari Log
    try {
        const { logPlayerMovement } = await import('./safariLogger.js');
        const playerData = await loadPlayerData();
        const playerName = playerData[guildId]?.players?.[userId]?.displayName || 
                          playerData[guildId]?.players?.[userId]?.username || 
                          'Unknown Player';
        
        await logPlayerMovement({
            guildId,
            userId,
            playerName,
            fromLocation: oldCoordinate,
            toLocation: newCoordinate,
            isAdminMove: adminMove,
            staminaConsumed: !bypassStamina ? movementCost : 0
        });
    } catch (logError) {
        console.error('Failed to log player movement:', logError);
        // Don't fail the movement if logging fails
    }
    
    return { 
        success: true, 
        message,
        oldCoordinate,
        newCoordinate,
        adminMove
    };
}

// Create movement notification for ephemeral response (Components V2 format)
export function createMovementNotification(guildId, userId, oldCoordinate, newCoordinate, newChannelId) {
    return {
        components: [{
            type: 17, // Container
            components: [{
                type: 10, // Text Display
                content: `✅ **You have moved to <#${newChannelId}>**\n\n📍 **${oldCoordinate}** → **${newCoordinate}**\n\nClick the channel link above to continue exploring!`
            }]
        }],
        flags: 1 << 15, // IS_COMPONENTS_V2
        ephemeral: true
    };
}

// Grant permissions to new channel
async function grantNewChannelPermissions(guildId, userId, newCoordinate, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        const safariData = await loadSafariContent();
        const activeMap = safariData[guildId]?.maps?.active;
        
        if (!activeMap) {
            console.error('No active map found for permission grant');
            return;
        }
        
        const mapData = safariData[guildId].maps[activeMap];
        const member = await guild.members.fetch(userId);
        
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
        console.error('Error granting new channel permissions:', error);
    }
}

// Remove permissions from old channel
async function removeOldChannelPermissions(guildId, userId, oldCoordinate, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        const safariData = await loadSafariContent();
        const activeMap = safariData[guildId]?.maps?.active;
        
        if (!activeMap) {
            console.error('No active map found for permission removal');
            return;
        }
        
        const mapData = safariData[guildId].maps[activeMap];
        const member = await guild.members.fetch(userId);
        
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
    } catch (error) {
        console.error('Error removing old channel permissions:', error);
    }
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
        
        // FIRST: Add permissions to new channel (before removing old)
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
        
        // THEN: Remove permissions from old channel (after granting new)
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
    } catch (error) {
        console.error('Error updating channel permissions:', error);
        // Don't throw - movement should still succeed even if permissions fail
    }
}

// Get movement display for a coordinate channel (Components V2 format)
export async function getMovementDisplay(guildId, userId, coordinate, isDeferred = false) {
    // For non-deferred calls, return deferred response immediately
    if (!isDeferred) {
        const { InteractionResponseType, InteractionResponseFlags } = await import('discord-interactions');
        return {
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: InteractionResponseFlags.EPHEMERAL }
        };
    }

    // Expensive operations below...
    const canMove = await canPlayerMove(guildId, userId);
    const entityId = `player_${userId}`;
    const validMoves = await getValidMoves(coordinate, 'adjacent_8', guildId);

    // Get player's reverse blacklist coverage for unlocking blacklisted coordinates
    const reverseBlacklistCoverage = await getPlayerReverseBlacklistCoverage(guildId, userId);

    let description = '';
    let actionRows = [];

    // Get grid dimensions for bounds checking
    const gridDimensions = await getMapGridDimensions(guildId);
    const col = coordinate.charCodeAt(0) - 65; // A=0, B=1, etc.
    const row = parseInt(coordinate.substring(1)) - 1; // 1-based to 0-based

    // Create 3x3 grid layout for movement buttons
    const movesByDirection = {};
    validMoves.forEach(move => {
        const directionKey = move.direction.split(' ')[1].toLowerCase(); // northwest, north, etc.
        movesByDirection[directionKey] = move;
    });

    // Helper to create button for direction
    const createButton = (dir, dirLabel, targetCol, targetRow) => {
        const isOutOfBounds = targetCol < 0 || targetCol >= gridDimensions.width || targetRow < 0 || targetRow >= gridDimensions.height;
        const targetCoordinate = !isOutOfBounds ? String.fromCharCode(65 + targetCol) + (targetRow + 1) : null;

        if (movesByDirection[dir] && !isOutOfBounds) {
            const move = movesByDirection[dir];
            // Check if coordinate is blacklisted
            if (move.blacklisted) {
                // Check if player has item that unlocks this coordinate
                const isUnlocked = reverseBlacklistCoverage.includes(move.coordinate);

                if (isUnlocked) {
                    // Green button for reverse blacklist unlock (same label, different color)
                    return {
                        type: 2,
                        custom_id: move.customId,
                        label: `${dirLabel} (${targetCoordinate})`, // Same as normal
                        style: canMove ? 3 : 2, // Success (green) if can move, Secondary if out of stamina
                        disabled: !canMove
                    };
                } else {
                    // Standard blacklisted button (disabled with 🚫)
                    return {
                        type: 2,
                        custom_id: `blacklisted_${dir}`,
                        label: `🚫 ${dirLabel}`,
                        style: 2, // Secondary
                        disabled: true
                    };
                }
            }

            // Valid move (not blacklisted)
            return {
                type: 2,
                custom_id: move.customId,
                label: `${dirLabel} (${targetCoordinate})`,
                style: canMove ? 1 : 2, // Primary if can move, Secondary if out of stamina
                disabled: !canMove
            };
        } else {
            // Invalid move (out of bounds)
            return {
                type: 2,
                custom_id: `disabled_${dir}`,
                label: dirLabel,
                style: 2, // Secondary
                disabled: true
            };
        }
    };
    
    // Row 1: Northwest, North, Northeast
    const row1 = {
        type: 1, // Action Row
        components: [
            createButton('northwest', '↖️ NW', col - 1, row - 1),
            createButton('north', '⬆️ North', col, row - 1),
            createButton('northeast', '↗️ NE', col + 1, row - 1)
        ]
    };
    
    // Row 2: West, Current (disabled), East
    const row2 = {
        type: 1, // Action Row
        components: [
            createButton('west', '⬅️ West', col - 1, row),
            {
                type: 2,
                custom_id: 'current_position',
                label: `📍 ${coordinate}`,
                style: 2, // Secondary
                disabled: true
            },
            createButton('east', '➡️ East', col + 1, row)
        ]
    };
    
    // Row 3: Southwest, South, Southeast
    const row3 = {
        type: 1, // Action Row
        components: [
            createButton('southwest', '↙️ SW', col - 1, row + 1),
            createButton('south', '⬇️ South', col, row + 1),
            createButton('southeast', '↘️ SE', col + 1, row + 1)
        ]
    };
    
    actionRows = [row1, row2, row3];
    
    // Get stamina data for both can move and can't move cases
    const stamina = await getEntityPoints(guildId, entityId, 'stamina');
    
    if (canMove) {
        description = `Choose a direction to move:`;
    } else {
        const timeUntil = await getTimeUntilRegeneration(guildId, entityId, 'stamina');
        description = `*You're too tired to move! Rest for ${timeUntil} before moving again.*`;
    }
    
    // Always use Components V2 format since ButtonHandlerFactory automatically adds the flag
    // For both interaction responses and channel messages
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
            
            // Stamina section
            {
                type: 9, // Section
                components: [
                    {
                        type: 10, // Text Display
                        content: `⚡ **Stamina:** ${stamina.current}/${stamina.max}`
                    }
                ],
                accessory: {
                    type: 2, // Button accessory
                    custom_id: `safari_navigate_refresh_${userId}_${coordinate}`,
                    label: 'Refresh',
                    emoji: { name: '🧭' },
                    style: 2 // Secondary
                }
            },
            
            // Add separator before movement buttons
            { type: 14 }, // Separator
            
            // Movement button rows
            ...actionRows
        ]
    }];
    
    return {
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

// Get grid dimensions for active map
export async function getMapGridDimensions(guildId) {
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) return { width: 7, height: 7 }; // Default to 7x7
    
    const activeMap = safariData[guildId].maps[activeMapId];
    
    // Support both new (gridWidth/gridHeight) and old (gridSize) formats
    const width = activeMap?.gridWidth || activeMap?.gridSize || 7;
    const height = activeMap?.gridHeight || activeMap?.gridSize || 7;
    
    return { width, height };
}

// Legacy function for backward compatibility
export async function getMapGridSize(guildId) {
    const dimensions = await getMapGridDimensions(guildId);
    return Math.max(dimensions.width, dimensions.height); // Return the larger dimension
}

// Get player's reverse blacklist coverage based on inventory items
export async function getPlayerReverseBlacklistCoverage(guildId, userId) {
    const { loadPlayerData } = await import('./storage.js');
    const playerData = await loadPlayerData();
    const inventory = playerData[guildId]?.players?.[userId]?.safari?.inventory || {};

    // Fast-path: Empty inventory = no unlocks
    if (Object.keys(inventory).length === 0) {
        return [];
    }

    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const items = safariData[guildId]?.items || {};

    const unlockedCoordinates = new Set();

    // Check each inventory item for reverse blacklist
    for (const [itemId, quantity] of Object.entries(inventory)) {
        // Only items with quantity > 0 grant access
        if (quantity > 0) {
            const item = items[itemId];
            if (item?.reverseBlacklist && Array.isArray(item.reverseBlacklist)) {
                item.reverseBlacklist.forEach(coord => unlockedCoordinates.add(coord));
            }
        }
    }

    return Array.from(unlockedCoordinates);
}