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
  // 🔧 FIX: Clear any existing placement data from previous sorting operations
  // Member objects are cached by Discord.js and reused across different castlist views
  // This prevents stale placement prefixes from other castlists from persisting
  const membersWithStaleData = members.filter(m => m.displayPrefix || m.placement);
  if (membersWithStaleData.length > 0) {
    console.log(`[SORTER] Clearing stale placement data from ${membersWithStaleData.length} member(s)`);
  }
  members.forEach(member => {
    delete member.displayPrefix;
    delete member.placement;
  });

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

    case 'vanity_role':
      return sortByVanityRole(members, tribeData, options);

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

/**
 * Parse season number from vanity role name
 * Handles patterns like "S1", "S11", "Season 1", "Season 11"
 * @param {string} roleName - The role name to parse
 * @returns {Object|null} { type: 'season', number: 1 } or null if not a season role
 */
function parseSeasonNumber(roleName) {
  if (!roleName) return null;

  // Pattern 1: "S1 - Something", "S11 - Something" (Sx where x is 1-2 digits)
  const sxPattern = /^S(\d{1,2})\s/i;
  const sxMatch = roleName.match(sxPattern);
  if (sxMatch) {
    return { type: 'season', number: parseInt(sxMatch[1]) };
  }

  // Pattern 2: "Season 1", "Season 11" (Season followed by space and digits)
  const seasonPattern = /^Season\s+(\d{1,2})/i;
  const seasonMatch = roleName.match(seasonPattern);
  if (seasonMatch) {
    return { type: 'season', number: parseInt(seasonMatch[1]) };
  }

  return null;
}

/**
 * Categorize a role name into sorting priority groups
 * @param {string} roleName - The role name to categorize
 * @returns {Object} { category: 'season'|'alpha'|'numeric'|'emoji'|'other', value: any }
 */
function categorizeRoleName(roleName) {
  if (!roleName) {
    return { category: 'other', value: '' };
  }

  // Check for season patterns first (highest priority)
  const seasonData = parseSeasonNumber(roleName);
  if (seasonData) {
    return { category: 'season', value: seasonData.number, original: roleName };
  }

  const firstChar = roleName.charAt(0);

  // Check if starts with a letter (a-z, case insensitive)
  if (/[a-z]/i.test(firstChar)) {
    return { category: 'alpha', value: roleName.toLowerCase(), original: roleName };
  }

  // Check if starts with a digit
  if (/\d/.test(firstChar)) {
    // Extract leading number for proper numeric sorting
    const numMatch = roleName.match(/^(\d+)/);
    const numValue = numMatch ? parseInt(numMatch[1]) : 0;
    return { category: 'numeric', value: numValue, original: roleName };
  }

  // Check if starts with emoji (anything that's not alphanumeric)
  // This catches: 🏆Winners, 😀Happy, etc.
  if (!/[a-z0-9]/i.test(firstChar)) {
    return { category: 'emoji', value: roleName, original: roleName };
  }

  // Everything else (shouldn't reach here)
  return { category: 'other', value: roleName, original: roleName };
}

/**
 * Sort members by their vanity roles
 * Priority order:
 * 1. Season roles (S1, S2, S11, Season 1, etc.) - sorted numerically
 * 2. Alphabetical roles (a-z) - sorted alphabetically
 * 3. Numeric roles (1-N) - sorted numerically
 * 4. Emoji roles (🏆Winners, 😀Happy, etc.) - sorted alphabetically
 * 5. No vanity roles - sorted alphabetically by display name
 * @param {Array} members - Array of member objects
 * @param {Object} tribeData - Tribe data with castlistSettings
 * @param {Object} options - Options containing pre-loaded playerData and guildId
 * @returns {Array} Sorted array
 */
function sortByVanityRole(members, tribeData, options = {}) {
  const { playerData, guildId } = options;

  // Fallback to alphabetical if no data available
  if (!playerData || !guildId) {
    console.warn('[SORTER] No playerData or guildId provided for vanity sorting, falling back to alphabetical');
    return sortAlphabetical(members);
  }

  // Group members by vanity role category
  const seasonRoles = [];
  const alphaRoles = [];
  const numericRoles = [];
  const emojiRoles = [];
  const noVanityRoles = [];

  members.forEach(member => {
    const userId = member.user?.id || member.id;
    const vanityRoles = playerData[guildId]?.players?.[userId]?.vanityRoles || [];

    if (vanityRoles.length === 0) {
      // No vanity roles - sort alphabetically at the end (mixed)
      noVanityRoles.push(member);
      return;
    }

    // Get all vanity role names from Discord role cache
    const vanityRoleNames = vanityRoles
      .map(roleId => member.guild?.roles?.cache?.get(roleId)?.name)
      .filter(name => name); // Filter out null/undefined

    if (vanityRoleNames.length === 0) {
      // Has vanity role IDs but can't resolve names - treat as no vanity
      noVanityRoles.push(member);
      return;
    }

    // Categorize all vanity roles
    const categorizedRoles = vanityRoleNames.map(name => categorizeRoleName(name));

    // Find highest priority category first, then use alphabetical within that category
    // Priority order: season > alpha > numeric > emoji > other
    const categoryPriority = { season: 1, alpha: 2, numeric: 3, emoji: 4, other: 5 };

    const priorityRole = categorizedRoles
      .sort((a, b) => {
        // First, sort by category priority
        const priorityA = categoryPriority[a.category] || 999;
        const priorityB = categoryPriority[b.category] || 999;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // Within same category, sort alphabetically by role name
        const nameA = a.original || '';
        const nameB = b.original || '';
        return nameA.localeCompare(nameB);
      })[0];

    // Attach sorting metadata to member
    member.vanityCategory = priorityRole.category;
    member.vanitySortValue = priorityRole.value;
    member.vanityRoleName = priorityRole.original;

    // Add to appropriate group
    switch (firstAlphaRole.category) {
      case 'season':
        seasonRoles.push(member);
        break;
      case 'alpha':
        alphaRoles.push(member);
        break;
      case 'numeric':
        numericRoles.push(member);
        break;
      case 'emoji':
        emojiRoles.push(member);
        break;
      default:
        noVanityRoles.push(member);
    }
  });

  // Sort each group appropriately

  // Season roles: Sort by season number (ascending: S1, S2, S11)
  seasonRoles.sort((a, b) => a.vanitySortValue - b.vanitySortValue);

  // Alpha roles: Sort alphabetically by role name
  alphaRoles.sort((a, b) => a.vanitySortValue.localeCompare(b.vanitySortValue));

  // Numeric roles: Sort numerically
  numericRoles.sort((a, b) => a.vanitySortValue - b.vanitySortValue);

  // Emoji roles: Sort alphabetically by role name
  emojiRoles.sort((a, b) => a.vanitySortValue.localeCompare(b.vanitySortValue));

  // No vanity roles: Sort alphabetically by display name
  noVanityRoles.sort((a, b) => {
    const nameA = a.displayName || a.nickname || a.user?.username || a.username || '';
    const nameB = b.displayName || b.nickname || b.user?.username || b.username || '';
    return nameA.localeCompare(nameB);
  });

  console.log(`[SORTER] Vanity role sort: ${seasonRoles.length} season, ${alphaRoles.length} alpha, ${numericRoles.length} numeric, ${emojiRoles.length} emoji, ${noVanityRoles.length} no vanity`);

  // Combine in priority order
  return [...seasonRoles, ...alphaRoles, ...numericRoles, ...emojiRoles, ...noVanityRoles];
}

/**
 * Sort vanity role objects for display purposes
 * Uses same categorization as member sorting but works on role objects directly
 * Priority order: Season → Alpha → Numeric → Emoji → Other
 * @param {Array<{id: string, name: string}>} roles - Array of role objects with id and name
 * @returns {Array<{id: string, name: string}>} Sorted role objects in display order
 */
export function sortVanityRolesForDisplay(roles) {
  if (!roles || roles.length === 0) {
    return [];
  }

  // Categorize all roles
  const categorized = roles.map(role => ({
    ...role,
    category: categorizeRoleName(role.name)
  }));

  // Group by category
  const groups = {
    season: [],
    alpha: [],
    numeric: [],
    emoji: [],
    other: []
  };

  categorized.forEach(role => {
    const cat = role.category.category;
    if (groups[cat]) {
      groups[cat].push(role);
    } else {
      groups.other.push(role);
    }
  });

  // Sort each group appropriately
  groups.season.sort((a, b) => a.category.value - b.category.value);
  groups.alpha.sort((a, b) => a.category.value.localeCompare(b.category.value));
  groups.numeric.sort((a, b) => a.category.value - b.category.value);
  groups.emoji.sort((a, b) => a.category.value.localeCompare(b.category.value));
  groups.other.sort((a, b) => a.name.localeCompare(b.name));

  // Combine in priority order and strip category metadata
  const sorted = [
    ...groups.season,
    ...groups.alpha,
    ...groups.numeric,
    ...groups.emoji,
    ...groups.other
  ].map(({ id, name }) => ({ id, name }));

  console.log(`[SORTER] Sorted ${roles.length} vanity roles for display: ${sorted.map(r => r.name).join(', ')}`);

  return sorted;
}

// Future sorting functions can be added below
// function sortByAge(members, tribeData) { ... }
// function sortByTimezone(members, tribeData) { ... }
// function sortByJoinDate(members, tribeData) { ... }
// function sortCustomOrder(members, tribeData) { ... }