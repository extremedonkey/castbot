/**
 * Tests for challenge status logic — getStatusButtonConfig, updateChallengeStatus,
 * verifyChallengeStatus. All pure, no I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getStatusButtonConfig, updateChallengeStatus, CHALLENGE_STATUS_VALUES } from '../challengeManager.js';
import { verifyChallengeStatus } from '../challengeActionCreate.js';

describe('getStatusButtonConfig — dynamic button appearance', () => {
  it('testing → Secondary + 🧪', () => {
    assert.deepEqual(getStatusButtonConfig('testing'), { label: 'Testing', emoji: '🧪', style: 2 });
  });
  it('active → Success + 🏁', () => {
    assert.deepEqual(getStatusButtonConfig('active'), { label: 'Active', emoji: '🏁', style: 3 });
  });
  it('paused → Danger + ⏯️', () => {
    assert.deepEqual(getStatusButtonConfig('paused'), { label: 'Paused', emoji: '⏯️', style: 4 });
  });
  it('unknown / undefined → defaults to active', () => {
    assert.equal(getStatusButtonConfig(undefined).label, 'Active');
    assert.equal(getStatusButtonConfig(null).label, 'Active');
    assert.equal(getStatusButtonConfig('weird').label, 'Active');
  });
});

describe('updateChallengeStatus — state machine transitions', () => {
  it('testing → active sets startedAt and leaves pauseOrStoppedAt null', () => {
    const ch = { status: 'testing' };
    const changed = updateChallengeStatus(ch, 'active');
    assert.equal(changed, true);
    assert.equal(ch.status, 'active');
    assert.ok(typeof ch.startedAt === 'number');
    assert.equal(ch.pauseOrStoppedAt, null);
    assert.deepEqual(ch.pauseHistory, []);
  });

  it('active → paused sets pauseOrStoppedAt and pushes pauseHistory entry', () => {
    const ch = { status: 'active', startedAt: 100, pauseHistory: [] };
    updateChallengeStatus(ch, 'paused');
    assert.equal(ch.status, 'paused');
    assert.ok(typeof ch.pauseOrStoppedAt === 'number');
    assert.equal(ch.pauseHistory.length, 1);
    assert.equal(ch.pauseHistory[0].resumedAt, null);
    assert.equal(ch.pauseHistory[0].durationMs, null);
  });

  it('paused → active patches last pauseHistory entry and clears pauseOrStoppedAt', () => {
    const ch = {
      status: 'paused',
      startedAt: 100,
      pauseOrStoppedAt: 200,
      pauseHistory: [{ pausedAt: 200, resumedAt: null, durationMs: null }],
    };
    updateChallengeStatus(ch, 'active');
    assert.equal(ch.status, 'active');
    assert.equal(ch.pauseOrStoppedAt, null);
    assert.equal(ch.startedAt, 100, 'startedAt preserved from first go-live');
    assert.ok(typeof ch.pauseHistory[0].resumedAt === 'number');
    assert.ok(typeof ch.pauseHistory[0].durationMs === 'number');
    assert.ok(ch.pauseHistory[0].durationMs >= 0);
  });

  it('paused → testing patches pauseHistory and clears pauseOrStoppedAt', () => {
    const ch = {
      status: 'paused',
      pauseOrStoppedAt: 200,
      pauseHistory: [{ pausedAt: 200, resumedAt: null, durationMs: null }],
    };
    updateChallengeStatus(ch, 'testing');
    assert.equal(ch.status, 'testing');
    assert.equal(ch.pauseOrStoppedAt, null);
    assert.ok(typeof ch.pauseHistory[0].resumedAt === 'number');
  });

  it('no-op when newStatus === oldStatus', () => {
    const ch = { status: 'active', startedAt: 100 };
    const changed = updateChallengeStatus(ch, 'active');
    assert.equal(changed, false);
    assert.equal(ch.startedAt, 100);
  });

  it('active → testing preserves startedAt', () => {
    const ch = { status: 'active', startedAt: 100, pauseHistory: [] };
    updateChallengeStatus(ch, 'testing');
    assert.equal(ch.status, 'testing');
    assert.equal(ch.startedAt, 100);
  });

  it('caps pauseHistory at 100 entries', () => {
    const history = Array.from({ length: 100 }, () => ({ pausedAt: 1, resumedAt: 2, durationMs: 1 }));
    const ch = { status: 'active', startedAt: 1, pauseHistory: history };
    updateChallengeStatus(ch, 'paused');
    assert.equal(ch.pauseHistory.length, 100, 'capped at 100 after push');
  });

  it('rejects invalid status values', () => {
    const ch = { status: 'active' };
    assert.throws(() => updateChallengeStatus(ch, 'completed'), /invalid status/);
    assert.throws(() => updateChallengeStatus(ch, 'nonsense'), /invalid status/);
  });

  it('lazy-inits missing fields on first touch', () => {
    const ch = { status: 'active' }; // legacy — no timestamps, no pauseHistory
    updateChallengeStatus(ch, 'paused');
    assert.equal(ch.startedAt, null);
    assert.equal(ch.completedAt, null);
    assert.ok(Array.isArray(ch.pauseHistory));
    assert.equal(ch.pauseHistory.length, 1);
  });

  it('invariant: pauseOrStoppedAt null iff status !== paused', () => {
    const ch = { status: 'testing' };
    updateChallengeStatus(ch, 'active');
    assert.equal(ch.pauseOrStoppedAt, null);
    updateChallengeStatus(ch, 'paused');
    assert.ok(ch.pauseOrStoppedAt != null);
    updateChallengeStatus(ch, 'active');
    assert.equal(ch.pauseOrStoppedAt, null);
  });
});

describe('verifyChallengeStatus — gate rules', () => {
  it('active passes for everyone', () => {
    assert.equal(verifyChallengeStatus({ status: 'active' }, false).allowed, true);
    assert.equal(verifyChallengeStatus({ status: 'active' }, true).allowed, true);
  });

  it('paused blocks everyone — even admins', () => {
    assert.equal(verifyChallengeStatus({ status: 'paused' }, true).allowed, false);
    assert.equal(verifyChallengeStatus({ status: 'paused' }, false).allowed, false);
  });

  it('testing blocks non-admins, allows admins', () => {
    assert.equal(verifyChallengeStatus({ status: 'testing' }, false).allowed, false);
    assert.equal(verifyChallengeStatus({ status: 'testing' }, true).allowed, true);
  });

  it('legacy challenges (no status) lazy-default to active', () => {
    assert.equal(verifyChallengeStatus({}, false).allowed, true);
    assert.equal(verifyChallengeStatus({ status: undefined }, false).allowed, true);
  });

  it('rejection messages explain status', () => {
    const paused = verifyChallengeStatus({ status: 'paused' }, false);
    assert.match(paused.reason, /paused/i);
    const testing = verifyChallengeStatus({ status: 'testing' }, false);
    assert.match(testing.reason, /testing/i);
  });
});

describe('Status constants', () => {
  it('CHALLENGE_STATUS_VALUES exposes the three supported states', () => {
    assert.deepEqual(CHALLENGE_STATUS_VALUES, ['testing', 'active', 'paused']);
  });
});
