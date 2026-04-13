import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate buildLimitOptions inline (same as utils/periodUtils.js)
function formatPeriodInline(ms) {
  if (!ms || ms <= 0) return '0m';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}
function buildLimitOptions({ currentLimit, periodMs } = {}) {
  return [
    { label: 'Unlimited', value: 'unlimited', description: 'Can be used infinite times', emoji: { name: '♾️' }, default: currentLimit === 'unlimited' },
    { label: 'Once Per Player', value: 'once_per_player', description: 'Each player can use once', emoji: { name: '👤' }, default: currentLimit === 'once_per_player' },
    { label: 'Once Globally', value: 'once_globally', description: 'Only one player total can use', emoji: { name: '🌍' }, default: currentLimit === 'once_globally' },
    { label: currentLimit === 'once_per_period' && periodMs ? `Once Per Period (${formatPeriodInline(periodMs)})` : 'Once Per Period', value: 'once_per_period', description: 'Cooldown period before player can reuse', emoji: { name: '⏱️' }, default: currentLimit === 'once_per_period' }
  ];
}
const LIMIT_OPTIONS = buildLimitOptions({ currentLimit: 'once_per_player' });

const COLOR_OPTIONS = [
    { label: 'Blue (Primary)', value: 'Primary', emoji: { name: '🔵' }, default: true },
    { label: 'Grey (Secondary)', value: 'Secondary', emoji: { name: '⚪' } },
    { label: 'Green (Success)', value: 'Success', emoji: { name: '🟢' } },
    { label: 'Red (Danger)', value: 'Danger', emoji: { name: '🔴' } }
];

// Replicate buildQuickCurrencyModal
function buildQuickCurrencyModal(coordinate, currencyName) {
    return {
        custom_id: `quick_currency_modal_${coordinate}`,
        title: `Quick ${currencyName} Action`,
        components: [
            { type: 18, label: 'Button Name', description: 'Label on the button the player clicks.', component: { type: 4, custom_id: 'button_name', style: 1, placeholder: `e.g., "Collect ${currencyName}"`, required: true, max_length: 80 } },
            { type: 18, label: 'Amount', description: 'How much to give (or use negative to remove, e.g. -50).', component: { type: 4, custom_id: 'amount', style: 1, placeholder: 'e.g., 100 or -50', required: true, max_length: 10 } },
            { type: 18, label: 'Button Emoji (Optional)', description: 'Emoji that appears on the button.', component: { type: 4, custom_id: 'button_emoji', style: 1, placeholder: 'e.g., 💰', required: false, max_length: 100 } },
            { type: 18, label: 'Usage Limit', description: 'How many times can this action be used?', component: { type: 3, custom_id: 'usage_limit', placeholder: 'Select usage limit...', min_values: 1, max_values: 1, options: LIMIT_OPTIONS } },
            { type: 18, label: 'Button Color', description: 'Color of the button on the map.', component: { type: 3, custom_id: 'button_color', placeholder: 'Select button color...', min_values: 1, max_values: 1, options: COLOR_OPTIONS } }
        ]
    };
}

// Replicate buildQuickItemModal
function buildQuickItemModal(coordinate, items) {
    const itemOptions = items.slice(0, 25).map(item => ({
        label: (item.name || item.id).slice(0, 100),
        value: item.id,
        emoji: item.emoji ? { name: item.emoji } : { name: '📦' },
        description: item.description ? item.description.slice(0, 100) : undefined
    }));
    return {
        custom_id: `quick_item_modal_${coordinate}`,
        title: 'Quick Item Action',
        components: [
            { type: 18, label: 'Button Name', description: 'Label on the button the player clicks.', component: { type: 4, custom_id: 'button_name', style: 1, placeholder: 'e.g., "Open Chest"', required: true, max_length: 80 } },
            { type: 18, label: 'Item to Give', description: 'Select which item the player receives.', component: { type: 3, custom_id: 'item_select', placeholder: 'Select item...', min_values: 1, max_values: 1, options: itemOptions } },
            { type: 18, label: 'Button Emoji (Optional)', description: 'Emoji that appears on the button.', component: { type: 4, custom_id: 'button_emoji', style: 1, placeholder: 'e.g., 📦', required: false, max_length: 100 } },
            { type: 18, label: 'Usage Limit', description: 'How many times can this action be used?', component: { type: 3, custom_id: 'usage_limit', placeholder: 'Select usage limit...', min_values: 1, max_values: 1, options: LIMIT_OPTIONS } },
            { type: 18, label: 'Button Color', description: 'Color of the button on the map.', component: { type: 3, custom_id: 'button_color', placeholder: 'Select button color...', min_values: 1, max_values: 1, options: COLOR_OPTIONS } }
        ]
    };
}

// Replicate getModalValue
function getModalValue(comp) {
    if (!comp?.component) return null;
    if (Array.isArray(comp.component.values)) {
        return comp.component.values[0] || null;
    }
    const val = comp.component.value;
    return typeof val === 'string' ? val.trim() || null : null;
}

describe('buildQuickCurrencyModal', () => {
    it('generates correct custom_id with coordinate', () => {
        const modal = buildQuickCurrencyModal('A2', 'coins');
        assert.equal(modal.custom_id, 'quick_currency_modal_A2');
    });

    it('uses currency name in title', () => {
        const modal = buildQuickCurrencyModal('B3', 'gold');
        assert.equal(modal.title, 'Quick gold Action');
    });

    it('has 5 fields: name, amount, emoji, limit, color', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components.length, 5);
        assert.equal(modal.components[0].label, 'Button Name');
        assert.equal(modal.components[1].label, 'Amount');
        assert.equal(modal.components[2].label, 'Button Emoji (Optional)');
        assert.equal(modal.components[3].label, 'Usage Limit');
        assert.equal(modal.components[4].label, 'Button Color');
    });

    it('amount field is required', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components[1].component.required, true);
    });

    it('emoji field is optional', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components[2].component.required, false);
    });

    it('limit field uses String Select (type 3)', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components[3].component.type, 3);
        assert.equal(modal.components[3].component.options.length, 4);
    });

    it('color field uses String Select (type 3)', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components[4].component.type, 3);
        assert.equal(modal.components[4].component.options.length, 4);
    });

    it('all components are Label wrappers (type 18)', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        for (const comp of modal.components) {
            assert.equal(comp.type, 18);
        }
    });
});

describe('buildQuickItemModal', () => {
    const testItems = [
        { id: 'sword_1', name: 'Sword', emoji: '⚔️', description: 'A sharp blade' },
        { id: 'shield_2', name: 'Shield', emoji: '🛡️', description: 'Blocks attacks' }
    ];

    it('generates correct custom_id', () => {
        const modal = buildQuickItemModal('C5', testItems);
        assert.equal(modal.custom_id, 'quick_item_modal_C5');
    });

    it('has 5 fields: name, item, emoji, limit, color', () => {
        const modal = buildQuickItemModal('A1', testItems);
        assert.equal(modal.components.length, 5);
        assert.equal(modal.components[0].label, 'Button Name');
        assert.equal(modal.components[1].label, 'Item to Give');
        assert.equal(modal.components[2].label, 'Button Emoji (Optional)');
        assert.equal(modal.components[3].label, 'Usage Limit');
        assert.equal(modal.components[4].label, 'Button Color');
    });

    it('item field uses String Select with item options', () => {
        const modal = buildQuickItemModal('A1', testItems);
        const itemSelect = modal.components[1].component;
        assert.equal(itemSelect.type, 3);
        assert.equal(itemSelect.options.length, 2);
        assert.equal(itemSelect.options[0].value, 'sword_1');
        assert.equal(itemSelect.options[0].label, 'Sword');
    });

    it('limits items to 25', () => {
        const manyItems = Array.from({ length: 30 }, (_, i) => ({
            id: `item_${i}`, name: `Item ${i}`
        }));
        const modal = buildQuickItemModal('A1', manyItems);
        assert.equal(modal.components[1].component.options.length, 25);
    });

    it('uses fallback emoji for items without emoji', () => {
        const items = [{ id: 'test_1', name: 'Test' }];
        const modal = buildQuickItemModal('A1', items);
        assert.deepEqual(modal.components[1].component.options[0].emoji, { name: '📦' });
    });
});

describe('getModalValue', () => {
    it('extracts TextInput value', () => {
        const comp = { component: { type: 4, value: 'hello' } };
        assert.equal(getModalValue(comp), 'hello');
    });

    it('trims TextInput value', () => {
        const comp = { component: { type: 4, value: '  hello  ' } };
        assert.equal(getModalValue(comp), 'hello');
    });

    it('returns null for empty TextInput', () => {
        const comp = { component: { type: 4, value: '' } };
        assert.equal(getModalValue(comp), null);
    });

    it('extracts String Select value from values array', () => {
        const comp = { component: { type: 3, values: ['once_per_player'] } };
        assert.equal(getModalValue(comp), 'once_per_player');
    });

    it('returns null for empty String Select values', () => {
        const comp = { component: { type: 3, values: [] } };
        assert.equal(getModalValue(comp), null);
    });

    it('returns null for missing component', () => {
        assert.equal(getModalValue(null), null);
        assert.equal(getModalValue({}), null);
    });
});

// Replicate buildCraftingLogic inline (pure logic — no I/O or Discord deps)
function buildCraftingLogic(item1Id, item2Id, itemToGiveId) {
    const conditions = [];
    const outcomes = [];
    const sameInput = item1Id === item2Id;
    const mkCondition = (itemId, quantity) => ({
        id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'item', operator: 'has', itemId, quantity, logic: 'AND'
    });
    const mkOutcome = (order, itemId, quantity, operation) => ({
        type: 'give_item', order, config: { itemId, quantity, operation }, executeOn: 'true'
    });
    if (sameInput) {
        conditions.push(mkCondition(item1Id, 2));
        outcomes.push(mkOutcome(0, item1Id, 2, 'remove'));
        outcomes.push(mkOutcome(1, itemToGiveId, 1, 'give'));
    } else {
        conditions.push(mkCondition(item1Id, 1));
        conditions.push(mkCondition(item2Id, 1));
        outcomes.push(mkOutcome(0, item1Id, 1, 'remove'));
        outcomes.push(mkOutcome(1, item2Id, 1, 'remove'));
        outcomes.push(mkOutcome(2, itemToGiveId, 1, 'give'));
    }
    return { conditions, outcomes };
}

describe('buildCraftingLogic — different input items', () => {
    const { conditions, outcomes } = buildCraftingLogic('iron_1', 'wood_2', 'sword_3');

    it('creates exactly 2 conditions (one per input)', () => {
        assert.equal(conditions.length, 2);
    });
    it('conditions check type=item, operator=has, quantity=1, logic=AND', () => {
        for (const c of conditions) {
            assert.equal(c.type, 'item');
            assert.equal(c.operator, 'has');
            assert.equal(c.quantity, 1);
            assert.equal(c.logic, 'AND');
        }
        assert.equal(conditions[0].itemId, 'iron_1');
        assert.equal(conditions[1].itemId, 'wood_2');
    });
    it('creates 3 outcomes: remove input1, remove input2, give output', () => {
        assert.equal(outcomes.length, 3);
        assert.equal(outcomes[0].config.operation, 'remove');
        assert.equal(outcomes[0].config.itemId, 'iron_1');
        assert.equal(outcomes[1].config.operation, 'remove');
        assert.equal(outcomes[1].config.itemId, 'wood_2');
        assert.equal(outcomes[2].config.operation, 'give');
        assert.equal(outcomes[2].config.itemId, 'sword_3');
    });
    it('all outcomes are type=give_item, executeOn=true, order set correctly', () => {
        outcomes.forEach((o, i) => {
            assert.equal(o.type, 'give_item');
            assert.equal(o.executeOn, 'true');
            assert.equal(o.order, i);
            assert.equal(o.config.quantity, 1);
        });
    });
});

describe('buildCraftingLogic — same input item twice', () => {
    const { conditions, outcomes } = buildCraftingLogic('stone_1', 'stone_1', 'brick_2');

    it('collapses duplicate inputs into 1 condition with quantity=2', () => {
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0].itemId, 'stone_1');
        assert.equal(conditions[0].quantity, 2);
    });
    it('collapses duplicate inputs into 1 remove outcome with quantity=2', () => {
        assert.equal(outcomes.length, 2);
        assert.equal(outcomes[0].config.operation, 'remove');
        assert.equal(outcomes[0].config.itemId, 'stone_1');
        assert.equal(outcomes[0].config.quantity, 2);
        assert.equal(outcomes[1].config.operation, 'give');
        assert.equal(outcomes[1].config.itemId, 'brick_2');
        assert.equal(outcomes[1].config.quantity, 1);
    });
});
