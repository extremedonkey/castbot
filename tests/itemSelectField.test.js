/**
 * itemSelectField — the shared modal item picker.
 *
 * Discord caps a String Select at 25 options while guilds hold up to 79 items (prod, Aug 2026).
 * Every modal item picker therefore truncates; the bug was that they did it SILENTLY, so an
 * admin whose item wasn't listed couldn't tell if it was missing, mis-sorted, or broken. These
 * tests pin the two things that failure depends on: that the cap is applied, and that the
 * description ALWAYS states what was left out and where to find it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemSelectOptions,
  buildItemSelectDescription,
  buildItemSelectField,
  ITEM_SELECT_MAX
} from '../utils/itemSelectField.js';

const items = n => Array.from({ length: n }, (_, i) => ({
  id: `item_${i}`,
  name: `Item ${i}`,
  emoji: '🗿',
  description: `Description ${i}`
}));

describe('itemSelectField — options', () => {
  it('caps at Discord\'s 25-option limit', () => {
    assert.equal(ITEM_SELECT_MAX, 25);
    assert.equal(buildItemSelectOptions(items(79)).length, 25);
    assert.equal(buildItemSelectOptions(items(4)).length, 4);
    assert.deepEqual(buildItemSelectOptions([]), []);
    assert.deepEqual(buildItemSelectOptions(undefined), []);
  });

  it('preserves caller order — callers sort newest-first, this must not re-sort', () => {
    const opts = buildItemSelectOptions(items(30));
    assert.equal(opts[0].value, 'item_0');
    assert.equal(opts[24].value, 'item_24', 'takes the FIRST 25, not a sample');
  });

  it('truncates label and description to Discord\'s 100-char field limits', () => {
    const [opt] = buildItemSelectOptions([{ id: 'x', name: 'N'.repeat(200), description: 'D'.repeat(200) }]);
    assert.equal(opt.label.length, 100);
    assert.equal(opt.description.length, 100);
  });

  it('falls back to the id when an item has no name, and omits an absent description', () => {
    const [opt] = buildItemSelectOptions([{ id: 'orphan_item' }]);
    assert.equal(opt.label, 'orphan_item');
    assert.equal('description' in opt, false, 'no empty description key');
  });

  it('always emits a valid emoji, even for a missing or junk one', () => {
    for (const emoji of [undefined, '', 'not-an-emoji']) {
      const [opt] = buildItemSelectOptions([{ id: 'x', name: 'X', emoji }]);
      assert.ok(opt.emoji, `emoji resolved for ${JSON.stringify(emoji)}`);
    }
  });
});

describe('itemSelectField — the description is the whole point', () => {
  it('reports the count AND the escape route when items are cut', () => {
    const d = buildItemSelectDescription(25, 79, 'search');
    assert.match(d, /25/);
    assert.match(d, /79/);
    assert.match(d, /blank/i, 'names the escape hatch');
  });

  it('points Quick Create at Edit instead, because it has no next screen', () => {
    const d = buildItemSelectDescription(25, 79, 'edit');
    assert.match(d, /25/);
    assert.match(d, /79/);
    assert.match(d, /Edit/);
    assert.doesNotMatch(d, /blank/i, 'no blank-to-search — Quick Create requires a pick');
  });

  it('says nothing about truncation when nothing was truncated', () => {
    for (const escape of ['search', 'edit', null]) {
      const d = buildItemSelectDescription(4, 4, escape);
      assert.doesNotMatch(d, /Showing/, `no false truncation notice (${escape})`);
    }
  });

  it('still offers the search hint on a short list, since the field is optional there', () => {
    assert.match(buildItemSelectDescription(4, 4, 'search'), /blank/i);
  });

  it('never exceeds the 100-char Label description cap that would reject the modal', () => {
    for (const total of [26, 79, 999, 1000000]) {
      for (const escape of ['search', 'edit', null]) {
        const d = buildItemSelectDescription(25, total, escape);
        assert.ok(d.length <= 100, `${total}/${escape}: ${d.length} chars`);
      }
    }
  });
});

describe('itemSelectField — the assembled Label', () => {
  it('builds a Label-wrapped String Select', () => {
    const field = buildItemSelectField({ items: items(5) });
    assert.equal(field.type, 18);
    assert.equal(field.component.type, 3);
    assert.equal(field.component.custom_id, 'item_select');
    assert.equal(field.component.max_values, 1);
  });

  it('an optional field is labelled optional and accepts an empty submit', () => {
    const field = buildItemSelectField({ items: items(5), required: false, escape: 'search' });
    assert.match(field.label, /optional/i);
    assert.equal(field.component.required, false);
    assert.equal(field.component.min_values, 0, 'must allow submitting with nothing chosen');
  });

  it('a required field forces a pick', () => {
    const field = buildItemSelectField({ items: items(5), required: true });
    assert.doesNotMatch(field.label, /optional/i);
    assert.equal(field.component.required, true);
    assert.equal(field.component.min_values, 1);
  });

  it('computes the total from the full list, so truncation is reported', () => {
    const field = buildItemSelectField({ items: items(79), escape: 'search' });
    assert.equal(field.component.options.length, 25);
    assert.match(field.description, /79/, 'the TRUE total, not the capped 25');
  });

  it('honours an explicit totalCount for callers that pre-cut the list', () => {
    const field = buildItemSelectField({ items: items(25), totalCount: 79, escape: 'search' });
    assert.match(field.description, /79/);
  });

  it('survives an empty guild without throwing', () => {
    const field = buildItemSelectField({ items: [] });
    assert.deepEqual(field.component.options, []);
    assert.ok(field.description.length > 0);
  });
});
