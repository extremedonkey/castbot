/**
 * Entity Management UI Framework for Safari System
 * Provides a unified interface for managing items, stores, and Safari buttons
 * Built with Discord Components V2
 */

import {
    InteractionResponseType,
    InteractionResponseFlags
} from 'discord-interactions';
import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { EDIT_CONFIGS } from './editFramework.js';
import { SAFARI_LIMITS } from './config/safariLimits.js';
import { parseTextEmoji } from './utils/emojiUtils.js';

/**
 * Create the main entity management UI
 * @param {Object} options - Configuration options
 * @returns {Object} Discord Components V2 response
 */
export async function createEntityManagementUI(options) {
    const {
        entityType,          // 'item', 'store', 'safari_button'
        guildId,
        selectedId = null,
        activeFieldGroup = null,  // For grouped modal editing
        searchTerm = '',
        mode = 'edit'        // Default to 'edit' mode - no separate view mode
    } = options;
    
    // Load entity data
    const safariData = await loadSafariContent();
    const guildData = safariData[guildId] || {};
    const entities = getEntitiesForType(guildData, entityType);
    const config = EDIT_CONFIGS[entityType];
    
    if (!config) {
        throw new Error(`Unknown entity type: ${entityType}`);
    }
    
    // Get selected entity
    const selectedEntity = selectedId ? entities[selectedId] : null;
    
    // Filter entities if search term provided
    const filteredEntities = filterEntities(entities, searchTerm);
    
    // Build Components V2 UI
    const components = [{
        type: 17, // Container
        accent_color: 0xf39c12, // Orange like Safari menu
        components: [
            // Title
            {
                type: 10, // Text Display
                content: `## ${config.displayName}`
            },
            
            // Entity selector
            createEntitySelector(filteredEntities, selectedId, entityType, searchTerm),
            
            // Show entity details if selected
            ...(selectedEntity ? [
                { type: 14 }, // Separator
                createEntityDisplay(selectedEntity, entityType, guildData.safariConfig)
            ] : []),
            
            // Mode-specific UI
            ...(selectedEntity ? await createModeSpecificUI(mode, entityType, selectedId, selectedEntity, activeFieldGroup, guildId) : [])
        ]
    }];
    
    return {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components
    };
}

/**
 * Get entities for a specific type from guild data
 */
function getEntitiesForType(guildData, entityType) {
    switch (entityType) {
        case 'item':
            return guildData.items || {};
        case 'store':
            return guildData.stores || {};
        case 'safari_button':
            return guildData.buttons || {};
        case 'map_cell':
            const activeMapId = guildData.maps?.active;
            return guildData.maps?.[activeMapId]?.coordinates || {};
        default:
            return {};
    }
}

/**
 * Filter entities based on search term
 */
function filterEntities(entities, searchTerm) {
    if (!searchTerm) return entities;
    
    const filtered = {};
    const search = searchTerm.toLowerCase();
    
    for (const [id, entity] of Object.entries(entities)) {
        const name = (entity.name || entity.label || '').toLowerCase();
        const description = (entity.description || '').toLowerCase();
        
        if (name.includes(search) || description.includes(search)) {
            filtered[id] = entity;
        }
    }
    
    return filtered;
}

/**
 * Create entity selector dropdown
 */
function createEntitySelector(entities, selectedId, entityType, searchTerm) {
    const options = [];
    
    // Add "Create new" option first
    options.push({
        label: '➕ Create New',
        value: 'create_new',
        emoji: { name: '✨' },
        description: `Create a new ${EDIT_CONFIGS[entityType]?.displayName?.toLowerCase() || 'entity'}`
    });
    
    // Add search option if many entities
    if (Object.keys(entities).length > 10) {
        options.push({
            label: `🔍 Search: "${searchTerm || 'Type to search...'}"`,
            value: 'search_entities',
            description: 'Click to search entities'
        });
    }
    
    // Add entity options
    Object.entries(entities).forEach(([id, entity]) => {
        let name, emoji;
        
        if (entityType === 'map_cell') {
            name = id; // Use coordinate as name (e.g., "A1")
            emoji = '📍';
        } else {
            name = entity.name || entity.label || 'Unnamed';
            emoji = entity.emoji || getDefaultEmoji(entityType);
        }
        
        const { cleanText, emoji: parsedEmoji } = parseTextEmoji(`${emoji} ${name}`, getDefaultEmoji(entityType));
        options.push({
            label: cleanText.substring(0, 100),
            value: id,
            description: getEntityDescription(entity, entityType),
            emoji: parsedEmoji,
            default: id === selectedId
        });
    });
    
    // Limit options to leave room for "Create new" (which is already added)
    if (options.length > 25) {
        // Keep "Create new" and search, trim entities
        const createNew = options[0];
        const search = options.length > 10 && options[1].value === 'search_entities' ? options[1] : null;
        const entities = options.slice(search ? 2 : 1);
        
        options.length = 0;
        options.push(createNew);
        if (search) options.push(search);
        options.push(...entities.slice(0, 23 - options.length));
    }
    
    return {
        type: 1, // ActionRow
        components: [{
            type: 3, // String Select
            custom_id: `entity_select_${entityType}`,
            placeholder: searchTerm ? `Filtered: "${searchTerm}"` : 'Select an entity or create new...',
            options
        }]
    };
}

/**
 * Create entity display
 */
function createEntityDisplay(entity, entityType, safariConfig) {
    const lines = [];
    
    // Add basic info
    if (entity.name || entity.label) {
        lines.push(`**Name**: ${entity.emoji || ''} ${entity.name || entity.label}`);
    }
    
    if (entity.description) {
        lines.push(`**Description**: ${entity.description}`);
    }
    
    // Add type-specific info
    switch (entityType) {
        case 'item':
            if (entity.basePrice !== undefined) {
                const currency = safariConfig?.currencyEmoji || '🪙';
                lines.push(`**Base Price**: ${entity.basePrice} ${currency}`);
            }
            if (entity.goodOutcomeValue !== undefined && entity.goodOutcomeValue !== null) {
                lines.push(`**Good Outcome**: ${entity.goodOutcomeValue}`);
            }
            if (entity.badOutcomeValue !== undefined && entity.badOutcomeValue !== null) {
                lines.push(`**Bad Outcome**: ${entity.badOutcomeValue}`);
            }
            if (entity.attackValue !== undefined && entity.attackValue !== null) {
                lines.push(`**Attack**: ${entity.attackValue}`);
            }
            if (entity.defenseValue !== undefined && entity.defenseValue !== null) {
                lines.push(`**Defense**: ${entity.defenseValue}`);
            }
            if (entity.consumable) {
                lines.push(`**Consumable**: ${entity.consumable}`);
            }
            break;
            
        case 'store':
            if (entity.items && entity.items.length > 0) {
                lines.push(`**Items**: ${entity.items.length} items in stock`);
            }
            break;
            
        case 'safari_button':
            if (entity.actions && entity.actions.length > 0) {
                lines.push(`**Actions**: ${entity.actions.length} actions configured`);
            }
            break;
            
        case 'map_cell':
            if (entity.baseContent?.title) {
                lines.push(`**Title**: ${entity.baseContent.title}`);
            }
            if (entity.baseContent?.description) {
                lines.push(`**Description**: ${entity.baseContent.description}`);
            }
            if (entity.buttons?.length > 0) {
                lines.push(`**Custom Actions**: ${entity.buttons.length} configured`);
            }
            break;
    }
    
    // Add metadata
    if (entity.metadata?.totalSold) {
        lines.push(`**Total Sold**: ${entity.metadata.totalSold}`);
    }
    
    return {
        type: 10, // Text Display
        content: lines.join('\n')
    };
}

/**
 * Create mode-specific UI elements
 */
async function createModeSpecificUI(mode, entityType, entityId, entity, activeFieldGroup, guildId) {
    switch (mode) {
        case 'delete_confirm':
            return createDeleteConfirmUI(entityType, entityId, entity);
        case 'edit':
        default:
            // Always default to edit mode - no separate view mode
            return await createEditModeUI(entityType, entityId, entity, activeFieldGroup, guildId);
    }
}


/**
 * Create edit mode UI
 */
async function createEditModeUI(entityType, entityId, entity, activeFieldGroup, guildId) {
    const components = [
        { type: 14 }, // Separator
        ...createFieldGroupButtons(entityType, entityId, activeFieldGroup),
        { type: 14 }, // Separator
    ];
    
    // Check for modal trigger actions if this is a map cell
    let hasModalTriggers = false;
    if (entityType === 'map_cell' && guildId) {
        try {
            const { loadSafariContent } = await import('./safariManager.js');
            const safariData = await loadSafariContent();
            const activeMapId = safariData[guildId]?.maps?.active;
            const coordData = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[entityId];
            const buttonIds = coordData?.buttons || [];
            const buttons = safariData[guildId]?.buttons || {};
            
            // Check if any assigned buttons have modal triggers
            for (const buttonId of buttonIds) {
                const button = buttons[buttonId];
                if (button?.trigger?.type === 'modal') {
                    hasModalTriggers = true;
                    break;
                }
            }
        } catch (error) {
            console.error('Error checking for modal triggers:', error);
        }
    }
    
    // Create action row with conditional admin test button
    const actionRowComponents = [
        {
            type: 2, // Button
            style: 2, // Secondary
            label: '← Safari',
            custom_id: 'prod_safari_menu',
            emoji: { name: '🦁' }
        }
    ];
    
    // Add admin test command button if there are modal triggers
    if (hasModalTriggers) {
        actionRowComponents.push({
            type: 2, // Button
            style: 2, // Secondary (grey)
            label: 'Test Command',
            custom_id: `admin_test_command_${entityId}`,
            emoji: { name: '🧪' }
        });
    }
    
    // Add Player Qty button only for items
    if (entityType === 'item') {
        actionRowComponents.push({
            type: 2, // Button
            style: 2, // Secondary (grey)
            label: 'Player Qty',
            custom_id: `safari_item_player_qty_${entityId}`,
            emoji: { name: '📦' }
        });
    }
    
    // Add Delete button for all entity types except map_cell (moved to far right)
    if (entityType !== 'map_cell') {
        actionRowComponents.push({
            type: 2, // Button
            style: 4, // Danger
            label: 'Delete',
            custom_id: `entity_delete_mode_${entityType}_${entityId}`,
            emoji: { name: '🗑️' }
        });
    }
    
    components.push({
        type: 1, // ActionRow
        components: actionRowComponents
    });
    
    return components;
}

/**
 * Create field group buttons for editing
 */
function createFieldGroupButtons(entityType, entityId, activeFieldGroup) {
    const buttons = [];
    
    // Define field groups based on entity type
    const fieldGroups = getFieldGroups(entityType);
    
    Object.entries(fieldGroups).forEach(([groupId, group]) => {
        buttons.push({
            type: 2, // Button
            style: activeFieldGroup === groupId ? 1 : 2, // Primary if active
            label: group.label,
            custom_id: `entity_field_group_${entityType}_${entityId}_${groupId}`,
            emoji: { name: group.emoji }
        });
    });
    
    return createButtonRows(buttons);
}

/**
 * Get field groups for entity type
 */
export function getFieldGroups(entityType) {
    switch (entityType) {
        case 'item':
            return {
                info: { label: 'Item Info', emoji: '📝', fields: ['name', 'description'] },
                financials: { label: 'Financials', emoji: '💰', fields: ['basePrice', 'goodOutcomeValue', 'badOutcomeValue'] },
                battle: { label: 'Battle', emoji: '⚔️', fields: ['attackValue', 'defenseValue'] },
                properties: { label: 'Properties', emoji: '⚙️', fields: ['consumable'] }
            };
        case 'store':
            return {
                info: { label: 'Store Info', emoji: '📝', fields: ['name', 'description'] },
                settings: { label: 'Settings', emoji: '⚙️', fields: ['storeownerText', 'accentColor'] },
                items: { label: 'Items', emoji: '📦', fields: ['items'] }
            };
        case 'safari_button':
            return {
                info: { label: 'Button Info', emoji: '📝', fields: ['label', 'emoji', 'style'] },
                actions: { label: 'Actions', emoji: '🎯', fields: ['actions'] }
            };
        case 'map_cell':
            return {
                info: { label: 'Location Info', emoji: '📝', fields: ['title', 'description'] },
                media: { label: 'Media', emoji: '🖼️', fields: ['image'] },
                interaction: { label: 'Custom Actions', emoji: '⚡', fields: ['buttons'] },
                stores: { label: 'Add Store', emoji: '🏪', fields: ['stores'] },
                items: { label: 'Manage Drops', emoji: '🧰', fields: ['itemDrops', 'currencyDrops'] }
            };
        default:
            return {};
    }
}

/**
 * Create field group editor
 */
function createFieldGroupEditor(entityType, entityId, entity, activeFieldGroup) {
    const fieldGroups = getFieldGroups(entityType);
    const group = fieldGroups[activeFieldGroup];
    
    if (!group) return null;
    
    // For most field groups, show a button to open modal
    return {
        type: 1, // ActionRow
        components: [{
            type: 2, // Button
            style: 3, // Success
            label: `Edit ${group.label}`,
            custom_id: `entity_edit_modal_${entityType}_${entityId}_${activeFieldGroup}`,
            emoji: { name: '📝' }
        }]
    };
}

/**
 * Create delete confirmation UI
 */
function createDeleteConfirmUI(entityType, entityId, entity) {
    const name = entity.name || entity.label || 'this item';
    
    return [
        { type: 14 }, // Separator
        {
            type: 10, // Text Display
            content: `⚠️ **Confirm Deletion**\n\nAre you sure you want to delete **${name}**?\n\n⚡ This action cannot be undone.`
        },
        {
            type: 1, // ActionRow
            components: [
                {
                    type: 2, // Button
                    style: 4, // Danger
                    label: 'Yes, Delete',
                    custom_id: `entity_confirm_delete_${entityType}_${entityId}`,
                    emoji: { name: '⚠️' }
                },
                {
                    type: 2, // Button
                    style: 2, // Secondary
                    label: 'Cancel',
                    custom_id: `entity_view_mode_${entityType}_${entityId}`,
                    emoji: { name: '❌' }
                }
            ]
        }
    ];
}

/**
 * Create button rows from array of buttons
 */
function createButtonRows(buttons) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push({
            type: 1, // ActionRow
            components: buttons.slice(i, i + 5)
        });
    }
    return rows;
}

/**
 * Get default emoji for entity type
 */
function getDefaultEmoji(entityType) {
    switch (entityType) {
        case 'item': return '📦';
        case 'store': return '🏪';
        case 'safari_button': return '🦁';
        case 'map_cell': return '📍';
        default: return '📋';
    }
}

/**
 * Get entity description for dropdown
 */
function getEntityDescription(entity, entityType) {
    const parts = [];
    
    switch (entityType) {
        case 'item':
            if (entity.basePrice !== undefined) {
                parts.push(`Price: ${entity.basePrice}`);
            }
            if (entity.category) {
                parts.push(`Category: ${entity.category}`);
            }
            break;
        case 'store':
            if (entity.items) {
                parts.push(`${entity.items.length} items`);
            }
            break;
        case 'safari_button':
            if (entity.actions) {
                parts.push(`${entity.actions.length} actions`);
            }
            if (entity.style) {
                parts.push(entity.style);
            }
            break;
        case 'map_cell':
            if (entity.baseContent?.title) {
                parts.push(`Title: ${entity.baseContent.title.replace('📍 ', '')}`);
            }
            if (entity.buttons?.length > 0) {
                parts.push(`${entity.buttons.length} custom actions`);
            }
            if (entity.cellType && entity.cellType !== 'unexplored') {
                parts.push(entity.cellType);
            }
            break;
    }
    
    return parts.join(' • ').substring(0, 100) || entity.description?.substring(0, 100) || '';
}

export {
    getDefaultEmoji,
    getEntitiesForType,
    filterEntities
};