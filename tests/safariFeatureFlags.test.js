/**
 * Escape-room opt-in flags (safariFeatureFlags.js) — the iron rule under test:
 * absence, null, garbage, or any unexpected shape MUST resolve to today's default
 * behavior (currency ON, navigate ENABLED). Real imports — the module is pure.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    NAVIGATE_MODES,
    normalizeNavigateMode,
    isCurrencyEnabled,
    shouldPostNavigatePanes,
    isNavigateDisabled,
    coerceCurrencyEnabled
} from '../safariFeatureFlags.js';

describe('safariFeatureFlags — normalizeNavigateMode', () => {
    it('defaults undefined/null/empty/garbage/wrong-type to enabled', () => {
        for (const v of [undefined, null, '', 'garbage', 'ENABLED', 'Silent', 0, 42, true, {}, []]) {
            assert.equal(normalizeNavigateMode(v), NAVIGATE_MODES.ENABLED, `value: ${JSON.stringify(v)}`);
        }
    });

    it('passes through the two explicit non-default modes', () => {
        assert.equal(normalizeNavigateMode('silent'), NAVIGATE_MODES.SILENT);
        assert.equal(normalizeNavigateMode('disabled'), NAVIGATE_MODES.DISABLED);
    });
});

describe('safariFeatureFlags — isCurrencyEnabled', () => {
    it('only an explicitly stored false disables', () => {
        assert.equal(isCurrencyEnabled({ currencyEnabled: false }), false);
    });

    it('everything else — incl. missing config object — is enabled', () => {
        assert.equal(isCurrencyEnabled(undefined), true);
        assert.equal(isCurrencyEnabled(null), true);
        assert.equal(isCurrencyEnabled({}), true);
        assert.equal(isCurrencyEnabled({ currencyEnabled: true }), true);
        assert.equal(isCurrencyEnabled({ currencyEnabled: 'disabled' }), true,
            'raw string never reaches storage — the setter coerces; read-side stays fail-open');
        assert.equal(isCurrencyEnabled({ currencyEnabled: 0 }), true);
        assert.equal(isCurrencyEnabled({ currencyEnabled: null }), true);
    });
});

describe('safariFeatureFlags — pane/entry-point predicates', () => {
    it('shouldPostNavigatePanes: only enabled mode posts panes', () => {
        assert.equal(shouldPostNavigatePanes(undefined), true);
        assert.equal(shouldPostNavigatePanes({}), true);
        assert.equal(shouldPostNavigatePanes({ navigatePaneMode: 'garbage' }), true);
        assert.equal(shouldPostNavigatePanes({ navigatePaneMode: 'silent' }), false);
        assert.equal(shouldPostNavigatePanes({ navigatePaneMode: 'disabled' }), false);
    });

    it('isNavigateDisabled: only disabled gates the compass — silent keeps movement live', () => {
        assert.equal(isNavigateDisabled(undefined), false);
        assert.equal(isNavigateDisabled({}), false);
        assert.equal(isNavigateDisabled({ navigatePaneMode: 'silent' }), false);
        assert.equal(isNavigateDisabled({ navigatePaneMode: 'disabled' }), true);
        assert.equal(isNavigateDisabled({ navigatePaneMode: 'garbage' }), false);
    });
});

describe('safariFeatureFlags — coerceCurrencyEnabled (setter-side)', () => {
    it('radio string and raw boolean disables both store false', () => {
        assert.equal(coerceCurrencyEnabled('disabled'), false);
        assert.equal(coerceCurrencyEnabled(false), false);
    });

    it('everything else stores true (fail-open)', () => {
        for (const v of ['enabled', true, 'garbage', undefined, null, 1, 0]) {
            assert.equal(coerceCurrencyEnabled(v), true, `value: ${JSON.stringify(v)}`);
        }
    });
});

describe('safariFeatureFlags — visibility gating replicas', () => {
    // Replica of the vis.currency line in playerManagement.js calculateVisibility
    function visCurrencyShow({ isAdmin, currencyOn, showInventory, hasTarget, hasEconomyActivity }) {
        return isAdmin ? showInventory : (currencyOn && showInventory && hasTarget && hasEconomyActivity);
    }

    it('player mode: currency disabled hides the button regardless of balance', () => {
        assert.equal(visCurrencyShow({ isAdmin: false, currencyOn: false, showInventory: true, hasTarget: true, hasEconomyActivity: true }), false);
    });

    it('admin mode: button stays visible even when disabled (click is intercepted)', () => {
        assert.equal(visCurrencyShow({ isAdmin: true, currencyOn: false, showInventory: true, hasTarget: true, hasEconomyActivity: false }), true);
    });

    it('enabled guilds keep today\'s behavior exactly', () => {
        assert.equal(visCurrencyShow({ isAdmin: false, currencyOn: true, showInventory: true, hasTarget: true, hasEconomyActivity: true }), true);
        assert.equal(visCurrencyShow({ isAdmin: false, currencyOn: true, showInventory: true, hasTarget: true, hasEconomyActivity: false }), false);
    });

    // Replica of the buildPlayerStatsLine economy-pair logic
    function statsParts({ currencyEnabled, currency, itemTotal }) {
        const showEconomy = (currencyEnabled && currency > 0) || itemTotal > 0;
        const parts = [];
        if (showEconomy && currencyEnabled) parts.push(`🪙 ${currency}`);
        if (showEconomy) parts.push(`🧰 ${itemTotal}`);
        return parts;
    }

    it('stats line: disabled + items → inventory segment only', () => {
        assert.deepEqual(statsParts({ currencyEnabled: false, currency: 316, itemTotal: 4 }), ['🧰 4']);
    });

    it('stats line: disabled + hidden balance alone → nothing (balance must not leak the pair open)', () => {
        assert.deepEqual(statsParts({ currencyEnabled: false, currency: 316, itemTotal: 0 }), []);
    });

    it('stats line: enabled behavior unchanged', () => {
        assert.deepEqual(statsParts({ currencyEnabled: true, currency: 316, itemTotal: 4 }), ['🪙 316', '🧰 4']);
        assert.deepEqual(statsParts({ currencyEnabled: true, currency: 0, itemTotal: 0 }), []);
    });

    // Replica of the buildSuperSelect 'map' option logic (player mode)
    function mapSelectOptions({ navigateOff, isAdminMode }) {
        const options = [];
        if (!navigateOff) options.push('navigate');
        if (isAdminMode) options.push('starting_location'); // representative admin option
        return options.length === 0 ? null : options;
    }

    it('map select: player mode + disabled → null (an empty type-3 select is a Discord 400)', () => {
        assert.equal(mapSelectOptions({ navigateOff: true, isAdminMode: false }), null);
    });

    it('map select: admin mode + disabled keeps admin options without navigate', () => {
        assert.deepEqual(mapSelectOptions({ navigateOff: true, isAdminMode: true }), ['starting_location']);
    });
});
