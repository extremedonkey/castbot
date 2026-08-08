/**
 * Safari Configuration UI Manager
 * Creates Components V2 interface for Safari customization using field groups
 * Replaces legacy single-modal approach with grouped field editing
 */

import { EDIT_CONFIGS, EDIT_TYPES } from './editFramework.js';
import { loadPlayerData } from './storage.js';
import { getBotEmoji } from './botEmojis.js';
import { normalizeNavigateMode } from './safariFeatureFlags.js';

// Map a STORED config value to the radio option value that should be pre-selected.
// Every adapter must return a valid option value for ANY input (incl. undefined/garbage)
// so the Radio Group always renders with exactly one `default: true`.
const RADIO_VALUE_ADAPTERS = {
    currencyEnabled: v => (v === false || v === 'disabled') ? 'disabled' : 'enabled',
    navigatePaneMode: v => normalizeNavigateMode(v)
};

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
                content: `## 🔐 Roles & Security\n\nConfigure which roles have access to CastBot features beyond server admins.\n\n**Current roles with full CastBot access:**\n${roleListText}\n\n-# **Note**: Currently only gives access to Cast Applications and all Safari channel locations.`
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
 * @param {string} [userId] - Viewer's user ID — gates the Reece-only Advanced buttons
 *   (display-only: data_admin/reeces_stuff handlers re-check restrictedUser)
 * @returns {Object} Discord Components V2 interface
 */
export async function createSafariCustomizationUI(guildId, currentConfig, userId = null) {
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
        label: 'Stamina',
        style: 2, // Secondary
        emoji: { name: '⚡' }
    });

    // Separate legacy buttons (events, rounds) from main field-group buttons.
    // Legacy buttons are rendered in the bottom 📼 Legacy section.
    const legacyKeys = ['events', 'rounds'];
    const mainButtons = fieldGroupButtons.filter(
        b => !legacyKeys.some(k => b.custom_id === `safari_config_group_${k}`)
    );
    const legacyButtons = legacyKeys
        .map(k => fieldGroupButtons.find(b => b.custom_id === `safari_config_group_${k}`))
        .filter(Boolean);

    // Safari-section buttons: field groups + Stamina (already in mainButtons) + Commands.
    // Chunked DYNAMICALLY across Action Rows (5-button Discord cap): ≤5 → one row;
    // more → balanced rows (6 → 3+3, 7 → 4+3, …).
    const safariButtons = [
        ...mainButtons,
        { type: 2, custom_id: 'command_prefixes_menu', label: 'Commands', style: 2, emoji: { name: '❗' } }
    ];
    const safariRowCount = Math.ceil(safariButtons.length / 5);
    const perRow = Math.ceil(safariButtons.length / safariRowCount);
    const safariRows = [];
    for (let i = 0; i < safariButtons.length; i += perRow) {
        safariRows.push({ type: 1, components: safariButtons.slice(i, i + perRow) });
    }

    // Create Components V2 Container — LEAN design
    // NOTE: this screen used to dump every setting's current value as ~30 lines of text
    // above the buttons. Removed 2026-07-29 — every section duplicated the button that
    // edits it (each editor shows its own current values), so it was a wall of text
    // pushing the actual controls off-screen.
    const containerComponents = [
        { type: 10, content: `## ⚙️ CastBot Settings` },
        { type: 10, content: `### \`\`\`🎛️ CastBot-Wide Settings\`\`\`` },
        { type: 1, components: [
            { type: 2, custom_id: 'castbot_general', label: 'General', style: 2, emoji: getBotEmoji('castbot_logo') || { name: '⚙️' } },
            { type: 2, custom_id: 'safari_player_menu_config', label: 'Player Menu', style: 2, emoji: { name: '🕹️' } },
            { type: 2, custom_id: 'prod_manage_pronouns_timezones', label: 'Reaction Roles', style: 2, emoji: { name: '💜' } },
            // Same handler as the Setup Wizard's Run Setup — idempotent, so it doubles as
            // "re-run setup" (e.g. to refresh old timezone roles). Moved here from Tools.
            { type: 2, custom_id: 'setup_castbot', label: 'Setup', style: 2, emoji: { name: '⚙️' } },
            { type: 2, custom_id: 'scheduled_jobs_dashboard', label: 'Scheduled Jobs', style: 2, emoji: { name: '⏰' } }
        ] },
        { type: 14 },
        { type: 10, content: `### \`\`\`🦁 Idol Hunts, Challenges and Safari Settings\`\`\`` },
        ...safariRows,
        { type: 14 },
        { type: 10, content: `### \`\`\`⚙️ Advanced\`\`\`` },
        {
            type: 1,
            components: [
                { type: 2, custom_id: 'castbot_roles_security', label: 'Roles', style: 2, emoji: { name: '🔐' } },
                { type: 2, custom_id: 'safari_configure_log', label: 'Logs', style: 2, emoji: { name: '🪵' } },
                // Import/Export moved to CastBot Premium → Safari Utilities (2026-08-08);
                // Data + Reece's Stuff moved here from Tools same day (display-only gate — handlers re-check)
                ...(['391415444084490240', '1086246253819613274'].includes(userId) ? [
                    { type: 2, custom_id: 'data_admin', label: 'Data', style: 4, emoji: { name: '🧮' } },
                    { type: 2, custom_id: 'reeces_stuff', label: "Reece's Stuff", style: 4, emoji: { name: '🐧' } }
                ] : []),
                { type: 2, custom_id: 'safari_config_reset_defaults', label: 'Reset', style: 4, emoji: { name: '🔄' } }
            ]
        },
        { type: 14 },
        { type: 10, content: `### \`\`\`📼 Legacy\`\`\`` },
        {
            type: 1,
            components: [
                // Tycoons lives ONLY here now (removed from Tools/Premium menus 2026-08-08)
                { type: 2, custom_id: 'tycoons_legacy', label: 'Tycoons', style: 2, emoji: { name: '💼' } },
                ...legacyButtons
            ]
        },
        { type: 14 },
        {
            type: 1,
            components: [
                { type: 2, custom_id: 'prod_production_menu', label: '← Back', style: 2 },
                // Guide moved to Map Explorer; Policy = merged ToS + Privacy (2026-08-08)
                { type: 2, custom_id: 'castbot_policy', label: 'Policy', style: 2, emoji: { name: '📜' } }
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
        craftingName: 'What the crafting feature is called in menus and buttons (e.g. Gardening, Cooking).',
        craftingEmoji: 'Unicode emoji or custom Discord emoji code for crafting.',
        goodEventName: 'Name for positive random events.',
        badEventName: 'Name for negative random events.',
        goodEventEmoji: 'Emoji shown for positive events.',
        badEventEmoji: 'Emoji shown for negative events.',
        round1GoodProbability: 'Chance of a good event in round 1 (0-100).',
        round2GoodProbability: 'Chance of a good event in round 2 (0-100).',
        round3GoodProbability: 'Chance of a good event in round 3 (0-100).',
        defaultStartingCoordinate: 'Where new players spawn on the map (e.g. A1).',
        // Discord caps Label.description at 100 chars — keep it short or the modal is rejected
        reverseBlacklistRequireAll: 'Multi-key doors: a cell unlocked by several items needs ALL of them. Off = any one unlocks it.',
        currencyEnabled: 'Leave Enabled unless running an escape room with no visible economy.',
        navigatePaneMode: 'Leave Enabled unless players move via host commands only (escape rooms).'
    };

    const components = [];

    // Legacy Tycoons warning shown above the Rounds modal fields
    if (groupKey === 'rounds') {
        components.push({
            type: 10, // Text Display
            content: '### ⚠️ Legacy Tycoons Feature\n\nRound probabilities power the legacy **Tycoons** simulation (💼 Tycoons in Settings → Legacy). For new games, use **Challenges** instead.'
        });
    }

    Object.entries(groupConfig.fields).forEach(([fieldKey, fieldConfig]) => {
        // Pre-populate with current value (with sensible defaults for emoji fields)
        let currentValue = currentConfig[fieldKey];
        if (fieldKey === 'inventoryEmoji' && !currentValue) currentValue = '🧰';
        if (fieldKey === 'craftingEmoji' && !currentValue) currentValue = '🛠️';
        if (fieldKey === 'craftingName' && !currentValue) currentValue = 'Crafting';

        // Radio fields render as a Radio Group (type 21) inside the Label. EXACTLY ONE option
        // carries `default: true` — an explicit default:false on a sibling suppresses
        // pre-selection for the whole group, and options take NO emoji field (ComponentsV2.md).
        if (fieldConfig.type === 'radio') {
            const adapt = RADIO_VALUE_ADAPTERS[fieldKey];
            const current = adapt
                ? adapt(currentValue)
                : (fieldConfig.options.some(o => o.value === currentValue) ? currentValue : fieldConfig.options[0].value);
            const label = {
                type: 18, // Label
                label: fieldConfig.label,
                component: {
                    type: 21, // Radio Group (modal-only)
                    custom_id: fieldKey,
                    required: true,
                    options: fieldConfig.options.map(o => ({
                        label: o.label,
                        value: o.value,
                        ...(o.description ? { description: o.description } : {}),
                        ...(o.value === current ? { default: true } : {})
                    }))
                }
            };
            const rDesc = fieldDescriptions[fieldKey];
            if (rDesc) label.description = rDesc;
            components.push(label);
            return;
        }

        // Boolean fields render as a Checkbox (type 23) inside the Label, not a text input.
        // Unset/undefined must render UNCHECKED so legacy guilds see their real (legacy) state.
        // NEVER add `required` here — a Checkbox cannot be required and Discord rejects the
        // WHOLE modal with "This interaction failed" (see ComponentsV2.md, Checkbox type 23).
        if (fieldConfig.type === 'boolean') {
            const label = {
                type: 18,
                label: fieldConfig.label,
                component: { type: 23, custom_id: fieldKey, default: currentValue === true }
            };
            const boolDesc = fieldDescriptions[fieldKey];
            if (boolDesc) label.description = boolDesc;
            components.push(label);
            return;
        }

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
                // Nonce suffix: Discord caches modal DRAFTS per custom_id ACROSS SERVERS —
                // a static id let one guild's entries render inside another guild's modal
                // (observed 2026-08-05: TEST selections shown on the prod modal). A unique
                // id per open means the client can never match a stale draft. The submit
                // handler strips the trailing _digits to recover the group key.
                custom_id: `safari_config_modal_${groupKey}_${Date.now()}`,
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
    const components = modalData.components || [];

    // Build a custom_id → value lookup so we tolerate non-input modal entries
    // (e.g. type 10 Text Display warnings) without index-fragility.
    const valuesByCustomId = {};
    for (const row of components) {
        // Label-wrapped (type 18): row.component is the input. Radio Groups (type 21) are
        // documented to deliver a scalar `value`, but two prior call sites defensively accept
        // `values[]` — keep both shapes working here (the radio branch below unwraps arrays).
        if (row?.component?.custom_id !== undefined) {
            valuesByCustomId[row.component.custom_id] = row.component.values !== undefined
                ? row.component.values
                : row.component.value;
            continue;
        }
        // ActionRow-wrapped (type 1, legacy): row.components[] are inputs
        if (Array.isArray(row?.components)) {
            for (const inner of row.components) {
                if (inner?.custom_id !== undefined) {
                    valuesByCustomId[inner.custom_id] = inner.values !== undefined ? inner.values : inner.value;
                }
            }
        }
    }

    Object.entries(groupConfig.fields).forEach(([fieldKey, fieldConfig]) => {
        const value = valuesByCustomId[fieldKey];

        // Radio Groups (type 21) submit the selected option value — pass the RAW string
        // through; normalization/coercion happens in the single setter (updateCustomTerms).
        // Discord returns `value: null` when nothing is selected (ComponentsV2.md) — that
        // MUST mean "no change", never a write.
        if (fieldConfig.type === 'radio') {
            const raw = Array.isArray(value) ? value[0] : value;
            if (raw !== undefined && raw !== null && raw !== '') {
                updates[fieldKey] = raw;
            }
            return;
        }

        // Checkboxes (type 23) submit a boolean. Handled before the empty-value skip below
        // because `false` is a real value — unchecking must persist, not be treated as
        // "unchanged" — and before the string branch because .trim() would throw on it.
        if (fieldConfig.type === 'boolean') {
            updates[fieldKey] = value === true;
            return;
        }

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
 * Get emoji for field group buttons
 * @param {string} groupKey - Field group key
 * @returns {string} Emoji character
 */
function getGroupEmoji(groupKey) {
    const emojis = {
        currency: '🪙',
        inventory: '🎒',
        crafting: '🛠️',
        events: '☄️',
        rounds: '🎲',
        location: '🗺️'
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
            content: `## ⚠️ Reset CastBot Settings\n\nAre you sure you want to reset all settings to default values?\n\n**This will reset:**\n• 🪙 Currency (name, emoji, starting amount)\n• 🎒 Inventory (name, emoji)\n• 🛠️ Crafting (name, emoji)\n• ☄️ Event names and emojis\n• 🎲 Round probabilities (75%, 50%, 25%)\n• 📍 Default starting coordinate (A1)\n• ⚡ Stamina settings\n• 🕹️ Player Menu visibility\n\n**Will NOT reset:**\n• 🔐 Roles & Security whitelist\n• 📊 Safari Log channel\n• ❗ Command prefixes\n• 🔑 Require ALL Key Items (would unlock multi-key doors mid-game)\n• 🪙 Currency Visibility / 🗺️ Navigate Pane (game-rule settings — a reset must not flip live rules)\n\n**This action cannot be undone.**`
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

/**
 * Build the CastBot Logs (Safari Log) configuration screen.
 * SINGLE source for this screen — used by safari_configure_log, safari_log_toggle,
 * safari_log_channel_set and safari_log_types_set (previously four drifting copies
 * in app.js; the re-render copies had lost the accent color).
 *
 * @param {Object} logSettings - safariLogSettings for the guild (may be {}/null)
 * @param {Object} opts
 * @param {boolean} opts.whispersEnabled - safariConfig.whispersEnabled !== false
 * @returns {Object} Components V2 response ({ flags, components })
 */
export function buildSafariLogConfigUI(logSettings, { whispersEnabled = true } = {}) {
    const settings = logSettings || {};
    const enabled = !!settings.enabled;

    // Status display
    let statusText = `## 🪵 CastBot Logs\n\n`;
    statusText += `-# Logs activity from Idol Hunts, Challenges and Safari features — currency, items, stores, movement and more.\n\n`;
    statusText += `**Status:** ${enabled ? '🟢 Enabled' : '🔴 Disabled'}\n`;
    statusText += `**Log Channel:** ${settings.logChannelId ? `<#${settings.logChannelId}>` : 'Not Set'}\n`;
    statusText += `**Log Format:** ${settings.logFormat === 'enhanced' ? '✨ Enhanced' : '📜 Classic'}\n`;
    statusText += `**Whispers:** ${whispersEnabled ? '🟢 On' : '🔴 Off'}`;
    statusText += ` · **Whisper Log:** ${settings.whisperLogChannelId ? `<#${settings.whisperLogChannelId}>` : 'Not Set'}\n\n`;

    if (enabled && settings.logChannelId) {
        // Only the 9 visible/selectable types — hidden types (testMessages) never listed
        const logTypeNames = {
            whispers: '🤫 Whispers',
            itemPickups: '🧰 Item Pickups',
            currencyChanges: '🪙 Currency Changes',
            storeTransactions: '🛒 Store Purchases',
            buttonActions: '🎯 Safari Actions',
            mapMovement: '🗺️ Map Movement',
            attacks: '⚔️ Attack Queue',
            customActions: '⌨️ Custom Actions',
            staminaChanges: '⚡ Stamina Changes',
            askCastBotEdits: '👾 Ask CastBot Edits'
        };
        // Missing keys default to enabled (mergeLogTypes semantics, inlined to keep this pure/sync)
        const logTypes = settings.logTypes || {};
        const activeLines = Object.keys(logTypeNames)
            .filter(type => logTypes[type] !== false)
            .map(type => `• ${logTypeNames[type]}`);
        if (activeLines.length > 0) {
            statusText += `**Active Log Types:**\n${activeLines.join('\n')}\n`;
        }
    }

    const container = {
        type: 17, // Container
        accent_color: 0x9B59B6, // Purple accent — always (re-renders used to drop it)
        components: [
            { type: 10, content: statusText },
            { type: 14 }, // Separator
            {
                type: 1, // Action Row — toggle
                components: [{
                    type: 2,
                    custom_id: 'safari_log_toggle',
                    label: enabled ? 'Disable Safari Log' : 'Enable Safari Log',
                    style: enabled ? 4 : 3,
                    emoji: { name: enabled ? '🔴' : '🟢' }
                }]
            },
            { type: 14 }, // Separator
            {
                type: 1, // Action Row — log format (Classic/Enhanced), applies immediately on select
                components: [{
                    type: 3, // String Select
                    custom_id: 'safari_log_format_select',
                    placeholder: 'Set Log Type',
                    min_values: 1,
                    max_values: 1,
                    options: [
                        {
                            label: 'Log Format: Classic',
                            value: 'classic',
                            emoji: { name: '📜' },
                            description: 'Most detail but difficult to read',
                            default: settings.logFormat !== 'enhanced'
                        },
                        {
                            label: 'Log Format: Enhanced',
                            value: 'enhanced',
                            emoji: { name: '✨' },
                            description: 'Formats logs nicer, less detail',
                            default: settings.logFormat === 'enhanced'
                        }
                    ]
                }]
            },
            { type: 14 }, // Separator
            {
                type: 1, // Action Row — config buttons
                components: [
                    { type: 2, custom_id: 'safari_log_channel_select', label: 'Set Log Channel', style: 2, emoji: { name: '📝' }, disabled: !enabled },
                    { type: 2, custom_id: 'safari_log_types_config', label: 'Configure Log Types', style: 2, emoji: { name: '⚙️' }, disabled: !enabled },
                    { type: 2, custom_id: 'safari_log_test', label: 'Send Test Message', style: 2, emoji: { name: '🧪' }, disabled: !enabled || !settings.logChannelId }
                ]
            },
            { type: 14 }, // Separator
            {
                type: 1, // Action Row — back
                components: [
                    { type: 2, custom_id: 'castbot_settings', label: '← Settings', style: 2, emoji: { name: '⚙️' } }
                ]
            }
        ]
    };

    return {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: [container]
    };
}

/**
 * Build the Whisper Settings screen (opened from CastBot Logs → Whispers).
 * Whisper-only strip-down of the Logs screen: feature toggle + dedicated
 * spectator-safe whisper log channel (receives ONLY whispers, works even when
 * the main log is disabled — dual delivery when both are configured).
 *
 * @param {Object} opts
 * @param {boolean} opts.whispersEnabled - whisper FEATURE on/off (default ON)
 * @param {string|null} opts.whisperLogChannelId - dedicated whisper log channel
 * @param {boolean} opts.mainLogWhispersActive - main log currently also posts whispers
 * @returns {Object} Components V2 response ({ flags, components })
 */
export function buildWhisperLogConfigUI({ whispersEnabled = true, whisperLogChannelId = null, mainLogWhispersActive = false } = {}) {
    let statusText = `## 🤫 Whisper Settings\n\n`;
    statusText += `-# Player-to-player whispers. The dedicated Whisper Log only ever receives whispers — safe to show spectators.\n\n`;
    statusText += `**Whispers:** ${whispersEnabled ? '🟢 On' : '🔴 Off'}\n`;
    statusText += `**Whisper Log Channel:** ${whisperLogChannelId ? `<#${whisperLogChannelId}>` : 'Not Set'}\n`;
    statusText += `-# Main CastBot Log is ${mainLogWhispersActive ? 'also posting whispers — whispers deliver to both channels' : 'not posting whispers'}.`;

    const container = {
        type: 17, // Container
        accent_color: 0x9B59B6, // Purple — matches the Logs screen family
        components: [
            { type: 10, content: statusText },
            { type: 14 }, // Separator
            {
                type: 1, // Action Row — whisper FEATURE toggle (default ON)
                components: [{
                    type: 2,
                    custom_id: 'safari_whispers_toggle',
                    label: whispersEnabled ? 'Turn Whispers Off' : 'Turn Whispers On',
                    style: whispersEnabled ? 4 : 3,
                    emoji: { name: whispersEnabled ? '🔇' : '🔊' }
                }]
            },
            { type: 14 }, // Separator
            {
                type: 1, // Action Row — inline channel select (submit empty to clear/disable)
                components: [{
                    type: 8, // Channel Select
                    custom_id: 'whisper_log_channel_set',
                    channel_types: [0], // text channels
                    min_values: 0,
                    max_values: 1,
                    placeholder: 'Select whisper log channel (clear to disable)...',
                    default_values: whisperLogChannelId ? [{ id: whisperLogChannelId, type: 'channel' }] : []
                }]
            },
            { type: 14 }, // Separator
            {
                type: 1, // Action Row — back (to Map Explorer, the entry point) + test
                components: [
                    { type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2, emoji: { name: '🗺️' } },
                    { type: 2, custom_id: 'whisper_log_test', label: 'Test', style: 2, emoji: { name: '🧪' }, disabled: !whisperLogChannelId }
                ]
            }
        ]
    };

    return {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: [container]
    };
}

/**
 * Export selection screen (Settings → Advanced → Export).
 * Multi-select of Safari components; selecting fires safari_export_select which
 * builds either a v2 JSON envelope or (with Map Image) a ZIP package.
 * All data components are preselected so "select-all → export everything" is 2 clicks.
 */
export function buildExportSelectionUI() {
    return {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: [{
            type: 17,
            accent_color: 0x9b59b6,
            components: [
                { type: 10, content: '## 📤 Export Safari Data' },
                { type: 10, content: '-# Pick what to include, then close the menu to generate the export.' },
                { type: 14 },
                {
                    type: 1,
                    components: [{
                        type: 3, // String Select (multi)
                        custom_id: 'safari_export_select',
                        min_values: 1,
                        max_values: 6,
                        placeholder: 'Select components to export...',
                        // No default:true here — Discord only fires the select on a CHANGE,
                        // so an all-preselected menu could never be submitted as-is (UX bug)
                        options: [
                            { label: 'Stores', value: 'stores', description: 'Store definitions and their item listings', emoji: { name: '🏪' } },
                            { label: 'Items', value: 'items', description: 'Item definitions incl. combat/stamina/attribute fields', emoji: { name: '📦' } },
                            { label: 'Actions', value: 'actions', description: 'Actions, triggers, outcomes, conditions, usage limits', emoji: { name: '⚡' } },
                            { label: 'Settings', value: 'settings', description: 'Safari config — currency, events, rounds, stamina, crafting', emoji: { name: '⚙️' } },
                            { label: 'Map Data', value: 'mapData', description: 'Grid layout, cell content, blacklist (no channels)', emoji: { name: '🗺️' } },
                            { label: 'Map Image', value: 'mapImage', description: 'Bundle the map image → downloads as a .zip package', emoji: { name: '🖼️' } }
                        ]
                    }]
                },
                { type: 14 },
                { type: 10, content: '-# Including **Map Image** produces a portable `.zip` package (data + map) that can recreate the Safari on another server. Without it you get a `.json` file.' },
                { type: 1, components: [
                    { type: 2, custom_id: 'castbot_settings', label: '← Settings', style: 2 }
                ] }
            ]
        }]
    };
}