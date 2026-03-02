# Store Management Architecture

## Overview

The store management system provides context-aware store creation and management flows with shared utilities to eliminate code duplication.

## Core Components

### Shared Modal Utility

**Location**: `safariManager.js`
```javascript
createStoreModal(customId, title)
```

**Purpose**: Eliminates ~120 lines of duplicated modal creation code across multiple handlers.

**Usage**: All store creation flows use this shared utility instead of inline modal creation.

### Store Creation Flows

#### 1. Main Menu Store Creation
**Flow**: Main Menu → Safari → Stores → Create Store
**Modal Handler**: `safari_store_modal_redirect`
**Redirect**: Direct to new store's item management interface
**UX Rationale**: Users want to immediately add items to their new store

#### 2. Location Store Creation
**Flow**: Map Location → Stores → Create New Store
**Modal Handler**: `safari_store_modal_location_{entityId}`
**Redirect**: Returns to location store selector with new store visible
**UX Rationale**: Users want to stay in location management context

#### 3. Basic Store Creation
**Flow**: Legacy/other contexts
**Modal Handler**: `safari_store_modal`
**Redirect**: Basic success message

### Store Selector System

**Location**: `storeSelector.js`

**Key Function**: `createStoreSelectionUI(options)`

**Smart Sorting**:
- Prioritizes currently selected stores at the top of the list
- Purpose: Accessibility - ensures users can always see/remove their selected stores
- Prevents issues where selected stores are hidden below Discord's 25-option limit

**Actions Supported**:
- `manage_items` - Main store management (includes Create New Store option)
- `add_to_location` - Location store management (includes Create New Store + toggle behavior)

### Modal Handler Patterns

```javascript
// Shared utility usage
const { createStoreModal } = await import('./safariManager.js');
const modal = createStoreModal(customId, title);

// Context-specific handlers
'safari_store_modal_redirect' // Main menu → item management
'safari_store_modal_location_{entityId}' // Location → location selector
'safari_store_modal' // Basic creation
```

## Key Architectural Decisions

### 1. Context-Aware Redirects
Different creation contexts have different optimal post-creation destinations:
- **Item management**: For setting up the store
- **Location management**: For continued location configuration

### 2. Shared Utilities Over Duplication
The `createStoreModal()` utility eliminates massive code duplication while maintaining consistency across all creation flows.

### 3. Accessibility-First Design
Store selector smart sorting ensures selected items remain visible and manageable regardless of total store count.

## Integration Points

- **Entity Management UI**: Provides store item management interface
- **Map Cell Updates**: Updates anchor messages when stores added to locations
- **Safari Manager**: Core store creation and data persistence
- **Button Handler Factory**: Handles all store-related button interactions

## Common Modifications

### Adding New Store Creation Context
1. Create new modal handler with pattern `safari_store_modal_{context}_`
2. Use shared `createStoreModal()` utility
3. Implement context-appropriate redirect logic
4. Update store selector if needed

### Modifying Store Creation Fields
1. Update `createStoreModal()` utility in safariManager.js
2. All handlers automatically inherit changes
3. No need to update multiple modal creation locations

## Related Documentation

- [Safari.md](Safari.md) - Overall Safari system
- [EntityEditFramework.md](../enablers/EntityEditFramework.md) - Entity management patterns
- [ComponentsV2.md](../standards/ComponentsV2.md) - UI standards