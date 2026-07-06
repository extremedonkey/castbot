/**
 * Tests for RestartScheduler pure logic (RaP 0903 / ScheduledRestart.md).
 * The module has no top-level Discord/storage imports, so the pure functions
 * are imported directly (no inline replication needed).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInterval,
  formatInterval,
  computeNextFire,
  isCancelCurrent,
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  DEFAULT_WARN_MINUTES
} from '../src/monitoring/restartScheduler.js';

const H = 3600000;
const D = 24 * H;
const M = 60000;

describe('RestartScheduler — parseInterval', () => {
  it('parses days, hours, minutes', () => {
    assert.equal(parseInterval('1d'), D);
    assert.equal(parseInterval('12h'), 12 * H);
    assert.equal(parseInterval('240m'), 240 * M);
  });

  it('is case-insensitive and tolerates whitespace', () => {
    assert.equal(parseInterval(' 2D '), 2 * D);
    assert.equal(parseInterval('6 H'), 6 * H);
  });

  it('supports fractional values', () => {
    assert.equal(parseInterval('1.5d'), 1.5 * D);
  });

  it('rejects garbage, bare numbers, zero, and negatives', () => {
    assert.equal(parseInterval('tomorrow'), null);
    assert.equal(parseInterval('30'), null); // unit required — no ambiguity
    assert.equal(parseInterval('0h'), null);
    assert.equal(parseInterval('-4h'), null);
    assert.equal(parseInterval(''), null);
    assert.equal(parseInterval(undefined), null);
  });

  it('round-trips with formatInterval', () => {
    assert.equal(formatInterval(parseInterval('1d')), '1d');
    assert.equal(formatInterval(parseInterval('12h')), '12h');
    assert.equal(formatInterval(parseInterval('90m')), '90m');
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

  it('clamps a dangerously small interval (restart-loop guard)', () => {
    const next = computeNextFire(now, now - 10 * M, 1000); // 1s interval — corrupted config
    assert.ok(next - now >= MIN_INTERVAL_MS - warnMs, 'steps use at least MIN_INTERVAL_MS');
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
