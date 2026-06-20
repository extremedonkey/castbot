// Tests for "land on the page containing the newly-added question" in the Season
// Application question manager.
//
// Bug (2026-06-21, prod): adding a Do Not Cast question (and modal-added questions) didn't
// appear immediately — they showed up "one action later". Cause: new questions are spliced
// before the `completion` question → they become the LAST regular question, which with >8
// questions lives on the last page; but the re-render used page 0 (DNC) / clamped to
// currentPage (modal), hiding the new question. Fix: render the page that CONTAINS it.
//
// Pure logic replicated inline per TestingStandards.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const QUESTIONS_PER_PAGE = 8;

// Page of the newly-added (last) regular question — used by BOTH the DNC add and the modal add.
function newQuestionPage(regularCount, perPage = QUESTIONS_PER_PAGE) {
  return Math.floor(Math.max(0, regularCount - 1) / perPage);
}

describe('Question add — page containing the new question', () => {
  it('fits on page 0 while there are ≤ 8 regular questions', () => {
    assert.equal(newQuestionPage(1), 0);
    assert.equal(newQuestionPage(8), 0);
  });

  it('the 9th regular question lands on page 1 (the DNC bug scenario)', () => {
    // Before fix: DNC add hardcoded page 0 → invisible. Now it renders page 1.
    assert.equal(newQuestionPage(9), 1);
  });

  it('page boundaries roll over every 8 questions', () => {
    assert.equal(newQuestionPage(16), 1); // last of page 1
    assert.equal(newQuestionPage(17), 2); // first of page 2
    assert.equal(newQuestionPage(24), 2);
    assert.equal(newQuestionPage(25), 3);
  });

  it('never returns a negative page for empty/edge inputs', () => {
    assert.equal(newQuestionPage(0), 0);
    assert.equal(newQuestionPage(1), 0);
  });

  it('regression: old "stay on page 0" hid the new question once it crossed a page boundary', () => {
    // Old DNC behavior was a constant 0; the new question is on page `newQuestionPage`.
    // They diverge exactly when there are >8 questions — which is the reported failure.
    const regularCount = 9;
    const oldHardcodedPage = 0;
    assert.notEqual(oldHardcodedPage, newQuestionPage(regularCount));
  });
});
