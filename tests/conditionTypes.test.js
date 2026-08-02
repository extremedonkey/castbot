/**
 * conditionTypes — the single source for Safari condition types, and the one-shot Add Condition
 * modal built from it.
 *
 * The list used to be hand-written in two places and had already drifted: showConditionEditor
 * offered all 8 types while app.js's item-search branch offered 3 AND hardcoded `default: true`
 * on Item, so searching for an item hid five types and misreported the condition's own type.
 * These tests are the guard rail for that: every surface composes from CONDITION_TYPES, so
 * adding a 9th type is one edit and a half-done addition fails here.
 *
 * Ordering is load-bearing, not cosmetic — in production item is 316 of 334 conditions (95%),
 * currency 17, random_probability 1, everything else zero. The picker leads with the 95% case.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONDITION_TYPES,
  DEFAULT_CONDITION_TYPE,
  buildConditionTypeOptions,
  buildConditionTypeRadioOptions,
  normalizeConditionType,
  isKnownConditionType,
  conditionTypeEmoji,
  conditionTypeLabel,
  isConfigurableInModal
} from '../utils/conditionTypes.js';
import {
  buildAddConditionModal,
  parseAddConditionFields,
  buildConditionObject
} from '../customActionUI.js';

const items = n => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, emoji: '🗿' }));
const fieldById = (modal, id) => modal.data.components.find(l => l.component?.custom_id === id);

describe('conditionTypes — the shared list', () => {
  it('leads with Item, the 95% case, and defaults to it', () => {
    assert.equal(CONDITION_TYPES[0].value, 'item');
    assert.equal(DEFAULT_CONDITION_TYPE, 'item');
  });

  it('covers every type the engine understands, with complete copy', () => {
    const expected = ['item', 'currency', 'role', 'attribute_check', 'attribute_compare',
      'multi_attribute_check', 'random_probability', 'd20_roll'];
    assert.deepEqual(CONDITION_TYPES.map(t => t.value), expected);
    for (const t of CONDITION_TYPES) {
      for (const key of ['label', 'emoji', 'description']) {
        assert.equal(typeof t[key], 'string', `${t.value}.${key} defined`);
        assert.ok(t[key].length > 0, `${t.value}.${key} non-empty`);
      }
    }
  });

  it('stays within Radio Group\'s 10-option ceiling — the modal breaks silently past it', () => {
    assert.ok(CONDITION_TYPES.length <= 10, `${CONDITION_TYPES.length} types; radio caps at 10`);
  });

  it('normalizes unknown and missing types to the default', () => {
    for (const bad of [undefined, null, '', 'has_item', 'nonsense', 0, {}]) {
      assert.equal(normalizeConditionType(bad), 'item');
    }
    assert.equal(normalizeConditionType('currency'), 'currency');
  });

  it('recognises exactly the known types', () => {
    assert.equal(isKnownConditionType('d20_roll'), true);
    // The legacy dead-path vocabulary that never reached the engine
    assert.equal(isKnownConditionType('has_item'), false);
    assert.equal(isKnownConditionType('has_currency'), false);
  });

  it('exposes emoji and label lookups so summaries cannot drift from the picker', () => {
    assert.equal(conditionTypeEmoji('item'), '📦');
    assert.equal(conditionTypeLabel('random_probability'), 'Random Probability');
    assert.equal(conditionTypeEmoji('bogus'), '🧩', 'safe fallback');
  });

  it('marks only the types the modal can finish on its own', () => {
    assert.equal(isConfigurableInModal('item'), true);
    for (const t of CONDITION_TYPES.filter(t => t.value !== 'item')) {
      assert.equal(isConfigurableInModal(t.value), false, `${t.value} needs its own screen`);
    }
  });
});

describe('conditionTypes — select vs radio builders share one list', () => {
  it('both builders emit exactly the same values in the same order', () => {
    assert.deepEqual(
      buildConditionTypeRadioOptions().map(o => o.value),
      buildConditionTypeOptions().map(o => o.value)
    );
    assert.deepEqual(buildConditionTypeOptions().map(o => o.value), CONDITION_TYPES.map(t => t.value));
  });

  it('the SELECT marks the current type (messages honour `default`)', () => {
    const opts = buildConditionTypeOptions('d20_roll');
    assert.equal(opts.filter(o => o.default).length, 1);
    assert.equal(opts.find(o => o.default).value, 'd20_roll');
  });

  it('the select carries emoji as a field; the radio folds it into the label', () => {
    assert.equal(buildConditionTypeOptions()[0].emoji.name, '📦');
    const radio = buildConditionTypeRadioOptions()[0];
    assert.equal('emoji' in radio, false, 'an emoji field rejects the whole modal');
    assert.match(radio.label, /^📦 Item/);
  });

  it('the radio obeys the one-`default`-key rule that a sibling default:false would break', () => {
    for (const current of ['item', 'currency', 'd20_roll', undefined, 'garbage']) {
      const opts = buildConditionTypeRadioOptions(current);
      const withKey = opts.filter(o => 'default' in o);
      assert.equal(withKey.length, 1, `exactly one key for ${current}`);
      assert.equal(withKey[0].default, true);
      assert.equal(withKey[0].value, normalizeConditionType(current));
    }
  });

  it('every option fits Discord\'s field limits', () => {
    for (const o of [...buildConditionTypeOptions(), ...buildConditionTypeRadioOptions()]) {
      assert.ok(o.label.length > 0 && o.label.length <= 100);
      if (o.description !== undefined) assert.ok(o.description.length <= 100);
    }
  });
});

describe('Add Condition modal', () => {
  it('is a legal 3-field modal with a round-tripping custom_id', () => {
    const modal = buildAddConditionModal('stray_dog_102331', 2, items(10));
    assert.equal(modal.type, 9);
    assert.equal(modal.data.custom_id, 'safari_condition_add_stray_dog_102331_2');
    assert.ok(modal.data.title.length <= 45);
    assert.equal(modal.data.components.length, 3);
    assert.ok(modal.data.components.every(f => f.type === 18));
    for (const f of modal.data.components) {
      assert.ok(f.label.length <= 45, `label "${f.label}" within 45`);
      if (f.description) assert.ok(f.description.length <= 100, `description within 100: ${f.description}`);
    }
  });

  it('defaults the type to Item so the 95% case needs no correction', () => {
    const type = fieldById(buildAddConditionModal('b', 0, items(3)), 'condition_type').component;
    assert.equal(type.type, 21, 'Radio Group — a modal select cannot pre-select');
    assert.equal(type.options.find(o => o.default).value, 'item');
  });

  it('keeps the item optional so a blank submit reaches the search picker', () => {
    const item = fieldById(buildAddConditionModal('b', 0, items(40)), 'condition_item').component;
    assert.equal(item.required, false);
    assert.equal(item.min_values, 0);
    assert.match(fieldById(buildAddConditionModal('b', 0, items(40)), 'condition_item').description, /40/);
  });

  it('defaults the operator to Have it', () => {
    const op = fieldById(buildAddConditionModal('b', 0, items(3)), 'condition_operator').component;
    assert.equal(op.options.find(o => o.default).value, 'has');
    assert.equal(op.options.length, 2);
    for (const o of op.options) assert.equal('emoji' in o, false);
  });

  it('stays legal for an empty guild and at the item ceiling', () => {
    for (const n of [0, 1, 25, 79]) {
      const modal = buildAddConditionModal('b', 0, items(n));
      assert.equal(modal.data.components.length, 3);
    }
  });
});

describe('Add Condition — parsing and stored shape', () => {
  it('parses a complete item submit', () => {
    assert.deepEqual(
      parseAddConditionFields({ condition_type: 'item', condition_item: ['idol'], condition_operator: 'not_has' }),
      { type: 'item', itemId: 'idol', operator: 'not_has' }
    );
  });

  it('returns itemId null when left blank — the picker signal', () => {
    assert.equal(parseAddConditionFields({ condition_type: 'item' }).itemId, null);
    assert.equal(parseAddConditionFields({ condition_type: 'item', condition_item: [] }).itemId, null);
  });

  it('falls back to Item and Has on an empty submit', () => {
    assert.deepEqual(parseAddConditionFields({}), { type: 'item', itemId: null, operator: 'has' });
  });

  it('tolerates arrays as well as the strings radios actually send', () => {
    assert.equal(parseAddConditionFields({ condition_type: ['currency'] }).type, 'currency');
    assert.equal(parseAddConditionFields({ condition_operator: ['not_has'] }).operator, 'not_has');
  });

  it('builds an item condition matching the shape already in production', () => {
    // Real prod record: {"id":"cond_...","type":"item","operator":"has","logic":"AND","itemId":"..."}
    assert.deepEqual(
      buildConditionObject({ type: 'item', itemId: 'dndjrj_093480', operator: 'has' }, 1785663398537, 'q49gd'),
      { id: 'cond_1785663398537_q49gd', type: 'item', logic: 'AND', operator: 'has', itemId: 'dndjrj_093480' }
    );
  });

  it('builds a currency condition with the same defaults the old button produced', () => {
    // Real prod record: {"type":"currency","operator":"gte","value":20,"logic":"AND"}
    const c = buildConditionObject({ type: 'currency', itemId: null, operator: 'has' }, 1, 'x');
    assert.equal(c.type, 'currency');
    assert.equal(c.operator, 'gte');
    assert.equal(c.value, 0);
    assert.equal('itemId' in c, false, 'no stray itemId from the shared modal field');
  });

  it('omits itemId when the item was left blank, so the editor prompts for one', () => {
    const c = buildConditionObject({ type: 'item', itemId: null, operator: 'has' }, 1, 'x');
    assert.equal('itemId' in c, false);
    assert.equal(c.operator, 'has', 'the operator they chose still survives');
  });

  it('never leaks the item field into types that have no item', () => {
    for (const type of ['role', 'attribute_check', 'random_probability', 'd20_roll']) {
      const c = buildConditionObject({ type, itemId: 'leaked', operator: 'has' }, 1, 'x');
      assert.equal('itemId' in c, false, `${type} carries no itemId`);
    }
  });

  it('always stamps type, id and logic', () => {
    for (const t of CONDITION_TYPES) {
      const c = buildConditionObject({ type: t.value, itemId: null, operator: 'has' }, 1, 'x');
      assert.equal(c.type, t.value);
      assert.equal(c.logic, 'AND');
      assert.match(c.id, /^cond_/);
    }
  });
});
