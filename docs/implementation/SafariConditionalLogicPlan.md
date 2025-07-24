# Safari Conditional Logic System - Comprehensive Improvement Plan

## Executive Summary

The current Safari conditional logic system is severely limited and broken. It only supports single conditions with basic success/failure paths, uses clunky modal-based UI, and cannot handle complex logical operations like AND/OR combinations. This document outlines a complete redesign to support sophisticated conditional logic that matches modern interactive fiction and game design standards.

## Current State Analysis

### What's Broken

1. **Single Condition Only**: No support for multiple conditions or logical operators
2. **Text-Based Configuration**: Users must type condition types and values in modals
3. **Limited Action Types**: Only basic actions supported in success/failure paths
4. **No Visual Builder**: No way to see or understand the logic flow
5. **Poor Error Handling**: Invalid configurations fail silently
6. **No Condition Grouping**: Cannot create complex nested logic

### Current Implementation

```javascript
// Current data structure (simplified)
{
  "type": "conditional",
  "config": {
    "condition": {"type": "currency_gte", "value": 50},
    "successActions": [{"type": "display_text", "config": {...}}],
    "failureMessage": "You need 50 coins!"
  }
}
```

**Problems**:
- Only one condition per action
- Success/failure are separate arrays (not a tree structure)
- No support for complex logic evaluation

### Current UI Flow

1. Click "Add Conditional Action" button
2. Fill out modal with 4 text fields:
   - Condition Type (must type exact string)
   - Condition Value 
   - Success Action Type
   - Failure Action Type
3. Hope it works (no validation or preview)

## Proposed System Design

### Core Concept: Logic Trees

Transform from linear actions to a proper logic tree structure that supports:
- Multiple conditions with AND/OR/NOT operators
- Nested condition groups
- Multiple execution paths
- Visual representation of logic flow

### New Data Structure

```javascript
{
  "id": "action_123",
  "name": "Treasure Room Entry",
  "trigger": {
    "type": "button",
    "label": "Enter the Chamber",
    "emoji": "🚪"
  },
  "logic": {
    "type": "condition_group",
    "operator": "AND", // AND, OR, NOT
    "conditions": [
      {
        "type": "comparison",
        "left": {
          "type": "player_attribute",
          "attribute": "currency"
        },
        "operator": ">=",
        "right": {
          "type": "value",
          "value": 80
        }
      },
      {
        "type": "condition_group",
        "operator": "OR",
        "conditions": [
          {
            "type": "comparison",
            "left": {
              "type": "player_inventory",
              "itemId": "golden_key"
            },
            "operator": "has",
            "right": {
              "type": "value",
              "value": 1
            }
          },
          {
            "type": "comparison",
            "left": {
              "type": "player_role",
              "roleId": "123456789"
            },
            "operator": "has"
          }
        ]
      }
    ],
    "true_path": {
      "actions": [
        {
          "type": "display_text",
          "config": {
            "content": "The door opens with a satisfying click!",
            "imageUrl": "treasure_room.png"
          }
        },
        {
          "type": "move_player",
          "config": {
            "coordinate": "B3"
          }
        }
      ]
    },
    "false_path": {
      "actions": [
        {
          "type": "display_text",
          "config": {
            "content": "The door remains locked. You need 80 coins AND either a golden key OR special access."
          }
        }
      ]
    }
  }
}
```

### Condition Types

#### Player Attributes
- `currency`: Player's current currency
- `stamina`: Current stamina points
- `hp`: Health points
- `custom_points`: Any custom point type

#### Inventory
- `has_item`: Check if player has specific item
- `item_quantity`: Check exact quantity
- `total_items`: Total number of items

#### Location
- `at_location`: Player at specific coordinate
- `visited_location`: Has visited before
- `locations_explored`: Number of locations explored

#### Roles & Permissions
- `has_role`: Player has Discord role
- `in_channel`: Player in specific channel
- `permission`: Has Discord permission

#### Time-Based
- `time_of_day`: Current server time
- `day_of_week`: Current day
- `elapsed_time`: Time since action/event
- `cooldown`: Action-specific cooldown

#### Safari State
- `button_used`: Times button has been used
- `quest_complete`: Specific quest finished
- `variable_value`: Custom variable state

#### Text Matching (for modals)
- `exact_match`: Exact text match
- `contains`: Contains substring
- `regex_match`: Regular expression
- `word_count`: Number of words

### Comparison Operators
- `==` Equal to
- `!=` Not equal to
- `>` Greater than
- `<` Less than
- `>=` Greater than or equal
- `<=` Less than or equal
- `has` Has item/role
- `!has` Doesn't have
- `contains` Text contains
- `matches` Regex match

## UI/UX Design

### Visual Logic Builder

Replace the current modal system with a visual builder:

```
┌─────────────────────────────────────────────┐
│ ⚡ Custom Action: Treasure Room Entry       │
├─────────────────────────────────────────────┤
│ Trigger: 🚪 Button "Enter the Chamber"      │
├─────────────────────────────────────────────┤
│ When triggered, check:                      │
│                                             │
│ ┌─[AND]─────────────────────────────────┐   │
│ │ ├─ 💰 Currency >= 80                  │   │
│ │ └─[OR]────────────────────────────┐   │   │
│ │   ├─ 🔑 Has golden_key (1)        │   │   │
│ │   └─ 👑 Has role "VIP Access"     │   │   │
│ └────────────────────────────────────┘   │   │
│                                             │
│ ✅ If TRUE:                                 │
│ ├─ 📄 Show "Door opens..." message         │
│ └─ 🗺️ Move to B3                           │
│                                             │
│ ❌ If FALSE:                                │
│ └─ 📄 Show "Door locked..." message        │
└─────────────────────────────────────────────┘
```

### Interactive Components

1. **Condition Builder**
   - Dropdown for condition type
   - Dynamic fields based on type
   - Add/Remove condition buttons
   - AND/OR toggle buttons
   - Drag to reorder/nest

2. **Action Builder**
   - Action type dropdown
   - Configuration based on type
   - Reorder actions
   - Test individual actions

3. **Live Preview**
   - Visual representation of logic
   - Highlight evaluation path
   - Show example outcomes

### Implementation Using Components V2

```javascript
// Main editor container
{
  type: 17, // Container
  components: [
    // Header section
    {
      type: 10, // Text Display
      content: "## ⚡ Logic Editor"
    },
    
    // Condition builder section
    {
      type: 9, // Section
      components: [{
        type: 10,
        content: "**Conditions:** Click to add"
      }],
      accessory: {
        type: 2, // Button
        custom_id: "add_condition_group",
        label: "Add Group",
        emoji: { name: "➕" }
      }
    },
    
    // Visual logic tree (simplified for Discord)
    {
      type: 10,
      content: "```\n[AND]\n├─ Currency >= 80\n└─ [OR]\n   ├─ Has golden_key\n   └─ Has VIP role\n```"
    },
    
    // Action configuration
    {
      type: 1, // Action Row
      components: [
        {
          type: 3, // String Select
          custom_id: "logic_operator",
          options: [
            { label: "AND - All must be true", value: "AND" },
            { label: "OR - Any can be true", value: "OR" },
            { label: "NOT - Invert result", value: "NOT" }
          ]
        }
      ]
    }
  ]
}
```

## Implementation Plan

### Phase 1: Data Model & Core Logic (1 week)

1. **Create new data structures**
   - Logic tree model
   - Condition evaluator engine
   - Action executor improvements

2. **Backward compatibility layer**
   - Convert old format to new
   - Migration utilities

3. **Core evaluation engine**
   ```javascript
   async function evaluateLogicTree(logic, context) {
     switch (logic.type) {
       case 'condition_group':
         return evaluateConditionGroup(logic, context);
       case 'comparison':
         return evaluateComparison(logic, context);
     }
   }
   ```

### Phase 2: Basic UI (1 week)

1. **Condition type selector**
   - String select with all condition types
   - Dynamic configuration UI

2. **Simple logic builder**
   - Add/remove conditions
   - AND/OR selection
   - Basic nesting (1 level)

3. **Action configuration**
   - Improved action UI
   - Path selection (true/false)

### Phase 3: Visual Builder (2 weeks)

1. **Logic tree visualization**
   - Text-based tree view
   - Collapsible groups
   - Evaluation preview

2. **Drag and drop**
   - Reorder conditions
   - Nest condition groups
   - Move between paths

3. **Testing interface**
   - Mock player state
   - Step through evaluation
   - See results

### Phase 4: Advanced Features (2 weeks)

1. **Template system**
   - Save logic templates
   - Import/export
   - Share between guilds

2. **Variables system**
   - Custom variables
   - Variable manipulation
   - Cross-action state

3. **Advanced triggers**
   - Time-based
   - Multi-trigger
   - Event listeners

## Migration Strategy

### Automatic Migration

Convert existing conditional actions:

```javascript
// Old format
{
  "type": "conditional",
  "config": {
    "condition": {"type": "currency_gte", "value": 50},
    "successActions": [...],
    "failureMessage": "Need 50 coins!"
  }
}

// Migrates to:
{
  "type": "logic_action",
  "logic": {
    "type": "comparison",
    "left": {"type": "player_attribute", "attribute": "currency"},
    "operator": ">=",
    "right": {"type": "value", "value": 50},
    "true_path": {"actions": [...]},
    "false_path": {"actions": [{
      "type": "display_text",
      "config": {"content": "Need 50 coins!"}
    }]}
  }
}
```

### UI Transition

1. Keep "Add Conditional Action" button
2. Open new UI instead of modal
3. Provide "Simple Mode" for basic conditions
4. "Advanced Mode" for full logic trees

## Performance Considerations

### Caching
- Cache evaluated conditions
- Invalidate on state change
- Batch evaluations

### Optimization
- Short-circuit evaluation
- Lazy loading of conditions
- Minimize Discord API calls

### Limits
- Max depth: 5 levels
- Max conditions: 50 per action
- Max actions: 20 per path

## Security Considerations

1. **Input Validation**
   - Sanitize all text inputs
   - Validate role/channel IDs
   - Prevent circular references

2. **Permission Checks**
   - Admin-only configuration
   - Player state isolation
   - Rate limiting

3. **Error Handling**
   - Graceful fallbacks
   - Clear error messages
   - Audit logging

## Questions for Clarification

1. **Complexity Level**: How complex should the logic trees be? Should we support:
   - Unlimited nesting depth?
   - Cross-references between actions?
   - Global variables that persist between actions?

2. **UI Preferences**: 
   - Should we keep ANY modal-based configuration?
   - Is text-based tree visualization sufficient or do you want graphical?
   - Should players see the logic tree or just results?

3. **Trigger Expansion**:
   - Priority for trigger types? (modal text, role select, time-based)
   - Should triggers have their own conditions?
   - Multiple triggers per action?

4. **Performance**:
   - Expected number of conditions per action?
   - How many custom actions per guild?
   - Real-time evaluation or cached?

5. **Migration**:
   - Force migrate all existing actions?
   - Maintain backward compatibility how long?
   - Beta test with specific guilds?

6. **Integration**:
   - Should conditions be reusable across actions?
   - Global condition library?
   - Integration with other CastBot features?

## Next Steps

1. Review and approve this plan
2. Answer clarification questions
3. Create detailed technical specifications
4. Build proof of concept for core logic engine
5. Iterate on UI mockups
6. Begin phased implementation

## Success Metrics

- Complex logic trees execute correctly
- UI intuitive enough for non-programmers
- Performance: <100ms evaluation time
- Zero data loss during migration
- 90% reduction in "interaction failed" errors
- Support for all example use cases provided

---

This plan transforms Safari's conditional logic from a basic single-condition system to a powerful, visual logic builder that rivals professional game development tools while remaining accessible to Discord server admins.