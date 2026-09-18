/**
 * Shared coordinate-list parser (utils/coordinateParser.js) — extracted from the Map
 * Explorer blacklist modal and reused by the Action Visibility bulk Location/Edit modals.
 * Real imports — the module is pure.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    parseCoordinateList, COORDINATE_PATTERN,
    getExcelColumn, parseExcelColumn, generateCoordinate, parseCoordinate, tryParseCoordinate
} from '../utils/coordinateParser.js';

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
    it('matches 1-2 letter Excel columns (creation caps: ≤100 cols ⇒ max "CV", ≤3 digit rows)', () => {
        for (const good of ['A1', 'G7', 'B22', 'AA1', 'AA10', 'CV100']) assert.ok(COORDINATE_PATTERN.test(good), good);
        for (const bad of ['a1', '7G', 'A', '1', 'A1B', 'AAA1', 'A1234']) assert.ok(!COORDINATE_PATTERN.test(bad), bad);
    });
});

describe('coordinateParser — canonical Excel-safe grid math (RaP 0894 Phase 0)', () => {
    it('getExcelColumn crosses the Z boundary correctly', () => {
        assert.equal(getExcelColumn(0), 'A');
        assert.equal(getExcelColumn(25), 'Z');
        assert.equal(getExcelColumn(26), 'AA');
        assert.equal(getExcelColumn(27), 'AB');
        assert.equal(getExcelColumn(51), 'AZ');
        assert.equal(getExcelColumn(52), 'BA');
    });

    it('parseExcelColumn is the exact inverse of getExcelColumn', () => {
        for (const i of [0, 1, 25, 26, 27, 51, 52, 99, 700]) {
            assert.equal(parseExcelColumn(getExcelColumn(i)), i, `index ${i}`);
        }
    });

    it('generateCoordinate/parseCoordinate round-trip incl. multi-letter columns', () => {
        assert.equal(generateCoordinate(0, 0), 'A1');
        assert.equal(generateCoordinate(26, 9), 'AA10');
        for (const [x, y] of [[0, 0], [6, 6], [25, 99], [26, 0], [99, 99]]) {
            assert.deepEqual(parseCoordinate(generateCoordinate(x, y)), { x, y });
        }
    });

    it('parseCoordinate throws on malformed input; tryParseCoordinate returns null', () => {
        for (const bad of ['', '7G', 'A', 'a1', null, undefined]) {
            assert.throws(() => parseCoordinate(bad), undefined, String(bad));
            assert.equal(tryParseCoordinate(bad), null, String(bad));
        }
        assert.deepEqual(tryParseCoordinate('AA10'), { x: 26, y: 9 });
    });

    it('the ZZ regression: the naive charCodeAt(0)-65 math this replaced mis-parsed AA5', () => {
        // Naive: col = 'AA5'.charCodeAt(0)-65 = 0 ('A'), row = parseInt('A5') = NaN.
        // Canon: column AA = 26, row 5 → {x:26, y:4}.
        assert.deepEqual(parseCoordinate('AA5'), { x: 26, y: 4 });
    });
});
