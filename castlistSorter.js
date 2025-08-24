/**
 * Castlist Sorting Module
 * 
 * Provides flexible sorting strategies for castlist members.
 * Designed to be extensible for future sorting requirements.
 */

/**
 * Main sorting function that determines and applies the appropriate sorting strategy
 * @param {Array} members - Array of member objects with user and displayName properties
 * @param {Object} tribeData - Tribe data including type and rankings
 * @param {Object} options - Additional sorting options (for future use)
 * @returns {Array} Sorted array of members
 */
export function sortCastlistMembers(members, tribeData, options = {}) {
  // Default to alphabetical if no tribe data provided
  if (!tribeData) {
    return sortAlphabetical(members);
  }
  
  // Determine sorting strategy based on tribe type
  const sortingStrategy = tribeData.type || 'default';
  
  switch (sortingStrategy) {
    case 'alumni_placements':
      return sortByPlacements(members, tribeData.rankings || {});
    
    // Future sorting strategies can be added here
    // case 'alphabetical_reverse':
    //   return sortAlphabetical(members, true);
    // case 'by_age':
    //   return sortByAge(members, tribeData);
    // case 'by_timezone':
    //   return sortByTimezone(members, tribeData);
    
    case 'default':
    default:
      return sortAlphabetical(members);
  }
}

/**
 * Sort members by placement rankings (for alumni seasons)
 * Ranked members appear first (1, 2, 3...), followed by unranked members alphabetically
 * @param {Array} members - Array of member objects
 * @param {Object} rankings - Object mapping user IDs to placement data
 * @returns {Array} Sorted array with placement prefixes added
 */
function sortByPlacements(members, rankings) {
  const ranked = [];
  const unranked = [];
  
  // Separate members into ranked and unranked groups
  members.forEach(member => {
    const userId = member.user?.id || member.id;
    
    if (rankings[userId]) {
      // Add placement data to ranked members
      ranked.push({
        ...member,
        placement: parseInt(rankings[userId].placement),
        displayPrefix: `${rankings[userId].placement}) ` // e.g., "1) "
      });
    } else {
      // Keep unranked members as-is
      unranked.push(member);
    }
  });
  
  // Sort ranked members by placement (1 first, 2 second, etc.)
  ranked.sort((a, b) => a.placement - b.placement);
  
  // Sort unranked members alphabetically
  // Handle Discord.js member objects which may have displayName as a property or need to fallback
  unranked.sort((a, b) => {
    const nameA = a.displayName || a.nickname || a.user?.username || a.username || '';
    const nameB = b.displayName || b.nickname || b.user?.username || b.username || '';
    return nameA.localeCompare(nameB);
  });
  
  // Return ranked members first, then unranked
  return [...ranked, ...unranked];
}

/**
 * Sort members alphabetically by display name
 * @param {Array} members - Array of member objects
 * @param {Boolean} reverse - If true, sort Z to A instead of A to Z
 * @returns {Array} Alphabetically sorted array
 */
function sortAlphabetical(members, reverse = false) {
  return members.sort((a, b) => {
    const nameA = a.displayName || a.nickname || a.user?.username || a.username || '';
    const nameB = b.displayName || b.nickname || b.user?.username || b.username || '';
    const result = nameA.localeCompare(nameB);
    return reverse ? -result : result;
  });
}

// Future sorting functions can be added below
// function sortByAge(members, tribeData) { ... }
// function sortByTimezone(members, tribeData) { ... }
// function sortByJoinDate(members, tribeData) { ... }
// function sortCustomOrder(members, tribeData) { ... }