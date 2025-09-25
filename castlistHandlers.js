/**
 * Castlist Interaction Handlers
 * Centralized handlers for all castlist-related interactions
 */

import { ButtonHandlerFactory } from './buttonHandlerFactory.js';
import { createCastlistHub, CastlistButtonType } from './castlistHub.js';
import { castlistManager } from './castlistManager.js';
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
  
  // Special handling for View button - directly post the castlist
  if (buttonType === 'view') {
    // Use hub-specific display that doesn't affect production
    const castlistDisplayData = await createCastlistHubDisplay(req.body.guild_id, castlistId, client);

    if (castlistDisplayData.success) {
      // Return the castlist display directly (doesn't redirect to legacy system)
      return {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: castlistDisplayData.data
      };
    } else {
      // Fallback to hub with error message
      const hubData = await createCastlistHub(req.body.guild_id, {
        selectedCastlistId: castlistId,
        activeButton: null,
        error: castlistDisplayData.error
      });

      return {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: hubData
      };
    }
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
  
  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: true,
    handler: async (context) => {
      console.log(`📋 Updating tribes for ${castlistId}: ${selectedRoles.length} roles selected`);
      
      const playerData = await loadPlayerData();
      const tribes = playerData[context.guildId]?.tribes || {};
      
      // Get current tribes using this castlist
      const currentTribes = await castlistManager.getTribesUsingCastlist(context.guildId, castlistId);
      
      // Remove castlist from tribes that are no longer selected
      for (const tribeId of currentTribes) {
        if (!selectedRoles.includes(tribeId)) {
          await castlistManager.unlinkTribeFromCastlist(context.guildId, tribeId);
        }
      }
      
      // Add castlist to newly selected tribes
      for (const roleId of selectedRoles) {
        if (!currentTribes.includes(roleId)) {
          // Initialize tribe if it doesn't exist
          if (!tribes[roleId]) {
            tribes[roleId] = {
              name: `Tribe ${roleId}`,
              emoji: '🏕️',
              type: 'default'
            };
          }
          
          // Link to castlist
          await castlistManager.linkTribeToCastlist(context.guildId, roleId, castlistId);
        }
      }
      
      // Save changes
      await savePlayerData(playerData);
      
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
 * Create castlist hub display (doesn't affect production legacy system)
 * Uses virtual adapter to find tribes by castlistId instead of string matching
 */
async function createCastlistHubDisplay(guildId, castlistId, client) {
  try {
    // Get castlist using virtual adapter
    const castlist = await castlistManager.getCastlist(guildId, castlistId);
    if (!castlist) {
      return { success: false, error: 'Castlist not found' };
    }

    // Find tribes using this castlist by castlistId (not string matching)
    const tribesUsingCastlist = await castlistManager.getTribesUsingCastlist(guildId, castlistId);

    if (tribesUsingCastlist.length === 0) {
      return {
        success: false,
        error: `No tribes found for castlist: ${castlist.name}`
      };
    }

    // Get guild and tribe data
    const guild = await client.guilds.fetch(guildId);
    const playerData = await loadPlayerData();
    const tribes = playerData[guildId]?.tribes || {};

    // Build tribes data for display using the same structure as legacy system
    const tribesForDisplay = [];

    for (const roleId of tribesUsingCastlist) {
      const tribeData = tribes[roleId];
      if (tribeData && guild.roles.cache.has(roleId)) {
        const role = guild.roles.cache.get(roleId);
        const members = role.members;

        // Convert to structure expected by castlist2 display logic
        tribesForDisplay.push({
          roleId,
          role,
          members: members.map(member => ({
            id: member.id,
            user: member.user,
            displayName: member.displayName,
            member
          })),
          tribeData,
          emoji: tribeData.emoji || '🏕️',
          showPlayerEmojis: tribeData.showPlayerEmojis || false,
          color: tribeData.color
        });
      }
    }

    if (tribesForDisplay.length === 0) {
      return {
        success: false,
        error: `No valid tribes found for castlist: ${castlist.name}`
      };
    }

    // Use existing castlist2 display logic but with our custom data
    const { buildCastlist2ResponseData } = await import('./castlistV2.js');

    const responseData = await buildCastlist2ResponseData(
      guild,
      tribesForDisplay,
      castlist.name,
      null, // navigationState
      null, // member
      null, // channelId
      {
        // Pass castlist metadata for enhanced display
        emoji: castlist.metadata?.emoji,
        accentColor: castlist.metadata?.accentColor,
        description: castlist.metadata?.description,
        sortStrategy: castlist.settings?.sortStrategy
      }
    );

    return {
      success: true,
      data: {
        ...responseData,
        flags: (1 << 15) // IS_COMPONENTS_V2
      }
    };

  } catch (error) {
    console.error(`❌ ERROR: createCastlistHubDisplay - ${error.message}`);
    return {
      success: false,
      error: `Error displaying castlist: ${error.message}`
    };
  }
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