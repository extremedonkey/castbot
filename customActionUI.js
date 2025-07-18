// Custom Action UI Module for Safari Map Locations
// Handles the new trigger-based action system for map coordinates

import { SAFARI_LIMITS } from './config/safariLimits.js';
import { loadEntity, updateEntity } from './entityManager.js';
import { loadSafariContent } from './safariManager.js';

/**
 * Create the custom action selection UI for a map coordinate
 * @param {Object} params
 * @param {string} params.guildId - Guild ID
 * @param {string} params.coordinate - Map coordinate (e.g. "A1")
 * @param {string} params.mapId - Map ID
 * @returns {Object} Discord Components V2 UI
 */
export async function createCustomActionSelectionUI({ guildId, coordinate, mapId }) {
  // Import Discord.js builders - matching stores pattern exactly
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  
  // Load all safari buttons (now custom actions)
  const allSafariContent = await loadSafariContent();
  const guildData = allSafariContent[guildId] || {};
  const allActions = guildData.buttons || {};
  const assignedActionIds = guildData.maps?.[mapId]?.coordinates?.[coordinate]?.buttons || [];
  
  // Build select menu using Discord.js builder
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`entity_custom_action_list_${coordinate}_${mapId}`)
    .setPlaceholder("Select an action to manage...")
    .setMinValues(1)
    .setMaxValues(1); // Single select for managing actions
  
  // Add "Create New" option first
  selectMenu.addOptions({
    label: "➕ Create New Custom Action",
    value: "create_new",
    description: "Design a new interactive action"
  });
  
  // Add existing actions
  let optionCount = 1;
  for (const [actionId, action] of Object.entries(allActions)) {
    if (optionCount >= 25) break; // Discord limit
    
    const option = {
      label: (action.name || action.label || 'Unnamed Action').substring(0, 100),
      value: actionId,
      description: assignedActionIds.includes(actionId) ? "Already assigned here" : "Click to assign/edit",
      default: assignedActionIds.includes(actionId)
    };
    
    // Skip emoji entirely to avoid any issues
    selectMenu.addOptions(option);
    optionCount++;
  }
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  // Create container like stores handler
  const container = {
    type: 17, // Container
    accent_color: 0x3498db,
    components: [
      {
        type: 10, // Text Display  
        content: `## ⚡ Custom Actions for ${coordinate}\n\nSelect an action to manage or create a new one.`
      },
      { type: 14 }, // Separator
      selectRow.toJSON() // Convert to JSON
    ]
  };
  
  // Return exactly like stores handler
  return {
    components: [container]
  };
}

/**
 * Create the custom action editor UI
 * @param {Object} params
 * @param {string} params.guildId - Guild ID
 * @param {string} params.actionId - Action ID (or "new" for new action)
 * @param {string} params.coordinate - Map coordinate (optional)
 * @returns {Object} Discord Components V2 UI
 */
export async function createCustomActionEditorUI({ guildId, actionId, coordinate }) {
  const allSafariContent = await loadSafariContent();
  const guildData = allSafariContent[guildId] || {};
  let action = actionId === 'new' ? createDefaultAction() : guildData.buttons?.[actionId];
  
  if (!action) {
    throw new Error('Action not found');
  }
  
  // Ensure action has new structure
  action = ensureActionStructure(action);
  
  // Pre-populate coordinate if provided and not already assigned
  if (coordinate && !action.coordinates?.includes(coordinate)) {
    if (!action.coordinates) {
      action.coordinates = [];
    }
    action.coordinates.push(coordinate);
    
    // Also update the coordinate's buttons array (bidirectional sync)
    const activeMapId = allSafariContent[guildId]?.maps?.active;
    if (activeMapId && allSafariContent[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate]) {
      const coordData = allSafariContent[guildId].maps[activeMapId].coordinates[coordinate];
      if (!coordData.buttons) {
        coordData.buttons = [];
      }
      if (!coordData.buttons.includes(actionId)) {
        coordData.buttons.push(actionId);
      }
    }
    
    // Save the coordinate assignment immediately
    const { saveSafariContent } = await import('./safariManager.js');
    await saveSafariContent(allSafariContent);
  }
  
  const triggerType = action.trigger?.type || 'button';
  const conditionLogic = action.conditions?.logic || 'AND';
  const conditionCount = action.conditions?.items?.length || 0;
  const coordinateCount = action.coordinates?.length || 0;
  
  return {
    components: [{
      type: 17, // Container
      accent_color: 0x5865f2,
      components: [
        // Header
        {
          type: 10,
          content: `## ⚡ Custom Action Editor\n\n**Name:** ${action.name || 'New Action'}\n**Description:** ${action.description || 'No description'}`
        },
        { type: 14 }, // Separator
        
        // Trigger Configuration Section
        {
          type: 9, // Section
          components: [{
            type: 10,
            content: `**Trigger Type:** ${getTriggerTypeLabel(triggerType)}\n${getTriggerDescription(action.trigger)}`
          }],
          accessory: {
            type: 2, // Button
            custom_id: `entity_action_trigger_${actionId}`,
            label: "Configure",
            style: 2,
            emoji: { name: "🎯" }
          }
        },
        
        // Conditions Section
        {
          type: 9, // Section
          components: [{
            type: 10,
            content: `**Conditions (${conditionLogic}):** ${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`
          }],
          accessory: {
            type: 2,
            custom_id: `entity_action_conditions_${actionId}`,
            label: "Edit",
            style: 2,
            emoji: { name: "🔧" }
          }
        },
        
        // Coordinates Section
        {
          type: 9, // Section
          components: [{
            type: 10,
            content: `**Assigned Locations:** ${formatCoordinateList(action.coordinates)}`
          }],
          accessory: {
            type: 2,
            custom_id: `entity_action_coords_${actionId}`,
            label: "Manage",
            style: 2,
            emoji: { name: "📍" }
          }
        },
        
        { type: 14 }, // Separator
        
        // Actions Configuration (existing functionality)
        {
          type: 10,
          content: `### Actions (${action.actions?.length || 0}/${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON})`
        },
        
        // Display existing actions
        ...getActionListComponents(action.actions || []),
        
        // Action buttons
        {
          type: 1, // Action Row
          components: [
            {
              type: 2,
              custom_id: `safari_add_action_${actionId}`,
              label: "Add Action",
              style: 3, // Success
              emoji: { name: "➕" },
              disabled: (action.actions?.length || 0) >= SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON
            },
            {
              type: 2,
              custom_id: `custom_action_test_${actionId}`,
              label: "Test Action",
              style: 1, // Primary
              emoji: { name: "🧪" },
              disabled: !action.actions?.length
            },
            {
              type: 2,
              custom_id: `safari_finish_button_${actionId}`,
              label: "Close",
              style: 3, // Success
              emoji: { name: "✅" }
            }
          ]
        }
      ]
    }]
  };
}

/**
 * Helper functions
 */

function formatCoordinateList(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return '0 coordinates';
  }
  
  // Sort coordinates alphabetically
  const sortedCoords = [...coordinates].sort();
  
  if (sortedCoords.length === 1) {
    return sortedCoords[0];
  }
  
  // Join with commas and truncate if too long
  const joinedCoords = sortedCoords.join(', ');
  const maxLength = 50; // Approximate line length before wrapping
  
  if (joinedCoords.length <= maxLength) {
    return joinedCoords;
  }
  
  // Truncate and add ellipsis
  let truncated = '';
  let currentLength = 0;
  
  for (let i = 0; i < sortedCoords.length; i++) {
    const coord = sortedCoords[i];
    const addition = i === 0 ? coord : `, ${coord}`;
    
    if (currentLength + addition.length + 3 > maxLength) { // +3 for "..."
      truncated += '...';
      break;
    }
    
    truncated += addition;
    currentLength += addition.length;
  }
  
  return truncated;
}

function getActionListComponents(actions) {
  if (!actions || actions.length === 0) {
    return [];
  }
  
  const components = [];
  
  actions.forEach((action, index) => {
    components.push({
      type: 9, // Section
      components: [{
        type: 10,
        content: getActionSummary(action, index + 1)
      }],
      accessory: {
        type: 2,
        custom_id: `safari_remove_action_${index}`,
        label: "Remove",
        style: 4, // Danger
        emoji: { name: "🗑️" }
      }
    });
  });
  
  return components;
}

function getActionSummary(action, number) {
  switch (action.type) {
    case 'display_text':
      return `**${number}. Display Text**\n${action.text?.substring(0, 50)}${action.text?.length > 50 ? '...' : ''}`;
    case 'give_item':
      return `**${number}. Give Item**\nItem: ${action.itemId} x${action.quantity || 1}`;
    case 'give_currency':
      return `**${number}. Give Currency**\nAmount: ${action.amount}`;
    case 'create_button':
      return `**${number}. Create Button**\nLabel: ${action.buttonLabel}`;
    default:
      return `**${number}. ${action.type || 'Unknown Action'}**`;
  }
}

function createDefaultAction() {
  return {
    name: 'New Custom Action',
    description: '',
    trigger: {
      type: 'button',
      button: {
        label: 'Click Me',
        emoji: '⚡',
        style: 1
      }
    },
    conditions: {
      logic: 'AND',
      items: []
    },
    actions: [],
    coordinates: []
  };
}

function ensureActionStructure(action) {
  // Migrate legacy button to new structure
  if (!action.trigger) {
    action.trigger = {
      type: 'button',
      button: {
        label: action.label || 'Action',
        emoji: action.emoji,
        style: action.style || 1
      }
    };
  }
  
  if (!action.name) {
    action.name = action.label || 'Unnamed Action';
  }
  
  if (!action.conditions) {
    action.conditions = {
      logic: 'AND',
      items: []
    };
  }
  
  if (!action.coordinates) {
    action.coordinates = [];
  }
  
  return action;
}

function getTriggerTypeLabel(type) {
  const labels = {
    button: '🔘 Button Click',
    modal: '💬 Text Input',
    select: '📋 Select Menu'
  };
  return labels[type] || '❓ Unknown';
}

function getTriggerDescription(trigger) {
  if (!trigger) return 'Not configured';
  
  switch (trigger.type) {
    case 'button':
      return `Label: "${trigger.button?.label || 'Not set'}"`;
    case 'modal':
      const keywords = trigger.modal?.keywords?.join(', ') || 'None';
      return `Keywords: ${keywords}`;
    case 'select':
      const optionCount = trigger.select?.options?.length || 0;
      return `${optionCount} option${optionCount !== 1 ? 's' : ''}`;
    default:
      return 'Unknown trigger type';
  }
}

/**
 * Create trigger configuration UI
 */
export async function createTriggerConfigUI({ guildId, actionId }) {
  const allSafariContent = await loadSafariContent();
  const guildData = allSafariContent[guildId] || {};
  const action = guildData.buttons?.[actionId] || createDefaultAction();
  
  return {
    components: [{
      type: 17, // Container
      components: [
        {
          type: 10,
          content: `## 🎯 Trigger Configuration\n\nChoose how players will activate this action:`
        },
        { type: 14 },
        {
          type: 1, // Action Row
          components: [{
            type: 3, // String Select
            custom_id: `custom_action_trigger_type_${actionId}`,
            placeholder: "Select trigger type",
            options: [
              {
                label: "Button Click",
                value: "button",
                description: "Player clicks a button",
                emoji: { name: "🔘" },
                default: action.trigger?.type === 'button'
              },
              {
                label: "Text Input",
                value: "modal",
                description: "Player types specific text",
                emoji: { name: "💬" },
                default: action.trigger?.type === 'modal'
              },
              {
                label: "Select Menu",
                value: "select",
                description: "Player selects from options",
                emoji: { name: "📋" },
                default: action.trigger?.type === 'select'
              }
            ]
          }]
        }
      ]
    }]
  };
}

/**
 * Create conditions configuration UI
 */
export async function createConditionsConfigUI({ guildId, actionId }) {
  const allSafariContent = await loadSafariContent();
  const guildData = allSafariContent[guildId] || {};
  const action = guildData.buttons?.[actionId] || createDefaultAction();
  const conditions = action.conditions || { logic: 'AND', items: [] };
  
  const components = [
    {
      type: 10,
      content: `## 🔧 Action Conditions\n\nSet requirements that must be met before this action can be triggered:`
    },
    { type: 14 }
  ];
  
  // Logic selector
  components.push({
    type: 1, // Action Row
    components: [{
      type: 3, // String Select
      custom_id: `custom_action_condition_logic_${actionId}`,
      placeholder: "Condition logic",
      options: [
        {
          label: "ALL conditions must be met (AND)",
          value: "AND",
          emoji: { name: "🔀" },
          default: conditions.logic === 'AND'
        },
        {
          label: "ANY condition must be met (OR)",
          value: "OR",
          emoji: { name: "🔁" },
          default: conditions.logic === 'OR'
        }
      ]
    }]
  });
  
  // Display existing conditions
  if (conditions.items?.length > 0) {
    components.push({ type: 14, spacing: 1 });
    conditions.items.forEach((condition, index) => {
      components.push({
        type: 9, // Section
        components: [{
          type: 10,
          content: getConditionDescription(condition)
        }],
        accessory: {
          type: 2,
          custom_id: `custom_action_remove_condition_${actionId}_${index}`,
          label: "Remove",
          style: 4, // Danger
          emoji: { name: "🗑️" }
        }
      });
    });
  }
  
  // Add condition button
  components.push({ type: 14, spacing: 1 });
  components.push({
    type: 1, // Action Row
    components: [{
      type: 2,
      custom_id: `custom_action_add_condition_${actionId}`,
      label: "Add Condition",
      style: 1, // Primary
      emoji: { name: "➕" }
    }]
  });
  
  return {
    components: [{
      type: 17, // Container
      components
    }]
  };
}

function getConditionDescription(condition) {
  switch (condition.type) {
    case 'has_item':
      return `**Has Item:** ${condition.itemId} (×${condition.quantity || 1})`;
    case 'has_currency':
      return `**Has Currency:** ${condition.operator || '>='} ${condition.amount}`;
    case 'at_coordinate':
      return `**At Location:** ${condition.coordinate}`;
    default:
      return `**Unknown condition type**`;
  }
}

/**
 * Create coordinate management UI
 */
export async function createCoordinateManagementUI({ guildId, actionId }) {
  const allSafariContent = await loadSafariContent();
  const guildData = allSafariContent[guildId] || {};
  const action = guildData.buttons?.[actionId];
  
  if (!action) {
    throw new Error('Action not found');
  }
  
  const coordinates = action.coordinates || [];
  const components = [
    {
      type: 10,
      content: `## 📍 Coordinate Management\n\n**Action:** ${action.name || 'Unnamed Action'}\n\nManage which map locations can trigger this action:`
    },
    { type: 14 }
  ];
  
  // Display current coordinates
  if (coordinates.length > 0) {
    components.push({
      type: 10,
      content: `### Currently Assigned (${coordinates.length}):`
    });
    
    coordinates.forEach((coord, index) => {
      components.push({
        type: 9, // Section
        components: [{
          type: 10,
          content: `**${coord}**`
        }],
        accessory: {
          type: 2,
          custom_id: `remove_coord_${actionId}_${coord}`,
          label: "Remove",
          style: 4, // Danger
          emoji: { name: "🗑️" }
        }
      });
    });
  } else {
    components.push({
      type: 10,
      content: `*No coordinates assigned yet*`
    });
  }
  
  // Add coordinate input with back button
  components.push({ type: 14, spacing: 1 });
  components.push({
    type: 1, // Action Row
    components: [
      {
        type: 2,
        custom_id: `custom_action_editor_${actionId}`,
        label: "← Back",
        style: 2, // Secondary (grey)
        emoji: { name: "🔙" }
      },
      {
        type: 2,
        custom_id: `add_coord_modal_${actionId}`,
        label: "Add Coordinate",
        style: 1, // Primary
        emoji: { name: "➕" }
      }
    ]
  });
  
  return {
    components: [{
      type: 17, // Container
      components
    }]
  };
}

export default {
  createCustomActionSelectionUI,
  createCustomActionEditorUI,
  createTriggerConfigUI,
  createConditionsConfigUI,
  createCoordinateManagementUI
};