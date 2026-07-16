/**
 * Channel Administration — the hidden Channels tab's gating + roster resolution.
 *
 * The nav row/gate are imported for real (seasonSelector pulls in storage.js, but only for
 * functions these tests don't call). The roster's ACCEPTED rule is exercised against the REAL
 * status engine, since that engine is the whole reason the roster is correct.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonNavRow, seasonManagerHeader, isChannelAdmin } from '../seasonSelector.js';
import { buildStatusSignals, deriveStatus } from '../playerStatus.js';
import { ACCEPTED_STATUS_IDS } from '../src/channels/channelRoster.js';
import { CHANNEL_ADMIN_USER_IDS } from '../src/channels/channelAdminConfig.js';

const REECE = '391415444084490240';
const OTHER_ADMIN = '1086246253819613274';
const RANDOM = '999999999999999999';
const CID = 'config_123';

describe('Channels tab — isChannelAdmin gate', () => {
  it('admits exactly the two whitelisted IDs', () => {
    assert.equal(isChannelAdmin(REECE), true);
    assert.equal(isChannelAdmin(OTHER_ADMIN), true);
    assert.deepEqual(CHANNEL_ADMIN_USER_IDS, [REECE, OTHER_ADMIN]);
  });

  it('rejects everyone else, including falsy inputs', () => {
    assert.equal(isChannelAdmin(RANDOM), false);
    assert.equal(isChannelAdmin(undefined), false);
    assert.equal(isChannelAdmin(null), false);
    assert.equal(isChannelAdmin(''), false);
    assert.equal(isChannelAdmin('0'), false);
  });

  it('does not admit a numeric near-miss or a substring', () => {
    assert.equal(isChannelAdmin('39141544408449024'), false);  // one digit short
    assert.equal(isChannelAdmin(`${REECE}0`), false);
  });
});

describe('Channels tab — nav row visibility', () => {
  it('renders the classic 4 tabs with no userId (every existing caller)', () => {
    const row = buildSeasonNavRow(CID, 'apps');
    assert.equal(row.components.length, 4);
    assert.deepEqual(row.components.map(b => b.label), ['Apps', 'Planner', 'Casting', 'Marooning']);
  });

  it('hides Channels from a non-whitelisted admin', () => {
    const row = buildSeasonNavRow(CID, 'apps', RANDOM);
    assert.equal(row.components.length, 4);
    assert.ok(!row.components.some(b => b.label === 'Channels'));
  });

  it('shows Channels LAST for a whitelisted user', () => {
    for (const uid of [REECE, OTHER_ADMIN]) {
      const row = buildSeasonNavRow(CID, 'apps', uid);
      assert.equal(row.components.length, 5);
      assert.equal(row.components[4].label, 'Channels');
      assert.equal(row.components[4].custom_id, `season_channels_${CID}`);
      assert.equal(row.components[4].emoji.name, '🔐');
    }
  });

  it('NEVER exceeds Discord\'s hard 5-button ActionRow limit', () => {
    for (const active of ['apps', 'planner', 'ranking', 'marooning', 'channels']) {
      assert.ok(buildSeasonNavRow(CID, active, REECE).components.length <= 5, `${active} row overflowed`);
    }
  });

  it('shades the active Channels tab Primary and the rest Secondary', () => {
    const row = buildSeasonNavRow(CID, 'channels', REECE);
    const channels = row.components.find(b => b.label === 'Channels');
    assert.equal(channels.style, 1, 'active tab is Primary/blue');
    assert.deepEqual(row.components.filter(b => b.label !== 'Channels').map(b => b.style), [2, 2, 2, 2]);
  });

  it('keeps the tab order stable — Channels never displaces an existing tab', () => {
    const four = buildSeasonNavRow(CID, 'apps').components.map(b => b.custom_id);
    const five = buildSeasonNavRow(CID, 'apps', REECE).components.map(b => b.custom_id);
    assert.deepEqual(five.slice(0, 4), four);
  });
});

describe('Channels tab — header', () => {
  it('has its own title (else it falls back to the generic Season Manager)', () => {
    assert.equal(seasonManagerHeader('channels', 'S15').content, '## 🔐 Channels\n> ### S15');
  });

  it('still renders the other tabs\' titles', () => {
    assert.match(seasonManagerHeader('marooning', 'S15').content, /🚣 Marooning/);
  });
});

describe('Channels tab — Edit-origin custom_id round trip', () => {
  // app.js:11743 — if this regex doesn't know 'channels', Edit-from-Channels silently
  // refreshes the Apps tab instead.
  const EDIT_RE = /^(apps|planner|ranking|marooning|channels)_(.+)$/;

  it('parses a channels origin', () => {
    const m = `channels_${CID}`.match(EDIT_RE);
    assert.equal(m[1], 'channels');
    assert.equal(m[2], CID);
  });

  it('still parses every pre-existing origin', () => {
    for (const mode of ['apps', 'planner', 'ranking', 'marooning']) {
      assert.equal(`${mode}_${CID}`.match(EDIT_RE)[1], mode);
    }
  });

  it('a bare configId (legacy button) does not match, falling back to apps', () => {
    assert.equal(CID.match(EDIT_RE), null);
  });

  it('custom_ids stay within Discord\'s 100-char limit at worst case', () => {
    const worst = `config_1751549410029_${'9'.repeat(19)}`;
    assert.ok(`season_channels_${worst}`.length <= 100);
    assert.ok(`season_edit_info_channels_${worst}`.length <= 100);
    assert.ok(`channels_confessionals_${worst}`.length <= 100);
  });
});

describe('Channels roster — ACCEPTED via the real status engine', () => {
  const status = (app, chan = '☑️x-app') => deriveStatus(buildStatusSignals({ app, liveChannelName: chan })).statusId;
  const accepted = (app, chan) => ACCEPTED_STATUS_IDS.has(status(app, chan));

  it('includes a Cast player — the only signal with real production data', () => {
    assert.equal(accepted({ castingStatus: 'cast', completedAt: 'x' }), true);
  });

  it('includes an accepted placement', () => {
    assert.equal(accepted({ placementResponse: 'accepted' }), true);
  });

  it('includes an alternate who ACCEPTED (the accepted_alt row)', () => {
    assert.equal(status({ placementResponse: 'accepted_alternative', castingStatus: 'alternative' }), 'accepted_alt');
    assert.equal(accepted({ placementResponse: 'accepted_alternative', castingStatus: 'alternative' }), true);
  });

  it('EXCLUDES a withdrawn player even when they are Cast — withdrawn wins by precedence', () => {
    // Withdrawal has no data field: it lives only in the ✖️ prefix of the LIVE channel name.
    assert.equal(status({ castingStatus: 'cast', completedAt: 'x' }, '✖️reece-app'), 'withdrawn');
    assert.equal(accepted({ castingStatus: 'cast', completedAt: 'x' }, '✖️reece-app'), false);
  });

  it('excludes rejected, alternate-not-accepted, declined and undecided', () => {
    assert.equal(accepted({ castingStatus: 'reject' }), false);
    assert.equal(accepted({ castingStatus: 'alternative' }), false);
    assert.equal(accepted({ placementResponse: 'declined' }), false);
    assert.equal(accepted({ completedAt: 'x' }), false);
  });

  it('excludes legacy castingStatus:"tentative" (15 such records exist; removed in RaP 0902)', () => {
    assert.equal(accepted({ castingStatus: 'tentative', completedAt: 'x' }), false);
  });

  it('excludes a non-applicant', () => {
    assert.equal(deriveStatus(buildStatusSignals({ app: null })).statusId, 'none');
    assert.equal(accepted(null), false);
  });

  it('survives conversion to subs — a converted channel name still resolves as Cast', () => {
    // After convert-to-subs the live name is "reece-subs" (no ☑️), so `submitted` is false.
    // castingStatus still carries the roster, and completedAt (stamped pre-rename) preserves
    // the lifecycle signal. Without that stamp this player would fall to 'new'.
    assert.equal(status({ castingStatus: 'cast', completedAt: 'T1' }, 'reece-subs'), 'cast');
    assert.equal(status({ completedAt: 'T1' }, 'reece-subs'), 'complete');
    assert.equal(status({}, 'reece-subs'), 'new', 'without completedAt the signal would be lost');
  });
});

describe('Channels roster — one entry per PLAYER, not per application', () => {
  // A user can hold several application records in one season (observed on the test box:
  // 3 records, all the same userId). Channels are per-player, so the roster must collapse them —
  // otherwise one person reads as several and "Create 2 confessionals" yields 1 channel.
  // Inline replica of channelRoster.outranks() + the collapse loop.
  function outranks(status, app, prevStatus, prevApp) {
    if (status.statusId === 'withdrawn') return true;
    if (prevStatus.statusId === 'withdrawn') return false;
    const stage = status.stage ?? -1;
    const prevStage = prevStatus.stage ?? -1;
    if (stage !== prevStage) return stage > prevStage;
    return String(app.createdAt || '') > String(prevApp.createdAt || '');
  }
  const collapse = (apps, chan = '☑️x-app') => {
    const byUser = new Map();
    for (const app of apps) {
      const status = deriveStatus(buildStatusSignals({ app, liveChannelName: app._chan || chan }));
      const prev = byUser.get(app.userId);
      if (!prev || outranks(status, app, prev.status, prev.app)) byUser.set(app.userId, { app, status });
    }
    return byUser;
  };
  const acceptedCount = (m) => [...m.values()].filter(v => ACCEPTED_STATUS_IDS.has(v.status.statusId)).length;

  it('collapses the real test-box case: 3 records, one user → 1 player', () => {
    const m = collapse([
      { userId: 'R', channelId: 'a', createdAt: '2026-06-01', castingStatus: 'alternative', placementResponse: 'accepted' },
      { userId: 'R', channelId: 'b', createdAt: '2026-06-27', castingStatus: 'alternative', completedAt: 'x' },
      { userId: 'R', channelId: 'c', createdAt: '2026-06-27', completedAt: 'x' }
    ]);
    assert.equal(m.size, 1);
    assert.equal(acceptedCount(m), 1);
    assert.equal(m.get('R').app.channelId, 'a', 'the most committed record (stage 2) must win');
  });

  it('never double-counts one player with two accepted records', () => {
    const m = collapse([
      { userId: 'R', channelId: 'a', createdAt: '2026-06-01', castingStatus: 'cast' },
      { userId: 'R', channelId: 'b', createdAt: '2026-06-27', castingStatus: 'cast' }
    ]);
    assert.equal(acceptedCount(m), 1, 'one person is one confessional');
  });

  it('the player response (stage 2) outranks the admin draft (stage 1)', () => {
    const m = collapse([
      { userId: 'R', channelId: 'a', createdAt: '2026-06-01', castingStatus: 'cast' },
      { userId: 'R', channelId: 'b', createdAt: '2026-06-02', placementResponse: 'accepted' }
    ]);
    assert.equal(m.get('R').app.channelId, 'b');
  });

  it('a withdrawal wins even against a newer cast record, and drops the player', () => {
    const m = collapse([
      { userId: 'R', channelId: 'a', createdAt: '2026-06-01', _chan: '✖️r-app' },
      { userId: 'R', channelId: 'b', createdAt: '2026-06-27', castingStatus: 'cast' }
    ]);
    assert.equal(m.get('R').status.statusId, 'withdrawn');
    assert.equal(acceptedCount(m), 0);
  });

  it('breaks a same-stage tie with the newest record', () => {
    const m = collapse([
      { userId: 'R', channelId: 'old', createdAt: '2026-06-01', castingStatus: 'cast' },
      { userId: 'R', channelId: 'new', createdAt: '2026-06-27', castingStatus: 'reject' }
    ]);
    assert.equal(m.get('R').app.channelId, 'new');
    assert.equal(acceptedCount(m), 0);
  });

  it('keeps distinct users separate', () => {
    const m = collapse([
      { userId: 'A', channelId: 'a', castingStatus: 'cast' },
      { userId: 'B', channelId: 'b', castingStatus: 'cast' }
    ]);
    assert.equal(acceptedCount(m), 2);
  });
});

describe('📨 Msg Category — composer', () => {
  const CID = 'config_1751549410029_391415444084490240';
  const composer = async (draft) => {
    const V = await import('../src/channels/channelsView.js');
    return V.buildMsgComposer({ configId: CID, draft });
  };
  const flatten = (c) => c.components.flatMap(x => x.type === 1 ? x.components : [x]);

  it('targets with a Channel Select (type 8) — a Mentionable Select CANNOT list channels', async () => {
    const { components: [card] } = await composer({});
    const sel = flatten(card).find(c => c.type === 8 || c.type === 7);
    assert.equal(sel.type, 8, 'must be a Channel Select; type 7 cannot target channels/categories');
    assert.equal(sel.custom_id, `channels_msg_targets_${CID}`);
  });

  it('offers categories as well as text channels, capped at Discord\'s 25', async () => {
    const { components: [card] } = await composer({});
    const sel = flatten(card).find(c => c.type === 8);
    assert.deepEqual(sel.channel_types, [0, 4, 5], 'text · category · announcement');
    assert.ok(sel.channel_types.includes(4), 'categories must be selectable — the button is "Msg Category"');
    assert.equal(sel.max_values, 25);
  });

  it('disables Send until there is BOTH a message and at least one target', async () => {
    const send = async (draft) => flatten((await composer(draft)).components[0]).find(c => c.custom_id?.startsWith('channels_msg_send_'));
    assert.equal((await send({})).disabled, true, 'nothing at all');
    assert.equal((await send({ content: 'hi' })).disabled, true, 'message but no targets');
    assert.equal((await send({ targets: ['c1'] })).disabled, true, 'targets but no message');
    assert.ok(!(await send({ content: 'hi', targets: ['c1'] })).disabled, 'both → enabled');
    assert.ok(!(await send({ image: 'http://x/y.png', targets: ['c1'] })).disabled, 'image-only counts as a message');
  });

  it('Send is Danger-styled — it is irreversible and player-facing', async () => {
    const { components: [card] } = await composer({ content: 'hi', targets: ['c1'] });
    assert.equal(flatten(card).find(c => c.custom_id?.startsWith('channels_msg_send_')).style, 4);
  });

  it('warns that categories expand and that sending cannot be undone', async () => {
    const { components: [card] } = await composer({});
    const text = card.components.filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /categor/i, 'must explain category expansion');
    assert.match(text, /undone|cannot/i, 'must warn it is irreversible');
  });

  it('re-renders the saved targets (default_values DOES work in messages, unlike modals)', async () => {
    const { components: [card] } = await composer({ content: 'hi', targets: ['c1', 'c2'] });
    const sel = flatten(card).find(c => c.type === 8);
    assert.deepEqual(sel.default_values, [{ id: 'c1', type: 'channel' }, { id: 'c2', type: 'channel' }]);
  });

  it('renders the card itself, so the preview IS what gets posted', async () => {
    const { components: [card] } = await composer({ title: 'Tribal', content: 'Vote now', color: '#e74c3c' });
    assert.equal(card.type, 17);
    assert.equal(card.accent_color, 0xe74c3c);
    const text = card.components.filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /# Tribal/);
    assert.match(text, /Vote now/);
  });

  it('every custom_id stays within the 100-char limit', async () => {
    const { components: [card] } = await composer({ content: 'hi', targets: ['c1'] });
    for (const c of flatten(card)) {
      if (c.custom_id) assert.ok(c.custom_id.length <= 100, `${c.custom_id} is ${c.custom_id.length}`);
    }
  });
});

describe('📨 Msg Category — routing (prefix overlap is the risk here)', () => {
  const CID = 'config_1';
  // Replica of routeChannelsButton's dispatch order — the specific ids MUST be tested before
  // the bare `channels_msg_` composer prefix they all share.
  const dest = (id) => {
    if (id.startsWith('season_channels_')) return 'tab';
    if (id.startsWith('channels_cancel_')) return 'tab';
    if (id.startsWith('channels_exec_')) return 'exec';
    if (id.startsWith('channels_msg_')) {
      if (id.startsWith('channels_msg_edit_')) return 'editModal';
      if (id.startsWith('channels_msg_send_')) return 'planBroadcast';
      if (id.startsWith('channels_msg_targets_')) return 'saveTargets';
      return 'composer';
    }
    return 'actionModal';
  };

  it('routes each msg id to its own handler, never swallowing one into the composer', () => {
    assert.equal(dest(`channels_msg_${CID}`), 'composer');
    assert.equal(dest(`channels_msg_edit_${CID}`), 'editModal');
    assert.equal(dest(`channels_msg_send_${CID}`), 'planBroadcast');
    assert.equal(dest(`channels_msg_targets_${CID}`), 'saveTargets');
  });

  it('does not hijack the pre-existing action buttons', () => {
    for (const k of ['roles', 'playerroles', 'confessionals', 'subs', '1on1s']) {
      assert.equal(dest(`channels_${k}_${CID}`), 'actionModal');
    }
    assert.equal(dest(`season_channels_${CID}`), 'tab');
    assert.equal(dest(`channels_exec_tok`), 'exec');
  });

  it('only msg_edit opens a modal — the rest defer and update', () => {
    const MODAL_RE = /^channels_(roles|playerroles|confessionals|subs|1on1s|msg_edit)_/;
    assert.ok(MODAL_RE.test(`channels_msg_edit_${CID}`), 'edit must open a modal');
    for (const id of [`channels_msg_${CID}`, `channels_msg_send_${CID}`, `channels_msg_targets_${CID}`]) {
      assert.ok(!MODAL_RE.test(id), `${id} must NOT be requiresModal`);
    }
  });

  it('the modal submit id parses back to kind=msg', () => {
    const m = `channels_msg_modal_${CID}`.match(/^channels_(roles|playerroles|confessionals|subs|1on1s|msg)_modal_(.+)$/);
    assert.equal(m[1], 'msg');
    assert.equal(m[2], CID);
  });

  it('msg_edit is a button, not a modal submit (it has no _modal_ segment)', () => {
    assert.ok(!`channels_msg_edit_${CID}`.includes('_modal_'));
    assert.ok(`channels_msg_modal_${CID}`.includes('_modal_'));
  });
});

describe('Channels modals — Discord structural limits', () => {
  // These are the constraints that SILENTLY reject a modal at runtime — Discord just says
  // "This interaction failed" with no server-side log, so they're pinned here instead.
  const CID = 'config_1751549410029_391415444084490240';

  const allModals = async () => {
    const V = await import('../src/channels/channelsView.js');
    return [
      ['roles', V.buildRolesModal({ configId: CID, currentRoleId: '123', currentRoleName: 'Spec' })],
      ['roles-empty', V.buildRolesModal({ configId: CID, currentRoleId: null, currentRoleName: null })],
      ['playerroles', V.buildPlayerRolesModal({ configId: CID })],
      ['confessionals', V.buildConfessionalsModal({ configId: CID })],
      ['subs', V.buildSubsModal({ configId: CID })],
      ['1on1s', V.buildOneOnOnesModal({ configId: CID, defaultTribeRoleIds: ['r1', 'r2'], tribeNames: 'Kansas, Oregon' })],
      ['1on1s-empty', V.buildOneOnOnesModal({ configId: CID, defaultTribeRoleIds: [], tribeNames: '' })]
    ];
  };

  it('every modal has ≤5 top-level components, all Label (type 18)', async () => {
    for (const [name, m] of await allModals()) {
      assert.ok(m.components.length <= 5, `${name}: ${m.components.length} top-level components`);
      for (const c of m.components) assert.equal(c.type, 18, `${name}: non-Label top-level component`);
    }
  });

  it('every Label description is ≤100 chars (an over-long one rejects the whole modal)', async () => {
    for (const [name, m] of await allModals()) {
      for (const c of m.components) {
        if (c.description) assert.ok(c.description.length <= 100, `${name} / "${c.label}": description ${c.description.length} > 100`);
        assert.ok(c.label.length <= 45, `${name}: label "${c.label}" > 45`);
      }
    }
  });

  it('every custom_id stays within the 100-char limit at a worst-case configId', async () => {
    for (const [name, m] of await allModals()) {
      assert.ok(m.custom_id.length <= 100, `${name}: custom_id ${m.custom_id.length} > 100`);
      for (const c of m.components) {
        assert.ok(c.component.custom_id.length <= 100, `${name}: field custom_id too long`);
      }
    }
  });

  it('every Radio Group puts `default` on EXACTLY ONE option, omitted on siblings', async () => {
    // An explicit `default: false` on a sibling suppresses pre-selection for the WHOLE group.
    for (const [name, m] of await allModals()) {
      for (const c of m.components) {
        const inner = c.component;
        if (inner?.type !== 21) continue;
        const withKey = inner.options.filter(o => 'default' in o);
        assert.equal(withKey.length, 1, `${name} / ${inner.custom_id}: ${withKey.length} options carry a default key`);
        assert.equal(withKey[0].default, true, `${name}: default must be true, never false`);
        assert.ok(inner.options.length >= 2 && inner.options.length <= 10, `${name}: Radio Group needs 2-10 options`);
      }
    }
  });

  it('single-choice fields use Radio Group (21), never String Select (3) — `default` is ignored in modals', async () => {
    for (const [name, m] of await allModals()) {
      for (const c of m.components) {
        assert.notEqual(c.component?.type, 3, `${name}: a String Select in a modal won't honour default`);
      }
    }
  });
});
