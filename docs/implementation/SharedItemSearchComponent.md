# Shared Item Search Component - Implementation Guide

## Current Status: Option 1 Implemented (Parallel Implementation)
- ✅ **Condition Manager** - Full search functionality added (Aug 2025)
- ✅ **Safari Give Item Action** - Already has search functionality
- 🔄 **Future Refactor** - Extract to shared component when time permits

## Goal
Extract duplicate item search logic from Safari Actions and Condition Manager into reusable module.

## Option 1 Implementation Details (COMPLETED)

### What Was Done
1. **Condition Manager Item Search** (`condition_item_select_*`)
   - Added search option as first item in dropdown (always visible)
   - Modal handler: `condition_item_search_modal_*`
   - Search logic matches Safari exactly
   - Selected item always shows in dropdown (even if not in first 24)
   - Files modified: `customActionUI.js`, `app.js`

### Search Flow Pattern (Both Systems)
```
Select Menu → User clicks "🔍 Search..." → Modal opens → User types search
→ Results shown in select → User selects item → Returns to original UI
```

## All Item Select Locations Needing Refactor

### 1. ✅ **Condition Manager** (`app.js:18988`)
- **Handler**: `condition_item_select_*`
- **Search**: ✅ Implemented via Option 1
- **Location**: `customActionUI.js:createItemConditionUI()`
- **Status**: Complete with search

### 2. ✅ **Safari Give Item Action** (`app.js:12263`)
- **Handler**: `safari_give_item_select_*`
- **Search**: ✅ Already has search
- **Modal**: `safari_item_search_modal_*`
- **Status**: Working, needs refactor to shared

### 3. ❌ **Map Item Drops** (`entityManagementUI.js:86`)
- **Function**: `createMapItemSelector()`
- **Handler**: `map_item_drop_select_*`
- **Search**: ✅ Has search via `map_item_search_*`
- **Status**: Working, needs refactor to shared

### 4. ❌ **Store Item Stock Management** (`entityManagementUI.js:856`)
- **Handler**: `store_items_multiselect_*`
- **Search**: ✅ Has search functionality
- **Special**: Multi-select (0-24 items)
- **Status**: Complex multi-select, needs special handling

### 5. ❌ **Safari Store Item Addition** (`app.js`)
- **Handler**: `safari_store_items_select_*`
- **Search**: ❌ No search currently
- **Status**: Needs search + refactor

### 6. ❌ **Player Inventory Views** (`app.js:946`)
- **Handler**: `safari_view_player_inventory`
- **Search**: ❌ No search (view only)
- **Status**: May not need search (display only)

### 7. ❌ **Item Entity Management** (`fieldEditors.js`)
- **Context**: Item creation/editing UI
- **Search**: N/A (manages items themselves)
- **Status**: Different use case

## Future Shared Component Design

### Files to Create
- `itemSearchUI.js` - Shared search component

### Key Functions
```javascript
// itemSearchUI.js
export async function createItemSelectOptions({ 
  guildId, 
  alwaysShowSearch = true, 
  selectedItemId,
  multiSelect = false,
  currentlySelected = [], // For multi-select
  excludeItems = [], // Items to exclude
  maxOptions = 25
})

export function createItemSearchModal(callbackCustomId) 

export async function searchItems({ 
  guildId, 
  searchTerm, 
  maxResults = 25,
  excludeItems = []
})

export function createItemSelectComponent({ 
  customId, 
  options, 
  placeholder,
  multiSelect = false,
  minValues = 1,
  maxValues = 1
})
```

## Migration Priority
1. **High**: Safari Give Item Action (most used, already has search)
2. **High**: Map Item Drops (frequently used)
3. **Medium**: Store Item Stock (complex multi-select)
4. **Low**: Safari Store Item Addition
5. **N/A**: Inventory views (display only)

## State Preservation Strategy
- Callback custom ID format: `item_search_modal::${originalCustomId}`
- Parse on return to determine context and rebuild appropriate UI
- Support both single and multi-select contexts

## Search Behavior Standards
- ✅ Always show search option (no threshold)
- ✅ Search results show "refine search" option
- ✅ No auto-selection after search
- ✅ "no_results" handled gracefully
- ✅ Selected item always visible in dropdown
- ✅ Case-insensitive name search
- ✅ Consistent emoji handling via `parseTextEmoji()`

## Implementation Notes
- Option 1 (parallel implementation) chosen for speed and safety
- Each implementation currently ~200 lines of duplicate code
- Shared component would reduce to ~50 lines per integration
- Must maintain backward compatibility during migration
- Consider special cases (multi-select, excluded items)