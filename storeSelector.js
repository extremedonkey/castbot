/**
 * Store Selector Module
 * Reusable store selection UI for Safari system
 * Supports both management and location-based actions with toggle functionality
 */

import { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { parseTextEmoji } from './utils/emojiUtils.js';

/**
 * Create reusable store selection UI
 * @param {Object} options - Configuration options
 * @returns {Object} Discord Components V2 response
 */
export async function createStoreSelectionUI(options) {
  const {
    guildId,
    action = 'manage_items',
    entityId = null,
    preSelectedStores = [],
    title = '🏪 Select Store',
    backButtonId = 'prod_safari_menu',
    backButtonLabel = '← Safari',
    backButtonEmoji = '🦁',
    searchTerm = ''
  } = options;

  const safariData = await loadSafariContent();
  let stores = safariData[guildId]?.stores || {};

  // Apply search filtering if searchTerm provided
  if (searchTerm) {
    const filteredStores = {};
    for (const [id, store] of Object.entries(stores)) {
      const name = store.name?.toLowerCase() || '';
      const description = store.description?.toLowerCase() || '';
      if (name.includes(searchTerm) || description.includes(searchTerm)) {
        filteredStores[id] = store;
      }
    }
    stores = filteredStores;
    console.log(`🔍 DEBUG: Filtered to ${Object.keys(stores).length} stores matching "${searchTerm}"`);
  }

  if (Object.keys(stores).length === 0) {
    const noResultsMessage = searchTerm
      ? `❌ **No stores found**\n\nNo stores match "${searchTerm}". Try a different search term.`
      : '❌ **No stores to manage**\n\nCreate your first store using **🏪 Create New Store** before managing store items.';

    return {
      content: noResultsMessage,
      ephemeral: true
    };
  }

  // Create store selection dropdown
  const storeOptions = [];
  const storeCount = Object.keys(stores).length;

  // Calculate reserved slots and determine if we need search
  let reservedSlots = 0;

  if (action === 'manage_items') {
    // Always add "Create New Store" for management
    storeOptions.push({
      label: 'Create New Store',
      value: 'create_new_store',
      description: 'Create a new store.',
      emoji: { name: '➕' }
    });
    reservedSlots = 1;
  }

  // Determine if we need search (when stores + reserved slots > 25)
  const needsSearch = (storeCount + reservedSlots) > 25;

  if (needsSearch) {
    storeOptions.push({
      label: 'Search Stores',
      value: action === 'manage_items' ? 'search_stores' : `search_stores_location_${entityId}`,
      description: `Search ${storeCount} stores by name or description`,
      emoji: { name: '🔍' }
    });
    reservedSlots += 1;
  }

  // Determine how many stores we can show (respect Discord's 25-option limit)
  const maxStoresToShow = 25 - reservedSlots;

  // Add existing stores
  Object.entries(stores).slice(0, maxStoresToShow).forEach(([storeId, store]) => {
    const itemCount = store.items?.length || 0;
    const { cleanText, emoji } = parseTextEmoji(`${store.emoji || ''} ${store.name}`, '🏪');
    const safeCleanText = cleanText || `${store.emoji || '🏪'} ${store.name || 'Unnamed Store'}`;

    // Handle description and visual indicators based on action
    let description;
    let label = safeCleanText.slice(0, 100);

    if (action === 'manage_items') {
      description = `Sells ${itemCount} type${itemCount !== 1 ? 's' : ''} of items`.slice(0, 100);
    } else if (action === 'add_to_location') {
      // Add visual indicators for location stores (bulletproof approach)
      if (preSelectedStores.includes(storeId)) {
        label = label + ' (✅ Currently Added)';
        description = 'Click to remove from this location';
      } else {
        description = 'Click to add to this location';
      }
    } else {
      const storeDesc = store.description?.trim();
      description = storeDesc && storeDesc.length > 0 ? storeDesc.slice(0, 100) : undefined;
    }

    storeOptions.push({
      label: label,
      value: storeId,
      description: description,
      emoji: emoji
      // Removed default pre-selection - using visual indicators instead
    });
  });

  // Configure select menu based on action
  const customId = action === 'manage_items'
    ? 'safari_store_items_select'
    : `safari_store_select_${action}${entityId ? `_${entityId}` : ''}`;

  const minValues = action === 'add_to_location' ? 0 : 1; // Allow deselect for location actions
  const maxValues = 1; // Always single select for proper toggle behavior

  const storeSelect = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select a store')
    .setMinValues(minValues)
    .setMaxValues(maxValues)
    .addOptions(storeOptions);

  const selectRow = new ActionRowBuilder().addComponents(storeSelect);

  // Create back button
  const backButton = new ButtonBuilder()
    .setCustomId(backButtonId)
    .setLabel(backButtonLabel)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(backButtonEmoji);

  const backRow = new ActionRowBuilder().addComponents(backButton);

  // Create description based on action and search
  let description;
  if (action === 'add_to_location') {
    const selectedCount = preSelectedStores.length;
    let baseDescription = selectedCount > 0
      ? `**Current**: ${selectedCount} store${selectedCount !== 1 ? 's' : ''}\n• Click highlighted stores to remove\n• Click others to add`
      : `Select a store to add to this location`;

    // Add search info if search term is provided
    if (searchTerm) {
      baseDescription = `**Search Results**: ${storeCount} store${storeCount !== 1 ? 's' : ''} matching "${searchTerm}"\n\n${baseDescription}`;
    }
    description = baseDescription;
  } else if (searchTerm) {
    // For manage_items with search
    description = `**Search Results**: ${storeCount} store${storeCount !== 1 ? 's' : ''} matching "${searchTerm}"`;
  }

  // Create response with Components V2
  const containerComponents = [
    {
      type: 10, // Text Display component
      content: description
        ? `## ${title}\n\n${description}`
        : `## ${title}`
    },
    {
      type: 14 // Separator
    },
    selectRow.toJSON(), // Store selection dropdown
    {
      type: 14 // Separator
    },
    backRow.toJSON() // Back button
  ];

  const container = {
    type: 17, // Container component
    accent_color: 0x3498db, // Blue accent color for items theme
    components: containerComponents
  };

  // Return format depends on how this will be used
  if (action === 'manage_items') {
    // Direct Discord response (for safari_store_manage_items)
    return {
      flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 + EPHEMERAL
      components: [container],
      ephemeral: true
    };
  } else {
    // ButtonHandlerFactory format (for entity_field_group handlers)
    // Return the container components directly - ButtonHandlerFactory will wrap them
    return {
      components: [{
        type: 17, // Container
        components: containerComponents
      }],
      flags: (1 << 15), // IS_COMPONENTS_V2
      ephemeral: true
    };
  }
}

/**
 * Handle store toggle for map locations
 * @param {Object} context - ButtonHandlerFactory context
 * @param {Object} client - Discord client
 * @returns {Object} Response object
 */
export async function handleStoreToggle(context, client) {
  const entityId = context.customId.replace('safari_store_select_add_to_location_', '');
  const selectedStoreId = context.values?.[0];

  console.log(`🏪 DEBUG: Location store toggle - coord ${entityId}, store: ${selectedStoreId || 'none'}`);

  // Handle search request (both original and location-specific patterns)
  if (selectedStoreId === 'search_stores' || selectedStoreId?.startsWith('search_stores_location_')) {
    console.log(`🔍 DEBUG: Location search stores selected from dropdown for ${entityId}`);

    // Load stores to get count for modal title
    const safariData = await loadSafariContent();
    const stores = safariData[context.guildId]?.stores || {};
    const storeCount = Object.keys(stores).length;

    // Show the search modal with location-specific custom_id
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    const modal = new ModalBuilder()
      .setCustomId(`safari_store_location_search_modal_${entityId}`)
      .setTitle(`Search ${storeCount} Stores for ${entityId}`);

    const searchInput = new TextInputBuilder()
      .setCustomId('search_term')
      .setLabel('Search by name or description')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)  // Allow empty search to show all
      .setMaxLength(100)
      .setPlaceholder('Enter store name or description...');

    const searchRow = new ActionRowBuilder().addComponents(searchInput);
    modal.addComponents(searchRow);

    return {
      type: 9, // MODAL
      data: modal.toJSON()
    };
  }

  // Load current map data
  const safariData = await loadSafariContent();
  const activeMapId = safariData[context.guildId]?.maps?.active;

  if (!activeMapId || !safariData[context.guildId].maps[activeMapId].coordinates[entityId]) {
    return {
      content: '❌ Location data not found.',
      ephemeral: true
    };
  }

  const coordData = safariData[context.guildId].maps[activeMapId].coordinates[entityId];
  const currentStores = coordData.stores || [];

  // Handle empty selection (deselect all)
  if (!selectedStoreId) {
    console.log(`🏪 DEBUG: Deselected all stores for ${entityId}`);
    // Return to entity management without changes
    const { createEntityManagementUI } = await import('./entityManagementUI.js');
    return await createEntityManagementUI({
      entityType: 'map_cell',
      guildId: context.guildId,
      selectedId: entityId,
      mode: 'edit'
    });
  }

  // Toggle logic: if store was selected, remove it; if not selected, add it
  const wasSelected = currentStores.includes(selectedStoreId);
  let newStores;

  if (wasSelected) {
    // 🗑️ REMOVE: User clicked a pre-selected (default: true) store
    newStores = currentStores.filter(id => id !== selectedStoreId);
    console.log(`🗑️ Removing store ${selectedStoreId} from ${entityId}`);
  } else {
    // ➕ ADD: User clicked a non-selected store
    newStores = [...currentStores, selectedStoreId];
    console.log(`➕ Adding store ${selectedStoreId} to ${entityId}`);
  }

  // Update coordinate data
  coordData.stores = newStores;

  // Remove stores from buttons array (cleanup) - existing logic
  if (coordData.buttons) {
    coordData.buttons = coordData.buttons.filter(buttonId =>
      !newStores.includes(buttonId) &&
      !Object.keys(safariData[context.guildId]?.stores || {}).includes(buttonId)
    );
  }

  await saveSafariContent(safariData);

  // Update anchor message
  const { safeUpdateAnchorMessage } = await import('./mapCellUpdater.js');
  await safeUpdateAnchorMessage(context.guildId, entityId, client);

  // Return to entity management UI
  const { createEntityManagementUI } = await import('./entityManagementUI.js');
  const ui = await createEntityManagementUI({
    entityType: 'map_cell',
    guildId: context.guildId,
    selectedId: entityId,
    mode: 'edit'
  });

  console.log(`✅ SUCCESS: Store toggle for ${entityId} - now has ${newStores.length} stores`);

  return {
    ...ui,
    ephemeral: true
  };
}

/**
 * Create store selector for map locations (replacement for inline field group handler)
 * @param {Object} context - Handler context
 * @returns {Object} Store selection UI
 */
export async function createMapLocationStoreSelector(context) {
  const { guildId, entityId } = context;

  // Load current stores for this location
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const coordStores = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[entityId]?.stores || [];

  return await createStoreSelectionUI({
    guildId: guildId,
    action: 'add_to_location',
    entityId: entityId,
    preSelectedStores: coordStores,
    title: `🏪 Manage Stores at ${entityId}`,
    backButtonId: `entity_view_mode_map_cell_${entityId}`,
    backButtonLabel: '← Back',
    backButtonEmoji: '📍'
  });
}