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
 * Compute the per-season config indicators shown in the Season Manager selector and search results.
 * e.g. "📝 Apps • 🏆 Ranking • 📅 Planner" or "⚠️ Not configured yet".
 * @param {string} configId
 * @param {Object} season - applicationConfigs[configId]
 * @param {Object} guildData - playerData[guildId]
 * @returns {string}
 */
export function seasonConfigIndicators(configId, season, guildData) {
  const parts = [];
  const appsConfigured = !!season.targetChannelId
    || (season.questions || []).some(q => q.questionType !== 'completion' && q.questionTitle && q.questionTitle !== 'Click here to set first question');
  if (appsConfigured) parts.push('📝 Apps');
  const hasRankings = Object.values(guildData?.applications || {}).some(app =>
    app.configId === configId && ((app.rankings && Object.keys(app.rankings).length > 0) || app.castingStatus)
  );
  if (hasRankings) parts.push('🏆 Ranking');
  if (guildData?.seasonRounds?.[season.seasonId]) parts.push('📅 Planner');
  return parts.length ? parts.join(' • ') : '⚠️ Not configured yet';
}

/**
 * Active-tab navigation row shared by every Season Manager view (Apps / Planner / Ranking).
 * Identical ordering [Apps · Planner · Ranking · Edit] everywhere; the CURRENT view's tab is
 * Primary (blue, still clickable — reloads), the rest Secondary (grey). Edit is an action, never active.
 * Adopts the Player Manager active-button convention. Single source of truth so the row can never drift.
 * @param {string} configId
 * @param {'apps'|'planner'|'ranking'} active
 * @returns {Object} a type-1 ActionRow
 */
export function buildSeasonNavRow(configId, active) {
  const tab = (key, customId, label, emoji) => ({
    type: 2, custom_id: customId, label,
    style: active === key ? 1 : 2, // Primary (blue) when this is the current view, else Secondary (grey)
    emoji: { name: emoji }
  });
  return {
    type: 1,
    components: [
      tab('apps', `planner_apps_${configId}`, 'Apps', '📝'),
      tab('planner', `apps_planner_${configId}`, 'Planner', '📅'),
      tab('ranking', `season_app_ranking_${configId}`, 'Ranking', '🏆'),
      // Edit custom_id carries the ORIGIN view (active) so the modal submit refreshes THAT same view
      // (e.g. edit from Planner → watch the planner repopulate). Parsed back in the season_edit_info handler.
      { type: 2, custom_id: `season_edit_info_${active}_${configId}`, label: 'Edit', style: 2, emoji: { name: '✏️' } }
    ]
  };
}

/**
 * Creates a reusable season select dropdown component.
 *
 * ⚠️ For SEASON MANAGEMENT UI, do NOT call this directly with the default customId — that's the
 * DEPRECATED "Apps" picker ('entity_select_seasons'). Use buildPlannerSelector() (the Season Manager)
 * instead, which wraps this with the right customId, search, and config indicators. Direct callers
 * with custom customIds (alumni/active/castlist selectors) are fine.
 *
 * @param {string} guildId - Discord guild ID
 * @param {Object} options - Configuration options
 * @param {string} options.customId - Custom ID for the select menu (default: 'entity_select_seasons' — DEPRECATED Apps picker)
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
    decorateSeason = null,
    showRowEmoji = true,
    includeSearch = false
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

  // Add the Search option when the list is large enough to need it (mirrors Safari entity search).
  // Selecting 'search_entities' opens the shared entity_search_modal flow.
  const hasSearch = includeSearch && seasonList.length > 10;
  if (hasSearch) {
    seasonOptions.push({
      label: '🔍 Search seasons...',
      value: 'search_entities',
      description: 'Search by season name'
    });
  }

  // Calculate how many seasons we can show (25 total − control options − overflow slot if truncating)
  const controlSlots = (includeCreateNew ? 1 : 0) + (hasSearch ? 1 : 0);
  const capacity = 25 - controlSlots;
  const willOverflow = seasonList.length > capacity;
  const maxSeasons = willOverflow ? capacity - 1 : capacity;
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

    // Build option object (showRowEmoji=false drops the stage-emoji prefix, e.g. Season Manager)
    const option = {
      label: showRowEmoji ? `${emoji} ${truncatedName}` : truncatedName,
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
      description: hasSearch ? `${remainingSeasons} more — use 🔍 Search to find them` : `${remainingSeasons} more seasons (use archive to manage)`,
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