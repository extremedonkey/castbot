/**
 * itemSelectField.js — the shared "pick an item" field for MODALS.
 *
 * Discord caps a String Select at 25 options, but guilds carry up to 79 items (prod, Aug 2026;
 * 4 of 33 guilds exceed 25). Every modal item picker therefore truncates — the problem was that
 * they did it SILENTLY: Quick Item showed the 25 newest and said nothing, so an admin whose item
 * wasn't listed had no way to tell whether it was missing, mis-sorted, or the picker was broken.
 *
 * This builder always states what's on offer, and — where the caller has one — points at the
 * escape hatch (the full picker screen, which has search).
 *
 * Pure: no I/O, no Discord imports.
 */

import { parseAndValidateEmoji } from './emojiUtils.js';

/** Discord's hard cap on String Select options. */
export const ITEM_SELECT_MAX = 25;

/** Discord rejects the whole modal if a Label description exceeds this. */
const MAX_DESCRIPTION = 100;

/**
 * Map item records to String Select options. Callers pass items ALREADY sorted
 * (newest-first is the Quick Create convention); this only caps and formats.
 * @param {Array<{id,name,emoji,description}>} items
 * @returns {Array<object>}
 */
export function buildItemSelectOptions(items) {
  return (items || []).slice(0, ITEM_SELECT_MAX).map(item => {
    const opt = {
      label: String(item.name || item.id || 'Unnamed Item').slice(0, 100),
      value: item.id
    };
    opt.emoji = parseAndValidateEmoji(item.emoji, '📦').emoji;
    if (item.description) opt.description = String(item.description).slice(0, MAX_DESCRIPTION);
    return opt;
  });
}

/**
 * Pure — the Label description, which is the whole point of this module.
 *
 * @param {number} shown - options actually rendered
 * @param {number} total - items the guild has
 * @param {'search'|'edit'|null} escape - where the admin can go for the ones not shown:
 *   'search' = leaving the field blank opens the full picker (which has search);
 *   'edit'   = no next screen, they must reopen the outcome afterwards;
 *   null     = nothing was left out, so say nothing about it.
 * @returns {string} ≤100 chars
 */
export function buildItemSelectDescription(shown, total, escape) {
  const truncated = total > shown;

  if (!truncated) {
    return escape === 'search'
      ? 'Not listed? Leave blank to search every item on the next screen.'
      : 'Which item this outcome hands out (or takes away).';
  }

  const lead = `Showing the ${shown} most recent of ${total} items.`;
  const tail = escape === 'search'
    ? ' Leave blank to search them all next.'
    : escape === 'edit'
      ? ' Create it, then use Edit for the rest.'
      : '';
  return `${lead}${tail}`.slice(0, MAX_DESCRIPTION);
}

/**
 * Build the complete Label-wrapped item select for a modal.
 *
 * @param {object}  args
 * @param {Array}   args.items - sorted item records (the FULL list; capping happens here)
 * @param {number}  [args.totalCount] - defaults to items.length; pass it when items is pre-cut
 * @param {string}  [args.customId='item_select']
 * @param {string}  [args.label='Item']
 * @param {boolean} [args.required=true] - false lets the admin submit blank to reach the picker
 * @param {'search'|'edit'|null} [args.escape=null]
 * @returns {object} Label (type 18) component
 */
export function buildItemSelectField({
  items,
  totalCount,
  customId = 'item_select',
  label = 'Item',
  required = true,
  escape = null
} = {}) {
  const options = buildItemSelectOptions(items);
  const total = totalCount ?? (items || []).length;

  return {
    type: 18, // Label
    label: required ? label : `${label} (optional)`,
    description: buildItemSelectDescription(options.length, total, escape),
    component: {
      type: 3, // String Select
      custom_id: customId,
      placeholder: 'Select item...',
      required,
      // A required select must force a pick; an optional one must allow submitting empty.
      min_values: required ? 1 : 0,
      max_values: 1,
      options
    }
  };
}
