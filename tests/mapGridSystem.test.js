/**
 * MapGridSystem section-origin offsets (RaP 0894 Phase 2 groundwork).
 *
 * Real import of the class — getCoordinateLabel/parseCoordinate are pure and the
 * constructor touches no FS (sharp loads but is never invoked; initialize() is
 * not called here because it needs a real image).
 *
 * The load-bearing property: with a section origin (colOffset/rowOffset), labels
 * render TRUE map coordinates while parseCoordinate returns SECTION-LOCAL cell
 * positions — which is what makes mapFogBuilder crop the right cell from a
 * section's own image with zero changes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MapGridSystem from '../scripts/map-tests/mapGridSystem.js';

const gs = (opts = {}) => new MapGridSystem('/nonexistent.png', { gridWidth: 5, gridHeight: 5, ...opts });

describe('MapGridSystem — offset defaults are the identity (legacy maps)', () => {
    it('no offsets: A1 top-left, parse returns global positions (unchanged behavior)', () => {
        const g = gs();
        assert.equal(g.getCoordinateLabel(0, 0), 'A1');
        assert.equal(g.getCoordinateLabel(4, 4), 'E5');
        assert.deepEqual(g.parseCoordinate('E5'), { x: 4, y: 4 });
        assert.deepEqual(g.parseCoordinate('AA10'), { x: 26, y: 9 });
    });
});

describe('MapGridSystem — section origins (colOffset/rowOffset)', () => {
    it('labels render TRUE coordinates for a section placed right (col offset)', () => {
        const g = gs({ colOffset: 7 });                 // section starts at column H
        assert.equal(g.getCoordinateLabel(0, 0), 'H1');
        assert.equal(g.getCoordinateLabel(4, 2), 'L3');
    });

    it('labels render TRUE coordinates for a section placed below (row offset)', () => {
        const g = gs({ rowOffset: 7 });                 // section starts at row 8
        assert.equal(g.getCoordinateLabel(0, 0), 'A8');
        assert.equal(g.getCoordinateLabel(3, 2), 'D10');
    });

    it('parseCoordinate returns SECTION-LOCAL cells (the fog-builder contract)', () => {
        const g = gs({ colOffset: 7, rowOffset: 0 });
        assert.deepEqual(g.parseCoordinate('H1'), { x: 0, y: 0 });
        assert.deepEqual(g.parseCoordinate('L3'), { x: 4, y: 2 });
        const below = gs({ rowOffset: 7 });
        assert.deepEqual(below.parseCoordinate('A8'), { x: 0, y: 0 });
    });

    it('label ↔ parse round-trips through the origin', () => {
        const g = gs({ colOffset: 24, rowOffset: 3 });
        for (const [x, y] of [[0, 0], [1, 0], [4, 4]]) {
            assert.deepEqual(g.parseCoordinate(g.getCoordinateLabel(x, y)), { x, y }, `${x},${y}`);
        }
    });

    it('crosses the Z boundary when the offset pushes columns past 26', () => {
        const g = gs({ colOffset: 25 });                // section starts at column Z
        assert.equal(g.getCoordinateLabel(0, 0), 'Z1');
        assert.equal(g.getCoordinateLabel(1, 0), 'AA1');
        assert.deepEqual(g.parseCoordinate('AA1'), { x: 1, y: 0 });
    });

    it('SVG row labels carry the row offset (columns derive from getCoordinateLabel)', () => {
        const g = gs({ rowOffset: 7, colOffset: 2 });
        // generateCoordinateLabels reads this.cellWidth/Height which initialize() sets —
        // stub the geometry instead of hitting the FS.
        g.metadata = { width: 500, height: 500 };
        g.cellWidth = 100;
        g.cellHeight = 100;
        g.totalWidth = 660;
        g.totalHeight = 660;
        const svg = g.generateCoordinateLabels();
        assert.ok(svg.includes('>\n                    8\n'), 'first row label is 8, not 1');
        assert.ok(!/>\s*1\s*<\/text>/.test(svg), 'no row label "1" on an offset section');
        assert.ok(svg.includes('C'), 'first column label is C (colOffset 2)');
    });
});
