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

  // Determine sorting strategy from castlistSettings (NEW) or legacy tribe.type (fallback)
  const sortingStrategy = tribeData.castlistSettings?.sortStrategy
                       || (tribeData.type === 'alumni_placements' ? 'placements' : null)
                       || 'alphabetical';

  switch (sortingStrategy) {
    case 'placements':
      return sortByPlacements(members, tribeData, options);

    case 'reverse_alpha':
      return sortAlphabetical(members, true);

    // Future sorting strategies can be added here
    // case 'by_age':
    //   return sortByAge(members, tribeData, options);
    // case 'by_timezone':
    //   return sortByTimezone(members, tribeData, options);

    case 'alphabetical':
    default:
      return sortAlphabetical(members);
  }
}

/**
 * Sort members by placement rankings (for alumni seasons)
 * Unranked members (active players) appear first alphabetically,
 * followed by ranked members (eliminated players) in ascending placement order
 * @param {Array} members - Array of member objects
 * @param {Object} tribeData - Tribe data with castlistSettings
 * @param {Object} options - Options containing pre-loaded playerData and guildId
 * @returns {Array} Sorted array with placement prefixes added
 */
function sortByPlacements(members, tribeData, options = {}) {
  const { playerData, guildId } = options;

  // Fallback to alphabetical if no data available
  if (!playerData || !guildId) {
    console.warn('[SORTER] No playerData or guildId provided, falling back to alphabetical');
    return sortAlphabetical(members);
  }

  // Determine placement namespace based on castlist's season
  const seasonId = tribeData.castlistSettings?.seasonId;
  const placementNamespace = seasonId
    ? playerData[guildId]?.placements?.[seasonId]      // Season-specific placements
    : playerData[guildId]?.placements?.global;          // Global fallback (No Season)

  if (!placementNamespace) {
    console.warn(`[SORTER] No placement data for ${seasonId ? `season ${seasonId}` : 'global'}, falling back to alphabetical`);
    return sortAlphabetical(members);
  }

  console.log(`[SORTER] Using placement namespace: ${seasonId || 'global'}, found ${Object.keys(placementNamespace).length} placements`);

  const ranked = [];
  const unranked = [];

  // Separate members into ranked and unranked groups
  members.forEach(member => {
    const userId = member.user?.id || member.id;
    const placementData = placementNamespace[userId];

    if (placementData?.placement) {
      // Preserve the original member object and add properties directly
      // This maintains Discord.js object structure
      member.placement = parseInt(placementData.placement);

      // Format with ordinal indicator (1st, 2nd, 3rd, etc.)
      const num = parseInt(placementData.placement);
      let ordinal;

      // Handle special cases 11-13
      if (num % 100 >= 11 && num % 100 <= 13) {
        ordinal = `${num}th`;
      } else {
        // Standard ordinal rules
        switch (num % 10) {
          case 1: ordinal = `${num}st`; break;
          case 2: ordinal = `${num}nd`; break;
          case 3: ordinal = `${num}rd`; break;
          default: ordinal = `${num}th`;
        }
      }

      member.displayPrefix = `\`${ordinal}\` `; // e.g., "`5th` "
      ranked.push(member);
    } else {
      // Keep unranked members as-is (active players)
      unranked.push(member);
    }
  });

  // Sort ranked members by placement (ascending: 1, 2, 3...)
  ranked.sort((a, b) => a.placement - b.placement);

  // Sort unranked members alphabetically
  // Handle Discord.js member objects which may have displayName as a property or need to fallback
  unranked.sort((a, b) => {
    const nameA = a.displayName || a.nickname || a.user?.username || a.username || '';
    const nameB = b.displayName || b.nickname || b.user?.username || b.username || '';
    return nameA.localeCompare(nameB);
  });

  console.log(`[SORTER] Sorted ${unranked.length} unranked (active), ${ranked.length} ranked (eliminated)`);

  // Return unranked members first (active players), then ranked (eliminated players)
  return [...unranked, ...ranked];
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