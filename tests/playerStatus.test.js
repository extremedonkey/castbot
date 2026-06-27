// Tests for the Status Engine SKELETON (playerStatus.js). Pure module → import the real functions directly.
// Scope: ONLY the 3 Stage-0 statuses are implemented (📝 New / ☑️ Complete / ✖️ Withdrawn). See RaP 0905 §9.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_REGISTRY,
  buildStage0Signals,
  deriveStatus,
  getApplicationStatus,
  getPlayerSeasonStatus
} from '../playerStatus.js';

describe('Status Engine — registry is skeleton-only (3 active rows)', () => {
  it('has exactly the 3 Stage-0 rows, in precedence order', () => {
    assert.deepEqual(STATUS_REGISTRY.map(r => r.id), ['withdrawn', 'complete', 'new']);
  });
});

describe('Status Engine — buildStage0Signals', () => {
  it('passes completedAt through and flags hasApplication', () => {
    const s = buildStage0Signals({ app: { completedAt: '2026-06-27T00:00:00Z' }, liveChannelName: '☑️x-app' });
    assert.equal(s.hasApplication, true);
    assert.equal(s.completedAt, '2026-06-27T00:00:00Z');
    assert.equal(s.withdrawn, false);
  });
  it('withdrawn is true ONLY for a ✖️ channel prefix', () => {
    assert.equal(buildStage0Signals({ app: {}, liveChannelName: '✖️x-app' }).withdrawn, true);
    for (const name of ['📝x-app', '☑️x-app', '✅x-app', '❌x-app', 'x-app']) {
      assert.equal(buildStage0Signals({ app: {}, liveChannelName: name }).withdrawn, false, name);
    }
  });
  it('no app → hasApplication false', () => {
    assert.equal(buildStage0Signals({ app: null }).hasApplication, false);
  });
});

describe('Status Engine — deriveStatus precedence (withdrawn > complete > new)', () => {
  it('withdrawn wins even when completedAt is set', () => {
    assert.equal(deriveStatus({ withdrawn: true, completedAt: 'x', hasApplication: true }).statusId, 'withdrawn');
  });
  it('complete beats new', () => {
    assert.equal(deriveStatus({ completedAt: 'x', hasApplication: true }).statusId, 'complete');
  });
  it('new when an application exists but is neither complete nor withdrawn', () => {
    assert.equal(deriveStatus({ hasApplication: true }).statusId, 'new');
  });
  it('no application → none', () => {
    assert.deepEqual(deriveStatus({}), { statusId: 'none', label: 'No application', emoji: '—', stage: null, matched: null });
  });
});

describe('Status Engine — getApplicationStatus (app-direct)', () => {
  it('New: app exists, no completedAt, 📝 channel', () => {
    const r = getApplicationStatus({ userId: '1' }, '📝reece-app');
    assert.equal(r.statusId, 'new');
    assert.equal(r.emoji, '📝');
    assert.equal(r.label, 'New');
  });
  it('Application Complete: completedAt set', () => {
    const r = getApplicationStatus({ completedAt: '2026-06-27T11:47:21.536Z' }, '☑️reece-app');
    assert.equal(r.statusId, 'complete');
    assert.equal(r.emoji, '☑️');
  });
  it('Withdrawn: ✖️ channel', () => {
    assert.equal(getApplicationStatus({ completedAt: 'x' }, '✖️reece-app').statusId, 'withdrawn');
  });
  it('attaches the raw signals it saw', () => {
    const r = getApplicationStatus({ completedAt: 'x' }, '📝reece-app');
    assert.equal(r.signals.completedAt, 'x');
    assert.equal(r.signals.withdrawn, false);
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
        ch1: { userId: 'U1', channelId: 'ch1', configId: 'cfg_A', completedAt: 'x' }, // season_X, complete
        ch2: { userId: 'U2', channelId: 'ch2', configId: 'cfg_A' },                    // season_X, new
        ch3: { userId: 'U1', channelId: 'ch3', configId: 'cfg_B' }                     // season_Y (must be ignored)
      }
    }
  };
  const guild = { channels: { cache: { get: () => undefined } } }; // no live names → not withdrawn

  it('finds the right app for (seasonId, userId) and resolves its status', () => {
    const r = getPlayerSeasonStatus('G', 'season_X', 'U1', { playerData, guild });
    assert.equal(r.statusId, 'complete'); // ch1, completedAt set
  });
  it('does not match an app from a different season', () => {
    // U2 only has a season_X app (ch2, new) → new; and U1's season_Y app (ch3) is excluded above
    assert.equal(getPlayerSeasonStatus('G', 'season_X', 'U2', { playerData, guild }).statusId, 'new');
  });
  it('no app for that (season, user) → none', () => {
    assert.equal(getPlayerSeasonStatus('G', 'season_X', 'NOBODY', { playerData, guild }).statusId, 'none');
  });
});
