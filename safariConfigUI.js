/**
 * Safari Configuration UI Manager
 * Creates Components V2 interface for Safari customization using field groups
 * Replaces legacy single-modal approach with grouped field editing
 */

import { EDIT_CONFIGS, EDIT_TYPES } from './editFramework.js';

/**
 * Create Safari customization interface using Components V2
 * @param {string} guildId - Discord guild ID
 * @param {Object} currentConfig - Current safari configuration
 * @returns {Object} Discord Components V2 interface
 */
export async function createSafariCustomizationUI(guildId, currentConfig) {
    const config = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG];
    
    // Create field group buttons
    const fieldGroupButtons = [];
    Object.entries(config.fieldGroups).forEach(([groupKey, groupConfig]) => {
        fieldGroupButtons.push({
            type: 2, // Button
            custom_id: `safari_config_group_${groupKey}`,
            label: groupConfig.label,
            style: 2, // Secondary
            emoji: { name: getGroupEmoji(groupKey) }
        });
    });

    // Add global stamina settings button (admin only)
    fieldGroupButtons.push({
        type: 2, // Button
        custom_id: 'stamina_global_config',
        label: 'Stamina Settings',
        style: 2, // Secondary
        emoji: { name: '⚡' }
    });

    // Create Components V2 Container
    const containerComponents = [
        {
            type: 10, // Text Display component
            content: `## ⚙️ Customize Safari Settings\n\nPersonalize your Safari experience with custom terminology, event names, and game mechanics.\n\n**Current Settings:**`
        },
        {
            type: 10, // Text Display component  
            content: createCurrentSettingsDisplay(currentConfig)
        },
        {
            type: 14 // Separator
        },
        {
            type: 10, // Text Display component
            content: `**Select a category to customize:**`
        },
        {
            type: 1, // Action Row
            components: fieldGroupButtons
        },
        {
            type: 14 // Separator
        },
        {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button  
                    custom_id: 'prod_safari_menu',
                    label: '← Back to Safari',
                    style: 2, // Secondary
                    emoji: { name: '🦁' }
                },
                {
                    type: 2, // Button
                    custom_id: 'safari_export_data',
                    label: 'Export',
                    style: 2, // Secondary (grey)
                    emoji: { name: '⚙️' }
                },
                {
                    type: 2, // Button
                    custom_id: 'safari_import_data', 
                    label: 'Import',
                    style: 2, // Secondary (grey)
                    emoji: { name: '⚙️' }
                },
                {
                    type: 2, // Button
                    custom_id: 'safari_config_reset_defaults',
                    label: 'Reset to Defaults',
                    style: 4, // Danger
                    emoji: { name: '🔄' }
                }
            ]
        }
    ];

    const safariConfigContainer = {
        type: 17, // Container component
        accent_color: 0x9b59b6, // Purple accent for customization
        components: containerComponents
    };

    return {
        flags: (1 << 15), // IS_COMPONENTS_V2 flag
        components: [safariConfigContainer]
    };
}

/**
 * Create field group modal for specific customization category
 * @param {string} groupKey - Field group key (currency, events, rounds)
 * @param {Object} currentConfig - Current safari configuration
 * @returns {Object} Discord modal
 */
export async function createFieldGroupModal(groupKey, currentConfig) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    
    const config = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG];
    const groupConfig = config.fieldGroups[groupKey];
    
    if (!groupConfig) {
        throw new Error(`Unknown field group: ${groupKey}`);
    }

    const modal = new ModalBuilder()
        .setCustomId(`safari_config_modal_${groupKey}`)
        .setTitle(`${groupConfig.label} Settings`);

    const components = [];
    
    Object.entries(groupConfig.fields).forEach(([fieldKey, fieldConfig]) => {
        const input = new TextInputBuilder()
            .setCustomId(fieldKey)
            .setLabel(fieldConfig.label)
            .setStyle(fieldConfig.type === 'textarea' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(fieldConfig.required || false)
            .setMaxLength(fieldConfig.maxLength || 100);
        
        if (fieldConfig.placeholder) {
            input.setPlaceholder(fieldConfig.placeholder);
        }
        
        // Pre-populate with current value
        let currentValue = currentConfig[fieldKey];
        
        // Special handling for inventoryEmoji - always ensure default
        if (fieldKey === 'inventoryEmoji' && !currentValue) {
            currentValue = '🧰';
        }
        
        if (currentValue !== undefined && currentValue !== null) {
            input.setValue(String(currentValue));
        }
        
        components.push(new ActionRowBuilder().addComponents(input));
    });
    
    modal.addComponents(components.slice(0, 5)); // Discord modal limit
    return modal;
}

/**
 * Process field group modal submission
 * @param {string} groupKey - Field group key 
 * @param {Object} modalData - Modal submission data
 * @returns {Object} Processed field updates
 */
export function processFieldGroupSubmission(groupKey, modalData) {
    const config = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG];
    const groupConfig = config.fieldGroups[groupKey];
    
    if (!groupConfig) {
        throw new Error(`Unknown field group: ${groupKey}`);
    }

    const updates = {};
    const components = modalData.components;

    Object.entries(groupConfig.fields).forEach(([fieldKey, fieldConfig], index) => {
        const value = components[index]?.components[0]?.value;
        
        if (value !== undefined && value !== '') {
            if (fieldConfig.type === 'number') {
                const num = parseInt(value, 10);
                if (!isNaN(num)) {
                    updates[fieldKey] = num;
                }
            } else {
                updates[fieldKey] = value.trim();
            }
        }
    });

    return updates;
}

/**
 * Create current settings display for the main interface
 * @param {Object} config - Current safari configuration  
 * @returns {string} Formatted settings display
 */
function createCurrentSettingsDisplay(config) {
    const currencyEmoji = config.currencyEmoji || '🪙';
    const currencyName = config.currencyName || 'coins';
    const inventoryName = config.inventoryName || 'Nest';
    const inventoryEmoji = config.inventoryEmoji || '🧰';
    
    let display = `**🪙 Currency & Inventory**\n`;
    display += `• Currency Name: ${currencyName}\n`;
    display += `• Currency Emoji: ${currencyEmoji}\n`;
    display += `• Inventory Name: ${inventoryName}\n`;
    display += `• Inventory Emoji: ${inventoryEmoji}\n`;
    display += `• Default Starting Currency: ${config.defaultStartingCurrencyValue || 100}\n\n`;
    
    if (config.goodEventName || config.badEventName || config.goodEventEmoji || config.badEventEmoji) {
        display += `**☄️ Events**\n`;
        if (config.goodEventName) {
            display += `• Good Event Name: ${config.goodEventName}\n`;
        }
        if (config.goodEventEmoji) {
            display += `• Good Event Emoji: ${config.goodEventEmoji}\n`;
        }
        if (config.badEventName) {
            display += `• Bad Event Name: ${config.badEventName}\n`;
        }
        if (config.badEventEmoji) {
            display += `• Bad Event Emoji: ${config.badEventEmoji}\n`;
        }
        display += `\n`;
    }
    
    if (config.round1GoodProbability !== undefined || 
        config.round2GoodProbability !== undefined || 
        config.round3GoodProbability !== undefined) {
        display += `**🎲 Round Probabilities**\n`;
        if (config.round1GoodProbability !== undefined) {
            const goodPercent = config.round1GoodProbability;
            const badPercent = 100 - goodPercent;
            display += `• Round 1: Good ${goodPercent}% | Bad ${badPercent}%\n`;
        }
        if (config.round2GoodProbability !== undefined) {
            const goodPercent = config.round2GoodProbability;
            const badPercent = 100 - goodPercent;
            display += `• Round 2: Good ${goodPercent}% | Bad ${badPercent}%\n`;
        }
        if (config.round3GoodProbability !== undefined) {
            const goodPercent = config.round3GoodProbability;
            const badPercent = 100 - goodPercent;
            display += `• Round 3: Good ${goodPercent}% | Bad ${badPercent}%\n`;
        }
    }

    return display;
}

/**
 * Get emoji for field group buttons
 * @param {string} groupKey - Field group key
 * @returns {string} Emoji character
 */
function getGroupEmoji(groupKey) {
    const emojis = {
        currency: '🪙',
        events: '☄️', 
        rounds: '🎲'
    };
    return emojis[groupKey] || '⚙️';
}

/**
 * Create reset confirmation interface
 * @returns {Object} Discord Components V2 confirmation interface
 */
export function createResetConfirmationUI() {
    const containerComponents = [
        {
            type: 10, // Text Display component
            content: `## ⚠️ Reset Safari Settings\n\nAre you sure you want to reset all Safari customizations to default values?\n\n**This will reset:**\n• Currency name back to "coins" 🪙\n• Inventory name back to "Nest"\n• Event names back to defaults\n• Round probabilities back to 75%, 50%, 25%\n\n**This action cannot be undone.**`
        },
        {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button
                    custom_id: 'safari_customize_terms',
                    label: 'Cancel',
                    style: 2, // Secondary
                    emoji: { name: '❌' }
                },
                {
                    type: 2, // Button
                    custom_id: 'safari_config_confirm_reset',
                    label: 'Yes, Reset All',
                    style: 4, // Danger
                    emoji: { name: '🔄' }
                }
            ]
        }
    ];

    const resetContainer = {
        type: 17, // Container component
        accent_color: 0xed4245, // Red accent for warning
        components: containerComponents
    };

    return {
        flags: (1 << 15), // IS_COMPONENTS_V2 flag
        components: [resetContainer]
    };
}