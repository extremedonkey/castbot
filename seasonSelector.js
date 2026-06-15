/**
 * Season Selector Module
 * Provides reusable season selection components for CastBot
 * 
 * Seasons are the core organizing concept - each online reality game is a season
 * with a full lifecycle from planning to completion.
 */

import { StringSelectMenuBuilder } from 'discord.js';
import { loadPlayerData } from './storage.js';

/**
 * Get emoji for season stage
 * @param {string} stage - Season lifecycle stage
 * @returns {string} Emoji representing the stage
 */
export function getSeasonStageEmoji(stage) {
  const stageEmojis = {
    'planning': '📝',
    'applications': '📝',
    'active': '📝',  // Legacy value, treat as applications
    'cast_review': '🎯',
    'casting_offers': '🎯',
    'pre_marooning': '🏝️',
    'pre_swap': '🎮',
    'swap1': '🔄',
    'swap2': '🔄',
    'swap3': '🔄',
    'merge': '🤝',
    'complete': '🏆'
  };
  return stageEmojis[stage] || '📅';
}

/**
 * Get human-readable stage name
 * @param {string} stage - Season lifecycle stage
 * @returns {string} Human-readable stage name
 */
export function getSeasonStageName(stage) {
  const stageNames = {
    'planning': 'Planning',
    'applications': 'Applications Open',
    'active': 'Applications Open',  // Legacy value
    'cast_review': 'Cast Review',
    'casting_offers': 'Casting Offers',
    'pre_marooning': 'Pre-Marooning',
    'pre_swap': 'Starting Phase',
    'swap1': 'First Swap',
    'swap2': 'Second Swap',
    'swap3': 'Third Swap',
    'merge': 'Merge',
    'complete': 'Complete'
  };
  return stageNames[stage] || 'Unknown';
}

/**
 * Creates a reusable season select dropdown component
 * 
 * @param {string} guildId - Discord guild ID
 * @param {Object} options - Configuration options
 * @param {string} options.customId - Custom ID for the select menu (default: 'entity_select_seasons')
 * @param {string} options.placeholder - Placeholder text (default: 'Select a season...')
 * @param {boolean} options.includeCreateNew - Include "Create New Season" option (default: true)
 * @param {boolean} options.showArchived - Include archived seasons (default: false)
 * @param {string} options.filterStage - Only show seasons in specific stage (optional)
 * @param {boolean} options.requireSeasonName - Skip configs without a seasonName (default: false)
 * @param {string} options.createNewLabel - Label for the "Create New" option
 * @param {string} options.createNewValue - Value emitted for "Create New" (default: 'create_new_season')
 * @param {Object} options.createNewEmoji - Emoji object for the "Create New" option
 * @param {string} options.createNewDescription - Description for the "Create New" option
 * @param {Function} options.decorateSeason - (configId, season, guildData) => { emoji?, description? }
 *        Overrides the per-row emoji prefix and/or description (e.g. planner-setup status).
 * @returns {Promise<StringSelectMenuBuilder>} Configured select menu
 */
export async function createSeasonSelector(guildId, options = {}) {
  const {
    customId = 'entity_select_seasons',
    placeholder = 'Select your season...',
    includeCreateNew = true,
    showArchived = false,
    filterStage = null,
    requireSeasonName = false,
    createNewLabel = '➕ Create New Season',
    createNewValue = 'create_new_season',
    createNewEmoji = { name: '✨' },
    createNewDescription = 'Start planning a new season',
    decorateSeason = null
  } = options;

  const playerData = await loadPlayerData();
  const guildData = playerData[guildId] || {};

  // applicationConfigs ARE our seasons (just poorly named)
  const seasons = guildData.applicationConfigs || {};

  // Filter and sort seasons
  let seasonList = Object.entries(seasons)
    .filter(([_, season]) => {
      // Skip nameless configs if caller requires a name (e.g. Season Planner)
      if (requireSeasonName && !season.seasonName) return false;
      // Filter archived if needed
      if (!showArchived && season.archived) return false;
      // Filter by stage if specified
      if (filterStage && season.stage !== filterStage) return false;
      return true;
    })
    .sort(([,a], [,b]) => {
      // Sort by lastUpdated or createdAt, most recent first
      const aTime = a.lastUpdated || a.createdAt || 0;
      const bTime = b.lastUpdated || b.createdAt || 0;
      return bTime - aTime;
    });
  
  // Build options array
  const seasonOptions = [];
  
  // Add "Create New Season" if requested
  if (includeCreateNew) {
    seasonOptions.push({
      label: createNewLabel,
      value: createNewValue,
      emoji: createNewEmoji,
      description: createNewDescription
    });
  }
  
  // Calculate how many seasons we can show
  const maxSeasons = includeCreateNew ? 24 : 25;
  const showingSeasons = seasonList.slice(0, maxSeasons);
  const remainingSeasons = seasonList.length - showingSeasons.length;
  
  // Add existing seasons
  showingSeasons.forEach(([configId, season]) => {
    const stage = season.stage || 'planning';
    let emoji = getSeasonStageEmoji(stage);

    // Default description: the season's explanatoryText (if any)
    let description;
    if (season.explanatoryText && season.explanatoryText.trim().length > 0) {
      description = season.explanatoryText;
      // Discord select option descriptions max at 100 characters
      if (description.length > 100) {
        description = description.substring(0, 98) + '..';
      }
    }

    // Allow caller to override the emoji prefix and/or description
    // (e.g. Season Planner shows "📅 configured" / "⚠️ needs setup" status)
    if (decorateSeason) {
      const deco = decorateSeason(configId, season, guildData) || {};
      if (deco.emoji !== undefined) emoji = deco.emoji;
      if (deco.description !== undefined) description = deco.description;
    }

    // Truncate season name to ensure label doesn't exceed 100 chars
    // Emoji is 2 chars + space is 1 char = 3 chars reserved
    const maxNameLength = 97;
    let truncatedName = season.seasonName || 'Unnamed Season';
    if (truncatedName.length > maxNameLength) {
      truncatedName = truncatedName.substring(0, maxNameLength - 2) + '..';
    }

    // Build option object
    const option = {
      label: `${emoji} ${truncatedName}`,
      value: configId
    };
    if (description) option.description = description;

    seasonOptions.push(option);
  });
  
  // Handle overflow (25+ seasons)
  if (remainingSeasons > 0) {
    seasonOptions.push({
      label: '📦 More Seasons Available',
      value: 'view_more_seasons',
      description: `${remainingSeasons} more seasons (use archive to manage)`,
      emoji: { name: '📂' }
    });
  }
  
  // If no seasons and not allowing create new, add placeholder
  if (seasonOptions.length === 0) {
    seasonOptions.push({
      label: 'No seasons available',
      value: 'none',
      description: 'Create a season to get started'
    });
  }
  
  // Create and return the select menu
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(seasonOptions);
}

/**
 * Creates a season selector specifically for alumni castlists
 * Shows all seasons since alumni can link to any season
 */
export async function createAlumniSeasonSelector(guildId) {
  return createSeasonSelector(guildId, {
    customId: 'alumni_season_select',
    placeholder: 'Select or create a season for this alumni list...',
    includeCreateNew: true,
    showArchived: false
  });
}

/**
 * Creates a season selector for active game management
 * Only shows seasons that are currently in gameplay stages
 */
export async function createActiveSeasonSelector(guildId) {
  const playerData = await loadPlayerData();
  const seasons = playerData[guildId]?.applicationConfigs || {};
  
  // Active game stages
  const activeStages = ['pre_swap', 'swap1', 'swap2', 'swap3', 'merge'];
  
  const activeSeasons = Object.entries(seasons)
    .filter(([_, season]) => {
      const stage = season.stage || 'planning';
      return activeStages.includes(stage);
    });
  
  if (activeSeasons.length === 0) {
    return null; // No active seasons
  }
  
  return createSeasonSelector(guildId, {
    customId: 'active_season_select',
    placeholder: 'Select an active season...',
    includeCreateNew: false,
    filterStage: null // We already filtered above
  });
}

/**
 * Get all seasons for a guild (helper function)
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Array>} Array of season objects with IDs
 */
export async function getAllSeasons(guildId) {
  const playerData = await loadPlayerData();
  const seasons = playerData[guildId]?.applicationConfigs || {};
  
  return Object.entries(seasons).map(([id, season]) => ({
    id,
    ...season,
    stage: season.stage || 'planning',
    stageName: getStageName(season.stage || 'planning'),
    stageEmoji: getSeasonStageEmoji(season.stage || 'planning')
  }));
}

/**
 * Check if a season exists
 * @param {string} guildId - Discord guild ID
 * @param {string} seasonId - Season/config ID to check
 * @returns {Promise<boolean>} True if season exists
 */
export async function seasonExists(guildId, seasonId) {
  const playerData = await loadPlayerData();
  return !!playerData[guildId]?.applicationConfigs?.[seasonId];
}

export default createSeasonSelector;