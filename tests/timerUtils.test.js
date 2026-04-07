/**
 * timerUtils.test.js — Unit tests for snowflake timing utilities
 *
 * Tests pure functions only — no Discord, no I/O.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate pure logic inline (avoids importing heavy modules)
// ─────────────────────────────────────────────

const DISCORD_EPOCH = 1420070400000n;

function snowflakeToTimestamp(snowflake) {
  return Number((BigInt(snowflake) >> 22n) + DISCORD_EPOCH);
}

function parseSnowflake(snowflake) {
  const id = BigInt(snowflake);
  const timestamp = Number((id >> 22n) + DISCORD_EPOCH);
  return {
    timestamp,
    date: new Date(timestamp).toISOString(),
    workerId: Number((id >> 17n) & 0x1Fn),
    processId: Number((id >> 12n) & 0x1Fn),
    increment: Number(id & 0xFFFn),
  };
}

function timeBetweenSnowflakes(startId, endId) {
  const startTime = snowflakeToTimestamp(startId);
  const endTime = snowflakeToTimestamp(endId);
  const durationMs = Math.abs(endTime - startTime);
  return {
    durationMs,
    formatted: formatDuration(durationMs),
    startTime,
    endTime,
    reversed: endTime < startTime,
  };
}

function formatDuration(ms) {
  if (ms < 0) ms = Math.abs(ms);
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const s = totalSeconds % 60;
  const m = minutes % 60;
  const h = hours % 24;

  if (totalSeconds < 60) return `${totalSeconds}.${Math.floor((ms % 1000) / 100)}s`;
  if (minutes < 60) return `${m}m ${s}s`;
  if (hours < 24) return `${h}h ${m}m ${s}s`;
  return `${days}d ${h}h ${m}m`;
}

function discordTimestamp(timestampMs, style = 'F') {
  return `<t:${Math.floor(timestampMs / 1000)}:${style}>`;
}

// Pending starts (in-memory)
const pendingStarts = new Map();
function setPendingStart(hostId, playerId, messageId, timestamp, channelId) {
  if (!pendingStarts.has(hostId)) pendingStarts.set(hostId, new Map());
  pendingStarts.get(hostId).set(playerId, { messageId, timestamp, channelId });
}
function getPendingStart(hostId, playerId) {
  return pendingStarts.get(hostId)?.get(playerId) || null;
}
function clearPendingStart(hostId, playerId) {
  const hostMap = pendingStarts.get(hostId);
  if (hostMap) {
    hostMap.delete(playerId);
    if (hostMap.size === 0) pendingStarts.delete(hostId);
  }
}
function getAllPendingStarts(hostId) {
  return pendingStarts.get(hostId) || new Map();
}
function clearAllPendingStarts(hostId) {
  pendingStarts.delete(hostId);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('snowflakeToTimestamp', () => {
  it('decodes a known Discord snowflake (Discord epoch reference)', () => {
    // Snowflake 0 = Discord epoch exactly (2015-01-01T00:00:00.000Z)
    // Snowflake with only timestamp bits set to 0 = epoch
    // ID 0 would mean timestamp=0, worker=0, process=0, increment=0
    const ts = snowflakeToTimestamp('0');
    assert.equal(ts, 1420070400000); // Discord epoch in unix ms
    assert.equal(new Date(ts).toISOString(), '2015-01-01T00:00:00.000Z');
  });

  it('decodes a real-world snowflake correctly', () => {
    // Known: Discord's example snowflake 175928847299117063
    // Created: 2016-04-30T11:18:25.796Z
    const ts = snowflakeToTimestamp('175928847299117063');
    const date = new Date(ts);
    assert.equal(date.getUTCFullYear(), 2016);
    assert.equal(date.getUTCMonth(), 3); // April = 3 (0-indexed)
    assert.equal(date.getUTCDate(), 30);
  });

  it('handles string and bigint input identically', () => {
    const fromString = snowflakeToTimestamp('175928847299117063');
    const fromBigInt = snowflakeToTimestamp(175928847299117063n);
    assert.equal(fromString, fromBigInt);
  });

  it('handles recent snowflakes (2026+)', () => {
    // Fabricate a snowflake for 2026-04-03T00:00:00.000Z
    // Unix ms: 1775088000000
    // Discord ms: 1775088000000 - 1420070400000 = 355017600000
    // Shift left 22: 355017600000 << 22 = BigInt
    const discordMs = 355017600000n;
    const fabricated = (discordMs << 22n).toString();
    const ts = snowflakeToTimestamp(fabricated);
    assert.equal(ts, 1775088000000);
  });
});

describe('parseSnowflake', () => {
  it('extracts all fields from a snowflake', () => {
    const result = parseSnowflake('175928847299117063');
    assert.equal(typeof result.timestamp, 'number');
    assert.equal(typeof result.date, 'string');
    assert.ok(result.date.includes('2016'));
    assert.equal(typeof result.workerId, 'number');
    assert.equal(typeof result.processId, 'number');
    assert.equal(typeof result.increment, 'number');
    assert.ok(result.workerId >= 0 && result.workerId <= 31);
    assert.ok(result.processId >= 0 && result.processId <= 31);
    assert.ok(result.increment >= 0 && result.increment <= 4095);
  });

  it('returns valid ISO date string', () => {
    const result = parseSnowflake('175928847299117063');
    assert.doesNotThrow(() => new Date(result.date));
    assert.equal(new Date(result.date).getTime(), result.timestamp);
  });

  it('snowflake 0 decodes to Discord epoch with all fields zero', () => {
    const result = parseSnowflake('0');
    assert.equal(result.timestamp, 1420070400000);
    assert.equal(result.workerId, 0);
    assert.equal(result.processId, 0);
    assert.equal(result.increment, 0);
  });
});

describe('timeBetweenSnowflakes', () => {
  // Helper: fabricate a snowflake for a given Discord-epoch ms offset
  function makeSnowflake(discordMs) {
    return (BigInt(discordMs) << 22n).toString();
  }

  it('calculates duration between two snowflakes', () => {
    const start = makeSnowflake(100000000); // some time
    const end = makeSnowflake(100060000);   // 60 seconds later
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 60000);
    assert.equal(result.formatted, '1m 0s');
    assert.equal(result.reversed, false);
  });

  it('handles reversed order (end before start)', () => {
    const start = makeSnowflake(100060000);
    const end = makeSnowflake(100000000);
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 60000); // absolute value
    assert.equal(result.reversed, true);
  });

  it('returns 0 for identical snowflakes', () => {
    const id = makeSnowflake(100000000);
    const result = timeBetweenSnowflakes(id, id);
    assert.equal(result.durationMs, 0);
    assert.equal(result.formatted, '0ms');
    assert.equal(result.reversed, false);
  });

  it('calculates hours correctly', () => {
    const start = makeSnowflake(100000000);
    const end = makeSnowflake(103600000); // 1 hour later
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 3600000);
    assert.equal(result.formatted, '1h 0m 0s');
  });

  it('calculates complex durations', () => {
    const start = makeSnowflake(100000000);
    // 2h 15m 30s = 8130000ms later
    const end = makeSnowflake(108130000);
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 8130000);
    assert.equal(result.formatted, '2h 15m 30s');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    assert.equal(formatDuration(0), '0ms');
    assert.equal(formatDuration(500), '500ms');
    assert.equal(formatDuration(999), '999ms');
  });

  it('formats sub-minute durations with tenths', () => {
    assert.equal(formatDuration(1000), '1.0s');
    assert.equal(formatDuration(5200), '5.2s');
    assert.equal(formatDuration(45700), '45.7s');
    assert.equal(formatDuration(59900), '59.9s');
  });

  it('formats minutes', () => {
    assert.equal(formatDuration(60000), '1m 0s');
    assert.equal(formatDuration(754000), '12m 34s');
    assert.equal(formatDuration(3599000), '59m 59s');
  });

  it('formats hours', () => {
    assert.equal(formatDuration(3600000), '1h 0m 0s');
    assert.equal(formatDuration(5025000), '1h 23m 45s');
    assert.equal(formatDuration(86399000), '23h 59m 59s');
  });

  it('formats days', () => {
    assert.equal(formatDuration(86400000), '1d 0h 0m');
    assert.equal(formatDuration(94500000), '1d 2h 15m');
    assert.equal(formatDuration(172800000), '2d 0h 0m');
  });

  it('handles negative values (takes absolute)', () => {
    assert.equal(formatDuration(-5000), '5.0s');
    assert.equal(formatDuration(-60000), '1m 0s');
  });
});

describe('discordTimestamp', () => {
  it('formats with default full style', () => {
    // 1712150400000 ms = some timestamp
    const result = discordTimestamp(1712150400000);
    assert.equal(result, '<t:1712150400:F>');
  });

  it('formats with relative style', () => {
    const result = discordTimestamp(1712150400000, 'R');
    assert.equal(result, '<t:1712150400:R>');
  });

  it('formats with short time style', () => {
    const result = discordTimestamp(1712150400000, 't');
    assert.equal(result, '<t:1712150400:t>');
  });

  it('handles millisecond precision (floors to seconds)', () => {
    const result = discordTimestamp(1712150400999);
    assert.equal(result, '<t:1712150400:F>');
  });
});

describe('pendingStarts — in-memory state', () => {
  beforeEach(() => {
    // Clear state between tests
    clearAllPendingStarts('host1');
    clearAllPendingStarts('host2');
  });

  it('stores and retrieves a pending start', () => {
    setPendingStart('host1', 'player1', 'msg123', 1712150400000, 'ch456');
    const result = getPendingStart('host1', 'player1');
    assert.deepEqual(result, { messageId: 'msg123', timestamp: 1712150400000, channelId: 'ch456' });
  });

  it('returns null for missing entries', () => {
    assert.equal(getPendingStart('host1', 'nobody'), null);
    assert.equal(getPendingStart('nobody', 'player1'), null);
  });

  it('supports multiple players per host', () => {
    setPendingStart('host1', 'playerA', 'msgA', 100, 'ch1');
    setPendingStart('host1', 'playerB', 'msgB', 200, 'ch2');
    assert.equal(getPendingStart('host1', 'playerA').messageId, 'msgA');
    assert.equal(getPendingStart('host1', 'playerB').messageId, 'msgB');
  });

  it('supports multiple hosts independently', () => {
    setPendingStart('host1', 'playerA', 'msg1', 100, 'ch1');
    setPendingStart('host2', 'playerA', 'msg2', 200, 'ch1');
    assert.equal(getPendingStart('host1', 'playerA').messageId, 'msg1');
    assert.equal(getPendingStart('host2', 'playerA').messageId, 'msg2');
  });

  it('overwrites previous start for same player', () => {
    setPendingStart('host1', 'player1', 'msgOld', 100, 'ch1');
    setPendingStart('host1', 'player1', 'msgNew', 200, 'ch1');
    assert.equal(getPendingStart('host1', 'player1').messageId, 'msgNew');
  });

  it('clears a specific pending start', () => {
    setPendingStart('host1', 'playerA', 'msgA', 100, 'ch1');
    setPendingStart('host1', 'playerB', 'msgB', 200, 'ch2');
    clearPendingStart('host1', 'playerA');
    assert.equal(getPendingStart('host1', 'playerA'), null);
    assert.equal(getPendingStart('host1', 'playerB').messageId, 'msgB');
  });

  it('cleans up host map when last player cleared', () => {
    setPendingStart('host1', 'player1', 'msg1', 100, 'ch1');
    clearPendingStart('host1', 'player1');
    assert.equal(getAllPendingStarts('host1').size, 0);
  });

  it('getAllPendingStarts returns all players for a host', () => {
    setPendingStart('host1', 'pA', 'mA', 100, 'c1');
    setPendingStart('host1', 'pB', 'mB', 200, 'c2');
    setPendingStart('host1', 'pC', 'mC', 300, 'c3');
    const all = getAllPendingStarts('host1');
    assert.equal(all.size, 3);
  });

  it('clearAllPendingStarts removes everything for a host', () => {
    setPendingStart('host1', 'pA', 'mA', 100, 'c1');
    setPendingStart('host1', 'pB', 'mB', 200, 'c2');
    clearAllPendingStarts('host1');
    assert.equal(getPendingStart('host1', 'pA'), null);
    assert.equal(getAllPendingStarts('host1').size, 0);
  });
});

// ─────────────────────────────────────────────
// Discord custom_id constraints
// ─────────────────────────────────────────────

describe('Discord custom_id encoding — must stay under 100 chars', () => {
  // Discord rejects any component with custom_id > 100 characters.
  // This caused a production break when we encoded too many values.
  // These tests use worst-case Discord snowflake IDs (max 20 digits).
  const DISCORD_CUSTOM_ID_LIMIT = 100;
  const MAX_SNOWFLAKE = '99999999999999999999'; // 20 digits (theoretical max)
  const MAX_PLAYER_ID = '99999999999999999999'; // 20 digits
  const MAX_DURATION_MS = '999999999'; // ~11.5 days in ms (9 digits, realistic max)

  it('timer_post custom_id fits with worst-case IDs', () => {
    // Format: timer_post|playerId|durationMs|startMsgId|endMsgId
    const customId = `timer_post|${MAX_PLAYER_ID}|${MAX_DURATION_MS}|${MAX_SNOWFLAKE}|${MAX_SNOWFLAKE}`;
    assert.ok(
      customId.length <= DISCORD_CUSTOM_ID_LIMIT,
      `timer_post custom_id is ${customId.length} chars (max ${DISCORD_CUSTOM_ID_LIMIT}): ${customId}`
    );
  });

  it('timer_post custom_id fits with realistic IDs', () => {
    // Real Discord IDs are 18-19 digits currently (2026)
    const playerId = '391415444084490240';     // 18 digits
    const durationMs = '86400000';             // 24 hours (8 digits)
    const startMsgId = '1491110871315779655';  // 19 digits
    const endMsgId = '1491110875904335872';    // 19 digits
    const customId = `timer_post|${playerId}|${durationMs}|${startMsgId}|${endMsgId}`;
    assert.ok(
      customId.length <= DISCORD_CUSTOM_ID_LIMIT,
      `timer_post custom_id is ${customId.length} chars (max ${DISCORD_CUSTOM_ID_LIMIT}): ${customId}`
    );
  });

  it('rejects encoding with too many fields (regression guard)', () => {
    // This was the bug: 7 pipe-separated values exceeded 100 chars
    // Format that BROKE: timer_post|playerId|durationMs|startTime|endTime|startMsgId|endMsgId
    const brokenFormat = `timer_post|${MAX_PLAYER_ID}|${MAX_DURATION_MS}|${MAX_SNOWFLAKE}|${MAX_SNOWFLAKE}|${MAX_SNOWFLAKE}|${MAX_SNOWFLAKE}`;
    assert.ok(
      brokenFormat.length > DISCORD_CUSTOM_ID_LIMIT,
      `6-value encoding should exceed limit to prove why we removed fields (${brokenFormat.length} chars)`
    );
  });

  it('snowflake_calculator button custom_id fits', () => {
    const customId = 'snowflake_calculator';
    assert.ok(customId.length <= DISCORD_CUSTOM_ID_LIMIT);
  });

  it('snowflake_lookup button custom_id fits', () => {
    const customId = 'snowflake_lookup';
    assert.ok(customId.length <= DISCORD_CUSTOM_ID_LIMIT);
  });
});
