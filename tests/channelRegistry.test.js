/**
 * Channel Administration — registry deltas.
 *
 * applyDeltas is the pure mutator at the heart of the registry; flushDeltas just wraps it in
 * withStorageLock. Importing channelRegistry.js pulls in storage.js (file I/O), so the mutator
 * is replicated inline here per the CastBot testing convention — kept in lockstep with
 * src/channels/channelRegistry.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline replica of applyDeltas (src/channels/channelRegistry.js) ──
function ensureNode(playerData, guildId) {
  const g = (playerData[guildId] ||= {});
  const node = (g.channelAdmin ||= { version: 1 });
  node.oneOnOnes ||= {};
  node.oneOnOneCategories ||= [];
  return node;
}
function ensureSeason(node, configId) {
  const s = (node[configId] ||= {});
  s.confessionals ||= {};
  s.subs ||= {};
  s.categories ||= {};
  s.lastRun ||= {};
  return s;
}
function applyDeltas(playerData, guildId, deltas) {
  if (!playerData || !guildId || !deltas?.length) return 0;
  const node = ensureNode(playerData, guildId);
  let applied = 0;
  for (const d of deltas) {
    if (!d?.kind) continue;
    switch (d.kind) {
      case 'confessional':
      case 'subs': {
        const bucket = d.kind === 'subs' ? 'subs' : 'confessionals';
        const season = ensureSeason(node, d.configId);
        season[bucket][d.userId] = {
          ...(season[bucket][d.userId] || {}),
          channelId: d.channelId,
          name: d.name,
          ...(d.categoryId ? { categoryId: d.categoryId } : {}),
          ...(d.convertedFrom ? { convertedFrom: d.convertedFrom } : {}),
          createdAt: season[bucket][d.userId]?.createdAt || d.at || 'T0'
        };
        applied++;
        break;
      }
      case 'oneonone': {
        node.oneOnOnes[d.pairKey] = {
          ...(node.oneOnOnes[d.pairKey] || {}),
          channelId: d.channelId, name: d.name, a: d.a, b: d.b, tribeRoleId: d.tribeRoleId,
          createdAt: node.oneOnOnes[d.pairKey]?.createdAt || d.at || 'T0'
        };
        applied++;
        break;
      }
      case 'category': {
        if (d.bucket === 'oneonone') {
          if (!node.oneOnOneCategories.includes(d.categoryId)) node.oneOnOneCategories.push(d.categoryId);
        } else {
          const season = ensureSeason(node, d.configId);
          const list = (season.categories[d.bucket] ||= []);
          if (!list.includes(d.categoryId)) list.push(d.categoryId);
        }
        applied++;
        break;
      }
      case 'playerRole': {
        const players = ((playerData[guildId].players ||= {}));
        const p = (players[d.userId] ||= {});
        if (d.roleId) p.playerRoleId = d.roleId;
        else delete p.playerRoleId;
        applied++;
        break;
      }
      case 'trustedSpectator': {
        const perms = (playerData[guildId].permissions ||= {});
        if (d.roleId) perms.trustedSpectatorRoleId = d.roleId;
        else delete perms.trustedSpectatorRoleId;
        applied++;
        break;
      }
      case 'appConvert': {
        const app = playerData[guildId]?.applications?.[d.channelId];
        if (!app) break;
        if (d.completedAt && !app.completedAt) app.completedAt = d.completedAt;
        if (d.preConvertChannelName && !app.preConvertChannelName) app.preConvertChannelName = d.preConvertChannelName;
        if (d.convertedToSubsAt) app.convertedToSubsAt = d.convertedToSubsAt;
        applied++;
        break;
      }
      case 'remove': {
        if (d.bucket === 'oneonone') delete node.oneOnOnes[d.key];
        else {
          const season = ensureSeason(node, d.configId);
          const bucket = d.bucket === 'subs' ? 'subs' : 'confessionals';
          delete season[bucket][d.key];
        }
        applied++;
        break;
      }
      case 'lastRun': {
        const season = ensureSeason(node, d.configId);
        season.lastRun[d.action] = d.summary;
        applied++;
        break;
      }
      case 'broadcast': {
        const season = ensureSeason(node, d.configId);
        season.broadcast = { ...(season.broadcast || {}), ...d.patch, updatedAt: d.at || 'T0' };
        applied++;
        break;
      }
      default: break;
    }
  }
  return applied;
}

// ── makeDeltaBuffer replica ──
function makeDeltaBuffer() {
  let buf = [];
  return {
    push: (...deltas) => buf.push(...deltas.filter(Boolean)),
    size: () => buf.length,
    drain: () => { const out = buf; buf = []; return out; }
  };
}

const G = 'guild1';
const C = 'config_1';

describe('channelRegistry — applyDeltas scaffolding', () => {
  it('creates the node structure on first write', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'confessional', configId: C, userId: 'u1', channelId: 'c1', name: 'reece-confessional' }]);
    assert.equal(pd[G].channelAdmin.version, 1);
    assert.equal(pd[G].channelAdmin[C].confessionals.u1.channelId, 'c1');
  });

  it('is a no-op for empty/garbage input', () => {
    const pd = {};
    assert.equal(applyDeltas(pd, G, []), 0);
    assert.equal(applyDeltas(pd, G, undefined), 0);
    assert.equal(applyDeltas(null, G, [{ kind: 'confessional' }]), 0);
    assert.equal(applyDeltas(pd, G, [{ no: 'kind' }, null]), 0);
  });

  it('never touches a sibling guild', () => {
    const pd = { other: { players: { x: { age: 30 } } } };
    applyDeltas(pd, G, [{ kind: 'confessional', configId: C, userId: 'u1', channelId: 'c1', name: 'n' }]);
    assert.deepEqual(pd.other, { players: { x: { age: 30 } } });
  });
});

describe('channelRegistry — idempotency (re-running a job must not corrupt state)', () => {
  it('applying the same deltas twice yields the same document', () => {
    const deltas = [
      { kind: 'confessional', configId: C, userId: 'u1', channelId: 'c1', name: 'reece-confessional', at: 'T0' },
      { kind: 'category', bucket: 'confessional', configId: C, categoryId: 'cat1' },
      { kind: 'oneonone', pairKey: '1_2', channelId: 'p1', name: 'a-b', a: '1', b: '2', tribeRoleId: 'r1', at: 'T0' },
      { kind: 'playerRole', userId: 'u1', roleId: 'role1' }
    ];
    const a = {}; applyDeltas(a, G, deltas);
    const b = {}; applyDeltas(b, G, deltas); applyDeltas(b, G, deltas);
    assert.deepEqual(b, a);
  });

  it('preserves the original createdAt when a channel is re-recorded', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'confessional', configId: C, userId: 'u1', channelId: 'c1', name: 'old', at: 'T0' }]);
    applyDeltas(pd, G, [{ kind: 'confessional', configId: C, userId: 'u1', channelId: 'c1', name: 'new', at: 'T9' }]);
    assert.equal(pd[G].channelAdmin[C].confessionals.u1.createdAt, 'T0');
    assert.equal(pd[G].channelAdmin[C].confessionals.u1.name, 'new');
  });

  it('does not duplicate a category id', () => {
    const pd = {};
    const d = { kind: 'category', bucket: 'confessional', configId: C, categoryId: 'cat1' };
    applyDeltas(pd, G, [d, d, d]);
    assert.deepEqual(pd[G].channelAdmin[C].categories.confessional, ['cat1']);
  });
});

describe('channelRegistry — scoping', () => {
  it('confessionals/subs are season-scoped (two seasons never collide)', () => {
    const pd = {};
    applyDeltas(pd, G, [
      { kind: 'confessional', configId: 'config_A', userId: 'u1', channelId: 'cA', name: 'a' },
      { kind: 'confessional', configId: 'config_B', userId: 'u1', channelId: 'cB', name: 'b' }
    ]);
    assert.equal(pd[G].channelAdmin.config_A.confessionals.u1.channelId, 'cA');
    assert.equal(pd[G].channelAdmin.config_B.confessionals.u1.channelId, 'cB');
  });

  it('1on1s are GUILD-scoped by pairKey — the same pair in two tribes adopts, never duplicates', () => {
    // Keyed per-tribe, a swapped pair would create a second channel. This is the guard.
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'oneonone', pairKey: '1_2', channelId: 'chan1', name: 'a-b', a: '1', b: '2', tribeRoleId: 'tribeOld' }]);
    applyDeltas(pd, G, [{ kind: 'oneonone', pairKey: '1_2', channelId: 'chan1', name: 'a-b', a: '1', b: '2', tribeRoleId: 'tribeNew' }]);
    assert.equal(Object.keys(pd[G].channelAdmin.oneOnOnes).length, 1);
    assert.equal(pd[G].channelAdmin.oneOnOnes['1_2'].tribeRoleId, 'tribeNew');
    assert.equal(pd[G].channelAdmin.oneOnOnes['1_2'].channelId, 'chan1');
  });

  it('subs and confessionals occupy separate buckets for the same user', () => {
    const pd = {};
    applyDeltas(pd, G, [
      { kind: 'confessional', configId: C, userId: 'u1', channelId: 'c1', name: 'x-confessional' },
      { kind: 'subs', configId: C, userId: 'u1', channelId: 'c2', name: 'x-subs' }
    ]);
    assert.equal(pd[G].channelAdmin[C].confessionals.u1.channelId, 'c1');
    assert.equal(pd[G].channelAdmin[C].subs.u1.channelId, 'c2');
  });
});

describe('channelRegistry — playerRole lifecycle', () => {
  it('sets a player role alongside existing player data', () => {
    const pd = { [G]: { players: { u1: { age: 25, vanityRoles: ['v1'] } } } };
    applyDeltas(pd, G, [{ kind: 'playerRole', userId: 'u1', roleId: 'role1' }]);
    assert.equal(pd[G].players.u1.playerRoleId, 'role1');
    assert.equal(pd[G].players.u1.age, 25, 'must not clobber existing player fields');
    assert.deepEqual(pd[G].players.u1.vanityRoles, ['v1']);
  });

  it('roleId:null CLEARS a dead role pointer (never reference a deleted role)', () => {
    const pd = { [G]: { players: { u1: { playerRoleId: 'gone' } } } };
    applyDeltas(pd, G, [{ kind: 'playerRole', userId: 'u1', roleId: null }]);
    assert.equal('playerRoleId' in pd[G].players.u1, false);
  });
});

describe('channelRegistry — trustedSpectator', () => {
  it('stores beside globalRoleAccess without disturbing it', () => {
    const pd = { [G]: { permissions: { globalRoleAccess: ['host1'] } } };
    applyDeltas(pd, G, [{ kind: 'trustedSpectator', roleId: 'spec1' }]);
    assert.equal(pd[G].permissions.trustedSpectatorRoleId, 'spec1');
    assert.deepEqual(pd[G].permissions.globalRoleAccess, ['host1']);
  });

  it('clears when roleId is null', () => {
    const pd = { [G]: { permissions: { trustedSpectatorRoleId: 'spec1' } } };
    applyDeltas(pd, G, [{ kind: 'trustedSpectator', roleId: null }]);
    assert.equal('trustedSpectatorRoleId' in pd[G].permissions, false);
  });
});

describe('channelRegistry — appConvert preserves the status signals a rename would destroy', () => {
  // withdrawn/submitted are derived ONLY from the LIVE channel name (playerStatus.js:74-75).
  // Renaming ☑️x-app → x-subs erases them, so the signals must be persisted as data first.
  it('stamps completedAt + preConvertChannelName before the rename', () => {
    const pd = { [G]: { applications: { ch1: { userId: 'u1', castingStatus: 'cast' } } } };
    applyDeltas(pd, G, [{ kind: 'appConvert', channelId: 'ch1', completedAt: 'T1', preConvertChannelName: '☑️reece-app', convertedToSubsAt: 'T1' }]);
    const app = pd[G].applications.ch1;
    assert.equal(app.completedAt, 'T1', 'without this the ☑️ signal is lost forever');
    assert.equal(app.preConvertChannelName, '☑️reece-app');
    assert.equal(app.convertedToSubsAt, 'T1');
  });

  it('never overwrites an existing completedAt', () => {
    const pd = { [G]: { applications: { ch1: { completedAt: 'ORIGINAL' } } } };
    applyDeltas(pd, G, [{ kind: 'appConvert', channelId: 'ch1', completedAt: 'T2' }]);
    assert.equal(pd[G].applications.ch1.completedAt, 'ORIGINAL');
  });

  it('is a safe no-op when the application record is gone', () => {
    const pd = { [G]: { applications: {} } };
    assert.doesNotThrow(() => applyDeltas(pd, G, [{ kind: 'appConvert', channelId: 'missing', completedAt: 'T1' }]));
  });
});

describe('channelRegistry — remove', () => {
  it('removes a confessional entry by userId', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'confessional', configId: C, userId: 'u1', channelId: 'c1', name: 'n' }]);
    applyDeltas(pd, G, [{ kind: 'remove', bucket: 'confessional', configId: C, key: 'u1' }]);
    assert.deepEqual(pd[G].channelAdmin[C].confessionals, {});
  });

  it('removes a 1on1 entry by pairKey', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'oneonone', pairKey: '1_2', channelId: 'p1', name: 'a-b', a: '1', b: '2' }]);
    applyDeltas(pd, G, [{ kind: 'remove', bucket: 'oneonone', key: '1_2' }]);
    assert.deepEqual(pd[G].channelAdmin.oneOnOnes, {});
  });
});

describe('channelRegistry — makeDeltaBuffer', () => {
  it('drains to empty', () => {
    const b = makeDeltaBuffer();
    b.push({ kind: 'a' }, { kind: 'b' });
    assert.equal(b.size(), 2);
    assert.equal(b.drain().length, 2);
    assert.equal(b.size(), 0);
  });

  it('drops falsy deltas (resolvePrincipal returns null when there is nothing to clear)', () => {
    const b = makeDeltaBuffer();
    b.push(null, { kind: 'a' }, undefined);
    assert.equal(b.size(), 1);
  });

  it('re-pushing after a failed flush preserves order for the retry', () => {
    const b = makeDeltaBuffer();
    b.push({ kind: 'a' }, { kind: 'b' });
    const drained = b.drain();
    b.push(...drained);          // simulate flush failure → re-push
    b.push({ kind: 'c' });
    assert.deepEqual(b.drain().map(d => d.kind), ['a', 'b', 'c']);
  });
});

describe('channelRegistry — 📨 broadcast draft', () => {
  it('the draft is season-scoped and survives a restart (it is persisted, not in memory)', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: C, patch: { title: 'Tribal', content: 'Vote' } }]);
    assert.equal(pd[G].channelAdmin[C].broadcast.title, 'Tribal');
  });

  it('editing the message MERGES — it must not wipe the selected targets', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: C, patch: { targets: ['c1', 'c2'] } }]);
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: C, patch: { title: 'T', content: 'Body' } }]);
    const b = pd[G].channelAdmin[C].broadcast;
    assert.deepEqual(b.targets, ['c1', 'c2'], 'an edit must preserve the channel selection');
    assert.equal(b.content, 'Body');
  });

  it('re-picking targets MERGES — it must not wipe the composed message', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: C, patch: { title: 'T', content: 'Body' } }]);
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: C, patch: { targets: ['c3'] } }]);
    const b = pd[G].channelAdmin[C].broadcast;
    assert.equal(b.content, 'Body');
    assert.deepEqual(b.targets, ['c3']);
  });

  it('clearing the select stores an empty target list', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: C, patch: { targets: ['c1'] } }]);
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: C, patch: { targets: [] } }]);
    assert.deepEqual(pd[G].channelAdmin[C].broadcast.targets, []);
  });

  it('two seasons keep separate drafts', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: 'config_A', patch: { content: 'A' } }]);
    applyDeltas(pd, G, [{ kind: 'broadcast', configId: 'config_B', patch: { content: 'B' } }]);
    assert.equal(pd[G].channelAdmin.config_A.broadcast.content, 'A');
    assert.equal(pd[G].channelAdmin.config_B.broadcast.content, 'B');
  });
});

describe('channelRegistry — lastRun', () => {
  it('records the run summary per action', () => {
    const pd = {};
    applyDeltas(pd, G, [{ kind: 'lastRun', configId: C, action: 'confessionals', summary: { created: 9, skipped: 1, failed: 0 } }]);
    assert.deepEqual(pd[G].channelAdmin[C].lastRun.confessionals, { created: 9, skipped: 1, failed: 0 });
  });
});
