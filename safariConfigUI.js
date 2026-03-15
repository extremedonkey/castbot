/**
 * Safari Configuration UI Manager
 * Creates Components V2 interface for Safari customization using field groups
 * Replaces legacy single-modal approach with grouped field editing
 */

import { EDIT_CONFIGS, EDIT_TYPES } from './editFramework.js';
import { loadPlayerData } from './storage.js';

/**
 * Create Roles & Security configuration UI
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Discord Components V2 interface
 */
export async function createRolesSecurityUI(guildId) {
    const playerData = await loadPlayerData();
    const globalRoleAccess = playerData[guildId]?.permissions?.globalRoleAccess || [];

    const roleListText = globalRoleAccess.length > 0
        ? globalRoleAccess.map(id => `<@&${id}>`).join(', ')
        : '*(none)*';

    const container = {
        type: 17,
        accent_color: 0x5865F2, // Discord blurple
        components: [
            {
                type: 10,
                content: `## 🔐 Roles & Security\n\nConfigure which roles have access to CastBot features beyond server admins.\n\n**Current roles with full CastBot access:**\n${roleListText}\n\n-# Note: currently only applies to Applications.`
            },
            { type: 14 },
            {
                type: 10,
                content: `**Select roles with full CastBot access:**`
            },
            {
                type: 1,
                components: [{
                    type: 6, // Role Select
                    custom_id: 'castbot_roles_security_select',
                    min_values: 1,
                    max_values: 10,
                    default_values: globalRoleAccess.map(id => ({ id, type: 'role' }))
                }]
            },
            { type: 14 },
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        custom_id: 'safari_customize_terms',
                        label: '← Back to Settings',
                        style: 2
                    },
                    {
                        type: 2,
                        custom_id: 'castbot_roles_security_clear',
                        label: 'Clear All Roles',
                        style: 4, // Danger
                        emoji: { name: '🗑️' }
                    }
                ]
            }
        ]
    };

    return {
        flags: (1 << 15),
        components: [container]
    };
}

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

    // Add stamina settings button
    fieldGroupButtons.push({
        type: 2, // Button
        custom_id: 'stamina_location_config',
        label: 'Stamina Settings',
        style: 2, // Secondary
        emoji: { name: '⚡' }
    });

    // Add player menu configuration button (5th and final button)
    fieldGroupButtons.push({
        type: 2, // Button
        custom_id: 'safari_player_menu_config',
        label: 'Player Menu',
        style: 2, // Secondary
        emoji: { name: '🕹️' }
    });

    // Get current settings display
    const currentSettingsDisplay = await createCurrentSettingsDisplay(guildId, currentConfig);

    // Create Components V2 Container
    const containerComponents = [
        {
            type: 10, // Text Display component
            content: `## ⚙️ CastBot Settings\n\nPersonalize your experience with custom terminology, event names, and game mechanics.\n\n**Current Settings:**`
        },
        {
            type: 10, // Text Display component
            content: currentSettingsDisplay
        },
        {
            type: 14 // Separator
        },
        {
            type: 10, // Text Display component
            content: `> \`🦁 Idol Hunts, Challenges and Safari Settings\``
        },
        {
            type: 1, // Action Row
            components: fieldGroupButtons
        },
        {
            type: 14 // Separator
        },
        {
            type: 10, // Text Display component
            content: `> \`⚙️ Global CastBot Settings\``
        },
        {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button
                    custom_id: 'castbot_roles_security',
                    label: 'Roles & Security',
                    style: 2, // Secondary
                    emoji: { name: '🔐' }
                },
                {
                    type: 2, // Button
                    custom_id: 'safari_configure_log',
                    label: 'Logs',
                    style: 2, // Secondary
                    emoji: { name: '📊' }
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
                    label: 'Reset',
                    style: 4, // Danger
                    emoji: { name: '🔄' }
                }
            ]
        },
        {
            type: 14 // Separator
        },
        {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button
                    custom_id: 'prod_production_menu',
                    label: '← Back',
                    style: 2 // Secondary
                },
                {
                    type: 2, // Button
                    custom_id: 'prod_guide_0',
                    label: 'Guide',
                    style: 2, // Secondary (grey)
                    emoji: { name: '🦁' }
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
 * @param {string} guildId - Discord guild ID
 * @param {Object} config - Current safari configuration
 * @returns {string} Formatted settings display
 */
async function createCurrentSettingsDisplay(guildId, config) {
    const currencyEmoji = config.currencyEmoji || '🪙';
    const currencyName = config.currencyName || 'Dollars';
    const inventoryName = config.inventoryName || 'Inventory';
    const inventoryEmoji = config.inventoryEmoji || '🧰';

    let display = `**🪙 Currency & Inventory**\n`;
    display += `• Currency Name: ${currencyName}\n`;
    display += `• Currency Emoji: ${currencyEmoji}\n`;
    display += `• Inventory Name: ${inventoryName}\n`;
    display += `• Inventory Emoji: ${inventoryEmoji}\n`;
    display += `• Default Starting Currency: ${config.defaultStartingCurrencyValue ?? 100}\n\n`;

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
        const totalRounds = config.totalRounds || 3;
        display += `**🎲 Rounds** (${totalRounds} total)\n`;
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
        display += `\n`;
    }

    // Add Stamina Settings (per-server with .env fallback)
    const { getStaminaConfig } = await import('./safariManager.js');
    const staminaConfig = await getStaminaConfig(guildId);

    const regenAmountDisplay = staminaConfig.regenerationAmount != null
        ? `${staminaConfig.regenerationAmount} per cycle`
        : 'Full reset (to max)';
    display += `**⚡ Stamina Settings**\n`;
    display += `• Starting Stamina: ${staminaConfig.startingStamina}\n`;
    display += `• Max Stamina: ${staminaConfig.maxStamina}\n`;
    display += `• Regeneration Time: ${staminaConfig.regenerationMinutes} minutes\n`;
    display += `• Regeneration Amount: ${regenAmountDisplay}\n`;
    display += `• Default Starting Coordinate: ${staminaConfig.defaultStartingCoordinate} *(see Rounds)*\n\n`;

    // Add Player Menu Settings
    const enableGlobalCommands = config.enableGlobalCommands !== false;
    const inventoryVisibilityMode = config.inventoryVisibilityMode || 'always';
    const showCustomCastlists = config.showCustomCastlists !== false; // Default true
    const globalStoresVisibilityMode = config.globalStoresVisibilityMode || 'always';
    const visibilityModeLabels = {
        'always': 'Always Show',
        'initialized_only': 'After Initialization Only',
        'standard': 'After 1st Initialize + 1st Round',
        'never': 'Never Show'
    };
    display += `**🕹️ Player Menu**\n`;
    display += `• Global Commands Button: ${enableGlobalCommands ? '✅ Enabled' : '❌ Disabled'}\n`;
    display += `• Inventory Button: ${visibilityModeLabels[inventoryVisibilityMode]}\n`;
    display += `• Global Stores Button: ${visibilityModeLabels[globalStoresVisibilityMode]}\n`;
    display += `• Custom Castlists: ${showCustomCastlists ? '✅ Show All' : '📋 Default Only'}\n\n`;

    // Add Safari Log Status
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const logSettings = safariData[guildId]?.safariLogSettings || { enabled: false };

    display += `**📊 Safari Log**\n`;
    display += `• Status: ${logSettings.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n`;

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
            content: `## ⚠️ Reset Safari Settings\n\nAre you sure you want to reset all Safari customizations to default values?\n\n**This will reset:**\n• Currency name back to "Dollars" 🪙\n• Inventory name back to "Inventory"\n• Event names back to defaults\n• Round harvest probabilities back to 75%, 50%, 25%\n\n**This action cannot be undone.**`
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