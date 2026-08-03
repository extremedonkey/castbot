/**
 * quickActionCreate.js — Quick Create shortcuts for map coordinate actions
 *
 * Provides streamlined single-modal shortcuts (Text, Item, ItemText, Currency,
 * Enemy, Command, Crafting) that create fully-formed Custom Actions in one
 * step, composed from a shared field-builder vocabulary below.
 * Creates regular Custom Actions — fully editable in the Action Editor after creation.
 */

import { InteractionResponseType } from 'discord-interactions';
import { parseAndValidateEmoji } from './utils/emojiUtils.js';
import { buildLimitOptions } from './utils/periodUtils.js';
import { buildItemSelectField } from './utils/itemSelectField.js';

// Quick create defaults: once_per_player is pre-selected. Custom/templates are excluded here
// because a single quick-create modal can't host the multi-step Custom config sub-screen —
// users pick Custom from the full Outcome Config editor instead.
const LIMIT_OPTIONS = buildLimitOptions({ currentLimit: 'once_per_player', periodDescription: 'Defaults to 1d in Quick Edit, change in Outcome Config', includeCustom: false });

// Grey (Secondary) first + default: true — matches the fallback style every
// submit handler below uses when the select isn't touched (Discord silently
// ignores String Select `default` inside modals, so ordering + the handler
// fallback are what actually control the "pre-selected" color, not this flag).
const COLOR_OPTIONS = [
    { label: 'Grey (Secondary)', value: 'Secondary', emoji: { name: '⚪' }, default: true },
    { label: 'Blue (Primary)', value: 'Primary', emoji: { name: '🔵' } },
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

// ─── Shared field builders ──────────────────────────────────────────────
// Quick Create modals compose from a small, consistent field vocabulary.
// Extracted here so new combinations (e.g. Quick ItemText) don't re-diverge
// wording across modals — keep labels/descriptions in sync via these, not
// copy-paste, when adding future Quick Create variants.

function buildButtonNameField(placeholder) {
    return {
        type: 18,
        label: 'Button Name',
        description: 'Label on the button the player clicks.',
        component: {
            type: 4,
            custom_id: 'button_name',
            style: 1,
            placeholder,
            required: true,
            max_length: 80
        }
    };
}

function buildTextToDisplayField() {
    return {
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
    };
}

/**
 * Item picker for the Quick Create modals.
 *
 * Quick Create has no "next screen" to escape to — the whole point is one modal — so when a
 * guild holds more items than a Discord select can show (25), the field says so and points at
 * the Action editor rather than silently offering the 25 newest and leaving the admin to
 * wonder where their item went.
 *
 * @param {Array} items - FULL sorted item list (capping happens inside the shared builder)
 */
function buildItemToGiveField(items) {
    return buildItemSelectField({
        items,
        customId: 'item_select',
        label: 'Item to Give',
        required: true,
        escape: 'edit'
    });
}

function buildButtonEmojiField(placeholder) {
    return {
        type: 18,
        label: 'Button Emoji (Optional)',
        description: 'Emoji that appears on the button.',
        component: {
            type: 4,
            custom_id: 'button_emoji',
            style: 1,
            placeholder,
            required: false,
            max_length: 100
        }
    };
}

function buildUsageLimitField(description = 'How many times can this action be used?') {
    return {
        type: 18,
        label: 'Usage Limit',
        description,
        component: {
            type: 3,
            custom_id: 'usage_limit',
            placeholder: 'Select usage limit...',
            min_values: 1,
            max_values: 1,
            options: LIMIT_OPTIONS
        }
    };
}

function buildButtonColorField(description = 'Color of the button.') {
    return {
        type: 18,
        label: 'Button Color',
        description,
        component: {
            type: 3,
            custom_id: 'button_color',
            placeholder: 'Select button color...',
            min_values: 1,
            max_values: 1,
            options: COLOR_OPTIONS
        }
    };
}

/**
 * Map raw item records to String Select options (label/value/emoji/description),
 * newest-metadata-first callers should pre-sort via getSortedQuickCreateItems().
 * Shared by every Quick Create modal that offers an item picker.
 */
function buildItemOptions(items) {
    return items.slice(0, 25).map(item => {
        const opt = {
            label: (item.name || item.id).slice(0, 100),
            value: item.id
        };
        opt.emoji = parseAndValidateEmoji(item.emoji, '📦').emoji;
        if (item.description) opt.description = item.description.slice(0, 100);
        return opt;
    });
}

/**
 * Load this guild's Safari items sorted by most-recently-updated first, for
 * Quick Create item selects. Falls back to creation time for items that have
 * never been edited since. Replaces the old ID-suffix-parsing sort, which
 * only compared the last 6 digits of the creation timestamp — those wrap
 * every ~16.7 minutes, so two items created that far apart could sort in the
 * wrong order even by "newest first" semantics, let alone "last updated."
 * @param {string} guildId
 * @returns {Promise<Array>} ALL items, newest-first: { id, name, emoji, description }.
 *   Deliberately uncapped — buildItemSelectField caps to 25 AND reports how many it left out;
 *   capping here made the true total invisible, which is what hid the truncation.
 */
export async function getSortedQuickCreateItems(guildId) {
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const items = safariData[guildId]?.items || {};
    return Object.entries(items)
        .map(([id, item]) => ({
            id,
            name: item.name,
            emoji: item.emoji,
            description: item.description,
            _sortKey: item.metadata?.lastModified || item.metadata?.createdAt || 0
        }))
        .sort((a, b) => b._sortKey - a._sortKey)
        .map(({ _sortKey, ...rest }) => rest);
}

// ─── Modal payload helpers ───────────────────────────────────────────────
// app.js button handlers should be routing, not fetching + validating +
// building — these do that work so the handler is just "call this, respond
// with what it returns." Each resolves to { modal } on success or
// { error } (a plain user-facing message, no emoji/formatting) otherwise.

/**
 * Resolve the Quick Item modal, or an error if the guild has no items yet.
 */
export async function getQuickItemModalPayload(guildId, coordinate) {
    const sortedItems = await getSortedQuickCreateItems(guildId);
    if (sortedItems.length === 0) {
        return { error: 'No items exist yet. Create items first via **Actions** → **Give Item** outcome.' };
    }
    return { modal: buildQuickItemModal(coordinate, sortedItems) };
}

/**
 * Resolve the Quick ItemText modal, or an error if the guild has no items yet.
 */
export async function getQuickItemTextModalPayload(guildId, coordinate) {
    const sortedItems = await getSortedQuickCreateItems(guildId);
    if (sortedItems.length === 0) {
        return { error: 'No items exist yet. Create items first via **Actions** → **Give Item** outcome.' };
    }
    return { modal: buildQuickItemTextModal(coordinate, sortedItems) };
}

/**
 * Resolve the Quick CmdText modal (needs the guild's command prefixes).
 */
export async function getQuickCommandModalPayload(guildId, coordinate) {
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const prefixes = safariData[guildId]?.safariConfig?.commandPrefixes || [];
    return { modal: buildQuickCommandModal(coordinate, prefixes) };
}

/**
 * Resolve the Quick CmdItem modal — needs items (like Quick Item) AND the
 * guild's command prefixes (like Quick CmdText), or an error if no items yet.
 */
export async function getQuickCmdItemModalPayload(guildId, coordinate) {
    const sortedItems = await getSortedQuickCreateItems(guildId);
    if (sortedItems.length === 0) {
        return { error: 'No items exist yet. Create items first via **Actions** → **Give Item** outcome.' };
    }
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const prefixes = safariData[guildId]?.safariConfig?.commandPrefixes || [];
    return { modal: buildQuickCmdItemModal(coordinate, prefixes, sortedItems) };
}

/**
 * Resolve the Quick Crafting modal, or an error if the guild has <2 items.
 */
export async function getQuickCraftingModalPayload(guildId, coordinate) {
    const { getCustomTerms } = await import('./safariManager.js');
    const sortedItems = await getSortedQuickCreateItems(guildId);
    if (sortedItems.length < 2) {
        return { error: 'You need at least 2 items to create a crafting recipe. Add items via **Actions** → **Give Item** outcome first.' };
    }
    const customTerms = await getCustomTerms(guildId);
    const craftingName = customTerms.craftingName || 'Crafting';
    return { modal: buildQuickCraftingModal(coordinate, sortedItems, craftingName) };
}

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
            buildButtonNameField('e.g., "Read the Sign"'),
            buildTextToDisplayField(),
            buildButtonEmojiField('e.g., 📃'),
            buildUsageLimitField(),
            buildButtonColorField('Color of the button. Also sets the accent color of the text display.')
        ]
    };
}

/**
 * Build the Quick ItemText modal — 5 fields
 * Combines Quick Text + Quick Item: a display_text outcome followed by a
 * give_item outcome, in one modal. Button Color is intentionally omitted
 * (button defaults to Secondary/Grey) to keep the combined modal at 5 fields.
 * @param {string} coordinate - Map coordinate (e.g. "A2")
 * @param {Array} items - Array of { id, name, emoji, description } for the item select
 * @returns {object} Modal interaction response data
 */
export function buildQuickItemTextModal(coordinate, items) {
    return {
        custom_id: `quick_itemtext_modal_${coordinate}`,
        title: 'Quick ItemText Action',
        components: [
            buildButtonNameField('e.g., "Open Chest"'),
            buildTextToDisplayField(),
            buildItemToGiveField(items),
            buildButtonEmojiField('e.g., 📦'),
            buildUsageLimitField()
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
    return {
        custom_id: `quick_item_modal_${coordinate}`,
        title: 'Quick Item Action',
        components: [
            buildButtonNameField('e.g., "Open Chest"'),
            buildItemToGiveField(items),
            buildButtonEmojiField('e.g., 📦'),
            buildUsageLimitField(),
            buildButtonColorField()
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
 * Find a modal component by its custom_id and extract its value — index-free,
 * so an optional field (the command prefix select) can't shift later reads.
 */
function getModalValueById(modalComponents, customId) {
    return getModalValue((modalComponents || []).find(c => c?.component?.custom_id === customId));
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
    const style = getModalValue(modalComponents[4]) || 'Secondary';

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
    const style = getModalValue(modalComponents[4]) || 'Secondary';

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
    const style = getModalValue(modalComponents[4]) || 'Secondary';

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
 * Handle Quick ItemText modal submission — creates action with display_text
 * THEN give_item outcomes (display_text first so it renders first when the
 * two outcome responses are bundled — most visually appealing), returns Action Editor.
 * No Button Color field — button defaults to Secondary (Grey).
 */
export async function handleQuickItemTextSubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    const buttonName = getModalValue(modalComponents[0]);
    const displayContent = getModalValue(modalComponents[1]);
    const itemId = getModalValue(modalComponents[2]);
    const emojiInput = getModalValue(modalComponents[3]);
    const limitType = getModalValue(modalComponents[4]) || 'once_per_player';
    const style = 'Secondary'; // No color field in this modal — fixed default (grey)

    if (!buttonName) return { error: 'Button name is required.' };
    if (!displayContent) return { error: 'Text to display is required.' };
    if (!itemId) return { error: 'Item selection is required.' };

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
    action.metadata = { ...action.metadata, createdVia: 'quick_itemtext' };

    if (!action.trigger) action.trigger = { type: 'button' };
    if (!action.trigger.button) action.trigger.button = {};
    action.trigger.button.style = style;
    action.style = style;

    const item = safariData[guildId]?.items?.[itemId];
    const itemName = item?.name || itemId;

    // display_text first — renders first in the bundled response (most visually appealing)
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

    // Usage limit gates the reward (give_item), matching Quick Item's behavior —
    // display_text itself isn't claim-gated (it's not a "rewarding" outcome).
    action.actions.push({
        type: 'give_item',
        order: 1,
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
            console.error('Error queueing anchor update after quick itemtext:', error);
        }
    }

    console.log(`⚡ QUICK ITEMTEXT: Created action ${actionId} at ${coordinate} — Display + Gives 1x ${itemName}`);

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

// ─── Shared command-trigger fields (Quick CmdText + Quick CmdItem) ──────
// Same anti-divergence rule as the button field builders above: both
// command-triggered modals compose from these, never copy-paste.

function buildCommandNameField() {
    return {
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
    };
}

/** Prefix select — returns null when the guild has no prefixes configured. */
function buildCommandPrefixField(prefixes) {
    if (!prefixes || prefixes.length === 0) return null;
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
    return {
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
    };
}

function buildCommandPhraseField() {
    return {
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
    };
}

/**
 * Build the Quick CmdText modal (button label "CmdText", formerly "Quick Command") — 5 fields
 * Creates a Command-triggered action with one phrase and a display_text outcome.
 * custom_ids keep the historical quick_command_* names — renaming them would
 * orphan the deployed button/modal routing for zero user-visible benefit.
 * @param {string} coordinate - Map coordinate (e.g. "E7") or "global"
 * @param {Array} prefixes - Guild command prefixes [{ label, emoji?, description? }]
 * @returns {object} Modal interaction response data
 */
export function buildQuickCommandModal(coordinate, prefixes = []) {
    const modalComponents = [buildCommandNameField()];

    const prefixField = buildCommandPrefixField(prefixes);
    if (prefixField) modalComponents.push(prefixField);

    modalComponents.push(
        buildCommandPhraseField(),
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
        buildUsageLimitField('How many times can this command be used?')
    );

    return {
        custom_id: `quick_command_modal_${coordinate}`,
        title: '❗ Quick CmdText',
        components: modalComponents
    };
}

/**
 * Build the Quick CmdItem modal — Quick CmdText with the "Text to display"
 * field swapped for Quick Item's item picker: a Command-triggered action
 * whose outcome gives an item instead of showing text.
 * @param {string} coordinate - Map coordinate (e.g. "E7") or "global"
 * @param {Array} prefixes - Guild command prefixes [{ label, emoji?, description? }]
 * @param {Array} items - FULL sorted item list (capping happens inside the shared builder)
 * @returns {object} Modal interaction response data
 */
export function buildQuickCmdItemModal(coordinate, prefixes = [], items = []) {
    const modalComponents = [buildCommandNameField()];

    const prefixField = buildCommandPrefixField(prefixes);
    if (prefixField) modalComponents.push(prefixField);

    modalComponents.push(
        buildCommandPhraseField(),
        buildItemToGiveField(items),
        buildUsageLimitField('How many times can this command be used?')
    );

    return {
        custom_id: `quick_cmditem_modal_${coordinate}`,
        title: '❗ Quick CmdItem',
        components: modalComponents
    };
}

/**
 * Handle Quick CmdText modal submit — creates a Command-trigger action with phrase + display_text
 */
export async function handleQuickCommandSubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    // Fields resolved by custom_id — the prefix select only exists when the guild
    // has prefixes configured, so positional indexing would misalign without it
    const commandName = getModalValueById(modalComponents, 'command_name');
    const prefixValue = getModalValueById(modalComponents, 'command_prefix') || 'freeform';
    const phraseText = getModalValueById(modalComponents, 'command_phrase');
    const displayContent = getModalValueById(modalComponents, 'display_content');
    const limitType = getModalValueById(modalComponents, 'usage_limit') || 'once_per_player';

    if (!commandName) return { error: 'Command name is required.' };
    if (!phraseText) return { error: 'Command phrase is required.' };
    if (!displayContent) return { error: 'Text to display is required.' };

    // Concatenate prefix + phrase
    const fullPhrase = (prefixValue === 'freeform' || !prefixValue)
        ? phraseText.trim().toLowerCase()
        : `${prefixValue} ${phraseText.trim()}`.toLowerCase();

    const style = 'Secondary'; // No color field in this modal (no button either — command trigger) — fixed default (grey)

    // Create the action shell
    const actionId = await createCustomButton(guildId, {
        label: commandName, emoji: null, style, actions: [], tags: []
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
            color: STYLE_TO_ACCENT_COLOR[style] || '3498db'
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
 * Handle Quick CmdItem modal submit — creates a Command-trigger action with
 * phrase + give_item outcome (Quick CmdText × Quick Item hybrid).
 */
export async function handleQuickCmdItemSubmit(guildId, userId, coordinate, modalComponents) {
    const { createCustomButton, loadSafariContent, saveSafariContent } = await import('./safariManager.js');

    // Fields resolved by custom_id — the prefix select only exists when the guild
    // has prefixes configured, so positional indexing would misalign without it
    const commandName = getModalValueById(modalComponents, 'command_name');
    const prefixValue = getModalValueById(modalComponents, 'command_prefix') || 'freeform';
    const phraseText = getModalValueById(modalComponents, 'command_phrase');
    const itemId = getModalValueById(modalComponents, 'item_select');
    const limitType = getModalValueById(modalComponents, 'usage_limit') || 'once_per_player';

    if (!commandName) return { error: 'Command name is required.' };
    if (!phraseText) return { error: 'Command phrase is required.' };
    if (!itemId) return { error: 'Item selection is required.' };

    // Concatenate prefix + phrase
    const fullPhrase = (prefixValue === 'freeform' || !prefixValue)
        ? phraseText.trim().toLowerCase()
        : `${prefixValue} ${phraseText.trim()}`.toLowerCase();

    const style = 'Secondary'; // Command trigger — no button, fixed default (grey)

    // Create the action shell
    const actionId = await createCustomButton(guildId, {
        label: commandName, emoji: null, style, actions: [], tags: []
    }, userId);

    const safariData = await loadSafariContent();
    const action = safariData[guildId].buttons[actionId];
    action.name = commandName;
    action.description = '';
    action.metadata = { ...action.metadata, createdVia: 'quick_cmditem' };

    // Set trigger to Command (modal) with the phrase
    action.trigger = {
        type: 'modal',
        phrases: [fullPhrase]
    };

    const item = safariData[guildId]?.items?.[itemId];
    const itemName = item?.name || itemId;

    // give_item outcome — same shape as Quick Item (limit gates the reward)
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
            console.error('Error queueing anchor update after quick cmditem:', error);
        }
    }

    console.log(`⚡ QUICK CMDITEM: Created action ${actionId} at ${coordinate} — Phrase: "${fullPhrase}" → Gives 1x ${itemName}`);

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
    const itemOptions = buildItemOptions(items);

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
    const style = getModalValue(modalComponents[4]) || 'Secondary';

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
