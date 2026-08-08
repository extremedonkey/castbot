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

// ── Replicated from roleManager.runFullSetup pre-flight (single source of truth) ──
// Setup needs Manage Roles to create pronoun/timezone roles. Without it, every
// guild.roles.create() throws DiscordAPIError 50013, so we fail fast with a typed error.
function preflightManageRoles(me) {
  if (!me?.permissions?.has('ManageRoles')) {
    const err = new Error("CastBot is missing the **Manage Roles** permission, so it can't create pronoun and timezone roles.");
    err.code = 'MISSING_MANAGE_ROLES';
    throw err;
  }
  return true;
}

// Minimal stand-in for guild.members.me.permissions (.has(flag))
const memberWithPerms = (flags) => ({ permissions: { has: (f) => flags.includes(f) } });

describe('runFullSetup — Manage Roles pre-flight', () => {
  it('passes when the bot has Manage Roles', () => {
    assert.equal(preflightManageRoles(memberWithPerms(['ManageRoles'])), true);
  });

  it('throws a typed MISSING_MANAGE_ROLES error when the permission is absent', () => {
    assert.throws(() => preflightManageRoles(memberWithPerms([])), (err) => {
      assert.equal(err.code, 'MISSING_MANAGE_ROLES');
      assert.match(err.message, /Manage Roles/);
      return true;
    });
  });

  it('throws when the bot member cannot be resolved (no me)', () => {
    assert.throws(() => preflightManageRoles(null), (err) => err.code === 'MISSING_MANAGE_ROLES');
    assert.throws(() => preflightManageRoles(undefined), (err) => err.code === 'MISSING_MANAGE_ROLES');
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

describe('CastBot Settings — ⚙️ Setup (same setup_castbot handler, always enabled)', () => {
  // Old-timezone-regime servers need a way to re-run setup after the wizard's own button
  // has gone green/disabled. That always-enabled copy lived in Tools → Utilities until
  // 2026-07-29; it now sits in CastBot Settings → CastBot-Wide Settings, right of
  // Reaction Roles (with Scheduled Jobs beside it).
  it('CastBot-Wide Settings row carries a grey ⚙️ Setup button wired to setup_castbot', async () => {
    const { createSafariCustomizationUI } = await import('../safariConfigUI.js');
    const ui = await createSafariCustomizationUI('2', {});
    const rows = ui.components[0].components.filter(c => c.type === 1);
    const btn = rows.flatMap(r => r.components).find(b => b.custom_id === 'setup_castbot');
    assert.ok(btn, 'Setup missing from CastBot Settings');
    assert.equal(btn.label, 'Setup');
    assert.equal(btn.style, 2);              // Secondary / grey
    assert.equal(btn.emoji.name, '⚙️');
    assert.ok(!btn.disabled);                // always enabled, unlike the wizard's copy
    // Scheduled Jobs sits immediately to its right, in the same row.
    const row = rows.find(r => r.components.some(b => b.custom_id === 'setup_castbot'));
    const idx = row.components.findIndex(b => b.custom_id === 'setup_castbot');
    assert.equal(row.components[idx + 1]?.custom_id, 'scheduled_jobs_dashboard');
  });

  it('no ActionRow in CastBot Settings exceeds the 5-button Discord cap', async () => {
    const { createSafariCustomizationUI } = await import('../safariConfigUI.js');
    const ui = await createSafariCustomizationUI('2', {});
    for (const row of ui.components[0].components.filter(c => c.type === 1)) {
      assert.ok(row.components.length <= 5,
        `row has ${row.components.length} buttons: ${row.components.map(b => b.label).join(', ')}`);
    }
  });

  it('no ActionRow in the Tools menu exceeds the 5-button Discord cap (worst-case flags)', async () => {
    const { MenuBuilder } = await import('../menuBuilder.js');
    const { ALLOWED_GUILD_IDS } = await import('../askCastBot.js');
    // Reece + test-instance + an Ask-CastBot-WHITELISTED guild is the widest render.
    // The guildId matters: this test used '2' (not whitelisted) and therefore never
    // rendered the Ask CastBot buttons — it missed a live 6-button row on 2026-07-29.
    const prevRole = process.env.INSTANCE_ROLE;
    process.env.INSTANCE_ROLE = 'test';
    try {
      for (const builder of ['buildSetupMenu', 'buildPremiumMenu']) {
        const menu = MenuBuilder[builder]({ title: 'x' }, { userId: '391415444084490240', guildId: ALLOWED_GUILD_IDS[0] });
        for (const row of menu.components.filter(c => c.type === 1)) {
          assert.ok(row.components.length <= 5,
            `${builder}: ActionRow with ${row.components.length} buttons (max 5): ${row.components.map(b => b.custom_id).join(', ')}`);
        }
      }
    } finally {
      if (prevRole === undefined) delete process.env.INSTANCE_ROLE;
      else process.env.INSTANCE_ROLE = prevRole;
    }
  });
});

describe('Setup Wizard — gating model (gate disables, done greens)', () => {
  // gate signals: Season+Castlist = hasSetup, Post = hasCastlist
  it('Season Manager (Task 2) gated on hasSetup, green ✅ Season Created when a season exists', () => {
    assert.equal(taskButton('season_manager_new', { hasSetup: false }).disabled, true);
    const enabled = taskButton('season_manager_new', { hasSetup: true, hasSeason: false });
    assert.equal(enabled.label, 'Season Manager');
    assert.equal(enabled.style, 2);
    assert.equal(enabled.disabled, false);
    const done = taskButton('season_manager_new', { hasSetup: true, hasSeason: true });
    assert.equal(done.label, 'Season Created');
    assert.equal(done.style, 3); // green
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
    assert.equal(sections.length, 5, 'expected 5 task sections (Setup, Season, Castlist, Display, Join)');
    for (const s of sections) {
      assert.equal(s.components.length, 1, 'Section must have EXACTLY one child (Discord limit)');
      assert.equal(s.components[0].type, 10, 'Section child must be a Text Display');
      assert.equal(s.accessory.type, 2, 'Section accessory must be a Button');
    }
  });

  it('wires the right button to each task section, in order', () => {
    const sections = channel({ hasSetup: true, hasCastlist: true }).filter(c => c.type === 9);
    assert.equal(sections[0].accessory.custom_id, 'setup_castbot');
    assert.equal(sections[1].accessory.custom_id, 'season_manager_new');
    assert.equal(sections[2].accessory.custom_id, 'castlist_hub_main_new');
    assert.equal(sections[3].accessory.custom_id, 'wizard_post_castlist');
    // Task 5 is a link button (support server invite) — no custom_id, never gated
    assert.equal(sections[4].accessory.style, 5);
    assert.equal(sections[4].accessory.url, 'https://discord.gg/H7MpJEjkwT');
    assert.equal(sections[4].accessory.label, 'Join');
    assert.equal(sections[4].accessory.disabled, undefined);
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

  it('banner option shows above the title, only when passed (post-Run-Setup re-post)', () => {
    const noBanner = channel({})[0].content;
    assert.match(noBanner, /CastBot Setup Wizard/); // title is first when no banner

    const withBanner = DiscordMessenger.createWelcomeComponents({ context: 'channel', banner: '```✅ Setup Complete```' })[0].components;
    assert.equal(withBanner[0].content, '```✅ Setup Complete```');       // banner first
    assert.match(withBanner[1].content, /CastBot Setup Wizard/);          // then the title
  });
});

// ── Replicated from roleManager.buildSetupWizardBanner (single source of truth) ──
// The post-Run-Setup fresh wizard pushes the setup-results warning panel off-screen,
// so when hierarchy issues exist the banner must NOT read as an all-clear.
function buildSetupWizardBanner(results) {
  const hierarchyWarnings = [
    ...(results?.pronouns?.hierarchyWarnings || []),
    ...(results?.timezones?.hierarchyWarnings || [])
  ];
  if (hierarchyWarnings.length === 0) {
    return '```✅ Setup Complete```';
  }
  const botRoleName = hierarchyWarnings[0].botRoleName || 'CastBot';
  return '**```⚠️ Setup ran with issues```**\n' +
    `> You need to move the @${botRoleName} Discord role to the top of your role hierarchy. ` +
    'Scroll up and read the Setup Wizard panel for detailed instructions.';
}

// Minimal setupResults stand-in (shape from roleManager.executeSetup)
const setupResults = ({ pronounWarnings = [], timezoneWarnings = [] } = {}) => ({
  pronouns: { hierarchyWarnings: pronounWarnings, failed: [] },
  timezones: { hierarchyWarnings: timezoneWarnings, failed: [] }
});

describe('Setup Wizard — post-setup banner (buildSetupWizardBanner)', () => {
  it('all-clear: green Setup Complete when no hierarchy warnings', () => {
    assert.equal(buildSetupWizardBanner(setupResults()), '```✅ Setup Complete```');
  });

  it('pronoun hierarchy warnings flip the banner to ⚠️ with scroll-up instructions', () => {
    const banner = buildSetupWizardBanner(setupResults({
      pronounWarnings: [{ name: 'She/Her', id: '1', botRoleName: 'CastBot-Test' }]
    }));
    assert.match(banner, /^\*\*```⚠️ Setup ran with issues```\*\*/); // bold code-block chip
    assert.match(banner, /\n> You need to move the @CastBot-Test Discord role to the top/); // blockquote body
    assert.match(banner, /Scroll up/);
  });

  it('timezone-only warnings also trigger the warning banner', () => {
    const banner = buildSetupWizardBanner(setupResults({
      timezoneWarnings: [{ name: 'PST', id: '2', botRoleName: 'CastBot' }]
    }));
    assert.match(banner, /Setup ran with issues/);
    assert.match(banner, /@CastBot Discord role/);
  });

  it('falls back to "CastBot" when the warning has no botRoleName', () => {
    const banner = buildSetupWizardBanner(setupResults({
      pronounWarnings: [{ name: 'He/Him', id: '3' }]
    }));
    assert.match(banner, /@CastBot Discord role/);
  });

  it('tolerates missing/partial results (defensive)', () => {
    assert.equal(buildSetupWizardBanner(undefined), '```✅ Setup Complete```');
    assert.equal(buildSetupWizardBanner({}), '```✅ Setup Complete```');
  });

  it('parity guard: replica matches the real roleManager export', async () => {
    const { buildSetupWizardBanner: real } = await import('../roleManager.js');
    const cases = [
      setupResults(),
      setupResults({ pronounWarnings: [{ name: 'She/Her', id: '1', botRoleName: 'CastBot-Test' }] }),
      setupResults({ timezoneWarnings: [{ name: 'PST', id: '2', botRoleName: 'CastBot' }] }),
      setupResults({ pronounWarnings: [{ name: 'He/Him', id: '3' }] })
    ];
    for (const c of cases) assert.equal(buildSetupWizardBanner(c), real(c));
  });
});

