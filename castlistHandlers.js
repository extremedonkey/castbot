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
 * Handle castlist selection from dropdown
 */
export function handleCastlistSelect(req, res, client) {
  return ButtonHandlerFactory.create({
    id: 'castlist_select',
    updateMessage: true,
    handler: async (context) => {
      const selectedCastlistId = context.values?.[0];
      console.log(`📋 Castlist selected: ${selectedCastlistId || 'none'}`);
      
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

    // For virtual castlists, keep the ID format (e.g., "default" or "virtual_xyz")
    // For real castlists, use the castlist name (legacy tribes use name matching)
    // Special case: default castlist should use "default" as the ID
    const targetId = castlist.isVirtual ? castlistId : castlist.name;

    // Update custom_id to trigger show_castlist2 handler
    req.body.data.custom_id = `show_castlist2_${targetId}`;

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
        
        // Create modal for editing castlist info
        return {
          type: 9, // Modal
          data: {
            custom_id: `castlist_edit_info_modal_${castlistId}`,
            title: 'Edit Castlist Info',
            components: [
              {
                type: 1, // Action Row
                components: [{
                  type: 4, // Text Input
                  custom_id: 'castlist_name',
                  label: 'Castlist Name',
                  style: 1, // Short
                  value: castlist.name || '',
                  placeholder: 'Enter castlist name',
                  required: true,
                  min_length: 1,
                  max_length: 100
                }]
              },
              {
                type: 1, // Action Row
                components: [{
                  type: 4, // Text Input
                  custom_id: 'castlist_emoji',
                  label: 'Castlist Emoji',
                  style: 1, // Short
                  value: castlist.metadata?.emoji || '📋',
                  placeholder: 'Enter an emoji (e.g., 🎭)',
                  required: false,
                  min_length: 1,
                  max_length: 10
                }]
              },
              {
                type: 1, // Action Row
                components: [{
                  type: 4, // Text Input
                  custom_id: 'castlist_description',
                  label: 'Description',
                  style: 2, // Paragraph
                  value: castlist.metadata?.description || '',
                  placeholder: 'Enter a brief description',
                  required: false,
                  max_length: 200
                }]
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
      console.log(`📋 Updating castlist info for ${castlistId}`);

      // Extract form values
      const newName = components[0].components[0].value?.trim();
      const newEmoji = components[1].components[0].value?.trim() || '📋';
      const newDescription = components[2].components[0].value?.trim() || '';

      // Update the castlist
      await castlistManager.updateCastlist(guildId, castlistId, {
        name: newName,
        metadata: {
          emoji: newEmoji,
          description: newDescription
        }
      });

      console.log(`✅ Updated castlist ${castlistId}: name="${newName}", emoji="${newEmoji}"`);

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
}