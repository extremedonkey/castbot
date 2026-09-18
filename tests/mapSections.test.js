/**
 * Multi-Section Maps geometry (src/maps/mapSections.js) — RaP 0894 Phase 1.
 * Real imports — the module is pure (only utils/coordinateParser).
 *
 * The load-bearing property is the LAZY SHIM IDENTITY: a map with no sections[]
 * must read as one section spanning its full grid, so every section-scoped
 * computation (movement bounds, whisper proximity, import validity) is exactly
 * what it was before sections existed. Prod guilds all run section-less maps.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    getSections, sectionContains, getSectionForCoordinate,
    computeBoundingBox, materializeSections, planSectionPlacement,
    coordinatesForSection, MAX_GRID_EDGE
} from '../src/maps/mapSections.js';

const legacyMap = (extra = {}) => ({
    gridWidth: 7, gridHeight: 4,
    imageFile: 'map.png', discordImageUrl: 'https://cdn/x.png',
    mapStorageMessageId: 'msg1', categories: ['cat1', 'cat2'],
    ...extra
});

const twoSectionMap = () => ({
    gridWidth: 12, gridHeight: 7,
    sections: [
        { id: 's1', name: 'Base Camp', colStart: 0, rowStart: 0, colEnd: 6, rowEnd: 6 },
        { id: 's2', name: 'The Caves', colStart: 7, rowStart: 0, colEnd: 11, rowEnd: 4 }
    ]
});

describe('mapSections — lazy shim (getSections on legacy maps)', () => {
    it('synthesizes ONE full-grid section for a gridWidth/gridHeight map', () => {
        const sections = getSections(legacyMap());
        assert.equal(sections.length, 1);
        const [s] = sections;
        assert.deepEqual(
            { colStart: s.colStart, rowStart: s.rowStart, colEnd: s.colEnd, rowEnd: s.rowEnd },
            { colStart: 0, rowStart: 0, colEnd: 6, rowEnd: 3 }
        );
        assert.equal(s.synthesized, true);
        assert.equal(s.imageFile, 'map.png');
        assert.deepEqual(s.categories, ['cat1', 'cat2']);
    });

    it('falls back to square gridSize, then 7x7, and to singular category', () => {
        const [s1] = getSections({ gridSize: 5, category: 'catX' });
        assert.deepEqual([s1.colEnd, s1.rowEnd], [4, 4]);
        assert.deepEqual(s1.categories, ['catX']);
        const [s2] = getSections({});
        assert.deepEqual([s2.colEnd, s2.rowEnd], [6, 6]);
    });

    it('NEVER writes to mapData (read-only view)', () => {
        const map = legacyMap();
        getSections(map);
        assert.equal(map.sections, undefined);
    });

    it('passes real sections[] through untouched', () => {
        const map = twoSectionMap();
        assert.equal(getSections(map), map.sections);
    });
});

describe('mapSections — coordinate → section resolution', () => {
    it('the identity property: every legacy-map coordinate resolves to the one shim section', () => {
        const map = legacyMap();
        for (const coord of ['A1', 'G4', 'D2']) {
            assert.equal(getSectionForCoordinate(map, coord).id, 'section_legacy', coord);
        }
        assert.equal(getSectionForCoordinate(map, 'H1'), null);  // outside grid
        assert.equal(getSectionForCoordinate(map, 'A5'), null);
    });

    it('resolves multi-letter coordinates (Excel-safe, Phase 0 canon)', () => {
        const map = { gridWidth: 30, gridHeight: 3 };
        assert.equal(getSectionForCoordinate(map, 'AA2').id, 'section_legacy');
        assert.equal(getSectionForCoordinate(map, 'AE1'), null);  // col 30 out
    });

    it('resolves across sections and returns null in bounding-box HOLES', () => {
        const map = twoSectionMap();
        assert.equal(getSectionForCoordinate(map, 'G7').id, 's1');   // s1 bottom-right
        assert.equal(getSectionForCoordinate(map, 'H1').id, 's2');   // s2 top-left
        assert.equal(getSectionForCoordinate(map, 'L5').id, 's2');   // s2 bottom-right
        // s2 is only 5 rows tall — H6/L7 are inside the 12x7 bounding box but in NO section
        assert.equal(getSectionForCoordinate(map, 'H6'), null);
        assert.equal(getSectionForCoordinate(map, 'L7'), null);
    });

    it('returns null for malformed coordinates instead of throwing', () => {
        for (const bad of ['', '7G', null, undefined, 'banana']) {
            assert.equal(getSectionForCoordinate(twoSectionMap(), bad), null, String(bad));
        }
    });

    it('sectionContains is an inclusive rectangle test', () => {
        const s = { colStart: 2, rowStart: 1, colEnd: 4, rowEnd: 3 };
        assert.ok(sectionContains(s, 2, 1) && sectionContains(s, 4, 3));
        assert.ok(!sectionContains(s, 1, 1) && !sectionContains(s, 5, 3) && !sectionContains(s, 3, 4));
    });
});

describe('mapSections — bounding box + materialization', () => {
    it('computeBoundingBox spans all sections', () => {
        assert.deepEqual(computeBoundingBox(twoSectionMap().sections), { gridWidth: 12, gridHeight: 7 });
    });

    it('materializeSections converts the shim into a real sections[0] once, idempotently', () => {
        const map = legacyMap();
        const sections = materializeSections(map);
        assert.equal(map.sections, sections);
        assert.equal(sections.length, 1);
        assert.equal(sections[0].synthesized, undefined);
        assert.ok(sections[0].id.startsWith('section_'));
        assert.notEqual(sections[0].id, 'section_legacy');
        assert.equal(materializeSections(map), sections);  // second call: no-op
    });
});

describe('mapSections — placement planning (contiguity by construction)', () => {
    const anchor = { id: 's1', name: 'Base', colStart: 0, rowStart: 0, colEnd: 6, rowEnd: 6 };

    it("'right' starts at anchor colEnd+1 and inherits rowStart (E1-style, no column skips)", () => {
        const { rect } = planSectionPlacement([anchor], anchor, 'right', 5, 5);
        assert.deepEqual(rect, { colStart: 7, rowStart: 0, colEnd: 11, rowEnd: 4 });
        // First coordinate of the new section is H1 — directly continuing the namespace
        assert.equal(coordinatesForSection(rect)[0], 'H1');
    });

    it("'below' starts at anchor rowEnd+1 and inherits colStart (A6-style, no row skips)", () => {
        const { rect } = planSectionPlacement([anchor], anchor, 'below', 4, 3);
        assert.deepEqual(rect, { colStart: 0, rowStart: 7, colEnd: 3, rowEnd: 9 });
        assert.equal(coordinatesForSection(rect)[0], 'A8');
    });

    it('rejects overlap with ANY existing section', () => {
        const sections = twoSectionMap().sections;
        // right of s1 (7-wide anchor) lands exactly on s2's rectangle
        const result = planSectionPlacement(sections, sections[0], 'right', 2, 2);
        assert.ok(result.error?.includes('The Caves'), result.error);
    });

    it('allows non-overlapping placement below an anchor even with a neighbor to the right', () => {
        const sections = twoSectionMap().sections;
        const { rect } = planSectionPlacement(sections, sections[0], 'below', 7, 2);
        assert.deepEqual(rect, { colStart: 0, rowStart: 7, colEnd: 6, rowEnd: 8 });
    });

    it(`enforces the ${MAX_GRID_EDGE}-edge ceiling`, () => {
        const wide = { id: 'w', colStart: 0, rowStart: 0, colEnd: 95, rowEnd: 5 };
        assert.ok(planSectionPlacement([wide], wide, 'right', 5, 5).error);
        assert.ok(planSectionPlacement([wide], wide, 'below', 5, 5).rect);
    });

    it('rejects non-integer or sub-1 dimensions and a missing anchor', () => {
        assert.ok(planSectionPlacement([anchor], anchor, 'right', 0, 5).error);
        assert.ok(planSectionPlacement([anchor], anchor, 'below', 2.5, 5).error);
        assert.ok(planSectionPlacement([anchor], null, 'right', 5, 5).error);
    });
});

describe('mapSections — coordinatesForSection', () => {
    it('emits row-major true coordinates for an offset rectangle', () => {
        const coords = coordinatesForSection({ colStart: 7, rowStart: 0, colEnd: 8, rowEnd: 1 });
        assert.deepEqual(coords, ['H1', 'I1', 'H2', 'I2']);
    });

    it('crosses the Z column boundary correctly', () => {
        const coords = coordinatesForSection({ colStart: 25, rowStart: 4, colEnd: 26, rowEnd: 4 });
        assert.deepEqual(coords, ['Z5', 'AA5']);
    });
});
