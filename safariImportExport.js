/**
 * Safari Import/Export System
 * Handles exporting Safari data to JSON and importing with smart merge logic
 */

import { loadSafariContent, saveSafariContent } from './safariManager.js';

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

        // Find map-storage channel
        const guild = await client.guilds.fetch(guildId);
        const mapStorageChannel = guild.channels.cache.find(
            ch => ch.name === 'map-storage' || ch.name === 'safari-storage'
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
 * Import Safari data with smart merge logic
 * @param {string} guildId - Discord guild ID
 * @param {string} importJson - JSON string to import
 * @param {Object} context - Import context (userId, client) for audit trail
 * @returns {Object} Import summary with counts
 */
export async function importSafariData(guildId, importJson, context = {}) {
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
                existingMap.gridSize = mapData.gridSize || existingMap.gridSize;
                if (mapData.blacklistedCoordinates) {
                    existingMap.blacklistedCoordinates = mapData.blacklistedCoordinates;
                }

                // Merge coordinates into target map
                for (const [coord, coordData] of Object.entries(mapData.coordinates || {})) {
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
            ...(item.badYieldEmoji !== undefined && { badYieldEmoji: item.badYieldEmoji })
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

        // Player Menu Settings
        ...(config.showGlobalCommandsButton !== undefined && { showGlobalCommandsButton: config.showGlobalCommandsButton })

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

    // If action has limit tracking, preserve limit TYPE but remove claimedBy (runtime tracking)
    if (filtered.config.limit) {
        filtered.config.limit = {
            type: filtered.config.limit.type  // Keep "once_globally", "once_per_player", "unlimited"
            // Exclude: claimedBy (runtime tracking - will be reset on import)
        };
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

    // Show warnings if any
    if (summary.warnings && summary.warnings.length > 0) {
        parts.push(''); // Add blank line before warnings
        parts.push('⚠️ **Warnings:**');
        summary.warnings.forEach(warning => {
            if (warning.type === 'map_id_mismatch') {
                parts.push(`   • Map ID mismatch: Import merged into active map`);
                parts.push(`     (Imported: \`${warning.imported}\`, Active: \`${warning.target}\`)`);
            }
        });
    }

    if (parts.length === 0) {
        return '✅ Import completed with no changes.';
    }

    return `✅ **Import completed successfully!**\n\n${parts.join('\n')}`;
}