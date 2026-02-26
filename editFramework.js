// Universal Edit Framework for Safari Content Management
// Modular, reusable edit system for Buttons, Stores, Items, and future content types

import { SAFARI_LIMITS, EDIT_TYPES, BUTTON_STYLES } from './config/safariLimits.js';

/**
 * Edit configuration for different content types
 * Defines what can be edited and how for each type
 */
export const EDIT_CONFIGS = {
  [EDIT_TYPES.BUTTON]: {
    displayName: 'Custom Action',
    properties: {
      name: { type: 'text', maxLength: 50, required: true, label: 'Action Name' },
      description: { type: 'textarea', maxLength: 200, required: false, label: 'Description' },
      trigger: { 
        type: 'complex', 
        label: 'Trigger Configuration',
        subtype: 'trigger',
        required: true 
      },
      conditions: { 
        type: 'complex', 
        label: 'Conditions',
        subtype: 'conditions',
        required: false 
      },
      coordinates: { 
        type: 'complex', 
        label: 'Assigned Coordinates',
        subtype: 'coordinates',
        required: false 
      },
      // Legacy button fields (hidden in new UI but preserved for compatibility)
      label: { type: 'text', maxLength: SAFARI_LIMITS.MAX_BUTTON_LABEL_LENGTH, required: false, label: 'Button Label', hidden: true },
      emoji: { type: 'text', maxLength: 10, required: false, label: 'Emoji', placeholder: '🦁', hidden: true },
      style: { type: 'select', options: BUTTON_STYLES, required: false, label: 'Button Style', hidden: true },
      tags: { type: 'tags', maxTags: SAFARI_LIMITS.MAX_TAGS_PER_ITEM, label: 'Tags (comma separated)' }
    },
    content: {
      type: 'actions',
      label: 'Actions',
      maxItems: SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON,
      itemLabel: 'action',
      itemLabelPlural: 'actions'
    },
    operations: ['reorder', 'edit', 'delete', 'add', 'test']
  },
  
  [EDIT_TYPES.STORE]: {
    displayName: 'Store',
    properties: {
      name: { type: 'text', maxLength: SAFARI_LIMITS.MAX_STORE_NAME_LENGTH, required: true, label: 'Store Name' },
      emoji: { type: 'text', maxLength: 10, required: false, label: 'Emoji', placeholder: '🏪' },
      storeownerText: { type: 'textarea', maxLength: SAFARI_LIMITS.MAX_STOREOWNER_TEXT_LENGTH, required: false, label: 'Store Owner Text' },
      accentColor: { type: 'color', required: false, label: 'Accent Color' },
      tags: { type: 'tags', maxTags: SAFARI_LIMITS.MAX_TAGS_PER_ITEM, label: 'Tags (comma separated)' }
    },
    content: {
      type: 'items',
      label: 'Store Items',
      itemLabel: 'item',
      itemLabelPlural: 'items'
    },
    operations: ['reorder', 'edit', 'delete', 'add']
  },
  
  [EDIT_TYPES.ITEM]: {
    displayName: 'Item',
    properties: {
      name: { type: 'text', maxLength: SAFARI_LIMITS.MAX_ITEM_NAME_LENGTH, required: true, label: 'Item Name' },
      emoji: { type: 'text', maxLength: 10, required: false, label: 'Emoji', placeholder: '⚔️' },
      description: { type: 'textarea', maxLength: SAFARI_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH, required: false, label: 'Description' },
      basePrice: { type: 'number', min: 0, max: 999999, required: true, label: 'Base Price' },
      staminaBoost: { 
        type: 'number', 
        min: 0, 
        max: 10, 
        required: false, 
        label: 'Stamina Boost',
        placeholder: '0'
      },
      consumable: {
        type: 'select',
        options: ['No', 'Yes'],
        required: false,
        label: 'Consumable Item',
        default: 'No'
      },
      reverseBlacklist: {
        type: 'text',
        maxLength: 1000,
        required: false,
        label: 'Reverse Blacklist Coordinates',
        placeholder: 'A1, B2, C3 (comma-separated)'
      },
      tags: { type: 'tags', maxTags: SAFARI_LIMITS.MAX_TAGS_PER_ITEM, label: 'Tags (comma separated)' }
    },
    content: {
      type: 'effects',
      label: 'Item Effects',
      maxItems: SAFARI_LIMITS.MAX_ITEM_EFFECTS,
      itemLabel: 'effect',
      itemLabelPlural: 'effects'
    },
    operations: ['reorder', 'edit', 'delete', 'add']
  },

  [EDIT_TYPES.MAP_CELL]: {
    displayName: '📍 Map Location Manager',
    properties: {
      title: { type: 'text', maxLength: 100, required: true, label: 'Location Title' },
      description: { type: 'textarea', maxLength: 1000, required: true, label: 'Location Description' },
      image: { type: 'text', maxLength: 500, required: false, label: 'Image URL' },
      cellType: { type: 'text', maxLength: 50, required: false, label: 'Cell Type', placeholder: 'forest, village, dungeon' }
    },
    content: {
      type: 'custom_actions',
      label: 'Custom Actions',
      maxItems: 10,
      itemLabel: 'action',
      itemLabelPlural: 'actions',
      useCustomUI: true  // Flag to use our new custom action UI
    },
    operations: ['reorder', 'edit', 'delete', 'add']
  },

  [EDIT_TYPES.SAFARI_CONFIG]: {
    displayName: 'Safari Customization',
    fieldGroups: {
      currency: {
        label: 'Currency & Inventory',
        description: 'Customize currency name, emoji, and inventory name',
        fields: {
          currencyName: { type: 'text', maxLength: 30, required: true, label: 'Currency Name', placeholder: 'Dollars' },
          currencyEmoji: { type: 'text', maxLength: 10, required: false, label: 'Currency Emoji', placeholder: '🪙' },
          inventoryName: { type: 'text', maxLength: 30, required: true, label: 'Inventory Name', placeholder: 'Inventory' },
          inventoryEmoji: { type: 'text', maxLength: 10, required: false, label: 'Inventory Emoji', placeholder: 'Set the emoji to be used to represent inventory' },
          defaultStartingCurrencyValue: { type: 'text', maxLength: 10, required: false, label: 'Default Starting Currency', placeholder: '100' }
        }
      },
      events: {
        label: 'Event Customization',
        description: 'Customize good and bad event names and emojis',
        fields: {
          goodEventName: { type: 'text', maxLength: 50, required: false, label: 'Good Event Name', placeholder: 'Clear Skies' },
          badEventName: { type: 'text', maxLength: 50, required: false, label: 'Bad Event Name', placeholder: 'Meteor Strike' },
          goodEventEmoji: { type: 'text', maxLength: 10, required: false, label: 'Good Event Emoji', placeholder: '☀️' },
          badEventEmoji: { type: 'text', maxLength: 10, required: false, label: 'Bad Event Emoji', placeholder: '☄️' }
        }
      },
      rounds: {
        label: 'Rounds & Location',
        description: 'Set round probabilities and default starting location',
        fields: {
          round1GoodProbability: { type: 'number', min: 0, max: 100, required: false, label: 'Round 1 Good %', placeholder: '75' },
          round2GoodProbability: { type: 'number', min: 0, max: 100, required: false, label: 'Round 2 Good %', placeholder: '50' },
          round3GoodProbability: { type: 'number', min: 0, max: 100, required: false, label: 'Round 3 Good %', placeholder: '25' },
          defaultStartingCoordinate: { type: 'text', maxLength: 4, required: false, label: 'Starting Coordinate', placeholder: 'A1' }
        }
      }
    },
    operations: ['field-groups']
  }
};

/**
 * Universal Edit Interface Builder
 * Creates edit interfaces for any Safari content type
 */
export class EditInterfaceBuilder {
  constructor(contentType) {
    this.config = EDIT_CONFIGS[contentType];
    this.contentType = contentType;
    
    if (!this.config) {
      throw new Error(`Unknown content type: ${contentType}`);
    }
  }

  /**
   * Create the main edit interface
   * @param {Object} itemData - The item being edited
   * @param {string} itemId - Unique identifier for the item
   * @returns {Object} Discord Components V2 interface
   */
  createEditInterface(itemData, itemId) {
    const content = itemData[this.config.content.type] || [];
    const contentCount = Array.isArray(content) ? content.length : Object.keys(content).length;
    
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: [{
        type: 17, // Container
        accent_color: this.getAccentColor(itemData),
        components: [
          // Header
          {
            type: 10, // Text Display
            content: this.createHeaderText(itemData, itemId, contentCount)
          },
          // Content list (actions/items/effects)
          ...this.createContentList(content, itemId),
          // Separator
          { type: 14 },
          // Management buttons
          {
            type: 1, // Action Row
            components: this.createManagementButtons(itemId, contentCount)
          }
        ]
      }]
    };
  }

  /**
   * Create header text for the edit interface
   */
  createHeaderText(itemData, itemId, contentCount) {
    const maxItems = this.config.content.maxItems;
    const itemName = itemData.label || itemData.name || 'Unknown';
    const emoji = itemData.emoji || '';
    
    return `## 🎛️ Edit ${this.config.displayName}: ${itemName} ${emoji}\n\n` +
           `**Current ${this.config.content.label}** (${contentCount}/${maxItems}):`;
  }

  /**
   * Create content list display (actions, items, effects, etc.)
   */
  createContentList(content, itemId) {
    if (!Array.isArray(content) || content.length === 0) {
      return [{
        type: 10, // Text Display
        content: `*No ${this.config.content.itemLabelPlural} defined yet*`
      }];
    }

    const components = [];
    
    content.forEach((item, index) => {
      // Content summary with actual interactive buttons
      components.push({
        type: 10, // Text Display
        content: `**${index + 1}.** ${this.getContentSummary(item)}`
      });
      
      // Action row with interactive buttons for each action
      if (this.config.operations.includes('reorder') || 
          this.config.operations.includes('edit') || 
          this.config.operations.includes('delete')) {
        
        const actionButtons = [];
        
        // Reorder buttons
        if (this.config.operations.includes('reorder')) {
          actionButtons.push({
            type: 2, // Button
            custom_id: `safari_action_move_up_${itemId}_${index}`,
            label: 'Up',
            style: 2,
            emoji: { name: '⬆️' },
            disabled: index === 0
          });
          
          actionButtons.push({
            type: 2, // Button
            custom_id: `safari_action_move_down_${itemId}_${index}`,
            label: 'Down',
            style: 2,
            emoji: { name: '⬇️' },
            disabled: index === content.length - 1
          });
        }
        
        // Edit button
        if (this.config.operations.includes('edit')) {
          actionButtons.push({
            type: 2, // Button
            custom_id: `safari_action_edit_${itemId}_${index}`,
            label: 'Edit',
            style: 2,
            emoji: { name: '✏️' }
          });
        }
        
        // Delete button
        if (this.config.operations.includes('delete')) {
          actionButtons.push({
            type: 2, // Button
            custom_id: `safari_action_delete_${itemId}_${index}`,
            label: 'Delete',
            style: 4,
            emoji: { name: '🗑️' }
          });
        }
        
        // Only add action row if we have buttons (max 5 per row)
        if (actionButtons.length > 0) {
          components.push({
            type: 1, // Action Row
            components: actionButtons.slice(0, 5)
          });
        }
      }
    });
    
    return components;
  }


  /**
   * Create management buttons (add, properties, test, delete)
   */
  createManagementButtons(itemId, currentCount) {
    const buttons = [];
    
    // Add new content button
    if (this.config.operations.includes('add') && currentCount < this.config.content.maxItems) {
      buttons.push({
        type: 2, // Button
        custom_id: `safari_add_${this.config.content.type.slice(0, -1)}_${itemId}`,
        label: `Add ${this.config.content.itemLabel}`,
        style: 1,
        emoji: { name: '➕' }
      });
    }
    
    // Edit properties button
    buttons.push({
      type: 2, // Button
      custom_id: `safari_edit_properties_${itemId}`,
      label: 'Edit Properties',
      style: 2,
      emoji: { name: '🔧' }
    });
    
    // Test button (for buttons only)
    if (this.config.operations.includes('test')) {
      buttons.push({
        type: 2, // Button
        custom_id: `safari_test_${this.contentType}_${itemId}`,
        label: 'Test',
        style: 2,
        emoji: { name: '🧪' }
      });
    }
    
    // Delete button
    buttons.push({
      type: 2, // Button
      custom_id: `safari_delete_${this.contentType}_${itemId}`,
      label: 'Delete',
      style: 4,
      emoji: { name: '🗑️' }
    });
    
    return buttons;
  }

  /**
   * Get content summary for display
   */
  getContentSummary(item) {
    switch (this.contentType) {
      case EDIT_TYPES.BUTTON:
        return this.getActionSummary(item);
      case EDIT_TYPES.STORE:
        return this.getStoreItemSummary(item);
      case EDIT_TYPES.ITEM:
        return this.getItemEffectSummary(item);
      default:
        return 'Unknown content';
    }
  }

  /**
   * Get action summary for buttons
   */
  getActionSummary(action) {
    const typeEmojis = {
      display_text: '📄',
      update_currency: '💰',
      follow_up_button: '🔗',
      conditional: '🔀',
      random_outcome: '🎲'
    };
    
    const emoji = typeEmojis[action.type] || '❓';
    
    switch (action.type) {
      case 'display_text':
        const title = action.config.title || action.config.content?.substring(0, 30) || 'Display Text';
        return `${emoji} ${title}${title.length > 30 ? '...' : ''}`;
      case 'update_currency':
        const amount = action.config.amount || 0;
        return `${emoji} ${amount > 0 ? '+' : ''}${amount} coins`;
      case 'follow_up_button':
        return `${emoji} → ${action.config.buttonId || 'Unknown Button'}`;
      case 'conditional':
        const condition = action.config.condition;
        return `${emoji} IF ${condition?.type || 'unknown'} ${condition?.value || ''}`;
      case 'random_outcome':
        const outcomes = action.config.outcomes?.length || 0;
        return `${emoji} Random (${outcomes} outcomes)`;
      default:
        return `${emoji} ${action.type}`;
    }
  }

  /**
   * Get store item summary
   */
  getStoreItemSummary(storeItem) {
    return `🛍️ ${storeItem.itemId || 'Unknown Item'} - ${storeItem.price || 0} coins`;
  }

  /**
   * Get item effect summary
   */
  getItemEffectSummary(effect) {
    return `⚡ ${effect.type || 'Unknown Effect'}: ${effect.value || 'No value'}`;
  }

  /**
   * Get accent color for the interface
   */
  getAccentColor(itemData) {
    if (itemData.style === 'Primary') return 0x5865f2; // Blurple
    if (itemData.style === 'Success') return 0x57f287; // Green
    if (itemData.style === 'Danger') return 0xed4245;  // Red
    if (itemData.accentColor) return itemData.accentColor;
    return 0xf39c12; // Default orange
  }
}

/**
 * Universal Properties Editor
 * Creates property edit modals for any content type
 */
export class PropertiesEditor {
  constructor(contentType) {
    this.config = EDIT_CONFIGS[contentType];
    this.contentType = contentType;
  }

  /**
   * Create properties edit modal
   */
  async createPropertiesModal(itemData, itemId) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    
    const modal = new ModalBuilder()
      .setCustomId(`safari_properties_modal_${itemId}`)
      .setTitle(`Edit ${this.config.displayName} Properties`);

    const components = [];
    
    Object.entries(this.config.properties).forEach(([key, propConfig]) => {
      if (propConfig.type === 'text' || propConfig.type === 'textarea') {
        const input = new TextInputBuilder()
          .setCustomId(key)
          .setLabel(propConfig.label)
          .setStyle(propConfig.type === 'textarea' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(propConfig.required || false)
          .setMaxLength(propConfig.maxLength || 100);
        
        if (propConfig.placeholder) {
          input.setPlaceholder(propConfig.placeholder);
        }
        
        // Pre-populate with current value
        const currentValue = itemData[key];
        if (currentValue !== undefined) {
          if (key === 'tags' && Array.isArray(currentValue)) {
            input.setValue(currentValue.join(', '));
          } else {
            input.setValue(String(currentValue));
          }
        }
        
        components.push(new ActionRowBuilder().addComponents(input));
      }
    });
    
    modal.addComponents(components.slice(0, 5)); // Discord modal limit
    return modal;
  }
}

/**
 * Universal Delete Confirmation
 * Creates delete confirmation interfaces for any content type
 */
export class DeleteConfirmation {
  constructor(contentType) {
    this.config = EDIT_CONFIGS[contentType];
    this.contentType = contentType;
  }

  /**
   * Create delete confirmation interface
   */
  createDeleteConfirmation(itemData, itemId) {
    const itemName = itemData.label || itemData.name || 'Unknown';
    
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: [{
        type: 17, // Container
        accent_color: 0xed4245, // Red
        components: [
          {
            type: 10, // Text Display
            content: `## ⚠️ Delete ${this.config.displayName}\n\n` +
                    `Are you sure you want to delete **${itemName}**?\n\n` +
                    `This action cannot be undone.`
          },
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                custom_id: `safari_confirm_delete_${this.contentType}_${itemId}`,
                label: 'Yes, Delete',
                style: 4,
                emoji: { name: '🗑️' }
              },
              {
                type: 2, // Button
                custom_id: `safari_button_edit_select_${itemId}`,
                label: 'Cancel',
                style: 2,
                emoji: { name: '❌' }
              }
            ]
          }
        ]
      }]
    };
  }
}

/**
 * Validation utilities
 */
export const validateContent = (contentType, data) => {
  const config = EDIT_CONFIGS[contentType];
  if (!config) throw new Error(`Unknown content type: ${contentType}`);
  
  const errors = [];
  
  // Validate properties
  Object.entries(config.properties).forEach(([key, propConfig]) => {
    const value = data[key];
    
    if (propConfig.required && (!value || value.toString().trim() === '')) {
      errors.push(`${propConfig.label} is required`);
    }
    
    if (value && propConfig.maxLength && value.toString().length > propConfig.maxLength) {
      errors.push(`${propConfig.label} is too long (max ${propConfig.maxLength} characters)`);
    }
    
    if (propConfig.type === 'number' && value !== undefined) {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push(`${propConfig.label} must be a number`);
      } else if (propConfig.min !== undefined && num < propConfig.min) {
        errors.push(`${propConfig.label} must be at least ${propConfig.min}`);
      } else if (propConfig.max !== undefined && num > propConfig.max) {
        errors.push(`${propConfig.label} must be at most ${propConfig.max}`);
      }
    }
  });
  
  // Validate content count
  if (data[config.content.type]) {
    const contentCount = Array.isArray(data[config.content.type]) ? 
      data[config.content.type].length : 
      Object.keys(data[config.content.type]).length;
    
    if (contentCount > config.content.maxItems) {
      errors.push(`Too many ${config.content.itemLabelPlural} (max ${config.content.maxItems})`);
    }
  }
  
  return errors;
};

// Export all necessary components
export { EDIT_TYPES };
export default EditInterfaceBuilder;