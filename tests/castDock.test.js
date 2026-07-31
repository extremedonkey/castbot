/**
 * CastDock — sticky /menu per channel.
 * Pure functions imported directly: castDock.js keeps all heavy imports
 * (storage.js, playerManagement.js) dynamic so this is safe.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
    CASTDOCK_COOLDOWN_MS,
    normalizeCastDockConfig,
    buildCastDockSelectRow,
    parseCastDockAction,
    evaluateCastDockTrigger,
    CASTDOCK_SELECTABLE_BUTTONS,
    defaultCastDockButtonIds,
    resolveCompactRowIds,
    buildCastDockButtonSelectRow,
    stripButtonLabels,
    COMPACT_DIRECT_ACTION_REMAP,
    remapCompactButtonIds,
    CASTDOCK_CONFIG_GATE_REASONS,
    applyCastDockSelection,
    castDockBlockedSelections
} from '../castDock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    it('only Map is off by default — the default five fit a single 5-button ActionRow', () => {
        assert.deepEqual(defaultCastDockButtonIds(), ['commands', 'inventory', 'actions', 'challenges', 'crafting']);
        assert.ok(defaultCastDockButtonIds().length <= 5, 'defaults must fit one ActionRow');
    });
});

describe('CastDock — resolveCompactRowIds', () => {
    it('defaults to the five default buttons (no Map), in reference order, when selectedButtons is null/undefined', () => {
        assert.deepEqual(resolveCompactRowIds(null), ['commands', 'inventory', 'actions', 'challenges', 'crafting']);
        assert.deepEqual(resolveCompactRowIds(undefined), ['commands', 'inventory', 'actions', 'challenges', 'crafting']);
    });

    it('Map still renders when explicitly selected', () => {
        assert.deepEqual(resolveCompactRowIds(['map']), ['map']);
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

    it('defaults the five default buttons on and Map off when selectedButtons is null (never configured)', () => {
        const opts = options(buildCastDockButtonSelectRow('x', null));
        assert.equal(opts.find(o => o.value === 'map').default, false, 'Map must be off by default');
        for (const id of ['commands', 'inventory', 'actions', 'challenges', 'crafting']) {
            assert.equal(opts.find(o => o.value === id).default, true, `${id} must be on by default`);
        }
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

    it('max_values never exceeds the option count — Discord rejects the whole message otherwise (live TEST failure 2026-07-25)', () => {
        const select = buildCastDockButtonSelectRow('x', null).components[0];
        assert.ok(select.max_values <= select.options.length,
            `max_values (${select.max_values}) must be <= options.length (${select.options.length})`);
    });
});

describe('CastDock — applyCastDockSelection (an explicit tick beats a per-player gate)', () => {
    // Live report 2026-08-01: host ticked all six buttons, the dock rendered two. calculateVisibility
    // had hidden Inventory (player owns nothing) and Map (player not placed yet) — heuristics meant
    // to keep a fresh player's own /menu tidy, silently overriding a deliberate per-channel choice.
    const vis = () => ({
        commands: { show: true, gatedBy: null, label: 'Commands', emoji: '🕹️' },
        inventory: { show: false, gatedBy: 'player', label: 'Inventory', emoji: '🧰' },
        actions: { show: true, gatedBy: null, label: 'Actions', emoji: '⚡' },
        challenges: { show: false, gatedBy: 'config', label: 'Challenges', emoji: '🏃' },
        crafting: { show: false, gatedBy: 'config', label: 'Crafting', emoji: '🛠️' },
        map: { show: false, gatedBy: 'player', label: 'Map', emoji: '🗺️' }
    });
    const ALL = ['commands', 'inventory', 'actions', 'challenges', 'crafting', 'map'];

    it('force-shows a selected button hidden only by THIS player\'s state', () => {
        const out = applyCastDockSelection(vis(), ALL);
        assert.equal(out.inventory.show, true, 'a broke player must still get the Inventory button when it was ticked');
        assert.equal(out.map.show, true, 'a player not yet on the map must still get the Map button when it was ticked');
        assert.equal(out.inventory.forcedBySelection, true);
    });

    it('never force-shows a button the GUILD has switched off or never configured', () => {
        const out = applyCastDockSelection(vis(), ALL);
        assert.equal(out.challenges.show, false, 'no challenge actions exist — the button would be dead weight');
        assert.equal(out.crafting.show, false);
    });

    it('leaves buttons that were never selected untouched', () => {
        const out = applyCastDockSelection(vis(), ['commands']);
        assert.equal(out.inventory.show, false);
        assert.equal(out.map.show, false);
    });

    it('does not mutate the caller\'s visibility map (the player menu shares it)', () => {
        const original = vis();
        applyCastDockSelection(original, ALL);
        assert.equal(original.inventory.show, false, 'calculateVisibility output must survive unchanged');
        assert.equal(original.inventory.forcedBySelection, undefined);
    });

    it('is a no-op for already-visible buttons and for ids with no visibility entry', () => {
        const out = applyCastDockSelection(vis(), [...ALL, 'nonsense']);
        assert.equal(out.commands.show, true);
        assert.equal(out.nonsense, undefined);
    });

    it('tolerates null/garbage input rather than throwing mid-render', () => {
        assert.deepEqual(applyCastDockSelection(null, null), {});
        assert.deepEqual(applyCastDockSelection(undefined, ['map']), {});
    });
});

describe('CastDock — castDockBlockedSelections (the setup screen tells the truth)', () => {
    const vis = {
        commands: { show: true, gatedBy: null },
        inventory: { show: false, gatedBy: 'player' },
        actions: { show: true, gatedBy: null },
        challenges: { show: false, gatedBy: 'config' },
        crafting: { show: false, gatedBy: 'config' },
        map: { show: false, gatedBy: 'player' }
    };

    it('reports only what a selection genuinely cannot overrule', () => {
        const blocked = castDockBlockedSelections(vis, ['commands', 'inventory', 'actions', 'challenges', 'crafting', 'map']);
        assert.deepEqual(blocked.map(b => b.id), ['challenges', 'crafting']);
    });

    it('carries a label, emoji and reason for each — rendered verbatim on the setup screen', () => {
        const [first] = castDockBlockedSelections(vis, ['challenges']);
        assert.equal(first.label, 'Challenges');
        assert.equal(first.emoji, '🏃');
        assert.equal(first.reason, CASTDOCK_CONFIG_GATE_REASONS.challenges);
    });

    it('treats an id with no visibility entry at all as blocked, with a generic reason', () => {
        const [only] = castDockBlockedSelections({}, ['challenges']);
        assert.ok(only, 'a missing visibility entry must not be silently treated as visible');
        assert.ok(only.reason.length > 0);
    });

    it('every selectable button has a reason string (no blank ⚠️ on the screen)', () => {
        for (const b of CASTDOCK_SELECTABLE_BUTTONS) {
            const reason = CASTDOCK_CONFIG_GATE_REASONS[b.id];
            assert.ok(reason, `${b.id} needs an entry in CASTDOCK_CONFIG_GATE_REASONS`);
            assert.ok(reason.length <= 90, `${b.id} reason must fit a select description (got ${reason.length})`);
        }
    });
});

describe('CastDock — buildCastDockButtonSelectRow surfaces blocked reasons', () => {
    const options = (row) => row.components[0].options;

    it('swaps a blocked option\'s description for its ⚠️ reason, leaving the rest alone', () => {
        const blocked = [{ id: 'crafting', reason: CASTDOCK_CONFIG_GATE_REASONS.crafting }];
        const opts = options(buildCastDockButtonSelectRow('x', null, blocked));
        assert.equal(opts.find(o => o.value === 'crafting').description, `⚠️ ${CASTDOCK_CONFIG_GATE_REASONS.crafting}`);
        assert.equal(opts.find(o => o.value === 'commands').description,
            CASTDOCK_SELECTABLE_BUTTONS.find(b => b.id === 'commands').description);
    });

    it('keeps every description within Discord\'s 100-char select limit', () => {
        const blocked = CASTDOCK_SELECTABLE_BUTTONS.map(b => ({ id: b.id, reason: CASTDOCK_CONFIG_GATE_REASONS[b.id] }));
        for (const o of options(buildCastDockButtonSelectRow('x', null, blocked))) {
            assert.ok(o.description.length <= 100, `${o.value} description too long: ${o.description.length}`);
        }
    });

    it('still works with no blocked list at all (default arg)', () => {
        assert.equal(options(buildCastDockButtonSelectRow('x', null)).length, CASTDOCK_SELECTABLE_BUTTONS.length);
    });
});

describe('CastDock — calculateVisibility keeps tagging gatedBy (static guard)', () => {
    // applyCastDockSelection is coupled to calculateVisibility by ONE field name. If a future
    // refactor drops these tags, every gate silently becomes un-overridable again and the dock
    // quietly renders fewer buttons than were ticked — exactly the reported bug, with no error.
    const src = readFileSync(path.join(__dirname, '..', 'playerManagement.js'), 'utf8');

    for (const id of ['inventory', 'map', 'challenges', 'crafting', 'actions', 'commands']) {
        it(`vis.${id} carries a gatedBy tag`, () => {
            assert.ok(new RegExp(`vis\\.${id}[.\\s]*(=\\s*\\{[^}]*gatedBy|\\.gatedBy\\s*=)`).test(src),
                `vis.${id} must set gatedBy — castDock.js applyCastDockSelection reads it`);
        });
    }

    it('inventory and map distinguish a player-state gate from a config gate', () => {
        assert.ok(src.includes("vis.inventory.gatedBy = !showInventory ? 'config'"),
            'Inventory must stay overridable when only the player is broke, but not when the host turned it off');
        assert.ok(src.includes("vis.map.gatedBy = !activeMapId ? 'config'"),
            'Map must stay overridable when the player just is not placed yet, but not when no map exists');
    });
});

describe('CastDock — setCastDockConfig preserves selectedButtons across activation (static guard)', () => {
    // Live bug 2026-07-25: the enabled:true branch assigned a fresh object literal, wiping the
    // selectedButtons saved moments earlier by setCastDockButtonSelection — Activate rendered
    // the dock with defaults regardless of the owner's picks. The fix spreads the existing
    // entry. Static check, same convention as playerManagementApplicationContext.test.js.
    it('the enabled:true branch spreads the existing channel entry', () => {
        const src = readFileSync(path.join(__dirname, '..', 'castDock.js'), 'utf8');
        const fnStart = src.indexOf('export async function setCastDockConfig');
        assert.ok(fnStart !== -1, 'setCastDockConfig must exist in castDock.js');
        const ifIdx = src.indexOf('if (enabled)', fnStart);
        assert.ok(ifIdx !== -1, 'setCastDockConfig must branch on enabled');
        const branch = src.slice(ifIdx, src.indexOf('} else', ifIdx));
        assert.ok(branch.includes('...channels[channelId]'),
            'enable branch must spread the existing entry, or selectedButtons is wiped on Activate');
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
