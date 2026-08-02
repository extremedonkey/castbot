/**
 * Quick Give / Remove Currency outcome — the one-shot create modal.
 *
 * Creating a currency outcome used to take five interactions; it is now a single modal.
 * These tests pin the three things that flow can silently get wrong:
 *   1. the modal's shape (Label-wrapped V2 components, correct custom_id round-trip),
 *   2. the parse/validation rules (what a blank/0/garbage amount does),
 *   3. that the stored outcome is byte-identical to what the legacy Container editor writes —
 *      because both surfaces must produce the same `config.limit` shapes or the runtime
 *      claim engine (evaluateClassicGate) reads them differently.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGiveCurrencyModal,
  buildQuickLimit,
  parseQuickCurrencyFields
} from '../customActionUI.js';
// The executeOn vocabulary itself is covered by tests/executeOnOptions.test.js — here we only
// assert how this modal wires it up.

const TERMS = { currencyName: 'Contraband', currencyEmoji: '🚬' };

function labelFor(modal, customId) {
  return modal.data.components.find(l => l.component?.custom_id === customId);
}

describe('Quick Currency modal — shape', () => {
  it('is a 3-field Label modal whose custom_id round-trips buttonId + executeOn', () => {
    const modal = buildGiveCurrencyModal('inspect_metal_855296', 'true', TERMS);

    assert.equal(modal.type, 9);
    assert.equal(modal.data.custom_id, 'safari_currency_quick_inspect_metal_855296_true');
    assert.equal(modal.data.components.length, 3);
    assert.ok(modal.data.components.every(l => l.type === 18), 'every field is a Label (type 18)');
  });

  it('titles itself with the guild\'s custom currency name, within Discord\'s 45-char cap', () => {
    assert.equal(buildGiveCurrencyModal('b', 'true', TERMS).data.title, 'Give / Remove Contraband');
    const long = buildGiveCurrencyModal('b', 'true', { currencyName: 'X'.repeat(80) });
    assert.ok(long.data.title.length <= 45);
  });

  it('amount is a required short text input capped at 10 chars', () => {
    const amount = labelFor(buildGiveCurrencyModal('b', 'true', TERMS), 'amount').component;
    assert.equal(amount.type, 4);
    assert.equal(amount.style, 1);
    assert.equal(amount.required, true);
    assert.equal(amount.max_length, 10);
  });

  it('pre-selects Once Per Player and names it in the placeholder (modals ignore `default`)', () => {
    const limit = labelFor(buildGiveCurrencyModal('b', 'true', TERMS), 'usage_limit').component;
    assert.equal(limit.type, 3);
    assert.equal(limit.required, false, 'skippable so the handler default applies');
    assert.equal(limit.min_values, 0);
    assert.equal(limit.options.find(o => o.default).value, 'once_per_player');
    assert.match(limit.placeholder, /Once Per Player/);
  });

  it('excludes Custom… — its sub-screens cannot be hosted inside a modal', () => {
    const limit = labelFor(buildGiveCurrencyModal('b', 'true', TERMS), 'usage_limit').component;
    assert.equal(limit.options.some(o => o.value === 'custom'), false);
  });

  it('offers only true/false normally, and adds Always only for an always-branch outcome', () => {
    const normal = labelFor(buildGiveCurrencyModal('b', 'true', TERMS), 'execute_on').component;
    assert.deepEqual(normal.options.map(o => o.value), ['true', 'false']);

    // Clicking "Add Outcome" in the Always section must not silently demote to a conditional
    const always = labelFor(buildGiveCurrencyModal('b', 'always', TERMS), 'execute_on').component;
    assert.deepEqual(always.options.map(o => o.value), ['true', 'false', 'always']);
    assert.equal(always.options.find(o => o.default).value, 'always');
  });

  it('defaults the executes-if select to the branch the admin clicked Add Outcome under', () => {
    const falseBranch = labelFor(buildGiveCurrencyModal('b', 'false', TERMS), 'execute_on').component;
    assert.equal(falseBranch.options.find(o => o.default).value, 'false');
    assert.match(falseBranch.placeholder, /All conditions are false/);
  });
});

describe('Quick Currency modal — parsing and validation', () => {
  it('accepts a positive amount with the defaults applied when both selects are skipped', () => {
    const { action, error } = parseQuickCurrencyFields({ amount: '100' }, 'true');
    assert.equal(error, undefined);
    assert.equal(action.type, 'give_currency');
    assert.equal(action.config.amount, 100);
    assert.deepEqual(action.config.limit, { type: 'once_per_player', claimedBy: [] });
    assert.equal(action.executeOn, 'true');
  });

  it('accepts a negative amount (remove currency)', () => {
    assert.equal(parseQuickCurrencyFields({ amount: '-50' }, 'true').action.config.amount, -50);
  });

  it('honours explicit select values over the defaults', () => {
    const { action } = parseQuickCurrencyFields(
      { amount: '7', usage_limit: ['once_globally'], execute_on: ['false'] },
      'true'
    );
    assert.deepEqual(action.config.limit, { type: 'once_globally', claimedBy: null });
    assert.equal(action.executeOn, 'false');
  });

  it('falls back to the custom_id branch when the executes-if select is skipped', () => {
    assert.equal(parseQuickCurrencyFields({ amount: '5' }, 'false').action.executeOn, 'false');
    assert.equal(parseQuickCurrencyFields({ amount: '5' }, 'always').action.executeOn, 'always');
  });

  it('rejects 0 — it would create an outcome that does nothing', () => {
    const { error, action } = parseQuickCurrencyFields({ amount: '0' }, 'true');
    assert.equal(action, undefined);
    assert.match(error, /can't be 0/);
  });

  it('rejects blank and non-numeric amounts by name', () => {
    assert.match(parseQuickCurrencyFields({ amount: '   ' }, 'true').error, /blank/);
    assert.match(parseQuickCurrencyFields({ amount: 'lots' }, 'true').error, /lots/);
    assert.ok(parseQuickCurrencyFields({}, 'true').error);
  });

  it('rejects amounts outside ±999999', () => {
    assert.ok(parseQuickCurrencyFields({ amount: '1000000' }, 'true').error);
    assert.ok(parseQuickCurrencyFields({ amount: '-1000000' }, 'true').error);
    assert.equal(parseQuickCurrencyFields({ amount: '999999' }, 'true').action.config.amount, 999999);
  });

  it('tolerates a bare string from the select (not just an array)', () => {
    const { action } = parseQuickCurrencyFields({ amount: '1', usage_limit: 'unlimited', execute_on: 'false' }, 'true');
    assert.deepEqual(action.config.limit, { type: 'unlimited' });
    assert.equal(action.executeOn, 'false');
  });
});

describe('Quick Currency — limit shapes match the legacy Save & Finish handler', () => {
  // These exact shapes are what claimsManager.evaluateClassicGate reads. A mismatch here
  // means an outcome created via the modal gates differently from an identical one created
  // via the Container editor.
  it('once_per_player → empty array', () => {
    assert.deepEqual(buildQuickLimit('once_per_player'), { type: 'once_per_player', claimedBy: [] });
  });
  it('once_globally → null (never [])', () => {
    assert.deepEqual(buildQuickLimit('once_globally'), { type: 'once_globally', claimedBy: null });
  });
  it('once_per_period → object claims + a concrete 1d period', () => {
    assert.deepEqual(buildQuickLimit('once_per_period'), { type: 'once_per_period', periodMs: 86400000, claimedBy: {} });
  });
  it('unlimited (and missing) → bare type, no claim store', () => {
    assert.deepEqual(buildQuickLimit('unlimited'), { type: 'unlimited' });
    assert.deepEqual(buildQuickLimit(undefined), { type: 'unlimited' });
  });
});

describe('Quick Currency modal — executes-if copy comes from the shared source', () => {
  it('renders the agreed labels/emoji rather than a local restatement', () => {
    const [pass, fail] = labelFor(buildGiveCurrencyModal('b', 'true', TERMS), 'execute_on').component.options;
    assert.equal(pass.label, 'All conditions are true (default)');
    assert.equal(pass.emoji.name, '🟢');
    assert.equal(fail.label, 'All conditions are false');
    assert.equal(fail.emoji.name, '🔴');
  });
});
