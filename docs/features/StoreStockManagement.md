# Store Stock Management System

## Overview

This document provides complete implementation details for the Store Stock Management system, allowing administrators to set and manage stock levels for items in Safari stores. The system supports unlimited stock (default), limited stock quantities, and sold-out states.

## Design Constraints & Decisions

### Key Decisions
1. **12-item hard limit per store** - Intentional constraint to fit Discord's 40-component limit
2. **Backwards compatibility** - Existing stores default to unlimited stock (undefined/null = unlimited)
3. **Section-based UI** - Uses Discord Section components (type 9) for clean 3-component-per-item layout
4. **Real-time validation** - Stock checked at purchase time, not just button state
5. **Simple stock values** - Unlimited (undefined/null), 0 (sold out), or positive integers only

### Component Budget
```
Stock Management UI:
- Base: Container (1) + Title (1) + Back Button Row (1) = 3 components
- Per Item: Section (1) + Text Display (1) + Button Accessory (1) = 3 components
- Available: 40 - 3 = 37 components
- Max Items: 37 ÷ 3 = 12.33 ✅ Fits exactly 12 items
```

## Data Structure

### Store Item Structure
```javascript
// In safariContent.json
{
  "stores": {
    "store_123": {
      "name": "General Store",
      "items": [
        {
          "itemId": "sword_basic",
          "price": 100,
          "stock": 5           // Limited stock (positive integer)
        },
        {
          "itemId": "shield_wood",
          "price": 50,
          "stock": undefined   // Unlimited stock (undefined or null)
        },
        {
          "itemId": "potion_health",
          "price": 25,
          "stock": 0           // Sold out (but still displayed)
        }
      ]
    }
  }
}
```

### Stock States
- **Unlimited**: `stock === undefined || stock === null`
- **Available**: `stock > 0` (positive integer)
- **Sold Out**: `stock === 0` (item displayed but unpurchasable)

## UI Implementation

### 1. Add "Manage Stock" Button
**Location**: Store item management screen (`entityManagementUI.js`)
```javascript
// Add to action buttons in createStoreItemManagementUI
{
  type: 2, // Button
  custom_id: `safari_store_stock_${storeId}`,
  label: 'Manage Stock',
  style: 2, // Secondary (grey)
  emoji: { name: '📊' }
}
```

### 2. Stock Management Screen
**Handler**: `safari_store_stock_*` button handler

**UI Structure**:
```javascript
{
  type: 17, // Container
  components: [
    {
      type: 10, // Text Display
      content: `## 📊 Stock Management - ${store.name}`
    },
    // For each item in store:
    {
      type: 9, // Section
      components: [{
        type: 10, // Text Display
        content: `**${item.emoji} ${item.name}**\n${customTerms.currencyEmoji} ${price} ${customTerms.currencyName}\n📦 Stock: ${
          item.stock === undefined || item.stock === null ? 'Unlimited' :
          item.stock === 0 ? '0 (Sold Out)' :
          item.stock
        }`
      }],
      accessory: {
        type: 2, // Button
        custom_id: `stock_set_${storeId}::${itemId}`,
        label: 'Set Stock',
        emoji: { name: '📦' },
        style: 2 // Secondary (grey)
      }
    },
    // Back button
    {
      type: 1, // Action Row
      components: [{
        type: 2, // Button
        custom_id: `safari_store_items_select_${storeId}`,
        label: '← Back to Store',
        style: 2,
        emoji: { name: '🏪' }
      }]
    }
  ],
  flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
}
```

### 3. Set Stock Modal
**Handler**: `stock_set_*` button handler

**Modal Structure**:
```javascript
{
  title: `Stock: ${truncate(item.name, 30)}`,
  custom_id: `stock_modal_${storeId}::${itemId}`,
  components: [{
    type: 1, // Action Row
    components: [{
      type: 4, // Text Input
      custom_id: 'stock_quantity',
      label: 'New store item qty (blank for unlimited)',
      placeholder: 'Enter quantity or leave blank for unlimited',
      value: item.stock?.toString() || '', // Empty string for unlimited
      required: false, // Allows blank submission
      style: 1 // Short
    }]
  }]
}
```

### 4. Modal Submission Handler
**Handler**: `stock_modal_*`

**Validation & Processing**:
```javascript
const input = components[0].components[0].value.trim();
let newStock;

// Parse and validate input
if (input === '') {
  newStock = null; // Unlimited
} else {
  const parsed = parseInt(input);
  if (isNaN(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return {
      content: '❌ Invalid stock value. Use positive whole numbers or leave blank for unlimited.',
      ephemeral: true
    };
  }
  newStock = parsed;
}

// Update only if changed
const storeItem = store.items.find(si => (si.itemId || si) === itemId);
if (storeItem.stock !== newStock) {
  storeItem.stock = newStock;
  await saveSafariContent(safariData);
}

// Return updated stock management UI (UPDATE_MESSAGE type)
```

## Purchase Flow Updates

### Real-time Stock Validation
**Location**: `safari_store_buy_*` handler in `app.js`

```javascript
// After finding store and item...
const storeItem = store.items?.find(si => (si.itemId || si) === itemId);

// Check stock availability (real-time, not button state)
if (storeItem.stock !== undefined && storeItem.stock !== null) {
  if (storeItem.stock <= 0) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `❌ **Out of Stock!**\n\n${item.emoji} ${item.name} is currently sold out.\n\nCheck back later or try another store!`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
}

// Process purchase...
if (storeItem.stock !== undefined && storeItem.stock !== null) {
  storeItem.stock--; // Deplete stock
  
  // Add low stock warning if applicable
  if (storeItem.stock <= 3 && storeItem.stock > 0) {
    additionalMessage = `\n⚠️ Only ${storeItem.stock} left in stock!`;
  }
}

// Save updated stock
await saveSafariContent(safariData);
```

### Store Display Updates
**Location**: `createStoreDisplay` in `safariManager.js`

```javascript
// In item display section
const stockDisplay = storeItem.stock === undefined || storeItem.stock === null
  ? '' // Don't show stock for unlimited items
  : storeItem.stock === 0
    ? '\n**🚫 SOLD OUT**'
    : `\n**Stock:** ${storeItem.stock} available`;

// Update button based on stock
const buyButton = new ButtonBuilder()
  .setCustomId(`safari_store_buy_${guildId}_${storeId}_${itemId}`)
  .setLabel(storeItem.stock === 0 ? 'Sold Out' : `Buy (${price} ${currency})`)
  .setStyle(storeItem.stock === 0 ? ButtonStyle.Secondary : ButtonStyle.Success)
  .setDisabled(userCurrency < price || storeItem.stock === 0);
```

## Store Item Limit Enforcement

### 12-Item Maximum
**Location**: `store_items_multiselect` handler

```javascript
const selectedItems = context.values;
const validSelections = selectedItems.filter(id => id !== 'search_entities' && id !== 'clear_search');

if (validSelections.length > 12) {
  return {
    content: `❌ **Store Item Limit**\n\nStores can hold maximum 12 items.\nYou selected: ${validSelections.length} items\n\nPlease select 12 or fewer items.`,
    ephemeral: true
  };
}
```

## Button Handler Registration

Add to `BUTTON_REGISTRY` in `buttonHandlerFactory.js`:
```javascript
'safari_store_stock': {
  label: 'Manage Stock',
  description: 'Manage item stock levels in stores',
  emoji: '📊',
  style: 'Secondary', // Grey button
  category: 'safari_store'
},
'stock_set': {
  label: 'Set Stock',
  description: 'Set stock quantity for store item',
  emoji: '📦',
  style: 'Secondary',
  category: 'safari_store'
}
```

## Backwards Compatibility

### No Migration Required
- Existing stores with items as strings or objects without `stock` field work automatically
- `undefined`/`null` stock = unlimited (current behavior)
- No data migration needed - system is backwards compatible by design

### Handling Legacy Item Format
```javascript
// Support both formats
const itemId = typeof storeItem === 'string' ? storeItem : storeItem.itemId;
const stock = typeof storeItem === 'object' ? storeItem.stock : undefined;
```

## Error Handling

1. **Invalid stock values**: Only accept blank (unlimited), 0, or positive integers
2. **Component limits**: Enforce 12-item maximum at selection time
3. **Race conditions**: Real-time stock validation at purchase
4. **Sold out items**: Show in store but disable purchase
5. **Stock depletion**: Atomic update with immediate save

## Testing Checklist

### Core Functionality
- [ ] "Manage Stock" button appears in store item management
- [ ] Stock management screen displays all store items (up to 12)
- [ ] Each item shows current stock status correctly
- [ ] "Set Stock" button opens modal for each item
- [ ] Modal accepts blank (unlimited), 0, and positive integers
- [ ] Modal rejects negative numbers, decimals, and non-numeric input
- [ ] Stock updates persist after modal submission
- [ ] UI refreshes to show new stock values

### Backwards Compatibility
- [ ] Existing stores without stock data show as "Unlimited"
- [ ] Stores with string item arrays continue working
- [ ] No data corruption when switching between old/new UI

### Purchase Flow
- [ ] Unlimited items can be purchased indefinitely
- [ ] Limited stock items show availability count
- [ ] Stock depletes by 1 on successful purchase
- [ ] Sold out items (stock = 0) cannot be purchased
- [ ] Old Discord messages with active buttons respect current stock
- [ ] Low stock warning appears at ≤3 items

### Edge Cases
- [ ] Store with exactly 12 items displays correctly
- [ ] Store with 13+ items prevents adding more
- [ ] Setting stock to 0 shows "Sold Out" but item remains visible
- [ ] Changing stock from limited to unlimited works
- [ ] Changing stock from unlimited to limited works
- [ ] Multiple users buying simultaneously handle stock correctly

### UI/UX
- [ ] Stock management screen is ephemeral (private)
- [ ] Component count stays under 40 limit
- [ ] Error messages are clear and actionable
- [ ] Stock status displays use consistent formatting
- [ ] Buy buttons show appropriate state (enabled/disabled)

## Implementation Notes

1. **Component Type 9 (Section)**: Critical for clean layout and component efficiency
2. **:: Delimiter**: Used consistently for compound IDs (storeId::itemId)
3. **UPDATE_MESSAGE**: Required for refreshing stock management UI after changes
4. **Ephemeral Responses**: All admin interfaces must be ephemeral
5. **Real-time Validation**: Never trust button state alone - always check current stock

## Future Enhancements (Not Implemented)

- Automatic restocking over time
- Stock alerts for administrators
- Purchase limits per user
- Reserved stock for specific roles
- Stock history/analytics

---

This documentation provides everything needed to implement the Store Stock Management system with no additional context required.