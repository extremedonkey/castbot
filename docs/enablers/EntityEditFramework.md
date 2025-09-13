# Entity Edit Framework

## ⚠️ IMPORTANT: When NOT to Use This Framework

**DO NOT USE** when:
1. User asks for something "like [existing simple pattern]"
2. You only need a single select menu
3. The interaction only has 1-3 components
4. No field validation is required
5. No multi-step process is needed

**Example from Custom Actions Sprint**:
```javascript
// ❌ WRONG: Using Entity Framework for "like stores"
if (fieldGroup === 'interaction') {
  return createEntityManagementUI({...}); // 500+ lines of complex UI
}

// ✅ RIGHT: Simple pattern matching stores
if (fieldGroup === 'interaction') {
  return {
    components: [{ 
      type: 17,
      components: [
        { type: 10, content: "Select actions" },
        { type: 14 },
        selectMenu.toJSON()
      ]
    }]
  };
}
```

## Overview

The Entity Edit Framework is a comprehensive, reusable UI/UX system for managing Safari content in CastBot. It provides a standardized way to create, read, update, and delete (CRUD) various entity types through Discord's interface.

**⚠️ IMPORTANT: This is a complex framework for advanced entity management. For simple UI needs (like select menus or basic forms), use simpler patterns first. Only use this framework when you need full CRUD operations with multiple entity types.**

## Architecture Components

### Core Modules

#### 1. `entityManager.js`
**Purpose**: Handles all CRUD operations for Safari entities

**Key Functions**:

##### Data Loading Operations
- `loadEntities(guildId, entityType)` - Load all entities of a type
  - Returns object with all entities keyed by ID
  - Initializes empty object if no data exists
  
- `loadEntity(guildId, entityType, entityId)` - Load single entity
  - Returns entity object or null if not found
  - Useful for checking entity existence

##### Data Modification Operations
- `updateEntity(guildId, entityType, entityId, updates)` - Full entity update
  - Merges updates with existing entity
  - Automatically updates `metadata.lastModified`
  - Validates entity exists before updating
  
- `updateEntityFields(guildId, entityType, entityId, fieldUpdates)` - Targeted field updates
  - Updates specific fields without replacing entire entity
  - Supports nested field updates (e.g., `settings.storeownerText`)
  - Special handling for map_cell baseContent fields
  
- `createEntity(guildId, entityType, entityData, userId)` - Create new entity
  - Auto-generates appropriate ID based on entity type
  - Applies entity-specific defaults (prices, limits, etc.)
  - Validates against SAFARI_LIMITS before creation
  - Adds metadata (createdBy, createdAt, lastModified)
  
- `deleteEntity(guildId, entityType, entityId)` - Delete entity
  - Removes entity from storage
  - Cleans up references in other entities
  - Returns success boolean

##### Search Functionality

**Backend Search (entityManager.js):**
- `searchEntities(guildId, entityType, searchTerm)` - Search entities by term
  - **Search Fields**:
    - Entity name or label
    - Description
    - Metadata tags (if present)
  - **Search Method**: Case-insensitive substring matching
  - **Returns**: Filtered object containing only matching entities
  - **Usage Example**:
    ```javascript
    // Search for all items containing "sword"
    const results = await searchEntities(guildId, 'item', 'sword');
    ```

**UI Search (entityManagementUI.js):**
- `filterEntities(entities, searchTerm)` - Client-side entity filtering
  - **Search Fields**:
    - Entity name or label (primary)
    - Description (secondary)
  - **Search Method**: Case-insensitive substring matching
  - **UI Integration**:
    - Auto-appears when >10 entities exist
    - Triggered via "🔍 Search" dropdown option
    - Opens modal for search term input
    - Results displayed in filtered dropdown
    - Search term shown in placeholder
  - **Usage Flow**:
    1. User selects "🔍 Search" from dropdown
    2. Modal appears for search input
    3. System calls `filterEntities()` with term
    4. Filtered results replace dropdown options
    5. Search persists until cleared
  - **Purpose of Search**:
    - Primary goal: Work around Discord's 25-option limit in string selects
    - When you have 100+ items, search lets users filter to find what they need
    - Without search, only the first 25 items would be accessible
  - **Search Limitations**:
    - Still limited to showing 25 filtered results at once (Discord API limit)
    - Store item selector shows "Too many results" warning for >24 matches
    - Users need to refine search if too many items match their term
    - Search requires manual refresh after entity creation/deletion
  - **Special Behaviors**:
    - Map item selection: Searches available items for drop locations
    - Store management: Maintains selected items during search (prevents accidental deselection)
    - Entity creation: "Create New" option always appears first, even when searching

**Supported Entity Types**:
- `item` - Safari items (inventory objects)
- `store` - Safari stores (shops with items)
- `safari_button` - Custom Safari buttons (interactive elements)
- `safari_config` - Safari configuration (guild settings)
- `map_cell` - Map exploration coordinates (special handling)

#### 2. `editFramework.js`
**Purpose**: Defines edit configurations and UI builders for each entity type

**Key Components**:
- `EDIT_CONFIGS` - Configuration for each entity type
- `EditInterfaceBuilder` - Creates edit interfaces
- `PropertiesEditor` - Creates property edit modals
- `DeleteConfirmation` - Creates delete confirmations

**Configuration Structure**:
```javascript
EDIT_CONFIGS[entityType] = {
  displayName: 'Human-readable name',
  properties: {
    // Field definitions
    fieldName: {
      type: 'text|textarea|number|select|tags',
      maxLength: 100,
      required: true,
      label: 'Display Label'
    }
  },
  content: {
    type: 'actions|items|effects',
    label: 'Content Label',
    maxItems: 10,
    itemLabel: 'action',
    itemLabelPlural: 'actions'
  },
  operations: ['reorder', 'edit', 'delete', 'add', 'test']
}
```

#### 3. `entityManagementUI.js`
**Purpose**: Creates the main entity management interface

**Key Functions**:
- `createEntityManagementUI()` - Main selection interface
- `createEntityEditUI()` - Entity-specific edit interface
- `createFieldGroupEditUI()` - Field group editing (for safari_config)

#### 4. `fieldEditors.js`
**Purpose**: Specialized field editors for complex data types

**Key Editors**:
- Action editors (display_text, update_currency, etc.)
- Store item editors
- Configuration field editors

## Usage Patterns

### Button Handler Pattern

The framework uses a consistent button ID pattern for entity operations:

```javascript
// Entity selection
'entity_select' - Main entity type selection

// Entity operations
'entity_edit' - Switch to edit mode
'entity_view' - Switch to view mode
'entity_delete' - Delete entity
'entity_create' - Create new entity

// Field operations
'entity_field_edit_{entityType}_{entityId}_{fieldName}' - Edit specific field
'entity_field_group_{groupName}' - Edit field group (safari_config)
```

### Interaction Flow

1. **Entity Selection**
   ```
   User clicks "Manage Entities" →
   Shows entity type selection →
   User selects type (item/store/button) →
   Shows list of entities
   ```

2. **Entity Editing**
   ```
   User selects entity →
   Shows entity details in view mode →
   User clicks "Edit Mode" →
   Shows editable fields →
   User edits and saves
   ```

3. **Field Editing**
   ```
   User clicks field edit button →
   Shows modal for field type →
   User enters new value →
   System validates and saves
   ```

## Implementation Examples

### Creating a New Entity Type

1. **Add to EDIT_CONFIGS** in `editFramework.js`:
```javascript
EDIT_CONFIGS['new_entity'] = {
  displayName: 'New Entity',
  properties: {
    name: { 
      type: 'text', 
      maxLength: 50, 
      required: true, 
      label: 'Name' 
    },
    value: { 
      type: 'number', 
      min: 0, 
      max: 100, 
      required: true, 
      label: 'Value' 
    }
  },
  content: {
    type: 'attributes',
    label: 'Attributes',
    maxItems: 5
  },
  operations: ['edit', 'delete', 'add']
}
```

2. **Update entityManager.js** to handle the new type:
```javascript
function getEntityPath(entityType) {
  switch (entityType) {
    // ... existing cases
    case 'new_entity': return 'newEntities';
  }
}
```

3. **Add entity type to UI** in `entityManagementUI.js`:
```javascript
const ENTITY_TYPES = {
  // ... existing types
  new_entity: {
    label: 'New Entities',
    emoji: '🆕',
    description: 'Manage new entities'
  }
}
```

### Using the Framework in Button Handlers

```javascript
// Handle entity selection
if (custom_id === 'entity_select') {
  const selectedType = req.body.data.values[0];
  const { createEntityEditUI } = await import('./entityManagementUI.js');

  const ui = await createEntityEditUI({
    guildId,
    entityType: selectedType,
    mode: 'list'
  });

  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: ui
  });
}

// Handle search functionality
if (custom_id === 'search_entities') {
  // Show modal for search input
  return res.send({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: `entity_search_modal_${entityType}`,
      title: 'Search Entities',
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: 'search_term',
          label: 'Search Term',
          style: 1,
          placeholder: 'Enter name or description to search...',
          required: true
        }]
      }]
    }
  });
}

// Process search results
if (custom_id.startsWith('entity_search_modal_')) {
  const entityType = custom_id.split('_')[3];
  const searchTerm = req.body.data.components[0].components[0].value;
  const { createEntityManagementUI } = await import('./entityManagementUI.js');

  const ui = await createEntityManagementUI({
    guildId,
    entityType,
    searchTerm,  // Pass search term to filter results
    mode: 'edit'
  });

  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: ui
  });
}

// Handle entity editing
if (custom_id.startsWith('entity_field_edit_')) {
  const [, , , entityType, entityId, fieldName] = custom_id.split('_');
  const { updateEntityFields } = await import('./entityManager.js');
  
  // Get value from modal submission
  const newValue = // ... extract from modal
  
  await updateEntityFields(guildId, entityType, entityId, {
    [fieldName]: newValue
  });
  
  // Return updated UI
}
```

### Data Operations Examples

```javascript
import { 
  loadEntities, 
  searchEntities, 
  createEntity, 
  updateEntityFields,
  deleteEntity 
} from './entityManager.js';

// Load all items for a guild
const allItems = await loadEntities(guildId, 'item');

// Search for specific items
const swordItems = await searchEntities(guildId, 'item', 'sword');
const healingItems = await searchEntities(guildId, 'item', 'heal');

// Create a new item
const newItem = await createEntity(guildId, 'item', {
  name: 'Magic Sword',
  description: 'A powerful enchanted blade',
  basePrice: 100,
  category: 'Weapons',
  maxQuantity: 5
}, userId);

// Update specific fields
await updateEntityFields(guildId, 'item', newItem.id, {
  basePrice: 150,
  'metadata.tags': ['legendary', 'weapon', 'magic']
});

// Delete an item (with automatic cleanup)
const success = await deleteEntity(guildId, 'item', itemId);
```

## Components V2 Integration

The framework fully utilizes Discord's Components V2 architecture:

### Standard UI Pattern
```javascript
{
  flags: (1 << 15), // IS_COMPONENTS_V2
  components: [{
    type: 17, // Container
    accent_color: getAccentColor(entity),
    components: [
      // Header with entity info
      {
        type: 10, // Text Display
        content: `## 🎯 ${entity.name}\n${entity.description}`
      },
      // Entity fields in sections
      {
        type: 9, // Section
        components: [/* field displays */],
        accessory: /* edit button */
      },
      // Action buttons
      {
        type: 1, // Action Row
        components: [/* mode buttons */]
      }
    ]
  }]
}
```

## Validation System

The framework includes comprehensive validation:

```javascript
// Field validation
const errors = validateContent(entityType, data);
if (errors.length > 0) {
  return {
    content: `❌ Validation errors:\n${errors.join('\n')}`,
    flags: InteractionResponseFlags.EPHEMERAL
  };
}
```

**Validation Types**:
- Required fields
- Length limits
- Number ranges
- Pattern matching
- Custom validators

## Scalability Features

### 1. **Modular Design**
- Each entity type is independently configured
- New entity types can be added without modifying core code
- Field types are extensible

### 2. **Consistent Patterns**
- All entities follow same CRUD pattern
- Unified UI/UX across entity types
- Reusable validation logic

### 3. **Performance Optimization**
- Lazy loading of entity data
- Pagination for large lists
- Efficient update mechanisms

### 4. **Current Features**
- **Search functionality** - Already implemented via `searchEntities()`
  - Searches by name, description, and tags
  - Case-insensitive substring matching
  - Returns filtered results

### 5. **Future Extensions**
- Import/export functionality
- Bulk operations
- Advanced search/filtering (regex, field-specific)
- Audit logging
- Search result ranking/scoring

## When to Use This Framework

### ✅ Use Entity Edit Framework For:
- Managing multiple related entities (items, stores, buttons)
- Full CRUD operations (Create, Read, Update, Delete)
- Complex field validation and relationships
- Multi-step editing workflows
- Admin interfaces with many options

### ❌ DO NOT Use For:
- Simple select menus
- Basic form inputs
- Single-action buttons
- Quick configuration changes
- User-facing simple interactions

### 🎯 Example: Simple Pattern vs Entity Framework

**Simple Pattern (Preferred for basic needs):**
```javascript
// User wants to select from a list of actions
return {
  flags: (1 << 15),
  components: [{
    type: 17,
    components: [
      { type: 10, content: "Choose an action:" },
      {
        type: 1,
        components: [{
          type: 3, // String select
          custom_id: 'simple_select',
          options: [
            { label: 'Action 1', value: 'act1' },
            { label: 'Action 2', value: 'act2' }
          ]
        }]
      }
    ]
  }]
};
```

**Entity Framework (For complex management):**
```javascript
// Admin needs to manage items with multiple properties
const ui = await createEntityEditUI({
  guildId,
  entityType: 'item',
  mode: 'edit'
});
```

## Best Practices

### 1. **Entity Design**
- Keep entities focused and single-purpose
- Use meaningful field names
- Provide clear descriptions
- Set appropriate limits

### 2. **UI Consistency**
- Use standard edit/view/delete patterns
- Maintain visual hierarchy
- Provide clear feedback
- Handle errors gracefully

### 3. **Data Integrity**
- Always validate before saving
- Handle concurrent edits
- Clean up references on delete
- Maintain data consistency

### 4. **User Experience**
- Progressive disclosure of complexity
- Clear action labels
- Confirmation for destructive actions
- Helpful error messages

## Common Use Cases

### Safari Item Management
```javascript
// Creating items with effects
// Setting prices and quantities
// Managing item categories
// Tracking usage statistics
```

### Safari Store Configuration
```javascript
// Adding items to stores
// Setting store themes
// Managing inventory
// Configuring purchase limits
```

### Safari Button Creation
```javascript
// Defining button actions
// Setting conditions
// Creating action chains
// Testing button behavior
```

## Troubleshooting

### Common Issues

1. **"Entity not found" errors**
   - Check entityType spelling
   - Verify guild has entity data
   - Ensure proper initialization

2. **Modal submission failures**
   - Validate field types match
   - Check character limits
   - Verify required fields

3. **UI not updating**
   - Ensure proper response type
   - Check Components V2 format
   - Verify data changes saved

## Related Documentation

- [ButtonHandlerFactory.md](ButtonHandlerFactory.md) - Button implementation patterns
- [ComponentsV2.md](../standards/ComponentsV2.md) - Discord UI architecture
- [Safari.md](../features/Safari.md) - Safari system overview
- [SAFARI_LIMITS.js](../../config/safariLimits.js) - Configuration limits