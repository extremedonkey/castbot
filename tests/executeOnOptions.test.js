/**
 * executeOnOptions — the single source of truth for outcome executeOn copy.
 *
 * This module exists because the same three-way choice was hand-written at six call sites in
 * three different wordings and two emoji sets. These tests are the guard rail for the coming
 * terminology switch: they pin the contract (one default marked, every branch defined,
 * unknown values normalised) rather than the exact prose, so renaming copy stays a one-file
 * change but a HALF-done rename fails loudly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXECUTE_ON,
  EXECUTE_ON_TERMS,
  DEFAULT_EXECUTE_ON,
  buildExecuteOnOptions,
  buildExecuteOnRadioOptions,
  toRadioOptions,
  normalizeExecuteOn,
  executeOnEmoji,
  executeOnShortLabel
} from '../utils/executeOnOptions.js';

describe('executeOnOptions — values and terms', () => {
  it('the default branch is "true", matching executeButtonActions\' `action.executeOn || true`', () => {
    assert.equal(DEFAULT_EXECUTE_ON, 'true');
    assert.deepEqual(Object.values(EXECUTE_ON), ['true', 'false', 'always']);
  });

  it('every branch has complete copy (a partial rename fails here, not in Discord)', () => {
    for (const value of Object.values(EXECUTE_ON)) {
      const term = EXECUTE_ON_TERMS[value];
      assert.ok(term, `${value} has terms`);
      for (const key of ['emoji', 'label', 'short', 'description']) {
        assert.equal(typeof term[key], 'string', `${value}.${key} is a string`);
        assert.ok(term[key].length > 0, `${value}.${key} is non-empty`);
      }
    }
  });

  it('uses the agreed traffic-light emoji', () => {
    assert.equal(executeOnEmoji('true'), '🟢');
    assert.equal(executeOnEmoji('false'), '🔴');
    assert.equal(executeOnEmoji('always'), '🔵');
    assert.equal(executeOnEmoji(undefined), '🟢', 'unset outcomes render as the default branch');
  });

  it('short labels stay short enough for dense action-list rows', () => {
    for (const value of Object.values(EXECUTE_ON)) {
      assert.ok(executeOnShortLabel(value).length <= 20, `${value} short label is compact`);
    }
  });
});

describe('executeOnOptions — normalizeExecuteOn', () => {
  it('passes through the three valid values', () => {
    assert.equal(normalizeExecuteOn('true'), 'true');
    assert.equal(normalizeExecuteOn('false'), 'false');
    assert.equal(normalizeExecuteOn('always'), 'always');
  });

  it('coerces everything else to the default — including legacy outcomes with no field', () => {
    for (const bad of [undefined, null, '', 'TRUE', 'False', 0, 1, {}, []]) {
      assert.equal(normalizeExecuteOn(bad), 'true', `${JSON.stringify(bad)} → true`);
    }
  });
});

describe('executeOnOptions — buildExecuteOnOptions', () => {
  it('offers pass/fail by default and marks the default option', () => {
    const opts = buildExecuteOnOptions();
    assert.deepEqual(opts.map(o => o.value), ['true', 'false']);
    assert.equal(opts[0].label, 'All conditions are true (default)');
    assert.equal(opts[1].label, 'All conditions are false');
    assert.equal(opts[0].default, true);
  });

  it('marks exactly one option selected for any input, valid or not', () => {
    for (const current of ['true', 'false', 'always', undefined, 'garbage']) {
      const opts = buildExecuteOnOptions({ current, includeAlways: true });
      const selected = opts.filter(o => o.default);
      assert.equal(selected.length, 1, `exactly one default for ${current}`);
      assert.equal(selected[0].value, normalizeExecuteOn(current));
    }
  });

  it('hides Always unless asked — or unless the outcome already lives there', () => {
    assert.equal(buildExecuteOnOptions({ current: 'true' }).length, 2);
    assert.equal(buildExecuteOnOptions({ current: 'true', includeAlways: true }).length, 3);
    // Rendering a 2-option select for an always-outcome would silently demote it on save
    assert.equal(buildExecuteOnOptions({ current: 'always' }).length, 3);
  });

  it('markDefault:false drops the suffix for screens that don\'t want it', () => {
    assert.equal(buildExecuteOnOptions({ markDefault: false })[0].label, 'All conditions are true');
  });

  it('emits Discord-shaped options within the platform\'s field limits', () => {
    for (const o of buildExecuteOnOptions({ includeAlways: true })) {
      assert.ok(o.label.length > 0 && o.label.length <= 100, 'label within 100 chars');
      assert.ok(o.description.length <= 100, 'description within 100 chars');
      assert.equal(typeof o.emoji.name, 'string');
      assert.equal(typeof o.value, 'string');
    }
  });
});

/**
 * Radio Group variants. Modals ignore a String Select's option `default`, so any modal field
 * that must show the CURRENT value has to be a Radio Group (type 21) — and a Radio Group
 * pre-selects only if exactly one option carries `default` and the siblings omit the key
 * entirely. An explicit `default: false` on a sibling silently kills pre-selection for the
 * whole group, and an unsupported field like `emoji` rejects the entire modal with no
 * server-side error. Both documented in ComponentsV2.md; both invisible until a user reports
 * "the modal just says This interaction failed".
 */
describe('executeOnOptions — buildExecuteOnRadioOptions', () => {
  it('marks exactly one option and OMITS the key from the rest', () => {
    for (const current of ['true', 'false', 'always']) {
      const opts = buildExecuteOnRadioOptions({ current, includeAlways: true });
      const withKey = opts.filter(o => 'default' in o);
      assert.equal(withKey.length, 1, `exactly one carries \`default\` for ${current}`);
      assert.equal(withKey[0].default, true);
      assert.equal(withKey[0].value, current);
    }
  });

  it('never emits `default: false` — the sibling that would kill the whole group', () => {
    const opts = buildExecuteOnRadioOptions({ current: 'true', includeAlways: true });
    assert.equal(opts.some(o => o.default === false), false);
  });

  it('carries no emoji field — no working Radio Group in the codebase has one', () => {
    for (const o of buildExecuteOnRadioOptions({ includeAlways: true })) {
      assert.equal('emoji' in o, false);
    }
  });

  it('keeps the emoji visible by folding it into the label instead', () => {
    const [pass, fail] = buildExecuteOnRadioOptions();
    assert.match(pass.label, /^🟢/);
    assert.match(fail.label, /^🔴/);
  });

  it('stays within Discord\'s option-count and field limits', () => {
    const opts = buildExecuteOnRadioOptions({ includeAlways: true });
    assert.ok(opts.length >= 2 && opts.length <= 10, 'Radio Group holds 2-10 options');
    for (const o of opts) {
      assert.ok(o.label.length <= 100, `label within 100: ${o.label}`);
      assert.ok(o.description.length <= 100, 'description within 100');
    }
  });

  it('mirrors the select builder\'s branch visibility rules', () => {
    assert.equal(buildExecuteOnRadioOptions({ current: 'true' }).length, 2);
    assert.equal(buildExecuteOnRadioOptions({ current: 'always' }).length, 3, 'never demotes an always-outcome');
  });
});

describe('executeOnOptions — toRadioOptions', () => {
  const selectOpts = [
    { label: 'Unlimited', value: 'unlimited', description: 'forever', emoji: { name: '♾️' }, default: false },
    { label: 'Once Per Player', value: 'once_per_player', description: 'each once', emoji: { name: '👤' }, default: true },
    { label: 'Once Globally', value: 'once_globally', emoji: { name: '🌍' }, default: false }
  ];

  it('strips every `default: false` and keeps the single true one', () => {
    const radio = toRadioOptions(selectOpts);
    assert.equal(radio.filter(o => 'default' in o).length, 1);
    assert.equal(radio.find(o => o.default).value, 'once_per_player');
  });

  it('moves the emoji into the label and drops the unsupported field', () => {
    const [first] = toRadioOptions(selectOpts);
    assert.equal('emoji' in first, false);
    assert.match(first.label, /^♾️ Unlimited/);
  });

  it('omits description entirely when the source had none', () => {
    const last = toRadioOptions(selectOpts).at(-1);
    assert.equal('description' in last, false);
  });

  it('caps at 10 — Discord\'s Radio Group limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
    assert.equal(toRadioOptions(many).length, 10);
  });

  it('clamps over-long labels and descriptions to 100 chars', () => {
    const [o] = toRadioOptions([{ label: 'L'.repeat(200), value: 'v', description: 'D'.repeat(200) }]);
    assert.equal(o.label.length, 100);
    assert.equal(o.description.length, 100);
  });

  it('handles empty and missing input', () => {
    assert.deepEqual(toRadioOptions([]), []);
    assert.deepEqual(toRadioOptions(undefined), []);
  });
});
