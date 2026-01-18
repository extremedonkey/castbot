# Clone Action Feature

## Overview

The Clone Action feature allows admins to duplicate existing Custom Actions, copying all their configurations (actions, conditions, triggers) while resetting usage-specific data. This enables rapid creation of similar actions without manual reconfiguration.

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    String Select Menu                           │
├─────────────────────────────────────────────────────────────────┤
│  1. ➕ Create New Custom Action                                 │
│  2. 🔍 Search Actions            (if >10 total)                 │
│  3. 🔄 Clone Action              ← NEW (if >0 actions)          │
│  4-24. Existing actions...                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                    User selects "Clone Action"
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│         Select Source Action to Clone                           │
├─────────────────────────────────────────────────────────────────┤
│  Header: "🔄 Clone Action - Select Source"                      │
│  1. 🔙 Back to all                                              │
│  2-24. Existing actions only (no Create/Search/Clone)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                    User selects source action
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Clone Action Modal                                 │
├─────────────────────────────────────────────────────────────────┤
│  Action Name: [{SourceName} (Copy)]  (required, pre-filled)     │
│  Emoji:       [🗺️________________]   (optional, pre-filled)     │
│  Description: [{SourceDescription}]  (optional, pre-filled)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                    User submits modal
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│         New Action Created & Editor Opens                       │
│  - All actions/conditions/trigger cloned                        │
│  - Coordinates: only current location (or empty if global)      │
│  - usageCount: 0, claimedBy arrays cleared                      │
└─────────────────────────────────────────────────────────────────┘
```

## Data Cloning Rules

### Fields That Are Deep Cloned

| Field | Clone Behavior |
|-------|----------------|
| `actions[]` | Deep clone all sub-actions with configs. Reset `claimedBy: []` in any limit configs |
| `conditions[]` | Deep clone (except `AT_LOCATION` conditions are removed) |
| `trigger` | Deep clone (button/modal/command config preserved) |
| `style` | Clone value |

### Fields That Are Reset/Generated

| Field | New Value |
|-------|-----------|
| `id` | Generate new unique ID: `{sanitized_name}_{timestamp}` |
| `name` | From modal input (pre-filled: `"{SourceName} (Copy)"`) |
| `label` | Same as name |
| `description` | From modal input (pre-filled: source description) |
| `emoji` | From modal input (pre-filled: source emoji) |
| `coordinates` | Only current coordinate if from map location, otherwise `[]` |
| `menuVisibility` | Reset to `'none'` |
| `showInInventory` | Remove (legacy field) |
| `metadata.usageCount` | `0` |
| `metadata.createdBy` | Current user ID |
| `metadata.createdAt` | Current timestamp |
| `metadata.lastModified` | Current timestamp |

### Special Handling

1. **Limit configs with `claimedBy`**: Reset to empty array `[]`
   ```javascript
   // Before clone
   { type: "once_per_player", claimedBy: ["user1", "user2"] }
   // After clone
   { type: "once_per_player", claimedBy: [] }
   ```

2. **AT_LOCATION conditions**: Removed during clone (legacy/location-specific)

3. **Coordinate context**:
   - From map location (e.g., `entity_field_group_map_cell_A1_interaction`): `coordinates: ['A1']`
   - From global view (`safari_action_editor`): `coordinates: []`

## Custom ID Patterns

| Component | Pattern | Example |
|-----------|---------|---------|
| Main dropdown | `entity_custom_action_list_{coord}_{mapId}` | `entity_custom_action_list_A1_map_10x10_123` |
| Main dropdown (global) | `entity_custom_action_list_global` | - |
| Clone source selection | `entity_clone_source_list_{coord}_{mapId}` | `entity_clone_source_list_A1_map_10x10_123` |
| Clone source selection (global) | `entity_clone_source_list_global` | - |
| Clone modal | `clone_action_modal_{sourceId}_{coord}` | `clone_action_modal_action123_A1` |
| Clone modal (global) | `clone_action_modal_{sourceId}_global` | `clone_action_modal_action123_global` |

## String Select Option Count

With Clone Action added:

| Total Actions | Create | Search | Clone | Action Slots | **Final Count** |
|---------------|--------|--------|-------|--------------|-----------------|
| 0 | 1 | ❌ | ❌ | 0 | **1** |
| 1 | 1 | ❌ | 1 | 1 | **3** |
| 5 | 1 | ❌ | 1 | 5 | **7** |
| 10 | 1 | ❌ | 1 | 10 | **12** |
| 11 | 1 | 1 | 1 | 11 | **14** |
| 21+ | 1 | 1 | 1 | 21 (capped) | **24** |

### Formula
```javascript
// Clone option only shown if totalActions > 0
const hasCloneOption = totalActions > 0;
const hasSearchOption = totalActions > 10;

if (totalActions === 0) {
    options = 1;  // Just Create New
} else if (totalActions <= 10) {
    options = 2 + totalActions;  // Create + Clone + actions
} else {
    options = 3 + min(totalActions, 21);  // Create + Search + Clone + actions (max 24)
}
```

## Implementation Files

| File | Changes |
|------|---------|
| `customActionUI.js` | Add Clone option to `createCustomActionSelectionUI()`, add `createCloneSourceSelectionUI()` |
| `app.js` | Add handlers for `clone_action` selection, `entity_clone_source_list_*`, `clone_action_modal_*` |
| `buttonHandlerFactory.js` | Register new button patterns in `BUTTON_REGISTRY` |

## Related Documentation

- [SafariCustomActions.md](SafariCustomActions.md) - Custom Action system overview
- [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) - Handler patterns
- [ComponentsV2.md](../standards/ComponentsV2.md) - UI component standards
