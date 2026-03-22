/**
 * Tribe Data Utility Functions
 * Shared utilities for managing tribe data across legacy and new castlist systems
 */

// Re-export shared color utilities for backwards compatibility
export { formatRoleColor, validateHexColor, COLOR_PRESETS, hexToColorInt } from './colorUtils.js';
// Backwards-compatible alias
import { COLOR_PRESETS as _COLOR_PRESETS } from './colorUtils.js';
export const TRIBE_COLOR_PRESETS = _COLOR_PRESETS;

import { formatRoleColor } from './colorUtils.js';

/**
 * Populate default tribe data with all required fields
 * @param {Object} existingData - Existing tribe data (if any)
 * @param {Object} role - Discord role object
 * @param {string} castlistId - Associated castlist ID
 * @param {string} castlistName - Associated castlist name
 * @returns {Object} Complete tribe data object
 */
export function populateTribeData(existingData = {}, role, castlistId, castlistName) {
  return {
    // Preserve existing data
    ...existingData,

    // Update/add castlist associations
    castlistIds: existingData.castlistIds
      ? (existingData.castlistIds.includes(castlistId)
        ? existingData.castlistIds
        : [...existingData.castlistIds, castlistId])
      : [castlistId],
    castlist: castlistName,

    // Set color from Discord role (don't override if user set custom)
    color: existingData.color || formatRoleColor(role.color),

    // Always update analytics name from current role name
    analyticsName: role.name,

    // Set analytics added timestamp (preserve if exists)
    analyticsAdded: existingData.analyticsAdded || Date.now(),

    // Set default emoji if not present
    emoji: existingData.emoji || '🏕️',

    // Default showPlayerEmojis to true
    showPlayerEmojis: existingData.showPlayerEmojis ?? true,

    // Store member count if available (for fast UI updates)
    memberCount: role.members?.size ?? existingData.memberCount ?? 0
  };
}

/**
 * Format player list for tribe display
 * @param {Array} members - Array of member objects
 * @param {number} maxLength - Maximum character length (default 38)
 * @returns {string} Formatted player list
 */
export function formatPlayerList(members, maxLength = 300) {
  if (!members || members.length === 0) {
    return 'No players';
  }

  // Discord.js GuildMember structure: nickname > displayName > user.globalName > user.username
  let playerNames = members.map(m =>
    m.nickname || m.displayName || m.user?.globalName || m.user?.username || 'Unknown'
  );

  // Names only, no count prefix (count is shown in the section header)
  let remaining = maxLength - 2; // Reserve 2 for ".."

  let namesList = [];
  for (const name of playerNames) {
    if (namesList.length === 0) {
      // First name always included (even if truncated)
      if (name.length <= remaining) {
        namesList.push(name);
        remaining -= name.length;
      } else {
        namesList.push(name.substring(0, remaining - 2) + '..');
        break;
      }
    } else {
      // Subsequent names need comma and space
      const needed = name.length + 2; // ", " + name
      if (needed <= remaining) {
        namesList.push(name);
        remaining -= needed;
      } else {
        break;
      }
    }
  }

  const result = namesList.join(', ');

  // Add ellipsis if we didn't include all players
  if (namesList.length < playerNames.length) {
    return result + '..';
  }

  return result;
}

/**
 * Sort strategy definitions - single source of truth for display names and emojis.
 * Used by both the sort strategy select menu (castlistHandlers.js) and the hub display (castlistHub.js).
 */
export const SORT_STRATEGIES = {
  'placements':      { label: 'Alphabetical (A-Z), then Placement', emoji: '🏅', description: 'Any eliminated players shown last' },
  'vanity_role':     { label: 'Vanity Role (Winners)', emoji: '🏆', description: "Useful for Winners' castlist" },
  'alphabetical':    { label: 'Alphabetical (A-Z), no placements', emoji: '🔤', description: 'Sort players by name' },
  'placements_alpha':{ label: 'Placements, then Alphabetical (A-Z)', emoji: '📊', description: 'Placements first, then alphabetical' },
  'reverse_alpha':   { label: 'Reverse Alphabetical (Z-A)', emoji: '🔤', description: 'Sort players by name in reverse' },
  'age':             { label: 'Age', emoji: '🎂', description: 'Sort by player age' },
  'timezone':        { label: 'Timezone', emoji: '🌍', description: 'Sort by timezone offset' },
  'join_date':       { label: 'Join Date', emoji: '📅', description: 'Sort by server join date' },
  'custom':          { label: 'Custom Order', emoji: '🔧', description: 'Manual custom ordering' },
  'rankings':        { label: 'Rankings', emoji: '📈', description: 'Sort by ranking score' }
};


/**
 * Get sort strategy display name
 * @param {string} strategy - Sort strategy key
 * @returns {string} Human-readable strategy name
 */
export function getSortStrategyName(strategy) {
  return SORT_STRATEGIES[strategy]?.label || 'Default';
}

