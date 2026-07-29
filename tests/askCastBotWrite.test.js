/**
 * Ask CastBot Edit mode — plan extraction, gates, cache, digest, preview plumbing.
 *
 * askCastBotWrite.js has no top-level side effects, so we import the real module.
 * hasSafariEditAccess is only exercised on its env-gate short-circuit path here —
 * the entitlement branch would lazily seed entitlements.json on disk, which a unit
 * test must not do. (The full gate is covered by the click-test scenarios.)
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPlan, isAdminMember, hasSafariEditAccess,
  rememberPlan, recallPlan, consumePlan, recallWriteExchange,
  formatGuildDigest, buildNameMap, buildEditModal, buildPreviewMessages
} from '../askCastBotWrite.js';

const withEnv = async (vars, fn) => {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { await fn(); } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
};

describe('Edit mode — extractPlan', () => {
  it('returns the reply untouched when there is no plan block', () => {
    const { reply, planJson, parseError } = extractPlan('Just an answer.');
    assert.equal(reply, 'Just an answer.');
    assert.equal(planJson, null);
    assert.equal(parseError, null);
  });

  it('extracts the block and strips it from the reply', () => {
    const text = 'Here is the plan.\n```castbot-plan\n{"version":1,"ops":[{"op":"create_item","name":"Dog"}]}\n```';
    const { reply, planJson } = extractPlan(text);
    assert.equal(reply, 'Here is the plan.');
    assert.equal(planJson.ops[0].name, 'Dog');
  });

  it('takes the LAST block when the model drafts several, stripping all of them', () => {
    const text = 'Draft:\n```castbot-plan\n{"ops":[{"op":"create_item","name":"Draft"}]}\n```\nFinal:\n```castbot-plan\n{"ops":[{"op":"create_item","name":"Final"}]}\n```';
    const { reply, planJson } = extractPlan(text);
    assert.equal(planJson.ops[0].name, 'Final');
    assert.ok(!reply.includes('castbot-plan'));
  });

  it('reports malformed JSON without throwing', () => {
    const { planJson, parseError } = extractPlan('```castbot-plan\n{oops}\n```');
    assert.equal(planJson, null);
    assert.match(parseError, /valid JSON/);
  });
});

describe('Edit mode — isAdminMember (the four admin bits)', () => {
  const withBit = (bit) => ({ permissions: String(1n << bit) });
  it('accepts each of ManageChannels/ManageGuild/ManageRoles/Administrator', () => {
    for (const bit of [4n, 5n, 28n, 3n]) {
      assert.equal(isAdminMember(withBit(bit)), true, `bit ${bit}`);
    }
  });
  it('rejects members without any admin bit, missing members, and garbage', () => {
    assert.equal(isAdminMember(withBit(11n)), false); // SEND_MESSAGES only
    assert.equal(isAdminMember(null), false);
    assert.equal(isAdminMember({}), false);
    assert.equal(isAdminMember({ permissions: 'not-a-number' }), false);
  });
});

describe('Edit mode — environment gate short-circuit', () => {
  it('denies on prod without the opt-in before ever touching entitlements', async () => {
    await withEnv({ PRODUCTION: 'TRUE', CLAUDE_PROD_FEATURES: undefined }, async () => {
      assert.equal(await hasSafariEditAccess({ guildId: '123', member: { permissions: String(1n << 3n) } }), false);
    });
  });
});

describe('Edit mode — plan cache (one-shot, TTL, cap)', () => {
  afterEach(() => { global.askCastBotPlans = undefined; });

  it('consume is one-shot', () => {
    rememberPlan('p1', { plan: {}, guildId: 'g', userId: 'u' });
    assert.ok(consumePlan('p1'));
    assert.equal(consumePlan('p1'), null);
  });

  it('expires entries after the TTL', () => {
    rememberPlan('p2', { plan: {}, guildId: 'g', userId: 'u' });
    global.askCastBotPlans.get('p2').createdAt = Date.now() - 31 * 60 * 1000;
    assert.equal(recallPlan('p2'), null);
  });

  it('evicts the oldest entry past the cap of 5', () => {
    for (let i = 0; i < 6; i++) rememberPlan(`c${i}`, { plan: {}, guildId: 'g', userId: 'u' });
    assert.equal(recallPlan('c0'), null);
    assert.ok(recallPlan('c5'));
  });

  it('recallWriteExchange surfaces query/reply/route for the Refine prefill', () => {
    rememberPlan('p3', { plan: null, guildId: 'g', userId: 'u', query: 'Q', reply: 'A', model: 'opus', isPublicRoute: true });
    assert.deepEqual(recallWriteExchange('p3'), { query: 'Q', reply: 'A', model: 'opus', isPublicRoute: true });
    assert.equal(recallWriteExchange(null), null);
  });
});

describe('Edit mode — guild digest', () => {
  it('handles an empty guild without throwing', () => {
    const digest = formatGuildDigest(null, null);
    assert.match(digest, /items 0\/200/);
    assert.match(digest, /ACTIVE MAP: none/);
  });

  it('renders entities as id — name lines and caps players at 50', () => {
    const guild = {
      safariConfig: { currencyName: 'Gold', currencyEmoji: '🪙' },
      items: { ball_1: { id: 'ball_1', name: 'Ball', emoji: '⚾', basePrice: 10 } },
      stores: { shop_1: { id: 'shop_1', name: 'Shop', items: [{ itemId: 'ball_1', price: 12 }] } },
      buttons: { act_1: { id: 'act_1', name: 'Dig', trigger: { type: 'button' }, coordinates: ['A1'], actions: [{ type: 'give_currency' }] } },
      maps: { active: 'm1', m1: { gridWidth: 5, gridHeight: 5, coordinates: { A1: {}, A2: {} } } }
    };
    const players = Object.fromEntries(Array.from({ length: 60 }, (_, i) =>
      [`${100000000000000000n + BigInt(i)}`, { displayName: `P${i}`, safari: { currency: i } }]));
    const digest = formatGuildDigest(guild, players);
    assert.match(digest, /currency "Gold" 🪙/);
    assert.match(digest, /ball_1 — Ball ⚾ · 10/);
    assert.match(digest, /shop_1 — Shop {2}· \[ball_1@12\]/);
    assert.match(digest, /act_1 — Dig · button · A1 · give_currency/);
    assert.match(digest, /\+10 more/); // 60 players, cap 50
  });
});

describe('Edit mode — preview plumbing', () => {
  it('buildNameMap resolves refs from create ops and ids from guild data', () => {
    const ops = [
      { op: 'create_store', ref: 'pokestore', fields: { name: 'Pokestore' } },
      { op: 'stock_item', store: '$pokestore', item: 'ball_1', price: 5 }
    ];
    const names = buildNameMap(ops, { items: { ball_1: { name: 'Ball' } } });
    assert.equal(names['$pokestore'], 'Pokestore');
    assert.equal(names['ball_1'], 'Ball');
  });

  it('buildEditModal encodes the route in the custom_id and prefills prior context', () => {
    assert.equal(buildEditModal().custom_id, 'askcb_edit_modal');
    assert.equal(buildEditModal(null, null, true).custom_id, 'askcb_editpub_modal');
    const modal = buildEditModal({ query: 'Q', reply: 'A', model: 'opus' }, 'abc');
    assert.equal(modal.custom_id, 'askcb_edit_modal_abc');
    const ctx = modal.components.find(c => c.component?.custom_id === 'askcb_prev_context');
    assert.match(ctx.component.value, /^Q: Q/);
  });

  it('buildPreviewMessages numbers ops and wires Apply/Refine/Cancel to the plan id', () => {
    const ops = [{ op: 'create_item', fields: { name: 'Dog' } }];
    const { main, followUps } = buildPreviewMessages({ reply: 'Plan!', ops, names: {}, warnings: ['check me'], planId: 'zz1', elapsed: '5s', model: 'sonnet' });
    const row = main.components.at(-1);
    assert.deepEqual(row.components.map(b => b.custom_id),
      ['askcb_plan_apply_zz1', 'askcb_edit_ctx_zz1', 'askcb_plan_cancel_zz1']);
    assert.equal(row.components[0].style, 4); // Apply is Danger
    const text = JSON.stringify(main);
    assert.match(text, /1\. 🆕 Create item \*\*Dog\*\*/);
    assert.match(text, /check me/);
    assert.match(text, /Nothing has been changed yet/);
    assert.deepEqual(followUps, []);
  });

  it('buildPreviewMessages keeps every message under the combined 4000-char cap, spilling to follow-ups', () => {
    // 60 ops with long names — the exact shape Discord rejected in review finding "4000-char combined".
    const ops = Array.from({ length: 60 }, (_, i) => ({ op: 'create_item', fields: { name: `A very long pokemon item name number ${i} with extra padding text` } }));
    const { main, followUps } = buildPreviewMessages({ reply: 'x'.repeat(900), ops, names: {}, warnings: [], planId: 'zz2', elapsed: '5s', model: 'sonnet' });
    const textChars = (container) => container.components
      .filter(c => c.type === 10)
      .reduce((sum, c) => sum + c.content.length, 0);
    assert.ok(textChars(main) < 4000, `main message has ${textChars(main)} chars`);
    assert.ok(followUps.length > 0, 'expected overflow follow-ups');
    for (const fu of followUps) assert.ok(textChars(fu) < 4000, `follow-up has ${textChars(fu)} chars`);
    // Every op line appears somewhere across the messages.
    const allText = [main, ...followUps].map(c => JSON.stringify(c)).join('');
    assert.ok(allText.includes('item name number 59'));
  });
});
