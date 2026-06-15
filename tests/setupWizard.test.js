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

// ── Replicated from createWelcomeComponents: Run Setup + Castlist Manager button state ──
function wizardButtons(hasSetup, hasCastlist = false, setupInProgress = false) {
  const runSetup = setupInProgress
    ? { custom_id: 'setup_castbot', label: 'Setting up...', style: 3, disabled: true }
    : hasSetup
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

  it('setup in progress: Run Setup shows green "Setting up..." + disabled (instant feedback)', () => {
    const { runSetup } = wizardButtons(false, false, true);
    assert.equal(runSetup.label, 'Setting up...');
    assert.equal(runSetup.style, 3);       // Success / green
    assert.equal(runSetup.disabled, true);
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

  it('Post Castlist reflects hasPostedCastlist (grey 📃 → green ✅ Castlist Posted)', () => {
    const post = (flag) => DiscordMessenger.createWelcomeComponents({ context: 'channel', hasPostedCastlist: flag })[0]
      .components.filter(c => c.type === 9).find(s => s.accessory.custom_id === 'wizard_post_castlist').accessory;
    assert.equal(post(false).label, 'Post Castlist');
    assert.equal(post(false).style, 2);
    assert.equal(post(true).label, 'Castlist Posted');
    assert.equal(post(true).style, 3); // green
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
