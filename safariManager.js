import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { 
    InteractionResponseType,
    InteractionResponseFlags
} from 'discord-interactions';
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
 * Safari Manager Module for CastBot - MVP2
 * Handles dynamic content creation, button management, action execution,
 * store systems, inventory management, and conditional actions
 */

/**
 * Generate detailed item content for display (reusable between store and inventory)
 * @param {Object} item - The item object with stats
 * @param {Object} customTerms - Custom terminology for the guild
 * @param {number} quantity - Quantity owned (for inventory display)
 * @param {number} price - Price (for store display, optional)
 * @returns {string} Formatted content string
 */
function generateItemContent(item, customTerms, quantity = null, price = null) {
    let content = `## ${item.emoji || '📦'} ${item.name}\n\n${item.description || 'No description available.'}\n\n`;
    
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
        
        if (hasAttack) {
            content += `🗡️ Attack: ${item.attackValue}\n`;
        }
        
        if (hasDefense) {
            content += `🛡️ Defense: ${item.defenseValue}\n`;
        }
        
        content += '\n';
    }
    
    // Add quantity info for inventory display
    if (quantity !== null) {
        content += `> \`Quantity: ${quantity}\``;
    }
    
    // Add price info for store display
    if (price !== null) {
        content += `> ${customTerms.currencyEmoji} **Price:** ${price} ${customTerms.currencyName}`;
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
                        "currencyName": "coins",
                        "inventoryName": "Nest",
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
                        currencyName: 'coins',
                        inventoryName: 'Nest',
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
 * Update player currency
 */
async function updateCurrency(guildId, userId, amount) {
    try {
        const playerData = await loadPlayerData();
        
        // Initialize structures with MVP2 features if needed
        if (!playerData[guildId]) {
            playerData[guildId] = { players: {}, tribes: {}, timezones: {} };
        }
        if (!playerData[guildId].players[userId]) {
            playerData[guildId].players[userId] = {};
        }
        if (!playerData[guildId].players[userId].safari) {
            playerData[guildId].players[userId].safari = {
                currency: 0,
                history: [],
                lastInteraction: Date.now(),
                achievements: [],
                inventory: {},          // NEW: MVP2 - Item inventory
                cooldowns: {},          // NEW: MVP2 - Button cooldowns  
                buttonUses: {},         // NEW: MVP2 - Usage tracking
                storeHistory: []         // NEW: MVP2 - Purchase history
            };
        }
        
        const currentCurrency = playerData[guildId].players[userId].safari.currency;
        const newCurrency = Math.max(0, currentCurrency + amount); // Don't go below 0
        
        playerData[guildId].players[userId].safari.currency = newCurrency;
        playerData[guildId].players[userId].safari.lastInteraction = Date.now();
        
        await savePlayerData(playerData);
        
        console.log(`🪙 DEBUG: Currency updated for user ${userId}: ${currentCurrency} → ${newCurrency} (${amount >= 0 ? '+' : ''}${amount})`);
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
    
    // Add Media Gallery if imageUrl is provided
    if (config.imageUrl) {
        components.push({
            type: 12, // Media Gallery
            items: [{
                media: { url: config.imageUrl },
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
    if (config.accentColor) {
        container.accent_color = config.accentColor;
    }
    
    return {
        flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 | EPHEMERAL
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
    
    const newBalance = await updateCurrency(guildId, userId, config.amount);
    
    let message = config.message || `Currency updated!`;
    
    // Add balance info with custom currency terms
    const sign = config.amount >= 0 ? '+' : '';
    message += `\n\n${customTerms.currencyEmoji} **${sign}${config.amount} ${customTerms.currencyName}**`;
    message += `\nYour balance: **${newBalance} ${customTerms.currencyName}**`;
    
    return {
        content: message,
        flags: InteractionResponseFlags.EPHEMERAL
    };
}

/**
 * Execute give currency action
 */
async function executeGiveCurrency(config, userId, guildId, interaction) {
    // Get custom terms for this guild
    const customTerms = await getCustomTerms(guildId);
    
    console.log(`💰 DEBUG: Executing give currency: ${config.amount} for user ${userId}`);
    
    // Check usage limits
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        const claimedBy = config.limit.claimedBy || [];
        
        if (config.limit.type === 'once_per_player' && claimedBy.includes(userId)) {
            return {
                content: `❌ You have already claimed this ${customTerms.currencyName} reward!`,
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        if (config.limit.type === 'once_globally' && claimedBy) {
            return {
                content: `❌ This ${customTerms.currencyName} reward has already been claimed!`,
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
    }
    
    // Give the currency
    const newBalance = await updateCurrency(guildId, userId, config.amount);
    
    // Update claim tracking persistently
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        
        // Find the button and action to update
        for (const buttonId in safariData[guildId]?.buttons || {}) {
            const button = safariData[guildId].buttons[buttonId];
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
    
    let message = config.message || `You received ${customTerms.currencyName}!`;
    message += `\n\n${customTerms.currencyEmoji} **+${config.amount} ${customTerms.currencyName}**`;
    message += `\nYour balance: **${newBalance} ${customTerms.currencyName}**`;
    
    return {
        content: message,
        flags: InteractionResponseFlags.EPHEMERAL
    };
}

/**
 * Execute give item action
 */
async function executeGiveItem(config, userId, guildId, interaction) {
    console.log(`🎁 DEBUG: Executing give item: ${config.itemId} x${config.quantity} for user ${userId}`);
    
    // Check usage limits
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        const claimedBy = config.limit.claimedBy || [];
        
        if (config.limit.type === 'once_per_player' && claimedBy.includes(userId)) {
            return {
                content: '❌ You have already claimed this item!',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        if (config.limit.type === 'once_globally' && claimedBy) {
            return {
                content: '❌ This item has already been claimed!',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
    }
    
    // Give the item
    const success = await addItemToInventory(guildId, userId, config.itemId, config.quantity);
    
    if (!success) {
        return {
            content: '❌ Failed to add item to inventory. Item may not exist.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
    
    // Update claim tracking persistently
    if (config.limit && config.limit.type !== 'unlimited') {
        const safariData = await loadSafariContent();
        
        // Find the button and action to update
        for (const buttonId in safariData[guildId]?.buttons || {}) {
            const button = safariData[guildId].buttons[buttonId];
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
                        
                        // Save the updated data
                        await saveSafariContent(safariData);
                        console.log(`✅ Updated claim tracking for give_item action`);
                        break;
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
        content: message,
        flags: InteractionResponseFlags.EPHEMERAL
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
            content: '❌ Follow-up button not found.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
    }
    
    // Create the follow-up button
    const button = new ButtonBuilder()
        .setCustomId(generateCustomId(guildId, followUpButton.id))
        .setLabel(followUpButton.label)
        .setStyle(BUTTON_STYLES[followUpButton.style]);
    
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
async function executeButtonActions(guildId, buttonId, userId, interaction) {
    try {
        console.log(`🚀 DEBUG: Executing button actions for ${buttonId} by user ${userId}`);
        
        const button = await getCustomButton(guildId, buttonId);
        if (!button) {
            return {
                content: '❌ Button not found.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Update usage count
        const safariData = await loadSafariContent();
        if (safariData[guildId]?.buttons?.[buttonId]) {
            safariData[guildId].buttons[buttonId].metadata.usageCount++;
            await saveSafariContent(safariData);
        }
        
        // Sort actions by order
        const sortedActions = button.actions.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        const responses = [];
        
        for (let i = 0; i < sortedActions.length; i++) {
            const action = sortedActions[i];
            let result;
            
            switch (action.type) {
                case ACTION_TYPES.DISPLAY_TEXT:
                case 'display_text': // Legacy support
                    result = await executeDisplayText(action.config, interaction);
                    
                    // Check if next action is a follow_up_button and bundle it
                    if (i + 1 < sortedActions.length) {
                        const nextAction = sortedActions[i + 1];
                        if (nextAction.type === ACTION_TYPES.FOLLOW_UP_BUTTON || 
                            nextAction.type === 'follow_up_button' || 
                            nextAction.type === 'follow_up') {
                            
                            console.log('📎 DEBUG: Bundling follow_up_button with display_text');
                            
                            // Get the follow-up button components
                            const followUpResult = await executeFollowUpButton(nextAction.config, guildId, interaction);
                            
                            // Extract the button from the follow-up result
                            if (followUpResult.components?.[0]?.components) {
                                const followUpComponents = followUpResult.components[0].components;
                                
                                // Find the action row with the button (skip text displays and separators)
                                const buttonRow = followUpComponents.find(comp => comp.type === 1);
                                
                                if (buttonRow && result.components?.[0]?.components) {
                                    // Add separator before button
                                    result.components[0].components.push({
                                        type: 14 // Separator
                                    });
                                    
                                    // Add the button action row to the display_text container
                                    result.components[0].components.push(buttonRow);
                                }
                            }
                            
                            // Skip the next action since we bundled it
                            i++;
                        }
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
                    result = await executeGiveCurrency(action.config, userId, guildId, interaction);
                    responses.push(result);
                    break;
                    
                case 'give_item':
                    result = await executeGiveItem(action.config, userId, guildId, interaction);
                    responses.push(result);
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
        return mainResponse;
        
    } catch (error) {
        console.error('Error executing button actions:', error);
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
        
        // Initialize structures
        if (!playerData[guildId]) playerData[guildId] = { players: {} };
        if (!playerData[guildId].players[userId]) playerData[guildId].players[userId] = {};
        if (!playerData[guildId].players[userId].safari) {
            playerData[guildId].players[userId].safari = {
                currency: 0, history: [], lastInteraction: Date.now(),
                achievements: [], inventory: {}, cooldowns: {}, buttonUses: {}, storeHistory: []
            };
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
        
        // Process purchase
        await updateCurrency(guildId, userId, -price);
        await addItemToInventory(guildId, userId, itemId, 1);
        
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
 * @returns {Object} Discord Components V2 response
 */
async function createPlayerInventoryDisplay(guildId, userId, member = null) {
    try {
        console.log(`📦 DEBUG: Creating player inventory display for user ${userId} in guild ${guildId}`);
        
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
        
        const components = [];
        
        // Header with personalized player name and custom inventory name
        components.push({
            type: 10, // Text Display
            content: `# ${playerDisplayName}'s ${customTerms.inventoryName}`
        });
        
        // Add separator before balance
        components.push({ type: 14 }); // Separator
        
        // Balance section with custom currency name
        components.push({
            type: 10, // Text Display
            content: `## ${customTerms.currencyEmoji} Your Balance\n> \`${playerCurrency} ${customTerms.currencyName}\``
        });
        
        // Count total items and component usage - handle both number and object formats
        const inventoryItems = Object.entries(playerInventory).filter(([itemId, itemData]) => {
            if (typeof itemData === 'number') {
                return itemData > 0;
            } else if (typeof itemData === 'object' && itemData !== null) {
                return (itemData.quantity || 0) > 0;
            }
            return false;
        });
        console.log(`🔍 DEBUG: Filtered inventoryItems:`, inventoryItems);
        let componentsUsed = 4; // Container + header + separator + footer action row
        
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
            const updatedInventoryItems = Object.entries(updatedInventory).filter(([itemId, itemData]) => {
                if (typeof itemData === 'number') {
                    return itemData > 0;
                } else if (typeof itemData === 'object' && itemData !== null) {
                    return (itemData.quantity || 0) > 0;
                }
                return false;
            });
            
            // Add items with separators between them
            for (let i = 0; i < updatedInventoryItems.length; i++) {
                const [itemId, inventoryData] = updatedInventoryItems[i];
                console.log(`🔍 DEBUG: Processing inventory item ${itemId}, data:`, inventoryData);
                const item = items[itemId];
                if (!item) {
                    console.log(`❌ DEBUG: Item ${itemId} not found in items data - skipping`);
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
                
                // Check component limit (reserve space for store buttons)
                if (componentsUsed >= 35) { // Leave room for store buttons
                    components.push({
                        type: 10, // Text Display
                        content: `⚠️ **Note:** You have more items, but only some can be displayed due to Discord limits.`
                    });
                    break;
                }
                
                // Add separator before each item (but not before the first one)
                if (i === 0) {
                    components.push({ type: 14 }); // Separator before first item
                }
                
                // Check if item has attack value
                const hasAttack = item.attackValue !== null && item.attackValue !== undefined;
                
                if (hasAttack) {
                    // Calculate attacks planned using simple math: total - available
                    const attacksPlanned = quantity - numAttacksAvailable;
                    
                    // Generate item content with attack info
                    let attackItemContent = generateItemContent(item, customTerms, quantity);
                    
                    // Add attack availability info
                    attackItemContent += `\n> ⚔️ Attacks Available: ${numAttacksAvailable}`;
                    if (attacksPlanned > 0) {
                        attackItemContent += `\n> 🎯 Attacks Planned: ${attacksPlanned}`;
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
                    console.log(`⚔️ DEBUG: Added attack item ${item.name} with Section component`);
                } else {
                    // Non-attack item - use regular Text Display
                    const itemContent = generateItemContent(item, customTerms, quantity);
                    
                    components.push({
                        type: 10, // Text Display
                        content: itemContent
                    });
                    console.log(`📦 DEBUG: Added Text Display for ${item.name} (qty: ${quantity})`);
                }
                
                // Add separator after each item (but not after the last one)
                if (i < inventoryItems.length - 1) {
                    components.push({ type: 14 }); // Separator after item (not last)
                }
                
                componentsUsed++;
                
                console.log(`📦 DEBUG: Added item ${item.name} (qty: ${quantity}) to display`);
            }
        }
        
        // Create container
        const container = {
            type: 17, // Container
            accent_color: 0x57f287, // Green accent for "My Nest"
            components: components
        };
        
        // Get store browse buttons
        const storeBrowseButtons = await getStoreBrowseButtons(guildId);
        
        const responseComponents = [container];
        
        // Add store browse buttons if any exist
        if (storeBrowseButtons.length > 0) {
            responseComponents.push({
                type: 1, // Action Row
                components: storeBrowseButtons
            });
        }
        
        console.log(`✅ DEBUG: Created inventory display with ${components.length} components and ${storeBrowseButtons.length} store buttons`);
        console.log(`📤 DEBUG: Sending response with ${responseComponents.length} response components`);
        
        const response = {
            flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + Ephemeral
            components: responseComponents
        };
        
        // Debug: Log the response structure
        console.log(`📋 DEBUG: Response structure:`, JSON.stringify(response, null, 2).substring(0, 500) + '...');
        
        return response;
        
    } catch (error) {
        console.error('Error creating player inventory display:', error);
        return {
            content: '❌ Error loading your nest. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
        };
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
            currencyName: config.currencyName || 'coins',
            inventoryName: config.inventoryName || 'Nest',
            currencyEmoji: config.currencyEmoji || '🪙',
            
            // Game settings - Challenge Game Logic
            round1GoodProbability: config.round1GoodProbability || null,
            round2GoodProbability: config.round2GoodProbability || null,
            round3GoodProbability: config.round3GoodProbability || null,
            
            // Event details
            goodEventName: config.goodEventName || 'Clear Skies',
            badEventName: config.badEventName || 'Meteor Strike',
            goodEventMessage: config.goodEventMessage || 'The skies are clear! All creatures thrive!',
            badEventMessage: config.badEventMessage || 'Meteors rain down! Only the protected survive!',
            goodEventEmoji: config.goodEventEmoji || '☀️',
            badEventEmoji: config.badEventEmoji || '☄️',
            
            // Game state
            currentRound: config.currentRound || 1,
            lastRoundTimestamp: config.lastRoundTimestamp || null
        };
    } catch (error) {
        console.error('Error getting custom terms:', error);
        return {
            // Basic terms fallbacks
            currencyName: 'coins',
            inventoryName: 'Nest',
            currencyEmoji: '🪙',
            
            // Game settings fallbacks
            round1GoodProbability: null,
            round2GoodProbability: null,
            round3GoodProbability: null,
            
            // Event details fallbacks
            goodEventName: 'Clear Skies',
            badEventName: 'Meteor Strike',
            goodEventMessage: 'The skies are clear! All creatures thrive!',
            badEventMessage: 'Meteors rain down! Only the protected survive!',
            goodEventEmoji: '☀️',
            badEventEmoji: '☄️',
            
            // Game state fallbacks
            currentRound: 1,
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
                currencyName: 'coins',
                inventoryName: 'Nest',
                currencyEmoji: '🪙'
            };
        }
        
        // Update basic terms
        if (terms.currencyName !== undefined) {
            safariData[guildId].safariConfig.currencyName = terms.currencyName || 'coins';
        }
        if (terms.inventoryName !== undefined) {
            safariData[guildId].safariConfig.inventoryName = terms.inventoryName || 'Nest';
        }
        if (terms.currencyEmoji !== undefined) {
            safariData[guildId].safariConfig.currencyEmoji = terms.currencyEmoji || '🪙';
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
        currencyName: 'coins',
        inventoryName: 'Nest',
        currencyEmoji: '🪙'
    });
}

/**
 * Process Round Results - Challenge Game Logic Core Engine
 * Handles event determination, player earnings/losses, and round progression
 */
async function processRoundResults(guildId, channelId, client) {
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
        const currentRound = safariConfig.currentRound || 1;
        
        console.log(`🎲 DEBUG: Current round: ${currentRound}`);
        
        // If currentRound == 4, show reset interface
        if (currentRound === 4) {
            console.log('🔄 DEBUG: Game completed (currentRound=4), showing reset interface');
            return createResetInterface();
        }
        
        // If no currentRound exists, set to 1
        if (!safariConfig.currentRound) {
            safariConfig.currentRound = 1;
            await saveSafariContent(safariData);
        }
        
        // Get custom terms for event names/probabilities
        const customTerms = await getCustomTerms(guildId);
        
        // Get round-specific good event probability
        let goodEventProbability = 75; // Default for round 1
        switch (currentRound) {
            case 1:
                goodEventProbability = customTerms.round1GoodProbability || 75;
                break;
            case 2:
                goodEventProbability = customTerms.round2GoodProbability || 50;
                break;
            case 3:
                goodEventProbability = customTerms.round3GoodProbability || 25;
                break;
        }
        
        console.log(`📊 DEBUG: Round ${currentRound} probabilities - Good: ${goodEventProbability}%`);
        
        // Randomly determine if goodEvent or badEvent occurred
        const randomRoll = Math.random() * 100;
        const isGoodEvent = randomRoll < goodEventProbability;
        const eventType = isGoodEvent ? 'good' : 'bad';
        const eventName = isGoodEvent ? (customTerms.goodEventName || 'Clear Skies') : (customTerms.badEventName || 'Meteor Strike');
        const eventEmoji = isGoodEvent ? (customTerms.goodEventEmoji || '☀️') : (customTerms.badEventEmoji || '☄️');
        
        console.log(`🎯 DEBUG: Event roll: ${randomRoll.toFixed(1)}% - ${eventType.toUpperCase()} event: ${eventName}`);
        
        // Get eligible players (currency >= 1 OR any inventory items)
        const eligiblePlayers = await getEligiblePlayersFixed(guildId, client);
        console.log(`👥 DEBUG: Found ${eligiblePlayers.length} eligible players`);
        
        if (eligiblePlayers.length === 0) {
            return {
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    content: `# Round ${currentRound} Results\n\n## ${eventEmoji} ${eventName}\n\n*No eligible players found. Players need currency ≥ 1 or items in inventory to participate.*\n\n💡 **Tip:** Use the "Restock Players" button after resetting to seed test data.`,
                    flags: (1 << 15) // IS_COMPONENTS_V2 for consistency
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
            isGoodEvent: eventType === 'good',
            eventName,
            eventEmoji,
            eligiblePlayers,
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
        if (currentRound < 3) {
            // Advance to next round
            safariConfig.currentRound = currentRound + 1;
            await saveSafariContent(safariData);
        } else {
            // Round 3 completed - show detailed results with final rankings and set to round 4 (reset state)
            safariConfig.currentRound = 4;
            await saveSafariContent(safariData);
            
            // Use modern display for Round 3 - show final results with rankings
            console.log('🏆 DEBUG: Round 3 completed, creating final results display');
            return await createRoundResultsV2(guildId, roundData, customTerms);
        }
        
        // Return modern round results display
        return await createRoundResultsV2(guildId, roundData, customTerms);
        
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
            flags: (1 << 15) | 64, // IS_COMPONENTS_V2 + EPHEMERAL
            components: [{
                type: 17, // Container
                accent_color: 0xed4245, // Red
                components: [
                    {
                        type: 10, // Text Display
                        content: `# Reset to round 1?\n\nAll player currency will be reset to 0, all player item purchases cleared, and all round data will be cleared`
                    },
                    {
                        type: 1, // Action Row
                        components: [{
                            type: 2, // Button
                            custom_id: 'safari_confirm_reset_game',
                            label: 'Reset to Round 1',
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
            const safari = data.safari || {};
            const currency = safari.currency || 0;
            const inventory = safari.inventory || {};
            const hasInventory = Object.keys(inventory).length > 0 && Object.values(inventory).some(item => getItemQuantity(item) > 0);
            
            console.log(`🔍 DEBUG: Player ${userId}: currency=${currency}, inventory=${JSON.stringify(inventory)}, hasInventory=${hasInventory}`);
            
            if (currency >= 1 || hasInventory) {
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
            await updateCurrency(guildId, userId, netChange);
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
        if (currentRound < 3) {
            nextRoundMsg = `\n**Next:** Round ${currentRound + 1}`;
            if (currentRound === 2) {
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
            
            // Add randomized items (0-8 of each type) for rapid testing
            if (!playerData[guildId].players[userId].safari.inventory) {
                playerData[guildId].players[userId].safari.inventory = {};
            }
            
            // Define the 4 item types for testing
            const itemTypes = [
                { id: 'nurturer_361363', name: 'Nurturer', emoji: '🐣' },
                { id: 'territory_forager_404120', name: 'Territory Forager', emoji: '🦖' },
                { id: 'nest_guardian_461600', name: 'Nest Guardian', emoji: '🦕' },
                { id: 'raider_499497', name: 'Raider', emoji: '🦎' }
            ];
            
            const playerInventoryItems = [];
            
            for (const item of itemTypes) {
                const randomQuantity = Math.floor(Math.random() * 9); // 0-8 items
                
                if (randomQuantity > 0) {
                    // For raiders, numAttacksAvailable equals quantity (consumable attack item)
                    // For others, numAttacksAvailable is 0 (non-consumable or defense items)
                    const numAttacksAvailable = item.id === 'raider_499497' ? randomQuantity : 0;
                    
                    playerData[guildId].players[userId].safari.inventory[item.id] = {
                        quantity: randomQuantity,
                        numAttacksAvailable: numAttacksAvailable
                    };
                    
                    playerInventoryItems.push(`${randomQuantity}x ${item.name}`);
                    console.log(`🎲 DEBUG: Added ${randomQuantity}x ${item.name} to ${userId} (attacks: ${numAttacksAvailable})`);
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
        
        // 🚀 BLEEDING EDGE HACKY MVP: Auto-schedule random attacks for Round 1 testing
        const safariData = await loadSafariContent();
        if (!safariData[guildId]) safariData[guildId] = {};
        if (!safariData[guildId].safariConfig) safariData[guildId].safariConfig = {};
        
        const currentRound = safariData[guildId].safariConfig.currentRound || 1;
        console.log(`🎯 DEBUG: HACKY MVP - Current round: ${currentRound}`);
        
        if (currentRound === 1) {
            console.log(`🎯 DEBUG: HACKY MVP - Auto-scheduling random attacks for Round 1!`);
            
            // Get all player IDs for random targeting
            const allPlayerIds = Object.keys(playerData[guildId].players);
            let totalAttacksScheduled = 0;
            
            // Initialize attack queue for round 1
            if (!safariData[guildId].attackQueue) safariData[guildId].attackQueue = {};
            if (!safariData[guildId].attackQueue.round1) safariData[guildId].attackQueue.round1 = [];
            
            for (const userId of safariPlayers) {
                const raiders = playerData[guildId].players[userId].safari.inventory['raider_499497'];
                if (raiders && raiders.numAttacksAvailable > 0) {
                    // Get random targets (exclude the attacker)
                    const targets = allPlayerIds.filter(id => id !== userId && safariPlayers.includes(id));
                    
                    if (targets.length === 0) {
                        console.log(`⚠️ DEBUG: No valid targets for ${userId}, skipping attacks`);
                        continue;
                    }
                    
                    console.log(`⚔️ DEBUG: Scheduling ${raiders.numAttacksAvailable} attacks for ${userId}`);
                    
                    for (let i = 0; i < raiders.numAttacksAvailable; i++) {
                        const randomTarget = targets[Math.floor(Math.random() * targets.length)];
                        
                        // Add to attack queue - PURE RANDOM CHAOS
                        safariData[guildId].attackQueue.round1.push({
                            attackingPlayer: userId,
                            defendingPlayer: randomTarget,
                            itemId: 'raider_499497',
                            attacksPlanned: 1,
                            totalDamage: 25  // Raiders do 25 damage each
                        });
                        
                        totalAttacksScheduled++;
                        console.log(`🎲 DEBUG: Attack ${i + 1}: ${userId} → ${randomTarget} (25 damage)`);
                    }
                    
                    // Consume all attacks (they're scheduled now)
                    playerData[guildId].players[userId].safari.inventory['raider_499497'].numAttacksAvailable = 0;
                }
            }
            
            console.log(`🎯 DEBUG: HACKY MVP - Scheduled ${totalAttacksScheduled} random attacks for Round 1!`);
            
            // Save attack queue
            await saveSafariContent(safariData);
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
                            content: `# 🪣 Players Restocked\n\n**${playersRestocked} safari players** have been restocked to **${restockAmount} ${customTerms.currencyName}**:\n\n${playerDetails.join('\n')}\n\n✅ All players are ready for the next round!`
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
        
        safariData[guildId].safariConfig.currentRound = 1;
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
        
        await saveSafariContent(safariData);
        
        // Clear all player currency and inventories
        const playerData = await loadPlayerData();
        const players = playerData[guildId]?.players || {};
        
        let playersReset = 0;
        for (const [userId, data] of Object.entries(players)) {
            if (data.safari) {
                data.safari.currency = 0;
                data.safari.inventory = {};
                data.safari.history = [];
                data.safari.storeHistory = []; // Clear purchase history for clean per-game audit trails
                playersReset++;
            }
        }
        
        await savePlayerData(playerData);
        
        console.log(`✅ DEBUG: Reset complete - ${playersReset} players reset to round 1`);
        
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
                            content: `# Game Reset Complete\n\n**${playersReset} players** have been reset:\n• All currency set to 0\n• All inventories cleared\n• Game returned to Round 1\n\nThe Safari challenge can now begin again!`
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
async function createRoundResultsV2(guildId, roundData, customTerms) {
    try {
        console.log('🎨 DEBUG: Creating V2 round results display');
        console.log('🎨 DEBUG: Round data:', { 
            currentRound: roundData.currentRound, 
            eligiblePlayersCount: roundData.eligiblePlayers?.length,
            hasBalanceChanges: Object.keys(roundData.playerBalanceChanges || {}).length
        });
        
        const { 
            currentRound, 
            isGoodEvent, 
            eventName, 
            eventEmoji,
            eligiblePlayers,
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
        
        // Round 1 specific debugging
        if (currentRound === 1) {
            console.log(`🎯 DEBUG: ROUND 1 SPECIFIC - Eligible players: ${eligiblePlayers.length}`);
            console.log(`🎯 DEBUG: ROUND 1 SPECIFIC - Balance changes keys: ${Object.keys(playerBalanceChanges).length}`);
            console.log(`🎯 DEBUG: ROUND 1 SPECIFIC - Attacks by defender keys: ${Object.keys(attacksByDefender || {}).length}`);
        }
        
        console.log('🎨 DEBUG: Creating player result cards...');
        
        // Create player result cards
        const playerCards = await createPlayerResultCards(
            guildId, 
            eligiblePlayers, 
            roundData, 
            customTerms
        );
        
        console.log(`🎨 DEBUG: Created ${playerCards.length} player cards`);
        
        // Create header container
        const headerContainer = {
            type: 17, // Container
            accent_color: isGoodEvent ? 0x27ae60 : 0xe74c3c, // Green for good, red for bad
            components: [
                {
                    type: 10, // Text Display
                    content: `# 🎲 Round ${currentRound} Results\n\n## ${eventEmoji} ${eventName}\n\n**${eligiblePlayers.length} players participated** | **Total balance changes calculated below**`
                }
            ]
        };
        
        // Combine header with player cards
        const allComponents = [headerContainer, ...playerCards];
        
        // Component limit safeguard - Discord has a 40 component limit per message
        const componentCount = allComponents.length;
        console.log(`🔢 DEBUG: Total components before buttons: ${componentCount}`);
        console.log(`🔢 DEBUG: Component breakdown - Header: 1, Player cards: ${playerCards.length}, Total: ${componentCount}`);
        console.log(`🔢 DEBUG: Eligible players count: ${eligiblePlayers.length}`);
        console.log(`🔢 DEBUG: Current round: ${currentRound}`);
        
        // Check if we can add the inventory button (need to stay under 40 total components)
        const canAddButton = componentCount < 39; // Leave room for button container (1 more component)
        
        if (componentCount > 39) { // No room for any buttons
            console.log(`⚠️ WARNING: Component count ${componentCount} at Discord limit of 40`);
            console.log(`🔄 DEBUG: Too many players for V2 display with buttons, showing without buttons`);
        }
        
        // Add navigation buttons only if we have room
        if (canAddButton) {
            console.log(`✅ DEBUG: Adding inventory button (${componentCount + 1} total components)`);
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
                                emoji: { name: '🦕' } // Dinosaur emoji
                            }
                        ]
                    }
                ]
            };
            
            allComponents.push(buttonContainer);
        } else {
            console.log(`⚠️ DEBUG: Skipping inventory button - would exceed component limit (${componentCount + 1} > 40)`);
        }
        
        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                flags: (1 << 15), // IS_COMPONENTS_V2
                components: allComponents
            }
        };
        
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
 * @returns {Array} Array of player card containers
 */
async function createPlayerResultCards(guildId, eligiblePlayers, roundData, customTerms) {
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
        
        // Combine all content into a single Text Display - ULTRA COMPACT FORMAT
        let content = `# ${getPlayerEmoji(player.playerName)} ${player.playerName}\n`;
        content += `Start: ${balanceChange.starting}${customTerms.currencyEmoji}\n\n`;
        
        // Income section
        const incomeBreakdown = formatIncomeBreakdown(
            player, 
            items, 
            isGoodEvent, 
            eventName, 
            eventEmoji, 
            customTerms
        );
        content += incomeBreakdown + '\n\n';
        
        // Combat section - pass player inventory for defense calculation
        const combatResults = formatCombatResults(
            attacksReceived, 
            items, 
            customTerms,
            player.inventory || {}
        );
        content += combatResults + '\n\n';
        
        // Final balance - ULTRA COMPACT: no emoji, no parentheses display
        content += `Final: ${balanceChange.ending}${customTerms.currencyEmoji}`;
        
        // Create container with accent color based on change - SINGLE COMPONENT
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
        let content = `## 📈 INCOME\n${eventEmoji} ${eventName}\n\n`;
        
        const inventory = player.inventory || {};
        const inventoryItems = Object.entries(inventory);
        
        if (inventoryItems.length === 0) {
            content += `Total: 0${customTerms.currencyEmoji}`;
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
            content += `Total: 0${customTerms.currencyEmoji}`;
        } else {
            // Format each income item - ULTRA COMPACT: emoji quantity×value: total
            for (const item of incomeItems) {
                content += `${item.emoji} ${item.quantity}x${item.unitValue}: ${item.totalValue}${customTerms.currencyEmoji}\n`;
            }
            content += `\nTotal: ${totalIncome}${customTerms.currencyEmoji}`;
        }
        
        return content;
        
    } catch (error) {
        console.error('Error formatting income breakdown:', error);
        return '## 📈 INCOME\n❌ Error';
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
        let content = '## ⚔️ COMBAT\n';
        
        if (attacksReceived.length === 0) {
            content += `Combat Damage: 0${customTerms.currencyEmoji}`;
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
        
        // Format attack summary - ULTRA COMPACT: emoji🗡️ quantity×damage (total)
        const attackSummary = Object.entries(attackItems)
            .map(([emoji, data]) => `${emoji}🗡️ ${data.quantity}x${data.unitDamage} (${data.totalDamage})`)
            .join(' ');
        
        // Format defense summary - ULTRA COMPACT: emoji🛡️ quantity×defense (total)
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
        content += `Combat Damage: ${netDamage > 0 ? '-' : ''}${netDamage}${customTerms.currencyEmoji}`;
        
        return content;
        
    } catch (error) {
        console.error('Error formatting combat results:', error);
        return '## ⚔️ COMBAT\n❌ Error';
    }
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

export {
    createCustomButton,
    getCustomButton,
    listCustomButtons,
    executeButtonActions,
    postButtonToChannel,
    getCurrency,
    updateCurrency,
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
    getPlayerEmoji
};