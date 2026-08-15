/**
 * Settings → Player Menu — the Checkbox Group toggles (2026-08-15).
 *
 * One Checkbox Group (type 22) now carries ALL boolean player-menu toggles: Enter Command,
 * Custom Castlists, CastDock, Alliance Requests. It replaced the two boolean String Selects
 * so the modal stays under Discord's 5-component cap (the conditional Global Store select was
 * already the 5th).
 *
 * THE trap this file pins: the ASYMMETRIC defaults for a server that has NEVER saved the
 * modal — CastDock/Commands/Castlists default ON (`!== false`), Alliances defaults OFF
 * (`=== true`). Getting one backwards either paints an unwanted Alliance button across 190+
 * guilds or silently removes CastDock everywhere.
 *
 * Pure logic replicated inline from app.js (modal builder + safari_player_menu_config_modal
 * submit) and playerManagement.js (vis gating) — TestingStandards.md convention.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicas ─────────────────────────────────────────────────────────────────

/** app.js modal builder: which checkbox options render pre-checked for a given config. */
function preChecked(safariConfig = {}) {
  const currentEnabled = safariConfig.enableGlobalCommands !== false;
  const currentShowCustomCastlists = safariConfig.showCustomCastlists !== false;
  const currentShowCastDock = safariConfig.showCastDock !== false;
  const currentShowAlliance = safariConfig.showAllianceButton === true;
  return [
    { value: 'commands', ...(currentEnabled ? { default: true } : {}) },
    { value: 'custom_castlists', ...(currentShowCustomCastlists ? { default: true } : {}) },
    { value: 'castdock', ...(currentShowCastDock ? { default: true } : {}) },
    { value: 'alliance', ...(currentShowAlliance ? { default: true } : {}) }
  ];
}
const checkedValues = (opts) => opts.filter((o) => o.default === true).map((o) => o.value);

/** app.js modal submit: apply the group to safariConfig. menuToggles === null ⇢ group absent
 *  (stale legacy modal) — the new keys must NOT be written. */
function applySubmit(menuToggles, safariConfig, legacy = {}) {
  let enableGlobalCommands = legacy.enableGlobalCommands ?? false;
  let showCustomCastlists = legacy.showCustomCastlists ?? true;
  if (menuToggles !== null) {
    enableGlobalCommands = menuToggles.includes('commands');
    showCustomCastlists = menuToggles.includes('custom_castlists');
  }
  safariConfig.enableGlobalCommands = enableGlobalCommands;
  safariConfig.showCustomCastlists = showCustomCastlists;
  if (menuToggles !== null) {
    safariConfig.showCastDock = menuToggles.includes('castdock');
    safariConfig.showAllianceButton = menuToggles.includes('alliance');
  }
  return safariConfig;
}

/** playerManagement.js vis gating. */
const visCastDock = (safariConfig = {}) => safariConfig.showCastDock !== false;
const visAlliance = (safariConfig = {}, onWhitelist = true, isAdmin = false) =>
  !isAdmin && safariConfig.showAllianceButton === true && onWhitelist;

// ── The asymmetric defaults ──────────────────────────────────────────────────

describe('Player Menu toggles — defaults for a server with NO stored setting', () => {
  it('unset config pre-checks commands, castlists, castdock — NOT alliance', () => {
    assert.deepEqual(checkedValues(preChecked({})), ['commands', 'custom_castlists', 'castdock']);
  });

  it('an entirely absent safariConfig behaves the same', () => {
    assert.deepEqual(checkedValues(preChecked(undefined ?? {})), ['commands', 'custom_castlists', 'castdock']);
  });

  it('unchecked options OMIT the default key — never an explicit default:false', () => {
    for (const opt of preChecked({})) {
      if (!checkedValues(preChecked({})).includes(opt.value)) {
        assert.ok(!('default' in opt), `${opt.value} must omit default, not set it false`);
      }
    }
  });

  it('CastDock hides ONLY on an explicit false', () => {
    assert.equal(visCastDock({}), true, 'unset ⇢ shown');
    assert.equal(visCastDock({ showCastDock: true }), true);
    assert.equal(visCastDock({ showCastDock: false }), false);
    assert.equal(visCastDock({ showCastDock: undefined }), true);
    assert.equal(visCastDock({ showCastDock: null }), true, 'null is not an opt-out');
  });

  it('Alliance shows ONLY on an explicit true', () => {
    assert.equal(visAlliance({}), false, 'unset ⇢ hidden — the default-OFF requirement');
    assert.equal(visAlliance({ showAllianceButton: true }), true);
    assert.equal(visAlliance({ showAllianceButton: false }), false);
    assert.equal(visAlliance({ showAllianceButton: 'yes' }), false, 'truthy junk is not true');
  });

  it('Alliance still requires the request whitelist and player mode', () => {
    const on = { showAllianceButton: true };
    assert.equal(visAlliance(on, false), false, 'setting alone must not bypass the whitelist');
    assert.equal(visAlliance(on, true, true), false, 'admin mode never shows the request button');
  });
});

// ── Round trips ──────────────────────────────────────────────────────────────

describe('Player Menu toggles — submit round trip', () => {
  it('all ticked stores all four true', () => {
    const cfg = applySubmit(['commands', 'custom_castlists', 'castdock', 'alliance'], {});
    assert.deepEqual(cfg, {
      enableGlobalCommands: true, showCustomCastlists: true,
      showCastDock: true, showAllianceButton: true
    });
  });

  it('all unticked stores all four false — including CastDock (deliberate opt-out)', () => {
    const cfg = applySubmit([], {});
    assert.deepEqual(cfg, {
      enableGlobalCommands: false, showCustomCastlists: false,
      showCastDock: false, showAllianceButton: false
    });
    assert.equal(visCastDock(cfg), false);
  });

  it('what you save is what re-renders checked (round trip through preChecked)', () => {
    for (const ticks of [[], ['castdock'], ['alliance'], ['commands', 'alliance'], ['commands', 'custom_castlists', 'castdock', 'alliance']]) {
      const cfg = applySubmit([...ticks], {});
      assert.deepEqual(checkedValues(preChecked(cfg)).sort(), [...ticks].sort(), `ticks: [${ticks}]`);
    }
  });

  it('a STALE legacy modal (no checkbox group) leaves the new keys untouched', () => {
    // Regression guard: a modal opened pre-deploy submits string selects only. Deriving the
    // toggles from an absent group would flip CastDock off for the whole server.
    const cfg = applySubmit(null, {}, { enableGlobalCommands: true, showCustomCastlists: false });
    assert.equal(cfg.enableGlobalCommands, true, 'legacy select value still honoured');
    assert.equal(cfg.showCustomCastlists, false);
    assert.ok(!('showCastDock' in cfg), 'CastDock key must not be written');
    assert.ok(!('showAllianceButton' in cfg), 'Alliance key must not be written');
    assert.equal(visCastDock(cfg), true, 'CastDock stays at its default (shown)');
    assert.equal(visAlliance(cfg), false, 'Alliance stays at its default (hidden)');
  });

  it('enabling alliances on one save then unticking on the next actually disables them', () => {
    const cfg = applySubmit(['commands', 'custom_castlists', 'castdock', 'alliance'], {});
    assert.equal(visAlliance(cfg), true);
    applySubmit(['commands', 'custom_castlists', 'castdock'], cfg);
    assert.equal(visAlliance(cfg), false);
    assert.equal(cfg.showAllianceButton, false, 'stored as explicit false, not deleted');
  });
});
