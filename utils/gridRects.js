/**
 * gridRects.js — edge-aligned integer cell rectangles for map grids.
 *
 * Zero dependencies (importable by tests directly, unlike mapGridSystem.js which imports sharp).
 *
 * Why edge-aligned: MapGridSystem exposes float cell sizes (innerSize / cells). The old fog
 * code rounded each cell's origin and size independently (Math.round per cell), which on
 * non-divisible images produced ±1px overlaps/gaps between adjacent cells (double-fogged or
 * unfogged 1px seams). Here we round the shared BOUNDARIES once per axis: cell i spans
 * [b[i], b[i+1]) so cells tile exactly — no overlap, no gap, ever. When innerSize divides
 * evenly by cells this is bit-identical to the legacy per-cell rounding.
 */

/**
 * Integer pixel boundaries for one axis.
 * b[i] = round(border + i * (innerSize / cells)), i = 0..cells.
 * Guarantees: b[0] === border, b[cells] === border + innerSize, strictly increasing
 * (for innerSize >= cells), consecutive widths differ by at most 1px.
 *
 * @param {number} innerSize - inner image dimension in px (excluding borders)
 * @param {number} cells - number of grid cells along this axis
 * @param {number} border - border offset in px (default 0)
 * @returns {number[]} cells+1 integer boundaries
 */
export function axisBoundaries(innerSize, cells, border = 0) {
  const cell = innerSize / cells;
  const b = new Array(cells + 1);
  for (let i = 0; i <= cells; i++) {
    b[i] = Math.round(border + i * cell);
  }
  return b;
}

/**
 * Build a rect lookup for a bordered grid image.
 * Returned rects are in the BORDERED image's pixel space (same space as
 * MapGridSystem.getCellPixelCoordinatesWithBorder), suitable for sharp
 * extract/composite (left/top/width/height, all integers).
 *
 * @param {Object} opts
 * @param {number} opts.innerWidth - inner map width (px, no borders)
 * @param {number} opts.innerHeight - inner map height (px, no borders)
 * @param {number} opts.gridWidth - columns
 * @param {number} opts.gridHeight - rows
 * @param {number} [opts.borderSize=0] - border around the inner map
 * @returns {(gridX: number, gridY: number) => {left:number, top:number, width:number, height:number}}
 */
export function buildCellRects({ innerWidth, innerHeight, gridWidth, gridHeight, borderSize = 0 }) {
  const bx = axisBoundaries(innerWidth, gridWidth, borderSize);
  const by = axisBoundaries(innerHeight, gridHeight, borderSize);
  return function rectFor(gridX, gridY) {
    if (!Number.isInteger(gridX) || !Number.isInteger(gridY) ||
        gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) {
      throw new Error(`Cell (${gridX},${gridY}) outside ${gridWidth}x${gridHeight} grid`);
    }
    return {
      left: bx[gridX],
      top: by[gridY],
      width: bx[gridX + 1] - bx[gridX],
      height: by[gridY + 1] - by[gridY]
    };
  };
}
