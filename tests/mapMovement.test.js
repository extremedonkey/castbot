/**
 * Reverse blacklist coverage — pure logic tests (AND semantics).
 *
 * Replicated inline from mapMovement.js (computeReverseBlacklistCoverage) per
 * Testing Standards: mapMovement.js has heavy static top-level imports
 * (discord.js, storage.js, safariManager.js, pointsManager.js), so importing it
 * directly would drag those in for a test that only needs the pure logic.
 * Replica omits the debug console.log only.
 *
 * Semantics under test: a coordinate unlocks only when the player holds EVERY
 * item whose reverseBlacklist lists it. Two items listing the same cell form a
 * door needing both keys — NOT an either/or (the pre-2026-07 union behavior).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function computeReverseBlacklistCoverage(inventory, items) {
    const heldItemIds = new Set();
    for (const [itemId, itemData] of Object.entries(inventory)) {
        const quantity = typeof itemData === 'number' ? itemData : (itemData?.quantity || 0);
        if (quantity > 0) {
            heldItemIds.add(itemId);
        }
    }
    if (heldItemIds.size === 0) {
        return [];
    }

    const requiredByCoord = new Map();
    for (const [itemId, item] of Object.entries(items)) {
        if (Array.isArray(item?.reverseBlacklist)) {
            for (const coord of item.reverseBlacklist) {
                if (!requiredByCoord.has(coord)) {
                    requiredByCoord.set(coord, []);
                }
                requiredByCoord.get(coord).push(itemId);
            }
        }
    }

    const unlockedCoordinates = [];
    for (const [coord, requiredIds] of requiredByCoord) {
        if (requiredIds.every(id => heldItemIds.has(id))) {
            unlockedCoordinates.push(coord);
        }
    }
    return unlockedCoordinates;
}

const ITEMS = {
    red_key: { name: 'Red Key', reverseBlacklist: ['A1'] },
    blue_key: { name: 'Blue Key', reverseBlacklist: ['A1'] },
    boat: { name: 'Boat', reverseBlacklist: ['B1', 'B2'] },
    torch: { name: 'Torch' },
};

describe('Reverse Blacklist — AND semantics across items', () => {
    it('locks a two-key cell when only one key is held (the Red/Blue Key scenario)', () => {
        const coverage = computeReverseBlacklistCoverage({ blue_key: { quantity: 1 } }, ITEMS);
        assert.equal(coverage.includes('A1'), false);
    });

    it('unlocks a two-key cell when both keys are held', () => {
        const coverage = computeReverseBlacklistCoverage(
            { red_key: { quantity: 1 }, blue_key: { quantity: 1 } }, ITEMS);
        assert.equal(coverage.includes('A1'), true);
    });

    it('requires all three items on a three-key cell', () => {
        const items = {
            brass: { reverseBlacklist: ['V1'] },
            iron: { reverseBlacklist: ['V1'] },
            bone: { reverseBlacklist: ['V1'] },
        };
        assert.deepEqual(computeReverseBlacklistCoverage(
            { brass: { quantity: 1 }, iron: { quantity: 1 } }, items), []);
        assert.deepEqual(computeReverseBlacklistCoverage(
            { brass: { quantity: 1 }, iron: { quantity: 1 }, bone: { quantity: 1 } }, items), ['V1']);
    });

    it('single-key cells behave as before (one item alone unlocks its own cells)', () => {
        const coverage = computeReverseBlacklistCoverage({ boat: { quantity: 1 } }, ITEMS);
        assert.deepEqual(coverage.sort(), ['B1', 'B2']);
    });

    it('quantity is binary: 100 copies of one key do not substitute for the other key', () => {
        const coverage = computeReverseBlacklistCoverage({ blue_key: { quantity: 100 } }, ITEMS);
        assert.equal(coverage.includes('A1'), false);
    });

    it('ignores held items with quantity 0', () => {
        const coverage = computeReverseBlacklistCoverage(
            { red_key: { quantity: 0 }, blue_key: { quantity: 1 } }, ITEMS);
        assert.equal(coverage.includes('A1'), false);
    });

    it('supports legacy direct-number inventory format', () => {
        const coverage = computeReverseBlacklistCoverage({ red_key: 1, blue_key: 2 }, ITEMS);
        assert.equal(coverage.includes('A1'), true);
    });

    it('returns [] for empty inventory and tolerates unknown/keyless items', () => {
        assert.deepEqual(computeReverseBlacklistCoverage({}, ITEMS), []);
        const coverage = computeReverseBlacklistCoverage(
            { deleted_item: { quantity: 3 }, torch: { quantity: 1 } }, ITEMS);
        assert.deepEqual(coverage, []);
    });

    it('keeps distinct single-key doors independent when holding multiple keys', () => {
        const coverage = computeReverseBlacklistCoverage(
            { boat: { quantity: 1 }, red_key: { quantity: 1 } }, ITEMS);
        assert.equal(coverage.includes('B1'), true);
        assert.equal(coverage.includes('A1'), false); // still missing blue_key
    });
});
