/**
 * Safari Plan Schema — validation of LLM-proposed edit plans.
 *
 * This module is the SECURITY BOUNDARY for Ask CastBot Edit mode: every field the
 * model emits passes through validatePlan before preview and again inside the lock
 * at apply time. It gets the deepest coverage of the feature. The module is pure
 * (no I/O), so we import it directly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, describeOp, normalizeLimit, MAX_OPS_PER_PLAN } from '../safariPlanSchema.js';

/** Minimal guild fixture factory. */
function makeGuild({ items = {}, stores = {}, buttons = {}, coords = null } = {}) {
  const g = { items, stores, buttons, safariConfig: {} };
  if (coords) {
    g.maps = { active: 'map_test', map_test: { coordinates: Object.fromEntries(coords.map(c => [c, {}])) } };
  }
  return g;
}

const GRID25 = ['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','C1','C2','C3','C4','C5','D1','D2','D3','D4','D5','E1','E2','E3','E4','E5'];

const plan = (...ops) => ({ version: 1, summary: 't', ops });
const errText = (v) => v.errors.map(e => e.message).join(' | ');

describe('Plan schema — envelope', () => {
  it('rejects non-objects and empty plans', () => {
    assert.equal(validatePlan(null, {}).ok, false);
    assert.equal(validatePlan([], {}).ok, false);
    assert.equal(validatePlan({ ops: [] }, {}).ok, false);
  });

  it('rejects plans over the op cap', () => {
    const ops = Array.from({ length: MAX_OPS_PER_PLAN + 1 }, (_, i) => ({ op: 'create_item', name: `Item ${i}` }));
    const v = validatePlan({ ops }, makeGuild());
    assert.equal(v.ok, false);
    assert.match(errText(v), /maximum is 60/);
  });

  it('rejects unknown op types', () => {
    const v = validatePlan(plan({ op: 'drop_table' }), makeGuild());
    assert.equal(v.ok, false);
    assert.match(errText(v), /Unknown op type/);
  });
});

describe('Plan schema — refs (dependency mapping)', () => {
  it('accepts declare-then-use across store and item', () => {
    const v = validatePlan(plan(
      { op: 'create_store', ref: 'pokestore', name: 'Pokestore' },
      { op: 'create_item', ref: 'bulbasaur', name: 'Bulbasaur' },
      { op: 'stock_item', store: '$pokestore', item: '$bulbasaur', price: 100 }
    ), makeGuild());
    assert.equal(v.ok, true, errText(v));
  });

  it('rejects a ref used before it is declared', () => {
    const v = validatePlan(plan(
      { op: 'stock_item', store: '$pokestore', item: '$bulbasaur', price: 100 },
      { op: 'create_store', ref: 'pokestore', name: 'Pokestore' },
      { op: 'create_item', ref: 'bulbasaur', name: 'Bulbasaur' }
    ), makeGuild());
    assert.equal(v.ok, false);
    assert.match(errText(v), /declared by any earlier op/);
  });

  it('rejects an undeclared ref, a kind mismatch, and a duplicate declaration', () => {
    const undeclared = validatePlan(plan({ op: 'set_stock', store: '$ghost', item: '$ghost2', stock: 1 }), makeGuild());
    assert.equal(undeclared.ok, false);

    const mismatch = validatePlan(plan(
      { op: 'create_item', ref: 'thing', name: 'Thing' },
      { op: 'stock_item', store: '$thing', item: '$thing', price: 1 }
    ), makeGuild());
    assert.match(errText(mismatch), /is a item, but "store" needs a store/);

    const dup = validatePlan(plan(
      { op: 'create_item', ref: 'x', name: 'A' },
      { op: 'create_item', ref: 'x', name: 'B' }
    ), makeGuild());
    assert.match(errText(dup), /declared twice/);
  });

  it('hard-rejects prototype-chain aliases as refs and entity names (pollution guard)', () => {
    // g.items['__proto__'] is TRUTHY via the prototype chain — without the hasOwn +
    // reserved-key guards, update_item would Object.assign onto Object.prototype.
    const g = makeGuild({ items: { real_1: { id: 'real_1', name: 'Real' } } });
    for (const evil of ['__proto__', 'constructor', 'prototype']) {
      const asTarget = validatePlan(plan({ op: 'update_item', item: evil, set: { basePrice: 1 } }), g);
      assert.equal(asTarget.ok, false, `"${evil}" as an entity reference must be rejected`);
      const asRef = validatePlan(plan({ op: 'create_item', ref: evil, name: 'X' }), g);
      assert.equal(asRef.ok, false, `"${evil}" as a ref must be rejected`);
    }
    // And nothing was polluted by running the validator.
    assert.equal({}.basePrice, undefined);
  });

  it('resolves plain strings by exact id, then unique name; ambiguity and misses are errors', () => {
    const g = makeGuild({
      items: {
        sword_1: { id: 'sword_1', name: 'Sword' },
        blade_1: { id: 'blade_1', name: 'Twin' },
        blade_2: { id: 'blade_2', name: 'twin' }
      },
      stores: { shop_1: { id: 'shop_1', name: 'Shop', items: [] } }
    });
    assert.equal(validatePlan(plan({ op: 'stock_item', store: 'shop_1', item: 'sword_1', price: 5 }), g).ok, true);
    assert.equal(validatePlan(plan({ op: 'stock_item', store: 'Shop', item: 'Sword', price: 5 }), g).ok, true);

    const ambiguous = validatePlan(plan({ op: 'stock_item', store: 'Shop', item: 'Twin', price: 5 }), g);
    assert.match(errText(ambiguous), /ambiguous/);

    const missing = validatePlan(plan({ op: 'stock_item', store: 'Shop', item: 'Pokeball', price: 5 }), g);
    assert.match(errText(missing), /No item named "Pokeball"/);
  });
});

describe('Plan schema — items and limits', () => {
  it('enforces name length and duplicate names (existing and in-plan, case-insensitive)', () => {
    const g = makeGuild({ items: { dog_1: { id: 'dog_1', name: 'Dog' } } });
    assert.equal(validatePlan(plan({ op: 'create_item', name: 'x'.repeat(81) }), g).ok, false);
    assert.match(errText(validatePlan(plan({ op: 'create_item', name: 'dog' }), g)), /already exists/);
    const inPlan = validatePlan(plan(
      { op: 'create_item', name: 'Cat' },
      { op: 'create_item', name: 'CAT' }
    ), g);
    assert.match(errText(inPlan), /already exists/);
  });

  it('projects guild count limits including in-plan creates', () => {
    const items = Object.fromEntries(Array.from({ length: 199 }, (_, i) => [`i${i}`, { id: `i${i}`, name: `I${i}` }]));
    const v = validatePlan(plan(
      { op: 'create_item', name: 'Fits' },
      { op: 'create_item', name: 'Overflows' }
    ), makeGuild({ items }));
    assert.equal(v.ok, false);
    assert.match(errText(v), /item limit/);
  });

  it('validates numeric ranges', () => {
    const v = validatePlan(plan({ op: 'create_item', name: 'Pricey', basePrice: -5 }), makeGuild());
    assert.match(errText(v), /basePrice/);
    assert.equal(validatePlan(plan({ op: 'create_item', name: 'OK', basePrice: 0, staminaBoost: 10 }), makeGuild()).ok, true);
  });
});

describe('Plan schema — stores and stock', () => {
  it('rejects stocking a full store and double-stocking', () => {
    const links = Array.from({ length: 23 }, (_, i) => ({ itemId: `i${i}`, price: 1 }));
    const g = makeGuild({
      items: { extra_1: { id: 'extra_1', name: 'Extra' }, i0: { id: 'i0', name: 'Zero' } },
      stores: { full_1: { id: 'full_1', name: 'Full', items: links } }
    });
    assert.match(errText(validatePlan(plan({ op: 'stock_item', store: 'full_1', item: 'extra_1', price: 1 }), g)), /full/);
    assert.match(errText(validatePlan(plan({ op: 'stock_item', store: 'full_1', item: 'i0', price: 1 }), g)), /already stocked/);
  });

  it('price is optional, and an explicit price change on an existing item raises a warning (game has no per-store prices)', () => {
    const g = makeGuild({
      items: { ball_1: { id: 'ball_1', name: 'Ball', basePrice: 99 } },
      stores: { s_1: { id: 's_1', name: 'S', items: [] } }
    });
    const noPrice = validatePlan(plan({ op: 'stock_item', store: 's_1', item: 'ball_1' }), g);
    assert.equal(noPrice.ok, true, errText(noPrice));
    const repriced = validatePlan(plan({ op: 'stock_item', store: 's_1', item: 'ball_1', price: 10 }), g);
    assert.equal(repriced.ok, true, errText(repriced));
    assert.ok(repriced.warnings.some(w => /everywhere it's sold/.test(w)), 'expected the price-change warning');
  });

  it('set_stock requires the item to be stocked (existing or earlier in plan)', () => {
    const g = makeGuild({
      items: { a_1: { id: 'a_1', name: 'A' } },
      stores: { s_1: { id: 's_1', name: 'S', items: [] } }
    });
    assert.match(errText(validatePlan(plan({ op: 'set_stock', store: 's_1', item: 'a_1', stock: 5 }), g)), /not stocked/);
    const chained = validatePlan(plan(
      { op: 'stock_item', store: 's_1', item: 'a_1', price: 1 },
      { op: 'set_stock', store: 's_1', item: 'a_1', stock: 5 }
    ), g);
    assert.equal(chained.ok, true, errText(chained));
  });
});

describe('Plan schema — config', () => {
  it('whitelists config keys and validates the starting coordinate against the map', () => {
    const g = makeGuild({ coords: GRID25 });
    assert.match(errText(validatePlan(plan({ op: 'update_config', set: { currentRound: 2 } }), g)), /cannot change "currentRound"/);
    assert.equal(validatePlan(plan({ op: 'update_config', set: { currencyName: 'Diamonds', currencyEmoji: '💎' } }), g).ok, true);
    assert.match(errText(validatePlan(plan({ op: 'update_config', set: { defaultStartingCoordinate: 'Z9' } }), g)), /not on the active map/);
  });
});

describe('Plan schema — actions', () => {
  const g = () => makeGuild({ coords: GRID25, items: { key_1: { id: 'key_1', name: 'Key' } } });
  const outcome = { type: 'display_text', config: { content: 'Hello' } };

  it('accepts the "Get Money on A1-A8, once per 12h" shape and normalizes the limit', () => {
    const v = validatePlan(plan({
      op: 'create_action', name: 'Get Money', style: 'Success',
      trigger: { type: 'button' },
      coordinates: ['a1', 'A2', 'A3', 'A4', 'A5'],
      outcomes: [{ type: 'give_currency', config: { amount: 5, limit: { once: 'per_period', hours: 12 } } }]
    }), g());
    assert.equal(v.ok, true, errText(v));
    const op = v.ops[0];
    assert.deepEqual(op.coordinates.slice(0, 2), ['A1', 'A2']); // uppercased
    assert.deepEqual(op.outcomes[0].config.limit, { type: 'once_per_period', periodMs: 43200000, claimedBy: {} });
  });

  it('normalizes per_player and globally limit sugar to the stored shapes', () => {
    const errs = [];
    const err = (i, m) => errs.push(m);
    assert.deepEqual(normalizeLimit({ once: 'per_player' }, 0, err), { type: 'once_per_player', claimedBy: [] });
    assert.deepEqual(normalizeLimit({ once: 'globally' }, 0, err), { type: 'once_globally', claimedBy: null });
    assert.equal(normalizeLimit(undefined, 0, err), undefined);
    assert.equal(errs.length, 0);
  });

  it('requires phrases for command triggers and caps outcomes at 6', () => {
    const noPhrases = validatePlan(plan({
      op: 'create_action', name: 'Talk', trigger: { type: 'modal' }, outcomes: [outcome]
    }), g());
    assert.match(errText(noPhrases), /phrases/);

    const seven = validatePlan(plan({
      op: 'create_action', name: 'Busy', trigger: { type: 'button' },
      outcomes: Array.from({ length: 7 }, () => outcome)
    }), g());
    assert.match(errText(seven), /outcomes/);
  });

  it('rejects off-map coordinates but accepts "global"', () => {
    const bad = validatePlan(plan({
      op: 'create_action', name: 'Nope', trigger: { type: 'button' }, coordinates: ['Z9'], outcomes: [outcome]
    }), g());
    assert.match(errText(bad), /not on the active map/);

    const global = validatePlan(plan({
      op: 'create_action', name: 'Anywhere', trigger: { type: 'button' }, coordinates: ['global'], outcomes: [outcome]
    }), g());
    assert.equal(global.ok, true, errText(global));
  });

  it('resolves item refs inside outcomes and conditions', () => {
    const v = validatePlan(plan(
      { op: 'create_item', ref: 'coin', name: 'Coin' },
      {
        op: 'create_action', name: 'Trade', trigger: { type: 'button' },
        conditions: [{ type: 'item', operator: 'has', item: 'Key', quantity: 1 }],
        outcomes: [{ type: 'give_item', config: { item: '$coin', quantity: 2 } }]
      }
    ), g());
    assert.equal(v.ok, true, errText(v));
    assert.equal(v.ops[1].conditions[0].itemId, 'key_1');
    assert.equal(v.ops[1].outcomes[0].config.itemId, '$coin');
    assert.equal(v.ops[1].outcomes[0].config.operation, 'give');
  });

  it('flags role-granting outcomes as warnings and validates schedule is unsupported', () => {
    const v = validatePlan(plan({
      op: 'create_action', name: 'Crown', trigger: { type: 'button' },
      outcomes: [{ type: 'give_role', config: { roleId: '123456789012345678' } }]
    }), g());
    assert.equal(v.ok, true, errText(v));
    assert.ok(v.warnings.some(w => /role/.test(w)));

    const sched = validatePlan(plan({
      op: 'create_action', name: 'Later', trigger: { type: 'schedule' }, outcomes: [outcome]
    }), g());
    assert.match(errText(sched), /schedule is not supported/);
  });

  it('add_outcome projects the 6-outcome cap over existing outcomes', () => {
    const guild = makeGuild({
      buttons: { act_1: { id: 'act_1', name: 'Act', actions: [1, 2, 3, 4, 5].map(() => outcome) } }
    });
    const v = validatePlan(plan(
      { op: 'add_outcome', action: 'act_1', outcome },
      { op: 'add_outcome', action: 'act_1', outcome }
    ), guild);
    assert.equal(v.ok, false);
    assert.match(errText(v), /exceed 6 outcomes/);
  });
});

describe('Plan schema — player ops', () => {
  it('validates player IDs and non-zero bounded amounts', () => {
    assert.match(errText(validatePlan(plan({ op: 'give_currency', playerId: 'bob', amount: 5 }), makeGuild())), /not a Discord user ID/);
    assert.match(errText(validatePlan(plan({ op: 'give_currency', playerId: '391415444084490240', amount: 0 }), makeGuild())), /non-zero/);
    const v = validatePlan(plan({ op: 'give_currency', playerId: ['391415444084490240'], amount: -50 }), makeGuild());
    assert.equal(v.ok, true, errText(v));
  });

  it('warns (not errors) about players with no record yet', () => {
    const v = validatePlan(plan({ op: 'give_currency', playerId: '391415444084490240', amount: 5 }), makeGuild(), {});
    assert.equal(v.ok, true);
    assert.ok(v.warnings.some(w => /no record/.test(w)));
  });
});

describe('Plan schema — describeOp preview lines', () => {
  it('renders stable lines with resolved names', () => {
    const g = makeGuild({ coords: GRID25 });
    const v = validatePlan(plan(
      { op: 'create_store', ref: 'pokestore', name: 'Pokestore' },
      { op: 'create_item', ref: 'bulbasaur', name: 'Bulbasaur' },
      { op: 'stock_item', store: '$pokestore', item: '$bulbasaur', price: 15 }
    ), g);
    const names = { '$pokestore': 'Pokestore', '$bulbasaur': 'Bulbasaur' };
    assert.equal(describeOp(v.ops[0], names), '🏪 Create store **Pokestore**');
    assert.equal(describeOp(v.ops[2], names), '📦 Stock **Bulbasaur** in **Pokestore** @ 15');
  });

  it('renders coordinates as clickable channel mentions when the cell has a channel', () => {
    const g = makeGuild({ coords: GRID25 });
    const v = validatePlan(plan({
      op: 'create_action', name: 'Stray Dog', trigger: { type: 'button' }, coordinates: ['A1', 'A2'],
      outcomes: [{ type: 'display_text', config: { content: 'Woof' } }]
    }), g);
    assert.equal(v.ok, true, errText(v));
    const withChannels = describeOp(v.ops[0], {}, { A1: '1528027201767739392' });
    assert.ok(withChannels.includes('<#1528027201767739392>'), withChannels); // A1 has a channel
    assert.ok(withChannels.includes('A2'), withChannels);                     // A2 falls back to the plain coord
    const without = describeOp(v.ops[0], {});
    assert.ok(without.includes('@ A1, A2'), without);
  });
});
