import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
