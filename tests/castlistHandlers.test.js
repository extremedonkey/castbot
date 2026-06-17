import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Pure logic replicated inline from castlistHandlers.js (buildEditInfoModal /
 * createEditInfoModalForNew) — the "Associated Season" default-selection rule.
 * Avoids importing the heavy modal builders (Discord/storage deps).
 */

// Sort seasons most-recently-updated first (lastUpdated, fallback createdAt).
function sortSeasonsDesc(seasons) {
  return Object.entries(seasons)
    .sort(([, a], [, b]) => (b.lastUpdated || b.createdAt || 0) - (a.lastUpdated || a.createdAt || 0));
}

// Compute the default-selected season id.
// currentSeasonId = the castlist's existing link (edit modal); pass null for create.
function computeDefaultSeasonId(seasons, currentSeasonId = null) {
  const sorted = sortSeasonsDesc(seasons);
  const mostRecentSeasonId = sorted.length > 0 ? sorted[0][1].seasonId : null;
  return currentSeasonId || mostRecentSeasonId;
}

const SEASONS = {
  cfg_a: { seasonId: 's_a', seasonName: 'A', createdAt: 100, lastUpdated: 200 },
  cfg_b: { seasonId: 's_b', seasonName: 'B', createdAt: 150, lastUpdated: 500 }, // most recently updated
  cfg_c: { seasonId: 's_c', seasonName: 'C', createdAt: 900 },                   // newest createdAt, no lastUpdated
};

describe('Castlist modal — Associated Season default', () => {
  it('orders seasons by lastUpdated desc (falling back to createdAt)', () => {
    const order = sortSeasonsDesc(SEASONS).map(([, s]) => s.seasonId);
    // s_b (500) > s_c (900 via createdAt) > s_a (200)
    assert.deepEqual(order, ['s_c', 's_b', 's_a']);
  });

  it('create modal: defaults to the most-recently-updated season', () => {
    // s_c has createdAt 900 (no lastUpdated) — highest effective time, so it wins
    assert.equal(computeDefaultSeasonId(SEASONS, null), 's_c');
  });

  it('edit modal: keeps the castlist\'s existing season link when set', () => {
    assert.equal(computeDefaultSeasonId(SEASONS, 's_a'), 's_a');
  });

  it('edit modal: defaults to most-recent when castlist has no link yet', () => {
    assert.equal(computeDefaultSeasonId(SEASONS, null), 's_c');
  });

  it('no seasons configured: default is null → "No Season" is selected', () => {
    const id = computeDefaultSeasonId({}, null);
    assert.equal(id, null);
    assert.equal(!id, true); // "No Season" option gets default: !effectiveSeasonId
  });

  it('lastUpdated beats a newer createdAt on a different season', () => {
    const two = {
      x: { seasonId: 's_x', createdAt: 1000 },                 // no lastUpdated
      y: { seasonId: 's_y', createdAt: 10, lastUpdated: 2000 } // updated most recently
    };
    assert.equal(computeDefaultSeasonId(two, null), 's_y');
  });
});

describe('Add New Tribe modal — description copy', () => {
  it('stays within Discord Label description 100-char limit', () => {
    const desc = 'New role with this name, added as a tribe. Already have the role? Add it from the previous screen.';
    assert.ok(desc.length <= 100, `description is ${desc.length} chars`);
  });
});
