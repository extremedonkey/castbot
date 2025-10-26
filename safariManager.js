import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { 
    InteractionResponseType,
    InteractionResponseFlags
} from 'discord-interactions';
import { DiscordRequest } from './utils.js';
import { loadPlayerData, savePlayerData } from './storage.js';
import { initializeGuildSafariData } from './safariInitialization.js';
import { 
    initializeEntityPoints,
    getEntityPoints,
    hasEnoughPoints,
    usePoints,
    setEntityPoints,
    getTimeUntilRegeneration,
    getPointsDisplay,
    initializePointsConfig
} from './pointsManager.js';
import {
    getPlayerLocation,
    setPlayerLocation,
    getValidMoves,
    canPlayerMove,
    movePlayer,
    getMovementDisplay,
    initializePlayerOnMap
} from './mapMovement.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAFARI_CONTENT_FILE = path.join(__dirname, 'safariContent.json');

// Player name cache to ensure consistency within the same request
const playerNameCache = new Map();

// Request-scoped cache for safari content
const safariRequestCache = new Map();
let safariCacheHits = 0;
let safariCacheMisses = 0;

/**
 * Clear the safari request cache (called at start of each Discord interaction)
 */
export function clearSafariCache() {
    if (safariRequestCache.size > 0) {
        console.log(`🗑️ Clearing Safari cache (${safariRequestCache.size} entries, ${safariCacheHits} hits, ${safariCacheMisses} misses)`);
    }
    safariRequestCache.clear();
    safariCacheHits = 0;
    safariCacheMisses = 0;
}

/**
 * Clear the player name cache (call at the start of new operations)
 */
function clearPlayerNameCache() {
    playerNameCache.clear();
    console.log('🗑️ DEBUG: Cleared player name cache');
}

/**
 * Migrate existing players to Safari system
 * This ensures any players with existing data are properly initialized
 */
async function migrateExistingPlayersToSafari(guildId) {
    try {
        const playerData = await loadPlayerData();
        const players = playerData[guildId]?.players || {};
        let migrated = 0;
        
        for (const [userId, data] of Object.entries(players)) {
            // Check if player has any data but no Safari structure
            if (!data.safari && (data.currency !== undefined || data.inventory !== undefined)) {
                // Initialize Safari structure
                initializePlayerSafari(playerData, guildId, userId);
                
                // Migrate existing currency and inventory if present
                if (data.currency !== undefined) {
                    playerData[guildId].players[userId].safari.currency = data.currency;
                    delete data.currency; // Clean up old field
                }
                
                if (data.inventory !== undefined) {
                    playerData[guildId].players[userId].safari.inventory = data.inventory;
                    delete data.inventory; // Clean up old field
                }
                
                migrated++;
                console.log(`🔄 Migrated player ${userId} to Safari system`);
            }
        }
        
        if (migrated > 0) {
            await savePlayerData(playerData);
            console.log(`✅ Migrated ${migrated} players to Safari system for guild ${guildId}`);
        }
        
        return migrated;
    } catch (error) {
        console.error('Error migrating players to Safari:', error);
        return 0;
    }
}

/**
 * Safari Manager Module for CastBot - MVP2
 * Handles dynamic content creation, button management, action execution,
 * store systems, inventory management, and conditional actions
 */

/**
 * Get coordinate from channel ID
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID
 * @returns {string|null} Coordinate (e.g., 'A1') or null if not found
 */
export async function getCoordinateFromChannelId(guildId, channelId) {
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) {
        return null;
    }
    
    const coordinates = safariData[guildId]?.maps?.[activeMapId]?.coordinates || {};
    
    // Find the coordinate that matches this channel ID
    for (const [coord, data] of Object.entries(coordinates)) {
        if (data.channelId === channelId) {
            return coord;
        }
    }
    
    return null;
}

/**
 * Generate detailed item content for display (reusable between store and inventory)
 * @param {Object} item - The item object with stats
 * @param {Object} customTerms - Custom terminology for the guild
 * @param {number} quantity - Quantity owned (for inventory display)
 * @param {number} price - Price (for store display, optional)
 * @returns {string} Formatted content string
 */
function generateItemContent(item, customTerms, quantity = null, price = null, stock = undefined) {
    // Sanitize emoji - remove any zero-width joiners or invalid characters
    const emoji = (item.emoji || '📦').replace(/\u200d/g, '').trim();
    
    // Determine if this is for inventory display (compact mode)
    const isInventoryDisplay = quantity !== null && price === null;
    
    // More aggressive truncation for inventory display
    const maxNameLength = isInventoryDisplay ? 40 : 100;
    const maxDescLength = isInventoryDisplay ? 150 : 500;
    
    const name = (item.name || 'Unknown Item').substring(0, maxNameLength);
    let description = (item.description || 'No description available.').substring(0, maxDescLength);
    
    // Remove problematic characters that might cause Discord issues
    description = description.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '');
    
    // Use compact format for inventory
    let content;
    if (isInventoryDisplay) {
        // Ultra-compact for inventory
        content = `**${emoji} ${name}** (x${quantity})\n`;
        
        // Only show most essential info
        if (description.length > 0) {
            content += `*${description.substring(0, 100)}*\n`;
        }
        
        // Compact combat stats
        const hasAttack = (item.attackValue !== null && item.attackValue !== undefined && item.attackValue > 0);
        const hasDefense = (item.defenseValue !== null && item.defenseValue !== undefined && item.defenseValue > 0);
        
        if (hasAttack || hasDefense) {
            const stats = [];
            if (hasAttack) stats.push(`⚔️${item.attackValue}`);
            if (hasDefense) stats.push(`🛡️${item.defenseValue}`);
            content += `${stats.join(' ')} `;
        }
        
        // Compact stamina info
        if (item.staminaBoost && item.staminaBoost > 0) {
            content += `⚡+${item.staminaBoost} `;
        }
    } else {
        // Full format for non-inventory displays
        content = `## ${emoji} ${name}\n\n${description}\n\n`;
        
        // Add yield info if available
        if ((item.goodOutcomeValue !== null && item.goodOutcomeValue !== undefined) || 
            (item.badOutcomeValue !== null && item.badOutcomeValue !== undefined)) {
            
            content += '**Yield**\n';
            
            if (item.goodOutcomeValue !== null && item.goodOutcomeValue !== undefined) {
                const goodEmoji = item.goodYieldEmoji || customTerms.goodEventEmoji || '☀️';
                const goodEventName = customTerms.goodEventName || 'Good Event';
                content += `${goodEmoji} ${goodEventName}: +${item.goodOutcomeValue} ${customTerms.currencyName}\n`;
            }
            
            if (item.badOutcomeValue !== null && item.badOutcomeValue !== undefined) {
                const badEmoji = item.badYieldEmoji || customTerms.badEventEmoji || '☄️';
                const badEventName = customTerms.badEventName || 'Bad Event';
                content += `${badEmoji} ${badEventName}: +${item.badOutcomeValue} ${customTerms.currencyName}\n`;
            }
            
            content += '\n';
        }
        
        // Add combat info if item has attack or defense values
        const hasAttack = (item.attackValue !== null && item.attackValue !== undefined);
        const hasDefense = (item.defenseValue !== null && item.defenseValue !== undefined);
        
        if (hasAttack || hasDefense) {
            content += '**⚔️ Combat**\n';
            if (hasAttack) content += `🗡️ Attack: ${item.attackValue}\n`;
            if (hasDefense) content += `🛡️ Defense: ${item.defenseValue}\n`;
            content += '\n';
        }
        
        // Add stamina boost info if item provides stamina
        if (item.staminaBoost && item.staminaBoost > 0) {
            content += '**⚡ Effects**\n';
            content += `⚡ Stamina Boost: +${item.staminaBoost}\n`;
            if (item.consumable === 'Yes') {
                content += `*This item is consumed on use*\n`;
            }
            content += '\n';
        }
        
        // Add price info for store display
        if (price !== null) {
            content += `> ${customTerms.currencyEmoji} **Price:** ${price} ${customTerms.currencyName}`;
        }
        
        // Add stock info for store display (when price is shown)
        if (price !== null) {
            let stockDisplay;
            // Handle all cases: undefined (not passed), null, -1 = unlimited
            if (stock === undefined || stock === null || stock === -1) {
                stockDisplay = 'Unlimited';
            } else if (stock === 0) {
                stockDisplay = 'Sold Out';
            } else {
                stockDisplay = `${stock} Available`;
            }
            content += `\n> 📦 **Stock:** ${stockDisplay}`;
        }
    }
    
    // Strict content length limits to prevent Discord rejection
    const maxLength = isInventoryDisplay ? 400 : 2000;
    if (content.length > maxLength) {
        content = content.substring(0, maxLength - 3) + '...';
    }
    
    return content;
}

// Button style mapping
const BUTTON_STYLES = {
    'Primary': ButtonStyle.Primary,
    'Secondary': ButtonStyle.Secondary,
    'Success': ButtonStyle.Success,
    'Danger': ButtonStyle.Danger
};

// Action types for MVP2
const ACTION_TYPES = {
    DISPLAY_TEXT: 'display_text',
    UPDATE_CURRENCY: 'update_currency', 
    FOLLOW_UP_BUTTON: 'follow_up_button',
    CONDITIONAL: 'conditional',          // NEW: MVP2
    STORE_DISPLAY: 'store_display',        // NEW: MVP2
    BUY_ITEM: 'buy_item',               // NEW: MVP2
    RANDOM_OUTCOME: 'random_outcome',     // NEW: MVP2
    // Points System Actions
    CHECK_POINTS: 'check_points',        // NEW: Check if entity has enough points
    MODIFY_POINTS: 'modify_points',      // NEW: Add/subtract points
    MOVE_PLAYER: 'move_player',          // NEW: Move player on map
    APPLY_REGENERATION: 'apply_regeneration' // NEW: Force regeneration check
};

// Condition types for conditional actions
const CONDITION_TYPES = {
    CURRENCY_GTE: 'currency_gte',       // Currency >= value
    CURRENCY_LTE: 'currency_lte',       // Currency <= value
    HAS_ITEM: 'has_item',               // Player has item
    NOT_HAS_ITEM: 'not_has_item',       // Player doesn't have item
    BUTTON_USED: 'button_used',         // Button used N times
    COOLDOWN_EXPIRED: 'cooldown_expired', // Cooldown expired
    // Points System Conditions
    POINTS_GTE: 'points_gte',           // Points >= value for specified type
    POINTS_LTE: 'points_lte',           // Points <= value for specified type
    CAN_MOVE: 'can_move',               // Player has stamina to move
    AT_LOCATION: 'at_location'          // Player is at specific coordinate
};

/**
 * Ensure safari content file exists with proper MVP2 structure
 */
async function ensureSafariContentFile() {
    try {
        const exists = await fs.access(SAFARI_CONTENT_FILE).then(() => true).catch(() => false);
        
        if (!exists) {
            const initialData = {
                "/* Guild ID */": {
                    "buttons": {},
                    "safaris": {},
                    "applications": {},
                    "stores": {},      // NEW: MVP2 - Multiple stores per server
                    "items": {},       // NEW: MVP2 - Reusable items across stores
                    "safariConfig": {  // NEW: Custom terminology per guild
                        "currencyName": "Dollars",
                        "inventoryName": "Inventory",
                        "currencyEmoji": "🪙"
                    }
                }
            };
            await fs.writeFile(SAFARI_CONTENT_FILE, JSON.stringify(initialData, null, 2));
            console.log('✅ Created safariContent.json with MVP2 structure');
        }
        
        // Ensure existing files have MVP2 structure
        const data = JSON.parse(await fs.readFile(SAFARI_CONTENT_FILE, 'utf8'));
        let updated = false;
        
        for (const guildId in data) {
            if (guildId !== '/* Guild ID */' && data[guildId]) {
                if (!data[guildId].stores) {
                    data[guildId].stores = {};
                    updated = true;
                }
                if (!data[guildId].items) {
                    data[guildId].items = {};
                    updated = true;
                }
                if (!data[guildId].safariConfig) {
                    data[guildId].safariConfig = {
                        currencyName: 'Dollars',
                        inventoryName: 'Inventory',
                        currencyEmoji: '🪙'
                    };
                    updated = true;
                }
                // Ensure existing safariConfig has currencyEmoji field
                if (data[guildId].safariConfig && !data[guildId].safariConfig.currencyEmoji) {
                    data[guildId].safariConfig.currencyEmoji = '🪙';
                    updated = true;
                }
            }
        }
        
        if (updated) {
            await fs.writeFile(SAFARI_CONTENT_FILE, JSON.stringify(data, null, 2));
            console.log('✅ Updated safariContent.json to MVP2 structure');
        }
        
        return data;
    } catch (error) {
        console.error('Error ensuring safari content file:', error);
        return {};
    }
}

/**
 * Load safari content data with request-scoped caching
 */
async function loadSafariContent() {
    const cacheKey = 'safariContent_all';
    
    // Check cache first
    if (safariRequestCache.has(cacheKey)) {
        safariCacheHits++;
        return safariRequestCache.get(cacheKey);
    }
    
    safariCacheMisses++;
    const data = await ensureSafariContentFile();
    
    // Cache the data for this request
    safariRequestCache.set(cacheKey, data);
    return data;
}

/**
 * Save safari content data
 */
async function saveSafariContent(data) {
    try {
        await fs.writeFile(SAFARI_CONTENT_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Safari content saved successfully');
        // Clear cache after save to ensure fresh data on next read
        safariRequestCache.clear();
    } catch (error) {
        console.error('Error saving safari content:', error);
        throw error;
    }
}

/**
 * Ensure guild has proper Safari data structure initialized
 * @param {string} guildId - Discord guild ID
 * @param {Object} safariData - Current Safari data object
 * @returns {Promise<Object>} Updated Safari data object
 */
async function ensureGuildSafariData(guildId, safariData) {
    try {
        if (!safariData[guildId]) {
            console.log(`🔄 DEBUG: Initializing Safari data structure for guild ${guildId}`);
            await initializeGuildSafariData(guildId);
            // Reload the data after initialization
            return await loadSafariContent();
        }
        
        // Ensure all required properties exist (in case some were deleted)
        const requiredProps = {
            buttons: {},
            safaris: {},
            applications: {},
            stores: {},
            items: {},
            safariConfig: {
                currencyName: "coins",
                inventoryName: "Inventory",
                currencyEmoji: "🪙"
            }
        };
        
        let needsUpdate = false;
        for (const [prop, defaultValue] of Object.entries(requiredProps)) {
            if (!safariData[guildId][prop]) {
                console.log(`🔄 DEBUG: Restoring missing property '${prop}' for guild ${guildId}`);
                safariData[guildId][prop] = defaultValue;
                needsUpdate = true;
            }
        }
        
        // Save if we had to restore any properties
        if (needsUpdate) {
            await saveSafariContent(safariData);
        }
        
        return safariData;
    } catch (error) {
        console.error(`❌ ERROR: Failed to ensure Safari data for guild ${guildId}:`, error);
        // Fallback to manual initialization if automatic fails
        safariData[guildId] = {
            buttons: {},
            safaris: {},
            applications: {},
            stores: {},
            items: {},
            safariConfig: {
                currencyName: "coins",
                inventoryName: "Inventory",
                currencyEmoji: "🪙"
            }
        };
        return safariData;
    }
}

/**
 * Generate unique button ID
 */
function generateButtonId(label) {
    const sanitized = label.toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 20);
    
    const timestamp = Date.now().toString().slice(-6);
    return `${sanitized}_${timestamp}`;
}

/**
 * Generate custom ID for Discord buttons
 */
function generateCustomId(guildId, buttonId) {
    return `safari_${guildId}_${buttonId}_${Date.now()}`;
}

/**
 * Create a new custom button
 */
async function createCustomButton(guildId, buttonData, userId) {
    try {
        console.log(`🔍 DEBUG: Creating custom button for guild ${guildId} by user ${userId}`);
        
        let safariData = await loadSafariContent();
        
        // Ensure guild has proper Safari data structure
        safariData = await ensureGuildSafariData(guildId, safariData);
        
        // Generate unique button ID
        const buttonId = generateButtonId(buttonData.label);
        
        const button = {
            id: buttonId,
            label: buttonData.label,
            emoji: buttonData.emoji || null,
            style: buttonData.style || 'Primary',
            actions: buttonData.actions || [],
            metadata: {
                createdBy: userId,
                createdAt: Date.now(),
                lastModified: Date.now(),
                usageCount: 0,
                tags: buttonData.tags || []
            }
        };
        
        safariData[guildId].buttons[buttonId] = button;
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Custom button '${buttonId}' created successfully`);
        return buttonId;
    } catch (error) {
        console.error('Error creating custom button:', error);
        throw error;
    }
}

/**
 * Get a custom button
 */
async function getCustomButton(guildId, buttonId) {
    try {
        console.log(`🔍 DEBUG: Getting button - Guild: ${guildId}, ButtonId: ${buttonId}`);
        const safariData = await loadSafariContent();
        const button = safariData[guildId]?.buttons?.[buttonId] || null;
        if (!button) {
            console.log(`❌ Button not found. Available buttons:`, Object.keys(safariData[guildId]?.buttons || {}));
        }
        return button;
    } catch (error) {
        console.error('Error getting custom button:', error);
        return null;
    }
}

/**
 * List all custom buttons for a guild
 */
async function listCustomButtons(guildId, filters = {}) {
    try {
        const safariData = await loadSafariContent();
        const buttons = safariData[guildId]?.buttons || {};
        
        let buttonList = Object.values(buttons);
        
        // Apply filters if provided
        if (filters.createdBy) {
            buttonList = buttonList.filter(b => b.metadata.createdBy === filters.createdBy);
        }
        
        // Sort by creation date (newest first)
        buttonList.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
        
        return buttonList;
    } catch (error) {
        console.error('Error listing custom buttons:', error);
        return [];
    }
}

/**
 * Get player currency
 */
async function getCurrency(guildId, userId) {
    try {
        const playerData = await loadPlayerData();
        return playerData[guildId]?.players?.[userId]?.safari?.currency || 0;
    } catch (error) {
        console.error('Error getting currency:', error);
        return 0;
    }
}

/**
 * Universal safari player initialization - ensures all required safari fields exist
 * @param {Object} playerData - Player data object to modify
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} defaultCurrency - Optional default currency value (defaults to 0)
 */
function initializePlayerSafari(playerData, guildId, userId, defaultCurrency = 0) {
    // Initialize guild structure
    if (!playerData[guildId]) {
        playerData[guildId] = { players: {}, tribes: {}, timezones: {} };
    }
    
    // Initialize player structure
    if (!playerData[guildId].players[userId]) {
        playerData[guildId].players[userId] = {};
    }
    
    // Initialize complete safari structure with all required fields
    if (!playerData[guildId].players[userId].safari) {
        playerData[guildId].players[userId].safari = {
            currency: defaultCurrency,
            history: [],
            lastInteraction: Date.now(),
            achievements: [],
            inventory: {},          // CRITICAL: Always initialize inventory
            cooldowns: {},          // Button cooldowns  
            buttonUses: {},         // Usage tracking
            storeHistory: []        // Purchase history
        };
    }
    
    // DEFENSIVE: Ensure inventory exists even if safari structure exists
    if (!playerData[guildId].players[userId].safari.inventory) {
        console.warn(`⚠️ DEFENSIVE: Missing inventory for user ${userId}, reinitializing`);
        playerData[guildId].players[userId].safari.inventory = {};
    }
    
    // DEFENSIVE: Ensure other critical fields exist
    if (!playerData[guildId].players[userId].safari.history) {
        playerData[guildId].players[userId].safari.history = [];
    }
    if (!playerData[guildId].players[userId].safari.achievements) {
        playerData[guildId].players[userId].safari.achievements = [];
    }
    if (!playerData[guildId].players[userId].safari.cooldowns) {
        playerData[guildId].players[userId].safari.cooldowns = {};
    }
    if (!playerData[guildId].players[userId].safari.buttonUses) {
        playerData[guildId].players[userId].safari.buttonUses = {};
    }
    if (!playerData[guildId].players[userId].safari.storeHistory) {
        playerData[guildId].players[userId].safari.storeHistory = [];
    }
    
    console.log(`🔧 DEBUG: Safari initialization complete for user ${userId}`);
}

/**
 * Get all default items for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Array} Array of item IDs marked as default
 */
async function getDefaultItems(guildId) {
    try {
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        const defaultItems = [];
        
        for (const [itemId, item] of Object.entries(items)) {
            // Check if item exists and is marked as default
            if (item && item.metadata?.defaultItem === 'Yes') {
                defaultItems.push(itemId);
            }
        }
        
        console.log(`📦 DEBUG: Found ${defaultItems.length} default items for guild ${guildId}`);
        return defaultItems;
    } catch (error) {
        console.error('Error getting default items:', error);
        return [];
    }
}

/**
 * Grant default items to a player
 * @param {Object} playerData - Player data object
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 */
async function grantDefaultItems(playerData, guildId, userId) {
    try {
        const defaultItems = await getDefaultItems(guildId);
        
        if (defaultItems.length === 0) {
            return;
        }
        
        // Ensure player has safari.inventory
        if (!playerData[guildId]?.players?.[userId]?.safari?.inventory) {
            console.warn(`⚠️ Cannot grant default items - player ${userId} has no inventory`);
            return;
        }
        
        const inventory = playerData[guildId].players[userId].safari.inventory;
        
        // Double-check items still exist before granting
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        let itemsGranted = 0;
        
        for (const itemId of defaultItems) {
            // Verify item still exists (graceful handling if deleted)
            if (!items[itemId]) {
                console.warn(`⚠️ Default item ${itemId} no longer exists, skipping`);
                continue;
            }
            
            // Add 1x of each default item
            if (!inventory[itemId]) {
                inventory[itemId] = 1;
            } else {
                inventory[itemId] += 1;
            }
            itemsGranted++;
        }
        
        console.log(`🎁 Granted ${itemsGranted} default items to player ${userId}`);
    } catch (error) {
        console.error('Error granting default items:', error);
    }
}

/**
 * Update player currency
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {number} amount - Amount to add/subtract
 * @param {Object} context - Optional context for logging (username, source, etc.)
 */
async function updateCurrency(guildId, userId, amount, context = {}) {
    try {
        const playerData = await loadPlayerData();
        
        // Use universal safari initialization
        initializePlayerSafari(playerData, guildId, userId);
        
        const currentCurrency = playerData[guildId].players[userId].safari.currency;
        const newCurrency = Math.max(0, currentCurrency + amount); // Don't go below 0
        
        playerData[guildId].players[userId].safari.currency = newCurrency;
        playerData[guildId].players[userId].safari.lastInteraction = Date.now();
        
        await savePlayerData(playerData);
        
        console.log(`🪙 DEBUG: Currency updated for user ${userId}: ${currentCurrency} → ${newCurrency} (${amount >= 0 ? '+' : ''}${amount})`);
        
        // Log currency change to Safari Log
        if (amount !== 0) { // Only log actual changes
            try {
                const { logCurrencyChange } = await import('./safariLogger.js');
                const safariData = await loadSafariContent();
                const customTerms = await getCustomTerms(guildId);
                
                // Get player location
                const activeMapId = safariData[guildId]?.maps?.active;
                let location = 'Unknown';
                if (activeMapId && playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]) {
                    location = playerData[guildId].players[userId].safari.mapProgress[activeMapId].currentLocation || 'Unknown';
                }
                
                await logCurrencyChange({
                    guildId,
                    userId,
                    username: context.username || 'Unknown',
                    displayName: context.displayName || context.username || 'Unknown',
                    location,
                    amount,
                    currencyName: customTerms.currencyName,
                    source: context.source || 'manual',
                    channelName: context.channelName || null
                });
            } catch (logError) {
                console.error('Safari Log Error:', logError);
                // Don't fail the currency update if logging fails
            }
        }
        
        return newCurrency;
    } catch (error) {
        console.error('Error updating currency:', error);
        throw error;
    }
}

/**
 * Execute display text action
 */
async function executeDisplayText(config, interaction) {
    console.log('📄 DEBUG: Executing display text action');
    console.log('📄 DEBUG: Display text config:', JSON.stringify(config, null, 2));
    
    const components = [];
    
    // Add title if provided
    if (config.title) {
        components.push({
            type: 10, // Text Display
            content: `# ${config.title}`
        });
    }
    
    // Add main content
    components.push({
        type: 10, // Text Display
        content: config.content
    });
    
    // Add Media Gallery if image is provided
    if (config.image) {
        components.push({
            type: 12, // Media Gallery
            items: [{
                media: { url: config.image },
                description: config.title || 'Image'
            }]
        });
    }
    
    // Create container component
    const container = {
        type: 17, // Container
        components: components
    };
    
    // Add accent color if provided
    if (config.color) {
        try {
            // Parse color from various formats (#3498db, 3498db, 3447003)
            let colorStr = config.color.toString().replace('#', '');
            // If it's a valid hex color, parse it
            if (/^[0-9A-Fa-f]{6}$/.test(colorStr)) {
                container.accent_color = parseInt(colorStr, 16);
            }
        } catch (error) {
            console.log(`⚠️ Invalid display text color format: ${config.color}, ignoring`);
        }
    }

    return {
        flags: (1 << 15), // IS_COMPONENTS_V2 only - no EPHEMERAL for display text
        components: [container]
    };
}

/**
 * Execute currency update action
 */
async function executeUpdateCurrency(config, userId, guildId, interaction) {
    // Get custom terms for this guild
    const customTerms = await getCustomTerms(guildId);

    console.log(`${customTerms.currencyEmoji} DEBUG: Executing currency update: ${config.amount} for user ${userId}`);

    const context = {
        username: interaction?.user?.username || 'Unknown',
        displayName: interaction?.member?.displayName || interaction?.user?.username || 'Unknown',
        source: 'update_currency',
        channelName: interaction?.channel?.name || null
    };
    const newBalance = await updateCurrency(guildId, userId, config.amount, context);

    let message = config.message || `Currency updated!`;

    // Add balance info with custom currency terms
    const sign = config.amount >= 0 ? '+' : '';
    message += `\n\n${customTerms.currencyEmoji} **${sign}${config.amount} ${customTerms.currencyName}**`;
    message += `\nYour balance: **${newBalance} ${customTerms.currencyName}**`;

    return {
        flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
        components: [{
            type: 17, // Container
            components: [{
                type: 10, // Text Display
                content: message
            }]
        }]
    };
}

/**
 * Execute give currency action
 */
async function executeGiveCurrency(config, userId, guildId, interaction, buttonId = null, actionIndex = null) {
    // Get custom terms for this guild
    const customTerms = await getCustomTerms(guildId);
    
    console.log(`💰 DEBUG: Executing give currency: ${config.amount} for user ${userId}`);
    
    // Check usage limits
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        const claimedBy = config.limit.claimedBy || [];
        
        if (config.limit.type === 'once_per_player' && claimedBy.includes(userId)) {
            return {
                flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
                components: [{
                    type: 17, // Container
                    components: [{
                        type: 10, // Text Display
                        content: `❌ You have already claimed this ${customTerms.currencyName} reward!`
                    }]
                }]
            };
        }

        if (config.limit.type === 'once_globally' && claimedBy) {
            return {
                flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
                components: [{
                    type: 17, // Container
                    components: [{
                        type: 10, // Text Display
                        content: `❌ This ${customTerms.currencyName} reward has already been claimed!`
                    }]
                }]
            };
        }
    }
    
    // Give the currency with context for logging
    const context = {
        username: interaction?.user?.username || 'Unknown',
        displayName: interaction?.member?.displayName || interaction?.user?.username || 'Unknown',
        source: buttonId ? `Button: ${buttonId}` : 'give_currency',
        channelName: interaction?.channel?.name || null
    };
    const newBalance = await updateCurrency(guildId, userId, config.amount, context);
    
    // Update claim tracking persistently - use specific button and action if provided
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        
        if (buttonId && actionIndex !== null) {
            // Direct update to specific action
            const button = safariData[guildId]?.buttons?.[buttonId];
            if (button && button.actions && button.actions[actionIndex]) {
                const action = button.actions[actionIndex];
                if (action.type === 'give_currency') {
                    if (config.limit.type === 'once_per_player') {
                        if (!action.config.limit.claimedBy) {
                            action.config.limit.claimedBy = [];
                        }
                        if (!action.config.limit.claimedBy.includes(userId)) {
                            action.config.limit.claimedBy.push(userId);
                        }
                    } else if (config.limit.type === 'once_globally') {
                        action.config.limit.claimedBy = userId;
                    }
                    
                    await saveSafariContent(safariData);
                    console.log(`✅ Updated claim tracking for give_currency action ${buttonId}[${actionIndex}]`);
                }
            }
        } else {
            // Legacy fallback: Find the button and action to update (DEPRECATED - causes cross-action issues)
            console.warn(`⚠️ Using legacy claim tracking for currency - this may cause cross-action claim conflicts`);
            for (const fallbackButtonId in safariData[guildId]?.buttons || {}) {
                const button = safariData[guildId].buttons[fallbackButtonId];
                if (button.actions) {
                    for (let i = 0; i < button.actions.length; i++) {
                        const action = button.actions[i];
                        // Match by type and amount to find the right action
                        if (action.type === 'give_currency' && 
                            action.config?.amount === config.amount &&
                            action.config?.limit?.type === config.limit.type) {
                            
                            if (config.limit.type === 'once_per_player') {
                                if (!action.config.limit.claimedBy) {
                                    action.config.limit.claimedBy = [];
                                }
                                if (!action.config.limit.claimedBy.includes(userId)) {
                                    action.config.limit.claimedBy.push(userId);
                                }
                            } else if (config.limit.type === 'once_globally') {
                                action.config.limit.claimedBy = userId;
                            }
                            
                            await saveSafariContent(safariData);
                            break;
                        }
                    }
                }
            }
        }
    }
    
    let message = config.message || `You received ${customTerms.currencyName}!`;
    message += `\n\n${customTerms.currencyEmoji} **+${config.amount} ${customTerms.currencyName}**`;
    message += `\nYour balance: **${newBalance} ${customTerms.currencyName}**`;

    return {
        flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
        components: [{
            type: 17, // Container
            components: [{
                type: 10, // Text Display
                content: message
            }]
        }]
    };
}

/**
 * Execute give item action
 */
async function executeGiveItem(config, userId, guildId, interaction, buttonId = null, actionIndex = null) {
    console.log(`🎁 DEBUG: Executing give item: ${config.itemId} x${config.quantity} for user ${userId}`);
    
    // Check usage limits using live data from safariContent
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        
        // Get live claim data from the actual button action
        let liveClaimedBy = null;
        if (buttonId && actionIndex !== null) {
            const button = safariData[guildId]?.buttons?.[buttonId];
            if (button && button.actions && button.actions[actionIndex]) {
                const action = button.actions[actionIndex];
                if (action.type === 'give_item' && action.config?.limit) {
                    liveClaimedBy = action.config.limit.claimedBy;
                }
            }
        }
        
        // Fallback to config if live data not available
        const claimedBy = liveClaimedBy !== null ? liveClaimedBy : config.limit.claimedBy;
        
        if (config.limit.type === 'once_per_player') {
            // For once_per_player, claimedBy should be an array
            const claimedArray = Array.isArray(claimedBy) ? claimedBy : [];
            if (claimedArray.includes(userId)) {
                return {
                    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
                    components: [{
                        type: 17, // Container
                        components: [{
                            type: 10, // Text Display
                            content: '❌ You have already claimed this item!'
                        }]
                    }]
                };
            }
        }
        
        if (config.limit.type === 'once_globally') {
            // For once_globally, only block if claimedBy is a valid user ID (string)
            // Arrays (empty or not) and null/undefined should allow claiming
            if (typeof claimedBy === 'string' && claimedBy !== '') {
                return {
                    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
                    components: [{
                        type: 17, // Container
                        components: [{
                            type: 10, // Text Display
                            content: '❌ This item has already been claimed!'
                        }]
                    }]
                };
            }
        }
    }
    
    // Give the item - pass null so addItemToInventory will handle loading and saving playerData
    const success = await addItemToInventory(guildId, userId, config.itemId, config.quantity, null);
    
    if (!success) {
        return {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
            components: [{
                type: 17, // Container
                components: [{
                    type: 10, // Text Display
                    content: '❌ Failed to add item to inventory. Item may not exist.'
                }]
            }]
        };
    }
    
    // Update claim tracking persistently - use specific button and action if provided
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        
        if (buttonId && actionIndex !== null) {
            // Direct update to specific action
            const button = safariData[guildId]?.buttons?.[buttonId];
            if (button && button.actions && button.actions[actionIndex]) {
                const action = button.actions[actionIndex];
                if (action.type === 'give_item') {
                    console.log(`🎁 BEFORE CLAIM: ${config.limit.type}, claimedBy:`, action.config.limit.claimedBy);
                    
                    if (config.limit.type === 'once_per_player') {
                        if (!action.config.limit.claimedBy) {
                            action.config.limit.claimedBy = [];
                        }
                        if (!action.config.limit.claimedBy.includes(userId)) {
                            action.config.limit.claimedBy.push(userId);
                        }
                    } else if (config.limit.type === 'once_globally') {
                        action.config.limit.claimedBy = userId;
                    }
                    
                    console.log(`🎁 AFTER CLAIM: ${config.limit.type}, claimedBy:`, action.config.limit.claimedBy);
                    
                    await saveSafariContent(safariData);
                    console.log(`✅ Updated claim tracking for give_item action ${buttonId}[${actionIndex}]`);
                }
            }
        } else {
            // Legacy fallback: Find the button and action to update (DEPRECATED - causes cross-action issues)
            console.warn(`⚠️ Using legacy claim tracking - this may cause cross-action claim conflicts`);
            for (const fallbackButtonId in safariData[guildId]?.buttons || {}) {
                const button = safariData[guildId].buttons[fallbackButtonId];
                if (button.actions) {
                    for (let i = 0; i < button.actions.length; i++) {
                        const action = button.actions[i];
                        // Match by type, itemId and quantity to find the right action
                        if (action.type === 'give_item' && 
                            action.config?.itemId === config.itemId &&
                            action.config?.quantity === config.quantity &&
                            action.config?.limit?.type === config.limit.type) {
                            
                            if (config.limit.type === 'once_per_player') {
                                if (!action.config.limit.claimedBy) {
                                    action.config.limit.claimedBy = [];
                                }
                                if (!action.config.limit.claimedBy.includes(userId)) {
                                    action.config.limit.claimedBy.push(userId);
                                }
                            } else if (config.limit.type === 'once_globally') {
                                action.config.limit.claimedBy = userId;
                            }
                            
                            await saveSafariContent(safariData);
                            console.log(`✅ Updated claim tracking for give_item action (legacy fallback)`);
                            break;
                        }
                    }
                }
            }
        }
    }
    
    // Get item details
    const safariData = await loadSafariContent();
    const item = safariData[guildId]?.items?.[config.itemId];
    const itemName = item?.name || config.itemId;
    const itemEmoji = item?.emoji || '🎁';
    
    const message = `${itemEmoji} You received **${config.quantity}x ${itemName}**!`;

    return {
        flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
        components: [{
            type: 17, // Container
            components: [{
                type: 10, // Text Display
                content: message
            }]
        }]
    };
}

/**
 * Execute follow-up button action
 */
async function executeFollowUpButton(config, guildId, interaction) {
    console.log(`🔗 DEBUG: Executing follow-up button: ${config.buttonId}`);

    const followUpButton = await getCustomButton(guildId, config.buttonId);
    if (!followUpButton) {
        return {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
            components: [{
                type: 17, // Container
                components: [{
                    type: 10, // Text Display
                    content: '❌ Follow-up button not found.'
                }]
            }]
        };
    }
    
    // Create the follow-up button
    const button = new ButtonBuilder()
        .setCustomId(generateCustomId(guildId, followUpButton.id))
        .setLabel(followUpButton.label)
        .setStyle(BUTTON_STYLES[followUpButton.style] || ButtonStyle.Secondary);
    
    if (followUpButton.emoji) {
        button.setEmoji(followUpButton.emoji);
    }
    
    const actionRow = new ActionRowBuilder().addComponents(button);
    
    const components = [{
        type: 10, // Text Display
        content: `**Next Step Available:**\nClick the button below to continue.`
    }];
    
    // Add separator
    components.push({
        type: 14 // Separator
    });
    
    // Add action row
    components.push(actionRow.toJSON());
    
    const container = {
        type: 17, // Container
        accent_color: 0x3498db,
        components: components
    };
    
    return {
        flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 | EPHEMERAL
        components: [container]
    };
}

/**
 * Execute give role action
 */
async function executeGiveRole(config, userId, guildId, interaction) {
    console.log(`👑 DEBUG: Executing give role: ${config.roleId} for user ${userId}`);

    // Helper to create Components V2 response
    const createResponse = (content) => ({
        flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
        components: [{
            type: 17, // Container
            components: [{
                type: 10, // Text Display
                content
            }]
        }]
    });

    // Validate role ID
    if (!config.roleId) {
        return createResponse('❌ No role configured for this action.');
    }

    // Check if member object exists
    if (!interaction.member) {
        console.error('❌ No member object in interaction');
        return createResponse('❌ Unable to manage roles. Please try again.');
    }

    // Check if user already has the role
    const memberRoles = interaction.member.roles || [];
    const hasRole = memberRoles.includes(config.roleId);

    if (hasRole) {
        return createResponse('✅ You already have this role!');
    }

    try {
        // Get the guild and member from Discord.js client
        const guild = await interaction.client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        const role = await guild.roles.fetch(config.roleId);

        if (!role) {
            return createResponse('❌ The configured role no longer exists.');
        }

        // Check if bot has permission to manage this role
        const botMember = await guild.members.fetch(interaction.client.user.id);
        const botHighestRole = botMember.roles.highest;

        if (role.position >= botHighestRole.position) {
            return createResponse(`❌ I cannot assign the **${role.name}** role because it's higher than or equal to my highest role.`);
        }

        // Add the role
        await member.roles.add(role);

        console.log(`✅ Successfully gave role ${role.name} (${config.roleId}) to user ${userId}`);

        return createResponse(`✅ You have been given the **${role.name}** role!`);

    } catch (error) {
        console.error(`❌ Error giving role: ${error.message}`);

        // Handle specific Discord API errors
        if (error.code === 50013) {
            return createResponse('❌ I don\'t have permission to manage this role. Please check my role permissions.');
        } else if (error.code === 10011) {
            return createResponse('❌ The configured role no longer exists.');
        } else {
            return createResponse('❌ Failed to assign role. Please try again or contact an administrator.');
        }
    }
}

/**
 * Execute remove role action
 */
async function executeRemoveRole(config, userId, guildId, interaction) {
    console.log(`🚫 DEBUG: Executing remove role: ${config.roleId} for user ${userId}`);

    // Helper to create Components V2 response
    const createResponse = (content) => ({
        flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
        components: [{
            type: 17, // Container
            components: [{
                type: 10, // Text Display
                content
            }]
        }]
    });

    // Validate role ID
    if (!config.roleId) {
        return createResponse('❌ No role configured for this action.');
    }

    // Check if member object exists
    if (!interaction.member) {
        console.error('❌ No member object in interaction');
        return createResponse('❌ Unable to manage roles. Please try again.');
    }

    // Check if user has the role
    const memberRoles = interaction.member.roles || [];
    const hasRole = memberRoles.includes(config.roleId);

    if (!hasRole) {
        return createResponse('✅ You don\'t have this role.');
    }

    try {
        // Get the guild and member from Discord.js client
        const guild = await interaction.client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        const role = await guild.roles.fetch(config.roleId);

        if (!role) {
            return createResponse('❌ The configured role no longer exists.');
        }

        // Check if bot has permission to manage this role
        const botMember = await guild.members.fetch(interaction.client.user.id);
        const botHighestRole = botMember.roles.highest;

        if (role.position >= botHighestRole.position) {
            return createResponse(`❌ I cannot remove the **${role.name}** role because it's higher than or equal to my highest role.`);
        }

        // Remove the role
        await member.roles.remove(role);

        console.log(`✅ Successfully removed role ${role.name} (${config.roleId}) from user ${userId}`);

        return createResponse(`✅ The **${role.name}** role has been removed!`);

    } catch (error) {
        console.error(`❌ Error removing role: ${error.message}`);

        // Handle specific Discord API errors
        if (error.code === 50013) {
            return createResponse('❌ I don\'t have permission to manage this role. Please check my role permissions.');
        } else if (error.code === 10011) {
            return createResponse('❌ The configured role no longer exists.');
        } else {
            return createResponse('❌ Failed to remove role. Please try again or contact an administrator.');
        }
    }
}

/**
 * Send follow-up messages for additional display text actions
 * @param {string} token - Interaction token
 * @param {Array} responses - Array of additional responses to send
 */
async function sendFollowUpMessages(token, responses) {
    try {
        const { DiscordRequest } = await import('./utils.js');
        
        for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            console.log(`📤 DEBUG: Sending follow-up message ${i + 1}/${responses.length}`);
            
            // Send follow-up message
            await DiscordRequest(`webhooks/${process.env.APP_ID}/${token}`, {
                method: 'POST',
                body: {
                    ...response,
                    // Preserve original flags (should include IS_COMPONENTS_V2 | EPHEMERAL)
                    flags: response.flags || ((1 << 15) | (1 << 6)) // Default to IS_COMPONENTS_V2 | EPHEMERAL
                }
            });
            
            // Small delay between messages to avoid rate limiting
            if (i < responses.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        console.log(`✅ DEBUG: Successfully sent ${responses.length} follow-up messages`);
    } catch (error) {
        console.error('Error sending follow-up messages:', error);
    }
}

/**
 * Execute all actions for a button
 */
async function executeButtonActions(guildId, buttonId, userId, interaction, forceConditionsFail = false) {
    try {
        console.log(`🚀 DEBUG: Executing button actions for ${buttonId} by user ${userId}`);
        
        const button = await getCustomButton(guildId, buttonId);
        if (!button) {
            return {
                content: '❌ Button not found.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Check conditions if they exist
        let conditionsResult = true; // Default to true if no conditions
        
        // For modal triggers with wrong input, force conditions to fail
        if (forceConditionsFail) {
            conditionsResult = false;
            console.log(`🎯 Modal input mismatch - forcing conditions to fail for button ${buttonId}`);
        } else if (button.conditions && button.conditions.length > 0) {
            const playerData = await loadPlayerData();
            conditionsResult = await evaluateConditions(button.conditions, {
                playerData,
                guildId,
                userId,
                member: interaction.member
            });
            
            console.log(`📊 Conditions evaluated to: ${conditionsResult} for button ${buttonId}`);
        }
        
        // Update usage count
        const safariData = await loadSafariContent();
        if (safariData[guildId]?.buttons?.[buttonId]) {
            safariData[guildId].buttons[buttonId].metadata.usageCount++;
            await saveSafariContent(safariData);
        }
        
        // Note: Safari button logging is now handled by the comprehensive custom action logging at the end of executeButtonActions
        
        // Filter actions based on executeOn property and conditions result
        const conditionsResultString = conditionsResult ? 'true' : 'false';
        const actionsToExecute = button.actions.filter(action => {
            // Default executeOn to 'true' for backwards compatibility
            const executeOn = action.executeOn || 'true';
            return executeOn === conditionsResultString;
        });
        
        console.log(`🎯 Executing ${actionsToExecute.length} actions where executeOn='${conditionsResultString}'`);
        
        // If no actions match the condition result, return a message
        if (actionsToExecute.length === 0) {
            if (!conditionsResult) {
                return {
                    content: '❌ You do not meet the requirements for this action.',
                    flags: InteractionResponseFlags.EPHEMERAL
                };
            } else {
                return {
                    content: '✅ Conditions met, but no actions are configured for this state.',
                    flags: InteractionResponseFlags.EPHEMERAL
                };
            }
        }
        
        // Sort actions by order
        const sortedActions = actionsToExecute.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        const responses = [];
        
        for (let i = 0; i < sortedActions.length; i++) {
            const action = sortedActions[i];
            console.log(`🎯 DEBUG: Executing action ${i}: type=${action.type}, config=${JSON.stringify(action.config)}`);
            let result;
            
            switch (action.type) {
                case ACTION_TYPES.DISPLAY_TEXT:
                case 'display_text': // Legacy support
                    result = await executeDisplayText(action.config, interaction);
                    
                    // Collect ALL consecutive follow-up buttons to bundle
                    const followUpButtons = [];
                    let j = i + 1;
                    
                    while (j < sortedActions.length) {
                        const nextAction = sortedActions[j];
                        if (nextAction.type === ACTION_TYPES.FOLLOW_UP_BUTTON || 
                            nextAction.type === 'follow_up_button' || 
                            nextAction.type === 'follow_up') {
                            followUpButtons.push(nextAction);
                            j++;
                        } else {
                            break; // Stop when we encounter a non-follow-up action
                        }
                    }
                    
                    // If we have follow-up buttons to bundle
                    if (followUpButtons.length > 0) {
                        console.log(`📎 DEBUG: Bundling ${followUpButtons.length} follow_up_button(s) with display_text`);
                        
                        // Add separator before buttons
                        if (result.components?.[0]?.components) {
                            result.components[0].components.push({
                                type: 14 // Separator
                            });
                            
                            // Create a single action row for all buttons (max 5, but we have max 4)
                            const buttonComponents = [];
                            
                            for (const followUpAction of followUpButtons) {
                                // Get the follow-up button component
                                const followUpResult = await executeFollowUpButton(followUpAction.config, guildId, interaction);
                                
                                // Extract the button from the follow-up result
                                if (followUpResult.components?.[0]?.components) {
                                    const followUpComponents = followUpResult.components[0].components;
                                    
                                    // Find the action row with the button
                                    const buttonRow = followUpComponents.find(comp => comp.type === 1);
                                    
                                    if (buttonRow?.components?.[0]) {
                                        // Extract the button component itself (not the row)
                                        buttonComponents.push(buttonRow.components[0]);
                                    }
                                }
                            }
                            
                            // Add all buttons in a single action row
                            if (buttonComponents.length > 0) {
                                result.components[0].components.push({
                                    type: 1, // Action Row
                                    components: buttonComponents
                                });
                            }
                        }
                        
                        // Skip all the bundled actions
                        i = j - 1; // Set i to the last bundled action index
                    }
                    
                    responses.push(result);
                    break;
                    
                case ACTION_TYPES.UPDATE_CURRENCY:
                case 'update_currency': // Legacy support
                    result = await executeUpdateCurrency(action.config, userId, guildId, interaction);
                    responses.push(result);
                    break;
                    
                case ACTION_TYPES.FOLLOW_UP_BUTTON:
                case 'follow_up_button': // Legacy support
                case 'follow_up': // Legacy support for old buttons
                    // Only execute as standalone if not bundled with previous display_text
                    result = await executeFollowUpButton(action.config, guildId, interaction);
                    responses.push(result);
                    break;
                    
                case ACTION_TYPES.CONDITIONAL:
                    result = await executeConditionalAction(action.config, guildId, userId, interaction);
                    if (result) responses.push(result);
                    break;
                    
                case ACTION_TYPES.STORE_DISPLAY:
                    result = await executeStoreDisplay(action.config, guildId, userId, interaction);
                    responses.push(result);
                    break;
                    
                case ACTION_TYPES.RANDOM_OUTCOME:
                    result = await executeRandomOutcome(action.config, guildId, userId, interaction);
                    responses.push(result);
                    break;
                    
                case ACTION_TYPES.CHECK_POINTS:
                    result = await executeCheckPoints(action.config, guildId, userId, interaction);
                    if (result) responses.push(result);
                    break;
                    
                case ACTION_TYPES.MODIFY_POINTS:
                    result = await executeModifyPoints(action.config, guildId, userId, interaction);
                    responses.push(result);
                    break;
                    
                case ACTION_TYPES.MOVE_PLAYER:
                    result = await executeMovePlayer(action.config, guildId, userId, interaction);
                    responses.push(result);
                    break;
                    
                case 'give_currency':
                    // Find the original action index in the unsorted button.actions array
                    const currencyActionIndex = button.actions.findIndex(a => a === action);
                    result = await executeGiveCurrency(action.config, userId, guildId, interaction, buttonId, currencyActionIndex);
                    responses.push(result);
                    break;
                    
                case 'give_item':
                    // Find the original action index in the unsorted button.actions array
                    const itemActionIndex = button.actions.findIndex(a => a === action);
                    result = await executeGiveItem(action.config, userId, guildId, interaction, buttonId, itemActionIndex);
                    responses.push(result);
                    break;
                    
                case 'give_role':
                    result = await executeGiveRole(action.config, userId, guildId, interaction);
                    responses.push(result);
                    break;
                    
                case 'remove_role':
                    result = await executeRemoveRole(action.config, userId, guildId, interaction);
                    responses.push(result);
                    break;

                case 'calculate_results':
                    try {
                        console.log(`🌾 DEBUG: Executing calculate_results action for guild ${guildId}`);

                        // Get scope configuration (default to all_players for backwards compatibility)
                        const scope = action.config?.scope || 'all_players';
                        console.log(`🎯 DEBUG: Calculate results scope: ${scope}`);

                        let harvestResult;
                        if (scope === 'single_player') {
                            // Process only the user who clicked the button
                            // Extract correct player name from interaction
                            const playerName = interaction?.member?.displayName ||
                                             interaction?.member?.user?.global_name ||
                                             interaction?.member?.user?.username ||
                                             interaction?.user?.global_name ||
                                             interaction?.user?.username ||
                                             `Player ${userId.slice(-4)}`;
                            harvestResult = await calculateSinglePlayerResults(guildId, userId, playerName);
                            console.log(`🌾 SUCCESS: Single player results completed - ${harvestResult.playerName}, ${harvestResult.totalEarnings} earnings`);
                        } else {
                            // Default behavior: process all players
                            harvestResult = await calculateSimpleResults(guildId);
                            console.log(`🌾 SUCCESS: All players results completed - ${harvestResult.processedPlayers} players, ${harvestResult.totalEarnings} total earnings`);
                        }

                        // Create formatted response message with proper container structure
                        let responseContent;
                        let headerContent;
                        if (scope === 'single_player') {
                            headerContent = `## ✅ Results Calculated!\n\n**Single Player Processing Complete**`;
                            responseContent = `👤 **Player:** ${harvestResult.playerName}\n💰 **Earnings:** ${harvestResult.totalEarnings} currency`;
                        } else {
                            headerContent = `## ✅ Results Calculated!\n\n**All Players Processing Complete**`;
                            responseContent = `📊 **Players Processed:** ${harvestResult.processedPlayers}\n💰 **Total Earnings:** ${harvestResult.totalEarnings} currency`;
                        }

                        result = {
                            flags: (1 << 15), // IS_COMPONENTS_V2
                            components: [{
                                type: 17, // Container
                                accent_color: 0x2ECC71, // Green accent for success
                                components: [
                                    {
                                        type: 10, // Text Display
                                        content: headerContent
                                    },
                                    { type: 14 }, // Separator
                                    {
                                        type: 10, // Text Display
                                        content: responseContent
                                    }
                                ]
                            }]
                        };
                        responses.push(result);
                    } catch (error) {
                        console.error('Error executing calculate_results action:', error);
                        result = {
                            flags: (1 << 15), // IS_COMPONENTS_V2
                            components: [{
                                type: 17, // Container
                                accent_color: 0xE74C3C, // Red accent for error
                                components: [
                                    {
                                        type: 10, // Text Display
                                        content: '## ❌ Error Calculating Results\n\nPlease try again or contact an administrator.'
                                    }
                                ]
                            }]
                        };
                        responses.push(result);
                    }
                    break;

                default:
                    console.log(`⚠️ Unknown action type: ${action.type}`);
            }
        }
        
        // Handle multiple display_text actions with follow-up messages
        const displayResponses = responses.filter(r => r.components || r.content);
        const otherResponses = responses.filter(r => !r.components && !r.content);
        
        console.log(`📊 DEBUG: Found ${displayResponses.length} display responses, ${otherResponses.length} other responses`);
        
        // Return the first display_text response as main response
        const mainResponse = displayResponses[0] || {
            content: '✅ Button action completed successfully!',
            flags: InteractionResponseFlags.EPHEMERAL
        };
        
        // Send additional display_text actions as follow-up messages
        if (displayResponses.length > 1) {
            console.log(`📤 DEBUG: Sending ${displayResponses.length - 1} follow-up messages`);
            // Extract token from interaction object (handles different interaction formats)
            const token = interaction?.token || interaction?.data?.token || interaction?.body?.token;
            if (token) {
                // Schedule follow-up messages (don't await to avoid blocking main response)
                sendFollowUpMessages(token, displayResponses.slice(1));
            } else {
                console.warn('⚠️ No interaction token available for follow-up messages');
            }
        }
        
        console.log(`✅ DEBUG: Button actions executed successfully, returning response`);

        // Check if any calculate_results actions were executed and update anchor messages
        const calculateResultsActions = sortedActions.filter(action => action.type === 'calculate_results');
        const hasCalculateResults = calculateResultsActions.length > 0;

        if (hasCalculateResults && button.coordinates && Array.isArray(button.coordinates)) {
            // OPTIMIZED: Only update anchors for all_players scope (single player changes don't affect map state)
            const hasAllPlayersScope = calculateResultsActions.some(action =>
                action.config?.scope !== 'single_player'
            );

            if (hasAllPlayersScope) {
                console.log(`🌾 DEBUG: Calculate Results (all players) detected, updating anchor messages for coordinates: ${button.coordinates.join(', ')}`);

                // Import anchor update function
                const { updateAnchorMessage } = await import('./mapCellUpdater.js');

                // Update anchor message for each coordinate this button is associated with
                for (const coordinate of button.coordinates) {
                    try {
                        console.log(`📍 DEBUG: Updating anchor message for coordinate ${coordinate}`);
                        const client = interaction?.client;
                        if (client) {
                            await updateAnchorMessage(guildId, coordinate, client);
                            console.log(`✅ SUCCESS: Updated anchor message for ${coordinate}`);
                        } else {
                            console.warn(`⚠️ WARNING: No client available to update anchor for ${coordinate}`);
                        }
                    } catch (anchorError) {
                        console.error(`❌ ERROR: Failed to update anchor for ${coordinate}:`, anchorError);
                        // Don't throw - anchor update failure shouldn't break the main action
                    }
                }
            } else {
                console.log(`🌾 DEBUG: Calculate Results (single player only) - skipping anchor updates (map state unchanged)`);
            }
        }

        // Log the custom action
        try {
            console.log(`📝 DEBUG: Attempting to log custom action for button ${buttonId}`);
            
            const { logCustomAction } = await import('./safariLogger.js');
            const { loadPlayerData } = await import('./storage.js');
            const playerData = await loadPlayerData();
            const userData = playerData.players?.[guildId]?.[userId] || {};
            
            console.log(`📝 DEBUG: User data found - username: ${userData.username || 'Unknown'}`);
            
            // Get location from button ID or interaction channel
            let location = 'Unknown';
            if (button.id && button.id.includes('_')) {
                // Try to extract location from button ID if it contains coordinates
                const parts = button.id.split('_');
                const possibleCoord = parts[parts.length - 1];
                if (/^[A-Z]\d+$/.test(possibleCoord)) {
                    location = possibleCoord;
                }
            }
            
            // Otherwise try to get from channel name
            if (location === 'Unknown' && interaction.channelName) {
                // Get channel info from interaction if available
                const channelName = interaction.channelName;
                console.log(`📝 DEBUG: Attempting to extract location from channelName: "${channelName}"`);
                if (channelName && channelName !== 'Unknown') {
                    // Extract coordinate from channel name like "#b1"
                    const match = channelName.match(/#?([A-Za-z]\d+)/);
                    console.log(`📝 DEBUG: Channel name regex match:`, match);
                    if (match) {
                        location = match[1].toUpperCase();
                        console.log(`📝 DEBUG: Extracted location: ${location}`);
                    }
                }
            }
            
            console.log(`📝 DEBUG: Location determined as: ${location}, channelName: ${interaction.channelName || 'Unknown'}`);
            
            const logData = {
                guildId,
                userId,
                username: userData.username || interaction.member?.user?.username || 'Unknown',
                displayName: interaction.member?.displayName || interaction.member?.user?.global_name || userData.username || 'Unknown',
                location,
                actionType: 'safari_button',
                actionId: buttonId,
                executedActions: sortedActions.map(action => ({
                    type: action.type,
                    config: action.config,
                    result: 'executed'
                })),
                success: true,
                channelName: interaction.channelName || 'Unknown'
            };
            
            console.log(`📝 DEBUG: Calling logCustomAction with data:`, JSON.stringify(logData, null, 2));
            
            await logCustomAction(logData);
            
            console.log(`📝 DEBUG: Custom action logged successfully`);
        } catch (logError) {
            console.error('Error logging custom action:', logError);
            console.error('Stack:', logError.stack);
        }
        
        return mainResponse;
        
    } catch (error) {
        console.error('Error executing button actions:', error);
        
        // Log the failed action
        try {
            const { logCustomAction } = await import('./safariLogger.js');
            const { loadPlayerData } = await import('./storage.js');
            const playerData = await loadPlayerData();
            const userData = playerData.players?.[guildId]?.[userId] || {};
            
            await logCustomAction({
                guildId,
                userId,
                username: userData.username || 'Unknown',
                displayName: interaction.member?.displayName || userData.username || 'Unknown',
                location: 'Unknown',
                actionType: 'safari_button',
                actionId: buttonId,
                executedActions: [],
                success: false,
                errorMessage: error.message,
                channelName: interaction.channelName || 'Unknown'
            });
        } catch (logError) {
            console.error('Error logging failed custom action:', logError);
        }
        
        return {
            content: '❌ Error executing button actions. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Post a custom button to a channel
 */
async function postButtonToChannel(guildId, buttonId, channelId, client) {
    try {
        console.log(`📤 DEBUG: Posting button ${buttonId} to channel ${channelId}`);
        
        const button = await getCustomButton(guildId, buttonId);
        if (!button) {
            throw new Error('Button not found');
        }
        
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            throw new Error('Channel not found');
        }
        
        // Create Discord button
        const discordButton = new ButtonBuilder()
            .setCustomId(generateCustomId(guildId, buttonId))
            .setLabel(button.label)
            .setStyle(BUTTON_STYLES[button.style]);
        
        if (button.emoji) {
            try {
                // Only set simple emojis - skip complex multi-character emojis that Discord rejects
                const emojiLength = [...button.emoji].length;
                if (emojiLength <= 2) {
                    discordButton.setEmoji(button.emoji);
                }
            } catch (error) {
                console.log(`⚠️ DEBUG: Skipping invalid emoji for button ${buttonId}: ${button.emoji}`);
            }
        }
        
        const actionRow = new ActionRowBuilder().addComponents(discordButton);
        
        // Send the button
        await channel.send({
            components: [actionRow]
        });
        
        console.log(`✅ DEBUG: Button posted successfully to channel ${channelId}`);
        return true;
        
    } catch (error) {
        console.error('Error posting button to channel:', error);
        throw error;
    }
}

/**
 * MVP2: Store Management Functions
 */

/**
 * Create a new store
 */
async function createStore(guildId, storeData, userId) {
    try {
        console.log(`🏪 DEBUG: Creating store for guild ${guildId} by user ${userId}`);

        const safariData = await loadSafariContent();

        if (!safariData[guildId]) {
            safariData[guildId] = { buttons: {}, safaris: {}, applications: {}, stores: {}, items: {} };
        }

        // Check for duplicate store name (case-insensitive)
        const existingStores = Object.values(safariData[guildId].stores || {});
        const duplicateStore = existingStores.find(s =>
            s.name.toLowerCase() === storeData.name.toLowerCase()
        );
        if (duplicateStore) {
            const error = new Error(`Store "${storeData.name}" already exists`);
            error.code = 'DUPLICATE_STORE';
            throw error;
        }

        const storeId = generateButtonId(storeData.name); // Reuse ID generation
        
        const store = {
            id: storeId,
            name: storeData.name,
            description: storeData.description || '',
            emoji: storeData.emoji || '🏪',
            items: storeData.items || [], // Array of {itemId, price}
            settings: {
                storeownerText: storeData.storeownerText || 'Welcome to my store!',
                accentColor: storeData.accentColor || 0x2ecc71,
                requiresRole: storeData.requiresRole || null
            },
            metadata: {
                createdBy: userId,
                createdAt: Date.now(),
                lastModified: Date.now(),
                totalSales: 0
            }
        };
        
        safariData[guildId].stores[storeId] = store;
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Store '${storeId}' created successfully`);
        return storeId;
    } catch (error) {
        console.error('Error creating store:', error);
        throw error;
    }
}

/**
 * Create a reusable item
 */
async function createItem(guildId, itemData, userId) {
    try {
        console.log(`📦 DEBUG: Creating item for guild ${guildId} by user ${userId}`);
        
        const safariData = await loadSafariContent();
        
        if (!safariData[guildId]) {
            safariData[guildId] = { buttons: {}, safaris: {}, applications: {}, stores: {}, items: {} };
        }
        
        const itemId = generateButtonId(itemData.name);
        
        const item = {
            id: itemId,
            name: itemData.name,
            description: itemData.description || '',
            emoji: itemData.emoji || '📦',
            category: itemData.category || 'misc',
            basePrice: itemData.basePrice || 100,
            maxQuantity: itemData.maxQuantity || -1, // -1 = unlimited
            
            // Challenge Game Logic fields
            goodOutcomeValue: itemData.goodOutcomeValue || null,
            badOutcomeValue: itemData.badOutcomeValue || null,
            attackValue: itemData.attackValue || null,
            defenseValue: itemData.defenseValue || null,
            consumable: itemData.consumable || 'No', // 'Yes' or 'No'
            staminaBoost: parseInt(itemData.staminaBoost) || 0, // Stamina points granted when consumed
            goodYieldEmoji: itemData.goodYieldEmoji || '☀️',
            badYieldEmoji: itemData.badYieldEmoji || '☄️',
            
            metadata: {
                createdBy: userId || itemData.createdBy,
                createdAt: Date.now(),
                totalSold: 0
            }
        };
        
        safariData[guildId].items[itemId] = item;
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Item '${itemId}' created successfully`);
        return itemId;
    } catch (error) {
        console.error('Error creating item:', error);
        throw error;
    }
}

/**
 * Get player inventory
 */
async function getPlayerInventory(guildId, userId) {
    try {
        const playerData = await loadPlayerData();
        return playerData[guildId]?.players?.[userId]?.safari?.inventory || {};
    } catch (error) {
        console.error('Error getting player inventory:', error);
        return {};
    }
}

/**
 * Add item to player inventory
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID  
 * @param {string} itemId - Item ID
 * @param {number} quantity - Quantity to add (default: 1)
 * @param {Object} existingPlayerData - Optional existing player data to avoid race conditions
 */
async function addItemToInventory(guildId, userId, itemId, quantity = 1, existingPlayerData = null) {
    try {
        const playerData = existingPlayerData || await loadPlayerData();
        const safariData = await loadSafariContent();
        
        // Use universal safari initialization
        initializePlayerSafari(playerData, guildId, userId);
        
        // DEFENSIVE: Additional check to ensure inventory exists before access
        if (!playerData[guildId].players[userId].safari.inventory) {
            console.error(`🚨 CRITICAL: Inventory still missing after initialization for user ${userId}`);
            playerData[guildId].players[userId].safari.inventory = {};
        }
        
        // Get item definition to check if it's an attack item
        const itemDefinition = safariData[guildId]?.items?.[itemId];
        const isAttackItem = itemDefinition && (itemDefinition.attackValue !== null && itemDefinition.attackValue !== undefined);
        
        const currentItem = playerData[guildId].players[userId].safari.inventory[itemId];
        let currentQuantity = 0;
        
        console.log(`🔍 DEBUG: addItemToInventory - BEFORE: ${itemId} = `, currentItem);
        console.log(`🔍 DEBUG: Item is attack item: ${isAttackItem}, attackValue: ${itemDefinition?.attackValue}`);
        
        // Get current quantity using universal accessor
        currentQuantity = getItemQuantity(currentItem);
        const currentAttacks = getItemAttackAvailability(currentItem);
        
        console.log(`🔍 DEBUG: Current - quantity: ${currentQuantity}, attacks: ${currentAttacks}, adding: ${quantity}`);
        
        // Calculate new values
        const newQuantity = currentQuantity + quantity;
        const newAttacks = isAttackItem ? (currentAttacks + quantity) : 0; // Attack items add attack availability
        
        // Always set in object format using universal setter
        setItemQuantity(
            playerData[guildId].players[userId].safari.inventory,
            itemId,
            newQuantity,
            newAttacks
        );
        
        console.log(`⚔️ DEBUG: Updated to object format - quantity: ${newQuantity}, attacks: ${newAttacks}`);
        
        console.log(`🔍 DEBUG: addItemToInventory - AFTER: ${itemId} = `, playerData[guildId].players[userId].safari.inventory[itemId]);
        
        // Only save if we're not using existing player data (to avoid race conditions)
        if (!existingPlayerData) {
            await savePlayerData(playerData);
            console.log(`✅ DEBUG: PlayerData saved to disk`);
        } else {
            console.log(`🔄 DEBUG: Using existing playerData - caller will handle saving`);
        }
        
        console.log(`📦 DEBUG: Added ${quantity}x ${itemId} to user ${userId} inventory`);
        
        // Log item pickup to Safari Log
        try {
            const { logItemPickup } = await import('./safariLogger.js');
            const itemDef = safariData[guildId]?.items?.[itemId];
            
            // Get player location - check if they're on a map
            const activeMapId = safariData[guildId]?.maps?.active;
            let location = 'Unknown';
            if (activeMapId && playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]) {
                location = playerData[guildId].players[userId].safari.mapProgress[activeMapId].currentLocation || 'Unknown';
            }
            
            // Get user info from Discord if available (caller can pass via existingPlayerData.username)
            const username = existingPlayerData?.username || 'Unknown';
            const displayName = existingPlayerData?.displayName || username;
            
            await logItemPickup({
                guildId,
                userId,
                username,
                displayName,
                location,
                itemId,
                itemName: itemDef?.name || itemId,
                itemEmoji: itemDef?.emoji || '📦',
                quantity,
                source: existingPlayerData?.source || 'manual',
                channelName: existingPlayerData?.channelName || null
            });
        } catch (logError) {
            console.error('Safari Log Error:', logError);
            // Don't fail the item pickup if logging fails
        }
        
        // Return the final quantity using universal accessor
        const finalItem = playerData[guildId].players[userId].safari.inventory[itemId];
        const returnValue = getItemQuantity(finalItem);
        console.log(`🔍 DEBUG: Returning final quantity: ${returnValue}`);
        return returnValue;
    } catch (error) {
        console.error('Error adding item to inventory:', error);
        throw error;
    }
}

/**
 * Check if condition is met
 */
async function checkCondition(guildId, userId, condition) {
    try {
        const playerData = await loadPlayerData();
        const safariData = playerData[guildId]?.players?.[userId]?.safari || {};
        
        switch (condition.type) {
            case CONDITION_TYPES.CURRENCY_GTE:
                const currency = safariData.currency || 0;
                return currency >= condition.value;
                
            case CONDITION_TYPES.CURRENCY_LTE:
                const currencyLte = safariData.currency || 0;
                return currencyLte <= condition.value;
                
            case CONDITION_TYPES.HAS_ITEM:
                const inventory = safariData.inventory || {};
                const quantity = inventory[condition.itemId] || 0;
                return quantity >= (condition.quantity || 1);
                
            case CONDITION_TYPES.NOT_HAS_ITEM:
                const invNotHas = safariData.inventory || {};
                const qtyNotHas = invNotHas[condition.itemId] || 0;
                return qtyNotHas < (condition.quantity || 1);
                
            case CONDITION_TYPES.BUTTON_USED:
                const buttonUses = safariData.buttonUses || {};
                const uses = buttonUses[condition.buttonId] || 0;
                return uses >= condition.minUses;
                
            case CONDITION_TYPES.COOLDOWN_EXPIRED:
                const cooldowns = safariData.cooldowns || {};
                const lastUsed = cooldowns[condition.buttonId] || 0;
                const now = Date.now();
                return (now - lastUsed) >= (condition.cooldownMs || 0);
                
            case CONDITION_TYPES.POINTS_GTE:
                const entityIdGte = condition.entityId || `player_${userId}`;
                const pointsGte = await getEntityPoints(guildId, entityIdGte, condition.pointType || 'stamina');
                return pointsGte.current >= condition.value;
                
            case CONDITION_TYPES.POINTS_LTE:
                const entityIdLte = condition.entityId || `player_${userId}`;
                const pointsLte = await getEntityPoints(guildId, entityIdLte, condition.pointType || 'stamina');
                return pointsLte.current <= condition.value;
                
            case CONDITION_TYPES.CAN_MOVE:
                return await canPlayerMove(guildId, userId);
                
            case CONDITION_TYPES.AT_LOCATION:
                const mapState = await getPlayerLocation(guildId, userId);
                return mapState && mapState.currentCoordinate === condition.coordinate;
                
            default:
                console.log(`⚠️ Unknown condition type: ${condition.type}`);
                return false;
        }
    } catch (error) {
        console.error('Error checking condition:', error);
        return false;
    }
}

/**
 * Get user currency and inventory display
 */
async function getCurrencyAndInventoryDisplay(guildId, userId) {
    try {
        // Get custom terms for this guild
        const customTerms = await getCustomTerms(guildId);
        
        const currency = await getCurrency(guildId, userId);
        const inventory = await getPlayerInventory(guildId, userId);
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        
        let display = `## ${customTerms.currencyEmoji} Your Safari Status\n\n`;
        display += `**Currency:** ${currency} ${customTerms.currencyName}\n\n`;
        
        const inventoryEntries = Object.entries(inventory).filter(([itemId, qty]) => qty > 0);
        
        if (inventoryEntries.length === 0) {
            display += `**Inventory:** Empty\n`;
        } else {
            display += `**Inventory:**\n`;
            for (const [itemId, quantity] of inventoryEntries) {
                const item = items[itemId];
                const emoji = item?.emoji || '📦';
                const name = item?.name || itemId;
                display += `${emoji} ${name} x${quantity}\n`;
            }
        }
        
        return display;
    } catch (error) {
        console.error('Error getting currency/inventory display:', error);
        return '❌ Error loading your status.';
    }
}

/**
 * Create store display with 40-component limit handling
 */
async function createStoreDisplay(guildId, storeId, userId) {
    try {
        console.log(`🏪 DEBUG: Creating store display for ${storeId}`);
        
        // Get custom terms for this guild
        const customTerms = await getCustomTerms(guildId);
        
        const safariData = await loadSafariContent();
        const store = safariData[guildId]?.stores?.[storeId];
        const items = safariData[guildId]?.items || {};
        
        if (!store) {
            return {
                content: '❌ Store not found.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Check if user has required role (if any)
        if (store.settings.requiresRole) {
            // This would need to be checked in the caller with Discord member data
            console.log(`🔍 DEBUG: Store ${storeId} requires role ${store.settings.requiresRole}`);
        }
        
        const components = [];
        
        // Store owner header text
        components.push({
            type: 10, // Text Display
            content: `# ${store.emoji} ${store.name}\n\n*${store.settings.storeownerText}*`
        });
        
        // Store description if provided
        if (store.description) {
            components.push({
                type: 10, // Text Display  
                content: store.description
            });
        }
        
        // Add separator
        components.push({ type: 14 }); // Separator
        
        // Calculate component limit for items
        // Container = 1, Header text = 1, Description = 1 (if exists), Separator = 1
        // Each item section = 3 components (1 section + 1 text display + 1 button)
        const usedComponents = 3 + (store.description ? 1 : 0); // Container + header + separator + desc?
        const maxItemSections = Math.floor((40 - usedComponents) / 3); // Each item = 3 components
        
        // Get store items with their prices
        const storeItems = store.items || [];
        const displayItems = storeItems.slice(0, maxItemSections); // Limit to fit
        
        console.log(`🔢 DEBUG: Displaying ${displayItems.length}/${storeItems.length} items (max: ${maxItemSections})`);
        
        // Add item sections
        for (const storeItem of displayItems) {
            const item = items[storeItem.itemId];
            if (!item) continue;
            
            // Item section
            const itemSection = {
                type: 9, // Section
                components: [
                    {
                        type: 10, // Text Display
                        content: `## ${item.emoji} ${item.name}\n${item.description || 'No description'}\n\n**Price:** ${storeItem.price || item.basePrice} ${customTerms.currencyName}`
                    }
                ]
            };
            
            // Add buy button if user can afford it
            const userCurrency = await getCurrency(guildId, userId);
            const price = storeItem.price || item.basePrice;
            
            const buyButton = new ButtonBuilder()
                .setCustomId(`safari_buy_${guildId}_${storeId}_${item.id}_${Date.now()}`)
                .setLabel(`Buy (${price} ${customTerms.currencyName})`)
                .setStyle(userCurrency >= price ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(userCurrency < price);
            
            if (item.emoji && item.emoji.length <= 2) {
                try {
                    buyButton.setEmoji(item.emoji);
                } catch (error) {
                    console.log(`⚠️ Invalid emoji for item ${item.id}: ${item.emoji}`);
                }
            }
            
            const buttonRow = new ActionRowBuilder().addComponents(buyButton);
            itemSection.components.push(buttonRow.toJSON());
            
            components.push(itemSection);
        }
        
        // Add warning if not all items could be displayed
        if (storeItems.length > displayItems.length) {
            components.push({
                type: 10,
                content: `⚠️ **Note:** This store has ${storeItems.length} items, but only ${displayItems.length} can be displayed due to Discord limits.`
            });
        }
        
        const container = {
            type: 17, // Container
            accent_color: store.settings.accentColor,
            components: components
        };
        
        return {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [container]
        };
        
    } catch (error) {
        console.error('Error creating store display:', error);
        return {
            content: '❌ Error loading store. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Execute conditional action - MVP2
 */
async function executeConditionalAction(config, guildId, userId, interaction) {
    try {
        console.log(`🔀 DEBUG: Executing conditional action for user ${userId}`);
        
        const conditionMet = await checkCondition(guildId, userId, config.condition);
        
        if (conditionMet) {
            console.log(`✅ DEBUG: Condition met, executing success actions`);
            // Execute success actions
            if (config.successActions && config.successActions.length > 0) {
                const sortedActions = config.successActions.sort((a, b) => (a.order || 0) - (b.order || 0));
                
                for (const action of sortedActions) {
                    switch (action.type) {
                        case ACTION_TYPES.DISPLAY_TEXT:
                            return await executeDisplayText(action.config, interaction);
                        case ACTION_TYPES.UPDATE_CURRENCY:
                            return await executeUpdateCurrency(action.config, userId, guildId, interaction);
                        case ACTION_TYPES.FOLLOW_UP_BUTTON:
                            return await executeFollowUpButton(action.config, guildId, interaction);
                    }
                }
            }
        } else {
            console.log(`❌ DEBUG: Condition not met, executing failure actions`);
            // Execute failure actions
            if (config.failureActions && config.failureActions.length > 0) {
                const sortedActions = config.failureActions.sort((a, b) => (a.order || 0) - (b.order || 0));
                
                for (const action of sortedActions) {
                    switch (action.type) {
                        case ACTION_TYPES.DISPLAY_TEXT:
                            return await executeDisplayText(action.config, interaction);
                        case ACTION_TYPES.UPDATE_CURRENCY:
                            return await executeUpdateCurrency(action.config, userId, guildId, interaction);
                        case ACTION_TYPES.FOLLOW_UP_BUTTON:
                            return await executeFollowUpButton(action.config, guildId, interaction);
                    }
                }
            } else {
                // Default failure message
                return {
                    content: config.failureMessage || '❌ Condition not met.',
                    flags: InteractionResponseFlags.EPHEMERAL
                };
            }
        }
        
    } catch (error) {
        console.error('Error executing conditional action:', error);
        return {
            content: '❌ Error processing conditional action.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Execute store display action - MVP2
 */
async function executeStoreDisplay(config, guildId, userId, interaction) {
    try {
        console.log(`🏪 DEBUG: Executing store display for ${config.storeId}`);
        return await createStoreDisplay(guildId, config.storeId, userId);
    } catch (error) {
        console.error('Error executing store display:', error);
        return {
            content: '❌ Error loading store.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Execute random outcome action - MVP2
 */
async function executeRandomOutcome(config, guildId, userId, interaction) {
    try {
        console.log(`🎲 DEBUG: Executing random outcome for user ${userId}`);
        
        const outcomes = config.outcomes || [];
        if (outcomes.length === 0) {
            return {
                content: '❌ No outcomes defined.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Calculate total weight
        const totalWeight = outcomes.reduce((sum, outcome) => sum + (outcome.weight || 1), 0);
        
        // Generate random number
        const random = Math.random() * totalWeight;
        
        // Find selected outcome
        let currentWeight = 0;
        let selectedOutcome = null;
        
        for (const outcome of outcomes) {
            currentWeight += (outcome.weight || 1);
            if (random <= currentWeight) {
                selectedOutcome = outcome;
                break;
            }
        }
        
        if (!selectedOutcome) {
            selectedOutcome = outcomes[outcomes.length - 1]; // Fallback
        }
        
        console.log(`🎯 DEBUG: Selected outcome: ${selectedOutcome.name}`);
        
        // Execute the selected outcome's actions
        if (selectedOutcome.actions && selectedOutcome.actions.length > 0) {
            const sortedActions = selectedOutcome.actions.sort((a, b) => (a.order || 0) - (b.order || 0));
            
            for (const action of sortedActions) {
                switch (action.type) {
                    case ACTION_TYPES.DISPLAY_TEXT:
                        return await executeDisplayText(action.config, interaction);
                    case ACTION_TYPES.UPDATE_CURRENCY:
                        return await executeUpdateCurrency(action.config, userId, guildId, interaction);
                    case ACTION_TYPES.FOLLOW_UP_BUTTON:
                        return await executeFollowUpButton(action.config, guildId, interaction);
                }
            }
        } else {
            // Default outcome message
            return {
                content: `🎲 **${selectedOutcome.name}**\n\n${selectedOutcome.description || 'Something happened!'}`,
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
    } catch (error) {
        console.error('Error executing random outcome:', error);
        return {
            content: '❌ Error processing random outcome.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Execute check points action - validates if player has enough points
 */
async function executeCheckPoints(config, guildId, userId, interaction) {
    try {
        const entityId = config.entityId || `player_${userId}`;
        const pointType = config.pointType || 'stamina';
        const requiredAmount = config.amount || 1;
        
        const hasPoints = await hasEnoughPoints(guildId, entityId, pointType, requiredAmount);
        
        if (!hasPoints && config.failureMessage) {
            const timeUntil = await getTimeUntilRegeneration(guildId, entityId, pointType);
            const message = config.failureMessage.replace('{time}', timeUntil);
            
            return {
                content: message,
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // If check passes, continue with other actions
        return null;
        
    } catch (error) {
        console.error('Error checking points:', error);
        return {
            content: '❌ Error checking points.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Execute modify points action - add or subtract points
 */
async function executeModifyPoints(config, guildId, userId, interaction) {
    try {
        const entityId = config.entityId || `player_${userId}`;
        const pointType = config.pointType || 'stamina';
        const amount = config.amount || 0;
        
        if (amount < 0) {
            // Use points (subtract)
            const result = await usePoints(guildId, entityId, pointType, Math.abs(amount));
            if (!result.success) {
                return {
                    content: config.failureMessage || result.message,
                    flags: InteractionResponseFlags.EPHEMERAL
                };
            }
        } else {
            // Add points
            const points = await getEntityPoints(guildId, entityId, pointType);
            await setEntityPoints(guildId, entityId, pointType, 
                Math.min(points.current + amount, points.max));
        }
        
        if (config.successMessage) {
            const points = await getEntityPoints(guildId, entityId, pointType);
            const display = await getPointsDisplay(guildId, entityId, pointType);
            
            let message = config.successMessage
                .replace('{current}', points.current)
                .replace('{max}', points.max)
                .replace('{display}', display.display || '');
                
            return {
                content: message,
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('Error modifying points:', error);
        return {
            content: '❌ Error modifying points.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Execute move player action - move player on map
 */
async function executeMovePlayer(config, guildId, userId, interaction) {
    try {
        const targetCoordinate = config.coordinate;
        
        if (!targetCoordinate) {
            return {
                content: '❌ No target coordinate specified.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Get client from interaction
        const client = interaction.client || interaction.guild?.client;
        if (!client) {
            console.error('No Discord client available for movement');
            return {
                content: '❌ Unable to process movement.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        const result = await movePlayer(guildId, userId, targetCoordinate, client);
        
        return {
            content: result.message,
            flags: result.success ? 0 : InteractionResponseFlags.EPHEMERAL
        };
        
    } catch (error) {
        console.error('Error executing player movement:', error);
        return {
            content: '❌ Error processing movement.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * Handle item purchase
 */
async function buyItem(guildId, storeId, itemId, userId) {
    try {
        console.log(`💳 DEBUG: User ${userId} buying ${itemId} from store ${storeId}`);
        
        // Get custom terms for this guild
        const customTerms = await getCustomTerms(guildId);
        
        const safariData = await loadSafariContent();
        const store = safariData[guildId]?.stores?.[storeId];
        const item = safariData[guildId]?.items?.[itemId];
        
        if (!store || !item) {
            return {
                content: '❌ Store or item not found.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Find item in store to get price
        const storeItem = store.items.find(si => si.itemId === itemId);
        if (!storeItem) {
            return {
                content: '❌ Item not available in this store.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        const price = storeItem.price || item.basePrice;
        const userCurrency = await getCurrency(guildId, userId);
        
        // Check if user can afford it
        if (userCurrency < price) {
            return {
                content: `❌ You need ${price} ${customTerms.currencyName} but only have ${userCurrency} ${customTerms.currencyName}.`,
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Check stock availability
        const hasStockAvailable = await hasStock(guildId, storeId, itemId);
        if (!hasStockAvailable) {
            return {
                content: `❌ Sorry, **${item.emoji || '📦'} ${item.name}** is currently out of stock.`,
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Check max quantity if limited
        if (item.maxQuantity > 0) {
            const currentQuantity = (await getPlayerInventory(guildId, userId))[itemId] || 0;
            if (currentQuantity >= item.maxQuantity) {
                return {
                    content: `❌ You already have the maximum quantity (${item.maxQuantity}) of this item.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                };
            }
        }
        
        // Process purchase with context for logging
        const purchaseContext = {
            username: interaction?.user?.username || 'Unknown',
            displayName: interaction?.member?.displayName || interaction?.user?.username || 'Unknown',
            source: `Store: ${store.name}`,
            channelName: interaction?.channel?.name || null
        };
        
        await updateCurrency(guildId, userId, -price, purchaseContext);
        
        // Decrement stock after successful payment
        const stockUpdated = await decrementStock(guildId, storeId, itemId, 1);
        if (!stockUpdated) {
            // Rollback currency if stock update failed
            await updateCurrency(guildId, userId, price, { source: 'Stock update failed - refund' });
            return {
                content: '❌ Failed to update stock. Purchase cancelled and refunded.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        await addItemToInventory(guildId, userId, itemId, 1, {
            ...purchaseContext,
            source: `Purchase from ${store.name}`
        });
        
        // Log store purchase
        try {
            const { logStorePurchase } = await import('./safariLogger.js');
            
            // Get player location
            const activeMapId = safariData[guildId]?.maps?.active;
            let location = 'Unknown';
            const playerData = await loadPlayerData();
            if (activeMapId && playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]) {
                location = playerData[guildId].players[userId].safari.mapProgress[activeMapId].currentLocation || 'Unknown';
            }
            
            await logStorePurchase({
                guildId,
                userId,
                username: purchaseContext.username,
                displayName: purchaseContext.displayName,
                location,
                storeId,
                storeName: store.name,
                itemId,
                itemName: item.name,
                itemEmoji: item.emoji || '📦',
                quantity: 1,
                price,
                currencyName: customTerms.currencyName,
                channelName: purchaseContext.channelName
            });
        } catch (logError) {
            console.error('Safari Log Error:', logError);
            // Don't fail the purchase if logging fails
        }
        
        // Update store sales stats
        if (safariData[guildId]?.stores?.[storeId]) {
            safariData[guildId].stores[storeId].metadata.totalSales++;
        }
        if (safariData[guildId]?.items?.[itemId]) {
            safariData[guildId].items[itemId].metadata.totalSold++;
        }
        await saveSafariContent(safariData);
        
        // Add to purchase history
        const playerData = await loadPlayerData();
        if (playerData[guildId]?.players?.[userId]?.safari) {
            playerData[guildId].players[userId].safari.storeHistory.push({
                itemId,
                storeId,
                price,
                timestamp: Date.now()
            });
            await savePlayerData(playerData);
        }
        
        const newBalance = await getCurrency(guildId, userId);
        
        return {
            content: `✅ **Purchase Successful!**\n\nYou bought ${item.emoji} **${item.name}** for ${price} ${customTerms.currencyName}.\n\n${customTerms.currencyEmoji} New balance: **${newBalance} ${customTerms.currencyName}**`,
            flags: InteractionResponseFlags.EPHEMERAL
        };
        
    } catch (error) {
        console.error('Error buying item:', error);
        return {
            content: '❌ Error processing purchase. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
}

/**
 * ====================================================================
 * EDIT FRAMEWORK FUNCTIONS - Phase 1A: Action Management
 * ====================================================================
 */

/**
 * Reorder button actions by moving one action to a new position
 * @param {string} guildId - Discord guild ID
 * @param {string} buttonId - Button ID
 * @param {number} fromIndex - Current index of action
 * @param {number} toIndex - Target index for action
 * @returns {boolean} Success status
 */
async function reorderButtonAction(guildId, buttonId, fromIndex, toIndex) {
    try {
        const safariData = await loadSafariContent();
        const button = safariData[guildId]?.buttons?.[buttonId];
        
        if (!button || !button.actions) {
            console.error(`Button ${buttonId} not found or has no actions`);
            return false;
        }
        
        const actions = [...button.actions];
        
        // Validate indices
        if (fromIndex < 0 || fromIndex >= actions.length || 
            toIndex < 0 || toIndex >= actions.length) {
            console.error(`Invalid indices: from=${fromIndex}, to=${toIndex}, length=${actions.length}`);
            return false;
        }
        
        // Move action
        const [movedAction] = actions.splice(fromIndex, 1);
        actions.splice(toIndex, 0, movedAction);
        
        // Update order numbers
        actions.forEach((action, index) => {
            action.order = index + 1;
        });
        
        // Update button
        button.actions = actions;
        button.metadata.lastModified = Date.now();
        
        await saveSafariContent(safariData);
        console.log(`🔄 DEBUG: Reordered action from ${fromIndex} to ${toIndex} for button ${buttonId}`);
        
        return true;
        
    } catch (error) {
        console.error('Error reordering button action:', error);
        return false;
    }
}

/**
 * Update a specific action in a button
 * @param {string} guildId - Discord guild ID
 * @param {string} buttonId - Button ID
 * @param {number} actionIndex - Index of action to update
 * @param {Object} newAction - New action data
 * @returns {boolean} Success status
 */
async function updateButtonAction(guildId, buttonId, actionIndex, newAction) {
    try {
        const safariData = await loadSafariContent();
        const button = safariData[guildId]?.buttons?.[buttonId];
        
        if (!button || !button.actions) {
            console.error(`Button ${buttonId} not found or has no actions`);
            return false;
        }
        
        if (actionIndex < 0 || actionIndex >= button.actions.length) {
            console.error(`Invalid action index: ${actionIndex}`);
            return false;
        }
        
        // Preserve order
        newAction.order = button.actions[actionIndex].order;
        
        // Update action
        button.actions[actionIndex] = newAction;
        button.metadata.lastModified = Date.now();
        
        await saveSafariContent(safariData);
        console.log(`✏️ DEBUG: Updated action ${actionIndex} for button ${buttonId}`);
        
        return true;
        
    } catch (error) {
        console.error('Error updating button action:', error);
        return false;
    }
}

/**
 * Delete a specific action from a button
 * @param {string} guildId - Discord guild ID
 * @param {string} buttonId - Button ID
 * @param {number} actionIndex - Index of action to delete
 * @returns {boolean} Success status
 */
async function deleteButtonAction(guildId, buttonId, actionIndex) {
    try {
        const safariData = await loadSafariContent();
        const button = safariData[guildId]?.buttons?.[buttonId];
        
        if (!button || !button.actions) {
            console.error(`Button ${buttonId} not found or has no actions`);
            return false;
        }
        
        if (actionIndex < 0 || actionIndex >= button.actions.length) {
            console.error(`Invalid action index: ${actionIndex}`);
            return false;
        }
        
        // Remove action
        button.actions.splice(actionIndex, 1);
        
        // Update order numbers for remaining actions
        button.actions.forEach((action, index) => {
            action.order = index + 1;
        });
        
        button.metadata.lastModified = Date.now();
        
        await saveSafariContent(safariData);
        console.log(`🗑️ DEBUG: Deleted action ${actionIndex} from button ${buttonId}`);
        
        return true;
        
    } catch (error) {
        console.error('Error deleting button action:', error);
        return false;
    }
}

/**
 * Update button properties (label, emoji, style, tags)
 * @param {string} guildId - Discord guild ID
 * @param {string} buttonId - Button ID
 * @param {Object} properties - New properties
 * @returns {boolean} Success status
 */
async function updateButtonProperties(guildId, buttonId, properties) {
    try {
        const safariData = await loadSafariContent();
        const button = safariData[guildId]?.buttons?.[buttonId];
        
        if (!button) {
            console.error(`Button ${buttonId} not found`);
            return false;
        }
        
        // Update properties
        if (properties.label !== undefined) button.label = properties.label;
        if (properties.emoji !== undefined) button.emoji = properties.emoji;
        if (properties.style !== undefined) button.style = properties.style;
        if (properties.tags !== undefined) {
            button.metadata.tags = Array.isArray(properties.tags) ? 
                properties.tags : 
                properties.tags.split(',').map(t => t.trim()).filter(t => t);
        }
        
        button.metadata.lastModified = Date.now();
        
        await saveSafariContent(safariData);
        console.log(`🔧 DEBUG: Updated properties for button ${buttonId}`);
        
        return true;
        
    } catch (error) {
        console.error('Error updating button properties:', error);
        return false;
    }
}

/**
 * Delete a button completely
 * @param {string} guildId - Discord guild ID
 * @param {string} buttonId - Button ID
 * @returns {boolean} Success status
 */
async function deleteButton(guildId, buttonId) {
    try {
        const safariData = await loadSafariContent();
        
        if (!safariData[guildId]?.buttons?.[buttonId]) {
            console.error(`Button ${buttonId} not found`);
            return false;
        }
        
        // Remove button
        delete safariData[guildId].buttons[buttonId];
        
        await saveSafariContent(safariData);
        console.log(`🗑️ DEBUG: Deleted button ${buttonId} completely`);
        
        return true;
        
    } catch (error) {
        console.error('Error deleting button:', error);
        return false;
    }
}

/**
 * Validate action limits and constraints
 * @param {Array} actions - Array of actions
 * @returns {Object} Validation result with errors
 */
async function validateActionLimit(actions) {
    const { SAFARI_LIMITS } = await import('./config/safariLimits.js');
    const errors = [];
    
    if (actions.length > SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON) {
        errors.push(`Maximum ${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON} actions allowed per button`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Convert emoji to Twemoji CDN URL
 * @param {string} emoji - The emoji character
 * @returns {string} Twemoji CDN URL
 */
function getEmojiTwemojiUrl(emoji) {
    if (!emoji || emoji.trim() === '') return null;
    
    try {
        // Convert emoji to Unicode codepoint
        const codepoint = [...emoji].map(char => 
            char.codePointAt(0).toString(16)
        ).join('-');
        
        return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoint}.png`;
    } catch (error) {
        console.error('Error converting emoji to Twemoji URL:', error);
        return null;
    }
}

/**
 * Check if guild has any stores
 * @param {string} guildId - Discord guild ID
 * @returns {boolean} True if guild has stores
 */
async function hasStoresInGuild(guildId) {
    try {
        const safariData = await loadSafariContent();
        const stores = safariData[guildId]?.stores || {};
        return Object.keys(stores).length > 0;
    } catch (error) {
        console.error('Error checking guild stores:', error);
        return false;
    }
}

/**
 * Get store browse buttons ordered by item count
 * @param {string} guildId - Discord guild ID
 * @returns {Array} Array of store browse buttons
 */
async function getStoreBrowseButtons(guildId) {
    try {
        const safariData = await loadSafariContent();
        const stores = safariData[guildId]?.stores || {};
        
        // Convert stores to array and sort by item count (descending)
        const storeArray = Object.values(stores).map(store => ({
            ...store,
            itemCount: (store.items || []).length
        })).sort((a, b) => b.itemCount - a.itemCount);
        
        // Create buttons (max 5)
        const buttons = [];
        const maxButtons = 5;
        
        for (let i = 0; i < Math.min(storeArray.length, maxButtons); i++) {
            const store = storeArray[i];
            const emoji = store.emoji || '🏪';
            
            const button = {
                type: 2, // Button
                custom_id: `safari_store_browse_${guildId}_${store.id}`,
                label: `Browse ${store.name}`.slice(0, 80),
                style: 1, // Primary (blue)
                emoji: { name: '🪺' } // Nest emoji for consistency
            };
            
            buttons.push(button);
        }
        
        return buttons;
    } catch (error) {
        console.error('Error getting store browse buttons:', error);
        return [];
    }
}

/**
 * Create player inventory display with Container > Section pattern
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {Object} member - Discord member object (optional)
 * @param {number} currentPage - Current page number (0-indexed)
 * @returns {Object} Discord Components V2 response
 */
async function createPlayerInventoryDisplay(guildId, userId, member = null, currentPage = 0) {
    try {
        console.log(`📦 DEBUG: Creating player inventory display for user ${userId} in guild ${guildId}, page ${currentPage}`);
        
        const safariData = await loadSafariContent();
        const playerData = await loadPlayerData();
        
        // Get player safari data
        const player = playerData[guildId]?.players?.[userId];
        const safariPlayer = player?.safari || {};
        const playerCurrency = safariPlayer.currency || 0;
        const playerInventory = safariPlayer.inventory || {};
        
        // Get items data for display
        const items = safariData[guildId]?.items || {};
        
        // Get player display name for personalized header
        const playerDisplayName = member?.nick || member?.user?.global_name || member?.user?.username || 'Player';
        
        // Get custom terms for this guild
        const customTerms = await getCustomTerms(guildId);
        
        console.log(`${customTerms.currencyEmoji} DEBUG: Player ${userId} has ${playerCurrency} ${customTerms.currencyName} and ${Object.keys(playerInventory).length} item types`);
        console.log(`🔍 DEBUG: Raw playerInventory:`, JSON.stringify(playerInventory, null, 2));
        
        // Count total items and component usage - handle both number and object formats
        // Reverse order to show newest items first (most recent purchases/acquisitions)
        const inventoryItems = Object.entries(playerInventory).filter(([itemId, itemData]) => {
            if (typeof itemData === 'number') {
                return itemData > 0;
            } else if (typeof itemData === 'object' && itemData !== null) {
                return (itemData.quantity || 0) > 0;
            }
            return false;
        }).reverse(); // Show newest items first
        console.log(`🔍 DEBUG: Filtered inventoryItems (newest first):`, inventoryItems);
        
        // Pagination calculation
        const ITEMS_PER_PAGE = 10; // Fixed page size as requested
        const totalItems = inventoryItems.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
        
        const components = [];
        
        // Header with personalized player name and custom inventory name
        const inventoryEmoji = customTerms.inventoryEmoji || '🧰';
        // Add page info to header if there are multiple pages
        const pageInfo = totalPages > 1 ? ` (Page ${currentPage + 1}/${totalPages})` : '';
        components.push({
            type: 10, // Text Display
            content: `# ${inventoryEmoji} ${playerDisplayName}'s ${customTerms.inventoryName}${pageInfo}`
        });
        
        // Add separator before balance
        components.push({ type: 14 }); // Separator
        
        // Balance section with custom currency name
        components.push({
            type: 10, // Text Display
            content: `## ${customTerms.currencyEmoji} Your Balance\n> \`${playerCurrency} ${customTerms.currencyName}\``
        });
        
        // Validate and adjust current page if needed (auto-navigate to page 1 if current page is empty)
        if (currentPage >= totalPages) {
            currentPage = Math.max(0, totalPages - 1);
            console.log(`📄 Auto-navigating to page ${currentPage} (max valid page)`);
        }
        
        // Calculate page boundaries
        const startIndex = currentPage * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
        const pageItems = inventoryItems.slice(startIndex, endIndex);
        
        console.log(`📄 Pagination: Page ${currentPage + 1}/${totalPages}, showing items ${startIndex + 1}-${endIndex} of ${totalItems}`);
        
        if (inventoryItems.length === 0) {
            // Add separator before empty message
            components.push({ type: 14 }); // Separator
            
            // No items message with custom terminology
            components.push({
                type: 10, // Text Display
                content: `*Your ${customTerms.inventoryName.toLowerCase()} is empty. Visit a store to purchase items!*`
            });
        } else {
            // Initialize attack availability first
            await initializeAttackAvailability(guildId, userId);
            
            // Reload player data after initialization to get updated values
            const updatedPlayerData = await loadPlayerData();
            const updatedPlayer = updatedPlayerData[guildId]?.players?.[userId];
            const updatedInventory = updatedPlayer?.safari?.inventory || {};
            
            // Re-filter inventory items with updated data
            // Maintain reverse order (newest first) after reloading
            const updatedInventoryItems = Object.entries(updatedInventory).filter(([itemId, itemData]) => {
                if (typeof itemData === 'number') {
                    return itemData > 0;
                } else if (typeof itemData === 'object' && itemData !== null) {
                    return (itemData.quantity || 0) > 0;
                }
                return false;
            }).reverse(); // Show newest items first
            
            // Re-calculate page items with updated inventory
            const updatedPageItems = updatedInventoryItems.slice(startIndex, endIndex);
            
            // Add items with separators between them
            let totalTextLength = 0; // Track total text content length
            let itemsProcessed = 0;
            let itemsSkipped = 0;
            
            // Calculate existing text length
            for (const comp of components) {
                if (comp.type === 10 && comp.content) { // Text Display
                    totalTextLength += comp.content.length;
                }
            }
            console.log(`📏 DEBUG: Starting with ${components.length} components, text length: ${totalTextLength} chars`);
            
            // Process only items for current page
            for (let i = 0; i < updatedPageItems.length; i++) {
                const [itemId, inventoryData] = updatedPageItems[i];
                console.log(`🔍 DEBUG: Processing inventory item ${i+1}/${updatedPageItems.length} (item ${startIndex + i + 1}/${updatedInventoryItems.length}): ${itemId}, data:`, inventoryData);
                const item = items[itemId];
                
                // Handle missing items gracefully
                if (!item) {
                    console.log(`⚠️ WARNING: Item ${itemId} not found in safariContent - creating placeholder`);
                    
                    // Get quantity from inventory data
                    const quantity = typeof inventoryData === 'number' 
                        ? inventoryData 
                        : (inventoryData.quantity || 0);
                    
                    if (quantity > 0) {
                        // Add a placeholder for the missing item
                        components.push({
                            type: 10, // Text Display
                            content: `❓ **Unknown Item** (ID: ${itemId}) (x${quantity})\n*This item no longer exists in the system*`
                        });
                        totalTextLength += 100; // Estimate text length
                        itemsProcessed++;
                        console.log(`❓ Added placeholder for missing item ${itemId}`);
                        
                        // Add separator after missing item
                        if (i < updatedInventoryItems.length - 1) {
                            components.push({ type: 14 }); // Separator
                        }
                    }
                    
                    itemsSkipped++;
                    continue;
                }
                
                // Get quantity and attacks available
                let quantity, numAttacksAvailable;
                if (typeof inventoryData === 'number') {
                    quantity = inventoryData;
                    numAttacksAvailable = inventoryData;
                } else {
                    quantity = inventoryData.quantity || 0;
                    numAttacksAvailable = inventoryData.numAttacksAvailable || 0;
                }
                
                if (quantity <= 0) {
                    console.log(`⚠️ DEBUG: Item ${itemId} has quantity ${quantity} - skipping`);
                    continue;
                }
                
                // More conservative component limit checking
                // Discord allows max 40 components, but we'll use 32 as safe limit
                // Sections with buttons count as more components internally
                const hasAttack = item.attackValue !== null && item.attackValue !== undefined;
                const isStaminaConsumable = item.consumable === 'Yes' && item.staminaBoost && item.staminaBoost > 0;
                const isComplexItem = hasAttack || isStaminaConsumable;
                const componentWeight = isComplexItem ? 2 : 1;
                
                // Check if we have room for this item
                if (components.length + componentWeight + 1 > 32) {
                    // Add summary of remaining items
                    const remainingItems = updatedInventoryItems.length - i;
                    if (components.length > 0 && components[components.length - 1].type !== 14) {
                        components.push({ type: 14 }); // Separator
                    }
                    components.push({
                        type: 10, // Text Display
                        content: `📦 **+${remainingItems} more items** (display limit reached)\n*Use /safari inventory command for full list*`
                    });
                    console.log(`⚠️ Component limit reached at item ${i} of ${updatedInventoryItems.length}, components: ${components.length}`);
                    break;
                }
                
                // Add separator before each item (but not before the first one)
                if (i === 0) {
                    components.push({ type: 14 }); // Separator before first item
                }
                
                // Check if item has attack value or is consumable with stamina boost
                // (already declared above for component limit checking)
                
                if (hasAttack) {
                    // Calculate attacks planned using simple math: total - available
                    const attacksPlanned = quantity - numAttacksAvailable;
                    
                    // Generate compact item content with attack info
                    let attackItemContent = generateItemContent(item, customTerms, quantity);
                    
                    // Add very compact attack info
                    if (numAttacksAvailable > 0) {
                        attackItemContent += `\n⚔️ **Ready:** ${numAttacksAvailable}/${quantity}`;
                    } else {
                        attackItemContent += `\n⚔️ *All attacks used*`;
                    }
                    
                    // Very strict length limit for components
                    if (attackItemContent.length > 500) {
                        attackItemContent = attackItemContent.substring(0, 497) + '...'
                    }
                    
                    // Create Section component with attack button
                    const sectionComponent = {
                        type: 9, // Section component
                        components: [
                            {
                                type: 10, // Text Display
                                content: attackItemContent
                            }
                        ]
                    };
                    
                    // Only add button if attacks are available
                    if (numAttacksAvailable > 0) {
                        sectionComponent.accessory = {
                            type: 2, // Button
                            custom_id: `safari_attack_player_${itemId}`,
                            label: '⚔️ Attack Player',
                            style: 1 // Primary (blue)
                        };
                    } else {
                        // Add disabled button for clarity
                        sectionComponent.accessory = {
                            type: 2, // Button
                            custom_id: `safari_attack_player_disabled_${itemId}`,
                            label: '⚔️ No Attacks Available',
                            style: 2, // Secondary (gray)
                            disabled: true
                        };
                    }
                    
                    components.push(sectionComponent);
                    totalTextLength += attackItemContent.length;
                    itemsProcessed++;
                    console.log(`⚔️ DEBUG: Added attack item ${item.name} with Section component`);
                    console.log(`📊 DEBUG: Item ${i+1} - Components: ${components.length}, Total text: ${totalTextLength} chars`);
                } else if (isStaminaConsumable) {
                    // Stamina consumable item - add Use button
                    let staminaItemContent = generateItemContent(item, customTerms, quantity);
                    
                    // Very strict length limit for components
                    if (staminaItemContent.length > 500) {
                        staminaItemContent = staminaItemContent.substring(0, 497) + '...'
                    }
                    
                    // Create Section component with Use button
                    const sectionComponent = {
                        type: 9, // Section component
                        components: [
                            {
                                type: 10, // Text Display
                                content: staminaItemContent
                            }
                        ],
                        accessory: {
                            type: 2, // Button
                            custom_id: `safari_use_item_${itemId}`,
                            label: `Use (+${item.staminaBoost} ⚡)`,
                            style: 3 // Success (green)
                        }
                    };
                    
                    components.push(sectionComponent);
                    totalTextLength += staminaItemContent.length;
                    itemsProcessed++;
                    console.log(`⚡ DEBUG: Added stamina consumable ${item.name} with Use button`);
                    console.log(`📊 DEBUG: Item ${i+1} - Components: ${components.length}, Total text: ${totalTextLength} chars`);
                } else {
                    // Non-attack, non-consumable item - use regular Text Display
                    let itemContent = generateItemContent(item, customTerms, quantity);
                    
                    // Very strict length limit for components
                    if (itemContent.length > 500) {
                        itemContent = itemContent.substring(0, 497) + '...'
                    }
                    
                    components.push({
                        type: 10, // Text Display
                        content: itemContent
                    });
                    totalTextLength += itemContent.length;
                    itemsProcessed++;
                    console.log(`📦 DEBUG: Added Text Display for ${item.name} (qty: ${quantity})`);
                    console.log(`📊 DEBUG: Item ${i+1} - Components: ${components.length}, Total text: ${totalTextLength} chars`);
                }
                
                // Only add separator between items of same type to save components
                // Skip separator after attack/consumable items with buttons
                if (i < updatedInventoryItems.length - 1 && !isComplexItem) {
                    components.push({ type: 14 }); // Separator after simple items only
                }
                
                console.log(`📦 DEBUG: Added item ${item.name} (qty: ${quantity}) to display`);
            }
            
            // Log final summary
            console.log(`\n📊 INVENTORY DISPLAY SUMMARY:`);
            console.log(`  - Items to display: ${updatedInventoryItems.length}`);
            console.log(`  - Items processed: ${itemsProcessed}`);
            console.log(`  - Items skipped: ${itemsSkipped}`);
            console.log(`  - Components created: ${components.length}`);
            console.log(`  - Total text length: ${totalTextLength} chars`);
            console.log(`  - Text per component avg: ${Math.round(totalTextLength / Math.max(1, itemsProcessed))} chars`);
            console.log(`  - 4000 char limit check: ${totalTextLength > 4000 ? '⚠️ EXCEEDED' : '✅ OK'}`);
            
            // Check if we're approaching Discord limits
            if (totalTextLength > 3500) {
                console.log(`⚠️ WARNING: Approaching 4000 character limit (${totalTextLength}/4000)`);
            }
            if (components.length > 35) {
                console.log(`⚠️ WARNING: Approaching 40 component limit (${components.length}/40)`);
            }
        }
        
        // Create container
        const container = {
            type: 17, // Container
            accent_color: 0x57f287, // Green accent for "My Nest"
            components: components
        };
        
        const responseComponents = [container];
        
        // Add pagination buttons if there are multiple pages
        if (totalPages > 1) {
            const navButtons = [];
            
            // Smart pagination - max 5 buttons per action row
            if (totalPages <= 5) {
                // Show all page numbers if 5 or fewer pages
                for (let page = 0; page < totalPages; page++) {
                    navButtons.push({
                        type: 2, // Button
                        custom_id: `safari_inv_page_${userId}_${page}`,
                        label: `${page + 1}`,
                        style: page === currentPage ? 1 : 2, // Primary if current, Secondary otherwise
                        disabled: page === currentPage
                    });
                }
            } else {
                // Smart pagination for more than 5 pages
                // Pattern: [<] [prev] [current] [next] [>]
                
                // First page button
                if (currentPage > 1) {
                    navButtons.push({
                        type: 2, // Button
                        custom_id: `safari_inv_page_${userId}_0`,
                        label: '«',
                        style: 2, // Secondary
                        disabled: false
                    });
                }
                
                // Previous page (if not adjacent to first)
                if (currentPage > 0) {
                    navButtons.push({
                        type: 2, // Button
                        custom_id: `safari_inv_page_${userId}_${currentPage - 1}`,
                        label: `${currentPage}`, // Show previous page number
                        style: 2, // Secondary
                        disabled: false
                    });
                }
                
                // Current page (always show, disabled)
                navButtons.push({
                    type: 2, // Button
                    custom_id: `safari_inv_page_${userId}_${currentPage}`,
                    label: `${currentPage + 1}`,
                    style: 1, // Primary (highlighted)
                    disabled: true
                });
                
                // Next page
                if (currentPage < totalPages - 1) {
                    navButtons.push({
                        type: 2, // Button
                        custom_id: `safari_inv_page_${userId}_${currentPage + 1}`,
                        label: `${currentPage + 2}`, // Show next page number
                        style: 2, // Secondary
                        disabled: false
                    });
                }
                
                // Last page button
                if (currentPage < totalPages - 2) {
                    navButtons.push({
                        type: 2, // Button
                        custom_id: `safari_inv_page_${userId}_${totalPages - 1}`,
                        label: '»',
                        style: 2, // Secondary
                        disabled: false
                    });
                }
            }
            
            // Add navigation action row if we have buttons
            if (navButtons.length > 0) {
                const navRow = {
                    type: 1, // Action Row
                    components: navButtons.slice(0, 5) // Ensure max 5 buttons
                };
                responseComponents.push(navRow);
            }
        }
        
        console.log(`✅ DEBUG: Created inventory display with ${components.length} components`);
        console.log(`📤 DEBUG: Sending response with ${responseComponents.length} response components`);
        
        const response = {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + Ephemeral
            components: responseComponents
        };
        
        // Debug: Log the response structure with validation
        const responseJSON = JSON.stringify(response, null, 2);
        console.log(`📋 DEBUG: Response structure preview (first 500 chars):`, responseJSON.substring(0, 500) + '...');
        console.log(`📋 DEBUG: Full response size: ${responseJSON.length} chars`);
        
        // Validate response structure
        if (!response.components || !Array.isArray(response.components)) {
            console.error(`❌ ERROR: Invalid response structure - missing or invalid components array`);
        }
        if (response.components.length === 0) {
            console.error(`❌ ERROR: Empty components array`);
        }
        
        // Check for any text content that might have problematic characters
        const validateTextContent = (obj, path = '') => {
            if (typeof obj === 'string') {
                // Check for zero-width joiners or other problematic characters
                if (obj.includes('\u200D')) {
                    console.warn(`⚠️ WARNING: Zero-width joiner found in ${path}: "${obj}"`);
                }
                if (obj.includes('\u200B')) {
                    console.warn(`⚠️ WARNING: Zero-width space found in ${path}: "${obj}"`);
                }
                if (obj.length > 1000) {
                    console.warn(`⚠️ WARNING: Very long text content in ${path}: ${obj.length} chars`);
                }
            } else if (typeof obj === 'object' && obj !== null) {
                for (const key in obj) {
                    validateTextContent(obj[key], path ? `${path}.${key}` : key);
                }
            }
        };
        
        validateTextContent(response, 'response');
        console.log(`✅ DEBUG: Response validation complete`);
        
        return response;
        
    } catch (error) {
        console.error('Error creating player inventory display:', error);
        console.log(`🔄 Attempting simplified inventory display as fallback...`);
        try {
            return await createSimplifiedInventoryDisplay(guildId, userId, member);
        } catch (fallbackError) {
            console.error('Simplified inventory also failed:', fallbackError);
            return {
                content: '❌ Error loading inventory. Your inventory may be too large to display.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
    }
}

/**
 * Create a simplified, ultra-compact inventory display for problematic inventories
 * This is used as a fallback when the full display exceeds Discord limits
 */
async function createSimplifiedInventoryDisplay(guildId, userId, member = null) {
    try {
        console.log(`🎪 Creating simplified inventory display for user ${userId}`);
        
        const safariData = await loadSafariContent();
        const playerData = await loadPlayerData();
        
        const player = playerData[guildId]?.players?.[userId];
        const safariPlayer = player?.safari || {};
        const playerCurrency = safariPlayer.currency || 0;
        const playerInventory = safariPlayer.inventory || {};
        const items = safariData[guildId]?.items || {};
        const customTerms = await getCustomTerms(guildId);
        
        console.log(`📊 Simplified inventory: ${Object.keys(playerInventory).length} item types, currency: ${playerCurrency}`);
        
        // Count and categorize items  
        let attackItems = 0;
        let consumables = 0;
        let otherItems = 0;
        let totalQuantity = 0;
        const topItems = [];
        
        // Process items in reverse order (newest first) for simplified display
        for (const [itemId, inventoryData] of Object.entries(playerInventory).reverse()) {
            const item = items[itemId];
            if (!item) {
                console.log(`⚠️ Item ${itemId} not found in safariContent`);
                continue;
            }
            
            const quantity = typeof inventoryData === 'number' 
                ? inventoryData 
                : (inventoryData.quantity || 0);
            
            if (quantity <= 0) continue;
            
            totalQuantity += quantity;
            
            // Categorize
            if (item.attackValue !== null && item.attackValue !== undefined) {
                attackItems++;
            } else if (item.consumable === 'Yes' && item.staminaBoost > 0) {
                consumables++;
            } else {
                otherItems++;
            }
            
            // Keep top 7 items by quantity for display
            if (topItems.length < 7) {
                const emoji = (item.emoji || '📦').replace(/\u200d/g, '').replace(/\u200b/g, '');
                const name = (item.name || itemId).substring(0, 25);
                topItems.push({
                    display: `${emoji} ${name} x${quantity}`,
                    quantity: quantity
                });
            }
        }
        
        // Sort top items by quantity
        topItems.sort((a, b) => b.quantity - a.quantity);
        
        // Build ultra-compact content
        let content = `# 🎒 Inventory Summary\n\n`;
        content += `**${customTerms.currencyEmoji} Balance:** ${playerCurrency} ${customTerms.currencyName}\n\n`;
        content += `**📊 Overview:**\n`;
        content += `Total Items: ${totalQuantity} (${Object.keys(playerInventory).length} types)\n`;
        if (attackItems > 0) content += `⚔️ Combat: ${attackItems} types\n`;
        if (consumables > 0) content += `⚡ Consumables: ${consumables} types\n`;
        if (otherItems > 0) content += `📦 Other: ${otherItems} types\n`;
        
        if (topItems.length > 0) {
            content += `\n**Top Items:**\n`;
            content += topItems.map(item => item.display).join('\n');
        }
        
        if (Object.keys(playerInventory).length > 7) {
            content += `\n\n*...and ${Object.keys(playerInventory).length - 7} more item types*`;
        }
        
        console.log(`📏 Simplified content length: ${content.length} chars`);
        
        // Create ultra-simple response
        const response = {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
            components: [{
                type: 17, // Container
                accent_color: 0xffa500, // Orange for simplified
                components: [{
                    type: 10, // Text Display
                    content: content.substring(0, 1800) // Extra safe limit
                }]
            }]
        };
        
        console.log(`✅ Created simplified inventory display successfully`);
        return response;
        
    } catch (error) {
        console.error('Error in simplified inventory display:', error);
        throw error;
    }
}

/**
 * Calculate round probability using linear interpolation
 * For N rounds, interpolates between start, mid, and end probabilities
 * @param {number} currentRound - Current round number (1-based)
 * @param {number} totalRounds - Total number of rounds
 * @param {Object} config - Safari configuration with probability settings
 * @returns {number} Calculated probability for the current round
 */
function calculateRoundProbability(currentRound, totalRounds, config) {
    // Get probabilities from config or use defaults
    const startProb = config.round1GoodProbability || 70;
    const midProb = config.round2GoodProbability || 50;
    const endProb = config.round3GoodProbability || 30;
    
    // Handle edge cases
    if (totalRounds === 1) {
        // Single round game: use end probability (most challenging)
        return endProb;
    }
    
    if (totalRounds === 2) {
        // Two round game: interpolate between start and end
        if (currentRound === 1) return startProb;
        if (currentRound === 2) return endProb;
    }
    
    // For 3+ rounds: interpolate using piecewise linear interpolation
    if (totalRounds === 3) {
        // Original behavior for backwards compatibility
        if (currentRound === 1) return startProb;
        if (currentRound === 2) return midProb;
        if (currentRound === 3) return endProb;
    }
    
    // For 4+ rounds: interpolate between start, mid, and end
    const midRound = Math.ceil(totalRounds / 2);
    
    if (currentRound === 1) {
        return startProb;
    } else if (currentRound === totalRounds) {
        return endProb;
    } else if (currentRound === midRound) {
        return midProb;
    } else if (currentRound < midRound) {
        // Interpolate between start and mid
        const progress = (currentRound - 1) / (midRound - 1);
        return Math.round(startProb - (startProb - midProb) * progress);
    } else {
        // Interpolate between mid and end
        const progress = (currentRound - midRound) / (totalRounds - midRound);
        return Math.round(midProb - (midProb - endProb) * progress);
    }
}

/**
 * Get custom terminology for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Custom terms with fallbacks
 */
async function getCustomTerms(guildId) {
    try {
        const safariData = await loadSafariContent();
        const config = safariData[guildId]?.safariConfig || {};
        
        return {
            // Basic terms
            currencyName: config.currencyName || 'Dollars',
            inventoryName: config.inventoryName || 'Inventory',
            currencyEmoji: config.currencyEmoji || '🪙',
            inventoryEmoji: config.inventoryEmoji || '🧰',
            defaultStartingCurrencyValue: config.defaultStartingCurrencyValue || 100,
            defaultStartingCoordinate: config.defaultStartingCoordinate || 'A1',

            // Game settings - Challenge Game Logic
            round1GoodProbability: config.round1GoodProbability || 75,
            round2GoodProbability: config.round2GoodProbability || 50,
            round3GoodProbability: config.round3GoodProbability || 25,

            // Event details
            goodEventName: config.goodEventName || 'Clear Skies',
            badEventName: config.badEventName || 'Meteor Strike',
            goodEventMessage: config.goodEventMessage || 'The skies are clear! All creatures thrive!',
            badEventMessage: config.badEventMessage || 'Meteors rain down! Only the protected survive!',
            goodEventEmoji: config.goodEventEmoji || '☀️',
            badEventEmoji: config.badEventEmoji || '☄️',

            // Game state
            currentRound: config.currentRound || 1,
            totalRounds: config.totalRounds || 3, // Default to 3 rounds for backwards compatibility
            lastRoundTimestamp: config.lastRoundTimestamp || null
        };
    } catch (error) {
        console.error('Error getting custom terms:', error);
        return {
            // Basic terms fallbacks
            currencyName: 'Dollars',
            inventoryName: 'Inventory',
            currencyEmoji: '🪙',
            inventoryEmoji: '🧰',
            
            // Game settings fallbacks
            round1GoodProbability: 75,
            round2GoodProbability: 50,
            round3GoodProbability: 25,
            
            // Event details fallbacks
            goodEventName: 'Clear Skies',
            badEventName: 'Meteor Strike',
            goodEventMessage: 'The skies are clear! All creatures thrive!',
            badEventMessage: 'Meteors rain down! Only the protected survive!',
            goodEventEmoji: '☀️',
            badEventEmoji: '☄️',
            
            // Game state fallbacks
            currentRound: 1,
            totalRounds: 3, // Default to 3 rounds
            lastRoundTimestamp: null
        };
    }
}

/**
 * Update custom terminology for a guild
 * @param {string} guildId - Discord guild ID  
 * @param {Object} terms - Object with currencyName and/or inventoryName
 * @returns {boolean} Success status
 */
async function updateCustomTerms(guildId, terms) {
    try {
        const safariData = await loadSafariContent();
        
        // Ensure guild data exists
        if (!safariData[guildId]) {
            safariData[guildId] = {
                buttons: {},
                safaris: {},
                applications: {},
                stores: {},
                items: {},
                safariConfig: {}
            };
        }
        
        // Ensure safariConfig exists
        if (!safariData[guildId].safariConfig) {
            safariData[guildId].safariConfig = {
                currencyName: 'Dollars',
                inventoryName: 'Inventory',
                currencyEmoji: '🪙'
            };
        }
        
        // Update basic terms
        if (terms.currencyName !== undefined) {
            safariData[guildId].safariConfig.currencyName = terms.currencyName || 'Dollars';
        }
        if (terms.inventoryName !== undefined) {
            safariData[guildId].safariConfig.inventoryName = terms.inventoryName || 'Inventory';
        }
        if (terms.currencyEmoji !== undefined) {
            safariData[guildId].safariConfig.currencyEmoji = terms.currencyEmoji || '🪙';
        }
        if (terms.inventoryEmoji !== undefined) {
            safariData[guildId].safariConfig.inventoryEmoji = terms.inventoryEmoji || '🧰';
        }
        if (terms.defaultStartingCurrencyValue !== undefined) {
            safariData[guildId].safariConfig.defaultStartingCurrencyValue = parseInt(terms.defaultStartingCurrencyValue) || 100;
        }
        if (terms.defaultStartingCoordinate !== undefined) {
            safariData[guildId].safariConfig.defaultStartingCoordinate = terms.defaultStartingCoordinate || 'A1';
        }

        // Update game settings - Challenge Game Logic
        if (terms.round1GoodProbability !== undefined) {
            safariData[guildId].safariConfig.round1GoodProbability = terms.round1GoodProbability;
        }
        if (terms.round2GoodProbability !== undefined) {
            safariData[guildId].safariConfig.round2GoodProbability = terms.round2GoodProbability;
        }
        if (terms.round3GoodProbability !== undefined) {
            safariData[guildId].safariConfig.round3GoodProbability = terms.round3GoodProbability;
        }
        
        // Update event details
        if (terms.goodEventName !== undefined) {
            safariData[guildId].safariConfig.goodEventName = terms.goodEventName || 'Clear Skies';
        }
        if (terms.badEventName !== undefined) {
            safariData[guildId].safariConfig.badEventName = terms.badEventName || 'Meteor Strike';
        }
        if (terms.goodEventMessage !== undefined) {
            safariData[guildId].safariConfig.goodEventMessage = terms.goodEventMessage || 'The skies are clear! All creatures thrive!';
        }
        if (terms.badEventMessage !== undefined) {
            safariData[guildId].safariConfig.badEventMessage = terms.badEventMessage || 'Meteors rain down! Only the protected survive!';
        }
        if (terms.goodEventEmoji !== undefined) {
            safariData[guildId].safariConfig.goodEventEmoji = terms.goodEventEmoji || '☀️';
        }
        if (terms.badEventEmoji !== undefined) {
            safariData[guildId].safariConfig.badEventEmoji = terms.badEventEmoji || '☄️';
        }
        
        // Update game state
        if (terms.currentRound !== undefined) {
            safariData[guildId].safariConfig.currentRound = terms.currentRound || 1;
        }
        if (terms.lastRoundTimestamp !== undefined) {
            safariData[guildId].safariConfig.lastRoundTimestamp = terms.lastRoundTimestamp;
        }
        
        // Save updated data
        await saveSafariContent(safariData);
        
        console.log(`✅ Updated custom terms for guild ${guildId}:`, terms);
        return true;
        
    } catch (error) {
        console.error('Error updating custom terms:', error);
        return false;
    }
}

/**
 * Reset custom terminology to defaults for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {boolean} Success status
 */
async function resetCustomTerms(guildId) {
    return await updateCustomTerms(guildId, {
        currencyName: 'Dollars',
        inventoryName: 'Inventory',
        currencyEmoji: '🪙',
        inventoryEmoji: '🧰'
    });
}

/**
 * Sort players for round results based on priority roles
 * @param {Array} eligiblePlayers - Array of player objects from getEligiblePlayersFixed
 * @param {Array} priorityRoles - Array of role IDs to prioritize
 * @param {Object} client - Discord client for fetching guild/member data
 * @param {string} guildId - Guild ID
 * @returns {Object} Object with sorted players grouped by role
 */
async function sortPlayersForResults(eligiblePlayers, priorityRoles, client, guildId) {
    // If no priority roles configured, return original list
    if (!priorityRoles || priorityRoles.length === 0) {
        return {
            sorted: eligiblePlayers,
            groups: null
        };
    }
    
    try {
        // Fetch guild and members
        const guild = await client.guilds.fetch(guildId);
        await guild.members.fetch(); // Ensure all members are cached
        
        // Create groups for each priority role
        const roleGroups = {};
        const unassigned = [];
        const processedPlayers = new Set();
        
        // Process each priority role in order
        for (const roleId of priorityRoles) {
            const role = guild.roles.cache.get(roleId);
            if (!role) continue; // Role deleted, skip silently
            
            roleGroups[roleId] = {
                name: role.name,
                color: role.color,
                players: []
            };
            
            // Find players with this role
            for (const player of eligiblePlayers) {
                // Skip if already assigned to a higher priority role
                if (processedPlayers.has(player.userId)) continue;
                
                try {
                    const member = guild.members.cache.get(player.userId);
                    if (member && member.roles.cache.has(roleId)) {
                        roleGroups[roleId].players.push(player);
                        processedPlayers.add(player.userId);
                    }
                } catch (err) {
                    // Member not found, skip silently
                    console.log(`⚠️ Member ${player.userId} not found, skipping`);
                }
            }
            
            // Remove empty groups
            if (roleGroups[roleId].players.length === 0) {
                delete roleGroups[roleId];
            }
        }
        
        // Add remaining players to unassigned
        for (const player of eligiblePlayers) {
            if (!processedPlayers.has(player.userId)) {
                unassigned.push(player);
            }
        }
        
        // Combine all groups into sorted array
        const sorted = [];
        for (const roleId of priorityRoles) {
            if (roleGroups[roleId]) {
                sorted.push(...roleGroups[roleId].players);
            }
        }
        sorted.push(...unassigned);
        
        return {
            sorted,
            groups: {
                roleGroups,
                unassigned: unassigned.length > 0 ? unassigned : null
            }
        };
        
    } catch (error) {
        console.error(`⚠️ Error sorting players by roles:`, error);
        // On any error, return original list
        return {
            sorted: eligiblePlayers,
            groups: null
        };
    }
}

/**
 * Calculate simple results for all eligible players using goodOutcomeValue
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Result summary with player count and total earnings
 */
async function calculateSimpleResults(guildId) {
    try {
        console.log(`🌾 DEBUG: Calculating simple results for guild ${guildId}`);

        // Get eligible players and items
        const eligiblePlayers = await getEligiblePlayersFixed(guildId, null);
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};

        let totalEarnings = 0;
        let processedPlayers = 0;

        // Process each eligible player
        for (const player of eligiblePlayers) {
            console.log(`🔄 DEBUG: Processing player ${player.playerName} (${player.userId})`);

            let playerEarnings = 0;

            // Process each inventory item using goodOutcomeValue
            for (const [itemId, inventoryItem] of Object.entries(player.inventory)) {
                // Use universal accessor to get quantity
                const quantity = getItemQuantity(inventoryItem);
                if (quantity <= 0) continue;

                const item = items[itemId];
                if (!item) {
                    console.log(`⚠️ DEBUG: Item ${itemId} not found in items database`);
                    continue;
                }

                // Calculate earnings using goodOutcomeValue (default for simple results)
                const goodValue = item.goodOutcomeValue || 0;
                if (goodValue !== 0) {
                    const itemEarnings = quantity * goodValue;
                    playerEarnings += itemEarnings;
                    console.log(`💰 DEBUG: ${player.playerName} - ${item.name} x${quantity} = ${itemEarnings}`);
                }
            }

            // Update player currency if earnings > 0
            if (playerEarnings !== 0) {
                await updateCurrency(guildId, player.userId, playerEarnings);
                console.log(`💰 DEBUG: Updated ${player.playerName} currency by ${playerEarnings}`);
                totalEarnings += playerEarnings;
            }

            processedPlayers++;
        }

        console.log(`✅ DEBUG: Simple results calculated - ${processedPlayers} players processed, ${totalEarnings} total earnings`);

        return {
            success: true,
            processedPlayers,
            totalEarnings,
            message: `Results calculated for ${processedPlayers} players`
        };

    } catch (error) {
        console.error('Error calculating simple results:', error);
        throw error;
    }
}

/**
 * Calculate results for a single player using action
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID of the player to process
 * @returns {Object} Results object with success, processedPlayers, totalEarnings, playerName
 */
async function calculateSinglePlayerResults(guildId, userId, playerName = null) {
    try {
        // Validate input parameters
        if (!guildId || !userId) {
            console.error(`❌ Invalid parameters: guildId=${guildId}, userId=${userId}`);
            return {
                success: false,
                processedPlayers: 0,
                totalEarnings: 0,
                playerName: 'Unknown Player',
                message: 'Invalid guild or user ID'
            };
        }

        // OPTIMIZED: Load target player data directly (skip expensive eligible players loop)
        const playerData = await loadPlayerData();
        const playerRecord = playerData[guildId]?.players?.[userId];

        if (!playerRecord?.safari) {
            return {
                success: false,
                processedPlayers: 0,
                totalEarnings: 0,
                playerName: 'Unknown Player',
                message: 'Player not eligible for Safari results calculation'
            };
        }

        // Build minimal player object for processing
        const targetPlayer = {
            userId: userId,
            playerName: playerName || `Player ${userId.slice(-4)}`,
            inventory: playerRecord.safari.inventory || {}
        };

        // Use provided player name if available (from interaction context)
        if (playerName) {
            targetPlayer.playerName = playerName;
        }

        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        let playerEarnings = 0;

        // Validate player has inventory
        if (!targetPlayer.inventory || typeof targetPlayer.inventory !== 'object') {
            console.log(`⚠️ DEBUG: Player ${targetPlayer.playerName} has no inventory or invalid inventory`);
            return {
                success: true,
                processedPlayers: 1,
                totalEarnings: 0,
                playerName: targetPlayer.playerName,
                message: `Results calculated for ${targetPlayer.playerName} (no items)`
            };
        }

        // Process each inventory item using goodOutcomeValue
        const itemsSummary = [];
        for (const [itemId, inventoryItem] of Object.entries(targetPlayer.inventory)) {
            // Use universal accessor to get quantity
            const quantity = getItemQuantity(inventoryItem);
            if (quantity <= 0) continue;

            const item = items[itemId];
            if (!item) continue; // Skip missing items silently

            // Calculate earnings using goodOutcomeValue (default for simple results)
            const goodValue = item.goodOutcomeValue || 0;
            if (goodValue !== 0) {
                const itemEarnings = quantity * goodValue;
                playerEarnings += itemEarnings;
                itemsSummary.push(`${item.name} x${quantity} = ${itemEarnings}`);
            }
        }

        // Update player currency if earnings > 0
        if (playerEarnings !== 0) {
            await updateCurrency(guildId, targetPlayer.userId, playerEarnings);
        }

        // Single consolidated log line instead of multiple DEBUG lines
        console.log(`💰 ${targetPlayer.playerName}: ${itemsSummary.join(', ')} → +${playerEarnings} currency`);

        return {
            success: true,
            processedPlayers: 1,
            totalEarnings: playerEarnings,
            playerName: targetPlayer.playerName,
            message: `Results calculated for ${targetPlayer.playerName}`
        };

    } catch (error) {
        console.error('Error calculating single player results:', error);
        throw error;
    }
}

/**
 * Process Round Results - Challenge Game Logic Core Engine
 * Handles event determination, player earnings/losses, and round progression
 */
async function processRoundResults(guildId, token, client, options = {}) {
    try {
        console.log(`🏅 DEBUG: Starting round results processing for guild ${guildId}`);
        
        // Get current game state from safariContent.json
        const safariData = await loadSafariContent();
        if (!safariData[guildId]) {
            safariData[guildId] = { safariConfig: {} };
        }
        if (!safariData[guildId].safariConfig) {
            safariData[guildId].safariConfig = {};
        }
        
        const safariConfig = safariData[guildId].safariConfig;
        const currentRound = safariConfig.currentRound;
        
        console.log(`🎲 DEBUG: Current round: ${currentRound}`);
        
        // Handle Round 0 (or undefined) - Start Game without results
        if (!currentRound || currentRound === 0) {
            console.log('🎮 DEBUG: Round 0 detected - starting game silently');
            safariConfig.currentRound = 1;
            await saveSafariContent(safariData);
            
            // Return silent success - no results to display
            return {
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    flags: (1 << 15) | 64, // IS_COMPONENTS_V2 + EPHEMERAL
                    components: [{
                        type: 17, // Container
                        accent_color: 0x2ecc71, // Green for success
                        components: [
                            {
                                type: 10, // Text Display
                                content: `✅ Game started successfully. Round 1 is now active.`
                            }
                        ]
                    }]
                }
            };
        }
        
        // Get custom terms including totalRounds
        const customTerms = await getCustomTerms(guildId);
        const totalRounds = customTerms.totalRounds || 3;
        
        // If currentRound > totalRounds, show reset interface (game completed)
        if (currentRound > totalRounds) {
            console.log(`🔄 DEBUG: Game completed (currentRound=${currentRound} > totalRounds=${totalRounds}), showing reset interface`);
            return createResetInterface();
        }
        
        // Get round-specific good event probability using interpolation
        const goodEventProbability = calculateRoundProbability(currentRound, totalRounds, customTerms);
        
        console.log(`📊 DEBUG: Round ${currentRound} probabilities - Good: ${goodEventProbability}%`);
        
        // Randomly determine if goodEvent or badEvent occurred
        const randomRoll = Math.random() * 100;
        const isGoodEvent = randomRoll < goodEventProbability;
        const eventType = isGoodEvent ? 'good' : 'bad';
        const eventName = isGoodEvent ? (customTerms.goodEventName || 'Clear Skies') : (customTerms.badEventName || 'Meteor Strike');
        const eventEmoji = isGoodEvent ? (customTerms.goodEventEmoji || '☀️') : (customTerms.badEventEmoji || '☄️');
        
        console.log(`🎯 DEBUG: Event roll: ${randomRoll.toFixed(1)}% - ${eventType.toUpperCase()} event: ${eventName}`);
        
        // Get eligible players (currency >= 1 OR any inventory items)
        const eligiblePlayersUnsorted = await getEligiblePlayersFixed(guildId, client);
        console.log(`👥 DEBUG: Found ${eligiblePlayersUnsorted.length} eligible players`);
        
        // Apply role-based sorting if configured
        const priorityRoles = safariData[guildId]?.priorityRoles || [];
        const sortResult = await sortPlayersForResults(eligiblePlayersUnsorted, priorityRoles, client, guildId);
        const eligiblePlayers = sortResult.sorted;
        const roleGroups = sortResult.groups;
        console.log(`📊 DEBUG: Applied role sorting with ${priorityRoles.length} priority roles`);
        
        if (eligiblePlayers.length === 0) {
            console.log('⚠️ DEBUG: No eligible players found - returning Components V2 error message');
            return {
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    flags: (1 << 15), // IS_COMPONENTS_V2
                    components: [{
                        type: 17, // Container
                        accent_color: 0xe74c3c, // Red for warning
                        components: [
                            {
                                type: 10, // Text Display
                                content: `# No Safari Players Initialized\n\nNo eligible players found. Use the **Player Admin > Initialize Safari** button to initialize.`
                            }
                        ]
                    }]
                }
            };
        }
        
        // Process each eligible player
        const playerResults = [];
        const items = safariData[guildId]?.items || {};
        
        for (const player of eligiblePlayers) {
            console.log(`🔄 DEBUG: Processing player ${player.playerName} (${player.userId})`);
            
            let totalEarnings = 0;
            let totalDefense = 0;
            const itemDetails = [];
            const defenseDetails = [];
            
            // Process each inventory item
            for (const [itemId, inventoryItem] of Object.entries(player.inventory)) {
                // Use universal accessor to get quantity
                const quantity = getItemQuantity(inventoryItem);
                if (quantity <= 0) continue;
                
                const item = items[itemId];
                if (!item) {
                    console.log(`⚠️ DEBUG: Item ${itemId} not found in items database`);
                    continue;
                }
                
                // Calculate earnings based on event type
                const outcomeValue = eventType === 'good' ? 
                    (item.goodOutcomeValue || 0) : 
                    (item.badOutcomeValue || 0);
                    
                if (outcomeValue !== 0) {
                    const itemEarnings = quantity * outcomeValue;
                    totalEarnings += itemEarnings;
                    itemDetails.push(`${item.name || item.label || itemId} x${quantity}: ${itemEarnings > 0 ? '+' : ''}${itemEarnings}`);
                }
                
                // Calculate defense (placeholder for future attack system)
                if (item.defenseValue) {
                    const itemDefense = quantity * item.defenseValue;
                    totalDefense += itemDefense;
                    defenseDetails.push(`🛡️ ${item.name || item.label || itemId} x${quantity}: ${itemDefense} Defense`);
                }
            }
            
            // Update player currency
            if (totalEarnings !== 0) {
                await updateCurrency(guildId, player.userId, totalEarnings);
                console.log(`💰 DEBUG: Updated ${player.playerName} currency by ${totalEarnings}`);
            }
            
            // Store player result
            playerResults.push({
                playerName: player.playerName,
                userId: player.userId,
                earnings: totalEarnings,
                defense: totalDefense,
                itemDetails: itemDetails,
                defenseDetails: defenseDetails,
                newCurrency: player.currency + totalEarnings
            });
        }
        
        // Process attack queue (after yield calculations, before round output)
        console.log(`⚔️ DEBUG: Starting attack resolution for round ${currentRound}`);
        
        // Load player data for attack processing
        const playerData = await loadPlayerData();
        const { attackResults, attackQueue, attacksByDefender } = await processAttackQueue(guildId, currentRound, playerData, items, client);
        
        // Consume attack items for completed attacks
        const consumptionResults = await consumeAttackItems(attackQueue, playerData, guildId, items);
        
        // Save updated player data (after attack damage and item consumption)
        await savePlayerData(playerData);
        console.log(`✅ DEBUG: Player data saved after attack resolution`);
        
        // Clear processed attack queue
        await clearProcessedAttackQueue(guildId, currentRound);
        
        // Prepare round data for display functions
        const roundData = {
            currentRound,
            totalRounds, // Add totalRounds for display
            isGoodEvent: eventType === 'good',
            eventName,
            eventEmoji,
            eligiblePlayers,
            roleGroups, // Add role groups for display formatting
            attacksByDefender: attacksByDefender || {},
            playerBalanceChanges: {}
        };
        
        // Calculate balance changes for V2 display - reload fresh data after all processing
        const finalPlayerData = await loadPlayerData();
        for (const player of eligiblePlayers) {
            const startingBalance = player.currency || 0; // Original balance before round processing
            const endingBalance = finalPlayerData[guildId]?.players?.[player.userId]?.safari?.currency || 0;
            roundData.playerBalanceChanges[player.userId] = {
                starting: startingBalance,
                ending: endingBalance,
                change: endingBalance - startingBalance
            };
            console.log(`💰 DEBUG: ${player.playerName} balance: ${startingBalance} → ${endingBalance} (${endingBalance - startingBalance >= 0 ? '+' : ''}${endingBalance - startingBalance})`);
        }
        
        // Advance to next round or complete game
        if (currentRound < totalRounds) {
            // Advance to next round
            safariConfig.currentRound = currentRound + 1;
            await saveSafariContent(safariData);
        } else {
            // Final round completed - show detailed results with final rankings and set to complete state
            safariConfig.currentRound = totalRounds + 1;
            await saveSafariContent(safariData);
            
            // Use modern display for final round - show final results with rankings
            console.log(`🏆 DEBUG: Round ${totalRounds} completed, creating final results display`);
            return await createRoundResultsV2(guildId, roundData, customTerms, token, client, options);
        }
        
        // Return modern round results display (will post multiple messages)
        return await createRoundResultsV2(guildId, roundData, customTerms, token, client, options);
        
    } catch (error) {
        console.error('Error processing round results:', error);
        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                content: '❌ An error occurred while processing round results. Please try again.',
                flags: 64 // EPHEMERAL
            }
        };
    }
}

/**
 * Handle game reset after round 3
 */
function createResetInterface() {
    return {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
            flags: (1 << 15), // IS_COMPONENTS_V2 (non-ephemeral)
            components: [{
                type: 17, // Container
                accent_color: 0xed4245, // Red
                components: [
                    {
                        type: 10, // Text Display
                        content: `# Reset Game?\n\nAll player currency will be reset to 0, all player item purchases cleared, and all round data will be cleared`
                    },
                    {
                        type: 1, // Action Row
                        components: [{
                            type: 2, // Button
                            custom_id: 'safari_confirm_reset_game',
                            label: 'Reset Game',
                            style: 4, // Danger
                            emoji: { name: '⚠️' }
                        }]
                    }
                ]
            }]
        }
    };
}

/**
 * Get eligible players (currency >= 1 OR has inventory items)
 */
async function getEligiblePlayersFixed(guildId, client = null) {
    try {
        console.log(`🔍 DEBUG: Getting eligible players for guild ${guildId}`);
        const playerData = await loadPlayerData();
        const players = playerData[guildId]?.players || {};
        const eligiblePlayers = [];
        
        console.log(`🔍 DEBUG: Found ${Object.keys(players).length} total players in guild`);
        
        for (const [userId, data] of Object.entries(players)) {
            // Check if player has been initialized in Safari system
            const safari = data.safari;
            if (!safari) continue; // Skip non-initialized players
            
            const currency = safari.currency || 0;
            const inventory = safari.inventory || {};
            const hasInventory = Object.keys(inventory).length > 0 && Object.values(inventory).some(item => getItemQuantity(item) > 0);
            
            console.log(`🔍 DEBUG: Player ${userId}: initialized=true, currency=${currency}, hasInventory=${hasInventory}`);
            
            // All safari-initialized players are eligible for round results
            if (true) { // Include all safari-initialized players
                // Check cache first for consistent player names within the same request
                let playerName = playerNameCache.get(userId);
                
                if (!playerName) {
                    // Get player name from Discord client if available - use multiple fallback strategies
                    playerName = `Player ${userId.slice(-4)}`;
                    try {
                        // Try to get fresh name from guild member
                        const guild = client?.guilds?.cache?.get(guildId);
                        if (guild) {
                            const member = await guild?.members?.fetch(userId);
                            if (member) {
                                playerName = member.displayName || member.user?.globalName || member.user?.username || playerName;
                                console.log(`🔍 DEBUG: Discord lookup successful for ${userId}: ${playerName}`);
                            }
                        }
                    } catch (e) {
                        console.log(`🔍 DEBUG: Discord client lookup failed for ${userId}, using fallback`);
                    }
                    
                    // Enhanced fallback to stored data if Discord lookup failed
                    if (playerName.startsWith('Player ')) {
                        playerName = data.globalName || data.displayName || data.username || playerName;
                    }
                    
                    // Cache the result for consistency
                    playerNameCache.set(userId, playerName);
                    console.log(`💾 DEBUG: Cached player name for ${userId}: ${playerName}`);
                } else {
                    console.log(`📋 DEBUG: Using cached name for ${userId}: ${playerName}`);
                }
                
                eligiblePlayers.push({
                    userId: userId,
                    currency: currency,
                    inventory: inventory,
                    playerName: playerName
                });
                
                console.log(`✅ DEBUG: Added eligible player: ${playerName} (${userId})`);
            }
        }
        
        console.log(`✅ DEBUG: Total eligible players: ${eligiblePlayers.length}`);
        return eligiblePlayers;
        
    } catch (error) {
        console.error('Error getting eligible players:', error);
        return [];
    }
}

/**
 * Process a single player's round results
 */
async function processPlayerRound(guildId, userId, eventType, customTerms, playerName = null) {
    try {
        const playerInventory = await getPlayerInventory(guildId, userId);
        const playerCurrency = await getCurrency(guildId, userId);
        
        // Get all items for this guild
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        
        let totalYield = 0;
        let yieldDetails = [];
        let consumedItems = [];
        
        // Calculate yield from inventory
        for (const [itemId, quantity] of Object.entries(playerInventory)) {
            if (quantity <= 0) continue;
            
            const item = items[itemId];
            if (!item) continue;
            
            const yieldValue = eventType === 'good' ? item.goodOutcomeValue : item.badOutcomeValue;
            if (yieldValue !== null && yieldValue !== undefined) {
                const itemYield = yieldValue * quantity;
                totalYield += itemYield;
                yieldDetails.push(`${item.name} x${quantity}: ${itemYield}`);
            }
            
            // Check if item is consumable
            if (item.consumable === 'Yes') {
                consumedItems.push({ itemId, quantity });
            }
        }
        
        // TODO: Calculate attack damage (for future implementation)
        // const attackDamage = await calculateAttackDamage(guildId, userId);
        const attackDamage = 0; // Placeholder
        
        // Calculate net change
        const netChange = totalYield - attackDamage;
        
        // Update player currency
        if (netChange !== 0) {
            const context = {
                username: playerName || 'Unknown',
                displayName: playerName || 'Unknown',
                source: `${eventType} round`,
                channelName: null
            };
            await updateCurrency(guildId, userId, netChange, context);
        }
        
        // Consume items if needed
        for (const { itemId, quantity } of consumedItems) {
            // Remove consumed items from inventory
            const playerData = await loadPlayerData();
            if (playerData[guildId]?.players?.[userId]?.safari?.inventory) {
                delete playerData[guildId].players[userId].safari.inventory[itemId];
                await savePlayerData(playerData);
            }
        }
        
        // Build details string
        let details = '';
        if (yieldDetails.length > 0) {
            details = yieldDetails.join(', ');
        }
        if (consumedItems.length > 0) {
            if (details) details += '; ';
            details += `Consumed: ${consumedItems.map(c => items[c.itemId]?.name || c.itemId).join(', ')}`;
        }
        
        return {
            userId: userId,
            playerName: playerName || `Player ${userId.slice(-4)}`,
            netChange: netChange,
            details: details
        };
        
    } catch (error) {
        console.error(`Error processing player ${userId} round:`, error);
        return null;
    }
}

/**
 * Store round result in history
 */
async function storeRoundResult(guildId, roundResult) {
    try {
        const safariData = await loadSafariContent();
        
        if (!safariData[guildId]) {
            safariData[guildId] = { buttons: {}, safaris: {}, applications: {}, stores: {}, items: {} };
        }
        
        if (!safariData[guildId].roundHistory) {
            safariData[guildId].roundHistory = [];
        }
        
        safariData[guildId].roundHistory.push(roundResult);
        await saveSafariContent(safariData);
        
        console.log(`📝 DEBUG: Stored round ${roundResult.round} result for guild ${guildId}`);
        
    } catch (error) {
        console.error('Error storing round result:', error);
    }
}

/**
 * Restock all eligible players with 100 currency
    try {
        const totalParticipants = playerResults.length;
        const totalEarnings = playerResults.reduce((sum, p) => sum + p.earnings, 0);
        
        // Sort players by earnings (highest first)
        const sortedResults = [...playerResults].sort((a, b) => b.earnings - a.earnings);
        
        // Build player summary (limit to 10 for summary format)
        let playerSummary = '';
        const displayResults = sortedResults.slice(0, 10);
        
        for (const result of displayResults) {
            const currencyEmoji = customTerms.currencyEmoji || '🪙';
            const sign = result.earnings >= 0 ? '+' : '';
            playerSummary += `• **${result.playerName}**: ${sign}${result.earnings} ${currencyEmoji}\n`;
            
            // Add item details (max 2 lines per player)
            if (result.itemDetails.length > 0) {
                playerSummary += `  └ ${result.itemDetails.slice(0, 2).join(', ')}\n`;
            }
            
            // Add defense details if any
            if (result.defenseDetails.length > 0) {
                playerSummary += `  └ ${result.defenseDetails.slice(0, 1).join(', ')}\n`;
            }
        }
        
        if (playerResults.length > 10) {
            playerSummary += `*... and ${playerResults.length - 10} more players*\n`;
        }
        
        // Build attack results summary
        let attackSummary = '';
        if (attackResults && attackResults.length > 0) {
            attackSummary = '\n\n**⚔️ Attack Results:**\n';
            
            // Group attacks by defender for cleaner display
            const attacksByDefender = {};
            for (const attack of attackResults) {
                if (!attacksByDefender[attack.defenderName]) {
                    attacksByDefender[attack.defenderName] = {
                        totalDamage: 0,
                        attackCount: 0,
                        attacks: []
                    };
                }
                attacksByDefender[attack.defenderName].totalDamage += attack.damageDealt;
                attacksByDefender[attack.defenderName].attackCount += 1;
                attacksByDefender[attack.defenderName].attacks.push(attack);
            }
            
            // Display attack summary (limit to 5 defenders for brevity)
            const defenderNames = Object.keys(attacksByDefender).slice(0, 5);
            for (const defenderName of defenderNames) {
                const defenderStats = attacksByDefender[defenderName];
                attackSummary += `• **${defenderName}**: -${defenderStats.totalDamage} ${customTerms.currencyEmoji || '🪙'} (${defenderStats.attackCount} attacks)\n`;
            }
            
            if (Object.keys(attacksByDefender).length > 5) {
                attackSummary += `*... and ${Object.keys(attacksByDefender).length - 5} more defenders*\n`;
            }
        }
        
        // Build item consumption summary
        let consumptionSummary = '';
        if (consumptionResults && consumptionResults.length > 0) {
            consumptionSummary = '\n\n**🔄 Items Consumed:**\n';
            
            // Group by player for cleaner display
            const consumptionByPlayer = {};
            for (const consumption of consumptionResults) {
                if (!consumptionByPlayer[consumption.playerName]) {
                    consumptionByPlayer[consumption.playerName] = [];
                }
                consumptionByPlayer[consumption.playerName].push(consumption);
            }
            
            // Display consumption summary (limit to 5 players)
            const playerNames = Object.keys(consumptionByPlayer).slice(0, 5);
            for (const playerName of playerNames) {
                const consumptions = consumptionByPlayer[playerName];
                const itemList = consumptions.map(c => `${c.itemName} x${c.quantityConsumed}`).join(', ');
                consumptionSummary += `• **${playerName}**: ${itemList}\n`;
            }
            
            if (Object.keys(consumptionByPlayer).length > 5) {
                consumptionSummary += `*... and ${Object.keys(consumptionByPlayer).length - 5} more players*\n`;
            }
        }
        
        // Build next round message
        let nextRoundMsg = '';
        if (currentRound < totalRounds) {
            nextRoundMsg = `\n**Next:** Round ${currentRound + 1} of ${totalRounds}`;
            if (currentRound === totalRounds - 1) {
                nextRoundMsg += ' (Final Round)';
            }
        } else {
            nextRoundMsg = '\n**Game completed! Rankings will be shown next.**';
        }
        
        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                flags: (1 << 15), // IS_COMPONENTS_V2
                components: [{
                    type: 17, // Container
                    accent_color: eventType === 'good' ? 0x57f287 : 0xed4245, // Green for good, red for bad
                    components: [
                        {
                            type: 10, // Text Display
                            content: `# Round ${currentRound} Results\n\n## ${eventEmoji} ${eventName}\n\n**${totalParticipants} players participated** | **Total earnings: ${totalEarnings >= 0 ? '+' : ''}${totalEarnings} ${customTerms.currencyEmoji || '🪙'}**`
                        },
                        {
                            type: 14 // Separator
                        },
                        {
                            type: 10, // Text Display  
                            content: `**Player Results:**\n${playerSummary}${attackSummary}${consumptionSummary}${nextRoundMsg}`
                        },
                        {
                            type: 1, // Action Row
                            components: [{
                                type: 2, // Button
                                custom_id: 'safari_player_inventory',
                                label: 'View My Inventory',
                                style: 2, // Secondary
                                emoji: { name: '🎒' }
                            }]
                        }
                    ]
                }]
            }
        };
        
    } catch (error) {
        console.error('Error creating round results output:', error);
        return {
            type: 4,
            data: {
                content: '❌ Error displaying round results.',
                flags: 64 // EPHEMERAL
            }
        };
    }
}

/**
 * Create final rankings after round 3
 */
async function createFinalRankings(guildId, playerResults, eventType, eventName, eventEmoji) {
    try {
        const customTerms = await getCustomTerms(guildId);
        
        // Get final currency standings
        const playerData = await loadPlayerData();
        const players = playerData[guildId]?.players || {};
        
        const finalStandings = [];
        for (const [userId, data] of Object.entries(players)) {
            const safari = data.safari || {};
            const currency = safari.currency || 0;
            if (currency > 0 || Object.keys(safari.inventory || {}).length > 0) {
                let playerName = `Player ${userId.slice(-4)}`;
                try {
                    // Try to get name from results first, then fallback
                    const resultPlayer = playerResults.find(p => p.userId === userId);
                    if (resultPlayer) {
                        playerName = resultPlayer.playerName;
                    }
                } catch (e) {
                    playerName = data.globalName || data.displayName || data.username || playerName;
                }
                
                finalStandings.push({
                    userId,
                    playerName,
                    currency
                });
            }
        }
        
        // Sort by currency (highest first)
        finalStandings.sort((a, b) => b.currency - a.currency);
        
        // Build final rankings display
        let rankingsDisplay = '';
        for (let i = 0; i < Math.min(finalStandings.length, 15); i++) {
            const player = finalStandings[i];
            const trophy = i === 0 ? '🏆 ' : ''; // Trophy for winner
            const rank = i + 1;
            rankingsDisplay += `${rank}. ${trophy}**${player.playerName}**: ${player.currency} ${customTerms.currencyEmoji || '🪙'}\n`;
        }
        
        if (finalStandings.length > 15) {
            rankingsDisplay += `*... and ${finalStandings.length - 15} more players*`;
        }
        
        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                flags: (1 << 15), // IS_COMPONENTS_V2
                components: [{
                    type: 17, // Container
                    accent_color: 0xf1c40f, // Gold for final results
                    components: [
                        {
                            type: 10, // Text Display
                            content: `# Final Round Results\n\n## ${eventEmoji} ${eventName}\n\n*Round 3 completed! Game reset available on next click.*`
                        },
                        {
                            type: 14 // Separator
                        },
                        {
                            type: 10, // Text Display
                            content: `# 🏆 Final Rankings\n\n${rankingsDisplay}`
                        },
                        {
                            type: 1, // Action Row
                            components: [
                                {
                                    type: 2, // Button
                                    custom_id: 'safari_player_inventory',
                                    label: 'View My Inventory',
                                    style: 2, // Secondary
                                    emoji: { name: '🎒' }
                                },
                                {
                                    type: 2, // Button
                                    custom_id: 'safari_round_results',
                                    label: 'Click for Game Reset',
                                    style: 4, // Danger
                                    emoji: { name: '🔄' }
                                }
                            ]
                        }
                    ]
                }]
            }
        };
        
    } catch (error) {
        console.error('Error creating final rankings:', error);
        return {
            type: 4,
            data: {
                content: '❌ Error displaying final rankings.',
                flags: 64 // EPHEMERAL
            }
        };
    }
}

/**
 * Create final round (Round 3) results with detailed earnings AND final rankings
 */
async function createFinalRoundResults(guildId, currentRound, eventType, eventName, eventEmoji, playerResults, customTerms, attackResults = [], consumptionResults = []) {
    try {
        // First, generate the standard round results content (same as Round 1 & 2)
        const totalParticipants = playerResults.length;
        const totalEarnings = playerResults.reduce((sum, p) => sum + p.earnings, 0);
        
        // Sort players by earnings (highest first)
        const sortedResults = [...playerResults].sort((a, b) => b.earnings - a.earnings);
        
        // Build player summary (limit to 10 for summary format)
        let playerSummary = '';
        const displayResults = sortedResults.slice(0, 10);
        
        for (const result of displayResults) {
            const currencyEmoji = customTerms.currencyEmoji || '🪙';
            const sign = result.earnings >= 0 ? '+' : '';
            playerSummary += `• **${result.playerName}**: ${sign}${result.earnings} ${currencyEmoji}\n`;
            
            // Add item details (max 2 lines per player)
            if (result.itemDetails.length > 0) {
                playerSummary += `  └ ${result.itemDetails.slice(0, 2).join(', ')}\n`;
            }
            
            // Add defense details if any
            if (result.defenseDetails.length > 0) {
                playerSummary += `  └ ${result.defenseDetails.slice(0, 1).join(', ')}\n`;
            }
        }
        
        if (playerResults.length > 10) {
            playerSummary += `*... and ${playerResults.length - 10} more players*\n`;
        }

        // Build attack results summary (same as regular rounds)
        let attackSummary = '';
        if (attackResults && attackResults.length > 0) {
            attackSummary = '\n\n**⚔️ Attack Results:**\n';
            
            // Group attacks by defender for cleaner display
            const attacksByDefender = {};
            for (const attack of attackResults) {
                if (!attacksByDefender[attack.defenderName]) {
                    attacksByDefender[attack.defenderName] = {
                        totalDamage: 0,
                        attackCount: 0,
                        attacks: []
                    };
                }
                attacksByDefender[attack.defenderName].totalDamage += attack.damageDealt;
                attacksByDefender[attack.defenderName].attackCount += 1;
                attacksByDefender[attack.defenderName].attacks.push(attack);
            }
            
            // Display attack summary (limit to 5 defenders for brevity)
            const defenderNames = Object.keys(attacksByDefender).slice(0, 5);
            for (const defenderName of defenderNames) {
                const defenderStats = attacksByDefender[defenderName];
                attackSummary += `• **${defenderName}**: -${defenderStats.totalDamage} ${customTerms.currencyEmoji || '🪙'} (${defenderStats.attackCount} attacks)\n`;
            }
            
            if (Object.keys(attacksByDefender).length > 5) {
                attackSummary += `*... and ${Object.keys(attacksByDefender).length - 5} more defenders*\n`;
            }
        }

        // Build item consumption summary (same as regular rounds)
        let consumptionSummary = '';
        if (consumptionResults && consumptionResults.length > 0) {
            consumptionSummary = '\n\n**🔄 Items Consumed:**\n';
            
            // Group by player for cleaner display
            const consumptionByPlayer = {};
            for (const consumption of consumptionResults) {
                if (!consumptionByPlayer[consumption.playerName]) {
                    consumptionByPlayer[consumption.playerName] = [];
                }
                consumptionByPlayer[consumption.playerName].push(consumption);
            }
            
            // Display consumption summary (limit to 5 players)
            const playerNames = Object.keys(consumptionByPlayer).slice(0, 5);
            for (const playerName of playerNames) {
                const consumptions = consumptionByPlayer[playerName];
                const itemList = consumptions.map(c => `${c.itemName} x${c.quantityConsumed}`).join(', ');
                consumptionSummary += `• **${playerName}**: ${itemList}\n`;
            }
            
            if (Object.keys(consumptionByPlayer).length > 5) {
                consumptionSummary += `*... and ${Object.keys(consumptionByPlayer).length - 5} more players*\n`;
            }
        }

        // Now get final rankings
        const playerData = await loadPlayerData();
        const players = playerData[guildId]?.players || {};
        
        const finalStandings = [];
        for (const [userId, data] of Object.entries(players)) {
            const safari = data.safari || {};
            const currency = safari.currency || 0;
            if (currency > 0 || Object.keys(safari.inventory || {}).length > 0) {
                let playerName = `Player ${userId.slice(-4)}`;
                try {
                    // Try to get name from results first, then fallback
                    const resultPlayer = playerResults.find(p => p.userId === userId);
                    if (resultPlayer) {
                        playerName = resultPlayer.playerName;
                    }
                } catch (e) {
                    playerName = data.globalName || data.displayName || data.username || playerName;
                }
                
                finalStandings.push({
                    userId,
                    playerName,
                    currency
                });
            }
        }
        
        // Sort by currency (highest first)
        finalStandings.sort((a, b) => b.currency - a.currency);
        
        // Build final rankings display
        let rankingsDisplay = '';
        for (let i = 0; i < Math.min(finalStandings.length, 15); i++) {
            const player = finalStandings[i];
            const trophy = i === 0 ? '🏆 ' : ''; // Trophy for winner
            rankingsDisplay += `${trophy}**${player.playerName}**: ${player.currency} ${customTerms.currencyEmoji || '🪙'}\n`;
        }
        
        if (finalStandings.length > 15) {
            rankingsDisplay += `*... and ${finalStandings.length - 15} more players*\n`;
        }

        // Build the complete Round 3 results display
        const roundResultsContent = `# Round ${currentRound} Results\n\n## ${eventEmoji} ${eventName}\n\n**${totalParticipants} players participated** | **Total earnings: ${totalEarnings >= 0 ? '+' : ''}${totalEarnings} ${customTerms.currencyEmoji || '🪙'}**\n\n**Player Results:**\n${playerSummary}${attackSummary}${consumptionSummary}`;

        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                flags: (1 << 15), // IS_COMPONENTS_V2
                components: [
                    {
                        type: 17, // Container
                        accent_color: 0x3498db, // Blue for round results
                        components: [
                            {
                                type: 10, // Text Display
                                content: roundResultsContent
                            }
                        ]
                    },
                    {
                        type: 17, // Container
                        accent_color: 0xf1c40f, // Gold for final rankings
                        components: [
                            {
                                type: 10, // Text Display
                                content: `# 🏆 Final Rankings\n\n${rankingsDisplay}\n*Round 3 completed! Game reset available on next click.*`
                            },
                            {
                                type: 1, // Action Row
                                components: [
                                    {
                                        type: 2, // Button
                                        custom_id: 'safari_player_inventory',
                                        label: 'View My Inventory',
                                        style: 2, // Secondary
                                        emoji: { name: '🎒' }
                                    },
                                    {
                                        type: 2, // Button
                                        custom_id: 'safari_round_results',
                                        label: 'Click for Game Reset',
                                        style: 4, // Danger
                                        emoji: { name: '🔄' }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        };
        
    } catch (error) {
        console.error('Error creating final round results:', error);
        return {
            type: 4,
            data: {
                content: '❌ Error displaying final round results.',
                flags: 64 // EPHEMERAL
            }
        };
    }
}

/**
 * Restock all eligible players with 100 currency
 * @param {string} guildId - Discord guild ID
 * @param {Object} client - Discord client for user name lookups
 * @returns {Object} Discord interaction response
 */
async function restockPlayers(guildId, client) {
    try {
        console.log(`🪣 DEBUG: Starting player restock for guild ${guildId}`);
        
        // Load player data
        const playerData = await loadPlayerData();
        const players = playerData[guildId]?.players || {};
        
        // Find all players with safari objects (regardless of content)
        const safariPlayers = [];
        for (const [userId, data] of Object.entries(players)) {
            if (data.safari !== undefined) {
                safariPlayers.push(userId);
            }
        }
        
        console.log(`👥 DEBUG: Found ${safariPlayers.length} players with safari data for restock`);
        
        if (safariPlayers.length === 0) {
            console.log(`⚠️ DEBUG: No players with safari data found for restock`);
            return {
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    flags: (1 << 15) | 64, // IS_COMPONENTS_V2 + EPHEMERAL
                    components: [{
                        type: 17, // Container
                        accent_color: 0xf39c12, // Orange for warning
                        components: [
                            {
                                type: 10, // Text Display
                                content: `# 🪣 Player Restock\n\n**No players with safari data found** to restock.\n\nPlayers need to have participated in Safari games to be restocked.`
                            }
                        ]
                    }]
                }
            };
        }
        
        // Restock all safari players to 100 currency
        let playersRestocked = 0;
        const restockAmount = 100;
        const playerDetails = [];
        
        // Get custom terms for currency display
        const customTerms = await getCustomTerms(guildId);
        
        for (const userId of safariPlayers) {
            // Ensure player safari data exists
            if (!playerData[guildId]) {
                playerData[guildId] = { players: {} };
            }
            if (!playerData[guildId].players) {
                playerData[guildId].players = {};
            }
            if (!playerData[guildId].players[userId]) {
                playerData[guildId].players[userId] = {};
            }
            if (!playerData[guildId].players[userId].safari) {
                playerData[guildId].players[userId].safari = {};
            }
            
            // Set currency to 100
            const oldCurrency = playerData[guildId].players[userId].safari.currency || 0;
            playerData[guildId].players[userId].safari.currency = restockAmount;
            
            // Clear and reinitialize inventory
            playerData[guildId].players[userId].safari.inventory = {};
            
            // Grant default items
            await grantDefaultItems(playerData, guildId, userId);
            
            // Get list of items added for display
            const playerInventoryItems = [];
            const inventory = playerData[guildId].players[userId].safari.inventory || {};
            const safariData = await loadSafariContent();
            const items = safariData[guildId]?.items || {};
            
            for (const [itemId, quantity] of Object.entries(inventory)) {
                const item = items[itemId];
                if (item) {
                    playerInventoryItems.push(`${quantity}x ${item.name || itemId}`);
                }
            }
            
            // Get Discord user information (display name, username, and guild member info)
            let displayName = `Player ${userId.slice(-4)}`;
            let username = 'unknown';
            let formattedName = displayName;
            
            try {
                // Try to get Discord user and guild member data
                console.log(`🔍 DEBUG: Attempting Discord lookup for ${userId}, client available: ${!!client}`);
                if (client) {
                    const guild = await client.guilds.fetch(guildId).catch((err) => {
                        console.log(`⚠️ DEBUG: Guild fetch failed for ${guildId}:`, err.message);
                        return null;
                    });
                    console.log(`🏰 DEBUG: Guild fetch result for ${guildId}: ${!!guild}`);
                    if (guild) {
                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (member) {
                            // Use guild-specific display name (nickname or global name)
                            displayName = member.displayName || member.user.displayName || member.user.username;
                            username = member.user.username;
                            formattedName = `${displayName} (@${username})`;
                            console.log(`👤 DEBUG: Found Discord user for ${userId}: ${formattedName}`);
                        } else {
                            // Fallback to basic user fetch
                            const user = await client.users.fetch(userId).catch(() => null);
                            if (user) {
                                displayName = user.displayName || user.username;
                                username = user.username;
                                formattedName = `${displayName} (@${username})`;
                                console.log(`👤 DEBUG: Found Discord user (no guild member) for ${userId}: ${formattedName}`);
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`⚠️ DEBUG: Could not fetch Discord info for ${userId}, using fallback name`);
            }
            
            // Format: * DisplayName (@username) - 100 Eggs, [randomized items]
            const itemsDisplay = playerInventoryItems.length > 0 ? playerInventoryItems.join(', ') : 'No items';
            playerDetails.push(`* ${formattedName} - ${restockAmount} ${customTerms.currencyName}, ${itemsDisplay}`);
            
            playersRestocked++;
            console.log(`🪣 DEBUG: Restocked player ${userId}: ${oldCurrency} → ${restockAmount}`);
        }
        
        // Save updated player data
        await savePlayerData(playerData);
        
        console.log(`✅ DEBUG: Successfully restocked ${playersRestocked} players to ${restockAmount} currency`);
        
        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                flags: (1 << 15) | 64, // IS_COMPONENTS_V2 + EPHEMERAL
                components: [{
                    type: 17, // Container
                    accent_color: 0x27ae60, // Green for success
                    components: [
                        {
                            type: 10, // Text Display
                            content: `# 🪣 Players Restocked\n\n**${playersRestocked} safari players** have been restocked:\n• Currency set to **${restockAmount} ${customTerms.currencyName}**\n• Default items granted\n\n${playerDetails.join('\n')}\n\n✅ All players are ready for the next round!`
                        }
                    ]
                }]
            }
        };
        
    } catch (error) {
        console.error('❌ Error restocking players:', error);
        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                content: '❌ Error restocking players. Please try again.',
                flags: 64 // EPHEMERAL
            }
        };
    }
}

/**
 * Reset game data - clear all player currency and inventories
 */
async function resetGameData(guildId) {
    try {
        console.log(`🔄 DEBUG: Resetting game data for guild ${guildId}`);
        
        // Reset safari config to round 1
        const safariData = await loadSafariContent();
        if (!safariData[guildId]) {
            safariData[guildId] = {};
        }
        if (!safariData[guildId].safariConfig) {
            safariData[guildId].safariConfig = {};
        }
        
        safariData[guildId].safariConfig.currentRound = 0;
        safariData[guildId].safariConfig.lastRoundTimestamp = Date.now();
        
        // Clear round history if it exists
        if (safariData[guildId].roundHistory) {
            safariData[guildId].roundHistory = [];
        }
        
        // Clear all attack queues
        if (safariData[guildId].attackQueue) {
            safariData[guildId].attackQueue = {};
            console.log(`🗑️ DEBUG: Cleared all attack queues for guild ${guildId}`);
        }
        
        // Get default starting currency value
        const defaultCurrency = safariData[guildId].safariConfig.defaultStartingCurrencyValue || 100;
        
        await saveSafariContent(safariData);
        
        // Clear all player currency and inventories
        const playerData = await loadPlayerData();
        const players = playerData[guildId]?.players || {};
        
        let playersReset = 0;
        for (const [userId, data] of Object.entries(players)) {
            if (data.safari) {
                data.safari.currency = defaultCurrency;
                data.safari.inventory = {};
                data.safari.history = [];
                data.safari.storeHistory = []; // Clear purchase history for clean per-game audit trails
                
                // Grant default items after clearing inventory
                await grantDefaultItems(playerData, guildId, userId);
                
                playersReset++;
            }
        }
        
        await savePlayerData(playerData);
        
        console.log(`✅ DEBUG: Reset complete - ${playersReset} players reset, game returned to round 0`);
        
        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                flags: (1 << 15), // IS_COMPONENTS_V2 (non-ephemeral)
                components: [{
                    type: 17, // Container
                    accent_color: 0x2ecc71, // Green for success
                    components: [
                        {
                            type: 10, // Text Display
                            content: `# Game Reset Complete\n\n**${playersReset} players** have been reset:\n• All currency set to ${defaultCurrency}\n• All inventories cleared\n• Game ready to start (Round 0)\n\nUse the **Rounds** menu to start the game when ready!`
                        },
                        {
                            type: 1, // Action Row
                            components: [
                                {
                                    type: 2, // Button
                                    custom_id: 'safari_manage_currency',
                                    label: 'Manage Currency',
                                    style: 2, // Secondary
                                    emoji: { name: '💰' }
                                },
                                {
                                    type: 2, // Button
                                    custom_id: 'safari_restock_players',
                                    label: 'Restock Players',
                                    style: 2, // Secondary
                                    emoji: { name: '🪣' }
                                }
                            ]
                        }
                    ]
                }]
            }
        };
        
    } catch (error) {
        console.error('Error resetting game data:', error);
        return {
            type: 4,
            data: {
                content: '❌ Error resetting game data. Please try again.',
                flags: 64 // EPHEMERAL
            }
        };
    }
}

/**
 * Initialize attack availability for items with attack values
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>} Success status
 */
/**
 * Fix corrupted inventory data (temporary cleanup function)
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
async function cleanupCorruptedInventoryData(guildId, userId) {
    try {
        const playerData = await loadPlayerData();
        const inventory = playerData[guildId]?.players?.[userId]?.safari?.inventory;
        
        if (!inventory) return false;
        
        let cleaned = false;
        for (const [itemId, itemData] of Object.entries(inventory)) {
            // Check for corrupted string data like "[object Object]11" or other malformed data
            if (typeof itemData === 'string' && (itemData.includes('[object Object]') || itemData.includes('11111'))) {
                console.log(`🧹 DEBUG: Cleaning corrupted data for ${itemId}: ${itemData}`);
                // Parse the numbers at the end to recover quantity if possible
                const numberMatch = itemData.match(/(\d+)$/);
                const recoveredQuantity = numberMatch ? parseInt(numberMatch[1]) : 1;
                // Set to proper numeric value
                playerData[guildId].players[userId].safari.inventory[itemId] = recoveredQuantity;
                cleaned = true;
            }
        }
        
        if (cleaned) {
            await savePlayerData(playerData);
            console.log(`✅ DEBUG: Cleaned corrupted inventory data for user ${userId}`);
        }
        
        return cleaned;
    } catch (error) {
        console.error('Error cleaning corrupted inventory data:', error);
        return false;
    }
}

async function initializeAttackAvailability(guildId, userId) {
    try {
        // Clean up any corrupted data first
        await cleanupCorruptedInventoryData(guildId, userId);
        
        const playerData = await loadPlayerData();
        const safariData = await loadSafariContent();
        
        const inventory = playerData[guildId]?.players?.[userId]?.safari?.inventory || {};
        const items = safariData[guildId]?.items || {};
        
        let updated = false;
        
        // Check each item in inventory
        for (const [itemId, itemData] of Object.entries(inventory)) {
            const item = items[itemId];
            
            // If item has attack value and no numAttacksAvailable set
            if (item?.attackValue !== null && item?.attackValue !== undefined) {
                if (typeof itemData === 'number') {
                    // Convert simple quantity to object format - CRITICAL: Use proper assignment
                    playerData[guildId].players[userId].safari.inventory[itemId] = {
                        quantity: itemData,
                        numAttacksAvailable: itemData
                    };
                    updated = true;
                    console.log(`🗡️ DEBUG: Initialized attacks for ${itemId}: ${itemData} available`);
                } else if (typeof itemData === 'object' && itemData !== null && !('numAttacksAvailable' in itemData)) {
                    // Add numAttacksAvailable if missing - CRITICAL: Create new object to avoid reference issues
                    playerData[guildId].players[userId].safari.inventory[itemId] = {
                        ...itemData,
                        numAttacksAvailable: itemData.quantity || 0
                    };
                    updated = true;
                    console.log(`🗡️ DEBUG: Set attacks available for ${itemId}: ${itemData.quantity || 0}`);
                }
            }
        }
        
        if (updated) {
            await savePlayerData(playerData);
        }
        
        return true;
    } catch (error) {
        console.error('Error initializing attack availability:', error);
        return false;
    }
}

/**
 * Get attack queue for a specific round
 * @param {string} guildId - Discord guild ID
 * @param {number} round - Round number
 * @returns {Promise<Array>} Array of attack records
 */
async function getAttackQueue(guildId, round) {
    try {
        const safariData = await loadSafariContent();
        const attackQueue = safariData[guildId]?.attackQueue || {};
        return attackQueue[`round${round}`] || [];
    } catch (error) {
        console.error('Error getting attack queue:', error);
        return [];
    }
}

/**
 * Add attack to queue
 * @param {string} guildId - Discord guild ID
 * @param {Object} attackRecord - Attack record object
 * @returns {Promise<boolean>} Success status
 */
async function addAttackToQueue(guildId, attackRecord) {
    try {
        const safariData = await loadSafariContent();
        
        // Ensure structure exists
        if (!safariData[guildId]) safariData[guildId] = {};
        if (!safariData[guildId].attackQueue) safariData[guildId].attackQueue = {};
        
        const round = safariData[guildId].safariConfig?.currentRound || 1;
        const roundKey = `round${round}`;
        
        if (!safariData[guildId].attackQueue[roundKey]) {
            safariData[guildId].attackQueue[roundKey] = [];
        }
        
        // Add attack record
        safariData[guildId].attackQueue[roundKey].push({
            ...attackRecord,
            timestamp: Date.now(),
            round: round
        });
        
        await saveSafariContent(safariData);
        console.log(`⚔️ DEBUG: Added attack to queue for round ${round}:`, attackRecord);
        
        // Log attack to Safari Log
        try {
            const { logAttack } = await import('./safariLogger.js');
            const playerData = await loadPlayerData();
            const attackerName = playerData[guildId]?.players?.[attackRecord.attackingPlayer]?.displayName || 
                               playerData[guildId]?.players?.[attackRecord.attackingPlayer]?.username || 
                               'Unknown Attacker';
            const defenderName = playerData[guildId]?.players?.[attackRecord.defendingPlayer]?.displayName || 
                                playerData[guildId]?.players?.[attackRecord.defendingPlayer]?.username || 
                                'Unknown Defender';
            
            // Get attacker's current location
            const attackerLocation = playerData[guildId]?.players?.[attackRecord.attackingPlayer]?.safari?.currentLocation || 
                                    playerData[guildId]?.players?.[attackRecord.attackingPlayer]?.safari?.currentCoordinate || 
                                    'Unknown Location';
            
            await logAttack({
                guildId,
                attackerId: attackRecord.attackingPlayer,
                attackerName,
                targetId: attackRecord.defendingPlayer,  // Changed from defenderId to targetId
                targetName: defenderName,  // Changed from defenderName to targetName
                location: attackerLocation,  // Added location field
                result: `Scheduled ${attackRecord.attacksPlanned}x ${attackRecord.itemName} for ${attackRecord.totalDamage} damage in Round ${round}`,
                channelName: null  // Will be determined by logger
            });
        } catch (logError) {
            console.error('Failed to log attack:', logError);
            // Don't fail the attack if logging fails
        }
        
        return true;
    } catch (error) {
        console.error('Error adding attack to queue:', error);
        return false;
    }
}

/**
 * Get attacks planned by a player for a specific item
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {string} itemId - Item ID
 * @returns {Promise<Array>} Array of planned attacks
 */
async function getPlannedAttacks(guildId, userId, itemId) {
    try {
        const safariData = await loadSafariContent();
        const round = safariData[guildId]?.safariConfig?.currentRound || 1;
        const attacks = await getAttackQueue(guildId, round);
        
        return attacks.filter(attack => 
            attack.attackingPlayer === userId && 
            attack.itemId === itemId
        );
    } catch (error) {
        console.error('Error getting planned attacks:', error);
        return [];
    }
}

/**
 * Calculate total attacks planned for an item
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {string} itemId - Item ID
 * @returns {Promise<number>} Total attacks planned
 */
async function calculateAttacksPlanned(guildId, userId, itemId) {
    try {
        const plannedAttacks = await getPlannedAttacks(guildId, userId, itemId);
        return plannedAttacks.reduce((total, attack) => total + (attack.attacksPlanned || 0), 0);
    } catch (error) {
        console.error('Error calculating attacks planned:', error);
        return 0;
    }
}

/**
 * Update player's available attacks after scheduling
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {string} itemId - Item ID
 * @param {number} attacksUsed - Number of attacks to reduce
 * @returns {Promise<boolean>} Success status
 */
async function updateAttackAvailability(guildId, userId, itemId, attacksUsed) {
    try {
        const playerData = await loadPlayerData();
        const inventory = playerData[guildId]?.players?.[userId]?.safari?.inventory;
        
        if (!inventory || !inventory[itemId]) {
            console.error(`Item ${itemId} not found in player inventory`);
            return false;
        }
        
        const itemData = inventory[itemId];
        
        // Ensure object format
        if (typeof itemData === 'number') {
            inventory[itemId] = {
                quantity: itemData,
                numAttacksAvailable: itemData
            };
        }
        
        // Update available attacks
        inventory[itemId].numAttacksAvailable = Math.max(0, (inventory[itemId].numAttacksAvailable || 0) - attacksUsed);
        
        await savePlayerData(playerData);
        console.log(`⚔️ DEBUG: Updated attacks available for ${itemId}: ${inventory[itemId].numAttacksAvailable} remaining`);
        
        return true;
    } catch (error) {
        console.error('Error updating attack availability:', error);
        return false;
    }
}

/**
 * Clear attack queue for a round or all rounds
 * @param {string} guildId - Discord guild ID
 * @param {number} round - Round number (optional, clears all if not specified)
 * @returns {Promise<boolean>} Success status
 */
async function clearAttackQueue(guildId, round = null) {
    try {
        const safariData = await loadSafariContent();
        
        if (!safariData[guildId]?.attackQueue) return true;
        
        if (round !== null) {
            // Clear specific round
            delete safariData[guildId].attackQueue[`round${round}`];
            console.log(`🗑️ DEBUG: Cleared attack queue for round ${round}`);
        } else {
            // Clear all rounds
            safariData[guildId].attackQueue = {};
            console.log(`🗑️ DEBUG: Cleared all attack queues`);
        }
        
        await saveSafariContent(safariData);
        return true;
    } catch (error) {
        console.error('Error clearing attack queue:', error);
        return false;
    }
}

/**
 * Create or update attack planning interface with state
 * @param {string} guildId - Discord guild ID
 * @param {string} attackerId - Attacking player ID
 * @param {string} itemId - Item ID
 * @param {string} targetId - Selected target ID (optional)
 * @param {number} selectedQuantity - Selected attack quantity (optional)
 * @param {Object} client - Discord client
 * @returns {Promise<Object>} Discord interaction response
 */
async function createOrUpdateAttackUI(guildId, attackerId, itemId, targetId = null, selectedQuantity = 0, client) {
    try {
        // Clear player name cache at start of new attack operation for fresh lookups
        clearPlayerNameCache();
        
        console.log(`⚔️ DEBUG: Creating/updating attack UI - Target: ${targetId}, Quantity: ${selectedQuantity}`);
        
        const safariData = await loadSafariContent();
        const playerData = await loadPlayerData();
        const customTerms = await getCustomTerms(guildId);
        
        // Get item details
        const item = safariData[guildId]?.items?.[itemId];
        if (!item) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Item not found.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Get attacker's inventory
        const attackerInventory = playerData[guildId]?.players?.[attackerId]?.safari?.inventory;
        const itemData = attackerInventory?.[itemId];
        
        if (!itemData) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ You do not own this item.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Get available attacks
        let numAttacksAvailable;
        if (typeof itemData === 'number') {
            numAttacksAvailable = itemData;
        } else {
            numAttacksAvailable = itemData.numAttacksAvailable || 0;
        }
        
        // Check if player has any attacks available
        if (numAttacksAvailable <= 0) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ You have no attacks available for this item. Attacks will be available again after the next round results.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Get eligible players (excluding attacker)
        const eligiblePlayers = await getEligiblePlayersFixed(guildId, client);
        const targetPlayers = eligiblePlayers.filter(p => p.userId !== attackerId);
        
        if (targetPlayers.length === 0) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ No eligible players to attack.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Calculate attacks planned using simple math
        let totalQuantity;
        if (typeof itemData === 'number') {
            totalQuantity = itemData;
        } else {
            totalQuantity = itemData.quantity || 0;
        }
        const attacksPlanned = totalQuantity - numAttacksAvailable;
        
        // Get target name if targetId provided
        let targetName = '*Select a player above*';
        if (targetId) {
            try {
                const guild = client?.guilds?.cache?.get(guildId);
                const targetMember = await guild?.members?.fetch(targetId);
                targetName = targetMember?.displayName || targetMember?.user?.username || `Player ${targetId.slice(-4)}`;
            } catch (e) {
                // Fallback
                const targetPlayer = playerData[guildId]?.players?.[targetId];
                targetName = targetPlayer?.globalName || targetPlayer?.displayName || targetPlayer?.username || `Player ${targetId.slice(-4)}`;
            }
        }
        
        // Calculate damage
        const totalDamage = selectedQuantity * (item.attackValue || 0);
        
        // Simplified - we'll show attacks planned in the info section based on simple math
        let attacksPlannedText = '';
        
        const components = [];
        
        // Header
        components.push({
            type: 10, // Text Display
            content: `## ⚔️ Attack Player with ${item.name}\n\nSelect a player to attack. They will be attacked when round results are announced.`
        });
        
        // Only show target selection if no target selected yet
        if (!targetId) {
            // Get eligible players for string select
            const eligibleTargets = await getEligiblePlayersFixed(guildId, attackerId);
            console.log(`🎯 DEBUG: Found ${eligibleTargets.length} eligible players for attack target selection`);
            console.log(`🎯 DEBUG: eligibleTargets:`, eligibleTargets.map(p => ({ userId: p.userId, playerName: p.playerName, currency: p.currency })));
            
            // Create string select with eligible players only
            const playerOptions = eligibleTargets.map(player => {
                console.log(`🎯 DEBUG: Processing player option:`, { userId: player.userId, playerName: player.playerName, currency: player.currency });
                return {
                    label: player.playerName || 'Unknown Player',
                    value: player.userId,
                    description: `${player.currency || 0} ${customTerms.currencyName || 'currency'}${player.inventory && Object.keys(player.inventory).length > 0 ? ' + items' : ''}`,
                    default: false
                };
            });
            console.log(`🎯 DEBUG: Created ${playerOptions.length} player options for string select`);
            
            // Use pipe separator to avoid underscore parsing issues
            const playerSelectRow = {
                type: 1, // Action Row
                components: [
                    {
                        type: 3, // String Select
                        custom_id: `safari_attack_target|${itemId}|${selectedQuantity}`,
                        placeholder: 'Select a player to attack',
                        min_values: 1,
                        max_values: 1,
                        options: playerOptions.length > 0 ? playerOptions : [{
                            label: 'No eligible players found',
                            value: 'none',
                            description: 'All players have 0 currency and no items'
                        }]
                    }
                ]
            };
            components.push(playerSelectRow);
        } else {
            // Target selected - show selected target info
            components.push({
                type: 10, // Text Display
                content: `**🎯 Selected Target:** ${targetName}`
            });
        }
        
        // Only show quantity selection and schedule button if target is selected
        if (targetId) {
            // Divider
            components.push({ type: 14 }); // Separator
            
            // Attack info display
            const infoContent = `**Number of available attacks:** ${numAttacksAvailable}\n**Attacks planned this round:** ${attacksPlanned}\n**Damage per attack:** ${item.attackValue}\n**Total attack damage this round:** ${totalDamage}${attacksPlannedText}`;
            
            components.push({
                type: 10, // Text Display
                content: infoContent
            });
            
            // Divider
            components.push({ type: 14 }); // Separator
            
            // String select for attack quantity
            const attackOptions = [];
            
            if (numAttacksAvailable <= 0) {
                // No attacks available
                attackOptions.push({
                    label: 'No more attacks available',
                    value: '0',
                    description: 'You have used all available attacks',
                    default: true
                });
            } else {
                // Create options up to available attacks (max 25)
                const maxOptions = Math.min(numAttacksAvailable, 25);
                for (let i = 1; i <= maxOptions; i++) {
                    const description = i === 25 && numAttacksAvailable > 25 
                        ? 'Max 25 attacks per turn allowed' 
                        : `Attack ${targetName} with ${i} ${item.name}`;
                        
                    attackOptions.push({
                        label: `${i} Attack${i > 1 ? 's' : ''}`,
                        value: i.toString(),
                        description: description,
                        emoji: { name: '⚔️' },
                        default: i === selectedQuantity
                    });
                }
            }
            
            const attackSelectRow = {
                type: 1, // Action Row
                components: [
                    {
                        type: 3, // String Select
                        custom_id: `safari_attack_quantity|${itemId}|${targetId}`,
                        placeholder: selectedQuantity > 0 ? `Selected: ${selectedQuantity} attacks` : `Select number of ${item.name} attacks`,
                        options: attackOptions,
                        disabled: numAttacksAvailable <= 0
                    }
                ]
            };
            components.push(attackSelectRow);
            
            // Schedule Attack button with state
            const buttonRow = {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        custom_id: `safari_schedule_attack_${itemId}_${targetId}_${selectedQuantity}`,
                        label: '⚔️ Schedule Attack',
                        style: 3, // Success (green)
                        disabled: numAttacksAvailable <= 0 || selectedQuantity === 0
                    }
                ]
            };
            components.push(buttonRow);
        }
        
        // Divider
        components.push({ type: 14 }); // Separator
        
        // Back button
        const backRow = {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button
                    custom_id: 'safari_player_inventory',
                    label: `← ${customTerms.inventoryName}`,
                    style: 2 // Secondary (grey)
                }
            ]
        };
        components.push(backRow);
        
        // Create container
        const container = {
            type: 17, // Container
            accent_color: 0xed4245, // Red accent for attack
            components: components
        };
        
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // Components V2 + Ephemeral
                components: [container]
            }
        };
        
    } catch (error) {
        console.error('Error creating/updating attack UI:', error);
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error creating attack interface.',
                flags: InteractionResponseFlags.EPHEMERAL
            }
        };
    }
}

/**
 * Update attack display with selected target/quantity (simplified wrapper)
 * @param {string} guildId - Discord guild ID
 * @param {string} attackerId - Attacking player ID
 * @param {string} itemId - Item ID
 * @param {string} targetId - Target player ID (optional)
 * @param {number} quantity - Attack quantity (optional)
 * @param {Object} client - Discord client
 * @returns {Promise<Object>} Discord interaction response
 */
async function updateAttackDisplay(guildId, attackerId, itemId, targetId, quantity, client) {
    // Use the new unified function
    return createOrUpdateAttackUI(guildId, attackerId, itemId, targetId, quantity, client);
}

/**
 * Schedule an attack
 * @param {string} guildId - Discord guild ID
 * @param {string} attackerId - Attacking player ID
 * @param {string} itemId - Item ID
 * @param {Object} reqBody - Request body with interaction data
 * @param {Object} client - Discord client
 * @returns {Promise<Object>} Discord interaction response
 */
async function scheduleAttack(guildId, attackerId, itemId, reqBody, client) {
    try {
        console.log(`⚔️ DEBUG: Processing attack schedule for ${attackerId} with ${itemId}`);
        
        // Parse state from custom_id
        const customId = reqBody.data.custom_id;
        const parts = customId.split('_');
        // Format: safari_schedule_attack_itemId_targetId_quantity
        // Handle itemIds with underscores (e.g., raider_499497)
        const targetId = parts[5] !== 'none' ? parts[5] : null;
        const quantity = parseInt(parts[6]) || 0;
        
        console.log(`⚔️ DEBUG: Parsed state - Target: ${targetId}, Quantity: ${quantity}`);
        
        if (!targetId || quantity === 0) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '⚠️ Please select both a target and quantity before scheduling.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        const safariData = await loadSafariContent();
        const playerData = await loadPlayerData();
        
        // Get item details
        const item = safariData[guildId]?.items?.[itemId];
        if (!item) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Item not found.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Check player inventory and validate attack availability
        const attackerInventory = playerData[guildId]?.players?.[attackerId]?.safari?.inventory;
        if (!attackerInventory || !attackerInventory[itemId]) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ You do not have this item in your inventory.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        const inventoryItem = attackerInventory[itemId];
        const numAttacksAvailable = inventoryItem.numAttacksAvailable || 0;
        
        console.log(`⚔️ DEBUG: Attack validation - Item: ${itemId}, Available: ${numAttacksAvailable}, Requested: ${quantity}`);
        
        if (numAttacksAvailable < quantity) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ Not enough attacks available. You have ${numAttacksAvailable} attacks available but requested ${quantity}.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Get attacker name
        let attackerName = `Player ${attackerId.slice(-4)}`;
        try {
            const guild = client?.guilds?.cache?.get(guildId);
            const attackerMember = await guild?.members?.fetch(attackerId);
            attackerName = attackerMember?.displayName || attackerMember?.user?.username || attackerName;
        } catch (e) {
            // Use fallback
        }
        
        // Get current round for attack scheduling
        const currentRound = safariData[guildId]?.safariConfig?.currentRound || 1;
        
        // Create attack record
        const attackRecord = {
            attackingPlayer: attackerId,
            attackingPlayerName: attackerName,
            defendingPlayer: targetId,
            itemId: itemId,
            itemName: item.name,
            attacksPlanned: quantity,
            attackValue: item.attackValue || 0,
            totalDamage: quantity * (item.attackValue || 0),
            timestamp: Date.now(),
            round: currentRound
        };
        
        // Add to queue
        const success = await addAttackToQueue(guildId, attackRecord);
        if (!success) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Failed to schedule attack. Please try again.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Reload player data to avoid race conditions
        const freshPlayerData = await loadPlayerData();
        const freshInventoryItem = freshPlayerData[guildId]?.players?.[attackerId]?.safari?.inventory?.[itemId];
        
        if (!freshInventoryItem) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Item no longer in inventory.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Final validation with fresh data
        if (freshInventoryItem.numAttacksAvailable < quantity) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ Not enough attacks available. You have ${freshInventoryItem.numAttacksAvailable} attacks available.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Reduce attack availability in player inventory
        console.log(`⚔️ DEBUG: Reducing attack availability - Before: ${freshInventoryItem.numAttacksAvailable}, Reducing: ${quantity}`);
        freshInventoryItem.numAttacksAvailable -= quantity;
        console.log(`⚔️ DEBUG: After reduction: ${freshInventoryItem.numAttacksAvailable}`);
        
        // Save updated player data
        await savePlayerData(freshPlayerData);
        console.log(`✅ DEBUG: Player data saved with reduced attack availability`);
        
        // Get custom terms for inventory name
        const customTerms = await getCustomTerms(guildId);
        
        // Get defender name for display
        let defenderName = 'Unknown Player';
        try {
            const guild = client?.guilds?.cache?.get(guildId);
            const defenderMember = await guild?.members?.fetch(targetId);
            defenderName = defenderMember?.displayName || defenderMember?.user?.username || defenderName;
        } catch (e) {
            // Use fallback
            defenderName = `Player ${targetId.slice(-4)}`;
        }
        
        // Calculate total damage
        const totalDamage = quantity * (item.attackValue || 0);
        
        // Create enhanced response with Container
        const response = {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                flags: (1 << 15), // IS_COMPONENTS_V2
                components: [
                    {
                        type: 17, // Container
                        accent_color: 0xed4245, // Red accent for attack
                        components: [
                            {
                                type: 10, // Text Display
                                content: `# Attack Scheduled`
                            },
                            {
                                type: 10, // Text Display
                                content: `${quantity} ${item.name}${quantity > 1 ? 's' : ''} will attack **${defenderName}** for **${totalDamage} damage** when the round results are announced.`
                            },
                            {
                                type: 14 // Separator
                            },
                            {
                                type: 1, // Action Row (inside Container)
                                components: [
                                    {
                                        type: 2, // Button
                                        custom_id: 'safari_player_inventory',
                                        label: `← ${customTerms.inventoryName}`,
                                        style: 1 // Primary (blue)
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        };
        
        console.log(`🚀 DEBUG: About to return response:`, JSON.stringify(response, null, 2));
        
        // Return enhanced response message
        return response;
        
    } catch (error) {
        console.error('Error scheduling attack:', error);
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error scheduling attack.',
                flags: InteractionResponseFlags.EPHEMERAL
            }
        };
    }
}

/**
 * Create attack planning interface
 * @param {string} guildId - Discord guild ID
 * @param {string} attackerId - Attacking player ID
 * @param {string} itemId - Item ID to attack with
 * @param {Object} client - Discord client
 * @returns {Promise<Object>} Discord interaction response
 */
async function createAttackPlanningUI(guildId, attackerId, itemId, client) {
    // Use the unified function with no target/quantity selected
    return createOrUpdateAttackUI(guildId, attackerId, itemId, null, 0, client);
}

/**
 * Universal Inventory Object Format Functions
 * Handles both legacy number format and new object format consistently
 */

/**
 * Get item quantity from inventory item (handles both formats)
 * @param {number|Object} inventoryItem - Can be number (legacy) or {quantity, numAttacksAvailable} (object)
 * @returns {number} Quantity of items
 */
function getItemQuantity(inventoryItem) {
    if (typeof inventoryItem === 'object' && inventoryItem !== null) {
        return inventoryItem.quantity || 0;
    }
    return inventoryItem || 0;
}

/**
 * Set item quantity in inventory (always creates object format)
 * @param {Object} inventory - Player's inventory object
 * @param {string} itemId - Item ID to set
 * @param {number} quantity - Quantity to set
 * @param {number} numAttacksAvailable - Attack availability (0 for non-attack items)
 */
function setItemQuantity(inventory, itemId, quantity, numAttacksAvailable = 0) {
    inventory[itemId] = {
        quantity: Math.max(0, quantity),
        numAttacksAvailable: Math.max(0, numAttacksAvailable)
    };
}

/**
 * Get attack availability from inventory item (handles both formats)
 * @param {number|Object} inventoryItem - Can be number (legacy) or {quantity, numAttacksAvailable} (object)
 * @returns {number} Number of attacks available
 */
function getItemAttackAvailability(inventoryItem) {
    if (typeof inventoryItem === 'object' && inventoryItem !== null) {
        return inventoryItem.numAttacksAvailable || 0;
    }
    return 0; // Legacy format has no attack tracking
}

/**
 * Migrate all player inventories to object format
 * @param {string} guildId - Guild to migrate (optional, migrates all if not provided)
 * @returns {Object} Migration results
 */
async function migrateInventoryToObjectFormat(guildId = null) {
    console.log('🔄 Starting inventory migration to object format...');
    
    try {
        // Create backup
        const playerData = await loadPlayerData();
        const backupFile = `playerData.backup.${Date.now()}.json`;
        await fs.writeFile(backupFile, JSON.stringify(playerData, null, 2));
        console.log(`📦 Backup created: ${backupFile}`);
        
        let migratedItems = 0;
        let migratedPlayers = 0;
        const guildsToProcess = guildId ? [guildId] : Object.keys(playerData);
        
        for (const currentGuildId of guildsToProcess) {
            if (currentGuildId === 'environmentConfig' || !playerData[currentGuildId]?.players) continue;
            
            console.log(`🔍 Processing guild: ${currentGuildId}`);
            
            for (const [userId, userData] of Object.entries(playerData[currentGuildId].players)) {
                if (!userData.safari?.inventory) continue;
                
                const inventory = userData.safari.inventory;
                let playerMigrated = false;
                
                for (const [itemId, itemData] of Object.entries(inventory)) {
                    if (typeof itemData === 'number') {
                        // Migrate legacy number format to object format
                        inventory[itemId] = {
                            quantity: itemData,
                            numAttacksAvailable: 0 // Will be updated for attack items
                        };
                        migratedItems++;
                        playerMigrated = true;
                        
                        console.log(`✅ Migrated ${itemId}: ${itemData} → {quantity: ${itemData}, numAttacksAvailable: 0}`);
                    }
                }
                
                if (playerMigrated) {
                    migratedPlayers++;
                }
            }
        }
        
        // Save migrated data
        await savePlayerData(playerData);
        
        console.log(`🎉 Migration complete!`);
        console.log(`📊 Results: ${migratedItems} items migrated across ${migratedPlayers} players`);
        
        return {
            success: true,
            backupFile,
            migratedItems,
            migratedPlayers,
            guildsProcessed: guildsToProcess.length
        };
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Attack Resolution System
 * Core functions for processing attacks during round results
 */

/**
 * Calculate total defense value for a player's inventory
 * @param {Object} playerInventory - Player's inventory object
 * @param {Object} items - Item definitions from safariContent.json
 * @returns {number} Total defense value
 */
function calculatePlayerDefense(playerInventory, items) {
    let totalDefense = 0;
    
    for (const [itemId, itemData] of Object.entries(playerInventory)) {
        const item = items[itemId];
        if (!item?.defenseValue) continue;
        
        const quantity = getItemQuantity(itemData);
        totalDefense += (item.defenseValue * quantity);
    }
    
    return totalDefense;
}

/**
 * Process attack queue for a specific round
 * @param {string} guildId - Guild ID
 * @param {number} currentRound - Round to process
 * @param {Object} playerData - Player data object
 * @param {Object} items - Item definitions
 * @param {Object} client - Discord client for player names
 * @returns {Promise<Object>} Attack results and queue data
 */
async function processAttackQueue(guildId, currentRound, playerData, items, client = null) {
    console.log(`⚔️ DEBUG: Processing attack queue for round ${currentRound}`);
    
    try {
        const safariData = await loadSafariContent();
        const attackQueue = safariData[guildId]?.attackQueue?.[`round${currentRound}`] || [];
        
        console.log(`⚔️ DEBUG: Found ${attackQueue.length} attacks to process`);
        
        if (attackQueue.length === 0) {
            return { attackResults: [], attackQueue: [], attacksByDefender: {} };
        }
        
        // Group attacks by defending player (with validation)
        const attacksByDefender = {};
        for (const attack of attackQueue) {
            // Validate attack data to prevent processing corrupted attacks
            if (!attack.defendingPlayer || !attack.attackingPlayer || !attack.itemId) {
                console.log(`⚠️ DEBUG: Skipping invalid attack - missing required fields:`, attack);
                continue;
            }
            
            // Validate attacksPlanned is a reasonable number (not a user ID)
            if (!attack.attacksPlanned || attack.attacksPlanned > 1000 || attack.attacksPlanned < 0) {
                console.log(`⚠️ DEBUG: Skipping attack with invalid attacksPlanned: ${attack.attacksPlanned} (likely a user ID bug)`);
                continue;
            }
            
            // Validate totalDamage is a number
            if (isNaN(attack.totalDamage) || attack.totalDamage === null || attack.totalDamage === undefined) {
                console.log(`⚠️ DEBUG: Skipping attack with invalid totalDamage: ${attack.totalDamage}`);
                continue;
            }
            
            if (!attacksByDefender[attack.defendingPlayer]) {
                attacksByDefender[attack.defendingPlayer] = [];
            }
            attacksByDefender[attack.defendingPlayer].push(attack);
        }
        
        console.log(`⚔️ DEBUG: Attacks grouped by ${Object.keys(attacksByDefender).length} defenders`);
        
        // Process each defended player
        const attackResults = [];
        
        for (const [defenderId, attacks] of Object.entries(attacksByDefender)) {
            const defender = playerData[guildId]?.players?.[defenderId];
            if (!defender?.safari) {
                console.log(`⚠️ DEBUG: Defender ${defenderId} has no safari data, skipping`);
                continue;
            }
            
            // Calculate total attack damage
            const totalAttackDamage = attacks.reduce((sum, attack) => sum + attack.totalDamage, 0);
            
            // Calculate defender's total defense
            const totalDefense = calculatePlayerDefense(defender.safari.inventory || {}, items);
            
            // Calculate net damage (attack - defense, minimum 0)
            const netDamage = Math.max(0, totalAttackDamage - totalDefense);
            
            // Store original currency before damage
            const originalCurrency = defender.safari.currency || 0;
            
            // Apply damage to defender's currency (minimum 0)
            defender.safari.currency = Math.max(0, originalCurrency - netDamage);
            
            console.log(`⚔️ DEBUG: ${defenderId} - ${totalAttackDamage} attack - ${totalDefense} defense = ${netDamage} net damage`);
            console.log(`💰 DEBUG: ${defenderId} currency: ${originalCurrency} → ${defender.safari.currency}`);
            
            // Get defender name for display
            let defenderName = `Player ${defenderId.slice(-4)}`;
            try {
                if (client) {
                    const guild = client.guilds.cache.get(guildId);
                    const defenderMember = await guild?.members?.fetch(defenderId);
                    defenderName = defenderMember?.displayName || defenderMember?.user?.username || defenderName;
                }
            } catch (e) {
                // Use fallback name
            }
            
            attackResults.push({
                defenderId,
                defenderName,
                totalAttackDamage,
                totalDefense,
                damageDealt: netDamage, // Fix structure mismatch - display expects 'damageDealt'
                originalCurrency,
                newCurrency: defender.safari.currency,
                attackCount: attacks.length,
                attackers: attacks.map(a => ({ 
                    name: a.attackingPlayerName, 
                    damage: a.totalDamage,
                    itemName: a.itemName,
                    quantity: a.attacksPlanned
                }))
            });
        }
        
        return { attackResults, attackQueue, attacksByDefender };
        
    } catch (error) {
        console.error('Error processing attack queue:', error);
        return { attackResults: [], attackQueue: [], attacksByDefender: {} };
    }
}

/**
 * Consume attack items after attacks are resolved
 * @param {Array} attackQueue - Array of attack records
 * @param {Object} playerData - Player data object
 * @param {string} guildId - Guild ID
 * @param {Object} items - Item definitions
 * @returns {Promise<Array>} Consumption results
 */
async function consumeAttackItems(attackQueue, playerData, guildId, items) {
    console.log(`🗂️ DEBUG: Processing attack item consumption for ${attackQueue.length} attacks`);
    
    const consumptionResults = [];
    
    for (const attack of attackQueue) {
        // Validate attack data before processing consumption
        if (!attack.attackingPlayer || !attack.itemId || !attack.attacksPlanned) {
            console.log(`⚠️ DEBUG: Skipping consumption for invalid attack:`, attack);
            continue;
        }
        
        // Validate attacksPlanned is a reasonable number (not a user ID)
        if (attack.attacksPlanned > 1000 || attack.attacksPlanned < 0) {
            console.log(`⚠️ DEBUG: Skipping consumption with invalid attacksPlanned: ${attack.attacksPlanned} (likely a user ID bug)`);
            continue;
        }
        
        const attacker = playerData[guildId]?.players?.[attack.attackingPlayer];
        if (!attacker?.safari?.inventory) {
            console.log(`⚠️ DEBUG: Attacker ${attack.attackingPlayer} has no inventory, skipping consumption`);
            continue;
        }
        
        const item = items[attack.itemId];
        if (item?.consumable !== "Yes") {
            console.log(`ℹ️ DEBUG: Item ${attack.itemName} is not consumable, skipping`);
            continue; // Only consume consumable items
        }
        
        const attackerInventory = attacker.safari.inventory;
        const inventoryItem = attackerInventory[attack.itemId];
        
        if (!inventoryItem) {
            console.error(`⚠️ DEBUG: Attack item ${attack.itemId} not found in attacker ${attack.attackingPlayer} inventory`);
            continue;
        }
        
        const originalQuantity = getItemQuantity(inventoryItem);
        const newQuantity = Math.max(0, originalQuantity - attack.attacksPlanned);
        
        // Update quantity using universal setter
        setItemQuantity(
            attackerInventory,
            attack.itemId,
            newQuantity,
            getItemAttackAvailability(inventoryItem) // Preserve existing attack availability
        );
        
        console.log(`🗂️ DEBUG: Consumed ${attack.attacksPlanned}x ${attack.itemName} from ${attack.attackingPlayerName} (${originalQuantity} → ${newQuantity})`);
        
        consumptionResults.push({
            attackerId: attack.attackingPlayer,
            playerName: attack.attackingPlayerName, // Fix structure mismatch - display expects 'playerName' 
            itemName: attack.itemName,
            quantityConsumed: attack.attacksPlanned, // Fix structure mismatch - display expects 'quantityConsumed'
            originalQuantity,
            newQuantity
        });
    }
    
    return consumptionResults;
}

/**
 * Clear processed attack queue for a round
 * @param {string} guildId - Guild ID
 * @param {number} currentRound - Round to clear
 * @returns {Promise<boolean>} Success status
 */
async function clearProcessedAttackQueue(guildId, currentRound) {
    try {
        const safariData = await loadSafariContent();
        if (safariData[guildId]?.attackQueue?.[`round${currentRound}`]) {
            console.log(`🗑️ DEBUG: Clearing attack queue for round ${currentRound}`);
            delete safariData[guildId].attackQueue[`round${currentRound}`];
            await saveSafariContent(safariData);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error clearing attack queue:', error);
        return false;
    }
}

/**
 * Clear ALL attack queue data (admin cleanup function)
 * @param {string} guildId - The guild ID
 */
async function clearAllAttackQueues(guildId) {
    try {
        console.log(`🧹 DEBUG: Clearing ALL attack queues for guild ${guildId}`);
        const safariData = await loadSafariContent();
        
        if (safariData[guildId]?.attackQueue) {
            const queueCount = Object.keys(safariData[guildId].attackQueue).length;
            console.log(`🧹 DEBUG: Found ${queueCount} attack queues to clear`);
            
            // Clear the entire attack queue object
            safariData[guildId].attackQueue = {};
        }
        
        await saveSafariContent(safariData);
        console.log(`✅ All attack queues cleared successfully`);
        return true;
    } catch (error) {
        console.error('Error clearing all attack queues:', error);
        return false;
    }
}

/**
 * Clear corrupted attack queue entries (admin cleanup function)
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} Cleanup summary with counts
 */
async function clearCorruptedAttacks(guildId) {
    try {
        console.log(`🔧 DEBUG: Scanning for corrupted attacks in guild ${guildId}`);
        const safariData = await loadSafariContent();
        
        if (!safariData[guildId]?.attackQueue) {
            return { totalAttacks: 0, corruptedRemoved: 0, validRemaining: 0 };
        }
        
        let totalAttacks = 0;
        let corruptedRemoved = 0;
        let validRemaining = 0;
        
        // Process each round's attack queue
        for (const [roundKey, attacks] of Object.entries(safariData[guildId].attackQueue)) {
            if (!Array.isArray(attacks)) continue;
            
            const validAttacks = [];
            
            for (const attack of attacks) {
                totalAttacks++;
                
                // Check for corruption indicators
                const isCorrupted = (
                    !attack.defendingPlayer || 
                    !attack.attackingPlayer || 
                    !attack.itemId ||
                    !attack.attacksPlanned || 
                    attack.attacksPlanned > 1000 || 
                    attack.attacksPlanned < 0 ||
                    isNaN(attack.totalDamage) || 
                    attack.totalDamage === null || 
                    attack.totalDamage === undefined
                );
                
                if (isCorrupted) {
                    console.log(`🗑️ DEBUG: Removing corrupted attack:`, attack);
                    corruptedRemoved++;
                } else {
                    validAttacks.push(attack);
                    validRemaining++;
                }
            }
            
            // Update the round with only valid attacks
            safariData[guildId].attackQueue[roundKey] = validAttacks;
        }
        
        await saveSafariContent(safariData);
        
        const summary = { totalAttacks, corruptedRemoved, validRemaining };
        console.log(`✅ Corruption cleanup complete:`, summary);
        return summary;
        
    } catch (error) {
        console.error('Error clearing corrupted attacks:', error);
        throw error;
    }
}

/**
 * Create V2 round results display with player-centric cards
 * @param {string} guildId - Guild ID
 * @param {Object} roundData - Round processing results
 * @param {Object} customTerms - Custom terminology
 * @returns {Object} Discord response object
 */
async function createRoundResultsV2(guildId, roundData, customTerms, token, client, options = {}) {
    try {
        console.log('🎨 DEBUG: Creating V2 round results display with multi-message approach');
        console.log('🎨 DEBUG: Round data:', { 
            currentRound: roundData.currentRound, 
            eligiblePlayersCount: roundData.eligiblePlayers?.length,
            hasBalanceChanges: Object.keys(roundData.playerBalanceChanges || {}).length,
            token: token ? 'present' : 'missing'
        });
        
        const { 
            currentRound,
            totalRounds,
            isGoodEvent, 
            eventName, 
            eventEmoji,
            eligiblePlayers,
            roleGroups,
            attacksByDefender,
            playerBalanceChanges 
        } = roundData;
        
        // Validate required data
        if (!eligiblePlayers || eligiblePlayers.length === 0) {
            console.log('❌ DEBUG: No eligible players found in round data');
            throw new Error('No eligible players in round data');
        }
        
        if (!playerBalanceChanges || Object.keys(playerBalanceChanges).length === 0) {
            console.log('❌ DEBUG: No balance changes found in round data');
            throw new Error('No balance changes in round data');
        }
        
        // Check if this is a scheduled execution or interaction-based
        const isScheduled = options.isScheduled || false;
        const channelId = options.channelId;
        
        // Validate required parameters based on execution type
        if (!isScheduled && !token) {
            throw new Error('Interaction token not provided for non-scheduled execution');
        }
        if (isScheduled && !channelId) {
            throw new Error('Channel ID not provided for scheduled execution');
        }
        
        console.log('🎨 DEBUG: Creating player result cards...');
        
        // Create player result cards with role headers if applicable
        const playerCards = await createPlayerResultCards(
            guildId, 
            eligiblePlayers, 
            roundData, 
            customTerms,
            roleGroups // Pass role groups for header creation
        );
        
        console.log(`🎨 DEBUG: Created ${playerCards.length} player cards (including role headers)`);
        
        // Create header container
        const headerContainer = {
            type: 17, // Container
            accent_color: isGoodEvent ? 0x27ae60 : 0xe74c3c, // Green for good, red for bad
            components: [
                {
                    type: 10, // Text Display
                    content: `# 🎲 Round ${currentRound}${totalRounds ? ` of ${totalRounds}` : ''} Results\n\n## ${eventEmoji} ${eventName}\n\n**${eligiblePlayers.length} players participated** | **Total balance changes calculated below**`
                }
            ]
        };
        
        // Helper function to count components recursively
        function countComponentsRecursively(components) {
            let count = 0;
            for (const component of components) {
                count++; // Count this component
                if (component.components) {
                    count += countComponentsRecursively(component.components);
                }
            }
            return count;
        }
        
        // Helper function to check character limit
        function checkCharacterLimit(components) {
            let totalChars = 0;
            for (const component of components) {
                if (component.content) {
                    totalChars += component.content.length;
                }
                if (component.components) {
                    totalChars += checkCharacterLimit(component.components);
                }
            }
            return totalChars;
        }
        
        // Split player cards into chunks of 8 ACTUAL PLAYERS per message
        // Keep role headers with their associated players
        const PLAYERS_PER_MESSAGE = 8;
        const playerChunks = [];
        let currentChunk = [];
        let playersInCurrentChunk = 0;
        
        // First, group cards into role groups (header + players)
        const groups = [];
        let currentGroup = null;
        
        for (const card of playerCards) {
            const isRoleHeader = card.components?.[0]?.content?.startsWith("> #");
            
            if (isRoleHeader) {
                // Start a new group with this header
                if (currentGroup) {
                    groups.push(currentGroup);
                }
                currentGroup = {
                    header: card,
                    players: []
                };
            } else {
                // This is a player card
                if (currentGroup) {
                    currentGroup.players.push(card);
                } else {
                    // No current group (no role headers), create a standalone player group
                    groups.push({
                        header: null,
                        players: [card]
                    });
                }
            }
        }
        
        // Add the last group if it exists
        if (currentGroup) {
            groups.push(currentGroup);
        }
        
        // Now chunk the groups, keeping headers with their players
        for (const group of groups) {
            const groupPlayerCount = group.players.length;
            
            // Check if adding this group would exceed the limit
            if (playersInCurrentChunk > 0 && playersInCurrentChunk + groupPlayerCount > PLAYERS_PER_MESSAGE) {
                // This group won't fit in current chunk, start a new one
                playerChunks.push(currentChunk);
                currentChunk = [];
                playersInCurrentChunk = 0;
            }
            
            // Add the group header if it exists
            if (group.header) {
                currentChunk.push(group.header);
            }
            
            // Add the group's players
            for (const player of group.players) {
                if (playersInCurrentChunk >= PLAYERS_PER_MESSAGE) {
                    // We've hit the limit mid-group, need to split the group
                    playerChunks.push(currentChunk);
                    currentChunk = [];
                    playersInCurrentChunk = 0;
                    // Note: The remaining players from this group will go into the next chunk
                    // without their header, which is acceptable for very large groups
                }
                currentChunk.push(player);
                playersInCurrentChunk++;
            }
        }
        
        // Add the last chunk if it has any content
        if (currentChunk.length > 0) {
            playerChunks.push(currentChunk);
        }
        
        const totalPlayers = playerCards.filter(card => !card.components?.[0]?.content?.startsWith("> #")).length;
        console.log(`📦 DEBUG: Split ${totalPlayers} players (${playerCards.length} total components) into ${playerChunks.length} messages`);
        
        // Send messages
        const messages = [];
        
        try {
            // First message: Header + first chunk of players
            const firstMessageComponents = [headerContainer];
            if (playerChunks.length > 0) {
                firstMessageComponents.push(...playerChunks[0]);
            }
            
            // Validate component count and character limit
            const firstComponentCount = countComponentsRecursively(firstMessageComponents);
            const firstCharCount = checkCharacterLimit(firstMessageComponents);
            console.log(`📊 DEBUG: First message - ${firstComponentCount} components, ${firstCharCount} characters`);
            
            if (firstComponentCount > 40) {
                throw new Error(`First message exceeds component limit: ${firstComponentCount}/40`);
            }
            if (firstCharCount > 4000) {
                throw new Error(`First message exceeds character limit: ${firstCharCount}/4000`);
            }
            
            // Debug text component showing total character count (commented out for now)
            // const debugContainer = {
            //     type: 17, // Container
            //     components: [
            //         {
            //             type: 10, // Text Display
            //             content: `-# ${firstCharCount}`
            //         }
            //     ]
            // };
            // firstMessageComponents.push(debugContainer);
            
            let firstMessage;
            let webhookUrl; // Store webhook URL for scheduled execution
            
            if (isScheduled) {
                // For scheduled execution, create a webhook to post Components V2
                const channel = await client.channels.fetch(channelId);
                const webhook = await channel.createWebhook({
                    name: 'Safari Round Results',
                    reason: 'Scheduled Safari round results execution'
                });
                webhookUrl = webhook.url;
                console.log(`🌐 DEBUG: Created webhook for scheduled execution`);
                
                // Post via webhook to support Components V2
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        flags: (1 << 15), // IS_COMPONENTS_V2
                        components: firstMessageComponents
                    })
                });
                
                // Check response but don't parse as JSON for scheduled posts
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Webhook post failed: ${errorText}`);
                }
                firstMessage = { id: 'scheduled', success: true };
                console.log(`✅ DEBUG: Posted first message via webhook for scheduled execution`);
                
                // Clean up webhook after a delay
                setTimeout(async () => {
                    try {
                        await webhook.delete('Cleanup after scheduled results');
                        console.log(`🧹 DEBUG: Cleaned up webhook ${webhook.id}`);
                    } catch (err) {
                        console.error(`⚠️ Could not delete webhook:`, err);
                    }
                }, 5000);
            } else {
                // For interaction-based execution, use webhook followup
                firstMessage = await DiscordRequest(`webhooks/${process.env.APP_ID}/${token}`, {
                    method: 'POST',
                    body: {
                        flags: (1 << 15), // IS_COMPONENTS_V2
                        components: firstMessageComponents
                    }
                });
                console.log(`✅ DEBUG: Sent first followup message via webhook`);
            }
            messages.push(firstMessage);
            
            // Send remaining chunks
            for (let i = 1; i < playerChunks.length; i++) {
                const chunk = playerChunks[i];
                const isLastChunk = i === playerChunks.length - 1;
                
                // Validate component count and character limit
                const chunkComponentCount = countComponentsRecursively(chunk);
                const chunkCharCount = checkCharacterLimit(chunk);
                console.log(`📊 DEBUG: Message ${i + 1} - ${chunkComponentCount} components, ${chunkCharCount} characters`);
                
                if (chunkComponentCount > 40) {
                    throw new Error(`Message ${i + 1} exceeds component limit: ${chunkComponentCount}/40`);
                }
                if (chunkCharCount > 4000) {
                    throw new Error(`Message ${i + 1} exceeds character limit: ${chunkCharCount}/4000`);
                }
                
                // Add inventory button to last message if it's the last chunk
                const messageComponents = [...chunk];
                if (isLastChunk) {
                    const buttonContainer = {
                        type: 17, // Container
                        accent_color: 0x3498db, // Blue
                        components: [
                            {
                                type: 1, // Action Row
                                components: [
                                    {
                                        type: 2, // Button
                                        custom_id: 'safari_player_inventory',
                                        label: customTerms.inventoryName,
                                        style: 1, // Primary (blue)
                                        emoji: { name: customTerms.inventoryEmoji || '🧰' }
                                    }
                                ]
                            }
                        ]
                    };
                    
                    // Check if adding button would exceed limits
                    const withButtonCount = countComponentsRecursively([...messageComponents, buttonContainer]);
                    if (withButtonCount <= 40) {
                        messageComponents.push(buttonContainer);
                        console.log(`✅ DEBUG: Added inventory button to last message`);
                    } else {
                        console.log(`⚠️ DEBUG: Skipping inventory button - would exceed component limit`);
                    }
                }
                
                // Debug text component showing total character count (commented out for now)
                // const debugContainer = {
                //     type: 17, // Container
                //     components: [
                //         {
                //             type: 10, // Text Display
                //             content: `-# ${chunkCharCount}`
                //         }
                //     ]
                // };
                // messageComponents.push(debugContainer);
                
                // Send message based on execution type
                let message;
                if (isScheduled) {
                    // For scheduled execution, use the same webhook
                    const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            flags: (1 << 15), // IS_COMPONENTS_V2
                            components: messageComponents
                        })
                    });
                    
                    // Check response but don't parse as JSON for scheduled posts
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Webhook post ${i + 1} failed: ${errorText}`);
                    }
                    message = { id: `scheduled_${i + 1}`, success: true };
                    console.log(`✅ DEBUG: Posted message ${i + 1} via webhook for scheduled execution`);
                } else {
                    // For interaction-based execution, use webhook followup
                    message = await DiscordRequest(`webhooks/${process.env.APP_ID}/${token}`, {
                        method: 'POST',
                        body: {
                            flags: (1 << 15), // IS_COMPONENTS_V2
                            components: messageComponents
                        }
                    });
                    console.log(`✅ DEBUG: Sent followup message ${i + 1} via webhook`);
                }
                messages.push(message);
                console.log(`✅ DEBUG: Message ${i + 1} with ${chunk.length} players${isLastChunk ? ' (last chunk)' : ''}`);
            }
            
            console.log(`🎉 DEBUG: Successfully sent ${messages.length} messages for round results`);
            
            // Return null to indicate we've already handled the response via followups
            // This prevents ButtonHandlerFactory from trying to update the deferred response
            return null;
            
        } catch (sendError) {
            console.error('❌ Error sending round results messages:', sendError);
            
            // Post non-ephemeral error message
            try {
                if (isScheduled) {
                    // For scheduled execution, create a simple webhook for error message
                    const channel = await client.channels.fetch(channelId);
                    const errorWebhook = await channel.createWebhook({
                        name: 'Safari Error',
                        reason: 'Error posting scheduled results'
                    });
                    await fetch(errorWebhook.url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: `❌ **Error Posting Round Results**\n\n${sendError.message}\n\nPlease contact an administrator to resolve this issue.`
                        })
                    });
                    // Clean up error webhook
                    setTimeout(() => errorWebhook.delete().catch(() => {}), 1000);
                } else {
                    // For interaction-based execution, use webhook followup
                    await DiscordRequest(`webhooks/${process.env.APP_ID}/${token}`, {
                        method: 'POST',
                        body: {
                            content: `❌ **Error Posting Round Results**\n\n${sendError.message}\n\nPlease contact an administrator to resolve this issue.`
                        }
                    });
                }
            } catch (errorPostError) {
                console.error('Failed to post error message:', errorPostError);
            }
            
            throw sendError;
        }
        
    } catch (error) {
        console.error('Error creating V2 round results:', error);
        return {
            type: 4,
            data: {
                content: '❌ Error displaying round results.',
                flags: 64 // EPHEMERAL
            }
        };
    }
}

/**
 * Create individual player result cards
 * @param {string} guildId - Guild ID
 * @param {Array} eligiblePlayers - Array of eligible players
 * @param {Object} roundData - Round processing results
 * @param {Object} customTerms - Custom terminology
 * @param {Object|null} roleGroups - Role groups for header creation
 * @returns {Array} Array of player card containers
 */
async function createPlayerResultCards(guildId, eligiblePlayers, roundData, customTerms, roleGroups = null) {
    try {
        const cards = [];
        const { 
            attacksByDefender, 
            playerBalanceChanges, 
            isGoodEvent,
            eventName,
            eventEmoji 
        } = roundData;
        
        // Load item data for income calculations
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        
        // If we have role groups, create cards with role headers
        if (roleGroups && roleGroups.roleGroups) {
            const processedPlayers = new Set();
            
            // Process each role group
            for (const [roleId, roleData] of Object.entries(roleGroups.roleGroups)) {
                // Add role header container
                const roleHeader = {
                    type: 17, // Container
                    accent_color: roleData.color || 0x95a5a6, // Use role color or default grey
                    components: [
                        {
                            type: 10, // Text Display
                            content: `> # <@&${roleId}>\n\`${roleData.players.length} player${roleData.players.length !== 1 ? 's' : ''}\``
                        }
                    ]
                };
                cards.push(roleHeader);
                
                // Add player cards for this role
                for (const player of roleData.players) {
                    const card = await createPlayerResultCard(
                        player, 
                        roundData, 
                        customTerms, 
                        items,
                        attacksByDefender[player.userId] || [],
                        playerBalanceChanges[player.userId] || { starting: 0, ending: 0, change: 0 }
                    );
                    cards.push(card);
                    processedPlayers.add(player.userId);
                }
            }
            
            // Add unassigned players (if any)
            if (roleGroups.unassigned && roleGroups.unassigned.length > 0) {
                // Add header for unassigned players
                const unassignedHeader = {
                    type: 17, // Container
                    accent_color: 0x7f8c8d, // Darker grey for unassigned
                    components: [
                        {
                            type: 10, // Text Display
                            content: `> # Other Players\n\`${roleGroups.unassigned.length} player${roleGroups.unassigned.length !== 1 ? 's' : ''}\``
                        }
                    ]
                };
                cards.push(unassignedHeader);
                
                // Add unassigned player cards
                for (const player of roleGroups.unassigned) {
                    const card = await createPlayerResultCard(
                        player, 
                        roundData, 
                        customTerms, 
                        items,
                        attacksByDefender[player.userId] || [],
                        playerBalanceChanges[player.userId] || { starting: 0, ending: 0, change: 0 }
                    );
                    cards.push(card);
                }
            }
        } else {
            // No role groups - create cards in original order
            for (const player of eligiblePlayers) {
                const card = await createPlayerResultCard(
                    player, 
                    roundData, 
                    customTerms, 
                    items,
                    attacksByDefender[player.userId] || [],
                    playerBalanceChanges[player.userId] || { starting: 0, ending: 0, change: 0 }
                );
                cards.push(card);
            }
        }
        
        return cards;
        
    } catch (error) {
        console.error('Error creating player result cards:', error);
        return [];
    }
}

/**
 * Create individual player result card
 * @param {Object} player - Player data
 * @param {Object} roundData - Round processing results  
 * @param {Object} customTerms - Custom terminology
 * @param {Object} items - Item definitions
 * @param {Array} attacksReceived - Attacks this player received
 * @param {Object} balanceChange - Player's balance change data
 * @returns {Object} Container component for this player
 */
async function createPlayerResultCard(player, roundData, customTerms, items, attacksReceived, balanceChange) {
    try {
        const { isGoodEvent, eventName, eventEmoji } = roundData;
        const currencyEmoji = customTerms.currencyEmoji || '🪙';
        const currencyName = customTerms.currencyName || 'coins';
        
        // Start with player name and emoji
        let content = `## > \`${getPlayerEmoji(player.playerName)} ${player.playerName}\`\n`;
        
        // Section 1: Opening balance
        content += `### \`1. Opening balance start of Round Results\`\n`;
        content += `${currencyEmoji} ${balanceChange.starting} ${currencyName}\n\n`;
        
        // Section 2: Income from round
        const incomeBreakdown = formatIncomeBreakdown(
            player, 
            items, 
            isGoodEvent, 
            eventName, 
            eventEmoji, 
            customTerms
        );
        content += incomeBreakdown + '\n\n';
        
        // Section 3: Combat damage
        const combatResults = formatCombatResults(
            attacksReceived, 
            items, 
            customTerms,
            player.inventory || {}
        );
        content += combatResults + '\n\n';
        
        // Section 4: Closing balance
        content += `### \`4. Closing balance end of Round Results\`\n`;
        content += `${currencyEmoji} ${balanceChange.ending} ${currencyName}`;
        
        // Character count for debugging (commented out for now)
        // const charCount = content.length;
        // content += `\n-# ${charCount}`;
        
        // Create container with accent color based on change
        const change = balanceChange.change;
        const accentColor = change > 0 ? 0x27ae60 : change < 0 ? 0xe74c3c : 0x95a5a6; // Green/Red/Gray
        
        return {
            type: 17, // Container
            accent_color: accentColor,
            components: [
                {
                    type: 10, // Text Display
                    content: content
                }
            ]
        };
        
    } catch (error) {
        console.error('Error creating player result card:', error);
        return {
            type: 17, // Container
            components: [
                {
                    type: 10, // Text Display
                    content: `# ${player.playerName}\n\n❌ Error loading results`
                }
            ]
        };
    }
}

/**
 * Format income breakdown by item type - REVISED ULTRA-COMPACT FORMAT
 * @param {Object} player - Player data
 * @param {Object} items - Item definitions
 * @param {boolean} isGoodEvent - Whether the event was good
 * @param {string} eventName - Name of the event
 * @param {string} eventEmoji - Event emoji
 * @param {Object} customTerms - Custom terminology
 * @returns {string} Formatted income breakdown
 */
function formatIncomeBreakdown(player, items, isGoodEvent, eventName, eventEmoji, customTerms) {
    try {
        const currencyEmoji = customTerms.currencyEmoji || '🪙';
        const currencyName = customTerms.currencyName || 'coins';
        
        let content = `### \`2. Plus: Income from round\`\n`;
        content += `${eventEmoji} ${eventName}\n\n`;
        
        const inventory = player.inventory || {};
        const inventoryItems = Object.entries(inventory);
        
        if (inventoryItems.length === 0) {
            content += `Total: +${currencyEmoji}0 ${currencyName}`;
            return content;
        }
        
        let totalIncome = 0;
        const incomeItems = [];
        
        // Calculate income per item type
        for (const [itemId, itemData] of inventoryItems) {
            const item = items[itemId];
            if (!item) continue;
            
            const quantity = typeof itemData === 'object' ? itemData.quantity : itemData;
            
            // Check if item generates income
            const incomeValue = isGoodEvent ? item.goodOutcomeValue : item.badOutcomeValue;
            if (incomeValue !== null && incomeValue !== undefined) {
                const itemIncome = quantity * incomeValue;
                totalIncome += itemIncome;
                
                incomeItems.push({
                    emoji: item.emoji || '📦',
                    quantity: quantity,
                    unitValue: incomeValue,
                    totalValue: itemIncome
                });
            }
        }
        
        if (incomeItems.length === 0) {
            content += `Total: +${currencyEmoji}0 ${currencyName}`;
        } else {
            // Format each income item: emoji quantityxvalue: +currencyEmojiTotal
            for (const item of incomeItems) {
                const sign = item.totalValue >= 0 ? '+' : '';
                content += `${item.emoji} ${item.quantity}x${item.unitValue}: ${sign}${currencyEmoji}${Math.abs(item.totalValue)} ${currencyName}\n`;
            }
            const totalSign = totalIncome >= 0 ? '+' : '';
            content += `\nTotal: ${totalSign}${currencyEmoji}${Math.abs(totalIncome)} ${currencyName}`;
        }
        
        return content;
        
    } catch (error) {
        console.error('Error formatting income breakdown:', error);
        return `### \`2. Plus: Income from round\`\n❌ Error`;
    }
}

/**
 * Format combat results for attacks received - REVISED ULTRA-COMPACT FORMAT
 * @param {Array} attacksReceived - Attacks this player received
 * @param {Object} items - Item definitions
 * @param {Object} customTerms - Custom terminology
 * @param {Object} playerInventory - Player's inventory for defense calculation
 * @returns {string} Formatted combat results
 */
function formatCombatResults(attacksReceived, items, customTerms, playerInventory = {}) {
    try {
        const currencyEmoji = customTerms.currencyEmoji || '🪙';
        let content = `### \`3. Less: Damage from attacks\`\n`;
        
        if (attacksReceived.length === 0) {
            // No attacks received - only show if there's defense
            const defenseValue = calculateTotalDefense(playerInventory, items);
            if (defenseValue > 0) {
                // Show defense even with no attacks
                const defenseItems = {};
                for (const [itemId, itemData] of Object.entries(playerInventory)) {
                    const item = items[itemId];
                    if (!item || !item.defenseValue) continue;
                    
                    const quantity = typeof itemData === 'object' ? itemData.quantity : itemData;
                    const itemKey = item.emoji || '🛡️';
                    if (!defenseItems[itemKey]) {
                        defenseItems[itemKey] = { quantity: 0, unitDefense: item.defenseValue, totalDefense: 0 };
                    }
                    defenseItems[itemKey].quantity += quantity;
                    defenseItems[itemKey].totalDefense += quantity * item.defenseValue;
                }
                
                const defenseSummary = Object.entries(defenseItems)
                    .map(([emoji, data]) => `${emoji}🛡️ ${data.quantity}x${data.unitDefense} (${data.totalDefense})`)
                    .join(' ');
                
                content += `No attacks - ${defenseSummary}\n`;
            }
            content += `Combat Damage: ${currencyEmoji}0`;
            return content;
        }
        
        // Calculate total attack damage and group by item type
        let totalAttackDamage = 0;
        const attackItems = {};
        
        for (const attack of attacksReceived) {
            const item = items[attack.itemId];
            if (!item) continue;
            
            const itemKey = item.emoji || '⚔️';
            if (!attackItems[itemKey]) {
                attackItems[itemKey] = { quantity: 0, unitDamage: item.attackValue || 0, totalDamage: 0 };
            }
            
            attackItems[itemKey].quantity += attack.attacksPlanned || 1;
            attackItems[itemKey].totalDamage += attack.totalDamage || 0;
            totalAttackDamage += attack.totalDamage || 0;
        }
        
        // Calculate total defense from player's inventory
        let totalDefense = 0;
        const defenseItems = {};
        
        for (const [itemId, itemData] of Object.entries(playerInventory)) {
            const item = items[itemId];
            if (!item || !item.defenseValue) continue;
            
            const quantity = typeof itemData === 'object' ? itemData.quantity : itemData;
            const itemDefense = quantity * item.defenseValue;
            totalDefense += itemDefense;
            
            const itemKey = item.emoji || '🛡️';
            if (!defenseItems[itemKey]) {
                defenseItems[itemKey] = { quantity: 0, unitDefense: item.defenseValue, totalDefense: 0 };
            }
            defenseItems[itemKey].quantity += quantity;
            defenseItems[itemKey].totalDefense += itemDefense;
        }
        
        // Format attack summary: emoji⚔️ quantity×damage (total)
        const attackSummary = Object.entries(attackItems)
            .map(([emoji, data]) => `${emoji}⚔️ ${data.quantity}x${data.unitDamage} (${data.totalDamage})`)
            .join(' ');
        
        // Format defense summary: emoji🛡️ quantity×defense (total)
        const defenseSummary = Object.entries(defenseItems)
            .map(([emoji, data]) => `${emoji}🛡️ ${data.quantity}x${data.unitDefense} (${data.totalDefense})`)
            .join(' ');
        
        // Combine attack and defense if both exist
        if (attackSummary && defenseSummary) {
            content += `${attackSummary} - ${defenseSummary}\n`;
        } else if (attackSummary) {
            content += `${attackSummary}\n`;
        }
        
        // Calculate net damage (attack - defense, minimum 0 for display)
        const netDamage = Math.max(0, totalAttackDamage - totalDefense);
        // Only show minus sign if damage is greater than 0
        content += `Combat Damage: ${netDamage > 0 ? '-' : ''}${currencyEmoji}${netDamage}`;
        
        return content;
        
    } catch (error) {
        console.error('Error formatting combat results:', error);
        return `### \`3. Less: Damage from attacks\`\n❌ Error`;
    }
}

// Helper function to calculate total defense
function calculateTotalDefense(playerInventory, items) {
    let totalDefense = 0;
    for (const [itemId, itemData] of Object.entries(playerInventory)) {
        const item = items[itemId];
        if (!item || !item.defenseValue) continue;
        const quantity = typeof itemData === 'object' ? itemData.quantity : itemData;
        totalDefense += quantity * item.defenseValue;
    }
    return totalDefense;
}

/**
 * Get appropriate emoji for player name
 * @param {string} playerName - Player's display name
 * @returns {string} Emoji representing the player
 */
function getPlayerEmoji(playerName) {
    // Simple emoji mapping based on name patterns
    const name = playerName.toLowerCase();
    if (name.includes('reece') || name.includes('bot')) return '🤖';
    if (name.includes('morgane')) return '🦖';
    if (name.includes('belle')) return '🔔';
    
    // Default player emojis
    const emojis = ['👤', '🎭', '🎪', '🎨', '🎯', '🎲', '🎮', '🎸', '🎺', '🎻', '🎹', '🎤'];
    const index = playerName.length % emojis.length;
    return emojis[index];
}

// =============================================================================
// Stock Management Functions
// =============================================================================

/**
 * Check if an item has stock available in a store
 * @param {string} guildId - Guild ID
 * @param {string} storeId - Store ID
 * @param {string} itemId - Item ID
 * @returns {Promise<boolean>} True if stock is available (or unlimited)
 */
async function hasStock(guildId, storeId, itemId) {
    const safariData = await loadSafariContent();
    const store = safariData[guildId]?.stores?.[storeId];
    if (!store) return false;
    
    const storeItem = store.items.find(si => si.itemId === itemId);
    if (!storeItem) return false;
    
    // Backwards compatibility: no stock field = unlimited
    if (storeItem.stock === undefined || storeItem.stock === null) return true;
    if (storeItem.stock === -1) return true; // Explicitly unlimited
    
    return storeItem.stock > 0;
}

/**
 * Decrement stock after a purchase
 * @param {string} guildId - Guild ID
 * @param {string} storeId - Store ID
 * @param {string} itemId - Item ID
 * @param {number} quantity - Quantity to decrement (default: 1)
 * @returns {Promise<boolean>} True if stock was successfully decremented
 */
async function decrementStock(guildId, storeId, itemId, quantity = 1) {
    const safariData = await loadSafariContent();
    const store = safariData[guildId]?.stores?.[storeId];
    if (!store) return false;
    
    const storeItem = store.items.find(si => si.itemId === itemId);
    if (!storeItem) return false;
    
    // Don't decrement unlimited items
    if (storeItem.stock === undefined || storeItem.stock === null || storeItem.stock === -1) {
        return true; // Success, no decrement needed
    }
    
    // Check sufficient stock
    if (storeItem.stock < quantity) {
        return false;
    }
    
    // Decrement stock
    storeItem.stock -= quantity;
    await saveSafariContent(safariData);
    
    console.log(`📦 Stock updated: ${itemId} in store ${storeId} - new stock: ${storeItem.stock}`);
    return true;
}

/**
 * Update stock level for an item (admin function)
 * @param {string} guildId - Guild ID
 * @param {string} storeId - Store ID
 * @param {string} itemId - Item ID
 * @param {number} newStock - New stock level (-1 for unlimited, 0+ for limited)
 * @returns {Promise<boolean>} True if stock was successfully updated
 */
async function updateItemStock(guildId, storeId, itemId, newStock) {
    const safariData = await loadSafariContent();
    const store = safariData[guildId]?.stores?.[storeId];
    if (!store) return false;
    
    const storeItem = store.items.find(si => si.itemId === itemId);
    if (!storeItem) return false;
    
    // Set stock (-1 for unlimited, 0+ for limited)
    storeItem.stock = newStock;
    await saveSafariContent(safariData);
    
    console.log(`📦 Stock set: ${itemId} in store ${storeId} - stock: ${newStock === -1 ? 'unlimited' : newStock}`);
    return true;
}

/**
 * Get current stock level for an item
 * @param {string} guildId - Guild ID
 * @param {string} storeId - Store ID
 * @param {string} itemId - Item ID
 * @returns {Promise<number|null>} Stock level (null = unlimited, number = limited stock)
 */
async function getItemStock(guildId, storeId, itemId) {
    const safariData = await loadSafariContent();
    const store = safariData[guildId]?.stores?.[storeId];
    if (!store) return null;
    
    const storeItem = store.items.find(si => si.itemId === itemId);
    if (!storeItem) return null;
    
    // Return null for unlimited, number for limited
    if (storeItem.stock === undefined || storeItem.stock === null) return null;
    return storeItem.stock;
}

/**
 * Get stamina configuration for a guild (per-server with .env fallback)
 * Replaces global .env stamina settings with per-server configuration
 *
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Stamina configuration object
 *
 * @example
 * const config = await getStaminaConfig(guildId);
 * // Returns: { startingStamina: 1, maxStamina: 1, regenerationMinutes: 3, defaultStartingCoordinate: 'A1' }
 */
export async function getStaminaConfig(guildId) {
    const safariData = await loadSafariContent();
    const safariConfig = safariData[guildId]?.safariConfig || {};

    // Get custom terms (which includes per-server coordinate override)
    const customTerms = await getCustomTerms(guildId);

    console.log(`🗺️ DEBUG getStaminaConfig: customTerms.defaultStartingCoordinate = "${customTerms.defaultStartingCoordinate}"`);
    console.log(`🗺️ DEBUG getStaminaConfig: safariConfig keys = ${Object.keys(safariConfig).join(', ')}`);

    // Read from safariConfig first, fall back to .env (backward compatible)
    const config = {
        startingStamina: safariConfig.startingStamina !== undefined
            ? safariConfig.startingStamina
            : parseInt(process.env.STAMINA_MAX || '1'),

        maxStamina: safariConfig.maxStamina !== undefined
            ? safariConfig.maxStamina
            : parseInt(process.env.STAMINA_MAX || '1'),

        regenerationMinutes: safariConfig.staminaRegenerationMinutes !== undefined
            ? safariConfig.staminaRegenerationMinutes
            : parseInt(process.env.STAMINA_REGEN_MINUTES || '3'),

        defaultStartingCoordinate: customTerms.defaultStartingCoordinate || 'A1'
    };

    // Debug logging to show config source (helps diagnose issues)
    const source = safariConfig.startingStamina !== undefined ? 'safariConfig' : '.env';
    console.log(`⚡ Stamina config for guild ${guildId}: source=${source}, starting=${config.startingStamina}, max=${config.maxStamina}, regen=${config.regenerationMinutes}min, coordinate=${config.defaultStartingCoordinate}`);

    return config;
}

export {
    createCustomButton,
    getCustomButton,
    listCustomButtons,
    executeButtonActions,
    postButtonToChannel,
    getCurrency,
    updateCurrency,
    initializePlayerSafari,
    grantDefaultItems,
    generateCustomId,
    generateButtonId,
    loadSafariContent,
    saveSafariContent,
    // MVP2 exports
    createStore,
    createItem,
    getPlayerInventory,
    addItemToInventory,
    checkCondition,
    getCurrencyAndInventoryDisplay,
    createStoreDisplay,
    buyItem,
    executeConditionalAction,
    executeStoreDisplay,
    executeRandomOutcome,
    executeGiveCurrency,
    executeGiveItem,
    ACTION_TYPES,
    CONDITION_TYPES,
    // Edit Framework exports
    reorderButtonAction,
    updateButtonAction,
    deleteButtonAction,
    updateButtonProperties,
    deleteButton,
    validateActionLimit,
    // Player Inventory exports
    createPlayerInventoryDisplay,
    hasStoresInGuild,
    getStoreBrowseButtons,
    getEmojiTwemojiUrl,
    // Custom Terms exports
    getCustomTerms,
    // Points System exports
    executeCheckPoints,
    executeModifyPoints,
    executeMovePlayer,
    initializeEntityPoints,
    getEntityPoints,
    hasEnoughPoints,
    // Stock Management exports
    hasStock,
    decrementStock,
    updateItemStock,
    getItemStock,
    usePoints,
    setEntityPoints,
    getTimeUntilRegeneration,
    getPointsDisplay,
    initializePointsConfig,
    // Movement System exports
    getPlayerLocation,
    setPlayerLocation,
    getValidMoves,
    canPlayerMove,
    movePlayer,
    getMovementDisplay,
    initializePlayerOnMap,
    updateCustomTerms,
    resetCustomTerms,
    // Challenge Game Logic exports
    calculateSimpleResults,
    calculateSinglePlayerResults,
    processRoundResults,
    createFinalRankings,
    resetGameData,
    restockPlayers,
    // Shared Display Functions
    generateItemContent,
    // Attack System exports
    initializeAttackAvailability,
    getAttackQueue,
    addAttackToQueue,
    getPlannedAttacks,
    calculateAttacksPlanned,
    updateAttackAvailability,
    clearAttackQueue,
    createAttackPlanningUI,
    updateAttackDisplay,
    scheduleAttack,
    createOrUpdateAttackUI,
    getEligiblePlayersFixed,
    // Migration helper
    migrateExistingPlayersToSafari,
    // Universal Object Format Functions
    getItemQuantity,
    setItemQuantity,
    getItemAttackAvailability,
    migrateInventoryToObjectFormat,
    // Attack Resolution Functions
    calculatePlayerDefense,
    processAttackQueue,
    consumeAttackItems,
    clearProcessedAttackQueue,
    clearAllAttackQueues,
    clearCorruptedAttacks,
    // V2 Results Display Functions
    createRoundResultsV2,
    createPlayerResultCards,
    createPlayerResultCard,
    formatIncomeBreakdown,
    formatCombatResults,
    getPlayerEmoji,
    sortPlayersForResults
};

/**
 * Evaluate conditions for a button
 * @param {Array} conditions - Array of condition objects
 * @param {Object} context - Evaluation context with playerData, guildId, userId, member
 * @returns {boolean} - True if all conditions pass
 */
async function evaluateConditions(conditions, context) {
    if (!conditions || conditions.length === 0) {
        return true; // No conditions = always pass
    }
    
    const { playerData, guildId, userId } = context;
    const player = playerData[guildId]?.players?.[userId];
    
    if (!player) {
        console.error(`Player ${userId} not found for condition evaluation`);
        return false;
    }
    
    let accumulator = null;
    
    for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];
        const result = await evaluateSingleCondition(condition, player, context);
        
        console.log(`Condition ${i + 1}: ${getConditionSummary(condition)} = ${result}`);
        
        if (i === 0) {
            accumulator = result;
            continue;
        }
        
        // Apply previous condition's logic operator
        const prevLogic = conditions[i - 1].logic || 'AND';
        
        // Short-circuit evaluation
        if (prevLogic === 'AND' && !accumulator) {
            console.log('Short-circuit: AND with false accumulator');
            return false;
        }
        if (prevLogic === 'OR' && accumulator) {
            console.log('Short-circuit: OR with true accumulator');
            return true;
        }
        
        // Apply logic
        if (prevLogic === 'AND') {
            accumulator = accumulator && result;
        } else if (prevLogic === 'OR') {
            accumulator = accumulator || result;
        }
        
        console.log(`After ${prevLogic}: accumulator = ${accumulator}`);
    }
    
    return accumulator;
}

/**
 * Evaluate a single condition
 */
async function evaluateSingleCondition(condition, player, context) {
    switch (condition.type) {
        case 'currency':
            const currency = player.safari?.currency || 0;
            switch (condition.operator) {
                case 'gte':
                    return currency >= condition.value;
                case 'lte':
                    return currency <= condition.value;
                case 'eq_zero':
                    return currency === 0;
                default:
                    return false;
            }
            
        case 'item':
            const itemQuantity = player.safari?.inventory?.[condition.itemId]?.quantity || 0;
            const hasItem = itemQuantity > 0;
            return condition.operator === 'has' ? hasItem : !hasItem;
            
        case 'role':
            const member = context.member;
            const hasRole = member?.roles?.includes(condition.roleId);
            return condition.operator === 'has' ? hasRole : !hasRole;
            
        default:
            console.error(`Unknown condition type: ${condition.type}`);
            return false;
    }
}

/**
 * Get human-readable summary of a condition
 */
function getConditionSummary(condition) {
    switch (condition.type) {
        case 'currency':
            if (condition.operator === 'gte') {
                return `Currency ≥ ${condition.value}`;
            } else if (condition.operator === 'lte') {
                return `Currency ≤ ${condition.value}`;
            } else if (condition.operator === 'eq_zero') {
                return `Currency = 0`;
            }
            break;
        case 'item':
            return `${condition.operator === 'has' ? 'Has' : 'Does not have'} item ${condition.itemId}`;
        case 'role':
            return `${condition.operator === 'has' ? 'Has' : 'Does not have'} role ${condition.roleId}`;
        default:
            return 'Unknown condition';
    }
}

/**
 * Create store creation modal with customizable custom_id and title
 * @param {string} customId - The custom_id for the modal (e.g., "safari_store_modal_location_F2")
 * @param {string} title - The modal title (e.g., "Create Store for F2")
 * @returns {ModalBuilder} Configured modal ready for use
 */
export function createStoreModal(customId, title = "Create New Store") {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    const storeNameInput = new TextInputBuilder()
        .setCustomId("store_name")
        .setLabel("Store Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder("e.g. Adventure Supplies");

    const storeEmojiInput = new TextInputBuilder()
        .setCustomId("store_emoji")
        .setLabel("Store Emoji")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100)
        .setPlaceholder("🏪 or <:custom:123456>");

    const storeDescriptionInput = new TextInputBuilder()
        .setCustomId("store_description")
        .setLabel("Store Description")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
        .setPlaceholder("A description of your store...");

    const storeownerTextInput = new TextInputBuilder()
        .setCustomId("storeowner_text")
        .setLabel("Store Owner Greeting")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200)
        .setPlaceholder("Welcome to my store!");

    const row1 = new ActionRowBuilder().addComponents(storeNameInput);
    const row2 = new ActionRowBuilder().addComponents(storeEmojiInput);
    const row3 = new ActionRowBuilder().addComponents(storeDescriptionInput);
    const row4 = new ActionRowBuilder().addComponents(storeownerTextInput);

    modal.addComponents(row1, row2, row3, row4);

    return modal;
}
