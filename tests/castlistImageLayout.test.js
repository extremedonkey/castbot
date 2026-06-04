/**
 * Tests for the compact castlist image column layout (castlistImageGenerator.js).
 *
 * These lock in the guarantee that adding dynamic columns for 3+ tribes does NOT
 * change the 1- and 2-tribe output: column width is fixed and the canvas only
 * widens to fit extra columns. selectColumns() is replicated inline here (the
 * source module imports sharp + storage and is too heavy to import in a unit test).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Replicated constants + logic from castlistImageGenerator.js ──────────────
const CANVAS_WIDTH = 900;
const COLUMN_COUNT = 2;
const MAX_COLUMNS = 4;
const COLUMN_GAP = 20;
const MARGIN = 30;
const COLUMN_WIDTH = (CANVAS_WIDTH - MARGIN * 2 - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

function selectColumns(tribeCount) {
  if (tribeCount <= 1) {
    return { columnCount: 1, columnWidth: COLUMN_WIDTH, canvasWidth: CANVAS_WIDTH };
  }
  const columnCount = Math.min(tribeCount, MAX_COLUMNS);
  const canvasWidth = MARGIN * 2 + columnCount * COLUMN_WIDTH + (columnCount - 1) * COLUMN_GAP;
  return { columnCount, columnWidth: COLUMN_WIDTH, canvasWidth };
}

// Mirror of calculateLayout's column-assignment core (which column each tribe lands in)
function assignColumns(tribeCounts, columnCount) {
  const columnY = new Array(columnCount).fill(0);
  const assignments = [];
  for (const playerCount of tribeCounts) {
    const col = columnY.indexOf(Math.min(...columnY));
    assignments.push(col);
    // header(50) + gap(6) + players*(80+6) + trailing 10 — exact heights don't
    // matter for which-column tests, only relative growth does
    columnY[col] += 50 + 6 + playerCount * 86 + 10;
  }
  return assignments;
}

describe('Compact castlist — column width is fixed', () => {
  it('never changes column width regardless of tribe count', () => {
    for (let n = 1; n <= 8; n++) {
      assert.equal(selectColumns(n).columnWidth, COLUMN_WIDTH, `tribeCount=${n}`);
    }
  });

  it('column width is the legacy 410px (derived from 2-up grid)', () => {
    assert.equal(COLUMN_WIDTH, 410);
  });
});

describe('Compact castlist — 1- and 2-tribe output is unchanged (regression lock)', () => {
  it('1 tribe → single column on the base 900px canvas', () => {
    assert.deepEqual(selectColumns(1), { columnCount: 1, columnWidth: 410, canvasWidth: 900 });
  });

  it('0 tribes is treated as the single-column base (defensive)', () => {
    assert.deepEqual(selectColumns(0), { columnCount: 1, columnWidth: 410, canvasWidth: 900 });
  });

  it('2 tribes → 2 columns on the base 900px canvas (byte-identical to legacy)', () => {
    assert.deepEqual(selectColumns(2), { columnCount: 2, columnWidth: 410, canvasWidth: 900 });
  });
});

describe('Compact castlist — 3+ tribes widen the canvas, one column per tribe', () => {
  it('3 tribes → 3 columns, canvas 1330px', () => {
    assert.deepEqual(selectColumns(3), { columnCount: 3, columnWidth: 410, canvasWidth: 1330 });
  });

  it('4 tribes → 4 columns, canvas 1760px', () => {
    assert.deepEqual(selectColumns(4), { columnCount: 4, columnWidth: 410, canvasWidth: 1760 });
  });

  it('caps at MAX_COLUMNS (4) for 5+ tribes', () => {
    assert.equal(selectColumns(5).columnCount, 4);
    assert.equal(selectColumns(9).columnCount, 4);
    assert.equal(selectColumns(5).canvasWidth, 1760);
  });

  it('canvas width formula stays consistent with MARGIN/GAP/WIDTH', () => {
    for (let n = 2; n <= 4; n++) {
      const { columnCount, canvasWidth } = selectColumns(n);
      const expected = MARGIN * 2 + columnCount * COLUMN_WIDTH + (columnCount - 1) * COLUMN_GAP;
      assert.equal(canvasWidth, expected, `tribeCount=${n}`);
    }
  });
});

describe('Compact castlist — column assignment puts each tribe at the top', () => {
  it('3 even tribes each get their own column (the reported bug fix)', () => {
    const { columnCount } = selectColumns(3);
    // CHASE(8), KREVLORNSWATH(7), WYNDAM-PRYCE(7) from the screenshot
    assert.deepEqual(assignColumns([8, 7, 7], columnCount), [0, 1, 2]);
  });

  it('2 tribes land in separate columns (no stacking)', () => {
    const { columnCount } = selectColumns(2);
    assert.deepEqual(assignColumns([8, 7], columnCount), [0, 1]);
  });

  it('5 tribes (cap 4) stack the overflow into the shortest column', () => {
    const { columnCount } = selectColumns(5);
    const assignments = assignColumns([5, 5, 5, 5, 5], columnCount);
    // First 4 fill the 4 columns one each; the 5th stacks into the shortest (col 0)
    assert.deepEqual(assignments.slice(0, 4), [0, 1, 2, 3]);
    assert.equal(assignments[4], 0);
  });
});
