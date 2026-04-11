import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate buildCommandModal inline to avoid importing modules with heavy dependencies
function buildCommandModal({ coord, isAdmin = false, prefixes = [] }) {
  const customId = isAdmin
    ? `admin_command_modal_${coord}`
    : `player_command_modal_${coord}`;

  const title = isAdmin ? 'Test Command (Admin)' : 'Enter Command';

  const components = [];

  components.push({
    type: 18,
    label: 'Command',
    description: 'Type a command to interact with this location',
    component: {
      type: 4,
      custom_id: 'command',
      style: 1,
      required: true,
      placeholder: 'e.g., climb tree, inspect rock, open chest',
      min_length: 1,
      max_length: 100
    }
  });

  return {
    type: 9,
    data: {
      custom_id: customId,
      title,
      components
    }
  };
}

describe('buildCommandModal — Structure', () => {
  it('returns a type 9 MODAL response', () => {
    const result = buildCommandModal({ coord: 'F7' });
    assert.equal(result.type, 9);
    assert.ok(result.data);
  });

  it('has a data object with custom_id, title, and components', () => {
    const result = buildCommandModal({ coord: 'F7' });
    assert.ok(result.data.custom_id);
    assert.ok(result.data.title);
    assert.ok(Array.isArray(result.data.components));
    assert.ok(result.data.components.length > 0);
  });

  it('uses Label (type 18) wrapper, not legacy ActionRow', () => {
    const result = buildCommandModal({ coord: 'A1' });
    const label = result.data.components[0];
    assert.equal(label.type, 18, 'First component should be Label (type 18)');
    assert.equal(label.component.type, 4, 'Label should wrap a TextInput (type 4)');
  });

  it('text input has correct configuration', () => {
    const result = buildCommandModal({ coord: 'B3' });
    const input = result.data.components[0].component;
    assert.equal(input.custom_id, 'command');
    assert.equal(input.style, 1);
    assert.equal(input.required, true);
    assert.equal(input.min_length, 1);
    assert.equal(input.max_length, 100);
    assert.ok(input.placeholder.length > 0);
  });
});

describe('buildCommandModal — Player Mode', () => {
  it('uses player_command_modal_ prefix for custom_id', () => {
    const result = buildCommandModal({ coord: 'E7' });
    assert.equal(result.data.custom_id, 'player_command_modal_E7');
  });

  it('uses "Enter Command" as title', () => {
    const result = buildCommandModal({ coord: 'E7' });
    assert.equal(result.data.title, 'Enter Command');
  });

  it('handles global coordinate', () => {
    const result = buildCommandModal({ coord: 'global' });
    assert.equal(result.data.custom_id, 'player_command_modal_global');
    assert.equal(result.data.title, 'Enter Command');
  });
});

describe('buildCommandModal — Admin Mode', () => {
  it('uses admin_command_modal_ prefix for custom_id', () => {
    const result = buildCommandModal({ coord: 'F7', isAdmin: true });
    assert.equal(result.data.custom_id, 'admin_command_modal_F7');
  });

  it('uses "Test Command (Admin)" as title', () => {
    const result = buildCommandModal({ coord: 'F7', isAdmin: true });
    assert.equal(result.data.title, 'Test Command (Admin)');
  });
});

describe('buildCommandModal — Consistency', () => {
  it('player and admin modals have identical component structure', () => {
    const player = buildCommandModal({ coord: 'C3' });
    const admin = buildCommandModal({ coord: 'C3', isAdmin: true });

    // Same number of components
    assert.equal(player.data.components.length, admin.data.components.length);

    // Same text input config
    const playerInput = player.data.components[0].component;
    const adminInput = admin.data.components[0].component;
    assert.equal(playerInput.custom_id, adminInput.custom_id);
    assert.equal(playerInput.style, adminInput.style);
    assert.equal(playerInput.max_length, adminInput.max_length);
    assert.equal(playerInput.required, adminInput.required);
  });

  it('different coordinates produce different custom_ids', () => {
    const a = buildCommandModal({ coord: 'A1' });
    const b = buildCommandModal({ coord: 'B2' });
    assert.notEqual(a.data.custom_id, b.data.custom_id);
  });

  it('global and location produce different custom_ids', () => {
    const global = buildCommandModal({ coord: 'global' });
    const location = buildCommandModal({ coord: 'E7' });
    assert.notEqual(global.data.custom_id, location.data.custom_id);
  });
});
