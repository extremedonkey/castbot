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
 * The Add New Tribe / Add Existing Tribe modal — ONE builder for both flavors, shared by
 * app.js tribe_add_button| and tribe_existing_button|. Lives here (not app.js) so tests can
 * import the REAL payload and assert Discord's modal limits (Label ≤45, description ≤100,
 * ≤5 top-level components — any overflow silently kills the whole modal, see
 * ComponentsV2Issues.md §16). Deliberately dependency-free beyond colorUtils: preset emoji
 * are all static Unicode, so a plain { name } wrap matches what resolveEmoji would return
 * without dragging emojiUtils→storage.js into test imports.
 *
 * @param {string} castlistId - target castlist ('default' from Marooning)
 * @param {string|null} [origin] - 'marooning_{configId}' → PRIVATE tribe (no members select,
 *   submit skips castlist link + role assignment) and tells the submit which view to refresh
 * @param {boolean} [existing] - true → register an existing role: Role Select replaces the
 *   Tribe Name input and the submit skips role creation (tribe_existing_modal|)
 * @returns {Object} full interaction response: { type: 9, data: { custom_id, title, components } }
 */
export function buildTribeAddModal({ castlistId, origin = null, existing = false }) {
  const isPrivate = !!origin?.startsWith('marooning_');
  const modalPrefix = existing ? 'tribe_existing_modal' : 'tribe_add_modal';

  const nameOrRole = existing
    ? {
        type: 18, // Label
        label: 'Tribe Role',
        description: 'Select the role this tribe already uses — in CastBot or not. No role yet? New Tribe creates it.',
        component: {
          type: 6, // Role Select
          custom_id: 'tribe_role',
          placeholder: 'Select the tribe\'s existing role...',
          required: true,
          min_values: 1,
          max_values: 1
        }
      }
    : {
        type: 18, // Label
        label: 'Tribe Name',
        description: isPrivate
          ? 'Creates the Discord role only — no members assigned, not added to a castlist.'
          : 'CastBot will create the Discord role for you. Already have the role? Add via previous screen.',
        component: {
          type: 4, // Text Input
          custom_id: 'tribe_name',
          style: 1,
          placeholder: 'e.g. Mana Tribe',
          required: true,
          min_length: 1,
          max_length: 100
        }
      };

  return {
    type: 9, // MODAL
    data: {
      custom_id: `${modalPrefix}|${castlistId}${origin ? `|${origin}` : ''}`,
      title: existing ? 'Add Existing Tribe' : 'Add New Tribe',
      components: [
        nameOrRole,
        {
          type: 18, // Label
          label: 'Tribe Emoji',
          description: 'Unicode or Discord custom emoji for this tribe',
          component: {
            type: 4, // Text Input
            custom_id: 'tribe_emoji',
            style: 1,
            placeholder: '🔥 or <:custom:123>',
            required: false,
            max_length: 60
          }
        },
        // Members select: NEW public flow only. Private (marooning) tribes must not broadcast
        // in-flux casting via a real role; existing mode never assigns members at all.
        ...(existing || isPrivate ? [] : [{
          type: 18, // Label
          label: 'Tribe Members',
          description: 'Selected users will be assigned this role automatically after creation.',
          component: {
            type: 5, // User Select
            custom_id: 'tribe_members',
            placeholder: 'Select members to assign...',
            required: false,
            min_values: 0,
            max_values: 25
          }
        }]),
        {
          type: 18, // Label
          label: 'Tribe Color',
          description: existing
            ? 'Only recolors the role if you pick something here'
            : 'Sets the Discord role color and tribe accent color',
          component: {
            type: 3, // String Select
            custom_id: 'tribe_color_preset',
            placeholder: 'Pick a color...',
            required: false,
            min_values: 0,
            max_values: 1,
            options: TRIBE_COLOR_PRESETS.map(preset => ({
              label: preset.label,
              value: preset.value,
              description: preset.value === 'custom' ? 'Enter hex code below' : preset.value,
              emoji: { name: preset.emoji || '🎨' },
              default: false
            }))
          }
        },
        {
          type: 18, // Label
          label: 'Custom Color (optional)',
          description: 'Only used when "Custom..." is selected above. Format: #RRGGBB',
          component: {
            type: 4, // Text Input
            custom_id: 'tribe_color_custom',
            style: 1,
            placeholder: '#FF5733',
            required: false,
            max_length: 7
          }
        }
      ]
    }
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

