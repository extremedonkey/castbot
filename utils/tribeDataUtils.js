/**
 * Tribe Data Utility Functions
 * Shared utilities for managing tribe data across legacy and new castlist systems
 */

/**
 * Format Discord role color to hex string
 * @param {number} color - Discord color integer
 * @returns {string} Hex color string in format #RRGGBB
 */
export function formatRoleColor(color) {
  if (!color || color === 0) return '#000000';

  // Convert integer to hex and pad with zeros
  const hex = color.toString(16).padStart(6, '0');
  return `#${hex}`;
}

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
export function formatPlayerList(members, maxLength = 38) {
  if (!members || members.length === 0) {
    return 'No players';
  }

  const count = members.length;
  // Discord.js GuildMember structure: nickname > displayName > user.globalName > user.username
  let playerNames = members.map(m =>
    m.nickname || m.displayName || m.user?.globalName || m.user?.username || 'Unknown'
  );

  // Build the initial string
  let baseString = `${count} player${count !== 1 ? 's' : ''}: `;
  let remaining = maxLength - baseString.length - 2; // Reserve 2 for ".."

  let namesList = [];
  for (const name of playerNames) {
    if (namesList.length === 0) {
      // First name always included (even if truncated)
      if (name.length <= remaining) {
        namesList.push(name);
        remaining -= name.length;
      } else {
        // Truncate first name if needed
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
        // Can't fit, add ellipsis
        break;
      }
    }
  }

  const result = baseString + namesList.join(', ');

  // Add ellipsis if we didn't include all players
  if (namesList.length < playerNames.length) {
    return result + '..';
  }

  return result;
}

/**
 * Get sort strategy display name
 * @param {string} strategy - Sort strategy key
 * @returns {string} Human-readable strategy name
 */
export function getSortStrategyName(strategy) {
  const strategies = {
    'placements': 'Placements',
    'alphabetical': 'Alphabetical (A-Z), no placements',
    'placements_alpha': 'Placements, then Alphabetical (A-Z)',
    'custom': 'Custom Order',
    'rankings': 'Rankings'
  };

  return strategies[strategy] || 'Default';
}

/**
 * Validate and format hex color (with or without #)
 * @param {string} color - Color string to validate
 * @returns {string|null} Formatted color or null if invalid
 */
export function validateHexColor(color) {
  if (!color) return null;

  // Remove # if present
  const hex = color.replace('#', '').trim();

  // Validate hex format (3 or 6 characters)
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) {
    return null;
  }

  // Expand 3-char to 6-char if needed
  const fullHex = hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex;

  return `#${fullHex.toUpperCase()}`;
}