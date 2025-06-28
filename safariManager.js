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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAFARI_CONTENT_FILE = path.join(__dirname, 'safariContent.json');

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
    RANDOM_OUTCOME: 'random_outcome'     // NEW: MVP2
};

// Condition types for conditional actions
const CONDITION_TYPES = {
    CURRENCY_GTE: 'currency_gte',       // Currency >= value
    CURRENCY_LTE: 'currency_lte',       // Currency <= value
    HAS_ITEM: 'has_item',               // Player has item
    NOT_HAS_ITEM: 'not_has_item',       // Player doesn't have item
    BUTTON_USED: 'button_used',         // Button used N times
    COOLDOWN_EXPIRED: 'cooldown_expired' // Cooldown expired
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
 * Load safari content data
 */
async function loadSafariContent() {
    return await ensureSafariContentFile();
}

/**
 * Save safari content data
 */
async function saveSafariContent(data) {
    try {
        await fs.writeFile(SAFARI_CONTENT_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Safari content saved successfully');
    } catch (error) {
        console.error('Error saving safari content:', error);
        throw error;
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
        
        const safariData = await loadSafariContent();
        
        // Initialize guild data with MVP2 structure if needed
        if (!safariData[guildId]) {
            safariData[guildId] = {
                buttons: {},
                safaris: {},
                applications: {},
                stores: {},      // NEW: MVP2
                items: {}       // NEW: MVP2
            };
        }
        
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
        const safariData = await loadSafariContent();
        return safariData[guildId]?.buttons?.[buttonId] || null;
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
        flags: (1 << 15), // IS_COMPONENTS_V2
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
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: [container]
    };
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
        
        for (const action of sortedActions) {
            let result;
            
            switch (action.type) {
                case ACTION_TYPES.DISPLAY_TEXT:
                case 'display_text': // Legacy support
                    result = await executeDisplayText(action.config, interaction);
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
                    
                default:
                    console.log(`⚠️ Unknown action type: ${action.type}`);
            }
        }
        
        // Return the first display_text response as main response
        // Other actions (currency, follow-ups) execute as side effects
        const displayResponse = responses.find(r => r.components) || responses[0];
        const mainResponse = displayResponse || {
            content: '✅ Button action completed successfully!',
            flags: InteractionResponseFlags.EPHEMERAL
        };
        
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
 */
async function addItemToInventory(guildId, userId, itemId, quantity = 1) {
    try {
        const playerData = await loadPlayerData();
        
        // Initialize structures
        if (!playerData[guildId]) playerData[guildId] = { players: {} };
        if (!playerData[guildId].players[userId]) playerData[guildId].players[userId] = {};
        if (!playerData[guildId].players[userId].safari) {
            playerData[guildId].players[userId].safari = {
                currency: 0, history: [], lastInteraction: Date.now(),
                achievements: [], inventory: {}, cooldowns: {}, buttonUses: {}, storeHistory: []
            };
        }
        
        const currentItem = playerData[guildId].players[userId].safari.inventory[itemId];
        let currentQuantity = 0;
        
        console.log(`🔍 DEBUG: addItemToInventory - BEFORE: ${itemId} = `, currentItem);
        
        // Handle both object and number inventory formats
        if (typeof currentItem === 'object' && currentItem !== null) {
            currentQuantity = currentItem.quantity || 0;
            console.log(`🔍 DEBUG: Object format - current quantity: ${currentQuantity}, adding: ${quantity}`);
            // Update the existing object
            playerData[guildId].players[userId].safari.inventory[itemId] = {
                ...currentItem,
                quantity: currentQuantity + quantity
            };
        } else {
            // Simple number format or first purchase
            currentQuantity = currentItem || 0;
            console.log(`🔍 DEBUG: Number format - current quantity: ${currentQuantity}, adding: ${quantity}`);
            playerData[guildId].players[userId].safari.inventory[itemId] = currentQuantity + quantity;
        }
        
        console.log(`🔍 DEBUG: addItemToInventory - AFTER: ${itemId} = `, playerData[guildId].players[userId].safari.inventory[itemId]);
        
        await savePlayerData(playerData);
        console.log(`✅ DEBUG: PlayerData saved to disk`);
        
        console.log(`📦 DEBUG: Added ${quantity}x ${itemId} to user ${userId} inventory`);
        
        // Return the final quantity (handle both object and number formats)
        const finalItem = playerData[guildId].players[userId].safari.inventory[itemId];
        const returnValue = typeof finalItem === 'object' ? finalItem.quantity : finalItem;
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
                emoji: { name: emoji }
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
            
            // Add items with separators between them
            for (let i = 0; i < inventoryItems.length; i++) {
                const [itemId, inventoryData] = inventoryItems[i];
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
                    // Calculate attacks planned for this item
                    const attacksPlanned = await calculateAttacksPlanned(guildId, userId, itemId);
                    
                    // Generate item content with attack info
                    let attackItemContent = generateItemContent(item, customTerms, quantity);
                    
                    // Add attack availability info
                    if (attacksPlanned > 0) {
                        attackItemContent += `\n> \`Attacks Available: ${numAttacksAvailable}\``;
                        attackItemContent += `\n> 🎯 **Attacks Planned:** ${attacksPlanned}`;
                    } else {
                        attackItemContent += `\n> \`Attacks Available: ${numAttacksAvailable}\``;
                    }
                    
                    // Create Section component with attack button
                    components.push({
                        type: 9, // Section component
                        components: [
                            {
                                type: 10, // Text Display
                                content: attackItemContent
                            }
                        ],
                        accessory: {
                            type: 2, // Button
                            custom_id: `safari_attack_player_${itemId}`,
                            label: '⚔️ Attack Player',
                            style: 1 // Primary (blue)
                        }
                    });
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
                    content: `# Round ${currentRound} Results\n\n## ${eventEmoji} ${eventName}\n\n*No eligible players found. Players need currency ≥ 1 or items in inventory to participate.*`
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
            for (const [itemId, quantity] of Object.entries(player.inventory)) {
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
        
        // Create round results output
        const output = await createRoundResultsOutput(guildId, currentRound, eventType, eventName, eventEmoji, playerResults, customTerms);
        
        // Advance to next round or complete game
        if (currentRound < 3) {
            // Advance to next round
            safariConfig.currentRound = currentRound + 1;
            await saveSafariContent(safariData);
        } else {
            // Round 3 completed - show final rankings and set to round 4 (reset state)
            safariConfig.currentRound = 4;
            await saveSafariContent(safariData);
            return await createFinalRankings(guildId, playerResults, eventType, eventName, eventEmoji);
        }
        
        return output;
        
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
            const hasInventory = Object.keys(inventory).length > 0 && Object.values(inventory).some(qty => qty > 0);
            
            console.log(`🔍 DEBUG: Player ${userId}: currency=${currency}, inventory=${JSON.stringify(inventory)}, hasInventory=${hasInventory}`);
            
            if (currency >= 1 || hasInventory) {
                // Get player name from Discord client if available - use multiple fallback strategies
                let playerName = `Player ${userId.slice(-4)}`;
                try {
                    // Try to get fresh name from guild member
                    const guild = client?.guilds?.cache?.get(guildId);
                    if (guild) {
                        const member = await guild?.members?.fetch(userId);
                        if (member) {
                            playerName = member.displayName || member.user?.globalName || member.user?.username || playerName;
                        }
                    }
                } catch (e) {
                    console.log(`🔍 DEBUG: Discord client lookup failed for ${userId}, using fallback`);
                }
                
                // Enhanced fallback to stored data if Discord lookup failed
                if (playerName.startsWith('Player ')) {
                    playerName = data.globalName || data.displayName || data.username || playerName;
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
 * Create round results output with Components V2 formatting
 */
async function createRoundResultsOutput(guildId, currentRound, eventType, eventName, eventEmoji, playerResults, customTerms) {
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
                            content: `**Player Results:**\n${playerSummary}${nextRoundMsg}`
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
                            components: [{
                                type: 2, // Button
                                custom_id: 'safari_manage_currency',
                                label: 'Manage Currency',
                                style: 2, // Secondary
                                emoji: { name: '💰' }
                            }]
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
                } else if (typeof itemData === 'object' && itemData !== null && !itemData.numAttacksAvailable) {
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
        console.log(`⚔️ DEBUG: Creating/updating attack UI - Target: ${targetId}, Quantity: ${selectedQuantity}`);
        
        const safariData = await loadSafariContent();
        const playerData = await loadPlayerData();
        const customTerms = await getCustomTerms(guildId);
        
        // Get item details
        const item = safariData[guildId]?.items?.[itemId];
        if (!item) {
            return {
                type: InteractionResponseType.UPDATE_MESSAGE,
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
                type: InteractionResponseType.UPDATE_MESSAGE,
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
        
        // Get eligible players (excluding attacker)
        const eligiblePlayers = await getEligiblePlayersFixed(guildId, client);
        const targetPlayers = eligiblePlayers.filter(p => p.userId !== attackerId);
        
        if (targetPlayers.length === 0) {
            return {
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                    content: '❌ No eligible players to attack.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Get attacks planned
        const attacksPlanned = await calculateAttacksPlanned(guildId, attackerId, itemId);
        
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
        
        // Get planned attacks for display
        const plannedAttacks = await getPlannedAttacks(guildId, attackerId, itemId);
        let attacksPlannedText = '';
        
        if (plannedAttacks.length > 0) {
            attacksPlannedText = '\n\n**Attacks Planned**\n';
            for (const attack of plannedAttacks) {
                // Get target name for each planned attack
                let plannedTargetName = `Player ${attack.defendingPlayer.slice(-4)}`;
                try {
                    const guild = client?.guilds?.cache?.get(guildId);
                    const plannedTarget = await guild?.members?.fetch(attack.defendingPlayer);
                    plannedTargetName = plannedTarget?.displayName || plannedTarget?.user?.username || plannedTargetName;
                } catch (e) {
                    // Use fallback
                }
                
                attacksPlannedText += `• **${attack.attackingPlayerName || 'You'}** will attack **${plannedTargetName}** with ${attack.attacksPlanned}x ${attack.itemName} (${attack.attackValue} dmg), totaling ${attack.totalDamage} damage during round ${attack.round}\n`;
            }
        }
        
        const components = [];
        
        // Header
        components.push({
            type: 10, // Text Display
            content: `## ⚔️ Attack Player with ${item.name}\n\nSelect a player to attack. They will be attacked when round results are announced.`
        });
        
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
                default: targetId === player.userId
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
                    placeholder: targetId ? `Selected: ${targetName}` : 'Select a player to attack',
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
        
        // Divider
        components.push({ type: 14 }); // Separator
        
        // Attack info display
        const infoContent = `**Target Player:** ${targetName}\n**Number of available attacks:** ${numAttacksAvailable}\n**Attacks planned this round:** ${attacksPlanned}\n**Damage per attack:** ${item.attackValue}\n**Total attack damage this round:** ${totalDamage}${attacksPlannedText}`;
        
        components.push({
            type: 10, // Text Display
            content: infoContent
        });
        
        // Divider
        components.push({ type: 14 }); // Separator
        
        // String select for attack quantity
        const attackOptions = [];
        
        if (numAttacksAvailable === 0) {
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
                    : `Attack ${targetName !== '*Select a player above*' ? targetName : 'target'} with ${i} ${item.name}`;
                    
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
                    custom_id: `safari_attack_quantity|${itemId}|${targetId || 'none'}`,
                    placeholder: selectedQuantity > 0 ? `Selected: ${selectedQuantity} attacks` : `Select number of ${item.name} attacks`,
                    options: attackOptions,
                    disabled: numAttacksAvailable === 0
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
                    custom_id: `safari_schedule_attack_${itemId}_${targetId || 'none'}_${selectedQuantity}`,
                    label: '⚔️ Schedule Attack',
                    style: 3, // Success (green)
                    disabled: numAttacksAvailable === 0 || !targetId || selectedQuantity === 0
                }
            ]
        };
        components.push(buttonRow);
        
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
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // Components V2 + Ephemeral
                components: [container]
            }
        };
        
    } catch (error) {
        console.error('Error creating/updating attack UI:', error);
        return {
            type: InteractionResponseType.UPDATE_MESSAGE,
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
        const targetId = parts[4] !== 'none' ? parts[4] : null;
        const quantity = parseInt(parts[5]) || 0;
        
        console.log(`⚔️ DEBUG: Parsed state - Target: ${targetId}, Quantity: ${quantity}`);
        
        if (!targetId || quantity === 0) {
            return {
                type: InteractionResponseType.UPDATE_MESSAGE,
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
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                    content: '❌ Item not found.',
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
        
        // Create attack record
        const attackRecord = {
            attackingPlayer: attackerId,
            attackingPlayerName: attackerName,
            defendingPlayer: targetId,
            itemId: itemId,
            itemName: item.name,
            attacksPlanned: quantity,
            attackValue: item.attackValue || 0,
            totalDamage: quantity * (item.attackValue || 0)
        };
        
        // Add to queue
        const success = await addAttackToQueue(guildId, attackRecord);
        if (!success) {
            return {
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                    content: '❌ Failed to schedule attack. Please try again.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // NOTE: Attack availability is NOT reduced here - it's only reduced during round results
        // This allows players to see their items in inventory until attacks are actually executed
        
        // Get updated interface showing the scheduled attack
        const response = await createOrUpdateAttackUI(guildId, attackerId, itemId, targetId, 0, client);
        
        // Add success message
        if (response.data && !response.data.content) {
            response.data.content = `✅ Attack scheduled! ${quantity} ${item.name} will attack the selected player during round results.`;
        }
        
        return response;
        
    } catch (error) {
        console.error('Error scheduling attack:', error);
        return {
            type: InteractionResponseType.UPDATE_MESSAGE,
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
    updateCustomTerms,
    resetCustomTerms,
    // Challenge Game Logic exports
    processRoundResults,
    createRoundResultsOutput,
    createFinalRankings,
    resetGameData,
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
    createOrUpdateAttackUI
};