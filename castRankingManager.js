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
 * @param {string} [userId] - viewer; gates the hidden Channels tab in the nav row
 */
export async function buildRankingEmptyState(seasonName, configId, userId = null) {
  const { buildSeasonNavRow, seasonManagerHeader, buildSeasonBottomRow } = await import('./seasonSelector.js');
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2 (factory adds ephemeral / strips for updateMessage)
    components: [{
      type: 17,
      components: [
        seasonManagerHeader('ranking', seasonName),
        buildSeasonNavRow(configId, 'ranking', userId),
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
    return await buildRankingEmptyState(seasonName, configId, userId);
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
  // Kept byte-identical to STATUS_REGISTRY's accepted_alt row (playerStatus.js) — the two must agree.
  if (placementResponse === 'accepted_alternative') return { icon: '🎉', name: 'Accepted Placement (Alt)' };
  if (placementResponse === 'declined') return { icon: '🚫', name: 'Declined Placement' };
  if (castingStatus === 'cast')        return { icon: '✅', name: 'Cast' };
  if (castingStatus === 'alternative') return { icon: '🔄', name: 'Alternate' };
  if (castingStatus === 'reject')      return { icon: '❌', name: 'Not Cast' };
  if (voteCount >= 2)                  return { icon: '☑️', name: 'Reviewed' };
  if (voteCount >= 1)                  return { icon: '🗳️', name: `Scoring (${voteCount} vote${voteCount === 1 ? '' : 's'})` };
  return { icon: '📝', name: 'Awaiting Votes' };
}

/**
 * Resolve a player's age + pronoun/timezone role NAMES (as plain text — a code-block/text-display can't
 * render `<@&role>` pills). Shared by the Casting card's 👤 Overview block and the Marooning roster rows
 * so they can't drift apart.
 *
 * Role-name lookup checks the GUILD's role cache first, falling back to the MEMBER's own role cache —
 * a GuildMember's `roles.cache` holds full Role objects (not just IDs), so it still resolves a name even
 * on the rare guild-role-cache miss. Skipping this fallback was the original Marooning bug: timezone
 * roles came up blank while pronoun roles (usually touched elsewhere, keeping the guild cache warm)
 * happened to resolve fine.
 *
 * @param {Object} playerData
 * @param {string} guildId
 * @param {string} userId
 * @param {import('discord.js').GuildMember} [member] - the player's LIVE guild member (cache or fetched)
 * @param {import('discord.js').Guild} [guild]
 * @returns {{age: (number|undefined), pronounName: (string|null), timezoneName: (string|null)}}
 */
function resolvePlayerDemographics(playerData, guildId, userId, member, guild, app = null) {
  // External (Google Sheets) applicants have no Discord member, so there are no pronoun/timezone
  // ROLES to read — those values live as plain strings on the application record. The card renders
  // role NAMES as plain text anyway (see below), so an external renders byte-identically to a native.
  if (app?.source === 'googleSheets') {
    return {
      age: app.external?.age,
      pronounName: app.external?.pronounName || null,
      timezoneName: app.external?.timezoneName || null
    };
  }
  const age = playerData[guildId]?.players?.[userId]?.age;
  let pronounRoleId = null, timezoneRoleId = null;
  if (member?.roles) {
    const guildPronouns = playerData[guildId]?.pronounRoleIDs || [];
    const guildTimezones = Object.keys(playerData[guildId]?.timezones || {});
    const memberRoles = member.roles.cache ? Array.from(member.roles.cache.keys()) : member.roles;
    for (const roleId of memberRoles) { if (guildPronouns.includes(roleId)) { pronounRoleId = roleId; break; } }
    for (const roleId of memberRoles) { if (guildTimezones.includes(roleId)) { timezoneRoleId = roleId; break; } }
  }
  const roleNameOf = (id) => id ? (guild?.roles?.cache?.get(id)?.name || member?.roles?.cache?.get(id)?.name || null) : null;
  return { age, pronounName: roleNameOf(pronounRoleId), timezoneName: roleNameOf(timezoneRoleId) };
}

/** Marooning's status-section order — also the jump-select's display order. (Tentative removed — RaP 0902.)
 *  'undecided' sits BEFORE 'reject' (Reece's call): Cast/Alternate/Undecided are all still "in
 *  consideration" for a host working toward a target cast size, while Reject/Withdrawn are not — see
 *  the continuous-vs-restarting numbering split in buildMarooningView, which relies on this exact split.
 *  'withdrawn' is always LAST regardless of castingStatus — it's the latest lifecycle action (RaP 0902/
 *  deriveApplicationStatus precedence) and overrides whatever decision bucket the applicant would otherwise
 *  land in, so a withdrawn Cast/Reject/etc. applicant sinks below every active applicant instead of hiding
 *  mid-list among people still being considered (confirmed on prod — was showing at arbitrary positions). */
const CASTING_GROUP_ORDER = ['cast', 'alternative', 'undecided', 'reject', 'withdrawn'];

/**
 * Single source of truth for "casting order": group applicants by castingStatus
 * (cast → alternative → undecided → reject → withdrawn), then sort each group by
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
 * @param {import('discord.js').Guild} [guild] - LIVE guild, used to read each applicant's CURRENT channel
 *   name (the ✖️ withdrawn marker — there is no stored field for it, see playerStatus.js). Omit to skip
 *   withdrawal detection (degrades to the old cast/alternative/reject/undecided-only behaviour).
 * @returns {{groups: Object<string, Array>, ordered: Array}} groups keyed by status; ordered = groups concatenated in display order. Entry shape: { app, insertionIndex, userId, name, avgScore, voteCount, castingStatus, offerStatus, placementResponse, hasNotes }
 */
export function computeCastingOrder(allApplications, playerData, guildId, guild = null) {
  const entries = allApplications.map((app, insertionIndex) => {
    const rec = playerData[guildId]?.applications?.[app.channelId] || {};
    const scores = Object.values(rec.rankings || {}).filter(r => r !== undefined);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const liveChannelName = guild?.channels?.cache?.get(app.channelId)?.name || '';
    const withdrawn = /^✖️/.test(liveChannelName);
    const rawStatus = rec.castingStatus || 'undecided';
    return {
      app,
      insertionIndex,
      userId: app.userId,
      name: app.displayName || app.username,
      avgScore,
      voteCount: scores.length,
      castingStatus: withdrawn ? 'withdrawn' : (CASTING_GROUP_ORDER.includes(rawStatus) ? rawStatus : 'undecided'),
      offerStatus: rec.offerStatus,
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
    buildSeasonNavRow(configId, 'ranking', userId),
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
    const { ordered } = computeCastingOrder(allApplications, playerData, guildId, guild);
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

  // ---- Applicant demographics (age + pronoun/timezone role NAMES) — shared with Marooning's rows. ----
  const { age: applicantAge, pronounName: _pronounName, timezoneName: _timezoneName } =
    resolvePlayerDemographics(playerData, guildId, currentApp.userId, applicantMember, guild, currentApp);

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
  const appHeaderContent = `# \`\`\`📃 ${headerName}'s App\`\`\``;
  const overviewBits = [];
  if (applicantAge) overviewBits.push(`${applicantAge}`);
  if (_pronounName) overviewBits.push(`@${_pronounName}`);
  if (_timezoneName) overviewBits.push(`@${_timezoneName}`);
  const _username = applicantMember?.user?.username || currentApp.username || 'unknown';
  let playerOverview = `> **👤 Overview**\n* ${headerName} (${_username})`; // display name (username)
  if (overviewBits.length) playerOverview += `\n* ${overviewBits.join(' | ')}`;
  if (dncSummaryText) playerOverview += `\n${dncSummaryText}`; // already formatted as its own "* DNC #N:" bullets

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
    { type: 10, content: `> **✏️ Applicant Notes**\n${notesText}` }, // moved to directly above the avatar
    {
      type: 12, // Media Gallery — full-size applicant avatar
      items: [{ media: { url: applicantAvatarURL }, description: `Avatar of ${currentApp.displayName || currentApp.username}` }]
    },
    rankingRow.toJSON() // 1-5 rating buttons (the "⭐ Vote on this applicant" header was removed to reclaim a component for VC Rank)
  );

  // DNC conflict warning — prominent, only when this applicant cross-lists someone.
  if (dncWarningText) {
    containerComponents.push({ type: 10, content: dncWarningText });
  }

  // ---- Casting Decision — three TOGGLE buttons (Cast / Don't Cast / Alternate) ----
  // Active (selected) style is per-decision: Cast=green (Success), Don't Cast=red (Danger), Alternate=blue
  // (Primary); inactive = grey (Secondary). NOT disabled — clicking the ACTIVE button toggles it OFF (the
  // handler clears castingStatus → undecided). There is no "Still Deciding" option: undecided is simply no
  // button active. custom_id status is a single char (c/n/a) to keep it short (worst-case ~73 chars).
  // (The Casting Lifecycle Chevron that used to sit here is currently hidden — see the note below.)
  const decisionButton = (value, char, emoji, label, activeStyle) => new ButtonBuilder()
    .setCustomId(`castdec_${char}_${currentApp.channelId}_${appIndex}_${configId}`)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(castingStatus === value ? activeStyle : ButtonStyle.Secondary)
    .toJSON();
  containerComponents.push(
    {
      type: 10,
      content: `> **🎭 Casting Decision**`
    },
    {
      type: 1, // Casting decision — toggle buttons
      components: [
        decisionButton('cast', 'c', '🎬', 'Cast', ButtonStyle.Success),
        decisionButton('reject', 'n', '🙅', "Don't Cast", ButtonStyle.Danger),
        decisionButton('alternative', 'a', '🔄', 'Alternate', ButtonStyle.Primary)
      ]
    }
    // Casting Lifecycle Chevron (RaP 0902) — HIDDEN from the UI for now (Reece's call); the logic is kept
    // (getCastingChevron in playerStatus.js + `chevron` above) so it can be revived by re-adding:
    //   ...(chevron ? [{ type: 10, content: chevron }] : [])
  );

  // (Votes tally moved off the card into the ⭐ Avg Votes button popup; Player Notes moved above the avatar.)

  // ✒️ Send Invite — context-aware SINGLE invite (left of DNC). Grey + disabled until a casting decision is set;
  // then blue + active with a label reflecting the decision (Cast→Send Offer, Don't Cast→Send Decline,
  // Alternate→Send Alternate). Opens the single-invite variant of the Bulk Invites modal (casting_send_).
  const SEND_INVITE_LABEL = { cast: 'Send Offer', reject: 'Send Decline', alternative: 'Send Alternate' };
  const sendInviteLabel = SEND_INVITE_LABEL[castingStatus];
  const sendInviteBtn = new ButtonBuilder()
    .setCustomId(`casting_send_${appIndex}_${configId}`)
    .setLabel(sendInviteLabel || 'Send Invite')
    .setEmoji('✒️')
    .setStyle(sendInviteLabel ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(!sendInviteLabel)
    .toJSON();

  // ---- Utility actions (divider above, between the Casting Decision buttons and this row) ----
  containerComponents.push({ type: 14 });
  containerComponents.push({
    type: 1,
    components: [
      sendInviteBtn, // ✒️ Send Invite/Offer/Decline/Alternate — left of DNC
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
      // 📢 VC Rank moved to the bottom nav row (right of Edit); ✒️ Bulk Invites lives on the Marooning tab.
    ]
  });

  // Divider above the bottom nav, then the shared Season Manager bottom row — [← Seasons] [✏️ Edit] [📢 VC Rank].
  // VC Rank (was in the utility row) is passed as an extraButton to the right of Edit (mirrors Apps/Planner).
  containerComponents.push({ type: 14 });
  const vcRankBtn = { type: 2, custom_id: `ranking_public_warn_${appIndex}_${configId}`, label: 'VC Rank', style: 2, emoji: { name: '📢' } };
  containerComponents.push(buildSeasonBottomRow(configId, 'ranking', [vcRankBtn]));

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
    allowed_mentions: { parse: [] }, // suppress ALL pings — the DNC summary's <@id> tags must never notify listed users
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
 * @param {string} p.value - 'cast' | 'alternative' | 'reject' | 'undecided'
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

  const { loadPlayerData, savePlayerData, getApplicationsForSeason, withStorageLock } = await import('./storage.js');
  // Locked load→mutate→save (incident-05 protection) — a concurrent playerData cycle during this
  // write would otherwise be silently erased (last save wins). Discord fetch + re-render stay OUTSIDE
  // the lock; the mutated playerData reference is carried out for rendering.
  let playerData, found = false;
  await withStorageLock(async () => {
    playerData = await loadPlayerData();
    const appRecord = playerData[guildId]?.applications?.[channelId];
    if (!appRecord) return;
    found = true;
    const previousStatus = appRecord.castingStatus || 'undecided';
    const newStatus = value === 'undecided' ? 'undecided' : value;
    // "undecided" is never stored — clearing castingStatus IS undecided (backwards compatible with
    // existing data, where absence of castingStatus already meant undecided).
    if (value === 'undecided') {
      delete appRecord.castingStatus;
    } else {
      appRecord.castingStatus = value;
    }
    // A CHANGED decision invalidates any Stage-2 commitment tied to the OLD decision (a sent offer /
    // the applicant's response to it) — otherwise a stale 'accepted' keeps outranking the new decision
    // forever, since deriveApplicationStatus/STATUS_REGISTRY both check placementResponse before
    // castingStatus. Confirmed on prod: two applicants flipped Cast→Reject still showed 🎉 "Accepted
    // Placement" weeks later because nothing ever cleared it. Clearing lets a fresh invite re-stamp
    // offerStatus for the new decision.
    if (previousStatus !== newStatus) {
      delete appRecord.placementResponse;
      delete appRecord.offerStatus;
      delete appRecord.offerSentAt;
    }
    await savePlayerData(playerData);
  });
  if (!found) {
    return { content: '❌ Application not found.', ephemeral: true };
  }

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

/** Which casting status receives which message template (undecided → none). */
export const CASTING_STATUS_TO_MESSAGE = { cast: 'successful', alternative: 'alternative', reject: 'unsuccessful' };

/** castingStatus → offerStatus (Stage 2, RaP 0902). Used by "Update Status Only" (stamp without sending) and
 *  mirrors the messageType→offerStatus chain used on send (cast→offer, alternative→offer_alternative, reject→offer_rejected). */
export const OFFER_FOR_STATUS = { cast: 'offer', alternative: 'offer_alternative', reject: 'offer_rejected' };

/** castingStatus → the placementResponse value meaning "the applicant accepted" (Stage 2b). NO entry for
 *  'reject' — there is no "accepted a rejection" state. Powers the single-invite modal's "Update Status
 *  Only - Accepted" option: manually records an accept the host confirmed OUTSIDE CastBot (e.g. over DM),
 *  writing the exact same field a real Accept-button click would (placement_accept handler, app.js) — so
 *  the two paths are indistinguishable everywhere downstream (icons, chevron, channelRoster's accepted-cast
 *  roster). Deliberately does NOT rename the channel or post the public accept message like the real button
 *  does — "Update Status Only" is the quiet/private bookkeeping path by design. */
export const ACCEPTED_RESPONSE_FOR_STATUS = { cast: 'accepted', alternative: 'accepted_alternative' };

/**
 * Apply an "Update Status Only" write (single-invite modal) — stamps offerStatus, and for the
 * "- Accepted" variant ALSO placementResponse, WITHOUT sending a message. Mutates `playerData` in
 * place (caller saves); does not itself touch the channel name or post anything, unlike a real
 * Accept/Decline click — this is the quiet bookkeeping path by design.
 * @param {Object} playerData
 * @param {string} guildId
 * @param {Object} app - allApplications[appIndex] (or undefined if out of range)
 * @param {boolean} recordAccepted - true for "- Accepted"; false for "- Offered"/"- Notified"
 * @returns {{ok: true, name: string} | {ok: false, error: string}}
 */
export function applyStatusOnlyUpdate(playerData, guildId, app, recordAccepted) {
  const rec = app ? playerData[guildId]?.applications?.[app.channelId] : null;
  const offer = rec ? OFFER_FOR_STATUS[rec.castingStatus] : null;
  if (!rec || !offer) return { ok: false, error: '⚠️ No casting decision set for this applicant — nothing to update.' };
  const acceptedValue = recordAccepted ? ACCEPTED_RESPONSE_FOR_STATUS[rec.castingStatus] : null;
  if (recordAccepted && !acceptedValue) {
    return { ok: false, error: '⚠️ This decision has no "accepted" state (e.g. Don\'t Cast) — nothing to update.' };
  }
  rec.offerStatus = offer;
  rec.offerSentAt = new Date().toISOString();
  if (acceptedValue) rec.placementResponse = acceptedValue;
  return { ok: true, name: app.displayName || app.username || 'Applicant' };
}

/**
 * Locked variant of applyStatusOnlyUpdate — owns the whole load→mutate→save cycle under
 * withStorageLock (incident-05 protection). This is what the casting_messages_save handler calls;
 * the pure function above stays exported for tests and callers that already own a cycle.
 * @returns {Promise<{ok: true, name: string} | {ok: false, error: string}>}
 */
export async function applyStatusOnlyUpdateLocked(guildId, app, recordAccepted) {
  const { loadPlayerData, savePlayerData, withStorageLock } = await import('./storage.js');
  let result;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    result = applyStatusOnlyUpdate(playerData, guildId, app, recordAccepted);
    if (result.ok) await savePlayerData(playerData);
  });
  return result;
}

/**
 * Record an applicant's Accept/Decline click on a placement invite card — locked load→mutate→save.
 * Validates the record exists and the clicker IS the applicant inside the lock, then writes
 * placementResponse ('accepted' / 'accepted_alternative' for an alternate offer / 'declined').
 * The caller (placement_accept/decline handler, app.js) handles all the Discord side effects
 * (public message, channel emoji, card edit) AFTER this returns — nothing slow runs inside the lock.
 * @param {Object} p - { guildId, channelId, clickerUserId, offerType ('successful'|'alternative'), accepted }
 * @returns {Promise<{ok: true, applicantUserId: string, configId: (string|undefined)} | {ok: false, error: string}>}
 */
export async function recordPlacementResponse({ guildId, channelId, clickerUserId, offerType, accepted }) {
  const { loadPlayerData, savePlayerData, withStorageLock } = await import('./storage.js');
  let outcome;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    const appRec = playerData[guildId]?.applications?.[channelId];
    if (!appRec) { outcome = { ok: false, error: '❌ Application not found for this channel.' }; return; }
    if (clickerUserId !== appRec.userId) {
      outcome = { ok: false, error: `❌ Only <@${appRec.userId}> can respond to this placement.` };
      return;
    }
    // accepted_alternative (RaP 0902): accepting an ALTERNATE offer is distinct from a main-cast accept.
    appRec.placementResponse = accepted ? (offerType === 'alternative' ? 'accepted_alternative' : 'accepted') : 'declined';
    await savePlayerData(playerData);
    outcome = { ok: true, applicantUserId: appRec.userId, configId: appRec.configId };
  });
  return outcome;
}

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
  const { loadPlayerData, savePlayerData, withStorageLock } = await import('./storage.js');
  let saved;
  await withStorageLock(async () => {
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
    saved = playerData[guildId].castingMessages;
  });
  return saved;
}

/** Substitute the @Player token with the applicant's mention. */
export function renderInviteMessage(template, userId) {
  return (template || '').replace(/@Player\b/g, `<@${userId}>`);
}

/**
 * Compute which applicants get which message type for a given send mode.
 * Returns [{ channelId, userId, displayName, messageType }]. Undecided applicants are always skipped.
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

/** Human words for the single-invite "Send {name} …" option, keyed by the applicant's messageType. */
const SINGLE_SEND_WORD = { successful: 'Casting Offer', alternative: 'Alternate Message', unsuccessful: 'Unsuccessful Message' };

/**
 * Build the Casting Invites modal (3 templates + a required "what to do on submit" select).
 * Pre-fills templates from saved guild messages (or defaults). The template fields are identical for both
 * variants; only the final select differs:
 *  - BULK (default): 6 options (draft / all / successful / unsuccessful / alternative / selected).
 *  - SINGLE (opts.single, from the per-applicant ✒️ Send button): Save as draft, "Send {name} {msg}"
 *    (value 'selected', envelope), "Update Status Only - Offered"/"- Notified" (value 'status_only', 🕵️ —
 *    stamp offerStatus, no send) + — for Cast/Alternate only, no accepted state exists for Don't Cast —
 *    "Update Status Only - Accepted" (value 'status_only_accepted', 🎉 — ALSO stamps placementResponse,
 *    for recording an accept the host confirmed outside CastBot, e.g. over DM).
 * @param {Object} [opts] - { single, applicantName, castingStatus } for the single-applicant variant.
 */
export function buildCastingInvitesModal(playerData, guildId, appIndex, configId, opts = {}) {
  const msgs = getCastingMessages(playerData, guildId, configId);
  const input = (custom_id, label, description, value) => ({
    type: 18, label, description,
    component: { type: 4, custom_id, style: 2, max_length: 4000, required: false, ...(value ? { value } : {}) }
  });

  let modeOptions;
  if (opts.single) {
    const messageType = CASTING_STATUS_TO_MESSAGE[opts.castingStatus]; // 'successful' | 'alternative' | 'unsuccessful' | undefined
    const word = SINGLE_SEND_WORD[messageType] || 'Message';
    const name = opts.applicantName || 'this applicant';
    const sendLabel = `Send ${name} ${word}`.slice(0, 100); // select option label cap
    // Don't Cast has no "accepted" concept (unsuccessful cards ship with no Accept/Decline buttons) —
    // "Notified" reads correctly there, where "Offered" implies a spot that doesn't exist.
    const offeredLabel = messageType === 'unsuccessful' ? 'Update Status Only - Notified' : 'Update Status Only - Offered';
    modeOptions = [
      { label: 'Save as draft only', value: 'draft', emoji: { name: '💾' }, description: 'Save the templates, send nothing', default: true },
      { label: sendLabel, value: 'selected', emoji: { name: '📨' }, description: 'Sends the relevant msg above to their app channel (with a Check-In button if Cast/Alternate)'.slice(0, 100) },
      { label: offeredLabel, value: 'status_only', emoji: { name: '🕵️' }, description: "Use to tell CastBot when you've manually messaged an applicant".slice(0, 100) }
    ];
    if (ACCEPTED_RESPONSE_FOR_STATUS[opts.castingStatus]) {
      modeOptions.push({
        label: 'Update Status Only - Accepted',
        value: 'status_only_accepted',
        emoji: { name: '🎉' },
        description: 'Records an accept confirmed outside CastBot (e.g. DM) — same as them clicking Accept'.slice(0, 100)
      });
    }
  } else {
    modeOptions = [
      { label: 'Save as draft only', value: 'draft', emoji: { name: '💾' }, description: 'Save the templates, send nothing', default: true },
      { label: 'Send ALL now (Cast + Alternate + Reject)', value: 'all', emoji: { name: '📨' } },
      { label: 'Send Successful only', value: 'successful', emoji: { name: '🎬' } },
      { label: "Send Unsuccessful only", value: 'unsuccessful', emoji: { name: '🗑️' } },
      { label: 'Send Alternative only', value: 'alternative', emoji: { name: '🔄' } },
      { label: 'Send to currently selected applicant only', value: 'selected', emoji: { name: '👤' } }
    ];
  }

  return {
    custom_id: `casting_messages_save:${appIndex}:${configId}`,
    title: opts.single ? 'Send Casting Invite' : 'Casting Invites',
    components: [
      input('msg_successful', 'Successful Message (Cast)', 'Sent to 🎬 Cast applicants. Use @Player to tag each player.', msgs.successful),
      input('msg_alternative', 'Alternative / Backup Message', 'Sent to 🔄 Alternative applicants. Use @Player to tag each player.', msgs.alternative),
      input('msg_unsuccessful', "Unsuccessful Message (Don't Cast)", 'Sent to 🗑️ Don\'t Cast applicants. Use @Player to tag each player.', msgs.unsuccessful),
      {
        type: 18,
        label: 'What do you want to do when you submit this?',
        description: 'Undecided applicants (no casting decision) are never messaged.',
        component: {
          type: 3, custom_id: 'invite_mode', required: true, min_values: 1, max_values: 1,
          options: modeOptions
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
    ? `⚠️ No applicants match this option (Undecided applicants are never messaged). Nothing will be sent.`
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
 * Returns { sent, failed, skippedEmpty, perType, channels }. `channels` carries the channelId of every
 * target bucketed by outcome (`{ sent: [], failed: [], skippedEmpty: [] }`) — lets the caller render
 * `<#channelId>` jump-links next to the counts instead of a bare number (e.g. "1 skipped" with no way
 * to tell WHICH applicant that was).
 */
export async function sendCastingInvites({ client, guildId, configId, mode, appIndex, messages }) {
  const { loadPlayerData, savePlayerData, getApplicationsForSeason, withStorageLock } = await import('./storage.js');
  const { DiscordRequest } = await import('./utils.js');
  // Pure read for target selection — the write happens in a SHORT locked cycle after the send loop.
  // The old shape (mutate this copy during the loop, save at the end) held a stale playerData snapshot
  // across the whole throttled send (~700ms × N targets) and its final save silently erased any
  // concurrent write landing in that window — the exact incident-05 lost-write shape.
  const playerData = await loadPlayerData();
  const allApplications = await getApplicationsForSeason(guildId, configId);
  const targets = selectInviteTargets(allApplications, playerData, guildId, mode, appIndex);

  // Stage 2 (RaP 0902): a SENT invite stamps offerStatus on the application (drives the Casting chevron).
  const OFFER_FOR_TYPE = { successful: 'offer', alternative: 'offer_alternative', unsuccessful: 'offer_rejected' };
  const stamped = []; // { channelId, offer } per successful send — applied under the lock below

  const result = {
    sent: 0, failed: 0, skippedEmpty: 0,
    perType: { successful: 0, alternative: 0, unsuccessful: 0 },
    channels: { sent: [], failed: [], skippedEmpty: [] }
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const template = messages[t.messageType];
    if (!template || !template.trim()) { result.skippedEmpty++; result.channels.skippedEmpty.push(t.channelId); continue; }
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
      result.channels.sent.push(t.channelId);
      // Queue the offer stamp (chevron Stage 2). Only on a confirmed send; written under the lock below.
      const offer = OFFER_FOR_TYPE[t.messageType];
      if (offer) stamped.push({ channelId: t.channelId, offer });
    } catch (err) {
      console.log(`⚠️ sendCastingInvites: failed to message channel ${t.channelId}: ${err.message}`);
      result.failed++;
      result.channels.failed.push(t.channelId);
    }
    if (i < targets.length - 1) await sleep(700); // rate-limit-safe spacing
  }
  if (stamped.length > 0) {
    await withStorageLock(async () => {
      const fresh = await loadPlayerData();
      const nowIso = new Date().toISOString();
      for (const { channelId, offer } of stamped) {
        const rec = fresh[guildId]?.applications?.[channelId];
        if (rec) { rec.offerStatus = offer; rec.offerSentAt = nowIso; }
      }
      await savePlayerData(fresh);
    });
  }
  console.log(`📨 sendCastingInvites [${mode}] guild ${guildId}: sent ${result.sent}, failed ${result.failed}, skippedEmpty ${result.skippedEmpty}`);
  return result;
}

/**
 * Build the "📨 Invites Sent" confirmation card shown after a send completes (bulk or single).
 * Jump-links each failed/skipped channel — a bare "1 skipped" count left no way to tell WHICH
 * applicant that was without hunting through every template. Capped so a large bulk send can't
 * blow past Discord's text-display length.
 * @param {Object} r - the sendCastingInvites() result
 * @returns {Object} { components: [container] } (updateMessage response)
 */
export function buildInvitesSentSummary(r) {
  const linkChannels = (ids, cap = 15) => {
    const shown = ids.slice(0, cap).map(id => `<#${id}>`).join(', ');
    return ids.length > cap ? `${shown} +${ids.length - cap} more` : shown;
  };
  const parts = [
    r.perType.successful ? `🎬 Successful → ${r.perType.successful}` : null,
    r.perType.alternative ? `🔄 Alternative → ${r.perType.alternative}` : null,
    r.perType.unsuccessful ? `🗑️ Unsuccessful → ${r.perType.unsuccessful}` : null
  ].filter(Boolean);
  const extra = [
    r.failed ? `⚠️ ${r.failed} failed: ${linkChannels(r.channels.failed)}` : null,
    r.skippedEmpty ? `${r.skippedEmpty} skipped (empty template): ${linkChannels(r.channels.skippedEmpty)}` : null
  ].filter(Boolean);
  const summary = `## 📨 Invites Sent\n**${r.sent}** message${r.sent !== 1 ? 's' : ''} delivered.\n${parts.join(' · ') || '-# Nothing to send.'}${extra.length ? `\n-# ${extra.join('\n-# ')}` : ''}`;
  return { components: [{ type: 17, accent_color: 0x27ae60, components: [{ type: 10, content: summary }] }] };
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
 * Which tribe role IDs Marooning (Tribes line, Draft Tribes, roster grouping) treats as "this guild's
 * tribes". Simplified from the old 3-format castlist-membership check (castlistIds[]/castlistId/legacy
 * castlist string, matched against the 'default' castlist) to a direct existence check: every tribe
 * CastBot knows about, whose Discord role still exists. Robustness win — the legacy format-matching had
 * real gaps (e.g. a tribe created via the "Tribes (Legacy)" debug flow has NO castlistIds at all and
 * could silently fail every one of the three format checks).
 * @param {Object} playerData
 * @param {string} guildId
 * @param {import('discord.js').Guild} [guild] - when omitted, deleted-role filtering is skipped
 * @returns {string[]} tribe role IDs
 */
function getMarooningTribeRoleIds(playerData, guildId, guild) {
  // Skip null/undefined tribe entries — prod data really contains them, which is why the virtual
  // adapter guards `if (!tribe) continue` in three places. Without this, a nulled-out tribe whose
  // Discord role still exists would resurrect here (count toward canDraft, render in the Tribes line).
  const allTribeIds = Object.entries(playerData[guildId]?.tribes || {})
    .filter(([, tribe]) => tribe)
    .map(([roleId]) => roleId);
  return guild ? allTribeIds.filter(rid => guild.roles.cache.has(rid)) : allTribeIds;
}

/**
 * 🚣 Marooning tab — the season-wide casting-decision summary (formerly the "Casting Summary" button).
 * Now a first-class Season Manager tab: shared seasonManagerHeader('marooning') + buildSeasonNavRow(…,
 * 'marooning') + the casting-status breakdown + the shared [← Seasons][Edit][🗑️ Show/Hide Rejects] bottom
 * row. LEAN chrome, consistent with the Apps/Planner/Casting tabs. Reached via season_marooning_{configId}
 * (and the legacy ranking_view_all_scores_* which now delegates here). Pure render — caller supplies
 * playerData + seasonName.
 * @param {Object} p - { configId, guildId, playerData, seasonName, guild, userId, showRejects }
 * @param {string} [p.userId] - viewer; gates the hidden Channels tab in the nav row
 * @param {boolean} [p.showRejects] - reveal the Don't Cast/Withdrawn roster (hidden by default; toggled
 *   via marooning_show_rejects_{configId} / marooning_hide_rejects_{configId})
 * @returns {Object} { components: [container] } (updateMessage pattern; caller adds ephemeral flags if needed)
 */
export async function buildMarooningView({ configId, guildId, playerData, seasonName, guild, userId = null, showRejects = false }) {
  const { getApplicationsForSeason, getAllApplicationsFromData } = await import('./storage.js');
  const { buildSeasonNavRow, seasonManagerHeader, buildSeasonBottomRow } = await import('./seasonSelector.js');

  const allApplications = (configId && configId !== 'navigation')
    ? await getApplicationsForSeason(guildId, configId)
    : await getAllApplicationsFromData(guildId);

  // Per-applicant score + casting decision (userId kept for the private draft-tribe grouping below).
  // Grouping + score sort live in computeCastingOrder — shared with the Casting jump-select.
  // Only `groups` is needed here; the flat `ordered` list was solely for the deleted SUMMARY's score tally.
  const { groups: castGroups } = computeCastingOrder(allApplications, playerData, guildId, guild);

  // ===== 🏕️ Tribes — loaded up here because the casting list below groups players by their PRIVATE
  // draft-tribe assignment, and the Draft Tribes button needs the tribe count. Deleted-role tribes are
  // silently excluded (display-only filter — the Castlist Hub is the place that detects orphans and
  // CLEANS the data); with none left this renders exactly like no tribes configured (Tribes: None,
  // Draft disabled, draftees of the dead tribe fall back to the undrafted list below). =====
  const tribeRoleIds = getMarooningTribeRoleIds(playerData, guildId, guild);
  const tribes = playerData[guildId]?.tribes || {};
  const tribesLine = tribeRoleIds.length > 0
    ? `**Tribes:** ${tribeRoleIds.map(id => `${tribes[id]?.emoji || '🏕️'} <@&${id}>`).join(', ')}`
    : '**Tribes:** None';

  // Private draft-tribe assignments (season-scoped, HOST-ONLY). Stored under applicationConfigs[configId]
  // .draftTribes — physically OFF the tribe objects, and NO Discord roles are assigned — so no player-facing
  // tribe/castlist renderer can ever surface them. userId → EVERY tribe roleId that drafted them.
  //
  // Was first-tribe-wins (uid → one rid), which made this view silently disagree with the draft modal:
  // the modal is user-keyed and shows a player pre-selected in BOTH tribes they were drafted into, while
  // this view showed them under only the first — so the second tribe looked empty. Observed on TEST
  // 2026-08-09 (CastBot-Test drafted into two tribes; the "Any" tribe rendered with no players).
  const draftTribes = playerData[guildId]?.applicationConfigs?.[configId]?.draftTribes || {};
  const userDraftTribes = {};
  for (const [rid, ids] of Object.entries(draftTribes)) {
    for (const uid of (ids || [])) { (userDraftTribes[uid] ||= []).push(rid); }
  }

  // Warm the member cache before resolving demographics — pronoun/timezone are read off
  // member.roles.cache, which Discord.js only populates for members it has actually seen/fetched
  // (same gotcha castlistDataAccess.js hit for tribe rendering: "role.members is a FILTERED VIEW of
  // the member cache"). A per-row fetch would risk a fetch storm on a large roster, so bulk-fetch once
  // via the gateway, capped at 10s so one slow guild can't hang the whole view. NOTE: discord.js's
  // fetch-all timeout option is `time`, NOT `timeout` — an unknown key is silently ignored and the
  // default 120s applies (this exact bug shipped here first, copied from castlistDataAccess.js).
  if (guild && guild.members.cache.size < guild.memberCount * 0.8) {
    try {
      await guild.members.fetch({ time: 10000 });
    } catch (e) {
      console.warn(`⚠️ Marooning: bulk member fetch failed/timed out, continuing with partial cache: ${e.message}`);
    }
  }

  // "{age}yo | @{pronoun} | @{timezone}", rendered INLINE on the player's own row. Same age/pronoun/
  // timezone order as the Casting card's 👤 Overview line, but "yo"-suffixed. Was a `-#` subtext line
  // underneath each player until 2026-08-09 — that doubled the height of every roster and made a
  // 20-player tribe a wall of alternating lines. Not a backtick code span: a long inline code span
  // wraps into several disconnected-looking pill boxes on Discord mobile.
  const demographicsInline = (playerUserId, app = null) => {
    const member = guild?.members?.cache?.get(playerUserId);
    const { age, pronounName, timezoneName } = resolvePlayerDemographics(playerData, guildId, playerUserId, member, guild, app);
    const bits = [age ? `${age}yo` : null, pronounName ? `@${pronounName}` : null, timezoneName ? `@${timezoneName}` : null].filter(Boolean);
    return bits.join(' | ');
  };

  // `counter` is a mutable { n } threaded through a render pass so numbering can run continuously
  // ACROSS multiple calls (Cast → Alternate → Undecided share one; see below) instead of restarting
  // per group/tribe-bucket.
  //
  // ONE line per player: "2. ReeceBot - 27yo | @Ask | @CST / CDT". Scores/vote counts used to lead the
  // row ("5.0/5.0 (1 vote)") with demographics on a second line beneath; both went 2026-08-09 (Reece) —
  // by the time you're marooning, the decision is already made, so the score was noise crowding out the
  // detail you actually plan tribes with. Ordering still runs highest-score-first via computeCastingOrder,
  // so the ranking hasn't been lost, just stopped being restated on every row. Full scores stay one click
  // away on the 🏆 Casting tab.
  // Accepted values that count as "responded — yes". A declined player still has `offerStatus` set (an
  // offer WAS sent), so it ranks alongside "awaiting reply" — its own flag is what distinguishes it.
  const OFFER_STAGE_ACCEPTED = new Set(['accepted', 'accepted_alternative']);
  const offerStageRank = (p) => OFFER_STAGE_ACCEPTED.has(p.placementResponse) ? 0 : (p.offerStatus ? 1 : 2);

  // Offer-progress flags. Accepted is the DONE state and carries no marker — flagging every row would
  // make the exceptions invisible, so only outstanding work is marked. Replaces the old three
  // "- Accepted / - Offer Sent / - Draft" sub-headings (2026-08-09): those split each tribe into three
  // separate blocks, so you could never see a tribe's actual roster in one place.
  const FLAG_NO_OFFER = '⚠️✒️';
  const FLAG_AWAITING = '⚠️📨';
  const FLAG_DECLINED = '⚠️🚫';
  const flagsUsed = new Set();
  const offerFlagFor = (p) => {
    if (OFFER_STAGE_ACCEPTED.has(p.placementResponse)) return '';
    if (p.placementResponse === 'declined') return FLAG_DECLINED;
    return p.offerStatus ? FLAG_AWAITING : FLAG_NO_OFFER;
  };

  const renderRow = (p, counter, opts = {}) => {
    // Flags only where an offer is actually expected (Cast / Alternate). An Undecided or Don't Cast
    // player has nothing outstanding by definition, so flagging them would be pure noise.
    const flag = opts.offerFlags ? offerFlagFor(p) : '';
    if (flag) flagsUsed.add(flag);
    counter.n += 1;
    const demo = demographicsInline(p.userId, p.app);
    return `${counter.n}. ${p.name}${demo ? ` - ${demo}` : ''}${flag ? ` ${flag}` : ''}`;
  };

  // Renders a (already score-sorted) player list, sub-grouped by private draft tribe same as before,
  // numbering via the shared `counter`. Rows within a group butt directly against each other (no blank
  // line between entries — keeps a long roster scannable on mobile); the trailing \n\n only separates
  // this whole group from whatever comes next. Returns '' for an empty list (caller skips the header).
  // A player drafted into several tribes is rendered under EACH of them (deliberate — it mirrors the
  // draft modal, where they show pre-selected in every one). They therefore consume a numbering slot per
  // appearance; seeing the same name twice IS the signal that they still need to be assigned to one tribe.
  const renderPlayerList = (players, counter, opts = {}) => {
    if (players.length === 0) return '';
    const perTribe = new Map();
    const undrafted = [];
    for (const p of players) {
      const rids = (userDraftTribes[p.userId] || []).filter(rid => tribeRoleIds.includes(rid));
      if (rids.length) {
        for (const rid of rids) {
          if (!perTribe.has(rid)) perTribe.set(rid, []);
          perTribe.get(rid).push(p);
        }
      } else {
        undrafted.push(p);
      }
    }
    // Furthest-along first within each tribe (accepted → awaiting reply → no offer yet), so the rows
    // still needing action sink to the bottom of their tribe. This is the ordering the old three
    // sub-headings gave for free; a stable sort keeps score order inside each stage.
    const byStage = (list) => (opts.offerFlags ? [...list].sort((a, b) => offerStageRank(a) - offerStageRank(b)) : list);
    const headCount = (n) => `${n} player${n === 1 ? '' : 's'}`;

    let out = '';
    for (const rid of tribeRoleIds) {
      const tribePlayers = perTribe.get(rid);
      if (!tribePlayers?.length) continue;
      // "(N players)" replaced "(tentative)" — the draft-ness is already stated by the Tribes blurb
      // above, whereas tribe SIZE is the number you're actually balancing against while marooning.
      // Leading "> " renders the tribe name as a quote block, giving each tribe a visible left rule
      // that separates it from the numbered rows beneath it.
      out += `> <@&${rid}> (${headCount(tribePlayers.length)})\n${byStage(tribePlayers).map(p => renderRow(p, counter, opts)).join('\n')}\n\n`;
    }
    if (undrafted.length) {
      if (perTribe.size > 0) out += `-# Not yet drafted to a tribe (${headCount(undrafted.length)})\n`;
      out += `${byStage(undrafted).map(p => renderRow(p, counter, opts)).join('\n')}\n\n`;
    }
    return out;
  };

  // The planner intro is its OWN Text Display so the [Add Cast][Bulk Offers] row can sit between it and
  // the roster. Keeping them in one string (as before) would force the buttons above the header or below
  // the whole roster — neither is where the actions belong.
  const plannerIntro = '### ```🚣‍♀️ Marooning Planner```\n' +
    'Use this tab to review all of your casting decisions, make sure everyone has accepted their ' +
    'placement and plan / balance tribes ahead of marooning.';

  let body = '';

  // Cast, Alternate, and Undecided share ONE continuous counter: a host tracking toward a target cast
  // size wants a single running count across everyone still "in consideration". Don't Cast and Withdrawn
  // are NOT candidates, so each gets its own counter that restarts at 1 (see the loop below).
  const candidateCounter = { n: 0 };
  // Cast Players' header becomes "(N/Est)" when the Season Planner's "Estimated Number of Players"
  // (season_edit_info → estimatedTotalPlayers) is set — lets a host see progress toward their target
  // cast size at a glance. Deliberately NOT capped: exceeding the estimate (e.g. 22/18) is valid and
  // should show as-is, not clamp or warn.
  const estimatedTotalPlayers = playerData[guildId]?.applicationConfigs?.[configId]?.estimatedTotalPlayers;
  // `offerFlags`: sections where an offer is expected, so an outstanding one is worth flagging per row.
  // Undecided has nothing to chase (you can't offer a spot you haven't decided on), so it stays unflagged.
  const CANDIDATE_SECTIONS = [
    { emoji: '✅', title: 'Cast Players', group: castGroups.cast, offerFlags: true, countSuffix: estimatedTotalPlayers != null ? `/${estimatedTotalPlayers}` : '' },
    { emoji: '🔄', title: 'Alternate', group: castGroups.alternative, offerFlags: true },
    { emoji: '⚪', title: 'Undecided', group: castGroups.undecided, offerFlags: false }
  ];
  const hasCandidates = CANDIDATE_SECTIONS.some(s => s.group.length > 0);
  for (const section of CANDIDATE_SECTIONS) {
    if (section.group.length === 0) continue;
    body += `### \`\`\`${section.emoji} ${section.title} (${section.group.length}${section.countSuffix || ''})\`\`\`\n`;
    // ONE list per section, grouped by tribe. Cast/Alternate used to fan out into three
    // "- Accepted / - Offer Sent / - Draft" sub-blocks, which meant a tribe's roster was scattered
    // across three places and you could never see its shape at a glance — the exact thing you're on
    // this tab to do. The per-row ⚠️ flags carry the same information without the fragmentation.
    body += renderPlayerList(section.group, candidateCounter, { offerFlags: section.offerFlags });
  }

  // Not candidates — Don't Cast and Withdrawn each restart their OWN numbering at 1. HIDDEN by default
  // (🗑️ Show/Hide Rejects toggle in the bottom row, marooning_{show|hide}_rejects_{configId}) — Marooning
  // is primarily a "who's still in the running" view, so rejected/withdrawn applicants are noise most of
  // the time.
  const NON_CANDIDATE_SECTIONS = [
    { emoji: '🙅', title: "Don't Cast", group: castGroups.reject },
    { emoji: '✖️', title: 'Withdrawn', group: castGroups.withdrawn }
  ];
  const hasRejects = castGroups.reject.length > 0 || castGroups.withdrawn.length > 0;
  if (showRejects) {
    for (const section of NON_CANDIDATE_SECTIONS) {
      if (section.group.length === 0) continue;
      body += `### \`\`\`${section.emoji} ${section.title} (${section.group.length})\`\`\`\n`;
      body += renderPlayerList(section.group, { n: 0 });
    }
  } else if (hasRejects) {
    const hiddenCount = castGroups.reject.length + castGroups.withdrawn.length;
    body += `-# 🗑️ ${hiddenCount} Don't Cast/Withdrawn applicant${hiddenCount !== 1 ? 's' : ''} hidden — click Rejects below to view.\n\n`;
  }

  // ⚠️ Drafted, but has no application for this season. The draft modal's User Select offers EVERY server
  // member, while every roster above is built from applications[channelId] — so these people were silently
  // invisible here, and a tribe could look half-empty with no explanation (TEST, 2026-08-09). They can't be
  // scored, sent an offer, or accept a placement until an application exists (👥 Add Cast creates one), so
  // they get their own block rather than being folded into a casting group they aren't part of.
  const applicantUserIds = new Set(allApplications.map(a => a.userId));
  const orphanDrafts = [];
  for (const rid of tribeRoleIds) {
    const ids = (draftTribes[rid] || []).filter(uid => !applicantUserIds.has(uid));
    if (ids.length) orphanDrafts.push({ rid, ids });
  }
  if (orphanDrafts.length) {
    const total = orphanDrafts.reduce((n, t) => n + t.ids.length, 0);
    body += `### \`\`\`⚠️ Drafted — No Application (${total})\`\`\`\n`;
    for (const { rid, ids } of orphanDrafts) {
      // Mentions, not cached display names — a drafted member may not be in the member cache at all.
      body += `> <@&${rid}> (${ids.length} player${ids.length === 1 ? '' : 's'})\n${ids.map(uid => `• <@${uid}> — ⚠️ no application`).join('\n')}\n`;
    }
    body += `-# Drafted but never applied — they can't be scored or sent an offer. Use 👥 Add Cast to create their application.\n\n`;
  }

  if (!hasCandidates && !hasRejects && !orphanDrafts.length) body += '-# No applicants yet for this season.\n\n';

  // ⚠️ Same person, several application channels for ONE season. They render once per application, so a
  // duplicate silently inflates the cast count and gets counted twice when balancing tribes. Possible
  // because createApplicationChannel's duplicate guard matches on channel NAME within the category —
  // rename a channel (or change the season's channelFormat) and the same person can apply again.
  const appsByUser = new Map();
  for (const a of allApplications) {
    if (!appsByUser.has(a.userId)) appsByUser.set(a.userId, []);
    appsByUser.get(a.userId).push(a);
  }
  const duplicated = [...appsByUser.entries()].filter(([, apps]) => apps.length > 1);
  if (duplicated.length) {
    body += `### \`\`\`⚠️ Duplicate Applications (${duplicated.length})\`\`\`\n`;
    for (const [uid, apps] of duplicated) {
      body += `• <@${uid}> — **${apps.length}** application channels: ${apps.map(a => `<#${a.channelId}>`).join(', ')}\n`;
    }
    body += `-# Counted once per channel, so they're inflating the totals above. Open the extra channel and use ✖️ Withdraw to drop it out of the roster.\n\n`;
  }

  // 🔑 Key — only the flags actually present. A permanent legend for states nobody is in is just clutter.
  if (flagsUsed.size) {
    const KEY_LINES = [
      [FLAG_NO_OFFER, "Hasn't been sent an offer — send one with ✒️ Bulk Offers, or ✒️ Send Offer on the 🏆 Casting tab."],
      [FLAG_AWAITING, "Offer sent, no reply yet — they haven't accepted or declined."],
      [FLAG_DECLINED, 'Declined their placement — they are NOT playing unless you re-offer.'],
    ].filter(([flag]) => flagsUsed.has(flag));
    body += `> **Key**\n${KEY_LINES.map(([flag, text]) => `> ${flag} ${text}`).join('\n')}\n\n`;
  }
  // The 📊 SUMMARY block (Total/Cast/Alternate/Undecided/Rejected/Withdrawn + Scored) lived here until
  // 2026-08-09. Removed deliberately (Reece): every number in it is already visible in the section
  // headers directly above, so it was pure restatement taking up the tab's most valuable space.
  // Its own Text Display now, so it must never be empty — Discord rejects a blank type 10.
  body = body.trimEnd() || '-# No applicants yet for this season.';

  // 🏕️ Tribes section — the New Tribe button REUSES the Castlist Hub's button (tribe_add_button|default)
  // but carries a marooning origin, which makes it PRIVATE: no member assignment, no castlist link (see
  // app.js tribe_add_modal). 💭 Draft Tribes opens the private draft modal (needs ≥1 tribe, else disabled).
  const canDraft = tribeRoleIds.length >= 1;
  const tribesIntro = 'Use Draft Tribes to play around with different casting combinations and balance ' +
    'as you see fit. Only Prod can see this - tribes only become public when added to a castlist.';

  // 👥 Add Cast — creates application channels for cast who never clicked Apply (late additions, people
  // recruited off-Discord). Sits LEFT of Bulk Offers: you add the people first, then message them.
  const addCastButton = { type: 2, custom_id: `marooning_add_cast_${configId}`, label: 'Add Cast', style: 2, emoji: { name: '👥' } };

  // ✒️ Bulk Offers — season-level bulk sends (Cast/Alternate/Reject templates → applicant channels).
  // appIndex is baked as 0: it's only read by the modal's "selected applicant" mode, which is N/A from
  // this season-level view (guarded by a name-showing confirm card). Was "Bulk Invites" in the bottom row
  // until 2026-08-09; the custom_id is deliberately unchanged so in-flight interactions keep working.
  const bulkOffersButton = { type: 2, custom_id: `casting_messages_0_${configId}`, label: 'Bulk Offers', style: 2, emoji: { name: '✒️' } };

  // 🗑️ Rejects — toggles the Don't Cast/Withdrawn roster. Label stays static ("Rejects", not
  // "Show/Hide Rejects") — the body text already makes the current state obvious. Disabled when
  // there's nothing to reveal (both groups empty) rather than offering a dead-end click.
  const rejectsToggleButton = {
    type: 2,
    custom_id: showRejects ? `marooning_hide_rejects_${configId}` : `marooning_show_rejects_${configId}`,
    label: 'Rejects', style: 2, emoji: { name: '🗑️' }, disabled: !hasRejects
  };

  const container = {
    type: 17,
    accent_color: 0x9B59B6, // Purple — matches the casting interface
    components: [
      seasonManagerHeader('marooning', seasonName),
      buildSeasonNavRow(configId, 'marooning', userId),
      { type: 14 },
      // Casting decisions lead the tab — it's what hosts come here for. Tribes moved below (2026-08-09).
      { type: 10, content: plannerIntro },
      { type: 1, components: [addCastButton, bulkOffersButton] },
      { type: 10, content: body },
      { type: 14 },
      { type: 10, content: `### \`\`\`🏕️ Tribes\`\`\`\n${tribesIntro}` },
      { type: 1, components: [
        // New Tribe reuses the Castlist Hub button, but carries a 'marooning_{configId}' origin. That origin
        // does double duty: the modal SUBMIT refreshes THIS Marooning message, AND the tribe is created
        // PRIVATELY (no members assigned, not linked to a castlist) — see app.js tribe_add_button/modal.
        { type: 2, custom_id: `tribe_add_button|default|marooning_${configId}`, label: 'New Tribe', style: 2, emoji: { name: '🏕️' } },
        { type: 2, custom_id: `marooning_draft_tribes_${configId}`, label: 'Draft Tribes', style: 2, emoji: { name: '💭' }, disabled: !canDraft }
      ]},
      { type: 10, content: tribesLine },
      { type: 14 },
      buildSeasonBottomRow(configId, 'marooning', [rejectsToggleButton])
    ]
  };

  const { countComponents } = await import('./utils.js');
  countComponents([container], { verbosity: 'summary', label: `Marooning - ${seasonName}` });

  return { components: [container] };
}

/**
 * Parses the 🗑️ Show/Hide Rejects toggle's custom_id and re-renders Marooning with the flag flipped.
 * Caller (app.js) owns the permission gate + playerData load; this is just the configId/seasonName/
 * render plumbing, kept out of app.js per the router-not-processor rule.
 * @param {string} customId - marooning_show_rejects_{configId} or marooning_hide_rejects_{configId}
 * @returns {Promise<Object>} a buildMarooningView response
 */
export async function renderMarooningRejectsToggle(customId, guildId, userId, guild, playerData) {
  const showRejects = customId.startsWith('marooning_show_rejects_');
  const configId = customId.replace(showRejects ? 'marooning_show_rejects_' : 'marooning_hide_rejects_', '');
  const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || `Season ${configId}`;
  return buildMarooningView({ configId, guildId, playerData, seasonName, guild, userId, showRejects });
}

/**
 * 💭 Draft Tribes modal — up to 5 PRIVATE User Selects, one per known tribe. Provisional, host-only
 * assignments: submitting does NOT assign Discord roles and does NOT notify anyone (see the
 * marooning_draft_tribes_modal submit handler in app.js). Reassuring copy (ComponentsV2) on every label.
 * Pre-fills each select with the current draft (default_values). Returns null when 0 tribes exist (nothing
 * to draft into). If >5 tribes, only the first 5 are shown and the LAST label warns to trim the castlist.
 * @param {Object} p - { configId, guildId, playerData, guild }
 * @returns {Object|null} a MODAL response ({ type: 9, data }) or null
 */
export async function buildDraftTribesModal({ configId, guildId, playerData, guild }) {
  const tribeRoleIds = getMarooningTribeRoleIds(playerData, guildId, guild);
  if (tribeRoleIds.length === 0) return null; // need ≥1 tribe to draft into

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
    const view = await buildMarooningView({ configId: extractedConfigId, guildId, playerData, seasonName, guild, userId });
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
    const { ordered } = computeCastingOrder(allApplications, playerData, guildId, guild);
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