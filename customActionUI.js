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
  
  // Add search option if many actions
  const totalActions = Object.keys(allActions).length;
  if (totalActions > 10) {
    selectMenu.addOptions({
      label: "🔍 Search Actions",
      value: "search_actions",
      description: "Search through all custom actions"
    });
  }
  
  // Add existing actions in prioritized order
  const allActionEntries = Object.entries(allActions).map(([actionId, action]) => ({ actionId, action }));
  
  // Step 1: Get actions assigned to this coordinate (if coordinate-specific view)
  const assignedActions = coordinate && mapId ? 
    allActionEntries.filter(({ actionId }) => assignedActionIds.includes(actionId)) : [];
  
  // Step 2: Get unassigned actions, sorted by reverse creation order (newest first)
  const unassignedActions = allActionEntries
    .filter(({ actionId }) => !assignedActionIds.includes(actionId))
    .sort((a, b) => {
      const aLastModified = a.action.metadata?.lastModified || 0;
      const bLastModified = b.action.metadata?.lastModified || 0;
      return bLastModified - aLastModified; // Descending order (newest first)
    });
  
  // Step 3: Combine in required order: assigned actions first, then unassigned
  const sortedActions = [...assignedActions, ...unassignedActions]
    .slice(0, totalActions > 10 ? 22 : 24); // Leave room for Create New and Search if needed
  
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

  // Format conditions display
  const conditionsDisplay = await formatConditionsDisplay(action.conditions, guildItems);

  // Format name display based on trigger type
  let nameDisplay = action.name || 'New Action';
  if (triggerType === 'button') {
    const buttonLabel = action.trigger?.button?.label || 'Not set';
    const buttonEmoji = action.trigger?.button?.emoji || '';
    const emojiPrefix = buttonEmoji ? `${buttonEmoji} ` : '';
    nameDisplay = `**Name (Button Label)**\n${emojiPrefix}${buttonLabel}`;
  } else {
    nameDisplay = `**Name**\n${nameDisplay}`;
  }

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
            content: action.description ? `${nameDisplay}\n*${action.description}*` : nameDisplay
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
            content: `**Trigger Type**\n${getTriggerTypeLabel(triggerType)}`
          }],
          accessory: {
            type: 2, // Button
            custom_id: `entity_action_trigger_${actionId}`,
            label: "Manage",
            style: 2,
            emoji: { name: "🚀" }
          }
        },
        
        // Conditions Section
        {
          type: 9, // Section
          components: [{
            type: 10,
            content: `**Conditions (${conditionCount} set)**\n${conditionsDisplay}`
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
            content: triggerType === 'button'
              ? `**Assigned Locations (Adds button to coordinate anchor)**\n${formatCoordinateList(action.coordinates)}`
              : `**Assigned Locations**\n${formatCoordinateList(action.coordinates)}`
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
              content: '*No false conditions configured - display generic error message*'
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
                  { label: 'Give Role', value: 'give_role', emoji: { name: '👑' } },
                  { label: 'Remove Role', value: 'remove_role', emoji: { name: '🚫' } },
                  { label: 'Follow-up Action', value: 'follow_up_button', emoji: { name: '🔗' } },
                  { label: 'Calculate Results', value: 'calculate_results', emoji: { name: '🌾' } }
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
              custom_id: `custom_action_test_${actionId}`,
              label: "Force Trigger Action",
              style: 2, // Secondary (grey)
              emoji: { name: "⚡" },
              disabled: !action.actions?.length
            },
            {
              type: 2,
              custom_id: `custom_action_delete_${actionId}`,
              label: "Delete Action",
              style: 4, // Danger
              emoji: { name: "🗑️" }
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
    case 'give_role':
      const giveRoleId = action.config?.roleId || action.roleId;
      const executeOnGive = action.config?.executeOn || action.executeOn || 'true';
      const onGiveText = executeOnGive === 'true' ? 'conditions met' : 'conditions fail';
      return `**\`${number}. Give Role\`** Role ID: ${giveRoleId || 'Not selected'} (on ${onGiveText})`;
    case 'remove_role':
      const removeRoleId = action.config?.roleId || action.roleId;
      const executeOnRemove = action.config?.executeOn || action.executeOn || 'true';
      const onRemoveText = executeOnRemove === 'true' ? 'conditions met' : 'conditions fail';
      return `**\`${number}. Remove Role\`** Role ID: ${removeRoleId || 'Not selected'} (on ${onRemoveText})`;
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
    case 'calculate_results':
      // Check scope to determine display text
      const scope = action?.config?.scope || 'all_players';
      const scopeText = scope === 'single_player' ? 'Single Player' : 'All Players';
      return `**\`${number}. Calculate Results\`** ${scopeText}`;
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
    button: '🖱️ Button Click',
    modal: '⌨️ Text Command',
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

async function formatConditionsDisplay(conditions, guildItems = {}) {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return 'None set, action will always execute on trigger';
  }

  // Import the getConditionSummary function from safariManager
  const { getConditionSummary } = await import('./safariManager.js');

  const conditionStrings = conditions.map(condition => {
    let summary = '';

    switch (condition.type) {
      case 'currency':
        if (condition.operator === 'gte') {
          summary = `Currency ≥ ${condition.value}`;
        } else if (condition.operator === 'lte') {
          summary = `Currency ≤ ${condition.value}`;
        } else if (condition.operator === 'eq_zero') {
          summary = `Currency = 0`;
        }
        break;
      case 'item':
        const item = guildItems[condition.itemId];
        const itemName = item?.name || condition.itemId;
        const itemEmoji = item?.emoji || '';
        const emojiPrefix = itemEmoji ? `${itemEmoji} ` : '';
        summary = `${condition.operator === 'has' ? 'Has' : 'Does not have'} ${emojiPrefix}${itemName}`;
        break;
      case 'role':
        // Format role as Discord role mention
        summary = `${condition.operator === 'has' ? 'Has' : 'Does not have'} <@&${condition.roleId}>`;
        break;
      default:
        summary = getConditionSummary ? getConditionSummary(condition) : 'Unknown condition';
    }

    return summary;
  });

  return conditionStrings.join(', ');
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
      .setEmoji('⚡')
      .setStyle(2);
    
    const buttonRow = new ActionRowBuilder().addComponents([backButton, configButton]);
    
    components.push({ type: 14 }); // Separator
    components.push(buttonRow.toJSON());
  } else if (action.trigger?.type === 'button') {
    // Show button preview
    components.push({ type: 14 });

    const currentStyle = action.trigger?.button?.style || 'Primary';
    const styleLabel = {
      'Primary': 'Blue',
      'Secondary': 'Gray',
      'Success': 'Green',
      'Danger': 'Red'
    }[currentStyle] || 'Blue';

    components.push({
      type: 10,
      content: `### Button Preview:\nLabel: ${action.trigger?.button?.label || action.label || 'Click Me'}\nEmoji: ${action.trigger?.button?.emoji || action.emoji || '⚡'}\nColor: ${styleLabel} (${currentStyle})`
    });

    // Add button style selector
    components.push({
      type: 1, // Action Row
      components: [{
        type: 3, // String Select
        custom_id: `custom_action_button_style_${actionId}`,
        placeholder: "Select button color/style",
        options: [
          {
            label: 'Primary (Blue)',
            description: 'Blue button style',
            value: 'Primary',
            emoji: { name: '🔵' },
            default: currentStyle === 'Primary'
          },
          {
            label: 'Secondary (Gray)',
            description: 'Gray button style',
            value: 'Secondary',
            emoji: { name: '⚪' },
            default: currentStyle === 'Secondary'
          },
          {
            label: 'Success (Green)',
            description: 'Green button style',
            value: 'Success',
            emoji: { name: '🟢' },
            default: currentStyle === 'Success'
          },
          {
            label: 'Danger (Red)',
            description: 'Red button style',
            value: 'Danger',
            emoji: { name: '🔴' },
            default: currentStyle === 'Danger'
          }
        ]
      }]
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
      .setEmoji('⚡')
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
        emoji: { name: "⚡" }
      },
      {
        type: 2,
        custom_id: `add_coord_modal_${actionId}`,
        label: "Add Coordinate",
        style: 1, // Primary
        emoji: { name: "📍" }
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
  
  // Validate and fix operator if corrupted
  if (condition.operator !== 'has' && condition.operator !== 'not_has') {
    condition.operator = 'has';
  }
  
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
  
  // Import emoji parsing utility
  const { parseTextEmoji } = await import('./utils/emojiUtils.js');
  
  // ALWAYS add search option first
  const itemOptions = [{
    label: '🔍 Search Items...',
    value: 'search_items',
    description: 'Click to search for specific items'
  }];
  
  // Add items (max 24 since search takes 1 slot)
  Object.entries(items)
    .slice(0, 24)
    .forEach(([itemId, item]) => {
      // Use existing emoji parser that handles all formats properly
      const { cleanText, emoji } = parseTextEmoji(`${item.emoji || ''} ${item.name}`, '📦');
      
      itemOptions.push({
        label: cleanText || 'Unnamed Item',
        value: itemId,
        description: item.description?.substring(0, 100) || 'No description',
        emoji: emoji,
        default: condition.itemId === itemId
      });
    });
  
  // Ensure selected item is in the options if it exists but wasn't in first 24
  if (condition.itemId && !itemOptions.some(opt => opt.value === condition.itemId)) {
    const selectedItem = items[condition.itemId];
    if (selectedItem) {
      // Replace last item with the selected item to ensure it shows
      const { cleanText, emoji } = parseTextEmoji(`${selectedItem.emoji || ''} ${selectedItem.name}`, '📦');
      itemOptions[Math.min(itemOptions.length, 24)] = {
        label: cleanText || 'Unnamed Item',
        value: condition.itemId,
        description: selectedItem.description?.substring(0, 100) || 'No description',
        emoji: emoji,
        default: true
      };
    }
  }
  
  // Ensure at least one option is selected if none are
  const hasSelection = itemOptions.some(opt => opt.default);
  if (!hasSelection && itemOptions.length > 1) {
    // Select first actual item (not search)
    itemOptions[1].default = true;
  }
  
  components.push({
    type: 1, // Action Row
    components: [{
      type: 3, // String Select
      custom_id: `condition_item_select_${actionId}_${conditionIndex}_${currentPage}`,
      placeholder: 'Select an item...',
      options: itemOptions
    }]
  });
  
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

/**
 * Show configuration UI for display_text action
 */
export async function showDisplayTextConfig(guildId, buttonId, actionIndex) {
  // Load safari data to get existing action information
  const safariData = await loadSafariContent();
  const button = safariData[guildId]?.buttons?.[buttonId];
  
  let action = null;
  let isEdit = false;
  
  if (button && button.actions && button.actions[actionIndex]) {
    action = button.actions[actionIndex];
    isEdit = true;
  }
  
  // Build preview text for existing action
  let previewText = "No content configured yet";
  if (action && action.type === 'display_text') {
    const title = action.config?.title || action.title || '';
    const content = action.config?.content || action.content || '';
    
    if (title && content) {
      previewText = `**${title}**\n${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;
    } else if (content) {
      previewText = content.substring(0, 150) + (content.length > 150 ? '...' : '');
    } else if (title) {
      previewText = `**${title}**\n*No content*`;
    }
  }
  
  // Get accent color from action config (if configured)
  let accentColor = 0x3498db; // Default blue for text actions
  if (action?.config?.color) {
    try {
      // Parse color from various formats (#3498db, 3498db, 3447003)
      let colorStr = action.config.color.toString().replace('#', '');
      // If it's a valid hex color, parse it
      if (/^[0-9A-Fa-f]{6}$/.test(colorStr)) {
        accentColor = parseInt(colorStr, 16);
      }
    } catch (error) {
      console.log(`⚠️ Invalid color format: ${action.config.color}, using default`);
    }
  }

  // Build the configuration UI
  return {
    components: [{
      type: 17, // Container
      accent_color: accentColor,
      components: [
        {
          type: 10, // Text Display
          content: `## 📝 Display Text Configuration\n${isEdit ? 'Editing' : 'Creating'} text display action`
        },
        
        { type: 14 }, // Separator
        
        // Text preview
        {
          type: 10,
          content: `### Preview\n${previewText}`
        },
        
        // Image preview (if image URL is configured)
        ...(() => {
          const imageUrl = action?.config?.image || action?.image;
          if (imageUrl && imageUrl.trim() !== '') {
            try {
              // Basic URL validation - check if it looks like a URL
              new URL(imageUrl);
              
              return [{
                type: 12, // Media Gallery
                items: [{
                  media: { url: imageUrl },
                  description: action?.config?.title || action?.title || 'Display Text Image',
                  spoiler: false
                }]
              }];
            } catch (error) {
              // Invalid URL - show error message instead
              return [{
                type: 10, // Text Display
                content: `⚠️ **Invalid Image URL**: ${imageUrl.substring(0, 50)}${imageUrl.length > 50 ? '...' : ''}`
              }];
            }
          }
          return [];
        })(),
        
        { type: 14 }, // Separator
        
        // Execution Condition section
        {
          type: 10,
          content: '### Execution Condition\nWhen should this action be triggered?'
        },
        {
          type: 1, // Action Row
          components: [{
            type: 3, // String Select
            custom_id: `safari_display_text_execute_on_${buttonId}_${actionIndex}`,
            placeholder: 'Select when to execute...',
            options: [
              {
                label: 'Execute if all conditions are TRUE',
                value: 'true',
                description: 'Only execute when conditions are met',
                emoji: { name: '✅' },
                default: (action?.executeOn || 'true') === 'true'
              },
              {
                label: 'Execute if all conditions are FALSE',
                value: 'false',
                description: 'Only execute when conditions are NOT met',
                emoji: { name: '❌' },
                default: (action?.executeOn || 'true') === 'false'
              }
            ]
          }]
        },
        
        { type: 14 }, // Separator
        
        // Action buttons
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              custom_id: `safari_display_text_edit_${buttonId}_${actionIndex}`,
              label: 'Edit Text',
              style: 2, // Secondary
              emoji: { name: '✏️' }
            },
            {
              type: 2, // Button
              custom_id: `safari_remove_action_${buttonId}_${actionIndex}`,
              label: 'Delete Action',
              style: 4, // Danger (red)
              emoji: { name: '🗑️' }
            }
          ]
        },
        
        { type: 14 }, // Separator
        
        // Back button
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              custom_id: `custom_action_editor_${buttonId}`,
              label: '← Back',
              style: 2, // Secondary
              emoji: { name: '⚡' }
            }
          ]
        }
      ]
    }],
    flags: (1 << 15), // IS_COMPONENTS_V2
    ephemeral: true
  };
}

/**
 * Show configuration UI for calculate_results action
 */
export async function showCalculateResultsConfig(guildId, buttonId, actionIndex) {
  // Load safari data to get existing action information
  const safariData = await loadSafariContent();
  const button = safariData[guildId]?.buttons?.[buttonId];

  let action = null;
  let isEdit = false;

  if (button && button.actions && button.actions[actionIndex]) {
    action = button.actions[actionIndex];
    isEdit = true;
  }

  // Get current scope setting (default to all_players for backwards compatibility)
  const currentScope = action?.config?.scope || 'all_players';

  // Build preview text based on current configuration
  let previewText = "No configuration set yet";
  if (action && action.type === 'calculate_results') {
    if (currentScope === 'all_players') {
      previewText = "📊 **All Players**\n\nProcesses all eligible Safari players and updates their currency.";
    } else if (currentScope === 'single_player') {
      previewText = "👤 **Single Player**\n\nProcesses only the player who clicked this button and updates their currency.";
    }
  }

  // Build the configuration UI
  return {
    components: [{
      type: 17, // Container
      accent_color: 0x2ECC71, // Green accent for calculate results
      components: [
        {
          type: 10, // Text Display
          content: `## 🌾 Calculate Results Configuration`
        },

        { type: 14 }, // Separator

        {
          type: 10,
          content: "Calculate results will evaluate results for any players who have income-producing items. You can use it to create turn-based economy challenges, e.g., create a \"Farmers Market\" store that allows players to buy items that represent types of crops with different yields. Executing the custom action can represent a 'Harvest' which will then provide players with new income to spend."
        },

        { type: 14 }, // Separator

        // Scope Selection section
        {
          type: 10,
          content: '### Calculation Scope\nWhich players should receive income when this action is executed?'
        },
        {
          type: 1, // Action Row
          components: [{
            type: 3, // String Select
            custom_id: `safari_calculate_results_scope_${buttonId}_${actionIndex}`,
            placeholder: 'Select calculation scope...',
            options: [
              {
                label: 'All Players - Any user who triggers the action',
                value: 'all_players',
                description: 'Process all eligible Safari players (default)',
                emoji: { name: '📊' },
                default: currentScope === 'all_players'
              },
              {
                label: 'Single Player - Player who triggers the action',
                value: 'single_player',
                description: 'Process only the player who clicks this button',
                emoji: { name: '👤' },
                default: currentScope === 'single_player'
              }
            ]
          }]
        },

        { type: 14 }, // Separator

        // Execution Condition section
        {
          type: 10,
          content: '### Execution Condition\nWhen should this action be triggered?'
        },
        {
          type: 1, // Action Row
          components: [{
            type: 3, // String Select
            custom_id: `safari_calculate_results_execute_on_${buttonId}_${actionIndex}`,
            placeholder: 'Select when to execute...',
            options: [
              {
                label: 'Execute if all conditions are TRUE',
                value: 'true',
                description: 'Only execute when conditions are met',
                emoji: { name: '✅' },
                default: (action?.executeOn || 'true') === 'true'
              },
              {
                label: 'Execute if all conditions are FALSE',
                value: 'false',
                description: 'Only execute when conditions are NOT met',
                emoji: { name: '❌' },
                default: (action?.executeOn || 'true') === 'false'
              }
            ]
          }]
        },

        { type: 14 }, // Separator

        // Back and Delete Action buttons
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              custom_id: `custom_action_editor_${buttonId}`,
              label: '← Back',
              style: 2, // Secondary
              emoji: { name: '⚡' }
            },
            {
              type: 2, // Button
              custom_id: `safari_remove_action_${buttonId}_${actionIndex}`,
              label: 'Delete Action',
              style: 4, // Danger (red)
              emoji: { name: '🗑️' }
            }
          ]
        }
      ]
    }],
    flags: (1 << 15), // IS_COMPONENTS_V2
    ephemeral: true
  };
}

export async function handleDisplayTextEdit(guildId, userId, customId) {
  // Parse buttonId and actionIndex from custom_id
  const parts = customId.replace('safari_display_text_edit_', '').split('_');
  const actionIndex = parseInt(parts[parts.length - 1]);
  const buttonId = parts.slice(0, -1).join('_');
  
  console.log(`✏️ Editing display_text action ${actionIndex} for button ${buttonId}`);
  
  // Load existing action data
  const safariData = await loadSafariContent();
  const button = safariData[guildId]?.buttons?.[buttonId];
  const action = button?.actions?.[actionIndex];
  
  // If no action exists at this index, or it's not a display_text action, we're creating a new one
  // Only error if the button itself doesn't exist
  if (!button) {
    console.error(`❌ Button ${buttonId} not found in guild ${guildId}. It may have been deleted or the UI is showing stale data.`);
    
    // Check if button exists on any coordinate to provide more helpful message
    const maps = safariData[guildId]?.maps || {};
    const activeMapId = maps.active;
    const activeMap = maps[activeMapId];
    let foundOnCoordinate = null;
    
    if (activeMap?.coordinates) {
      for (const [coord, coordData] of Object.entries(activeMap.coordinates)) {
        if (coordData.buttons?.includes(buttonId)) {
          foundOnCoordinate = coord;
          break;
        }
      }
    }
    
    const errorMessage = foundOnCoordinate 
      ? `❌ Button "${buttonId}" was expected on coordinate ${foundOnCoordinate} but no longer exists in the button registry.\n\nThis can happen if:\n• The map was recreated\n• The button was deleted\n• You're viewing an old cached message\n\n**Solution:** Dismiss this message and navigate to the coordinate's Location Actions menu to create a new Custom Action.`
      : `❌ Button "${buttonId}" not found.\n\nThis button no longer exists in the system. This can happen if:\n• The map was recreated\n• The button was deleted\n• You're viewing an old cached message\n\n**Solution:** Dismiss this message and create a new Custom Action from the Location Actions menu.`;
    
    return {
      content: errorMessage,
      ephemeral: true
    };
  }
  
  // For existing actions, validate they are display_text type
  if (action && action.type !== 'display_text') {
    return {
      content: '❌ Action exists but is not a display text action.',
      ephemeral: true
    };
  }
  
  // Create modal with pre-filled values from existing action
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId(`safari_display_text_save_${buttonId}_${actionIndex}`)
    .setTitle(action ? 'Edit Text Display Action' : 'Create Text Display Action');

  const titleInput = new TextInputBuilder()
    .setCustomId('action_title')
    .setLabel('Title (optional)')
    .setPlaceholder('e.g., "Welcome to the Adventure!"')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setValue(action?.config?.title || action?.title || '');

  const contentInput = new TextInputBuilder()
    .setCustomId('action_content')
    .setLabel('Content')
    .setPlaceholder('The text to display when the button is clicked...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setValue(action?.config?.content || action?.content || '');

  const colorInput = new TextInputBuilder()
    .setCustomId('action_color')
    .setLabel('Accent Color (optional)')
    .setPlaceholder('e.g., #3498db or ff5722')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(10)
    .setValue(action?.config?.color || action?.color || '');

  const imageInput = new TextInputBuilder()
    .setCustomId('action_image')
    .setLabel('Image URL (Optional)')
    .setPlaceholder('Enter link of an image you have uploaded to Discord.')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setValue(action?.config?.image || action?.image || '');

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput),
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(imageInput)
  );
  
  console.log(`✅ SUCCESS: safari_display_text_edit - showing edit modal for ${buttonId}[${actionIndex}]`);
  return {
    type: 9, // MODAL
    data: modal.toJSON()
  };
}

export async function handleDisplayTextSave(guildId, customId, formData) {
  // Parse buttonId and actionIndex from custom_id: safari_display_text_save_buttonId_actionIndex
  const parts = customId.replace('safari_display_text_save_', '').split('_');
  const actionIndex = parseInt(parts[parts.length - 1]);
  const buttonId = parts.slice(0, -1).join('_');
  
  console.log(`💾 SAVE: safari_display_text_save - saving display_text for ${buttonId}[${actionIndex}]`);
  
  // Extract form data (executeOn now handled by entity string select)
  const components = formData.components;
  const title = components[0].components[0].value?.trim() || '';
  const content = components[1].components[0].value?.trim();
  const color = components[2].components[0].value?.trim() || '';
  const image = components[3].components[0].value?.trim() || '';
  
  if (!content) {
    return {
      content: '❌ Content is required for display text actions.',
      ephemeral: true
    };
  }
  
  // Load and update safari data
  const { saveSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const button = safariData[guildId]?.buttons?.[buttonId];
  
  if (!button) {
    console.error(`❌ Button ${buttonId} not found during save operation for guild ${guildId}`);
    return {
      content: `❌ Button "${buttonId}" not found.\n\nThe button you're trying to save no longer exists. This can happen if:\n• The map was recreated\n• The button was deleted\n• Another session removed it\n\n**Solution:** Dismiss this message and create a new Custom Action from the Location Actions menu.`,
      ephemeral: true
    };
  }
  
  // Create or update the action
  const actionConfig = {
    title: title,
    content: content,
    image: image
  };
  
  // Only include color if it's not empty
  if (color && color.trim() !== '') {
    actionConfig.color = color;
  }
  
  // Preserve existing executeOn value or default to 'true'
  const existingAction = button.actions?.[actionIndex];
  const executeOnValue = existingAction?.executeOn || 'true';
  
  const action = {
    type: 'display_text',
    order: actionIndex,
    config: actionConfig,
    executeOn: executeOnValue
  };
  
  // Initialize actions array if needed
  if (!button.actions) {
    button.actions = [];
  }
  
  // Add or update the action (same logic as other save handlers)
  if (actionIndex < button.actions.length) {
    console.log(`✏️ Updating existing display_text action at index ${actionIndex}`);
    button.actions[actionIndex] = action;
  } else {
    console.log(`➕ Adding new display_text action at index ${actionIndex}`);
    button.actions.push(action);
  }
  
  // Update metadata
  if (!button.metadata) {
    button.metadata = {
      createdAt: Date.now(),
      lastModified: Date.now(),
      usageCount: 0
    };
  } else {
    button.metadata.lastModified = Date.now();
  }
  
  await saveSafariContent(safariData);
  console.log(`✅ Safari content saved successfully`);
  
  // Update anchor messages for all coordinates using this action
  try {
    const { queueActionCoordinateUpdates } = await import('./anchorMessageManager.js');
    await queueActionCoordinateUpdates(guildId, buttonId, 'display_text_saved');
  } catch (error) {
    console.error('Error queueing anchor updates:', error);
  }
  
  console.log(`✅ SUCCESS: safari_display_text_save - saved display_text for ${buttonId}[${actionIndex}]`);
  
  // Return to the display text configuration entity
  const updatedConfig = await showDisplayTextConfig(guildId, buttonId, actionIndex);
  return {
    ...updatedConfig,
    ephemeral: true
  };
}

export async function handleDisplayTextExecuteOn(guildId, customId, executeOnValue) {
  // Parse buttonId and actionIndex from custom_id: safari_display_text_execute_on_buttonId_actionIndex
  const parts = customId.replace('safari_display_text_execute_on_', '').split('_');
  const actionIndex = parseInt(parts[parts.length - 1]);
  const buttonId = parts.slice(0, -1).join('_');
  
  console.log(`🎯 EXECUTE ON: safari_display_text_execute_on - setting to ${executeOnValue} for ${buttonId}[${actionIndex}]`);
  
  // Load and update safari data
  const { saveSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const button = safariData[guildId]?.buttons?.[buttonId];
  
  if (!button) {
    console.error(`❌ Button ${buttonId} not found during executeOn update for guild ${guildId}`);
    return {
      content: `❌ Button "${buttonId}" not found.\n\nThe button you're trying to update no longer exists. This can happen if:\n• The map was recreated\n• The button was deleted\n• Another session removed it\n\n**Solution:** Dismiss this message and create a new Custom Action from the Location Actions menu.`,
      ephemeral: true
    };
  }
  
  // Initialize actions array if needed
  if (!button.actions) {
    button.actions = [];
  }
  
  // Create action if it doesn't exist (for new actions)
  if (!button.actions[actionIndex]) {
    button.actions[actionIndex] = {
      type: 'display_text',
      order: actionIndex,
      config: {
        title: '',
        content: '',
        image: ''
      },
      executeOn: 'true'
    };
  }
  
  // Update the executeOn value
  button.actions[actionIndex].executeOn = executeOnValue;
  
  // Update metadata
  if (!button.metadata) {
    button.metadata = {
      createdAt: Date.now(),
      lastModified: Date.now(),
      usageCount: 0
    };
  } else {
    button.metadata.lastModified = Date.now();
  }
  
  await saveSafariContent(safariData);
  
  // Return updated Display Text Configuration entity
  const updatedConfig = await showDisplayTextConfig(guildId, buttonId, actionIndex);
  
  console.log(`✅ SUCCESS: safari_display_text_execute_on - updated to ${executeOnValue}`);
  return {
    ...updatedConfig,
    ephemeral: true
  };
}

export default {
  createCustomActionSelectionUI,
  createCustomActionEditorUI,
  createTriggerConfigUI,
  createConditionsConfigUI,
  createCoordinateManagementUI,
  refreshConditionManagerUI,
  showConditionEditor,
  showDisplayTextConfig,
  showCalculateResultsConfig,
  handleDisplayTextEdit,
  handleDisplayTextSave,
  handleDisplayTextExecuteOn
};