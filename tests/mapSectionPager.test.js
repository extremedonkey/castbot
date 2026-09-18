/**
 * Map Explorer section pager + per-section Update/Delete (RaP 0894 Phase 3).
 * Pure helpers real-imported (src/maps/mapSectionHandlers.js imports only the pure
 * geometry module); the I/O orchestration is pinned as source ratchets.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { clampSectionIndex, parseTrailingIndex } from '../src/maps/mapSectionHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('Section pager — pure helpers', () => {
    const sections = [{}, {}, {}];

    it('clampSectionIndex clamps to [0, len-1] and tolerates junk', () => {
        assert.equal(clampSectionIndex(sections, -5), 0);
        assert.equal(clampSectionIndex(sections, 1), 1);
        assert.equal(clampSectionIndex(sections, 99), 2);
        assert.equal(clampSectionIndex(sections, NaN), 0);
    });

    it('parseTrailingIndex reads the season-pager trailing int', () => {
        assert.equal(parseTrailingIndex('map_section_prev_2'), 2);
        assert.equal(parseTrailingIndex('map_delete_section_confirm_11'), 11);
        assert.equal(parseTrailingIndex('map_section_prev_junk'), 0);
    });
});

describe('Section pager — explorer wiring ratchet (mapExplorer.js)', () => {
    const src = read('mapExplorer.js');

    it('management buttons switch to section-indexed ids on multi-section maps', () => {
        for (const pin of ['map_update_section_${galleryIdx}', 'map_delete_section_${galleryIdx}', 'map_admin_blacklist_${galleryIdx}']) {
            assert.ok(src.includes(pin), pin);
        }
    });

    it('pager row is host-only — public Prod Map must never page through sections', () => {
        const pagerAt = src.indexOf('map_section_prev_${galleryIdx}');
        assert.ok(pagerAt > 0);
        const guardAt = src.lastIndexOf('if (isEphemeral)', pagerAt);
        assert.ok(guardAt > 0 && pagerAt - guardAt < 1500, 'pager construction must sit under the isEphemeral guard');
    });

    it('overlay renders the viewed section: own image, offsets, own storage message', () => {
        for (const pin of ['colOffset: gallerySection.colStart', 'storageMessageId: gallerySection.mapStorageMessageId']) {
            assert.ok(src.includes(pin), pin);
        }
        assert.ok(src.includes('pos.x - colOffset'), 'tints must shift section-local');
    });

    it('executeMapBuild routes multi-section updates to updateSectionImage (block removed)', () => {
        assert.ok(!src.includes('per-section image updates are coming soon'), 'the Phase-2 hard block must be gone');
        const buildFn = src.slice(src.indexOf('export async function executeMapBuild'));
        assert.ok(buildFn.slice(0, 2500).includes('updateSectionImage(guild, userId, mapUrl, sectionIndex)'));
    });

    it('updateSectionImage touches only the section: fog loop over coordinatesForSection', () => {
        const fn = src.slice(src.indexOf('export async function updateSectionImage'));
        assert.ok(fn.slice(0, 5000).includes('coordinatesForSection(section)'));
        assert.ok(fn.slice(0, 5000).includes('processMapImageWithGrid'), 'shares the section-add image pipeline');
    });
});

describe('Section delete — safety ratchet (mapSectionHandlers.js)', () => {
    const src = read('src/maps/mapSectionHandlers.js');
    // Bounded slice — the whole-map confirm UI below it legitimately mentions buttons
    const delFn = src.slice(
        src.indexOf('export async function executeSectionDelete'),
        src.indexOf('export async function handleSectionDeleteConfirm')
    );

    it('refuses while players stand inside the section', () => {
        assert.ok(delFn.includes('getSectionForCoordinate(mapData, loc)'));
        assert.ok(delFn.includes('Teleport or remove them first'));
    });

    it('NEVER touches guild Custom Actions (unlike whole-map delete)', () => {
        assert.ok(!delFn.includes('.buttons'), 'section delete must not clear safariData buttons');
    });

    it('recomputes the bounding box and strips in-rect blacklist entries', () => {
        assert.ok(delFn.includes('computeBoundingBox'));
        assert.ok(delFn.includes('blacklistedCoordinates.filter'));
    });

    it('runs under the one-build-at-a-time gate and always releases it', () => {
        assert.ok(delFn.includes('tryBeginMapBuild'));
        assert.match(delFn, /finally\s*\{[\s\S]*?endMapBuild\(\)/);
    });
});

describe('Blacklist round-trip — returns to the viewed section', () => {
    it('modal id carries section index ahead of the anti-draft nonce', () => {
        const src = read('safariMapAdmin.js');
        assert.ok(src.includes('map_admin_blacklist_modal_${sectionIndex}_${Date.now()}'));
    });

    it('app.js modal submit parses the idx and rebuilds the explorer there', () => {
        const src = read('app.js');
        const handler = src.slice(src.indexOf("custom_id.startsWith('map_admin_blacklist_modal')"));
        assert.ok(handler.slice(0, 2000).includes('buildMapExplorerResponse(context.guildId, context.userId, context.client, true, blIdx)'));
    });
});
