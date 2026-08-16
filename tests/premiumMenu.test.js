/**
 * ⭐ CastBot Premium — placement, paywall, and lock-swap tests.
 *
 * 2026-08-08 (bandaid ripped): the Premium button is PUBLIC — always first in the
 * Production Menu's Advanced row, for everyone. Access control moved from a two-ID
 * allowlist to the entitlements engine: buildPremiumMenu lock-swaps every control
 * (except ← Menu / Donate / Get Premium) to premium_locked_* for guilds without an
 * active/grace tier, and ONE handler serves the ⭐ upsell screen. Reece bypasses.
 * The old "keep the pre-factory ID gate" tripwire is deliberately INVERTED below.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', 'app.js');
const MENU_BUILDER_JS = path.join(__dirname, '..', 'menuBuilder.js');

// Replicated from createProductionMenuInterface (app.js) — Advanced row build.
// 'support_link' stands in for the URL-style Support button (link buttons have no custom_id).
// 🪛 Tools removed 2026-08-08 (Reece: "kill Tools") — its features live behind the paywall.
function advancedRowIds() {
  return ['castbot_premium', 'castbot_settings', 'prod_setup_wizard', 'support_link'];
}

describe('prod /menu Advanced row — ⭐ CastBot Premium placement (public as of 2026-08-08)', () => {
  it('Premium is first (in front of Settings) for EVERYONE — no user gating', () => {
    const row = advancedRowIds();
    assert.equal(row[0], 'castbot_premium');
    assert.equal(row[1], 'castbot_settings');
    assert.equal(row.length, 4);
  });

  it('Donate and Tools are out of the main menu row (Donate lives in Premium; Tools is killed)', () => {
    assert.ok(!advancedRowIds().includes('prod_donate'));
    assert.ok(!advancedRowIds().includes('castbot_tools'));
    const source = readFileSync(APP_JS, 'utf8');
    const rowIdx = source.indexOf('const advancedFeaturesButtons');
    const rowBlock = source.slice(rowIdx, rowIdx + 1400);
    assert.ok(!rowBlock.includes("setCustomId('castbot_tools')"),
      'castbot_tools button came back to the Advanced row — Tools was killed 2026-08-08 (features live behind the paywall)');
  });

  it('the app.js Advanced row build no longer references the old two-ID allowlist', () => {
    const source = readFileSync(APP_JS, 'utf8');
    const rowIdx = source.indexOf('const advancedFeaturesButtons');
    assert.ok(rowIdx >= 0, 'advancedFeaturesButtons not found');
    const rowBlock = source.slice(rowIdx, rowIdx + 1200);
    assert.ok(!rowBlock.includes('1086246253819613274'),
      'Advanced row still gates ⭐ Premium behind the two-ID allowlist — it must render for everyone');
    assert.ok(rowBlock.includes("setCustomId('castbot_premium')"), 'Premium button missing from Advanced row');
  });
});

describe('Paywall tripwire — entitlement lock-swap replaces the ID allowlist', () => {
  const appSource = readFileSync(APP_JS, 'utf8');
  const menuSource = readFileSync(MENU_BUILDER_JS, 'utf8');

  it('castbot_premium handler has NO pre-factory ID gate and keeps Manage Roles', () => {
    const lines = appSource.split('\n');
    const handlerIdx = lines.findIndex(l => l.includes("custom_id === 'castbot_premium'"));
    assert.ok(handlerIdx >= 0, 'castbot_premium handler not found in app.js');
    const factoryOffset = lines.slice(handlerIdx).findIndex(l => l.includes('ButtonHandlerFactory.create'));
    const block = lines.slice(handlerIdx, handlerIdx + factoryOffset + 8).join('\n');
    assert.ok(!block.includes('1086246253819613274'),
      'castbot_premium regained the old two-ID pre-gate — Premium is public now; gating is the lock-swap');
    assert.ok(block.includes('requiresPermission'), 'castbot_premium lost its Manage Roles requirement');
  });

  it('buildPremiumMenu wires the lock-swap: entitlement check + lockPremiumComponents', () => {
    assert.ok(menuSource.includes('hasPremiumAccessSync'),
      'buildPremiumMenu no longer consults the entitlements engine');
    assert.ok(/if \(!entitled\) lockPremiumComponents\(components\)/.test(menuSource),
      'the lock-swap call is gone — non-entitled guilds would get the real menu');
  });

  it('keep-list stays exactly nav + Donate + Get Premium', async () => {
    const { PREMIUM_KEEP_IDS } = await import('../menuBuilder.js');
    assert.deepEqual([...PREMIUM_KEEP_IDS].sort(), ['premium_get', 'prod_donate', 'prod_menu_back']);
  });

  it('Get Premium renders unconditionally (41/40 trim reverted after the section rework freed space)', () => {
    assert.ok(/\{ type: 2, custom_id: 'premium_get', label: 'Get Premium'/.test(menuSource),
      'premium_get missing from the Premium menu nav row');
    assert.ok(!/\.\.\.\(!entitled \? \[\{ type: 2, custom_id: 'premium_get'/.test(menuSource),
      'premium_get went conditional again — if the 40-limit forces a trim, prefer merging sections');
  });

  it('the paywall handler family is wired in app.js and serves the upsell', () => {
    assert.ok(appSource.includes("custom_id.startsWith('premium_locked_')"),
      'premium_locked_* handler branch missing');
    assert.ok(appSource.includes('handlePremiumSurface'), 'paywall dispatch not referenced by the app.js handler');
    assert.ok(menuSource.includes('buildPremiumUpsell') && menuSource.includes('ko-fi.com/CastBot'),
      'upsell builder or its Ko-fi purchase link missing from menuBuilder');
  });
});

describe('lockPremiumComponents — the paywall walker', () => {
  let lockPremiumComponents, PREMIUM_KEEP_IDS;
  it('imports as pure exports', async () => {
    ({ lockPremiumComponents, PREMIUM_KEEP_IDS } = await import('../menuBuilder.js'));
    assert.equal(typeof lockPremiumComponents, 'function');
  });

  it('locks feature buttons and selects; keeps nav, Donate, Get Premium, and Link buttons', async () => {
    const components = [
      { type: 10, content: 'text' },
      { type: 1, components: [
        { type: 2, custom_id: 'attribute_management', style: 2 },
        { type: 2, custom_id: 'prod_menu_back', style: 2 },
        { type: 2, style: 5, url: 'https://x' }
      ] },
      { type: 1, components: [{ type: 3, custom_id: 'entitlements_guild' }] },
      { type: 1, components: [
        { type: 2, custom_id: 'premium_get', style: 3 },
        { type: 2, custom_id: 'prod_donate', style: 2 }
      ] }
    ];
    lockPremiumComponents(components, PREMIUM_KEEP_IDS);
    assert.equal(components[1].components[0].custom_id, 'premium_locked_attribute_management');
    assert.equal(components[1].components[1].custom_id, 'prod_menu_back');
    assert.equal(components[1].components[2].custom_id, undefined);
    assert.equal(components[2].components[0].custom_id, 'premium_locked_entitlements_guild');
    assert.equal(components[3].components[0].custom_id, 'premium_get');
    assert.equal(components[3].components[1].custom_id, 'prod_donate');
  });

  it('descends into Sections (type 9): child components AND the accessory button', async () => {
    const components = [{
      type: 9,
      components: [{ type: 10, content: '## title' }],
      accessory: { type: 2, custom_id: 'entitlements_manage', style: 2 }
    }];
    lockPremiumComponents(components);
    assert.equal(components[0].accessory.custom_id, 'premium_locked_entitlements_manage');
  });

  it('is idempotent — double-locking never stacks prefixes', async () => {
    const components = [{ type: 1, components: [{ type: 2, custom_id: 'archive_channel', style: 2 }] }];
    lockPremiumComponents(components);
    lockPremiumComponents(components);
    assert.equal(components[0].components[0].custom_id, 'premium_locked_archive_channel');
  });

  it('tolerates junk nodes without throwing', async () => {
    assert.doesNotThrow(() => lockPremiumComponents([null, undefined, { type: 1 }, { type: 14 }]));
    assert.doesNotThrow(() => lockPremiumComponents(undefined));
  });
});

// `async` is optional so the anchor survives buildPremiumMenu going async (RaP 0885 stage 1 —
// it awaits playerData to resolve a configId for the shared Channels row).
const PREMIUM_DEF = /static\s+(?:async\s+)?buildPremiumMenu\s*\(/;

describe('Premium menu clone — stays wired in menuBuilder.js', () => {
  const source = readFileSync(MENU_BUILDER_JS, 'utf8');

  it('premium_menu registry entry points at a defined buildPremiumMenu builder', () => {
    assert.ok(source.includes("'premium_menu'"), 'premium_menu missing from MENU_REGISTRY');
    assert.ok(/builder:\s*'buildPremiumMenu'/.test(source), 'premium_menu registry entry lost its builder');
    assert.ok(PREMIUM_DEF.test(source), 'buildPremiumMenu static not defined');
  });

  it('premium clone keeps its own title, distinct from Tools', () => {
    assert.ok(source.includes('⭐ CastBot | Premium'), 'premium title changed/missing');
    assert.ok(source.includes('🪛 CastBot | Tools'), 'tools title changed/missing — clone test assumptions stale');
  });

  it('Donate button is wired inside the Premium menu (moved from main menu 2026-08-08)', () => {
    // Anchor on the static method definitions, NOT the first mention — the MENU_REGISTRY
    // near the top of the file names both builders, which made the naive slice empty.
    const premiumStart = source.search(PREMIUM_DEF);
    assert.ok(premiumStart >= 0, 'buildPremiumMenu definition not found');
    const premiumSection = source.slice(premiumStart, source.indexOf('static buildReecesStuffMenu'));
    assert.ok(premiumSection.includes("'prod_donate'"),
      'prod_donate missing from buildPremiumMenu — Donate has no other menu entry point');
  });

  it('renders the SHARED Channels row, never a second copy of the buttons', () => {
    const premiumStart = source.search(PREMIUM_DEF);
    const premiumSection = source.slice(premiumStart, source.indexOf('static buildReecesStuffMenu'));
    assert.ok(premiumSection.includes('buildChannelsSection'),
      'Premium menu no longer renders the shared Channels section');
    // The whole point of stage 1: if these ids get hand-written here, the two surfaces can drift.
    for (const id of ['channels_confessionals_', 'channels_subs_', 'channels_1on1s_', 'channels_alliances_']) {
      assert.ok(!premiumSection.includes(id),
        `Premium menu hardcodes ${id} — it must come from buildChannelsSection (channelsView.js)`);
    }
  });

  it('the Channels row is NOT user-whitelisted on the Premium surface (open to every admin, 2026-08-16)', () => {
    // Reece on a fresh premium TEST server: other admins saw NO Channels section because the
    // row was gated on CHANNEL_ADMIN_USER_IDS. Access control lives elsewhere — the menu is
    // ManageRoles-gated, unentitled guilds lock-swap, handlers require ManageChannels|ManageRoles.
    const premiumStart = source.search(PREMIUM_DEF);
    const premiumSection = source.slice(premiumStart, source.indexOf('static buildReecesStuffMenu'));
    assert.ok(!premiumSection.includes('CHANNEL_ADMIN_USER_IDS'),
      'Premium Channels row must not be user-whitelisted — every admin of a premium guild sees it');
  });
});

describe('Channels row — one definition, two surfaces (RaP 0885 stage 1)', () => {
  it('buildChannelsSection (row layout, Premium) — heading + 5-button row in SEASON order', async () => {
    const { buildChannelsSection } = await import('../src/channels/channelsView.js');
    const section = buildChannelsSection('config_123_456');

    assert.equal(section.length, 2, 'section is [Text Display, ActionRow]');
    assert.equal(section[0].type, 10);
    assert.equal(section[1].type, 1);

    const ids = section[1].components.map(b => b.custom_id);
    // Season order since 2026-08-16: subs → confessionals → 1on1s → swap → alliances,
    // matching the tab's numbered walkthrough so the two surfaces read the same.
    assert.deepEqual(ids, [
      'channels_subs_config_123_456',
      'channels_confessionals_config_123_456',
      'channels_1on1s_config_123_456',
      // A straight copy of the Castlist Hub button — deliberately NOT configId-keyed.
      'castlist_swap_merge_default',
      'channels_alliances_config_123_456'
    ]);
    // Discord's hard per-ActionRow cap — a sixth action needs a second row, not a squeeze.
    assert.ok(section[1].components.length <= 5);
  });

  it('Msg Category lives ONLY on Premium since 2026-08-16 — dropped from the Season tab', () => {
    const viewSource = readFileSync(
      path.join(__dirname, '..', 'src', 'channels', 'channelsView.js'), 'utf8');
    assert.ok(!/channels_msg_\$\{configId\}/.test(viewSource),
      'the Channels tab grew a Msg Category button back');
    // Premium: hardcoded in 📢 Player Engagement, premium-lock-swapped, no user gate.
    const menuSource = readFileSync(MENU_BUILDER_JS, 'utf8');
    const premiumSection = menuSource.slice(menuSource.search(PREMIUM_DEF), menuSource.indexOf('static buildReecesStuffMenu'));
    assert.ok(premiumSection.includes('Player Engagement'), 'Premium menu lost the 📢 Player Engagement section');
    assert.ok(/channels_msg_\$\{channelsConfigId\}/.test(premiumSection),
      'Premium menu lost Msg Category from Player Engagement');
  });

  it('the Season Manager tab renders the SAME builder (no forked copy)', async () => {
    const viewSource = readFileSync(
      path.join(__dirname, '..', 'src', 'channels', 'channelsView.js'), 'utf8');
    // The tab uses the guided sections layout + pagination + its own premium lock-swap — still the shared builder.
    assert.ok(/\.\.\.buildChannelsSection\(configId, \{ entitled, layout: 'sections', page \}\)/.test(viewSource),
      'buildChannelsView stopped spreading buildChannelsSection — the surfaces can now drift');
  });
});

describe('mostRecentConfigId — the season-less surfaces resolve a season by recency', () => {
  it('picks the most recently updated season', async () => {
    const { mostRecentConfigId } = await import('../src/channels/channelPlan.js');
    const playerData = { g: { applicationConfigs: {
      old: { createdAt: 100, lastUpdated: 200 },
      newest: { createdAt: 50, lastUpdated: 900 },
      middle: { createdAt: 400 }
    } } };
    assert.equal(mostRecentConfigId(playerData, 'g'), 'newest');
  });

  it('falls back to createdAt when lastUpdated is absent', async () => {
    const { mostRecentConfigId } = await import('../src/channels/channelPlan.js');
    const playerData = { g: { applicationConfigs: { a: { createdAt: 1 }, b: { createdAt: 2 } } } };
    assert.equal(mostRecentConfigId(playerData, 'g'), 'b');
  });

  it('returns null for a guild with no seasons — Premium then omits the row entirely', async () => {
    const { mostRecentConfigId } = await import('../src/channels/channelPlan.js');
    assert.equal(mostRecentConfigId({ g: { applicationConfigs: {} } }, 'g'), null);
    assert.equal(mostRecentConfigId({}, 'g'), null);
    assert.equal(mostRecentConfigId(undefined, 'g'), null);
  });
});
