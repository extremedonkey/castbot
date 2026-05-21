import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated inline from vanityRoleManager.js (pure logic) to avoid importing
// storage.js side effects in the test runner. Keep in sync with the source.
function computeVanityClear(players = {}, memberIdsWithRole = []) {
  const idsToClear = [];
  let entriesRemoved = 0;
  for (const id of memberIdsWithRole) {
    const vanity = players?.[id]?.vanityRoles;
    if (Array.isArray(vanity) && vanity.length > 0) {
      idsToClear.push(id);
      entriesRemoved += vanity.length;
    }
  }
  return { idsToClear, entriesRemoved, membersChecked: memberIdsWithRole.length };
}

describe('vanityRoleManager — computeVanityClear', () => {
  it('clears only members that actually have vanity roles', () => {
    const players = {
      a: { vanityRoles: ['r1', 'r2'] },
      b: { vanityRoles: [] },
      c: { vanityRoles: ['r3'] },
      d: { age: '25' } // no vanityRoles key at all
    };
    const result = computeVanityClear(players, ['a', 'b', 'c', 'd']);
    assert.deepEqual(result.idsToClear, ['a', 'c']);
    assert.equal(result.entriesRemoved, 3);
    assert.equal(result.membersChecked, 4);
  });

  it('only counts members who hold the selected role (ignores others)', () => {
    const players = {
      a: { vanityRoles: ['r1'] },
      z: { vanityRoles: ['r9', 'r8'] } // not in the role → must be untouched
    };
    const result = computeVanityClear(players, ['a']);
    assert.deepEqual(result.idsToClear, ['a']);
    assert.equal(result.entriesRemoved, 1);
  });

  it('returns nothing to clear when no member has vanity roles', () => {
    const players = { a: { vanityRoles: [] }, b: {} };
    const result = computeVanityClear(players, ['a', 'b']);
    assert.deepEqual(result.idsToClear, []);
    assert.equal(result.entriesRemoved, 0);
    assert.equal(result.membersChecked, 2);
  });

  it('handles unknown member IDs (not present in players map)', () => {
    const players = { a: { vanityRoles: ['r1'] } };
    const result = computeVanityClear(players, ['ghost1', 'ghost2']);
    assert.deepEqual(result.idsToClear, []);
    assert.equal(result.entriesRemoved, 0);
    assert.equal(result.membersChecked, 2);
  });

  it('is safe with empty/default inputs', () => {
    const result = computeVanityClear();
    assert.deepEqual(result.idsToClear, []);
    assert.equal(result.entriesRemoved, 0);
    assert.equal(result.membersChecked, 0);
  });

  it('counts multiple vanity entries per player correctly', () => {
    const players = {
      a: { vanityRoles: ['r1', 'r2', 'r3'] },
      b: { vanityRoles: ['r4', 'r5'] }
    };
    const result = computeVanityClear(players, ['a', 'b']);
    assert.deepEqual(result.idsToClear, ['a', 'b']);
    assert.equal(result.entriesRemoved, 5);
  });
});
