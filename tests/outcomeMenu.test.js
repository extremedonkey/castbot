/**
 * Outcome context menu (`outcome_select_*`) — the per-outcome String Select in the Action Editor.
 *
 * THE CONTRACT these tests exist to enforce: Opening / Pass / Fail render an IDENTICAL menu
 * except for the two "Move to…" entries. That was true by accident before (one builder, plus a
 * dead `executeOn` parameter that implied per-section variance), and it stopped LOOKING true
 * the moment an entry started appearing conditionally — a Fail outcome with an unlimited limit
 * lost its Player Claims entry, which reads as a Pass-vs-Fail bug rather than a config
 * difference. If you add a per-section option, this suite should fail.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOutcomeMenuOptions,
  outcomeOperationLabel,
  CLAIM_OUTCOME_TYPES
} from '../customActionUI.js';

const ITEMS = { i1: { name: 'Hidden Immunity Idol', emoji: '🗿' } };

const outcome = (over = {}) => ({
  type: 'give_currency',
  executeOn: 'true',
  config: { amount: 100, limit: { type: 'once_per_player', claimedBy: [] } },
  ...over
});

/** Everything except the branch-specific move entries — this is what must match across sections. */
const stripMoves = opts => opts.filter(o => !String(o.value).startsWith('move_to_')).map(o => o.value);
const moves = opts => opts.filter(o => String(o.value).startsWith('move_to_')).map(o => o.value);

describe('Outcome menu — Opening / Pass / Fail consistency', () => {
  const branches = ['always', 'true', 'false'];

  it('offers the same non-move options in the same order in all three sections', () => {
    const [always, pass, fail] = branches.map(executeOn =>
      stripMoves(buildOutcomeMenuOptions(outcome({ executeOn }), { allActions: [] }))
    );
    assert.deepEqual(pass, always, 'Pass matches Opening');
    assert.deepEqual(fail, always, 'Fail matches Opening');
    assert.deepEqual(fail, ['summary', 'edit', 'move_up', 'move_down', 'divider', 'clone', 'player_claims', 'delete']);
  });

  it('produces byte-identical option objects across sections once moves are removed', () => {
    const render = executeOn => JSON.stringify(
      buildOutcomeMenuOptions(outcome({ executeOn }), { allActions: [], guildItems: ITEMS })
        .filter(o => !String(o.value).startsWith('move_to_'))
    );
    assert.equal(render('true'), render('always'));
    assert.equal(render('true'), render('false'), 'labels, emoji AND descriptions all match');
  });

  it('offers exactly the two sections the outcome is NOT in', () => {
    assert.deepEqual(moves(buildOutcomeMenuOptions(outcome({ executeOn: 'always' }))), ['move_to_true', 'move_to_false']);
    assert.deepEqual(moves(buildOutcomeMenuOptions(outcome({ executeOn: 'true' }))), ['move_to_always', 'move_to_false']);
    assert.deepEqual(moves(buildOutcomeMenuOptions(outcome({ executeOn: 'false' }))), ['move_to_always', 'move_to_true']);
  });

  it('treats a legacy outcome with no executeOn as a Pass outcome', () => {
    const legacy = outcome({});
    delete legacy.executeOn;
    assert.deepEqual(moves(buildOutcomeMenuOptions(legacy)), ['move_to_always', 'move_to_false']);
  });

  it('hides Clone at the outcome cap — and hides it in every section equally', () => {
    const atCap = Array.from({ length: 20 }, () => outcome());
    for (const executeOn of branches) {
      const opts = buildOutcomeMenuOptions(outcome({ executeOn }), { allActions: atCap });
      assert.equal(opts.some(o => o.value === 'clone'), false, `${executeOn} hides clone at cap`);
    }
  });
});

describe('Outcome menu — Open Linked Action entry', () => {
  const linked = (over = {}) => ({ type: 'follow_up_button', executeOn: 'true', config: { buttonId: 'target_1' }, ...over });

  it('is offered for a configured linked action, in every section, directly above Clone', () => {
    for (const executeOn of ['always', 'true', 'false']) {
      const values = stripMoves(buildOutcomeMenuOptions(linked({ executeOn }), { allActions: [] }));
      assert.deepEqual(values, ['summary', 'edit', 'move_up', 'move_down', 'divider', 'open_linked', 'clone', 'delete']);
    }
  });

  it('accepts the legacy follow_up type and legacy top-level buttonId location', () => {
    const legacyType = buildOutcomeMenuOptions({ type: 'follow_up', executeOn: 'true', config: { buttonId: 'x' } });
    const legacyLoc = buildOutcomeMenuOptions({ type: 'follow_up_button', executeOn: 'true', buttonId: 'x' });
    assert.ok(legacyType.some(o => o.value === 'open_linked'));
    assert.ok(legacyLoc.some(o => o.value === 'open_linked'));
  });

  it('is NOT offered when no target is configured (nothing to open)', () => {
    const opts = buildOutcomeMenuOptions({ type: 'follow_up_button', executeOn: 'true', config: {} });
    assert.equal(opts.some(o => o.value === 'open_linked'), false);
  });

  it('is NOT offered for non-linked outcome types', () => {
    for (const type of ['display_text', 'give_currency', 'give_item', 'manage_player_state']) {
      const opts = buildOutcomeMenuOptions(outcome({ type }));
      assert.equal(opts.some(o => o.value === 'open_linked'), false, `${type} has no Open Linked Action`);
    }
  });
});

describe('Outcome menu — Player Claims availability', () => {
  it('is offered for every claim-capable type, in every section, at ANY limit setting', () => {
    const limits = [
      { type: 'once_per_player', claimedBy: [] },
      { type: 'once_globally', claimedBy: null },
      { type: 'once_per_period', periodMs: 86400000, claimedBy: {} },
      { type: 'custom', claims: [] },
      { type: 'unlimited' },
      undefined // never configured — the case that made the entry vanish
    ];
    for (const type of CLAIM_OUTCOME_TYPES) {
      for (const executeOn of ['always', 'true', 'false']) {
        for (const limit of limits) {
          const opts = buildOutcomeMenuOptions(outcome({ type, executeOn, config: { amount: 1, limit } }));
          assert.ok(
            opts.some(o => o.value === 'player_claims'),
            `${type} / ${executeOn} / ${limit?.type || 'no limit'} offers Player Claims`
          );
        }
      }
    }
  });

  it('is NOT offered for outcome types that have no claims to manage', () => {
    for (const type of ['display_text', 'give_role', 'remove_role', 'follow_up_button', 'calculate_results', 'manage_player_state']) {
      const opts = buildOutcomeMenuOptions(outcome({ type, config: {} }));
      assert.equal(opts.some(o => o.value === 'player_claims'), false, `${type} has no Player Claims`);
    }
  });
});

describe('Outcome menu — Give vs Remove labelling', () => {
  it('currency names its direction the way item does', () => {
    assert.equal(outcomeOperationLabel({ type: 'give_currency', config: { amount: 100 } }), 'Give Currency');
    assert.equal(outcomeOperationLabel({ type: 'give_currency', config: { amount: -50 } }), 'Remove Currency');
    assert.equal(outcomeOperationLabel({ type: 'give_item', config: { operation: 'give' } }), 'Give Item');
    assert.equal(outcomeOperationLabel({ type: 'give_item', config: { operation: 'remove' } }), 'Remove Item');
  });

  it('defaults to Give for 0 / missing amount and missing operation', () => {
    assert.equal(outcomeOperationLabel({ type: 'give_currency', config: { amount: 0 } }), 'Give Currency');
    assert.equal(outcomeOperationLabel({ type: 'give_currency', config: {} }), 'Give Currency');
    assert.equal(outcomeOperationLabel({ type: 'give_item', config: {} }), 'Give Item');
  });

  it('reads a legacy top-level amount (pre-config outcomes)', () => {
    assert.equal(outcomeOperationLabel({ type: 'give_currency', amount: -5 }), 'Remove Currency');
  });

  it('returns null for types with no direction', () => {
    assert.equal(outcomeOperationLabel({ type: 'display_text' }), null);
    assert.equal(outcomeOperationLabel(null), null);
  });

  it('surfaces the direction in the menu summary label, not just the editor', () => {
    const [summary] = buildOutcomeMenuOptions(outcome({ config: { amount: -50, limit: { type: 'unlimited' } } }));
    assert.equal(summary.label, '1. Remove Currency | -50 (unlimited)');
    assert.equal(summary.value, 'summary');
    assert.equal(summary.default, true, 'summary is the pre-selected row so the select reads as a label');
  });
});

describe('Outcome menu — Discord limits', () => {
  it('stays within 25 options and the per-field caps in every configuration', () => {
    for (const type of [...CLAIM_OUTCOME_TYPES, 'display_text']) {
      for (const executeOn of ['always', 'true', 'false']) {
        const opts = buildOutcomeMenuOptions(
          outcome({ type, executeOn, config: { amount: -999999, itemId: 'i1', quantity: 99, limit: { type: 'once_per_player' } } }),
          { position: 20, guildItems: ITEMS }
        );
        assert.ok(opts.length <= 25, `${type}/${executeOn}: ${opts.length} options`);
        for (const o of opts) {
          assert.ok(o.label.length > 0 && o.label.length <= 100, `label within 100: "${o.label}"`);
          if (o.description !== undefined) assert.ok(o.description.length <= 100, 'description within 100');
        }
        assert.equal(new Set(opts.map(o => o.value)).size, opts.length, 'values are unique');
      }
    }
  });
});
