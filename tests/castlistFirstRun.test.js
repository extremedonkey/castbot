// Tests for the /castlist first-run wizard nudge gate (app.js empty-castlist branch).
// Pure predicate replicated inline per TestingStandards.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated from app.js: only nudge the Setup Wizard when an ADMIN runs /castlist on the
// DEFAULT castlist before setup is complete. (Only reached when the castlist has zero tribes.)
function shouldNudgeWizard({ isAdmin, isDefault, hasSetup }) {
  return isAdmin && isDefault && !hasSetup;
}

describe('/castlist first-run wizard nudge — gate', () => {
  it('nudges an admin on the default castlist who has not completed setup', () => {
    assert.equal(shouldNudgeWizard({ isAdmin: true, isDefault: true, hasSetup: false }), true);
  });

  it('does NOT nudge non-admins (players never see the admin wizard)', () => {
    assert.equal(shouldNudgeWizard({ isAdmin: false, isDefault: true, hasSetup: false }), false);
  });

  it('does NOT nudge for a specific (non-default) castlist request', () => {
    assert.equal(shouldNudgeWizard({ isAdmin: true, isDefault: false, hasSetup: false }), false);
  });

  it('does NOT nudge once setup is complete', () => {
    assert.equal(shouldNudgeWizard({ isAdmin: true, isDefault: true, hasSetup: true }), false);
  });

  it('covers the full truth table', () => {
    for (const isAdmin of [true, false]) {
      for (const isDefault of [true, false]) {
        for (const hasSetup of [true, false]) {
          const expected = isAdmin && isDefault && !hasSetup;
          assert.equal(shouldNudgeWizard({ isAdmin, isDefault, hasSetup }), expected);
        }
      }
    }
  });
});
