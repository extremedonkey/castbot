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

// ── Replicated from app.js ensureCompletionQuestion (sync, crypto stubbed) ──
function ensureCompletionQuestion(config) {
  if (!config.questions) config.questions = [];
  if (config.questions.find(q => q.questionType === 'completion')) return false;
  const last = config.questions[config.questions.length - 1];
  if (last && !last.questionType) {
    last.questionType = 'completion';
  } else {
    config.questions.push({ id: 'question_default', questionType: 'completion' });
  }
  return true;
}

// ── Replicated page clamp from buildQuestionManagementUI ──
function clampPage(currentPage, regularCount, perPage = QUESTIONS_PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(regularCount / perPage));
  return Math.max(0, Math.min(currentPage, totalPages - 1));
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

describe('ensureCompletionQuestion — legacy seasons get a persisted completion', () => {
  it('converts a trailing PLAIN question into the completion (legacy season)', () => {
    const config = { questions: [{ id: 'a' }, { id: 'b' }] }; // no questionType = plain
    const changed = ensureCompletionQuestion(config);
    assert.equal(changed, true);
    assert.equal(config.questions[1].questionType, 'completion');
    assert.equal(config.questions.length, 2); // converted, not appended
  });

  it('is a no-op when a completion already exists', () => {
    const config = { questions: [{ id: 'a' }, { id: 'c', questionType: 'completion' }] };
    assert.equal(ensureCompletionQuestion(config), false);
    assert.equal(config.questions.length, 2);
  });

  it('appends a default completion for an empty season', () => {
    const config = { questions: [] };
    assert.equal(ensureCompletionQuestion(config), true);
    assert.equal(config.questions.length, 1);
    assert.equal(config.questions[0].questionType, 'completion');
  });

  it('NEVER absorbs a trailing special question (e.g. dnc) — appends instead', () => {
    const config = { questions: [{ id: 'a' }, { id: 'd', questionType: 'dnc' }] };
    assert.equal(ensureCompletionQuestion(config), true);
    assert.equal(config.questions[1].questionType, 'dnc'); // dnc preserved
    assert.equal(config.questions[2].questionType, 'completion'); // appended
  });
});

// ── Replicated DNC insert logic from app.js question_add_dnc (no singleton guard) ──
// DNC is NOT a config-level singleton: a host may add it more than once. All DNC questions
// share the applicant's single dncEntries[] list (one DNC list per player — by design).
function addDncQuestion(config, id = 'dnc_new') {
  if (!config.questions) config.questions = [];
  ensureCompletionQuestion(config);
  const dnc = { id, questionType: 'dnc' };
  const completionIdx = config.questions.findIndex(q => q.questionType === 'completion');
  if (completionIdx >= 0) config.questions.splice(completionIdx, 0, dnc);
  else config.questions.push(dnc);
  return config;
}

describe('DNC question — NOT a singleton (host may add it multiple times)', () => {
  it('adds a DNC question to a fresh season (before the completion)', () => {
    const config = { questions: [{ id: 'a' }, { id: 'b' }] };
    addDncQuestion(config, 'dnc1');
    const types = config.questions.map(q => q.questionType);
    assert.deepEqual(types, [undefined, 'dnc', 'completion']); // last plain → completion, dnc spliced before it
    // dnc sits immediately before completion
    const dncIdx = config.questions.findIndex(q => q.id === 'dnc1');
    const compIdx = config.questions.findIndex(q => q.questionType === 'completion');
    assert.equal(dncIdx, compIdx - 1);
  });

  it('allows a SECOND DNC question (regression: old guard silently blocked this)', () => {
    const config = { questions: [{ id: 'a', questionType: 'dnc' }, { id: 'c', questionType: 'completion' }] };
    addDncQuestion(config, 'dnc2');
    const dncCount = config.questions.filter(q => q.questionType === 'dnc').length;
    assert.equal(dncCount, 2); // both DNCs coexist — no silent no-op
    // newest DNC is inserted before completion, completion stays last
    assert.equal(config.questions[config.questions.length - 1].questionType, 'completion');
  });

  it('each added DNC lands before the completion, never after it', () => {
    const config = { questions: [{ id: 'a' }] };
    addDncQuestion(config, 'dnc1');
    addDncQuestion(config, 'dnc2');
    addDncQuestion(config, 'dnc3');
    const compIdx = config.questions.findIndex(q => q.questionType === 'completion');
    config.questions.forEach((q, i) => {
      if (q.questionType === 'dnc') assert.ok(i < compIdx, `dnc at ${i} must precede completion at ${compIdx}`);
    });
    assert.equal(config.questions.filter(q => q.questionType === 'dnc').length, 3);
  });
});

describe('Page clamp — out-of-range page never renders blank', () => {
  it('clamps page 1 down to 0 when only one page of questions exists', () => {
    // The exact prod failure: handler navigated to page 1, but after completion-conversion
    // only 8 regular questions remained (1 page) → page 1 was blank. Clamp → page 0.
    assert.equal(clampPage(1, 8), 0);
  });

  it('keeps a valid page as-is', () => {
    assert.equal(clampPage(1, 9), 1); // 9 questions = 2 pages, page 1 valid
    assert.equal(clampPage(0, 5), 0);
  });

  it('never returns negative', () => {
    assert.equal(clampPage(-3, 5), 0);
  });
});

describe('End-to-end: legacy season (8 plain Qs, no completion) + add a question', () => {
  it('converts last→completion, inserts new before it, lands on a non-blank page', () => {
    const config = { questions: Array.from({ length: 8 }, (_, i) => ({ id: `q${i}` })) }; // 8 plain
    // 1. normalize: last plain → completion ⇒ 7 regular + 1 completion
    ensureCompletionQuestion(config);
    // 2. insert new before completion
    const completionIdx = config.questions.findIndex(q => q.questionType === 'completion');
    config.questions.splice(completionIdx, 0, { id: 'new' });
    // 3. page math now agrees with the renderer
    const regularCount = config.questions.filter(q => q.questionType !== 'completion').length;
    assert.equal(regularCount, 8); // 7 original + new
    const page = newQuestionPage(regularCount);
    assert.equal(page, 0); // all 8 fit on page 0 — new question visible immediately
    assert.equal(clampPage(page, regularCount), 0); // and it's a valid page
  });
});
