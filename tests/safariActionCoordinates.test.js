/**
 * Action ↔ map-location bulk add/edit (safariActionCoordinates.js).
 * The module's parse core is covered by tests/coordinateParser.test.js (real imports);
 * the module itself imports safariManager (heavy file I/O), so per TestingStandards the
 * add/edit semantics are replicated here as pure logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseCoordinateList } from '../utils/coordinateParser.js';

// Replica of applyAddCoordinates' mutation semantics (additive, dedupe vs existing)
function addSemantics(existing, parsedCoords) {
    const coordinates = [...existing];
    const added = [];
    for (const coordinate of parsedCoords) {
        if (!coordinates.includes(coordinate)) {
            coordinates.push(coordinate);
            added.push(coordinate);
        }
    }
    return { coordinates, added };
}

// Replica of applyEditCoordinates' full-replace diff
function editSemantics(oldCoords, newCoords) {
    return {
        added: newCoords.filter(c => !oldCoords.includes(c)),
        removed: oldCoords.filter(c => !newCoords.includes(c))
    };
}

describe('safariActionCoordinates — bulk ADD semantics (additive)', () => {
    it('adds only new coordinates, keeps existing, reports added subset', () => {
        const parsed = parseCoordinateList('B1, C1, A1');
        const { coordinates, added } = addSemantics(['A1'], parsed.coords);
        assert.deepEqual(coordinates, ['A1', 'B1', 'C1']);
        assert.deepEqual(added, ['B1', 'C1']);
    });

    it("'all' + existing coords never duplicates", () => {
        const parsed = parseCoordinateList('all', { validCoords: ['A1', 'A2', 'B1'] });
        const { coordinates, added } = addSemantics(['A2'], parsed.coords);
        assert.deepEqual(coordinates.sort(), ['A1', 'A2', 'B1']);
        assert.deepEqual(added.sort(), ['A1', 'B1']);
    });
});

describe('safariActionCoordinates — bulk EDIT semantics (full replace)', () => {
    it('computes added and removed as the symmetric diff', () => {
        const { added, removed } = editSemantics(['A1', 'B1', 'C1'], ['B1', 'D1']);
        assert.deepEqual(added, ['D1']);
        assert.deepEqual(removed, ['A1', 'C1']);
    });

    it('identical list → no changes', () => {
        const { added, removed } = editSemantics(['A1', 'B1'], ['A1', 'B1']);
        assert.deepEqual(added, []);
        assert.deepEqual(removed, []);
    });

    it('empty replacement removes everything (the intentional clear-all)', () => {
        const { removed } = editSemantics(['A1', 'B1'], []);
        assert.deepEqual(removed, ['A1', 'B1']);
    });
});

describe('safariActionCoordinates — guard contracts (mirror the module conditions)', () => {
    // applyEditCoordinates refuses non-empty input that parses to nothing (typo protection);
    // an EMPTY input is the sanctioned clear-all. Replicated condition:
    const refuses = (input, parsed) => Boolean(input && !parsed.isAll && parsed.coords.length === 0);

    it('garbage-only input is refused — never wipe locations on a typo', () => {
        const input = 'banana, 7G';
        assert.equal(refuses(input, parseCoordinateList(input)), true);
    });

    it('empty input is NOT refused (clear-all path)', () => {
        assert.equal(refuses('', parseCoordinateList('')), false);
    });

    it("'all' with a map is NOT refused even though the token itself isn't a coordinate", () => {
        const parsed = parseCoordinateList('all', { validCoords: ['A1'] });
        assert.equal(refuses('all', parsed), false);
    });
});
