// Tests for the Setup Wizard "Run Setup" completion flow.
// Pure logic replicated inline per TestingStandards.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicated from roleManager.hasCompletedSetup (single source of truth) ──
function hasCompletedSetup(guildData) {
  const hasPronouns = guildData?.pronounRoleIDs?.length > 0;
  const hasTimezones = !!(guildData?.timezones && Object.keys(guildData.timezones).length > 0);
  return hasPronouns && hasTimezones;
}

// ── Replicated from createWelcomeComponents: Run Setup + Castlist Manager button state ──
function wizardButtons(hasSetup, hasCastlist = false) {
  const runSetup = hasSetup
    ? { custom_id: 'setup_castbot', label: 'Setup Complete', style: 3, disabled: true }
    : { custom_id: 'setup_castbot', label: 'Run Setup', style: 1, disabled: false };
  const castlist = hasCastlist
    ? { custom_id: 'castlist_hub_main_new', label: 'First Castlist Made', style: 3, disabled: false }
    : { custom_id: 'castlist_hub_main_new', label: 'Castlist Manager', style: 2, disabled: !hasSetup };
  return { runSetup, castlist };
}

describe('hasCompletedSetup — single source of truth', () => {
  it('true only when both a pronoun and a timezone exist', () => {
    assert.equal(hasCompletedSetup({ pronounRoleIDs: ['a'], timezones: { x: 1 } }), true);
  });

  it('false with pronouns but no timezones', () => {
    assert.equal(hasCompletedSetup({ pronounRoleIDs: ['a'], timezones: {} }), false);
  });

  it('false with timezones but no pronouns', () => {
    assert.equal(hasCompletedSetup({ pronounRoleIDs: [], timezones: { x: 1 } }), false);
  });

  it('false for missing/empty guild data', () => {
    assert.equal(hasCompletedSetup(undefined), false);
    assert.equal(hasCompletedSetup({}), false);
    assert.equal(hasCompletedSetup({ pronounRoleIDs: ['a'] }), false); // timezones undefined
  });
});

describe('Setup Wizard — button state reflects hasSetup', () => {
  it('not set up: Run Setup is blue + enabled, Castlist Manager disabled', () => {
    const { runSetup, castlist } = wizardButtons(false);
    assert.equal(runSetup.label, 'Run Setup');
    assert.equal(runSetup.style, 1);       // Primary / blue
    assert.equal(runSetup.disabled, false);
    assert.equal(castlist.disabled, true);
  });

  it('set up: Run Setup becomes green ✅ Setup Complete + disabled, Castlist Manager enabled', () => {
    const { runSetup, castlist } = wizardButtons(true);
    assert.equal(runSetup.label, 'Setup Complete');
    assert.equal(runSetup.style, 3);       // Success / green
    assert.equal(runSetup.disabled, true);
    assert.equal(castlist.disabled, false);
  });

  it('both buttons key off the same hasSetup flag (no independent drift)', () => {
    for (const hasSetup of [true, false]) {
      const { runSetup, castlist } = wizardButtons(hasSetup); // hasCastlist defaults false
      // Run Setup disabled-when-complete must mirror Castlist Manager enabled-when-complete
      assert.equal(runSetup.disabled, hasSetup);
      assert.equal(castlist.disabled, !hasSetup);
    }
  });
});

describe('Setup Wizard — Castlist Manager reflects hasCastlist', () => {
  it('default castlist has tribes: green ✅ First Castlist Made, still navigable', () => {
    const { castlist } = wizardButtons(true, true);
    assert.equal(castlist.label, 'First Castlist Made');
    assert.equal(castlist.style, 3);        // Success / green
    assert.equal(castlist.disabled, false); // still clickable to manage castlists
    assert.equal(castlist.custom_id, 'castlist_hub_main_new'); // same destination
  });

  it('no tribes yet but set up: grey Castlist Manager, enabled', () => {
    const { castlist } = wizardButtons(true, false);
    assert.equal(castlist.label, 'Castlist Manager');
    assert.equal(castlist.style, 2);
    assert.equal(castlist.disabled, false);
  });

  it('hasCastlist wins even before setup completes (edge case)', () => {
    const { castlist } = wizardButtons(false, true);
    assert.equal(castlist.label, 'First Castlist Made');
    assert.equal(castlist.style, 3);
  });
});
