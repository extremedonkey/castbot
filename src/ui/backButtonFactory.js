/**
 * Centralized Back Button Factory
 * Single source of truth for all back button navigation configuration
 *
 * USAGE:
 *   import { createBackButton } from './src/ui/backButtonFactory.js';
 *   const backButton = createBackButton('prod_menu_back');
 *
 * MIGRATION STATUS:
 *   - [x] Phase 1: Factory deployed (2025-10-19)
 *   - [ ] Phase 2: app.js menu builders (170+ instances)
 *   - [x] Phase 2a: Castlists, Applications & Season Management section (in progress)
 *   - [ ] Phase 2b: Safari features section
 *   - [ ] Phase 2c: Advanced Features section
 *   - [ ] Phase 3: External UI builders (storeSelector, entityManagementUI, etc.)
 */

import { ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Back Button Configuration Registry
 * Maps button custom_id to display properties
 *
 * HIERARCHY:
 *   Production Menu (root)
 *   ├─ Submenus → use 'prod_menu_back'
 *   │  ├─ Castlist Hub Menu
 *   │  ├─ Season Applications Menu
 *   │  ├─ Player Management Menu
 *   │  ├─ Tribe Management Menu
 *   │  ├─ Reaction Roles Menu
 *   │  ├─ Currency Menu
 *   │  ├─ Rounds Menu
 *   │  ├─ Stores Menu
 *   │  ├─ Items Menu
 *   │  ├─ Player Admin Menu
 *   │  └─ Tools Menu
 *   │
 *   └─ Safari Menu → use 'prod_safari_menu' (feature-level)
 *      └─ Safari submenus → use 'prod_safari_menu'
 */
const BACK_BUTTON_CONFIG = {
  // Main Menu Navigation (most common)
  'prod_menu_back': {
    label: '← Menu',
    emoji: null,  // NO emoji for main menu (LEAN standard)
    description: 'Return to Production Menu'
  },

  // Feature Menu Navigation (secondary level)
  'prod_safari_menu': {
    label: '← Safari',
    emoji: '🦁',
    description: 'Return to Safari advanced configuration menu'
  },

  'analytics_admin': {
    label: '← Analytics',
    emoji: '🧮',
    description: 'Return to Analytics menu (Reece only)'
  },

  'castbot_tools': {
    label: '← Tools',
    emoji: '🪛',
    description: 'Return to Tools menu'
  },

  // Player-facing navigation
  'prod_player_menu': {
    label: '← Player Menu',
    emoji: '🪪',
    description: 'Return to Player Menu'
  },

  // Legacy/Deprecated (mark for cleanup)
  'safari_menu': {
    label: '← Safari',
    emoji: '🦁',
    deprecated: true,
    useInstead: 'prod_safari_menu',
    description: 'DEPRECATED: Use prod_safari_menu instead'
  }
};

/**
 * Create a standardized back button
 *
 * @param {string} targetId - Custom ID of the target menu button
 * @returns {ButtonBuilder} Configured back button
 * @throws {Error} If targetId is not in BACK_BUTTON_CONFIG
 *
 * @example
 * // Simple usage
 * const backButton = createBackButton('prod_menu_back');
 *
 * // In ActionRow
 * const backRow = new ActionRowBuilder()
 *   .addComponents(createBackButton('prod_menu_back'));
 *
 * // Components V2 (raw JSON)
 * const backButton = createBackButton('prod_menu_back').toJSON();
 */
export function createBackButton(targetId) {
  // Validate target exists
  const config = BACK_BUTTON_CONFIG[targetId];

  if (!config) {
    throw new Error(
      `Unknown back button target: "${targetId}"\n` +
      `Valid targets: ${Object.keys(BACK_BUTTON_CONFIG).join(', ')}\n` +
      `Did you mean to use 'prod_menu_back'?`
    );
  }

  // Warn about deprecated targets
  if (config.deprecated) {
    console.warn(
      `⚠️ DEPRECATED: Back button target "${targetId}" is deprecated.\n` +
      `   Use "${config.useInstead}" instead.`
    );
  }

  // Build button
  const button = new ButtonBuilder()
    .setCustomId(targetId)
    .setLabel(config.label)
    .setStyle(ButtonStyle.Secondary);

  // Only set emoji if provided (ButtonBuilder.setEmoji() doesn't accept null)
  if (config.emoji) {
    button.setEmoji(config.emoji);
  }

  return button;
}

/**
 * Create back button for Components V2 raw JSON format
 * Used in files that build raw component structures
 *
 * @param {string} targetId - Custom ID of the target menu button
 * @returns {Object} Raw button component (type: 2)
 * @throws {Error} If targetId is not in BACK_BUTTON_CONFIG
 *
 * @example
 * const backButton = createBackButtonV2('prod_menu_back');
 * // Returns: { type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 }
 */
export function createBackButtonV2(targetId) {
  const config = BACK_BUTTON_CONFIG[targetId];

  if (!config) {
    throw new Error(
      `Unknown back button target: "${targetId}"\n` +
      `Valid targets: ${Object.keys(BACK_BUTTON_CONFIG).join(', ')}`
    );
  }

  if (config.deprecated) {
    console.warn(
      `⚠️ DEPRECATED: Back button target "${targetId}" is deprecated.\n` +
      `   Use "${config.useInstead}" instead.`
    );
  }

  const button = {
    type: 2, // Button
    custom_id: targetId,
    label: config.label,
    style: 2 // Secondary (grey)
  };

  // Only add emoji if provided
  if (config.emoji) {
    button.emoji = { name: config.emoji };
  }

  return button;
}

/**
 * Get all registered back button targets
 * Useful for documentation and validation
 *
 * @returns {Array<string>} List of valid target IDs
 */
export function getValidBackButtonTargets() {
  return Object.keys(BACK_BUTTON_CONFIG)
    .filter(key => !BACK_BUTTON_CONFIG[key].deprecated);
}

/**
 * Validate a back button target without creating the button
 *
 * @param {string} targetId - Custom ID to validate
 * @returns {boolean} True if valid target
 */
export function isValidBackButtonTarget(targetId) {
  return BACK_BUTTON_CONFIG.hasOwnProperty(targetId);
}

/**
 * Get menu hierarchy for documentation
 * Shows which menus navigate where
 *
 * @returns {Object} Hierarchy structure
 */
export function getMenuHierarchy() {
  return {
    root: 'Production Menu',
    targets: Object.entries(BACK_BUTTON_CONFIG)
      .filter(([_, config]) => !config.deprecated)
      .map(([id, config]) => ({
        id,
        label: config.label,
        emoji: config.emoji,
        description: config.description
      }))
  };
}
