// Tests for Stage-0 application lifecycle: completion tracking, the ✅→☑️ emoji guard, and re-apply RESUME.
// Pure logic replicated inline (mirrors app.js app_next_question / app_reapply) to avoid importing the
// Discord/file-I/O-heavy app module. See RaP 0905 §4 (rows 1-3) + the prod ✅→☑️ downgrade bug.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// app.js: completion is now stored as the atomic fact `completedAt` (edit-proof), not inferred from the index.
function isComplete(application) {
  return !!application.completedAt;
}

// app.js app_next_question: only stamp ☑️ when the channel isn't ALREADY complete/placement-decided.
// Guard checks the RAW name (the old bug stripped the emoji first, so the guard never fired → ✅ got clobbered to ☑️).
function shouldStampComplete(rawChannelName) {
  return !/^[☑️✅❌]/.test(rawChannelName);
}

// app.js app_reapply: un-withdraw RESUMES prior state — ☑️ if they'd completed, else 📝 New.
function reapplyEmoji(completedAt) {
  return completedAt ? '☑️' : '📝';
}

describe('Application lifecycle — completion is DATA, not the question index', () => {
  it('complete when completedAt is set', () => {
    assert.equal(isComplete({ completedAt: '2026-06-25T00:00:00Z', currentQuestion: 1 }), true);
  });
  it('NOT complete without completedAt — even at a high currentQuestion (index is unreliable after edits)', () => {
    assert.equal(isComplete({ currentQuestion: 9 }), false);
  });
  it('NOT complete on a brand-new application', () => {
    assert.equal(isComplete({}), false);
  });
});

describe('Application lifecycle — ☑️ completion emoji guard (no ✅→☑️ downgrade)', () => {
  it('stamps ☑️ on a fresh 📝 channel', () => {
    assert.equal(shouldStampComplete('📝reecebot-app'), true);
  });
  it('stamps ☑️ on an un-prefixed channel', () => {
    assert.equal(shouldStampComplete('reecebot-app'), true);
  });
  it('does NOT downgrade an accepted ✅ channel (the prod bug)', () => {
    assert.equal(shouldStampComplete('✅reecebot-app'), false);
  });
  it('does NOT downgrade a declined ❌ channel', () => {
    assert.equal(shouldStampComplete('❌reecebot-app'), false);
  });
  it('does NOT re-stamp an already ☑️ channel', () => {
    assert.equal(shouldStampComplete('☑️reecebot-app'), false);
  });
});

describe('Application lifecycle — re-apply RESUMES prior state (un-withdraw, not restart)', () => {
  it('a completed application resumes to ☑️', () => {
    assert.equal(reapplyEmoji('2026-06-25T00:00:00Z'), '☑️');
  });
  it('an in-progress application resumes to 📝 New', () => {
    assert.equal(reapplyEmoji(undefined), '📝');
  });
});
