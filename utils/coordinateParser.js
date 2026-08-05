/**
 * Shared coordinate-list parsing — extracted from the Map Explorer blacklist modal
 * (safariMapAdmin.js handleMapAdminBlacklistModal), which had the canonical inline copy
 * (duplicated verbatim in handleMapAdminRefreshAnchorsModal and fieldEditors.js).
 *
 * Pure, zero imports — unit-testable directly.
 *
 * Accepts comma- and/or whitespace-separated coordinate lists ("A1, B3 C5"), trims,
 * uppercases, validates against the classic /^[A-Z]\d+$/ shape, dedupes (first
 * occurrence wins), and recognizes the 'all' keyword (case-insensitive) used by the
 * Refresh Anchors modal precedent.
 */

/** Classic coordinate shape: single letter column + numeric row (A1, B3, D12). */
export const COORDINATE_PATTERN = /^[A-Z]\d+$/;

/**
 * Parse a raw modal input into coordinates.
 *
 * @param {string} input - raw text from the modal field
 * @param {Object} [options]
 * @param {string[]|null} [options.validCoords] - when provided, coordinates not in this
 *   list are moved to `unknown` (e.g. the active map's Object.keys(mapData.coordinates))
 * @returns {{ isAll: boolean, coords: string[], invalid: string[], unknown: string[] }}
 *   - isAll: input was the 'all' keyword (coords is then a copy of validCoords, or [])
 *   - coords: valid (and known, if validCoords given) coordinates, deduped, input order
 *   - invalid: tokens that failed the format regex
 *   - unknown: well-formed coordinates missing from validCoords
 */
export function parseCoordinateList(input, options = {}) {
    const validCoords = Array.isArray(options.validCoords) ? options.validCoords : null;
    const raw = (input || '').trim();

    if (raw.toLowerCase() === 'all') {
        return { isAll: true, coords: validCoords ? [...validCoords] : [], invalid: [], unknown: [] };
    }

    const seen = new Set();
    const coords = [];
    const invalid = [];
    const unknown = [];

    for (const token of raw.split(/[\s,]+/)) {
        if (!token) continue;
        const coord = token.toUpperCase();
        if (!COORDINATE_PATTERN.test(coord)) {
            invalid.push(token);
            continue;
        }
        if (seen.has(coord)) continue;
        seen.add(coord);
        if (validCoords && !validCoords.includes(coord)) {
            unknown.push(coord);
            continue;
        }
        coords.push(coord);
    }

    return { isAll: false, coords, invalid, unknown };
}
