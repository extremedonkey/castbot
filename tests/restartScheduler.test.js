/**
 * Tests for RestartScheduler pure logic (RaP 0903 / ScheduledRestart.md).
 * The module has no top-level Discord/storage imports, so the pure functions
 * are imported directly (no inline replication needed).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  combineDhm,
  splitDhm,
  formatInterval,
  computeNextFire,
  isCancelCurrent,
  getMinIntervalMs,
  MIN_INTERVAL_MS,
  DEV_MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  DEFAULT_WARN_MINUTES
} from '../src/monitoring/restartScheduler.js';

const H = 3600000;
const D = 24 * H;
const M = 60000;

describe('RestartScheduler — combineDhm (modal Days/Hours/Minutes inputs)', () => {
  it('combines days + hours + minutes', () => {
    assert.equal(combineDhm('1', '0', '0'), D);
    assert.equal(combineDhm('0', '12', '0'), 12 * H);
    assert.equal(combineDhm('1', '2', '30'), D + 2 * H + 30 * M);
  });

  it('treats blank fields as zero', () => {
    assert.equal(combineDhm('', '4', ''), 4 * H);
    assert.equal(combineDhm('  ', '', '90'), 90 * M);
  });

  it('rejects non-numeric and negative input', () => {
    assert.equal(combineDhm('a', '0', '0'), null);
    assert.equal(combineDhm('1', '-2', '0'), null);
    assert.equal(combineDhm('1.5', '0', '0'), null); // whole numbers only
  });

  it('all-zero / all-blank → null (no interval given)', () => {
    assert.equal(combineDhm('0', '0', '0'), null);
    assert.equal(combineDhm('', '', ''), null);
  });

  it('round-trips with splitDhm', () => {
    const ms = combineDhm('2', '5', '45');
    assert.deepEqual(splitDhm(ms), { days: 2, hours: 5, minutes: 45 });
    assert.deepEqual(splitDhm(D), { days: 1, hours: 0, minutes: 0 });
    assert.deepEqual(splitDhm(null), { days: 0, hours: 0, minutes: 0 });
  });

  it('formatInterval renders combined values', () => {
    assert.equal(formatInterval(combineDhm('1', '', '')), '1d');
    assert.equal(formatInterval(combineDhm('', '12', '')), '12h');
    assert.equal(formatInterval(combineDhm('', '', '90')), '90m');
  });
});

describe('RestartScheduler — getMinIntervalMs (env-aware floor)', () => {
  it('is the 1-minute dev floor outside prod (this test process is not prod)', () => {
    assert.equal(getMinIntervalMs(), DEV_MIN_INTERVAL_MS);
  });

  it('prod floor constant remains 4h', () => {
    assert.equal(MIN_INTERVAL_MS, 4 * H);
  });
});

describe('RestartScheduler — computeNextFire', () => {
  const now = Date.parse('2026-07-06T12:00:00Z');
  const warnMs = DEFAULT_WARN_MINUTES * M;

  it('keeps a future fire time that is outside the warn window', () => {
    const fireAt = now + 2 * H;
    assert.equal(computeNextFire(now, fireAt, D), fireAt);
  });

  it('advances a stale fire time past now in whole interval steps', () => {
    // Bot was down for 3 days; scheduled daily. Fire must be in the future,
    // aligned to the original cadence, never "immediately on boot".
    const staleFire = now - 3 * D - 2 * H;
    const next = computeNextFire(now, staleFire, D);
    assert.ok(next - warnMs > now, 'next fire must leave room for the full warning');
    assert.equal((next - staleFire) % D, 0, 'advances in whole interval steps');
  });

  it('pushes to the next cycle when inside the warning window (never restart without full warning)', () => {
    const fireAt = now + 10 * M; // only 10 min away < 30 min warning
    assert.equal(computeNextFire(now, fireAt, D), fireAt + D);
  });

  it('fire time exactly at the warn boundary is pushed', () => {
    const fireAt = now + warnMs; // boundary: fireAt - warn == now
    assert.equal(computeNextFire(now, fireAt, D), fireAt + D);
  });

  it('seeds from now + interval when nextFireAt is missing or invalid', () => {
    assert.equal(computeNextFire(now, null, D), now + D);
    assert.equal(computeNextFire(now, NaN, D), now + D);
    assert.equal(computeNextFire(now, 0, D), now + D);
  });

  it('clamps a dangerously small interval to the PROD floor (restart-loop guard)', () => {
    // Explicit prod floor — corrupted 1s interval steps at 4h minimum
    const next = computeNextFire(now, now - 10 * M, 1000, DEFAULT_WARN_MINUTES, MIN_INTERVAL_MS);
    assert.ok(next - now >= MIN_INTERVAL_MS - warnMs, 'steps use at least MIN_INTERVAL_MS');
  });

  it('dev floor permits 1-minute cadence with a scaled warn window', () => {
    // 1m interval, 30s warn (as enable() would persist for dev/test)
    const fireAt = now + M;
    assert.equal(computeNextFire(now, fireAt, M, 0.5, DEV_MIN_INTERVAL_MS), fireAt);
  });

  it('resets an absurdly-far-future fire time back onto the cadence', () => {
    const absurd = now + MAX_INTERVAL_MS * 10;
    assert.equal(computeNextFire(now, absurd, D), now + D);
  });
});

describe('RestartScheduler — isCancelCurrent (stale-click guard)', () => {
  const armedAt = Date.parse('2026-07-07T10:00:00Z');

  it('accepts a cancel for the armed fire time', () => {
    assert.equal(isCancelCurrent(Math.floor(armedAt / 1000), armedAt), true);
  });

  it("rejects a cancel from yesterday's warning message", () => {
    const yesterdayEpoch = Math.floor((armedAt - D) / 1000);
    assert.equal(isCancelCurrent(yesterdayEpoch, armedAt), false);
  });

  it('rejects when nothing is armed', () => {
    assert.equal(isCancelCurrent(Math.floor(armedAt / 1000), null), false);
  });

  it('rejects malformed epochs', () => {
    assert.equal(isCancelCurrent(NaN, armedAt), false);
    assert.equal(isCancelCurrent(undefined, armedAt), false);
  });
});
