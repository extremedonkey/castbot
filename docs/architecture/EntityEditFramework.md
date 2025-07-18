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
- `loadEntities(guildId, entityType)` - Load all entities of a type
- `loadEntity(guildId, entityType, entityId)` - Load single entity
- `updateEntity(guildId, entityType, entityId, updates)` - Update entity
- `createEntity(guildId, entityType, entityData, userId)` - Create new entity
- `deleteEntity(guildId, entityType, entityId)` - Delete entity
- `searchEntities(guildId, entityType, searchTerm)` - Search entities

**Supported Entity Types**:
- `item` - Safari items
- `store` - Safari stores
- `safari_button` - Custom Safari buttons
- `safari_config` - Safari configuration

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

### 4. **Future Extensions**
- Import/export functionality
- Bulk operations
- Advanced search/filtering
- Audit logging

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
- [ComponentsV2.md](ComponentsV2.md) - Discord UI architecture
- [Safari.md](../features/Safari.md) - Safari system overview
- [SAFARI_LIMITS.js](../../config/safariLimits.js) - Configuration limits