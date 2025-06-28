/**
 * Safari Import/Export System
 * Handles exporting Safari data to JSON and importing with smart merge logic
 */

import { loadSafariContent, saveSafariContent } from './storage.js';

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
            safariConfig: filterConfigForExport(guildData.safariConfig || {})
        };
        
        // Use compact JSON format to save characters
        return JSON.stringify(exportData, null, 1);
        
    } catch (error) {
        console.error('Error exporting Safari data:', error);
        throw new Error('Failed to export Safari data');
    }
}

/**
 * Import Safari data with smart merge logic
 * @param {string} guildId - Discord guild ID
 * @param {string} importJson - JSON string to import
 * @returns {Object} Import summary with counts
 */
export async function importSafariData(guildId, importJson) {
    try {
        // Parse and validate import data
        const importData = JSON.parse(importJson);
        validateImportData(importData);
        
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
            config: false
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
 * Filter safari config for export (exclude runtime fields)
 * @param {Object} config - Safari config data
 * @returns {Object} Filtered config for export
 */
function filterConfigForExport(config) {
    const filtered = {
        currencyName: config.currencyName,
        inventoryName: config.inventoryName,
        currencyEmoji: config.currencyEmoji,
        ...(config.goodEventName !== undefined && { goodEventName: config.goodEventName }),
        ...(config.badEventName !== undefined && { badEventName: config.badEventName }),
        ...(config.goodEventEmoji !== undefined && { goodEventEmoji: config.goodEventEmoji }),
        ...(config.badEventEmoji !== undefined && { badEventEmoji: config.badEventEmoji }),
        ...(config.round1GoodProbability !== undefined && { round1GoodProbability: config.round1GoodProbability }),
        ...(config.round2GoodProbability !== undefined && { round2GoodProbability: config.round2GoodProbability }),
        ...(config.round3GoodProbability !== undefined && { round3GoodProbability: config.round3GoodProbability })
        // Exclude: currentRound, lastRoundTimestamp (runtime fields)
    };
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
    
    const validSections = ['stores', 'items', 'safariConfig'];
    const hasValidSection = validSections.some(section => data[section]);
    
    if (!hasValidSection) {
        throw new Error('Import data must contain at least one of: stores, items, or safariConfig');
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
    
    if (summary.config) {
        parts.push(`⚙️ **Config:** Updated`);
    }
    
    if (parts.length === 0) {
        return '✅ Import completed with no changes.';
    }
    
    return `✅ **Import completed successfully!**\n\n${parts.join('\n')}`;
}