/**
 * Safari Initialization System for CastBot
 * Handles safe initialization of Safari data structures for production servers
 * Supports both safariContent.json and playerData.json integration
 */

import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { loadPlayerData, savePlayerData } from './storage.js';

/**
 * Default Safari configuration template
 */
const DEFAULT_SAFARI_CONFIG = {
    currencyName: "coins",
    inventoryName: "Inventory", 
    currencyEmoji: "🪙",
    goodEventName: "Good Event",
    badEventName: "Bad Event", 
    goodEventEmoji: "✅",
    badEventEmoji: "❌",
    round1GoodProbability: 70,
    round2GoodProbability: 50,
    round3GoodProbability: 30,
    currentRound: 1,
    lastRoundTimestamp: null
};

/**
 * Default Safari data structure template
 */
const DEFAULT_SAFARI_STRUCTURE = {
    buttons: {},
    safaris: {},
    applications: {},
    stores: {},
    items: {},
    safariConfig: { ...DEFAULT_SAFARI_CONFIG },
    roundHistory: [],
    attackQueue: {},
    safariLogSettings: {
        enabled: false,
        logChannelId: null,
        productionRoleId: null,
        logTypes: {
            whispers: true,
            itemPickups: true,
            currencyChanges: true,
            storeTransactions: true,
            buttonActions: true,
            mapMovement: true,
            attacks: true,
            customActions: true
        },
        formatting: {
            accentColor: 0x9B59B6,
            useEmbeds: false,
            showTimestamps: true,
            showLocations: true
        }
    }
};

/**
 * Initialize Safari data structure for a specific guild
 * @param {string} guildId - Discord guild ID
 * @param {Object} customConfig - Optional custom configuration overrides
 * @returns {Promise<Object>} Initialized Safari data structure
 */
export async function initializeGuildSafariData(guildId, customConfig = {}) {
    try {
        console.log(`🔍 DEBUG: Initializing Safari data for guild ${guildId}`);
        
        // Load current Safari content
        const safariData = await loadSafariContent();
        
        // Check if guild already has Safari data
        if (safariData[guildId]) {
            console.log(`✅ DEBUG: Guild ${guildId} already has Safari data, validating structure`);
            return await validateAndUpdateSafariStructure(guildId, safariData[guildId], customConfig);
        }
        
        // Create new Safari data structure for guild
        const newGuildData = {
            ...DEFAULT_SAFARI_STRUCTURE,
            safariConfig: {
                ...DEFAULT_SAFARI_CONFIG,
                ...customConfig
            }
        };
        
        // Add timestamps
        newGuildData.metadata = {
            createdAt: Date.now(),
            lastModified: Date.now(),
            version: "MVP2",
            initializedBy: "safariInitialization.js"
        };
        
        // Save to safariContent.json
        safariData[guildId] = newGuildData;
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Successfully initialized Safari data for guild ${guildId}`);
        return newGuildData;
        
    } catch (error) {
        console.error(`❌ ERROR: Failed to initialize Safari data for guild ${guildId}:`, error);
        throw new Error(`Safari initialization failed for guild ${guildId}: ${error.message}`);
    }
}

/**
 * Validate and update existing Safari structure to ensure MVP2 compliance
 * @param {string} guildId - Discord guild ID
 * @param {Object} existingData - Existing Safari data structure
 * @param {Object} customConfig - Optional custom configuration overrides
 * @returns {Promise<Object>} Updated Safari data structure
 */
async function validateAndUpdateSafariStructure(guildId, existingData, customConfig = {}) {
    try {
        console.log(`🔍 DEBUG: Validating Safari structure for guild ${guildId}`);
        
        let updated = false;
        const updatedData = { ...existingData };
        
        // Ensure all required top-level structures exist
        const requiredStructures = ['buttons', 'safaris', 'applications', 'stores', 'items', 'safariConfig', 'safariLogSettings'];
        for (const structure of requiredStructures) {
            if (!updatedData[structure]) {
                console.log(`📝 DEBUG: Adding missing structure '${structure}' for guild ${guildId}`);
                if (structure === 'safariConfig') {
                    updatedData[structure] = { ...DEFAULT_SAFARI_CONFIG };
                } else if (structure === 'safariLogSettings') {
                    updatedData[structure] = { ...DEFAULT_SAFARI_STRUCTURE.safariLogSettings };
                } else {
                    updatedData[structure] = {};
                }
                updated = true;
            }
        }
        
        // Ensure optional structures exist
        if (!updatedData.roundHistory) {
            updatedData.roundHistory = [];
            updated = true;
        }
        
        if (!updatedData.attackQueue) {
            updatedData.attackQueue = {};
            updated = true;
        }
        
        // Validate and update safariConfig
        const configUpdated = await validateSafariConfig(guildId, updatedData.safariConfig, customConfig);
        if (configUpdated.updated) {
            updatedData.safariConfig = configUpdated.config;
            updated = true;
        }
        
        // Add/update metadata
        if (!updatedData.metadata) {
            updatedData.metadata = {
                createdAt: Date.now(),
                lastModified: Date.now(),
                version: "MVP2",
                migratedBy: "safariInitialization.js"
            };
            updated = true;
        } else {
            updatedData.metadata.lastModified = Date.now();
            if (!updatedData.metadata.version) {
                updatedData.metadata.version = "MVP2";
                updated = true;
            }
        }
        
        // Save updates if any were made
        if (updated) {
            const safariData = await loadSafariContent();
            safariData[guildId] = updatedData;
            await saveSafariContent(safariData);
            console.log(`✅ DEBUG: Updated Safari structure for guild ${guildId}`);
        } else {
            console.log(`✅ DEBUG: Safari structure for guild ${guildId} is already valid`);
        }
        
        return updatedData;
        
    } catch (error) {
        console.error(`❌ ERROR: Failed to validate Safari structure for guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Validate and update Safari configuration
 * @param {string} guildId - Discord guild ID
 * @param {Object} currentConfig - Current Safari configuration
 * @param {Object} customConfig - Custom configuration overrides
 * @returns {Promise<Object>} { config: updatedConfig, updated: boolean }
 */
async function validateSafariConfig(guildId, currentConfig, customConfig = {}) {
    try {
        let updated = false;
        const updatedConfig = { ...currentConfig };
        
        // Ensure all required config fields exist
        for (const [key, defaultValue] of Object.entries(DEFAULT_SAFARI_CONFIG)) {
            if (updatedConfig[key] === undefined) {
                console.log(`📝 DEBUG: Adding missing config '${key}' for guild ${guildId}`);
                updatedConfig[key] = defaultValue;
                updated = true;
            }
        }
        
        // Apply custom configuration overrides
        for (const [key, value] of Object.entries(customConfig)) {
            if (updatedConfig[key] !== value) {
                console.log(`📝 DEBUG: Updating config '${key}' for guild ${guildId}: ${updatedConfig[key]} -> ${value}`);
                updatedConfig[key] = value;
                updated = true;
            }
        }
        
        // Validate probability values are within valid range (0-100)
        const probabilityFields = ['round1GoodProbability', 'round2GoodProbability', 'round3GoodProbability'];
        for (const field of probabilityFields) {
            if (updatedConfig[field] < 0 || updatedConfig[field] > 100) {
                console.log(`⚠️ WARNING: Invalid probability ${field} for guild ${guildId}: ${updatedConfig[field]}, resetting to default`);
                updatedConfig[field] = DEFAULT_SAFARI_CONFIG[field];
                updated = true;
            }
        }
        
        // Initialize currentRound if not set
        if (!updatedConfig.currentRound || updatedConfig.currentRound < 1) {
            updatedConfig.currentRound = 1;
            updated = true;
        }
        
        return { config: updatedConfig, updated };
        
    } catch (error) {
        console.error(`❌ ERROR: Failed to validate Safari config for guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Initialize Safari data for multiple guilds (batch operation)
 * @param {Array<string>} guildIds - Array of Discord guild IDs
 * @param {Object} customConfig - Optional custom configuration for all guilds
 * @returns {Promise<Object>} Summary of initialization results
 */
export async function initializeMultipleGuilds(guildIds, customConfig = {}) {
    try {
        console.log(`🔍 DEBUG: Starting batch initialization for ${guildIds.length} guilds`);
        
        const results = {
            successful: [],
            failed: [],
            skipped: [],
            totalProcessed: 0
        };
        
        for (const guildId of guildIds) {
            try {
                results.totalProcessed++;
                
                // Skip invalid guild IDs
                if (!guildId || guildId === '/* Guild ID */' || guildId === '/* Server ID */') {
                    results.skipped.push({ guildId, reason: 'Invalid guild ID' });
                    continue;
                }
                
                await initializeGuildSafariData(guildId, customConfig);
                results.successful.push(guildId);
                
            } catch (error) {
                console.error(`❌ ERROR: Failed to initialize guild ${guildId}:`, error);
                results.failed.push({ guildId, error: error.message });
            }
        }
        
        console.log(`✅ DEBUG: Batch initialization complete: ${results.successful.length} successful, ${results.failed.length} failed, ${results.skipped.length} skipped`);
        return results;
        
    } catch (error) {
        console.error(`❌ ERROR: Batch initialization failed:`, error);
        throw error;
    }
}

/**
 * Initialize Safari data for all guilds found in playerData.json
 * @param {Object} customConfig - Optional custom configuration for all guilds
 * @returns {Promise<Object>} Summary of initialization results
 */
export async function initializeAllProductionGuilds(customConfig = {}) {
    try {
        console.log(`🔍 DEBUG: Initializing Safari data for all production guilds`);
        
        // Load all player data to get guild list
        const playerData = await loadPlayerData();
        
        // Extract valid guild IDs
        const guildIds = Object.keys(playerData).filter(guildId => 
            guildId !== '/* Server ID */' && 
            guildId !== 'environmentConfig' &&
            playerData[guildId] &&
            typeof playerData[guildId] === 'object'
        );
        
        console.log(`📊 DEBUG: Found ${guildIds.length} production guilds to initialize`);
        
        if (guildIds.length === 0) {
            console.log(`⚠️ WARNING: No production guilds found in playerData.json`);
            return { successful: [], failed: [], skipped: [], totalProcessed: 0 };
        }
        
        // Batch initialize all guilds
        return await initializeMultipleGuilds(guildIds, customConfig);
        
    } catch (error) {
        console.error(`❌ ERROR: Failed to initialize all production guilds:`, error);
        throw error;
    }
}

/**
 * Check Safari initialization status for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object>} Status information
 */
export async function checkSafariInitializationStatus(guildId) {
    try {
        const safariData = await loadSafariContent();
        const guildData = safariData[guildId];
        
        if (!guildData) {
            return {
                initialized: false,
                status: 'not_initialized',
                message: 'Guild has no Safari data structure'
            };
        }
        
        // Check structure completeness
        const requiredStructures = ['buttons', 'safaris', 'applications', 'stores', 'items', 'safariConfig'];
        const missingStructures = requiredStructures.filter(structure => !guildData[structure]);
        
        if (missingStructures.length > 0) {
            return {
                initialized: false,
                status: 'partial_initialization',
                message: `Missing structures: ${missingStructures.join(', ')}`,
                missingStructures
            };
        }
        
        // Check config completeness
        const requiredConfigFields = Object.keys(DEFAULT_SAFARI_CONFIG);
        const missingConfigFields = requiredConfigFields.filter(field => 
            guildData.safariConfig[field] === undefined
        );
        
        if (missingConfigFields.length > 0) {
            return {
                initialized: false,
                status: 'incomplete_config',
                message: `Missing config fields: ${missingConfigFields.join(', ')}`,
                missingConfigFields
            };
        }
        
        return {
            initialized: true,
            status: 'fully_initialized',
            message: 'Guild Safari data is fully initialized',
            metadata: guildData.metadata || {},
            config: guildData.safariConfig
        };
        
    } catch (error) {
        console.error(`❌ ERROR: Failed to check initialization status for guild ${guildId}:`, error);
        return {
            initialized: false,
            status: 'error',
            message: error.message,
            error
        };
    }
}

/**
 * Emergency repair function for corrupted Safari data
 * @param {string} guildId - Discord guild ID
 * @param {Object} backupData - Optional backup data to restore from
 * @returns {Promise<Object>} Repair results
 */
export async function repairSafariData(guildId, backupData = null) {
    try {
        console.log(`🔧 DEBUG: Starting emergency repair for guild ${guildId}`);
        
        const safariData = await loadSafariContent();
        const currentData = safariData[guildId] || {};
        
        // Create repair log
        const repairLog = {
            guildId,
            startTime: Date.now(),
            actions: [],
            errors: []
        };
        
        // Step 1: Backup current data
        const backupTimestamp = Date.now();
        const backupKey = `${guildId}_backup_${backupTimestamp}`;
        safariData[backupKey] = { ...currentData };
        repairLog.actions.push(`Created backup: ${backupKey}`);
        
        // Step 2: Restore from backup if provided
        let repairedData;
        if (backupData) {
            repairedData = { ...backupData };
            repairLog.actions.push('Restored from provided backup data');
        } else {
            // Step 3: Merge with default structure
            repairedData = {
                ...DEFAULT_SAFARI_STRUCTURE,
                ...currentData,
                safariConfig: {
                    ...DEFAULT_SAFARI_CONFIG,
                    ...(currentData.safariConfig || {})
                }
            };
            repairLog.actions.push('Merged with default structure');
        }
        
        // Step 4: Validate repaired data
        const validationResult = await validateAndUpdateSafariStructure(guildId, repairedData);
        repairedData = validationResult;
        repairLog.actions.push('Validated and updated structure');
        
        // Step 5: Add repair metadata
        repairedData.metadata = {
            ...repairedData.metadata,
            lastRepair: Date.now(),
            repairLog: repairLog.actions
        };
        
        // Step 6: Save repaired data
        safariData[guildId] = repairedData;
        await saveSafariContent(safariData);
        
        repairLog.endTime = Date.now();
        repairLog.duration = repairLog.endTime - repairLog.startTime;
        repairLog.success = true;
        
        console.log(`✅ DEBUG: Successfully repaired Safari data for guild ${guildId} in ${repairLog.duration}ms`);
        return repairLog;
        
    } catch (error) {
        console.error(`❌ ERROR: Failed to repair Safari data for guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Migration utility for Import/Export system compatibility
 * Ensures all guilds have compatible data structures for import/export operations
 * @returns {Promise<Object>} Migration results
 */
export async function ensureImportExportCompatibility() {
    try {
        console.log(`🔍 DEBUG: Ensuring Import/Export compatibility for all guilds`);
        
        const safariData = await loadSafariContent();
        const results = {
            processed: 0,
            updated: 0,
            errors: []
        };
        
        for (const guildId of Object.keys(safariData)) {
            if (guildId === '/* Guild ID */' || !safariData[guildId]) continue;
            
            try {
                results.processed++;
                
                const currentData = safariData[guildId];
                let updated = false;
                
                // Ensure stores have proper metadata structure
                if (currentData.stores) {
                    for (const storeId of Object.keys(currentData.stores)) {
                        const store = currentData.stores[storeId];
                        if (!store.metadata) {
                            store.metadata = {
                                createdAt: Date.now(),
                                lastModified: Date.now(),
                                totalSales: 0
                            };
                            updated = true;
                        }
                    }
                }
                
                // Ensure items have proper metadata structure
                if (currentData.items) {
                    for (const itemId of Object.keys(currentData.items)) {
                        const item = currentData.items[itemId];
                        if (!item.metadata) {
                            item.metadata = {
                                createdAt: Date.now(),
                                lastModified: Date.now(),
                                totalSold: 0
                            };
                            updated = true;
                        }
                    }
                }
                
                if (updated) {
                    results.updated++;
                }
                
            } catch (error) {
                results.errors.push({ guildId, error: error.message });
            }
        }
        
        if (results.updated > 0) {
            await saveSafariContent(safariData);
        }
        
        console.log(`✅ DEBUG: Import/Export compatibility check complete: ${results.processed} processed, ${results.updated} updated, ${results.errors.length} errors`);
        return results;
        
    } catch (error) {
        console.error(`❌ ERROR: Import/Export compatibility check failed:`, error);
        throw error;
    }
}