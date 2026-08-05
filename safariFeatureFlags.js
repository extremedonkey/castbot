/**
 * Safari feature flags — escape-room opt-in configs (currency visibility, navigate pane mode).
 *
 * Both flags live flat in safariData[guildId].safariConfig and are OPT-IN:
 * absence, null, garbage, or any error state MUST resolve to today's default
 * behavior (currency ON, navigate ENABLED). Existing guilds are unaffected
 * until an admin explicitly submits the Settings modal.
 *
 * This module is deliberately import-free so unit tests import the real thing
 * and synchronous callers (e.g. calculateVisibility in playerManagement.js,
 * which already holds safariData) pay nothing.
 *
 * Storage shapes:
 * - safariConfig.currencyEnabled  — boolean; ONLY explicit false disables
 *   (whispersEnabled idiom). Written by updateCustomTerms via coerceCurrencyEnabled.
 * - safariConfig.navigatePaneMode — 'enabled' | 'silent' | 'disabled';
 *   whitelist-normalized on every read, so hand-edited garbage degrades to 'enabled'.
 */

export const NAVIGATE_MODES = {
    ENABLED: 'enabled',
    SILENT: 'silent',
    DISABLED: 'disabled'
};

/**
 * Pure — whitelist normalize a stored/submitted navigate mode.
 * Anything that isn't exactly 'silent' or 'disabled' → 'enabled'.
 * @param {*} value
 * @returns {string}
 */
export function normalizeNavigateMode(value) {
    return value === NAVIGATE_MODES.SILENT || value === NAVIGATE_MODES.DISABLED
        ? value
        : NAVIGATE_MODES.ENABLED;
}

/**
 * Pure — is currency visible on this server? Only an explicitly stored `false`
 * disables; undefined config / missing field / truthy junk all mean enabled.
 * @param {Object|undefined} safariConfig - safariData[guildId]?.safariConfig
 * @returns {boolean}
 */
export function isCurrencyEnabled(safariConfig) {
    return safariConfig?.currencyEnabled !== false;
}

/**
 * Pure — should the public navigate panes (init welcome card, admin-move card,
 * arrival card) be posted? 'silent' and 'disabled' both suppress them.
 * @param {Object|undefined} safariConfig
 * @returns {boolean}
 */
export function shouldPostNavigatePanes(safariConfig) {
    return normalizeNavigateMode(safariConfig?.navigatePaneMode) === NAVIGATE_MODES.ENABLED;
}

/**
 * Pure — is player-driven navigation fully off? Only 'disabled' gates the
 * compass entry points; 'silent' keeps movement working.
 * @param {Object|undefined} safariConfig
 * @returns {boolean}
 */
export function isNavigateDisabled(safariConfig) {
    return normalizeNavigateMode(safariConfig?.navigatePaneMode) === NAVIGATE_MODES.DISABLED;
}

/**
 * Pure — setter-side mapping for currencyEnabled. Accepts the Settings radio
 * string ('enabled'/'disabled') AND raw booleans (import path); anything that
 * isn't an explicit disable stores true.
 * @param {*} value
 * @returns {boolean}
 */
export function coerceCurrencyEnabled(value) {
    return !(value === false || value === 'disabled');
}
