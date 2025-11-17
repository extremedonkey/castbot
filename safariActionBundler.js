/**
 * Safari Action Bundler - Groups display_text with subsequent actions for single-message display
 * @module safariActionBundler
 *
 * Created: November 17, 2025
 * Purpose: Fix button bundling to prevent message replacement in Discord ephemeral responses
 */

/**
 * Detects bundles in action sequences
 * A bundle starts with display_text and includes subsequent give_item/currency/follow_up actions
 * @param {Array} actions - Array of action objects with type and config
 * @returns {Array} Array of bundles with parent and children
 */
export function detectBundles(actions) {
    if (!actions || !Array.isArray(actions)) {
        console.warn('detectBundles: Invalid actions array provided');
        return [];
    }

    const bundles = [];
    let currentBundle = null;

    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];

        if (!action || !action.type) {
            console.warn(`detectBundles: Invalid action at index ${i}`, action);
            continue;
        }

        if (action.type === 'display_text') {
            // Save previous bundle if exists
            if (currentBundle) {
                bundles.push(currentBundle);
            }
            // Start new bundle with display_text as parent
            currentBundle = {
                parent: action,
                children: []
            };
        } else if (currentBundle &&
                   ['give_item', 'give_currency', 'follow_up_action'].includes(action.type)) {
            // Add to current bundle
            currentBundle.children.push(action);
        } else {
            // Non-bundleable action or no current bundle
            if (currentBundle) {
                bundles.push(currentBundle);
                currentBundle = null;
            }
            // Standalone action (not bundled)
            bundles.push({
                parent: null,
                children: [action]
            });
        }
    }

    // Don't forget the last bundle
    if (currentBundle) {
        bundles.push(currentBundle);
    }

    console.log(`🎯 detectBundles: Found ${bundles.length} bundles from ${actions.length} actions`);
    return bundles;
}

/**
 * Formats actions for UI display with visual bundling indicators
 * @param {Array} actions - Array of actions
 * @returns {String} Formatted string with tree structure
 */
export function formatActionsWithBundleIndicators(actions) {
    if (!actions || !Array.isArray(actions)) {
        return 'No actions configured';
    }

    const bundles = detectBundles(actions);
    const lines = [];
    let actionNumber = 1;

    for (const bundle of bundles) {
        if (bundle.parent) {
            // Parent with children - show tree structure
            const parentEmoji = getActionEmoji(bundle.parent.type);
            const title = bundle.parent.config?.title || bundle.parent.config?.content?.substring(0, 30) || 'Untitled';
            lines.push(`${actionNumber}. ${parentEmoji} Display Text: "${title}"`);

            bundle.children.forEach((child, index) => {
                const isLast = index === bundle.children.length - 1;
                const prefix = isLast ? '   └──' : '   ├──';
                const emoji = getActionEmoji(child.type);
                const details = formatActionDetails(child);
                lines.push(`${prefix} ${emoji} ${details}`);
            });
            actionNumber++;
        } else {
            // Standalone actions (not bundled)
            bundle.children.forEach(child => {
                const emoji = getActionEmoji(child.type);
                lines.push(`${actionNumber}. ${emoji} ${formatActionDetails(child)}`);
                actionNumber++;
            });
        }
    }

    return lines.length > 0 ? lines.join('\n') : 'No actions configured';
}

/**
 * Gets appropriate emoji for action type
 * @param {string} type - Action type
 * @returns {string} Emoji character
 */
function getActionEmoji(type) {
    const emojis = {
        'display_text': '📄',
        'give_item': '🎁',
        'give_currency': '💰',
        'follow_up_action': '🔗',
        'conditional': '🔀',
        'give_role': '🎭',
        'remove_role': '🚫',
        'calculate_results': '🎲',
        'calculate_attack': '⚔️'
    };
    return emojis[type] || '▪️';
}

/**
 * Formats action details for display
 * @param {Object} action - Action object
 * @returns {string} Formatted action details
 */
function formatActionDetails(action) {
    if (!action || !action.type) {
        return 'Unknown action';
    }

    switch(action.type) {
        case 'give_item':
            const itemName = action.config?.itemName || action.config?.itemId || 'Unknown Item';
            const quantity = action.config?.quantity || 1;
            const limit = action.config?.limit?.type || 'unlimited';
            const limitDisplay = limit === 'once_per_player' ? 'per player' :
                                limit === 'once_globally' ? 'global' :
                                'unlimited';
            return `Give Item: ${itemName} x${quantity} (${limitDisplay})`;

        case 'give_currency':
            const amount = action.config?.amount || 0;
            const currencyLimit = action.config?.limit?.type || 'unlimited';
            const sign = amount >= 0 ? '+' : '';
            return `Give Currency: ${sign}${amount} (${currencyLimit})`;

        case 'follow_up_action':
            const buttonText = action.config?.buttonText || action.config?.targetActionId || 'Continue';
            return `Follow-up: "${buttonText}"`;

        case 'give_role':
            const roleName = action.config?.roleName || action.config?.roleId || 'Unknown Role';
            return `Give Role: ${roleName}`;

        case 'remove_role':
            const removeRoleName = action.config?.roleName || action.config?.roleId || 'Unknown Role';
            return `Remove Role: ${removeRoleName}`;

        case 'calculate_results':
            const scope = action.config?.scope || 'round';
            return `Calculate Results (${scope})`;

        case 'calculate_attack':
            const attackScope = action.config?.scope || 'player';
            return `Calculate Attack (${attackScope})`;

        default:
            return action.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}

/**
 * Checks if actions should be bundled
 * @param {Array} actions - Array of actions
 * @returns {boolean} True if actions contain bundleable patterns
 */
export function shouldBundle(actions) {
    if (!actions || !Array.isArray(actions) || actions.length < 2) {
        return false;
    }

    // Check if there's at least one display_text followed by a bundleable action
    for (let i = 0; i < actions.length - 1; i++) {
        if (actions[i].type === 'display_text' &&
            ['give_item', 'give_currency', 'follow_up_action'].includes(actions[i + 1].type)) {
            return true;
        }
    }

    return false;
}

/**
 * Debug helper to log bundle structure
 * @param {Array} bundles - Array of bundles from detectBundles
 */
export function debugLogBundles(bundles) {
    console.log('🎯 Bundle Structure:');
    bundles.forEach((bundle, index) => {
        if (bundle.parent) {
            console.log(`  Bundle ${index + 1}: display_text → ${bundle.children.length} children`);
            bundle.children.forEach(child => {
                console.log(`    └─ ${child.type}`);
            });
        } else {
            console.log(`  Standalone ${index + 1}: ${bundle.children[0].type}`);
        }
    });
}