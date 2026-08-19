/**
 * channelNuker — the shared destructive-deletion engine (☢️ Nuke Channels + Archive & Delete).
 *
 * Imported for real, not replicated inline: this is the one module in the archive/nuke family
 * whose bugs are unrecoverable, so the tests must exercise the code that actually ships. It
 * imports cleanly (discord.js types + a fetch-only helper; no bot connection, no side effects).
 *
 * Tests are kept to ≤4 items each — deleteChannelItems paces with a real 2s sleep every 5.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandNukeSelection,
  orderForDeletion,
  deleteChannelItems,
  deleteOneChannel,
  buildNukeConfirmScreen,
  buildNukeScreen,
  NUKE_CHANNEL_TYPES,
} from '../channelNuker.js';

// Real runs pause 2s every 5 deletions for Discord's rate limit; the suite has no such need.
const NO_PACE = { n: 0, ms: 0 };

// Guild: category 'cat' holding text + voice + forum children, plus a loose channel and a 2nd category.
const GUILD = [
  { id: 'cat', name: 'Season', type: 4, parent_id: null, position: 0 },
  { id: 'c2', name: 'beta', type: 0, parent_id: 'cat', position: 2 },
  { id: 'c1', name: 'alpha', type: 0, parent_id: 'cat', position: 1 },
  { id: 'vc', name: 'VC', type: 2, parent_id: 'cat', position: 3 },
  { id: 'fo', name: 'forum', type: 15, parent_id: 'cat', position: 4 },
  { id: 'cat2', name: 'Archive', type: 4, parent_id: null, position: 1 },
  { id: 'loose', name: 'general', type: 0, parent_id: null, position: 0 },
];

// channelNuker logs a line per deletion. On Windows those writes interleave with node:test's
// v8-serialised IPC channel and fail the whole FILE with "Unable to deserialize cloned data" —
// green subtests, red file. Mute for the run; this process exists only to assert.
console.log = console.warn = console.error = () => {};

/** Minimal discord.js Collection stand-in: the two methods deleteChannelItems actually uses. */
class FakeCollection extends Map {
  filter(fn) {
    const out = new FakeCollection();
    for (const [k, v] of this) if (fn(v)) out.set(k, v);
    return out;
  }
}

/**
 * Fake guild whose channels delete themselves out of the cache.
 * @param {object} [failures] - id → {code} to throw from delete()
 */
function fakeGuild(channels = GUILD, failures = {}) {
  const deleted = [];
  const cache = new FakeCollection();
  for (const c of channels) {
    cache.set(c.id, {
      id: c.id,
      name: c.name,
      parentId: c.parent_id || null,
      async delete() {
        const f = failures[c.id];
        if (f) { const e = new Error(f.message || 'nope'); e.code = f.code; throw e; }
        deleted.push(c.id);
        cache.delete(c.id);
      },
    });
  }
  return {
    deleted,
    channels: { cache, fetch: async (id) => cache.get(id) || null },
  };
}

describe('channelNuker — expandNukeSelection', () => {
  it('expands a category to EVERY deletable type inside it, not just text', () => {
    const { items } = expandNukeSelection(['cat'], GUILD);
    const ids = items.map(i => i.id);
    assert.ok(ids.includes('vc'), 'voice channels must be deleted with their category');
    assert.ok(ids.includes('fo'), 'forums must be deleted with their category');
    assert.deepEqual(ids, ['c1', 'c2', 'vc', 'fo', 'cat']); // position order, category last
  });

  it('puts categories LAST so children are gone before their parent', () => {
    const { items } = expandNukeSelection(['cat', 'cat2', 'loose'], GUILD);
    const catIndexes = items.map((it, i) => (it.type === 4 ? i : -1)).filter(i => i >= 0);
    const minCat = Math.min(...catIndexes);
    assert.ok(items.slice(0, minCat).every(i => i.type !== 4));
    assert.ok(items.slice(minCat).every(i => i.type === 4));
  });

  it('counts channels and categories separately, and reports how many came via a category', () => {
    const r = expandNukeSelection(['cat', 'loose'], GUILD);
    assert.equal(r.channelCount, 5);       // 4 children + the loose one
    assert.equal(r.categoryCount, 1);
    assert.equal(r.viaCategoryCount, 4);   // only the children were implied
  });

  it('dedupes a channel picked both directly and via its category', () => {
    const { items, channelCount } = expandNukeSelection(['cat', 'c1'], GUILD);
    assert.equal(items.filter(i => i.id === 'c1').length, 1);
    assert.equal(channelCount, 4);
  });

  it('falls back to resolved.channels for ids missing from the guild list', () => {
    const { items } = expandNukeSelection(['x9'], GUILD, { x9: { id: 'x9', name: 'orphan', type: 0 } });
    assert.deepEqual(items.map(i => i.name), ['orphan']);
  });

  it('ignores unknown ids and empty input', () => {
    assert.deepEqual(expandNukeSelection(['nope'], GUILD).items, []);
    assert.deepEqual(expandNukeSelection([], GUILD).items, []);
    assert.deepEqual(expandNukeSelection(undefined, undefined).items, []);
  });

  it('offers categories in the select, unlike the archive select', () => {
    assert.ok(NUKE_CHANNEL_TYPES.includes(4));
    assert.ok(NUKE_CHANNEL_TYPES.includes(2)); // voice — nothing to archive, plenty to delete
  });
});

describe('channelNuker — orderForDeletion', () => {
  it('deletes the invoking channel last of the channels, and categories after that', () => {
    const { items } = expandNukeSelection(['cat', 'loose'], GUILD);
    const ordered = orderForDeletion(items, 'c1');
    assert.equal(ordered[ordered.length - 1].id, 'cat');           // category dead last
    assert.equal(ordered[ordered.length - 2].id, 'c1');            // then the channel we're standing in
  });

  it('is a no-op ordering when the invoking channel is not in the selection', () => {
    const { items } = expandNukeSelection(['loose'], GUILD);
    assert.deepEqual(orderForDeletion(items, 'somewhere-else').map(i => i.id), ['loose']);
  });

  it('tolerates empty/undefined input', () => {
    assert.deepEqual(orderForDeletion(undefined, null), []);
  });
});

describe('channelNuker — deleteChannelItems safety invariants', () => {
  it('NEVER deletes a protected id, and reports it as kept', async () => {
    const guild = fakeGuild();
    const items = [{ id: 'loose', name: 'general', type: 0 }, { id: 'c1', name: 'alpha', type: 0 }];
    const r = await deleteChannelItems(guild, items, { protectIds: ['loose'], pace: NO_PACE });
    assert.deepEqual(guild.deleted, ['c1']);
    assert.equal(r.deleted, 1);
    assert.deepEqual(r.protected, ['general']);
  });

  it('keeps a category alive when a protected channel is still inside it', async () => {
    const guild = fakeGuild();
    const items = [
      { id: 'c1', name: 'alpha', type: 0 },
      { id: 'c2', name: 'beta', type: 0 },
      { id: 'cat', name: 'Season', type: 4 },
    ];
    // vc + fo are inside 'cat' but were never selected → the category must survive.
    const r = await deleteChannelItems(guild, items, { pace: NO_PACE });
    assert.ok(!guild.deleted.includes('cat'), 'category must not be orphaned out from under survivors');
    assert.ok(r.protected.some(p => p.includes('Season')));
  });

  it('deletes a category once everything inside it is gone', async () => {
    const guild = fakeGuild();
    const { items } = expandNukeSelection(['cat'], GUILD); // all 4 children + the category
    const r = await deleteChannelItems(guild, items, { pace: NO_PACE });
    assert.deepEqual(guild.deleted, ['c1', 'c2', 'vc', 'fo', 'cat']);
    assert.equal(r.deleted, 5);
    assert.equal(r.failed, 0);
  });

  it('keeps a category whose child FAILED to delete (a failure is a survivor)', async () => {
    const guild = fakeGuild(GUILD, { c2: { code: 50013 } });
    const { items } = expandNukeSelection(['cat'], GUILD);
    const r = await deleteChannelItems(guild, items, { pace: NO_PACE });
    assert.ok(!guild.deleted.includes('cat'));
    assert.equal(r.failed, 1);
    assert.ok(r.errors[0].includes('Manage Channels'), 'error must name the missing permission');
  });

  it('stops cold when shouldAbort flips, and reports what was left', async () => {
    const guild = fakeGuild();
    let calls = 0;
    const items = [
      { id: 'c1', name: 'alpha', type: 0 },
      { id: 'c2', name: 'beta', type: 0 },
      { id: 'vc', name: 'VC', type: 2 },
    ];
    const r = await deleteChannelItems(guild, items, { shouldAbort: () => ++calls > 2, pace: NO_PACE });
    assert.deepEqual(guild.deleted, ['c1', 'c2']);
    assert.equal(r.aborted, true);
    assert.equal(r.remaining, 1);
  });

  it('treats an already-deleted channel as done, not as a failure', async () => {
    const guild = fakeGuild(GUILD, { c1: { code: 10003 } });
    const r = await deleteChannelItems(guild, [{ id: 'c1', name: 'alpha', type: 0 }], { pace: NO_PACE });
    assert.equal(r.gone, 1);
    assert.equal(r.failed, 0);
    assert.equal(r.errors.length, 0);
  });

  it('counts a channel that vanished before we reached it as gone', async () => {
    const guild = fakeGuild();
    guild.channels.cache.delete('c1');
    const r = await deleteChannelItems(guild, [{ id: 'c1', name: 'alpha', type: 0 }], { pace: NO_PACE });
    assert.equal(r.gone, 1);
    assert.equal(r.deleted, 0);
  });

  it('paces itself between batches so a big nuke does not hit the rate limit', async () => {
    const guild = fakeGuild();
    const items = [
      { id: 'c1', name: 'alpha', type: 0 }, { id: 'c2', name: 'beta', type: 0 },
      { id: 'vc', name: 'VC', type: 2 }, { id: 'fo', name: 'forum', type: 15 },
    ];
    const t0 = Date.now();
    await deleteChannelItems(guild, items, { pace: { n: 2, ms: 40 } });
    assert.ok(Date.now() - t0 >= 40, 'a pause must happen between batches');
    assert.equal(guild.deleted.length, 4); // and everything still gets deleted
  });

  it('reports progress for every item it processes', async () => {
    const guild = fakeGuild();
    const seen = [];
    await deleteChannelItems(guild, [{ id: 'c1', name: 'alpha', type: 0 }, { id: 'c2', name: 'beta', type: 0 }], {
      pace: NO_PACE,
      onProgress: (s) => { seen.push(`${s.done}/${s.total}`); },
    });
    assert.deepEqual(seen, ['1/2', '2/2']);
  });
});

describe('channelNuker — deleteOneChannel error translation', () => {
  it('maps Discord error codes to actionable outcomes', async () => {
    const cases = [
      [10003, 'gone'],
      [50013, 'failed'],
      [50074, 'failed'],
      [99999, 'failed'],
    ];
    for (const [code, expected] of cases) {
      const guild = fakeGuild(GUILD, { c1: { code } });
      const r = await deleteOneChannel(guild, { id: 'c1', name: 'alpha', type: 0 });
      assert.equal(r.status, expected, `code ${code}`);
    }
  });

  it('reports a Community-required channel in plain English', async () => {
    const guild = fakeGuild(GUILD, { c1: { code: 50074 } });
    const r = await deleteOneChannel(guild, { id: 'c1', name: 'alpha', type: 0 });
    assert.ok(r.error.includes('Community'));
  });
});

describe('channelNuker — confirm screen (the last line of defence)', () => {
  const plan = expandNukeSelection(['cat', 'loose'], GUILD);

  it('states the counts and refuses to hide the word "permanently"', () => {
    const c = buildNukeConfirmScreen({ ...plan, invokedChannelId: 'elsewhere' });
    const text = JSON.stringify(c);
    assert.ok(text.includes('permanently deleted'));
    assert.ok(text.includes('cannot be undone'));
    assert.equal(c.accent_color, 0xe74c3c); // red, always
  });

  it('warns when the host is about to delete the channel they are standing in', () => {
    const withSelf = buildNukeConfirmScreen({ ...plan, invokedChannelId: 'loose' });
    const without = buildNukeConfirmScreen({ ...plan, invokedChannelId: 'elsewhere' });
    assert.ok(JSON.stringify(withSelf).includes('channel you are using right now'));
    assert.ok(!JSON.stringify(without).includes('channel you are using right now'));
  });

  it('offers Cancel first and the destructive button second', () => {
    const c = buildNukeConfirmScreen({ ...plan, invokedChannelId: 'x' });
    const row = c.components.find(x => x.type === 1);
    assert.equal(row.components[0].custom_id, 'nuke_cat_cancel');
    assert.equal(row.components[0].style, 2);           // grey
    assert.equal(row.components[1].custom_id, 'nuke_chan_confirm');
    assert.equal(row.components[1].style, 4);           // red
  });

  it('replaces the confirm entirely when CastBot lacks Manage Channels — no button to click', () => {
    const c = buildNukeConfirmScreen({ ...plan, invokedChannelId: 'x', botCanDelete: false });
    const text = JSON.stringify(c);
    assert.ok(text.includes('Manage Channels'));
    assert.ok(!text.includes('nuke_chan_confirm'), 'the destructive button must be absent, not just disabled');
  });

  it('caps the listed names but says how many were hidden', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `x${i}`, name: `ch${i}`, type: 0 }));
    const c = buildNukeConfirmScreen({ items: many, channelCount: 25, categoryCount: 0, invokedChannelId: 'x' });
    assert.ok(JSON.stringify(c).includes('and 5 more'));
  });
});

describe('channelNuker — landing screen', () => {
  it('points the host at the Archiver before they delete anything', () => {
    const text = JSON.stringify(buildNukeScreen());
    assert.ok(text.includes('Archiver'));
    assert.ok(text.includes('no undo') || text.includes('There is no undo'));
  });

  it('routes its select to nuke_chan_select with categories enabled', () => {
    const select = buildNukeScreen().components.flatMap(c => c.components || []).find(c => c.type === 8);
    assert.equal(select.custom_id, 'nuke_chan_select');
    assert.ok(select.channel_types.includes(4));
    assert.equal(select.max_values, 25);
  });
});
