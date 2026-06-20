// Tests for the Player Menu currency/inventory visibility economy gate.
//
// Jason feedback (2026-06-18): in the PLAYER menu, the Currency (💰 Dollars) and Inventory
// buttons — and their "🦁 Idol Hunts, Challenges and Safari" heading — should stay hidden
// until the player actually has money or items. ADMIN mode (Player Manager) is exempt so a
// host can grant currency/items from zero. Mirrors the player-card economy line gate.
//
// Pure logic replicated inline per TestingStandards.md (mirrors calculateVisibility in
// playerManagement.js: showInventory switch + hasEconomyActivity + vis.currency/inventory.show,
// and the createPlayerManagementUI `if (row2.length)` heading auto-hide).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function itemTotal(inv = {}) {
  return Object.values(inv).reduce((sum, v) => sum + (typeof v === 'object' ? (v?.quantity || 0) : (v || 0)), 0);
}

// Replicates the currency/inventory `show` calc for given mode + safari blob + config.
function economyButtonShow({ mode = 'player', safari, hasTarget = true, inventoryVisibilityMode = 'always', currentRound = 1 } = {}) {
  const isAdmin = mode === 'admin';
  const isInitialized = safari !== undefined;
  let showInventory;
  switch (inventoryVisibilityMode) {
    case 'always': showInventory = true; break;
    case 'never': showInventory = false; break;
    case 'initialized_only': showInventory = isInitialized; break;
    default: showInventory = isInitialized && currentRound && currentRound !== 0; break; // 'standard'
  }
  const currency = safari?.currency ?? 0;
  const hasEconomyActivity = currency > 0 || itemTotal(safari?.inventory || {}) > 0;
  return isAdmin ? showInventory : (showInventory && hasTarget && hasEconomyActivity);
}

// Replicates whether the 🦁 section heading renders: true iff ≥1 button in the Safari row shows.
function safariHeadingShows(buttonShows) {
  return buttonShows.some(Boolean);
}

describe('Player Menu — currency/inventory economy gate (PLAYER mode)', () => {
  it('hidden when the player has no money and no items', () => {
    assert.equal(economyButtonShow({ safari: { currency: 0, inventory: {} } }), false);
  });

  it('hidden when the player has no safari data', () => {
    assert.equal(economyButtonShow({ safari: undefined }), false);
  });

  it('shown when the player has money (even with 0 items)', () => {
    assert.equal(economyButtonShow({ safari: { currency: 5, inventory: {} } }), true);
  });

  it('shown when the player has items (even with 0 money)', () => {
    assert.equal(economyButtonShow({ safari: { currency: 0, inventory: { sword: { quantity: 1 } } } }), true);
  });

  it('counts legacy plain-number inventory entries', () => {
    assert.equal(economyButtonShow({ safari: { currency: 0, inventory: { nurturer: 2 } } }), true);
  });

  it("still respects inventoryVisibilityMode='never' even with economy", () => {
    assert.equal(economyButtonShow({ safari: { currency: 99, inventory: {} }, inventoryVisibilityMode: 'never' }), false);
  });
});

describe('Player Menu — ADMIN mode is exempt from the economy gate', () => {
  it('admin sees currency/inventory at 0/0 (to grant from zero)', () => {
    assert.equal(economyButtonShow({ mode: 'admin', safari: { currency: 0, inventory: {} } }), true);
  });

  it("admin still hidden when inventoryVisibilityMode='never'", () => {
    assert.equal(economyButtonShow({ mode: 'admin', safari: { currency: 0, inventory: {} }, inventoryVisibilityMode: 'never' }), false);
  });
});

describe('Player Menu — 🦁 section heading auto-hides with its row', () => {
  it('hidden when currency+inventory are the only group members and both hide', () => {
    const player = { currency: 0, inventory: {} };
    const currency = economyButtonShow({ safari: player });
    const inventory = economyButtonShow({ safari: player });
    // no map/stamina/challenges/crafting/actions/stores in this scenario
    assert.equal(safariHeadingShows([currency, inventory]), false);
  });

  it('stays visible if another Safari button (e.g. challenges) is active even at 0/0', () => {
    const player = { currency: 0, inventory: {} };
    const currency = economyButtonShow({ safari: player });
    const inventory = economyButtonShow({ safari: player });
    const challenges = true; // a challenge action is visible to this player
    assert.equal(safariHeadingShows([currency, inventory, challenges]), true);
  });

  it('visible once the player has economy activity', () => {
    const player = { currency: 10, inventory: {} };
    const currency = economyButtonShow({ safari: player });
    const inventory = economyButtonShow({ safari: player });
    assert.equal(safariHeadingShows([currency, inventory]), true);
  });
});
