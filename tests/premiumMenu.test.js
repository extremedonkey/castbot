/**
 * ⭐ CastBot Premium mockup — gating and placement tests.
 *
 * The Premium button is a Reece-only entry point in the Production Menu's
 * Advanced row (in front of Settings; Donate moved INTO the Premium menu
 * 2026-08-08). Because the Production Menu can be posted
 * PUBLICLY via viral_menu, render-time hiding is not security: the handler in
 * app.js must keep its ID-array gate BEFORE ButtonHandlerFactory.create (same
 * pattern as reeces_stuff). The tripwire below fails if that gate is removed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', 'app.js');
const MENU_BUILDER_JS = path.join(__dirname, '..', 'menuBuilder.js');

const GATED_IDS = ['391415444084490240', '1086246253819613274'];

// Replicated from createProductionMenuInterface (app.js) — Advanced row build.
// 'support_link' stands in for the URL-style Support button (link buttons have no custom_id).
function advancedRowIds(userId) {
  return [
    ...(GATED_IDS.includes(userId) ? ['castbot_premium'] : []),
    'castbot_settings', 'castbot_tools', 'prod_setup_wizard', 'support_link'
  ];
}

describe('prod /menu Advanced row — ⭐ CastBot Premium placement', () => {
  it('Premium is first (in front of Settings) for both gated IDs', () => {
    for (const id of GATED_IDS) {
      const row = advancedRowIds(id);
      assert.equal(row[0], 'castbot_premium', `gated ID ${id} → Premium at index 0`);
      assert.equal(row[1], 'castbot_settings', 'Settings immediately after Premium');
      assert.equal(row.length, 5);
    }
  });

  it('Premium is absent for everyone else', () => {
    for (const userId of ['123456789012345678', undefined, null, '']) {
      const row = advancedRowIds(userId);
      assert.ok(!row.includes('castbot_premium'), `userId ${userId} must not see Premium`);
      assert.equal(row[0], 'castbot_settings');
      assert.equal(row.length, 4);
    }
  });

  it('Donate is out of the main menu row (it lives in the Premium menu now)', () => {
    assert.ok(!advancedRowIds(GATED_IDS[0]).includes('prod_donate'));
    assert.ok(!advancedRowIds('someone-else').includes('prod_donate'));
  });

  it('row never exceeds the Discord 5-button ActionRow cap', () => {
    assert.ok(advancedRowIds(GATED_IDS[0]).length <= 5);
    assert.ok(advancedRowIds('someone-else').length <= 5);
  });
});

describe('Security tripwire — castbot_premium handler gate', () => {
  const source = readFileSync(APP_JS, 'utf8');

  it('handler keeps the ID-array gate BEFORE ButtonHandlerFactory.create', () => {
    const lines = source.split('\n');
    const handlerIdx = lines.findIndex(l => l.includes("custom_id === 'castbot_premium'"));
    assert.ok(handlerIdx >= 0, 'castbot_premium handler not found in app.js');
    const factoryOffset = lines.slice(handlerIdx).findIndex(l => l.includes('ButtonHandlerFactory.create'));
    assert.ok(factoryOffset > 0, 'castbot_premium handler no longer uses ButtonHandlerFactory');
    const beforeFactory = lines.slice(handlerIdx, handlerIdx + factoryOffset).join('\n');
    assert.ok(GATED_IDS.every(id => beforeFactory.includes(id)),
      'castbot_premium lost its pre-factory ID gate — the prod menu can be PUBLIC via viral_menu, ' +
      'so anyone could open Premium. Restore the reeces_stuff-style gate before ButtonHandlerFactory.create.');
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

  it('the Channels row stays whitelist-gated on the Premium surface', () => {
    const premiumStart = source.search(PREMIUM_DEF);
    const premiumSection = source.slice(premiumStart, source.indexOf('static buildReecesStuffMenu'));
    assert.ok(premiumSection.includes('CHANNEL_ADMIN_USER_IDS'),
      'Channels row lost its whitelist gate on the Premium menu — it is still a hidden feature');
  });
});

describe('Channels row — one definition, two surfaces (RaP 0885 stage 1)', () => {
  it('buildChannelsSection returns the heading + the 5-button row (Swap/Merge replaced Msg Category 2026-08-08)', async () => {
    const { buildChannelsSection } = await import('../src/channels/channelsView.js');
    const section = buildChannelsSection('config_123_456');

    assert.equal(section.length, 2, 'section is [Text Display, ActionRow]');
    assert.equal(section[0].type, 10);
    assert.equal(section[1].type, 1);

    const ids = section[1].components.map(b => b.custom_id);
    assert.deepEqual(ids, [
      'channels_confessionals_config_123_456',
      'channels_subs_config_123_456',
      'channels_1on1s_config_123_456',
      'channels_alliances_config_123_456',
      // A straight copy of the Castlist Hub button — deliberately NOT configId-keyed.
      'castlist_swap_merge_default'
    ]);
    // Discord's hard per-ActionRow cap — a sixth action needs a second row, not a squeeze.
    assert.ok(section[1].components.length <= 5);
  });

  it('Msg Category survives on both surfaces after leaving the shared row', () => {
    // Season Manager tab: its own row under the shared section.
    const viewSource = readFileSync(
      path.join(__dirname, '..', 'src', 'channels', 'channelsView.js'), 'utf8');
    assert.ok(/channels_msg_\$\{configId\}/.test(viewSource),
      'the Channels tab lost its Msg Category button');
    // Premium: hardcoded in 📢 Player Engagement, gated like the Channels section.
    const menuSource = readFileSync(MENU_BUILDER_JS, 'utf8');
    const premiumSection = menuSource.slice(menuSource.search(PREMIUM_DEF), menuSource.indexOf('static buildReecesStuffMenu'));
    assert.ok(premiumSection.includes('Player Engagement'), 'Premium menu lost the 📢 Player Engagement section');
    assert.ok(/channels_msg_\$\{channelsConfigId\}/.test(premiumSection),
      'Premium menu lost Msg Category from Player Engagement');
  });

  it('the Season Manager tab renders the SAME builder (no forked copy)', async () => {
    const viewSource = readFileSync(
      path.join(__dirname, '..', 'src', 'channels', 'channelsView.js'), 'utf8');
    assert.ok(/\.\.\.buildChannelsSection\(configId\)/.test(viewSource),
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
