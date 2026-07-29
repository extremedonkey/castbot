/**
 * Safari Plan Applier — pure in-memory mutators, on fixtures.
 *
 * The mutators are no-throw by contract (validatePlan rejects everything they could
 * choke on) and replicate the mutation shapes of createItem / createStore /
 * createCustomButton / the app.js stock inline. These tests pin those shapes so a
 * drift from the real writers is a loud failure. The lock choreography itself
 * (applyPlan) is I/O and is exercised by the click-test scenarios, not here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeEntityId, ensureGuildShape, applySafariOp, applyPlayerOp
} from '../safariPlanApplier.js';
import { validatePlan } from '../safariPlanSchema.js';

const NOW = 1753776000000;

function newSummary() {
  return { lines: [], created: { items: 0, stores: 0, actions: 0 }, safariMutations: 0, playerMutations: 0, warnings: [], anchorCoords: new Set(), anchorsRefreshed: 0, snapshot: null };
}

/** Validate a raw plan against a guild and return normalized ops (throws on invalid). */
function normalize(rawOps, guild) {
  const v = validatePlan({ version: 1, ops: rawOps }, guild);
  assert.equal(v.ok, true, v.errors.map(e => e.message).join(' | '));
  return v.ops;
}

function freshData(guildExtras = {}) {
  const data = { g1: {} };
  ensureGuildShape(data, 'g1');
  Object.assign(data.g1, guildExtras);
  return data;
}

describe('Applier — makeEntityId', () => {
  it('slugs like generateButtonId and belts collisions', () => {
    const id = makeEntityId('Get Money!', {}, NOW);
    assert.equal(id, `get_money_${String(NOW).slice(-6)}`);
    const existing = { [id]: true };
    assert.equal(makeEntityId('Get Money!', existing, NOW), `${id}_2`);
    existing[`${id}_2`] = true;
    assert.equal(makeEntityId('Get Money!', existing, NOW), `${id}_3`);
  });

  it('never returns an empty slug', () => {
    assert.match(makeEntityId('!!!', {}, NOW), /^entity_/);
  });
});

describe('Applier — create_item / create_store shapes', () => {
  it('creates an item with house defaults, metadata, and refMap entry', () => {
    const data = freshData();
    const [op] = normalize([{ op: 'create_item', ref: 'dog', name: 'Dog', emoji: '🐕', basePrice: 50 }], data.g1);
    const refMap = {}, summary = newSummary();
    applySafariOp(data, 'g1', op, refMap, summary, { userId: 'u1', now: NOW });

    const itemId = refMap.dog;
    const item = data.g1.items[itemId];
    assert.equal(item.name, 'Dog');
    assert.equal(item.emoji, '🐕');
    assert.equal(item.basePrice, 50);
    assert.equal(item.maxQuantity, -1);
    assert.equal(item.consumable, 'No');
    assert.equal(item.attackValue, null);
    assert.equal(item.metadata.createdBy, 'u1');
    assert.equal(item.metadata.createdVia, 'askcb_edit');
    assert.equal(summary.created.items, 1);
  });

  it('creates a store with the settings block createStore writes', () => {
    const data = freshData();
    const [op] = normalize([{ op: 'create_store', ref: 's', name: 'Pokestore', storeownerText: 'Hi!' }], data.g1);
    const refMap = {}, summary = newSummary();
    applySafariOp(data, 'g1', op, refMap, summary, { userId: 'u1', now: NOW });

    const store = data.g1.stores[refMap.s];
    assert.deepEqual(store.items, []);
    assert.equal(store.settings.storeownerText, 'Hi!');
    assert.equal(store.settings.accentColor, 0x2ecc71);
    assert.equal(store.settings.requiresRole, null);
    assert.equal(store.metadata.totalSales, 0);
  });
});

describe('Applier — stocking', () => {
  it('pushes the {itemId, price, addedAt} link (+stock only when finite); explicit price SETS item.basePrice', () => {
    const guild = {
      items: { ball_1: { id: 'ball_1', name: 'Ball', basePrice: 99 }, bat_1: { id: 'bat_1', name: 'Bat', basePrice: 7 } },
      stores: { shop_1: { id: 'shop_1', name: 'Shop', items: [] } }
    };
    const data = freshData(guild);
    const ops = normalize([
      { op: 'stock_item', store: 'shop_1', item: 'ball_1', price: 10 },
      { op: 'stock_item', store: 'shop_1', item: 'bat_1', stock: 3 } // no price → keeps basePrice
    ], data.g1);
    const summary = newSummary();
    for (const op of ops) applySafariOp(data, 'g1', op, {}, summary, { userId: 'u1', now: NOW });

    const [ball, bat] = data.g1.stores.shop_1.items;
    assert.deepEqual(ball, { itemId: 'ball_1', price: 10, addedAt: NOW });
    // The game charges item.basePrice everywhere — an explicit plan price must land there.
    assert.equal(data.g1.items.ball_1.basePrice, 10);
    assert.equal(bat.price, 7); // link mirrors the item's existing price
    assert.equal(data.g1.items.bat_1.basePrice, 7); // untouched without an explicit price
    assert.equal(bat.stock, 3);
  });

  it('set_stock mutates the existing link, -1 meaning unlimited', () => {
    const data = freshData({
      items: { ball_1: { id: 'ball_1', name: 'Ball' } },
      stores: { shop_1: { id: 'shop_1', name: 'Shop', items: [{ itemId: 'ball_1', price: 10, addedAt: 1, stock: 3 }] } }
    });
    const [op] = normalize([{ op: 'set_stock', store: 'shop_1', item: 'ball_1', stock: -1 }], data.g1);
    applySafariOp(data, 'g1', op, {}, newSummary(), { now: NOW });
    assert.equal(data.g1.stores.shop_1.items[0].stock, -1);
  });
});

describe('Applier — update_config', () => {
  it('touches only the validated keys', () => {
    const data = freshData({ safariConfig: { currencyName: 'Dollars', currentRound: 2 } });
    const [op] = normalize([{ op: 'update_config', set: { currencyName: 'Diamonds', currencyEmoji: '💎' } }], data.g1);
    applySafariOp(data, 'g1', op, {}, newSummary(), { now: NOW });
    assert.equal(data.g1.safariConfig.currencyName, 'Diamonds');
    assert.equal(data.g1.safariConfig.currencyEmoji, '💎');
    assert.equal(data.g1.safariConfig.currentRound, 2); // untouched
  });
});

describe('Applier — create_action', () => {
  const mapGuild = () => ({
    maps: { active: 'm1', m1: { coordinates: { A1: {}, A2: {} } } }
  });

  it('builds the stored action shape: trigger.button, ordered outcomes, flat conditions', () => {
    const data = freshData(mapGuild());
    const [op] = normalize([{
      op: 'create_action', ref: 'gm', name: 'Get Money', style: 'Success',
      trigger: { type: 'button' },
      coordinates: ['A1', 'A2'],
      outcomes: [
        { type: 'display_text', config: { content: 'Cha-ching' }, executeOn: 'always' },
        { type: 'give_currency', config: { amount: 5, limit: { once: 'per_period', hours: 12 } } }
      ]
    }], data.g1);
    const refMap = {}, summary = newSummary();
    applySafariOp(data, 'g1', op, refMap, summary, { userId: 'u1', now: NOW });

    const action = data.g1.buttons[refMap.gm];
    assert.equal(action.label, 'Get Money');
    assert.deepEqual(action.trigger, { type: 'button', button: { label: 'Get Money', emoji: null, style: 'Success' } });
    assert.equal(action.actions[0].order, 0);
    assert.equal(action.actions[1].order, 1);
    assert.deepEqual(action.actions[1].config.limit, { type: 'once_per_period', periodMs: 43200000, claimedBy: {} });
    // bidirectional attach
    assert.deepEqual(action.coordinates, ['A1', 'A2']);
    assert.deepEqual(data.g1.maps.m1.coordinates.A1.buttons, [refMap.gm]);
    assert.deepEqual([...summary.anchorCoords], ['A1', 'A2']);
  });

  it('builds the modal (command) trigger shape with keywords block and phrases', () => {
    const data = freshData();
    const [op] = normalize([{
      op: 'create_action', name: 'Inspect', trigger: { type: 'modal', phrases: ['Inspect Waterfall'] },
      outcomes: [{ type: 'display_text', config: { content: 'Wet.' } }]
    }], data.g1);
    const refMap = {};
    applySafariOp(data, 'g1', op, refMap, newSummary(), { userId: 'u1', now: NOW });
    const action = Object.values(data.g1.buttons)[0];
    assert.deepEqual(action.trigger.modal, { keywords: [], caseSensitive: false });
    assert.deepEqual(action.trigger.phrases, ['inspect waterfall']); // lowercased by the validator
  });

  it('resolves $refs inside give_item outcome configs at apply time', () => {
    const data = freshData(mapGuild());
    const ops = normalize([
      { op: 'create_item', ref: 'coin', name: 'Coin' },
      {
        op: 'create_action', name: 'Dig', trigger: { type: 'button' }, coordinates: ['A1'],
        outcomes: [{ type: 'give_item', config: { item: '$coin', quantity: 2 } }]
      }
    ], data.g1);
    const refMap = {}, summary = newSummary();
    for (const op of ops) applySafariOp(data, 'g1', op, refMap, summary, { userId: 'u1', now: NOW });
    const action = Object.values(data.g1.buttons)[0];
    assert.equal(action.actions[0].config.itemId, refMap.coin); // real id, not "$coin"
  });

  it('add_outcome continues the order sequence; attach_action is bidirectional and NEVER persists "global"', () => {
    const data = freshData({
      buttons: { act_1: { id: 'act_1', name: 'Act', actions: [{ type: 'display_text', order: 0, config: {} }], coordinates: [] } },
      maps: { active: 'm1', m1: { coordinates: { A1: {} } } }
    });
    const ops = normalize([
      { op: 'add_outcome', action: 'act_1', outcome: { type: 'give_currency', config: { amount: 1 } } },
      { op: 'attach_action', action: 'act_1', coordinates: ['A1', 'global'] }
    ], data.g1);
    const summary = newSummary();
    for (const op of ops) applySafariOp(data, 'g1', op, {}, summary, { now: NOW });
    const action = data.g1.buttons.act_1;
    assert.equal(action.actions[1].order, 1);
    // House convention: empty/absent coordinates = global. 'global' in the stored array
    // would seed a phantom coordinates['global'] map cell via the legacy sync flows.
    assert.deepEqual(action.coordinates, ['A1']);
    assert.deepEqual(data.g1.maps.m1.coordinates.A1.buttons, ['act_1']);
  });

  it('create_action with only "global" coordinates stores an EMPTY coordinates array', () => {
    const data = freshData();
    const [op] = normalize([{
      op: 'create_action', ref: 'g', name: 'Anywhere', trigger: { type: 'button' },
      coordinates: ['global'],
      outcomes: [{ type: 'display_text', config: { content: 'Hi' } }]
    }], data.g1);
    const refMap = {};
    applySafariOp(data, 'g1', op, refMap, newSummary(), { userId: 'u1', now: NOW });
    assert.deepEqual(data.g1.buttons[refMap.g].coordinates, []);
  });
});

describe('Applier — create_recipe (crafting)', () => {
  it('builds the quickActionCreate crafting shape: has-item conditions, remove/remove/give outcomes, crafting_menu', () => {
    const data = freshData({ items: {
      dog_1: { id: 'dog_1', name: 'Dog' }, cat_1: { id: 'cat_1', name: 'Cat' }, cd_1: { id: 'cd_1', name: 'Catdog' }
    }});
    const [op] = normalize([{
      op: 'create_recipe', name: 'Fuse Catdog', inputs: ['dog_1', 'cat_1'], output: { item: 'cd_1' }
    }], data.g1);
    const refMap = {}, summary = newSummary();
    applySafariOp(data, 'g1', op, refMap, summary, { userId: 'u1', now: NOW });

    const action = Object.values(data.g1.buttons)[0];
    assert.equal(action.menuVisibility, 'crafting_menu');
    assert.equal(action.style, 'Secondary');
    assert.deepEqual(action.conditions.map(c => [c.type, c.operator, c.itemId, c.quantity, c.logic]),
      [['item', 'has', 'dog_1', 1, 'AND'], ['item', 'has', 'cat_1', 1, 'AND']]);
    assert.deepEqual(action.actions.map(o => [o.config.itemId, o.config.quantity, o.config.operation, o.order]),
      [['dog_1', 1, 'remove', 0], ['cat_1', 1, 'remove', 1], ['cd_1', 1, 'give', 2]]);
    assert.deepEqual(action.coordinates, []); // crafting lives in the menu, not on the map
  });

  it('merges a duplicated input into quantity 2 (two dogs → one catdog)', () => {
    const data = freshData({ items: { dog_1: { id: 'dog_1', name: 'Dog' }, cd_1: { id: 'cd_1', name: 'Catdog' } } });
    const [op] = normalize([{
      op: 'create_recipe', name: 'Double Dog', inputs: ['dog_1', 'dog_1'], output: 'cd_1'
    }], data.g1);
    applySafariOp(data, 'g1', op, {}, newSummary(), { userId: 'u1', now: NOW });
    const action = Object.values(data.g1.buttons)[0];
    assert.deepEqual(action.conditions.map(c => [c.itemId, c.quantity]), [['dog_1', 2]]);
    assert.deepEqual(action.actions.map(o => [o.config.itemId, o.config.quantity, o.config.operation]),
      [['dog_1', 2, 'remove'], ['cd_1', 1, 'give']]);
  });

  it('resolves $refs so items created in the same plan can be crafted', () => {
    const data = freshData();
    const ops = normalize([
      { op: 'create_item', ref: 'dog', name: 'Dog' },
      { op: 'create_item', ref: 'cat', name: 'Cat' },
      { op: 'create_item', ref: 'catdog', name: 'Catdog' },
      { op: 'create_recipe', name: 'Fuse', inputs: ['$dog', '$cat'], output: { item: '$catdog' } }
    ], data.g1);
    const refMap = {}, summary = newSummary();
    for (const op of ops) applySafariOp(data, 'g1', op, refMap, summary, { userId: 'u1', now: NOW });
    const action = Object.values(data.g1.buttons)[0];
    assert.equal(action.actions.at(-1).config.itemId, refMap.catdog);
    assert.equal(action.conditions[0].itemId, refMap.dog);
  });
});

describe('Applier — create_enemy + fight_enemy (Quick Enemy parity)', () => {
  it('creates the enemy shape and wires fight_enemy by $ref, defaulting executeOn to always', () => {
    const data = freshData({ maps: { active: 'm1', m1: { coordinates: { A1: {} } } } });
    const ops = normalize([
      { op: 'create_enemy', ref: 'bear', name: 'Grizzly', emoji: '🐻', hp: 30, attackValue: 5 },
      {
        op: 'create_action', name: 'Fight the bear', trigger: { type: 'button' }, coordinates: ['A1'],
        outcomes: [{ type: 'fight_enemy', config: { enemy: '$bear' } }]
      }
    ], data.g1);
    const refMap = {}, summary = newSummary();
    for (const op of ops) applySafariOp(data, 'g1', op, refMap, summary, { userId: 'u1', now: NOW });

    const enemy = data.g1.enemies[refMap.bear];
    assert.equal(enemy.name, 'Grizzly');
    assert.equal(enemy.hp, 30);
    assert.equal(enemy.attackValue, 5);
    assert.equal(enemy.turnOrder, 'player_first');
    const outcome = Object.values(data.g1.buttons)[0].actions[0];
    assert.equal(outcome.config.enemyId, refMap.bear); // resolved, not "$bear"
    assert.equal(outcome.executeOn, 'always');         // Quick Enemy convention
  });

  it('resolves an existing enemy by name', () => {
    const data = freshData({ enemies: { orc_1: { id: 'orc_1', name: 'Orc', hp: 5, attackValue: 2 } } });
    const [op] = normalize([{
      op: 'create_action', name: 'Ambush', trigger: { type: 'button' },
      outcomes: [{ type: 'fight_enemy', config: { enemy: 'Orc' } }]
    }], data.g1);
    applySafariOp(data, 'g1', op, {}, newSummary(), { userId: 'u1', now: NOW });
    assert.equal(Object.values(data.g1.buttons)[0].actions[0].config.enemyId, 'orc_1');
  });
});

describe('Applier — player ops', () => {
  it('give_currency initializes safari, applies the delta, and floors at 0', () => {
    const playerData = { g1: { players: {} } };
    const [op] = normalize([{ op: 'give_currency', playerId: '391415444084490240', amount: -50 }], {});
    applyPlayerOp(playerData, 'g1', op, {}, newSummary(), { now: NOW });
    const safari = playerData.g1.players['391415444084490240'].safari;
    assert.equal(safari.currency, 0); // 0 - 50 floors at 0, same as updateCurrency
    assert.deepEqual(safari.inventory, {});
  });

  it('give_item uses object format and tracks numAttacksAvailable for attack items', () => {
    const playerData = { g1: { players: { p1: { safari: { currency: 5, inventory: { sword_1: 2 } } } } } };
    const guildItems = { sword_1: { id: 'sword_1', name: 'Sword', attackValue: 3 } };
    const [op] = normalize([{ op: 'give_item', playerId: ['123456789012345678'], item: 'sword_1', quantity: 2 }],
      { items: guildItems });
    // to p1 via a second run — legacy numeric entry conversion
    const [opP1] = normalize([{ op: 'give_item', playerId: ['987654321098765432'], item: 'sword_1', quantity: 1 }],
      { items: guildItems });

    applyPlayerOp(playerData, 'g1', op, {}, newSummary(), { guildItems, now: NOW });
    const fresh = playerData.g1.players['123456789012345678'].safari.inventory.sword_1;
    assert.equal(fresh.quantity, 2);
    assert.equal(fresh.numAttacksAvailable, 2);
    assert.equal(fresh.firstObtained, NOW);

    // legacy number entry converts to object format and accumulates
    playerData.g1.players['987654321098765432'] = { safari: { currency: 0, inventory: { sword_1: 4 } } };
    applyPlayerOp(playerData, 'g1', opP1, {}, newSummary(), { guildItems, now: NOW });
    const converted = playerData.g1.players['987654321098765432'].safari.inventory.sword_1;
    assert.equal(converted.quantity, 5);
  });
});
