/**
 * Reverse blacklist coverage — pure logic tests (both modes).
 *
 * Replicated inline from mapMovement.js (computeReverseBlacklistCoverage) per
 * Testing Standards: mapMovement.js has heavy static top-level imports
 * (discord.js, storage.js, safariManager.js, pointsManager.js), so importing it
 * directly would drag those in for a test that only needs the pure logic.
 * Replica omits the debug console.log only.
 *
 * Semantics under test — governed by safariConfig.reverseBlacklistRequireAll:
 *   unset/false (legacy default): OR — any one listing item unlocks the cell.
 *   true:                         AND — the player must hold EVERY listing item
 *                                 (multi-key doors). Cells listed on a single item
 *                                 behave identically in both modes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function computeReverseBlacklistCoverage(inventory, items, requireAll = false) {
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

    if (!requireAll) {
        const unlocked = new Set();
        for (const itemId of heldItemIds) {
            const item = items[itemId];
            if (Array.isArray(item?.reverseBlacklist)) {
                item.reverseBlacklist.forEach(coord => unlocked.add(coord));
            }
        }
        return Array.from(unlocked);
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

describe('Reverse Blacklist — OR mode (legacy default, guild never set the toggle)', () => {
    it('defaults to OR when the flag is omitted entirely', () => {
        const coverage = computeReverseBlacklistCoverage({ blue_key: { quantity: 1 } }, ITEMS);
        assert.equal(coverage.includes('A1'), true);
    });

    it('either key alone opens a shared cell', () => {
        assert.equal(computeReverseBlacklistCoverage(
            { red_key: { quantity: 1 } }, ITEMS, false).includes('A1'), true);
        assert.equal(computeReverseBlacklistCoverage(
            { blue_key: { quantity: 1 } }, ITEMS, false).includes('A1'), true);
    });

    it('explicit false behaves identically to omitting the flag', () => {
        const held = { boat: { quantity: 1 }, red_key: { quantity: 1 } };
        assert.deepEqual(
            computeReverseBlacklistCoverage(held, ITEMS).sort(),
            computeReverseBlacklistCoverage(held, ITEMS, false).sort()
        );
    });

    it('ignores quantity 0 and unknown items in OR mode too', () => {
        assert.deepEqual(computeReverseBlacklistCoverage(
            { red_key: { quantity: 0 } }, ITEMS, false), []);
        assert.deepEqual(computeReverseBlacklistCoverage(
            { deleted_item: { quantity: 3 }, torch: { quantity: 1 } }, ITEMS, false), []);
    });
});

describe('Reverse Blacklist — AND mode (guild opted into multi-key doors)', () => {
    it('locks a two-key cell when only one key is held (the Red/Blue Key scenario)', () => {
        const coverage = computeReverseBlacklistCoverage({ blue_key: { quantity: 1 } }, ITEMS, true);
        assert.equal(coverage.includes('A1'), false);
    });

    it('unlocks a two-key cell when both keys are held', () => {
        const coverage = computeReverseBlacklistCoverage(
            { red_key: { quantity: 1 }, blue_key: { quantity: 1 } }, ITEMS, true);
        assert.equal(coverage.includes('A1'), true);
    });

    it('requires all three items on a three-key cell', () => {
        const items = {
            brass: { reverseBlacklist: ['V1'] },
            iron: { reverseBlacklist: ['V1'] },
            bone: { reverseBlacklist: ['V1'] },
        };
        assert.deepEqual(computeReverseBlacklistCoverage(
            { brass: { quantity: 1 }, iron: { quantity: 1 } }, items, true), []);
        assert.deepEqual(computeReverseBlacklistCoverage(
            { brass: { quantity: 1 }, iron: { quantity: 1 }, bone: { quantity: 1 } }, items, true), ['V1']);
    });

    it('single-key cells behave identically in both modes', () => {
        const held = { boat: { quantity: 1 } };
        assert.deepEqual(computeReverseBlacklistCoverage(held, ITEMS, true).sort(), ['B1', 'B2']);
        assert.deepEqual(computeReverseBlacklistCoverage(held, ITEMS, false).sort(), ['B1', 'B2']);
    });

    it('quantity is binary: 100 copies of one key do not substitute for the other key', () => {
        const coverage = computeReverseBlacklistCoverage({ blue_key: { quantity: 100 } }, ITEMS, true);
        assert.equal(coverage.includes('A1'), false);
    });

    it('ignores held items with quantity 0', () => {
        const coverage = computeReverseBlacklistCoverage(
            { red_key: { quantity: 0 }, blue_key: { quantity: 1 } }, ITEMS, true);
        assert.equal(coverage.includes('A1'), false);
    });

    it('supports legacy direct-number inventory format', () => {
        const coverage = computeReverseBlacklistCoverage({ red_key: 1, blue_key: 2 }, ITEMS, true);
        assert.equal(coverage.includes('A1'), true);
    });

    it('returns [] for empty inventory and tolerates unknown/keyless items', () => {
        assert.deepEqual(computeReverseBlacklistCoverage({}, ITEMS, true), []);
        const coverage = computeReverseBlacklistCoverage(
            { deleted_item: { quantity: 3 }, torch: { quantity: 1 } }, ITEMS, true);
        assert.deepEqual(coverage, []);
    });

    it('keeps distinct single-key doors independent when holding multiple keys', () => {
        const coverage = computeReverseBlacklistCoverage(
            { boat: { quantity: 1 }, red_key: { quantity: 1 } }, ITEMS, true);
        assert.equal(coverage.includes('B1'), true);
        assert.equal(coverage.includes('A1'), false); // still missing blue_key
    });

    it('the two modes genuinely disagree on a shared cell (guard against a no-op toggle)', () => {
        const held = { red_key: { quantity: 1 } };
        assert.equal(computeReverseBlacklistCoverage(held, ITEMS, false).includes('A1'), true);
        assert.equal(computeReverseBlacklistCoverage(held, ITEMS, true).includes('A1'), false);
    });
});

/**
 * Section-scoped movement bounds (RaP 0894 Phase 1) — the seam seal.
 * getMovementBounds itself does file I/O, but its bounds→move filter is pure:
 * replicated from getValidMoves' inclusive-rectangle check. The section geometry
 * behind the bounds is real-imported (src/maps/mapSections.js is pure).
 */
import { getSections, getSectionForCoordinate } from '../src/maps/mapSections.js';
import { tryParseCoordinate, generateCoordinate } from '../utils/coordinateParser.js';

function boundsFor(mapData, coordinate) {
    const w = mapData.gridWidth || mapData.gridSize || 7;
    const h = mapData.gridHeight || mapData.gridSize || 7;
    const globalBounds = { minX: 0, maxX: w - 1, minY: 0, maxY: h - 1 };
    const section = getSectionForCoordinate(mapData, coordinate);
    if (!section) return globalBounds;
    return { minX: section.colStart, maxX: section.colEnd, minY: section.rowStart, maxY: section.rowEnd };
}

function validTargets(coordinate, bounds) {
    const { x: col, y: row } = tryParseCoordinate(coordinate);
    const deltas = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    return deltas
        .map(([dx, dy]) => ({ col: col + dx, row: row + dy }))
        .filter(m => m.col >= bounds.minX && m.col <= bounds.maxX && m.row >= bounds.minY && m.row <= bounds.maxY)
        .map(m => generateCoordinate(m.col, m.row));
}

describe('Section-scoped movement bounds — cross-seam moves never exist', () => {
    // Section 1: A1-G7 (7x7). Section 2 below: A8-G10.
    const sectionedMap = {
        gridWidth: 7, gridHeight: 10,
        sections: [
            { id: 's1', colStart: 0, rowStart: 0, colEnd: 6, rowEnd: 6 },
            { id: 's2', colStart: 0, rowStart: 7, colEnd: 6, rowEnd: 9 }
        ]
    };

    it('a player on section 1\'s bottom row gets NO south-family moves into section 2', () => {
        const targets = validTargets('D7', boundsFor(sectionedMap, 'D7'));
        assert.ok(!targets.includes('D8'), 'D8 is across the seam');
        assert.ok(!targets.includes('C8') && !targets.includes('E8'));
        assert.deepEqual(targets.sort(), ['C6', 'C7', 'D6', 'E6', 'E7'].sort());
    });

    it('a player on section 2\'s top row gets NO north-family moves into section 1', () => {
        const targets = validTargets('D8', boundsFor(sectionedMap, 'D8'));
        assert.ok(!targets.includes('D7') && !targets.includes('C7') && !targets.includes('E7'));
    });

    it('IDENTITY: a legacy section-less map has exactly the old whole-grid bounds', () => {
        const legacy = { gridWidth: 7, gridHeight: 10 };
        assert.deepEqual(boundsFor(legacy, 'D7'), { minX: 0, maxX: 6, minY: 0, maxY: 9 });
        const targets = validTargets('D7', boundsFor(legacy, 'D7'));
        assert.ok(targets.includes('D8'), 'no seam on a legacy map — D8 reachable');
        assert.equal(getSections(legacy).length, 1);
    });

    it('defensive: a coordinate in a bounding-box hole falls back to global bounds (no strand)', () => {
        const holed = {
            gridWidth: 12, gridHeight: 7,
            sections: [
                { id: 's1', colStart: 0, rowStart: 0, colEnd: 6, rowEnd: 6 },
                { id: 's2', colStart: 7, rowStart: 0, colEnd: 11, rowEnd: 4 }
            ]
        };
        assert.equal(getSectionForCoordinate(holed, 'H6'), null);
        assert.deepEqual(boundsFor(holed, 'H6'), { minX: 0, maxX: 11, minY: 0, maxY: 6 });
    });
});
