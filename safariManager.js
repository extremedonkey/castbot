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
 * shop systems, inventory management, and conditional actions
 */

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
    SHOP_DISPLAY: 'shop_display',        // NEW: MVP2
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
                    "shops": {},      // NEW: MVP2 - Multiple shops per server
                    "items": {}       // NEW: MVP2 - Reusable items across shops
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
                if (!data[guildId].shops) {
                    data[guildId].shops = {};
                    updated = true;
                }
                if (!data[guildId].items) {
                    data[guildId].items = {};
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
                shops: {},      // NEW: MVP2
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
                shopHistory: []         // NEW: MVP2 - Purchase history
            };
        }
        
        const currentCurrency = playerData[guildId].players[userId].safari.currency;
        const newCurrency = Math.max(0, currentCurrency + amount); // Don't go below 0
        
        playerData[guildId].players[userId].safari.currency = newCurrency;
        playerData[guildId].players[userId].safari.lastInteraction = Date.now();
        
        await savePlayerData(playerData);
        
        console.log(`💰 DEBUG: Currency updated for user ${userId}: ${currentCurrency} → ${newCurrency} (${amount >= 0 ? '+' : ''}${amount})`);
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
    console.log(`💰 DEBUG: Executing currency update: ${config.amount} for user ${userId}`);
    
    const newBalance = await updateCurrency(guildId, userId, config.amount);
    
    let message = config.message || `Currency updated!`;
    
    // Add balance info
    const sign = config.amount >= 0 ? '+' : '';
    message += `\n\n💰 **${sign}${config.amount} coins**`;
    message += `\nYour balance: **${newBalance} coins**`;
    
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
                    
                case ACTION_TYPES.SHOP_DISPLAY:
                    result = await executeShopDisplay(action.config, guildId, userId, interaction);
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
        
        // For MVP1, return the first non-ephemeral response
        // or combine them if needed
        const mainResponse = responses.find(r => !r.flags) || responses[0];
        
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
 * MVP2: Shop Management Functions
 */

/**
 * Create a new shop
 */
async function createShop(guildId, shopData, userId) {
    try {
        console.log(`🏪 DEBUG: Creating shop for guild ${guildId} by user ${userId}`);
        
        const safariData = await loadSafariContent();
        
        if (!safariData[guildId]) {
            safariData[guildId] = { buttons: {}, safaris: {}, applications: {}, shops: {}, items: {} };
        }
        
        const shopId = generateButtonId(shopData.name); // Reuse ID generation
        
        const shop = {
            id: shopId,
            name: shopData.name,
            description: shopData.description || '',
            emoji: shopData.emoji || '🏪',
            items: shopData.items || [], // Array of {itemId, price}
            settings: {
                shopkeeperText: shopData.shopkeeperText || 'Welcome to my shop!',
                accentColor: shopData.accentColor || 0x2ecc71,
                requiresRole: shopData.requiresRole || null
            },
            metadata: {
                createdBy: userId,
                createdAt: Date.now(),
                lastModified: Date.now(),
                totalSales: 0
            }
        };
        
        safariData[guildId].shops[shopId] = shop;
        await saveSafariContent(safariData);
        
        console.log(`✅ DEBUG: Shop '${shopId}' created successfully`);
        return shopId;
    } catch (error) {
        console.error('Error creating shop:', error);
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
            safariData[guildId] = { buttons: {}, safaris: {}, applications: {}, shops: {}, items: {} };
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
            metadata: {
                createdBy: userId,
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
                achievements: [], inventory: {}, cooldowns: {}, buttonUses: {}, shopHistory: []
            };
        }
        
        const currentQuantity = playerData[guildId].players[userId].safari.inventory[itemId] || 0;
        playerData[guildId].players[userId].safari.inventory[itemId] = currentQuantity + quantity;
        
        await savePlayerData(playerData);
        
        console.log(`📦 DEBUG: Added ${quantity}x ${itemId} to user ${userId} inventory`);
        return playerData[guildId].players[userId].safari.inventory[itemId];
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
        const currency = await getCurrency(guildId, userId);
        const inventory = await getPlayerInventory(guildId, userId);
        const safariData = await loadSafariContent();
        const items = safariData[guildId]?.items || {};
        
        let display = `## 💰 Your Safari Status\n\n`;
        display += `**Currency:** ${currency} coins\n\n`;
        
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
 * Create shop display with 40-component limit handling
 */
async function createShopDisplay(guildId, shopId, userId) {
    try {
        console.log(`🏪 DEBUG: Creating shop display for ${shopId}`);
        
        const safariData = await loadSafariContent();
        const shop = safariData[guildId]?.shops?.[shopId];
        const items = safariData[guildId]?.items || {};
        
        if (!shop) {
            return {
                content: '❌ Shop not found.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Check if user has required role (if any)
        if (shop.settings.requiresRole) {
            // This would need to be checked in the caller with Discord member data
            console.log(`🔍 DEBUG: Shop ${shopId} requires role ${shop.settings.requiresRole}`);
        }
        
        const components = [];
        
        // Shopkeeper header text
        components.push({
            type: 10, // Text Display
            content: `# ${shop.emoji} ${shop.name}\n\n*${shop.settings.shopkeeperText}*`
        });
        
        // Shop description if provided
        if (shop.description) {
            components.push({
                type: 10, // Text Display  
                content: shop.description
            });
        }
        
        // Add separator
        components.push({ type: 14 }); // Separator
        
        // Calculate component limit for items
        // Container = 1, Header text = 1, Description = 1 (if exists), Separator = 1
        // Each item section = 3 components (1 section + 1 text display + 1 button)
        const usedComponents = 3 + (shop.description ? 1 : 0); // Container + header + separator + desc?
        const maxItemSections = Math.floor((40 - usedComponents) / 3); // Each item = 3 components
        
        // Get shop items with their prices
        const shopItems = shop.items || [];
        const displayItems = shopItems.slice(0, maxItemSections); // Limit to fit
        
        console.log(`🔢 DEBUG: Displaying ${displayItems.length}/${shopItems.length} items (max: ${maxItemSections})`);
        
        // Add item sections
        for (const shopItem of displayItems) {
            const item = items[shopItem.itemId];
            if (!item) continue;
            
            // Item section
            const itemSection = {
                type: 9, // Section
                components: [
                    {
                        type: 10, // Text Display
                        content: `## ${item.emoji} ${item.name}\n${item.description || 'No description'}\n\n**Price:** ${shopItem.price || item.basePrice} coins`
                    }
                ]
            };
            
            // Add buy button if user can afford it
            const userCurrency = await getCurrency(guildId, userId);
            const price = shopItem.price || item.basePrice;
            
            const buyButton = new ButtonBuilder()
                .setCustomId(`safari_buy_${guildId}_${shopId}_${item.id}_${Date.now()}`)
                .setLabel(`Buy (${price} coins)`)
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
        if (shopItems.length > displayItems.length) {
            components.push({
                type: 10,
                content: `⚠️ **Note:** This shop has ${shopItems.length} items, but only ${displayItems.length} can be displayed due to Discord limits.`
            });
        }
        
        const container = {
            type: 17, // Container
            accent_color: shop.settings.accentColor,
            components: components
        };
        
        return {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [container]
        };
        
    } catch (error) {
        console.error('Error creating shop display:', error);
        return {
            content: '❌ Error loading shop. Please try again.',
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
 * Execute shop display action - MVP2
 */
async function executeShopDisplay(config, guildId, userId, interaction) {
    try {
        console.log(`🏪 DEBUG: Executing shop display for ${config.shopId}`);
        return await createShopDisplay(guildId, config.shopId, userId);
    } catch (error) {
        console.error('Error executing shop display:', error);
        return {
            content: '❌ Error loading shop.',
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
async function buyItem(guildId, shopId, itemId, userId) {
    try {
        console.log(`💳 DEBUG: User ${userId} buying ${itemId} from shop ${shopId}`);
        
        const safariData = await loadSafariContent();
        const shop = safariData[guildId]?.shops?.[shopId];
        const item = safariData[guildId]?.items?.[itemId];
        
        if (!shop || !item) {
            return {
                content: '❌ Shop or item not found.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        // Find item in shop to get price
        const shopItem = shop.items.find(si => si.itemId === itemId);
        if (!shopItem) {
            return {
                content: '❌ Item not available in this shop.',
                flags: InteractionResponseFlags.EPHEMERAL
            };
        }
        
        const price = shopItem.price || item.basePrice;
        const userCurrency = await getCurrency(guildId, userId);
        
        // Check if user can afford it
        if (userCurrency < price) {
            return {
                content: `❌ You need ${price} coins but only have ${userCurrency} coins.`,
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
        
        // Update shop sales stats
        if (safariData[guildId]?.shops?.[shopId]) {
            safariData[guildId].shops[shopId].metadata.totalSales++;
        }
        if (safariData[guildId]?.items?.[itemId]) {
            safariData[guildId].items[itemId].metadata.totalSold++;
        }
        await saveSafariContent(safariData);
        
        // Add to purchase history
        const playerData = await loadPlayerData();
        if (playerData[guildId]?.players?.[userId]?.safari) {
            playerData[guildId].players[userId].safari.shopHistory.push({
                itemId,
                shopId,
                price,
                timestamp: Date.now()
            });
            await savePlayerData(playerData);
        }
        
        const newBalance = await getCurrency(guildId, userId);
        
        return {
            content: `✅ **Purchase Successful!**\n\nYou bought ${item.emoji} **${item.name}** for ${price} coins.\n\n💰 New balance: **${newBalance} coins**`,
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

export {
    createCustomButton,
    getCustomButton,
    listCustomButtons,
    executeButtonActions,
    postButtonToChannel,
    getCurrency,
    updateCurrency,
    generateCustomId,
    loadSafariContent,
    saveSafariContent,
    // MVP2 exports
    createShop,
    createItem,
    getPlayerInventory,
    addItemToInventory,
    checkCondition,
    getCurrencyAndInventoryDisplay,
    createShopDisplay,
    buyItem,
    executeConditionalAction,
    executeShopDisplay,
    executeRandomOutcome,
    ACTION_TYPES,
    CONDITION_TYPES
};