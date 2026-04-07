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
                label: 'Text to Display',
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

    // Assign to coordinate
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

    await saveSafariContent(safariData);

    // Queue anchor update
    try {
        const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
        await afterAddCoordinate(guildId, actionId, coordinate);
    } catch (error) {
        console.error('Error queueing anchor update after quick currency:', error);
    }

    const customTerms = await getCustomTerms(guildId);
    const verb = parsedAmount > 0 ? 'Gives' : 'Removes';
    console.log(`⚡ QUICK CURRENCY: Created action ${actionId} at ${coordinate} — ${verb} ${Math.abs(parsedAmount)} ${customTerms.currencyName}`);

    // Return Action Editor UI
    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    return await createCustomActionEditorUI({ guildId, actionId, coordinate });
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

    await saveSafariContent(safariData);

    try {
        const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
        await afterAddCoordinate(guildId, actionId, coordinate);
    } catch (error) {
        console.error('Error queueing anchor update after quick text:', error);
    }

    console.log(`⚡ QUICK TEXT: Created action ${actionId} at ${coordinate} — Display: "${buttonName}"`);

    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    return await createCustomActionEditorUI({ guildId, actionId, coordinate });
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

    // Assign to coordinate
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

    await saveSafariContent(safariData);

    // Queue anchor update
    try {
        const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
        await afterAddCoordinate(guildId, actionId, coordinate);
    } catch (error) {
        console.error('Error queueing anchor update after quick item:', error);
    }

    console.log(`⚡ QUICK ITEM: Created action ${actionId} at ${coordinate} — Gives 1x ${itemName}`);

    // Return Action Editor UI
    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    return await createCustomActionEditorUI({ guildId, actionId, coordinate });
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

    await saveSafariContent(safariData);

    try {
        const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
        await afterAddCoordinate(guildId, actionId, coordinate);
    } catch (error) {
        console.error('Error queueing anchor update after quick enemy:', error);
    }

    console.log(`⚡ QUICK ENEMY: Created action ${actionId} at ${coordinate} — Fight ${enemyName}`);

    const { createCustomActionEditorUI } = await import('./customActionUI.js');
    return await createCustomActionEditorUI({ guildId, actionId, coordinate });
}
