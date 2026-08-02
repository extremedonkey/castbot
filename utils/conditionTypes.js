/**
 * conditionTypes.js — the single source of truth for Safari condition types.
 *
 * WHY THIS EXISTS: the type list was written out by hand in two places, and they had already
 * drifted — `showConditionEditor` offers all 8 types, while the copy in app.js's item-search
 * branch offers only 3 AND hardcodes `default: true` on Item, so searching for an item silently
 * misreported the condition's own type. Adding a 9th type meant remembering both. Now the list
 * lives here once and every surface composes from it: String Selects via buildConditionTypeOptions,
 * modal Radio Groups via buildConditionTypeRadioOptions.
 *
 * ORDERING IS DELIBERATE — by real usage, not by when the feature was built. In production
 * (Aug 2026): item 316, currency 17, random_probability 1, and every other type ZERO. The picker
 * puts the 95% case first and defaults to it.
 *
 * Pure — no I/O, no Discord imports.
 */

import { toRadioOptions } from './executeOnOptions.js';

/**
 * Every condition type the engine understands, in picker order.
 * `configuredInModal` marks the ones the one-shot Add Condition modal can complete on its own;
 * everything else routes to its own config screen after the type is chosen.
 */
export const CONDITION_TYPES = [
  { value: 'item', label: 'Item', emoji: '📦', description: "User has / doesn't have an item", configuredInModal: true },
  { value: 'currency', label: 'Currency', emoji: '🪙', description: "User's currency vs a value" },
  { value: 'role', label: 'Role', emoji: '👑', description: "User has / doesn't have a Discord role" },
  { value: 'attribute_check', label: 'Attribute', emoji: '📊', description: 'Check a player attribute (HP, Mana, Strength…)' },
  { value: 'attribute_compare', label: 'Compare Attributes', emoji: '⚔️', description: 'Compare two attributes (e.g. Strength > Dexterity)' },
  { value: 'multi_attribute_check', label: 'Multi-Attribute', emoji: '📈', description: 'Check several attributes at once (all / any / sum)' },
  { value: 'random_probability', label: 'Random Probability', emoji: '🎲', description: 'Randomised chance of pass / fail' },
  { value: 'd20_roll', label: 'D20 Dice Roll', emoji: '🐉', description: 'D&D-style d20 vs a DC, with crits & fumbles' }
];

/** The type a new condition starts as — 95% of production conditions are items. */
export const DEFAULT_CONDITION_TYPE = 'item';

/** Fast lookup by value. */
const BY_VALUE = new Map(CONDITION_TYPES.map(t => [t.value, t]));

/** Is this a type the engine knows? */
export function isKnownConditionType(value) {
  return BY_VALUE.has(value);
}

/** Coerce anything unrecognised (including undefined) to the default type. */
export function normalizeConditionType(value) {
  return BY_VALUE.has(value) ? value : DEFAULT_CONDITION_TYPE;
}

/** The emoji for a type — used by summaries and headers so they can't drift from the picker. */
export function conditionTypeEmoji(value) {
  return BY_VALUE.get(value)?.emoji || '🧩';
}

/** The human label for a type. */
export function conditionTypeLabel(value) {
  return BY_VALUE.get(value)?.label || String(value || 'Unknown');
}

/** True when the Add Condition modal can finish this type without a follow-up screen. */
export function isConfigurableInModal(value) {
  return BY_VALUE.get(value)?.configuredInModal === true;
}

/**
 * String Select options (for the condition editor's type picker, in MESSAGES).
 * @param {string} [current] - currently-selected type
 * @returns {Array<object>}
 */
export function buildConditionTypeOptions(current) {
  return CONDITION_TYPES.map(t => ({
    label: t.label,
    value: t.value,
    description: t.description,
    emoji: { name: t.emoji },
    default: t.value === current
  }));
}

/**
 * Radio Group options for MODALS. Radio caps at 10 (we have 8 — two spare); a select's `default`
 * is ignored in modals whereas a radio's works, which is the whole reason the modal uses one.
 * Delegates the emoji-into-label and single-`default` rules to toRadioOptions so they live once.
 * @param {string} [current=DEFAULT_CONDITION_TYPE]
 * @returns {Array<object>}
 */
export function buildConditionTypeRadioOptions(current = DEFAULT_CONDITION_TYPE) {
  return toRadioOptions(buildConditionTypeOptions(normalizeConditionType(current)));
}
