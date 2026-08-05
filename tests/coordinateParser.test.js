/**
 * Shared coordinate-list parser (utils/coordinateParser.js) — extracted from the Map
 * Explorer blacklist modal and reused by the Action Visibility bulk Location/Edit modals.
 * Real imports — the module is pure.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseCoordinateList, COORDINATE_PATTERN } from '../utils/coordinateParser.js';

describe('coordinateParser — basic parsing (blacklist-modal contract)', () => {
    it('parses a comma-separated list, trimming and uppercasing', () => {
        assert.deepEqual(parseCoordinateList(' a1,  b3 ,C5 ').coords, ['A1', 'B3', 'C5']);
    });

    it('also accepts whitespace separation (superset of the comma-only original)', () => {
        assert.deepEqual(parseCoordinateList('A1 B3\nC5').coords, ['A1', 'B3', 'C5']);
    });

    it('drops invalid tokens into invalid[] instead of coords', () => {
        const r = parseCoordinateList('A1, banana, 7G, B22');
        assert.deepEqual(r.coords, ['A1', 'B22']);
        assert.deepEqual(r.invalid, ['banana', '7G']);
    });

    it('dedupes (first occurrence wins) — the original silently kept duplicates', () => {
        assert.deepEqual(parseCoordinateList('A1, a1, A1, B2').coords, ['A1', 'B2']);
    });

    it('empty/blank input parses to nothing without throwing', () => {
        for (const input of ['', '   ', null, undefined]) {
            const r = parseCoordinateList(input);
            assert.deepEqual(r.coords, []);
            assert.equal(r.isAll, false);
        }
    });
});

describe('coordinateParser — the all keyword', () => {
    it("'all' (any case, padded) resolves to every valid coordinate", () => {
        for (const input of ['all', 'ALL', ' All ']) {
            const r = parseCoordinateList(input, { validCoords: ['A1', 'A2', 'B1'] });
            assert.equal(r.isAll, true);
            assert.deepEqual(r.coords, ['A1', 'A2', 'B1']);
        }
    });

    it("'all' without validCoords returns isAll with no coords (caller must error)", () => {
        const r = parseCoordinateList('all');
        assert.equal(r.isAll, true);
        assert.deepEqual(r.coords, []);
    });

    it("'all' inside a longer list is NOT the keyword (it fails the format check)", () => {
        const r = parseCoordinateList('all, A1');
        assert.equal(r.isAll, false);
        assert.deepEqual(r.coords, ['A1']);
        assert.deepEqual(r.invalid, ['all']);
    });
});

describe('coordinateParser — validCoords existence filtering', () => {
    it('well-formed coordinates missing from the map land in unknown[]', () => {
        const r = parseCoordinateList('A1, Z99', { validCoords: ['A1', 'B1'] });
        assert.deepEqual(r.coords, ['A1']);
        assert.deepEqual(r.unknown, ['Z99']);
        assert.deepEqual(r.invalid, []);
    });

    it('no validCoords → format-only validation (blacklist behavior preserved)', () => {
        const r = parseCoordinateList('Z99');
        assert.deepEqual(r.coords, ['Z99']);
        assert.deepEqual(r.unknown, []);
    });
});

describe('coordinateParser — COORDINATE_PATTERN', () => {
    it('matches classic single-letter-column coordinates only', () => {
        for (const good of ['A1', 'G7', 'B22']) assert.ok(COORDINATE_PATTERN.test(good), good);
        for (const bad of ['AA1', 'a1', '7G', 'A', '1', 'A1B']) assert.ok(!COORDINATE_PATTERN.test(bad), bad);
    });
});
