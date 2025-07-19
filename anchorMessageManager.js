/**
 * Anchor Message Manager
 * Centralized system for managing map anchor message updates
 * Ensures Discord messages stay in sync with safariContent.json changes
 */

import { loadSafariContent } from './safariManager.js';
import { createAnchorMessageComponents } from './safariButtonHelper.js';
import { DiscordRequest } from './utils.js';

// Update queue to batch changes and avoid rate limits
const updateQueue = new Map(); // Map<guildId, Set<coordinate>>
const updateErrors = new Map(); // Track failed updates for retry

// Batch update interval (5 seconds)
const BATCH_INTERVAL = 5000;
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
    
    for (const [key, { guildId, coordinate }] of retries.entries()) {
      queueAnchorUpdate(guildId, coordinate, { reason: 'retry' });
    }
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
      return true;
    }
    
    // Get fog map URL from existing implementation
    let fogMapUrl = null;
    // TODO: Implement fog map URL recovery logic
    
    // Create updated components
    const components = await createAnchorMessageComponents(coordData, guildId, coordinate, fogMapUrl);
    
    // Update the message
    await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
      method: 'PATCH',
      body: {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: components
      }
    });
    
    console.log(`✅ Updated anchor message for ${coordinate}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to update anchor for ${coordinate}:`, error.message);
    
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