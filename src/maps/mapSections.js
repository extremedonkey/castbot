/**
 * Multi-Section Maps — section geometry over the ONE active map (RaP 0894).
 *
 * A guild still has exactly one map object (`maps.active` untouched); `sections[]`
 * divides its flat, contiguous coordinate namespace into rectangles, each backed by
 * its own uploaded image and Discord category set. All section logic reduces to
 * "which rectangle contains this coordinate".
 *
 * LAZY MIGRATION: a map with no `sections[]` reads as ONE section spanning its full
 * grid (getSections synthesizes it, never writes). Every section-scoped computation
 * is therefore the identity for legacy single-map guilds. materializeSections()
 * performs the first real write, only when a host adds a second section.
 *
 * Pure module — imports only the coordinate canon. Unit-tested directly
 * (tests/mapSections.test.js).
 */

import { generateCoordinate, tryParseCoordinate } from '../../utils/coordinateParser.js';

/** Hard ceiling shared with the map-create modal: ≤100 columns and ≤100 rows total. */
export const MAX_GRID_EDGE = 100;

/**
 * Read-only view of a map's sections. Legacy maps (no sections[]) synthesize one
 * full-grid section marked `synthesized: true`. NEVER writes to mapData.
 * @param {Object} mapData - the active map object from safariContent maps[mapId]
 * @returns {Array<Object>} at least one section
 */
export function getSections(mapData) {
    if (Array.isArray(mapData?.sections) && mapData.sections.length > 0) return mapData.sections;
    const w = mapData?.gridWidth || mapData?.gridSize || 7;
    const h = mapData?.gridHeight || mapData?.gridSize || 7;
    return [{
        id: 'section_legacy', name: null,
        colStart: 0, rowStart: 0, colEnd: w - 1, rowEnd: h - 1,
        imageFile: mapData?.imageFile, discordImageUrl: mapData?.discordImageUrl,
        mapStorageMessageId: mapData?.mapStorageMessageId,
        categories: mapData?.categories || (mapData?.category ? [mapData.category] : []),
        emoji: '📍', building: false, synthesized: true
    }];
}

/** Whether a zero-based grid position falls inside a section's rectangle (inclusive). */
export function sectionContains(section, x, y) {
    return x >= section.colStart && x <= section.colEnd &&
           y >= section.rowStart && y <= section.rowEnd;
}

/**
 * Resolve the section that owns a coordinate. Null for malformed coordinates or
 * positions outside every section (holes in the bounding box).
 * @returns {Object|null}
 */
export function getSectionForCoordinate(mapData, coord) {
    const pos = tryParseCoordinate(coord);
    if (!pos) return null;
    return getSections(mapData).find(s => sectionContains(s, pos.x, pos.y)) || null;
}

/** Bounding box across all sections — what map.gridWidth/gridHeight must equal. */
export function computeBoundingBox(sections) {
    return {
        gridWidth: Math.max(...sections.map(s => s.colEnd)) + 1,
        gridHeight: Math.max(...sections.map(s => s.rowEnd)) + 1
    };
}

/**
 * First write: turn the synthesized legacy view into a real sections[0].
 * Mutates mapData (caller owns the save). Idempotent.
 * @returns {Array<Object>} mapData.sections
 */
export function materializeSections(mapData) {
    if (Array.isArray(mapData.sections) && mapData.sections.length > 0) return mapData.sections;
    const [legacy] = getSections(mapData);
    delete legacy.synthesized;
    legacy.id = `section_${Date.now()}`;
    mapData.sections = [legacy];
    return mapData.sections;
}

/**
 * Plan where a new section lands relative to an anchor section, enforcing
 * contiguity by construction (new rect starts at the anchor's edge + 1, origin
 * inherited from the anchor — no skipped rows/columns possible) and rejecting
 * overlap with ANY existing section.
 *
 * @param {Array<Object>} sections - existing sections (materialized)
 * @param {Object} anchorSection - the section the host is viewing
 * @param {'right'|'below'} direction
 * @param {number} newWidth - columns of the new section (≥1)
 * @param {number} newHeight - rows of the new section (≥1)
 * @returns {{rect: {colStart,rowStart,colEnd,rowEnd}}|{error: string}}
 */
export function planSectionPlacement(sections, anchorSection, direction, newWidth, newHeight) {
    if (!anchorSection) return { error: 'No anchor section selected.' };
    if (!Number.isInteger(newWidth) || !Number.isInteger(newHeight) || newWidth < 1 || newHeight < 1) {
        return { error: 'Section dimensions must be whole numbers of at least 1.' };
    }
    const rect = direction === 'right'
        ? { colStart: anchorSection.colEnd + 1, rowStart: anchorSection.rowStart,
            colEnd: anchorSection.colEnd + newWidth, rowEnd: anchorSection.rowStart + newHeight - 1 }
        : { colStart: anchorSection.colStart, rowStart: anchorSection.rowEnd + 1,
            colEnd: anchorSection.colStart + newWidth - 1, rowEnd: anchorSection.rowEnd + newHeight };
    if (rect.colEnd >= MAX_GRID_EDGE || rect.rowEnd >= MAX_GRID_EDGE) {
        return { error: `Total map cannot exceed ${MAX_GRID_EDGE} columns / ${MAX_GRID_EDGE} rows.` };
    }
    for (const s of sections) {
        const overlaps = !(rect.colEnd < s.colStart || rect.colStart > s.colEnd ||
                           rect.rowEnd < s.rowStart || rect.rowStart > s.rowEnd);
        if (overlaps) {
            return { error: `Overlaps existing section "${s.name || s.id}" — try the other direction or a different anchor section.` };
        }
    }
    return { rect };
}

/** Row-major coordinate list for a section rectangle ("H1", "I1", …). */
export function coordinatesForSection(rect) {
    const coords = [];
    for (let y = rect.rowStart; y <= rect.rowEnd; y++) {
        for (let x = rect.colStart; x <= rect.colEnd; x++) {
            coords.push(generateCoordinate(x, y));
        }
    }
    return coords;
}

/**
 * Per-cell navigation{} data bounded by the SECTION rectangle, not the whole grid —
 * the section-scoped counterpart of mapExplorer's generateNavigation. (Movement never
 * reads this data — getValidMoves recomputes — but the map-admin coordinate display
 * does, and updateBlacklistedCoordinates writes blocked flags into it.)
 */
export function generateSectionNavigation(coord, rect) {
    const pos = tryParseCoordinate(coord);
    const nav = {
        north: null, east: null, south: null, west: null,
        northeast: null, northwest: null, southeast: null, southwest: null
    };
    if (!pos) return nav;
    const dirs = {
        north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
        northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1]
    };
    for (const [dir, [dx, dy]] of Object.entries(dirs)) {
        const x = pos.x + dx, y = pos.y + dy;
        if (x >= rect.colStart && x <= rect.colEnd && y >= rect.rowStart && y <= rect.rowEnd) {
            nav[dir] = { to: generateCoordinate(x, y), visible: true, blocked: false };
        }
    }
    return nav;
}
