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
const rankingHeader = (seasonName) => ({ type: 10, content: `## 🏆 Casting\n> ### ${seasonName}` });

/**
 * Empty-state Casting screen (season has no applications yet). Reuses the shared header +
 * the active-tab nav row so it's identical chrome to the populated view (Ranking tab shaded blue).
 * @param {string} seasonName
 * @param {string} configId
 */
export async function buildRankingEmptyState(seasonName, configId) {
  const { buildSeasonNavRow } = await import('./seasonSelector.js');
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2 (factory adds ephemeral / strips for updateMessage)
    components: [{
      type: 17,
      components: [
        rankingHeader(seasonName),
        buildSeasonNavRow(configId, 'ranking'),
        { type: 14 },
        { type: 10, content: `📭 **No applications yet** for this season.\n-# Applicants appear here once they apply via this season's application button.` },
        { type: 14 },
        { type: 1, components: [{ type: 2, custom_id: 'season_manager', label: '← Seasons', style: 2 }] }
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
  
  // Applicant identity (avatar + name/pronouns/age/timezone/local-time) is rendered via the SHARED
  // player-card Section (createPlayerDisplaySection) — built just before container assembly below.
  // It replaces the old big Media Gallery avatar with a compact Section + Thumbnail, identical to
  // the Player Menu / application-channel card.

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
  
  // Create voting breakdown if there are votes - inline implementation for now
  let votingBreakdown = null;
  const rankingEntries = Object.entries(allRankings).filter(([_, score]) => score !== undefined);
  
  if (rankingEntries.length > 0) {
    // Sort by score (highest to lowest)
    rankingEntries.sort(([_a, scoreA], [_b, scoreB]) => scoreB - scoreA);
    
    // Calculate average
    const scores = rankingEntries.map(([_, score]) => score);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    
    // Header is rendered as a standalone "### 🗳️ Votes" component (above the 1-5 buttons), so the
    // tally text starts at the average line.
    let votingText = `> **Average:** ${avgScore}/5.0 (${scores.length} vote${scores.length !== 1 ? 's' : ''})\n`;
    
    // Build vote list with member names
    for (const [userId, score] of rankingEntries) {
      try {
        const member = await guild.members.fetch(userId);
        const displayName = member.displayName || member.user.username;
        const stars = '⭐'.repeat(score);
        votingText += `• ${displayName}: ${stars} (${score}/5)\n`;
      } catch (error) {
        console.log(`Could not fetch member ${userId} for voting breakdown:`, error.message);
        votingText += `• Unknown Member: ${'⭐'.repeat(score)} (${score}/5)\n`;
      }
    }
    
    votingBreakdown = {
      type: 10, // Text Display
      content: votingText
    };
  }
  
  // (Applicant identity — name / pronouns / age / timezone / local time — is now rendered by the
  //  shared player-card Section built below, so the old inline demographic + name computation was
  //  removed. createPlayerDisplaySection derives all of it from the guild member + playerData.)

  // Build DNC warnings and summary for this applicant
  const { findDncConflicts, buildDncWarnings, buildDncSummary } = await import('./dncManager.js');
  const appData = playerData[guildId]?.applications?.[currentApp.channelId] || {};
  const dncConflicts = findDncConflicts(appData, allApplications, playerData, guildId);
  const dncWarningText = buildDncWarnings(dncConflicts);
  const dncSummaryText = buildDncSummary(appData);

  // ===== Build the Casting card (Components V2) =====
  // Layout: header → tab nav → jump-select → identity Section → [DNC warning] →
  //         Casting (status + workflow) → Votes (1-5 + tally) → Player Notes → bottom nav.
  // Applicant DNC summary is folded into the identity Section. The app-channel link is now a Link
  // button in the utility row (see below) instead of an inline <#channel> mention.
  const applicantInfo = dncSummaryText || '';

  const { buildSeasonNavRow } = await import('./seasonSelector.js');
  const containerComponents = [
    rankingHeader(seasonName),
    // Active-tab nav row — Apps · Planner · Casting · Edit (current view = Casting, shaded blue)
    buildSeasonNavRow(configId, 'ranking'),
  ];

  // Applicant jump-select — ALWAYS rendered (state-aware placeholder). Discord requires ≥1 option,
  // so it's only ever absent on the 0-applicant empty state (a separate screen). It also replaces
  // the old ◀/▶ prev/next row for navigation.
  {
    const itemsPerPage = 23;
    const totalPages = Math.ceil(allApplications.length / itemsPerPage);
    const currentPage = Math.floor(appIndex / itemsPerPage);
    const startIdx = currentPage * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, allApplications.length);

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
      const app = allApplications[i];
      const rankings = playerData[guildId]?.applications?.[app.channelId]?.rankings || {};
      const voteCount = Object.keys(rankings).length;
      const cStatus = playerData[guildId]?.applications?.[app.channelId]?.castingStatus;
      const hasNotes = !!playerData[guildId]?.applications?.[app.channelId]?.playerNotes;

      let icon = '🗳️';
      if (cStatus === 'cast') icon = '✅';
      else if (cStatus === 'reject') icon = '❌';
      else if (voteCount >= 2) icon = '☑️';

      const position = i + 1;
      const displayName = app.displayName || 'Unknown';
      const username = app.username || 'unknown';
      const voteText = voteCount === 1 ? '1 vote' : `${voteCount} votes`;
      const notesIndicator = hasNotes ? ' 💬' : '';

      let label = `${icon} ${position}. ${displayName} (${username}) - ${voteText}${notesIndicator}`;
      if (label.length > 100) {
        const fixedParts = `${icon} ${position}. ${displayName} () - ${voteText}${notesIndicator}`;
        const availableSpace = 100 - fixedParts.length;
        if (availableSpace > 0) {
          const truncatedUsername = username.length > availableSpace ?
            username.substring(0, availableSpace - 1) + '…' : username;
          label = `${icon} ${position}. ${displayName} (${truncatedUsername}) - ${voteText}${notesIndicator}`;
        } else {
          label = label.substring(0, 97) + '...';
        }
      }

      options.push({ label, value: i.toString(), description: `Jump to ${displayName}'s application` });
    }

    if (endIdx < allApplications.length) {
      const nextStart = endIdx + 1;
      const nextEnd = Math.min(endIdx + itemsPerPage, allApplications.length);
      options.push({
        label: `▶ Show Applications ${nextStart}-${nextEnd}`,
        value: `page_${currentPage + 1}`,
        description: `View next set of applications`,
        emoji: { name: '📄' }
      });
    }

    // Placeholder doubles as the position indicator (the "Applicant N of M" text was removed above).
    let selectPlaceholder = `Applicant ${appIndex + 1} of ${allApplications.length}`;
    if (totalPages > 1) selectPlaceholder += ` · page ${currentPage + 1}/${totalPages}`;

    containerComponents.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `ranking_select_${appIndex}_${configId}_${currentPage}`,
        placeholder: selectPlaceholder,
        options,
        min_values: 1,
        max_values: 1
      }]
    });
  }
  
  // Identity Section (shared player-card builder: name • pronouns • age • timezone • 🕛 local time +
  // avatar thumbnail) with the applicant meta folded into its text. Returns null when the applicant
  // can't be resolved as a guild member (e.g. they left); fall back to a minimal name + avatar Section.
  const { createPlayerDisplaySection } = await import('./playerManagement.js');
  let identitySection = await createPlayerDisplaySection(applicantMember, playerData, guildId);
  if (!identitySection) {
    identitySection = {
      type: 9,
      components: [{ type: 10, content: `**${currentApp.displayName || currentApp.username}**\n-# ⚠️ Left server` }],
      accessory: { type: 11, media: { url: applicantAvatarURL }, description: 'Applicant avatar' }
    };
  }
  if (applicantInfo && identitySection.components?.[0]?.content !== undefined) {
    identitySection.components[0].content += `\n${applicantInfo}`;
  }

  containerComponents.push(
    { type: 14 }, // divider after the nav / select cluster
    identitySection
  );

  // DNC conflict warning — prominent, only when this applicant cross-lists someone.
  if (dncWarningText) {
    containerComponents.push({ type: 10, content: dncWarningText });
  }

  // Applicant display name + notes text (used by the sections below).
  // "Still Deciding" (value 'undecided') is the casting default when no status is set, and selecting
  // it CLEARS any existing castingStatus (see handleCastingStatus) — undecided is never stored, it's
  // simply the absence of castingStatus, so this stays backwards compatible with existing data.
  const applicantDisplayName = applicantMember?.displayName || currentApp.displayName || currentApp.username || 'Applicant';
  const isUndecided = !['cast', 'tentative', 'reject'].includes(castingStatus);
  const existingNotes = playerData[guildId]?.applications?.[currentApp.channelId]?.playerNotes;
  const notesText = existingNotes || 'Record casting notes, connections or potential issues...';

  // ---- Player Notes — Section: notes text + Edit Notes button accessory (sits ABOVE Casting) ----
  containerComponents.push({
    type: 9, // Section
    components: [
      { type: 10, content: `### \`\`\`✏️ Player Notes\`\`\`\n${notesText}` }
    ],
    accessory: {
      type: 2, // Button accessory
      custom_id: `edit_player_notes_${currentApp.channelId}_${appIndex}_${configId}`,
      label: '✏️ Edit Notes',
      style: 2
    }
  });

  // ---- Casting: header + status (string select) ----
  containerComponents.push(
    {
      type: 10,
      content: `### \`\`\`🎭 Casting\`\`\`\n-# Set your draft casting status below — change it as many times as you like; players are not notified. When you've decided who to cast, click ✒️ Invites.`
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
          { label: `Tentatively Cast ${applicantDisplayName}`, value: 'tentative', emoji: { name: '❓' }, default: castingStatus === 'tentative' }
        ]
      }]
    }
  );

  // ---- Votes: header (with applicant name) + 1-5 rating buttons + tally ----
  containerComponents.push(
    { type: 10, content: `### \`\`\`🗳️ Votes for ${applicantDisplayName}\`\`\`` },
    rankingRow.toJSON()
  );
  if (votingBreakdown) {
    containerComponents.push(votingBreakdown);
  } else {
    containerComponents.push({ type: 10, content: `-# No scores yet — click 1–5 above to rate this applicant.` });
  }

  // ---- Utility actions (App link + Invites + formerly part of the notes row) ----
  containerComponents.push({
    type: 1,
    components: [
      // Link button → jumps straight to the applicant's application channel (replaces the old
      // inline <#channel> text). Link buttons (style 5) use a url, fire no interaction, need no handler.
      { type: 2, style: 5, label: 'App', emoji: { name: '📄' }, url: `https://discord.com/channels/${guildId}/${currentApp.channelId}` },
      new ButtonBuilder()
        .setCustomId(`casting_messages_${configId}`)
        .setLabel('Invites')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✒️')
        .toJSON(),
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
      new ButtonBuilder()
        .setCustomId(`delete_application_mode_${currentApp.channelId}_${appIndex}_${configId}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .toJSON()
    ]
  });
  
  // Bottom navigation row — ← Seasons (Season Manager selector) + View All Scores (LEAN: back first)
  containerComponents.push({
    type: 1,
    components: [
      { type: 2, custom_id: `season_manager`, label: '← Seasons', style: 2 },
      { type: 2, custom_id: `ranking_view_all_scores_${configId}${ephemeralSuffix}`, label: 'View All Scores', style: 2, emoji: { name: '📊' } }
    ]
  });

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

  // Handle "view all scores" button (with or without configId)
  if (scoresMatch) {
    console.log(`🔍 DEBUG: Handling view all scores with configId: ${extractedConfigId || 'none'}`);
    
    // Get the proper season name from playerData
    let seasonName = 'Current Season';
    if (extractedConfigId) {
      const seasonConfig = playerData[guildId]?.applicationConfigs?.[extractedConfigId];
      if (seasonConfig && seasonConfig.seasonName) {
        seasonName = seasonConfig.seasonName;
      } else {
        seasonName = `Season ${extractedConfigId}`;
      }
    }
    
    let scoreSummary = `## Casting Summary\n### ${seasonName}\n\n`;
    
    // Calculate scores and casting status for each applicant
    const applicantData = allApplications.map((app, index) => {
      const rankings = playerData[guildId]?.applications?.[app.channelId]?.rankings || {};
      const scores = Object.values(rankings).filter(r => r !== undefined);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const castingStatus = playerData[guildId]?.applications?.[app.channelId]?.castingStatus || 'undecided';
      
      return {
        name: app.displayName || app.username,
        avgScore,
        voteCount: scores.length,
        castingStatus,
        index: index + 1
      };
    });
    
    console.log(`🔍 DEBUG: View all scores - found ${applicantData.length} applicants with casting status breakdown`);
    
    // Group by casting status
    const castGroups = {
      cast: applicantData.filter(app => app.castingStatus === 'cast'),
      tentative: applicantData.filter(app => app.castingStatus === 'tentative'), 
      reject: applicantData.filter(app => app.castingStatus === 'reject'),
      undecided: applicantData.filter(app => app.castingStatus === 'undecided')
    };
    
    // Sort each group by average score (highest first)
    Object.values(castGroups).forEach(group => {
      group.sort((a, b) => b.avgScore - a.avgScore);
    });
    
    // Build status sections
    const statusSections = [
      { key: 'cast', title: '✅ **CAST PLAYERS**', color: '🟢', group: castGroups.cast },
      { key: 'tentative', title: '❓ **TENTATIVE**', color: '🔵', group: castGroups.tentative },
      { key: 'reject', title: '🗑️ **DON\'T CAST**', color: '🔴', group: castGroups.reject },
      { key: 'undecided', title: '⚪ **UNDECIDED**', color: '⚫', group: castGroups.undecided }
    ];
    
    statusSections.forEach(section => {
      if (section.group.length > 0) {
        scoreSummary += `### ${section.title} (${section.group.length})\n`;
        section.group.forEach((applicant, index) => {
          const ranking = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const scoreDisplay = applicant.avgScore > 0 ? applicant.avgScore.toFixed(1) : 'Unrated';
          scoreSummary += `${ranking} **${applicant.name}** - ${scoreDisplay}/5.0 (${applicant.voteCount} vote${applicant.voteCount !== 1 ? 's' : ''})\n`;
        });
        scoreSummary += '\n';
      }
    });
    
    // Add overall statistics
    scoreSummary += `### 📊 **SUMMARY**\n`;
    scoreSummary += `> **Total Applicants:** ${allApplications.length}\n`;
    scoreSummary += `> **Cast:** ${castGroups.cast.length} | **Tentative:** ${castGroups.tentative.length} | **Rejected:** ${castGroups.reject.length} | **Undecided:** ${castGroups.undecided.length}\n`;
    
    const totalScored = applicantData.filter(app => app.voteCount > 0).length;
    scoreSummary += `> **Scored:** ${totalScored}/${allApplications.length} applicants`;
    
    // ButtonBuilder and ActionRowBuilder already imported at top of file
    
    // Create action buttons (Back and Refresh) - Back button encodes context for restoration
    // Parse the original request to extract current context for the Back button
    const backContextId = `${extractedConfigId || 'none'}_${userId}`;
    
    const actionButtons = [
      new ButtonBuilder()
        .setCustomId(`ranking_scores_back_${backContextId}`)
        .setLabel('← Casting')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏆'),
      new ButtonBuilder()
        .setCustomId(`ranking_scores_refresh_${extractedConfigId || 'none'}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    ];
    
    const actionRow = new ActionRowBuilder().addComponents(actionButtons);
    
    const summaryContainer = {
      type: 17,
      accent_color: 0x9B59B6, // Purple to match ranking interface
      components: [
        {
          type: 10,
          content: scoreSummary
        },
        {
          type: 14 // Separator component to replace ---
        },
        actionRow.toJSON() // Action row with Close and Refresh buttons
      ]
    };
    
    return ephemeral ? {
      flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 + EPHEMERAL  
      components: [summaryContainer]
    } : {
      components: [summaryContainer] // Plain response for updateMessage pattern
    };
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
  const seasonName = 'Current Season'; // TODO: Get actual season name
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
    
    // Show first applicant of the new page
    const newIndex = newPage * 23;
    const currentApp = allApplications[newIndex];
    
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
    const seasonName = 'Current Season'; // TODO: Get actual season name
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
    const seasonName = 'Current Season'; // TODO: Get actual season name
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
  const seasonName = 'Current Season'; // TODO: Get actual season name
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