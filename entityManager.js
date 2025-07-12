/**
 * Entity Manager for Safari System
 * Handles CRUD operations for items, stores, and Safari buttons
 * Maintains compatibility with existing safariContent.json structure
 */

import { loadSafariContent, saveSafariContent, generateButtonId } from './safariManager.js';
import { EDIT_CONFIGS } from './editFramework.js';
import { SAFARI_LIMITS } from './config/safariLimits.js';

/**
 * Load entities of a specific type for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} entityType - Type of entity (item, store, safari_button, safari_config)
 * @returns {Object} Entities object
 */
export async function loadEntities(guildId, entityType) {
    const safariData = await loadSafariContent();
    const guildData = safariData[guildId] || {};
    
    switch (entityType) {
        case 'item':
            return guildData.items || {};
        case 'store':
            return guildData.stores || {};
        case 'safari_button':
            return guildData.buttons || {};
        case 'safari_config':
            return guildData.safariConfig || {};
        case 'map_cell':
            const activeMapId = guildData.maps?.active;
            return guildData.maps?.[activeMapId]?.coordinates || {};
        default:
            return {};
    }
}

/**
 * Load a single entity
 * @param {string} guildId - Discord guild ID
 * @param {string} entityType - Type of entity
 * @param {string} entityId - Entity ID
 * @returns {Object|null} Entity object or null if not found
 */
export async function loadEntity(guildId, entityType, entityId) {
    const entities = await loadEntities(guildId, entityType);
    return entities[entityId] || null;
}

/**
 * Update an entity
 * @param {string} guildId - Discord guild ID
 * @param {string} entityType - Type of entity
 * @param {string} entityId - Entity ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated entity
 */
export async function updateEntity(guildId, entityType, entityId, updates) {
    const safariData = await loadSafariContent();
    
    // Initialize guild data if needed
    if (!safariData[guildId]) {
        safariData[guildId] = {
            buttons: {},
            safaris: {},
            applications: {},
            stores: {},
            items: {},
            safariConfig: {
                currencyName: 'coins',
                inventoryName: 'Nest',
                currencyEmoji: '🪙'
            }
        };
    }
    
    const entityPath = getEntityPath(entityType);
    if (!safariData[guildId][entityPath]) {
        safariData[guildId][entityPath] = {};
    }
    
    // Get existing entity
    const entity = safariData[guildId][entityPath][entityId];
    if (!entity) {
        throw new Error(`Entity ${entityId} not found`);
    }
    
    // Apply updates
    Object.assign(entity, updates);
    
    // Update metadata
    if (!entity.metadata) {
        entity.metadata = {};
    }
    entity.metadata.lastModified = Date.now();
    
    // Save changes
    await saveSafariContent(safariData);
    
    return entity;
}

/**
 * Update specific fields of an entity
 * @param {string} guildId - Discord guild ID
 * @param {string} entityType - Type of entity
 * @param {string} entityId - Entity ID
 * @param {Object} fieldUpdates - Object with field names and values
 * @returns {Object} Updated entity
 */
export async function updateEntityFields(guildId, entityType, entityId, fieldUpdates) {
    const safariData = await loadSafariContent();
    
    // Ensure guild exists
    if (!safariData[guildId]) {
        throw new Error(`Guild ${guildId} not found`);
    }
    
    let entity;
    if (entityType === 'map_cell') {
        // Special handling for map cells
        const activeMapId = safariData[guildId]?.maps?.active;
        entity = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[entityId];
    } else {
        const entityPath = getEntityPath(entityType);
        entity = safariData[guildId][entityPath]?.[entityId];
    }
    
    if (!entity) {
        throw new Error(`Entity ${entityId} not found`);
    }
    
    // Apply field updates
    for (const [field, value] of Object.entries(fieldUpdates)) {
        // Special handling for map_cell fields
        if (entityType === 'map_cell') {
            if (field === 'title' || field === 'description' || field === 'image') {
                // These go in baseContent
                if (!entity.baseContent) entity.baseContent = {};
                entity.baseContent[field] = value;
            } else {
                // Other fields go at root level
                entity[field] = value;
            }
        } else {
            // Handle nested fields (e.g., settings.storeownerText)
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                if (!entity[parent]) {
                    entity[parent] = {};
                }
                entity[parent][child] = value;
            } else {
                entity[field] = value;
            }
        }
    }
    
    // Update metadata
    if (!entity.metadata) {
        entity.metadata = {};
    }
    entity.metadata.lastModified = Date.now();
    
    // Save changes
    await saveSafariContent(safariData);
    
    // Special handling for map_cell - update anchor message
    if (entityType === 'map_cell') {
        try {
            const { updateAnchorMessage } = await import('./mapCellUpdater.js');
            // Note: client is not available here, will need to be passed differently
            // For now, just log that update is needed
            console.log(`📍 Map cell ${entityId} updated - anchor message update needed`);
        } catch (error) {
            console.error('Error updating anchor message:', error);
        }
    }
    
    return entity;
}

/**
 * Create a new entity
 * @param {string} guildId - Discord guild ID
 * @param {string} entityType - Type of entity
 * @param {Object} entityData - Entity data
 * @param {string} userId - User ID creating the entity
 * @returns {Object} Created entity with ID
 */
export async function createEntity(guildId, entityType, entityData, userId) {
    const safariData = await loadSafariContent();
    
    // Initialize guild data if needed
    if (!safariData[guildId]) {
        safariData[guildId] = {
            buttons: {},
            safaris: {},
            applications: {},
            stores: {},
            items: {},
            safariConfig: {
                currencyName: 'coins',
                inventoryName: 'Nest',
                currencyEmoji: '🪙'
            }
        };
    }
    
    const entityPath = getEntityPath(entityType);
    if (!safariData[guildId][entityPath]) {
        safariData[guildId][entityPath] = {};
    }
    
    // Generate ID based on entity type
    const entityId = generateEntityId(entityType, entityData);
    
    // Create entity object
    const entity = {
        id: entityId,
        ...entityData,
        metadata: {
            createdBy: userId,
            createdAt: Date.now(),
            lastModified: Date.now()
        }
    };
    
    // Apply entity-specific defaults
    applyEntityDefaults(entity, entityType);
    
    // Validate entity limits
    const entityCount = Object.keys(safariData[guildId][entityPath]).length;
    const limit = getEntityLimit(entityType);
    if (entityCount >= limit) {
        throw new Error(`Maximum ${entityType} limit reached (${limit})`);
    }
    
    // Save entity
    safariData[guildId][entityPath][entityId] = entity;
    await saveSafariContent(safariData);
    
    return entity;
}

/**
 * Delete an entity
 * @param {string} guildId - Discord guild ID
 * @param {string} entityType - Type of entity
 * @param {string} entityId - Entity ID
 * @returns {boolean} Success status
 */
export async function deleteEntity(guildId, entityType, entityId) {
    const safariData = await loadSafariContent();
    
    if (!safariData[guildId]) {
        return false;
    }
    
    const entityPath = getEntityPath(entityType);
    if (!safariData[guildId][entityPath] || !safariData[guildId][entityPath][entityId]) {
        return false;
    }
    
    // Delete the entity
    delete safariData[guildId][entityPath][entityId];
    
    // Clean up references based on entity type
    await cleanupEntityReferences(safariData, guildId, entityType, entityId);
    
    // Save changes
    await saveSafariContent(safariData);
    
    return true;
}

/**
 * Get entity path in data structure
 */
function getEntityPath(entityType) {
    switch (entityType) {
        case 'item': return 'items';
        case 'store': return 'stores';
        case 'safari_button': return 'buttons';
        case 'safari_config': return 'safariConfig';
        case 'map_cell': return 'maps'; // Special case - handled differently
        default: throw new Error(`Unknown entity type: ${entityType}`);
    }
}

/**
 * Generate entity ID
 */
function generateEntityId(entityType, entityData) {
    const name = entityData.name || entityData.label || 'unnamed';
    
    switch (entityType) {
        case 'item':
            return generateButtonId(name);
        case 'store':
            return generateButtonId(name); // Reuse same ID generation
        case 'safari_button':
            return generateButtonId(name);
        default:
            return `${entityType}_${Date.now()}`;
    }
}

/**
 * Apply entity-specific defaults
 */
function applyEntityDefaults(entity, entityType) {
    switch (entityType) {
        case 'item':
            // Set item defaults
            if (entity.maxQuantity === undefined) entity.maxQuantity = -1;
            if (entity.category === undefined) entity.category = 'General';
            if (entity.consumable === undefined) entity.consumable = 'No';
            if (entity.basePrice === undefined) entity.basePrice = 10; // Default price
            if (!entity.metadata.totalSold) entity.metadata.totalSold = 0;
            break;
            
        case 'store':
            // Set store defaults
            if (!entity.items) entity.items = [];
            if (!entity.settings) entity.settings = {};
            if (!entity.settings.accentColor) entity.settings.accentColor = 3447003;
            if (!entity.metadata.totalSales) entity.metadata.totalSales = 0;
            break;
            
        case 'safari_button':
            // Set button defaults
            if (!entity.style) entity.style = 'Primary';
            if (!entity.actions) entity.actions = [];
            if (!entity.metadata.usageCount) entity.metadata.usageCount = 0;
            if (!entity.metadata.tags) entity.metadata.tags = [];
            break;
    }
}

/**
 * Get entity limit from SAFARI_LIMITS
 */
function getEntityLimit(entityType) {
    switch (entityType) {
        case 'item': return SAFARI_LIMITS.MAX_ITEMS_PER_GUILD;
        case 'store': return SAFARI_LIMITS.MAX_STORES_PER_GUILD;
        case 'safari_button': return SAFARI_LIMITS.MAX_BUTTONS_PER_GUILD;
        default: return 100;
    }
}

/**
 * Clean up references when deleting an entity
 */
async function cleanupEntityReferences(safariData, guildId, entityType, entityId) {
    switch (entityType) {
        case 'item':
            // Remove item from all stores
            const stores = safariData[guildId].stores || {};
            for (const store of Object.values(stores)) {
                if (store.items) {
                    store.items = store.items.filter(item => item.itemId !== entityId);
                }
            }
            break;
            
        case 'safari_button':
            // Remove button references from follow-up actions
            const buttons = safariData[guildId].buttons || {};
            for (const button of Object.values(buttons)) {
                if (button.actions) {
                    for (const action of button.actions) {
                        if (action.type === 'follow_up_button' && 
                            action.config?.buttonId === entityId) {
                            // Clear the button reference
                            delete action.config.buttonId;
                        }
                    }
                }
            }
            break;
    }
}

/**
 * Search entities by term
 * @param {string} guildId - Discord guild ID
 * @param {string} entityType - Type of entity
 * @param {string} searchTerm - Search term
 * @returns {Object} Filtered entities
 */
export async function searchEntities(guildId, entityType, searchTerm) {
    const entities = await loadEntities(guildId, entityType);
    
    if (!searchTerm) return entities;
    
    const filtered = {};
    const search = searchTerm.toLowerCase();
    
    for (const [id, entity] of Object.entries(entities)) {
        const name = (entity.name || entity.label || '').toLowerCase();
        const description = (entity.description || '').toLowerCase();
        const tags = (entity.metadata?.tags || []).join(' ').toLowerCase();
        
        if (name.includes(search) || 
            description.includes(search) || 
            tags.includes(search)) {
            filtered[id] = entity;
        }
    }
    
    return filtered;
}

export {
    getEntityPath,
    generateEntityId,
    applyEntityDefaults,
    getEntityLimit
};