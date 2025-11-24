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

## Production Bug Fixed (Nov 2024): Custom ID Length Overflow

### The Problem
Player Admin item search was hitting Discord's 100-character custom_id limit:
```
safari_item_qty_modal_1418593741773738075_tide_forged_obsidian_773156_496027721843867668_player_admin
                                                                                                ^^^^^^^^^^^^^
                                                                                             101 characters (FAILED!)
```

### Root Cause
The `_player_admin` suffix was added to track context for modal submission handler, but turned out to be **completely redundant**:
- The suffix was only used for parsing logic (not navigation)
- Context was already preserved in the SELECT MENU custom_id (not the modal!)
- Modal submission just shows an ephemeral message (doesn't navigate anywhere)

### The Fix
**Removed `_player_admin` suffix entirely** (13-character savings):
```javascript
// Before (app.js:28742)
.setCustomId(`safari_item_qty_modal_${context.guildId}_${itemId}_${targetUserId}_player_admin`)

// After
.setCustomId(`safari_item_qty_modal_${context.guildId}_${itemId}_${targetUserId}`)
```

**Simplified parsing logic** (app.js:33549-33553):
```javascript
// Before: 9 lines of complex conditional parsing
const isPlayerAdminContext = parts[parts.length - 1] === 'admin' && parts[parts.length - 2] === 'player';
const userId = isPlayerAdminContext ? parts[parts.length - 3] : parts[parts.length - 1];
const itemId = isPlayerAdminContext
  ? parts.slice(1, -3).join('_')
  : parts.slice(1, -1).join('_');

// After: 3 lines of direct parsing
const userId = parts[parts.length - 1];
const itemId = parts.slice(1, -1).join('_');
```

### Key Insight: Context Lives in Select Menus, Not Modals

**The Search Pattern**:
1. Select menu encodes context in its custom_id (`player_item_select_{userId}` vs `safari_item_qty_user_select_{guildId}_{itemId}`)
2. Search modal carries the same context identifier
3. Search results return to the SAME select menu (via UPDATE_MESSAGE)
4. Item selection → Select menu handler determines "what next" based on its own identity
5. Modal submission → Just updates data + shows ephemeral confirmation (NO NAVIGATION!)

**Therefore**: Modal custom_id doesn't need context tracking at all!

### Impact
- ✅ Fixed 100% failure rate for long item IDs accessed via player admin search
- ✅ Reduced max custom_id length from 101 → 88 characters (13-char buffer)
- ✅ Simplified code (9 lines removed, easier to maintain)
- ✅ No breaking changes (both code paths work identically)

### Lessons for Future Search Implementations
1. **Don't encode context in modals** - Use the select menu custom_id instead
2. **Keep custom_ids under 85 chars** - Leave 15-char buffer for safety
3. **Use session storage for complex state** - When custom_id approaches 85+ chars
4. **Modal submissions rarely need navigation context** - They typically just update data