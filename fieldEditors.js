/**
 * Field Editors for Entity Management System
 * Creates modals and editors for different field types
 * Supports grouped fields for better UX
 */

import {
    InteractionResponseType,
    InteractionResponseFlags
} from 'discord-interactions';
import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} from 'discord.js';
import { SAFARI_LIMITS } from './config/safariLimits.js';
import { getFieldGroups } from './entityManagementUI.js';

/**
 * Create modal for field group editing
 * @param {string} entityType - Type of entity
 * @param {string} entityId - Entity ID
 * @param {string} fieldGroupId - Field group ID
 * @param {Object} currentValues - Current entity values
 * @returns {Object} Modal response
 */
export function createFieldGroupModal(entityType, entityId, fieldGroupId, currentValues) {
    const fieldGroups = getFieldGroups(entityType);
    const group = fieldGroups[fieldGroupId];
    
    if (!group) {
        throw new Error(`Unknown field group: ${fieldGroupId}`);
    }
    
    // Create modal based on entity type and field group
    switch (entityType) {
        case 'item':
            return createItemFieldModal(entityId, fieldGroupId, group, currentValues);
        case 'store':
            return createStoreFieldModal(entityId, fieldGroupId, group, currentValues);
        case 'safari_button':
            return createButtonFieldModal(entityId, fieldGroupId, group, currentValues);
        default:
            throw new Error(`Unknown entity type: ${entityType}`);
    }
}

/**
 * Create modal for item field editing
 */
function createItemFieldModal(itemId, fieldGroupId, group, currentValues) {
    const components = [];
    
    switch (fieldGroupId) {
        case 'info':
            // Item Info: name & description
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'name',
                    label: 'Item Name',
                    style: 1, // Short
                    value: currentValues.name || '',
                    placeholder: 'Enter item name',
                    required: true,
                    max_length: SAFARI_LIMITS.MAX_ITEM_NAME_LENGTH
                }]
            });
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'description',
                    label: 'Item Description',
                    style: 2, // Paragraph
                    value: currentValues.description || '',
                    placeholder: 'Enter item description',
                    required: false,
                    max_length: SAFARI_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH
                }]
            });
            break;
            
        case 'financials':
            // Financials: basePrice, goodOutcomeValue, badOutcomeValue
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'basePrice',
                    label: 'Base Price',
                    style: 1, // Short
                    value: (currentValues.basePrice ?? '').toString(),
                    placeholder: 'Enter price (0-999999)',
                    required: true,
                    max_length: 6,
                    min_length: 1
                }]
            });
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'goodOutcomeValue',
                    label: 'Good Outcome Value',
                    style: 1, // Short
                    value: (currentValues.goodOutcomeValue ?? '').toString(),
                    placeholder: 'Value gained during good events (-999 to 999)',
                    required: false,
                    max_length: 4
                }]
            });
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'badOutcomeValue',
                    label: 'Bad Outcome Value',
                    style: 1, // Short
                    value: (currentValues.badOutcomeValue ?? '').toString(),
                    placeholder: 'Value gained during bad events (-999 to 999)',
                    required: false,
                    max_length: 4
                }]
            });
            break;
            
        case 'battle':
            // Battle: attackValue, defenseValue
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'attackValue',
                    label: 'Attack Value',
                    style: 1, // Short
                    value: (currentValues.attackValue ?? '').toString(),
                    placeholder: 'Attack power (0-999)',
                    required: false,
                    max_length: 3
                }]
            });
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'defenseValue',
                    label: 'Defense Value',
                    style: 1, // Short
                    value: (currentValues.defenseValue ?? '').toString(),
                    placeholder: 'Defense power (0-999)',
                    required: false,
                    max_length: 3
                }]
            });
            break;
            
        case 'properties':
            // Properties are handled by select menu, not modal
            return null;
    }
    
    return {
        type: InteractionResponseType.MODAL,
        data: {
            title: `Edit ${group.label}`,
            custom_id: `entity_modal_submit_item_${itemId}_${fieldGroupId}`,
            components
        }
    };
}

/**
 * Create modal for store field editing
 */
function createStoreFieldModal(storeId, fieldGroupId, group, currentValues) {
    const components = [];
    
    switch (fieldGroupId) {
        case 'info':
            // Store Info: name & description
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'name',
                    label: 'Store Name',
                    style: 1, // Short
                    value: currentValues.name || '',
                    placeholder: 'Enter store name',
                    required: true,
                    max_length: SAFARI_LIMITS.MAX_STORE_NAME_LENGTH
                }]
            });
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'description',
                    label: 'Store Description',
                    style: 2, // Paragraph
                    value: currentValues.description || '',
                    placeholder: 'Enter store description',
                    required: false,
                    max_length: 500
                }]
            });
            break;
            
        case 'settings':
            // Store Settings: storeownerText, accentColor
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'storeownerText',
                    label: 'Store Owner Welcome Text',
                    style: 2, // Paragraph
                    value: currentValues.settings?.storeownerText || '',
                    placeholder: 'Welcome message shown to customers',
                    required: false,
                    max_length: SAFARI_LIMITS.MAX_STOREOWNER_TEXT_LENGTH
                }]
            });
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'accentColor',
                    label: 'Accent Color (Hex)',
                    style: 1, // Short
                    value: currentValues.settings?.accentColor ? 
                        `#${currentValues.settings.accentColor.toString(16).padStart(6, '0')}` : '',
                    placeholder: '#3498DB (blue)',
                    required: false,
                    max_length: 7
                }]
            });
            break;
            
        case 'items':
            // Items are handled by multi-select, not modal
            return null;
    }
    
    return {
        type: InteractionResponseType.MODAL,
        data: {
            title: `Edit ${group.label}`,
            custom_id: `entity_modal_submit_store_${storeId}_${fieldGroupId}`,
            components
        }
    };
}

/**
 * Create modal for button field editing
 */
function createButtonFieldModal(buttonId, fieldGroupId, group, currentValues) {
    const components = [];
    
    switch (fieldGroupId) {
        case 'info':
            // Button Info: label, emoji, style
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'label',
                    label: 'Button Label',
                    style: 1, // Short
                    value: currentValues.label || '',
                    placeholder: 'Enter button text',
                    required: true,
                    max_length: SAFARI_LIMITS.MAX_BUTTON_LABEL_LENGTH
                }]
            });
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'emoji',
                    label: 'Button Emoji',
                    style: 1, // Short
                    value: currentValues.emoji || '',
                    placeholder: '🦁 (optional)',
                    required: false,
                    max_length: 10
                }]
            });
            break;
            
        case 'actions':
            // Actions are handled by specialized UI, not this modal
            return null;
    }
    
    return {
        type: InteractionResponseType.MODAL,
        data: {
            title: `Edit ${group.label}`,
            custom_id: `entity_modal_submit_safari_button_${buttonId}_${fieldGroupId}`,
            components
        }
    };
}

/**
 * Create consumable select component for items
 * @param {string} itemId - Item ID
 * @param {string} currentValue - Current consumable value
 * @returns {Object} ActionRow with select menu
 */
export function createConsumableSelect(itemId, currentValue = 'No') {
    return {
        type: 1, // ActionRow
        components: [{
            type: 3, // String Select
            custom_id: `entity_consumable_select_item_${itemId}`,
            placeholder: 'Select consumable status',
            options: [
                {
                    label: 'No - Item persists after use',
                    value: 'No',
                    description: 'Item remains in inventory',
                    default: currentValue === 'No'
                },
                {
                    label: 'Yes - Item consumed on use',
                    value: 'Yes',
                    description: 'Item removed from inventory when used',
                    default: currentValue === 'Yes'
                }
            ]
        }]
    };
}

/**
 * Parse modal submission data
 * @param {Object} modalData - Modal submission data
 * @param {string} fieldGroupId - Field group ID
 * @returns {Object} Parsed field values
 */
export function parseModalSubmission(modalData, fieldGroupId) {
    const fields = {};
    
    // Extract values from components
    for (const row of modalData.components || []) {
        for (const component of row.components || []) {
            const fieldId = component.custom_id;
            const value = component.value;
            
            // Parse and validate based on field type
            switch (fieldId) {
                case 'basePrice':
                case 'goodOutcomeValue':
                case 'badOutcomeValue':
                case 'attackValue':
                case 'defenseValue':
                    // Parse as number, allow empty for optional fields
                    if (value === '' || value === null || value === undefined) {
                        fields[fieldId] = null;
                    } else {
                        const num = parseInt(value, 10);
                        if (isNaN(num)) {
                            throw new Error(`${fieldId} must be a number`);
                        }
                        fields[fieldId] = num;
                    }
                    break;
                    
                case 'accentColor':
                    // Parse hex color
                    if (value) {
                        const hex = value.replace('#', '');
                        const color = parseInt(hex, 16);
                        if (isNaN(color)) {
                            throw new Error('Invalid color format. Use hex like #3498DB');
                        }
                        // Store in nested settings
                        fields['settings.accentColor'] = color;
                    }
                    break;
                    
                case 'storeownerText':
                    // Store in nested settings
                    fields['settings.storeownerText'] = value || '';
                    break;
                    
                default:
                    // Store as-is for text fields
                    fields[fieldId] = value || '';
            }
        }
    }
    
    return fields;
}

/**
 * Validate field values
 * @param {Object} fields - Field values to validate
 * @param {string} entityType - Type of entity
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateFields(fields, entityType) {
    const errors = [];
    
    switch (entityType) {
        case 'item':
            // Validate item fields
            if (fields.basePrice !== undefined && fields.basePrice !== null) {
                if (fields.basePrice < 0 || fields.basePrice > 999999) {
                    errors.push('Base price must be between 0 and 999999');
                }
            }
            
            // Validate outcome values
            ['goodOutcomeValue', 'badOutcomeValue'].forEach(field => {
                if (fields[field] !== undefined && fields[field] !== null) {
                    if (fields[field] < -999 || fields[field] > 999) {
                        errors.push(`${field} must be between -999 and 999`);
                    }
                }
            });
            
            // Validate battle values
            ['attackValue', 'defenseValue'].forEach(field => {
                if (fields[field] !== undefined && fields[field] !== null) {
                    if (fields[field] < 0 || fields[field] > 999) {
                        errors.push(`${field} must be between 0 and 999`);
                    }
                }
            });
            break;
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}