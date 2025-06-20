import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionResponseType,
    InteractionResponseFlags
} from 'discord.js';
import { loadPlayerData, savePlayerData } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAFARI_CONTENT_FILE = path.join(__dirname, 'safariContent.json');

/**
 * Safari Manager Module for CastBot
 * Handles dynamic content creation, button management, and action execution
 */

// Button style mapping
const BUTTON_STYLES = {
    'Primary': ButtonStyle.Primary,
    'Secondary': ButtonStyle.Secondary,
    'Success': ButtonStyle.Success,
    'Danger': ButtonStyle.Danger
};

/**
 * Ensure safari content file exists with proper structure
 */
async function ensureSafariContentFile() {
    try {
        const exists = await fs.access(SAFARI_CONTENT_FILE).then(() => true).catch(() => false);
        
        if (!exists) {
            const initialData = {
                "/* Guild ID */": {
                    "buttons": {},
                    "safaris": {},
                    "applications": {}
                }
            };
            await fs.writeFile(SAFARI_CONTENT_FILE, JSON.stringify(initialData, null, 2));
            console.log('✅ Created safariContent.json');
        }
        
        return JSON.parse(await fs.readFile(SAFARI_CONTENT_FILE, 'utf8'));
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
        
        // Initialize guild data if needed
        if (!safariData[guildId]) {
            safariData[guildId] = {
                buttons: {},
                safaris: {},
                applications: {}
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
        
        // Initialize structures if needed
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
                inventory: {}
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
                case 'display_text':
                    result = await executeDisplayText(action.config, interaction);
                    responses.push(result);
                    break;
                    
                case 'update_currency':
                    result = await executeUpdateCurrency(action.config, userId, guildId, interaction);
                    responses.push(result);
                    break;
                    
                case 'follow_up_button':
                    result = await executeFollowUpButton(action.config, guildId, interaction);
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
            discordButton.setEmoji(button.emoji);
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

export {
    createCustomButton,
    getCustomButton,
    listCustomButtons,
    executeButtonActions,
    postButtonToChannel,
    getCurrency,
    updateCurrency,
    generateCustomId
};