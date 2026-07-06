// Tests for the Status Engine (playerStatus.js). Pure module → import the real functions directly.
// Scope: the "committed" states are implemented (Withdrawn · Accepted/Declined Placement · Cast/Alternate/
// Not Cast · Complete · New), byte-matched to the legacy `Status:` line (deriveApplicationStatus). Tentative
// + the vote-progression "Still Deciding" cluster are DEFERRED (fall through to complete/new). See RaP 0905 §9.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_REGISTRY,
  buildStatusSignals,
  deriveStatus,
  getApplicationStatus,
  getPlayerSeasonStatus
} from '../playerStatus.js';

// ── Inline replica of the LEGACY ladder we validate against (castRankingManager.js:122). Kept verbatim so
//    the parity test below proves the new engine agrees with it for every committed state. ──
function deriveApplicationStatus(app = {}, liveChannelName = '') {
  const castingStatus = app.castingStatus;
  const placementResponse = app.placementResponse;
  const voteCount = Object.keys(app.rankings || {}).length;
  if (/^✖️/.test(liveChannelName)) return { icon: '✖️', name: 'Withdrawn' };
  if (placementResponse === 'accepted') return { icon: '🎉', name: 'Accepted Placement' };
  if (placementResponse === 'declined') return { icon: '🚫', name: 'Declined Placement' };
  if (castingStatus === 'cast')        return { icon: '✅', name: 'Cast' };
  if (castingStatus === 'alternative') return { icon: '🔄', name: 'Alternate' };
  if (castingStatus === 'tentative')   return { icon: '❓', name: 'Tentatively Cast' };
  if (castingStatus === 'reject')      return { icon: '❌', name: 'Not Cast' };
  if (voteCount >= 2)                  return { icon: '☑️', name: 'Reviewed' };
  if (voteCount >= 1)                  return { icon: '🗳️', name: `Scoring (${voteCount} vote${voteCount === 1 ? '' : 's'})` };
  return { icon: '📝', name: 'Awaiting Votes' };
}

describe('Status Engine — registry shape', () => {
  it('lists the committed rows in precedence order (withdrawn ▸ placement ▸ casting ▸ lifecycle)', () => {
    assert.deepEqual(STATUS_REGISTRY.map(r => r.id),
      ['withdrawn', 'accepted', 'declined', 'cast', 'alternate', 'tentative', 'reject', 'complete', 'new']);
  });
  it('does NOT include the deferred vote rows, nor an Undecided row (Reece: Undecided = Application Complete)', () => {
    const ids = STATUS_REGISTRY.map(r => r.id);
    for (const absent of ['undecided', 'reviewed', 'scoring', 'awaiting']) {
      assert.ok(!ids.includes(absent), `${absent} must not be a status row`);
    }
  });
});

describe('Status Engine — buildStatusSignals', () => {
  it('passes completedAt through and flags hasApplication', () => {
    const s = buildStatusSignals({ app: { completedAt: '2026-06-27T00:00:00Z' }, liveChannelName: '☑️x-app' });
    assert.equal(s.hasApplication, true);
    assert.equal(s.completedAt, '2026-06-27T00:00:00Z');
    assert.equal(s.withdrawn, false);
  });
  it('withdrawn is true ONLY for a ✖️ channel prefix', () => {
    assert.equal(buildStatusSignals({ app: {}, liveChannelName: '✖️x-app' }).withdrawn, true);
    for (const name of ['📝x-app', '☑️x-app', '✅x-app', '❌x-app', 'x-app']) {
      assert.equal(buildStatusSignals({ app: {}, liveChannelName: name }).withdrawn, false, name);
    }
  });
  it('submitted is true ONLY for a ☑️ channel prefix (not 📝/✅/❌/✖️)', () => {
    assert.equal(buildStatusSignals({ app: {}, liveChannelName: '☑️x-app' }).submitted, true);
    for (const name of ['📝x-app', '✅x-app', '❌x-app', '✖️x-app', 'x-app']) {
      assert.equal(buildStatusSignals({ app: {}, liveChannelName: name }).submitted, false, name);
    }
  });
  it('surfaces castingStatus + placementResponse (null when absent)', () => {
    const s = buildStatusSignals({ app: { castingStatus: 'cast', placementResponse: 'accepted' } });
    assert.equal(s.castingStatus, 'cast');
    assert.equal(s.placementResponse, 'accepted');
    const bare = buildStatusSignals({ app: {} });
    assert.equal(bare.castingStatus, null);
    assert.equal(bare.placementResponse, null);
  });
  it('no app → hasApplication false', () => {
    assert.equal(buildStatusSignals({ app: null }).hasApplication, false);
  });
});

describe('Status Engine — deriveStatus precedence', () => {
  it('withdrawn wins over everything (placement + casting + complete)', () => {
    assert.equal(deriveStatus({ withdrawn: true, placementResponse: 'accepted', castingStatus: 'cast', completedAt: 'x', hasApplication: true }).statusId, 'withdrawn');
  });
  it('placement (accepted) outranks a casting decision', () => {
    assert.equal(deriveStatus({ placementResponse: 'accepted', castingStatus: 'cast', completedAt: 'x', hasApplication: true }).statusId, 'accepted');
  });
  it('declined outranks a casting decision', () => {
    assert.equal(deriveStatus({ placementResponse: 'declined', castingStatus: 'reject', hasApplication: true }).statusId, 'declined');
  });
  it('a casting decision outranks Complete', () => {
    assert.equal(deriveStatus({ castingStatus: 'cast', completedAt: 'x', hasApplication: true }).statusId, 'cast');
    assert.equal(deriveStatus({ castingStatus: 'reject', completedAt: 'x', hasApplication: true }).statusId, 'reject');
  });
  it('complete beats new', () => {
    assert.equal(deriveStatus({ completedAt: 'x', hasApplication: true }).statusId, 'complete');
  });
  it('the ☑️ submitted-channel signal resolves complete (no completedAt needed)', () => {
    assert.equal(deriveStatus({ submitted: true, hasApplication: true }).statusId, 'complete');
  });
  it('a casting decision still outranks a submitted (☑️) channel', () => {
    assert.equal(deriveStatus({ submitted: true, castingStatus: 'cast', hasApplication: true }).statusId, 'cast');
  });
  it('tentative resolves to the tentative casting row (outranks complete)', () => {
    assert.equal(deriveStatus({ castingStatus: 'tentative', completedAt: 'x', hasApplication: true }).statusId, 'tentative');
  });
  it('undecided (castingStatus null) is NOT a distinct row — a submitted app reads complete', () => {
    assert.equal(deriveStatus({ completedAt: 'x', hasApplication: true }).statusId, 'complete');
    assert.equal(deriveStatus({ submitted: true, hasApplication: true }).statusId, 'complete');
  });
  it('no application → none', () => {
    assert.deepEqual(deriveStatus({}), { statusId: 'none', label: 'No application', emoji: '—', stage: null, matched: null });
  });
});

describe('Status Engine — getApplicationStatus (casting + placement)', () => {
  it('Cast: castingStatus=cast', () => {
    const r = getApplicationStatus({ castingStatus: 'cast', completedAt: 'x' }, '☑️c');
    assert.equal(r.statusId, 'cast');
    assert.equal(r.emoji, '✅');
    assert.equal(r.label, 'Cast');
  });
  it('Alternate: castingStatus=alternative', () => {
    const r = getApplicationStatus({ castingStatus: 'alternative' }, '📝c');
    assert.equal(r.emoji, '🔄');
    assert.equal(r.label, 'Alternate');
  });
  it('Not Cast: castingStatus=reject', () => {
    const r = getApplicationStatus({ castingStatus: 'reject', completedAt: 'x' }, '☑️c');
    assert.equal(r.emoji, '❌');
    assert.equal(r.label, 'Not Cast');
  });
  it('Accepted Placement outranks the underlying Cast decision', () => {
    const r = getApplicationStatus({ castingStatus: 'cast', placementResponse: 'accepted', completedAt: 'x' }, '✅c');
    assert.equal(r.emoji, '🎉');
    assert.equal(r.label, 'Accepted Placement');
  });
  it('Declined Placement', () => {
    const r = getApplicationStatus({ placementResponse: 'declined' }, '❌c');
    assert.equal(r.emoji, '🚫');
    assert.equal(r.label, 'Declined Placement');
  });
  it('a Cast player with NO placement stays Cast (not accepted)', () => {
    assert.equal(getApplicationStatus({ castingStatus: 'cast' }, '📝c').statusId, 'cast');
  });
  it('Complete via the ☑️ live channel even WITHOUT completedAt (historical apps, pre-2026-06-27)', () => {
    // Regression: Mark Monty (prod) completed his app, but the record has no completedAt and a stale 📝
    // stored channelName; the LIVE channel is ☑️. Must resolve Complete, not New.
    const r = getApplicationStatus({ userId: '1', currentQuestion: 9 }, '☑️markmonty-app');
    assert.equal(r.statusId, 'complete');
    assert.equal(r.emoji, '☑️');
    assert.equal(r.label, 'Application Complete');
  });
  it('stays New for an in-progress 📝 channel with no completedAt', () => {
    assert.equal(getApplicationStatus({ userId: '1' }, '📝markmonty-app').statusId, 'new');
  });
});

// The automated form of "step 3": the new engine must agree byte-for-byte with the legacy ladder for every
// COMMITTED state, and must (still) diverge for the deferred ones — so a future dev who fills a deferred rung
// without updating the engine trips this test.
describe('Status Engine — parity with legacy deriveApplicationStatus', () => {
  const committed = [
    { app: {},                                                              chan: '✖️c' },  // Withdrawn
    { app: { placementResponse: 'accepted', castingStatus: 'cast', completedAt: 'x' }, chan: '✅c' }, // Accepted
    { app: { placementResponse: 'declined' },                               chan: '❌c' },  // Declined
    { app: { castingStatus: 'cast', completedAt: 'x' },                     chan: '☑️c' },  // Cast
    { app: { castingStatus: 'alternative' },                                chan: '📝c' },  // Alternate
    { app: { castingStatus: 'tentative', completedAt: 'x' },                chan: '☑️c' },  // Tentatively Cast
    { app: { castingStatus: 'reject', completedAt: 'x' },                   chan: '☑️c' },  // Not Cast
  ];
  it('agrees (emoji + label) on every committed state', () => {
    for (const { app, chan } of committed) {
      const old = deriveApplicationStatus(app, chan);
      const neu = getApplicationStatus(app, chan);
      assert.equal(neu.emoji, old.icon, `emoji for ${JSON.stringify(app)}`);
      assert.equal(neu.label, old.name, `label for ${JSON.stringify(app)}`);
    }
  });
  it('KNOWN deferred gap: vote-only + undecided diverge (engine falls back to lifecycle)', () => {
    // Votes only — old ladder says Reviewed; engine has no vote row → falls to Complete (deferred cluster).
    const vOld = deriveApplicationStatus({ rankings: { a: 5, b: 4 }, completedAt: 'x' }, '☑️c');
    const vNew = getApplicationStatus({ rankings: { a: 5, b: 4 }, completedAt: 'x' }, '☑️c');
    assert.equal(vOld.name, 'Reviewed');
    assert.equal(vNew.statusId, 'complete');
    // Undecided (no casting decision, no votes) — old ladder says Awaiting Votes; engine reads Complete
    // (Reece's call: Undecided is NOT a distinct row, it IS Application Complete).
    const uOld = deriveApplicationStatus({ completedAt: 'x' }, '☑️c');
    const uNew = getApplicationStatus({ completedAt: 'x' }, '☑️c');
    assert.equal(uOld.name, 'Awaiting Votes');
    assert.equal(uNew.statusId, 'complete');
  });
});

describe('Status Engine — getPlayerSeasonStatus (seasonId → app lookup)', () => {
  const playerData = {
    G: {
      applicationConfigs: {
        cfg_A: { seasonId: 'season_X' },
        cfg_B: { seasonId: 'season_Y' } // different season
      },
      applications: {
        ch1: { userId: 'U1', channelId: 'ch1', configId: 'cfg_A', castingStatus: 'cast' }, // season_X, cast
        ch2: { userId: 'U2', channelId: 'ch2', configId: 'cfg_A' },                          // season_X, new
        ch3: { userId: 'U1', channelId: 'ch3', configId: 'cfg_B' }                           // season_Y (ignored)
      }
    }
  };
  const guild = { channels: { cache: { get: () => undefined } } }; // no live names → not withdrawn

  it('finds the right app for (seasonId, userId) and resolves its status', () => {
    const r = getPlayerSeasonStatus('G', 'season_X', 'U1', { playerData, guild });
    assert.equal(r.statusId, 'cast'); // ch1, castingStatus=cast
  });
  it('does not match an app from a different season', () => {
    assert.equal(getPlayerSeasonStatus('G', 'season_X', 'U2', { playerData, guild }).statusId, 'new');
  });
  it('no app for that (season, user) → none', () => {
    assert.equal(getPlayerSeasonStatus('G', 'season_X', 'NOBODY', { playerData, guild }).statusId, 'none');
  });
});
