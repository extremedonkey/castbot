/**
 * Canonical map-coordinate math + coordinate-list parsing.
 *
 * This module is the SINGLE source of truth for grid coordinates (RaP 0894 Phase 0).
 * Map creation always used Excel-safe multi-letter columns (A..Z, AA..), but the
 * movement engine and every overlay renderer had their own single-letter
 * `charCodeAt(0) - 65` copies that silently broke on maps wider than 26 columns
 * (the creation modal allows up to 100). Do NOT re-implement coordinate math at a
 * call site — import from here. tests/coordinateRatchet.test.js rejects new copies.
 *
 * Pure, zero imports — unit-testable directly.
 */

/**
 * Valid coordinate input shape: 1-2 letter Excel column + row number (A1, B22, AA10).
 * Bounds match the creation modal caps (≤100 columns ⇒ max column "CV"; ≤100 rows).
 */
export const COORDINATE_PATTERN = /^[A-Z]{1,2}\d{1,3}$/;

/**
 * Convert column index to Excel-style column label (0=A, 25=Z, 26=AA).
 * @param {number} index - Zero-based column index
 * @returns {string} Excel-style column label
 */
export function getExcelColumn(index) {
    let column = '';
    while (index >= 0) {
        column = String.fromCharCode(65 + (index % 26)) + column;
        index = Math.floor(index / 26) - 1;
    }
    return column;
}

/**
 * Convert Excel-style column label to zero-based column index (A=0, Z=25, AA=26).
 * @param {string} column - Excel-style column label
 * @returns {number} Zero-based column index
 */
export function parseExcelColumn(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
        index = index * 26 + (column.charCodeAt(i) - 64);
    }
    return index - 1;
}

/**
 * Generate coordinate string from zero-based x,y position ("A1", "AA10").
 * @param {number} x - Column index (0-based)
 * @param {number} y - Row index (0-based)
 * @returns {string} Coordinate string
 */
export function generateCoordinate(x, y) {
    return `${getExcelColumn(x)}${y + 1}`;
}

/**
 * Parse coordinate string to zero-based x,y position. THROWS on malformed input —
 * use tryParseCoordinate on runtime paths fed by stored/user data.
 * @param {string} coord - Coordinate string (e.g., "A1", "AA10")
 * @returns {{x: number, y: number}} Zero-based position
 */
export function parseCoordinate(coord) {
    const match = String(coord).match(/^([A-Z]+)(\d+)$/);
    if (!match) {
        throw new Error(`Invalid coordinate: ${coord}`);
    }
    return { x: parseExcelColumn(match[1]), y: parseInt(match[2]) - 1 };
}

/**
 * Null-returning variant of parseCoordinate for paths that must not throw
 * (movement, overlay renderers iterating stored coordinate keys).
 * @param {string} coord
 * @returns {{x: number, y: number}|null}
 */
export function tryParseCoordinate(coord) {
    const match = String(coord ?? '').match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    return { x: parseExcelColumn(match[1]), y: parseInt(match[2]) - 1 };
}

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
