import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate buildQuickCreateConfirmUI from quickActionCreate.js
function buildQuickCreateConfirmUI(actionId, coordinate, options) {
    const { emoji, name, summary, limitType = 'once_per_player', style = 'Primary' } = options;
    const emojiDisplay = emoji ? `${emoji} ` : '';

    const limitOptions = [
        { label: 'Unlimited', value: 'unlimited', emoji: { name: '♾️' }, default: limitType === 'unlimited' },
        { label: 'Once Per Player', value: 'once_per_player', emoji: { name: '👤' }, default: limitType === 'once_per_player' },
        { label: 'Once Globally', value: 'once_globally', emoji: { name: '🌍' }, default: limitType === 'once_globally' }
    ];

    const colorOptions = [
        { label: 'Blue (Primary)', value: 'Primary', emoji: { name: '🔵' }, default: style === 'Primary' },
        { label: 'Grey (Secondary)', value: 'Secondary', emoji: { name: '⚪' }, default: style === 'Secondary' },
        { label: 'Green (Success)', value: 'Success', emoji: { name: '🟢' }, default: style === 'Success' },
        { label: 'Red (Danger)', value: 'Danger', emoji: { name: '🔴' }, default: style === 'Danger' }
    ];

    return {
        components: [{
            type: 17,
            accent_color: 5763719,
            components: [
                { type: 10, content: `### ✅ Quick Action Created` },
                { type: 14 },
                { type: 10, content: `${emojiDisplay}**${name}**\n${summary}\nLocation: **${coordinate}**` },
                { type: 14 },
                { type: 1, components: [{ type: 3, custom_id: `quick_limit_${actionId}_${coordinate}`, placeholder: 'Usage Limit', min_values: 1, max_values: 1, options: limitOptions }] },
                { type: 1, components: [{ type: 3, custom_id: `quick_color_${actionId}_${coordinate}`, placeholder: 'Button Color', min_values: 1, max_values: 1, options: colorOptions }] },
                { type: 14 },
                { type: 1, components: [
                    { type: 2, style: 2, label: 'Open Action Editor', custom_id: `quick_edit_${actionId}_${coordinate}`, emoji: { name: '✏️' } },
                    { type: 2, style: 1, label: 'Done', custom_id: `quick_done_${coordinate}`, emoji: { name: '✅' } }
                ]}
            ]
        }]
    };
}

// Replicate buildSummaryFromAction
function buildSummaryFromAction(action, customTerms) {
    const outcome = action.actions?.[0];
    if (!outcome) return 'No outcome configured';
    if (outcome.type === 'give_currency') {
        const amount = outcome.config?.amount || 0;
        const verb = amount > 0 ? 'Gives' : 'Removes';
        return `${verb} **${Math.abs(amount)}** ${customTerms.currencyEmoji} ${customTerms.currencyName}`;
    }
    if (outcome.type === 'give_item') {
        const qty = outcome.config?.quantity || 1;
        const itemId = outcome.config?.itemId;
        return `Gives **${qty}x** 📦 **${itemId}**`;
    }
    return 'Custom outcome';
}

// Replicate buildQuickCurrencyModal
function buildQuickCurrencyModal(coordinate, currencyName) {
    return {
        custom_id: `quick_currency_modal_${coordinate}`,
        title: `Quick ${currencyName} Action`,
        components: [
            { type: 18, label: 'Button Name', description: 'Label on the button the player clicks.', component: { type: 4, custom_id: 'button_name', style: 1, placeholder: `e.g., "Collect ${currencyName}"`, required: true, max_length: 80 } },
            { type: 18, label: 'Amount', description: 'How much to give (or use negative to remove, e.g. -50).', component: { type: 4, custom_id: 'amount', style: 1, placeholder: 'e.g., 100 or -50', required: true, max_length: 10 } },
            { type: 18, label: 'Button Emoji (Optional)', description: 'Emoji that appears on the button.', component: { type: 4, custom_id: 'button_emoji', style: 1, placeholder: 'e.g., 💰', required: false, max_length: 100 } }
        ]
    };
}

function buildQuickItemModal(coordinate) {
    return {
        custom_id: `quick_item_modal_${coordinate}`,
        title: 'Quick Item Action',
        components: [
            { type: 18, label: 'Button Name', description: 'Label on the button the player clicks.', component: { type: 4, custom_id: 'button_name', style: 1, placeholder: 'e.g., "Open Chest"', required: true, max_length: 80 } },
            { type: 18, label: 'Button Emoji (Optional)', description: 'Emoji that appears on the button.', component: { type: 4, custom_id: 'button_emoji', style: 1, placeholder: 'e.g., 📦', required: false, max_length: 100 } }
        ]
    };
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

    it('has 3 fields: name, amount, emoji', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components.length, 3);
        assert.equal(modal.components[0].label, 'Button Name');
        assert.equal(modal.components[1].label, 'Amount');
        assert.equal(modal.components[2].label, 'Button Emoji (Optional)');
    });

    it('amount field is required', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components[1].component.required, true);
    });

    it('emoji field is optional', () => {
        const modal = buildQuickCurrencyModal('A1', 'coins');
        assert.equal(modal.components[2].component.required, false);
    });
});

describe('buildQuickItemModal', () => {
    it('generates correct custom_id', () => {
        const modal = buildQuickItemModal('C5');
        assert.equal(modal.custom_id, 'quick_item_modal_C5');
    });

    it('has 2 fields: name, emoji', () => {
        const modal = buildQuickItemModal('A1');
        assert.equal(modal.components.length, 2);
        assert.equal(modal.components[0].label, 'Button Name');
        assert.equal(modal.components[1].label, 'Button Emoji (Optional)');
    });
});

describe('buildQuickCreateConfirmUI', () => {
    it('returns Container (type 17) with correct structure', () => {
        const ui = buildQuickCreateConfirmUI('action_123', 'A2', {
            emoji: '💰',
            name: 'Get Gold',
            summary: 'Gives **100** 🪙 coins',
            limitType: 'once_per_player',
            style: 'Primary'
        });

        assert.equal(ui.components.length, 1);
        assert.equal(ui.components[0].type, 17); // Container
    });

    it('includes action name and summary in text', () => {
        const ui = buildQuickCreateConfirmUI('action_123', 'B3', {
            emoji: '📦',
            name: 'Open Chest',
            summary: 'Gives **1x** 📦 **Sword**'
        });

        const textComponents = ui.components[0].components.filter(c => c.type === 10);
        const content = textComponents.map(c => c.content).join('\n');
        assert.ok(content.includes('Open Chest'));
        assert.ok(content.includes('Gives **1x**'));
        assert.ok(content.includes('B3'));
    });

    it('sets default limit option correctly', () => {
        const ui = buildQuickCreateConfirmUI('action_123', 'A1', {
            name: 'Test',
            summary: 'test',
            limitType: 'once_globally'
        });

        const selects = ui.components[0].components.filter(c => c.type === 1 && c.components[0]?.type === 3);
        const limitSelect = selects[0].components[0];
        const defaultOption = limitSelect.options.find(o => o.default);
        assert.equal(defaultOption.value, 'once_globally');
    });

    it('sets default color option correctly', () => {
        const ui = buildQuickCreateConfirmUI('action_123', 'A1', {
            name: 'Test',
            summary: 'test',
            style: 'Danger'
        });

        const selects = ui.components[0].components.filter(c => c.type === 1 && c.components[0]?.type === 3);
        const colorSelect = selects[1].components[0];
        const defaultOption = colorSelect.options.find(o => o.default);
        assert.equal(defaultOption.value, 'Danger');
    });

    it('includes Done and Open Action Editor buttons', () => {
        const ui = buildQuickCreateConfirmUI('action_123', 'A2', {
            name: 'Test',
            summary: 'test'
        });

        const actionRows = ui.components[0].components.filter(c => c.type === 1);
        const lastRow = actionRows[actionRows.length - 1];
        const labels = lastRow.components.map(b => b.label);
        assert.ok(labels.includes('Open Action Editor'));
        assert.ok(labels.includes('Done'));
    });

    it('handles missing emoji gracefully', () => {
        const ui = buildQuickCreateConfirmUI('action_123', 'A1', {
            name: 'No Emoji',
            summary: 'test'
        });

        const textComponents = ui.components[0].components.filter(c => c.type === 10);
        const nameText = textComponents.find(c => c.content.includes('No Emoji'));
        assert.ok(nameText);
        assert.ok(!nameText.content.startsWith('undefined'));
    });

    it('custom_ids include coordinate for routing', () => {
        const ui = buildQuickCreateConfirmUI('my_action_id', 'F4', {
            name: 'Test',
            summary: 'test'
        });

        const allCustomIds = [];
        const traverse = (comps) => {
            for (const c of comps) {
                if (c.custom_id) allCustomIds.push(c.custom_id);
                if (c.components) traverse(c.components);
            }
        };
        traverse(ui.components);

        assert.ok(allCustomIds.some(id => id.includes('F4')));
        assert.ok(allCustomIds.some(id => id.includes('my_action_id')));
    });
});

describe('buildSummaryFromAction', () => {
    const terms = { currencyName: 'coins', currencyEmoji: '🪙' };

    it('summarizes give_currency with positive amount', () => {
        const action = { actions: [{ type: 'give_currency', config: { amount: 100 } }] };
        assert.equal(buildSummaryFromAction(action, terms), 'Gives **100** 🪙 coins');
    });

    it('summarizes give_currency with negative amount', () => {
        const action = { actions: [{ type: 'give_currency', config: { amount: -50 } }] };
        assert.equal(buildSummaryFromAction(action, terms), 'Removes **50** 🪙 coins');
    });

    it('summarizes give_item', () => {
        const action = { actions: [{ type: 'give_item', config: { itemId: 'sword_123', quantity: 3 } }] };
        assert.equal(buildSummaryFromAction(action, terms), 'Gives **3x** 📦 **sword_123**');
    });

    it('handles no outcomes', () => {
        assert.equal(buildSummaryFromAction({ actions: [] }, terms), 'No outcome configured');
        assert.equal(buildSummaryFromAction({}, terms), 'No outcome configured');
    });

    it('handles unknown outcome type', () => {
        const action = { actions: [{ type: 'display_text', config: {} }] };
        assert.equal(buildSummaryFromAction(action, terms), 'Custom outcome');
    });
});
