// Custom Action UI Module for Safari Map Locations
// Handles the new trigger-based action system for map coordinates

import { SAFARI_LIMITS } from './config/safariLimits.js';
import { loadEntity, updateEntity } from './entityManager.js';
import { loadSafariContent } from './safariManager.js';

/**
 * Create the custom action selection UI for a map coordinate (or global if no coordinate)
 * @param {Object} params
 * @param {string} params.guildId - Guild ID
 * @param {string} [params.coordinate] - Map coordinate (e.g. "A1") - optional for global view
 * @param {string} [params.mapId] - Map ID - optional for global view
 * @returns {Object} Discord Components V2 UI
 */
export async function createCustomActionSelectionUI({ guildId, coordinate = null, mapId = null }) {
  // Import Discord.js builders - matching stores pattern exactly
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  
  // Load all safari buttons (now custom actions)
  const allSafariContent = await loadSafariContent();
  const guildData = allSafariContent[guildId] || {};
  const allActions = guildData.buttons || {};
  const assignedActionIds = coordinate && mapId ? (guildData.maps?.[mapId]?.coordinates?.[coordinate]?.buttons || []) : [];
  
  // Build select menu using Discord.js builder
  const customId = coordinate && mapId ? `entity_custom_action_list_${coordinate}_${mapId}` : 'entity_custom_action_list_global';
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Select an action to manage...")
    .setMinValues(1)
    .setMaxValues(1); // Single select for managing actions
  
  // Add "Create New" option first
  selectMenu.addOptions({
    label: "➕ Create New Custom Action",
    value: "create_new",
    description: "Design a new interactive action"
  });
  
  // Add existing actions sorted by lastModified (most recent first)
  const sortedActions = Object.entries(allActions)
    .map(([actionId, action]) => ({ actionId, action }))
    .sort((a, b) => {
      const aLastModified = a.action.metadata?.lastModified || 0;
      const bLastModified = b.action.metadata?.lastModified || 0;
      return bLastModified - aLastModified; // Descending order (newest first)
    })
    .slice(0, 24); // Limit to 24 to leave room for "Create New"
  
  for (const { actionId, action } of sortedActions) {
    // Create meaningful description showing action type and status
    let description;
    if (coordinate && mapId) {
      // Coordinate-specific view
      description = assignedActionIds.includes(actionId) ? "✅ Already assigned here" : "Click to assign/edit";
    } else {
      // Global view - show location info
      description = action.description || 'No description';
      if (action.coordinates && action.coordinates.length > 0) {
        description += ` • Locations: ${action.coordinates.slice(0, 3).join(', ')}${action.coordinates.length > 3 ? '...' : ''}`;
      }
    }
    
    // Add action count info
    const actionCount = action.actions?.length || 0;
    if (actionCount > 0) {
      description += ` • ${actionCount} action${actionCount !== 1 ? 's' : ''}`;
    }
    
    const option = {
      label: (action.name || action.label || 'Unnamed Action').substring(0, 100),
      value: actionId,
      description: description.substring(0, 100) // Discord limit
      // Removed default value - don't auto-select assigned actions for better UX
    };
    
    selectMenu.addOptions(option);
  }
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  // Create container like stores handler
  const container = {
    type: 17, // Container
    accent_color: 0x3498db,
    components: [
      {
        type: 10, // Text Display  
        content: coordinate && mapId ? 
          `## ⚡ Custom Actions for ${coordinate}\n\nSelect an action to manage or create a new one.` :
          `## ⚡ Custom Actions\n\nSelect an action to manage or create a new one.`
      },
      { type: 14 }, // Separator
      selectRow.toJSON() // Convert to JSON
    ]
  };
  
  // Return exactly like stores handler
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
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
export async function createCustomActionEditorUI({ guildId, actionId, coordinate, skipAutoSave = false }) {
  const allSafariContent = await loadSafariContent();
  const guildData = allSafariContent[guildId] || {};
  const guildItems = guildData.items || {};
  const guildButtons = guildData.buttons || {};
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
    
    // Only save if not skipping (used during creation flow)
    if (!skipAutoSave) {
      const { saveSafariContent } = await import('./safariManager.js');
      await saveSafariContent(allSafariContent);
    }
  }
  
  const triggerType = action.trigger?.type || 'button';
  const conditionLogic = action.conditions?.logic || 'AND';
  const conditionCount = Array.isArray(action.conditions) ? action.conditions.length : 0;
  const coordinateCount = action.coordinates?.length || 0;
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0x5865f2,
      components: [
        // Header
        {
          type: 10,
          content: `## ⚡ Custom Action Editor`
        },
        // Action Info Section with Accessory Button
        {
          type: 9, // Section
          components: [{
            type: 10, // Text Display
            content: `**Name:** ${action.name || 'New Action'}\n**Description:** ${action.description || 'No description'}`
          }],
          accessory: {
            type: 2, // Button
            custom_id: `entity_custom_action_edit_info_${actionId}`,
            label: 'Action Info',
            style: 2, // Secondary
            emoji: { name: '📝' }
          }
        },
        { type: 14 }, // Separator
        
        // Trigger Configuration Section
        {
          type: 9, // Section
          components: [{
            type: 10,
            content: `**Trigger Type:** ${getTriggerTypeLabel(triggerType)}`
          }],
          accessory: {
            type: 2, // Button
            custom_id: `entity_action_trigger_${actionId}`,
            label: "Manage",
            style: 2,
            emoji: { name: "⚡" }
          }
        },
        
        // Conditions Section
        {
          type: 9, // Section
          components: [{
            type: 10,
            content: `**Conditions:** ${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`
          }],
          accessory: {
            type: 2,
            custom_id: `condition_manager_${actionId}_0`, // Start at page 0
            label: "Manage",
            style: 2,
            emoji: { name: "🧩" }
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
            emoji: { name: "⚡" }
          }
        },
        
        { type: 14 }, // Separator
        
        // Split actions into TRUE and FALSE arrays
        ...(() => {
          const allActions = action.actions || [];
          const trueActions = allActions.filter(a => !a.executeOn || a.executeOn === 'true');
          const falseActions = allActions.filter(a => a.executeOn === 'false');
          
          const components = [];
          
          // TRUE Actions Section
          components.push({
            type: 10,
            content: `### ✅ Actions executed if Conditions Met (${trueActions.length}/${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON})`
          });
          
          // Display TRUE actions
          components.push(...getActionListComponents(trueActions, actionId, guildItems, guildButtons, 'true', allActions));
          
          // Divider between TRUE and FALSE sections
          components.push({ type: 14 }); // Separator
          
          // FALSE Actions Section
          components.push({
            type: 10,
            content: `### ❌ Actions executed if Conditions Not Met (${falseActions.length}/${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON})`
          });
          
          // Display FALSE actions or placeholder message
          if (falseActions.length === 0) {
            components.push({
              type: 10,
              content: '*No False conditions configured - display generic error message*'
            });
          } else {
            components.push(...getActionListComponents(falseActions, actionId, guildItems, guildButtons, 'false', allActions));
          }
          
          // Add Action Select Menu (if not at max)
          if (allActions.length < SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON) {
            components.push({ type: 14 }); // Separator before select menu
            components.push({
              type: 1, // Action Row
              components: [{
                type: 3, // String Select
                custom_id: `safari_action_type_select_${actionId}`,
                placeholder: 'Select action type to add...',
                options: [
                  { label: 'Display Text', value: 'display_text', emoji: { name: '📄' } },
                  { label: 'Give Currency', value: 'give_currency', emoji: { name: '🪙' } },
                  { label: 'Give Item', value: 'give_item', emoji: { name: '🎁' } },
                  { label: 'Follow-up Action', value: 'follow_up_button', emoji: { name: '🔗' } }
                ]
              }]
            });
          }
          
          return components;
        })(),
        
        // Divider above action buttons
        { type: 14 },
        
        // Action buttons
        {
          type: 1, // Action Row
          components: [
            {
              type: 2,
              custom_id: `safari_finish_button_${actionId}`,
              label: "← Location Manager",
              style: 2, // Secondary (grey)
              emoji: { name: "📍" }
            },
            {
              type: 2,
              custom_id: `custom_action_delete_${actionId}`,
              label: "Delete Action",
              style: 4, // Danger
              emoji: { name: "🗑️" }
            },
            {
              type: 2,
              custom_id: `custom_action_test_${actionId}`,
              label: triggerType === 'modal' ? "Test Command" : "Test Action",
              style: 2, // Secondary (grey)
              emoji: { name: triggerType === 'modal' ? "💬" : "🧪" },
              disabled: !action.actions?.length
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

function getActionListComponents(actions, actionId, guildItems = {}, guildButtons = {}, executeOn = 'true', allActions = null) {
  if (!actions || actions.length === 0) {
    return [];
  }
  
  const components = [];
  
  actions.forEach((action, index) => {
    // Find the actual index in the full actions array for proper removal
    const actualIndex = allActions ? allActions.findIndex(a => a === action) : index;
    
    components.push({
      type: 9, // Section
      components: [{
        type: 10,
        content: getActionSummary(action, index + 1, guildItems, guildButtons)
      }],
      accessory: {
        type: 2,
        custom_id: `safari_edit_action_${actionId}_${actualIndex}`,
        label: "Edit",
        style: 2, // Secondary (grey)
        emoji: { name: "📝" }
      }
    });
  });
  
  return components;
}

function getActionSummary(action, number, guildItems = {}, guildButtons = {}) {
  switch (action.type) {
    case 'display_text':
      // Handle new format (config.title/content) and legacy format (text)
      let displayText = '';
      if (action.config?.title) {
        // Show title if available
        displayText = action.config.title;
      } else if (action.config?.content) {
        // Show content if no title
        displayText = action.config.content;
      } else if (action.text) {
        // Legacy format fallback
        displayText = action.text;
      } else {
        displayText = 'No text configured';
      }
      
      // Truncate if too long
      const truncated = displayText.substring(0, 50);
      const ellipsis = displayText.length > 50 ? '...' : '';
      return `**\`${number}. Display Text\`** ${truncated}${ellipsis}`;
      
    case 'give_item':
      const itemId = action.config?.itemId || action.itemId;
      const item = guildItems[itemId];
      const itemName = item?.name || itemId || 'Unknown Item';
      const quantity = action.config?.quantity || action.quantity || 1;
      const limitText = action.config?.limit?.type ? ` (${action.config.limit.type.replace(/_/g, ' ')})` : '';
      return `**\`${number}. Give Item\`** ${itemName} x${quantity}${limitText}`;
    case 'give_currency':
      const amount = action.config?.amount || action.amount || 0;
      const currencyLimitText = action.config?.limit?.type ? ` (${action.config.limit.type.replace(/_/g, ' ')})` : '';
      const displayAmount = amount > 0 ? `+${amount}` : `${amount}`;
      return `**\`${number}. Give Currency\`** Amount: ${displayAmount}${currencyLimitText}`;
    case 'update_currency':
      return `**\`${number}. Update Currency\`** Amount: ${action.amount || 0}`;
    case 'follow_up_button':
    case 'follow_up':
      const followUpButtonId = action.config?.buttonId || action.buttonId;
      if (!followUpButtonId) {
        return `**\`${number}. Follow-up Action\`** Not configured`;
      }
      // Try to get button name from guildButtons 
      const followUpButton = guildButtons[followUpButtonId];
      const followUpButtonName = followUpButton?.name || followUpButton?.label || followUpButtonId;
      return `**\`${number}. Follow-up Action\`** ${followUpButtonName}`;
    case 'create_button':
      return `**\`${number}. Create Button\`** ${action.buttonLabel}`;
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
      const phrases = trigger.phrases || trigger.modal?.keywords || [];
      if (phrases.length === 0) {
        return `Command Phrases: None`;
      }
      return `Command Phrases: *${phrases.join(', ')}*`;
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
  const { ButtonBuilder, ActionRowBuilder } = await import('discord.js');
  
  // Base components for all trigger types
  const components = [
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
  ];
  
  // Add trigger-specific configuration based on current type
  if (action.trigger?.type === 'modal') {
    components.push({ type: 14 }); // Separator
    
    // Show current phrases if any
    const phrases = action.trigger?.phrases || [];
    if (phrases.length > 0) {
      components.push({
        type: 10,
        content: `### Command Phrases:\n*${phrases.join(', ')}*`
      });
    } else {
      components.push({
        type: 10,
        content: `### Command Phrases:\n*No phrases configured yet*`
      });
    }
    
    // Add configure button
    const configButton = new ButtonBuilder()
      .setCustomId(`configure_modal_trigger_${actionId}`)
      .setLabel('Configure Phrases')
      .setEmoji('💬')
      .setStyle(2); // Secondary
    
    const backButton = new ButtonBuilder()
      .setCustomId(`custom_action_editor_${actionId}`)
      .setLabel('⬅ Back')
      .setStyle(2);
    
    const buttonRow = new ActionRowBuilder().addComponents([backButton, configButton]);
    
    components.push({ type: 14 }); // Separator
    components.push(buttonRow.toJSON());
  } else if (action.trigger?.type === 'button') {
    // Show button preview
    components.push({ type: 14 });
    components.push({
      type: 10,
      content: `### Button Preview:\nLabel: ${action.trigger?.button?.label || action.label || 'Click Me'}\nEmoji: ${action.trigger?.button?.emoji || action.emoji || '⚡'}`
    });
  } else if (action.trigger?.type === 'select') {
    components.push({ type: 14 });
    components.push({
      type: 10,
      content: `### Select Menu Configuration:\n*Not yet implemented*`
    });
  }
  
  // Add back button for all trigger types (except modal which already has one)
  if (action.trigger?.type !== 'modal') {
    const backButton = new ButtonBuilder()
      .setCustomId(`custom_action_editor_${actionId}`)
      .setLabel('⬅ Back')
      .setStyle(2); // Secondary
    
    const backButtonRow = new ActionRowBuilder().addComponents([backButton]);
    
    components.push({ type: 14 }); // Separator
    components.push(backButtonRow.toJSON());
  }
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    ephemeral: true, // Admin-only trigger configuration - hidden from players
    components: [{
      type: 17, // Container
      components: components
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
    flags: (1 << 15), // IS_COMPONENTS_V2
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
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components
    }]
  };
}

/**
 * Create condition manager UI using Question Builder pattern
 * @param {Object} params
 * @param {Object} params.res - Express response object
 * @param {string} params.actionId - Action ID
 * @param {string} params.guildId - Guild ID
 * @param {number} params.currentPage - Current page number
 * @returns {Object} Discord response
 */
export async function refreshConditionManagerUI({ res, actionId, guildId, currentPage = 0 }) {
  const { InteractionResponseType } = await import('discord-interactions');
  const conditionsPerPage = 3;
  
  const allSafariContent = await loadSafariContent();
  const action = allSafariContent[guildId]?.buttons?.[actionId];
  
  if (!action) {
    throw new Error('Action not found');
  }
  
  // Ensure conditions is an array (legacy actions might have old structure)
  if (!Array.isArray(action.conditions)) {
    action.conditions = [];
  }
  
  const conditions = action.conditions;
  const totalPages = Math.max(1, Math.ceil(conditions.length / conditionsPerPage));
  const startIndex = currentPage * conditionsPerPage;
  const endIndex = Math.min(startIndex + conditionsPerPage, conditions.length);
  
  const components = [];
  
  // Header with pagination info
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
    // Load items for name lookup
    const items = allSafariContent[guildId]?.items || {};
    
    for (let i = startIndex; i < endIndex; i++) {
      const condition = conditions[i];
      const isLast = i === conditions.length - 1;
      
      // Condition summary
      components.push({
        type: 10,
        content: `**${i + 1}.** ${getConditionSummary(condition, items)}`
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
  
  // Add separator before management buttons
  components.push({ type: 14 }); // Separator
  
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
  
  // Create container with Components V2
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
      components: [container, ...navComponents]
    }
  });
}

/**
 * Get human-readable summary of a condition
 * @param {Object} condition - The condition object
 * @param {Object} items - Optional items object for name lookup
 */
function getConditionSummary(condition, items = {}) {
  if (!condition || !condition.type) {
    return 'Invalid condition';
  }
  
  switch (condition.type) {
    case 'currency':
      const currencyOp = {
        'gte': '≥',
        'lte': '≤',
        'eq_zero': '='
      }[condition.operator] || '?';
      const currencyValue = condition.operator === 'eq_zero' ? '0' : (condition.value || '?');
      return `Currency ${currencyOp} ${currencyValue} 🪙`;
      
    case 'item':
      // Look up item name from items object, fallback to ID
      const item = items[condition.itemId];
      const itemName = item?.name || condition.itemId || 'Unknown Item';
      return condition.operator === 'has' 
        ? `Has item: ${itemName}` 
        : `Does not have: ${itemName}`;
        
    case 'role':
      const roleName = condition.roleId ? `<@&${condition.roleId}>` : 'Unknown Role';
      return condition.operator === 'has'
        ? `Has role: ${roleName}`
        : `Does not have: ${roleName}`;
        
    default:
      return `Unknown condition type: ${condition.type}`;
  }
}

/**
 * Show condition editor UI
 * @param {Object} params
 * @param {Object} params.res - Express response object
 * @param {string} params.actionId - Action ID
 * @param {number} params.conditionIndex - Index of condition to edit
 * @param {string} params.guildId - Guild ID
 * @param {number} params.currentPage - Current page in condition manager
 * @returns {Object} Discord response
 */
export async function showConditionEditor({ res, actionId, conditionIndex, guildId, currentPage = 0 }) {
  const { InteractionResponseType } = await import('discord-interactions');
  
  const allSafariContent = await loadSafariContent();
  const action = allSafariContent[guildId]?.buttons?.[actionId];
  const condition = action?.conditions?.[conditionIndex];
  
  if (!action || !condition) {
    throw new Error('Action or condition not found');
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
        custom_id: `condition_type_select_${actionId}_${conditionIndex}_${currentPage}`,
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
        components.push(...createCurrencyConditionUI(condition, actionId, conditionIndex, currentPage));
        break;
      case 'item':
        components.push(...await createItemConditionUI(condition, actionId, conditionIndex, currentPage, guildId));
        break;
      case 'role':
        components.push(...createRoleConditionUI(condition, actionId, conditionIndex, currentPage));
        break;
    }
  }
  
  // Back button
  components.push({
    type: 1, // Action Row
    components: [{
      type: 2,
      custom_id: `condition_manager_${actionId}_${currentPage}`,
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
      components: [container]
    }
  });
}

/**
 * Create currency condition UI components
 */
function createCurrencyConditionUI(condition, actionId, conditionIndex, currentPage) {
  const components = [
    {
      type: 10,
      content: '### Currency Details\nWhen user\'s currency is...'
    },
    {
      type: 1, // Action Row - Operator buttons
      components: [
        {
          type: 2,
          custom_id: `condition_currency_gte_${actionId}_${conditionIndex}_${currentPage}`,
          label: '≥ Greater than or equal to',
          style: condition.operator === 'gte' ? 1 : 2, // Primary if active
          emoji: { name: '🔢' }
        },
        {
          type: 2,
          custom_id: `condition_currency_lte_${actionId}_${conditionIndex}_${currentPage}`,
          label: '≤ Less than or equal to',
          style: condition.operator === 'lte' ? 1 : 2,
          emoji: { name: '🔢' }
        },
        {
          type: 2,
          custom_id: `condition_currency_zero_${actionId}_${conditionIndex}_${currentPage}`,
          label: '= Exactly zero',
          style: condition.operator === 'eq_zero' ? 1 : 2,
          emoji: { name: '0️⃣' }
        }
      ]
    }
  ];
  
  // Show current value if not zero check
  if (condition.operator !== 'eq_zero') {
    components.push({
      type: 10,
      content: `**Current Value:** ${condition.value || 0} 🪙`
    });
    
    components.push({
      type: 1, // Action Row
      components: [{
        type: 2,
        custom_id: `condition_set_currency_${actionId}_${conditionIndex}_${currentPage}`,
        label: 'Set Currency Amount',
        style: 1, // Primary
        emoji: { name: '🪙' }
      }]
    });
  }
  
  return components;
}

/**
 * Create item condition UI components
 */
async function createItemConditionUI(condition, actionId, conditionIndex, currentPage, guildId) {
  const allSafariContent = await loadSafariContent();
  const items = allSafariContent[guildId]?.items || {};
  
  const components = [
    {
      type: 10,
      content: '### Item Details\nWhen user...'
    },
    {
      type: 1, // Action Row - Operator buttons
      components: [
        {
          type: 2,
          custom_id: `condition_has_${actionId}_${conditionIndex}_${currentPage}_item`,
          label: 'Has',
          style: condition.operator === 'has' ? 1 : 2,
          emoji: { name: '✅' }
        },
        {
          type: 2,
          custom_id: `condition_not_has_${actionId}_${conditionIndex}_${currentPage}_item`,
          label: 'Does not have',
          style: condition.operator === 'not_has' ? 1 : 2,
          emoji: { name: '❌' }
        }
      ]
    },
    {
      type: 10,
      content: 'the following item...'
    }
  ];
  
  // Item selector
  const itemOptions = Object.entries(items).map(([itemId, item]) => {
    // Parse emoji - handle both unicode and custom Discord emojis
    let emojiObj;
    if (item.emoji) {
      // Check if it's a custom Discord emoji format <:name:id>
      const customEmojiMatch = item.emoji.match(/^<:(\w+):(\d+)>$/);
      if (customEmojiMatch) {
        emojiObj = {
          id: customEmojiMatch[2],
          name: customEmojiMatch[1]
        };
      } else {
        // Regular unicode emoji - clean any trailing zero-width joiners
        const cleanEmoji = item.emoji.replace(/\u200D$/, '').trim();
        emojiObj = { name: cleanEmoji };
      }
    } else {
      emojiObj = { name: '📦' };
    }
    
    return {
      label: item.name || 'Unnamed Item',
      value: itemId,
      description: item.description?.substring(0, 100) || 'No description',
      emoji: emojiObj,
      default: condition.itemId === itemId
    };
  }).slice(0, 25); // Discord limit
  
  if (itemOptions.length > 0) {
    components.push({
      type: 1, // Action Row
      components: [{
        type: 3, // String Select
        custom_id: `condition_item_select_${actionId}_${conditionIndex}_${currentPage}`,
        placeholder: 'Select an item...',
        options: itemOptions
      }]
    });
  } else {
    components.push({
      type: 10,
      content: '*No items available. Create items in Safari menu first.*'
    });
  }
  
  return components;
}

/**
 * Create role condition UI components
 */
function createRoleConditionUI(condition, actionId, conditionIndex, currentPage) {
  const components = [
    {
      type: 10,
      content: '### Role Details\nWhen user...'
    },
    {
      type: 1, // Action Row - Operator buttons
      components: [
        {
          type: 2,
          custom_id: `condition_has_${actionId}_${conditionIndex}_${currentPage}_role`,
          label: 'Has',
          style: condition.operator === 'has' ? 1 : 2,
          emoji: { name: '✅' }
        },
        {
          type: 2,
          custom_id: `condition_not_has_${actionId}_${conditionIndex}_${currentPage}_role`,
          label: 'Does not have',
          style: condition.operator === 'not_has' ? 1 : 2,
          emoji: { name: '❌' }
        }
      ]
    },
    {
      type: 10,
      content: 'the following role...'
    },
    {
      type: 1, // Action Row
      components: [{
        type: 6, // Role Select (Discord native) - type 6, not 8!
        custom_id: `condition_role_select_${actionId}_${conditionIndex}_${currentPage}`,
        placeholder: 'Select a role...',
        default_values: condition.roleId ? [{
          id: condition.roleId,
          type: 'role'
        }] : []
      }]
    }
  ];
  
  return components;
}

export default {
  createCustomActionSelectionUI,
  createCustomActionEditorUI,
  createTriggerConfigUI,
  createConditionsConfigUI,
  createCoordinateManagementUI,
  refreshConditionManagerUI,
  showConditionEditor
};