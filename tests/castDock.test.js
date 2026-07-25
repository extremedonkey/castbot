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
    CASTDOCK_SELECTABLE_BUTTONS,
    resolveCompactRowIds,
    buildCastDockButtonSelectRow,
    stripButtonLabels,
    COMPACT_DIRECT_ACTION_REMAP,
    remapCompactButtonIds
} from '../castDock.js';

describe('CastDock — normalizeCastDockConfig', () => {
    it('defaults missing/malformed data to disabled with no button selection', () => {
        assert.deepEqual(normalizeCastDockConfig(null), { enabled: false, selectedButtons: null });
        assert.deepEqual(normalizeCastDockConfig(undefined), { enabled: false, selectedButtons: null });
        assert.deepEqual(normalizeCastDockConfig({}), { enabled: false, selectedButtons: null });
        assert.deepEqual(normalizeCastDockConfig('garbage'), { enabled: false, selectedButtons: null });
        assert.deepEqual(normalizeCastDockConfig({ enabled: true }), { enabled: false, selectedButtons: null }); // no targetUserId
    });

    it('passes through a well-formed config, coercing enabled to a strict boolean', () => {
        const raw = { enabled: true, targetUserId: '123', enabledBy: '456', enabledAt: 999 };
        assert.deepEqual(normalizeCastDockConfig(raw), { enabled: true, targetUserId: '123', enabledBy: '456', enabledAt: 999, selectedButtons: null });

        const truthyEnabled = { enabled: 'yes', targetUserId: '123' };
        assert.equal(normalizeCastDockConfig(truthyEnabled).enabled, false);
    });

    it('passes through selectedButtons when it is a real array, including an explicit empty one', () => {
        assert.deepEqual(normalizeCastDockConfig({ targetUserId: '1', selectedButtons: ['commands', 'map'] }).selectedButtons, ['commands', 'map']);
        assert.deepEqual(normalizeCastDockConfig({ targetUserId: '1', selectedButtons: [] }).selectedButtons, []);
    });

    it('coerces a garbage (non-array) selectedButtons to null rather than trusting it', () => {
        assert.equal(normalizeCastDockConfig({ targetUserId: '1', selectedButtons: 'commands' }).selectedButtons, null);
        assert.equal(normalizeCastDockConfig({ targetUserId: '1', selectedButtons: { commands: true } }).selectedButtons, null);
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

describe('CastDock — CASTDOCK_SELECTABLE_BUTTONS (the fixed selectable + render order)', () => {
    it('has exactly the 6 specified buttons, in this exact order', () => {
        assert.deepEqual(CASTDOCK_SELECTABLE_BUTTONS.map(b => b.id), ['commands', 'inventory', 'actions', 'challenges', 'crafting', 'map']);
    });

    it('does not include stamina or stores — dropped from compact mode entirely', () => {
        const ids = CASTDOCK_SELECTABLE_BUTTONS.map(b => b.id);
        assert.ok(!ids.includes('stamina'));
        assert.ok(!ids.includes('stores'));
    });

    it('every entry has a label and description (used verbatim as the select option text)', () => {
        for (const b of CASTDOCK_SELECTABLE_BUTTONS) {
            assert.ok(b.label, `${b.id} needs a label`);
            assert.ok(b.description, `${b.id} needs a description`);
        }
    });
});

describe('CastDock — resolveCompactRowIds', () => {
    it('defaults to all 6, in reference order, when selectedButtons is null/undefined (never configured)', () => {
        assert.deepEqual(resolveCompactRowIds(null), ['commands', 'inventory', 'actions', 'challenges', 'crafting', 'map']);
        assert.deepEqual(resolveCompactRowIds(undefined), ['commands', 'inventory', 'actions', 'challenges', 'crafting', 'map']);
    });

    it('reorders an explicit subset to the fixed reference order, regardless of input order', () => {
        assert.deepEqual(resolveCompactRowIds(['map', 'commands', 'crafting']), ['commands', 'crafting', 'map']);
    });

    it('respects an explicit empty array as a real choice (show nothing), NOT a fallback to defaults', () => {
        assert.deepEqual(resolveCompactRowIds([]), []);
    });

    it('silently drops unknown/garbage ids (e.g. stale stamina/stores from before they were removed)', () => {
        assert.deepEqual(resolveCompactRowIds(['commands', 'stamina', 'stores', 'nonsense']), ['commands']);
    });
});

describe('CastDock — buildCastDockButtonSelectRow', () => {
    function options(row) {
        return row.components[0].options;
    }

    it('has 6 options in CASTDOCK_SELECTABLE_BUTTONS order with placeholder "Default buttons selected"', () => {
        const row = buildCastDockButtonSelectRow('castdock_select_buttons', null);
        assert.equal(row.components[0].placeholder, 'Default buttons selected');
        assert.deepEqual(options(row).map(o => o.value), ['commands', 'inventory', 'actions', 'challenges', 'crafting', 'map']);
    });

    it('defaults every option to selected when selectedButtons is null (never configured)', () => {
        const opts = options(buildCastDockButtonSelectRow('x', null));
        assert.ok(opts.every(o => o.default === true));
    });

    it('marks only the stored subset as default when selectedButtons is an explicit array', () => {
        const opts = options(buildCastDockButtonSelectRow('x', ['commands', 'map']));
        assert.equal(opts.find(o => o.value === 'commands').default, true);
        assert.equal(opts.find(o => o.value === 'map').default, true);
        for (const id of ['inventory', 'actions', 'challenges', 'crafting']) {
            assert.equal(opts.find(o => o.value === id).default, false, `${id} must not be default`);
        }
    });

    it('marks nothing as default when selectedButtons is an explicit empty array', () => {
        const opts = options(buildCastDockButtonSelectRow('x', []));
        assert.ok(opts.every(o => o.default === false));
    });

    it('min_values is 0 (allowing a deliberate zero-button selection)', () => {
        assert.equal(buildCastDockButtonSelectRow('x', null).components[0].min_values, 0);
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

describe('CastDock — remapCompactButtonIds', () => {
    it('remaps inventory/map/crafting/challenges to their CastDock-specific custom_ids', () => {
        const row = { type: 1, components: [
            { type: 2, custom_id: 'player_set_inventory' },
            { type: 2, custom_id: 'player_set_map' },
            { type: 2, custom_id: 'player_set_crafting' },
            { type: 2, custom_id: 'player_set_challenges' }
        ] };
        remapCompactButtonIds(row);
        assert.equal(row.components[0].custom_id, 'castdock_view_inventory');
        assert.equal(row.components[1].custom_id, 'castdock_view_navigate');
        assert.equal(row.components[2].custom_id, 'castdock_open_crafting');
        assert.equal(row.components[3].custom_id, 'castdock_open_challenges');
    });

    it('leaves every other button untouched (commands, actions, etc.)', () => {
        const untouched = ['player_enter_command_global', 'player_set_actions', 'player_set_castdock', 'player_set_attributes'];
        const row = { type: 1, components: untouched.map(custom_id => ({ type: 2, custom_id })) };
        remapCompactButtonIds(row);
        assert.deepEqual(row.components.map(c => c.custom_id), untouched);
    });

    it('accepts an array of rows, same as stripButtonLabels', () => {
        const rows = [
            { type: 1, components: [{ type: 2, custom_id: 'player_set_inventory' }] },
            { type: 1, components: [{ type: 2, custom_id: 'player_set_map' }] }
        ];
        remapCompactButtonIds(rows);
        assert.equal(rows[0].components[0].custom_id, 'castdock_view_inventory');
        assert.equal(rows[1].components[0].custom_id, 'castdock_view_navigate');
    });

    it('the remap table itself has exactly the 4 expected entries', () => {
        assert.deepEqual(COMPACT_DIRECT_ACTION_REMAP, {
            player_set_inventory: 'castdock_view_inventory',
            player_set_map: 'castdock_view_navigate',
            player_set_crafting: 'castdock_open_crafting',
            player_set_challenges: 'castdock_open_challenges',
        });
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
