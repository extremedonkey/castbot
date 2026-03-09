/**
 * quickActionCreate.js — Quick Create shortcuts for map coordinate actions
 *
 * Provides streamlined modals to create Give Currency / Give Item actions
 * in 2-3 interactions instead of 8+. Creates regular Custom Actions under
 * the hood — fully editable in the Action Editor after creation.
 */

import { InteractionResponseType } from 'discord-interactions';

// Temporary state for Quick Item flow (modal → item select → save)
const quickItemPendingState = new Map();

/**
 * Build the Quick Currency modal
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
                    style: 1, // Short
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
                    style: 1, // Short
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
                    style: 1, // Short
                    placeholder: 'e.g., 💰',
                    required: false,
                    max_length: 100
                }
            }
        ]
    };
}

/**
 * Build the Quick Item modal
 * @param {string} coordinate - Map coordinate (e.g. "A2")
 * @returns {object} Modal interaction response data
 */
export function buildQuickItemModal(coordinate) {
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
                    style: 1, // Short
                    placeholder: 'e.g., "Open Chest"',
                    required: true,
                    max_length: 80
                }
            },
            {
                type: 18, // Label
                label: 'Button Emoji (Optional)',
                description: 'Emoji that appears on the button.',
                component: {
                    type: 4, // Text Input
                    custom_id: 'button_emoji',
                    style: 1, // Short
                    placeholder: 'e.g., 📦',
                    required: false,
                    max_length: 100
                }
            }
        ]
    };
}

/**
 * Handle Quick Currency modal submission — creates action + outcome in one step
 * @returns {object} Components V2 confirmation UI
 */
export async function handleQuickCurrencySubmit(guildId, userId, coordinate, buttonName, amount, emojiInput) {
    const { createCustomButton, loadSafariContent, saveSafariContent, getCustomTerms } = await import('./safariManager.js');
    const customTerms = await getCustomTerms(guildId);

    // Validate amount
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount === 0) {
        return {
            content: `❌ Invalid amount: "${amount}". Enter a number (positive to give, negative to remove).`
        };
    }

    // Validate emoji
    let buttonEmoji = null;
    if (emojiInput) {
        const { createSafeEmoji } = await import('./safariButtonHelper.js');
        const validated = await createSafeEmoji(emojiInput);
        if (validated) {
            buttonEmoji = emojiInput;
        }
    }

    // Create the action shell
    const actionId = await createCustomButton(guildId, {
        label: buttonName,
        emoji: buttonEmoji,
        style: 'Primary',
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
            limit: { type: 'once_per_player', claimedBy: [] }
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
        console.error('Error queueing anchor update after quick currency:', error);
    }

    const verb = parsedAmount > 0 ? 'Gives' : 'Removes';
    const displayAmount = Math.abs(parsedAmount);
    console.log(`⚡ QUICK CURRENCY: Created action ${actionId} at ${coordinate} — ${verb} ${displayAmount} ${customTerms.currencyName}`);

    return buildQuickCreateConfirmUI(actionId, coordinate, {
        emoji: buttonEmoji,
        name: buttonName,
        summary: `${verb} **${displayAmount}** ${customTerms.currencyEmoji} ${customTerms.currencyName}`,
        limitType: 'once_per_player',
        style: 'Primary'
    });
}

/**
 * Handle Quick Item modal submission — creates action shell, returns item select
 * @returns {object} Components V2 item select UI
 */
export async function handleQuickItemSubmit(guildId, userId, coordinate, buttonName, emojiInput) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    // Validate emoji
    let buttonEmoji = null;
    if (emojiInput) {
        const { createSafeEmoji } = await import('./safariButtonHelper.js');
        const validated = await createSafeEmoji(emojiInput);
        if (validated) {
            buttonEmoji = emojiInput;
        }
    }

    // Create the action shell (no outcome yet — added after item select)
    const actionId = await createCustomButton(guildId, {
        label: buttonName,
        emoji: buttonEmoji,
        style: 'Primary',
        actions: [],
        tags: []
    }, userId);

    // Set name and metadata
    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = buttonName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_item' };
    await saveSafariContent(safariData);

    // Store pending state for when item is selected
    quickItemPendingState.set(`${guildId}_${actionId}`, {
        coordinate,
        buttonName,
        buttonEmoji,
        userId
    });

    // Build item select UI
    const items = safariData[guildId]?.items || {};
    const itemEntries = Object.entries(items);

    if (itemEntries.length === 0) {
        return {
            components: [{
                type: 17, // Container
                accent_color: 16776960, // Yellow
                components: [
                    { type: 10, content: '### ⚠️ No Items Found' },
                    { type: 14 },
                    { type: 10, content: 'You need to create items first before using Quick Item.\n\nGo to **Location Actions** → **Actions** → create an action with a **Give Item** outcome to create items along the way.' },
                    { type: 14 },
                    {
                        type: 1,
                        components: [{
                            type: 2,
                            style: 2,
                            label: 'Back to Location',
                            custom_id: `quick_done_${coordinate}`
                        }]
                    }
                ]
            }]
        };
    }

    // Sort by most recently created/modified, take 25
    const sortedItems = itemEntries
        .sort(([, a], [, b]) => {
            // Items don't have timestamps, so use insertion order (Object.entries preserves it)
            return 0; // Keep insertion order (newest = last added)
        })
        .slice(-25) // Take last 25 (most recent)
        .reverse(); // Show newest first

    const selectOptions = sortedItems.map(([itemId, item]) => ({
        label: (item.name || itemId).slice(0, 100),
        value: itemId,
        emoji: item.emoji ? { name: item.emoji } : { name: '📦' },
        description: item.description ? item.description.slice(0, 100) : undefined
    }));

    return {
        components: [{
            type: 17, // Container
            accent_color: 5763719, // Green
            components: [
                { type: 10, content: `### ⚡ Quick Item — Select Item` },
                { type: 14 },
                { type: 10, content: `Action: **${buttonName}** at **${coordinate}**\nSelect the item to give (qty: 1x). Use the Action Editor for quantities > 1.` },
                {
                    type: 1,
                    components: [{
                        type: 3, // String Select
                        custom_id: `quick_item_select_${actionId}`,
                        placeholder: 'Select item to give...',
                        min_values: 1,
                        max_values: 1,
                        options: selectOptions
                    }]
                },
                { type: 10, content: itemEntries.length > 25 ? '-# Shows 25 most recent items — use Action Editor for older items.' : '' },
                { type: 14 },
                {
                    type: 1,
                    components: [{
                        type: 2,
                        style: 4, // Danger
                        label: 'Cancel',
                        custom_id: `quick_cancel_${actionId}_${coordinate}`
                    }]
                }
            ].filter(c => c.type !== 10 || c.content) // Remove empty text displays
        }]
    };
}

/**
 * Handle item selection for Quick Item flow
 * @returns {object} Components V2 confirmation UI
 */
export async function handleQuickItemSelect(guildId, actionId, itemId) {
    const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    const pending = quickItemPendingState.get(`${guildId}_${actionId}`);
    if (!pending) {
        return { content: '❌ Quick Item session expired. Please try again.' };
    }

    const { coordinate, buttonName, buttonEmoji } = pending;
    quickItemPendingState.delete(`${guildId}_${actionId}`);

    const safariData = await loadSafariContent();
    const action = safariData[guildId]?.buttons?.[actionId];
    if (!action) {
        return { content: '❌ Action not found. Please try again.' };
    }

    // Get item details
    const item = safariData[guildId]?.items?.[itemId];
    const itemName = item?.name || itemId;
    const itemEmoji = item?.emoji || '📦';

    // Add give_item outcome
    action.actions.push({
        type: 'give_item',
        order: 0,
        config: {
            itemId,
            quantity: 1,
            operation: 'give',
            limit: { type: 'once_per_player', claimedBy: [] }
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

    return buildQuickCreateConfirmUI(actionId, coordinate, {
        emoji: buttonEmoji,
        name: buttonName,
        summary: `Gives **1x** ${itemEmoji} **${itemName}**`,
        limitType: 'once_per_player',
        style: 'Primary'
    });
}

/**
 * Handle Quick Cancel — delete the pending action shell
 */
export async function handleQuickCancel(guildId, actionId, coordinate) {
    quickItemPendingState.delete(`${guildId}_${actionId}`);

    // Delete the action shell that was created
    const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    if (safariData[guildId]?.buttons?.[actionId]) {
        delete safariData[guildId].buttons[actionId];
        await saveSafariContent(safariData);
        console.log(`⚡ QUICK CANCEL: Deleted pending action ${actionId}`);
    }

    // Return to location actions
    return null; // Caller handles returning to location actions
}

/**
 * Build the post-creation confirmation UI with limit + color selects
 * Reusable across Quick Currency, Quick Item, and future Quick types.
 */
export function buildQuickCreateConfirmUI(actionId, coordinate, options) {
    const { emoji, name, summary, limitType = 'once_per_player', style = 'Primary' } = options;

    const emojiDisplay = emoji ? `${emoji} ` : '';

    const limitOptions = [
        { label: 'Unlimited', value: 'unlimited', emoji: { name: '♾️' }, default: limitType === 'unlimited' },
        { label: 'Once Per Player', value: 'once_per_player', emoji: { name: '👤' }, default: limitType === 'once_per_player' },
        { label: 'Once Globally', value: 'once_globally', emoji: { name: '🌍' }, default: limitType === 'once_globally' }
    ];

    const colorOptions = [
        { label: 'Blue (Primary)', value: 'Primary', emoji: { name: '🔵' }, default: style === 'Primary' },
        { label: 'Grey (Secondary)', value: 'Secondary', emoji: { name: '⚪' }, default: style === 'Secondary' },
        { label: 'Green (Success)', value: 'Success', emoji: { name: '🟢' }, default: style === 'Success' },
        { label: 'Red (Danger)', value: 'Danger', emoji: { name: '🔴' }, default: style === 'Danger' }
    ];

    return {
        components: [{
            type: 17, // Container
            accent_color: 5763719, // Green
            components: [
                { type: 10, content: `### ✅ Quick Action Created` },
                { type: 14 },
                { type: 10, content: `${emojiDisplay}**${name}**\n${summary}\nLocation: **${coordinate}**` },
                { type: 14 },
                {
                    type: 1,
                    components: [{
                        type: 3, // String Select
                        custom_id: `quick_limit_${actionId}_${coordinate}`,
                        placeholder: 'Usage Limit',
                        min_values: 1,
                        max_values: 1,
                        options: limitOptions
                    }]
                },
                {
                    type: 1,
                    components: [{
                        type: 3, // String Select
                        custom_id: `quick_color_${actionId}_${coordinate}`,
                        placeholder: 'Button Color',
                        min_values: 1,
                        max_values: 1,
                        options: colorOptions
                    }]
                },
                { type: 14 },
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 2,
                            label: 'Open Action Editor',
                            custom_id: `quick_edit_${actionId}_${coordinate}`,
                            emoji: { name: '✏️' }
                        },
                        {
                            type: 2,
                            style: 1,
                            label: 'Done',
                            custom_id: `quick_done_${coordinate}`,
                            emoji: { name: '✅' }
                        }
                    ]
                }
            ]
        }]
    };
}

/**
 * Handle usage limit change from the confirmation UI
 */
export async function handleQuickLimitChange(guildId, actionId, coordinate, limitType) {
    const { loadSafariContent, saveSafariContent, getCustomTerms } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const action = safariData[guildId]?.buttons?.[actionId];

    if (!action || !action.actions[0]) {
        return { content: '❌ Action not found.' };
    }

    // Update the outcome's limit
    const outcome = action.actions[0];
    if (!outcome.config.limit) outcome.config.limit = {};
    outcome.config.limit.type = limitType;
    if (limitType === 'once_per_player' && !Array.isArray(outcome.config.limit.claimedBy)) {
        outcome.config.limit.claimedBy = [];
    }

    await saveSafariContent(safariData);

    // Rebuild confirm UI with updated state
    const customTerms = await getCustomTerms(guildId);
    const summary = buildSummaryFromAction(action, customTerms);
    const style = action.trigger?.button?.style || action.style || 'Primary';

    return buildQuickCreateConfirmUI(actionId, coordinate, {
        emoji: action.emoji,
        name: action.name,
        summary,
        limitType,
        style
    });
}

/**
 * Handle button color change from the confirmation UI
 */
export async function handleQuickColorChange(guildId, actionId, coordinate, style) {
    const { loadSafariContent, saveSafariContent, getCustomTerms } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const action = safariData[guildId]?.buttons?.[actionId];

    if (!action) {
        return { content: '❌ Action not found.' };
    }

    // Update button style
    if (!action.trigger) action.trigger = { type: 'button' };
    if (!action.trigger.button) action.trigger.button = {};
    action.trigger.button.style = style;
    action.style = style; // Legacy field

    await saveSafariContent(safariData);

    // Queue anchor update
    try {
        const { queueActionCoordinateUpdates } = await import('./anchorMessageManager.js');
        queueActionCoordinateUpdates(guildId, actionId, 'quick_color_change');
    } catch (error) {
        console.error('Error queueing anchor update after color change:', error);
    }

    // Rebuild confirm UI with updated state
    const customTerms = await getCustomTerms(guildId);
    const summary = buildSummaryFromAction(action, customTerms);
    const limitType = action.actions[0]?.config?.limit?.type || 'once_per_player';

    return buildQuickCreateConfirmUI(actionId, coordinate, {
        emoji: action.emoji,
        name: action.name,
        summary,
        limitType,
        style
    });
}

/**
 * Build summary text from an action's first outcome
 */
function buildSummaryFromAction(action, customTerms) {
    const outcome = action.actions?.[0];
    if (!outcome) return 'No outcome configured';

    if (outcome.type === 'give_currency') {
        const amount = outcome.config?.amount || 0;
        const verb = amount > 0 ? 'Gives' : 'Removes';
        return `${verb} **${Math.abs(amount)}** ${customTerms.currencyEmoji} ${customTerms.currencyName}`;
    }

    if (outcome.type === 'give_item') {
        const qty = outcome.config?.quantity || 1;
        const itemId = outcome.config?.itemId;
        return `Gives **${qty}x** 📦 **${itemId}**`; // itemId is fine for rebuild
    }

    return 'Custom outcome';
}
