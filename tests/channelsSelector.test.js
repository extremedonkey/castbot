/**
 * Channel Administration — the hidden Channels tab's gating + roster resolution.
 *
 * The nav row/gate are imported for real (seasonSelector pulls in storage.js, but only for
 * functions these tests don't call). The roster's ACCEPTED rule is exercised against the REAL
 * status engine, since that engine is the whole reason the roster is correct.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PermissionFlagsBits } from 'discord.js';
import { buildSeasonNavRow, seasonManagerHeader, isChannelAdmin } from '../seasonSelector.js';
import { buildStatusSignals, deriveStatus } from '../playerStatus.js';
import { ACCEPTED_STATUS_IDS, expandMentionables } from '../src/channels/channelRoster.js';
import { CHANNEL_ADMIN_USER_IDS, ALLIANCE_REQUEST_USER_IDS, CHANNEL_ADMIN_PERMISSIONS } from '../src/channels/channelAdminConfig.js';

const REECE = '391415444084490240';
const TEST_ACCOUNT = '1086246253819613274'; // player-simulant: may REQUEST alliances, never admin
const RANDOM = '999999999999999999';
const CID = 'config_123';

describe('Channels tab — isChannelAdmin gate', () => {
  it('admits ONLY Reece — the test account was removed after it approved its own alliance request (servivorg 2026-08-15)', () => {
    assert.equal(isChannelAdmin(REECE), true);
    assert.equal(isChannelAdmin(TEST_ACCOUNT), false);
    assert.deepEqual(CHANNEL_ADMIN_USER_IDS, [REECE]);
  });

  it('the split: the test account keeps the player-facing REQUEST flow only', () => {
    assert.deepEqual(ALLIANCE_REQUEST_USER_IDS, [REECE, TEST_ACCOUNT]);
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

describe('Channels — authority gate (servivorg 2026-08-15 regression)', () => {
  // The whitelist is a FEATURE FLAG, not authority. Authority is requiresPermission on the two
  // app.js factory blocks — enforced centrally before the handler AND before any modal, so a
  // player clicking 🔍 Review on a public alliance-request card is denied there.
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const appSrc = readFileSync(path.join(__dir, '..', 'app.js'), 'utf8');
  const block = (id) => {
    const start = appSrc.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `factory block '${id}' not found in app.js`);
    return appSrc.slice(start, appSrc.indexOf('})(req, res, client)', start));
  };

  it('the mask is ManageChannels|ManageRoles (ANY-OF via memberHasAnyPermission)', () => {
    assert.equal(CHANNEL_ADMIN_PERMISSIONS,
      PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles);
  });

  for (const id of ['channels_route', 'channels_modal_submit']) {
    it(`${id} declares requiresPermission and carries no test-account literal`, () => {
      const b = block(id);
      assert.match(b, /requiresPermission:\s*CHANNEL_ADMIN_PERMISSIONS/,
        `${id} must gate on the shared authority mask`);
      assert.ok(!b.includes(TEST_ACCOUNT),
        `${id} must not whitelist the test account — that literal is how a permissionless user approved an alliance`);
    });
  }
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

  it('shows Channels LAST for the whitelisted admin', () => {
    const row = buildSeasonNavRow(CID, 'apps', REECE);
    assert.equal(row.components.length, 5);
    assert.equal(row.components[4].label, 'Channels');
    assert.equal(row.components[4].custom_id, `season_channels_${CID}`);
    assert.equal(row.components[4].emoji.name, '#️⃣', 'matches the #️⃣ Channels section heading (was 🔐, changed 2026-08-16)');
  });

  it('hides Channels from the test account — no shown-but-denied drift (137c6aca class)', () => {
    const row = buildSeasonNavRow(CID, 'apps', TEST_ACCOUNT);
    assert.equal(row.components.length, 4);
    assert.ok(!row.components.some(b => b.label === 'Channels'));
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
    if (id.startsWith('channels_alliance')) {
      if (id.startsWith('channels_alliances_')) return 'allianceManager';
      if (id.startsWith('channels_alliance_select_')) return 'allianceManager';
      if (id.startsWith('channels_alliance_delete_')) return 'allianceDeletePlan';
      return 'allianceModal';
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

  it('only modal-opening ids match the requiresModal regex — the rest defer and update', () => {
    // Replica of the app.js:13819 ack-mode regex.
    const MODAL_RE = /^channels_(roles|playerroles|manualrole|activate|confessionals|subs|1on1s|msg_edit|alliance_new|alliance_edit|alliance_members|alliance_review)_/;
    assert.ok(MODAL_RE.test(`channels_manualrole_${CID}`), 'Manually Link must open a modal');
    assert.ok(MODAL_RE.test(`channels_activate_${CID}`), 'Activate must open a modal');
    assert.ok(MODAL_RE.test(`channels_msg_edit_${CID}`), 'edit must open a modal');
    for (const id of [`channels_msg_${CID}`, `channels_msg_send_${CID}`, `channels_msg_targets_${CID}`]) {
      assert.ok(!MODAL_RE.test(id), `${id} must NOT be requiresModal`);
    }
    // Alliance modal-openers ARE requiresModal…
    for (const id of [`channels_alliance_new_${CID}`, `channels_alliance_edit_ab12_${CID}`, `channels_alliance_members_ab12_${CID}`, 'channels_alliance_review_ab12']) {
      assert.ok(MODAL_RE.test(id), `${id} must be requiresModal`);
    }
    // …screen-rendering alliance ids are NOT (deferred + updateMessage).
    for (const id of [`channels_alliances_${CID}`, `channels_alliance_select_${CID}`, `channels_alliance_delete_ab12_${CID}`]) {
      assert.ok(!MODAL_RE.test(id), `${id} must NOT be requiresModal`);
    }
  });

  it('the manager id never collides with the action prefix (alliances_ vs alliance_)', () => {
    assert.ok(!`channels_alliances_${CID}`.startsWith('channels_alliance_'), 'trailing-s pin: manager must not parse as an action');
    assert.equal(dest(`channels_alliances_${CID}`), 'allianceManager');
    assert.equal(dest(`channels_alliance_new_${CID}`), 'allianceModal');
    assert.equal(dest(`channels_alliance_select_${CID}`), 'allianceManager');
    assert.equal(dest(`channels_alliance_delete_ab12_${CID}`), 'allianceDeletePlan');
    assert.equal(dest('channels_alliance_review_ab12'), 'allianceModal');
  });

  it('alliance modal submits are routed BEFORE the legacy kind regex (silent-misroute guard)', () => {
    // channels_alliance_modal_* must never fall into the legacy regex's confessionals default.
    const legacy = 'channels_alliance_modal_new_config_1'.match(/^channels_(roles|playerroles|confessionals|subs|1on1s|msg)_modal_(.+)$/);
    assert.equal(legacy, null, 'alliance submits must not match the legacy kind regex at all');
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
      ['manualrole', V.buildManualRoleModal({ configId: CID })],
      ['confessionals', V.buildConfessionalsModal({ configId: CID })],
      ['subs', V.buildSubsModal({ configId: CID })],
      ['1on1s', V.buildOneOnOnesModal({ configId: CID, defaultTribeRoleIds: ['r1', 'r2'], tribeNames: 'Kansas, Oregon' })],
      ['1on1s-empty', V.buildOneOnOnesModal({ configId: CID, defaultTribeRoleIds: [], tribeNames: '' })]
    ];
  };

  it('every modal has ≤5 top-level components, all Label (18) or Text Display (10)', async () => {
    // Text Display is a valid top-level modal component (alliance request modal precedent);
    // everything interactive must still ride inside a Label.
    for (const [name, m] of await allModals()) {
      assert.ok(m.components.length <= 5, `${name}: ${m.components.length} top-level components`);
      for (const c of m.components) assert.ok([10, 18].includes(c.type), `${name}: invalid top-level component type ${c.type}`);
    }
  });

  it('every Label description is ≤100 chars (an over-long one rejects the whole modal)', async () => {
    for (const [name, m] of await allModals()) {
      for (const c of m.components) {
        if (c.type !== 18) continue;
        if (c.description) assert.ok(c.description.length <= 100, `${name} / "${c.label}": description ${c.description.length} > 100`);
        assert.ok(c.label.length <= 45, `${name}: label "${c.label}" > 45`);
      }
    }
  });

  it('every custom_id stays within the 100-char limit at a worst-case configId', async () => {
    for (const [name, m] of await allModals()) {
      assert.ok(m.custom_id.length <= 100, `${name}: custom_id ${m.custom_id.length} > 100`);
      for (const c of m.components) {
        if (c.type !== 18) continue; // Text Displays carry no custom_id
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

// ─────────────────────────────────────────────────────────────────────────────
// Cross-season roster + the "who exactly?" confirm block (2026-08-08)
// ─────────────────────────────────────────────────────────────────────────────

describe('rosterLines — every confirm screen names the players', () => {
  const M = (o) => ({ userId: o.userId || '1', displayName: 'Alice', ...o });

  it('returns nothing for an empty roster (no stray heading)', async () => {
    const { rosterLines } = await import('../src/channels/channelsView.js');
    assert.deepEqual(rosterLines([]), []);
    assert.deepEqual(rosterLines(null), []);
  });

  it('marks ➕ for players being created and ✅ for ones left alone', async () => {
    const { rosterLines } = await import('../src/channels/channelsView.js');
    const members = [M({ userId: 'a', displayName: 'Alice' }), M({ userId: 'b', displayName: 'Bob' })];
    const out = rosterLines(members, { creating: new Set(['a']) }).join('\n');
    assert.match(out, /➕ Alice/);
    assert.match(out, /✅ Bob/);
  });

  it('shows the already-made channel markers (subs are normally created first)', async () => {
    const { rosterLines } = await import('../src/channels/channelsView.js');
    const out = rosterLines([M({ hasSubs: true }), M({ userId: '2', displayName: 'Bo', hasConfessional: true })]).join('\n');
    assert.match(out, /Alice 🗳️/);
    assert.match(out, /Bo 🎙️/);
  });

  it('names the source season ONLY when it is not the current one', async () => {
    const { rosterLines } = await import('../src/channels/channelsView.js');
    const out = rosterLines([
      M({ userId: 'a', displayName: 'Alice', seasonName: 'Season 14', fromCurrentSeason: true }),
      M({ userId: 'b', displayName: 'Bob', seasonName: 'Season 12', fromCurrentSeason: false })
    ]).join('\n');
    assert.ok(!/Alice.*Season 14/.test(out), 'current-season players must not be labelled');
    assert.match(out, /Bob.*Season 12/, 'cross-season players MUST be labelled — that is the safety net');
  });

  it('truncates but never silently drops', async () => {
    const { rosterLines } = await import('../src/channels/channelsView.js');
    const many = Array.from({ length: 40 }, (_, i) => M({ userId: String(i), displayName: `P${i}` }));
    const out = rosterLines(many, { limit: 25 }).join('\n');
    assert.match(out, /…and 15 more/);
  });
});

describe('Cross-season roster — dedupe precedence', () => {
  // Mirrors channelRoster's rule: newest SEASON wins, then stage, then record recency.
  const ranks = new Map([['s14', 0], ['s12', 1]]);
  const LAST = Number.MAX_SAFE_INTEGER;
  const rankOf = (app) => (app?.configId && ranks.has(app.configId)) ? ranks.get(app.configId) : LAST;
  const beats = (app, prev) => !prev || rankOf(app) < rankOf(prev);

  it("this season's record beats last season's, whatever the status", () => {
    assert.equal(beats({ configId: 's14' }, { configId: 's12' }), true,
      'a Not Cast in S14 must beat a Cast in S12 — otherwise last season\'s cast gets channels');
    assert.equal(beats({ configId: 's12' }, { configId: 's14' }), false);
  });

  it('legacy applications (no configId) sort last, never beating a real season', () => {
    assert.equal(beats({ configId: null }, { configId: 's12' }), false);
    assert.equal(beats({ configId: 's12' }, { configId: null }), true);
  });

  it('a legacy-only applicant is still included (the union is the point)', () => {
    assert.equal(beats({ configId: null }, null), true);
  });
});

describe('Empty-roster message — names offered-but-not-cast players', () => {
  // The one silent failure: invites are out, nothing tests offerStatus, roster reads empty.
  function emptyRosterMessage(skipped = []) {
    const offered = skipped.filter((s) => s.offered);
    if (!offered.length) return 'No accepted cast in this server yet. Set players to **Cast** on the Casting tab first.';
    const names = offered.slice(0, 10).map((s) => s.displayName).join(', ');
    return `No accepted cast yet — but **${offered.length}** player${offered.length > 1 ? 's have' : ' has'} been ` +
      `offered a place without being marked **Cast**: ${names}` +
      `${offered.length > 10 ? `, …and ${offered.length - 10} more` : ''}. ` +
      'Mark them **Cast** on the Casting tab and run this again.';
  }

  it('falls back to the plain message when nobody was offered', () => {
    assert.match(emptyRosterMessage([{ reason: 'New' }]), /Set players to \*\*Cast\*\*/);
  });

  it('names the offered players so the host knows what to fix', () => {
    const msg = emptyRosterMessage([
      { displayName: 'Alice', offered: true },
      { displayName: 'Bob', offered: true },
      { displayName: 'Zed', offered: false }
    ]);
    assert.match(msg, /\*\*2\*\* players have been/);
    assert.match(msg, /Alice, Bob/);
    assert.ok(!msg.includes('Zed'), 'non-offered skips must not be named');
  });

  it('uses singular grammar for one player', () => {
    assert.match(emptyRosterMessage([{ displayName: 'Alice', offered: true }]), /\*\*1\*\* player has been/);
  });
});

describe('expandMentionables — bots are valid targets (decision 2026-08-08)', () => {
  // Bots used to be dropped, which read as "channels silently not created" when a host
  // selected a role held by bot test accounts. Only departed members are dropped now.
  function fakeGuild(membersById, rolesById = {}) {
    const cache = new Map(Object.entries(membersById));
    return {
      id: 'guild-expand-test',
      memberCount: cache.size,
      members: { cache, fetch: async () => { throw new Error('unknown member'); } },
      roles: { cache: new Map(Object.entries(rolesById)), fetch: async () => null }
    };
  }
  const bot = (id, displayName) => ({ id, displayName, user: { bot: true } });

  it('keeps a directly-selected bot', async () => {
    const guild = fakeGuild({ b1: bot('b1', 'R2-D2') });
    const { members, dropped } = await expandMentionables(guild, { users: { b1: {} } }, ['b1']);
    assert.deepEqual(members.map((m) => m.displayName), ['R2-D2']);
    assert.equal(dropped.length, 0);
  });

  it('keeps bots that arrive via role expansion (the Galactic Empire repro)', async () => {
    const troops = { t1: bot('t1', 'Vader'), t2: bot('t2', 'Tarkin'), t3: bot('t3', 'Palpatine') };
    const guild = fakeGuild(troops, { empire: { members: new Map(Object.entries(troops)) } });
    const { members, dropped } = await expandMentionables(guild, { roles: { empire: {} } }, ['empire']);
    assert.equal(members.length, 3, 'all three bot role-holders must get channels');
    assert.equal(dropped.length, 0);
  });

  it('still drops members who left the server, with the reason recorded', async () => {
    const guild = fakeGuild({ b1: bot('b1', 'R2-D2') });
    const { members, dropped } = await expandMentionables(guild, { users: { b1: {}, gone: {} } }, ['b1', 'gone']);
    assert.equal(members.length, 1);
    assert.deepEqual(dropped, [{ userId: 'gone', reason: 'Left the server' }]);
  });
});

describe('Subs modal — placement fields (RaP 0881)', () => {
  it('carries mode, placement, category name, and picker within the 5-component cap', async () => {
    const { buildSubsModal } = await import('../src/channels/channelsView.js');
    const modal = buildSubsModal({ configId: 'config_1_2' });
    assert.ok(modal.components.length <= 5, 'Discord hard-caps modals at 5 top-level components');
    const ids = modal.components.map((c) => c.component?.custom_id);
    assert.deepEqual(ids, ['mode', 'placement', 'category_name', 'targets']);
  });

  it("placement defaults to 'keep' — zero behaviour change for existing PROD users", async () => {
    const { buildSubsModal } = await import('../src/channels/channelsView.js');
    const placement = buildSubsModal({ configId: 'c' }).components.find((c) => c.component?.custom_id === 'placement').component;
    assert.equal(placement.type, 21, 'Radio Group — String Select default is dead in modals');
    const def = placement.options.filter((o) => o.default);
    assert.deepEqual(def.map((o) => o.value), ['keep']);
    assert.deepEqual(placement.options.map((o) => o.value), ['keep', 'single', 'per_tribe']);
  });
});

describe('🎭 formatPlayerRolesLine — plain-text player→role roster (2026-08-16)', () => {
  const E = (displayName, username, roleName) => ({ displayName, username, roleName });

  it('names display name, username and role with NO Discord mention syntax', async () => {
    const { formatPlayerRolesLine } = await import('../src/channels/channelsView.js');
    const line = formatPlayerRolesLine([E('Reece', 'extremedonkey', 'Winner Reece')]);
    assert.equal(line, '-# **Player Roles:** Reece (extremedonkey / @Winner Reece)');
    assert.ok(!line.includes('<@'), 'plain text only — no user/role mentions');
  });

  it('sorts by display name and joins with commas', async () => {
    const { formatPlayerRolesLine } = await import('../src/channels/channelsView.js');
    const line = formatPlayerRolesLine([E('Zed', 'z', 'Z'), E('Amy', 'a', 'A')]);
    assert.match(line, /Amy \(a \/ @A\), Zed \(z \/ @Z\)/);
  });

  it('caps at 15 with an honest +N more', async () => {
    const { formatPlayerRolesLine } = await import('../src/channels/channelsView.js');
    const many = Array.from({ length: 20 }, (_, i) => E(`P${String(i).padStart(2, '0')}`, `u${i}`, `R${i}`));
    const line = formatPlayerRolesLine(many);
    assert.ok(line.includes(', +5 more'));
    assert.ok(!line.includes('P16'), 'entries past the cap are not listed');
  });

  it('returns null when nobody holds a player role (no empty heading)', async () => {
    const { formatPlayerRolesLine } = await import('../src/channels/channelsView.js');
    assert.equal(formatPlayerRolesLine([]), null);
    assert.equal(formatPlayerRolesLine(null), null);
  });

  it('degrades honestly: departed member and deleted role read as such', async () => {
    const { formatPlayerRolesLine } = await import('../src/channels/channelsView.js');
    const line = formatPlayerRolesLine([E('Ghost', 'left server', 'role deleted')]);
    assert.match(line, /Ghost \(left server \/ @role deleted\)/);
  });
});

describe('🔗 Manual Roles — modal + routing (2026-08-16)', () => {
  const CID = 'config_1751549410029_391415444084490240';

  it('the modal explains link-only semantics: records the role, never assigns it', async () => {
    const { buildManualRoleModal } = await import('../src/channels/channelsView.js');
    const modal = buildManualRoleModal({ configId: CID });
    const text = modal.components.filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /already created by hand or by another bot/i, 'must explain the interop use case');
    assert.match(text, /does NOT assign/i, 'must warn the role is not assigned');
    assert.match(text, /casting status/i, 'must explain WHY — assignment would expose casting status');
  });

  it('exactly ONE User Select and ONE Role Select, both single-pick and required', async () => {
    const { buildManualRoleModal } = await import('../src/channels/channelsView.js');
    const inputs = buildManualRoleModal({ configId: CID }).components.filter(c => c.type === 18).map(c => c.component);
    assert.deepEqual(inputs.map(i => i.type).sort(), [5, 6], 'User Select (5) + Role Select (6), nothing else');
    for (const i of inputs) {
      assert.equal(i.min_values, 1, `${i.custom_id}: single-pick`);
      assert.equal(i.max_values, 1, `${i.custom_id}: single-pick`);
      assert.equal(i.required, true, `${i.custom_id}: required`);
    }
  });

  it('the submit id routes as a manualrole submit, never into the legacy confessionals regex', () => {
    const submitId = `channels_manualrole_modal_${CID}`;
    assert.ok(submitId.startsWith('channels_manualrole_modal_'), 'dispatcher prefix');
    const legacy = submitId.match(/^channels_(roles|playerroles|confessionals|subs|1on1s|msg)_modal_(.+)$/);
    assert.equal(legacy, null, 'must not match the legacy kind regex at all');
  });

  it('the button id is NOT swallowed by neighbouring prefixes', () => {
    const id = `channels_manualrole_${CID}`;
    for (const other of ['channels_msg_', 'channels_alliance', 'channels_roles_', 'channels_playerroles_']) {
      assert.ok(!id.startsWith(other), `${id} must not route as ${other}`);
    }
  });
});

describe('🟢 Activate — assign linked player roles (2026-08-16)', () => {
  const CID = 'config_1751549410029_391415444084490240';
  const opt = (n) => ({ roleId: `10${n}`, playerName: `Player${n}`, roleName: `Role${n}` });

  it('invertPlayerRoles maps roleId → ALL linked userIds (a double-link assigns both, visibly)', async () => {
    const { invertPlayerRoles } = await import('../src/channels/channelsHandlers.js');
    const byRole = invertPlayerRoles({
      u1: { playerRoleId: 'rA' },
      u2: { playerRoleId: 'rA' },   // mis-click: two players on one role
      u3: { playerRoleId: 'rB' },
      u4: {},                       // unlinked
      u5: { playerRoleId: null }
    });
    assert.deepEqual(byRole.get('rA'), ['u1', 'u2']);
    assert.deepEqual(byRole.get('rB'), ['u3']);
    assert.equal(byRole.size, 2);
    assert.equal(invertPlayerRoles({}).size, 0);
    assert.equal(invertPlayerRoles(undefined).size, 0);
  });

  it('the modal warns about the pre-marooning reveal and explains what Activate does', async () => {
    const { buildActivateModal } = await import('../src/channels/channelsView.js');
    const modal = buildActivateModal({ configId: CID, options: [opt(1)] });
    const text = modal.components.filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /assign/i, 'must explain it assigns the configured roles');
    assert.match(text, /marooning/i, 'must carry the timing warning');
    assert.match(text, /see who has been cast|reveal/i, 'must explain the exposure consequence');
  });

  it('the select is multi, capped at Discord limits, options carry player + role', async () => {
    const { buildActivateModal } = await import('../src/channels/channelsView.js');
    const many = Array.from({ length: 30 }, (_, i) => opt(i));
    const modal = buildActivateModal({ configId: CID, options: many, hidden: 5 });
    const select = modal.components.find(c => c.type === 18).component;
    assert.equal(select.type, 3, 'String Select — a Role Select cannot be filtered to linked roles');
    assert.equal(select.options.length, 25, 'Discord hard cap');
    assert.equal(select.max_values, 25);
    assert.equal(select.min_values, 1);
    assert.equal(select.options[0].label, 'Player0');
    assert.equal(select.options[0].description, '@Role0');
    const text = modal.components.filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /5 more link/, 'links beyond the cap are named, never silent');
  });

  it('single-link modal: max_values matches the option count', async () => {
    const { buildActivateModal } = await import('../src/channels/channelsView.js');
    const select = buildActivateModal({ configId: CID, options: [opt(1)] }).components.find(c => c.type === 18).component;
    assert.equal(select.max_values, 1);
    assert.ok(!buildActivateModal({ configId: CID, options: [opt(1)] }).components
      .filter(c => c.type === 10).map(c => c.content).join('').includes('more link'), 'no phantom overflow note');
  });

  it('the submit id dodges the legacy kind regex, and the button id no neighbouring prefix', () => {
    const legacy = `channels_activate_modal_${CID}`.match(/^channels_(roles|playerroles|confessionals|subs|1on1s|msg)_modal_(.+)$/);
    assert.equal(legacy, null);
    for (const other of ['channels_alliance', 'channels_roles_', 'channels_msg_', 'channels_manualrole_']) {
      assert.ok(!`channels_activate_${CID}`.startsWith(other));
    }
  });
});

describe('🟢 Activate — classifyActivation, the confirm screen\'s data source (2026-08-16)', () => {
  // Real import — this is the exact function planActivate feeds the confirm card from.
  const load = async () => (await import('../src/channels/channelsHandlers.js')).classifyActivation;
  const base = () => ({
    picked: ['rA'],
    byRole: new Map([['rA', ['u1']]]),
    roles: new Map([['rA', 'Alice ✂'], ['rOld', 'Old Alice']]),
    members: new Map([['u1', { displayName: 'Alice', roleIds: new Set() }]]),
    previous: new Map()
  });

  it('a plain link becomes a ➕ gain item', async () => {
    const classify = await load();
    const { items, already, notes } = classify(base());
    assert.deepEqual(items, [{ userId: 'u1', displayName: 'Alice', roleId: 'rA', roleName: 'Alice ✂', oldRoleId: null, oldRoleName: null }]);
    assert.equal(already.length + notes.length, 0);
  });

  it('a re-linked player still wearing the old role becomes a 🔁 move (old role named)', async () => {
    const classify = await load();
    const input = base();
    input.members.get('u1').roleIds = new Set(['rOld']);
    input.previous = new Map([['u1', 'rOld']]);
    const { items } = classify(input);
    assert.equal(items[0].oldRoleId, 'rOld');
    assert.equal(items[0].oldRoleName, 'Old Alice');
  });

  it('no move when the old role is not held, was deleted, or equals the new role', async () => {
    const classify = await load();

    const notHeld = base();
    notHeld.previous = new Map([['u1', 'rOld']]); // marker exists but the player never got the role
    assert.equal(classify(notHeld).items[0].oldRoleId, null);

    const deleted = base();
    deleted.members.get('u1').roleIds = new Set(['rGone']);
    deleted.previous = new Map([['u1', 'rGone']]);
    deleted.roles.delete('rGone');
    assert.equal(classify(deleted).items[0].oldRoleId, null, 'a deleted old role cannot be removed — plain gain');

    const same = base();
    same.members.get('u1').roleIds = new Set();
    same.previous = new Map([['u1', 'rA']]); // stale marker pointing at the CURRENT link
    assert.equal(classify(same).items[0].oldRoleId, null);
  });

  it('already-held roles are ✅ no-change, never plan items', async () => {
    const classify = await load();
    const input = base();
    input.members.get('u1').roleIds = new Set(['rA']);
    const { items, already } = classify(input);
    assert.equal(items.length, 0);
    assert.deepEqual(already, [{ displayName: 'Alice', roleName: 'Alice ✂' }]);
  });

  it('deleted roles, unlinked roles and departed players become ❌ notes, never silent drops', async () => {
    const classify = await load();
    const { items, notes } = classify({
      picked: ['rGone', 'rEmpty', 'rA'],
      byRole: new Map([['rEmpty', []], ['rA', ['uLeft']]]),
      roles: new Map([['rEmpty', 'Nobody'], ['rA', 'Alice ✂']]),
      members: new Map(), // uLeft is not in the guild
      previous: new Map()
    });
    assert.equal(items.length, 0);
    assert.equal(notes.length, 3);
    assert.match(notes[0], /role no longer exists/);
    assert.match(notes[1], /no longer linked/);
    assert.match(notes[2], /left the server/);
  });

  it('a double-link produces one item per player — both assignments visible', async () => {
    const classify = await load();
    const input = base();
    input.byRole = new Map([['rA', ['u1', 'u2']]]);
    input.members.set('u2', { displayName: 'Bob', roleIds: new Set() });
    assert.equal(classify(input).items.length, 2);
  });
});

describe('🟢 Activate — playerRole delta remembers re-links (real applyDeltas)', () => {
  const CID_G = 'g1';
  const fresh = () => ({ [CID_G]: { players: { u1: { playerRoleId: 'rOld' } } } });

  it('re-linking to a DIFFERENT role stashes the old id as previousPlayerRoleId', async () => {
    const { applyDeltas } = await import('../src/channels/channelRegistry.js');
    const pd = fresh();
    applyDeltas(pd, CID_G, [{ kind: 'playerRole', userId: 'u1', roleId: 'rNew' }]);
    assert.equal(pd[CID_G].players.u1.playerRoleId, 'rNew');
    assert.equal(pd[CID_G].players.u1.previousPlayerRoleId, 'rOld');
  });

  it('re-linking to the SAME role, or a first link, leaves no marker', async () => {
    const { applyDeltas } = await import('../src/channels/channelRegistry.js');
    const pd = fresh();
    applyDeltas(pd, CID_G, [{ kind: 'playerRole', userId: 'u1', roleId: 'rOld' }]);
    assert.equal('previousPlayerRoleId' in pd[CID_G].players.u1, false);
    applyDeltas(pd, CID_G, [{ kind: 'playerRole', userId: 'u2', roleId: 'rFirst' }]);
    assert.equal('previousPlayerRoleId' in pd[CID_G].players.u2, false);
  });

  it('clearPrevious drops ONLY the marker — the live link is untouched', async () => {
    const { applyDeltas } = await import('../src/channels/channelRegistry.js');
    const pd = fresh();
    applyDeltas(pd, CID_G, [{ kind: 'playerRole', userId: 'u1', roleId: 'rNew' }]);
    applyDeltas(pd, CID_G, [{ kind: 'playerRole', userId: 'u1', clearPrevious: true }]);
    assert.equal(pd[CID_G].players.u1.playerRoleId, 'rNew');
    assert.equal('previousPlayerRoleId' in pd[CID_G].players.u1, false);
  });

  it('null roleId still clears a dead link (pre-existing semantics intact)', async () => {
    const { applyDeltas } = await import('../src/channels/channelRegistry.js');
    const pd = fresh();
    applyDeltas(pd, CID_G, [{ kind: 'playerRole', userId: 'u1', roleId: null }]);
    assert.equal('playerRoleId' in pd[CID_G].players.u1, false);
  });
});
