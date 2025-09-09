/**
 * Castlist Interaction Handlers
 * Centralized handlers for all castlist-related interactions
 */

import { ButtonHandlerFactory } from './buttonHandlerFactory.js';
import { createCastlistHub, CastlistButtonType } from './castlistHub.js';
import { castlistManager } from './castlistManager.js';
import { loadPlayerData, savePlayerData } from './storage.js';
import { sendCastlist2Response } from './castlistV2.js';

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
export function handleCastlistButton(req, res, client, custom_id) {
  // Parse the custom_id to extract action and castlistId
  const parts = custom_id.split('_');
  const action = parts[1]; // view, edit, add, or order
  const subAction = parts[2]; // info or tribe (for edit_info and add_tribe)
  const castlistId = subAction === 'info' || subAction === 'tribe' 
    ? parts.slice(3).join('_') 
    : parts.slice(2).join('_');
  
  // Determine button type
  let buttonType = null;
  if (action === 'view') buttonType = 'view';
  else if (action === 'edit' && subAction === 'info') buttonType = 'edit_info';
  else if (action === 'add' && subAction === 'tribe') buttonType = 'add_tribe';
  else if (action === 'order') buttonType = 'order';
  
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
 * Handle posting castlist to channel
 */
export function handleShowCastlist(req, res, client, custom_id) {
  const castlistId = custom_id.replace('show_castlist2_', '');
  
  return ButtonHandlerFactory.create({
    id: custom_id,
    handler: async (context) => {
      console.log(`📋 Posting castlist ${castlistId} to channel`);
      
      const castlist = await castlistManager.getCastlist(context.guildId, castlistId);
      if (!castlist) {
        return {
          content: 'Castlist not found!',
          ephemeral: true
        };
      }
      
      const playerData = await loadPlayerData();
      const tribesUsingCastlist = await castlistManager.getTribesUsingCastlist(context.guildId, castlistId);
      
      if (tribesUsingCastlist.length === 0) {
        return {
          content: 'No tribes are using this castlist. Add a tribe first!',
          ephemeral: true
        };
      }
      
      // Use the first tribe for now (later we could let user select)
      const tribeId = tribesUsingCastlist[0];
      const tribe = playerData[context.guildId]?.tribes?.[tribeId];
      
      if (!tribe) {
        return {
          content: 'No tribes are using this castlist. Add a tribe first!',
          ephemeral: true
        };
      }
      
      // Use sendCastlist2Response to post the castlist
      const castlistResponse = await sendCastlist2Response(
        context.member,
        context.guild,
        playerData,
        context.guildId,
        tribeId, // Use first tribe ID
        0, // Start at page 0
        context.channelId,
        false // Not application context
      );
      
      return castlistResponse;
    }
  })(req, res, client);
}

/**
 * Handle Edit Info modal submission
 */
export function handleEditInfoModal(req, res, client, custom_id) {
  const castlistId = custom_id.replace('castlist_edit_info_modal_', '');
  const components = req.body.data.components;
  
  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: true,
    handler: async (context) => {
      console.log(`📋 Updating castlist info for ${castlistId}`);
      
      // Extract form values
      const newName = components[0].components[0].value?.trim();
      const newEmoji = components[1].components[0].value?.trim() || '📋';
      const newDescription = components[2].components[0].value?.trim() || '';
      
      // Update the castlist
      await castlistManager.updateCastlist(context.guildId, castlistId, {
        name: newName,
        metadata: {
          emoji: newEmoji,
          description: newDescription
        }
      });
      
      console.log(`✅ Updated castlist ${castlistId}: name="${newName}", emoji="${newEmoji}"`);
      
      // Refresh the UI with the castlist still selected
      const hubData = await createCastlistHub(context.guildId, {
        selectedCastlistId: castlistId,
        activeButton: null // Clear active button after modal
      });
      
      return hubData;
    }
  })(req, res, client);
}