/**
 * Anchor Message Integration Points
 * This file shows where to integrate the anchor message manager
 * into existing handlers and operations
 */

// Import the anchor message manager
import { queueAnchorUpdate, queueActionCoordinateUpdates } from './anchorMessageManager.js';

/**
 * Integration points for anchor message updates:
 */

// 1. When removing a coordinate from an action (in remove_coord handler)
export async function afterRemoveCoordinate(guildId, actionId, coordinate) {
  // Queue update for the specific coordinate that was removed
  queueAnchorUpdate(guildId, coordinate, {
    reason: 'action_removed',
    immediate: true
  });
}

// 2. When deleting an entire custom action
export async function afterDeleteCustomAction(guildId, actionId) {
  // Queue updates for all coordinates where this action was used
  await queueActionCoordinateUpdates(guildId, actionId, 'action_deleted');
}

// 3. When modifying action content (display_text, etc)
export async function afterModifyActionContent(guildId, actionId) {
  // Queue updates for all affected coordinates
  await queueActionCoordinateUpdates(guildId, actionId, 'action_modified');
}

// 4. When adding a coordinate to an action
export async function afterAddCoordinate(guildId, actionId, coordinate) {
  // Queue update for the new coordinate
  queueAnchorUpdate(guildId, coordinate, {
    reason: 'action_added',
    immediate: true
  });
}

// 5. When updating map cell content (title, description, etc)
export async function afterUpdateMapCell(guildId, coordinate) {
  // Queue update for the modified cell
  queueAnchorUpdate(guildId, coordinate, {
    reason: 'cell_content_updated',
    immediate: false // Can be batched
  });
}

// 6. When adding/removing stores from a coordinate
export async function afterUpdateMapStores(guildId, coordinate) {
  queueAnchorUpdate(guildId, coordinate, {
    reason: 'stores_updated',
    immediate: true
  });
}

// 7. When adding/removing item drops from a coordinate
export async function afterUpdateMapDrops(guildId, coordinate) {
  queueAnchorUpdate(guildId, coordinate, {
    reason: 'drops_updated',
    immediate: true
  });
}

/**
 * Example integration in remove_coord handler:
 * 
 * // After saving safari content...
 * await saveSafariContent(allSafariContent);
 * 
 * // Queue anchor message update
 * await afterRemoveCoordinate(context.guildId, actionId, coordinate);
 * 
 * // Continue with UI update...
 */

export default {
  afterRemoveCoordinate,
  afterDeleteCustomAction,
  afterModifyActionContent,
  afterAddCoordinate,
  afterUpdateMapCell,
  afterUpdateMapStores,
  afterUpdateMapDrops
};