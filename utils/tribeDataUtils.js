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
 * Tribe color presets - mirrors Discord's role color picker palette.
 * Used by tribe edit modal StringSelect for quick color selection.
 * Last entry 'custom' is a sentinel for freeform hex input.
 */
export const TRIBE_COLOR_PRESETS = [
  { value: '#1ABC9C', label: 'Teal',        emoji: '🩵' },
  { value: '#2ECC71', label: 'Green',       emoji: '🟢' },
  { value: '#3498DB', label: 'Blue',        emoji: '🔵' },
  { value: '#9B59B6', label: 'Purple',      emoji: '🟣' },
  { value: '#E91E63', label: 'Pink',        emoji: '🩷' },
  { value: '#F1C40F', label: 'Yellow',      emoji: '🟡' },
  { value: '#E67E22', label: 'Orange',      emoji: '🟠' },
  { value: '#E74C3C', label: 'Red',         emoji: '🔴' },
  { value: '#95A5A6', label: 'Light Grey',  emoji: '⚪' },
  { value: '#607D8B', label: 'Blue Grey',   emoji: '🔘' },
  { value: '#11806A', label: 'Dark Teal',   emoji: '🌲' },
  { value: '#1F8B4C', label: 'Dark Green',  emoji: '🌿' },
  { value: '#206694', label: 'Dark Blue',   emoji: '🫐' },
  { value: '#71368A', label: 'Dark Purple', emoji: '🍇' },
  { value: '#AD1457', label: 'Dark Pink',   emoji: '🌺' },
  { value: '#C27C0E', label: 'Dark Gold',   emoji: '🥇' },
  { value: '#A84300', label: 'Dark Orange', emoji: '🍂' },
  { value: '#992D22', label: 'Dark Red',    emoji: '🧱' },
  { value: '#FFFFFF', label: 'White',       emoji: '⬜' },
  { value: 'custom',  label: 'Custom...',  emoji: '🎨' },
];

/**
 * Get sort strategy display name
 * @param {string} strategy - Sort strategy key
 * @returns {string} Human-readable strategy name
 */
export function getSortStrategyName(strategy) {
  return SORT_STRATEGIES[strategy]?.label || 'Default';
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