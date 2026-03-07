/**
 * Tests for utils/memberFetchUtils.js
 *
 * Verifies that member fetch utilities gracefully handle departed guild members
 * instead of hanging or throwing unhandled errors.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { safeFetchMembers, safeFetchMember, resolveDisplayName } from '../utils/memberFetchUtils.js';

// Mock guild member
function createMockMember(userId, displayName) {
  return {
    displayName,
    user: { id: userId, username: `user_${userId}`, globalName: displayName },
    roles: { cache: new Map() }
  };
}

// Mock guild that simulates some members having left
function createMockGuild(presentMembers, guildName = 'Test Guild') {
  const memberMap = new Map();
  for (const m of presentMembers) {
    memberMap.set(m.user.id, m);
  }

  return {
    name: guildName,
    members: {
      fetch: async (userId) => {
        if (typeof userId === 'string') {
          const member = memberMap.get(userId);
          if (!member) {
            throw new Error(`Unknown Member: ${userId}`);
          }
          return member;
        }
        // Simulate the batch hang by never resolving if any member is missing
        if (userId?.user && Array.isArray(userId.user)) {
          for (const uid of userId.user) {
            if (!memberMap.has(uid)) {
              // This simulates the real Discord.js behavior: hangs forever
              return new Promise(() => {}); // never resolves
            }
          }
          return memberMap;
        }
        return memberMap;
      },
      cache: memberMap
    }
  };
}

describe('safeFetchMembers', () => {
  let guild;
  const member1 = createMockMember('111', 'Alice');
  const member2 = createMockMember('222', 'Bob');

  beforeEach(() => {
    guild = createMockGuild([member1, member2]);
  });

  it('should fetch all present members', async () => {
    const result = await safeFetchMembers(guild, ['111', '222']);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get('111').displayName, 'Alice');
    assert.strictEqual(result.get('222').displayName, 'Bob');
  });

  it('should skip departed members without hanging', async () => {
    const result = await safeFetchMembers(guild, ['111', '999', '222'], { silent: true });
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.has('999'), false);
    assert.strictEqual(result.get('111').displayName, 'Alice');
    assert.strictEqual(result.get('222').displayName, 'Bob');
  });

  it('should return empty map when all members have left', async () => {
    const result = await safeFetchMembers(guild, ['888', '999'], { silent: true });
    assert.strictEqual(result.size, 0);
  });

  it('should return empty map for empty input', async () => {
    const result = await safeFetchMembers(guild, []);
    assert.strictEqual(result.size, 0);
  });

  it('should demonstrate batch fetch hangs (the bug we fixed)', async () => {
    // This test proves the batch pattern hangs when a member is missing
    const batchPromise = guild.members.fetch({ user: ['111', '999'] });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 100)
    );

    await assert.rejects(
      () => Promise.race([batchPromise, timeout]),
      { message: 'TIMEOUT' },
      'Batch fetch should hang (timeout) when a member is missing'
    );
  });
});

describe('safeFetchMember', () => {
  let guild;

  beforeEach(() => {
    guild = createMockGuild([createMockMember('111', 'Alice')]);
  });

  it('should return member when present', async () => {
    const member = await safeFetchMember(guild, '111');
    assert.notStrictEqual(member, null);
    assert.strictEqual(member.displayName, 'Alice');
  });

  it('should return null when member has left', async () => {
    const member = await safeFetchMember(guild, '999');
    assert.strictEqual(member, null);
  });
});

describe('resolveDisplayName', () => {
  let guild;

  beforeEach(() => {
    guild = createMockGuild([createMockMember('111', 'Alice')]);
  });

  it('should return guild display name for present member', async () => {
    const name = await resolveDisplayName(guild, '111');
    assert.strictEqual(name, 'Alice');
  });

  it('should fallback to stored displayName for departed member', async () => {
    const name = await resolveDisplayName(guild, '999', { displayName: 'OldName' });
    assert.strictEqual(name, 'OldName');
  });

  it('should fallback to stored globalName', async () => {
    const name = await resolveDisplayName(guild, '999', { globalName: 'GlobalBob' });
    assert.strictEqual(name, 'GlobalBob');
  });

  it('should fallback to stored username', async () => {
    const name = await resolveDisplayName(guild, '999', { username: 'bob123' });
    assert.strictEqual(name, 'bob123');
  });

  it('should fallback to truncated userId when no data available', async () => {
    const name = await resolveDisplayName(guild, '12345678901234567890');
    assert.strictEqual(name, 'Player 7890');
  });
});
