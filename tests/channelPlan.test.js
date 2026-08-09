/**
 * Channel Administration — pure planning logic.
 *
 * channelPlan.js is import-safe (no Discord/storage imports, no top-level logging), so unlike
 * most CastBot test files this imports the real functions rather than replicating them inline.
 * That means these assertions actually protect the shipped code.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';

import {
  toSlug,
  channelName,
  pairKey,
  enumeratePairs,
  mergeOverwrites,
  buildOverwrites,
  preflightBudget,
  planCategoryBuckets,
  assignChannelNames,
  planSubsPlacement,
  sanitizeCategoryBase
} from '../src/channels/channelPlan.js';

const VIEW = PermissionFlagsBits.ViewChannel;
const SEND = PermissionFlagsBits.SendMessages;

describe('channelPlan — toSlug', () => {
  it('lowercases and keeps alphanumerics', () => {
    assert.equal(toSlug('ReeceBot'), 'reecebot');
  });

  it('hyphenates whitespace instead of deleting it (sanitizeChannelName gets this wrong)', () => {
    assert.equal(toSlug('Reece Wagner'), 'reece-wagner');
  });

  it('folds accents', () => {
    assert.equal(toSlug('José'), 'jose');
  });

  it('collapses runs and trims stray hyphens', () => {
    assert.equal(toSlug('User @#$ Name!'), 'user-name');
    assert.equal(toSlug('--Reece--'), 'reece');
  });

  it('NEVER returns empty — emoji-only names fall back to player-<last4>', () => {
    assert.equal(toSlug('🎮🎯', { userId: '391415444084490240' }), 'player-0240');
    assert.equal(toSlug('', { userId: '391415444084490240' }), 'player-0240');
    assert.equal(toSlug('!!!', { userId: '391415444084490240' }), 'player-0240');
  });

  it('falls back safely even with no userId', () => {
    assert.equal(toSlug('🎮'), 'player-0000');
  });

  it('respects max and never leaves a trailing hyphen after truncation', () => {
    const slug = toSlug('ab cdefghij', { max: 3 });
    assert.equal(slug, 'ab');
    assert.ok(!slug.endsWith('-'));
  });

  it('handles null/undefined without throwing', () => {
    assert.equal(toSlug(undefined, { userId: '1234' }), 'player-1234');
    assert.equal(toSlug(null, { userId: '1234' }), 'player-1234');
  });
});

describe('channelPlan — channelName (Discord 100-char hard limit)', () => {
  const LONG = 'a'.repeat(90);

  it('builds the ORG naming schemas', () => {
    assert.equal(channelName('confessional', [{ displayName: 'Reece', userId: '1' }]), 'reece-confessional');
    assert.equal(channelName('subs', [{ displayName: 'Reece', userId: '1' }]), 'reece-subs');
    assert.equal(
      channelName('oneonone', [{ displayName: 'Reece', userId: '1' }, { displayName: 'Bob', userId: '2' }]),
      'reece-bob'
    );
  });

  it('regression: a 90-char name + "-confessional" must NOT exceed 100 (sanitizeChannelName produced 103)', () => {
    const name = channelName('confessional', [{ displayName: LONG, userId: '1' }]);
    assert.ok(name.length <= 100, `got ${name.length}`);
    assert.ok(name.endsWith('-confessional'));
  });

  it('keeps subs under the limit', () => {
    const name = channelName('subs', [{ displayName: LONG, userId: '1' }]);
    assert.ok(name.length <= 100, `got ${name.length}`);
    assert.ok(name.endsWith('-subs'));
  });

  it('keeps a two-long-name 1on1 under the limit', () => {
    const name = channelName('oneonone', [
      { displayName: LONG, userId: '1' },
      { displayName: 'b'.repeat(90), userId: '2' }
    ]);
    assert.ok(name.length <= 100, `got ${name.length}`);
  });

  it('appends a collision discriminator', () => {
    const name = channelName('confessional', [{ displayName: 'José', userId: '391415444084490240' }], { discriminator: '0240' });
    assert.equal(name, 'jose-confessional-0240');
  });

  it('throws on an unknown kind rather than emitting a bad name', () => {
    assert.throws(() => channelName('bogus', [{ displayName: 'x', userId: '1' }]), /unknown kind/);
  });
});

describe('channelPlan — pairKey (BigInt ordering)', () => {
  it('is symmetric', () => {
    assert.equal(pairKey('111', '222'), pairKey('222', '111'));
  });

  it('orders by BigInt, NOT lexicographically — the duplicate-channel bug', () => {
    // Lexicographically '999...'(17) > '1000...'(18), which would flip the key.
    const short = '999999999999999999';
    const long = '1000000000000000000';
    assert.equal(pairKey(short, long), `${short}_${long}`);
    assert.equal(pairKey(long, short), `${short}_${long}`);
    assert.ok(short.localeCompare(long) > 0, 'precondition: string compare disagrees with BigInt');
  });

  it('handles identical ids', () => {
    assert.equal(pairKey('123', '123'), '123_123');
  });
});

describe('channelPlan — enumeratePairs (combinatorics)', () => {
  it('n<2 yields no pairs', () => {
    assert.deepEqual(enumeratePairs([]), []);
    assert.deepEqual(enumeratePairs(['1']), []);
    assert.deepEqual(enumeratePairs(undefined), []);
  });

  it('n=3 yields 3 pairs (reece-bob, reece-sarah, sarah-bob)', () => {
    assert.equal(enumeratePairs(['1', '2', '3']).length, 3);
  });

  it('matches n(n-1)/2 at real tribe sizes', () => {
    const ids = (n) => Array.from({ length: n }, (_, i) => String(1000 + i));
    assert.equal(enumeratePairs(ids(12)).length, 66);
    assert.equal(enumeratePairs(ids(16)).length, 120);
    assert.equal(enumeratePairs(ids(20)).length, 190);
  });

  it('dedupes repeated member ids', () => {
    assert.equal(enumeratePairs(['1', '1', '2']).length, 1);
  });

  it('emits pairKey-consistent a/b', () => {
    const [p] = enumeratePairs(['222', '111']);
    assert.equal(p.pairKey, `111_222`);
    assert.equal(p.a, '111');
    assert.equal(p.b, '222');
  });
});

describe('channelPlan — mergeOverwrites (duplicate id = Discord 400)', () => {
  it('collapses a duplicate id into one entry, unioning allow bits', () => {
    const merged = mergeOverwrites([
      { id: 'role1', allow: [VIEW] },
      { id: 'role1', allow: [SEND] }
    ]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].allow.sort(), [VIEW, SEND].sort());
  });

  it('deny wins over allow for the same bit', () => {
    const merged = mergeOverwrites([
      { id: 'x', allow: [VIEW, SEND] },
      { id: 'x', deny: [VIEW] }
    ]);
    assert.deepEqual(merged[0].allow, [SEND]);
    assert.deepEqual(merged[0].deny, [VIEW]);
  });

  it('preserves insertion order so the @everyone deny stays first', () => {
    const merged = mergeOverwrites([
      { id: 'everyone', deny: [VIEW] },
      { id: 'player', allow: [VIEW] },
      { id: 'everyone', deny: [SEND] }
    ]);
    assert.equal(merged[0].id, 'everyone');
    assert.equal(merged.length, 2);
  });

  it('ignores falsy entries and missing ids', () => {
    assert.deepEqual(mergeOverwrites([null, { allow: [VIEW] }, undefined]), []);
    assert.deepEqual(mergeOverwrites(undefined), []);
  });
});

describe('channelPlan — buildOverwrites', () => {
  const base = { everyoneId: 'guild1', viewChannelBit: VIEW };

  it('always denies @everyone first', () => {
    const o = buildOverwrites({ ...base, principals: [{ id: 'u1', allow: [VIEW] }] });
    assert.equal(o[0].id, 'guild1');
    assert.deepEqual(o[0].deny, [VIEW]);
  });

  it('omits the spectator entry when no role is configured', () => {
    const o = buildOverwrites({ ...base, principals: [{ id: 'u1', allow: [VIEW] }], spectatorRoleId: null });
    assert.ok(!o.some(e => e.id === 'spec'));
  });

  it('includes the spectator entry when configured', () => {
    const o = buildOverwrites({ ...base, principals: [], spectatorRoleId: 'spec', spectatorAccess: [VIEW] });
    assert.ok(o.some(e => e.id === 'spec'));
  });

  it('CRITICAL: a spectator role that is ALSO in globalRoleAccess collapses to one entry', () => {
    // Without merging, Discord rejects the entire channels.create() with a 400.
    const o = buildOverwrites({
      ...base,
      principals: [],
      spectatorRoleId: 'shared',
      spectatorAccess: [VIEW],
      roleAccessEntries: [{ id: 'shared', allow: [SEND] }]
    });
    const shared = o.filter(e => e.id === 'shared');
    assert.equal(shared.length, 1, 'duplicate overwrite id would 400');
    assert.deepEqual(shared[0].allow.sort(), [VIEW, SEND].sort());
  });

  it('a playerRole that is also a host role collapses too', () => {
    const o = buildOverwrites({
      ...base,
      principals: [{ id: 'dual', allow: [VIEW] }],
      roleAccessEntries: [{ id: 'dual', allow: [SEND] }]
    });
    assert.equal(o.filter(e => e.id === 'dual').length, 1);
  });
});

describe('channelPlan — preflightBudget (500 channels / 50 categories / 250 roles)', () => {
  const ex = (o = {}) => ({ channels: 0, categories: 0, roles: 0, ...o });

  it('passes a comfortable plan', () => {
    const r = preflightBudget({ existing: ex({ channels: 50 }), create: { channels: 10, categories: 1 } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.violations, []);
  });

  it('counts new categories toward the 500-channel ceiling', () => {
    const r = preflightBudget({ existing: ex({ channels: 100 }), create: { channels: 10, categories: 2 } });
    assert.equal(r.after.channels, 112);
  });

  it('allows exactly 500 but refuses 501', () => {
    assert.equal(preflightBudget({ existing: ex({ channels: 490 }), create: { channels: 10 } }).ok, true);
    const over = preflightBudget({ existing: ex({ channels: 491 }), create: { channels: 10 } });
    assert.equal(over.ok, false);
    assert.equal(over.violations[0].ceiling, 'channels');
    assert.equal(over.violations[0].after, 501);
  });

  it('refuses a category breach', () => {
    const r = preflightBudget({ existing: ex({ categories: 49 }), create: { categories: 2 } });
    assert.equal(r.ok, false);
    assert.ok(r.violations.some(v => v.ceiling === 'categories'));
  });

  it('refuses a role breach — the 250 ceiling Player Roles consumes', () => {
    const r = preflightBudget({ existing: ex({ roles: 245 }), create: { roles: 10 } });
    assert.equal(r.ok, false);
    assert.deepEqual(r.violations.map(v => v.ceiling), ['roles']);
    assert.equal(r.violations[0].after, 255);
  });

  it('reports every simultaneous violation', () => {
    const r = preflightBudget({
      existing: ex({ channels: 495, categories: 50, roles: 249 }),
      create: { channels: 10, categories: 1, roles: 5 }
    });
    assert.deepEqual(r.violations.map(v => v.ceiling).sort(), ['categories', 'channels', 'roles']);
  });

  it('estimates ETA from the create pacing (~1/sec)', () => {
    // 190 channels at 5 per 5000ms
    const r = preflightBudget({ existing: ex(), create: { channels: 190, categories: 4 } });
    assert.equal(r.etaSeconds, Math.ceil((194 / 5) * 5));
  });

  it('tolerates missing fields', () => {
    assert.equal(preflightBudget({}).ok, true);
  });
});

describe('channelPlan — planCategoryBuckets (50 children per category)', () => {
  const items = (n) => Array.from({ length: n }, (_, i) => i);

  it('no items → no buckets', () => {
    assert.deepEqual(planCategoryBuckets([], { baseName: '1 on 1s' }), []);
  });

  it('66 pairs (a 12-player tribe) overflow into 2 categories: 50 + 16', () => {
    const b = planCategoryBuckets(items(66), { baseName: '1 on 1s' });
    assert.equal(b.length, 2);
    assert.equal(b[0].items.length, 50);
    assert.equal(b[1].items.length, 16);
    assert.equal(b[0].categoryName, '1 on 1s');
    assert.equal(b[1].categoryName, '1 on 1s 2');
  });

  it('276 pairs (a 24-player tribe) need 6 categories', () => {
    const b = planCategoryBuckets(items(276), { baseName: '1 on 1s' });
    assert.equal(b.length, 6);
    assert.equal(b.reduce((n, x) => n + x.items.length, 0), 276);
  });

  it('tops up a partially filled existing category first', () => {
    const b = planCategoryBuckets(items(20), {
      baseName: '1 on 1s',
      existing: [{ id: 'cat1', name: '1 on 1s', childCount: 45 }]
    });
    assert.equal(b[0].categoryId, 'cat1');
    assert.equal(b[0].items.length, 5, 'fills the 5 remaining slots');
    assert.equal(b[1].categoryId, null);
    assert.equal(b[1].items.length, 15);
    assert.equal(b[1].categoryName, '1 on 1s 2');
  });

  it('skips a full existing category', () => {
    const b = planCategoryBuckets(items(3), {
      baseName: '1 on 1s',
      existing: [{ id: 'cat1', name: '1 on 1s', childCount: 50 }]
    });
    assert.equal(b.length, 1);
    assert.equal(b[0].categoryId, null);
    assert.equal(b[0].categoryName, '1 on 1s 2');
  });
});

describe('channelPlan — assignChannelNames (collisions)', () => {
  it('leaves unique names undiscriminated', () => {
    const names = assignChannelNames([
      { userId: '1', displayName: 'Reece' },
      { userId: '2', displayName: 'Bob' }
    ], 'confessional');
    assert.equal(names.get('1'), 'reece-confessional');
    assert.equal(names.get('2'), 'bob-confessional');
  });

  it('discriminates two players who slug identically', () => {
    const names = assignChannelNames([
      { userId: '391415444084490240', displayName: 'José' },
      { userId: '1086246253819613274', displayName: 'Jose' }
    ], 'confessional');
    const a = names.get('391415444084490240');
    const b = names.get('1086246253819613274');
    assert.notEqual(a, b, 'colliding slugs must not produce the same channel name');
    assert.ok(a.endsWith('-0240'));
    assert.ok(b.endsWith('-3274'));
  });

  it('is deterministic across runs (re-run derives identical names)', () => {
    const members = [
      { userId: '2', displayName: 'José' },
      { userId: '1', displayName: 'Jose' }
    ];
    const first = assignChannelNames(members, 'subs');
    const second = assignChannelNames([...members].reverse(), 'subs');
    assert.deepEqual([...first].sort(), [...second].sort());
  });
});

describe('channelPlan — sanitizeCategoryBase (RaP 0881)', () => {
  it('trims, collapses whitespace, keeps caps/emoji (categories are not channel-slugged)', () => {
    assert.equal(sanitizeCategoryBase('  My   Subs 🗳️ '), 'My Subs 🗳️');
  });

  it('falls back when empty', () => {
    assert.equal(sanitizeCategoryBase(''), 'Subs');
    assert.equal(sanitizeCategoryBase('   ', 'Subs'), 'Subs');
    assert.equal(sanitizeCategoryBase(null), 'Subs');
  });

  it('caps at 60 chars', () => {
    assert.equal(sanitizeCategoryBase('x'.repeat(200)).length, 60);
  });
});

describe('channelPlan — planSubsPlacement (RaP 0881)', () => {
  const M = (id, name = `P${id}`) => ({ userId: id, displayName: name });

  it("'keep' is a pure planCategoryBuckets passthrough and NEVER moves anything", () => {
    const items = [M('1'), M('2')];
    const existing = [{ id: 'cat1', name: 'Subs', childCount: 1 }];
    const channelsByUser = new Map([['1', { channelId: 'ch1', parentId: 'somewhere-else' }]]);
    const pp = planSubsPlacement(items, { placement: 'keep', baseName: 'Subs', existing, channelsByUser });
    assert.deepEqual(
      pp.buckets.map((b) => ({ name: b.categoryName, id: b.categoryId, n: b.items.length })),
      planCategoryBuckets(items, { baseName: 'Subs', existing }).map((b) => ({ name: b.categoryName, id: b.categoryId, n: b.items.length }))
    );
    assert.equal(pp.moves.length, 0, "'keep' must never plan a move — zero behaviour change");
  });

  it("'single' with a custom name refuses to top up a DIFFERENT tree's categories", () => {
    const existing = [{ id: 'catSubs', name: 'Subs', childCount: 3 }];
    const pp = planSubsPlacement([M('1')], { placement: 'single', baseName: 'Submissions', existing });
    assert.equal(pp.buckets.length, 1);
    assert.equal(pp.buckets[0].categoryName, 'Submissions');
    assert.equal(pp.buckets[0].categoryId, null, 'must create anew, not adopt the Subs tree');
  });

  it("'single' tops up exact and overflow name matches", () => {
    const existing = [
      { id: 'catA', name: 'Submissions', childCount: 49 },
      { id: 'catNope', name: 'Submissions HQ Notes', childCount: 0 },
      { id: 'catB', name: 'Submissions 2', childCount: 0 }
    ];
    const pp = planSubsPlacement([M('1'), M('2')], { placement: 'single', baseName: 'Submissions', existing });
    assert.deepEqual(pp.buckets.map((b) => b.categoryId), ['catA', 'catB'], 'catNope prefix-matches with startsWith but only via "name " boundary');
  });

  it("'single' plans moves for channels outside the target category", () => {
    const existing = [{ id: 'catSubs', name: 'Subs', childCount: 0 }];
    const channelsByUser = new Map([
      ['1', { channelId: 'ch1', parentId: 'catApps' }],   // misplaced → move
      ['2', { channelId: 'ch2', parentId: 'catSubs' }]    // already right → stay
    ]);
    const pp = planSubsPlacement([M('1'), M('2')], { placement: 'single', baseName: 'Subs', existing, channelsByUser });
    assert.deepEqual(pp.moves.map((m) => m.userId), ['1']);
    assert.equal(pp.moves[0].toName, 'Subs');
  });

  it("'per_tribe' groups by FIRST tribe, names '{Tribe} {base}', keys by roleId", () => {
    const tribesByUser = new Map([
      ['1', [{ roleId: 'rB', name: 'Balboa' }]],
      ['2', [{ roleId: 'rB', name: 'Balboa' }]],
      ['3', [{ roleId: 'rC', name: 'Chapera' }, { roleId: 'rB', name: 'Balboa' }]]
    ]);
    const pp = planSubsPlacement([M('1'), M('2'), M('3')], { placement: 'per_tribe', baseName: 'Subs', tribesByUser });
    const balboa = pp.buckets.find((b) => b.tribeRoleId === 'rB');
    const chapera = pp.buckets.find((b) => b.tribeRoleId === 'rC');
    assert.equal(balboa.categoryName, 'Balboa Subs');
    assert.deepEqual(balboa.items.map((i) => i.userId), ['1', '2']);
    assert.deepEqual(chapera.items.map((i) => i.userId), ['3'], 'first tribe wins');
    assert.equal(pp.multiTribe.length, 1);
    assert.equal(pp.multiTribe[0].userId, '3');
  });

  it("'per_tribe' sends tribe-less players to the fallback tree and reports them", () => {
    const tribesByUser = new Map([['1', [{ roleId: 'rB', name: 'Balboa' }]]]);
    const pp = planSubsPlacement([M('1'), M('9', 'Drifter')], { placement: 'per_tribe', baseName: 'Subs', tribesByUser });
    const fallback = pp.buckets.find((b) => !b.tribeRoleId);
    assert.equal(fallback.categoryName, 'Subs');
    assert.deepEqual(fallback.items.map((i) => i.userId), ['9']);
    assert.equal(pp.tribeless.length, 1);
  });

  it("'per_tribe' reuses a live registry category for the tribe (no move when already inside)", () => {
    const tribesByUser = new Map([['1', [{ roleId: 'rB', name: 'Balboa' }]]]);
    const tribeCategories = { rB: { id: 'catB', childCount: 3 } };
    const channelsByUser = new Map([['1', { channelId: 'ch1', parentId: 'catB' }]]);
    const pp = planSubsPlacement([M('1')], { placement: 'per_tribe', baseName: 'Subs', tribesByUser, tribeCategories, channelsByUser });
    assert.equal(pp.buckets[0].categoryId, 'catB');
    assert.equal(pp.moves.length, 0);
  });

  it('duplicate tribe NAMES stay separate buckets — keying is roleId, not name', () => {
    const tribesByUser = new Map([
      ['1', [{ roleId: 'r1', name: 'Twins' }]],
      ['2', [{ roleId: 'r2', name: 'Twins' }]]
    ]);
    const pp = planSubsPlacement([M('1'), M('2')], { placement: 'per_tribe', baseName: 'Subs', tribesByUser });
    assert.equal(pp.buckets.filter((b) => b.tribeRoleId).length, 2);
  });

  it('tribe category names are capped at 100 chars', () => {
    const tribesByUser = new Map([['1', [{ roleId: 'r1', name: 'T'.repeat(120) }]]]);
    const pp = planSubsPlacement([M('1')], { placement: 'per_tribe', baseName: 'Subs', tribesByUser });
    assert.equal(pp.buckets[0].categoryName.length, 100);
  });
});
