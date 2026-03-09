/**
 * quickActionCreate.js — Quick Create shortcuts for map coordinate actions
 *
 * Provides streamlined modals to create Give Currency / Give Item actions
 * in a single modal with 5 fields (using String Selects in Labels).
 * Creates regular Custom Actions — fully editable in the Action Editor after creation.
 */

import { InteractionResponseType } from 'discord-interactions';

// Shared select options for limit and color
const LIMIT_OPTIONS = [
    { label: 'Unlimited', value: 'unlimited', emoji: { name: '♾️' }, description: 'No usage limit' },
    { label: 'Once Per Player', value: 'once_per_player', emoji: { name: '👤' }, description: 'Each player can use once', default: true },
    { label: 'Once Globally', value: 'once_globally', emoji: { name: '🌍' }, description: 'Only one player total can use' }
];

const COLOR_OPTIONS = [
    { label: 'Blue (Primary)', value: 'Primary', emoji: { name: '🔵' }, default: true },
    { label: 'Grey (Secondary)', value: 'Secondary', emoji: { name: '⚪' } },
    { label: 'Green (Success)', value: 'Success', emoji: { name: '🟢' } },
    { label: 'Red (Danger)', value: 'Danger', emoji: { name: '🔴' } }
];

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
        // Only add emoji if it's a valid Unicode string (not object, not custom format)
        if (typeof item.emoji === 'string' && item.emoji.length <= 10 && !item.emoji.startsWith('<')) {
            opt.emoji = { name: item.emoji };
        } else {
            opt.emoji = { name: '📦' };
        }
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
            limit: { type: limitType, claimedBy: [] }
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
            limit: { type: limitType, claimedBy: [] }
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
