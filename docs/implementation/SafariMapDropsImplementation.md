# Safari Map Drops - Implementation Reference

**Context**: Complete implementation reference for the Safari Map Drops system including stores, item drops, and currency drops functionality.

## Implementation Summary

**Features Added**:
1. Store attachment to map coordinates
2. Item drops (once per player / once per season)
3. Currency drops (once per player / once per season)

**Files Modified**: 5 core files + documentation
**Handlers Added**: 20+ new button/modal handlers
**Components V2**: All handlers converted to Components V2 format

## File Changes Overview

### 1. safariButtonHelper.js
**Purpose**: Button organization and anchor message generation

**Key Changes**:
- Added store button generation from `coordData.stores`
- Added item drop button generation from `coordData.itemDrops`
- Added currency drop button generation from `coordData.currencyDrops`
- Enforced 5-button-per-row limit across all button types
- Implemented priority order: stores → item drops → currency drops → safari buttons

**Critical Function**: `createAnchorMessageComponents()`
```javascript
// Button priority order implemented
const allButtons = [];

// 1. Store buttons first (grey, secondary style)
if (coordData.stores?.length > 0) {
  for (const storeId of coordData.stores) {
    allButtons.push({
      type: 2,
      custom_id: `map_coord_store_${coord}_${storeId}`,
      label: store.name,
      style: 2, // Secondary/grey
      emoji: store.emoji ? { name: store.emoji } : undefined
    });
  }
}

// 2. Item drop buttons
// 3. Currency drop buttons  
// 4. Safari buttons (existing)
```

### 2. entityManagementUI.js
**Purpose**: Entity field group configuration

**Key Changes**:
- Extended `map_cell` entity type with new field groups
- Added `stores` field group for store attachment
- Added `items` field group for item/currency drops

```javascript
case 'map_cell':
  return {
    info: { label: 'Location Info', emoji: '📝', fields: ['title', 'description'] },
    media: { label: 'Media', emoji: '🖼️', fields: ['image'] },
    interaction: { label: 'Safari Buttons', emoji: '🎯', fields: ['buttons'] },
    stores: { label: 'Add Store', emoji: '🏪', fields: ['stores'] },
    items: { label: 'Add Item', emoji: '🧰', fields: ['itemDrops', 'currencyDrops'] }
  };
```

### 3. app.js (Major Changes)
**Purpose**: Main handler implementation

**Handlers Added**:

#### Store Management
- `map_stores_select_*` - Store selection dropdown
- `map_coord_store_*` - Store access from map location

#### Item Drop Management  
- `map_add_item_drop_*` - Initialize item drop
- `map_item_drop_select_*` - Item selection dropdown
- `map_item_drop_*` - Player item collection
- `map_drop_style_*` - Item button style configuration
- `map_drop_type_*` - Item drop type configuration
- `map_drop_text_*` - Custom button text modal
- `map_drop_save_*` - Save item drop configuration
- `map_drop_remove_*` - Remove item drop
- `map_drop_reset_*` - Reset item drop claims

#### Currency Drop Management
- `map_add_currency_drop_*` - Initialize currency drop
- `map_currency_drop_*` - Player currency collection  
- `map_currency_style_*` - Currency button style
- `map_currency_type_*` - Currency drop type
- `map_currency_edit_*` - Edit currency amount/text
- `map_currency_remove_*` - Remove currency drop
- `map_currency_reset_*` - Reset currency claims

#### Modal Handlers
- `map_currency_drop_modal_*` - Currency configuration modal
- `map_drop_text_modal_*` - Item button text modal

**Critical Patterns Applied**:
```javascript
// All select menu handlers use updateMessage: true
return ButtonHandlerFactory.create({
  id: 'handler_name',
  updateMessage: true, // Prevents container duplication
  handler: async (context) => {
    // Components V2 response
    return {
      components: [{ type: 17, components: [...] }],
      flags: (1 << 15), // IS_COMPONENTS_V2
      ephemeral: true
    };
  }
})(req, res, client);
```

### 4. buttonHandlerFactory.js
**Purpose**: Button registry for all new patterns

**Registry Entries Added**:
```javascript
// Store patterns
'map_coord_store_*': { label: 'Store Access', category: 'safari_map' },
'map_stores_select_*': { label: 'Store Selection', type: 'select_menu' },

// Item drop patterns
'map_item_drop_select_*': { label: 'Item Drop Select', type: 'select_menu' },
'map_item_drop_*': { label: 'Item Drop', category: 'safari_map' },
'map_drop_style_*': { label: 'Drop Style', type: 'select_menu' },
'map_drop_type_*': { label: 'Drop Type', type: 'select_menu' },

// Currency drop patterns
'map_currency_style_*': { label: 'Currency Style', type: 'select_menu' },
'map_currency_type_*': { label: 'Currency Type', type: 'select_menu' },
'map_currency_edit_*': { label: 'Edit Currency', requiresModal: true },

// Admin patterns
'map_add_item_drop_*': { label: 'Add Item Drop', category: 'safari_map_admin' },
'map_add_currency_drop_*': { label: 'Add Currency Drop', category: 'safari_map_admin' }
```

### 5. mapCellUpdater.js
**Purpose**: Anchor message updates

**Key Function**: `updateAnchorMessage(guildId, coord, client)`
- Called after every drop configuration change
- Updates map coordinate anchor messages with new buttons
- Integrates with `safariButtonHelper.js` for button generation

## Data Structure Implementation

### Safari Content Schema Extension
```javascript
safariData[guildId].maps[activeMapId].coordinates[coord] = {
  // Existing fields
  baseContent: { title, description, image },
  buttons: [...], // Safari button IDs

  // NEW: Store attachment
  stores: ['store_id_1', 'store_id_2'], // Array of store IDs

  // NEW: Item drops
  itemDrops: [{
    itemId: 'iron_sword',
    buttonText: 'Open Treasure Chest!',
    buttonEmoji: '📦',
    buttonStyle: 2, // 1=Primary, 2=Secondary, 3=Success, 4=Danger
    dropType: 'once_per_player', // or 'once_per_season'
    claimedBy: [] // Array of user IDs for 'once_per_player'
               // or single user ID for 'once_per_season'
  }],

  // NEW: Currency drops  
  currencyDrops: [{
    amount: 100,
    buttonText: 'Collect Coins!',
    buttonEmoji: '🪙',
    buttonStyle: 2,
    dropType: 'once_per_player', // or 'once_per_season'
    claimedBy: [] // Same structure as itemDrops
  }]
}
```

### Claim Tracking Logic
```javascript
// For 'once_per_player' drops
if (dropType === 'once_per_player') {
  if (claimedBy.includes(userId)) {
    return { content: '❌ You have already claimed this!', ephemeral: true };
  }
  claimedBy.push(userId);
}

// For 'once_per_season' drops  
if (dropType === 'once_per_season') {
  if (claimedBy) {
    return { content: '❌ Someone else has already claimed this!', ephemeral: true };
  }
  coordData.itemDrops[dropIndex].claimedBy = userId;
}
```

## Button Organization Algorithm

**5-Button Limit Enforcement** in `safariButtonHelper.js`:
```javascript
const allButtons = [];

// Priority 1: Store buttons (grey)
if (coordData.stores?.length > 0) {
  // Add store buttons...
}

// Priority 2: Item drop buttons (colored)
if (coordData.itemDrops?.length > 0) {
  for (const [index, drop] of coordData.itemDrops.entries()) {
    const isExhausted = drop.dropType === 'once_per_season' && drop.claimedBy;
    allButtons.push({
      custom_id: `map_item_drop_${coord}_${index}`,
      label: isExhausted ? `${drop.buttonText} (Taken)` : drop.buttonText,
      disabled: isExhausted
    });
  }
}

// Priority 3: Currency drop buttons
// Priority 4: Safari buttons

// Create action rows with 5-button limit
for (let i = 0; i < allButtons.length; i += 5) {
  buttonRows.push({
    type: 1, // Action Row
    components: allButtons.slice(i, i + 5)
  });
}
```

## Error Handling Patterns

### Logging Standards
```javascript
// Start logging
console.log(`🔍 START: handler_name - user ${context.userId}`);

// Success logging  
console.log(`✅ SUCCESS: handler_name - completed`);

// Error logging
console.error(`❌ ERROR: handler_name - ${error.message}`);
```

### Try-Catch Pattern
```javascript
try {
  console.log(`🔍 START: handler_name`);
  
  // Handler logic...
  
  console.log(`✅ SUCCESS: handler_name`);
  return {
    components: [...],
    flags: (1 << 15),
    ephemeral: true
  };
} catch (error) {
  console.error(`❌ ERROR: handler_name - ${error.message}`);
  return {
    content: '❌ User-friendly error message.',
    ephemeral: true
  };
}
```

## Testing Workflow

### Development Testing Steps
1. **Create drops**: Use Location Actions → Add Item/Currency
2. **Configure drops**: Test all style/type combinations
3. **Test collection**: Verify claim mechanics work
4. **Test restrictions**: Ensure once_per_player/season logic
5. **Test anchor updates**: Verify buttons appear immediately
6. **Test exhaustion**: Check "Taken" state for once_per_season
7. **Test reset**: Use admin reset buttons
8. **Test UI updates**: Ensure no container duplication

### Production Verification
1. **Store access**: Only works in correct channels
2. **Item collection**: Adds to player inventory
3. **Currency collection**: Updates player balance
4. **Claim persistence**: Claims survive server restarts
5. **Button states**: Disabled buttons stay disabled

## Components V2 Compliance

**All handlers follow Components V2 requirements**:
- ✅ Use `type: 17` Container wrapper
- ✅ Use `type: 10` Text Display instead of content
- ✅ Use `type: 3` for String Select (not type 6)
- ✅ Use `type: 14` for Separators (not type 13)
- ✅ Include `flags: (1 << 15)` for IS_COMPONENTS_V2
- ✅ Never mix content field with Components V2 flag
- ✅ Use `updateMessage: true` for select handlers

## Performance Considerations

### Caching
- Safari data cached between operations
- Channel name resolution cached
- Fog map URLs recovered from storage when null

### Efficient Updates
- Anchor messages only updated when necessary
- Bulk operations where possible
- Minimal database writes

### Memory Management
- Request cache cleared regularly
- Safari cache cleared between operations
- No memory leaks in long-running handlers

## Future Extension Points

### Easy Additions
1. **Multiple currency drops per location** (remove single-drop limitation)
2. **Timed drops** (refresh daily/weekly)
3. **Conditional drops** (require specific items to claim)
4. **Drop probability** (chance-based collection)

### Architecture Ready For
1. **Drop prerequisites** (items, currency, level requirements)
2. **Dynamic drop generation** (procedural content)
3. **Cross-location drop chains** (collect sequence across multiple locations)
4. **Seasonal drop rotation** (automatic content cycling)

## Critical Success Factors

1. **Components V2 compliance** - Mandatory for all Discord UI
2. **updateMessage flag** - Prevents container duplication 
3. **Comprehensive logging** - Essential for debugging
4. **Error handling** - User-friendly messages + detailed logs
5. **Data validation** - Check existence before operations
6. **Anchor message updates** - Keep UI in sync with data
7. **5-button limit** - Respect Discord constraints

This implementation provides a solid foundation for location-based content in the Safari Map system while maintaining code quality and user experience standards.