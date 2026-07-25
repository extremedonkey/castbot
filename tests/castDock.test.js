/**
 * CastDock — sticky /menu per channel.
 * Pure functions imported directly: castDock.js keeps all heavy imports
 * (storage.js, playerManagement.js) dynamic so this is safe.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    CASTDOCK_COOLDOWN_MS,
    normalizeCastDockConfig,
    buildCastDockSelectRow,
    parseCastDockAction,
    evaluateCastDockTrigger,
    COMPACT_ROW2_IDS,
    COMPACT_ROW3_IDS,
    stripButtonLabels
} from '../castDock.js';

describe('CastDock — normalizeCastDockConfig', () => {
    it('defaults missing/malformed data to disabled', () => {
        assert.deepEqual(normalizeCastDockConfig(null), { enabled: false });
        assert.deepEqual(normalizeCastDockConfig(undefined), { enabled: false });
        assert.deepEqual(normalizeCastDockConfig({}), { enabled: false });
        assert.deepEqual(normalizeCastDockConfig('garbage'), { enabled: false });
        assert.deepEqual(normalizeCastDockConfig({ enabled: true }), { enabled: false }); // no targetUserId
    });

    it('passes through a well-formed config, coercing enabled to a strict boolean', () => {
        const raw = { enabled: true, targetUserId: '123', enabledBy: '456', enabledAt: 999 };
        assert.deepEqual(normalizeCastDockConfig(raw), { enabled: true, targetUserId: '123', enabledBy: '456', enabledAt: 999 });

        const truthyEnabled = { enabled: 'yes', targetUserId: '123' };
        assert.equal(normalizeCastDockConfig(truthyEnabled).enabled, false);
    });
});

describe('CastDock — buildCastDockSelectRow', () => {
    function options(row) {
        return row.components[0].options;
    }

    it('is a single ActionRow containing one 2-option String Select', () => {
        const row = buildCastDockSelectRow('player_menu_sel_castdock', { enabled: false });
        assert.equal(row.type, 1);
        assert.equal(row.components.length, 1);
        assert.equal(row.components[0].type, 3);
        assert.equal(row.components[0].custom_id, 'player_menu_sel_castdock');
        assert.deepEqual(options(row).map(o => o.value), ['enable', 'disable']);
    });

    it('passes the custom_id through unchanged for both player and admin variants', () => {
        assert.equal(buildCastDockSelectRow('player_menu_sel_castdock', {}).components[0].custom_id, 'player_menu_sel_castdock');
        assert.equal(buildCastDockSelectRow('player_menu_sel_castdock_999', {}).components[0].custom_id, 'player_menu_sel_castdock_999');
    });

    it('defaults Enable when currently enabled, Disable when not — exactly one default:true', () => {
        for (const enabled of [true, false]) {
            const opts = options(buildCastDockSelectRow('x', { enabled }));
            assert.equal(opts.find(o => o.value === 'enable').default, enabled);
            assert.equal(opts.find(o => o.value === 'disable').default, !enabled);
            assert.equal(opts.filter(o => o.default === true).length, 1);
        }
    });

    it('treats a missing/undefined config as disabled', () => {
        const opts = options(buildCastDockSelectRow('x', undefined));
        assert.equal(opts.find(o => o.value === 'enable').default, false);
        assert.equal(opts.find(o => o.value === 'disable').default, true);
    });
});

describe('CastDock — parseCastDockAction', () => {
    it('reads enable/disable from the first selected value', () => {
        assert.equal(parseCastDockAction(['enable']), 'enable');
        assert.equal(parseCastDockAction(['disable']), 'disable');
    });

    it('falls back to disable for anything else (safe default)', () => {
        assert.equal(parseCastDockAction([]), 'disable');
        assert.equal(parseCastDockAction(undefined), 'disable');
        assert.equal(parseCastDockAction(null), 'disable');
        assert.equal(parseCastDockAction(['garbage']), 'disable');
    });
});

describe('CastDock — evaluateCastDockTrigger (anti-loop / cooldown truth table)', () => {
    it('skips when not enabled (no entry, or entry.enabled false)', () => {
        assert.equal(evaluateCastDockTrigger({ entry: undefined, authorIsBot: false }).action, 'skip');
        assert.equal(evaluateCastDockTrigger({ entry: undefined, authorIsBot: false }).reason, 'not_enabled');
        assert.equal(evaluateCastDockTrigger({ entry: { enabled: false }, authorIsBot: false }).action, 'skip');
    });

    it('skips on a bot author even with cooldown expired and enabled — the anti-self-loop guard wins over everything else', () => {
        const entry = { enabled: true, lastRepostAt: 0 };
        const verdict = evaluateCastDockTrigger({ entry, authorIsBot: true, now: 1_000_000 });
        assert.equal(verdict.action, 'skip');
        assert.equal(verdict.reason, 'bot_author');
    });

    it('skips within the cooldown window', () => {
        const entry = { enabled: true, lastRepostAt: 1000 };
        const verdict = evaluateCastDockTrigger({ entry, authorIsBot: false, now: 1000 + CASTDOCK_COOLDOWN_MS - 1, cooldownMs: CASTDOCK_COOLDOWN_MS });
        assert.equal(verdict.action, 'skip');
        assert.equal(verdict.reason, 'cooldown');
    });

    it('reposts once the cooldown has expired', () => {
        const entry = { enabled: true, lastRepostAt: 1000 };
        const verdict = evaluateCastDockTrigger({ entry, authorIsBot: false, now: 1000 + CASTDOCK_COOLDOWN_MS, cooldownMs: CASTDOCK_COOLDOWN_MS });
        assert.equal(verdict.action, 'repost');
        assert.equal(verdict.reason, 'ok');
    });

    it('reposts on the first-ever trigger (lastRepostAt 0/undefined) when enabled and human', () => {
        assert.equal(evaluateCastDockTrigger({ entry: { enabled: true, lastRepostAt: 0 }, authorIsBot: false }).action, 'repost');
        assert.equal(evaluateCastDockTrigger({ entry: { enabled: true }, authorIsBot: false }).action, 'repost');
    });
});

describe('CastDock — compact view row composition', () => {
    it('puts commands first, guaranteeing it chunks into the same ActionRow as currency (buildSectionRow groups in array order, 5 per row)', () => {
        assert.equal(COMPACT_ROW2_IDS[0], 'commands');
        assert.ok(COMPACT_ROW2_IDS.indexOf('commands') < 5, 'commands must land in the first 5-item chunk alongside currency');
        assert.ok(COMPACT_ROW2_IDS.indexOf('currency') < 5, 'currency must also be in the first chunk for the two to ever share a row');
    });

    it('row 2 never includes attributes/castdock (those stay in row 3)', () => {
        assert.ok(!COMPACT_ROW2_IDS.includes('attributes'));
        assert.ok(!COMPACT_ROW2_IDS.includes('castdock'));
    });

    it('row 3 no longer includes commands (relocated to row 2) but keeps attributes and castdock', () => {
        assert.deepEqual(COMPACT_ROW3_IDS, ['attributes', 'castdock']);
    });

    it('row 1 (Castlists & Profile) ids are entirely absent from both compact rows', () => {
        const row1Ids = ['castlists', 'pronouns', 'timezone', 'age', 'vanity'];
        for (const id of row1Ids) {
            assert.ok(!COMPACT_ROW2_IDS.includes(id), `${id} must not appear in compact row 2`);
            assert.ok(!COMPACT_ROW3_IDS.includes(id), `${id} must not appear in compact row 3`);
        }
    });
});

describe('CastDock — stripButtonLabels', () => {
    it('deletes label but keeps emoji/custom_id/style on every button in a row', () => {
        const row = { type: 1, components: [
            { type: 2, style: 2, label: 'Currency', custom_id: 'player_set_currency', emoji: { name: '🪙' } },
            { type: 2, style: 2, label: 'Inventory', custom_id: 'player_set_inventory', emoji: { name: '🧰' } }
        ] };
        stripButtonLabels(row);
        for (const btn of row.components) {
            assert.ok(!('label' in btn), 'label must be fully removed, not just emptied');
            assert.ok(btn.emoji, 'emoji must survive untouched');
            assert.ok(btn.custom_id, 'custom_id must survive untouched');
        }
    });

    it('accepts an array of rows (as buildSectionRow returns when chunked across multiple ActionRows)', () => {
        const rows = [
            { type: 1, components: [{ type: 2, label: 'A', custom_id: 'a', emoji: { name: '🅰️' } }] },
            { type: 1, components: [{ type: 2, label: 'B', custom_id: 'b', emoji: { name: '🅱️' } }] }
        ];
        stripButtonLabels(rows);
        assert.ok(!('label' in rows[0].components[0]));
        assert.ok(!('label' in rows[1].components[0]));
    });

    it('is a no-op on a row with no components (safe on empty/malformed input)', () => {
        assert.deepEqual(stripButtonLabels({ type: 1, components: [] }), { type: 1, components: [] });
        assert.doesNotThrow(() => stripButtonLabels(null));
        assert.doesNotThrow(() => stripButtonLabels(undefined));
    });
});
