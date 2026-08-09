// Tests for the application duplicate guard (applicationManager.js createApplicationChannel).
//
// THE BUG (prod, found 2026-08-09 in EpochORG S14): the guard only looked for a channel NAMED what it
// was about to create — "📝kevina-app" — inside the season's category. But CastBot renames these
// channels as the application progresses (📝 open → ☑️ submitted → ✖️ withdrawn → ✅/❌ placement;
// the emoji prefix IS the state machine). Once Kevin's channel became "☑️kevina-app" the guard could
// no longer see it, so clicking Apply again minted a SECOND channel and a second application record
// for the same person in the same season. He then rendered twice in Marooning — once as Cast, once as
// Undecided — and the cast total read 19/18. 16 such duplicates existed across 12 prod servers.
//
// The guard is now identity-based (userId + configId), which no rename or category move can defeat.
// Pure logic replicated inline (createApplicationChannel needs a live Guild).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const CONFIG = 'config_1781015852414_454453967309504512';
const OTHER_CONFIG = 'config_other';

// ── Replica: the guard chain in createApplicationChannel ──
function guard({ applications = {}, liveChannelIds = [], userId, configId, channelName, categoryId, channels = {} }) {
  const live = new Set(liveChannelIds);

  // 1. orphan sweep — records whose channel is gone never block a re-apply
  const swept = {};
  for (const [chId, app] of Object.entries(applications)) {
    if (app.userId === userId && !live.has(chId)) continue;
    swept[chId] = app;
  }

  // 2. identity check (userId + configId)
  if (configId && configId !== 'unknown') {
    const hit = Object.entries(swept).find(([chId, app]) =>
      app.userId === userId && app.configId === configId && live.has(chId));
    if (hit) return { blocked: true, by: 'identity', channelId: hit[0] };
  }

  // 3. secondary net — a channel with this exact name in this category
  const named = Object.entries(channels).find(([, c]) => c.name === channelName && c.parentId === categoryId);
  if (named) return { blocked: true, by: 'name', channelId: named[0] };

  return { blocked: false, swept };
}

const base = {
  userId: 'kevin',
  configId: CONFIG,
  channelName: '📝kevina-app',
  categoryId: 'cat1'
};

describe('Duplicate guard — survives the channel renames CastBot itself performs', () => {
  it('BLOCKS a re-apply after the channel was renamed to submitted (the actual prod bug)', () => {
    const r = guard({
      ...base,
      applications: { c1: { userId: 'kevin', configId: CONFIG } },
      liveChannelIds: ['c1'],
      channels: { c1: { name: '☑️kevina-app', parentId: 'cat1' } } // renamed on submit
    });
    assert.equal(r.blocked, true, 'a renamed channel must still count as an existing application');
    assert.equal(r.by, 'identity');
    assert.equal(r.channelId, 'c1');
  });

  it('BLOCKS after every state rename the bot performs', () => {
    for (const name of ['☑️kevina-app', '✖️kevina-app', '✅kevina-app', '❌kevina-app', 'totally-renamed']) {
      const r = guard({
        ...base,
        applications: { c1: { userId: 'kevin', configId: CONFIG } },
        liveChannelIds: ['c1'],
        channels: { c1: { name, parentId: 'cat1' } }
      });
      assert.equal(r.blocked, true, `should block when channel is named "${name}"`);
    }
  });

  it('BLOCKS after the channel was moved to another category', () => {
    const r = guard({
      ...base,
      applications: { c1: { userId: 'kevin', configId: CONFIG } },
      liveChannelIds: ['c1'],
      channels: { c1: { name: '📝kevina-app', parentId: 'archive-category' } }
    });
    assert.equal(r.blocked, true);
    assert.equal(r.by, 'identity', 'the name check would have missed this — parentId differs');
  });

  it('the OLD name-only guard would have let all of those through', () => {
    // Kept as the regression's epitaph: this is precisely what shipped for months.
    const nameOnly = (channels, channelName, categoryId) =>
      !!Object.values(channels).find(c => c.name === channelName && c.parentId === categoryId);
    assert.equal(nameOnly({ c1: { name: '☑️kevina-app', parentId: 'cat1' } }, '📝kevina-app', 'cat1'), false);
    assert.equal(nameOnly({ c1: { name: '📝kevina-app', parentId: 'archive' } }, '📝kevina-app', 'cat1'), false);
  });
});

describe('Duplicate guard — still permits everything it should', () => {
  it('ALLOWS a first application', () => {
    assert.equal(guard({ ...base, applications: {}, liveChannelIds: [], channels: {} }).blocked, false);
  });

  it('ALLOWS applying to a DIFFERENT season', () => {
    const r = guard({
      ...base,
      applications: { c1: { userId: 'kevin', configId: OTHER_CONFIG } },
      liveChannelIds: ['c1'],
      channels: { c1: { name: '📝kevina-app-old', parentId: 'cat-other' } }
    });
    assert.equal(r.blocked, false, 'last season must never block this season');
  });

  it('ALLOWS a re-apply once the old channel has been deleted', () => {
    const r = guard({
      ...base,
      applications: { c1: { userId: 'kevin', configId: CONFIG } }, // stale record
      liveChannelIds: [],                                          // channel gone
      channels: {}
    });
    assert.equal(r.blocked, false, 'an orphan record must not permanently lock someone out');
    assert.equal('c1' in r.swept, false, 'and the orphan is swept');
  });

  it('ALLOWS a different person with the same display name', () => {
    const r = guard({
      ...base,
      userId: 'kevin2',
      applications: { c1: { userId: 'kevin', configId: CONFIG } },
      liveChannelIds: ['c1'],
      channels: { c1: { name: '☑️kevina-app', parentId: 'cat1' } }
    });
    assert.equal(r.blocked, false, 'identity is the user, not the name');
  });

  it('does not sweep another user\'s orphans', () => {
    const r = guard({
      ...base,
      applications: { c1: { userId: 'someone-else', configId: CONFIG } },
      liveChannelIds: [],
      channels: {}
    });
    assert.equal('c1' in r.swept, true);
  });
});

describe('Duplicate guard — the name check survives as a secondary net', () => {
  it('BLOCKS a same-named channel that has no application record', () => {
    // e.g. created by hand, or its record was lost — identity can't see it, the name check can.
    const r = guard({ ...base, applications: {}, liveChannelIds: ['c9'], channels: { c9: { name: '📝kevina-app', parentId: 'cat1' } } });
    assert.equal(r.blocked, true);
    assert.equal(r.by, 'name');
  });

  it('falls back to the name check when configId is unknown (legacy records)', () => {
    const r = guard({
      ...base,
      configId: 'unknown',
      applications: { c1: { userId: 'kevin', configId: 'unknown' } },
      liveChannelIds: ['c1'],
      channels: { c1: { name: '📝kevina-app', parentId: 'cat1' } }
    });
    assert.equal(r.blocked, true);
    assert.equal(r.by, 'name', 'identity is unusable without a real configId');
  });

  it('identity wins when both would fire, so the reported channel is the real application', () => {
    const r = guard({
      ...base,
      applications: { c1: { userId: 'kevin', configId: CONFIG } },
      liveChannelIds: ['c1', 'c9'],
      channels: { c1: { name: '☑️kevina-app', parentId: 'cat1' }, c9: { name: '📝kevina-app', parentId: 'cat1' } }
    });
    assert.equal(r.by, 'identity');
    assert.equal(r.channelId, 'c1');
  });
});
