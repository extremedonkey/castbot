# Safari Conditional Logic System - Implementation Plan v2

## Executive Summary

The current Safari conditional logic system is broken and limited to single conditions. This document outlines a complete redesign using the proven Question Builder UI pattern, providing a paginated condition manager with inline AND/OR logic operators. The new system will support multiple conditions with clear evaluation paths while maintaining Discord's component limits.

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

### Core Concept: Linear Conditions with Logic Operators

Instead of complex nested trees, we'll use a linear list of conditions where each condition specifies how it relates to the next one. This simplifies both the UI and evaluation logic while supporting complex expressions.

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
  "conditions": [
    {
      "id": "cond_1",
      "type": "currency",
      "operator": "gte", // gte, lte, eq_zero
      "value": 80,
      "logic": "AND" // How this relates to the NEXT condition
    },
    {
      "id": "cond_2",
      "type": "item",
      "operator": "has", // has, not_has
      "itemId": "golden_key",
      "logic": "OR" // How this relates to the NEXT condition
    },
    {
      "id": "cond_3",
      "type": "role",
      "operator": "has",
      "roleId": "123456789"
      // No logic on last condition
    }
  ],
  "actions": {
    "true": [
      {
        "type": "display_text",
        "config": {
          "content": "The door opens with a satisfying click!",
          "imageUrl": "treasure_room.png"
        }
      }
    ],
    "false": [
      {
        "type": "display_text",
        "config": {
          "content": "The door remains locked. You need 80 coins AND either a golden key OR special access."
        }
      }
    ]
  }
}
```

This evaluates as: `(currency >= 80) AND ((has golden_key) OR (has role 123456789))`

### Condition Types

Based on user requirements, we'll support three core condition types:

#### 1. Currency Condition
- **Type**: `currency`
- **Operators**: 
  - `gte` - Greater than or equal to
  - `lte` - Less than or equal to  
  - `eq_zero` - Exactly zero
- **Value**: Number to compare against

#### 2. Item Condition
- **Type**: `item`
- **Operators**:
  - `has` - Has item in inventory
  - `not_has` - Does not have item
- **ItemId**: ID of the item to check

#### 3. Role Condition
- **Type**: `role`
- **Operators**:
  - `has` - Has Discord role
  - `not_has` - Does not have role
- **RoleId**: Discord role ID to check

## UI/UX Design

### Overview

The new UI leverages the proven Question Builder pattern to create two main interfaces:
1. **Condition Manager** - High-level view for managing multiple conditions
2. **Condition Editor** - Detailed view for configuring individual conditions

### 1.0 Condition Manager

Displays all conditions with pagination (3 per page) and inline logic operators.

```
┌─────────────────────────────────────────────┐
│ ## 🧩 Condition Manager                     │
│ If the following is true...                 │
├─────────────────────────────────────────────┤
│ **1.** Currency >= 80                       │
│ [✏️ Edit] [⬆️] [⬇️] [🗑️] [AND]            │
├─────────────────────────────────────────────┤
│ **2.** Has golden_key                       │
│ [✏️ Edit] [⬆️] [⬇️] [🗑️] [OR]             │
├─────────────────────────────────────────────┤
│ **3.** Has role VIP Access                  │
│ [✏️ Edit] [⬆️] [⬇️] [🗑️]                  │
├─────────────────────────────────────────────┤
│ [⚡ ← Back] [➕ Add Condition]               │
└─────────────────────────────────────────────┘
```

**Key Features:**
- Each condition shows its summary text
- Boolean button (AND/OR) shows active logic and toggles when clicked
- Edit/Up/Down/Delete buttons match Question Builder pattern
- Pagination controls appear when >3 conditions
- All changes auto-save to underlying JSON

### 2.0 Condition Editor

Detailed configuration for a single condition with type-specific UI.

#### Base Structure
```
┌─────────────────────────────────────────────┐
│ ## ➕ Condition Editor                       │
│ When...                                     │
├─────────────────────────────────────────────┤
│ [Select Condition Type...         ▼]        │
│   • Currency - User's currency comparison   │
│   • Item - User has/doesn't have item      │
│   • Role - User has/doesn't have role      │
├═════════════════════════════════════════════┤
│ [Type-specific UI appears below]            │
└─────────────────────────────────────────────┘
```

#### Currency Condition UI
```
├═════════════════════════════════════════════┤
│ ## Currency Details                         │
│ When user's currency is...                  │
├─────────────────────────────────────────────┤
│ [≥ Greater than or equal to] [≤] [= Zero]  │
├─────────────────────────────────────────────┤
│ 100 🪙 Coins                                │
├─────────────────────────────────────────────┤
│ [🪙 Set Currency]                           │
└─────────────────────────────────────────────┘
```

#### Item Condition UI
```
├═════════════════════════════════════════════┤
│ ## Item Details                             │
│ When user...                                │
├─────────────────────────────────────────────┤
│ [Has] [Does not have]                      │
├─────────────────────────────────────────────┤
│ the following item...                       │
├─────────────────────────────────────────────┤
│ [Select an item...                ▼]        │
└─────────────────────────────────────────────┘
```

#### Role Condition UI
```
├═════════════════════════════════════════════┤
│ ## Role Details                             │
│ When user...                                │
├─────────────────────────────────────────────┤
│ [Has] [Does not have]                      │
├─────────────────────────────────────────────┤
│ the following role...                       │
├─────────────────────────────────────────────┤
│ [Select a role...                 ▼]        │
└─────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Core Implementation (3-4 days)

1. **Update Data Model**
   ```javascript
   // customActionUI.js - Update action structure
   action.conditions = [
     {
       id: generateConditionId(),
       type: 'currency',
       operator: 'gte',
       value: 100,
       logic: 'AND' // Relates to next condition
     }
   ];
   ```

2. **Create Condition Manager**
   - Adapt `refreshQuestionManagementUI` pattern
   - 3 conditions per page
   - Boolean toggle buttons for AND/OR
   - Standard CRUD operations

3. **Create Condition Editor**
   - Type selector with 3 options
   - Dynamic UI based on type
   - Auto-save on changes
   - Modal for currency input

4. **Evaluation Engine**
   ```javascript
   async function evaluateConditions(conditions, playerData) {
     if (!conditions || conditions.length === 0) return true;
     
     let result = await evaluateCondition(conditions[0], playerData);
     
     for (let i = 1; i < conditions.length; i++) {
       const prevLogic = conditions[i-1].logic;
       const condResult = await evaluateCondition(conditions[i], playerData);
       
       if (prevLogic === 'AND') {
         result = result && condResult;
       } else if (prevLogic === 'OR') {
         result = result || condResult;
       }
     }
     
     return result;
   }
   ```

### Phase 2: UI Polish (2 days)

1. **Condition Summary Display**
   - Clear text representation
   - Proper emoji usage
   - Truncation for long values

2. **Button States**
   - Active/Inactive toggle styling
   - Disabled states for navigation
   - Proper button grouping

3. **Error Handling**
   - Invalid configurations
   - Missing data gracefully
   - Clear error messages

### Phase 3: Testing & Migration (1 day)

1. **Migration Script**
   - Force upgrade existing actions
   - Clean up old condition data
   - Preserve action configurations

2. **Test Cases**
   - Single conditions
   - Multiple AND conditions
   - Mixed AND/OR logic
   - Edge cases (empty, invalid)

## Key Implementation Details

### Button Handler Registration

All new buttons must be registered in `buttonHandlerFactory.js`:

```javascript
// Condition Manager buttons
'condition_edit': { label: 'Edit', emoji: '✏️', style: 'Secondary' },
'condition_up': { label: ' ', emoji: '⬆️', style: 'Secondary' },
'condition_down': { label: ' ', emoji: '⬇️', style: 'Secondary' },
'condition_delete': { label: 'Delete', emoji: '🗑️', style: 'Danger' },
'condition_logic_toggle': { label: 'AND/OR', emoji: '🔀', style: 'Primary' },
'condition_add': { label: 'Add Condition', emoji: '➕', style: 'Primary' },
'condition_back': { label: '← Back', emoji: '⚡', style: 'Secondary' },

// Condition Editor buttons
'condition_type_currency': { label: 'Currency', emoji: '🪙', style: 'Secondary' },
'condition_type_item': { label: 'Item', emoji: '📦', style: 'Secondary' },
'condition_type_role': { label: 'Role', emoji: '👑', style: 'Secondary' },
'condition_currency_gte': { label: '≥', style: 'Primary' },
'condition_currency_lte': { label: '≤', style: 'Secondary' },
'condition_currency_zero': { label: '= 0', style: 'Secondary' },
'condition_has': { label: 'Has', style: 'Primary' },
'condition_not_has': { label: 'Does not have', style: 'Secondary' },
```

### Custom ID Patterns

Following the Question Builder pattern:
- `condition_edit_{actionId}_{conditionIndex}_{currentPage}`
- `condition_logic_{actionId}_{conditionIndex}_{currentPage}`
- `condition_nav_prev_{actionId}_{currentPage}`
- `condition_nav_next_{actionId}_{currentPage}`

### State Management

Conditions are stored directly in the action:
```javascript
action.conditions = [
  { id, type, operator, value/itemId/roleId, logic }
];
```

### Evaluation Order

Conditions evaluate left to right with logic operators:
1. Evaluate first condition
2. For each subsequent condition:
   - Check previous condition's logic operator
   - Apply AND/OR operation
3. Return final boolean result

## Summary of Key Changes

### From Complex Trees to Linear Logic
- **Old**: Nested condition groups with complex tree structures
- **New**: Linear list of conditions with inline AND/OR operators
- **Benefit**: Simpler to understand, implement, and maintain

### From Modal Hell to Visual UI
- **Old**: Text modals requiring exact string matches
- **New**: Button-based UI with dropdowns and toggles
- **Benefit**: No typing errors, immediate visual feedback

### Leveraging Proven Patterns
- **Reusing**: Question Builder pagination and navigation
- **Adapting**: Edit/Up/Down/Delete button patterns
- **Adding**: Boolean toggle buttons for AND/OR logic

### Clear Evaluation Path
```
Example: (Currency >= 80) AND (Has golden_key OR Has VIP role)

Conditions:
1. Currency >= 80 [AND]
2. Has golden_key [OR] 
3. Has VIP role

Evaluates: true AND (false OR true) = true AND true = true
```

## Success Metrics

- Support complex conditions without nesting complexity
- Zero modal interactions for condition setup
- Maintain all state within Discord's 40-component limit
- Force upgrade with no backward compatibility needed
- Clear visual representation of logic flow

---

This implementation transforms Safari's broken conditional logic into a clean, visual system that's both powerful and user-friendly, leveraging existing UI patterns for consistency.