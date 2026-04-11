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
                        custom_id: 'castbot_settings',
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

    // Separate events button from main field group buttons (moved to Legacy section)
    const mainButtons = fieldGroupButtons.filter(b => b.custom_id !== 'safari_config_group_events');
    const eventsButton = fieldGroupButtons.find(b => b.custom_id === 'safari_config_group_events');

    // Create Components V2 Container — LEAN design
    const containerComponents = [
        { type: 10, content: `## ⚙️ CastBot Settings` },
        { type: 10, content: currentSettingsDisplay },
        { type: 14 },
        { type: 10, content: `### \`\`\`🦁 Idol Hunts, Challenges and Safari Settings\`\`\`` },
        { type: 1, components: [
            ...mainButtons,
            { type: 2, custom_id: 'command_prefixes_menu', label: 'Commands', style: 2, emoji: { name: '❗' } }
        ] },
        { type: 14 },
        { type: 10, content: `### \`\`\`⚙️ Global Settings\`\`\`` },
        {
            type: 1,
            components: [
                { type: 2, custom_id: 'castbot_roles_security', label: 'Roles & Security', style: 2, emoji: { name: '🔐' } },
                { type: 2, custom_id: 'safari_configure_log', label: 'Logs', style: 2, emoji: { name: '📊' } },
                { type: 2, custom_id: 'safari_export_data', label: 'Export', style: 2, emoji: { name: '📤' } },
                { type: 2, custom_id: 'safari_import_data', label: 'Import', style: 2, emoji: { name: '📥' } },
                { type: 2, custom_id: 'safari_config_reset_defaults', label: 'Reset', style: 4, emoji: { name: '🔄' } }
            ]
        },
        { type: 14 },
        { type: 10, content: `### \`\`\`📼 Legacy\`\`\`` },
        {
            type: 1,
            components: [
                ...(eventsButton ? [eventsButton] : [])
            ]
        },
        { type: 14 },
        {
            type: 1,
            components: [
                { type: 2, custom_id: 'prod_production_menu', label: '← Back', style: 2 },
                { type: 2, custom_id: 'prod_guide_0', label: 'Guide', style: 2, emoji: { name: '🦁' } }
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
    const config = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG];
    const groupConfig = config.fieldGroups[groupKey];

    if (!groupConfig) {
        throw new Error(`Unknown field group: ${groupKey}`);
    }

    // Field-level descriptions for better UX
    const fieldDescriptions = {
        currencyName: 'The name of your in-game currency (e.g. Dollars, Rupees, Gold).',
        currencyEmoji: 'Unicode emoji or custom Discord emoji code.',
        inventoryName: 'What the player\'s item bag is called.',
        inventoryEmoji: 'Unicode emoji or custom Discord emoji code.',
        defaultStartingCurrencyValue: 'Amount of currency new players start with.',
        goodEventName: 'Name for positive random events.',
        badEventName: 'Name for negative random events.',
        goodEventEmoji: 'Emoji shown for positive events.',
        badEventEmoji: 'Emoji shown for negative events.',
        round1GoodProbability: 'Chance of a good event in round 1 (0-100).',
        round2GoodProbability: 'Chance of a good event in round 2 (0-100).',
        round3GoodProbability: 'Chance of a good event in round 3 (0-100).',
        defaultStartingCoordinate: 'Where new players spawn on the map (e.g. A1).'
    };

    const components = [];

    Object.entries(groupConfig.fields).forEach(([fieldKey, fieldConfig]) => {
        // Pre-populate with current value
        let currentValue = currentConfig[fieldKey];
        if (fieldKey === 'inventoryEmoji' && !currentValue) currentValue = '🧰';

        const textInput = {
            type: 4, // Text Input
            custom_id: fieldKey,
            style: fieldConfig.type === 'textarea' ? 2 : 1,
            required: fieldConfig.required || false,
            max_length: fieldConfig.maxLength || 100
        };
        if (fieldConfig.placeholder) textInput.placeholder = fieldConfig.placeholder;
        if (currentValue !== undefined && currentValue !== null) textInput.value = String(currentValue);

        const label = { type: 18, label: fieldConfig.label, component: textInput };
        const desc = fieldDescriptions[fieldKey];
        if (desc) label.description = desc;

        components.push(label);
    });

    return {
        toJSON() {
            return {
                custom_id: `safari_config_modal_${groupKey}`,
                title: `${groupConfig.label} Settings`,
                components: components.slice(0, 5) // Discord modal limit
            };
        }
    };
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
        // Support both Label-wrapped (type 18: .component.value) and ActionRow-wrapped (type 1: .components[0].value)
        const row = components[index];
        const value = row?.component?.value ?? row?.components?.[0]?.value;

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

    // --- Currency & Inventory ---
    let display = `**🪙 Currency & Inventory**\n`;
    display += `• Currency Name: ${currencyName}\n`;
    display += `• Currency Emoji: ${currencyEmoji}\n`;
    display += `• Inventory Name: ${inventoryName}\n`;
    display += `• Inventory Emoji: ${inventoryEmoji}\n`;
    display += `• Default Starting Currency: ${config.defaultStartingCurrencyValue ?? 100}\n\n`;

    // --- Stamina Settings ---
    const { getStaminaConfig } = await import('./safariManager.js');
    const staminaConfig = await getStaminaConfig(guildId);

    const regenMinutes = staminaConfig.regenerationMinutes;
    let regenTimeDisplay = `${regenMinutes} minutes`;
    if (regenMinutes >= 60) {
        const hours = Math.floor(regenMinutes / 60);
        const mins = regenMinutes % 60;
        regenTimeDisplay = mins > 0
            ? `${regenMinutes} minutes (${hours}h ${mins}m)`
            : `${regenMinutes} minutes (${hours} hours)`;
    }

    const regenAmountDisplay = staminaConfig.regenerationAmount != null
        ? `${staminaConfig.regenerationAmount} per cycle`
        : 'Full reset (to max)';
    display += `**⚡ Stamina Settings**\n`;
    display += `• Starting Stamina: ${staminaConfig.startingStamina}\n`;
    display += `• Max Stamina: ${staminaConfig.maxStamina}\n`;
    display += `• ♻️ Regeneration Time: ${regenTimeDisplay}\n`;
    display += `• Regeneration Amount: ${regenAmountDisplay}\n\n`;

    // --- Events ---
    if (config.goodEventName || config.badEventName || config.goodEventEmoji || config.badEventEmoji) {
        display += `**☄️ Events**\n`;
        if (config.goodEventName) display += `• Good Event Name: ${config.goodEventName}\n`;
        if (config.goodEventEmoji) display += `• Good Event Emoji: ${config.goodEventEmoji}\n`;
        if (config.badEventName) display += `• Bad Event Name: ${config.badEventName}\n`;
        if (config.badEventEmoji) display += `• Bad Event Emoji: ${config.badEventEmoji}\n`;
        display += `\n`;
    }

    // --- Rounds & Location ---
    if (config.round1GoodProbability !== undefined ||
        config.round2GoodProbability !== undefined ||
        config.round3GoodProbability !== undefined) {
        const totalRounds = config.totalRounds || 3;
        display += `**🎲 Rounds & Location** (${totalRounds} total)\n`;
        if (config.round1GoodProbability !== undefined) {
            display += `• Round 1: Good ${config.round1GoodProbability}% | Bad ${100 - config.round1GoodProbability}%\n`;
        }
        if (config.round2GoodProbability !== undefined) {
            display += `• Round 2: Good ${config.round2GoodProbability}% | Bad ${100 - config.round2GoodProbability}%\n`;
        }
        if (config.round3GoodProbability !== undefined) {
            display += `• Round 3: Good ${config.round3GoodProbability}% | Bad ${100 - config.round3GoodProbability}%\n`;
        }
        display += `• Default Starting Coordinate: ${config.defaultStartingCoordinate || 'A1'}\n`;
        display += `\n`;
    }

    // --- Player Menu ---
    const enableGlobalCommands = config.enableGlobalCommands !== false;
    const visibilityModeLabels = {
        'always': 'Always Show',
        'initialized_only': 'After Initialization Only',
        'standard': 'After 1st Initialize + 1st Round',
        'never': 'Never Show'
    };
    display += `**🕹️ Player Menu**\n`;
    display += `• Global Commands Button: ${enableGlobalCommands ? '✅ Enabled' : '❌ Disabled'}\n`;
    display += `• Inventory Button: ${visibilityModeLabels[config.inventoryVisibilityMode || 'always']}\n`;
    display += `• Global Stores Button: ${visibilityModeLabels[config.globalStoresVisibilityMode || 'always']}\n`;
    display += `• Custom Castlists: ${config.showCustomCastlists !== false ? '✅ Show All' : '📋 Default Only'}\n\n`;

    // --- Safari Log ---
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
                    custom_id: 'castbot_settings',
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