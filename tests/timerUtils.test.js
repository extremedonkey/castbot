/**
 * timerUtils.test.js — Unit tests for snowflake timing utilities
 *
 * Tests pure functions only — no Discord, no I/O.
 * Logic is replicated inline to avoid importing runtime modules.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate pure logic inline (matches timerUtils.js)
// ─────────────────────────────────────────────

const DISCORD_EPOCH = 1420070400000n;

const KNOWN_ORG_BOT_IDS = new Set([
  '235148962103951360',  // CarlBot
  '784284227373367346',
  '155149108183695360',
  '695664345832620062',
  '443545183997657120',
  '1319912453248647170',
]);

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
    formattedExcel: formatDurationExcel(durationMs),
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

function formatDurationExcel(ms) {
  if (ms < 0) ms = Math.abs(ms);
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function discordTimestamp(timestampMs, style = 'F') {
  return `<t:${Math.floor(timestampMs / 1000)}:${style}>`;
}

function discordTimestampWithSeconds(timestampMs) {
  const unix = Math.floor(timestampMs / 1000);
  return `<t:${unix}:D> at <t:${unix}:T>`;
}

// Bot detection + player resolution
function isBot(user) {
  if (!user) return true;
  if (user.bot === true) return true;
  if (user.id && KNOWN_ORG_BOT_IDS.has(user.id)) return true;
  return false;
}

function isBotId(userId) {
  if (!userId || userId === '0') return true;
  return KNOWN_ORG_BOT_IDS.has(userId);
}

function resolvePlayerForResult(startAuthor, endAuthor) {
  const startIsBot = isBot(startAuthor);
  const endIsBot = isBot(endAuthor);

  if (!endIsBot) return endAuthor.id;
  if (!startIsBot) return startAuthor.id;
  return null;
}

function resolvePlayerFromIds(startUserId, endUserId) {
  const startIsBot = isBotId(startUserId);
  const endIsBot = isBotId(endUserId);

  if (!endIsBot) return endUserId;
  if (!startIsBot) return startUserId;
  return null;
}

// Pending starts (in-memory) — invoker-only keying
const pendingStarts = new Map();
function setPendingStart(invokerId, data) {
  const previous = pendingStarts.get(invokerId) || null;
  pendingStarts.set(invokerId, data);
  return previous;
}
function getPendingStart(invokerId) {
  return pendingStarts.get(invokerId) || null;
}
function clearPendingStart(invokerId) {
  pendingStarts.delete(invokerId);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('snowflakeToTimestamp', () => {
  it('decodes a known Discord snowflake (Discord epoch reference)', () => {
    // Snowflake 0 = Discord epoch exactly (2015-01-01T00:00:00.000Z)
    const ts = snowflakeToTimestamp('0');
    assert.equal(ts, 1420070400000);
    assert.equal(new Date(ts).toISOString(), '2015-01-01T00:00:00.000Z');
  });

  it('decodes a real-world snowflake correctly', () => {
    // Known: Discord's example snowflake 175928847299117063 → 2016-04-30
    const ts = snowflakeToTimestamp('175928847299117063');
    const date = new Date(ts);
    assert.equal(date.getUTCFullYear(), 2016);
    assert.equal(date.getUTCMonth(), 3);
    assert.equal(date.getUTCDate(), 30);
  });

  it('handles string and bigint input identically', () => {
    const fromString = snowflakeToTimestamp('175928847299117063');
    const fromBigInt = snowflakeToTimestamp(175928847299117063n);
    assert.equal(fromString, fromBigInt);
  });

  it('handles recent snowflakes (2026+)', () => {
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
  function makeSnowflake(discordMs) {
    return (BigInt(discordMs) << 22n).toString();
  }

  it('calculates duration between two snowflakes', () => {
    const start = makeSnowflake(100000000);
    const end = makeSnowflake(100060000);   // 60 seconds later
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 60000);
    assert.equal(result.formatted, '1m 0s');
    assert.equal(result.formattedExcel, '0:01:00');
    assert.equal(result.reversed, false);
  });

  it('handles reversed order (end before start)', () => {
    const start = makeSnowflake(100060000);
    const end = makeSnowflake(100000000);
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 60000);
    assert.equal(result.reversed, true);
  });

  it('returns 0 for identical snowflakes', () => {
    const id = makeSnowflake(100000000);
    const result = timeBetweenSnowflakes(id, id);
    assert.equal(result.durationMs, 0);
    assert.equal(result.formatted, '0ms');
    assert.equal(result.formattedExcel, '0:00:00');
    assert.equal(result.reversed, false);
  });

  it('calculates hours correctly', () => {
    const start = makeSnowflake(100000000);
    const end = makeSnowflake(103600000); // 1 hour later
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 3600000);
    assert.equal(result.formatted, '1h 0m 0s');
    assert.equal(result.formattedExcel, '1:00:00');
  });

  it('calculates complex durations', () => {
    const start = makeSnowflake(100000000);
    const end = makeSnowflake(108130000); // 2h 15m 30s
    const result = timeBetweenSnowflakes(start, end);
    assert.equal(result.durationMs, 8130000);
    assert.equal(result.formatted, '2h 15m 30s');
    assert.equal(result.formattedExcel, '2:15:30');
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

describe('formatDurationExcel — HH:MM:SS for copy-paste', () => {
  it('formats sub-minute', () => {
    assert.equal(formatDurationExcel(0), '0:00:00');
    assert.equal(formatDurationExcel(1000), '0:00:01');
    assert.equal(formatDurationExcel(45200), '0:00:45');
    assert.equal(formatDurationExcel(59900), '0:00:59');
  });

  it('formats minutes with zero padding', () => {
    assert.equal(formatDurationExcel(60000), '0:01:00');
    assert.equal(formatDurationExcel(611000), '0:10:11'); // user's example
    assert.equal(formatDurationExcel(754000), '0:12:34');
    assert.equal(formatDurationExcel(611000), '0:10:11');
  });

  it('formats hours', () => {
    assert.equal(formatDurationExcel(3600000), '1:00:00');
    assert.equal(formatDurationExcel(5025000), '1:23:45');
  });

  it('formats multi-hour durations (no day rollover)', () => {
    // 25 hours = 25:00:00 (not 1d 1h)
    assert.equal(formatDurationExcel(90000000), '25:00:00');
    assert.equal(formatDurationExcel(94500000), '26:15:00');
  });

  it('handles negative values (takes absolute)', () => {
    assert.equal(formatDurationExcel(-611000), '0:10:11');
  });
});

describe('discordTimestamp', () => {
  it('formats with default full style', () => {
    assert.equal(discordTimestamp(1712150400000), '<t:1712150400:F>');
  });

  it('formats with relative style', () => {
    assert.equal(discordTimestamp(1712150400000, 'R'), '<t:1712150400:R>');
  });

  it('formats with short time style', () => {
    assert.equal(discordTimestamp(1712150400000, 't'), '<t:1712150400:t>');
  });

  it('handles millisecond precision (floors to seconds)', () => {
    assert.equal(discordTimestamp(1712150400999), '<t:1712150400:F>');
  });
});

describe('discordTimestampWithSeconds', () => {
  it('combines D and T styles', () => {
    const result = discordTimestampWithSeconds(1712150400000);
    assert.equal(result, '<t:1712150400:D> at <t:1712150400:T>');
  });

  it('floors to seconds on both halves', () => {
    const result = discordTimestampWithSeconds(1712150400999);
    assert.equal(result, '<t:1712150400:D> at <t:1712150400:T>');
  });
});

// ─────────────────────────────────────────────
// Bot detection + player resolution
// ─────────────────────────────────────────────

describe('isBot — detects bots via flag or ID list', () => {
  it('treats null/undefined as bot', () => {
    assert.equal(isBot(null), true);
    assert.equal(isBot(undefined), true);
  });

  it('detects bot via author.bot flag', () => {
    assert.equal(isBot({ id: '123', bot: true }), true);
  });

  it('accepts real user (bot: false)', () => {
    assert.equal(isBot({ id: '391415444084490240', bot: false }), false);
  });

  it('accepts user with no bot field', () => {
    assert.equal(isBot({ id: '391415444084490240' }), false);
  });

  it('detects CarlBot by ID even without bot flag', () => {
    assert.equal(isBot({ id: '235148962103951360' }), true);
  });

  it('detects all known ORG bots by ID', () => {
    for (const id of KNOWN_ORG_BOT_IDS) {
      assert.equal(isBot({ id }), true, `${id} should be detected as a bot`);
    }
  });
});

describe('isBotId — ID-only bot detection', () => {
  it('treats null/undefined/empty as bot', () => {
    assert.equal(isBotId(null), true);
    assert.equal(isBotId(undefined), true);
    assert.equal(isBotId(''), true);
  });

  it('detects CarlBot by ID', () => {
    assert.equal(isBotId('235148962103951360'), true);
  });

  it('returns false for real user ID', () => {
    assert.equal(isBotId('391415444084490240'), false);
  });
});

describe('resolvePlayerForResult — player identification fallback', () => {
  const realUserA = { id: '391415444084490240', bot: false };
  const realUserB = { id: '1086246253819613274', bot: false };
  const carlBot = { id: '235148962103951360', bot: true };
  const otherBot = { id: '784284227373367346' }; // bot via ID list

  it('prefers END user when both are real users', () => {
    assert.equal(resolvePlayerForResult(realUserA, realUserB), realUserB.id);
  });

  it('returns START user when END is a bot', () => {
    assert.equal(resolvePlayerForResult(realUserA, carlBot), realUserA.id);
  });

  it('returns END user when START is a bot (the main bug scenario)', () => {
    // The bug: host right-clicks carl-bot's message as start, player's message as end
    assert.equal(resolvePlayerForResult(carlBot, realUserA), realUserA.id);
  });

  it('returns END user when START is a CastBot-like bot', () => {
    // The Challenge Timer scenario — CastBot posts start, player clicks button
    const castBot = { id: '1328366050848411658', bot: true };
    assert.equal(resolvePlayerForResult(castBot, realUserA), realUserA.id);
  });

  it('returns null when both are bots', () => {
    assert.equal(resolvePlayerForResult(carlBot, otherBot), null);
  });

  it('returns null when both are missing', () => {
    assert.equal(resolvePlayerForResult(null, null), null);
  });

  it('returns END user when START is missing', () => {
    assert.equal(resolvePlayerForResult(null, realUserA), realUserA.id);
  });

  it('returns START user when END is missing', () => {
    assert.equal(resolvePlayerForResult(realUserA, null), realUserA.id);
  });
});

describe('resolvePlayerFromIds — ID-only player resolution', () => {
  const userA = '391415444084490240';
  const userB = '1086246253819613274';
  const carlBot = '235148962103951360';

  it('prefers END when both are real', () => {
    assert.equal(resolvePlayerFromIds(userA, userB), userB);
  });

  it('returns END when START is a bot', () => {
    assert.equal(resolvePlayerFromIds(carlBot, userA), userA);
  });

  it('returns START when END is a bot', () => {
    assert.equal(resolvePlayerFromIds(userA, carlBot), userA);
  });

  it('returns null when both are bots', () => {
    assert.equal(resolvePlayerFromIds(carlBot, '784284227373367346'), null);
  });

  it('treats "0" placeholder as missing', () => {
    // The Post Publicly encoding uses "0" when author ID is missing
    assert.equal(resolvePlayerFromIds('0', userA), userA);
    assert.equal(resolvePlayerFromIds(userA, '0'), userA);
    assert.equal(resolvePlayerFromIds('0', '0'), null);
  });
});

// ─────────────────────────────────────────────
// Pending starts — invoker-only keying
// ─────────────────────────────────────────────

describe('pendingStarts — invoker-only keying', () => {
  beforeEach(() => {
    pendingStarts.clear();
  });

  it('stores and retrieves a pending start', () => {
    const data = { messageId: 'msg123', timestamp: 1712150400000, channelId: 'ch456', authorId: 'user1', authorIsBot: false };
    const previous = setPendingStart('invoker1', data);
    assert.equal(previous, null);
    assert.deepEqual(getPendingStart('invoker1'), data);
  });

  it('returns null for unknown invoker', () => {
    assert.equal(getPendingStart('nobody'), null);
  });

  it('setPendingStart returns the previous value when overwriting', () => {
    const first = { messageId: 'msgA', timestamp: 100, channelId: 'ch1', authorId: 'u1', authorIsBot: false };
    const second = { messageId: 'msgB', timestamp: 200, channelId: 'ch2', authorId: 'u2', authorIsBot: true };
    assert.equal(setPendingStart('invoker1', first), null);
    assert.deepEqual(setPendingStart('invoker1', second), first);
    assert.deepEqual(getPendingStart('invoker1'), second);
  });

  it('supports multiple invokers independently', () => {
    const dataA = { messageId: 'msgA', timestamp: 100, channelId: 'ch1', authorId: 'u1', authorIsBot: false };
    const dataB = { messageId: 'msgB', timestamp: 200, channelId: 'ch2', authorId: 'u2', authorIsBot: false };
    setPendingStart('invoker1', dataA);
    setPendingStart('invoker2', dataB);
    assert.deepEqual(getPendingStart('invoker1'), dataA);
    assert.deepEqual(getPendingStart('invoker2'), dataB);
  });

  it('clears a specific invoker', () => {
    setPendingStart('invoker1', { messageId: 'msg', timestamp: 1, channelId: 'ch', authorId: 'u', authorIsBot: false });
    clearPendingStart('invoker1');
    assert.equal(getPendingStart('invoker1'), null);
  });

  it('clearPendingStart is a no-op for unknown invokers', () => {
    assert.doesNotThrow(() => clearPendingStart('nobody'));
  });

  it('stores bot author info for resolution at Stop time', () => {
    // Main scenario: Start is a bot, need to remember that for Stop
    const data = { messageId: 'msg', timestamp: 1, channelId: 'ch', authorId: '235148962103951360', authorIsBot: true };
    setPendingStart('invoker1', data);
    const retrieved = getPendingStart('invoker1');
    assert.equal(retrieved.authorIsBot, true);
    assert.equal(retrieved.authorId, '235148962103951360');
  });
});

// ─────────────────────────────────────────────
// Integration scenarios — the bug and its fix
// ─────────────────────────────────────────────

describe('Bug regression — mismatched start/end authors', () => {
  beforeEach(() => pendingStarts.clear());

  it('scenario: bot-posted start + player-posted end', () => {
    // 1. Host right-clicks carl-bot's message → Start Timer
    const carlBotAuthor = { id: '235148962103951360', bot: true };
    const startMsgId = (BigInt(100000000) << 22n).toString();
    setPendingStart('host1', {
      messageId: startMsgId,
      timestamp: snowflakeToTimestamp(startMsgId),
      channelId: 'ch1',
      authorId: carlBotAuthor.id,
      authorIsBot: true,
    });

    // 2. Host right-clicks player's message → Stop Timer
    const playerAuthor = { id: '391415444084490240', bot: false };
    const endMsgId = (BigInt(100610000) << 22n).toString(); // 10m 10s later
    const pending = getPendingStart('host1');
    assert.ok(pending, 'pending start should be found (invoker-only keying)');

    // 3. Resolve player
    const startProxy = { id: pending.authorId, bot: pending.authorIsBot };
    const playerId = resolvePlayerForResult(startProxy, playerAuthor);
    assert.equal(playerId, playerAuthor.id, 'player should be the end author (carl-bot is filtered)');

    // 4. Calculate duration
    const result = timeBetweenSnowflakes(pending.messageId, endMsgId);
    assert.equal(result.durationMs, 610000);
    assert.equal(result.formatted, '10m 10s');
    assert.equal(result.formattedExcel, '0:10:10');
  });

  it('scenario: player-to-player (same author) still works', () => {
    const playerAuthor = { id: '391415444084490240', bot: false };
    const startMsgId = (BigInt(100000000) << 22n).toString();
    setPendingStart('host1', {
      messageId: startMsgId,
      timestamp: snowflakeToTimestamp(startMsgId),
      channelId: 'ch1',
      authorId: playerAuthor.id,
      authorIsBot: false,
    });

    const pending = getPendingStart('host1');
    const endMsgId = (BigInt(100300000) << 22n).toString();
    const startProxy = { id: pending.authorId, bot: pending.authorIsBot };
    const playerId = resolvePlayerForResult(startProxy, playerAuthor);
    assert.equal(playerId, playerAuthor.id);
  });

  it('scenario: both start and end are bots (no player field)', () => {
    const carlBot = { id: '235148962103951360', bot: true };
    const otherBot = { id: '784284227373367346', bot: true };
    setPendingStart('host1', {
      messageId: 'msg',
      timestamp: 1,
      channelId: 'ch',
      authorId: carlBot.id,
      authorIsBot: true,
    });
    const startProxy = { id: 'msg' && carlBot.id, bot: true };
    const playerId = resolvePlayerForResult(startProxy, otherBot);
    assert.equal(playerId, null, 'no player when both are bots');
  });
});

// ─────────────────────────────────────────────
// Discord custom_id constraints
// ─────────────────────────────────────────────

describe('Discord custom_id encoding — must stay under 100 chars', () => {
  const DISCORD_CUSTOM_ID_LIMIT = 100;
  const MAX_SNOWFLAKE = '99999999999999999999'; // 20 digits
  const MAX_USER_ID = '99999999999999999999';   // 20 digits

  it('timer_post encoding fits with worst-case IDs', () => {
    // Format: timer_post|{startMsgId}|{endMsgId}|{startUserId}|{endUserId}
    const customId = `timer_post|${MAX_SNOWFLAKE}|${MAX_SNOWFLAKE}|${MAX_USER_ID}|${MAX_USER_ID}`;
    assert.ok(
      customId.length <= DISCORD_CUSTOM_ID_LIMIT,
      `timer_post custom_id is ${customId.length} chars (max ${DISCORD_CUSTOM_ID_LIMIT}): ${customId}`
    );
  });

  it('timer_post encoding fits with realistic IDs', () => {
    const startMsgId = '1491110871315779655';  // 19 digits
    const endMsgId = '1491110875904335872';    // 19 digits
    const startUserId = '391415444084490240';  // 18 digits
    const endUserId = '1086246253819613274';   // 19 digits
    const customId = `timer_post|${startMsgId}|${endMsgId}|${startUserId}|${endUserId}`;
    assert.ok(
      customId.length <= DISCORD_CUSTOM_ID_LIMIT,
      `timer_post custom_id is ${customId.length} chars: ${customId}`
    );
  });

  it('timer_post with "0" placeholder for missing users fits', () => {
    const startMsgId = '1491110871315779655';
    const endMsgId = '1491110875904335872';
    const customId = `timer_post|${startMsgId}|${endMsgId}|0|0`;
    assert.ok(customId.length <= DISCORD_CUSTOM_ID_LIMIT);
  });

  it('snowflake_calculator button custom_id fits', () => {
    assert.ok('snowflake_calculator'.length <= DISCORD_CUSTOM_ID_LIMIT);
  });

  it('snowflake_lookup button custom_id fits', () => {
    assert.ok('snowflake_lookup'.length <= DISCORD_CUSTOM_ID_LIMIT);
  });
});
