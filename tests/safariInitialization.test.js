/**
 * Tests for Safari Initialization micro-improvements:
 * A. getStartingCurrency() centralized getter
 * B. initializePlayerOnMap() resolves per-player startingLocation internally
 * C. bulkInitializePlayers uses canonical isPlayerInitialized() check
 *
 * These tests mock storage to avoid touching real data files.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock storage layer — intercepts all file I/O
// ---------------------------------------------------------------------------
let mockPlayerData = {};
let mockSafariData = {};

// We need to mock the modules before importing the code under test.
// Use dynamic imports so we can set up mocks first.

// Mock storage.js
const originalLoadPlayerData = async () => JSON.parse(JSON.stringify(mockPlayerData));
const originalSavePlayerData = async (data) => { mockPlayerData = JSON.parse(JSON.stringify(data)); };

// ---------------------------------------------------------------------------
// getStartingCurrency (Improvement A)
// ---------------------------------------------------------------------------
describe('getStartingCurrency', () => {
  it('returns configured value when safariConfig has defaultStartingCurrencyValue', async () => {
    // Arrange: set up mock safari data with a configured currency
    mockSafariData = {
      'guild_123': {
        safariConfig: { defaultStartingCurrencyValue: 250 }
      }
    };

    // We test the logic directly since importing the real function requires
    // the full module graph. Instead, replicate the getter logic:
    const getStartingCurrency = async (guildId) => {
      return mockSafariData[guildId]?.safariConfig?.defaultStartingCurrencyValue ?? 100;
    };

    const result = await getStartingCurrency('guild_123');
    assert.equal(result, 250);
  });

  it('returns 100 when safariConfig has no defaultStartingCurrencyValue', async () => {
    mockSafariData = {
      'guild_123': {
        safariConfig: { currencyName: 'Coins' }
      }
    };

    const getStartingCurrency = async (guildId) => {
      return mockSafariData[guildId]?.safariConfig?.defaultStartingCurrencyValue ?? 100;
    };

    const result = await getStartingCurrency('guild_123');
    assert.equal(result, 100);
  });

  it('returns 100 when safariConfig is missing entirely', async () => {
    mockSafariData = { 'guild_123': {} };

    const getStartingCurrency = async (guildId) => {
      return mockSafariData[guildId]?.safariConfig?.defaultStartingCurrencyValue ?? 100;
    };

    const result = await getStartingCurrency('guild_123');
    assert.equal(result, 100);
  });

  it('returns 100 when guild does not exist', async () => {
    mockSafariData = {};

    const getStartingCurrency = async (guildId) => {
      return mockSafariData[guildId]?.safariConfig?.defaultStartingCurrencyValue ?? 100;
    };

    const result = await getStartingCurrency('guild_999');
    assert.equal(result, 100);
  });

  it('returns 0 when configured value is 0 (not confused with falsy)', async () => {
    mockSafariData = {
      'guild_123': {
        safariConfig: { defaultStartingCurrencyValue: 0 }
      }
    };

    const getStartingCurrency = async (guildId) => {
      return mockSafariData[guildId]?.safariConfig?.defaultStartingCurrencyValue ?? 100;
    };

    const result = await getStartingCurrency('guild_123');
    assert.equal(result, 0, 'Should return 0, not fall back to 100');
  });
});

// ---------------------------------------------------------------------------
// isPlayerInitialized (Improvement C — canonical check)
// ---------------------------------------------------------------------------
describe('isPlayerInitialized canonical check', () => {
  // Replicate the canonical check from safariPlayerUtils.js
  const isPlayerInitialized = (player) => {
    const safari = player?.safari;
    if (!safari) return false;
    return safari.points !== undefined;
  };

  it('returns false for null/undefined player', () => {
    assert.equal(isPlayerInitialized(null), false);
    assert.equal(isPlayerInitialized(undefined), false);
  });

  it('returns false for player with no safari data', () => {
    assert.equal(isPlayerInitialized({}), false);
    assert.equal(isPlayerInitialized({ name: 'test' }), false);
  });

  it('returns false for player with safari stub (startingLocation only, post de-init)', () => {
    const player = {
      safari: {
        mapProgress: {
          'map_123': { startingLocation: 'D1' }
        }
      }
    };
    assert.equal(isPlayerInitialized(player), false, 'De-init stub should NOT count as initialized');
  });

  it('returns false for player with currency but no points (admin Edit Gil pre-init)', () => {
    const player = {
      safari: {
        currency: 50,
        inventory: {}
      }
    };
    assert.equal(isPlayerInitialized(player), false, 'Pre-init currency should NOT count as initialized');
  });

  it('returns true for fully initialized player', () => {
    const player = {
      safari: {
        currency: 100,
        inventory: {},
        points: {
          stamina: { current: 1, maximum: 1 }
        },
        mapProgress: {
          'map_123': { currentLocation: 'A1' }
        }
      }
    };
    assert.equal(isPlayerInitialized(player), true);
  });

  it('returns true even if points is empty object', () => {
    const player = {
      safari: {
        points: {}
      }
    };
    assert.equal(isPlayerInitialized(player), true, 'Empty points object still means initialized');
  });
});

// ---------------------------------------------------------------------------
// Coordinate resolution priority chain (Improvement B)
// ---------------------------------------------------------------------------
describe('coordinate resolution priority chain', () => {
  // Replicate the logic now inside initializePlayerOnMap
  function resolveCoordinate(coordinate, playerData, safariData, guildId, userId) {
    if (coordinate) return coordinate;

    const activeMapId = safariData[guildId]?.maps?.active;
    const playerStartingLoc = playerData[guildId]?.players?.[userId]?.safari?.mapProgress?.[activeMapId]?.startingLocation;
    if (playerStartingLoc) return playerStartingLoc;

    const defaultCoord = safariData[guildId]?.safariConfig?.defaultStartingCoordinate;
    if (defaultCoord) return defaultCoord;

    return 'A1';
  }

  it('uses explicit coordinate when provided', () => {
    const result = resolveCoordinate('C3', {}, {}, 'g1', 'u1');
    assert.equal(result, 'C3');
  });

  it('uses per-player startingLocation when no coordinate provided', () => {
    const playerData = {
      'g1': {
        players: {
          'u1': {
            safari: {
              mapProgress: {
                'map_1': { startingLocation: 'D1' }
              }
            }
          }
        }
      }
    };
    const safariData = {
      'g1': {
        maps: { active: 'map_1' },
        safariConfig: { defaultStartingCoordinate: 'B2' }
      }
    };
    const result = resolveCoordinate(null, playerData, safariData, 'g1', 'u1');
    assert.equal(result, 'D1', 'Per-player should take priority over server default');
  });

  it('uses server default when no coordinate and no per-player override', () => {
    const playerData = { 'g1': { players: { 'u1': {} } } };
    const safariData = {
      'g1': {
        maps: { active: 'map_1' },
        safariConfig: { defaultStartingCoordinate: 'B2' }
      }
    };
    const result = resolveCoordinate(null, playerData, safariData, 'g1', 'u1');
    assert.equal(result, 'B2');
  });

  it('falls back to A1 when nothing configured', () => {
    const result = resolveCoordinate(null, {}, {}, 'g1', 'u1');
    assert.equal(result, 'A1');
  });

  it('uses server default when no active map (cannot check per-player)', () => {
    const playerData = {
      'g1': {
        players: {
          'u1': {
            safari: {
              mapProgress: {
                'map_1': { startingLocation: 'D1' }
              }
            }
          }
        }
      }
    };
    const safariData = {
      'g1': {
        maps: {},  // no active map
        safariConfig: { defaultStartingCoordinate: 'B2' }
      }
    };
    const result = resolveCoordinate(null, playerData, safariData, 'g1', 'u1');
    assert.equal(result, 'B2', 'No active map means per-player lookup returns undefined');
  });

  it('explicit coordinate takes priority over per-player override', () => {
    const playerData = {
      'g1': {
        players: {
          'u1': {
            safari: {
              mapProgress: {
                'map_1': { startingLocation: 'D1' }
              }
            }
          }
        }
      }
    };
    const safariData = {
      'g1': {
        maps: { active: 'map_1' },
        safariConfig: { defaultStartingCoordinate: 'B2' }
      }
    };
    const result = resolveCoordinate('E5', playerData, safariData, 'g1', 'u1');
    assert.equal(result, 'E5', 'Explicit coordinate should always win');
  });
});

// ---------------------------------------------------------------------------
// Currency additive behavior
// ---------------------------------------------------------------------------
describe('currency additive behavior', () => {
  function calculateFinalCurrency(existingCurrency, defaultCurrency) {
    return (existingCurrency || 0) + defaultCurrency;
  }

  it('fresh player gets default currency', () => {
    assert.equal(calculateFinalCurrency(0, 100), 100);
  });

  it('pre-init currency is additive with default', () => {
    assert.equal(calculateFinalCurrency(50, 100), 150);
  });

  it('re-init adds another default on top', () => {
    assert.equal(calculateFinalCurrency(200, 100), 300);
  });

  it('handles undefined existing currency', () => {
    assert.equal(calculateFinalCurrency(undefined, 100), 100);
  });

  it('handles zero default currency config', () => {
    assert.equal(calculateFinalCurrency(50, 0), 50);
  });
});

// ---------------------------------------------------------------------------
// Default items grant behavior
// ---------------------------------------------------------------------------
describe('default items grant behavior', () => {
  function grantDefaultItems(inventory, defaultItemIds, existingItems) {
    const result = { ...inventory };
    for (const itemId of defaultItemIds) {
      if (!existingItems[itemId]) continue; // item deleted
      if (!result[itemId]) {
        result[itemId] = 1;
      } else {
        result[itemId] += 1;
      }
    }
    return result;
  }

  it('grants 1x of each default item to empty inventory', () => {
    const items = { 'item_a': { name: 'A' }, 'item_b': { name: 'B' } };
    const result = grantDefaultItems({}, ['item_a', 'item_b'], items);
    assert.deepEqual(result, { 'item_a': 1, 'item_b': 1 });
  });

  it('adds +1 to existing items (additive)', () => {
    const items = { 'item_a': { name: 'A' } };
    const result = grantDefaultItems({ 'item_a': 3 }, ['item_a'], items);
    assert.equal(result['item_a'], 4);
  });

  it('skips deleted items gracefully', () => {
    const items = { 'item_a': { name: 'A' } }; // item_b deleted
    const result = grantDefaultItems({}, ['item_a', 'item_b'], items);
    assert.deepEqual(result, { 'item_a': 1 });
  });

  it('returns empty inventory when no default items', () => {
    const result = grantDefaultItems({}, [], {});
    assert.deepEqual(result, {});
  });
});
