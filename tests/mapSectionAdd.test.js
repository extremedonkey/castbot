/**
 * Add Map Section (src/maps/mapSectionAdd.js) — RaP 0894 Phase 2.
 *
 * The orchestrator is Discord/file I/O end to end, so per TestingStandards the
 * geometry lives in tests/mapSections.test.js and the modal in
 * tests/mapUpdateModal.test.js. What THIS file pins is the crash-ordering and
 * guard invariants as a static source ratchet (same technique as
 * coordinateRatchet/safariImportExport): these orderings are load-bearing —
 * reordering them silently reintroduces orphaned channels or lost fog URLs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(__dirname, '..', 'src', 'maps', 'mapSectionAdd.js'), 'utf8');

const idx = (needle) => {
    const i = SOURCE.indexOf(needle);
    assert.ok(i >= 0, `source must contain: ${needle}`);
    return i;
};

describe('mapSectionAdd — crash-ordering ratchet (RaP 0894 §6)', () => {
    it('persists the building:true section stub BEFORE creating any channels', () => {
        assert.ok(idx('building: true') < idx('createSectionChannels(guild'),
            'a crash mid-channel-loop must leave a visible stub, not silent orphans');
    });

    it('plans placement (overlap/contiguity) BEFORE the image pipeline runs', () => {
        assert.ok(idx('planSectionPlacement(') < idx('processMapImageWithGrid('),
            'fail fast — no disk work on an invalid placement');
    });

    it('checks the guild channel budget BEFORE any side effect', () => {
        assert.ok(idx('preflightBudget(') < idx('processMapImageWithGrid('),
            'the 500-channel guard must run before disk/Discord work');
    });

    it('finalizes on FRESH data after postFogOfWarMapsToChannels (which saves its own copy)', () => {
        const fogCall = idx('await postFogOfWarMapsToChannels(');
        const reload = SOURCE.indexOf('await loadSafariContent()', fogCall);
        assert.ok(reload > fogCall,
            'finalize must reload — saving the stale pre-fog object would erase fogMapUrl/anchorMessageId');
        const finalize = SOURCE.indexOf('building = false', fogCall);
        assert.ok(finalize > reload, 'building:false lands on the reloaded object');
    });

    it('bounding box recompute + legacy gridSize mirror happen at finalize', () => {
        const fogCall = idx('await postFogOfWarMapsToChannels(');
        assert.ok(SOURCE.indexOf('computeBoundingBox(', fogCall) > fogCall,
            'gridWidth/gridHeight stay pre-expansion until the section is fully built');
        assert.ok(SOURCE.includes('gridSize = Math.max('), 'legacy gridSize readers stay coherent');
    });

    it('always releases the map-build gate (endMapBuild in finally)', () => {
        assert.match(SOURCE, /finally\s*\{[\s\S]*?endMapBuild\(\)/,
            'a thrown build must not wedge the one-build-at-a-time gate');
    });

    it('maintains the categories union invariant (section AND map both record new categories)', () => {
        assert.ok(SOURCE.includes('section.categories.push(categoryId)'));
        assert.ok(SOURCE.includes('mapData.categories.push(categoryId)'),
            'deleteMapGrid iterates map.categories — a section-only record would orphan channels on delete');
    });

    it('navigation for new cells is SECTION-bounded, never whole-grid', () => {
        assert.ok(SOURCE.includes('generateSectionNavigation(coord, rect)'));
        assert.ok(!SOURCE.includes('generateNavigation(coord, gridWidth'),
            'whole-grid navigation would advertise cross-seam neighbors');
    });
});

describe('mapSectionAdd — modal submit guard invariants', () => {
    it('direction defaults to right and only below opts out', () => {
        assert.ok(SOURCE.includes("fields.section_direction === 'below' ? 'below' : 'right'"));
    });

    it('pasted URLs require the Discord CDN prefix (upload-derived URLs exempt)', () => {
        assert.ok(SOURCE.includes("intent.action !== 'upload' && !imageUrl.startsWith('https://cdn.discordapp.com/attachments/')"));
    });

    it('dimension caps match the map-create modal (1–100 per axis, 400-cell section cap)', () => {
        assert.ok(SOURCE.includes('rows < 1 || rows > 100 || cols < 1 || cols > 100'));
        assert.ok(SOURCE.includes('MAX_SECTION_CELLS = 400'));
    });
});
