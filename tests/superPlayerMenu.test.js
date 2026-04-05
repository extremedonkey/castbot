/**
 * Tests for Super Player Menu — unified 3-section player/admin menu
 * Pure logic replicated inline to avoid importing heavy modules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate calculateVisibility logic
// ─────────────────────────────────────────────

function calculateVisibility(guildId, targetUserId, playerData, safariData, mode) {
  const isAdmin = mode === 'admin';
  const hasTarget = !!targetUserId;
  const guildData = playerData?.[guildId] || {};
  const safariGuild = safariData?.[guildId] || {};
  const safari = guildData?.players?.[targetUserId]?.safari;
  const isInitialized = safari?.points !== undefined;
  const hasMap = safari?.mapProgress && Object.keys(safari.mapProgress).length > 0;
  const currentLocation = hasMap ? Object.values(safari.mapProgress)[0]?.currentLocation : null;

  const safariConfig = safariGuild?.safariConfig || {};
  const allButtons = safariGuild?.buttons || {};

  const hasCastlists = true; // every server has default
  const hasPronouns = Object.keys(guildData?.pronouns || {}).length > 0;
  const hasTimezones = Object.keys(guildData?.timezones || {}).length > 0;

  const hasCrafting = Object.values(allButtons).some(a =>
    (a.menuVisibility === 'crafting_menu') && ['button', 'button_modal', 'button_input'].includes(a.trigger?.type || 'button')
  );
  const hasActions = Object.values(allButtons).some(a => {
    const vis = a.menuVisibility || (a.showInInventory ? 'player_menu' : 'none');
    return vis === 'player_menu' && ['button', 'button_modal', 'button_input'].includes(a.trigger?.type || 'button');
  });

  const globalStoreIds = safariGuild?.globalStores || [];
  const storeMode = safariConfig?.globalStoresVisibilityMode || 'standard';
  let hasStores = false;
  if (storeMode === 'always') hasStores = globalStoreIds.length > 0;
  else if (storeMode === 'never') hasStores = false;
  else if (storeMode === 'initialized_only') hasStores = isInitialized && globalStoreIds.length > 0;
  else hasStores = isInitialized && globalStoreIds.length > 0;

  const hasChallenges = Object.values(guildData?.challenges || {}).some(ch => {
    const ids = ch.actionIds || [];
    return ids.length > 0;
  });

  const hasAttributes = Object.keys(safariGuild?.attributes || {}).length > 0;
  const hasCommands = safariConfig?.enableGlobalCommands === true;

  const inventoryMode = safariConfig?.inventoryVisibilityMode || 'always';
  let showInventory = false;
  if (inventoryMode === 'always') showInventory = true;
  else if (inventoryMode === 'never') showInventory = false;
  else if (inventoryMode === 'initialized_only') showInventory = isInitialized;
  else showInventory = isInitialized;

  return {
    castlists:  { show: hasCastlists, disabled: !hasTarget && isAdmin },
    pronouns:   { show: hasPronouns || !isAdmin, disabled: !hasTarget && isAdmin },
    timezone:   { show: hasTimezones || !isAdmin, disabled: !hasTarget && isAdmin },
    age:        { show: true, disabled: !hasTarget && isAdmin },
    inventory:  { show: showInventory, disabled: !hasTarget && isAdmin },
    challenges: { show: hasChallenges, disabled: !hasTarget && isAdmin },
    crafting:   { show: hasCrafting, disabled: !hasTarget && isAdmin },
    actions:    { show: hasActions, disabled: !hasTarget && isAdmin },
    stores:     { show: hasStores, disabled: !hasTarget && isAdmin },
    stats:      { show: hasAttributes, disabled: !hasTarget && isAdmin },
    commands:   { show: hasCommands, disabled: !hasTarget && isAdmin },
    vanity:     { show: isAdmin, disabled: !hasTarget && isAdmin },
    navigate:   { show: !isAdmin && isInitialized && !!currentLocation, disabled: false },
  };
}

// ─────────────────────────────────────────────
// Replicate buildSectionRow logic
// ─────────────────────────────────────────────

function buildSectionRow(buttons, targetUserId, activeCategory, visibility, mode) {
  const prefix = mode === 'admin' ? 'admin' : 'player';
  const userIdPart = mode === 'admin' && targetUserId ? `_${targetUserId}` : '';
  const IMMEDIATE_NEW = new Set(['inventory', 'navigate', 'commands']);

  const components = [];
  for (const btn of buttons) {
    const vis = visibility[btn.id];
    if (!vis || !vis.show) continue;

    let customId;
    if (btn.id === 'inventory') customId = 'safari_player_inventory';
    else if (btn.id === 'navigate') customId = `safari_navigate_${targetUserId}_LOC`;
    else if (btn.id === 'commands') customId = 'player_enter_command_global';
    else if (btn.id === 'vanity') customId = `admin_manage_vanity${userIdPart}`;
    else customId = `${prefix}_set_${btn.id}${userIdPart}`;

    components.push({
      type: 2,
      custom_id: customId,
      label: btn.label,
      style: activeCategory === btn.id ? 1 : 2,
      emoji: { name: btn.emoji },
      disabled: vis.disabled,
    });
  }

  if (components.length === 0) return null;
  return { type: 1, components };
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SECTION1 = [
  { id: 'castlists', label: 'Castlists', emoji: '📋' },
  { id: 'pronouns',  label: 'Pronouns',  emoji: '💜' },
  { id: 'timezone',  label: 'Timezone',  emoji: '🌍' },
  { id: 'age',       label: 'Age',       emoji: '🎂' },
];

const SECTION2 = [
  { id: 'inventory',  label: 'Inventory',  emoji: '🎒' },
  { id: 'challenges', label: 'Challenges', emoji: '🏃' },
  { id: 'crafting',   label: 'Crafting',   emoji: '🛠️' },
  { id: 'actions',    label: 'Actions',    emoji: '⚡' },
  { id: 'stores',     label: 'Stores',     emoji: '🏪' },
];

const SECTION3 = [
  { id: 'stats',    label: 'Stats',    emoji: '📊' },
  { id: 'commands', label: 'Commands', emoji: '🕹️' },
  { id: 'vanity',   label: 'Vanity',   emoji: '🎭' },
  { id: 'navigate', label: 'Navigate', emoji: '🗺️' },
];

// ─────────────────────────────────────────────
// Tests — calculateVisibility
// ─────────────────────────────────────────────

describe('calculateVisibility — button visibility logic', () => {
  const basePlayerData = {
    guild1: {
      players: { user1: { safari: { points: { stamina: {} }, mapProgress: { map1: { currentLocation: 'A1' } } } } },
      challenges: { ch1: { actionIds: ['a1'] } },
      pronouns: { role1: {} },
      timezones: { role2: { offset: 0 } },
    }
  };
  const baseSafariData = {
    guild1: {
      buttons: {
        craft1: { menuVisibility: 'crafting_menu', trigger: { type: 'button' } },
        action1: { menuVisibility: 'player_menu', trigger: { type: 'button' } },
      },
      globalStores: ['store1'],
      stores: { store1: { name: 'Shop' } },
      attributes: { hp: { name: 'HP' } },
      safariConfig: { enableGlobalCommands: true, globalStoresVisibilityMode: 'always', inventoryVisibilityMode: 'always' },
    }
  };

  it('player mode with all features configured — all buttons visible', () => {
    const vis = calculateVisibility('guild1', 'user1', basePlayerData, baseSafariData, 'player');
    assert.equal(vis.castlists.show, true);
    assert.equal(vis.pronouns.show, true);
    assert.equal(vis.challenges.show, true);
    assert.equal(vis.crafting.show, true);
    assert.equal(vis.actions.show, true);
    assert.equal(vis.stores.show, true);
    assert.equal(vis.stats.show, true);
    assert.equal(vis.commands.show, true);
    assert.equal(vis.navigate.show, true);
    assert.equal(vis.vanity.show, false); // player never sees vanity
  });

  it('admin mode with no player selected — buttons greyed, not hidden', () => {
    const vis = calculateVisibility('guild1', null, basePlayerData, baseSafariData, 'admin');
    assert.equal(vis.castlists.show, true);
    assert.equal(vis.castlists.disabled, true);
    assert.equal(vis.crafting.show, true);
    assert.equal(vis.crafting.disabled, true);
    assert.equal(vis.vanity.show, true);
    assert.equal(vis.vanity.disabled, true);
  });

  it('admin mode with player selected — buttons enabled', () => {
    const vis = calculateVisibility('guild1', 'user1', basePlayerData, baseSafariData, 'admin');
    assert.equal(vis.castlists.disabled, false);
    assert.equal(vis.stats.disabled, false);
    assert.equal(vis.vanity.show, true);
    assert.equal(vis.vanity.disabled, false);
  });

  it('empty server — no safari features show', () => {
    const emptyPD = { guild1: { players: {} } };
    const emptySafari = { guild1: { buttons: {}, safariConfig: {} } };
    const vis = calculateVisibility('guild1', 'user1', emptyPD, emptySafari, 'player');
    assert.equal(vis.crafting.show, false);
    assert.equal(vis.actions.show, false);
    assert.equal(vis.stores.show, false);
    assert.equal(vis.stats.show, false);
    assert.equal(vis.commands.show, false);
    assert.equal(vis.challenges.show, false);
    assert.equal(vis.navigate.show, false);
    // Always visible:
    assert.equal(vis.castlists.show, true);
    assert.equal(vis.age.show, true);
  });

  it('admin empty server — features hidden not greyed', () => {
    const emptyPD = { guild1: { players: {} } };
    const emptySafari = { guild1: { buttons: {}, safariConfig: {} } };
    const vis = calculateVisibility('guild1', null, emptyPD, emptySafari, 'admin');
    assert.equal(vis.crafting.show, false); // no crafting configured → hide
    assert.equal(vis.actions.show, false);
    assert.equal(vis.castlists.show, true); // always exists
    assert.equal(vis.castlists.disabled, true); // greyed — no player selected
  });

  it('inventory visibility modes', () => {
    const pd = { guild1: { players: { u1: { safari: { points: {} } } } } };

    const alwaysSafari = { guild1: { safariConfig: { inventoryVisibilityMode: 'always' } } };
    assert.equal(calculateVisibility('guild1', 'u1', pd, alwaysSafari, 'player').inventory.show, true);

    const neverSafari = { guild1: { safariConfig: { inventoryVisibilityMode: 'never' } } };
    assert.equal(calculateVisibility('guild1', 'u1', pd, neverSafari, 'player').inventory.show, false);

    const initSafari = { guild1: { safariConfig: { inventoryVisibilityMode: 'initialized_only' } } };
    assert.equal(calculateVisibility('guild1', 'u1', pd, initSafari, 'player').inventory.show, true);
    assert.equal(calculateVisibility('guild1', 'no_safari', pd, initSafari, 'player').inventory.show, false);
  });
});

// ─────────────────────────────────────────────
// Tests — buildSectionRow
// ─────────────────────────────────────────────

describe('buildSectionRow — conditional button rendering', () => {
  const allVisible = {
    castlists: { show: true, disabled: false },
    pronouns: { show: true, disabled: false },
    timezone: { show: true, disabled: false },
    age: { show: true, disabled: false },
  };

  it('renders all visible buttons', () => {
    const row = buildSectionRow(SECTION1, 'user1', null, allVisible, 'player');
    assert.equal(row.type, 1); // ActionRow
    assert.equal(row.components.length, 4);
  });

  it('hides buttons where show=false', () => {
    const partial = { ...allVisible, pronouns: { show: false }, timezone: { show: false } };
    const row = buildSectionRow(SECTION1, 'user1', null, partial, 'player');
    assert.equal(row.components.length, 2); // only castlists + age
  });

  it('returns null when no buttons visible', () => {
    const none = {
      castlists: { show: false }, pronouns: { show: false },
      timezone: { show: false }, age: { show: false },
    };
    const row = buildSectionRow(SECTION1, 'user1', null, none, 'player');
    assert.equal(row, null);
  });

  it('active button gets Primary style (1)', () => {
    const row = buildSectionRow(SECTION1, 'user1', 'pronouns', allVisible, 'player');
    const pronounsBtn = row.components.find(c => c.custom_id === 'player_set_pronouns');
    const castlistsBtn = row.components.find(c => c.custom_id === 'player_set_castlists');
    assert.equal(pronounsBtn.style, 1); // Primary
    assert.equal(castlistsBtn.style, 2); // Secondary
  });

  it('disabled buttons have disabled:true', () => {
    const greyed = { ...allVisible, castlists: { show: true, disabled: true } };
    const row = buildSectionRow(SECTION1, 'user1', null, greyed, 'player');
    const btn = row.components.find(c => c.custom_id === 'player_set_castlists');
    assert.equal(btn.disabled, true);
  });

  it('admin mode adds userId suffix', () => {
    const row = buildSectionRow(SECTION1, 'user123', null, allVisible, 'admin');
    const btn = row.components.find(c => c.label === 'Pronouns');
    assert.equal(btn.custom_id, 'admin_set_pronouns_user123');
  });

  it('player mode has no userId suffix', () => {
    const row = buildSectionRow(SECTION1, 'user123', null, allVisible, 'player');
    const btn = row.components.find(c => c.label === 'Pronouns');
    assert.equal(btn.custom_id, 'player_set_pronouns');
  });

  it('inventory uses safari_player_inventory custom_id', () => {
    const vis = { inventory: { show: true, disabled: false } };
    const row = buildSectionRow([{ id: 'inventory', label: 'Bag', emoji: '🎒' }], 'u1', null, vis, 'player');
    assert.equal(row.components[0].custom_id, 'safari_player_inventory');
  });

  it('commands uses player_enter_command_global custom_id', () => {
    const vis = { commands: { show: true, disabled: false } };
    const row = buildSectionRow([{ id: 'commands', label: 'Commands', emoji: '🕹️' }], 'u1', null, vis, 'player');
    assert.equal(row.components[0].custom_id, 'player_enter_command_global');
  });

  it('vanity uses admin_manage_vanity custom_id', () => {
    const vis = { vanity: { show: true, disabled: false } };
    const row = buildSectionRow([{ id: 'vanity', label: 'Vanity', emoji: '🎭' }], 'u1', null, vis, 'admin');
    assert.equal(row.components[0].custom_id, 'admin_manage_vanity_u1');
  });

  it('section 2 with mixed visibility', () => {
    const vis = {
      inventory: { show: true, disabled: false },
      challenges: { show: true, disabled: false },
      crafting: { show: false },
      actions: { show: true, disabled: false },
      stores: { show: false },
    };
    const row = buildSectionRow(SECTION2, 'u1', null, vis, 'player');
    assert.equal(row.components.length, 3); // inventory + challenges + actions
  });
});

// ─────────────────────────────────────────────
// Tests — ≥25 error handling pattern
// ─────────────────────────────────────────────

describe('≥25 error handling — select option capping', () => {
  function capOptions(items, maxSlots = 24) {
    const options = [];
    for (let i = 0; i < Math.min(items.length, maxSlots); i++) {
      options.push({ label: items[i], value: `item_${i}` });
    }
    if (items.length >= 25) {
      options.push({ label: '❌ Max items shown', value: '_error_max', description: `Only showing ${maxSlots} most recent` });
    }
    return options;
  }

  it('under 25 items — no error option', () => {
    const items = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
    const options = capOptions(items);
    assert.equal(options.length, 10);
    assert.ok(!options.some(o => o.value === '_error_max'));
  });

  it('exactly 25 items — error option added', () => {
    const items = Array.from({ length: 25 }, (_, i) => `Item ${i}`);
    const options = capOptions(items);
    assert.equal(options.length, 25); // 24 items + 1 error
    assert.equal(options[24].value, '_error_max');
  });

  it('over 25 items — capped at 24 + error', () => {
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i}`);
    const options = capOptions(items);
    assert.equal(options.length, 25);
    assert.equal(options[24].label, '❌ Max items shown');
  });
});

// ─────────────────────────────────────────────
// Tests — Component budget estimates
// ─────────────────────────────────────────────

describe('Component budget — estimates under 40', () => {
  // Simulate component counting for different states
  function estimateComponents(options) {
    const { isAdmin, hasTarget, hasStats, activeCategory, section2Count, section3Count } = options;
    let count = 1; // container

    // Header
    count += 1; // TextDisplay

    // Admin user select
    if (isAdmin) count += 3; // separator + actionrow + userselect

    // Player info
    if (hasTarget) count += 4; // separator + section + thumbnail + textdisplay

    // Separator before sections
    count += 1;

    // Section 1 (always 4 buttons)
    count += 1 + 1 + 4; // heading + actionrow + 4 buttons

    // Section 2 (conditional)
    if (section2Count > 0) count += 1 + 1 + section2Count; // heading + actionrow + N buttons

    // Section 3 (conditional)
    if (section3Count > 0) count += 1 + 1 + section3Count; // heading + actionrow + N buttons

    // Separator + hot-swap select
    count += 1 + 1 + 1; // separator + actionrow + select

    // Stats display (conditional)
    if (activeCategory === 'stats' && hasStats) count += 1; // TextDisplay

    // Separator + footer
    count += 1; // separator
    const footerButtons = (isAdmin ? 1 : 0) + (hasTarget ? 2 : 0);
    if (footerButtons > 0) count += 1 + footerButtons; // actionrow + buttons

    return count;
  }

  it('admin + player selected + stats active < 40', () => {
    const count = estimateComponents({ isAdmin: true, hasTarget: true, hasStats: true, activeCategory: 'stats', section2Count: 5, section3Count: 4 });
    assert.ok(count <= 40, `Expected ≤40, got ${count}`);
  });

  it('admin + no player selected < 40', () => {
    const count = estimateComponents({ isAdmin: true, hasTarget: false, hasStats: false, activeCategory: null, section2Count: 5, section3Count: 3 });
    assert.ok(count <= 40, `Expected ≤40, got ${count}`);
  });

  it('player + all features + no active < 40', () => {
    const count = estimateComponents({ isAdmin: false, hasTarget: true, hasStats: false, activeCategory: null, section2Count: 5, section3Count: 3 });
    assert.ok(count <= 40, `Expected ≤40, got ${count}`);
  });

  it('player + stats active < 40', () => {
    const count = estimateComponents({ isAdmin: false, hasTarget: true, hasStats: true, activeCategory: 'stats', section2Count: 5, section3Count: 3 });
    assert.ok(count <= 40, `Expected ≤40, got ${count}`);
  });

  it('minimal server (no safari features) < 40', () => {
    const count = estimateComponents({ isAdmin: false, hasTarget: true, hasStats: false, activeCategory: null, section2Count: 0, section3Count: 0 });
    assert.ok(count <= 40, `Expected ≤40, got ${count}`);
    assert.ok(count <= 25, `Expected ≤25 for minimal, got ${count}`);
  });
});
