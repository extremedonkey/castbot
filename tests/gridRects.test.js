// Tests for utils/gridRects.js — edge-aligned integer cell rectangles.
// gridRects.js is dependency-free, so we import it directly (no inline replication needed).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { axisBoundaries, buildCellRects } from '../utils/gridRects.js';

// Legacy per-cell rounding from the old createFogOfWarMap path (mapExplorer.js:351-361):
// origin and size rounded independently per cell.
function legacyRect(i, innerSize, cells, border) {
  const cell = innerSize / cells;
  return { pos: Math.round(border + i * cell), size: Math.round(cell) };
}

const AXIS_CASES = [
  { inner: 2016, cells: 7 },  // divisible (2016/7 = 288 exactly) — the live 7x7 map shape
  { inner: 2000, cells: 7 },  // non-divisible
  { inner: 1999, cells: 7 },  // non-divisible, odd
  { inner: 2016, cells: 1 },  // single cell
  { inner: 997, cells: 13 }   // prime inner, awkward cell count
];

describe('gridRects — axisBoundaries tiling invariants', () => {
  for (const { inner, cells } of AXIS_CASES) {
    for (const border of [0, 80]) {
      it(`inner=${inner} cells=${cells} border=${border}: exact endpoints, monotonic, widths sum & differ ≤1`, () => {
        const b = axisBoundaries(inner, cells, border);
        assert.equal(b.length, cells + 1);
        assert.equal(b[0], border, 'first boundary is the border offset');
        assert.equal(b[cells], border + inner, 'last boundary is border + innerSize exactly');

        const widths = [];
        for (let i = 0; i < cells; i++) {
          const w = b[i + 1] - b[i];
          assert.ok(w > 0, `boundary ${i} strictly increasing`);
          assert.ok(Number.isInteger(b[i]), 'integer boundaries');
          widths.push(w);
        }
        assert.equal(widths.reduce((a, c) => a + c, 0), inner, 'widths tile the full inner size');
        const min = Math.min(...widths), max = Math.max(...widths);
        assert.ok(max - min <= 1, `cell widths differ by at most 1px (got ${min}..${max})`);
        assert.ok(new Set(widths).size <= 2, 'at most 2 distinct widths per axis');
      });
    }
  }
});

describe('gridRects — divisible sizes match legacy per-cell rounding exactly', () => {
  it('2016/7 border 80: every cell origin and size identical to old Math.round formula', () => {
    const b = axisBoundaries(2016, 7, 80);
    for (let i = 0; i < 7; i++) {
      const legacy = legacyRect(i, 2016, 7, 80);
      assert.equal(b[i], legacy.pos, `cell ${i} origin`);
      assert.equal(b[i + 1] - b[i], legacy.size, `cell ${i} size`);
    }
  });
});

describe('gridRects — buildCellRects 2D behavior', () => {
  const rectFor = buildCellRects({
    innerWidth: 2003, innerHeight: 2003, gridWidth: 7, gridHeight: 7, borderSize: 80
  });

  it('axes are independent (left depends only on x, top only on y)', () => {
    assert.equal(rectFor(3, 0).left, rectFor(3, 6).left);
    assert.equal(rectFor(0, 4).top, rectFor(6, 4).top);
  });

  it('≤4 distinct WxH size keys across a full non-divisible 7x7 grid (overlay cache bound)', () => {
    const keys = new Set();
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const r = rectFor(x, y);
        keys.add(`${r.width}x${r.height}`);
      }
    }
    assert.ok(keys.size <= 4, `expected ≤4 distinct sizes, got ${keys.size}`);
  });

  it('adjacent cells share exact boundaries — no overlap, no gap', () => {
    for (let x = 0; x < 6; x++) {
      const a = rectFor(x, 0), b = rectFor(x + 1, 0);
      assert.equal(a.left + a.width, b.left, `columns ${x}/${x + 1} tile exactly`);
    }
    for (let y = 0; y < 6; y++) {
      const a = rectFor(0, y), b = rectFor(0, y + 1);
      assert.equal(a.top + a.height, b.top, `rows ${y}/${y + 1} tile exactly`);
    }
  });

  it('out-of-bounds or non-integer cells throw', () => {
    assert.throws(() => rectFor(7, 0));
    assert.throws(() => rectFor(0, 7));
    assert.throws(() => rectFor(-1, 0));
    assert.throws(() => rectFor(1.5, 2));
  });
});
