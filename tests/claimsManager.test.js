import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTimed, getClaimants, claimStatusLine,
  addClaim, clearClaim, setCooldown, clearAllClaims, resolveNames
} from '../claimsManager.js';

const HOUR = 3600000;
const PERIOD = 2 * HOUR; // 2h

describe('claimsManager — isTimed', () => {
  it('only once_per_period is timed', () => {
    assert.equal(isTimed({ type: 'once_per_period' }), true);
    assert.equal(isTimed({ type: 'once_per_player' }), false);
    assert.equal(isTimed({ type: 'once_globally' }), false);
    assert.equal(isTimed(undefined), false);
  });
});

describe('claimsManager — getClaimants', () => {
  it('unlimited / missing → empty', () => {
    assert.deepEqual(getClaimants({ type: 'unlimited' }), []);
    assert.deepEqual(getClaimants(null), []);
  });

  it('once_per_player → one entry per id, no cooldown', () => {
    const c = getClaimants({ type: 'once_per_player', claimedBy: ['a', 'b'] });
    assert.equal(c.length, 2);
    assert.deepEqual(c[0], { userId: 'a', claimedAt: null, remainingMs: null, onCooldown: false });
  });

  it('once_globally → single entry when claimed, empty when not', () => {
    assert.equal(getClaimants({ type: 'once_globally', claimedBy: 'x' }).length, 1);
    assert.equal(getClaimants({ type: 'once_globally', claimedBy: null }).length, 0);
    assert.equal(getClaimants({ type: 'once_globally', claimedBy: '' }).length, 0);
  });

  it('once_per_period → remaining + onCooldown computed', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: {
      onCd: now - HOUR,        // 1h ago → 1h remaining
      expired: now - 3 * HOUR  // 3h ago → expired
    }};
    const c = getClaimants(limit, now);
    const onCd = c.find(e => e.userId === 'onCd');
    const expired = c.find(e => e.userId === 'expired');
    assert.equal(onCd.onCooldown, true);
    assert.equal(onCd.remainingMs, HOUR);
    assert.equal(expired.onCooldown, false);
    assert.equal(expired.remainingMs, 0);
  });
});

describe('claimsManager — claimStatusLine', () => {
  it('timed on cooldown shows remaining', () => {
    const line = claimStatusLine({ onCooldown: true, remainingMs: HOUR + 59 * 60000 }, { type: 'once_per_period' });
    assert.equal(line, '🧊 On Cooldown | 1h 59m remaining');
  });
  it('timed expired shows Available', () => {
    assert.equal(claimStatusLine({ onCooldown: false }, { type: 'once_per_period' }), '✅ Available');
  });
  it('non-timed shows Claimed', () => {
    assert.equal(claimStatusLine({}, { type: 'once_per_player' }), '🔒 Claimed');
  });
});

describe('claimsManager — addClaim', () => {
  it('once_per_player pushes, no duplicates', () => {
    const limit = { type: 'once_per_player', claimedBy: [] };
    addClaim(limit, 'a');
    addClaim(limit, 'a');
    addClaim(limit, 'b');
    assert.deepEqual(limit.claimedBy, ['a', 'b']);
  });

  it('once_per_player normalises non-array claimedBy', () => {
    const limit = { type: 'once_per_player', claimedBy: 'seed' };
    addClaim(limit, 'a');
    assert.deepEqual(limit.claimedBy, ['seed', 'a']);
  });

  it('once_globally sets the user', () => {
    const limit = { type: 'once_globally', claimedBy: null };
    addClaim(limit, 'a');
    assert.equal(limit.claimedBy, 'a');
  });

  it('once_per_period default = full period remaining (timestamp now)', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: {} };
    addClaim(limit, 'a', { now });
    assert.equal(limit.claimedBy.a, now); // now - period + period = now
  });

  it('once_per_period with remainingMs back-calculates timestamp', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: {} };
    addClaim(limit, 'a', { remainingMs: HOUR, now });
    // remaining should be 1h → timestamp = now - period + 1h
    assert.equal(limit.claimedBy.a, now - PERIOD + HOUR);
    assert.equal(getClaimants(limit, now).find(e => e.userId === 'a').remainingMs, HOUR);
  });

  it('once_per_period clamps remaining over period', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: {} };
    addClaim(limit, 'a', { remainingMs: 99 * HOUR, now });
    assert.equal(limit.claimedBy.a, now); // clamped to full period
  });
});

describe('claimsManager — clearClaim', () => {
  it('once_per_player removes one, keeps others', () => {
    const limit = { type: 'once_per_player', claimedBy: ['a', 'b', 'c'] };
    clearClaim(limit, 'b');
    assert.deepEqual(limit.claimedBy, ['a', 'c']);
  });

  it('once_globally clears only the matching user', () => {
    const limit = { type: 'once_globally', claimedBy: 'a' };
    clearClaim(limit, 'other');
    assert.equal(limit.claimedBy, 'a');
    clearClaim(limit, 'a');
    assert.equal(limit.claimedBy, null);
  });

  it('once_per_period deletes the key', () => {
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: { a: 1, b: 2 } };
    clearClaim(limit, 'a');
    assert.deepEqual(limit.claimedBy, { b: 2 });
  });
});

describe('claimsManager — setCooldown', () => {
  it('sets remaining for timed outcome', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: { a: 0 } };
    setCooldown(limit, 'a', 30 * 60000, now); // 30m remaining
    assert.equal(getClaimants(limit, now).find(e => e.userId === 'a').remainingMs, 30 * 60000);
  });

  it('remaining 0 → immediately available', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: { a: now } };
    setCooldown(limit, 'a', 0, now);
    assert.equal(getClaimants(limit, now).find(e => e.userId === 'a').onCooldown, false);
  });

  it('no-op for non-timed outcomes', () => {
    const limit = { type: 'once_per_player', claimedBy: ['a'] };
    setCooldown(limit, 'a', HOUR);
    assert.deepEqual(limit.claimedBy, ['a']);
  });
});

describe('claimsManager — clearAllClaims', () => {
  it('standardises empty state per type', () => {
    const pp = clearAllClaims({ type: 'once_per_player', claimedBy: ['a', 'b'] });
    assert.deepEqual(pp.claimedBy, []);
    const g = clearAllClaims({ type: 'once_globally', claimedBy: 'a' });
    assert.equal(g.claimedBy, null);
    const per = clearAllClaims({ type: 'once_per_period', claimedBy: { a: 1 } });
    assert.deepEqual(per.claimedBy, {});
  });
});

describe('claimsManager — resolveNames', () => {
  it('cache-first with fallback for misses', async () => {
    const guild = { members: { cache: new Map([['a', { displayName: 'Alice' }]]) } };
    const names = await resolveNames(guild, ['a', 'b']);
    assert.equal(names.a, 'Alice');
    assert.equal(names.b, 'Player b'); // last4 of "b" is "b"
  });

  it('fetches missing when fetch:true', async () => {
    const fetched = new Map([['b', { displayName: 'Bob' }]]);
    const guild = {
      members: {
        cache: new Map([['a', { displayName: 'Alice' }]]),
        fetch: async () => fetched
      }
    };
    const names = await resolveNames(guild, ['a', 'b'], { fetch: true });
    assert.equal(names.a, 'Alice');
    assert.equal(names.b, 'Bob');
  });
});
