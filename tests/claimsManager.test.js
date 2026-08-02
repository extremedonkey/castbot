import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTimed, getClaimants, claimStatusLine,
  addClaim, clearClaim, setCooldown, clearAllClaims, resolveNames,
  countClaims, describeOutcome, evaluateClassicGate
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

  it('once_per_period allows remaining over period (admin override → future timestamp)', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: {} };
    addClaim(limit, 'a', { remainingMs: 99 * HOUR, now });
    assert.equal(limit.claimedBy.a, now - PERIOD + 99 * HOUR); // future timestamp, not clamped
    assert.equal(getClaimants(limit, now).find(e => e.userId === 'a').remainingMs, 99 * HOUR);
  });

  it('once_per_period clamps negative remaining to 0', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: {} };
    addClaim(limit, 'a', { remainingMs: -5000, now });
    assert.equal(getClaimants(limit, now).find(e => e.userId === 'a').onCooldown, false);
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

  it('allows remaining beyond the period (admin override)', () => {
    const now = 1_000_000_000;
    const limit = { type: 'once_per_period', periodMs: 5 * 60000, claimedBy: { a: 0 } };
    setCooldown(limit, 'a', 11 * 60000, now); // 11m on a 5m period
    const c = getClaimants(limit, now).find(e => e.userId === 'a');
    assert.equal(c.onCooldown, true);
    assert.equal(c.remainingMs, 11 * 60000);
    assert.equal(claimStatusLine(c, limit), '🧊 On Cooldown | 11m remaining');
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

describe('claimsManager — countClaims', () => {
  it('unlimited / missing / unknown → 0', () => {
    assert.equal(countClaims({ type: 'unlimited', claimedBy: ['a'] }), 0);
    assert.equal(countClaims(null), 0);
    assert.equal(countClaims({ type: 'not_a_type', claimedBy: ['a'] }), 0);
  });

  it('once_per_player counts the array', () => {
    assert.equal(countClaims({ type: 'once_per_player', claimedBy: ['a', 'b', 'c'] }), 3);
    assert.equal(countClaims({ type: 'once_per_player', claimedBy: [] }), 0);
    // legacy shape: a bare string where an array was expected
    assert.equal(countClaims({ type: 'once_per_player', claimedBy: 'a' }), 1);
  });

  it('once_globally is 0 or 1, and empty-but-truthy means unclaimed', () => {
    assert.equal(countClaims({ type: 'once_globally', claimedBy: 'a' }), 1);
    assert.equal(countClaims({ type: 'once_globally', claimedBy: '' }), 0);
    assert.equal(countClaims({ type: 'once_globally', claimedBy: null }), 0);
    assert.equal(countClaims({ type: 'once_globally' }), 0);
  });

  it('once_per_period counts the keys', () => {
    assert.equal(countClaims({ type: 'once_per_period', claimedBy: { a: 1, b: 2 } }), 2);
    assert.equal(countClaims({ type: 'once_per_period', claimedBy: {} }), 0);
    assert.equal(countClaims({ type: 'once_per_period', claimedBy: [] }), 0); // wrong shape → 0
  });

  it('custom counts the claims array, never claimedBy', () => {
    assert.equal(countClaims({ type: 'custom', claims: [{ u: 'a', t: 1 }, { u: 'a', t: 2 }] }), 2);
    assert.equal(countClaims({ type: 'custom', claims: [], claimedBy: ['a', 'b'] }), 0);
    assert.equal(countClaims({ type: 'custom' }), 0);
  });

  it('agrees with clearAllClaims — clearing always drops the count to zero', () => {
    for (const limit of [
      { type: 'once_per_player', claimedBy: ['a', 'b'] },
      { type: 'once_globally', claimedBy: 'a' },
      { type: 'once_per_period', claimedBy: { a: 1 } },
      { type: 'custom', claims: [{ u: 'a', t: 1 }] }
    ]) {
      assert.ok(countClaims(limit) > 0, `${limit.type} should start non-zero`);
      clearAllClaims(limit);
      assert.equal(countClaims(limit), 0, `${limit.type} should be zero after clearAllClaims`);
    }
  });
});

describe('claimsManager — describeOutcome', () => {
  const G = 'g1';
  const data = {
    [G]: {
      items: { idol: { name: 'Idol', emoji: '🗿' } },
      enemies: { dig: { name: 'Diglett', emoji: '🐹' } },
      attributeDefinitions: { luck: { name: 'Luck', emoji: '🍀' } }
    }
  };
  const terms = { currencyName: 'Gil', currencyEmoji: '💎' };

  it('describes give_item with emoji, verb and quantity', () => {
    assert.equal(describeOutcome(data, G, { type: 'give_item', config: { itemId: 'idol', quantity: 2 } }, 0, terms), '🗿 Give 2x Idol');
    assert.equal(describeOutcome(data, G, { type: 'give_item', config: { itemId: 'idol', operation: 'remove' } }, 0, terms), '🗿 Remove 1x Idol');
  });

  it('uses the per-server currency name/emoji, never a hardcoded coin', () => {
    assert.equal(describeOutcome(data, G, { type: 'give_currency', config: { amount: 50 } }, 0, terms), '💎 +50 Gil');
    assert.equal(describeOutcome(data, G, { type: 'give_currency', config: { amount: -5 } }, 0, terms), '💎 -5 Gil');
  });

  it('describes attributes, stamina and enemies', () => {
    assert.equal(describeOutcome(data, G, { type: 'modify_attribute', config: { attributeId: 'luck', operation: 'add', amount: 1 } }, 0, terms), '🍀 +1 Luck');
    assert.equal(describeOutcome(data, G, { type: 'give_stamina', config: { amount: 3 } }, 0, terms), '⚡ +3 Stamina');
    assert.equal(describeOutcome(data, G, { type: 'fight_enemy', config: { enemyId: 'dig' } }, 0, terms), '🐹 Fight Diglett');
  });

  it('falls back gracefully for deleted references and unknown types', () => {
    assert.equal(describeOutcome(data, G, { type: 'give_item', config: { itemId: 'gone' } }, 0, terms), '📦 Give 1x gone');
    assert.equal(describeOutcome(data, G, { type: 'fight_enemy', config: {} }, 0, terms), '🐙 Fight Unknown Enemy');
    assert.equal(describeOutcome(data, G, { type: 'display_text', config: {} }, 4, terms), 'Outcome #5');
    assert.equal(describeOutcome({}, G, { type: 'give_currency', config: { amount: 1 } }, 0, {}), '🪙 +1 Currency');
  });
});

/**
 * evaluateClassicGate is the runtime "may this player claim?" decision for the non-custom
 * limit types. It replaced three hand-rolled copies inside give_currency / give_item that had
 * drifted apart (one blocked once_globally on a non-empty ARRAY, the other only on a string).
 * It is pure so the gate can be paired with addClaim inside a single withSafariLock cycle.
 */
describe('claimsManager — evaluateClassicGate', () => {
  const NOW = 1_000_000_000;

  it('never blocks when there is no limit, unlimited, or custom (custom has its own gate)', () => {
    assert.equal(evaluateClassicGate(null, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({}, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({ type: 'unlimited' }, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({ type: 'custom', claims: [{ u: 'u1', t: 1 }] }, 'u1').blocked, false);
  });

  it('once_per_player blocks only the players in claimedBy', () => {
    const limit = { type: 'once_per_player', claimedBy: ['u1', 'u2'] };
    assert.deepEqual(evaluateClassicGate(limit, 'u1'), { blocked: true, reason: 'once_per_player' });
    assert.equal(evaluateClassicGate(limit, 'u3').blocked, false);
  });

  it('once_per_player treats the empty-but-truthy shapes as unclaimed', () => {
    assert.equal(evaluateClassicGate({ type: 'once_per_player', claimedBy: [] }, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({ type: 'once_per_player', claimedBy: '' }, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({ type: 'once_per_player' }, 'u1').blocked, false);
  });

  it('once_per_player honours a legacy bare-string claimedBy', () => {
    assert.equal(evaluateClassicGate({ type: 'once_per_player', claimedBy: 'u1' }, 'u1').blocked, true);
    assert.equal(evaluateClassicGate({ type: 'once_per_player', claimedBy: 'u1' }, 'u2').blocked, false);
  });

  it('once_globally blocks everyone once a userId string is recorded', () => {
    const claimed = { type: 'once_globally', claimedBy: 'u1' };
    assert.equal(evaluateClassicGate(claimed, 'u1').blocked, true);
    assert.equal(evaluateClassicGate(claimed, 'u2').blocked, true);
  });

  it('once_globally is open for null/empty/array residue from a limit-type switch', () => {
    assert.equal(evaluateClassicGate({ type: 'once_globally', claimedBy: null }, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({ type: 'once_globally', claimedBy: '' }, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({ type: 'once_globally', claimedBy: [] }, 'u1').blocked, false);
    assert.equal(evaluateClassicGate({ type: 'once_globally', claimedBy: ['u9'] }, 'u1').blocked, false);
  });

  it('once_per_period blocks inside the window and reports the remaining time', () => {
    const limit = { type: 'once_per_period', periodMs: PERIOD, claimedBy: { u1: NOW - HOUR } };
    const v = evaluateClassicGate(limit, 'u1', NOW);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, 'once_per_period');
    assert.equal(v.remainingMs, HOUR);
    assert.equal(v.periodMs, PERIOD);
  });

  it('once_per_period frees up exactly at the boundary and after', () => {
    const at = { type: 'once_per_period', periodMs: PERIOD, claimedBy: { u1: NOW - PERIOD } };
    assert.equal(evaluateClassicGate(at, 'u1', NOW).blocked, false);
    const past = { type: 'once_per_period', periodMs: PERIOD, claimedBy: { u1: NOW - 3 * HOUR } };
    assert.equal(evaluateClassicGate(past, 'u1', NOW).blocked, false);
  });

  it('once_per_period never blocks a player with no record, or on a malformed claim store', () => {
    assert.equal(evaluateClassicGate({ type: 'once_per_period', periodMs: PERIOD, claimedBy: { u2: NOW } }, 'u1', NOW).blocked, false);
    assert.equal(evaluateClassicGate({ type: 'once_per_period', periodMs: PERIOD, claimedBy: ['u1'] }, 'u1', NOW).blocked, false);
    assert.equal(evaluateClassicGate({ type: 'once_per_period', claimedBy: { u1: NOW } }, 'u1', NOW).blocked, false, 'no periodMs → no cooldown');
  });

  it('gate + addClaim round-trip: a claim taken now blocks the next attempt for every type', () => {
    for (const limit of [
      { type: 'once_per_player', claimedBy: [] },
      { type: 'once_globally', claimedBy: null },
      { type: 'once_per_period', periodMs: PERIOD, claimedBy: {} }
    ]) {
      assert.equal(evaluateClassicGate(limit, 'u1', NOW).blocked, false, `${limit.type} starts open`);
      addClaim(limit, 'u1', { now: NOW });
      assert.equal(evaluateClassicGate(limit, 'u1', NOW).blocked, true, `${limit.type} blocks after claim`);
      // …and clearClaim (the rollback path when the grant fails) reopens it
      clearClaim(limit, 'u1');
      assert.equal(evaluateClassicGate(limit, 'u1', NOW).blocked, false, `${limit.type} reopens after release`);
    }
  });
});
