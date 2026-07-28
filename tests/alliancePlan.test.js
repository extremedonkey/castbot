/**
 * 🤐 Alliances (RaP 0892) — pure planning helpers, modal structure, registry deltas, and
 * the channelOps leak guards. Imports the REAL functions (channelPlan.test.js convention).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  newAllianceId, allianceChannelName, assessTribeAlignment, diffMembers,
  parseAllianceCustomId, normalizeNotify
} from '../src/channels/alliancePlan.js';
import { applyDeltas } from '../src/channels/channelRegistry.js';
import { ensureChannel, removeAccess } from '../src/channels/channelOps.js';
import {
  buildAllianceManager, buildAllianceModal, buildRemoveMembersModal,
  buildAllianceRequestModal, buildAllianceRequestCard
} from '../src/channels/allianceView.js';

// Worst-case configId shape seen in production data.
const CID = 'config_1751549410029_391415444084490240';
const AID = 'mcgx1z2a';

describe('Alliances — ids and naming', () => {
  it('newAllianceId is base36 with no underscores (custom_id parseability)', () => {
    const id = newAllianceId();
    assert.match(id, /^[a-z0-9]+$/);
    assert.ok(!id.includes('_'));
  });

  it('allianceChannelName defaults to the generic name for blank/unsluggable input', () => {
    assert.equal(allianceChannelName(''), 'alliance');
    assert.equal(allianceChannelName('   '), 'alliance');
    assert.equal(allianceChannelName(null), 'alliance');
    assert.equal(allianceChannelName('🦍🦍🦍'), 'alliance', 'emoji-only must NOT become player-XXXX');
  });

  it('allianceChannelName slugs custom input without leaking structure', () => {
    assert.equal(allianceChannelName('Secret Six!'), 'secret-six');
    assert.equal(allianceChannelName('José & Bob'), 'jose-bob');
    assert.ok(allianceChannelName('x'.repeat(200)).length <= 90);
  });

  it('normalizeNotify falls back to the secrecy-safe silent', () => {
    assert.equal(normalizeNotify('announce'), 'announce');
    assert.equal(normalizeNotify('announce_requestor'), 'announce_requestor');
    assert.equal(normalizeNotify('nonsense'), 'silent');
    assert.equal(normalizeNotify(undefined), 'silent');
  });
});

describe('Alliances — same-tribe warning guard (warn, never enforce)', () => {
  const m = (userId, tribeNames) => ({ userId, displayName: `p${userId}`, tribeNames });

  it('single-tribe alliance is aligned', () => {
    const r = assessTribeAlignment([m('1', ['Kansas']), m('2', ['Kansas'])]);
    assert.equal(r.aligned, true);
    assert.deepEqual(r.tribesSpanned, ['Kansas']);
    assert.deepEqual(r.warnings, []);
  });

  it('cross-tribe members get cross_tribe warnings against the majority tribe', () => {
    const r = assessTribeAlignment([m('1', ['Kansas']), m('2', ['Kansas']), m('3', ['Oregon'])]);
    assert.equal(r.aligned, false);
    assert.deepEqual(r.tribesSpanned, ['Kansas', 'Oregon']);
    assert.deepEqual(r.warnings, [{ userId: '3', displayName: 'p3', reason: 'cross_tribe' }]);
  });

  it('a tribe-less member warns no_tribe even when everyone else matches', () => {
    const r = assessTribeAlignment([m('1', ['Kansas']), m('2', [])]);
    assert.equal(r.aligned, false);
    assert.deepEqual(r.warnings, [{ userId: '2', displayName: 'p2', reason: 'no_tribe' }]);
  });

  it('a member in BOTH spanned tribes is not warned (they bridge the anchor)', () => {
    const r = assessTribeAlignment([m('1', ['Kansas']), m('2', ['Kansas', 'Oregon']), m('3', ['Kansas'])]);
    assert.equal(r.aligned, true, 'Kansas is the anchor and everyone includes it');
  });

  it('empty input is aligned (no warnings, nothing spanned)', () => {
    const r = assessTribeAlignment([]);
    assert.equal(r.aligned, true);
    assert.deepEqual(r.tribesSpanned, []);
  });
});

describe('Alliances — diffMembers', () => {
  it('diffs by userId across snapshot objects and raw ids', () => {
    const d = diffMembers([{ userId: 'a' }, { userId: 'b' }], [{ userId: 'b' }, { userId: 'c' }]);
    assert.deepEqual(d, { added: ['c'], removed: ['a'], kept: ['b'] });
  });

  it('handles empty sides', () => {
    assert.deepEqual(diffMembers([], [{ userId: 'x' }]).added, ['x']);
    assert.deepEqual(diffMembers([{ userId: 'x' }], []).removed, ['x']);
  });
});

describe('Alliances — custom_id taxonomy round-trips (worst-case configId)', () => {
  const cases = [
    [`channels_alliances_${CID}`, { verb: 'manager', configId: CID }],
    [`channels_alliance_select_${CID}`, { verb: 'select', configId: CID }],
    [`channels_alliance_new_${CID}`, { verb: 'new', configId: CID }],
    [`channels_alliance_edit_${AID}_${CID}`, { verb: 'edit', allianceId: AID, configId: CID }],
    [`channels_alliance_members_${AID}_${CID}`, { verb: 'members', allianceId: AID, configId: CID }],
    [`channels_alliance_delete_${AID}_${CID}`, { verb: 'delete', allianceId: AID, configId: CID }],
    [`channels_alliance_review_${AID}`, { verb: 'review', requestId: AID }],
    [`channels_alliance_modal_new_${CID}`, { verb: 'modal', mode: 'new', configId: CID }],
    [`channels_alliance_modal_r${AID}_${CID}`, { verb: 'modal', mode: 'request', requestId: AID, configId: CID }],
    [`channels_alliance_modal_e${AID}_${CID}`, { verb: 'modal', mode: 'edit', allianceId: AID, configId: CID }],
    [`channels_alliance_modal_m${AID}_${CID}`, { verb: 'modal', mode: 'members', allianceId: AID, configId: CID }],
    [`alliance_request_modal_${CID}`, { verb: 'request_submit', configId: CID }]
  ];

  it('parses every id in the taxonomy', () => {
    for (const [id, expected] of cases) {
      assert.deepEqual(parseAllianceCustomId(id), expected, id);
    }
  });

  it('every id stays within Discord\'s 100-char custom_id limit', () => {
    for (const [id] of cases) assert.ok(id.length <= 100, `${id} is ${id.length}`);
  });

  it('rejects foreign ids instead of misparsing them', () => {
    for (const id of [`channels_confessionals_${CID}`, 'channels_exec_tok', 'season_channels_x', 'garbage', null]) {
      assert.equal(parseAllianceCustomId(id), null, String(id));
    }
  });

  it('the manager id (alliances_) never parses as an action (alliance_)', () => {
    assert.equal(parseAllianceCustomId(`channels_alliances_${CID}`).verb, 'manager');
    assert.ok(!`channels_alliances_${CID}`.startsWith('channels_alliance_'));
  });
});

describe('Alliances — registry deltas (applyDeltas, real import)', () => {
  const fresh = () => ({});

  it('alliance patch-merges and preserves createdAt across re-records', () => {
    const doc = fresh();
    applyDeltas(doc, 'g1', [{ kind: 'alliance', allianceId: AID, patch: { name: 'alliance', channelId: 'c1', members: [], createdAt: '2026-01-01T00:00:00.000Z' } }]);
    applyDeltas(doc, 'g1', [{ kind: 'alliance', allianceId: AID, patch: { name: 'renamed', channelId: 'c1' } }]);
    const a = doc.g1.channelAdmin.alliances[AID];
    assert.equal(a.name, 'renamed');
    assert.equal(a.createdAt, '2026-01-01T00:00:00.000Z', 'createdAt must survive the patch');
    assert.ok(a.updatedAt, 'updatedAt stamps on every patch');
  });

  it('allianceCategory dedupes', () => {
    const doc = fresh();
    applyDeltas(doc, 'g1', [
      { kind: 'allianceCategory', categoryId: 'cat1' },
      { kind: 'allianceCategory', categoryId: 'cat1' },
      { kind: 'allianceCategory', categoryId: 'cat2' }
    ]);
    assert.deepEqual(doc.g1.channelAdmin.allianceCategories, ['cat1', 'cat2']);
  });

  it('allianceRemove deletes the entry', () => {
    const doc = fresh();
    applyDeltas(doc, 'g1', [{ kind: 'alliance', allianceId: AID, patch: { channelId: 'c1' } }]);
    applyDeltas(doc, 'g1', [{ kind: 'allianceRemove', allianceId: AID }]);
    assert.equal(doc.g1.channelAdmin.alliances[AID], undefined);
  });

  it('allianceRequest transitions open → fulfilled without losing the request body', () => {
    const doc = fresh();
    applyDeltas(doc, 'g1', [{ kind: 'allianceRequest', requestId: 'r1', patch: { requesterId: 'u1', members: [{ userId: 'u2' }], status: 'open' } }]);
    applyDeltas(doc, 'g1', [{ kind: 'allianceRequest', requestId: 'r1', patch: { status: 'fulfilled', allianceId: AID } }]);
    const r = doc.g1.channelAdmin.allianceRequests.r1;
    assert.equal(r.status, 'fulfilled');
    assert.equal(r.allianceId, AID);
    assert.equal(r.requesterId, 'u1', 'patch-merge must keep the original body');
  });

  it('is idempotent — applying the same deltas twice yields the same document', () => {
    const deltas = [
      { kind: 'alliance', allianceId: AID, patch: { name: 'alliance', channelId: 'c1', createdAt: 'X' } },
      { kind: 'allianceCategory', categoryId: 'cat1' }
    ];
    const once = fresh(); applyDeltas(once, 'g1', deltas);
    const twice = fresh(); applyDeltas(twice, 'g1', deltas); applyDeltas(twice, 'g1', deltas);
    // updatedAt re-stamps, so compare everything except it.
    const strip = (d) => JSON.parse(JSON.stringify(d, (k, v) => (k === 'updatedAt' ? undefined : v)));
    assert.deepEqual(strip(twice), strip(once));
  });
});

describe('Alliances — channelOps leak guards (stubbed guild)', () => {
  const orphan = { id: 'orphan1', name: 'alliance', parentId: 'cat1', permissionOverwrites: { cache: new Map() } };
  const snapshotWithOrphan = {
    channels: new Map(),
    categories: [],
    findByName: (name, parentId) => (name === 'alliance' && parentId === 'cat1' ? orphan : null),
    hasRole: () => false
  };
  const stubGuild = { channels: { create: async (opts) => ({ id: 'new1', name: opts.name, permissionOverwrites: { cache: new Map() } }), fetch: async () => null } };

  it('adoptByName: false CREATES even when a same-named channel exists (the leak guard)', async () => {
    const { action, channel } = await ensureChannel(stubGuild, {
      registryId: null, adoptByName: false, name: 'alliance', parentId: 'cat1', overwrites: [], snapshot: snapshotWithOrphan
    });
    assert.equal(action, 'created');
    assert.equal(channel.id, 'new1', 'must NOT merge into the existing alliance channel');
  });

  it('default adoptByName still adopts (existing behavior unchanged)', async () => {
    const { action, channel } = await ensureChannel(stubGuild, {
      registryId: null, name: 'alliance', parentId: 'cat1', overwrites: [], snapshot: snapshotWithOrphan
    });
    assert.equal(action, 'adopted');
    assert.equal(channel.id, 'orphan1');
  });

  it('removeAccess deletes present overwrites, skips absent, survives a throwing delete', async () => {
    const deleted = [];
    const channel = {
      name: 'alliance',
      permissionOverwrites: {
        cache: new Map([['u1', {}], ['boom', {}]]),
        delete: async (id) => {
          if (id === 'boom') throw new Error('nope');
          deleted.push(id);
        }
      }
    };
    const r = await removeAccess(channel, ['u1', 'absent', 'boom', null]);
    assert.deepEqual(deleted, ['u1']);
    assert.equal(r.removed, 1);
    assert.equal(r.skipped, 1, 'absent id skipped without an API call');
  });
});

describe('Alliances — modal structure (Discord silently rejects violations)', () => {
  const allianceModals = () => {
    const alliance = {
      name: 'alliance', channelId: 'c1', categoryId: 'cat1', notify: 'announce',
      requestedBy: 'u9', members: [{ userId: 'u1', displayName: 'Alice' }, { userId: 'u2', displayName: 'Bob' }]
    };
    return [
      ['new', buildAllianceModal({ configId: CID, mode: 'new' })],
      ['request', buildAllianceModal({ configId: CID, mode: 'request', requestId: AID, prefillMembers: alliance.members })],
      ['edit', buildAllianceModal({ configId: CID, mode: 'edit', allianceId: AID, alliance })],
      ['members', buildRemoveMembersModal({ configId: CID, allianceId: AID, alliance })],
      ['player-request', buildAllianceRequestModal({ configId: CID })]
    ];
  };

  it('every modal has ≤5 top-level components, each Label (18) or Text Display (10)', () => {
    for (const [name, m] of allianceModals()) {
      assert.ok(m.components.length <= 5, `${name}: ${m.components.length} top-level components`);
      for (const c of m.components) assert.ok(c.type === 18 || c.type === 10, `${name}: top-level type ${c.type}`);
    }
  });

  it('every modal states the review-before-anything-happens promise', () => {
    for (const [name, m] of allianceModals()) {
      const text = m.components.filter((c) => c.type === 10).map((c) => c.content).join('\n');
      assert.match(text, /review/i, `${name} must tell the user a review step follows`);
    }
  });

  it('Label limits: label ≤45, description ≤100 (an over-long one rejects the whole modal)', () => {
    for (const [name, m] of allianceModals()) {
      for (const c of m.components) {
        if (c.type !== 18) continue;
        assert.ok(c.label.length <= 45, `${name}: label "${c.label}" > 45`);
        if (c.description) assert.ok(c.description.length <= 100, `${name} / "${c.label}": description ${c.description.length} > 100`);
      }
    }
  });

  it('custom_ids stay ≤100 at the worst-case configId', () => {
    for (const [name, m] of allianceModals()) {
      assert.ok(m.custom_id.length <= 100, `${name}: ${m.custom_id.length}`);
      for (const c of m.components) {
        if (c.type === 18) assert.ok(c.component.custom_id.length <= 100, `${name}: field id too long`);
      }
    }
  });

  it('Radio Groups put `default` on EXACTLY ONE option (a default:false sibling kills the group)', () => {
    for (const [name, m] of allianceModals()) {
      for (const c of m.components) {
        const inner = c.component;
        if (inner?.type !== 21) continue;
        const withKey = inner.options.filter((o) => 'default' in o);
        assert.equal(withKey.length, 1, `${name}/${inner.custom_id}: ${withKey.length} defaults`);
        assert.equal(withKey[0].default, true);
        assert.ok(inner.options.length >= 2 && inner.options.length <= 10);
      }
    }
  });

  it('String Selects appear only WITHOUT option defaults (modals ignore String Select defaults)', () => {
    for (const [name, m] of allianceModals()) {
      for (const c of m.components) {
        const inner = c.component;
        if (inner?.type !== 3) continue;
        assert.ok(inner.options.every((o) => !('default' in o)), `${name}: String Select defaults are dead in modals`);
      }
    }
  });

  it('notify hides the requestor option unless the alliance came from a request', () => {
    const values = (m) => m.components.find((c) => c.component?.custom_id === 'notify').component.options.map((o) => o.value);
    assert.deepEqual(values(buildAllianceModal({ configId: CID, mode: 'new' })), ['silent', 'announce']);
    assert.ok(values(buildAllianceModal({ configId: CID, mode: 'request', requestId: AID })).includes('announce_requestor'));
  });

  it('the category picker filters to categories only', () => {
    const m = buildAllianceModal({ configId: CID, mode: 'new' });
    const cat = m.components.find((c) => c.component?.custom_id === 'category').component;
    assert.equal(cat.type, 8);
    assert.deepEqual(cat.channel_types, [4]);
  });
});

describe('Alliances — manager + request card structure', () => {
  it('manager renders disabled actions with no selection, enabled with one', () => {
    const alliances = { [AID]: { name: 'alliance', channelId: 'c1', members: [{ userId: 'u1', displayName: 'Alice' }], createdBy: 'u9', createdAt: '2026-01-01T00:00:00.000Z' } };
    const flatten = (c) => [c, ...(c.components || []).flatMap(flatten)];

    const none = buildAllianceManager({ configId: CID, seasonName: 'S1', alliances, requests: {} });
    const noneButtons = flatten(none.components[0]).filter((c) => c.type === 2);
    const disabledIds = noneButtons.filter((b) => b.disabled).map((b) => b.custom_id);
    assert.equal(disabledIds.length, 3, 'Edit/Remove/Delete disabled without a selection');
    assert.ok(noneButtons.find((b) => b.custom_id === `channels_alliance_new_${CID}` && !b.disabled), 'New always enabled');

    const sel = buildAllianceManager({ configId: CID, seasonName: 'S1', alliances, requests: {}, selectedId: AID });
    const selButtons = flatten(sel.components[0]).filter((c) => c.type === 2);
    assert.ok(selButtons.find((b) => b.custom_id === `channels_alliance_edit_${AID}_${CID}` && !b.disabled), 'Edit carries the allianceId when enabled');
    const select = flatten(sel.components[0]).find((c) => c.type === 3);
    assert.equal(select.options.find((o) => o.value === AID).default, true, 'selection re-marked via option default');
  });

  it('zero alliances → disabled placeholder select (castlist_hub pattern), New still enabled', () => {
    const view = buildAllianceManager({ configId: CID, seasonName: 'S1', alliances: {}, requests: {} });
    const flatten = (c) => [c, ...(c.components || []).flatMap(flatten)];
    const select = flatten(view.components[0]).find((c) => c.type === 3);
    assert.equal(select.disabled, true);
  });

  it('request card carries the Review button and suppresses pings', () => {
    const card = buildAllianceRequestCard({ requestId: AID, requesterId: 'u1', requesterName: 'Alice', members: [{ userId: 'u2', displayName: 'Bob' }] });
    assert.deepEqual(card.allowed_mentions, { parse: [] }, 'the public card must not ping anyone');
    const flatten = (c) => [c, ...(c.components || []).flatMap(flatten)];
    const btn = flatten(card.components[0]).find((c) => c.type === 2);
    assert.equal(btn.custom_id, `channels_alliance_review_${AID}`);
  });

  it('mention syntax in user-controlled names is neutralized (factory strips allowed_mentions in transit)', () => {
    const card = buildAllianceRequestCard({
      requestId: AID, requesterId: 'u1', requesterName: '@everyone',
      members: [{ userId: 'u2', displayName: '<@&123456789012345678>' }]
    });
    const text = card.components[0].components.filter((c) => c.type === 10).map((c) => c.content).join('\n');
    assert.ok(!text.includes('@everyone'), 'raw @everyone must not survive into the public card');
    assert.ok(!/<@&\d+>/.test(text), 'raw role-mention tokens must not survive');
  });
});
