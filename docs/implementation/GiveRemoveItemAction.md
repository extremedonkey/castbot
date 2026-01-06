# Give / Remove Item Action Implementation

**Status**: COMPLETED
**Started**: 2026-01-06
**Completed**: 2026-01-06
**Priority**: HIGH
**Related RaP**: N/A (new feature, not bug fix)

## Overview

Extends the existing `give_item` Custom Action to support item removal, enabling scenarios like:
- Troll smashes your health potion (remove item on condition)
- Crafting systems (remove base materials, give crafted item)
- Quest item consumption
- Penalty mechanics

## Design Decision: Operation Field vs Negative Quantity

**Chosen**: Explicit `operation` field (`"give"` | `"remove"`)

**Rationale**:
- Items are discrete objects; "quantity: -2" is semantically awkward
- Cleaner UX - quantity stays positive, operation is explicit toggle
- Self-documenting JSON data
- Future-proof for crafting feature queries

## Data Structure

### Before (Give Only)
```javascript
{
  type: "give_item",
  config: {
    itemId: "health_potion_123",
    quantity: 1,
    limit: { type: "once_per_player", claimedBy: [] }
  },
  executeOn: "true"
}
```

### After (Give or Remove)
```javascript
{
  type: "give_item",
  config: {
    itemId: "health_potion_123",
    quantity: 1,
    operation: "give" | "remove",  // NEW - defaults to "give" if missing
    limit: { type: "once_per_player", claimedBy: [] }
  },
  executeOn: "true"
}
```

**Backwards Compatibility**: Actions without `operation` field default to `"give"`.

## UI Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Configure Item Drop Screen (showGiveItemConfig)                │
├─────────────────────────────────────────────────────────────────┤
│  1. Usage Limit Select (unchanged)                              │
│     ├─ Unlimited                                                │
│     ├─ Once Per Player                                          │
│     └─ Once Globally                                            │
│                                                                 │
│  2. Operation Select (NEW)  ◄────────────────────────────────── │
│     ├─ 🎁 Give Item - Adds to inventory (default)              │
│     └─ 🧨 Remove Item - Removes from inventory                 │
│                                                                 │
│  3. Execute On Select (unchanged)                               │
│     ├─ Execute if all conditions are true                       │
│     └─ Execute if all conditions are false                      │
│                                                                 │
│  4. Quantity Select (unchanged, 0-24)                           │
│                                                                 │
│  5. Action Buttons (unchanged)                                  │
│     ├─ Reset Claims                                             │
│     ├─ Delete Action                                            │
│     └─ Save & Finish                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Message Templates

| Scenario | Emoji | Message |
|----------|-------|---------|
| Give Item (success) | 🎁 | `You receive 3x of 🧪 Health Potion!` |
| Remove Item (had enough) | 🧨 | `You lose 2x of 🧪 Health Potion!` |
| Remove Item (partial) | 🧨 | `An attempt was made to remove 5x of 🧪 Health Potion, but you only had 2x available. Final total: 0x.` |
| Already claimed (either) | ❌ | `You have already claimed/lost 🧪 3x Health Potion` |

## Execution Logic

### Give Operation (Existing, Updated Message)
1. Check usage limits (unchanged)
2. Call `addItemToInventory()`
3. Update claim tracking (unchanged)
4. Return success message with new format

### Remove Operation (New)
1. Check usage limits (same as give - tracks who has had items removed)
2. Get current inventory quantity
3. Calculate removal: `actualRemoved = min(requested, current)`
4. Calculate final: `finalQuantity = max(0, current - requested)`
5. Update inventory (delete item if quantity reaches 0)
6. Update claim tracking (same as give)
7. Return appropriate message based on `hadEnough`

### Edge Cases Handled

| Edge Case | Behavior |
|-----------|----------|
| Player has 0 items | Remove succeeds, shows "had 0x available, final: 0x" |
| Player has fewer than requested | Removes what they have, shows partial message |
| Negative final quantity | Prevented by `Math.max(0, ...)` |
| Missing operation field | Defaults to "give" (backwards compatible) |
| Quantity = 0 in config | Action is not added (existing behavior) |

## Files Modified

### 1. customActionUI.js
- Line ~312-313: Rename labels
  - "Give Currency" → "Give / Remove Currency"
  - "Give Item" → "Give / Remove Item"

### 2. app.js
- Line ~39205-39209: Update `actionTypeNames` mapping
- Line ~39340-39502: Update `showGiveItemConfig()`:
  - Add `operation` to default state
  - Add Operation Select component after Usage Limit
- New handler: `safari_item_operation_*` - updates dropConfigState
- Update handler: `safari_item_save_*` - include operation in saved config

### 3. safariManager.js
- New function: `removeItemFromInventory()` (~30 lines)
- Update function: `executeGiveItem()`:
  - Add operation check at start
  - Branch logic for give vs remove
  - Update message formats
- Export: Add `removeItemFromInventory` to exports

## State Management

### dropConfigState Structure
```javascript
const stateKey = `${guildId}_${buttonId}_${itemId}_${actionIndex}`;
const state = {
  limit: 'once_per_player',   // Default
  quantity: 1,                 // Default
  operation: 'give',           // NEW - Default to give
  executeOn: 'true'            // Default
};
```

## Testing Checklist

### Basic Functionality
- [ ] Give item works as before (backwards compatible)
- [ ] Remove item removes from inventory
- [ ] Partial removal shows correct message
- [ ] Zero inventory removal shows correct message

### Limits
- [ ] Unlimited: Can give/remove multiple times
- [ ] Once Per Player: Each player can only trigger once
- [ ] Once Globally: Only first player can trigger

### Conditions
- [ ] Execute if true: Works with give
- [ ] Execute if true: Works with remove
- [ ] Execute if false: Works with give
- [ ] Execute if false: Works with remove

### UI
- [ ] Operation select appears in config
- [ ] Default is "Give Item"
- [ ] Selection persists after save
- [ ] Editing existing action shows correct selection

### Edge Cases
- [ ] Player with 0 items - remove doesn't crash
- [ ] Existing actions without operation field - default to give
- [ ] Text command triggers work for both operations

### Bundling (SafariButtonBundling)
- [ ] Give messages bundle correctly with display_text
- [ ] Remove messages bundle correctly with display_text

## Rollback Plan

1. Revert changes to all three files
2. Existing actions continue to work (operation field is optional)
3. No data migration needed

## Future: Crafting Integration

The `operation` field enables natural crafting queries:

```javascript
// Find all "remove" actions for an item (to know what consumes it)
const consumingActions = buttons.filter(b =>
  b.actions.some(a =>
    a.type === 'give_item' &&
    a.config.operation === 'remove' &&
    a.config.itemId === targetItemId
  )
);

// Crafting recipe structure (future)
const craftingRecipe = {
  name: "Craft Sword",
  inputs: [
    { itemId: "wood", quantity: 2, operation: "remove" },
    { itemId: "iron", quantity: 1, operation: "remove" }
  ],
  outputs: [
    { itemId: "sword", quantity: 1, operation: "give" }
  ]
};
```

---

**Implementation Started**: 2026-01-06
**Implementation Completed**: [TBD]
