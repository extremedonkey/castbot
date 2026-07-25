/**
 * mapNavigationUI.test.js - Safari Navigate panel 3-way behavior (owner / non-admin / Production)
 *
 * mapNavigationUI.js is deliberately import-free, so these tests exercise the REAL builders
 * (no inline replication needed). Also replicates the app.js branch/parsing logic inline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNavigateDenialUI,
  buildAdminNavPanelWarningUI,
  buildNavPanelDeleteResultUI,
  NAV_DELETE_PANEL_PREFIX
} from '../mapNavigationUI.js';

const IS_COMPONENTS_V2 = 1 << 15;
const MANAGE_ROLES = 1n << 28n;

// Replicated from app.js safari_navigate_ handler (custom_id parse + admin branch)
function parseNavigateCustomId(customId) {
  const parts = customId.split('_');
  return { targetUserId: parts[2], coordinate: parts[3] };
}
function isProductionMember(permissions) {
  return !!(permissions && (BigInt(permissions) & MANAGE_ROLES) !== 0n);
}
// Replicated from app.js safari_nav_delete_panel_ handler
function parseDeletePanelCustomId(customId) {
  return customId.replace('safari_nav_delete_panel_', '');
}

// Shared Components V2 invariants (ComponentsV2.md / ComponentsV2Issues.md)
function assertValidV2NewMessage(response) {
  assert.equal(response.content, undefined, 'must not use top-level content with IS_COMPONENTS_V2');
  assert.ok(response.flags & IS_COMPONENTS_V2, 'must set IS_COMPONENTS_V2 flag');
  assert.equal(response.components[0].type, 17, 'top-level component must be a Container');
  assert.equal(response.ephemeral, true, 'non-owner responses must stay ephemeral');
}
function countComponentsDeep(components) {
  let count = 0;
  for (const c of components || []) {
    count += 1 + countComponentsDeep(c.components);
    if (c.accessory) count += 1;
  }
  return count;
}

describe('Navigate custom_id parsing', () => {
  it('extracts target user and coordinate', () => {
    const { targetUserId, coordinate } = parseNavigateCustomId('safari_navigate_689666699917787187_C2');
    assert.equal(targetUserId, '689666699917787187');
    assert.equal(coordinate, 'C2');
  });

  it('delete-panel custom_id round-trips through the shared prefix', () => {
    const customId = `${NAV_DELETE_PANEL_PREFIX}1530364360713830400`;
    assert.equal(parseDeletePanelCustomId(customId), '1530364360713830400');
  });

  it('delete-panel custom_id does NOT collide with the safari_navigate_ prefix', () => {
    assert.equal(`${NAV_DELETE_PANEL_PREFIX}123`.startsWith('safari_navigate_'), false);
  });
});

describe('Production-member branch check', () => {
  it('detects ManageRoles in a permission bitfield string', () => {
    assert.equal(isProductionMember(String(1n << 28n)), true);
    assert.equal(isProductionMember(String((1n << 28n) | (1n << 3n))), true);
  });

  it('rejects members without ManageRoles and missing permissions', () => {
    assert.equal(isProductionMember(String(1n << 3n)), false); // Administrator alone isn't the gate here
    assert.equal(isProductionMember(undefined), false);
    assert.equal(isProductionMember(''), false);
  });
});

describe('buildNavigateDenialUI — non-admin clicking another player\'s panel', () => {
  const ui = buildNavigateDenialUI();

  it('is a valid ephemeral Components V2 message', () => {
    assertValidV2NewMessage(ui);
  });

  it('keeps the rejection line and adds the Explore redirect', () => {
    const text = ui.components[0].components[0];
    assert.equal(text.type, 10);
    assert.match(text.content, /This navigation panel is for another player/);
    assert.match(text.content, /Explore/);
    assert.match(text.content, /Navigate/);
  });

  it('has no buttons (players get guidance, not actions)', () => {
    const actionRows = ui.components[0].components.filter(c => c.type === 1);
    assert.equal(actionRows.length, 0);
  });
});

describe('buildAdminNavPanelWarningUI — Production clicking another player\'s panel', () => {
  const ui = buildAdminNavPanelWarningUI('689666699917787187', '1530364360713830400', 'E4');

  it('is a valid ephemeral Components V2 message with warning accent', () => {
    assertValidV2NewMessage(ui);
    assert.equal(ui.components[0].accent_color, 0xf39c12);
  });

  it('carries the exact warning copy', () => {
    const text = ui.components[0].components[0].content;
    assert.match(text, /⚠️ This navigation panel is for a player to change locations\. Do not remove this unless the player has clearly left this channel and moved to another location\./);
  });

  it('shows the panel owner and their live location', () => {
    const text = ui.components[0].components[0].content;
    assert.match(text, /<@689666699917787187>/);
    assert.match(text, /currently at \*\*E4\*\*/);
  });

  it('reports de-initialized owners as off the map', () => {
    const offMap = buildAdminNavPanelWarningUI('1086246253819613274', '111', null);
    assert.match(offMap.components[0].components[0].content, /not currently on the map/);
  });

  it('has a separator above a single red Delete Panel button targeting the clicked message', () => {
    const inner = ui.components[0].components;
    const rowIndex = inner.findIndex(c => c.type === 1);
    assert.ok(rowIndex > 0, 'action row present');
    assert.equal(inner[rowIndex - 1].type, 14, 'separator must precede the action row (LeanUI)');
    const row = inner[rowIndex];
    assert.equal(row.components.length, 1);
    const button = row.components[0];
    assert.equal(button.type, 2);
    assert.equal(button.style, 4, 'Delete Panel must be Danger red');
    assert.equal(button.emoji.name, '🗑️');
    assert.equal(button.custom_id, 'safari_nav_delete_panel_1530364360713830400');
  });

  it('stays far below the 40-component limit', () => {
    assert.ok(countComponentsDeep(ui.components) <= 40);
  });
});

describe('buildNavPanelDeleteResultUI — UPDATE_MESSAGE after Delete Panel', () => {
  it('never carries flags (UPDATE_MESSAGE inherits from the original message)', () => {
    assert.equal(buildNavPanelDeleteResultUI(true).flags, undefined);
    assert.equal(buildNavPanelDeleteResultUI(false).flags, undefined);
  });

  it('returns a full Container (not bare content) for both outcomes', () => {
    for (const deleted of [true, false]) {
      const ui = buildNavPanelDeleteResultUI(deleted);
      assert.equal(ui.content, undefined);
      assert.equal(ui.components[0].type, 17);
      assert.equal(ui.components[0].components[0].type, 10);
    }
  });

  it('distinguishes success from already-gone', () => {
    assert.match(buildNavPanelDeleteResultUI(true).components[0].components[0].content, /✅/);
    assert.equal(buildNavPanelDeleteResultUI(true).components[0].accent_color, 0x27ae60);
    assert.match(buildNavPanelDeleteResultUI(false).components[0].components[0].content, /already been removed/);
    assert.equal(buildNavPanelDeleteResultUI(false).components[0].accent_color, 0xe74c3c);
  });
});
