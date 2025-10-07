/**
 * Castlist Interaction Handlers
 * Centralized handlers for all castlist-related interactions
 */

import { ButtonHandlerFactory } from './buttonHandlerFactory.js';
import { createCastlistHub, CastlistButtonType } from './castlistHub.js';
import { castlistManager } from './castlistManager.js';
import { castlistVirtualAdapter } from './castlistVirtualAdapter.js';
import { loadPlayerData, savePlayerData } from './storage.js';
import { PermissionFlagsBits } from 'discord.js';

/**
 * Create the Edit Info modal for a NEW castlist
 * Similar to the edit modal but with no pre-filled values and a different submit handler
 */
export async function createEditInfoModalForNew(guildId) {
  // Import season helpers
  const { getSeasonStageEmoji, getSeasonStageName } = await import('./seasonSelector.js');
  const playerData = await loadPlayerData();

  // Initialize guild data structure if it doesn't exist
  if (!playerData[guildId]) {
    console.log(`📋 Initializing guild data for ${guildId}`);
    playerData[guildId] = {
      tribes: {},
      applicationConfigs: {},
      placements: { global: {} }
    };
    await savePlayerData(playerData);
  }

  // Ensure required structures exist
  if (!playerData[guildId].tribes) {
    playerData[guildId].tribes = {};
  }
  if (!playerData[guildId].applicationConfigs) {
    playerData[guildId].applicationConfigs = {};
  }

  const seasons = playerData[guildId].applicationConfigs || {};

  // Build season options (most recent first)
  const allSeasons = Object.entries(seasons)
    .sort(([,a], [,b]) => {
      const aTime = a.lastUpdated || a.createdAt || 0;
      const bTime = b.lastUpdated || b.createdAt || 0;
      return bTime - aTime;
    });

  // Initialize with "No Season" option to ensure we always have at least one option
  const seasonOptions = [{
    label: '🌟 No Season (Winners, Alumni, etc.)',
    value: 'none',
    description: 'Used where players are across multiple seasons'
    // No default when min_values is 0 - user can choose to have no season
  }];

  // Add actual seasons if they exist (limit to 24 to stay within Discord's 25 option limit)
  if (allSeasons.length > 0) {
    const maxSeasons = 24;
    const selectedSeasons = allSeasons.slice(0, maxSeasons);

    const actualSeasonOptions = selectedSeasons.map(([configId, season]) => {
      const stage = season.stage || 'planning';
      const emoji = getSeasonStageEmoji(stage);
      const stageName = getSeasonStageName(stage);
      const lastUpdate = new Date(season.lastUpdated || season.createdAt || 0);

      return {
        label: `${emoji} ${season.seasonName}`.substring(0, 100),
        value: season.seasonId,
        description: `${stageName} • Updated: ${lastUpdate.toLocaleDateString()}`.substring(0, 100)
        // No default property when min_values is 0
      };
    });

    // Insert actual seasons at the beginning, keeping "No Season" at the end
    seasonOptions.unshift(...actualSeasonOptions);
  }

  // Create modal for new castlist using Components V2 with String Select
  const modalData = {
    custom_id: 'castlist_create_new_modal',
    title: 'Create New Castlist',
    components: [
      // Name field (Label + Text Input)
      {
        type: 18, // Label
        label: 'Castlist Name',
        component: {
          type: 4, // Text Input
          custom_id: 'castlist_name',
          style: 1, // Short
          required: true,
          placeholder: 'Enter castlist name',
          min_length: 1,
          max_length: 100
        }
      },

      // Season selector (Label + String Select)
      {
        type: 18, // Label
        label: 'Associated Season',
        description: 'What season is this Castlist for?',
        component: {
          type: 3, // String Select
          custom_id: 'season_id',
          placeholder: 'Choose a season (or No Season for cross-season)',
          required: false,
          min_values: 1, // Discord requires at least 1 in modals
          max_values: 1,
          options: seasonOptions
        }
      },

      // Emoji field (Label + Text Input)
      {
        type: 18, // Label
        label: 'Season Emoji',
        component: {
          type: 4, // Text Input
          custom_id: 'castlist_emoji',
          style: 1, // Short
          required: false,
          value: '📋', // Default emoji
          placeholder: 'Enter an emoji (e.g., 📋)',
          max_length: 10
        }
      },

      // Description field (Label + Text Input)
      {
        type: 18, // Label
        label: 'Description',
        component: {
          type: 4, // Text Input
          custom_id: 'castlist_description',
          style: 2, // Paragraph
          required: false,
          placeholder: 'Brief description of this castlist',
          max_length: 200
        }
      }
    ]
  };

  return modalData;
}

/**
 * Handle castlist selection from dropdown
 * Materializes virtual castlists immediately on selection
 */
export async function handleCastlistSelect(req, res, client) {
  return ButtonHandlerFactory.create({
    id: 'castlist_select',
    updateMessage: true,
    handler: async (context) => {
      let selectedCastlistId = context.values?.[0];
      console.log(`📋 Processing castlist selection: ${selectedCastlistId}`);

      // Handle "Create New" selection - show modal directly
      if (selectedCastlistId === 'create_new') {
        console.log('📋 Create New Castlist selected - showing modal directly');

        try {
          // Show the creation modal immediately
          const modal = await createEditInfoModalForNew(context.guildId);

          // Return modal response (ButtonHandlerFactory will handle type 9)
          return {
            type: 9, // InteractionResponseType.MODAL
            data: modal
          };
        } catch (error) {
          console.error('📋 Error creating modal:', error);
          return {
            components: [{
              type: 17, // Container
              components: [{
                type: 10, // Text Display
                content: '❌ Failed to create castlist modal. Please try again.'
              }]
            }],
            flags: (1 << 15) | (1 << 6) // IS_COMPONENTS_V2 + EPHEMERAL
          };
        }
      }

      // Materialize virtual castlists immediately on selection
      if (selectedCastlistId && castlistVirtualAdapter.isVirtualId(selectedCastlistId)) {
        console.log(`[CASTLIST] Materializing virtual castlist on selection: ${selectedCastlistId}`);

        try {
          selectedCastlistId = await castlistVirtualAdapter.materializeCastlist(
            context.guildId,
            selectedCastlistId
          );
          console.log(`[CASTLIST] ✅ Materialized to: ${selectedCastlistId}`);
        } catch (error) {
          console.error('[CASTLIST] ❌ Materialization failed:', error);

          // Return error UI to user
          return {
            components: [{
              type: 17, // Container
              components: [{
                type: 10, // Text Display
                content: `❌ **Unable to upgrade castlist**\n\nPlease try again or contact support.\n\n**Error**: ${error.message}`
              }]
            }],
            flags: (1 << 15) // IS_COMPONENTS_V2
          };
        }
      }

      // Display hub with real ID (or null)
      const hubData = await createCastlistHub(context.guildId, {
        selectedCastlistId: selectedCastlistId || null,
        activeButton: null // Reset active button on new selection
      });

      return hubData;
    }
  })(req, res, client);
}

/**
 * Handle castlist management button clicks (View, Edit Info, Add Tribe, Order)
 */
export async function handleCastlistButton(req, res, client, custom_id) {
  // Parse the custom_id to extract action and castlistId
  const parts = custom_id.split('_');
  const action = parts[1]; // view, edit, add, order, or swap
  const subAction = parts[2]; // info, tribe, or merge (for edit_info, add_tribe, swap_merge)
  const castlistId = (subAction === 'info' || subAction === 'tribe' || subAction === 'merge')
    ? parts.slice(3).join('_') 
    : parts.slice(2).join('_');
  
  // Determine button type
  let buttonType = null;
  if (action === 'view') buttonType = 'view';
  else if (action === 'edit' && subAction === 'info') buttonType = 'edit_info';
  else if (action === 'add' && subAction === 'tribe') buttonType = 'add_tribe';
  else if (action === 'order') buttonType = 'order';
  else if (action === 'swap' && subAction === 'merge') buttonType = 'swap_merge';
  else if (action === 'placements') buttonType = 'placements';
  
  // Special handling for View button - redirect to show_castlist2 handler
  if (buttonType === 'view') {
    // Get castlist to determine the name for show_castlist2
    const castlist = await castlistManager.getCastlist(req.body.guild_id, castlistId);

    if (!castlist) {
      // Return error as hub update
      const hubData = await createCastlistHub(req.body.guild_id, {
        selectedCastlistId: castlistId,
        activeButton: null
      });
      return ButtonHandlerFactory.create({
        id: custom_id,
        updateMessage: true,
        handler: async () => hubData
      })(req, res, client);
    }

    // 🔧 FIX: Always use castlistId (not name) to preserve entity lookup for seasonId
    // The show_castlist2 handler supports both name and ID matching (app.js:4841-4850)
    // Using ID ensures castlistEntity lookup works correctly for season-based placements
    const targetId = castlistId;

    // Update custom_id to trigger show_castlist2 handler
    req.body.data.custom_id = `show_castlist2_${targetId}`;

    // Signal to app.js to handle as show_castlist2
    return { redirectToShowCastlist: true };
  }

  // Special handling for Placements button - redirect to show_castlist2 in edit mode
  if (buttonType === 'placements') {
    // Check production permissions
    const member = req.body.member;
    const hasAdminPermissions = member?.permissions &&
      (BigInt(member.permissions) & BigInt(PermissionFlagsBits.ManageRoles)) !== 0n;

    if (!hasAdminPermissions) {
      return ButtonHandlerFactory.create({
        id: custom_id,
        updateMessage: true,
        handler: async () => ({
          components: [{
            type: 17, // Container
            components: [{
              type: 10, // Text Display
              content: '❌ **Production permissions required**\n\nYou need Manage Roles permission to edit placements.'
            }]
          }],
          flags: (1 << 15) // IS_COMPONENTS_V2
        })
      })(req, res, client);
    }

    // Get castlist to determine the name for show_castlist2
    const castlist = await castlistManager.getCastlist(req.body.guild_id, castlistId);

    if (!castlist) {
      // Return error as hub update
      const hubData = await createCastlistHub(req.body.guild_id, {
        selectedCastlistId: castlistId,
        activeButton: null
      });
      return ButtonHandlerFactory.create({
        id: custom_id,
        updateMessage: true,
        handler: async () => hubData
      })(req, res, client);
    }

    // 🔧 FIX: Always use castlistId (not name) to preserve entity lookup for seasonId
    // The show_castlist2 handler supports both name and ID matching (app.js:4841-4850)
    // Using ID ensures castlistEntity lookup works correctly for season-based placements
    const targetId = castlistId;

    // Update custom_id to trigger show_castlist2 handler in EDIT MODE
    req.body.data.custom_id = `show_castlist2_${targetId}_edit`;

    // Signal to app.js to handle as show_castlist2
    return { redirectToShowCastlist: true };
  }

  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: buttonType !== 'edit_info', // Don't update for edit_info (shows modal)
    handler: async (context) => {
      console.log(`📋 Castlist action: ${buttonType} for ${castlistId}`);
      
      // Special handling for Edit Info - show modal
      if (buttonType === 'edit_info') {
        const castlist = await castlistManager.getCastlist(context.guildId, castlistId);

        if (!castlist) {
          return {
            type: 4,
            data: {
              content: '❌ Could not find castlist',
              flags: 64
            }
          };
        }

        // Import season helpers
        const { getSeasonStageEmoji, getSeasonStageName } = await import('./seasonSelector.js');
        const playerData = await loadPlayerData();
        const seasons = playerData[context.guildId]?.applicationConfigs || {};
        const currentSeasonId = castlist.seasonId || null;

        // Build season options (most recent first)
        const allSeasons = Object.entries(seasons)
          .sort(([,a], [,b]) => {
            const aTime = a.lastUpdated || a.createdAt || 0;
            const bTime = b.lastUpdated || b.createdAt || 0;
            return bTime - aTime;
          });

        // Initialize with "No Season" option to ensure we always have at least one option
        const seasonOptions = [{
          label: '🌟 No Season (Winners, Alumni, etc.)',
          value: 'none',
          description: 'Used where players are across multiple seasons',
          default: !currentSeasonId
        }];

        // Add actual seasons if they exist (limit to 24 to stay within Discord's 25 option limit)
        if (allSeasons.length > 0) {
          const maxSeasons = 24;
          const selectedSeasons = allSeasons.slice(0, maxSeasons);
          const droppedCount = allSeasons.length - maxSeasons;

          // Add season options to the beginning of the array (before "No Season")
          const actualSeasonOptions = selectedSeasons.map(([configId, season]) => {
            const stage = season.stage || 'planning';
            const emoji = getSeasonStageEmoji(stage);
            const stageName = getSeasonStageName(stage);
            const lastUpdate = new Date(season.lastUpdated || season.createdAt || 0);

            return {
              label: `${emoji} ${season.seasonName}`.substring(0, 100),
              value: season.seasonId, // Use the actual seasonId, not configId
              description: `${stageName} • Updated: ${lastUpdate.toLocaleDateString()}`.substring(0, 100),
              default: season.seasonId === currentSeasonId
            };
          });

          // Insert actual seasons at the beginning, keeping "No Season" at the end
          seasonOptions.unshift(...actualSeasonOptions);

          // Log if seasons were dropped
          if (droppedCount > 0) {
            console.log(`[CASTLIST] Showing ${maxSeasons} most recent seasons, ${droppedCount} older seasons not displayed`);
          }
        } else {
          console.log(`[CASTLIST] No seasons found, showing only "No Season" option`);
        }

        // Create modal for editing castlist info with Components V2
        return {
          type: 9, // Modal
          data: {
            custom_id: `castlist_edit_info_modal_${castlistId}`,
            title: 'Manage Castlist Info',
            components: [
              // Name field (Label + Text Input)
              {
                type: 18, // Label
                label: 'Castlist Name',
                component: {
                  type: 4, // Text Input
                  custom_id: 'castlist_name',
                  style: 1, // Short
                  required: true,
                  value: castlist.name || '',
                  placeholder: 'Enter castlist name',
                  min_length: 1,
                  max_length: 100
                }
              },

              // Season selector (Label + String Select) - MOVED TO SECOND
              {
                type: 18, // Label
                label: 'Associated Season',
                description: 'What season is this Castlist for?',
                component: {
                  type: 3, // String Select
                  custom_id: 'season_id',
                  placeholder: 'Choose a season...',
                  required: false,
                  min_values: 0, // Allow deselecting all
                  max_values: 1,
                  options: seasonOptions
                }
              },

              // Season Emoji field (Label + Text Input)
              {
                type: 18, // Label
                label: 'Season Emoji',
                component: {
                  type: 4, // Text Input
                  custom_id: 'castlist_emoji',
                  style: 1, // Short
                  required: false,
                  value: castlist.metadata?.emoji || '',
                  placeholder: 'Single emoji to represent this Castlist.',
                  max_length: 10
                }
              },

              // Description field (Label + Text Input)
              {
                type: 18, // Label
                label: 'Description',
                description: 'Optional description for this castlist',
                component: {
                  type: 4, // Text Input
                  custom_id: 'castlist_description',
                  style: 2, // Paragraph
                  required: false,
                  value: castlist.metadata?.description || '',
                  placeholder: 'Describe this castlist...',
                  max_length: 200
                }
              }
            ]
          }
        };
      }
      
      // Regular button handling - update UI with active button
      const hubData = await createCastlistHub(context.guildId, {
        selectedCastlistId: castlistId,
        activeButton: buttonType // Set the active button
      });
      
      return hubData;
    }
  })(req, res, client);
}

/**
 * Handle sort strategy selection
 */
export function handleCastlistSort(req, res, client, custom_id) {
  const castlistId = custom_id.replace('castlist_sort_', '');
  const newSortStrategy = req.body.data.values[0];
  
  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: true,
    handler: async (context) => {
      console.log(`📋 Updating sort strategy for ${castlistId} to ${newSortStrategy}`);
      
      // Update the castlist's sort strategy
      await castlistManager.updateCastlist(context.guildId, castlistId, {
        settings: { sortStrategy: newSortStrategy }
      });
      
      // Refresh the UI with the Order button still active
      const hubData = await createCastlistHub(context.guildId, {
        selectedCastlistId: castlistId,
        activeButton: 'order' // Keep Order button active
      });
      
      return hubData;
    }
  })(req, res, client);
}

/**
 * Handle tribe role selection
 */
export function handleCastlistTribeSelect(req, res, client, custom_id) {
  const castlistId = custom_id.replace('castlist_tribe_select_', '');
  const selectedRoles = req.body.data.values || [];
  const resolvedRoles = req.body.data.resolved?.roles || {};

  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: true,
    handler: async (context) => {
      console.log(`📋 Updating tribes for ${castlistId}: ${selectedRoles.length} roles selected`);

      // CRITICAL: Materialize virtual castlist before updating tribes
      // This ensures changes persist to real data structure
      let actualCastlistId = castlistId;

      // Special handling for default castlist - create real entity on first modification
      if (castlistId === 'default') {
        console.log(`[CASTLIST] Materializing default castlist on tribe management`);
        // This will create the default entity in castlistConfigs if it doesn't exist
        // We use updateCastlist with empty updates just to trigger creation
        await castlistManager.updateCastlist(context.guildId, 'default', {});
        actualCastlistId = 'default'; // Keep using 'default' as the ID

        // CRITICAL: Migrate existing tribes from legacy format to new format ONCE
        // This ensures all tribes with castlist: "default" get converted to use castlistIds array
        const playerData = await loadPlayerData();
        const tribes = playerData[context.guildId]?.tribes || {};
        let migratedCount = 0;

        for (const [roleId, tribe] of Object.entries(tribes)) {
          if (!tribe) continue; // Skip null/undefined tribe entries
          // Only migrate if tribe has legacy format AND hasn't been migrated yet
          // Check if castlistIds doesn't exist or doesn't include 'default'
          if (tribe.castlist === 'default' && (!tribe.castlistIds || !tribe.castlistIds.includes('default'))) {
            console.log(`[CASTLIST] Migrating tribe ${roleId} from legacy to new format`);
            if (!tribe.castlistIds) {
              tribe.castlistIds = [];
            }
            if (!tribe.castlistIds.includes('default')) {
              tribe.castlistIds.push('default');
            }
            // Keep castlist field for backwards compatibility
            tribe.castlist = 'default';
            migratedCount++;
          }
        }

        if (migratedCount > 0) {
          await savePlayerData(playerData);
          console.log(`[CASTLIST] Migrated ${migratedCount} tribes to new format`);
        }
      }
      // Handle other virtual castlists
      else if (castlistVirtualAdapter.isVirtualId(castlistId)) {
        console.log(`[CASTLIST] Materializing virtual castlist before tribe updates`);
        actualCastlistId = await castlistVirtualAdapter.materializeCastlist(context.guildId, castlistId);
      }

      // Load data ONCE (following store multi-select pattern)
      const playerData = await loadPlayerData();
      const tribes = playerData[context.guildId]?.tribes || {};

      // Get current tribes using this castlist (use original ID for lookup)
      const currentTribes = await castlistManager.getTribesUsingCastlist(context.guildId, castlistId);

      // Calculate changes (exactly like store implementation)
      const toRemove = currentTribes.filter(t => !selectedRoles.includes(t));
      const toAdd = selectedRoles.filter(r => !currentTribes.includes(r));

      console.log(`[CASTLIST] Processing changes: Remove ${toRemove.length} tribes, Add ${toAdd.length} tribes`);

      // Get castlist entity for name (needed for legacy field)
      const castlist = await castlistManager.getCastlist(context.guildId, actualCastlistId);
      const castlistName = castlist?.name || 'default';

      // Process ALL removals in memory
      for (const tribeId of toRemove) {
        const tribe = tribes[tribeId];
        if (tribe) {
          // Remove from castlistIds array
          if (tribe.castlistIds && Array.isArray(tribe.castlistIds)) {
            tribe.castlistIds = tribe.castlistIds.filter(id => id !== actualCastlistId);

            // Update legacy field based on remaining castlists
            if (tribe.castlistIds.length > 0) {
              // Set to first remaining castlist's name
              const firstId = tribe.castlistIds[0];
              if (firstId === 'default') {
                tribe.castlist = 'default';
              } else {
                const firstCastlist = await castlistManager.getCastlist(context.guildId, firstId);
                tribe.castlist = firstCastlist?.name || firstId;
              }
            } else {
              // No castlists left - clean up
              delete tribe.castlistIds;
              delete tribe.castlist;
            }
          } else if (tribe.castlistId === actualCastlistId) {
            // Handle legacy single ID format
            delete tribe.castlistId;
            delete tribe.castlist;
          } else if (tribe.castlist === castlistName) {
            // Handle legacy string format
            delete tribe.castlist;
          }
          console.log(`[CASTLIST] Removed tribe ${tribeId} from castlist (in memory)`);
        }
      }

      // Process ALL additions in memory
      for (const roleId of toAdd) {
        // Extract role color from Discord API
        const roleData = resolvedRoles[roleId];
        const roleColor = roleData?.color ? `#${roleData.color.toString(16).padStart(6, '0')}` : null;

        // Initialize or update tribe
        if (!tribes[roleId]) {
          // Create new tribe with castlist already assigned
          tribes[roleId] = {
            name: `Tribe ${roleId}`,
            emoji: '🏕️',
            color: roleColor,
            castlistIds: [actualCastlistId],  // Add directly here
            castlist: castlistName  // Legacy field
          };
        } else {
          // Update existing tribe
          if (roleColor && !tribes[roleId].color) {
            tribes[roleId].color = roleColor;
          }

          // Add to castlistIds array
          if (!tribes[roleId].castlistIds) {
            tribes[roleId].castlistIds = [];
          }
          if (!tribes[roleId].castlistIds.includes(actualCastlistId)) {
            tribes[roleId].castlistIds.push(actualCastlistId);
          }

          // Update legacy field (set to first castlist or this one)
          if (!tribes[roleId].castlist || tribes[roleId].castlistIds[0] === actualCastlistId) {
            tribes[roleId].castlist = castlistName;
          }
        }
        console.log(`[CASTLIST] Added tribe ${roleId} to castlist (in memory)`);
      }

      // Save ONCE at the end - NO MORE linkTribeToCastlist calls!
      await savePlayerData(playerData);

      // Log summary
      if (toRemove.length > 0 || toAdd.length > 0) {
        console.log(`[CASTLIST] ✅ Successfully updated castlist: ${toAdd.length} added, ${toRemove.length} removed`);
      } else {
        console.log(`[CASTLIST] No changes made - selection unchanged`);
      }

      // Refresh the UI with Add Tribe button still active
      const hubData = await createCastlistHub(context.guildId, {
        selectedCastlistId: castlistId,
        activeButton: 'add_tribe' // Keep Add Tribe button active
      });

      return hubData;
    }
  })(req, res, client);
}



/**
 * Handle castlist deletion
 */
export function handleCastlistDelete(req, res, client, custom_id) {
  const castlistId = custom_id.replace('castlist_delete_', '');

  return ButtonHandlerFactory.create({
    id: 'castlist_delete',
    requiresPermission: PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels,
    permissionName: 'Manage Roles or Manage Channels',
    updateMessage: true,
    handler: async (context) => {
      try {
        console.log(`🗑️ START: castlist_delete - user ${context.userId}`);

        if (!castlistId || castlistId === 'castlist_delete') {
          return {
            components: [{
              type: 17,
              components: [{
                type: 10,
                content: '❌ No castlist selected. Please select a castlist first, then click delete.'
              }]
            }]
          };
        }

        // Get castlist info for confirmation message
        const castlist = await castlistManager.getCastlist(context.guildId, castlistId);

        if (!castlist) {
          return {
            components: [{
              type: 17,
              components: [{
                type: 10,
                content: '❌ Castlist not found.'
              }]
            }]
          };
        }

        // Delete the castlist
        const result = await castlistManager.deleteCastlist(context.guildId, castlistId);

        if (!result.success) {
          return {
            components: [{
              type: 17,
              components: [{
                type: 10,
                content: `❌ Failed to delete castlist: ${result.error || 'Unknown error'}`
              }]
            }]
          };
        }

        // Success - refresh the hub with cleared selection
        const hubData = await createCastlistHub(context.guildId, {
          selectedCastlistId: null, // Clear selection
          activeButton: null
        });

        console.log(`✅ SUCCESS: castlist_delete - deleted '${castlist.name}' (${result.virtual ? 'virtual' : 'real'}) and unlinked from ${result.cleanedCount} tribes`);
        return hubData;

      } catch (error) {
        console.error(`❌ ERROR: castlist_delete - ${error.message}`);
        return {
          components: [{
            type: 17,
            components: [{
              type: 10,
              content: '❌ Error deleting castlist. Please try again.'
            }]
          }]
        };
      }
    }
  })(req, res, client);
}

/**
 * Handle Edit Info modal submission
 */
export function handleEditInfoModal(req, res, client, custom_id) {
  const castlistId = custom_id.replace('castlist_edit_info_modal_', '');
  const components = req.body.data.components;

  // Don't use ButtonHandlerFactory for modal submissions - handle directly
  return (async () => {
    try {
      const guildId = req.body.guild_id;
      const userId = req.body.member?.user?.id || req.body.user?.id;
      console.log(`📋 Updating castlist info for ${castlistId}`);

      // Extract form values from Components V2 structure (Label + component)
      const fields = {};

      components.forEach(comp => {
        // Skip Text Display components (type 10)
        if (comp.type === 10) return;

        // Handle Label components (type 18)
        if (comp.type === 18 && comp.component) {
          const innerComp = comp.component;

          if (innerComp.custom_id === 'castlist_name') {
            fields.name = innerComp.value?.trim();
          } else if (innerComp.custom_id === 'castlist_emoji') {
            fields.emoji = innerComp.value?.trim() || '📋';
          } else if (innerComp.custom_id === 'castlist_description') {
            fields.description = innerComp.value?.trim() || '';
          } else if (innerComp.custom_id === 'season_id') {
            // Extract season selection (String Select)
            const selectedValues = innerComp.values || [];

            if (selectedValues.length === 0) {
              // User deselected all (min_values: 0)
              fields.seasonId = 'none';
            } else {
              fields.seasonId = selectedValues[0]; // "none" or actual config ID
            }
          }
        }
      });

      // Prepare updates object
      const updates = {
        name: fields.name,
        metadata: {
          emoji: fields.emoji,
          description: fields.description
        },
        modifiedBy: userId
      };

      // Handle season association
      if (fields.seasonId === 'none') {
        // User selected "No Season" - remove association (uses placements.global)
        updates.seasonId = null;
      } else if (fields.seasonId) {
        // User selected a season
        updates.seasonId = fields.seasonId;
      }
      // If fields.seasonId is undefined, season field wasn't in modal (shouldn't happen)

      // Update the castlist
      await castlistManager.updateCastlist(guildId, castlistId, updates);

      console.log(`✅ Updated castlist ${castlistId}: name="${fields.name}", emoji="${fields.emoji}", seasonId=${fields.seasonId || 'unchanged'}`);

      // Refresh the UI with the castlist still selected
      const hubData = await createCastlistHub(guildId, {
        selectedCastlistId: castlistId,
        activeButton: null // Clear active button after modal
      });

      // Send UPDATE_MESSAGE response to keep the container open
      return res.send({
        type: 7, // InteractionResponseType.UPDATE_MESSAGE
        data: hubData
      });

    } catch (error) {
      console.error('Error updating castlist info:', error);
      return res.send({
        type: 4, // InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: '❌ Error updating castlist info',
          flags: 64 // EPHEMERAL
        }
      });
    }
  })();
}/**
 * Handle NEW castlist creation modal submission
 * Creates a new castlist and returns to the hub with it selected
 */
export async function handleCreateNewModal(req, res, client) {
  const { loadPlayerData, savePlayerData } = await import('./storage.js');
  const { createCastlistHub } = await import('./castlistHub.js');
  const { generateId } = await import('./utils.js');
  const { body } = req;
  const guildId = body.guild?.id || body.guild_id;
  const userId = body.member?.user?.id || body.user?.id;

  try {
    // Extract modal field values
    const fields = body.data?.components || [];
    const values = {};

    fields.forEach(component => {
      const subComponent = component.component || component.components?.[0];
      if (!subComponent) return;

      const customId = subComponent.custom_id;

      // Handle different component types
      if (subComponent.type === 3) { // String Select
        values[customId] = subComponent.values || [];
      } else {
        const value = subComponent.value;
        if (customId && value !== undefined) {
          values[customId] = value;
        }
      }
    });

    console.log('[CASTLIST] Creating new castlist with values:', values);

    // Validate required fields
    if (!values.castlist_name?.trim()) {
      return res.send({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: '❌ Castlist name is required.',
          flags: 1 << 6 // EPHEMERAL
        }
      });
    }

    // Load player data
    const playerData = await loadPlayerData();
    if (!playerData[guildId]) {
      playerData[guildId] = {};
    }

    // Initialize castlistConfigs for V3 castlists
    if (!playerData[guildId].castlistConfigs) {
      playerData[guildId].castlistConfigs = {};
    }

    // Generate unique ID for new castlist
    const newId = `castlist_${Date.now()}_${guildId}`;

    // Extract season selection (might be empty array if "No Season" was deselected)
    const selectedSeasonId = values.season_id?.[0] || null;
    const seasonId = selectedSeasonId === 'none' ? null : selectedSeasonId;

    // Create the new castlist (V3 structure)
    const newCastlist = {
      id: newId,
      name: values.castlist_name.trim(),
      type: 'custom', // User-created castlist
      createdAt: Date.now(),
      createdBy: userId,
      settings: {
        sortStrategy: 'alphabetical', // Default sort
        showRankings: false,
        maxDisplay: 25,
        visibility: 'public',
        ...(seasonId && { seasonId }) // Only add seasonId if not null
      },
      metadata: {
        emoji: values.castlist_emoji?.trim() || '📋',
        description: values.castlist_description?.trim() || '',
        lastModified: Date.now()
      }
    };

    // Save the new castlist to V3 location
    playerData[guildId].castlistConfigs[newId] = newCastlist;
    await savePlayerData(playerData);

    console.log(`[CASTLIST] Created new castlist ${newId}: "${newCastlist.name}" for guild ${guildId}`);

    // Return to hub with new castlist selected
    const hubData = await createCastlistHub(guildId, {
      selectedCastlistId: newId,
      activeButton: 'castlist_manage' // Default to manage view
    });

    // Add success message
    if (hubData.textDisplay) {
      const successText = `✨ **New Castlist Created!**\n\n**Name:** ${newCastlist.name}\n**Season:** ${seasonId ? `Linked to season ${seasonId}` : 'No season assigned'}\n**Emoji:** ${newCastlist.metadata.emoji}\n${newCastlist.metadata.description ? `**Description:** ${newCastlist.metadata.description}` : ''}`;

      // Prepend success message to text display
      hubData.textDisplay.content = successText + '\n\n' + hubData.textDisplay.content;
    }

    return res.send({
      type: 7, // UPDATE_MESSAGE
      data: hubData
    });

  } catch (error) {
    console.error('[CASTLIST] Error creating new castlist:', error);
    return res.send({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        components: [{
          type: 17, // Container
          components: [{
            type: 10, // Text Display
            content: '❌ Failed to create castlist. Please try again.'
          }]
        }],
        flags: (1 << 15) | (1 << 6) // IS_COMPONENTS_V2 + EPHEMERAL
      }
    });
  }
}