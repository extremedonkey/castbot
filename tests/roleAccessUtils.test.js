/**
 * Tests for utils/roleAccessUtils.js — Roles & Security creation-time channel grants.
 *
 * Replicates the PURE buildRoleAccessEntries logic inline (the real module imports
 * discord.js + storage.js file I/O, which we avoid in unit tests per TestingStandards).
 * Permission bits are opaque pass-through values, so string stand-ins are used.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated from utils/roleAccessUtils.js — keep in sync
function buildRoleAccessEntries({ roleIds, validRoleIds, everyoneRoleId, allow }) {
  const entries = [];
  const skipped = [];
  const seen = new Set();
  for (const roleId of roleIds || []) {
    if (!roleId || seen.has(roleId)) continue;
    seen.add(roleId);
    if (roleId === everyoneRoleId || !validRoleIds.has(roleId)) {
      skipped.push(roleId);
      continue;
    }
    entries.push({ id: roleId, allow });
  }
  return { entries, skipped };
}

// Replicated from utils/roleAccessUtils.js — keep in sync
function hasAllRequiredBits(existingAllow, requiredBits) {
  return requiredBits.every(bit => (existingAllow & bit) === bit);
}

const SAFARI_BITS = ['ViewChannel', 'ManageChannels'];
const APPLICATION_BITS = ['ViewChannel', 'SendMessages', 'ReadMessageHistory'];
const EVERYONE = '1000000000000000000';

describe('Roles & Security — buildRoleAccessEntries', () => {
  it('returns no entries for an empty whitelist', () => {
    const result = buildRoleAccessEntries({
      roleIds: [], validRoleIds: new Set(['1', '2']), everyoneRoleId: EVERYONE, allow: SAFARI_BITS
    });
    assert.deepEqual(result, { entries: [], skipped: [] });
  });

  it('returns no entries for undefined/null whitelist without crashing', () => {
    for (const roleIds of [undefined, null]) {
      const result = buildRoleAccessEntries({
        roleIds, validRoleIds: new Set(['1']), everyoneRoleId: EVERYONE, allow: SAFARI_BITS
      });
      assert.deepEqual(result, { entries: [], skipped: [] });
    }
  });

  it('grants valid roles the exact allow bits, preserving order', () => {
    const result = buildRoleAccessEntries({
      roleIds: ['111', '222'],
      validRoleIds: new Set(['111', '222', '333']),
      everyoneRoleId: EVERYONE,
      allow: SAFARI_BITS
    });
    assert.deepEqual(result.entries, [
      { id: '111', allow: SAFARI_BITS },
      { id: '222', allow: SAFARI_BITS }
    ]);
    assert.deepEqual(result.skipped, []);
  });

  it('skips deleted roles but still grants the remaining valid ones', () => {
    const result = buildRoleAccessEntries({
      roleIds: ['111', 'deleted-role', '222'],
      validRoleIds: new Set(['111', '222']),
      everyoneRoleId: EVERYONE,
      allow: SAFARI_BITS
    });
    assert.deepEqual(result.entries.map(e => e.id), ['111', '222']);
    assert.deepEqual(result.skipped, ['deleted-role']);
  });

  it('filters @everyone even when it exists in the guild (duplicate-overwrite-ID protection)', () => {
    const result = buildRoleAccessEntries({
      roleIds: [EVERYONE, '111'],
      validRoleIds: new Set([EVERYONE, '111']),
      everyoneRoleId: EVERYONE,
      allow: SAFARI_BITS
    });
    assert.deepEqual(result.entries.map(e => e.id), ['111']);
    assert.deepEqual(result.skipped, [EVERYONE]);
  });

  it('dedupes repeated role IDs to a single entry', () => {
    const result = buildRoleAccessEntries({
      roleIds: ['111', '111', '111'],
      validRoleIds: new Set(['111']),
      everyoneRoleId: EVERYONE,
      allow: SAFARI_BITS
    });
    assert.equal(result.entries.length, 1);
    assert.deepEqual(result.skipped, []);
  });

  it('passes bit sets through verbatim — Safari vs Application sets stay distinct', () => {
    const safari = buildRoleAccessEntries({
      roleIds: ['111'], validRoleIds: new Set(['111']), everyoneRoleId: EVERYONE, allow: SAFARI_BITS
    });
    const application = buildRoleAccessEntries({
      roleIds: ['111'], validRoleIds: new Set(['111']), everyoneRoleId: EVERYONE, allow: APPLICATION_BITS
    });
    assert.deepEqual(safari.entries[0].allow, ['ViewChannel', 'ManageChannels']);
    assert.deepEqual(application.entries[0].allow, ['ViewChannel', 'SendMessages', 'ReadMessageHistory']);
    // Applications must never gain ManageChannels
    assert.ok(!application.entries[0].allow.includes('ManageChannels'));
  });

  it('composes safely after a caller @everyone deny entry — deny first, no duplicate IDs', () => {
    const { entries } = buildRoleAccessEntries({
      roleIds: [EVERYONE, '111', '222'],
      validRoleIds: new Set([EVERYONE, '111', '222']),
      everyoneRoleId: EVERYONE,
      allow: SAFARI_BITS
    });
    const permissionOverwrites = [
      { id: EVERYONE, deny: ['ViewChannel'] },
      ...entries
    ];
    assert.deepEqual(permissionOverwrites[0], { id: EVERYONE, deny: ['ViewChannel'] });
    const ids = permissionOverwrites.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate overwrite IDs');
  });

  it('silently drops falsy role IDs without crashing', () => {
    const result = buildRoleAccessEntries({
      roleIds: ['', null, undefined, '111'],
      validRoleIds: new Set(['111']),
      everyoneRoleId: EVERYONE,
      allow: SAFARI_BITS
    });
    assert.deepEqual(result.entries.map(e => e.id), ['111']);
    assert.deepEqual(result.skipped, []);
  });
});

describe('Roles & Security — hasAllRequiredBits (ensure-on-existing skip check)', () => {
  // Real Discord permission bit values
  const VIEW_CHANNEL = 1n << 10n;
  const MANAGE_CHANNELS = 1n << 4n;
  const SEND_MESSAGES = 1n << 11n;

  it('true when the overwrite already carries every required bit', () => {
    const existing = VIEW_CHANNEL | MANAGE_CHANNELS | SEND_MESSAGES;
    assert.equal(hasAllRequiredBits(existing, [VIEW_CHANNEL, MANAGE_CHANNELS]), true);
  });

  it('false when any required bit is missing (partial grant must be re-applied)', () => {
    const viewOnly = VIEW_CHANNEL;
    assert.equal(hasAllRequiredBits(viewOnly, [VIEW_CHANNEL, MANAGE_CHANNELS]), false);
  });

  it('false for an empty allow bitfield', () => {
    assert.equal(hasAllRequiredBits(0n, [VIEW_CHANNEL]), false);
  });

  it('true for an empty requirements list (vacuous)', () => {
    assert.equal(hasAllRequiredBits(0n, []), true);
  });

  it('unrelated bits do not satisfy requirements', () => {
    assert.equal(hasAllRequiredBits(SEND_MESSAGES, [VIEW_CHANNEL]), false);
  });
});
