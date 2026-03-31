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
        case 'enemy':
            return createEnemyFieldModal(entityId, fieldGroupId, group, currentValues);
        case 'map_cell':
            return createMapCellFieldModal(entityId, fieldGroupId, group, currentValues);
        default:
            throw new Error(`Unknown entity type: ${entityType}`);
    }
}

/**
 * Create modal for item field editing
 */
function createItemFieldModal(itemId, fieldGroupId, group, currentValues) {
    const components = [];
    
    // Special handling for new item creation - include stamina fields
    if (itemId === 'new' && fieldGroupId === 'info') {
        // Item Info: name, emoji & description
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
                custom_id: 'emoji',
                label: 'Item Emoji',
                style: 1, // Short
                value: currentValues.emoji || '',
                placeholder: 'Enter an emoji for the item',
                required: false,
                max_length: 100
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
        
        // Add stamina boost field for new items
        components.push({
            type: 1, // ActionRow
            components: [{
                type: 4, // Text Input
                custom_id: 'staminaBoost',
                label: 'Stamina Boost (Optional)',
                style: 1, // Short
                value: '0',
                placeholder: 'Stamina points gained (0-10)',
                required: false,
                max_length: 2
            }]
        });
        
        // Add base price field for new items
        components.push({
            type: 1, // ActionRow
            components: [{
                type: 4, // Text Input
                custom_id: 'basePrice',
                label: 'Base Price',
                style: 1, // Short
                value: '0',
                placeholder: 'Enter price (0-999999)',
                required: false,
                max_length: 6
            }]
        });
        
        return {
            type: InteractionResponseType.MODAL,
            data: {
                title: 'Create New Item',
                custom_id: `entity_create_modal_item_info`,
                components
            }
        };
    }
    
    switch (fieldGroupId) {
        case 'info':
            // Item Info: name, emoji & description
            components.push({
                type: 18, label: 'Item Name',
                component: { type: 4, custom_id: 'name', style: 1, value: currentValues.name || '', placeholder: 'Enter item name', required: true, max_length: SAFARI_LIMITS.MAX_ITEM_NAME_LENGTH }
            });

            // Sanitize emoji value to prevent Discord API errors
            let emojiValue = currentValues.emoji || '';
            if (emojiValue && emojiValue.includes('�')) {
                console.warn(`⚠️ Corrupted emoji detected for item ${itemId}, using empty string`);
                emojiValue = '';
            }

            components.push({
                type: 18, label: 'Item Emoji', description: 'Unicode emoji or custom Discord emoji code.',
                component: { type: 4, custom_id: 'emoji', style: 1, value: emojiValue, placeholder: 'e.g. 🪣 or <:name:id>', required: false, max_length: 100 }
            });

            components.push({
                type: 18, label: 'Item Description', description: 'Shown in inventory and stores.',
                component: { type: 4, custom_id: 'description', style: 2, value: currentValues.description || '', placeholder: 'Describe what this item does...', required: false, max_length: SAFARI_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH }
            });
            break;
            
        case 'financials':
            // Financials: basePrice, goodOutcomeValue, badOutcomeValue
            components.push({
                type: 18, label: 'Base Price', description: 'Cost to purchase this item from a store.',
                component: { type: 4, custom_id: 'basePrice', style: 1, value: (currentValues.basePrice ?? '').toString(), placeholder: '0-999999', required: true, max_length: 6, min_length: 1 }
            });
            components.push({
                type: 18, label: 'Good Outcome Value', description: 'Currency gained during good events (e.g. clear skies).',
                component: { type: 4, custom_id: 'goodOutcomeValue', style: 1, value: (currentValues.goodOutcomeValue ?? '').toString(), placeholder: '-999 to 999', required: false, max_length: 4 }
            });
            components.push({
                type: 18, label: 'Bad Outcome Value', description: 'Currency gained during bad events (e.g. meteor strike).',
                component: { type: 4, custom_id: 'badOutcomeValue', style: 1, value: (currentValues.badOutcomeValue ?? '').toString(), placeholder: '-999 to 999', required: false, max_length: 4 }
            });
            break;
            
        case 'battle':
            // Combat: attackValue, defenseValue
            components.push({
                type: 18, label: 'Attack Value', description: 'Damage dealt when this item is used to attack.',
                component: { type: 4, custom_id: 'attackValue', style: 1, value: (currentValues.attackValue ?? '').toString(), placeholder: '0-999', required: false, max_length: 3 }
            });
            components.push({
                type: 18, label: 'Defense Value', description: 'Damage reduction when this item is equipped.',
                component: { type: 4, custom_id: 'defenseValue', style: 1, value: (currentValues.defenseValue ?? '').toString(), placeholder: '0-999', required: false, max_length: 3 }
            });
            break;
            
        case 'properties':
            // Properties are handled by select menus, not modal
            return null;
            
        case 'stamina':
            // Movement settings: staminaBoost and reverse blacklist coordinates
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'staminaBoost',
                    label: 'Stamina Boost',
                    style: 1, // Short
                    value: (currentValues.staminaBoost ?? '0').toString(),
                    placeholder: 'Stamina points gained (0-10)',
                    required: false,
                    max_length: 2
                }]
            });

            // Add reverse blacklist field for unlocking restricted coordinates
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'reverseBlacklist',
                    label: 'Reverse Blacklist Coordinates',
                    style: 2, // Paragraph
                    value: currentValues.reverseBlacklist ?
                        (Array.isArray(currentValues.reverseBlacklist) ?
                            currentValues.reverseBlacklist.join(', ') :
                            currentValues.reverseBlacklist) : '',
                    placeholder: 'Unlocks restricted cells (e.g., A1, B2, C3)',
                    required: false,
                    max_length: 1000
                }]
            });

            // Note: consumable is handled as a select in the UI, not in the modal
            break;
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
            // Store Info: name, emoji & description
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
            
            // Sanitize emoji value to prevent Discord API errors
            let storeEmojiValue = currentValues.emoji || '';
            // Check for replacement characters or other invalid characters
            if (storeEmojiValue && storeEmojiValue.includes('�')) {
                console.warn(`⚠️ Corrupted emoji detected for store ${storeId}, using empty string`);
                storeEmojiValue = '';
            }
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'emoji',
                    label: 'Store Emoji',
                    style: 1, // Short
                    value: storeEmojiValue,
                    placeholder: 'Enter an emoji for the store',
                    required: false,
                    max_length: 10
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
            
            // Sanitize emoji value to prevent Discord API errors
            let buttonEmojiValue = currentValues.emoji || '';
            // Check for replacement characters or other invalid characters
            if (buttonEmojiValue && buttonEmojiValue.includes('�')) {
                console.warn(`⚠️ Corrupted emoji detected for button ${buttonId}, using empty string`);
                buttonEmojiValue = '';
            }
            
            components.push({
                type: 1, // ActionRow
                components: [{
                    type: 4, // Text Input
                    custom_id: 'emoji',
                    label: 'Button Emoji',
                    style: 1, // Short
                    value: buttonEmojiValue,
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
 * Create modal for enemy field editing
 */
function createEnemyFieldModal(enemyId, fieldGroupId, group, currentValues) {
    const components = [];

    // Handle new enemy creation
    if (enemyId === 'new' && fieldGroupId === 'info') {
        components.push({
            type: 18, label: 'Enemy Name',
            component: { type: 4, custom_id: 'name', style: 1, placeholder: 'Enter enemy name', required: true, max_length: SAFARI_LIMITS.MAX_ENEMY_NAME_LENGTH }
        });
        components.push({
            type: 18, label: 'Enemy Emoji', description: 'Unicode emoji or custom Discord emoji code.',
            component: { type: 4, custom_id: 'emoji', style: 1, placeholder: 'e.g. 🐙 or <:name:id>', required: false, max_length: 100 }
        });
        components.push({
            type: 18, label: 'Description', description: 'Shown to players during combat.',
            component: { type: 4, custom_id: 'description', style: 2, placeholder: 'Describe the enemy...', required: false, max_length: SAFARI_LIMITS.MAX_ENEMY_DESCRIPTION_LENGTH }
        });
        components.push({
            type: 18, label: 'HP (Health Points)', description: 'How much damage the enemy can take.',
            component: { type: 4, custom_id: 'hp', style: 1, value: '10', placeholder: '1-9999', required: true, max_length: 4 }
        });
        components.push({
            type: 18, label: 'Attack Value', description: 'Damage dealt to the player each turn.',
            component: { type: 4, custom_id: 'attackValue', style: 1, value: '1', placeholder: '1-999', required: true, max_length: 3 }
        });

        return {
            type: InteractionResponseType.MODAL,
            data: {
                title: 'Create New Enemy',
                custom_id: `entity_create_modal_enemy_info`,
                components
            }
        };
    }

    switch (fieldGroupId) {
        case 'info':
            components.push({
                type: 18, label: 'Enemy Name',
                component: { type: 4, custom_id: 'name', style: 1, value: currentValues.name || '', placeholder: 'Enter enemy name', required: true, max_length: SAFARI_LIMITS.MAX_ENEMY_NAME_LENGTH }
            });
            let enemyEmojiValue = currentValues.emoji || '';
            if (enemyEmojiValue && enemyEmojiValue.includes('�')) {
                console.warn(`⚠️ Corrupted emoji detected for enemy ${enemyId}, using empty string`);
                enemyEmojiValue = '';
            }
            components.push({
                type: 18, label: 'Enemy Emoji', description: 'Unicode emoji or custom Discord emoji code.',
                component: { type: 4, custom_id: 'emoji', style: 1, value: enemyEmojiValue, placeholder: 'e.g. 🐙 or <:name:id>', required: false, max_length: 100 }
            });
            components.push({
                type: 18, label: 'Description', description: 'Shown to players during combat.',
                component: { type: 4, custom_id: 'description', style: 2, value: currentValues.description || '', placeholder: 'Describe the enemy...', required: false, max_length: SAFARI_LIMITS.MAX_ENEMY_DESCRIPTION_LENGTH }
            });
            components.push({
                type: 18, label: 'Image URL', description: 'Shown during combat. Upload to Discord first, then paste the CDN link.',
                component: { type: 4, custom_id: 'image', style: 2, value: currentValues.image || '', placeholder: 'https://cdn.discordapp.com/attachments/...', required: false, max_length: 500 }
            });
            break;

        case 'combat':
            components.push({
                type: 18, label: 'HP (Health Points)', description: 'How much damage the enemy can take before being defeated.',
                component: { type: 4, custom_id: 'hp', style: 1, value: (currentValues.hp ?? '').toString(), placeholder: '1-9999', required: true, max_length: 4 }
            });
            components.push({
                type: 18, label: 'Attack Value', description: 'Damage dealt to the player each turn.',
                component: { type: 4, custom_id: 'attackValue', style: 1, value: (currentValues.attackValue ?? '').toString(), placeholder: '1-999', required: true, max_length: 3 }
            });
            components.push({
                type: 18, label: 'Turn Order', description: 'Who attacks first each turn?',
                component: {
                    type: 3, // String Select
                    custom_id: 'turnOrder',
                    required: false,
                    options: [
                        { label: 'Player First', value: 'player_first', description: 'Player attacks, then enemy (if alive)', default: (currentValues.turnOrder || 'player_first') === 'player_first' },
                        { label: 'Enemy First', value: 'enemy_first', description: 'Enemy attacks, then player (if alive)', default: currentValues.turnOrder === 'enemy_first' },
                        { label: 'Simultaneous', value: 'simultaneous', description: 'Both attack at the same time (double KO possible)', default: currentValues.turnOrder === 'simultaneous' }
                    ]
                }
            });
            break;

        // 'appearance' field group merged into 'info' — image URL is now in the info modal
    }

    return {
        type: InteractionResponseType.MODAL,
        data: {
            title: `Edit ${group.label}`,
            custom_id: `entity_modal_submit_enemy_${enemyId}_${fieldGroupId}`,
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
 * Create default item select component for items
 * @param {string} itemId - Item ID
 * @param {string} currentValue - Current default item value
 * @returns {Object} ActionRow with select menu
 */
export function createDefaultItemSelect(itemId, currentValue = 'No') {
    return {
        type: 1, // ActionRow
        components: [{
            type: 3, // String Select
            custom_id: `entity_defaultitem_select_item_${itemId}`,
            placeholder: 'Select default item status',
            options: [
                {
                    label: 'No',
                    value: 'No',
                    description: 'Not granted on initialization/reset',
                    default: currentValue === 'No' || !currentValue
                },
                {
                    label: 'Yes - 1x Granted on Initialization/Reset',
                    value: 'Yes',
                    description: 'Players receive 1x when initialized or game resets',
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
    
    // Extract values from components (supports both Label and ActionRow wrappers)
    for (const row of modalData.components || []) {
        // Label (type 18): single component in row.component
        // ActionRow (type 1): array in row.components
        const componentList = row.component ? [row.component] : (row.components || []);
        for (const component of componentList) {
            const fieldId = component.custom_id;
            // TextInput: component.value, String Select: component.values[0]
            const value = Array.isArray(component.values) ? component.values[0] : component.value;
            
            // Parse and validate based on field type
            switch (fieldId) {
                case 'basePrice':
                case 'goodOutcomeValue':
                case 'badOutcomeValue':
                case 'attackValue':
                case 'defenseValue':
                case 'staminaBoost':
                case 'turnOrder':
                    // String Select value — already validated
                    fields[fieldId] = value || 'player_first';
                    break;
                case 'hp':
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

                case 'reverseBlacklist':
                    // Parse comma-separated coordinates
                    if (value) {
                        const coords = value.split(',')
                            .map(coord => coord.trim().toUpperCase())
                            .filter(coord => coord.match(/^[A-Z]\d+$/));
                        fields[fieldId] = coords.length > 0 ? coords : [];
                    } else {
                        fields[fieldId] = [];
                    }
                    break;

                case 'emoji':
                    // Store raw emoji string; empty = default
                    fields[fieldId] = value?.trim() || '📍';
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
        case 'enemy':
            if (fields.hp !== undefined && fields.hp !== null) {
                if (fields.hp < 1 || fields.hp > 9999) {
                    errors.push('HP must be between 1 and 9999');
                }
            }
            if (fields.attackValue !== undefined && fields.attackValue !== null) {
                if (fields.attackValue < 1 || fields.attackValue > 999) {
                    errors.push('Attack must be between 1 and 999');
                }
            }
            if (fields.image && fields.image.length > 500) {
                errors.push('Image URL must be 500 characters or less');
            }
            break;
        case 'map_cell':
            // Validate map cell fields
            if (fields.title && fields.title.length > 100) {
                errors.push('Title must be 100 characters or less');
            }
            if (fields.description && fields.description.length > 1000) {
                errors.push('Description must be 1000 characters or less');
            }
            if (fields.image && fields.image.length > 500) {
                errors.push('Image URL must be 500 characters or less');
            }
            if (fields.emoji && fields.emoji.length > 50) {
                errors.push('Emoji must be 50 characters or less');
            }
            if (fields.buttons && typeof fields.buttons === 'string') {
                // Parse buttons field as comma-separated list
                const buttonIds = fields.buttons.split(',').map(id => id.trim()).filter(id => id);
                if (buttonIds.length > 10) {
                    errors.push('Maximum 10 safari buttons allowed per location');
                }
                // Convert back to array
                fields.buttons = buttonIds;
            }
            break;
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Create modal for map cell field editing
 */
function createMapCellFieldModal(entityId, fieldGroupId, group, currentValues) {
    const customId = `entity_modal_submit_map_cell_${entityId}_${fieldGroupId}`;
    const title = `Edit ${entityId} Details`;

    // Use Label-wrapped components (modern pattern) for map cell modals
    switch (fieldGroupId) {
        case 'info': {
            return {
                type: InteractionResponseType.MODAL,
                data: {
                    custom_id: customId,
                    title,
                    components: [
                        {
                            type: 18, // Label
                            label: 'Location Title',
                            description: 'The name shown at the top of this location.',
                            component: {
                                type: 4, // Text Input
                                custom_id: 'title',
                                style: 1, // Short
                                value: currentValues.baseContent?.title || '',
                                required: true,
                                max_length: 100
                            }
                        },
                        {
                            type: 18, // Label
                            label: 'Location Emoji',
                            description: 'Emoji for channel name and navigation. Default: 📍',
                            component: {
                                type: 4, // Text Input
                                custom_id: 'emoji',
                                style: 1, // Short
                                value: currentValues.emoji || '📍',
                                required: false,
                                max_length: 50
                            }
                        },
                        {
                            type: 18, // Label
                            label: 'Location Description',
                            description: 'Flavour text players see when they visit. Supports markdown.',
                            component: {
                                type: 4, // Text Input
                                custom_id: 'description',
                                style: 2, // Paragraph
                                value: currentValues.baseContent?.description || '',
                                required: true,
                                max_length: 1000
                            }
                        },
                        {
                            type: 18, // Label
                            label: 'Image URL (Displays under map)',
                            description: 'Upload to Discord first, then paste the CDN link. Leave empty to remove.',
                            component: {
                                type: 4, // Text Input
                                custom_id: 'image',
                                style: 2, // Paragraph
                                value: currentValues.baseContent?.image || '',
                                required: false,
                                max_length: 500,
                                placeholder: 'https://cdn.discordapp.com/attachments/...'
                            }
                        }
                    ]
                }
            };
        }
        case 'interaction': {
            const buttonsText = currentValues.buttons ? currentValues.buttons.join(', ') : '';
            return {
                type: InteractionResponseType.MODAL,
                data: {
                    custom_id: customId,
                    title,
                    components: [
                        {
                            type: 18, // Label
                            label: 'Action IDs',
                            description: 'Comma-separated list of action IDs assigned to this location.',
                            component: {
                                type: 4, // Text Input
                                custom_id: 'buttons',
                                style: 2, // Paragraph
                                value: buttonsText,
                                required: false,
                                max_length: 500,
                                placeholder: 'action_id_1, action_id_2, action_id_3'
                            }
                        }
                    ]
                }
            };
        }
        default: {
            // Fallback for any other field groups using legacy ModalBuilder
            const modal = new ModalBuilder()
                .setCustomId(customId)
                .setTitle(title);
            return {
                type: InteractionResponseType.MODAL,
                data: modal
            };
        }
    }
}