import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate getItemQuantity from safariManager.js
function getItemQuantity(inventoryItem) {
    if (typeof inventoryItem === 'object' && inventoryItem !== null) {
        return inventoryItem.quantity || 0;
    }
    return inventoryItem || 0;
}

// Replicate condition evaluation logic from safariManager.js checkCondition
function checkItemCondition(player, condition) {
    const itemQuantity = getItemQuantity(player.safari?.inventory?.[condition.itemId]);
    const hasItem = itemQuantity > 0;
    return condition.operator === 'has' ? hasItem : !hasItem;
}

// Replicate setItemQuantity from safariManager.js
function setItemQuantity(inventory, itemId, quantity, numAttacksAvailable = 0) {
    inventory[itemId] = {
        quantity: Math.max(0, quantity),
        numAttacksAvailable: Math.max(0, numAttacksAvailable)
    };
}

describe('getItemQuantity — dual format support', () => {
    it('handles object format { quantity: N }', () => {
        assert.equal(getItemQuantity({ quantity: 3, numAttacksAvailable: 0 }), 3);
    });

    it('handles legacy number format', () => {
        assert.equal(getItemQuantity(1), 1);
        assert.equal(getItemQuantity(5), 5);
    });

    it('handles undefined/null/missing items', () => {
        assert.equal(getItemQuantity(undefined), 0);
        assert.equal(getItemQuantity(null), 0);
        assert.equal(getItemQuantity(0), 0);
    });

    it('handles object with zero quantity', () => {
        assert.equal(getItemQuantity({ quantity: 0, numAttacksAvailable: 0 }), 0);
    });
});

describe('checkItemCondition — item condition evaluation', () => {
    const makePlayer = (inventory) => ({ safari: { inventory } });

    it('passes "has" condition with object format inventory', () => {
        const player = makePlayer({
            'sword_123': { quantity: 1, numAttacksAvailable: 0 }
        });
        assert.equal(checkItemCondition(player, { type: 'item', operator: 'has', itemId: 'sword_123' }), true);
    });

    it('passes "has" condition with legacy number format inventory', () => {
        const player = makePlayer({
            'dial_456': 1
        });
        assert.equal(checkItemCondition(player, { type: 'item', operator: 'has', itemId: 'dial_456' }), true);
    });

    it('fails "has" condition when item missing', () => {
        const player = makePlayer({});
        assert.equal(checkItemCondition(player, { type: 'item', operator: 'has', itemId: 'missing_item' }), false);
    });

    it('fails "has" condition when quantity is 0 (object)', () => {
        const player = makePlayer({
            'empty_item': { quantity: 0, numAttacksAvailable: 0 }
        });
        assert.equal(checkItemCondition(player, { type: 'item', operator: 'has', itemId: 'empty_item' }), false);
    });

    it('fails "has" condition when quantity is 0 (number)', () => {
        const player = makePlayer({
            'empty_item': 0
        });
        assert.equal(checkItemCondition(player, { type: 'item', operator: 'has', itemId: 'empty_item' }), false);
    });

    it('passes "not_has" condition when item missing', () => {
        const player = makePlayer({});
        assert.equal(checkItemCondition(player, { type: 'item', operator: 'not_has', itemId: 'missing' }), true);
    });

    it('fails "not_has" condition when item present (legacy number)', () => {
        const player = makePlayer({ 'dial_789': 2 });
        assert.equal(checkItemCondition(player, { type: 'item', operator: 'not_has', itemId: 'dial_789' }), false);
    });

    it('handles player with no safari data', () => {
        assert.equal(checkItemCondition({}, { type: 'item', operator: 'has', itemId: 'x' }), false);
        assert.equal(checkItemCondition({}, { type: 'item', operator: 'not_has', itemId: 'x' }), true);
    });
});

describe('setItemQuantity — always writes object format', () => {
    it('writes object format to empty inventory', () => {
        const inventory = {};
        setItemQuantity(inventory, 'item_1', 3, 0);
        assert.deepEqual(inventory['item_1'], { quantity: 3, numAttacksAvailable: 0 });
    });

    it('overwrites legacy number format with object format', () => {
        const inventory = { 'item_1': 5 };
        setItemQuantity(inventory, 'item_1', 6, 0);
        assert.deepEqual(inventory['item_1'], { quantity: 6, numAttacksAvailable: 0 });
    });

    it('clamps to zero for negative quantities', () => {
        const inventory = {};
        setItemQuantity(inventory, 'item_1', -1, -2);
        assert.deepEqual(inventory['item_1'], { quantity: 0, numAttacksAvailable: 0 });
    });
});

describe('Item Drops — should use object format', () => {
    it('simulates item drop adding to empty inventory using setItemQuantity', () => {
        const inventory = {};
        const currentQty = getItemQuantity(inventory['drop_item']);
        setItemQuantity(inventory, 'drop_item', currentQty + 1, 0);
        assert.deepEqual(inventory['drop_item'], { quantity: 1, numAttacksAvailable: 0 });
    });

    it('simulates item drop adding to existing legacy number format', () => {
        const inventory = { 'drop_item': 2 };
        const currentQty = getItemQuantity(inventory['drop_item']);
        setItemQuantity(inventory, 'drop_item', currentQty + 1, 0);
        assert.deepEqual(inventory['drop_item'], { quantity: 3, numAttacksAvailable: 0 });
    });

    it('simulates item drop adding to existing object format', () => {
        const inventory = { 'drop_item': { quantity: 2, numAttacksAvailable: 0 } };
        const currentQty = getItemQuantity(inventory['drop_item']);
        setItemQuantity(inventory, 'drop_item', currentQty + 1, 0);
        assert.deepEqual(inventory['drop_item'], { quantity: 3, numAttacksAvailable: 0 });
    });
});
