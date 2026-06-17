// Tests for the prod /menu Setup button colour (Advanced row).
// RED (Danger) until ALL onboarding steps are done, then grey (Secondary).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated from createProductionMenuInterface (app.js).
function setupButtonStyle({ hasSetup, hasCastlist, hasPostedCastlist, hasSeason }) {
  const allComplete = hasSetup && hasCastlist && hasPostedCastlist && hasSeason;
  return allComplete ? 'Secondary' : 'Danger'; // grey vs red
}

const ALL = { hasSetup: true, hasCastlist: true, hasPostedCastlist: true, hasSeason: true };

describe('prod /menu Setup button — colour', () => {
  it('grey (Secondary) when every onboarding step is complete', () => {
    assert.equal(setupButtonStyle(ALL), 'Secondary');
  });

  it('red (Danger) when ANY single step is missing', () => {
    for (const key of ['hasSetup', 'hasCastlist', 'hasPostedCastlist', 'hasSeason']) {
      assert.equal(setupButtonStyle({ ...ALL, [key]: false }), 'Danger', `missing ${key} → red`);
    }
  });

  it('red when nothing is done', () => {
    assert.equal(setupButtonStyle({ hasSetup: false, hasCastlist: false, hasPostedCastlist: false, hasSeason: false }), 'Danger');
  });
});
