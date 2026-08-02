import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EDIT_CONFIGS } from '../editFramework.js';
import { EDIT_TYPES } from '../config/safariLimits.js';
// The REAL builder — not a replica. The suite below validates the exact payload Discord
// receives. A replica cannot do this job: on 2026-08-02 the Location modal shipped broken
// (a `required` key on a Checkbox + a 128-char description) while every replica-based test
// passed, because the replica omitted descriptions entirely. Replicas are fine for pure
// logic; payload validity must be checked against the real thing.
import { createFieldGroupModal } from '../safariConfigUI.js';

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

    if (fieldConfig.type === 'boolean') {
      components.push({
        type: 18,
        label: fieldConfig.label,
        component: { type: 23, custom_id: fieldKey, required: false, default: currentValue === true }
      });
      return;
    }

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

    if (fieldConfig.type === 'boolean') {
      updates[fieldKey] = value === true;
      return;
    }

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
// Real-payload validation — Discord rejects the WHOLE modal for any one violation
// ───────────────────────────────────────────────────────────────────────────

const ALL_GROUPS = Object.keys(EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG].fieldGroups);

// Discord limits (docs/standards/ComponentsV2.md)
const LIMITS = { MODAL_COMPONENTS: 5, LABEL: 45, DESCRIPTION: 100, CUSTOM_ID: 100, TITLE: 45 };

describe('Safari Settings — real modal payloads satisfy Discord limits', () => {
  for (const group of ALL_GROUPS) {
    it(`${group}: every Label is within label/description limits`, async () => {
      const modal = (await createFieldGroupModal(group, {})).toJSON();
      for (const row of modal.components) {
        if (row.type !== 18) continue; // Text Display etc.
        assert.ok(row.label.length <= LIMITS.LABEL,
          `${group}.${row.component?.custom_id}: label ${row.label.length} > ${LIMITS.LABEL}`);
        const desc = row.description || '';
        assert.ok(desc.length <= LIMITS.DESCRIPTION,
          `${group}.${row.component?.custom_id}: description ${desc.length} > ${LIMITS.DESCRIPTION} — Discord rejects the whole modal`);
      }
    });

    it(`${group}: no Checkbox (type 23) carries a 'required' key`, async () => {
      const modal = (await createFieldGroupModal(group, {})).toJSON();
      for (const row of modal.components) {
        const comp = row.component;
        if (comp?.type !== 23) continue;
        // ComponentsV2.md: "Checkbox cannot be set as required." Sending it => interaction failed.
        assert.equal('required' in comp, false,
          `${group}.${comp.custom_id}: Checkbox must not declare 'required'`);
      }
    });

    it(`${group}: fits the ${LIMITS.MODAL_COMPONENTS}-component modal limit and has a valid shell`, async () => {
      const modal = (await createFieldGroupModal(group, {})).toJSON();
      assert.ok(modal.components.length <= LIMITS.MODAL_COMPONENTS,
        `${group}: ${modal.components.length} components > ${LIMITS.MODAL_COMPONENTS}`);
      assert.ok(modal.components.length > 0, `${group}: modal has no components`);
      assert.ok(modal.custom_id.length <= LIMITS.CUSTOM_ID);
      assert.ok(modal.title.length <= LIMITS.TITLE, `${group}: title ${modal.title.length} > ${LIMITS.TITLE}`);
    });

    it(`${group}: every interactive component sits inside a Label and has a custom_id`, async () => {
      const modal = (await createFieldGroupModal(group, {})).toJSON();
      for (const row of modal.components) {
        if (row.type === 10) continue; // Text Display is a valid top-level modal component
        assert.equal(row.type, 18, `${group}: top-level type ${row.type} — modal inputs must be Label-wrapped`);
        assert.ok(row.component?.custom_id, `${group}: Label "${row.label}" has no custom_id`);
      }
    });
  }

  it('the location checkbox renders with a real pre-populated state, both ways', async () => {
    const off = (await createFieldGroupModal('location', {})).toJSON();
    const on = (await createFieldGroupModal('location', { reverseBlacklistRequireAll: true })).toJSON();
    const find = (m) => m.components.find(r => r.component?.custom_id === 'reverseBlacklistRequireAll').component;
    assert.equal(find(off).type, 23);
    assert.equal(find(off).default, false);
    assert.equal(find(on).default, true);
  });
});

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

  it('location group has the reverseBlacklistRequireAll boolean field', () => {
    assert.equal(groups.location.fields.reverseBlacklistRequireAll.type, 'boolean');
    assert.equal(groups.location.fields.reverseBlacklistRequireAll.required, false);
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

  it('location modal contains the coordinate TextInput + the require-all Checkbox', () => {
    const modal = buildFieldGroupModal('location', {});
    assert.equal(modal.components.length, 2);
    assert.equal(modal.components[0].type, 18);
    assert.equal(modal.components[0].component.custom_id, 'defaultStartingCoordinate');
    assert.equal(modal.components[0].component.type, 4);
    assert.equal(modal.components[1].type, 18);
    assert.equal(modal.components[1].component.custom_id, 'reverseBlacklistRequireAll');
    assert.equal(modal.components[1].component.type, 23); // Checkbox
  });

  it('require-all checkbox renders unchecked when the guild never set it (legacy default)', () => {
    const modal = buildFieldGroupModal('location', {});
    const checkbox = modal.components.find(r => r.component.custom_id === 'reverseBlacklistRequireAll');
    assert.equal(checkbox.component.default, false);
  });

  it('require-all checkbox renders checked when the guild opted in', () => {
    const modal = buildFieldGroupModal('location', { reverseBlacklistRequireAll: true });
    const checkbox = modal.components.find(r => r.component.custom_id === 'reverseBlacklistRequireAll');
    assert.equal(checkbox.component.default, true);
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

  it('location: checkbox true is stored as boolean true (opt into AND)', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'defaultStartingCoordinate', value: 'B2' } },
        { type: 18, component: { custom_id: 'reverseBlacklistRequireAll', value: true } }
      ]
    };
    const updates = processFieldGroupSubmission('location', modalData);
    assert.equal(updates.defaultStartingCoordinate, 'B2');
    assert.equal(updates.reverseBlacklistRequireAll, true);
  });

  it('location: unchecking persists false (must not be skipped as "empty")', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'defaultStartingCoordinate', value: 'A1' } },
        { type: 18, component: { custom_id: 'reverseBlacklistRequireAll', value: false } }
      ]
    };
    const updates = processFieldGroupSubmission('location', modalData);
    assert.equal(updates.reverseBlacklistRequireAll, false);
    assert.ok('reverseBlacklistRequireAll' in updates, 'false must be written, not dropped');
  });

  it('location: a boolean value never hits the string branch (.trim would throw)', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'reverseBlacklistRequireAll', value: true } }
      ]
    };
    assert.doesNotThrow(() => processFieldGroupSubmission('location', modalData));
  });

  it('location: a checkbox omitted from the payload defaults to false, not undefined', () => {
    const modalData = {
      components: [
        { type: 18, component: { custom_id: 'defaultStartingCoordinate', value: 'A1' } }
      ]
    };
    const updates = processFieldGroupSubmission('location', modalData);
    assert.equal(updates.reverseBlacklistRequireAll, false);
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

describe('Safari Settings — Crafting emoji resolution (regression for interaction-failed bug)', () => {
  // Replicate the fixed pattern inline so the test pins the contract
  function buildCraftingOptionEmoji(action, customTerms, resolveEmojiFn) {
    const rawEmojiStr =
      action.inventoryConfig?.buttonEmoji
      || action.trigger?.button?.emoji
      || action.emoji
      || customTerms.craftingEmoji;
    return resolveEmojiFn(rawEmojiStr, '🛠️');
  }

  // Minimal resolveEmoji stub mirroring utils/emojiUtils.js contract
  function resolveEmoji(emojiStr, fallback = '📦') {
    if (!emojiStr || typeof emojiStr !== 'string' || !emojiStr.trim()) {
      return { name: fallback };
    }
    const trimmed = emojiStr.trim();
    const customMatch = trimmed.match(/^<(a?):(\w+):(\d+)>$/);
    if (customMatch) {
      return {
        name: customMatch[2],
        id: customMatch[3],
        ...(customMatch[1] === 'a' ? { animated: true } : {})
      };
    }
    return { name: trimmed };
  }

  it('server crafting emoji as custom emoji string is parsed correctly (not wrapped in invalid { name: "<:...>" })', () => {
    const action = { name: 'Widget', inventoryConfig: {}, trigger: { button: {} }, emoji: null };
    const customTerms = { craftingEmoji: '<:LinkGotItem:1487510833754804294>' };
    const emoji = buildCraftingOptionEmoji(action, customTerms, resolveEmoji);
    assert.equal(emoji.name, 'LinkGotItem');
    assert.equal(emoji.id, '1487510833754804294');
    assert.ok(!emoji.name.startsWith('<'), 'name field must not contain raw <:...:> syntax');
  });

  it('recipe with custom emoji overrides server crafting emoji', () => {
    const action = { inventoryConfig: { buttonEmoji: '<:Apple:111>' }, trigger: { button: {} } };
    const customTerms = { craftingEmoji: '<:LinkGotItem:222>' };
    const emoji = buildCraftingOptionEmoji(action, customTerms, resolveEmoji);
    assert.equal(emoji.name, 'Apple');
    assert.equal(emoji.id, '111');
  });

  it('falls back to Unicode 🛠️ when nothing is set', () => {
    const action = { inventoryConfig: {}, trigger: { button: {} } };
    const customTerms = {};
    const emoji = buildCraftingOptionEmoji(action, customTerms, resolveEmoji);
    assert.equal(emoji.name, '🛠️');
  });

  it('Unicode server crafting emoji works', () => {
    const action = { inventoryConfig: {}, trigger: { button: {} } };
    const customTerms = { craftingEmoji: '🌱' };
    const emoji = buildCraftingOptionEmoji(action, customTerms, resolveEmoji);
    assert.equal(emoji.name, '🌱');
    assert.equal(emoji.id, undefined);
  });

  it('animated custom crafting emoji preserves animated flag', () => {
    const action = { inventoryConfig: {}, trigger: { button: {} } };
    const customTerms = { craftingEmoji: '<a:spin:999>' };
    const emoji = buildCraftingOptionEmoji(action, customTerms, resolveEmoji);
    assert.equal(emoji.name, 'spin');
    assert.equal(emoji.id, '999');
    assert.equal(emoji.animated, true);
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

  // Game-logic fields deliberately EXEMPT from reset. Resetting these would change
  // live game rules, not just cosmetics — see resetCustomTerms in safariManager.js.
  // Adding to this list requires the same justification; it is not a dumping ground.
  const resetExemptFields = [
    // Flipping back to OR would silently open every multi-key door mid-game
    'reverseBlacklistRequireAll'
  ];

  it('reset covers every UI-exposed fieldGroup field (except documented exemptions)', () => {
    const groups = EDIT_CONFIGS[EDIT_TYPES.SAFARI_CONFIG].fieldGroups;
    for (const [groupKey, group] of Object.entries(groups)) {
      for (const fieldKey of Object.keys(group.fields)) {
        if (resetExemptFields.includes(fieldKey)) continue;
        assert.ok(
          resetKeys.includes(fieldKey),
          `Field "${fieldKey}" in group "${groupKey}" is not covered by resetCustomTerms`
        );
      }
    }
  });

  it('exempt fields are genuinely absent from reset (exemption is real, not stale)', () => {
    for (const fieldKey of resetExemptFields) {
      assert.equal(resetKeys.includes(fieldKey), false,
        `"${fieldKey}" is listed as reset-exempt but resetCustomTerms sets it — remove one or the other`);
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
