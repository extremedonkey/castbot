import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Real engine functions for the custom-limit suite (module is pure, no heavy imports)
import { checkLimitGate as gate, recordLimitClaim as record, windowIndexOf, pruneCustomClaims, summarizeLimit, anchorMsFromHHMM } from '../utils/periodUtils.js';

// Replicate pure logic inline to avoid importing heavy modules

function formatPeriod(ms) {
  if (!ms || ms <= 0) return '0m';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function parsePeriodFromModal(components, fieldIds = {}) {
  const ids = {
    days: fieldIds.days || 'period_days',
    hours: fieldIds.hours || 'period_hours',
    minutes: fieldIds.minutes || 'period_minutes'
  };
  let days = 0, hours = 0, minutes = 0;
  for (const comp of components) {
    const child = comp.component || comp.components?.[0];
    if (!child) continue;
    if (child.custom_id === ids.days) days = parseInt(child.value?.trim()) || 0;
    if (child.custom_id === ids.hours) hours = parseInt(child.value?.trim()) || 0;
    if (child.custom_id === ids.minutes) minutes = parseInt(child.value?.trim()) || 0;
  }
  const totalMs = (days * 86400000) + (hours * 3600000) + (minutes * 60000);
  return { days, hours, minutes, totalMs };
}

function checkPeriodLimit(claimedBy, userId, periodMs, now) {
  const lastUsed = claimedBy?.[userId];
  if (lastUsed && (now - lastUsed < periodMs)) {
    return { blocked: true, remainingMs: periodMs - (now - lastUsed) };
  }
  return { blocked: false };
}

// Inline copies of checkLimitGate / recordLimitClaim from utils/periodUtils.js
function checkLimitGate(limit, userId, nowMs) {
  if (!limit || limit.type === 'unlimited') return { blocked: false };
  const claimedBy = limit.claimedBy;
  if (limit.type === 'once_per_player') {
    const claimedList = Array.isArray(claimedBy) ? claimedBy : (claimedBy ? [claimedBy] : []);
    if (claimedList.includes(userId)) return { blocked: true, reason: 'once_per_player' };
    return { blocked: false };
  }
  if (limit.type === 'once_globally') {
    const hasClaims = Array.isArray(claimedBy) ? claimedBy.length > 0
      : typeof claimedBy === 'string' ? claimedBy.length > 0
      : false;
    if (hasClaims) return { blocked: true, reason: 'once_globally' };
    return { blocked: false };
  }
  if (limit.type === 'once_per_period') {
    const lastUsed = (typeof claimedBy === 'object' && !Array.isArray(claimedBy)) ? claimedBy?.[userId] : undefined;
    if (lastUsed && (nowMs - lastUsed < limit.periodMs)) {
      return { blocked: true, reason: 'once_per_period', remainingMs: limit.periodMs - (nowMs - lastUsed) };
    }
    return { blocked: false };
  }
  return { blocked: false };
}

function recordLimitClaim(limit, userId, nowMs) {
  if (!limit || limit.type === 'unlimited') return;
  if (limit.type === 'once_per_player') {
    if (!Array.isArray(limit.claimedBy)) limit.claimedBy = [];
    if (!limit.claimedBy.includes(userId)) limit.claimedBy.push(userId);
  } else if (limit.type === 'once_globally') {
    limit.claimedBy = userId;
  } else if (limit.type === 'once_per_period') {
    if (!limit.claimedBy || typeof limit.claimedBy !== 'object' || Array.isArray(limit.claimedBy)) {
      limit.claimedBy = {};
    }
    limit.claimedBy[userId] = nowMs;
  }
}

// --- formatPeriod ---

describe('formatPeriod', () => {
  it('formats days, hours, and minutes', () => {
    assert.equal(formatPeriod(86400000 + 3600000 + 60000), '1d 1h 1m');
  });

  it('formats days and hours with zero minutes', () => {
    assert.equal(formatPeriod(86400000 + 7200000), '1d 2h 0m');
  });

  it('formats hours and minutes (no days)', () => {
    assert.equal(formatPeriod(43200000 + 1800000), '12h 30m');
  });

  it('formats hours only', () => {
    assert.equal(formatPeriod(3600000), '1h 0m');
  });

  it('formats minutes only', () => {
    assert.equal(formatPeriod(300000), '5m');
  });

  it('formats zero as 0m', () => {
    assert.equal(formatPeriod(0), '0m');
  });

  it('handles null/undefined', () => {
    assert.equal(formatPeriod(null), '0m');
    assert.equal(formatPeriod(undefined), '0m');
  });

  it('handles negative values', () => {
    assert.equal(formatPeriod(-1000), '0m');
  });

  it('handles large periods (30 days)', () => {
    assert.equal(formatPeriod(30 * 86400000), '30d 0h 0m');
  });

  it('shows hours when days present even if zero', () => {
    // 1 day exactly should show "1d 0h 0m"
    assert.equal(formatPeriod(86400000), '1d 0h 0m');
  });
});

// --- parsePeriodFromModal ---

describe('parsePeriodFromModal', () => {
  it('parses Label-format components (type 18)', () => {
    const components = [
      { component: { custom_id: 'period_days', value: '1' } },
      { component: { custom_id: 'period_hours', value: '12' } },
      { component: { custom_id: 'period_minutes', value: '30' } }
    ];
    const result = parsePeriodFromModal(components);
    assert.equal(result.days, 1);
    assert.equal(result.hours, 12);
    assert.equal(result.minutes, 30);
    assert.equal(result.totalMs, 86400000 + 43200000 + 1800000);
  });

  it('handles empty/missing values as 0', () => {
    const components = [
      { component: { custom_id: 'period_days', value: '' } },
      { component: { custom_id: 'period_hours', value: '4' } },
      { component: { custom_id: 'period_minutes', value: '' } }
    ];
    const result = parsePeriodFromModal(components);
    assert.equal(result.days, 0);
    assert.equal(result.hours, 4);
    assert.equal(result.minutes, 0);
    assert.equal(result.totalMs, 14400000);
  });

  it('supports custom field IDs (schedule modal)', () => {
    const components = [
      { component: { custom_id: 'schedule_days', value: '2' } },
      { component: { custom_id: 'schedule_hours', value: '0' } },
      { component: { custom_id: 'schedule_minutes', value: '30' } }
    ];
    const result = parsePeriodFromModal(components, {
      days: 'schedule_days',
      hours: 'schedule_hours',
      minutes: 'schedule_minutes'
    });
    assert.equal(result.days, 2);
    assert.equal(result.totalMs, 2 * 86400000 + 1800000);
  });

  it('handles legacy ActionRow format (components array)', () => {
    const components = [
      { components: [{ custom_id: 'period_hours', value: '6' }] }
    ];
    const result = parsePeriodFromModal(components);
    assert.equal(result.hours, 6);
    assert.equal(result.totalMs, 6 * 3600000);
  });

  it('handles all empty inputs', () => {
    const components = [
      { component: { custom_id: 'period_days', value: '' } },
      { component: { custom_id: 'period_hours', value: '' } },
      { component: { custom_id: 'period_minutes', value: '' } }
    ];
    const result = parsePeriodFromModal(components);
    assert.equal(result.totalMs, 0);
  });

  it('handles non-numeric input as 0', () => {
    const components = [
      { component: { custom_id: 'period_hours', value: 'abc' } }
    ];
    const result = parsePeriodFromModal(components);
    assert.equal(result.hours, 0);
  });
});

// --- once_per_period enforcement logic ---

describe('once_per_period enforcement', () => {
  it('allows first use (empty claimedBy)', () => {
    const result = checkPeriodLimit({}, 'user1', 43200000, Date.now());
    assert.equal(result.blocked, false);
  });

  it('allows first use (user not in claimedBy)', () => {
    const now = Date.now();
    const result = checkPeriodLimit({ other_user: now }, 'user1', 43200000, now);
    assert.equal(result.blocked, false);
  });

  it('blocks during cooldown', () => {
    const now = Date.now();
    const result = checkPeriodLimit({ user1: now - 1000 }, 'user1', 43200000, now);
    assert.equal(result.blocked, true);
    assert.ok(result.remainingMs > 43190000);
  });

  it('allows after cooldown expires', () => {
    const now = Date.now();
    const result = checkPeriodLimit({ user1: now - 50000000 }, 'user1', 43200000, now);
    assert.equal(result.blocked, false);
  });

  it('allows exactly at expiry', () => {
    const now = Date.now();
    const result = checkPeriodLimit({ user1: now - 43200000 }, 'user1', 43200000, now);
    assert.equal(result.blocked, false);
  });

  it('allows different user during another user cooldown', () => {
    const now = Date.now();
    const result = checkPeriodLimit({ user1: now - 1000 }, 'user2', 43200000, now);
    assert.equal(result.blocked, false);
  });

  it('handles null claimedBy', () => {
    assert.equal(checkPeriodLimit(null, 'user1', 43200000, Date.now()).blocked, false);
  });

  it('handles undefined claimedBy', () => {
    assert.equal(checkPeriodLimit(undefined, 'user1', 43200000, Date.now()).blocked, false);
  });

  it('calculates remaining time correctly', () => {
    const now = Date.now();
    const lastUsed = now - 10000000; // 10,000 seconds ago
    const periodMs = 43200000; // 12 hours
    const result = checkPeriodLimit({ user1: lastUsed }, 'user1', periodMs, now);
    assert.equal(result.blocked, true);
    assert.equal(result.remainingMs, periodMs - 10000000);
  });
});

// --- checkLimitGate (generic gate used by fight_enemy + future outcomes) ---

describe('checkLimitGate', () => {
  const NOW = 1_700_000_000_000;

  it('never blocks when limit is missing', () => {
    assert.equal(checkLimitGate(null, 'u1', NOW).blocked, false);
    assert.equal(checkLimitGate(undefined, 'u1', NOW).blocked, false);
  });

  it('never blocks when unlimited', () => {
    assert.equal(checkLimitGate({ type: 'unlimited' }, 'u1', NOW).blocked, false);
  });

  describe('once_per_player', () => {
    it('allows a fresh user', () => {
      assert.equal(checkLimitGate({ type: 'once_per_player', claimedBy: ['u2'] }, 'u1', NOW).blocked, false);
    });
    it('allows when claimedBy is an empty array', () => {
      assert.equal(checkLimitGate({ type: 'once_per_player', claimedBy: [] }, 'u1', NOW).blocked, false);
    });
    it('allows when claimedBy is null (freshly set)', () => {
      assert.equal(checkLimitGate({ type: 'once_per_player', claimedBy: null }, 'u1', NOW).blocked, false);
    });
    it('blocks a user already in the array', () => {
      const r = checkLimitGate({ type: 'once_per_player', claimedBy: ['u1', 'u2'] }, 'u1', NOW);
      assert.equal(r.blocked, true);
      assert.equal(r.reason, 'once_per_player');
    });
    it('treats a legacy string claimedBy as a single claim', () => {
      assert.equal(checkLimitGate({ type: 'once_per_player', claimedBy: 'u1' }, 'u1', NOW).blocked, true);
      assert.equal(checkLimitGate({ type: 'once_per_player', claimedBy: 'u1' }, 'u2', NOW).blocked, false);
    });
  });

  describe('once_globally', () => {
    it('allows when unclaimed (null / empty)', () => {
      assert.equal(checkLimitGate({ type: 'once_globally', claimedBy: null }, 'u1', NOW).blocked, false);
      assert.equal(checkLimitGate({ type: 'once_globally', claimedBy: '' }, 'u1', NOW).blocked, false);
      assert.equal(checkLimitGate({ type: 'once_globally', claimedBy: [] }, 'u1', NOW).blocked, false);
    });
    it('blocks everyone once claimed — including the original claimer', () => {
      assert.equal(checkLimitGate({ type: 'once_globally', claimedBy: 'u1' }, 'u1', NOW).blocked, true);
      assert.equal(checkLimitGate({ type: 'once_globally', claimedBy: 'u1' }, 'u2', NOW).reason, 'once_globally');
    });
  });

  describe('once_per_period', () => {
    it('allows first use (empty object)', () => {
      assert.equal(checkLimitGate({ type: 'once_per_period', periodMs: 1000, claimedBy: {} }, 'u1', NOW).blocked, false);
    });
    it('does not crash on null claimedBy', () => {
      assert.equal(checkLimitGate({ type: 'once_per_period', periodMs: 1000, claimedBy: null }, 'u1', NOW).blocked, false);
    });
    it('blocks within the cooldown and reports remaining', () => {
      const r = checkLimitGate({ type: 'once_per_period', periodMs: 10000, claimedBy: { u1: NOW - 3000 } }, 'u1', NOW);
      assert.equal(r.blocked, true);
      assert.equal(r.reason, 'once_per_period');
      assert.equal(r.remainingMs, 7000);
    });
    it('allows after the cooldown expires', () => {
      assert.equal(checkLimitGate({ type: 'once_per_period', periodMs: 10000, claimedBy: { u1: NOW - 20000 } }, 'u1', NOW).blocked, false);
    });
  });
});

// --- recordLimitClaim ---

describe('recordLimitClaim', () => {
  const NOW = 1_700_000_000_000;

  it('is a no-op for unlimited / missing limits', () => {
    const limit = { type: 'unlimited' };
    recordLimitClaim(limit, 'u1', NOW);
    assert.deepEqual(limit, { type: 'unlimited' });
    assert.doesNotThrow(() => recordLimitClaim(null, 'u1', NOW));
  });

  it('appends to a once_per_player array without duplicating', () => {
    const limit = { type: 'once_per_player', claimedBy: [] };
    recordLimitClaim(limit, 'u1', NOW);
    recordLimitClaim(limit, 'u1', NOW);
    recordLimitClaim(limit, 'u2', NOW);
    assert.deepEqual(limit.claimedBy, ['u1', 'u2']);
  });

  it('coerces a non-array once_per_player claimedBy to an array', () => {
    const limit = { type: 'once_per_player', claimedBy: null };
    recordLimitClaim(limit, 'u1', NOW);
    assert.deepEqual(limit.claimedBy, ['u1']);
  });

  it('sets the userId string for once_globally', () => {
    const limit = { type: 'once_globally', claimedBy: null };
    recordLimitClaim(limit, 'u1', NOW);
    assert.equal(limit.claimedBy, 'u1');
  });

  it('stamps the timestamp for once_per_period', () => {
    const limit = { type: 'once_per_period', periodMs: 1000, claimedBy: {} };
    recordLimitClaim(limit, 'u1', NOW);
    assert.equal(limit.claimedBy.u1, NOW);
  });

  it('round-trips with checkLimitGate (claim then blocked)', () => {
    const limit = { type: 'once_per_player', claimedBy: [] };
    assert.equal(checkLimitGate(limit, 'u1', NOW).blocked, false);
    recordLimitClaim(limit, 'u1', NOW);
    assert.equal(checkLimitGate(limit, 'u1', NOW).blocked, true);
  });
});

// --- Custom usage-limit engine (type: 'custom') ---

describe('custom limit — per_player scope', () => {
  const base = { type: 'custom', scope: 'per_player', reset: 'none', maxClaims: 3 };

  it('allows up to N claims per player, then blocks', () => {
    const limit = { ...base, claims: [] };
    for (let i = 0; i < 3; i++) {
      assert.equal(gate(limit, 'u1', 1000).blocked, false);
      record(limit, 'u1', 1000);
    }
    const v = gate(limit, 'u1', 1000);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, 'custom_exhausted');
    assert.equal(v.remaining.claimsLeft, 0);
  });

  it('counts each player independently', () => {
    const limit = { ...base, maxClaims: 1, claims: [] };
    record(limit, 'u1', 1000);
    assert.equal(gate(limit, 'u1', 1000).blocked, true);
    assert.equal(gate(limit, 'u2', 1000).blocked, false);
  });
});

describe('custom limit — global unique', () => {
  const base = { type: 'custom', scope: 'global', unique: true, reset: 'none', maxClaims: 5 };

  it('allows up to N distinct players (first-N-players use case)', () => {
    const limit = { ...base, claims: [] };
    for (let i = 0; i < 5; i++) {
      const u = `u${i}`;
      assert.equal(gate(limit, u, 1000).blocked, false);
      record(limit, u, 1000);
    }
    const v = gate(limit, 'u_late', 1000);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, 'custom_exhausted');
  });

  it('blocks a player who already claimed with custom_already_claimed', () => {
    const limit = { ...base, claims: [] };
    record(limit, 'u1', 1000);
    const v = gate(limit, 'u1', 1000);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, 'custom_already_claimed');
  });
});

describe('custom limit — global non-unique', () => {
  it('lets one player take all N slots', () => {
    const limit = { type: 'custom', scope: 'global', unique: false, reset: 'none', maxClaims: 5, claims: [] };
    for (let i = 0; i < 5; i++) {
      assert.equal(gate(limit, 'u1', 1000).blocked, false);
      record(limit, 'u1', 1000);
    }
    assert.equal(gate(limit, 'u1', 1000).blocked, true);
    assert.equal(gate(limit, 'u2', 1000).blocked, true);
  });
});

describe('custom limit — fixed_window reset', () => {
  const base = { type: 'custom', scope: 'global', unique: true, reset: 'fixed_window', maxClaims: 2, periodMs: 86400000, anchorMs: 0 };

  it('windowIndexOf floors correctly', () => {
    assert.equal(windowIndexOf(0, 0, 86400000), 0);
    assert.equal(windowIndexOf(86399999, 0, 86400000), 0);
    assert.equal(windowIndexOf(86400000, 0, 86400000), 1);
  });

  it('blocks within a window once N distinct claimed, resets next window', () => {
    const limit = { ...base, claims: [] };
    const day0 = 1000;
    record(limit, 'u1', day0); record(limit, 'u2', day0);
    const v = gate(limit, 'u3', day0);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, 'custom_window');
    assert.ok(v.remaining.windowResetMs > 0 && v.remaining.windowResetMs <= 86400000);

    const day1 = 86400000 + 1000;
    assert.equal(gate(limit, 'u3', day1).blocked, false);
    assert.equal(gate(limit, 'u1', day1).blocked, false);
  });

  it('prunes stale claims on record', () => {
    const limit = { ...base, claims: [{ u: 'old', t: 1000 }] };
    record(limit, 'u1', 86400000 + 5000);
    assert.equal(limit.claims.length, 1);
    assert.equal(limit.claims[0].u, 'u1');
  });
});

describe('custom limit — rolling reset (N>1 sliding window)', () => {
  const base = { type: 'custom', scope: 'per_player', reset: 'rolling', maxClaims: 2, periodMs: 10000 };

  it('allows N within the trailing period, blocks the N+1th, frees as claims age out', () => {
    const limit = { ...base, claims: [] };
    record(limit, 'u1', 1000);
    record(limit, 'u1', 2000);
    const v = gate(limit, 'u1', 3000);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, 'custom_cooldown');
    assert.ok(v.remaining.cooldownMs > 0);
    assert.equal(gate(limit, 'u1', 11001).blocked, false);
  });
});

describe('custom limit — uncapped (maxClaims null)', () => {
  it('never blocks on count', () => {
    const limit = { type: 'custom', scope: 'global', unique: false, reset: 'none', maxClaims: null, claims: [] };
    for (let i = 0; i < 50; i++) record(limit, `u${i}`, 1000);
    const v = gate(limit, 'uX', 1000);
    assert.equal(v.blocked, false);
    assert.equal(v.remaining.claimsLeft, Infinity);
  });
});

describe('summarizeLimit', () => {
  it('describes presets', () => {
    assert.equal(summarizeLimit({ type: 'unlimited' }), 'Unlimited');
    assert.equal(summarizeLimit({ type: 'once_per_player' }), 'Once per player');
    assert.equal(summarizeLimit({ type: 'once_globally' }), 'Once globally (one player total)');
  });
  it('describes a custom daily-5-unique config', () => {
    const s = summarizeLimit({ type: 'custom', scope: 'global', unique: true, maxClaims: 5, reset: 'fixed_window', periodMs: 86400000 });
    assert.match(s, /5 unique players/);
    assert.match(s, /resets every 1d/);
  });
  it('describes per-player rolling', () => {
    const s = summarizeLimit({ type: 'custom', scope: 'per_player', maxClaims: 3, reset: 'rolling', periodMs: 43200000 });
    assert.match(s, /3 per player/);
    assert.match(s, /rolling 12h/);
  });
});

describe('anchorMsFromHHMM', () => {
  it('returns the most-recent occurrence at/before now', () => {
    const now = 1750000000000;
    const anchor = anchorMsFromHHMM(9, 0, now);
    assert.ok(anchor <= now);
    assert.ok(now - anchor < 86400000);
  });
});

describe('verbose duration formatters (player-facing copy)', () => {
  it('spells out minutes/hours/days', async () => {
    const { formatPeriodVerbose, formatCountdownVerbose } = await import('../utils/periodUtils.js');
    assert.equal(formatPeriodVerbose(120000), '2 minutes');
    assert.equal(formatPeriodVerbose(60000), '1 minute');
    assert.equal(formatPeriodVerbose(3600000), '1 hour');
    assert.equal(formatPeriodVerbose(86400000), '1 day');
    assert.equal(formatPeriodVerbose(90 * 60000), '1 hour 30 minutes');
    assert.equal(formatPeriodVerbose(0), '0 minutes');
    // countdown rounds UP to the next minute
    assert.equal(formatCountdownVerbose(61000), '2 minutes');
    assert.equal(formatCountdownVerbose(1), '1 minute');
  });
});

describe('custom limit — verdict carries periodMs for time messages', () => {
  it('rolling block includes periodMs so the message can say "every X"', () => {
    const limit = { type: 'custom', scope: 'per_player', reset: 'rolling', maxClaims: 1, periodMs: 60000, claims: [{ u: 'u1', t: 1000 }] };
    const v = gate(limit, 'u1', 2000);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, 'custom_cooldown');
    assert.equal(v.remaining.periodMs, 60000);
    assert.ok(v.remaining.cooldownMs > 0);
  });
  it('fixed_window block includes periodMs + windowResetMs', () => {
    const limit = { type: 'custom', scope: 'global', unique: true, reset: 'fixed_window', maxClaims: 1, periodMs: 60000, anchorMs: 0, claims: [{ u: 'u1', t: 1000 }] };
    const v = gate(limit, 'u2', 2000);
    assert.equal(v.reason, 'custom_window');
    assert.equal(v.remaining.periodMs, 60000);
    assert.ok(v.remaining.windowResetMs > 0);
  });
});

describe('buildLimitOptions — custom option reflects current config', () => {
  it('shows the configured summary on the Custom option when active', async () => {
    const { buildLimitOptions } = await import('../utils/periodUtils.js');
    const opts = buildLimitOptions({ currentLimit: 'custom', customSummary: '5 unique players (global), resets every 1d 0h 0m' });
    const custom = opts.find(o => o.value === 'custom');
    assert.ok(custom.default);
    assert.match(custom.description, /Current: 5 unique players/);
  });
  it('falls back to generic text when no custom configured', async () => {
    const { buildLimitOptions } = await import('../utils/periodUtils.js');
    const opts = buildLimitOptions({ currentLimit: 'once_per_player' });
    const custom = opts.find(o => o.value === 'custom');
    assert.match(custom.description, /global caps/);
  });
});


// ─── Seconds support (Manually Set Refresh) — real module functions ─────────
import { parsePeriodFromModal as realParse, buildPeriodModalComponents as realBuild } from '../utils/periodUtils.js';

describe('parsePeriodFromModal — optional seconds field', () => {
  const modal = (vals) => Object.entries(vals).map(([id, value]) => ({ component: { custom_id: id, value } }));

  it('folds seconds into totalMs when a seconds fieldId is provided', () => {
    const r = realParse(modal({ refresh_days: '1', refresh_hours: '2', refresh_minutes: '3', refresh_seconds: '4' }),
      { days: 'refresh_days', hours: 'refresh_hours', minutes: 'refresh_minutes', seconds: 'refresh_seconds' });
    assert.equal(r.seconds, 4);
    assert.equal(r.totalMs, 86400000 + 2*3600000 + 3*60000 + 4000);
  });

  it('without a seconds fieldId, behavior is unchanged (seconds = 0, not parsed)', () => {
    const r = realParse(modal({ schedule_days: '0', schedule_hours: '1', schedule_minutes: '30', schedule_seconds: '59' }),
      { days: 'schedule_days', hours: 'schedule_hours', minutes: 'schedule_minutes' });
    assert.equal(r.seconds, 0, 'stray seconds input ignored when not requested');
    assert.equal(r.totalMs, 3600000 + 30*60000);
  });

  it('all blank → totalMs 0 (valid: instant refresh)', () => {
    const r = realParse(modal({ refresh_days: '', refresh_hours: '', refresh_minutes: '', refresh_seconds: '' }),
      { days: 'refresh_days', hours: 'refresh_hours', minutes: 'refresh_minutes', seconds: 'refresh_seconds' });
    assert.equal(r.totalMs, 0);
  });
});

describe('buildPeriodModalComponents — includeSeconds', () => {
  it('default stays 3 fields (existing callers unaffected)', () => {
    const comps = realBuild({ fieldPrefix: 'schedule' });
    assert.equal(comps.length, 3);
    assert.deepEqual(comps.map(c => c.component.custom_id), ['schedule_days', 'schedule_hours', 'schedule_minutes']);
  });

  it('includeSeconds appends a Seconds Label with matching copy and pre-fill', () => {
    const ms = 2*86400000 + 5*3600000 + 7*60000 + 9000;
    const comps = realBuild({ fieldPrefix: 'refresh', currentPeriodMs: ms, includeSeconds: true });
    assert.equal(comps.length, 4);
    const secs = comps[3];
    assert.equal(secs.type, 18, 'Label (type 18), never ActionRow+TextInput');
    assert.equal(secs.label, 'Seconds');
    assert.equal(secs.description, '0-59 seconds (leave empty for 0)');
    assert.equal(secs.component.custom_id, 'refresh_seconds');
    assert.equal(secs.component.value, '9', 'pre-filled from currentPeriodMs');
    assert.equal(comps[0].component.value, '2');
    assert.equal(comps[1].component.value, '5');
    assert.equal(comps[2].component.value, '7');
  });

  it('zero seconds → no pre-fill value on the Seconds input', () => {
    const comps = realBuild({ fieldPrefix: 'refresh', currentPeriodMs: 60000, includeSeconds: true });
    assert.equal(comps[3].component.value, undefined);
  });
});
