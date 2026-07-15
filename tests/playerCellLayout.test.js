/**
 * Unit tests for playerCellLayout.js — the pure layout math behind the
 * avatar-bubble player overlays on Safari map images.
 *
 * playerCellLayout.js is deliberately sharp-free so it can be imported
 * directly here (unlike castlistImageGenerator, whose logic is replicated
 * inline in its test because that module imports sharp).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planCellLayout,
  statusColor,
  truncateName,
  STATUS_COLORS,
  MAX_BUBBLES,
  MIN_BUBBLE_CELL,
} from '../playerCellLayout.js';

// Legacy text-only formula (playerLocationImageGenerator.js / mapExplorer.js
// before this feature) — used as the regression oracle for bubbleCount === 0.
function legacyLayout(playerCount, cellW, cellH) {
  const fontSize = Math.min(22, Math.floor(cellW / 7));
  const lineHeight = fontSize + 6;
  const maxLines = Math.floor((cellH - 10) / lineHeight);
  let visible = Math.min(playerCount, maxLines);
  let overflow = playerCount - visible;
  if (overflow > 0 && visible > 1) {
    visible--;
    overflow++;
  }
  const totalLines = visible + (overflow > 0 ? 1 : 0);
  const blockHeight = totalLines * lineHeight;
  const startY = Math.floor((cellH - blockHeight) / 2);
  return { fontSize, lineHeight, textCount: visible, overflow, blockHeight, startY };
}

describe('planCellLayout — bubble rows on a typical cell (263px, 2000px 7x7 map)', () => {
  it('gives 1 player 1 bubble and no text rows', () => {
    const plan = planCellLayout(1, 263, 263);
    assert.equal(plan.bubbleCount, 1);
    assert.equal(plan.textCount, 0);
    assert.equal(plan.overflow, 0);
  });

  it('gives 3 players 3 bubbles', () => {
    const plan = planCellLayout(3, 263, 263);
    assert.equal(plan.bubbleCount, 3);
    assert.equal(plan.textCount, 0);
    assert.equal(plan.overflow, 0);
  });

  it('caps bubbles at MAX_BUBBLES and spills player 4 to a text row', () => {
    const plan = planCellLayout(4, 263, 263);
    assert.equal(plan.bubbleCount, MAX_BUBBLES);
    assert.equal(plan.textCount, 1);
    assert.equal(plan.overflow, 0);
  });

  it('handles a packed cell (24 players): 3 bubbles + 2 text rows + "+19 more"', () => {
    const plan = planCellLayout(24, 263, 263);
    assert.equal(plan.bubbleCount, 3);
    assert.equal(plan.textCount, 2);
    assert.equal(plan.overflow, 19);
    assert.ok(plan.blockHeight <= 263 - 10, `blockHeight ${plan.blockHeight} must fit availableH`);
  });

  it('uses the expected metrics at this cell size', () => {
    const plan = planCellLayout(1, 263, 263);
    assert.equal(plan.fontSize, 22);
    assert.equal(plan.lineHeight, 28);
    assert.equal(plan.bubbleRowHeight, 56);
    assert.equal(plan.avatarOuter, 52);
    assert.equal(plan.ringWidth, 2);
  });
});

describe('planCellLayout — legacy regression lock (cells below MIN_BUBBLE_CELL)', () => {
  const cell = 84; // e.g. 10x10 grid on a small map

  it(`renders text-only below ${MIN_BUBBLE_CELL}px`, () => {
    for (const n of [1, 4, 10]) {
      assert.equal(planCellLayout(n, cell, cell).bubbleCount, 0);
    }
  });

  it('reproduces the legacy formula exactly for 1, 4, and 10 players', () => {
    for (const n of [1, 4, 10]) {
      const plan = planCellLayout(n, cell, cell);
      const legacy = legacyLayout(n, cell, cell);
      assert.equal(plan.fontSize, legacy.fontSize, `fontSize (n=${n})`);
      assert.equal(plan.lineHeight, legacy.lineHeight, `lineHeight (n=${n})`);
      assert.equal(plan.textCount, legacy.textCount, `textCount (n=${n})`);
      assert.equal(plan.overflow, legacy.overflow, `overflow (n=${n})`);
      assert.equal(plan.blockHeight, legacy.blockHeight, `blockHeight (n=${n})`);
      assert.equal(plan.startY, legacy.startY, `startY (n=${n})`);
    }
  });
});

describe('planCellLayout — bubble shrink on short cells', () => {
  it('shrinks to 1 bubble when 3 do not fit (150x120, 5 players)', () => {
    const plan = planCellLayout(5, 150, 120);
    assert.equal(plan.bubbleCount, 1);
    assert.equal(plan.textCount, 1);
    assert.equal(plan.overflow, 3);
    assert.ok(plan.blockHeight <= 120 - 10);
  });

  it('never exceeds available height with bubbles present', () => {
    for (let n = 1; n <= 30; n++) {
      for (const size of [110, 140, 200, 263, 400]) {
        const plan = planCellLayout(n, size, size);
        // +N-more edge (textCount <= 1 with overflow) may exceed by one line,
        // matching legacy behavior — only assert the bubble+text rows fit.
        const rows = plan.bubbleCount * plan.bubbleRowHeight + plan.textCount * plan.lineHeight;
        assert.ok(rows <= size - 10, `rows ${rows} > availableH at n=${n}, size=${size}`);
      }
    }
  });
});

describe('statusColor', () => {
  it('maps initialized to green and paused to amber', () => {
    assert.equal(statusColor('initialized'), '#4ade80');
    assert.equal(statusColor('paused'), '#f59e0b');
    assert.equal(STATUS_COLORS.paused, '#f59e0b');
  });

  it('falls back to green for unknown/missing status', () => {
    assert.equal(statusColor('uninitialized'), '#4ade80');
    assert.equal(statusColor(undefined), '#4ade80');
  });
});

describe('truncateName', () => {
  it('leaves short names alone', () => {
    assert.equal(truncateName('Topher', 10), 'Topher');
  });

  it('truncates long names with an ellipsis at maxChars', () => {
    assert.equal(truncateName('Bartholomew', 8), 'Bartholo'.substring(0, 7) + '…');
    assert.equal(truncateName('Bartholomew', 8).length, 8);
  });

  it('ignores non-positive maxChars (degenerate cells)', () => {
    assert.equal(truncateName('Name', 0), 'Name');
  });
});
