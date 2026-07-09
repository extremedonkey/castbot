/**
 * Casting Manager
 * 
 * Centralized UI generation for the Casting system.
 * This module eliminates code duplication across 8+ handlers in app.js.
 * 
 * PHASE 2: Option A - Dedicated Module
 * - ✅ Core season_app_ranking handler migration COMPLETE
 * - ⏳ Migrate ranking navigation handlers (prev/next)
 * - ⏳ Migrate rank button handlers (1-5 stars)
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { loadPlayerData } from './storage.js';

// Shared Casting header — used by both the populated view and the empty state (no duplication)
// Casting header is now the SHARED seasonManagerHeader('ranking', …) from seasonSelector.js
// (imported alongside buildSeasonNavRow at each render site) so all tabs stay in lockstep.

/**
 * Empty-state Casting screen (season has no applications yet). Reuses the shared header +
 * the active-tab nav row so it's identical chrome to the populated view (Ranking tab shaded blue).
 * @param {string} seasonName
 * @param {string} configId
 */
export async function buildRankingEmptyState(seasonName, configId) {
  const { buildSeasonNavRow, seasonManagerHeader, buildSeasonBottomRow } = await import('./seasonSelector.js');
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2 (factory adds ephemeral / strips for updateMessage)
    components: [{
      type: 17,
      components: [
        seasonManagerHeader('ranking', seasonName),
        buildSeasonNavRow(configId, 'ranking'),
        { type: 14 },
        { type: 10, content: `📭 **No applications yet** for this season.\n-# Applicants appear here once they apply via this season's application button.` },
        { type: 14 },
        buildSeasonBottomRow(configId, 'ranking')
      ]
    }]
  };
}

/**
 * Build the full Season Casting view response (first applicant card, or the empty state when a
 * season has no applications). Shared by the Ranking tab handler AND the Edit-modal context-aware
 * refresh so both render identically. Returns Components V2 response data ({ flags, components }) —
 * the caller sends it (factory return for buttons, or res.send UPDATE_MESSAGE for modal submits).
 * Permission is enforced by the CALLER (both entry points are already gated).
 * @param {Object} p
 * @param {string} p.guildId
 * @param {string} p.userId - admin viewing the ranking
 * @param {string} p.configId
 * @param {Object} p.client - Discord client (for guild/member fetch)
 * @param {Object} [p.guild] - pre-fetched guild (optional)
 * @param {Object} [p.playerData] - pre-loaded player data (optional)
 */
export async function buildSeasonRankingResponse({ guildId, userId, configId, client, guild, playerData }) {
  const { loadPlayerData, getApplicationsForSeason } = await import('./storage.js');
  playerData = playerData || await loadPlayerData();
  guild = guild || await client.guilds.fetch(guildId);

  const seasonConfig = playerData[guildId]?.applicationConfigs?.[configId];
  const seasonName = seasonConfig?.seasonName || 'Unknown Season';
  const allApplications = await getApplicationsForSeason(guildId, configId);

  if (allApplications.length === 0) {
    return await buildRankingEmptyState(seasonName, configId);
  }

  const currentApp = allApplications[0];
  const appIndex = 0;
  let applicantMember;
  try {
    applicantMember = await guild.members.fetch(currentApp.userId);
  } catch (error) {
    // Fallback: minimal object sufficient for avatar URL generation
    applicantMember = {
      displayName: currentApp.displayName,
      user: { username: currentApp.username },
      displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`
    };
  }

  return await generateSeasonAppRankingUI({
    guildId, userId, configId, allApplications, currentApp, appIndex, applicantMember, guild, seasonName, playerData
  });
}

/**
 * Generate complete Casting UI for a specific applicant
 * 
 * MINIMAL TEST APPROACH: Start with just the main season_app_ranking handler UI generation.
 * Keep existing helper functions in app.js for now - we can extract them later if this works.
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.userId - Current user ID
 * @param {string} params.configId - Configuration ID
 * @param {Array} params.allApplications - All season applications
 * @param {Object} params.currentApp - Current applicant data
 * @param {number} params.appIndex - Current applicant index
 * @param {Object} params.applicantMember - Discord member object for applicant
 * @param {Object} params.guild - Discord guild object
 * @param {string} params.seasonName - Season name
 * @param {Object} params.playerData - Pre-loaded player data
 * @returns {Object} Complete UI response object
 */

/**
 * Collapse the six independent application-status dimensions into ONE salient
 * status for the Casting card's "Status:" line AND the jump-select option icons
 * (the select calls this per option, so the line and the select can never
 * disagree). Priority: withdrawn → placementResponse → castingStatus → votes,
 * with the ✖️ Withdrawn lifecycle override (the only dimension siloed in the
 * channel name) and human-readable names.
 *
 * @param {Object} app - application record (playerData[guildId].applications[channelId])
 * @param {string} [liveChannelName] - the channel's CURRENT name (carries the ✖️ withdrawn marker)
 * @returns {{icon: string, name: string}}
 */
export function deriveApplicationStatus(app = {}, liveChannelName = '') {
  const castingStatus = app.castingStatus;
  const placementResponse = app.placementResponse;
  const voteCount = Object.keys(app.rankings || {}).length;

  // Withdrawn (✖️) is the latest lifecycle action — overrides any casting state.
  if (/^✖️/.test(liveChannelName)) return { icon: '✖️', name: 'Withdrawn' };

  if (placementResponse === 'accepted') return { icon: '🎉', name: 'Accepted Placement' };
  if (placementResponse === 'declined') return { icon: '🚫', name: 'Declined Placement' };
  if (castingStatus === 'cast')        return { icon: '✅', name: 'Cast' };
  if (castingStatus === 'alternative') return { icon: '🔄', name: 'Alternate' };
  if (castingStatus === 'tentative')   return { icon: '❓', name: 'Tentatively Cast' };
  if (castingStatus === 'reject')      return { icon: '❌', name: 'Not Cast' };
  if (voteCount >= 2)                  return { icon: '☑️', name: 'Reviewed' };
  if (voteCount >= 1)                  return { icon: '🗳️', name: `Scoring (${voteCount} vote${voteCount === 1 ? '' : 's'})` };
  return { icon: '📝', name: 'Awaiting Votes' };
}

/** Marooning's status-section order — also the jump-select's display order. */
const CASTING_GROUP_ORDER = ['cast', 'alternative', 'tentative', 'reject', 'undecided'];

/**
 * Single source of truth for "casting order": group applicants by castingStatus
 * (cast → alternative → tentative → reject → undecided), then sort each group by
 * average score descending (stable — ties keep insertion order). Shared by the
 * Marooning tab (buildMarooningView) and the Casting card's jump-select so the two
 * views can never disagree.
 *
 * Entries carry BOTH `name` (Marooning's displayName||username fallback) and the raw
 * `app` (the select uses displayName||'Unknown' / username||'unknown') — the two
 * consumers' fallback strings intentionally differ; do not unify.
 *
 * An unrecognized castingStatus is normalized to 'undecided' so no applicant can
 * vanish from every group (and become unreachable in the jump-select).
 *
 * @param {Array} allApplications - insertion-ordered season applications
 * @param {Object} playerData - pre-loaded player data
 * @param {string} guildId - guild ID
 * @returns {{groups: Object<string, Array>, ordered: Array}} groups keyed by status; ordered = groups concatenated in display order. Entry shape: { app, insertionIndex, userId, name, avgScore, voteCount, castingStatus, placementResponse, hasNotes }
 */
export function computeCastingOrder(allApplications, playerData, guildId) {
  const entries = allApplications.map((app, insertionIndex) => {
    const rec = playerData[guildId]?.applications?.[app.channelId] || {};
    const scores = Object.values(rec.rankings || {}).filter(r => r !== undefined);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const rawStatus = rec.castingStatus || 'undecided';
    return {
      app,
      insertionIndex,
      userId: app.userId,
      name: app.displayName || app.username,
      avgScore,
      voteCount: scores.length,
      castingStatus: CASTING_GROUP_ORDER.includes(rawStatus) ? rawStatus : 'undecided',
      placementResponse: rec.placementResponse,
      hasNotes: !!rec.playerNotes
    };
  });

  const groups = {};
  for (const status of CASTING_GROUP_ORDER) {
    groups[status] = entries.filter(e => e.castingStatus === status);
    groups[status].sort((a, b) => b.avgScore - a.avgScore);
  }

  return { groups, ordered: CASTING_GROUP_ORDER.flatMap(status => groups[status]) };
}

export async function generateSeasonAppRankingUI({
  guildId,
  userId,
  configId,
  allApplications,
  currentApp,
  appIndex,
  applicantMember,
  guild,
  seasonName,
  playerData,
  ephemeral = false
}) {
  // Get applicant's current avatar URL (prefer guild avatar, fallback to global avatar, then default)
  const applicantAvatarURL = applicantMember.displayAvatarURL({ size: 512 });
  
  // Pre-fetch avatar to warm up Discord CDN cache
  try {
    console.log('🔍 DEBUG: generateSeasonAppRankingUI - Pre-fetching applicant avatar to warm CDN cache...');
    const prefetchStart = Date.now();
    await fetch(applicantAvatarURL, { method: 'HEAD' });
    const prefetchTime = Date.now() - prefetchStart;
    console.log(`🔍 DEBUG: generateSeasonAppRankingUI - Applicant avatar pre-fetch completed in ${prefetchTime}ms`);
  } catch (error) {
    console.log('🔍 DEBUG: generateSeasonAppRankingUI - Applicant avatar pre-fetch failed (non-critical):', error.message);
  }
  
  // Applicant identity now lives in the 📃 header (Name | age | @pronoun | @timezone). Below the action row:
  // DNC summary (if any) → Player Notes → avatar. The lifecycle chevron sits in the 🎭 Casting Status section.
  // The avatar is a full-size Media Gallery using applicantAvatarURL (pre-fetched above).

  // Create ranking buttons (1-5)
  const ephemeralSuffix = ephemeral ? '_ephemeral' : '';
  const rankingButtons = [];
  const userRanking = playerData[guildId]?.applications?.[currentApp.channelId]?.rankings?.[userId];
  
  for (let i = 1; i <= 5; i++) {
    const isSelected = userRanking === i;
    rankingButtons.push(
      new ButtonBuilder()
        .setCustomId(`rank_${i}_${currentApp.channelId}_${appIndex}_${configId}${ephemeralSuffix}`)
        .setLabel(i.toString())
        .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isSelected)
    );
  }
  
  const rankingRow = new ActionRowBuilder().addComponents(rankingButtons);
  
  // NOTE: the old ◀ Previous / Next ▶ row was removed — the always-on jump-select below provides
  // full navigation (any applicant + paging), and dropping it keeps the card under Discord's hard
  // 40-component limit now that the card carries the identity Section + casting workflow row.

  // Per-admin scores for this applicant — used by the Votes breakdown below.
  const allRankings = playerData[guildId]?.applications?.[currentApp.channelId]?.rankings || {};

  // Casting status — drives the coloured casting buttons + select icons (no longer a text line).
  const castingStatus = playerData[guildId]?.applications?.[currentApp.channelId]?.castingStatus;
  // (placementResponse is no longer shown on the card as a line — the chevron surfaces it via getCastingChevron.)

  // ⭐ Votes button label — the full tally moved off the card into an ephemeral popup (buildCastingVotesDisplay,
  // opened by the casting_votes_* button). Only the average is shown here. Trailing ".0" is stripped (5.0 → 5).
  const _voteVals = Object.values(allRankings).filter(r => r !== undefined);
  let avgVotesLabel = 'No Votes';
  if (_voteVals.length > 0) {
    let _avg = (_voteVals.reduce((a, b) => a + b, 0) / _voteVals.length).toFixed(1);
    if (_avg.endsWith('.0')) _avg = _avg.slice(0, -2);
    avgVotesLabel = `${_avg}/5`; // ⭐ emoji renders before it → "⭐ 5/5" (compact for phone)
  }
  
  // (Applicant identity — name / pronouns / age / timezone / local time — is now rendered by the
  //  shared player-card Section built below, so the old inline demographic + name computation was
  //  removed. createPlayerDisplaySection derives all of it from the guild member + playerData.)

  // Build DNC warnings and summary for this applicant. The summary is only shown when the applicant
  // actually has DNC entries — no "No DNC list provided" placeholder clutter on the card.
  const { findDncConflicts, buildDncWarnings, buildDncSummary, getDncEntries } = await import('./dncManager.js');
  const appData = playerData[guildId]?.applications?.[currentApp.channelId] || {};
  const dncConflicts = findDncConflicts(appData, allApplications, playerData, guildId);
  const dncWarningText = buildDncWarnings(dncConflicts);
  const dncSummaryText = getDncEntries(appData).length > 0 ? buildDncSummary(appData) : '';

  // ===== Build the Casting card (Components V2) =====
  // Layout: 📃 header → tab nav → jump-select → actions (⭐ Avg Votes/View App/Notes/Delete) → DNC summary
  //         → Player Notes → avatar → Rate (1-5) → 🎭 Casting Status (chevron + select) → utility → bottom nav.
  // The vote tally moved to the ⭐ Avg Votes ephemeral popup (buildCastingVotesDisplay).

  const { buildSeasonNavRow, seasonManagerHeader, buildSeasonBottomRow } = await import('./seasonSelector.js');
  const containerComponents = [
    seasonManagerHeader('ranking', seasonName),
    // Active-tab nav row — Apps · Planner · Casting · Marooning (current view = Casting, shaded blue)
    buildSeasonNavRow(configId, 'ranking'),
  ];

  // Applicant jump-select — ALWAYS rendered (state-aware placeholder). Discord requires ≥1 option,
  // so it's only ever absent on the 0-applicant empty state (a separate screen). It also replaces
  // the old ◀/▶ prev/next row for navigation. Built here but PUSHED later (directly ABOVE the
  // 📃 Application header) — the placeholder already shows "Applicant N of M", so the info block drops it.
  let jumpSelectRow = null;
  {
    // Display order = Marooning order (status groups → score desc) via computeCastingOrder.
    // Option VALUES stay insertion-order indices into allApplications — every downstream
    // handler resolves `allApplications[appIndex]`, and stale selects keep pointing at the
    // same person even after scores re-sort the display. Only presentation is sorted.
    const { ordered } = computeCastingOrder(allApplications, playerData, guildId);
    let sortedPos = ordered.findIndex(e => e.insertionIndex === appIndex);
    if (sortedPos === -1) sortedPos = 0; // defensive — callers validated currentApp

    const itemsPerPage = 23;
    const totalPages = Math.ceil(ordered.length / itemsPerPage);
    const currentPage = Math.floor(sortedPos / itemsPerPage);
    const startIdx = currentPage * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, ordered.length);

    const options = [];

    if (currentPage > 0) {
      const prevStart = (currentPage - 1) * itemsPerPage + 1;
      const prevEnd = currentPage * itemsPerPage;
      options.push({
        label: `◀ Show Applications ${prevStart}-${prevEnd}`,
        value: `page_${currentPage - 1}`,
        description: `View previous set of applications`,
        emoji: { name: '📄' }
      });
    }

    for (let i = startIdx; i < endIdx; i++) {
      const entry = ordered[i];
      const app = entry.app;
      // Icon = the Status engine's, literally — same {icon} the card's Status: line shows.
      const rec = playerData[guildId]?.applications?.[app.channelId] || {};
      const liveName = guild?.channels?.cache?.get(app.channelId)?.name || '';
      const icon = deriveApplicationStatus(rec, liveName).icon;

      const position = i + 1; // sorted position — continuous across pages, matches placeholder
      const displayName = app.displayName || 'Unknown';
      const username = app.username || 'unknown';
      const scoreText = entry.avgScore > 0 ? `${entry.avgScore.toFixed(1)}/5.0` : 'Unrated';
      const voteText = entry.voteCount === 1 ? '1 vote' : `${entry.voteCount} votes`;
      const notesIndicator = entry.hasNotes ? ' 💬' : '';

      let label = `${icon} ${position}. ${displayName} (${username}) - ${scoreText} (${voteText})${notesIndicator}`;
      if (label.length > 100) {
        const fixedParts = `${icon} ${position}. ${displayName} () - ${scoreText} (${voteText})${notesIndicator}`;
        const availableSpace = 100 - fixedParts.length;
        if (availableSpace > 0) {
          const truncatedUsername = username.length > availableSpace ?
            username.substring(0, availableSpace - 1) + '…' : username;
          label = `${icon} ${position}. ${displayName} (${truncatedUsername}) - ${scoreText} (${voteText})${notesIndicator}`;
        } else {
          label = label.substring(0, 97) + '...';
        }
      }

      options.push({ label, value: entry.insertionIndex.toString(), description: `Jump to ${displayName}'s application` });
    }

    if (endIdx < ordered.length) {
      const nextStart = endIdx + 1;
      const nextEnd = Math.min(endIdx + itemsPerPage, ordered.length);
      options.push({
        label: `▶ Show Applications ${nextStart}-${nextEnd}`,
        value: `page_${currentPage + 1}`,
        description: `View next set of applications`,
        emoji: { name: '📄' }
      });
    }

    // Placeholder doubles as the position indicator (the "Applicant N of M" text was removed above).
    // N = SORTED position, so it agrees with the option numbering right below it.
    // Name = the applicant's per-server display name (nickname), falling back to global/username.
    const placeholderName = applicantMember?.displayName || currentApp.displayName || currentApp.username || 'Applicant';
    let selectPlaceholder = `Applicant ${sortedPos + 1} of ${ordered.length} - ${placeholderName}`;
    if (totalPages > 1) selectPlaceholder += ` · page ${currentPage + 1}/${totalPages}`;

    jumpSelectRow = {
      type: 1,
      components: [{
        type: 3,
        custom_id: `ranking_select_${appIndex}_${configId}_${currentPage}`,
        placeholder: selectPlaceholder,
        options,
        min_values: 1,
        max_values: 1
      }]
    };
  }

  // ÜberStatus (the unified Status Engine) is now the single status line in the info block. The old
  // per-dimension lines (Your Score, Casting Status, derived Status:) were removed as redundant — the
  // score is shown in the Votes section, and casting/derived status collapse into ÜberStatus.
  const appRecord = playerData[guildId]?.applications?.[currentApp.channelId] || {};
  const liveChannelName = guild?.channels?.cache?.get(currentApp.channelId)?.name || '';

  // ---- Applicant demographics — age + pronoun/timezone role IDs feed the 📃 header below. ----
  const applicantAge = playerData[guildId]?.players?.[currentApp.userId]?.age;
  let pronounRoleId = null, timezoneRoleId = null;
  if (applicantMember?.roles) {
    const guildPronouns = playerData[guildId]?.pronounRoleIDs || [];
    const guildTimezones = Object.keys(playerData[guildId]?.timezones || {});
    const memberRoles = applicantMember.roles.cache ? Array.from(applicantMember.roles.cache.keys()) : applicantMember.roles;
    for (const roleId of memberRoles) { if (guildPronouns.includes(roleId)) { pronounRoleId = roleId; break; } }
    for (const roleId of memberRoles) { if (guildTimezones.includes(roleId)) { timezoneRoleId = roleId; break; } }
  }

  // ▶ Casting Status block — the Casting Lifecycle Chevron (RaP 0902) under a Rate-styled "Casting Status"
  // header. The old info block (Name / Average Score / App) was DELETED as redundant: Name/age/pronoun/tz now
  // live in the 📃 header, and Average Score in the Votes section. DNC summary (if any) is kept beneath it.
  const { getCastingChevron } = await import('./playerStatus.js');
  const chevron = getCastingChevron(appRecord, liveChannelName); // rendered below, INSIDE the 🎭 Casting Status section
  // Player Notes + applicant display name render above the avatar (moved up) — compute them here.
  const applicantDisplayName = applicantMember?.displayName || currentApp.displayName || currentApp.username || 'Applicant';
  const notesText = appRecord.playerNotes || 'Record casting notes, connections or potential issues...';

  // 📃 header is just "{Name}'s App". The demographics moved into a "👤 Player Overview" block (below the
  // action row) as bullets: "{age} | @{pronoun} | @{timezone}" + the DNC summary (only if they have any).
  // Role NAMES are injected as plain text (a code-block header can't render <@&role> pills).
  const headerName = applicantMember?.displayName || currentApp.displayName || currentApp.username || 'Applicant';
  const roleNameOf = (id) => id ? (guild?.roles?.cache?.get(id)?.name || applicantMember?.roles?.cache?.get(id)?.name || null) : null;
  const appHeaderContent = `# \`\`\`📃 ${headerName}'s App\`\`\``;
  const _pronounName = roleNameOf(pronounRoleId);
  const _timezoneName = roleNameOf(timezoneRoleId);
  const overviewBits = [];
  if (applicantAge) overviewBits.push(`${applicantAge}`);
  if (_pronounName) overviewBits.push(`@${_pronounName}`);
  if (_timezoneName) overviewBits.push(`@${_timezoneName}`);
  const _username = applicantMember?.user?.username || currentApp.username || 'unknown';
  let playerOverview = `> **👤 Overview**\n* ${headerName} (${_username})`; // display name (username)
  if (overviewBits.length) playerOverview += `\n* ${overviewBits.join(' | ')}`;
  if (dncSummaryText) playerOverview += `\n* ${dncSummaryText}`;

  containerComponents.push(
    { type: 14 }, // divider after the nav / select cluster
    ...(jumpSelectRow ? [jumpSelectRow] : []), // jump-select ("Applicant N of M") — above the 📃 Application header
    { type: 10, content: appHeaderContent },
    {
      type: 1, // Applicant actions — ⭐ Avg Votes (blue) + App (link) + Notes. Delete moved to the utility row.
      components: [
        // ⭐ Avg Votes (blue) — opens the vote tally as a private/ephemeral popup (keeps scores secret).
        { type: 2, style: 1, custom_id: `casting_votes_${currentApp.channelId}_${appIndex}_${configId}`, label: avgVotesLabel, emoji: { name: '⭐' } },
        { type: 2, style: 5, label: 'App', emoji: { name: '📄' }, url: `https://discord.com/channels/${guildId}/${currentApp.channelId}` },
        new ButtonBuilder()
          .setCustomId(`edit_player_notes_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('Notes')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Secondary)
          .toJSON()
      ]
    },
    { type: 10, content: playerOverview }, // 👤 Player Overview — demographics + DNC (moved out of the header)
    { type: 10, content: `> **✏️ Player Notes**\n${notesText}` }, // moved to directly above the avatar
    {
      type: 12, // Media Gallery — full-size applicant avatar
      items: [{ media: { url: applicantAvatarURL }, description: `Avatar of ${currentApp.displayName || currentApp.username}` }]
    },
    { type: 10, content: `> **⭐ Vote on this applicant**` }, // header directly above the ratings
    rankingRow.toJSON() // 1-5 rating buttons — moved underneath the avatar
  );

  // DNC conflict warning — prominent, only when this applicant cross-lists someone.
  if (dncWarningText) {
    containerComponents.push({ type: 10, content: dncWarningText });
  }

  // "Still Deciding" (value 'undecided') is the casting default when no status is set, and selecting it CLEARS
  // any existing castingStatus (see handleCastingStatus) — undecided is never stored, it's simply the absence
  // of castingStatus. (applicantDisplayName + notesText are computed up top, near the chevron.)
  const isUndecided = !['cast', 'tentative', 'reject', 'alternative'].includes(castingStatus);

  // ---- Casting: header + chevron + status (string select) ----
  containerComponents.push(
    {
      type: 10,
      content: `> **🎭 Casting Decision**`
    },
    {
      type: 1, // Casting status — string select
      components: [{
        type: 3,
        custom_id: `casting_status_${currentApp.channelId}_${appIndex}_${configId}`,
        placeholder: '🎭 Casting status',
        min_values: 1,
        max_values: 1,
        options: [
          { label: 'Still Deciding', value: 'undecided', emoji: { name: '❔' }, default: isUndecided },
          { label: `Cast ${applicantDisplayName}`, value: 'cast', emoji: { name: '🎬' }, default: castingStatus === 'cast' },
          { label: `Don't Cast ${applicantDisplayName}`, value: 'reject', emoji: { name: '🗑️' }, default: castingStatus === 'reject' },
          { label: `Tentatively Cast ${applicantDisplayName}`, value: 'tentative', emoji: { name: '❓' }, default: castingStatus === 'tentative' },
          { label: `Alternative — ${applicantDisplayName}`, value: 'alternative', emoji: { name: '🔄' }, default: castingStatus === 'alternative' }
        ]
      }]
    },
    // Casting Lifecycle Chevron (RaP 0902) — BELOW the Casting Decision select (subtext `-#` line).
    ...(chevron ? [{ type: 10, content: chevron }] : [])
  );

  // (Votes tally moved off the card into the ⭐ Avg Votes button popup; Player Notes moved above the avatar.)

  // ---- Utility actions (divider above) ----
  containerComponents.push({ type: 14 }); // divider above Shared Ranker / utility row
  containerComponents.push({
    type: 1,
    components: [
      new ButtonBuilder()
        .setCustomId(`ranking_public_warn_${appIndex}_${configId}`)
        .setLabel('📢 Shared Ranker')
        .setStyle(ButtonStyle.Secondary)
        .toJSON(),
      new ButtonBuilder()
        .setCustomId(`dnc_overview_${configId}`)
        .setLabel('DNC')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚷')
        .toJSON(),
      // 🗑️ Delete — moved here from the top action row, to the right of DNC.
      new ButtonBuilder()
        .setCustomId(`delete_application_mode_${currentApp.channelId}_${appIndex}_${configId}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .toJSON()
      // ✒️ Invites moved to the Marooning tab (season-level bulk sends) — see buildMarooningView.
    ]
  });

  // Shared Season Manager bottom row — [← Seasons] [✏️ Edit] (Marooning is now a nav tab, not here)
  containerComponents.push(buildSeasonBottomRow(configId, 'ranking'));

  // Create main container
  const castRankingContainer = {
    type: 17, // Container
    components: containerComponents
  };

  // Count components for debugging (must wrap in array to count Container itself!)
  const { countComponents } = await import('./utils.js');
  countComponents([castRankingContainer], {
    enableLogging: true,
    label: `Season App Ranking UI - ${seasonName}`
  });

  return {
    flags: ephemeral ? ((1 << 15) | (1 << 6)) : (1 << 15), // IS_COMPONENTS_V2 + EPHEMERAL if personal
    components: [castRankingContainer]
  };
}

/**
 * Rebuild the Casting screen at a given applicant index. Reused by Public Ranking
 * (cancel/confirm) so the dense per-applicant setup lives in one place.
 * @returns the generateSeasonAppRankingUI response, or null if the season has no applications.
 */
export async function buildRankingScreen({ guildId, userId, configId, appIndex = 0, guild }) {
  const { getApplicationsForSeason, loadPlayerData } = await import('./storage.js');
  const playerData = await loadPlayerData();
  const allApplications = await getApplicationsForSeason(guildId, configId);
  if (!allApplications || allApplications.length === 0) return null;

  const idx = Math.max(0, Math.min(appIndex || 0, allApplications.length - 1));
  const currentApp = allApplications[idx];

  let applicantMember;
  try {
    applicantMember = await guild.members.fetch(currentApp.userId);
  } catch {
    applicantMember = {
      displayName: currentApp.displayName,
      user: { username: currentApp.username },
      displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/0.png`
    };
  }

  const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || 'Unknown Season';
  return generateSeasonAppRankingUI({
    guildId, userId, configId, allApplications, currentApp, appIndex: idx,
    applicantMember, guild, seasonName, playerData
  });
}

/**
 * Set an applicant's casting status and re-render the Casting card. Shared by the casting status
 * string-select handler and the legacy cast_* button handler so the load/save/regenerate lives in
 * one place (keeps app.js a router).
 * @param {Object} p
 * @param {string} p.customId - casting_status_{channelId}_{appIndex}_{configId}
 * @param {string} p.value - 'cast' | 'tentative' | 'reject'
 * @param {string} p.guildId
 * @param {string} p.userId
 * @param {Object} p.guild - pre-fetched Discord guild
 * @returns the generateSeasonAppRankingUI response, or an error payload.
 */
export async function handleCastingStatus({ customId, value, channelId, appIndex, configId, guildId, userId, guild }) {
  // Accept either the select's custom_id (casting_status_{channelId}_{appIndex}_{configId}) or
  // explicit channelId/appIndex/configId (used by the legacy cast_* button handler).
  if (customId) {
    const m = customId.match(/^casting_status_(\d+)_(\d+)_(.+)$/);
    if (!m) return { content: '❌ Invalid casting status select.', ephemeral: true };
    channelId = m[1];
    appIndex = parseInt(m[2]);
    configId = m[3];
  }
  if (!channelId || appIndex == null || Number.isNaN(appIndex) || !configId) {
    return { content: '❌ Invalid casting status request.', ephemeral: true };
  }

  const { loadPlayerData, savePlayerData, getApplicationsForSeason } = await import('./storage.js');
  const playerData = await loadPlayerData();
  if (!playerData[guildId]?.applications?.[channelId]) {
    return { content: '❌ Application not found.', ephemeral: true };
  }
  // "undecided" is never stored — clearing castingStatus IS undecided (backwards compatible with
  // existing data, where absence of castingStatus already meant undecided).
  if (value === 'undecided') {
    delete playerData[guildId].applications[channelId].castingStatus;
  } else {
    playerData[guildId].applications[channelId].castingStatus = value;
  }
  await savePlayerData(playerData);

  const allApplications = await getApplicationsForSeason(guildId, configId);
  const currentApp = allApplications[appIndex];
  if (!currentApp) return { content: '❌ Application not found.', ephemeral: true };

  let applicantMember;
  try {
    applicantMember = await guild.members.fetch(currentApp.userId);
  } catch {
    applicantMember = {
      displayName: currentApp.displayName,
      user: { username: currentApp.username },
      displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/0.png`,
      roles: []
    };
  }
  const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || 'Current Season';
  console.log(`✅ handleCastingStatus - ${value} for ${currentApp.displayName}`);
  return generateSeasonAppRankingUI({
    guildId, userId, configId, allApplications, currentApp, appIndex, applicantMember, guild, seasonName, playerData
  });
}

// ============================================================================
// CASTING INVITES — author message templates + send outcome messages to applicants
// (Invites button → modal → confirm → send). See RaP 0906.
// ============================================================================

/** Which casting status receives which message template (Tentative/undecided → none). */
export const CASTING_STATUS_TO_MESSAGE = { cast: 'successful', alternative: 'alternative', reject: 'unsuccessful' };

/** Accent colours per message type for the V2 invite card. */
const INVITE_ACCENT = { successful: 0x27ae60, alternative: 0xf1c40f, unsuccessful: 0xe74c3c };

/** Default starter templates, pre-filled when a guild has none saved yet. `@Player` → applicant mention. */
export const DEFAULT_CASTING_MESSAGES = {
  successful: `@Player Congratulations! You've been selected for a spot in the cast!\n\nTo accept this offer, please confirm your preferred name, age, pronouns, and timezone.\n\nIf you'd like a photo other than your profile picture for your casting card, send it here — and include a hex code for your name-role colour.\n\nWe can't wait to have you! Please confirm your acceptance and provide this info before the deadline.`,
  alternative: `@Player Thank you for applying! While we couldn't offer you a main cast spot this time, we'd love to offer you an alternate (backup) spot.\n\nIf you're willing to be an alternate, please let us know — we may still be able to bring you into the game!`,
  unsuccessful: `@Player Thank you so much for applying. Unfortunately, we're unable to offer you a spot in the cast this time.\n\nWe really appreciate the effort you put into your application, and we hope you'll apply again for a future season!`
};

/**
 * Read the guild's saved casting message templates, falling back to defaults.
 * `configId` is accepted now (unused) so this can become per-season later without touching callers.
 */
export function getCastingMessages(playerData, guildId, configId) {
  const saved = playerData?.[guildId]?.castingMessages;
  return {
    successful: saved?.successful ?? DEFAULT_CASTING_MESSAGES.successful,
    alternative: saved?.alternative ?? DEFAULT_CASTING_MESSAGES.alternative,
    unsuccessful: saved?.unsuccessful ?? DEFAULT_CASTING_MESSAGES.unsuccessful
  };
}

/** Neutralize mass-ping tokens in host-authored templates (V2 cards can't carry allowed_mentions). */
function sanitizeTemplate(text) {
  return (text || '').replace(/@(everyone|here)/gi, '@​$1');
}

/** Persist the three templates to the guild node (future: per-season under applicationConfigs[configId]). */
export async function saveCastingMessages(guildId, configId, messages, userId, tsMs) {
  const { loadPlayerData, savePlayerData } = await import('./storage.js');
  const playerData = await loadPlayerData();
  if (!playerData[guildId]) playerData[guildId] = {};
  playerData[guildId].castingMessages = {
    successful: sanitizeTemplate(messages.successful),
    alternative: sanitizeTemplate(messages.alternative),
    unsuccessful: sanitizeTemplate(messages.unsuccessful),
    updatedAt: tsMs || 0,
    updatedBy: userId
  };
  await savePlayerData(playerData);
  return playerData[guildId].castingMessages;
}

/** Substitute the @Player token with the applicant's mention. */
export function renderInviteMessage(template, userId) {
  return (template || '').replace(/@Player\b/g, `<@${userId}>`);
}

/**
 * Compute which applicants get which message type for a given send mode.
 * Returns [{ channelId, userId, displayName, messageType }]. Tentative + undecided are always skipped.
 */
export function selectInviteTargets(allApplications, playerData, guildId, mode, appIndex) {
  const statusOf = (app) => playerData?.[guildId]?.applications?.[app.channelId]?.castingStatus;
  const typeFor = (status) => CASTING_STATUS_TO_MESSAGE[status] || null;
  const make = (app, messageType) => ({ channelId: app.channelId, userId: app.userId, displayName: app.displayName || app.username, messageType });

  if (mode === 'selected') {
    const app = allApplications[appIndex];
    if (!app) return [];
    const mt = typeFor(statusOf(app));
    return mt ? [make(app, mt)] : [];
  }
  const wanted = mode === 'all' ? ['successful', 'alternative', 'unsuccessful'] : [mode]; // mode is a message type for the single-type modes
  const targets = [];
  for (const app of allApplications) {
    const mt = typeFor(statusOf(app));
    if (mt && wanted.includes(mt)) targets.push(make(app, mt));
  }
  return targets;
}

/**
 * Build the Casting Invites modal (3 templates + a required "what to do on submit" select).
 * Pre-fills templates from saved guild messages (or defaults).
 */
export function buildCastingInvitesModal(playerData, guildId, appIndex, configId) {
  const msgs = getCastingMessages(playerData, guildId, configId);
  const input = (custom_id, label, description, value) => ({
    type: 18, label, description,
    component: { type: 4, custom_id, style: 2, max_length: 4000, required: false, ...(value ? { value } : {}) }
  });
  return {
    custom_id: `casting_messages_save:${appIndex}:${configId}`,
    title: 'Casting Invites',
    components: [
      input('msg_successful', 'Successful Message (Cast)', 'Sent to 🎬 Cast applicants. Use @Player to tag each player.', msgs.successful),
      input('msg_alternative', 'Alternative / Backup Message', 'Sent to 🔄 Alternative applicants. Use @Player to tag each player.', msgs.alternative),
      input('msg_unsuccessful', "Unsuccessful Message (Don't Cast)", 'Sent to 🗑️ Don\'t Cast applicants. Use @Player to tag each player.', msgs.unsuccessful),
      {
        type: 18,
        label: 'What to do when you submit this?',
        description: 'Tentative & Still Deciding applicants are never messaged.',
        component: {
          type: 3, custom_id: 'invite_mode', required: true, min_values: 1, max_values: 1,
          options: [
            { label: 'Save as draft only', value: 'draft', emoji: { name: '💾' }, description: 'Save the templates, send nothing', default: true },
            { label: 'Send ALL now (Cast + Alternate + Reject)', value: 'all', emoji: { name: '📨' } },
            { label: 'Send Successful only', value: 'successful', emoji: { name: '🎬' } },
            { label: "Send Unsuccessful only", value: 'unsuccessful', emoji: { name: '🗑️' } },
            { label: 'Send Alternative only', value: 'alternative', emoji: { name: '🔄' } },
            { label: 'Send to currently selected applicant only', value: 'selected', emoji: { name: '👤' } }
          ]
        }
      }
    ]
  };
}

/** Build the ephemeral confirmation card shown before a send actually fires. */
export function buildInvitesConfirm({ mode, appIndex, configId, targets }) {
  const counts = targets.reduce((a, t) => { a[t.messageType] = (a[t.messageType] || 0) + 1; return a; }, {});
  const lines = [
    counts.successful ? `🎬 Successful → **${counts.successful}**` : null,
    counts.alternative ? `🔄 Alternative → **${counts.alternative}**` : null,
    counts.unsuccessful ? `🗑️ Unsuccessful → **${counts.unsuccessful}**` : null
  ].filter(Boolean);
  const body = targets.length === 0
    ? `⚠️ No applicants match this option (Tentative & Still Deciding are never messaged). Nothing will be sent.`
    : `You're about to message **${targets.length}** applicant${targets.length !== 1 ? 's' : ''} in their application channels:\n${lines.join('\n')}\n\n-# This pings each applicant and cannot be undone.`;
  const components = [
    { type: 10, content: `## 📨 Send Casting Invites?` },
    { type: 14 },
    { type: 10, content: body }
  ];
  if (targets.length > 0) {
    components.push({
      type: 1,
      components: [
        { type: 2, custom_id: `casting_invites_cancel`, label: 'Cancel', style: 2, emoji: { name: '❌' } },
        { type: 2, custom_id: `casting_invites_confirm:${mode}:${appIndex}:${configId}`, label: 'Confirm Send', style: 3, emoji: { name: '📨' } }
      ]
    });
  }
  return { flags: (1 << 15) | (1 << 6), components: [{ type: 17, accent_color: 0xf39c12, components }] };
}

/**
 * Send casting invite messages to the targeted applicants' channels (throttled, V2 cards).
 * Returns { sent, failed, skippedEmpty, perType }.
 */
export async function sendCastingInvites({ client, guildId, configId, mode, appIndex, messages }) {
  const { loadPlayerData, savePlayerData, getApplicationsForSeason } = await import('./storage.js');
  const { DiscordRequest } = await import('./utils.js');
  const playerData = await loadPlayerData();
  const allApplications = await getApplicationsForSeason(guildId, configId);
  const targets = selectInviteTargets(allApplications, playerData, guildId, mode, appIndex);

  // Stage 2 (RaP 0902): a SENT invite stamps offerStatus on the application (drives the Casting chevron).
  const OFFER_FOR_TYPE = { successful: 'offer', alternative: 'offer_alternative', unsuccessful: 'offer_rejected' };
  const nowIso = new Date().toISOString();
  let stampedAny = false;

  const result = { sent: 0, failed: 0, skippedEmpty: 0, perType: { successful: 0, alternative: 0, unsuccessful: 0 } };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const template = messages[t.messageType];
    if (!template || !template.trim()) { result.skippedEmpty++; continue; }
    const content = renderInviteMessage(sanitizeTemplate(template), t.userId);
    // Cast & Alternative offers carry Accept/Decline buttons for the applicant. Unsuccessful does not.
    const cardComponents = [{ type: 10, content }];
    if (t.messageType === 'successful' || t.messageType === 'alternative') {
      cardComponents.push({
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Accept Placement', emoji: { name: '✅' }, custom_id: `placement_accept:${t.messageType}` },
          { type: 2, style: 2, label: 'Decline Placement', emoji: { name: '❌' }, custom_id: `placement_decline:${t.messageType}` }
        ]
      });
    }
    try {
      // Raw REST — discord.js channel.send() rejects raw Components V2 objects ("toJSON is not a function").
      await DiscordRequest(`channels/${t.channelId}/messages`, {
        method: 'POST',
        body: { flags: (1 << 15), components: [{ type: 17, accent_color: INVITE_ACCENT[t.messageType], components: cardComponents }] }
      });
      result.sent++;
      result.perType[t.messageType]++;
      // Persist the offer on the application record (chevron Stage 2). Only on a confirmed send.
      const rec = playerData[guildId]?.applications?.[t.channelId];
      const offer = OFFER_FOR_TYPE[t.messageType];
      if (rec && offer) { rec.offerStatus = offer; rec.offerSentAt = nowIso; stampedAny = true; }
    } catch (err) {
      console.log(`⚠️ sendCastingInvites: failed to message channel ${t.channelId}: ${err.message}`);
      result.failed++;
    }
    if (i < targets.length - 1) await sleep(700); // rate-limit-safe spacing
  }
  if (stampedAny) await savePlayerData(playerData);
  console.log(`📨 sendCastingInvites [${mode}] guild ${guildId}: sent ${result.sent}, failed ${result.failed}, skippedEmpty ${result.skippedEmpty}`);
  return result;
}

/**
 * Build the "🗳️ Votes for X" tally text — header + average + per-voter star lines, formatting IDENTICAL to the
 * old inline Casting-card block. Now shown as an ephemeral popup behind the ⭐ Avg Votes button (keeps scores
 * private). Kept as a standalone fn so the tally is trivial to re-add to the card if wanted. Async — fetches
 * voter display names from the guild.
 * @returns {Promise<string>} the full text-display content
 */
export async function buildCastingVotesDisplay({ guildId, channelId, applicantDisplayName, playerData, guild }) {
  const allRankings = playerData?.[guildId]?.applications?.[channelId]?.rankings || {};
  const entries = Object.entries(allRankings).filter(([, s]) => s !== undefined).sort(([, a], [, b]) => b - a);
  const header = `### \`\`\`🗳️ Votes for ${applicantDisplayName}\`\`\``;
  if (entries.length === 0) return `${header}\n-# No scores yet — click 1–5 on the Casting card to rate this applicant.`;
  const scores = entries.map(([, s]) => s);
  const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  let text = `${header}\n> **Average:** ${avg}/5.0 (${scores.length} vote${scores.length !== 1 ? 's' : ''})\n`;
  for (const [uid, score] of entries) {
    let name = 'Unknown Member';
    try { const m = await guild.members.fetch(uid); name = m.displayName || m.user.username; } catch { /* left server */ }
    text += `• ${name}: ${'⭐'.repeat(score)} (${score}/5)\n`;
  }
  return text;
}

/**
 * Generate the DNC Overview screen — global view of all DNC entries and conflicts.
 * Always returns a new ephemeral message (does not update the Casting card).
 *
 * @param {Object} params
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.configId - Season config ID
 * @param {Object} params.guild - Discord guild object
 * @returns {Object} Complete ephemeral UI response
 */
export async function generateDncOverviewUI({ guildId, configId, guild }) {
  const playerData = await loadPlayerData();
  const { getApplicationsForSeason } = await import('./storage.js');
  const { buildGlobalDncOverview } = await import('./dncManager.js');

  const allApplications = await getApplicationsForSeason(guildId, configId);
  const seasonConfig = playerData[guildId]?.applicationConfigs?.[configId];
  const seasonName = seasonConfig?.seasonName || 'Current Season';

  const overview = buildGlobalDncOverview(allApplications, playerData, guildId);

  const components = [
    { type: 10, content: `## 🚷 DNC Overview | ${seasonName}` },
    { type: 14 }
  ];

  if (overview.hasConflicts) {
    // Red state: conflicts detected + all entries
    components.push(
      { type: 10, content: `### \`\`\`⚠️ Conflicts Detected\`\`\`\n-# These applicants have cross-listed each other — casting them together is high risk.` },
      { type: 10, content: overview.conflictText }
    );
    if (overview.hasEntries) {
      components.push(
        { type: 14 },
        { type: 10, content: `### \`\`\`📋 All DNC Entries\`\`\`\n-# ${overview.stats.withEntries} of ${overview.stats.total} applicants have DNC entries` },
        { type: 10, content: overview.entriesText }
      );
    }
  } else if (overview.hasEntries) {
    // Blue state: entries exist but no conflicts
    components.push(
      { type: 10, content: `### \`\`\`✅ No Conflicts\`\`\`\n-# No cross-listed DNC entries found. Safe to cast freely.` },
      { type: 14 },
      { type: 10, content: `### \`\`\`📋 All DNC Entries\`\`\`\n-# ${overview.stats.withEntries} of ${overview.stats.total} applicants have DNC entries` },
      { type: 10, content: overview.entriesText }
    );
  } else {
    // Green state: no entries at all
    components.push(
      { type: 10, content: `### \`\`\`✅ All Clear\`\`\`\n-# No applicants have submitted DNC entries this season.\n-# You're free to cast without DNC constraints.` }
    );
  }

  // Navigation — back to Casting
  components.push(
    { type: 14 },
    {
      type: 1,
      components: [
        new ButtonBuilder()
          .setCustomId(`season_app_ranking_${configId}`)
          .setLabel('← Casting')
          .setStyle(ButtonStyle.Secondary)
          .toJSON()
      ]
    }
  );

  const container = {
    type: 17,
    accent_color: overview.accentColor,
    components
  };

  // Validate component count
  const { countComponents } = await import('./utils.js');
  countComponents([container], { enableLogging: true, label: 'DNC Overview' });

  return {
    flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 + EPHEMERAL — always private
    components: [container]
  };
}

/**
 * Handle ranking navigation (prev/next) and regenerate UI
 * 
 * @param {Object} params - Parameters object  
 * @param {string} params.customId - Button custom_id (e.g., ranking_prev_5, ranking_next_3)
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.userId - Current user ID
 * @param {Object} params.guild - Discord guild object
 * @param {Object} params.client - Discord.js client instance
 * @returns {Object} Complete UI response object for navigation
 */
/**
 * 🚣 Marooning tab — the season-wide casting-decision summary (formerly the "Casting Summary" button).
 * Now a first-class Season Manager tab: shared seasonManagerHeader('marooning') + buildSeasonNavRow(…,
 * 'marooning') + the casting-status breakdown + the shared [← Seasons][Edit] bottom row. LEAN chrome,
 * consistent with the Apps/Planner/Casting tabs. Reached via season_marooning_{configId} (and the legacy
 * ranking_view_all_scores_* which now delegates here). Pure render — caller supplies playerData + seasonName.
 * @param {Object} p - { configId, guildId, playerData, seasonName }
 * @returns {Object} { components: [container] } (updateMessage pattern; caller adds ephemeral flags if needed)
 */
export async function buildMarooningView({ configId, guildId, playerData, seasonName, guild }) {
  const { getApplicationsForSeason, getAllApplicationsFromData } = await import('./storage.js');
  const { buildSeasonNavRow, seasonManagerHeader, buildSeasonBottomRow } = await import('./seasonSelector.js');

  const allApplications = (configId && configId !== 'navigation')
    ? await getApplicationsForSeason(guildId, configId)
    : await getAllApplicationsFromData(guildId);

  // Per-applicant score + casting decision (userId kept for the private draft-tribe grouping below).
  // Grouping + score sort live in computeCastingOrder — shared with the Casting jump-select.
  const { ordered: applicantData, groups: castGroups } = computeCastingOrder(allApplications, playerData, guildId);

  const statusSections = [
    { emoji: '✅', title: 'CAST PLAYERS', group: castGroups.cast },
    { emoji: '🔄', title: 'ALTERNATE', group: castGroups.alternative },
    { emoji: '❓', title: 'TENTATIVE', group: castGroups.tentative },
    { emoji: '🗑️', title: "DON'T CAST", group: castGroups.reject },
    { emoji: '⚪', title: 'UNDECIDED', group: castGroups.undecided }
  ];

  // ===== 🏕️ Tribes (default/active castlist) — loaded up here because the casting list below groups
  // players by their PRIVATE draft-tribe assignment, and the Draft Tribes button needs the tribe count. =====
  const { castlistManager } = await import('./castlistManager.js');
  let tribeRoleIds = [];
  try {
    tribeRoleIds = await castlistManager.getTribesUsingCastlist(guildId, 'default');
  } catch (e) {
    console.warn(`⚠️ Marooning: could not load default-castlist tribes: ${e.message}`);
  }
  // Gracefully ignore tribes whose Discord role was deleted (would render as @unknown-role).
  // Display-only filter — the Castlist Hub is the place that detects orphans and CLEANS the data.
  // With none left this renders exactly like no tribes configured (Tribes: None, Draft disabled,
  // draftees of the dead tribe fall back to the undrafted list below).
  if (guild) {
    const orphaned = tribeRoleIds.filter(rid => !guild.roles.cache.has(rid));
    if (orphaned.length > 0) {
      console.log(`⚠️ Marooning: ignoring ${orphaned.length} tribe(s) with deleted Discord role(s): ${orphaned.join(', ')}`);
      tribeRoleIds = tribeRoleIds.filter(rid => guild.roles.cache.has(rid));
    }
  }
  const tribes = playerData[guildId]?.tribes || {};
  const tribesLine = tribeRoleIds.length > 0
    ? `**Tribes:** ${tribeRoleIds.map(id => `${tribes[id]?.emoji || '🏕️'} <@&${id}>`).join(', ')}`
    : '**Tribes:** None';

  // Private draft-tribe assignments (season-scoped, HOST-ONLY). Stored under applicationConfigs[configId]
  // .draftTribes — physically OFF the tribe objects, and NO Discord roles are assigned — so no player-facing
  // tribe/castlist renderer can ever surface them. userId → first tribe roleId that drafted them.
  const draftTribes = playerData[guildId]?.applicationConfigs?.[configId]?.draftTribes || {};
  const userDraftTribe = {};
  for (const [rid, ids] of Object.entries(draftTribes)) {
    for (const uid of (ids || [])) { if (!userDraftTribe[uid]) userDraftTribe[uid] = rid; }
  }

  const renderRow = (p, i) => {
    const scoreDisplay = p.avgScore > 0 ? p.avgScore.toFixed(1) : 'Unrated';
    const resp = p.placementResponse === 'accepted' ? ' · 🎉 Accepted'
      : p.placementResponse === 'accepted_alternative' ? ' · ✅ Accepted (Alt)'
      : p.placementResponse === 'declined' ? ' · 🚫 Declined' : '';
    return `${i + 1}. ${p.name} - ${scoreDisplay}/5.0 (${p.voteCount} vote${p.voteCount !== 1 ? 's' : ''})${resp}`;
  };

  let body = '### ```🎬 Casting Decisions```\n';
  let anyGroup = false;
  statusSections.forEach(section => {
    if (section.group.length === 0) return;
    anyGroup = true;
    body += `## ${section.emoji} ${section.title} (${section.group.length})\n`;
    // Sub-group this status' players by their private draft tribe (castlist order preserved), undrafted last.
    const perTribe = new Map();
    const undrafted = [];
    for (const p of section.group) { // already score-sorted
      const rid = userDraftTribe[p.userId];
      if (rid && tribeRoleIds.includes(rid)) {
        if (!perTribe.has(rid)) perTribe.set(rid, []);
        perTribe.get(rid).push(p);
      } else {
        undrafted.push(p);
      }
    }
    for (const rid of tribeRoleIds) {
      const players = perTribe.get(rid);
      if (!players?.length) continue;
      body += `<@&${rid}> (tentative)\n${players.map(renderRow).join('\n')}\n\n`;
    }
    if (undrafted.length) {
      if (perTribe.size > 0) body += `-# Not yet drafted to a tribe\n`;
      body += `${undrafted.map(renderRow).join('\n')}\n\n`;
    }
  });
  if (!anyGroup) body += '-# No applicants yet for this season.\n\n';
  body += `### 📊 **SUMMARY**\n`;
  body += `> **Total Applicants:** ${allApplications.length}\n`;
  body += `> **Cast:** ${castGroups.cast.length} | **Alternate:** ${castGroups.alternative.length} | **Tentative:** ${castGroups.tentative.length} | **Rejected:** ${castGroups.reject.length} | **Undecided:** ${castGroups.undecided.length}\n`;
  const totalScored = applicantData.filter(a => a.voteCount > 0).length;
  body += `> **Scored:** ${totalScored}/${allApplications.length} applicants`;

  // 🏕️ Tribes section — the New Tribe button REUSES the Castlist Hub's button (tribe_add_button|default) so
  // it's identical in look/feel/function: opens the Add New Tribe modal → creates the role → adds it to the
  // DEFAULT castlist. 💭 Draft Tribes opens the private draft modal (needs ≥2 tribes, else disabled).
  const canDraft = tribeRoleIds.length >= 2;

  const container = {
    type: 17,
    accent_color: 0x9B59B6, // Purple — matches the casting interface
    components: [
      seasonManagerHeader('marooning', seasonName),
      buildSeasonNavRow(configId, 'marooning'),
      { type: 14 },
      { type: 10, content: '### ```🏕️ Tribes```' },
      { type: 1, components: [
        // New Tribe reuses the Castlist Hub button, but carries a 'marooning_{configId}' origin so the modal
        // SUBMIT refreshes THIS Marooning message (not the Castlist Hub). Still adds to the default castlist.
        { type: 2, custom_id: `tribe_add_button|default|marooning_${configId}`, label: 'New Tribe', style: 2, emoji: { name: '🏕️' } },
        { type: 2, custom_id: `marooning_draft_tribes_${configId}`, label: 'Draft Tribes', style: 2, emoji: { name: '💭' }, disabled: !canDraft },
        // ✒️ Invites — moved here from the Casting card. Season-level bulk sends (Cast/Alternate/Reject
        // templates → applicant channels). appIndex is baked as 0: it's only read by the modal's "selected
        // applicant" mode, which is N/A from this season-level view (guarded by a name-showing confirm card).
        { type: 2, custom_id: `casting_messages_0_${configId}`, label: 'Invites', style: 2, emoji: { name: '✒️' } }
      ]},
      { type: 10, content: tribesLine },
      { type: 14 },
      { type: 10, content: body },
      { type: 14 },
      buildSeasonBottomRow(configId, 'marooning')
    ]
  };

  const { countComponents } = await import('./utils.js');
  countComponents([container], { verbosity: 'summary', label: `Marooning - ${seasonName}` });

  return { components: [container] };
}

/**
 * 💭 Draft Tribes modal — up to 5 PRIVATE User Selects, one per tribe on the default castlist. Provisional,
 * host-only assignments: submitting does NOT assign Discord roles and does NOT notify anyone (see the
 * marooning_draft_tribes_modal submit handler in app.js). Reassuring copy (ComponentsV2) on every label.
 * Pre-fills each select with the current draft (default_values). Returns null when <2 tribes exist (nothing
 * meaningful to draft). If >5 tribes, only the first 5 are shown and the LAST label warns to trim the castlist.
 * @param {Object} p - { configId, guildId, playerData, guild }
 * @returns {Object|null} a MODAL response ({ type: 9, data }) or null
 */
export async function buildDraftTribesModal({ configId, guildId, playerData, guild }) {
  const { castlistManager } = await import('./castlistManager.js');
  let tribeRoleIds = [];
  try {
    tribeRoleIds = await castlistManager.getTribesUsingCastlist(guildId, 'default');
  } catch (e) {
    console.warn(`⚠️ Draft Tribes: could not load default-castlist tribes: ${e.message}`);
  }
  // Same deleted-role filter as buildMarooningView — a dead tribe would render as "🏕️ Tribe".
  if (guild) tribeRoleIds = tribeRoleIds.filter(rid => guild.roles.cache.has(rid));
  if (tribeRoleIds.length < 2) return null; // need ≥2 tribes to draft between

  const tribes = playerData[guildId]?.tribes || {};
  const draft = playerData[guildId]?.applicationConfigs?.[configId]?.draftTribes || {};
  const shown = tribeRoleIds.slice(0, 5); // modal cap = 5 components
  const overflow = tribeRoleIds.length > 5;

  const components = shown.map((roleId, i) => {
    const t = tribes[roleId] || {};
    const emoji = t.emoji || '🏕️';
    const name = guild?.roles?.cache?.get(roleId)?.name || t.analyticsName || t.name || 'Tribe';
    let description = 'Private draft — no roles are assigned, players aren\'t notified, hidden until marooning.';
    if (overflow && i === shown.length - 1) {
      description = `⚠️ Only 5 of ${tribeRoleIds.length} tribes shown — trim tribes in the Castlist Manager to draft the rest.`;
    }
    const members = Array.isArray(draft[roleId]) ? draft[roleId] : [];
    const select = {
      type: 5, // User Select
      custom_id: `draft_tribe_sel_${roleId}`,
      placeholder: 'Draft players to this tribe (private)…',
      required: false,
      min_values: 0,
      max_values: 25
    };
    if (members.length > 0) select.default_values = members.map(id => ({ id, type: 'user' }));
    return {
      type: 18, // Label
      label: `${emoji} ${name}`.slice(0, 45),
      description,
      component: select
    };
  });

  return {
    type: 9, // MODAL
    data: {
      custom_id: `marooning_draft_tribes_modal|${configId}`,
      title: 'Draft Tribes (private)',
      components
    }
  };
}

export async function handleRankingNavigation({
  customId,
  guildId,
  userId,
  guild,
  client,
  ephemeral = false
}) {
  // Load data
  const playerData = await loadPlayerData();
  const { getAllApplicationsFromData, getApplicationsForSeason } = await import('./storage.js');
  
  // Parse the customId to extract configId BEFORE using it
  // Handle ephemeral suffix: ranking_next_0_config_123_ephemeral
  const navMatch = customId.match(/^ranking_(prev|next)_(\d+)(?:_(.+?))?(?:_ephemeral)?$/);
  const scoresMatch = customId.match(/^ranking_view_all_scores(?:_(.+?))?(?:_ephemeral)?$/);
  const extractedConfigId = navMatch ? navMatch[3] : (scoresMatch ? scoresMatch[1] : null);
  
  // Use appropriate application fetching based on configId
  const allApplications = extractedConfigId && extractedConfigId !== 'navigation' 
    ? await getApplicationsForSeason(guildId, extractedConfigId)
    : await getAllApplicationsFromData(guildId);

  // Handle "view all scores" (legacy ranking_view_all_scores_*) → now the 🚣 Marooning tab.
  // Delegates to the shared buildMarooningView so the legacy id and the new season_marooning_* id
  // render identical chrome (shared header / nav / [← Seasons][Edit] bottom row).
  if (scoresMatch) {
    const seasonName = extractedConfigId
      ? (playerData[guildId]?.applicationConfigs?.[extractedConfigId]?.seasonName || `Season ${extractedConfigId}`)
      : 'Current Season';
    const view = await buildMarooningView({ configId: extractedConfigId, guildId, playerData, seasonName, guild });
    return ephemeral
      ? { flags: (1 << 15) | (1 << 6), components: view.components } // IS_COMPONENTS_V2 + EPHEMERAL
      : { components: view.components }; // updateMessage pattern
  }

  // Handle navigation (prev/next) with configId support
  // Format: ranking_prev_{index}_{configId} or ranking_next_{index}_{configId}
  // navMatch already parsed above for configId extraction
  if (!navMatch) {
    throw new Error(`Invalid navigation custom_id format: ${customId}`);
  }

  const [, direction, currentIndexStr] = navMatch;
  const currentIndex = parseInt(currentIndexStr);
  const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
  
  // Use extracted configId if available
  const navConfigId = extractedConfigId || 'navigation';
  
  if (newIndex < 0 || newIndex >= allApplications.length) {
    return {
      content: '❌ Invalid navigation.',
      ephemeral: true
    };
  }
  
  const currentApp = allApplications[newIndex];
  
  // Fetch the applicant as a guild member to get their current avatar
  let applicantMember;
  try {
    applicantMember = await guild.members.fetch(currentApp.userId);
  } catch (error) {
    // Fallback: create a basic user object for avatar URL generation
    applicantMember = {
      displayName: currentApp.displayName,
      user: { username: currentApp.username },
      displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`,
      roles: [] // Empty roles array for demographic logic
    };
  }
  
  // Use the main UI generation function with navigation parameters
  const seasonName = playerData[guildId]?.applicationConfigs?.[navConfigId]?.seasonName || 'Current Season';
  return await generateSeasonAppRankingUI({
    guildId,
    userId,
    configId: navConfigId, // Use the extracted configId from button
    allApplications,
    currentApp,
    appIndex: newIndex,
    applicantMember,
    guild,
    seasonName,
    playerData,
    ephemeral
  });
}

/**
 * Handle ranking select menu interactions (jump to applicant)
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.customId - Select menu custom_id
 * @param {Array} params.values - Selected values from the menu
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.userId - Current user ID
 * @param {Object} params.guild - Discord guild object
 * @param {Object} params.client - Discord.js client instance
 * @returns {Object} Complete UI response object
 */
export async function handleRankingSelect({
  customId,
  values,
  guildId,
  userId,
  guild,
  client
}) {
  const selectedValue = values[0];
  console.log(`🔍 DEBUG: handleRankingSelect - Selected value: ${selectedValue}`);
  
  // Parse: ranking_select_{currentIndex}_{configId}_{page}
  const parts = customId.split('_');
  const currentIndex = parseInt(parts[2]);
  const currentPage = parseInt(parts[parts.length - 1]) || 0;
  
  // Extract configId (handle configs with underscores)
  let configId = null;
  if (parts.length > 4) {
    configId = parts.slice(3, -1).join('_');
  }
  
  // Load data
  const playerData = await loadPlayerData();
  const { getAllApplicationsFromData, getApplicationsForSeason } = await import('./storage.js');
  
  // Get applications using season-filtered function when configId is available
  const allApplications = configId 
    ? await getApplicationsForSeason(guildId, configId)
    : await getAllApplicationsFromData(guildId);
  
  // Check if it's a page navigation
  if (selectedValue.startsWith('page_')) {
    const newPage = parseInt(selectedValue.split('_')[1]);
    console.log(`🔍 DEBUG: handleRankingSelect - Switching to page ${newPage}`);

    // Show first applicant of the new SORTED page (display order = Marooning order).
    // Recomputed at click time and clamped — scores/deletions may have shifted boundaries
    // since render. NaN/negative pages fall through to the error path via undefined target.
    const { ordered } = computeCastingOrder(allApplications, playerData, guildId);
    const target = ordered[Math.min(Math.max(newPage, 0) * 23, ordered.length - 1)];
    const newIndex = target?.insertionIndex;
    const currentApp = target ? allApplications[newIndex] : undefined;

    if (!currentApp) {
      return {
        content: '❌ Error navigating to page.',
        ephemeral: true
      };
    }
    
    // Fetch applicant member
    let applicantMember;
    try {
      applicantMember = await guild.members.fetch(currentApp.userId);
    } catch (error) {
      applicantMember = {
        displayName: currentApp.displayName,
        user: { username: currentApp.username },
        displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`,
        roles: []
      };
    }
    
    // Use main UI generation function
    const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || 'Current Season';
    return await generateSeasonAppRankingUI({
      guildId,
      userId,
      configId: configId || 'select',
      allApplications,
      currentApp,
      appIndex: newIndex,
      applicantMember,
      guild,
      seasonName,
      playerData
    });
    
  } else {
    // Jump to selected applicant
    const newIndex = parseInt(selectedValue);
    const currentApp = allApplications[newIndex];
    
    if (!currentApp) {
      return {
        content: '❌ Application not found.',
        ephemeral: true
      };
    }
    
    console.log(`🔍 DEBUG: handleRankingSelect - Jumping to applicant ${newIndex + 1}: ${currentApp.displayName}`);
    
    // Fetch applicant member
    let applicantMember;
    try {
      applicantMember = await guild.members.fetch(currentApp.userId);
    } catch (error) {
      applicantMember = {
        displayName: currentApp.displayName,
        user: { username: currentApp.username },
        displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`,
        roles: []
      };
    }
    
    // Use main UI generation function
    const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || 'Current Season';
    return await generateSeasonAppRankingUI({
      guildId,
      userId,
      configId: configId || 'select',
      allApplications,
      currentApp,
      appIndex: newIndex,
      applicantMember,
      guild,
      seasonName,
      playerData
    });
  }
}

/**
 * Handle ranking button clicks (1-5 stars) and update scores
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.customId - Button custom_id (e.g., rank_3_channelId_5_configId)
 * @param {string} params.guildId - Discord guild ID
 * @param {string} params.userId - Current user ID
 * @param {Object} params.guild - Discord guild object
 * @param {Object} params.client - Discord.js client instance
 * @returns {Object} Complete UI response object with updated scores
 */
export async function handleRankingButton({
  customId,
  guildId,
  userId,
  guild,
  client
}) {
  // Parse custom_id: rank_SCORE_CHANNELID_APPINDEX_CONFIGID
  const rankMatch = customId.match(/^rank_(\d+)_(\d+)_(\d+)_(.+)$/);
  if (!rankMatch) {
    return {
      content: '❌ Invalid ranking button format.',
      ephemeral: true
    };
  }

  const [, score, channelId, appIndexStr, configId] = rankMatch;
  const rankingScore = parseInt(score);
  const appIndex = parseInt(appIndexStr);
  
  // Load and update ranking data
  const { loadPlayerData, savePlayerData } = await import('./storage.js');
  const playerData = await loadPlayerData();
  
  if (!playerData[guildId]) playerData[guildId] = {};
  if (!playerData[guildId].applications) playerData[guildId].applications = {};
  if (!playerData[guildId].applications[channelId]) playerData[guildId].applications[channelId] = {};
  if (!playerData[guildId].applications[channelId].rankings) playerData[guildId].applications[channelId].rankings = {};
  
  // Record the user's ranking for this application
  playerData[guildId].applications[channelId].rankings[userId] = rankingScore;
  await savePlayerData(playerData);
  
  // Get updated application data using season-filtered function when configId is available
  const { getAllApplicationsFromData, getApplicationsForSeason } = await import('./storage.js');
  const allApplications = configId 
    ? await getApplicationsForSeason(guildId, configId)
    : await getAllApplicationsFromData(guildId);
  const currentApp = allApplications[appIndex];
  
  if (!currentApp) {
    return {
      content: '❌ Application not found.',
      ephemeral: true
    };
  }
  
  // Fetch the applicant as a guild member
  let applicantMember;
  try {
    applicantMember = await guild.members.fetch(currentApp.userId);
  } catch (error) {
    // Fallback: create a basic user object for avatar URL generation
    applicantMember = {
      displayName: currentApp.displayName,
      user: { username: currentApp.username },
      displayAvatarURL: () => currentApp.avatarURL || `https://cdn.discordapp.com/embed/avatars/${currentApp.userId % 5}.png`,
      roles: [] // Empty roles array for demographic logic
    };
  }
  
  // Use the main UI generation function with updated data
  const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || 'Current Season';
  return await generateSeasonAppRankingUI({
    guildId,
    userId,
    configId: configId || 'rating',
    allApplications,
    currentApp,
    appIndex,
    applicantMember,
    guild,
    seasonName,
    playerData
  });
}