/**
 * Attribute System Defaults
 * Developer-controlled global defaults for attribute types
 *
 * Servers can create custom attributes, but these are the "built-in" presets
 * that servers can enable without needing to configure from scratch.
 *
 * @see /RaP/0964_20260109_AttributeSystem_Analysis.md
 */

/**
 * Attribute Categories:
 * - RESOURCE: Has current/max, regenerates over time (HP, Mana, Stamina)
 * - STAT: Single value, no regeneration (Strength, Dexterity, Luck)
 */
export const ATTRIBUTE_CATEGORIES = {
  RESOURCE: 'resource',
  STAT: 'stat'
};

/**
 * Regeneration Types:
 * - FULL_RESET: After interval, reset to max (current Stamina behavior)
 * - INCREMENTAL: Gain X points per interval
 * - NONE: No automatic regeneration (manual only)
 */
export const REGENERATION_TYPES = {
  FULL_RESET: 'full_reset',
  INCREMENTAL: 'incremental',
  NONE: 'none'
};

/**
 * Built-in Attribute Presets
 * These are developer-defined templates that servers can enable.
 * enabledByDefault: false means servers must explicitly enable them.
 */
export const ATTRIBUTE_PRESETS = {
  // Mana - Magical resource for abilities
  mana: {
    id: 'mana',
    name: 'Mana',
    emoji: '🔮',
    category: ATTRIBUTE_CATEGORIES.RESOURCE,
    defaultMax: 50,
    defaultCurrent: 50,
    regeneration: {
      type: REGENERATION_TYPES.FULL_RESET,
      intervalMinutes: 60, // 1 hour to full
      amount: 'max'
    },
    display: {
      showInMenu: true,
      showBar: true,
      order: 10
    },
    enabledByDefault: false,
    description: 'Magical energy for special abilities'
  },

  // HP - Health Points
  hp: {
    id: 'hp',
    name: 'HP',
    emoji: '❤️',
    category: ATTRIBUTE_CATEGORIES.RESOURCE,
    defaultMax: 100,
    defaultCurrent: 100,
    regeneration: {
      type: REGENERATION_TYPES.INCREMENTAL,
      intervalMinutes: 30, // Gain some HP every 30 min
      amount: 10
    },
    display: {
      showInMenu: true,
      showBar: true,
      order: 1
    },
    enabledByDefault: false,
    description: 'Health - when it reaches 0, bad things happen'
  },

  // Strength - Combat stat
  strength: {
    id: 'strength',
    name: 'Strength',
    emoji: '💪',
    category: ATTRIBUTE_CATEGORIES.STAT,
    defaultValue: 10,
    display: {
      showInMenu: true,
      showBar: false,
      order: 20
    },
    enabledByDefault: false,
    description: 'Physical power - affects attack damage'
  },

  // Dexterity - Agility stat
  dexterity: {
    id: 'dexterity',
    name: 'Dexterity',
    emoji: '🎯',
    category: ATTRIBUTE_CATEGORIES.STAT,
    defaultValue: 10,
    display: {
      showInMenu: true,
      showBar: false,
      order: 21
    },
    enabledByDefault: false,
    description: 'Agility and precision - affects dodge and accuracy'
  },

  // Luck - Chance-based stat
  luck: {
    id: 'luck',
    name: 'Luck',
    emoji: '🍀',
    category: ATTRIBUTE_CATEGORIES.STAT,
    defaultValue: 5,
    display: {
      showInMenu: true,
      showBar: false,
      order: 22
    },
    enabledByDefault: false,
    description: 'Affects random outcomes and item drop rates'
  }
};

/**
 * Attribute System Limits
 */
export const ATTRIBUTE_LIMITS = {
  MAX_ATTRIBUTES_PER_GUILD: 20,
  MAX_ATTRIBUTE_NAME_LENGTH: 30,
  MAX_ATTRIBUTE_VALUE: 999999,
  MIN_ATTRIBUTE_VALUE: -999999,
  MAX_REGENERATION_INTERVAL: 10080, // 1 week in minutes
  MIN_REGENERATION_INTERVAL: 1 // 1 minute
};

/**
 * Get a preset by ID with defaults applied
 * @param {string} presetId - The preset identifier (e.g., 'mana', 'hp')
 * @returns {Object|null} The preset configuration or null if not found
 */
export function getPreset(presetId) {
  return ATTRIBUTE_PRESETS[presetId] || null;
}

/**
 * Get all available presets
 * @returns {Object} All preset configurations keyed by ID
 */
export function getAllPresets() {
  return { ...ATTRIBUTE_PRESETS };
}

/**
 * Create a custom attribute definition
 * @param {Object} config - Custom attribute configuration
 * @returns {Object} Complete attribute definition with defaults applied
 */
export function createCustomAttribute(config) {
  const defaults = {
    category: ATTRIBUTE_CATEGORIES.STAT,
    defaultValue: 10,
    display: {
      showInMenu: true,
      showBar: false,
      order: 100
    },
    enabledByDefault: false
  };

  // For resource types, add regeneration defaults
  if (config.category === ATTRIBUTE_CATEGORIES.RESOURCE) {
    defaults.defaultMax = 100;
    defaults.defaultCurrent = 100;
    defaults.regeneration = {
      type: REGENERATION_TYPES.NONE,
      intervalMinutes: 60,
      amount: 'max'
    };
  }

  return {
    ...defaults,
    ...config,
    display: { ...defaults.display, ...config.display },
    regeneration: config.regeneration ? { ...defaults.regeneration, ...config.regeneration } : defaults.regeneration,
    isCustom: true,
    createdAt: Date.now()
  };
}
