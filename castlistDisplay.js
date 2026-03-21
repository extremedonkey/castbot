/**
 * castlistDisplay.js — Castlist display and navigation logic
 *
 * Extracted from app.js to support ButtonHandlerFactory migration.
 * Pure display logic — no res.send(), no webhook calls.
 * The factory handles all response mechanics.
 */

import { getTribesForCastlist } from './castlistDataAccess.js';
import { loadPlayerData } from './storage.js';
import {
  reorderTribes,
  determineDisplayScenario,
  createNavigationState,
  buildCastlist2ResponseData
} from './castlistV2.js';

/**
 * Parse castlist navigation custom_id into structured context
 * Position-based parsing handles variable-length castlistIds with underscores
 *
 * @param {string} customId - Full custom_id (e.g. castlist2_nav_next_tribe_0_0_default_view)
 * @returns {Object} { action, currentTribeIndex, currentTribePage, castlistId, displayMode }
 */
export function parseCastlistNavigation(customId) {
  const withoutPrefix = customId.substring('castlist2_nav_'.length);
  const parts = withoutPrefix.split('_');

  if (parts.length < 5) {
    throw new Error('Invalid navigation custom_id format - needs at least 5 parts');
  }

  // Position-based parsing:
  // parts[0-1]: action (always 2 words: next_page, last_tribe, etc.)
  // parts[2]: tribeIndex
  // parts[3]: tribePage
  // parts[4 to length-2]: castlistId (may have underscores!)
  // parts[length-1]: displayMode
  return {
    action: `${parts[0]}_${parts[1]}`,
    currentTribeIndex: parseInt(parts[2]),
    currentTribePage: parseInt(parts[3]),
    castlistId: parts.slice(4, parts.length - 1).join('_'),
    displayMode: parts[parts.length - 1] || 'view'
  };
}

/**
 * Handle castlist navigation (next/prev tribe, next/prev page)
 * Returns response data for the factory to send via updateDeferredResponse
 *
 * @param {Object} context - ButtonHandlerFactory context
 * @param {Object} navContext - Parsed navigation from parseCastlistNavigation()
 * @param {Function} buildNoTribesContainer - Shared no-tribes UI builder
 * @returns {Object} Components V2 response data
 */
export async function handleCastlistNavigation(context, navContext, buildNoTribesContainer) {
  const { guildId, userId, member, client } = context;
  const { action, currentTribeIndex, currentTribePage, castlistId, displayMode } = navContext;
  const guild = await client.guilds.fetch(guildId);

  // Load tribes via unified data access
  const validTribes = await getTribesForCastlist(guildId, castlistId, client);

  if (validTribes.length === 0) {
    return { components: [buildNoTribesContainer()] };
  }

  const playerData = await loadPlayerData();
  const orderedTribes = reorderTribes(validTribes, userId, 'user-first', castlistId);
  const scenario = determineDisplayScenario(orderedTribes);

  // Calculate new navigation position
  let newTribeIndex = currentTribeIndex;
  let newTribePage = currentTribePage;

  switch (action) {
    case 'next_page':
      newTribePage++;
      break;
    case 'last_page':
      newTribePage--;
      break;
    case 'next_tribe':
      newTribeIndex++;
      newTribePage = 0;
      break;
    case 'last_tribe':
      newTribeIndex--;
      newTribePage = 0;
      break;
  }

  // Validate bounds
  if (newTribeIndex < 0 || newTribeIndex >= orderedTribes.length) {
    console.log(`[TRIBES] Invalid tribe index ${newTribeIndex} for ${orderedTribes.length} tribes (server: ${guildId}), resetting to 0`);
    newTribeIndex = 0;
    newTribePage = 0;

    if (orderedTribes.length === 0) {
      throw new Error('No valid tribes found - all roles may have been deleted');
    }
  }

  const navigationState = createNavigationState(orderedTribes, scenario, newTribeIndex, newTribePage, guild, { playerData, guildId });

  // Get castlist display name
  const castlistEntity = playerData[guildId]?.castlistConfigs?.[castlistId];
  const castlistName = castlistEntity?.name || castlistId;

  // Build response using existing display engine
  const responseData = await buildCastlist2ResponseData(
    guild, orderedTribes, castlistId, navigationState,
    member, context.channelId, null, // permissionChecker null — nav always updates existing message
    displayMode, castlistName, { playerData, guildId }
  );

  console.log(`Successfully navigated to tribe ${newTribeIndex + 1}, page ${newTribePage + 1} in ${displayMode} mode`);

  return responseData;
}

/**
 * Parse show_castlist2 custom_id into castlist ID and display mode
 * Handles _edit suffix and virtual ID decoding
 *
 * @param {string} customId - Full custom_id (e.g. show_castlist2_default, show_castlist2_castlist_123_system_edit)
 * @returns {Object} { castlistId, displayMode }
 */
export async function parseShowCastlist(customId) {
  const displayMode = customId.endsWith('_edit') ? 'edit' : 'view';

  let castlistId;
  if (displayMode === 'edit') {
    const withoutEdit = customId.slice(0, -5); // Remove '_edit'
    castlistId = withoutEdit.replace('show_castlist2_', '') || 'default';
  } else {
    castlistId = customId.replace('show_castlist2_', '') || 'default';
  }

  // Decode virtual castlist ID if needed
  const { castlistVirtualAdapter } = await import('./castlistVirtualAdapter.js');
  castlistId = castlistVirtualAdapter.decodeVirtualId(castlistId);

  return { castlistId, displayMode };
}

/**
 * Display a castlist (initial render from button click or slash command)
 * Returns response data — the factory sends it via updateDeferredResponse
 *
 * @param {Object} context - ButtonHandlerFactory context
 * @param {string} castlistId - Resolved castlist ID
 * @param {string} displayMode - 'view' or 'edit'
 * @param {Function} buildNoTribesContainer - Shared no-tribes UI builder
 * @param {Function} canSendMessagesInChannel - Permission checker from app.js
 * @returns {Object} Components V2 response data
 */
export async function displayCastlist(context, castlistId, displayMode, buildNoTribesContainer, canSendMessagesInChannel) {
  const { guildId, userId, member, client } = context;
  const channelId = context.channelId;

  console.log('Processing show_castlist2 for:', castlistId, 'in mode:', displayMode);

  const guild = await client.guilds.fetch(guildId);

  // Load tribes via unified data access
  const allTribes = await getTribesForCastlist(guildId, castlistId, client);

  if (allTribes.length === 0) {
    return { components: [buildNoTribesContainer()] };
  }

  const playerData = await loadPlayerData();

  // Reorder tribes — user-first for default castlist only
  const orderingStrategy = castlistId === 'default' ? 'user-first' : 'default';
  const tribes = reorderTribes(allTribes, userId, orderingStrategy, castlistId);

  const scenario = determineDisplayScenario(tribes);
  const navigationState = createNavigationState(tribes, scenario, 0, 0, guild, { playerData, guildId });

  // Permission checker for ephemeral flag (if user can't post in channel)
  const memberObj = member ? await guild.members.fetch(userId) : null;
  const permissionChecker = (memberObj && channelId && canSendMessagesInChannel)
    ? async (m, c) => await canSendMessagesInChannel(m, c, client)
    : null;

  // Get castlist display name
  const castlistEntity = playerData[guildId]?.castlistConfigs?.[castlistId];
  const castlistName = castlistEntity?.name || castlistId;

  const responseData = await buildCastlist2ResponseData(
    guild, tribes, castlistId, navigationState,
    memberObj, channelId, permissionChecker,
    displayMode, castlistName, { playerData, guildId }
  );

  console.log('[CASTLIST] Sent castlist via webhook follow-up');
  return responseData;
}
