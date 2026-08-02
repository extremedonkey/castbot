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
