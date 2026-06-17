// Tests for the Setup Wizard "Run Setup" completion flow.
// Pure logic replicated inline per TestingStandards.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import DiscordMessenger from '../discordMessenger.js';

// ── Replicated from roleManager.hasCompletedSetup (single source of truth) ──
function hasCompletedSetup(guildData) {
  const hasPronouns = guildData?.pronounRoleIDs?.length > 0;
  const hasTimezones = !!(guildData?.timezones && Object.keys(guildData.timezones).length > 0);
  return hasPronouns && hasTimezones;
}

// Assert button states against the REAL builder (no replica → can't drift from the state model).
// Returns the accessory button for a given task custom_id under the given signals.
function taskButton(customId, opts = {}) {
  return DiscordMessenger.createWelcomeComponents({ context: 'channel', ...opts })[0]
    .components.filter(c => c.type === 9)
    .find(s => s.accessory.custom_id === customId).accessory;
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

describe('Setup Wizard — Run Setup (Task 1) action button', () => {
  it('not set up: blue 🪛 Run Setup, enabled', () => {
    const b = taskButton('setup_castbot', { hasSetup: false });
    assert.equal(b.label, 'Run Setup');
    assert.equal(b.style, 1);        // Primary / blue
    assert.ok(!b.disabled);          // enabled (field may be absent = enabled)
  });

  it('set up: green ✅ Setup Complete, disabled', () => {
    const b = taskButton('setup_castbot', { hasSetup: true });
    assert.equal(b.label, 'Setup Complete');
    assert.equal(b.style, 3);        // Success / green
    assert.equal(b.disabled, true);
  });

  it('setup in progress: green ⏳ Setting up..., disabled (instant feedback)', () => {
    const b = taskButton('setup_castbot', { setupInProgress: true });
    assert.equal(b.label, 'Setting up...');
    assert.equal(b.style, 3);
    assert.equal(b.disabled, true);
  });
});

describe('Setup Wizard — gating model (gate disables, done greens)', () => {
  // gate signals: Season+Castlist = hasSetup, Post = hasCastlist
  it('Season Manager (Task 2) gated on hasSetup, no done-state', () => {
    assert.equal(taskButton('season_management_menu', { hasSetup: false }).disabled, true);
    assert.equal(taskButton('season_management_menu', { hasSetup: true }).disabled, false);
    // never goes green (no done-state)
    assert.equal(taskButton('season_management_menu', { hasSetup: true }).style, 2);
  });

  it('Castlist Manager (Task 3) gated on hasSetup, green when default castlist has tribes', () => {
    assert.equal(taskButton('castlist_hub_main_new', { hasSetup: false }).disabled, true);
    const enabled = taskButton('castlist_hub_main_new', { hasSetup: true, hasCastlist: false });
    assert.equal(enabled.label, 'Castlist Manager');
    assert.equal(enabled.disabled, false);
    const done = taskButton('castlist_hub_main_new', { hasSetup: true, hasCastlist: true });
    assert.equal(done.label, 'First Castlist Made');
    assert.equal(done.style, 3);     // green
    assert.equal(done.disabled, false);
  });

  it('Post Castlist (Task 4) gated on hasCastlist, green only when posted AND a tribe exists', () => {
    // disabled until the default castlist has tribes (can't display an empty castlist)
    assert.equal(taskButton('wizard_post_castlist', { hasSetup: true, hasCastlist: false }).disabled, true);
    const enabled = taskButton('wizard_post_castlist', { hasCastlist: true, hasPostedCastlist: false });
    assert.equal(enabled.label, 'Post Castlist');
    assert.equal(enabled.style, 2);
    assert.equal(enabled.disabled, false);
    const done = taskButton('wizard_post_castlist', { hasCastlist: true, hasPostedCastlist: true });
    assert.equal(done.label, 'Castlist Posted');
    assert.equal(done.style, 3);     // green

    // BUG GUARD: a stale "posted" flag with NO tribes must NOT show green (regression from screenshot)
    const stale = taskButton('wizard_post_castlist', { hasCastlist: false, hasPostedCastlist: true });
    assert.equal(stale.label, 'Post Castlist');
    assert.notEqual(stale.style, 3); // not green
    assert.equal(stale.disabled, true);
  });
});

describe('Setup Wizard — channel layout uses Section + button accessory', () => {
  const channel = (opts) => DiscordMessenger.createWelcomeComponents({ context: 'channel', ...opts })[0].components;

  it('renders one Section per task, each with a single Text child + a button accessory', () => {
    const sections = channel({ hasSetup: false, hasCastlist: false }).filter(c => c.type === 9);
    assert.equal(sections.length, 4, 'expected 4 task sections (Setup, Season, Castlist, Display)');
    for (const s of sections) {
      assert.equal(s.components.length, 1, 'Section must have EXACTLY one child (Discord limit)');
      assert.equal(s.components[0].type, 10, 'Section child must be a Text Display');
      assert.equal(s.accessory.type, 2, 'Section accessory must be a Button');
    }
  });

  it('wires the right button to each task section, in order', () => {
    const sections = channel({ hasSetup: true, hasCastlist: true }).filter(c => c.type === 9);
    assert.equal(sections[0].accessory.custom_id, 'setup_castbot');
    assert.equal(sections[1].accessory.custom_id, 'season_management_menu');
    assert.equal(sections[2].accessory.custom_id, 'castlist_hub_main_new');
    assert.equal(sections[3].accessory.custom_id, 'wizard_post_castlist');
  });

  it('keeps Features + Help as the only action row, Features first', () => {
    const rows = channel({ hasSetup: true, hasCastlist: false }).filter(c => c.type === 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].components[0].custom_id, 'dm_view_tips');
    assert.equal(rows[0].components[1].style, 5); // link button
  });

  it('DM context has no task sections (channel-only)', () => {
    const dm = DiscordMessenger.createWelcomeComponents({ context: 'dm' })[0].components;
    assert.equal(dm.filter(c => c.type === 9).length, 0);
  });

});

