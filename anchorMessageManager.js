/**
 * Anchor Message Manager
 * Centralized system for managing map anchor message updates
 * Ensures Discord messages stay in sync with safariContent.json changes
 */

import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { createAnchorMessageComponents } from './safariButtonHelper.js';
import { DiscordRequest } from './utils.js';

// Update queue to batch changes and avoid rate limits
const updateQueue = new Map(); // Map<guildId, Set<coordinate>>
const updateErrors = new Map(); // Track failed updates for retry
const retryCounters = new Map(); // Track retry attempts per error to prevent endless loops

// Batch update interval (5 seconds)
const BATCH_INTERVAL = 5000;
const MAX_RETRY_ATTEMPTS = 3; // Maximum retry attempts before giving up
let batchTimer = null;

/**
 * Queue an anchor message update
 * @param {string} guildId - Guild ID
 * @param {string} coordinate - Map coordinate
 * @param {Object} options - Update options
 */
export function queueAnchorUpdate(guildId, coordinate, options = {}) {
  const { immediate = false, reason = 'data_change' } = options;
  
  console.log(`📍 Queueing anchor update for ${coordinate} in guild ${guildId} (reason: ${reason})`);
  
  // Initialize guild queue if needed
  if (!updateQueue.has(guildId)) {
    updateQueue.set(guildId, new Set());
  }
  
  // Add coordinate to update queue
  updateQueue.get(guildId).add(coordinate);
  
  // Process immediately if requested
  if (immediate) {
    processBatchUpdates();
  } else {
    // Schedule batch processing
    scheduleBatchUpdate();
  }
}

/**
 * Queue updates for all coordinates affected by an action
 * @param {string} guildId - Guild ID
 * @param {string} actionId - Action ID
 * @param {string} reason - Update reason
 */
export async function queueActionCoordinateUpdates(guildId, actionId, reason = 'action_change') {
  const safariData = await loadSafariContent();
  const guildData = safariData[guildId] || {};
  const action = guildData.buttons?.[actionId];
  
  if (!action?.coordinates?.length) {
    console.log(`📍 No coordinates to update for action ${actionId}`);
    return;
  }
  
  console.log(`📍 Queueing updates for ${action.coordinates.length} coordinates from action ${actionId}`);
  
  // Queue updates for all coordinates
  for (const coordinate of action.coordinates) {
    queueAnchorUpdate(guildId, coordinate, { reason });
  }
}

/**
 * Schedule batch update processing
 */
function scheduleBatchUpdate() {
  if (batchTimer) return; // Already scheduled
  
  batchTimer = setTimeout(() => {
    batchTimer = null;
    processBatchUpdates();
  }, BATCH_INTERVAL);
}

/**
 * Process all queued updates
 */
async function processBatchUpdates() {
  if (updateQueue.size === 0) return;
  
  console.log(`🔄 Processing anchor message updates for ${updateQueue.size} guilds`);
  
  // Process each guild's updates
  for (const [guildId, coordinates] of updateQueue.entries()) {
    if (coordinates.size === 0) continue;
    
    console.log(`🔄 Updating ${coordinates.size} anchor messages in guild ${guildId}`);
    
    // Process coordinates in parallel (limited batch size)
    const coordinateArray = Array.from(coordinates);
    const batchSize = 5; // Process 5 at a time to avoid rate limits
    
    for (let i = 0; i < coordinateArray.length; i += batchSize) {
      const batch = coordinateArray.slice(i, i + batchSize);
      await Promise.all(batch.map(coord => updateSingleAnchor(guildId, coord)));
    }
  }
  
  // Clear processed updates
  updateQueue.clear();
  
  // Retry failed updates if any
  if (updateErrors.size > 0) {
    console.log(`🔄 Retrying ${updateErrors.size} failed updates`);
    const retries = new Map(updateErrors);
    updateErrors.clear();
    
    for (const [key, { guildId, coordinate, error }] of retries.entries()) {
      // Check retry counter to prevent endless loops
      const currentRetries = retryCounters.get(key) || 0;
      
      if (currentRetries >= MAX_RETRY_ATTEMPTS) {
        console.error(`❌ Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached for ${coordinate} in guild ${guildId}. Giving up. Last error: ${error}`);
        retryCounters.delete(key); // Clean up retry counter
        continue;
      }
      
      // Increment retry counter
      retryCounters.set(key, currentRetries + 1);
      console.log(`🔄 Retry attempt ${currentRetries + 1}/${MAX_RETRY_ATTEMPTS} for ${coordinate}`);
      
      queueAnchorUpdate(guildId, coordinate, { reason: 'retry' });
    }
  }
}

/**
 * Repair missing anchor message IDs by finding existing messages in channels
 * @param {string} guildId - Guild ID
 * @param {string} coordinate - Map coordinate
 * @returns {boolean} Success status
 */
async function repairMissingAnchorMessage(guildId, coordinate) {
  try {
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    const coordData = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate];
    
    if (!coordData?.channelId) {
      console.log(`❌ Cannot repair ${coordinate} - no channel ID found`);
      return false;
    }
    
    if (coordData.anchorMessageId) {
      console.log(`✅ ${coordinate} already has anchor message ID: ${coordData.anchorMessageId}`);
      return true;
    }
    
    console.log(`🔧 Attempting to repair missing anchor message ID for ${coordinate} in channel ${coordData.channelId}`);
    
    // Fetch recent messages from the channel to find the anchor message
    const response = await DiscordRequest(`channels/${coordData.channelId}/messages?limit=20`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      console.error(`❌ Failed to fetch messages from channel ${coordData.channelId}`);
      return false;
    }
    
    const messages = await response.json();
    
    // Look for a message from the bot that contains the coordinate and map
    const botMessages = messages.filter(msg => 
      msg.author?.bot && 
      msg.components?.length > 0 &&
      (msg.content?.includes(`Location ${coordinate}`) || 
       msg.components.some(comp => 
         comp.components?.some(btn => 
           btn.custom_id?.includes(`map_location_actions_${coordinate}`)
         )
       ))
    );
    
    if (botMessages.length === 0) {
      console.log(`❌ No anchor message found for ${coordinate} in channel ${coordData.channelId}`);
      return false;
    }
    
    // Use the most recent matching message
    const anchorMessage = botMessages[0];
    coordData.anchorMessageId = anchorMessage.id;
    
    // Save the updated data
    const { saveSafariContent } = await import('./safariManager.js');
    await saveSafariContent(safariData);
    
    console.log(`✅ Repaired anchor message ID for ${coordinate}: ${anchorMessage.id}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error repairing anchor message for ${coordinate}:`, error);
    return false;
  }
}

/**
 * Update a single anchor message
 * @param {string} guildId - Guild ID
 * @param {string} coordinate - Map coordinate
 * @returns {boolean} Success status
 */
async function updateSingleAnchor(guildId, coordinate) {
  try {
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    const coordData = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate];
    
    if (!coordData?.anchorMessageId || !coordData?.channelId) {
      console.log(`⏭️ Skipping ${coordinate} - no anchor message`);
      
      // Attempt to repair missing anchor message ID
      if (coordData?.channelId && !coordData?.anchorMessageId) {
        console.log(`🔧 Attempting to repair missing anchor message ID for ${coordinate}`);
        const repaired = await repairMissingAnchorMessage(guildId, coordinate);
        if (repaired) {
          console.log(`✅ Successfully repaired anchor message for ${coordinate}, retrying update`);
          // Reload data and try again
          return await updateSingleAnchor(guildId, coordinate);
        }
      }
      
      return true;
    }
    
    // Get fog map URL from stored coordinate data (more reliable than Discord extraction)
    let fogMapUrl = coordData.fogMapUrl || null;
    console.log(`🔍 Using stored fog map URL for ${coordinate}: ${fogMapUrl}`);
    
    // Only extract as absolute last resort - never overwrite existing stored URLs
    if (!fogMapUrl) {
      console.log(`⚠️ No stored fog map URL for ${coordinate}, attempting extraction from Discord message...`);
      try {
        const { DiscordRequest } = await import('./utils.js');
        const message = await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
          method: 'GET'
        });
        
        // Check all components for media gallery
        for (const container of message.components || []) {
          for (const component of container.components || []) {
            if (component.type === 12) { // Media gallery
              const extractedUrl = component.items?.[0]?.media?.url;
              if (extractedUrl) {
                fogMapUrl = extractedUrl;
                break;
              }
            }
          }
          if (fogMapUrl) break;
        }
        
        if (fogMapUrl) {
          console.log(`🔍 Extracted fog map URL for ${coordinate}: ${fogMapUrl}`);
          // CRITICAL: Only store if coordinate doesn't already have a fogMapUrl
          // This prevents overwriting newer URLs with older ones from Discord messages
          if (!coordData.fogMapUrl) {
            console.log(`💾 Storing extracted fog map URL for future use`);
            coordData.fogMapUrl = fogMapUrl;
            await saveSafariContent(safariData);
          } else {
            console.log(`⚠️ Not overwriting existing stored fogMapUrl - this was just for immediate use`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Could not retrieve existing message for ${coordinate}: ${error.message}`);
      }
    }
    
    // Create updated components
    const components = await createAnchorMessageComponents(coordData, guildId, coordinate, fogMapUrl);
    
    // Update the message
    try {
      await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
        method: 'PATCH',
        body: {
          flags: (1 << 15), // IS_COMPONENTS_V2
          components: components
        }
      });
    } catch (error) {
      if (error.message?.includes('Unknown Message')) {
        console.log(`⚠️ Anchor message ${coordData.anchorMessageId} no longer exists for ${coordinate}, clearing stored ID`);
        // Clear the invalid anchor message ID
        coordData.anchorMessageId = null;
        await saveSafariContent(safariData);
        return false; // This coordinate needs to be reinitialized
      }
      throw error; // Re-throw other errors
    }
    
    console.log(`✅ Updated anchor message for ${coordinate}`);
    
    // Clear retry counter on successful update
    const errorKey = `${guildId}_${coordinate}`;
    retryCounters.delete(errorKey);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to update anchor for ${coordinate}:`, error.message);
    
    // Handle invalid emoji errors — strip ALL button emojis and retry once
    if (error.message?.includes('COMPONENT_INVALID_EMOJI') || error.message?.includes('Invalid emoji')) {
      console.warn(`⚠️ Invalid emoji in anchor for ${coordinate} — stripping button emojis and retrying`);
      try {
        // Strip emoji from ALL buttons in the components (simpler than parsing error paths)
        let stripped = 0;
        for (const topLevel of components) {
          for (const child of (topLevel.components || [])) {
            if (child.type === 1) { // ActionRow
              for (const btn of (child.components || [])) {
                if (btn.type === 2 && btn.emoji) { // Button with emoji
                  delete btn.emoji;
                  stripped++;
                }
              }
            }
          }
        }

        if (stripped > 0) {
          console.log(`🔄 Stripped ${stripped} emoji(s) from buttons in ${coordinate}, retrying`);
          await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
            method: 'PATCH',
            body: { components, flags: 1 << 15 }
          });
          console.log(`✅ Anchor for ${coordinate} updated after stripping invalid emojis`);
          return true;
        }
      } catch (retryError) {
        console.error(`❌ Retry after emoji strip also failed for ${coordinate}:`, retryError.message);
      }
      return false;
    }

    if (error.message?.includes('Invalid Form Body')) {
      console.error(`❌ Invalid form body for ${coordinate}. Discord rejected the message format.`);
    }

    // Track error for retry
    const errorKey = `${guildId}_${coordinate}`;
    updateErrors.set(errorKey, { guildId, coordinate, error: error.message });

    return false;
  }
}

/**
 * Force immediate update of specific coordinates
 * @param {string} guildId - Guild ID
 * @param {Array<string>} coordinates - Array of coordinates
 */
export async function forceUpdateAnchors(guildId, coordinates) {
  console.log(`🔄 Force updating ${coordinates.length} anchor messages`);
  
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (const coordinate of coordinates) {
    const success = await updateSingleAnchor(guildId, coordinate);
    if (success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(coordinate);
    }
  }
  
  return results;
}

/**
 * Update all anchor messages for a guild's active map
 * @param {string} guildId - Guild ID
 * @returns {Object} Update results
 */
export async function updateAllGuildAnchors(guildId) {
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const coordinates = safariData[guildId]?.maps?.[activeMapId]?.coordinates || {};
  
  const coordsWithAnchors = Object.entries(coordinates)
    .filter(([_, data]) => data.anchorMessageId)
    .map(([coord, _]) => coord);
  
  console.log(`🔄 Updating all ${coordsWithAnchors.length} anchor messages for guild ${guildId}`);
  
  return await forceUpdateAnchors(guildId, coordsWithAnchors);
}

/**
 * Clear update queue for a guild
 * @param {string} guildId - Guild ID
 */
export function clearGuildQueue(guildId) {
  if (updateQueue.has(guildId)) {
    const count = updateQueue.get(guildId).size;
    updateQueue.delete(guildId);
    console.log(`🧹 Cleared ${count} pending updates for guild ${guildId}`);
  }
}

/**
 * Get queue status
 * @returns {Object} Queue statistics
 */
export function getQueueStatus() {
  let totalUpdates = 0;
  const guildStats = {};
  
  for (const [guildId, coordinates] of updateQueue.entries()) {
    guildStats[guildId] = coordinates.size;
    totalUpdates += coordinates.size;
  }
  
  return {
    totalUpdates,
    guilds: updateQueue.size,
    guildStats,
    errors: updateErrors.size,
    batchScheduled: batchTimer !== null
  };
}

// Export update manager interface
export default {
  queueAnchorUpdate,
  queueActionCoordinateUpdates,
  forceUpdateAnchors,
  updateAllGuildAnchors,
  clearGuildQueue,
  getQueueStatus
};