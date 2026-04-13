/**
 * quickActionCreate.js — Quick Create shortcuts for map coordinate actions
 *
 * Provides streamlined modals to create Give Currency / Give Item actions
 * in a single modal with 5 fields (using String Selects in Labels).
 * Creates regular Custom Actions — fully editable in the Action Editor after creation.
 */

import { InteractionResponseType } from 'discord-interactions';
import { parseAndValidateEmoji } from './utils/emojiUtils.js';
import { buildLimitOptions } from './utils/periodUtils.js';

// Quick create defaults: once_per_player is pre-selected
const LIMIT_OPTIONS = buildLimitOptions({ currentLimit: 'once_per_player', periodDescription: 'Defaults to 1d in Quick Edit, change in Outcome Config' });

const COLOR_OPTIONS = [
    { label: 'Blue (Primary)', value: 'Primary', emoji: { name: '🔵' }, default: true },
    { label: 'Grey (Secondary)', value: 'Secondary', emoji: { name: '⚪' } },
    { label: 'Green (Success)', value: 'Success', emoji: { name: '🟢' } },
    { label: 'Red (Danger)', value: 'Danger', emoji: { name: '🔴' } }
];

// Map button style to accent color hex for display_text outcomes
const STYLE_TO_ACCENT_COLOR = {
    'Primary': '3498db',
    'Secondary': '95a5a6',
    'Success': '2ecc71',
    'Danger': 'e74c3c'
};

/**
 * Build the Quick Text modal — 5 fields
 * @param {string} coordinate - Map coordinate (e.g. "A2")
 * @returns {object} Modal interaction response data
 */
export function buildQuickTextModal(coordinate) {
    return {
        custom_id: `quick_text_modal_${coordinate}`,
        title: 'Quick Text Action',
        components: [
            {
                type: 18,
                label: 'Button Name',
                description: 'Label on the button the player clicks. Also used as the display text title.',
                component: {
                    type: 4,
                    custom_id: 'button_name',
                    style: 1,
                    placeholder: 'e.g., "Read the Sign"',
                    required: true,
                    max_length: 80
                }
            },
            {
                type: 18,
                label: 'Text to display',
                description: 'The main text shown when the action triggers. Supports markdown.',
                component: {
                    type: 4,
                    custom_id: 'display_content',
                    style: 2, // Paragraph
                    placeholder: 'The text to display when the action is triggered...',
                    required: true,
                    max_length: 2000
                }
            },
            {
                type: 18,
                label: 'Button Emoji (Optional)',
                description: 'Emoji that appears on the button.',
                component: {
                    type: 4,
                    custom_id: 'button_emoji',
                    style: 1,
                    placeholder: 'e.g., 📃',
                    required: false,
                    max_length: 100
                }
            },
            {
                type: 18,
                label: 'Usage Limit',
                description: 'How many times can this action be used?',
                component: {
                    type: 3,
                    custom_id: 'usage_limit',
                    placeholder: 'Select usage limit...',
                    min_values: 1,
                    max_values: 1,
                    options: LIMIT_OPTIONS
                }
            },
            {
                type: 18,
                label: 'Button Color',
                description: 'Color of the button. Also sets the accent color of the text display.',
                component: {
                    type: 3,
                    custom_id: 'button_color',
                    placeholder: 'Select button color...',
                    min_values: 1,
                    max_values: 1,
                    options: COLOR_OPTIONS
                }
            }
        ]
    };
}

/**
 * Build the Quick Currency modal — 5 fields
 * @param {string} coordinate - Map coordinate (e.g. "A2")
 * @param {string} currencyName - Custom currency name (e.g. "coins")
 * @returns {object} Modal interaction response data
 */
export function buildQuickCurrencyModal(coordinate, currencyName) {
    return {
        custom_id: `quick_currency_modal_${coordinate}`,
        title: `Quick ${currencyName} Action`,
        components: [
            {
                type: 18, // Label
                label: 'Button Name',
                description: 'Label on the button the player clicks.',
                component: {
                    type: 4, // Text Input
                    custom_id: 'button_name',
                    style: 1,
                    placeholder: `e.g., "Collect ${currencyName}"`,
                    required: true,
                    max_length: 80
                }
            },
            {
                type: 18, // Label
                label: 'Amount',
                description: 'How much to give (or use negative to remove, e.g. -50).',
                component: {
                    type: 4, // Text Input
                    custom_id: 'amount',
                    style: 1,
                    placeholder: 'e.g., 100 or -50',
                    required: true,
                    max_length: 10
                }
            },
            {
                type: 18, // Label
                label: 'Button Emoji (Optional)',
                description: 'Emoji that appears on the button.',
                component: {
                    type: 4, // Text Input
                    custom_id: 'button_emoji',
                    style: 1,
                    placeholder: 'e.g., 💰',
                    required: false,
                    max_length: 100
                }
            },
            {
                type: 18, // Label
                label: 'Usage Limit',
                description: 'How many times can this action be used?',
                component: {
                    type: 3, // String Select
                    custom_id: 'usage_limit',
                    placeholder: 'Select usage limit...',
                    min_values: 1,
                    max_values: 1,
                    options: LIMIT_OPTIONS
                }
            },
            {
                type: 18, // Label
                label: 'Button Color',
                description: 'Color of the button.',
                component: {
                    type: 3, // String Select
                    custom_id: 'button_color',
                    placeholder: 'Select button color...',
                    min_values: 1,
                    max_values: 1,
                    options: COLOR_OPTIONS
                }
            }
        ]
    };
}

/**
 * Build the Quick Item modal — 5 fields
 * @param {string} coordinate - Map coordinate (e.g. "A2")
 * @param {Array} items - Array of { id, name, emoji, description } for the item select
 * @returns {object} Modal interaction response data
 */
export function buildQuickItemModal(coordinate, items) {
    const itemOptions = items.slice(0, 25).map(item => {
        const opt = {
            label: (item.name || item.id).slice(0, 100),
            value: item.id
        };
        // Use validated emoji parsing (handles Unicode, custom, deleted emojis)
        opt.emoji = parseAndValidateEmoji(item.emoji, '📦').emoji;
        if (item.description) opt.description = item.description.slice(0, 100);
        return opt;
    });

    return {
        custom_id: `quick_item_modal_${coordinate}`,
        title: 'Quick Item Action',
        components: [
            {
                type: 18, // Label
                label: 'Button Name',
                description: 'Label on the button the player clicks.',
                component: {
                    type: 4, // Text Input
                    custom_id: 'button_name',
                    style: 1,
                    placeholder: 'e.g., "Open Chest"',
                    required: true,
                    max_length: 80
                }
            },
            {
                type: 18, // Label
                label: 'Item to Give',
                description: 'Select which item the player receives.',
                component: {
                    type: 3, // String Select
                    custom_id: 'item_select',
                    placeholder: 'Select item...',
                    min_values: 1,
                    max_values: 1,
                    options: itemOptions
                }
            },
            {
                type: 18, // Label
                label: 'Button Emoji (Optional)',
                description: 'Emoji that appears on the button.',
                component: {
                    type: 4, // Text Input
                    custom_id: 'button_emoji',
                    style: 1,
                    placeholder: 'e.g., 📦',
                    required: false,
                    max_length: 100
                }
            },
            {
                type: 18, // Label
                label: 'Usage Limit',
                description: 'How many times can this action be used?',
                component: {
                    type: 3, // String Select
                    custom_id: 'usage_limit',
                    placeholder: 'Select usage limit...',
                    min_values: 1,
                    max_values: 1,
                    options: LIMIT_OPTIONS
                }
            },
            {
                type: 18, // Label
                label: 'Button Color',
                description: 'Color of the button.',
                component: {
                    type: 3, // String Select
                    custom_id: 'button_color',
                    placeholder: 'Select button color...',
                    min_values: 1,
                    max_values: 1,
                    options: COLOR_OPTIONS
                }
            }
        ]
    };
}

/**
 * Extract a value from a modal submit component (works for TextInput and String Select)
 * TextInput: comp.component.value (string)
 * String Select: comp.component.values[0] (string)
 */
function getModalValue(comp) {
    if (!comp?.component) return null;
    // String Select returns values array
    if (Array.isArray(comp.component.values)) {
        return comp.component.values[0] || null;
    }
    // TextInput returns value string
    const val = comp.component.value;
    return typeof val === 'string' ? val.trim() || null : null;
}

/**
 * Handle Quick Currency modal submission — creates action, returns Action Editor
 */
export async function handleQuickCurrencySubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent, getCustomTerms } = await import('./safariManager.js');

    const buttonName = getModalValue(modalComponents[0]);
    const amount = getModalValue(modalComponents[1]);
    const emojiInput = getModalValue(modalComponents[2]);
    const limitType = getModalValue(modalComponents[3]) || 'once_per_player';
    const style = getModalValue(modalComponents[4]) || 'Primary';

    if (!buttonName) {
        return { error: 'Button name is required.' };
    }

    // Validate amount
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount === 0) {
        return { error: `Invalid amount: "${amount}". Enter a number (positive to give, negative to remove).` };
    }

    // Validate emoji
    let buttonEmoji = null;
    if (emojiInput) {
        const { createSafeEmoji } = await import('./safariButtonHelper.js');
        const validated = await createSafeEmoji(emojiInput);
        if (validated) buttonEmoji = emojiInput;
    }

    // Create the action shell
    const actionId = await createCustomButton(guildId, {
        label: buttonName,
        emoji: buttonEmoji,
        style,
        actions: [],
        tags: []
    }, userId);

    // Add give_currency outcome
    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = buttonName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_currency' };

    action.actions.push({
        type: 'give_currency',
        order: 0,
        config: {
            amount: parsedAmount,
            limit: limitType === 'once_per_period'
                ? { type: 'once_per_period', periodMs: 86400000, claimedBy: {} }
                : { type: limitType, claimedBy: limitType === 'once_per_player' ? [] : null }
        },
        executeOn: 'true'
    });

    // Set button style
    if (!action.trigger) action.trigger = { type: 'button' };
    if (!action.trigger.button) action.trigger.button = {};
    action.trigger.button.style = style;
    action.style = style;

    // Assign to coordinate (skip for global actions)
    if (coordinate && coordinate !== 'global') {
        const activeMapId = safariData[guildId]?.maps?.active;
        if (activeMapId) {
            const coordData = safariData[guildId].maps[activeMapId].coordinates[coordinate];
            if (coordData) {
                if (!coordData.buttons) coordData.buttons = [];
                if (!coordData.buttons.includes(actionId)) {
                    coordData.buttons.push(actionId);
                }
            }
            if (!action.coordinates) action.coordinates = [];
            if (!action.coordinates.includes(coordinate)) {
                action.coordinates.push(coordinate);
            }
        }
    }

    await saveSafariContent(safariData);

    // Queue anchor update only for coordinate-based actions
    if (coordinate && coordinate !== 'global') {
        try {
            const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
            await afterAddCoordinate(guildId, actionId, coordinate);
        } catch (error) {
            console.error('Error queueing anchor update after quick currency:', error);
        }
    }

    const customTerms = await getCustomTerms(guildId);
    const verb = parsedAmount > 0 ? 'Gives' : 'Removes';
    console.log(`⚡ QUICK CURRENCY: Created action ${actionId} at ${coordinate} — ${verb} ${Math.abs(parsedAmount)} ${customTerms.currencyName}`);

    // Return Action Editor UI (null coordinate for global actions)
    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    const editorCoordinate = coordinate === 'global' ? null : coordinate;
    return await createCustomActionEditorUI({ guildId, actionId, coordinate: editorCoordinate });
}

/**
 * Handle Quick Text modal submission — creates action with display_text outcome, returns Action Editor
 */
export async function handleQuickTextSubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    const buttonName = getModalValue(modalComponents[0]);
    const displayContent = getModalValue(modalComponents[1]);
    const emojiInput = getModalValue(modalComponents[2]);
    const limitType = getModalValue(modalComponents[3]) || 'once_per_player';
    const style = getModalValue(modalComponents[4]) || 'Primary';

    if (!buttonName) return { error: 'Button name is required.' };
    if (!displayContent) return { error: 'Text to display is required.' };

    let buttonEmoji = null;
    if (emojiInput) {
        const { createSafeEmoji } = await import('./safariButtonHelper.js');
        const validated = await createSafeEmoji(emojiInput);
        if (validated) buttonEmoji = emojiInput;
    }

    const actionId = await createCustomButton(guildId, {
        label: buttonName, emoji: buttonEmoji, style, actions: [], tags: []
    }, userId);

    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = buttonName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_text' };

    if (!action.trigger) action.trigger = { type: 'button' };
    if (!action.trigger.button) action.trigger.button = {};
    action.trigger.button.style = style;
    action.style = style;

    action.actions.push({
        type: 'display_text',
        order: 0,
        config: {
            title: buttonName,
            content: displayContent,
            image: '',
            color: STYLE_TO_ACCENT_COLOR[style] || '3498db'
        },
        executeOn: 'true'
    });

    // Assign to coordinate (skip for global actions — coordinate='global' means no map assignment)
    if (coordinate && coordinate !== 'global') {
        const activeMapId = safariData[guildId]?.maps?.active;
        if (activeMapId) {
            const coordData = safariData[guildId].maps[activeMapId].coordinates[coordinate];
            if (coordData) {
                if (!coordData.buttons) coordData.buttons = [];
                if (!coordData.buttons.includes(actionId)) coordData.buttons.push(actionId);
            }
            if (!action.coordinates) action.coordinates = [];
            if (!action.coordinates.includes(coordinate)) action.coordinates.push(coordinate);
        }
    }

    await saveSafariContent(safariData);

    // Queue anchor update only for coordinate-based actions
    if (coordinate && coordinate !== 'global') {
        try {
            const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
            await afterAddCoordinate(guildId, actionId, coordinate);
        } catch (error) {
            console.error('Error queueing anchor update after quick text:', error);
        }
    }

    console.log(`⚡ QUICK TEXT: Created action ${actionId} at ${coordinate} — Display: "${buttonName}"`);

    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    const editorCoordinate = coordinate === 'global' ? null : coordinate;
    return await createCustomActionEditorUI({ guildId, actionId, coordinate: editorCoordinate });
}

/**
 * Handle Quick Item modal submission — creates action with item outcome, returns Action Editor
 */
export async function handleQuickItemSubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    const buttonName = getModalValue(modalComponents[0]);
    const itemId = getModalValue(modalComponents[1]);
    const emojiInput = getModalValue(modalComponents[2]);
    const limitType = getModalValue(modalComponents[3]) || 'once_per_player';
    const style = getModalValue(modalComponents[4]) || 'Primary';

    if (!buttonName) {
        return { error: 'Button name is required.' };
    }
    if (!itemId) {
        return { error: 'Item selection is required.' };
    }

    // Validate emoji
    let buttonEmoji = null;
    if (emojiInput) {
        const { createSafeEmoji } = await import('./safariButtonHelper.js');
        const validated = await createSafeEmoji(emojiInput);
        if (validated) buttonEmoji = emojiInput;
    }

    // Create the action shell
    const actionId = await createCustomButton(guildId, {
        label: buttonName,
        emoji: buttonEmoji,
        style,
        actions: [],
        tags: []
    }, userId);

    // Set up action with give_item outcome
    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = buttonName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_item' };

    // Set button style
    if (!action.trigger) action.trigger = { type: 'button' };
    if (!action.trigger.button) action.trigger.button = {};
    action.trigger.button.style = style;
    action.style = style;

    // Get item details for logging
    const item = safariData[guildId]?.items?.[itemId];
    const itemName = item?.name || itemId;

    action.actions.push({
        type: 'give_item',
        order: 0,
        config: {
            itemId,
            quantity: 1,
            operation: 'give',
            limit: limitType === 'once_per_period'
                ? { type: 'once_per_period', periodMs: 86400000, claimedBy: {} }
                : { type: limitType, claimedBy: limitType === 'once_per_player' ? [] : null }
        },
        executeOn: 'true'
    });

    // Assign to coordinate (skip for global actions)
    if (coordinate && coordinate !== 'global') {
        const activeMapId = safariData[guildId]?.maps?.active;
        if (activeMapId) {
            const coordData = safariData[guildId].maps[activeMapId].coordinates[coordinate];
            if (coordData) {
                if (!coordData.buttons) coordData.buttons = [];
                if (!coordData.buttons.includes(actionId)) {
                    coordData.buttons.push(actionId);
                }
            }
            if (!action.coordinates) action.coordinates = [];
            if (!action.coordinates.includes(coordinate)) {
                action.coordinates.push(coordinate);
            }
        }
    }

    await saveSafariContent(safariData);

    // Queue anchor update only for coordinate-based actions
    if (coordinate && coordinate !== 'global') {
        try {
            const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
            await afterAddCoordinate(guildId, actionId, coordinate);
        } catch (error) {
            console.error('Error queueing anchor update after quick item:', error);
        }
    }

    console.log(`⚡ QUICK ITEM: Created action ${actionId} at ${coordinate} — Gives 1x ${itemName}`);

    // Return Action Editor UI (null coordinate for global actions)
    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    const editorCoordinate = coordinate === 'global' ? null : coordinate;
    return await createCustomActionEditorUI({ guildId, actionId, coordinate: editorCoordinate });
}

/**
 * Build the Quick Enemy modal — 5 fields
 * Creates a fight_enemy action at a coordinate in one step.
 */
export function buildQuickEnemyModal(coordinate, enemies) {
    const enemyOptions = enemies.slice(0, 25).map(enemy => {
        const opt = {
            label: (enemy.name || enemy.id).slice(0, 100),
            value: enemy.id,
            description: `❤️${enemy.hp || 0} ⚔️${enemy.attackValue || 0}`
        };
        opt.emoji = parseAndValidateEmoji(enemy.emoji, '🐙').emoji;
        return opt;
    });

    return {
        custom_id: `quick_enemy_modal_${coordinate}`,
        title: 'Quick Enemy Action',
        components: [
            {
                type: 18, label: 'Button Name',
                description: 'Label on the button the player clicks.',
                component: { type: 4, custom_id: 'button_name', style: 1, placeholder: 'e.g., "Fight the Octorok"', required: true, max_length: 80 }
            },
            {
                type: 18, label: 'Enemy to Fight',
                description: 'Select which enemy the player battles.',
                component: { type: 3, custom_id: 'enemy_select', placeholder: 'Select enemy...', min_values: 1, max_values: 1, options: enemyOptions }
            },
            {
                type: 18, label: 'Button Emoji (Optional)',
                description: 'Emoji that appears on the button.',
                component: { type: 4, custom_id: 'button_emoji', style: 1, placeholder: 'e.g., 🐙', required: false, max_length: 100 }
            },
            {
                type: 18, label: 'Usage Limit',
                description: 'How many times can players fight this enemy?',
                component: { type: 3, custom_id: 'usage_limit', placeholder: 'Select usage limit...', min_values: 1, max_values: 1, options: LIMIT_OPTIONS }
            },
            {
                type: 18, label: 'Button Color',
                description: 'Color of the button.',
                component: { type: 3, custom_id: 'button_color', placeholder: 'Select button color...', min_values: 1, max_values: 1, options: COLOR_OPTIONS }
            }
        ]
    };
}

/**
 * Build the Quick Command modal — 5 fields
 * Creates a Command-triggered action with one phrase and a display_text outcome.
 * @param {string} coordinate - Map coordinate (e.g. "E7") or "global"
 * @param {Array} prefixes - Guild command prefixes [{ label, emoji?, description? }]
 * @returns {object} Modal interaction response data
 */
export function buildQuickCommandModal(coordinate, prefixes = []) {
    const modalComponents = [
        {
            type: 18,
            label: 'Command Name',
            description: 'Name of the action, e.g., Beach Idol Clue, Note Hidden In Tree',
            component: {
                type: 4,
                custom_id: 'command_name',
                style: 1,
                placeholder: 'e.g., "Beach Idol Clue"',
                required: true,
                max_length: 80
            }
        }
    ];

    // Prefix select (only when guild has prefixes)
    if (prefixes.length > 0) {
        const prefixOptions = [
            {
                label: 'Freeform (no prefix)',
                value: 'freeform',
                description: 'Enter the full command exactly as it is — common for idol hunts',
                emoji: { name: '♾️' },
                default: true
            }
        ];
        for (const prefix of prefixes) {
            prefixOptions.push({
                label: prefix.label,
                value: prefix.label.toLowerCase(),
                description: (prefix.description || `Prepends "${prefix.label}" to your command`).substring(0, 100),
                emoji: { name: prefix.emoji || '🏷️' }
            });
        }
        modalComponents.push({
            type: 18,
            label: 'Prefix (optional)',
            description: 'Pick an action verb, or choose Freeform to enter the full command yourself',
            component: {
                type: 3,
                custom_id: 'command_prefix',
                min_values: 1,
                max_values: 1,
                options: prefixOptions
            }
        });
    }

    modalComponents.push(
        {
            type: 18,
            label: 'Command Phrase',
            description: 'Enter a secret word, phrase, or code',
            component: {
                type: 4,
                custom_id: 'command_phrase',
                style: 1,
                placeholder: 'e.g., tree, rock, secret-code',
                required: true,
                max_length: 100
            }
        },
        {
            type: 18,
            label: 'Text to display',
            description: 'The main text shown when the command triggers. Supports markdown.',
            component: {
                type: 4,
                custom_id: 'display_content',
                style: 2,
                placeholder: 'The text to display when the command is triggered...',
                required: true,
                max_length: 2000
            }
        },
        {
            type: 18,
            label: 'Usage Limit',
            description: 'How many times can this command be used?',
            component: {
                type: 3,
                custom_id: 'usage_limit',
                placeholder: 'Select usage limit...',
                min_values: 1,
                max_values: 1,
                options: LIMIT_OPTIONS
            }
        }
    );

    return {
        custom_id: `quick_command_modal_${coordinate}`,
        title: '❗ Quick Command',
        components: modalComponents
    };
}

/**
 * Handle Quick Command modal submit — creates a Command-trigger action with phrase + display_text
 */
export async function handleQuickCommandSubmit(guildId, userId, coordinate, modalComponents, hasPrefixes) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    // Component indices shift based on whether prefix select is present
    const commandName = getModalValue(modalComponents[0]);
    let prefixValue = 'freeform';
    let phraseIndex = 1;
    let displayIndex = 2;
    let limitIndex = 3;

    if (hasPrefixes) {
        prefixValue = getModalValue(modalComponents[1]) || 'freeform';
        phraseIndex = 2;
        displayIndex = 3;
        limitIndex = 4;
    }

    const phraseText = getModalValue(modalComponents[phraseIndex]);
    const displayContent = getModalValue(modalComponents[displayIndex]);
    const limitType = getModalValue(modalComponents[limitIndex]) || 'once_per_player';

    if (!commandName) return { error: 'Command name is required.' };
    if (!phraseText) return { error: 'Command phrase is required.' };
    if (!displayContent) return { error: 'Text to display is required.' };

    // Concatenate prefix + phrase
    const fullPhrase = (prefixValue === 'freeform' || !prefixValue)
        ? phraseText.trim().toLowerCase()
        : `${prefixValue} ${phraseText.trim()}`.toLowerCase();

    // Create the action shell
    const actionId = await createCustomButton(guildId, {
        label: commandName, emoji: null, style: 'Primary', actions: [], tags: []
    }, userId);

    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = commandName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_command' };

    // Set trigger to Command (modal) with the phrase
    action.trigger = {
        type: 'modal',
        phrases: [fullPhrase]
    };

    // Add display_text outcome (pass)
    action.actions.push({
        type: 'display_text',
        order: 0,
        config: {
            title: commandName,
            content: displayContent,
            image: '',
            color: '3498db'
        },
        executeOn: 'true'
    });

    // Set usage limit on the outcome
    if (limitType !== 'unlimited') {
        action.actions[0].config.limit = limitType === 'once_per_period'
            ? { type: 'once_per_period', periodMs: 86400000, claimedBy: {} }
            : { type: limitType, claimedBy: limitType === 'once_per_player' ? [] : null };
    }

    // Assign to coordinate (skip for global actions)
    if (coordinate && coordinate !== 'global') {
        const activeMapId = safariData[guildId]?.maps?.active;
        if (activeMapId) {
            const coordData = safariData[guildId].maps[activeMapId].coordinates[coordinate];
            if (coordData) {
                if (!coordData.buttons) coordData.buttons = [];
                if (!coordData.buttons.includes(actionId)) coordData.buttons.push(actionId);
            }
            if (!action.coordinates) action.coordinates = [];
            if (!action.coordinates.includes(coordinate)) action.coordinates.push(coordinate);
        }
    }

    await saveSafariContent(safariData);

    // Queue anchor update only for coordinate-based actions
    if (coordinate && coordinate !== 'global') {
        try {
            const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
            await afterAddCoordinate(guildId, actionId, coordinate);
        } catch (error) {
            console.error('Error queueing anchor update after quick command:', error);
        }
    }

    console.log(`⚡ QUICK COMMAND: Created action ${actionId} at ${coordinate} — Phrase: "${fullPhrase}"`);

    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    const editorCoordinate = coordinate === 'global' ? null : coordinate;
    return await createCustomActionEditorUI({ guildId, actionId, coordinate: editorCoordinate });
}

/**
 * Build the Quick Crafting modal — 5 fields
 * Single modal that produces an Action combining two input items into a third.
 * @param {string} coordinate - Map coordinate (e.g. "A2") or "global"
 * @param {Array} items - Array of { id, name, emoji, description } for item selects
 * @param {string} craftingName - Server-customizable crafting name (e.g. "Crafting", "Gardening")
 * @returns {object} Modal interaction response data
 */
export function buildQuickCraftingModal(coordinate, items, craftingName = 'Crafting') {
    const itemOptions = items.slice(0, 25).map(item => {
        const opt = {
            label: (item.name || item.id).slice(0, 100),
            value: item.id
        };
        opt.emoji = parseAndValidateEmoji(item.emoji, '📦').emoji;
        if (item.description) opt.description = item.description.slice(0, 100);
        return opt;
    });

    return {
        custom_id: `quick_crafting_modal_${coordinate}`,
        title: `Quick ${craftingName} Action`,
        components: [
            {
                type: 18,
                label: 'Button Name',
                description: 'Label on the button the player clicks.',
                component: {
                    type: 4,
                    custom_id: 'button_name',
                    style: 1,
                    placeholder: 'e.g., "Craft Sword"',
                    required: true,
                    max_length: 80
                }
            },
            {
                type: 18,
                label: 'Crafting Item #1',
                description: 'Select the first item to craft, removed from inventory upon successful craft.',
                component: {
                    type: 3,
                    custom_id: 'crafting_item_1',
                    placeholder: 'Select first input item...',
                    min_values: 1,
                    max_values: 1,
                    options: itemOptions
                }
            },
            {
                type: 18,
                label: 'Crafting Item #2',
                description: 'Select the second item to craft, removed from inventory upon successful craft.',
                component: {
                    type: 3,
                    custom_id: 'crafting_item_2',
                    placeholder: 'Select second input item...',
                    min_values: 1,
                    max_values: 1,
                    options: itemOptions
                }
            },
            {
                type: 18,
                label: 'Item to Give',
                description: 'Select the item the player receives after combining the two inputs.',
                component: {
                    type: 3,
                    custom_id: 'item_to_give',
                    placeholder: 'Select output item...',
                    min_values: 1,
                    max_values: 1,
                    options: itemOptions
                }
            },
            {
                type: 18,
                label: 'Button Emoji (Optional)',
                description: 'Emoji that appears on the button. Defaults to the server\u2019s crafting emoji.',
                component: {
                    type: 4,
                    custom_id: 'button_emoji',
                    style: 1,
                    placeholder: 'e.g., 🛠️',
                    required: false,
                    max_length: 100
                }
            }
        ]
    };
}

/**
 * Build the conditions + outcomes for a Quick Crafting Action.
 * Exported for tests — pure logic, no I/O.
 *
 * Rules:
 *  - Same item picked for both inputs → one condition (qty 2) + one remove outcome (qty 2)
 *  - Different items → two conditions (qty 1 each, AND) + two remove outcomes (qty 1 each)
 *  - Always ends with a give_item outcome for itemToGive (qty 1)
 *
 * @param {string} item1Id
 * @param {string} item2Id
 * @param {string} itemToGiveId
 * @returns {{ conditions: Array, outcomes: Array }}
 */
export function buildCraftingLogic(item1Id, item2Id, itemToGiveId) {
    const conditions = [];
    const outcomes = [];
    const sameInput = item1Id === item2Id;

    const mkCondition = (itemId, quantity) => ({
        id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'item',
        operator: 'has',
        itemId,
        quantity,
        logic: 'AND'
    });

    const mkOutcome = (order, itemId, quantity, operation) => ({
        type: 'give_item',
        order,
        config: { itemId, quantity, operation },
        executeOn: 'true'
    });

    if (sameInput) {
        conditions.push(mkCondition(item1Id, 2));
        outcomes.push(mkOutcome(0, item1Id, 2, 'remove'));
        outcomes.push(mkOutcome(1, itemToGiveId, 1, 'give'));
    } else {
        conditions.push(mkCondition(item1Id, 1));
        conditions.push(mkCondition(item2Id, 1));
        outcomes.push(mkOutcome(0, item1Id, 1, 'remove'));
        outcomes.push(mkOutcome(1, item2Id, 1, 'remove'));
        outcomes.push(mkOutcome(2, itemToGiveId, 1, 'give'));
    }

    return { conditions, outcomes };
}

/**
 * Handle Quick Crafting modal submit — creates an Action with:
 *  - 2 'has item' conditions (AND)
 *  - Pass outcomes: remove Item #1, remove Item #2, give Item to Give
 *  - style = Secondary (Grey)
 *  - menuVisibility = 'crafting_menu' (auto-appears in the Crafting menu)
 */
export async function handleQuickCraftingSubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent, getCustomTerms } = await import('./safariManager.js');

    const buttonName = getModalValue(modalComponents[0]);
    const item1Id = getModalValue(modalComponents[1]);
    const item2Id = getModalValue(modalComponents[2]);
    const itemToGiveId = getModalValue(modalComponents[3]);
    const emojiInput = getModalValue(modalComponents[4]);

    if (!buttonName) return { error: 'Button name is required.' };
    if (!item1Id) return { error: 'Crafting Item #1 is required.' };
    if (!item2Id) return { error: 'Crafting Item #2 is required.' };
    if (!itemToGiveId) return { error: 'Item to Give is required.' };

    const customTerms = await getCustomTerms(guildId);
    const craftingEmoji = customTerms.craftingEmoji || '🛠️';

    // Validate user-entered emoji; fall back to server crafting emoji if blank/invalid
    let buttonEmoji = craftingEmoji;
    if (emojiInput) {
        const { createSafeEmoji } = await import('./safariButtonHelper.js');
        const validated = await createSafeEmoji(emojiInput);
        if (validated) buttonEmoji = emojiInput;
    }

    const style = 'Secondary';

    // Create action shell
    const actionId = await createCustomButton(guildId, {
        label: buttonName,
        emoji: buttonEmoji,
        style,
        actions: [],
        tags: []
    }, userId);

    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = buttonName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_crafting' };

    if (!action.trigger) action.trigger = { type: 'button' };
    if (!action.trigger.button) action.trigger.button = {};
    action.trigger.button.style = style;
    action.style = style;

    // Auto-show in Crafting menu — that's the whole point of this variant
    action.menuVisibility = 'crafting_menu';

    // Conditions + outcomes (collapses duplicates when both inputs match)
    const { conditions, outcomes } = buildCraftingLogic(item1Id, item2Id, itemToGiveId);
    if (!Array.isArray(action.conditions)) action.conditions = [];
    action.conditions.push(...conditions);
    action.actions.push(...outcomes);

    // Assign coordinate (skip for global)
    if (coordinate && coordinate !== 'global') {
        const activeMapId = safariData[guildId]?.maps?.active;
        if (activeMapId) {
            const coordData = safariData[guildId].maps[activeMapId].coordinates[coordinate];
            if (coordData) {
                if (!coordData.buttons) coordData.buttons = [];
                if (!coordData.buttons.includes(actionId)) coordData.buttons.push(actionId);
            }
            if (!action.coordinates) action.coordinates = [];
            if (!action.coordinates.includes(coordinate)) action.coordinates.push(coordinate);
        }
    }

    await saveSafariContent(safariData);

    if (coordinate && coordinate !== 'global') {
        try {
            const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
            await afterAddCoordinate(guildId, actionId, coordinate);
        } catch (error) {
            console.error('Error queueing anchor update after quick crafting:', error);
        }
    }

    const items = safariData[guildId]?.items || {};
    const n = id => items[id]?.name || id;
    console.log(`⚡ QUICK CRAFTING: Created action ${actionId} at ${coordinate} — ${n(item1Id)} + ${n(item2Id)} → ${n(itemToGiveId)}`);

    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    const editorCoordinate = coordinate === 'global' ? null : coordinate;
    return await createCustomActionEditorUI({ guildId, actionId, coordinate: editorCoordinate });
}

/**
 * Handle Quick Enemy modal submit — creates a fight_enemy action at the coordinate
 */
export async function handleQuickEnemySubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    const buttonName = getModalValue(modalComponents[0]);
    const enemyId = getModalValue(modalComponents[1]);
    const emojiInput = getModalValue(modalComponents[2]);
    const limitType = getModalValue(modalComponents[3]) || 'once_per_player';
    const style = getModalValue(modalComponents[4]) || 'Primary';

    if (!buttonName) return { error: 'Button name is required.' };
    if (!enemyId) return { error: 'Enemy selection is required.' };

    let buttonEmoji = null;
    if (emojiInput) {
        const { createSafeEmoji } = await import('./safariButtonHelper.js');
        const validated = await createSafeEmoji(emojiInput);
        if (validated) buttonEmoji = emojiInput;
    }

    const actionId = await createCustomButton(guildId, {
        label: buttonName, emoji: buttonEmoji, style, actions: [], tags: []
    }, userId);

    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = buttonName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_enemy' };

    if (!action.trigger) action.trigger = { type: 'button' };
    if (!action.trigger.button) action.trigger.button = {};
    action.trigger.button.style = style;
    action.style = style;

    const enemy = safariData[guildId]?.enemies?.[enemyId];
    const enemyName = enemy?.name || enemyId;

    action.actions.push({
        type: 'fight_enemy',
        order: 0,
        config: {
            enemyId,
            limit: limitType === 'once_per_period'
                ? { type: 'once_per_period', periodMs: 86400000, claimedBy: {} }
                : { type: limitType, claimedBy: limitType === 'once_per_player' ? [] : null }
        },
        executeOn: 'always'
    });

    // Assign to coordinate (skip for global actions)
    if (coordinate && coordinate !== 'global') {
        const activeMapId = safariData[guildId]?.maps?.active;
        if (activeMapId) {
            const coordData = safariData[guildId].maps[activeMapId].coordinates[coordinate];
            if (coordData) {
                if (!coordData.buttons) coordData.buttons = [];
                if (!coordData.buttons.includes(actionId)) coordData.buttons.push(actionId);
            }
            if (!action.coordinates) action.coordinates = [];
            if (!action.coordinates.includes(coordinate)) action.coordinates.push(coordinate);
        }
    }

    await saveSafariContent(safariData);

    // Queue anchor update only for coordinate-based actions
    if (coordinate && coordinate !== 'global') {
        try {
            const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
            await afterAddCoordinate(guildId, actionId, coordinate);
        } catch (error) {
            console.error('Error queueing anchor update after quick enemy:', error);
        }
    }

    console.log(`⚡ QUICK ENEMY: Created action ${actionId} at ${coordinate} — Fight ${enemyName}`);

    // Return Action Editor UI (null coordinate for global actions)
    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    const editorCoordinate = coordinate === 'global' ? null : coordinate;
    return await createCustomActionEditorUI({ guildId, actionId, coordinate: editorCoordinate });
}
