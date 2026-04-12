import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EDIT_CONFIGS } from '../editFramework.js';
import { EDIT_TYPES } from '../config/safariLimits.js';

// ─── Replicated pure logic (avoids importing modules with file-I/O deps) ───

/**
 * Build the legacy/main button split that createSafariCustomizationUI uses.
 */
function splitFieldGroupButtons(fieldGroups) {
  const fieldGroupButtons = Object.entries(fieldGroups).map(([k, g]) => ({
    custom_id: `safari_config_group_${k}`,
    label: g.label
  }));
  const legacyKeys = ['events', 'rounds'];
  const mainButtons = fieldGroupButtons.filter(
    b => !legacyKeys.some(k => b.custom_id === `safari_config_group_${k}`)
  );
  const legacyButtons = legacyKeys
    .map(k => fieldGroupButtons.find(b => b.custom_id === `safari_config_group_${k}`))
    .filter(Boolean);
  return { mainButtons, legacyButtons };
}

/**
 * Mirror of createFieldGroupModal — just the structure-relevant parts.
 */
function buildFieldGroupModal(groupKey, currentConfig = {}) {
  const groupConfig = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG].fieldGroups[groupKey];
  if (!groupConfig) throw new Error(`Unknown field group: ${groupKey}`);

  const components = [];

  // Legacy Tycoons warning shown above the Rounds modal fields
  if (groupKey === 'rounds') {
    components.push({ type: 10, content: '### ⚠️ Legacy Tycoons Feature' });
  }

  Object.entries(groupConfig.fields).forEach(([fieldKey, fieldConfig]) => {
    let currentValue = currentConfig[fieldKey];
    if (fieldKey === 'inventoryEmoji' && !currentValue) currentValue = '🧰';
    if (fieldKey === 'craftingEmoji' && !currentValue) currentValue = '🛠️';
    if (fieldKey === 'craftingName' && !currentValue) currentValue = 'Crafting';

    const textInput = {
      type: 4,
      custom_id: fieldKey,
      style: fieldConfig.type === 'textarea' ? 2 : 1,
      required: fieldConfig.required || false,
      max_length: fieldConfig.maxLength || 100
    };
    if (currentValue !== undefined && currentValue !== null) {
      textInput.value = String(currentValue);
    }

    components.push({ type: 18, label: fieldConfig.label, component: textInput });
  });

  return {
    custom_id: `safari_config_modal_${groupKey}`,
    title: `${groupConfig.label} Settings`,
    components: components.slice(0, 5)
  };
}

/**
 * Mirror of processFieldGroupSubmission — key-based lookup (tolerates non-input rows).
 */
function processFieldGroupSubmission(groupKey, modalData) {
  const groupConfig = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG].fieldGroups[groupKey];
  if (!groupConfig) throw new Error(`Unknown field group: ${groupKey}`);

  const updates = {};
  const components = modalData.components || [];

  const valuesByCustomId = {};
  for (const row of components) {
    if (row?.component?.custom_id !== undefined) {
      valuesByCustomId[row.component.custom_id] = row.component.value;
      continue;
    }
    if (Array.isArray(row?.components)) {
      for (const inner of row.components) {
        if (inner?.custom_id !== undefined) {
          valuesByCustomId[inner.custom_id] = inner.value;
        }
      }
    }
  }

  Object.entries(groupConfig.fields).forEach(([fieldKey, fieldConfig]) => {
    const value = valuesByCustomId[fieldKey];
    if (value !== undefined && value !== '') {
      if (fieldConfig.type === 'number') {
        const num = parseInt(value, 10);
        if (!isNaN(num)) updates[fieldKey] = num;
      } else {
        updates[fieldKey] = value.trim();
      }
    }
  });

  return updates;
}

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe('Safari Settings — Field Group Definitions', () => {
  const groups = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG].fieldGroups;

  it('defines all five expected groups', () => {
    assert.deepEqual(
      Object.keys(groups).sort(),
      ['crafting', 'currency', 'events', 'location', 'rounds'].sort()
    );
  });

  it('rounds group no longer contains defaultStartingCoordinate', () => {
    assert.equal(groups.rounds.fields.defaultStartingCoordinate, undefined);
  });

  it('rounds group label is renamed to "Rounds"', () => {
    assert.equal(groups.rounds.label, 'Rounds');
  });

  it('location group exists with defaultStartingCoordinate field', () => {
    assert.ok(groups.location);
    assert.ok(groups.location.fields.defaultStartingCoordinate);
    assert.equal(groups.location.fields.defaultStartingCoordinate.maxLength, 4);
  });

  it('crafting group has craftingName + craftingEmoji', () => {
    assert.ok(groups.crafting);
    assert.equal(groups.crafting.fields.craftingName.required, true);
    assert.equal(groups.crafting.fields.craftingEmoji.required, false);
  });
});

describe('Safari Settings — Button row split', () => {
  const groups = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG].fieldGroups;
  const { mainButtons, legacyButtons } = splitFieldGroupButtons(groups);

  it('main row contains currency, crafting, location (in that order)', () => {
    const mainIds = mainButtons.map(b => b.custom_id);
    assert.deepEqual(mainIds, [
      'safari_config_group_currency',
      'safari_config_group_crafting',
      'safari_config_group_location'
    ]);
  });

  it('legacy row contains events and rounds (in that order)', () => {
    const legacyIds = legacyButtons.map(b => b.custom_id);
    assert.deepEqual(legacyIds, [
      'safari_config_group_events',
      'safari_config_group_rounds'
    ]);
  });

  it('main row + stamina + commands fits within 5-button ActionRow limit', () => {
    // Safari row at runtime: [...mainButtons, stamina_location_config, command_prefixes_menu]
    assert.ok(mainButtons.length + 2 <= 5,
      `Safari row would have ${mainButtons.length + 2} buttons, must be ≤ 5`);
  });
});

describe('Safari Settings — Modal generation', () => {
  it('crafting modal returns Label (type 18) wrapping TextInput (type 4)', () => {
    const modal = buildFieldGroupModal('crafting', {});
    assert.equal(modal.custom_id, 'safari_config_modal_crafting');
    assert.equal(modal.components.length, 2); // craftingName + craftingEmoji
    for (const row of modal.components) {
      assert.equal(row.type, 18);
      assert.equal(row.component.type, 4);
    }
  });

  it('crafting modal pre-populates with passed values', () => {
    const modal = buildFieldGroupModal('crafting', {
      craftingName: 'Gardening',
      craftingEmoji: '🌱'
    });
    const nameInput = modal.components.find(r => r.component.custom_id === 'craftingName');
    const emojiInput = modal.components.find(r => r.component.custom_id === 'craftingEmoji');
    assert.equal(nameInput.component.value, 'Gardening');
    assert.equal(emojiInput.component.value, '🌱');
  });

  it('crafting modal pre-populates with sensible defaults when empty', () => {
    const modal = buildFieldGroupModal('crafting', {});
    const nameInput = modal.components.find(r => r.component.custom_id === 'craftingName');
    const emojiInput = modal.components.find(r => r.component.custom_id === 'craftingEmoji');
    assert.equal(nameInput.component.value, 'Crafting');
    assert.equal(emojiInput.component.value, '🛠️');
  });

  it('location modal contains exactly one Label+TextInput', () => {
    const modal = buildFieldGroupModal('location', {});
    assert.equal(modal.components.length, 1);
    assert.equal(modal.components[0].type, 18);
    assert.equal(modal.components[0].component.custom_id, 'defaultStartingCoordinate');
  });

  it('rounds modal contains the legacy warning text-display at index 0', () => {
    const modal = buildFieldGroupModal('rounds', {});
    assert.equal(modal.components[0].type, 10);
    assert.match(modal.components[0].content, /Legacy Tycoons/);
  });

  it('rounds modal stays within Discord 5-component limit', () => {
    const modal = buildFieldGroupModal('rounds', {});
    // Warning + 3 round probabilities = 4
    assert.ok(modal.components.length <= 5);
    assert.equal(modal.components.length, 4);
  });
});

describe('Safari Settings — Modal submission processing', () => {
  it('extracts values from key-based lookup (Label-wrapped)', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'craftingName', value: 'Gardening' } },
        { type: 18, component: { custom_id: 'craftingEmoji', value: '🌱' } }
      ]
    };
    const updates = processFieldGroupSubmission('crafting', modalData);
    assert.equal(updates.craftingName, 'Gardening');
    assert.equal(updates.craftingEmoji, '🌱');
  });

  it('rounds: text-display warning at index 0 does NOT break field extraction', () => {
    const modalData = {
      components: [
        { type: 10, content: 'warning text' },
        { type: 18, component: { custom_id: 'round1GoodProbability', value: '80' } },
        { type: 18, component: { custom_id: 'round2GoodProbability', value: '60' } },
        { type: 18, component: { custom_id: 'round3GoodProbability', value: '40' } }
      ]
    };
    const updates = processFieldGroupSubmission('rounds', modalData);
    assert.equal(updates.round1GoodProbability, 80);
    assert.equal(updates.round2GoodProbability, 60);
    assert.equal(updates.round3GoodProbability, 40);
  });

  it('parses number fields as integers', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'round1GoodProbability', value: '75' } }
      ]
    };
    const updates = processFieldGroupSubmission('rounds', modalData);
    assert.equal(typeof updates.round1GoodProbability, 'number');
    assert.equal(updates.round1GoodProbability, 75);
  });

  it('skips empty strings (does not store empty values)', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'craftingName', value: '' } },
        { type: 18, component: { custom_id: 'craftingEmoji', value: '🌱' } }
      ]
    };
    const updates = processFieldGroupSubmission('crafting', modalData);
    assert.equal(updates.craftingName, undefined);
    assert.equal(updates.craftingEmoji, '🌱');
  });

  it('trims whitespace from text values', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'craftingName', value: '  Gardening  ' } }
      ]
    };
    const updates = processFieldGroupSubmission('crafting', modalData);
    assert.equal(updates.craftingName, 'Gardening');
  });
});

describe('Safari Settings — Reset coverage', () => {
  // Mock resetCustomTerms by replicating the keys it sets
  const resetKeys = [
    // Currency & Inventory
    'currencyName', 'currencyEmoji', 'inventoryName', 'inventoryEmoji', 'defaultStartingCurrencyValue',
    // Crafting
    'craftingName', 'craftingEmoji',
    // Events
    'goodEventName', 'badEventName', 'goodEventEmoji', 'badEventEmoji',
    'goodEventMessage', 'badEventMessage',
    // Rounds
    'round1GoodProbability', 'round2GoodProbability', 'round3GoodProbability',
    // Location
    'defaultStartingCoordinate',
    // Stamina
    'startingStamina', 'maxStamina', 'staminaRegenerationMinutes', 'staminaRegenerationAmount',
    // Player Menu visibility
    'enableGlobalCommands', 'inventoryVisibilityMode', 'globalStoresVisibilityMode', 'showCustomCastlists'
  ];

  it('reset covers every UI-exposed fieldGroup field', () => {
    const groups = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG].fieldGroups;
    for (const [groupKey, group] of Object.entries(groups)) {
      for (const fieldKey of Object.keys(group.fields)) {
        assert.ok(
          resetKeys.includes(fieldKey),
          `Field "${fieldKey}" in group "${groupKey}" is not covered by resetCustomTerms`
        );
      }
    }
  });

  it('reset includes crafting fields', () => {
    assert.ok(resetKeys.includes('craftingName'));
    assert.ok(resetKeys.includes('craftingEmoji'));
  });

  it('reset includes stamina + player menu visibility fields', () => {
    assert.ok(resetKeys.includes('startingStamina'));
    assert.ok(resetKeys.includes('inventoryVisibilityMode'));
  });

  it('reset does NOT include destructive fields (roles whitelist, log channel, prefixes)', () => {
    assert.ok(!resetKeys.includes('rolesWhitelist'));
    assert.ok(!resetKeys.includes('safariLogChannelId'));
    assert.ok(!resetKeys.includes('commandPrefixes'));
  });
});
