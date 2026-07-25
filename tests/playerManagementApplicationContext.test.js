/**
 * Regression test for a bug caught live on TEST 2026-07-25: in application-channel
 * context (hideBottomButtons: true), Row 2/3 buttons (currency, castdock, attributes, etc.)
 * are correctly hidden, but a stale activeCategory left over from a prior render (e.g. an
 * admin using Prod Player Menu clicked a Row 3 button before hideBottomButtons kicked in)
 * kept rendering that category's hot-swap select anyway — a select with no visible button
 * that opens it. Fix: playerManagement.js's createPlayerManagementUI computes
 * effectiveActiveCategory, nulling out anything not in the Row 1 essentials
 * (pronouns/timezone/age) when hideBottomButtons is true, before passing it to buildSuperSelect.
 * Logic replicated inline per docs/standards/TestingStandards.md (avoids importing the full
 * playerManagement.js module graph for a 3-line pure computation).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const APPLICATION_ALLOWED_CATEGORIES = ['pronouns', 'timezone', 'age'];

function computeEffectiveActiveCategory(activeCategory, hideBottomButtons) {
  return (hideBottomButtons && !APPLICATION_ALLOWED_CATEGORIES.includes(activeCategory))
    ? null
    : activeCategory;
}

describe('createPlayerManagementUI — effectiveActiveCategory (application-context select leak fix)', () => {
  it('passes Row 1 essentials through unchanged in application context', () => {
    for (const cat of APPLICATION_ALLOWED_CATEGORIES) {
      assert.equal(computeEffectiveActiveCategory(cat, true), cat);
    }
  });

  it('nulls out any Row 2/3 category in application context (the actual bug)', () => {
    for (const cat of ['castdock', 'currency', 'inventory', 'map', 'stamina', 'castlists', 'challenges', 'crafting', 'actions', 'stores', 'vanity', 'attributes']) {
      assert.equal(computeEffectiveActiveCategory(cat, true), null, `category=${cat}`);
    }
  });

  it('nulls out null/undefined activeCategory in application context (no-op, stays null)', () => {
    assert.equal(computeEffectiveActiveCategory(null, true), null);
    assert.equal(computeEffectiveActiveCategory(undefined, true), null);
  });

  it('passes EVERY category through unchanged outside application context (normal menu unaffected)', () => {
    for (const cat of ['castdock', 'currency', 'attributes', 'pronouns', 'timezone', 'age', null, undefined]) {
      assert.equal(computeEffectiveActiveCategory(cat, false), cat);
    }
  });
});
