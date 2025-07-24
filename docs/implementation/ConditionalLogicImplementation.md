# Conditional Logic Implementation Guide

## Phase 1: Foundation (Day 1)

### 1.1 Button Registration
Add to `buttonHandlerFactory.js`:
```javascript
// Base condition management buttons
'condition_manager': { 
  label: 'Conditions', 
  emoji: '🔧', 
  style: 'Secondary',
  description: 'Manage action conditions'
},
'condition_edit': { 
  label: 'Edit', 
  emoji: '✏️', 
  style: 'Secondary' 
},
'condition_up': { 
  label: '', 
  emoji: '⬆️', 
  style: 'Secondary' 
},
'condition_down': { 
  label: '', 
  emoji: '⬇️', 
  style: 'Secondary' 
},
'condition_delete': { 
  label: 'Delete', 
  emoji: '🗑️', 
  style: 'Danger' 
},
'condition_logic_and': { 
  label: 'AND', 
  emoji: '🔀', 
  style: 'Primary' 
},
'condition_logic_or': { 
  label: 'OR', 
  emoji: '🔁', 
  style: 'Secondary' 
},
'condition_add': { 
  label: 'Add Condition', 
  emoji: '➕', 
  style: 'Primary' 
},
'condition_manager_back': { 
  label: '← Back', 
  emoji: '⚡', 
  style: 'Secondary' 
},

// Condition editor specific
'condition_operator_active': {
  style: 'Primary'  // Active state
},
'condition_operator_inactive': {
  style: 'Secondary'  // Inactive state
},
'condition_set_currency': {
  label: 'Set Currency',
  emoji: '🪙',
  style: 'Primary'
},
'condition_editor_back': {
  label: '← Back',
  emoji: '🧩',
  style: 'Secondary'
}
```

### 1.2 Condition Manager Function
Create in `customActionUI.js`:
```javascript
export async function refreshConditionManagerUI(res, actionId, guildId, currentPage = 0) {
  const conditionsPerPage = 3;
  const allSafariContent = await loadSafariContent();
  const action = allSafariContent[guildId]?.buttons?.[actionId];
  
  if (!action) {
    throw new Error('Action not found');
  }
  
  // Ensure conditions array exists
  if (!action.conditions) {
    action.conditions = [];
  }
  
  const conditions = action.conditions;
  const totalPages = Math.max(1, Math.ceil(conditions.length / conditionsPerPage));
  const startIndex = currentPage * conditionsPerPage;
  const endIndex = Math.min(startIndex + conditionsPerPage, conditions.length);
  
  const components = [];
  
  // Header
  const pageInfo = conditions.length <= conditionsPerPage 
    ? '' 
    : ` (Page ${currentPage + 1}/${totalPages})`;
    
  components.push({
    type: 10, // Text Display
    content: `## 🧩 Condition Manager${pageInfo}\nIf the following is true...`
  });
  
  // Show conditions for current page
  if (conditions.length === 0) {
    components.push({
      type: 10,
      content: '*No conditions defined yet*'
    });
  } else {
    for (let i = startIndex; i < endIndex; i++) {
      const condition = conditions[i];
      const isLast = i === conditions.length - 1;
      
      // Condition summary
      components.push({
        type: 10,
        content: `**${i + 1}.** ${getConditionSummary(condition)}`
      });
      
      // Action buttons row
      const rowComponents = [
        {
          type: 2, // Edit button
          custom_id: `condition_edit_${actionId}_${i}_${currentPage}`,
          label: 'Edit',
          style: 2,
          emoji: { name: '✏️' }
        },
        {
          type: 2, // Up button
          custom_id: `condition_up_${actionId}_${i}_${currentPage}`,
          label: '',
          style: 2,
          emoji: { name: '⬆️' },
          disabled: i === 0
        },
        {
          type: 2, // Down button
          custom_id: `condition_down_${actionId}_${i}_${currentPage}`,
          label: '',
          style: 2,
          emoji: { name: '⬇️' },
          disabled: i === conditions.length - 1
        },
        {
          type: 2, // Delete button
          custom_id: `condition_delete_${actionId}_${i}_${currentPage}`,
          label: 'Delete',
          style: 4,
          emoji: { name: '🗑️' }
        }
      ];
      
      // Add logic toggle if not last condition
      if (!isLast) {
        rowComponents.push({
          type: 2, // Logic toggle
          custom_id: `condition_logic_${actionId}_${i}_${currentPage}`,
          label: condition.logic || 'AND',
          style: condition.logic === 'OR' ? 2 : 1,
          emoji: { name: condition.logic === 'OR' ? '🔁' : '🔀' }
        });
      }
      
      components.push({
        type: 1, // Action Row
        components: rowComponents
      });
    }
  }
  
  // Management buttons
  const managementRow = {
    type: 1, // Action Row
    components: [
      {
        type: 2,
        custom_id: `custom_action_editor_${actionId}`,
        label: '← Back',
        style: 2,
        emoji: { name: '⚡' }
      },
      {
        type: 2,
        custom_id: `condition_add_${actionId}_${currentPage}`,
        label: 'Add Condition',
        style: 1,
        emoji: { name: '➕' }
      }
    ]
  };
  
  components.push(managementRow);
  
  // Create container
  const container = {
    type: 17, // Container
    accent_color: 0x5865f2,
    components: components
  };
  
  // Navigation if needed
  const navComponents = [];
  if (conditions.length > conditionsPerPage) {
    navComponents.push({
      type: 1, // Action Row
      components: [
        {
          type: 2,
          custom_id: `condition_nav_prev_${actionId}_${currentPage}`,
          label: '◀',
          style: currentPage === 0 ? 2 : 1,
          disabled: currentPage === 0
        },
        {
          type: 2,
          custom_id: `condition_nav_next_${actionId}_${currentPage}`,
          label: '▶',
          style: currentPage === totalPages - 1 ? 2 : 1,
          disabled: currentPage === totalPages - 1
        }
      ]
    });
  }
  
  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: [container, ...navComponents]
    }
  });
}
```

## Phase 2: Condition Editor (Day 2)

### 2.1 Editor UI Function
```javascript
export async function showConditionEditor(res, actionId, conditionIndex, guildId) {
  const allSafariContent = await loadSafariContent();
  const action = allSafariContent[guildId]?.buttons?.[actionId];
  const condition = conditionIndex === 'new' 
    ? createDefaultCondition() 
    : action?.conditions?.[conditionIndex];
    
  if (!condition) {
    throw new Error('Condition not found');
  }
  
  const components = [
    {
      type: 10,
      content: '## ➕ Condition Editor\nWhen...'
    },
    {
      type: 1, // Action Row - Type selector
      components: [{
        type: 3, // String Select
        custom_id: `condition_type_select_${actionId}_${conditionIndex}`,
        placeholder: 'Select Condition Type...',
        options: [
          {
            label: 'Currency',
            value: 'currency',
            description: "User's currency is greater/less than or equal to a value",
            emoji: { name: '🪙' },
            default: condition.type === 'currency'
          },
          {
            label: 'Item',
            value: 'item',
            description: "User has/doesn't have item",
            emoji: { name: '📦' },
            default: condition.type === 'item'
          },
          {
            label: 'Role',
            value: 'role',
            description: "User has/doesn't have role",
            emoji: { name: '👑' },
            default: condition.type === 'role'
          }
        ]
      }]
    }
  ];
  
  // Add separator if type selected
  if (condition.type) {
    components.push({ type: 14 }); // Separator
    
    // Type-specific UI
    switch (condition.type) {
      case 'currency':
        components.push(...createCurrencyConditionUI(condition, actionId, conditionIndex));
        break;
      case 'item':
        components.push(...createItemConditionUI(condition, actionId, conditionIndex, guildId));
        break;
      case 'role':
        components.push(...createRoleConditionUI(condition, actionId, conditionIndex));
        break;
    }
  }
  
  // Back button
  components.push({
    type: 1, // Action Row
    components: [{
      type: 2,
      custom_id: `condition_manager_${actionId}_0`, // Return to page 0
      label: '← Back',
      style: 2,
      emoji: { name: '🧩' }
    }]
  });
  
  const container = {
    type: 17,
    accent_color: 0x5865f2,
    components: components
  };
  
  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: (1 << 15),
      components: [container]
    }
  });
}
```

## Phase 3: Evaluation Engine (Day 3)

### 3.1 Core Evaluator
Create in `safariActionExecutor.js`:
```javascript
export async function evaluateConditions(conditions, context) {
  if (!conditions || conditions.length === 0) {
    return true; // No conditions = always pass
  }
  
  const { playerData, guildId, userId } = context;
  const player = playerData[guildId]?.players?.[userId];
  
  if (!player) {
    console.error(`Player ${userId} not found for condition evaluation`);
    return false;
  }
  
  let accumulator = null;
  
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    const result = await evaluateSingleCondition(condition, player, context);
    
    console.log(`Condition ${i + 1}: ${getConditionSummary(condition)} = ${result}`);
    
    if (i === 0) {
      accumulator = result;
      continue;
    }
    
    // Apply previous condition's logic operator
    const prevLogic = conditions[i - 1].logic || 'AND';
    
    // Short-circuit evaluation
    if (prevLogic === 'AND' && !accumulator) {
      console.log('Short-circuit: AND with false accumulator');
      return false;
    }
    if (prevLogic === 'OR' && accumulator) {
      console.log('Short-circuit: OR with true accumulator');
      return true;
    }
    
    // Apply logic
    if (prevLogic === 'AND') {
      accumulator = accumulator && result;
    } else if (prevLogic === 'OR') {
      accumulator = accumulator || result;
    }
    
    console.log(`After ${prevLogic}: accumulator = ${accumulator}`);
  }
  
  return accumulator;
}

async function evaluateSingleCondition(condition, player, context) {
  switch (condition.type) {
    case 'currency':
      const currency = player.safari?.currency || 0;
      switch (condition.operator) {
        case 'gte':
          return currency >= condition.value;
        case 'lte':
          return currency <= condition.value;
        case 'eq_zero':
          return currency === 0;
        default:
          return false;
      }
      
    case 'item':
      const hasItem = player.safari?.inventory?.[condition.itemId]?.quantity > 0;
      return condition.operator === 'has' ? hasItem : !hasItem;
      
    case 'role':
      const member = context.member;
      const hasRole = member?.roles?.includes(condition.roleId);
      return condition.operator === 'has' ? hasRole : !hasRole;
      
    default:
      console.error(`Unknown condition type: ${condition.type}`);
      return false;
  }
}
```

## Phase 4: Integration (Day 4)

### 4.1 Update Action Execution
In `safariActionExecutor.js`:
```javascript
// Before executing actions, check conditions
if (button.conditions && button.conditions.length > 0) {
  const conditionsPassed = await evaluateConditions(button.conditions, {
    playerData,
    guildId,
    userId,
    member
  });
  
  if (!conditionsPassed) {
    // Execute false path actions if they exist
    if (button.actions?.false && button.actions.false.length > 0) {
      return executeActions(button.actions.false, context);
    }
    
    // Default failure message
    return {
      content: 'You do not meet the requirements for this action.',
      ephemeral: true,
      flags: InteractionResponseFlags.EPHEMERAL
    };
  }
}

// Conditions passed (or no conditions), execute main actions
const actionsToExecute = button.actions?.true || button.actions || [];
return executeActions(actionsToExecute, context);
```

## Critical Implementation Notes

### State Persistence
- Condition index + page must be tracked through all UI transitions
- Currency values persist in condition object
- Selected operators saved immediately on toggle

### Error Handling
```javascript
// Wrap all condition operations
try {
  await evaluateConditions(conditions, context);
} catch (error) {
  console.error('Condition evaluation error:', error);
  // Fail safely - treat as condition not met
  return false;
}
```

### Migration Approach
1. Mark old conditional actions with `legacy: true`
2. Show warning in UI: "⚠️ Legacy conditional - please recreate"
3. Provide "Convert" button that opens new editor with defaults
4. After 30 days, auto-disable legacy conditionals

### Testing Checklist
- [ ] Empty conditions array
- [ ] Single condition (no logic operator)
- [ ] Multiple AND conditions
- [ ] Multiple OR conditions  
- [ ] Mixed AND/OR logic
- [ ] Deleted items in conditions
- [ ] Missing player data
- [ ] Invalid role IDs
- [ ] Negative currency values
- [ ] Pagination with 4+ conditions