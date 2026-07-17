/**
 * Safari Import/Export System
 * Handles exporting Safari data to JSON and importing with smart merge logic
 */

import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { createArchive, readArchive, isZipBuffer, ArchiveError } from './safariArchive.js';

/** Export format identifier — present in every v2+ export envelope and package manifest. */
export const SAFARI_EXPORT_FORMAT = 'castbot-safari-export';
/** Highest export format version this build can produce AND import. v1 = legacy bare 5-key JSON. */
export const SAFARI_EXPORT_VERSION = 2;

/**
 * Single source of truth mapping user-facing export components to safariContent data keys.
 * `dataKey` is the key used inside export `data` / legacy exports (customActions is
 * sourced from guildData.buttons; mapImage is an asset, not a data section).
 */
export const COMPONENT_MAP = {
    stores:   { dataKey: 'stores',        label: 'Stores',         emoji: '🏪' },
    items:    { dataKey: 'items',         label: 'Items',          emoji: '📦' },
    actions:  { dataKey: 'customActions', label: 'Custom Actions', emoji: '🔘' },
    settings: { dataKey: 'safariConfig',  label: 'Settings',       emoji: '⚙️' },
    mapData:  { dataKey: 'maps',          label: 'Map Data',       emoji: '🗺️' },
    mapImage: { dataKey: null,            label: 'Map Image',      emoji: '🖼️' }
};

/**
 * Export Safari data for a guild in a compact JSON format
 * @param {string} guildId - Discord guild ID
 * @returns {string} Compact JSON string for export
 */
export async function exportSafariData(guildId) {
    try {
        const data = await loadSafariContent();
        const guildData = data[guildId] || {};
        
        const exportData = {
            stores: filterStoresForExport(guildData.stores || {}),
            items: filterItemsForExport(guildData.items || {}),
            safariConfig: filterConfigForExport(guildData.safariConfig || {}),
            maps: filterMapsForExport(guildData.maps || {}),
            customActions: filterCustomActionsForExport(guildData.buttons || {})
        };
        
        // Use compact JSON format to save characters
        return JSON.stringify(exportData, null, 1);
        
    } catch (error) {
        console.error('Error exporting Safari data:', error);
        throw new Error('Failed to export Safari data');
    }
}

/**
 * Store raw import JSON in map-storage channel for audit trail
 * @param {string} guildId - Guild ID
 * @param {string} importJson - Raw JSON string
 * @param {Object} importData - Parsed import data
 * @param {Object} context - Import context (userId, client)
 */
async function storeRawImport(guildId, importJson, importData, context) {
    try {
        const { client, userId } = context;
        if (!client) {
            console.log('ℹ️ No client available for raw import storage - skipping');
            return;
        }

        // Find map-storage channel (backwards compatible)
        const guild = await client.guilds.fetch(guildId);
        const mapStorageChannel = guild.channels.cache.find(
            ch => ch.name === '🗺️map-storage' || ch.name === 'map-storage' || ch.name === 'safari-storage'
        );

        if (!mapStorageChannel) {
            console.log('ℹ️ No map-storage channel found - skipping raw import storage');
            return;
        }

        // Create file attachment
        const timestamp = Date.now();
        const filename = `safari-import-${guildId}-${timestamp}.json`;
        const buffer = Buffer.from(importJson, 'utf-8');

        // Build sections summary
        const sections = [];
        if (importData.stores) sections.push(`Stores (${Object.keys(importData.stores).length})`);
        if (importData.items) sections.push(`Items (${Object.keys(importData.items).length})`);
        if (importData.maps) {
            const mapCount = Object.keys(importData.maps).filter(k => k !== 'active').length;
            sections.push(`Maps (${mapCount})`);
        }
        if (importData.customActions) sections.push(`Custom Actions (${Object.keys(importData.customActions).length})`);

        // Get user info
        let userMention = 'Unknown User';
        if (userId) {
            try {
                const user = await client.users.fetch(userId);
                userMention = `${user.username} (<@${userId}>)`;
            } catch (err) {
                userMention = `User ID: ${userId}`;
            }
        }

        // Create embed
        const embed = {
            title: '📥 Safari Import Uploaded',
            color: 0x3498db,  // Blue
            fields: [
                { name: 'Imported By', value: userMention, inline: true },
                { name: 'Import Time', value: `<t:${Math.floor(timestamp / 1000)}:F>`, inline: true },
                { name: 'File Size', value: `${(buffer.length / 1024).toFixed(1)} KB`, inline: true },
                { name: 'Sections', value: sections.join(', ') || 'Empty import', inline: false }
            ],
            footer: { text: 'Processing import... Results will appear in Safari Admin' },
            timestamp: new Date().toISOString()
        };

        // Upload to channel
        await mapStorageChannel.send({
            embeds: [embed],
            files: [{
                attachment: buffer,
                name: filename
            }]
        });

        console.log(`✅ Stored raw import in #${mapStorageChannel.name}: ${filename}`);

    } catch (error) {
        console.error('⚠️ Failed to store raw import:', error.message);
        // Don't throw - this is non-critical, import should continue
    }
}

/**
 * Resolve a map's grid dimensions for import validation.
 * Mirrors mapExplorer getGridDimensions: gridWidth/gridHeight preferred,
 * numeric gridSize fallback (old maps), legacy "7x7" string tolerated.
 * @param {Object} map - Map data object
 * @returns {{width: number, height: number}|null} Dimensions, or null if unknown
 */
export function resolveGridDimensions(map) {
    if (!map) return null;
    if (map.gridWidth > 0 && map.gridHeight > 0) {
        return { width: map.gridWidth, height: map.gridHeight };
    }
    if (typeof map.gridSize === 'number' && map.gridSize > 0) {
        return { width: map.gridSize, height: map.gridSize };
    }
    if (typeof map.gridSize === 'string') {
        const match = map.gridSize.match(/^(\d+)x(\d+)$/i);
        if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
    return null;
}

/**
 * Check whether a coordinate (e.g. "C3") fits within grid dimensions.
 * @param {string} coord - Coordinate string
 * @param {{width: number, height: number}} dims - Grid dimensions
 * @returns {boolean}
 */
export function isCoordInGrid(coord, dims) {
    const match = /^([A-Z])(\d+)$/.exec(String(coord).trim().toUpperCase());
    if (!match) return false;
    const col = match[1].charCodeAt(0) - 65;
    const row = parseInt(match[2]);
    return col >= 0 && col < dims.width && row >= 1 && row <= dims.height;
}

/**
 * Replace-mode pre-pass: clear destination sections that the import will re-populate.
 * Runs on the in-memory guild entry BEFORE the merge loops, so the whole operation
 * stays transactional under the single saveSafariContent() at the end of the import —
 * nothing is written if any later step throws.
 *
 * Deliberately preserved (NOT cleared), whatever the import contains:
 *   - entityPoints — player stat/HP pools: player progress, not safari content
 *   - roundHistory — clearing it belongs to the explicit Reset Game flow, not import
 *   - safaris, applications, enemies, attributeDefinitions, safariLogSettings,
 *     globalStores, priorityRoles — outside export scope entirely
 *   - playerData.json — never touched by import (orphaned inventory itemIds are inert
 *     behind guarded reads; the Replace confirm screen discloses this)
 *   - per-cell runtime plumbing: channelId, anchorMessageId, navigation, fogMapUrl, emoji
 *   - map-level identity/runtime: id, gridSize, imageFile, discordImageUrl,
 *     mapStorage*, category/categories, playerStates, globalState, config
 * attackQueue IS cleared when customActions are replaced: queued attacks resolve
 * against item/action definitions, and resolving them against a replaced set risks
 * orphaned-itemId behavior (Reset Game clears it for the same reason).
 */
function applyReplaceClears(guildEntry, importData, summary) {
    const cleared = { stores: 0, items: 0, customActions: 0, mapCells: 0 };

    if (importData.stores) {
        cleared.stores = Object.keys(guildEntry.stores || {}).length;
        guildEntry.stores = {};
    }
    if (importData.items) {
        cleared.items = Object.keys(guildEntry.items || {}).length;
        guildEntry.items = {};
    }
    if (importData.customActions) {
        cleared.customActions = Object.keys(guildEntry.buttons || {}).length;
        guildEntry.buttons = {};
        guildEntry.attackQueue = {};
    }
    if (importData.safariConfig) {
        const old = guildEntry.safariConfig || {};
        // Wholesale replace — re-attach only the runtime fields exports never carry
        // (the exact three filterConfigForExport excludes)
        guildEntry.safariConfig = {
            ...(old.currentRound !== undefined && { currentRound: old.currentRound }),
            ...(old.lastRoundTimestamp !== undefined && { lastRoundTimestamp: old.lastRoundTimestamp }),
            ...(old.safariLogChannelId !== undefined && { safariLogChannelId: old.safariLogChannelId })
        };
    }
    if (importData.maps) {
        const activeMapId = guildEntry.maps?.active;
        const activeMap = activeMapId ? guildEntry.maps?.[activeMapId] : null;
        if (activeMap) {
            for (const [coord, coordData] of Object.entries(activeMap.coordinates || {})) {
                // Reset cell CONTENT to fresh defaults; spread preserves the runtime
                // plumbing listed above (channelId, anchorMessageId, navigation, fogMapUrl, emoji)
                activeMap.coordinates[coord] = {
                    ...coordData,
                    baseContent: {
                        title: coord,
                        description: `You are at grid location ${coord}.`,
                        image: null,
                        clues: []
                    },
                    buttons: [],
                    stores: [],
                    hiddenCommands: {},
                    cellType: 'unexplored',
                    discovered: false,
                    specialEvents: [],
                    metadata: { ...coordData.metadata, lastModified: Date.now() }
                };
                cleared.mapCells++;
            }
            activeMap.blacklistedCoordinates = [];
        }
    }

    summary.replaceCleared = cleared;
}

/**
 * Import Safari data with smart merge logic
 * @param {string} guildId - Discord guild ID
 * @param {string} importJson - JSON string to import
 * @param {Object} context - Import context (userId, client) for audit trail
 * @param {Object} options - { mode: 'merge' (default) | 'replace' } — 'replace' clears
 *   the destination sections present in the import before merging (see applyReplaceClears)
 * @returns {Object} Import summary with counts
 */
export async function importSafariData(guildId, importJson, context = {}, options = {}) {
    try {
        // Parse and validate import data
        const importData = JSON.parse(importJson);
        validateImportData(importData);

        // Store raw import in #map-storage channel for audit trail
        await storeRawImport(guildId, importJson, importData, context);
        
        // Load current data
        const currentData = await loadSafariContent();
        if (!currentData[guildId]) {
            currentData[guildId] = {
                buttons: {},
                safaris: {},
                applications: {},
                stores: {},
                items: {},
                safariConfig: {}
            };
        }
        
        const summary = {
            stores: { created: 0, updated: 0 },
            items: { created: 0, updated: 0 },
            maps: { created: 0, updated: 0 },
            customActions: { created: 0, updated: 0 },
            config: false,
            warnings: []  // Track warnings (e.g., map ID mismatch)
        };

        // Replace mode: clear the sections this import re-populates (in memory only —
        // still transactional under the single saveSafariContent below)
        summary.mode = options.mode === 'replace' ? 'replace' : 'merge';
        if (summary.mode === 'replace') {
            applyReplaceClears(currentData[guildId], importData, summary);
        }

        // Import stores with smart merge
        if (importData.stores) {
            for (const [storeId, storeData] of Object.entries(importData.stores)) {
                if (currentData[guildId].stores[storeId]) {
                    // Update existing store
                    currentData[guildId].stores[storeId] = {
                        ...currentData[guildId].stores[storeId],
                        ...storeData,
                        metadata: {
                            ...currentData[guildId].stores[storeId].metadata,
                            lastModified: Date.now()
                        }
                    };
                    summary.stores.updated++;
                } else {
                    // Create new store
                    currentData[guildId].stores[storeId] = {
                        ...storeData,
                        metadata: {
                            createdAt: Date.now(),
                            lastModified: Date.now(),
                            totalSales: 0
                        }
                    };
                    summary.stores.created++;
                }
            }
        }
        
        // Import items with smart merge
        if (importData.items) {
            for (const [itemId, itemData] of Object.entries(importData.items)) {
                if (currentData[guildId].items[itemId]) {
                    // Update existing item
                    currentData[guildId].items[itemId] = {
                        ...currentData[guildId].items[itemId],
                        ...itemData,
                        metadata: {
                            ...currentData[guildId].items[itemId].metadata,
                            lastModified: Date.now()
                        }
                    };
                    summary.items.updated++;
                } else {
                    // Create new item
                    currentData[guildId].items[itemId] = {
                        ...itemData,
                        metadata: {
                            createdAt: Date.now(),
                            lastModified: Date.now(),
                            totalSold: 0
                        }
                    };
                    summary.items.created++;
                }
            }
        }
        
        // Import maps with smart merge
        if (importData.maps) {
            if (!currentData[guildId].maps) {
                currentData[guildId].maps = {};
            }

            for (const [mapId, mapData] of Object.entries(importData.maps)) {
                if (mapId === 'active') {
                    // Skip 'active' pointer - we'll handle it after processing the actual map
                    continue;
                }

                // CRITICAL FIX: Use active map as target instead of imported map ID
                // This prevents creating "ghost maps" when map IDs don't match
                const activeMapId = currentData[guildId].maps?.active;
                const targetMapId = activeMapId || mapId;

                // Grid dimensions of the PRE-EXISTING target map (null if map is new —
                // a fresh map takes the import's own grid, so validation is vacuous)
                const targetDims = resolveGridDimensions(currentData[guildId].maps[targetMapId]);

                // Initialize target map if it doesn't exist
                if (!currentData[guildId].maps[targetMapId]) {
                    currentData[guildId].maps[targetMapId] = {
                        id: targetMapId,
                        name: mapData.name,
                        gridSize: mapData.gridSize,
                        coordinates: {},
                        metadata: {
                            createdAt: Date.now(),
                            lastModified: Date.now()
                        }
                    };
                }

                const existingMap = currentData[guildId].maps[targetMapId];

                // Update map-level fields
                existingMap.name = mapData.name || existingMap.name;
                // NEVER overwrite an existing map's gridSize — on old maps (no gridWidth/gridHeight)
                // it drives movement bounds, and importing a bigger template's gridSize would let
                // players move into coordinates that have no channels
                if (!existingMap.gridSize) {
                    existingMap.gridSize = mapData.gridSize;
                } else if (mapData.gridSize && targetDims && resolveGridDimensions(mapData) &&
                           (resolveGridDimensions(mapData).width !== targetDims.width ||
                            resolveGridDimensions(mapData).height !== targetDims.height)) {
                    summary.warnings.push({
                        type: 'grid_size_mismatch',
                        message: `Imported map grid (${resolveGridDimensions(mapData).width}x${resolveGridDimensions(mapData).height}) differs from active map (${targetDims.width}x${targetDims.height}) — out-of-grid data was skipped`
                    });
                }
                if (mapData.blacklistedCoordinates) {
                    let blacklist = mapData.blacklistedCoordinates;
                    if (targetDims) {
                        const dropped = blacklist.filter(c => !isCoordInGrid(c, targetDims));
                        if (dropped.length > 0) {
                            summary.warnings.push({
                                type: 'out_of_grid_blacklist',
                                message: `Skipped ${dropped.length} blacklisted coordinate(s) outside the active map grid: ${dropped.join(', ')}`
                            });
                            blacklist = blacklist.filter(c => isCoordInGrid(c, targetDims));
                        }
                    }
                    existingMap.blacklistedCoordinates = blacklist;
                }

                // Merge coordinates into target map (skipping any outside the active map's grid)
                const skippedCoords = [];
                for (const [coord, coordData] of Object.entries(mapData.coordinates || {})) {
                    if (targetDims && !isCoordInGrid(coord, targetDims)) {
                        skippedCoords.push(coord);
                        continue;
                    }
                    if (existingMap.coordinates[coord]) {
                        // Update existing coordinate - PRESERVE runtime fields (channelId, anchorMessageId, navigation, fogMapUrl)
                        existingMap.coordinates[coord] = {
                            ...existingMap.coordinates[coord],  // Preserve ALL existing fields first
                            baseContent: coordData.baseContent,
                            buttons: coordData.buttons,
                            cellType: coordData.cellType,
                            discovered: coordData.discovered,
                            // Update stores array if provided
                            ...(coordData.stores !== undefined && { stores: coordData.stores }),
                            // Update hidden commands if provided
                            ...(coordData.hiddenCommands !== undefined && { hiddenCommands: coordData.hiddenCommands }),
                            // Update special events if provided
                            ...(coordData.specialEvents !== undefined && { specialEvents: coordData.specialEvents }),
                            metadata: {
                                ...existingMap.coordinates[coord].metadata,
                                lastModified: Date.now()
                            }
                        };
                    } else {
                        // New coordinate (no existing data to preserve)
                        existingMap.coordinates[coord] = {
                            ...coordData,
                            metadata: {
                                createdAt: Date.now(),
                                lastModified: Date.now()
                            }
                        };
                    }
                }

                if (skippedCoords.length > 0) {
                    summary.warnings.push({
                        type: 'out_of_grid_coordinates',
                        message: `Skipped ${skippedCoords.length} coordinate(s) outside the active map grid: ${skippedCoords.join(', ')}`
                    });
                }

                // Set as active if not already set
                if (!currentData[guildId].maps.active) {
                    currentData[guildId].maps.active = targetMapId;
                }

                // Track for summary and warnings
                if (activeMapId && activeMapId !== mapId) {
                    // ID mismatch - merged into active map
                    summary.warnings.push({
                        type: 'map_id_mismatch',
                        message: `Imported map "${mapId}" merged into active map "${activeMapId}"`,
                        imported: mapId,
                        target: activeMapId
                    });
                    summary.maps.updated++;
                } else if (activeMapId === mapId) {
                    // Exact match - normal update
                    summary.maps.updated++;
                } else {
                    // No existing map - created new
                    summary.maps.created++;
                }
            }
        }

        // Import Custom Actions with smart merge
        if (importData.customActions) {
            if (!currentData[guildId].buttons) {
                currentData[guildId].buttons = {};
            }

            for (const [buttonId, buttonData] of Object.entries(importData.customActions)) {
                // Initialize limit tracking for all actions (resets claimedBy)
                const actionsWithLimits = (buttonData.actions || []).map(initializeActionLimitTracking);

                if (currentData[guildId].buttons[buttonId]) {
                    // Update existing Custom Action
                    const existing = currentData[guildId].buttons[buttonId];
                    currentData[guildId].buttons[buttonId] = {
                        ...buttonData,
                        actions: actionsWithLimits,  // Use initialized actions
                        // Preserve menu-surface fields when the import (e.g. an older export format) lacks them —
                        // otherwise re-importing would silently strip actions out of the Crafting/Player menus
                        ...(buttonData.menuVisibility === undefined && buttonData.showInInventory === undefined &&
                            { menuVisibility: existing.menuVisibility || (existing.showInInventory ? 'player_menu' : 'none') }),
                        ...(buttonData.inventoryConfig === undefined && existing.inventoryConfig !== undefined &&
                            { inventoryConfig: existing.inventoryConfig }),
                        ...(buttonData.linkedItems === undefined && existing.linkedItems !== undefined &&
                            { linkedItems: existing.linkedItems }),
                        ...(buttonData.displayMode === undefined && existing.displayMode !== undefined &&
                            { displayMode: existing.displayMode }),
                        metadata: {
                            // Preserve runtime fields
                            createdBy: existing.metadata?.createdBy,
                            createdAt: existing.metadata?.createdAt,
                            usageCount: existing.metadata?.usageCount || 0,
                            // Update from import
                            tags: buttonData.metadata?.tags || [],
                            lastModified: Date.now()
                        },
                        // Preserve coordinates as-is (user creates matching map manually)
                        coordinates: buttonData.coordinates || []
                    };
                    summary.customActions.updated++;
                } else {
                    // Create new Custom Action
                    currentData[guildId].buttons[buttonId] = {
                        ...buttonData,
                        actions: actionsWithLimits,  // Use initialized actions
                        metadata: {
                            createdBy: null,  // No creator info on import
                            createdAt: Date.now(),
                            lastModified: Date.now(),
                            usageCount: 0,
                            tags: buttonData.metadata?.tags || []
                        },
                        // Preserve coordinates as-is (user creates matching map manually)
                        coordinates: buttonData.coordinates || []
                    };
                    summary.customActions.created++;
                }
            }
        }

        // Import safari config (merge with existing)
        if (importData.safariConfig) {
            currentData[guildId].safariConfig = {
                ...currentData[guildId].safariConfig,
                ...importData.safariConfig,
                // Preserve runtime fields
                currentRound: currentData[guildId].safariConfig?.currentRound,
                lastRoundTimestamp: currentData[guildId].safariConfig?.lastRoundTimestamp
            };
            summary.config = true;
        }
        
        // Save updated data
        await saveSafariContent(currentData);
        
        return summary;
        
    } catch (error) {
        console.error('Error importing Safari data:', error);
        if (error instanceof SyntaxError) {
            throw new Error('Invalid JSON format. Please check your import data.');
        }
        throw new Error('Failed to import Safari data: ' + error.message);
    }
}

/**
 * Filter stores for export (exclude metadata and runtime fields)
 * @param {Object} stores - Store data
 * @returns {Object} Filtered stores for export
 */
function filterStoresForExport(stores) {
    const filtered = {};
    for (const [id, store] of Object.entries(stores)) {
        filtered[id] = {
            id: store.id,
            name: store.name,
            emoji: store.emoji,
            description: store.description,
            items: store.items || [],
            settings: {
                storeownerText: store.settings?.storeownerText
                // Exclude: accentColor, requiresRole (optional fields)
            }
        };
    }
    return filtered;
}

/**
 * Filter items for export (exclude metadata and runtime fields)
 * @param {Object} items - Item data
 * @returns {Object} Filtered items for export
 */
function filterItemsForExport(items) {
    const filtered = {};
    for (const [id, item] of Object.entries(items)) {
        filtered[id] = {
            id: item.id,
            name: item.name,
            description: item.description,
            emoji: item.emoji,
            category: item.category,
            basePrice: item.basePrice,
            maxQuantity: item.maxQuantity,
            // Include optional game mechanics fields if they exist
            ...(item.goodOutcomeValue !== undefined && { goodOutcomeValue: item.goodOutcomeValue }),
            ...(item.badOutcomeValue !== undefined && { badOutcomeValue: item.badOutcomeValue }),
            ...(item.attackValue !== undefined && { attackValue: item.attackValue }),
            ...(item.defenseValue !== undefined && { defenseValue: item.defenseValue }),
            ...(item.consumable !== undefined && { consumable: item.consumable }),
            ...(item.goodYieldEmoji !== undefined && { goodYieldEmoji: item.goodYieldEmoji }),
            ...(item.badYieldEmoji !== undefined && { badYieldEmoji: item.badYieldEmoji }),
            // Movement & stats fields (v2.1) — all consumed via guarded reads, so out-of-grid
            // reverseBlacklist coords or not-yet-defined attributeIds are inert, never errors
            ...(item.staminaBoost !== undefined && { staminaBoost: item.staminaBoost }),
            ...(Array.isArray(item.reverseBlacklist) && item.reverseBlacklist.length > 0 && { reverseBlacklist: item.reverseBlacklist }),
            ...(Array.isArray(item.attributeModifiers) && item.attributeModifiers.length > 0 && { attributeModifiers: item.attributeModifiers })
        };
    }
    return filtered;
}

/**
 * Filter maps for export (exclude runtime fields)
 * @param {Object} maps - Map data
 * @returns {Object} Filtered maps for export
 */
function filterMapsForExport(maps) {
    const filtered = {};
    
    for (const [mapId, mapData] of Object.entries(maps)) {
        if (mapId === 'active') {
            // Preserve active map reference
            filtered.active = mapData;
            continue;
        }
        
        filtered[mapId] = {
            id: mapData.id,
            name: mapData.name,
            gridSize: mapData.gridSize,
            coordinates: {},
            // Include blacklisted coordinates if they exist
            ...(mapData.blacklistedCoordinates && { blacklistedCoordinates: mapData.blacklistedCoordinates })
        };
        
        // Filter coordinates - exclude runtime fields
        for (const [coord, coordData] of Object.entries(mapData.coordinates || {})) {
            filtered[mapId].coordinates[coord] = {
                baseContent: coordData.baseContent,
                buttons: coordData.buttons || [],
                cellType: coordData.cellType,
                discovered: coordData.discovered,
                // Include stores array if it exists (CRITICAL for proper import)
                ...(coordData.stores && { stores: coordData.stores }),
                // Include hidden commands if they exist
                ...(coordData.hiddenCommands && { hiddenCommands: coordData.hiddenCommands }),
                // Include special events if they exist
                ...(coordData.specialEvents && { specialEvents: coordData.specialEvents })
                // Exclude: channelId, anchorMessageId, navigation, fogMapUrl (runtime fields)
            };
        }
    }
    
    return filtered;
}

/**
 * Filter safari config for export (exclude runtime fields)
 * @param {Object} config - Safari config data
 * @returns {Object} Filtered config for export
 */
function filterConfigForExport(config) {
    const filtered = {
        // Currency & Inventory
        currencyName: config.currencyName,
        currencyEmoji: config.currencyEmoji,
        inventoryName: config.inventoryName,
        ...(config.inventoryEmoji !== undefined && { inventoryEmoji: config.inventoryEmoji }),
        ...(config.defaultStartingCurrencyValue !== undefined && { defaultStartingCurrencyValue: config.defaultStartingCurrencyValue }),

        // Events
        ...(config.goodEventName !== undefined && { goodEventName: config.goodEventName }),
        ...(config.badEventName !== undefined && { badEventName: config.badEventName }),
        ...(config.goodEventEmoji !== undefined && { goodEventEmoji: config.goodEventEmoji }),
        ...(config.badEventEmoji !== undefined && { badEventEmoji: config.badEventEmoji }),

        // Round Probabilities
        ...(config.round1GoodProbability !== undefined && { round1GoodProbability: config.round1GoodProbability }),
        ...(config.round2GoodProbability !== undefined && { round2GoodProbability: config.round2GoodProbability }),
        ...(config.round3GoodProbability !== undefined && { round3GoodProbability: config.round3GoodProbability }),

        // Stamina Settings
        ...(config.staminaRegenerationMinutes !== undefined && { staminaRegenerationMinutes: config.staminaRegenerationMinutes }),
        ...(config.maxStamina !== undefined && { maxStamina: config.maxStamina }),

        // Crafting (custom theme, e.g. "🌱 Gardening")
        ...(config.craftingName !== undefined && { craftingName: config.craftingName }),
        ...(config.craftingEmoji !== undefined && { craftingEmoji: config.craftingEmoji }),

        // Player Menu Settings (enableGlobalCommands is the live field — an earlier defunct name was exported here until 2026-07)
        ...(config.enableGlobalCommands !== undefined && { enableGlobalCommands: config.enableGlobalCommands })

        // Exclude: currentRound, lastRoundTimestamp, safariLogChannelId (runtime/server-specific fields)
    };
    return filtered;
}

/**
 * Filter a single action to remove runtime limit tracking
 * @param {Object} action - Action object
 * @returns {Object} Filtered action
 */
function filterActionForExport(action) {
    const filtered = {
        type: action.type,
        order: action.order,
        config: { ...action.config },
        executeOn: action.executeOn
    };

    // If action has limit tracking, preserve the limit CONFIG but remove claim tracking (claimedBy/claims — runtime)
    if (filtered.config.limit) {
        const limit = filtered.config.limit;
        const exportLimit = { type: limit.type };
        if (limit.type === 'once_per_period' && limit.periodMs) {
            exportLimit.periodMs = limit.periodMs;
        }
        if (limit.type === 'custom') {
            // Full custom gate config (maxClaims × scope × unique × reset) — without it the
            // limit imports as unlimited (maxClaims=null → Infinity in checkCustomGate)
            if (limit.maxClaims !== undefined) exportLimit.maxClaims = limit.maxClaims;
            if (limit.scope !== undefined) exportLimit.scope = limit.scope;
            if (limit.unique !== undefined) exportLimit.unique = limit.unique;
            if (limit.reset !== undefined) exportLimit.reset = limit.reset;
            if (limit.periodMs !== undefined) exportLimit.periodMs = limit.periodMs;
            if (limit.anchorMs !== undefined) exportLimit.anchorMs = limit.anchorMs;
            // Exclude: claims (runtime), templateId (usageTemplates don't transfer between servers)
        }
        filtered.config.limit = exportLimit;
    }

    return filtered;
}

/**
 * Initialize limit tracking for imported actions
 * @param {Object} action - Action object from import
 * @returns {Object} Action with initialized limit tracking
 */
function initializeActionLimitTracking(action) {
    const initialized = { ...action };

    // Initialize claimedBy based on limit type
    if (initialized.config?.limit) {
        const limitType = initialized.config.limit.type;

        if (limitType === 'once_globally') {
            // Single user ID - initialize as null (nobody claimed yet)
            initialized.config.limit.claimedBy = null;
        } else if (limitType === 'once_per_player') {
            // Array of user IDs - initialize as empty array
            initialized.config.limit.claimedBy = [];
        } else if (limitType === 'once_per_period') {
            // Object map of userId → timestamp - initialize as empty object
            initialized.config.limit.claimedBy = {};
        } else if (limitType === 'custom') {
            // Custom limits track claims as [{u, t}] - initialize as empty array (fresh server)
            initialized.config.limit.claims = [];
        }
        // For 'unlimited', no claimedBy field needed
    }

    return initialized;
}

/**
 * Filter Custom Actions for export (exclude runtime/Discord-specific fields)
 * @param {Object} buttons - Custom Actions data from safariContent.json
 * @returns {Object} Filtered Custom Actions for export
 */
function filterCustomActionsForExport(buttons) {
    const filtered = {};

    for (const [id, button] of Object.entries(buttons)) {
        filtered[id] = {
            // Core Identity
            id: button.id,
            name: button.name,
            label: button.label,
            emoji: button.emoji,
            style: button.style,

            // Action Sequence - FILTER each action to remove limit tracking
            actions: (button.actions || []).map(filterActionForExport),

            // Trigger Configuration
            trigger: button.trigger,

            // Conditions
            conditions: button.conditions || { logic: "AND", items: [] },

            // Map Integration (CRITICAL - preserve for Phase 2 import)
            coordinates: button.coordinates || [],

            // Menu Surface (Crafting Menu / Player Menu) — resolve legacy showInInventory at export time
            menuVisibility: button.menuVisibility || (button.showInInventory ? 'player_menu' : 'none'),
            ...(button.inventoryConfig && { inventoryConfig: button.inventoryConfig }),
            ...(Array.isArray(button.linkedItems) && button.linkedItems.length > 0 && { linkedItems: button.linkedItems }),
            ...(button.displayMode && { displayMode: button.displayMode }),

            // Optional Fields
            ...(button.description && { description: button.description }),

            // Metadata - FILTER OUT runtime fields but keep tags
            metadata: {
                tags: button.metadata?.tags || []
                // Exclude: createdBy, createdAt, lastModified, usageCount (runtime data)
            }
        };
    }

    return filtered;
}

/**
 * Validate import data structure
 * @param {Object} data - Import data to validate
 * @throws {Error} If data structure is invalid
 */
function validateImportData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Import data must be a valid JSON object');
    }
    
    const validSections = ['stores', 'items', 'safariConfig', 'maps', 'customActions'];
    const hasValidSection = validSections.some(section => data[section]);

    if (!hasValidSection) {
        throw new Error('Import data must contain at least one of: stores, items, safariConfig, maps, or customActions');
    }
    
    // Basic structure validation
    if (data.stores && typeof data.stores !== 'object') {
        throw new Error('Stores section must be an object');
    }
    
    if (data.items && typeof data.items !== 'object') {
        throw new Error('Items section must be an object');
    }
    
    if (data.safariConfig && typeof data.safariConfig !== 'object') {
        throw new Error('Safari config section must be an object');
    }
    
    if (data.maps && typeof data.maps !== 'object') {
        throw new Error('Maps section must be an object');
    }

    if (data.customActions && typeof data.customActions !== 'object') {
        throw new Error('Custom Actions section must be an object');
    }
}

/**
 * Format import summary for user display
 * @param {Object} summary - Import summary object
 * @returns {string} Formatted summary message
 */
export function formatImportSummary(summary) {
    const parts = [];
    
    if (summary.stores.created > 0 || summary.stores.updated > 0) {
        const storeText = [];
        if (summary.stores.created > 0) storeText.push(`${summary.stores.created} created`);
        if (summary.stores.updated > 0) storeText.push(`${summary.stores.updated} updated`);
        parts.push(`🏪 **Stores:** ${storeText.join(', ')}`);
    }
    
    if (summary.items.created > 0 || summary.items.updated > 0) {
        const itemText = [];
        if (summary.items.created > 0) itemText.push(`${summary.items.created} created`);
        if (summary.items.updated > 0) itemText.push(`${summary.items.updated} updated`);
        parts.push(`📦 **Items:** ${itemText.join(', ')}`);
    }
    
    if (summary.maps.created > 0 || summary.maps.updated > 0) {
        const mapText = [];
        if (summary.maps.created > 0) mapText.push(`${summary.maps.created} created`);
        if (summary.maps.updated > 0) mapText.push(`${summary.maps.updated} updated`);
        parts.push(`🗺️ **Maps:** ${mapText.join(', ')}`);
    }

    if (summary.customActions?.created > 0 || summary.customActions?.updated > 0) {
        const actionText = [];
        if (summary.customActions.created > 0) actionText.push(`${summary.customActions.created} created`);
        if (summary.customActions.updated > 0) actionText.push(`${summary.customActions.updated} updated`);
        parts.push(`🔘 **Custom Actions:** ${actionText.join(', ')}`);
    }

    if (summary.config) {
        parts.push(`⚙️ **Config:** Updated`);
    }

    if (summary.mode === 'replace' && summary.replaceCleared) {
        const rc = summary.replaceCleared;
        const clearedParts = [];
        if (rc.stores) clearedParts.push(`${rc.stores} store${rc.stores === 1 ? '' : 's'}`);
        if (rc.items) clearedParts.push(`${rc.items} item${rc.items === 1 ? '' : 's'}`);
        if (rc.customActions) clearedParts.push(`${rc.customActions} custom action${rc.customActions === 1 ? '' : 's'}`);
        if (rc.mapCells) clearedParts.push(`${rc.mapCells} map cell${rc.mapCells === 1 ? '' : 's'}`);
        parts.push('');
        parts.push(`♻️ **Replace mode:** cleared ${clearedParts.length ? clearedParts.join(', ') : 'no existing entries'} before importing${rc.customActions ? ' (attack queue reset)' : ''}`);
    }

    // Show warnings if any
    if (summary.warnings && summary.warnings.length > 0) {
        parts.push(''); // Add blank line before warnings
        parts.push('⚠️ **Warnings:**');
        summary.warnings.forEach(warning => {
            if (warning.type === 'map_id_mismatch') {
                parts.push(`   • Map ID mismatch: Import merged into active map`);
                parts.push(`     (Imported: \`${warning.imported}\`, Active: \`${warning.target}\`)`);
            } else if (warning.message) {
                parts.push(`   • ${warning.message}`);
            }
        });
    }

    if (parts.length === 0) {
        return '✅ Import completed with no changes.';
    }

    return `✅ **Import completed successfully!**\n\n${parts.join('\n')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// v2 export pipeline — granular components, versioned envelope, ZIP package
// ═══════════════════════════════════════════════════════════════════════════

/** Count meaningful entries in a filtered component (undefined-valued config keys don't count). */
function countComponentEntries(componentId, filtered) {
    if (!filtered || typeof filtered !== 'object') return 0;
    if (componentId === 'settings') {
        return Object.values(filtered).filter(v => v !== undefined).length;
    }
    if (componentId === 'mapData') {
        return Object.keys(filtered).filter(k => k !== 'active').length;
    }
    return Object.keys(filtered).length;
}

/** Derive component ids (COMPONENT_MAP keys) present in a data object (legacy or v2 `data`). */
function deriveIncludedComponents(data) {
    const out = [];
    for (const [compId, comp] of Object.entries(COMPONENT_MAP)) {
        if (!comp.dataKey) continue;
        const section = data?.[comp.dataKey];
        if (section && typeof section === 'object' && countComponentEntries(compId, section) > 0) {
            out.push(compId);
        }
    }
    return out;
}

/**
 * Build a v2 export envelope for the selected data components.
 * Reuses the existing per-section whitelist filters — the single place export
 * fidelity is defined (see the ratchet tests before touching them).
 * @param {string} guildId
 * @param {string[]} componentIds - subset of COMPONENT_MAP keys (mapImage ignored here)
 * @returns {{envelope: Object, emptyComponents: string[]}}
 */
export async function buildExportEnvelope(guildId, componentIds) {
    const all = await loadSafariContent();
    const guildData = all[guildId] || {};

    const data = {};
    const includedComponents = [];
    const emptyComponents = [];
    const counts = {};

    for (const compId of componentIds) {
        const comp = COMPONENT_MAP[compId];
        if (!comp?.dataKey) continue;

        let filtered;
        switch (compId) {
            case 'stores': filtered = filterStoresForExport(guildData.stores || {}); break;
            case 'items': filtered = filterItemsForExport(guildData.items || {}); break;
            case 'actions': filtered = filterCustomActionsForExport(guildData.buttons || {}); break;
            case 'settings': filtered = filterConfigForExport(guildData.safariConfig || {}); break;
            case 'mapData': filtered = filterMapsForExport(guildData.maps || {}); break;
            default: continue;
        }

        const count = countComponentEntries(compId, filtered);
        if (count === 0) {
            emptyComponents.push(compId);
            continue;
        }
        data[comp.dataKey] = filtered;
        includedComponents.push(compId);
        counts[compId] = count;
    }

    const envelope = {
        format: SAFARI_EXPORT_FORMAT,
        formatVersion: SAFARI_EXPORT_VERSION,
        exportType: 'json',
        includedComponents,
        sourceGuildId: guildId,
        exportedAt: new Date().toISOString(),
        counts,
        data
    };

    return { envelope, emptyComponents };
}

/**
 * Locate the active map's image and prepare it for packaging.
 *
 * Resolution order (updateMapImage writes `<mapId>_updated.*` WITHOUT updating
 * mapData.imageFile, so the updated variants are probed first; stored
 * discordImageUrl expires in ~24h, so the storage MESSAGE is refetched for a
 * fresh URL before falling back to the stale one):
 *   1. img/<guildId>/<mapId>_updated.jpg   (disk)
 *   2. img/<guildId>/<mapId>_updated.png   (disk)
 *   3. mapData.imageFile                   (disk, repo-relative)
 *   4. fresh CDN URL via mapStorageChannelId/mapStorageMessageId
 *   5. mapData.discordImageUrl             (last chance, likely expired)
 *
 * The stored image is the GRID-OVERLAID composite (80px white border + grid
 * lines). The border is cropped off so the packaged image can be fed back into
 * map creation without double-bordering (the 4px grid lines remain baked in —
 * disclosed via kind: 'grid_cropped').
 *
 * @returns {Object} { buffer, ext, kind, sourceMapId, gridWidth, gridHeight, missingReason }
 *   buffer is null (with missingReason set) when no image could be located.
 */
export async function resolveMapImage(guildId, client) {
    const all = await loadSafariContent();
    const guildData = all[guildId] || {};
    const activeMapId = guildData.maps?.active;
    const mapData = activeMapId ? guildData.maps?.[activeMapId] : null;
    if (!mapData) {
        return { buffer: null, missingReason: 'this server has no active map' };
    }

    const dims = resolveGridDimensions(mapData) || { width: 7, height: 7 };
    const fs = await import('fs/promises');
    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    const repoRoot = path.dirname(fileURLToPath(import.meta.url));

    let buffer = null;
    let ext = 'png';

    const diskCandidates = [
        path.join(repoRoot, 'img', guildId, `${activeMapId}_updated.jpg`),
        path.join(repoRoot, 'img', guildId, `${activeMapId}_updated.png`),
        ...(mapData.imageFile ? [path.join(repoRoot, mapData.imageFile)] : [])
    ];
    for (const candidate of diskCandidates) {
        try {
            buffer = await fs.readFile(candidate);
            ext = /\.jpe?g$/i.test(candidate) ? 'jpg' : 'png';
            console.log(`🖼️ [SafariExport] Map image from disk: ${candidate}`);
            break;
        } catch { /* try next candidate */ }
    }

    if (!buffer && mapData.mapStorageMessageId && mapData.mapStorageChannelId) {
        try {
            const { DiscordRequest } = await import('./utils.js');
            const message = await DiscordRequest(
                `channels/${mapData.mapStorageChannelId}/messages/${mapData.mapStorageMessageId}`,
                { method: 'GET' }
            );
            const url = message?.attachments?.[0]?.url?.trim().replace(/&+$/, '');
            if (url) {
                const res = await fetch(url);
                if (res.ok) {
                    buffer = Buffer.from(await res.arrayBuffer());
                    ext = /\.jpe?g($|\?)/i.test(url) ? 'jpg' : 'png';
                    console.log(`🖼️ [SafariExport] Map image via fresh storage-message URL`);
                }
            }
        } catch (err) {
            console.log(`⚠️ [SafariExport] Storage-message image fetch failed: ${err.message}`);
        }
    }

    if (!buffer && mapData.discordImageUrl) {
        try {
            const res = await fetch(mapData.discordImageUrl.trim().replace(/&+$/, ''));
            if (res.ok) {
                buffer = Buffer.from(await res.arrayBuffer());
                ext = /\.jpe?g($|\?)/i.test(mapData.discordImageUrl) ? 'jpg' : 'png';
                console.log(`🖼️ [SafariExport] Map image via stored CDN URL`);
            }
        } catch { /* expired — expected */ }
    }

    if (!buffer) {
        return { buffer: null, missingReason: 'the map image could not be found (not on disk, and Discord storage was unavailable)' };
    }

    // Crop the compositor's 80px border so re-import doesn't double-border
    let kind = 'grid_full';
    try {
        const sharp = (await import('sharp')).default;
        const meta = await sharp(buffer).metadata();
        if (meta.width > 160 && meta.height > 160) {
            const cropped = sharp(buffer).extract({
                left: 80, top: 80, width: meta.width - 160, height: meta.height - 160
            });
            buffer = ext === 'jpg'
                ? await cropped.jpeg({ quality: 90 }).toBuffer()
                : await cropped.png().toBuffer();
            kind = 'grid_cropped';
        }
    } catch (err) {
        console.log(`⚠️ [SafariExport] Border crop failed, packaging uncropped image: ${err.message}`);
    }

    return {
        buffer, ext, kind,
        sourceMapId: activeMapId,
        gridWidth: dims.width,
        gridHeight: dims.height,
        missingReason: null
    };
}

/**
 * Build the deliverable export for the selected components.
 * With mapImage selected (and resolvable): a ZIP package
 * (manifest.json + data.json + assets/map.png|jpg); otherwise a v2 JSON envelope.
 * Falls back from ZIP to JSON (with a note) when the image is missing or the
 * package can't fit Discord's ~10MiB bot upload cap even after JPEG re-encode.
 *
 * @param {string} guildId
 * @param {string[]} componentIds - COMPONENT_MAP keys the user selected
 * @param {Object} client - Discord client (used for CDN image fallback)
 * @returns {Object} { kind: 'zip'|'json', buffer, filename, contentType, manifest, notes, includedComponents }
 */
export async function buildExportPackage(guildId, componentIds, client) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const wantsImage = componentIds.includes('mapImage');
    const dataComponents = componentIds.filter(c => c !== 'mapImage' && COMPONENT_MAP[c]?.dataKey);

    const { envelope, emptyComponents } = await buildExportEnvelope(guildId, dataComponents);
    const notes = emptyComponents.map(c =>
        `${COMPONENT_MAP[c].emoji} ${COMPONENT_MAP[c].label}: nothing to export — skipped`);

    let image = null;
    if (wantsImage) {
        image = await resolveMapImage(guildId, client);
        if (!image.buffer) {
            notes.push(`🖼️ Map Image: ${image.missingReason} — exported without it`);
            image = null;
        }
    }

    if (!image && envelope.includedComponents.length === 0) {
        throw new Error('Nothing to export — the selected components are all empty on this server.');
    }

    const jsonResult = () => ({
        kind: 'json',
        buffer: Buffer.from(JSON.stringify(envelope, null, 1), 'utf8'),
        filename: `safari-export-${guildId}-${timestamp}.json`,
        contentType: 'application/json',
        manifest: null,
        notes,
        includedComponents: envelope.includedComponents
    });

    if (!image) return jsonResult();

    const buildZip = (imgBuffer, imgExt) => {
        const manifest = {
            format: SAFARI_EXPORT_FORMAT,
            formatVersion: SAFARI_EXPORT_VERSION,
            exportType: 'package',
            includedComponents: [...envelope.includedComponents, 'mapImage'],
            sourceGuildId: guildId,
            exportedAt: envelope.exportedAt,
            counts: envelope.counts,
            mapImage: {
                file: `assets/map.${imgExt}`,
                kind: image.kind,
                sourceMapId: image.sourceMapId,
                gridWidth: image.gridWidth,
                gridHeight: image.gridHeight,
                borderSize: 80
            }
        };
        const zip = createArchive([
            { name: 'manifest.json', data: JSON.stringify(manifest, null, 1), compress: true },
            { name: 'data.json', data: JSON.stringify(envelope.data, null, 1), compress: true },
            { name: `assets/map.${imgExt}`, data: imgBuffer, compress: false }
        ]);
        return { manifest, zip };
    };

    const MAX_DELIVERY_BYTES = Math.floor(9.5 * 1024 * 1024); // headroom under Discord's ~10MiB bot cap
    let { manifest, zip } = buildZip(image.buffer, image.ext);

    if (zip.length > MAX_DELIVERY_BYTES && image.ext !== 'jpg') {
        try {
            const sharp = (await import('sharp')).default;
            const jpeg = await sharp(image.buffer).jpeg({ quality: 80 }).toBuffer();
            ({ manifest, zip } = buildZip(jpeg, 'jpg'));
            notes.push('🖼️ Map image re-encoded as JPEG to fit Discord upload limits');
        } catch (err) {
            console.log(`⚠️ [SafariExport] JPEG re-encode failed: ${err.message}`);
        }
    }
    if (zip.length > MAX_DELIVERY_BYTES) {
        if (envelope.includedComponents.length === 0) {
            throw new Error('The map image is too large for a Discord upload and no other components were selected.');
        }
        notes.push('🖼️ Map image too large for a Discord upload even as JPEG — exported data only');
        return jsonResult();
    }

    return {
        kind: 'zip',
        buffer: zip,
        filename: `safari-package-${guildId}-${timestamp}.zip`,
        contentType: 'application/zip',
        manifest,
        notes,
        includedComponents: manifest.includedComponents
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// v2 import pipeline — format detection, payload parsing, import planning
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect what kind of Safari export a file is. Content-driven — never trusts
 * the filename/extension alone.
 * @param {Buffer} buffer - Raw uploaded file bytes
 * @returns {{format: 'package'|'envelope'|'legacy', payload?: Object}}
 * @throws {Error} clear user-facing error for unrecognised/newer-version files
 */
export function detectImportFormat(buffer) {
    if (isZipBuffer(buffer)) {
        return { format: 'package' };
    }

    let obj;
    try {
        obj = JSON.parse(buffer.toString('utf8'));
    } catch {
        throw new Error('This file is not a recognised Safari export (not valid JSON or a ZIP package).');
    }

    if (obj && typeof obj === 'object' && obj.format === SAFARI_EXPORT_FORMAT) {
        const v = obj.formatVersion;
        if (!Number.isInteger(v) || v < 1) {
            throw new Error('This Safari export has an invalid format version.');
        }
        if (v > SAFARI_EXPORT_VERSION) {
            throw new Error(`This Safari export uses format version ${v}, but this bot currently supports versions 1 through ${SAFARI_EXPORT_VERSION}. Update CastBot or re-export it from a matching version.`);
        }
        return { format: 'envelope', payload: obj };
    }

    const legacyKeys = ['stores', 'items', 'safariConfig', 'maps', 'customActions'];
    if (obj && typeof obj === 'object' && legacyKeys.some(k => obj[k])) {
        return { format: 'legacy', payload: obj };
    }

    throw new Error('This file is not a recognised Safari export.');
}

/** Asset paths a package image may live at — anything else in the archive is ignored/rejected. */
const PACKAGE_IMAGE_WHITELIST = ['assets/map.png', 'assets/map.jpg', 'assets/map.jpeg'];

/**
 * Parse an uploaded Safari export (any supported format) into a normalized payload.
 * Validates structure and image content BEFORE anything touches destination data.
 * @param {Buffer} buffer - Raw uploaded file bytes
 * @returns {Object} { formatVersion, exportType, includedComponents, data, manifest,
 *                     imageBuffer, imageExt, warnings }
 * @throws {Error} user-facing validation errors
 */
export async function parseImportPayload(buffer) {
    const detected = detectImportFormat(buffer);
    const warnings = [];

    if (detected.format === 'legacy') {
        const data = detected.payload;
        validateImportData(data);
        return {
            formatVersion: 1,
            exportType: 'legacy',
            includedComponents: deriveIncludedComponents(data),
            data,
            manifest: null,
            imageBuffer: null,
            imageExt: null,
            warnings
        };
    }

    if (detected.format === 'envelope') {
        const envelope = detected.payload;
        if (!envelope.data || typeof envelope.data !== 'object') {
            throw new Error('This Safari export is missing its data section.');
        }
        validateImportData(envelope.data);
        return {
            formatVersion: envelope.formatVersion,
            exportType: 'json',
            includedComponents: deriveIncludedComponents(envelope.data),
            data: envelope.data,
            manifest: envelope,
            imageBuffer: null,
            imageExt: null,
            warnings
        };
    }

    // ZIP package
    let entries;
    try {
        entries = readArchive(buffer);
    } catch (err) {
        if (err instanceof ArchiveError) throw new Error(err.message);
        throw err;
    }

    const dataEntry = entries.get('data.json');
    if (!dataEntry) {
        throw new Error('This Safari package is missing data.json.');
    }

    let manifest = null;
    if (entries.has('manifest.json')) {
        try {
            manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));
        } catch {
            throw new Error('This Safari package has a corrupt manifest.json.');
        }
        if (manifest.format !== SAFARI_EXPORT_FORMAT) {
            throw new Error('This file is not a recognised Safari export (manifest format mismatch).');
        }
        const v = manifest.formatVersion;
        if (Number.isInteger(v) && v > SAFARI_EXPORT_VERSION) {
            throw new Error(`This Safari package uses export format version ${v}, but this bot currently supports versions 1 through ${SAFARI_EXPORT_VERSION}.`);
        }
    } else {
        warnings.push('Package has no manifest.json — contents were derived from data.json');
    }

    let data;
    try {
        data = JSON.parse(dataEntry.toString('utf8'));
    } catch {
        throw new Error('This Safari package has a corrupt data.json.');
    }
    if (!data || typeof data !== 'object') {
        throw new Error('This Safari package has an invalid data.json.');
    }

    // Image: only whitelisted asset paths are ever consulted — never arbitrary entry names
    let imageBuffer = null;
    let imagePath = null;
    const declared = manifest?.mapImage?.file;
    if (declared) {
        if (!PACKAGE_IMAGE_WHITELIST.includes(declared)) {
            throw new Error('The package manifest references an unexpected asset path.');
        }
        imageBuffer = entries.get(declared) || null;
        if (!imageBuffer) {
            throw new Error('The package manifest references a map image that is missing from the archive.');
        }
        imagePath = declared;
    } else {
        imagePath = PACKAGE_IMAGE_WHITELIST.find(p => entries.has(p)) || null;
        if (imagePath) imageBuffer = entries.get(imagePath);
    }

    let imageExt = null;
    if (imageBuffer) {
        if (imageBuffer.length > 15 * 1024 * 1024) {
            throw new Error('The map image in this package is too large (max 15MB).');
        }
        // Validate CONTENT, not just the filename
        try {
            const sharp = (await import('sharp')).default;
            const meta = await sharp(imageBuffer).metadata();
            if (!['png', 'jpeg', 'webp'].includes(meta.format)) {
                throw new Error(`unsupported format "${meta.format}"`);
            }
        } catch (err) {
            throw new Error(`The map image in this package is not a valid image (${err.message}).`);
        }
        imageExt = imagePath.endsWith('.png') ? 'png' : 'jpg';
    }

    const includedComponents = deriveIncludedComponents(data);
    if (includedComponents.length > 0) {
        validateImportData(data);
    } else if (!imageBuffer) {
        throw new Error('This Safari package contains no importable data.');
    }
    if (imageBuffer) includedComponents.push('mapImage');

    return {
        formatVersion: manifest?.formatVersion ?? SAFARI_EXPORT_VERSION,
        exportType: 'package',
        includedComponents,
        data,
        manifest,
        imageBuffer,
        imageExt,
        warnings
    };
}

/**
 * Read-only import planner: computes what an import WOULD do against the
 * destination guild's current data, for the preview/confirm screen. Writes nothing.
 * @param {string} guildId - Destination guild
 * @param {Object} parsed - Result of parseImportPayload
 * @returns {Object} plan (per-section create/update counts, map analysis, warnings)
 */
export async function planSafariImport(guildId, parsed) {
    const all = await loadSafariContent();
    const guildData = all[guildId] || {};
    const { data } = parsed;

    const sectionPlan = (importObj, currentObj) => {
        const ids = Object.keys(importObj || {});
        const update = ids.filter(id => currentObj?.[id]).length;
        return { incoming: ids.length, create: ids.length - update, update };
    };

    const plan = {
        stores: sectionPlan(data.stores, guildData.stores),
        items: sectionPlan(data.items, guildData.items),
        actions: sectionPlan(data.customActions, guildData.buttons),
        configFields: data.safariConfig
            ? Object.keys(data.safariConfig).filter(k => data.safariConfig[k] !== undefined)
            : [],
        warnings: [...(parsed.warnings || [])]
    };

    // Destination totals — what Replace mode would clear (shown on the red confirm screen)
    plan.destTotals = {
        stores: Object.keys(guildData.stores || {}).length,
        items: Object.keys(guildData.items || {}).length,
        actions: Object.keys(guildData.buttons || {}).length
    };

    const activeMapId = guildData.maps?.active;
    const activeMap = activeMapId ? guildData.maps?.[activeMapId] : null;
    plan.hasActiveMap = !!activeMap;

    const importedMaps = Object.entries(data.maps || {}).filter(([k]) => k !== 'active');
    plan.mapCount = importedMaps.length;
    const firstMap = importedMaps[0]?.[1] || null;
    plan.importGrid = firstMap ? resolveGridDimensions(firstMap) : null;
    plan.mapCells = firstMap ? Object.keys(firstMap.coordinates || {}).length : 0;

    const actionsWithCoords = Object.values(data.customActions || {}).some(a => a.coordinates?.length);
    plan.mapContentPresent = plan.mapCount > 0 || actionsWithCoords;
    plan.needsMapCreate = plan.mapContentPresent && !plan.hasActiveMap;
    plan.canCreateMap = plan.needsMapCreate && !!parsed.imageBuffer && !!plan.importGrid;
    plan.channelCount = plan.importGrid ? plan.importGrid.width * plan.importGrid.height : 0;
    plan.channelCapExceeded = plan.needsMapCreate && plan.channelCount > 400;
    plan.hasImage = !!parsed.imageBuffer;

    if (activeMap && firstMap) {
        const targetDims = resolveGridDimensions(activeMap);
        const importDims = resolveGridDimensions(firstMap);
        if (targetDims && importDims &&
            (targetDims.width !== importDims.width || targetDims.height !== importDims.height)) {
            plan.warnings.push(`Grid mismatch: import is ${importDims.width}x${importDims.height}, your active map is ${targetDims.width}x${targetDims.height} — out-of-grid cells will be skipped`);
        }
        if (targetDims) {
            const outOfGrid = Object.keys(firstMap.coordinates || {})
                .filter(c => !isCoordInGrid(c, targetDims)).length;
            if (outOfGrid > 0) {
                plan.warnings.push(`${outOfGrid} imported map cell(s) fall outside your active grid and will be skipped`);
            }
        }
    }

    return plan;
}