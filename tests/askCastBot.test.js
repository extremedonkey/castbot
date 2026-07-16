/**
 * Ask CastBot — access gate + response chunking.
 *
 * The gate is the whole security story for this feature (the CLI it spawns has read
 * access to the repo), so it gets the coverage. Pure logic replicated inline per
 * TestingStandards — importing askCastBot.js would pull in child_process/fs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ALLOWED_GUILD_IDS = [
  '1331657596087566398', '1527107915637588059', '1385679393237635122',
  '1524773737973682267', '1512093418602364998', '974318870057848842',
  '1308581797915005029'
];
const ALLOWED_USER_IDS = ['1398896688646590494', '909852958525636660', '691850627189309492'];

// Replicated from askCastBot.js — keep in sync.
function isAskCastBotEnvironment(env) {
  return env.PRODUCTION !== 'TRUE';
}
function hasAskCastBotAccess({ userId, guildId } = {}, env = {}) {
  if (!isAskCastBotEnvironment(env)) return false;
  if (userId && ALLOWED_USER_IDS.includes(userId)) return true;
  return !!guildId && ALLOWED_GUILD_IDS.includes(guildId);
}

const DEV = {};
const TEST = { INSTANCE_ROLE: 'test' };
const PROD = { PRODUCTION: 'TRUE' };
const STRANGER = '111111111111111111';
const RANDOM_GUILD = '222222222222222222';

describe('Ask CastBot — environment gate', () => {
  it('is available in dev', () => {
    assert.equal(hasAskCastBotAccess({ userId: STRANGER, guildId: ALLOWED_GUILD_IDS[0] }, DEV), true);
  });

  it('is available in test', () => {
    assert.equal(hasAskCastBotAccess({ userId: STRANGER, guildId: ALLOWED_GUILD_IDS[0] }, TEST), true);
  });

  it('is NEVER available in prod, even for whitelisted users', () => {
    for (const userId of ALLOWED_USER_IDS) {
      assert.equal(hasAskCastBotAccess({ userId, guildId: ALLOWED_GUILD_IDS[0] }, PROD), false);
    }
  });
});

describe('Ask CastBot — access gate', () => {
  it('allows any admin in every whitelisted guild', () => {
    for (const guildId of ALLOWED_GUILD_IDS) {
      assert.equal(hasAskCastBotAccess({ userId: STRANGER, guildId }, DEV), true, `guild ${guildId}`);
    }
  });

  it('allows whitelisted users in a non-whitelisted guild', () => {
    for (const userId of ALLOWED_USER_IDS) {
      assert.equal(hasAskCastBotAccess({ userId, guildId: RANDOM_GUILD }, DEV), true, `user ${userId}`);
    }
  });

  it('denies an unknown user in an unknown guild', () => {
    assert.equal(hasAskCastBotAccess({ userId: STRANGER, guildId: RANDOM_GUILD }, DEV), false);
  });

  it('denies when identifiers are missing', () => {
    assert.equal(hasAskCastBotAccess({}, DEV), false);
    assert.equal(hasAskCastBotAccess({ userId: undefined, guildId: undefined }, DEV), false);
  });

  it('does not grant access in DMs (no guild) to non-whitelisted users', () => {
    assert.equal(hasAskCastBotAccess({ userId: STRANGER }, DEV), false);
  });
});

// --- super-read gate (playerData.json / safariContent.json access) ---
const SUPER_READ_GUILD_IDS = ['1524773737973682267', '1331657596087566398'];
const BASE_DENY = ['Read(./.env)', 'Read(./.env.*)', 'Read(./*.pem)', 'Read(./.git/**)', 'Read(./backups/**)'];
const PLAYER_DATA_DENY = ['Read(./playerData.json)', 'Read(./safariContent.json)'];
function resolveDenyRules(guildId, isPublicRoute) {
  const superRead = !isPublicRoute && SUPER_READ_GUILD_IDS.includes(guildId);
  return superRead ? BASE_DENY : [...BASE_DENY, ...PLAYER_DATA_DENY];
}

describe('Ask CastBot — super-read gate (playerData/safariContent access)', () => {
  it('lifts the player-data deny for a super-read guild on the Tools-menu route', () => {
    for (const guildId of SUPER_READ_GUILD_IDS) {
      const deny = resolveDenyRules(guildId, false);
      assert.ok(!deny.includes('Read(./playerData.json)'), `guild ${guildId}`);
      assert.ok(!deny.includes('Read(./safariContent.json)'), `guild ${guildId}`);
    }
  });

  it('keeps the player-data deny for a super-read guild on the public route', () => {
    for (const guildId of SUPER_READ_GUILD_IDS) {
      const deny = resolveDenyRules(guildId, true);
      assert.ok(deny.includes('Read(./playerData.json)'), `guild ${guildId}`);
      assert.ok(deny.includes('Read(./safariContent.json)'), `guild ${guildId}`);
    }
  });

  it('keeps the player-data deny for a non-super-read guild, even on the Tools-menu route', () => {
    const deny = resolveDenyRules(RANDOM_GUILD, false);
    assert.ok(deny.includes('Read(./playerData.json)'));
    assert.ok(deny.includes('Read(./safariContent.json)'));
  });

  it('never drops the secrets deny, super-read or not', () => {
    for (const isPublicRoute of [true, false]) {
      const deny = resolveDenyRules(SUPER_READ_GUILD_IDS[0], isPublicRoute);
      for (const rule of BASE_DENY) assert.ok(deny.includes(rule), rule);
    }
  });
});

// --- chunking ---
const MAX_CHUNK = 3500;
function chunkResponse(response) {
  const chunks = [];
  let remaining = response;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf('\n', MAX_CHUNK);
    if (splitAt < MAX_CHUNK * 0.5) splitAt = MAX_CHUNK;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  return chunks;
}

describe('Ask CastBot — response chunking', () => {
  it('leaves a short answer as one chunk', () => {
    assert.deepEqual(chunkResponse('Blacklist the cell, then reverse-blacklist it on the key.'),
      ['Blacklist the cell, then reverse-blacklist it on the key.']);
  });

  it('never emits a chunk over the Discord-safe limit', () => {
    const long = Array.from({ length: 400 }, (_, i) => `Line ${i} of the answer.`).join('\n');
    for (const chunk of chunkResponse(long)) {
      assert.ok(chunk.length <= MAX_CHUNK, `chunk was ${chunk.length}`);
    }
  });

  it('prefers splitting on a newline', () => {
    const long = `${'a'.repeat(3400)}\n${'b'.repeat(3400)}`;
    const chunks = chunkResponse(long);
    assert.equal(chunks[0], 'a'.repeat(3400));
    assert.equal(chunks[1], 'b'.repeat(3400));
  });

  it('hard-cuts when no newline is near the boundary', () => {
    const chunks = chunkResponse('x'.repeat(5000));
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, MAX_CHUNK);
    assert.equal(chunks[1].length, 1500);
  });

  it('round-trips content (no characters silently dropped mid-line)', () => {
    const long = 'z'.repeat(9000);
    assert.equal(chunkResponse(long).join(''), long);
  });
});
