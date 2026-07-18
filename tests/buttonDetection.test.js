/**
 * Tests for the registry-driven deploy-notification buttons (2026-07-18 refresh).
 *
 * RATCHET: every custom_id the restart card can ship must resolve against the REAL
 * BUTTON_REGISTRY — this is what stops the deploy card drifting back into deprecated
 * ids and stale hand-written labels (season_management_menu shipped for months).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeploymentButtons,
  detectAffectedFeatures,
  validateButton,
  resolveRegistryEntry,
  toButton,
  SAFE_TEST_BUTTONS
} from '../scripts/buttonDetection.js';

describe('buttonDetection — registry ratchet', () => {
  it('every SAFE_TEST_BUTTONS entry resolves to a live BUTTON_REGISTRY entry', () => {
    for (const [feature, { custom_id }] of Object.entries(SAFE_TEST_BUTTONS)) {
      assert.ok(resolveRegistryEntry(custom_id),
        `feature '${feature}' points at '${custom_id}' which has no BUTTON_REGISTRY entry (exact or _* wildcard) — stale id?`);
    }
  });

  it('the standard card buttons resolve too', () => {
    for (const id of ['restart_status_passed', 'restart_status_failed', 'moai_ask_msg', 'viral_menu']) {
      assert.ok(resolveRegistryEntry(id), `'${id}' missing from BUTTON_REGISTRY`);
    }
  });

  it('the deprecated season_management_menu is no longer shipped', () => {
    const ids = Object.values(SAFE_TEST_BUTTONS).map(b => b.custom_id);
    assert.ok(!ids.includes('season_management_menu'));
  });
});

describe('buttonDetection — toButton (registry-resolved metadata)', () => {
  it('pulls label/emoji/style from the registry and never doubles the emoji', () => {
    const b = toButton('viral_menu'); // registry label is "📋 Open Prod Menu" + emoji 📋
    assert.equal(b.custom_id, 'viral_menu');
    assert.equal(b.emoji.name, '📋');
    assert.ok(!b.label.includes('📋'), `label '${b.label}' still contains the emoji`);
    assert.ok(validateButton(b));
  });

  it('resolves wildcard registry entries (show_castlist2_default → show_castlist2_*)', () => {
    const b = toButton('show_castlist2_default');
    assert.ok(b);
    assert.equal(b.custom_id, 'show_castlist2_default');
  });

  it('returns null for an id with no registry entry', () => {
    assert.equal(toButton('definitely_not_a_real_button_xyz'), null);
  });
});

describe('buttonDetection — generateDeploymentButtons', () => {
  it('always ends with Pass/Fail and stays within the 5-button row limit', () => {
    const buttons = generateDeploymentButtons('safariManager.js,castlistV2.js,app.js', 'Safari and castlist fix');
    assert.ok(buttons.length <= 5);
    const ids = buttons.map(b => b.custom_id);
    assert.ok(ids.includes('restart_status_passed'));
    assert.ok(ids.includes('restart_status_failed'));
    for (const b of buttons) assert.ok(validateButton(b));
  });

  it('dedupes features that share an entry point (applications + season_planner → one season_manager)', () => {
    const features = detectAffectedFeatures('applicationManager.js', 'season planner apps fix');
    assert.ok(features.has('applications'));
    const buttons = generateDeploymentButtons('applicationManager.js', 'season planner apps fix');
    const seasonManagerCount = buttons.filter(b => b.custom_id === 'season_manager').length;
    assert.equal(seasonManagerCount, 1);
  });

  it('falls back to the menu button when no features are detected', () => {
    const buttons = generateDeploymentButtons('README.md', 'docs only');
    assert.ok(buttons.some(b => b.custom_id === 'viral_menu'));
  });
});
