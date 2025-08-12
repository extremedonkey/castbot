# Shared Item Search Component - Implementation Guide

## Goal
Extract duplicate item search logic from Safari Actions and Condition Manager into reusable module.

## Files to Create
- `itemSearchUI.js` - Shared search component

## Key Functions
```javascript
// itemSearchUI.js
export async function createItemSelectOptions({ guildId, alwaysShowSearch = true, selectedItemId })
export function createItemSearchModal(callbackCustomId) 
export async function searchItems({ guildId, searchTerm, maxResults = 25 })
export function createItemSelectComponent({ customId, options, placeholder })
```

## Integration Points
1. `condition_item_select_*` → Use `createItemSelectOptions()`
2. `safari_give_item_select_*` → Use `createItemSelectOptions()`
3. `item_search_modal::*` → Universal modal handler, routes based on callback prefix

## Migration Steps
1. Create itemSearchUI.js with shared functions
2. Update Condition Manager to use shared component
3. Test conditions thoroughly
4. Update Safari Actions to use shared component
5. Remove duplicate code from app.js handlers
6. Test both systems end-to-end

## State Preservation
Callback custom ID format: `item_search_modal::${originalCustomId}`
Parse on return to determine context and rebuild appropriate UI.

## Search Behavior
- Always show search option (no threshold)
- Search results show "refine search" option
- No auto-selection after search
- "no_results" handled gracefully
- Consistent with Safari Actions pattern