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
  const { buildSeasonNavRow, seasonManagerHeader } = await import('./seasonSelector.js');
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

/**
 * Collapse the six independent application-status dimensions into ONE salient
 * status for the Casting card's "Status:" line. Priority mirrors the jump-select
 * icon logic (placementResponse → castingStatus → votes, castRankingManager.js
 * ~262) so the line and the jump-select never disagree — extended with a
 * ✖️ Withdrawn lifecycle override (the only dimension siloed in the channel name)
 * and human-readable names.
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
  
  // Applicant identity = the detailed info block (Name + role-tag demographics + scores + casting
  // status + app link + Status), built below as `oldInfoBlock`. The avatar is a full-size Media
  // Gallery using applicantAvatarURL (pre-fetched above).

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
  // Applicant's response to a sent invite (Accept/Decline), if any.
  const placementResponse = playerData[guildId]?.applications?.[currentApp.channelId]?.placementResponse;

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

  // Build DNC warnings and summary for this applicant. The summary is only shown when the applicant
  // actually has DNC entries — no "No DNC list provided" placeholder clutter on the card.
  const { findDncConflicts, buildDncWarnings, buildDncSummary, getDncEntries } = await import('./dncManager.js');
  const appData = playerData[guildId]?.applications?.[currentApp.channelId] || {};
  const dncConflicts = findDncConflicts(appData, allApplications, playerData, guildId);
  const dncWarningText = buildDncWarnings(dncConflicts);
  const dncSummaryText = getDncEntries(appData).length > 0 ? buildDncSummary(appData) : '';

  // ===== Build the Casting card (Components V2) =====
  // Layout: header → tab nav → 📃 Application (actions + jump-select) → info block (+ DNC + Status)
  //         → avatar → Rate (1-5) → Casting status → Votes → Player Notes → utility → bottom nav.
  // The applicant DNC summary is folded into the info block (oldInfoBlock).

  const { buildSeasonNavRow, seasonManagerHeader } = await import('./seasonSelector.js');
  const containerComponents = [
    seasonManagerHeader('ranking', seasonName),
    // Active-tab nav row — Apps · Planner · Casting · Edit (current view = Casting, shaded blue)
    buildSeasonNavRow(configId, 'ranking'),
  ];

  // Applicant jump-select — ALWAYS rendered (state-aware placeholder). Discord requires ≥1 option,
  // so it's only ever absent on the 0-applicant empty state (a separate screen). It also replaces
  // the old ◀/▶ prev/next row for navigation. Built here but PUSHED later (directly below the
  // Delete button) — the placeholder already shows "Applicant N of M", so the info block drops it.
  let jumpSelectRow = null;
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
      const pResp = playerData[guildId]?.applications?.[app.channelId]?.placementResponse;
      const hasNotes = !!playerData[guildId]?.applications?.[app.channelId]?.playerNotes;

      // Applicant's placement response (if any) takes priority in the icon.
      let icon = '🗳️';
      if (pResp === 'accepted') icon = '🎉';
      else if (pResp === 'declined') icon = '🚫';
      else if (cStatus === 'cast') icon = '✅';
      else if (cStatus === 'alternative') icon = '🔄';
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
    // Name = the applicant's per-server display name (nickname), falling back to global/username.
    const placeholderName = applicantMember?.displayName || currentApp.displayName || currentApp.username || 'Applicant';
    let selectPlaceholder = `Applicant ${appIndex + 1} of ${allApplications.length} - ${placeholderName}`;
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

  // Derived single status line — appended to the info block below (the old createPlayerDisplaySection
  // identity Text Display was removed: its name was a redundant "orphan" next to the info block's Name).
  const appRecord = playerData[guildId]?.applications?.[currentApp.channelId] || {};
  const liveChannelName = guild?.channels?.cache?.get(currentApp.channelId)?.name || '';
  const derivedStatus = deriveApplicationStatus(appRecord, liveChannelName);

  // ---- Restored OLD detailed info block (single Text Display under the Delete button) ----
  // Name = clickable mention (fallback when the member left). Demographics use ROLE TAG mentions
  // (age, <@&pronoun>, <@&timezone>) — the old colored role pills. The "Applicant N of M" line was
  // dropped — the jump-select placeholder (now directly above this) already shows it.
  const nameDisplay = (applicantMember?.id && applicantMember?.guild)
    ? `<@${currentApp.userId}>`
    : `${currentApp.displayName || currentApp.username} - left server`;
  const applicantAge = playerData[guildId]?.players?.[currentApp.userId]?.age;
  let pronounRoleId = null, timezoneRoleId = null;
  if (applicantMember?.roles) {
    const guildPronouns = playerData[guildId]?.pronounRoleIDs || [];
    const guildTimezones = Object.keys(playerData[guildId]?.timezones || {});
    const memberRoles = applicantMember.roles.cache ? Array.from(applicantMember.roles.cache.keys()) : applicantMember.roles;
    for (const roleId of memberRoles) { if (guildPronouns.includes(roleId)) { pronounRoleId = roleId; break; } }
    for (const roleId of memberRoles) { if (guildTimezones.includes(roleId)) { timezoneRoleId = roleId; break; } }
  }
  const infoParts = [];
  if (applicantAge) infoParts.push(applicantAge);
  if (pronounRoleId) infoParts.push(`<@&${pronounRoleId}>`);
  if (timezoneRoleId) infoParts.push(`<@&${timezoneRoleId}>`);
  const demographicInfo = infoParts.length > 0 ? ` (${infoParts.join(', ')})` : '';
  const infoRankings = Object.values(allRankings).filter(r => r !== undefined);
  const infoAvg = infoRankings.length > 0 ? (infoRankings.reduce((a, b) => a + b, 0) / infoRankings.length).toFixed(1) : 'No scores';
  let infoCastingText;
  if (castingStatus === 'cast') infoCastingText = '✅ Cast';
  else if (castingStatus === 'alternative') infoCastingText = '🔄 Alternate';
  else if (castingStatus === 'tentative') infoCastingText = '❓ Tentative';
  else if (castingStatus === 'reject') infoCastingText = '🗑️ Don\'t Cast';
  else infoCastingText = '⚪ Undecided';
  let oldInfoBlock = `**Name:** ${nameDisplay}${demographicInfo}\n**Average Score:** ${infoAvg} (${infoRankings.length} vote${infoRankings.length !== 1 ? 's' : ''})\n**Your Score:** ${userRanking || 'Not rated'}\n**Casting Status:** ${infoCastingText}\n**App:** <#${currentApp.channelId}>`;
  if (dncSummaryText) oldInfoBlock += `\n${dncSummaryText}`;
  oldInfoBlock += `\nStatus: ${derivedStatus.icon} ${derivedStatus.name}`;
  // 🌈 TEMP scaffold (RaP 0905): placeholder for the future unified getPlayerSeasonStatus() output.
  // Replace 'XX' with the engine's resolved status once it exists — lets us compare it against the 3
  // status fields currently shown above. Remove when the Status Engine lands.
  oldInfoBlock += `\n🌈 ÜberStatus: XX`;

  containerComponents.push(
    { type: 14 }, // divider after the nav / select cluster
    { type: 10, content: `### \`\`\`📃 Application\`\`\`` },
    {
      type: 1, // Applicant actions — View App (link) + Edit Notes + Delete — directly under the header
      components: [
        { type: 2, style: 5, label: 'View App', emoji: { name: '📄' }, url: `https://discord.com/channels/${guildId}/${currentApp.channelId}` },
        new ButtonBuilder()
          .setCustomId(`edit_player_notes_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('✏️ Edit Notes')
          .setStyle(ButtonStyle.Secondary)
          .toJSON(),
        new ButtonBuilder()
          .setCustomId(`delete_application_mode_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
          .toJSON()
      ]
    },
    ...(jumpSelectRow ? [jumpSelectRow] : []), // jump-select — directly below the Delete button
    { type: 10, content: oldInfoBlock }, // restored old info block + Status line
    {
      type: 12, // Media Gallery — full-size applicant avatar
      items: [{ media: { url: applicantAvatarURL }, description: `Avatar of ${currentApp.displayName || currentApp.username}` }]
    },
    { type: 10, content: `> **Rate this applicant (1-5)**` }, // header directly above the ratings
    rankingRow.toJSON() // 1-5 rating buttons — moved underneath the avatar
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
  const isUndecided = !['cast', 'tentative', 'reject', 'alternative'].includes(castingStatus);
  // (Player Notes moved up into the identity block — see the `> -# ✏️Player Notes:` line above.)

  // ---- Casting: header + status (string select) ----
  containerComponents.push(
    {
      type: 10,
      content: `### \`\`\`🎭 Casting Status\`\`\`\n-# Set your draft casting status below — change it as many times as you like; players are not notified. When you've decided who to cast, click ✒️ Invites.${placementResponse ? `\n-# 📣 Applicant response: ${placementResponse === 'accepted' ? '🎉 Accepted placement' : '🚫 Declined placement'}` : ''}`
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
    }
  );

  // ---- Votes: header (with applicant name) + tally (the 1-5 buttons live under the gallery) ----
  containerComponents.push(
    { type: 10, content: `### \`\`\`🗳️ Votes for ${applicantDisplayName}\`\`\`` }
  );
  if (votingBreakdown) {
    containerComponents.push(votingBreakdown);
  } else {
    containerComponents.push({ type: 10, content: `-# No scores yet — click 1–5 above to rate this applicant.` });
  }

  // ---- Player Notes — old-style heading + plain text, moved down to the bottom (user request) ----
  const notesText = appRecord.playerNotes || 'Record casting notes, connections or potential issues...';
  containerComponents.push({ type: 10, content: `### ✏️ Player Notes\n${notesText}` });

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
      { type: 2, custom_id: `ranking_view_all_scores_${configId}${ephemeralSuffix}`, label: 'Casting Summary', style: 2, emoji: { name: '⭐' } },
      { type: 2, custom_id: `casting_messages_${appIndex}_${configId}`, label: 'Invites', style: 2, emoji: { name: '✒️' } }
    ]
  });

  // Bottom navigation — ← Seasons (back to Season Manager)
  containerComponents.push({
    type: 1,
    components: [
      { type: 2, custom_id: `season_manager`, label: '← Seasons', style: 2 }
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
  const { loadPlayerData, getApplicationsForSeason } = await import('./storage.js');
  const { DiscordRequest } = await import('./utils.js');
  const playerData = await loadPlayerData();
  const allApplications = await getApplicationsForSeason(guildId, configId);
  const targets = selectInviteTargets(allApplications, playerData, guildId, mode, appIndex);

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
    } catch (err) {
      console.log(`⚠️ sendCastingInvites: failed to message channel ${t.channelId}: ${err.message}`);
      result.failed++;
    }
    if (i < targets.length - 1) await sleep(700); // rate-limit-safe spacing
  }
  console.log(`📨 sendCastingInvites [${mode}] guild ${guildId}: sent ${result.sent}, failed ${result.failed}, skippedEmpty ${result.skippedEmpty}`);
  return result;
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
      const placementResponse = playerData[guildId]?.applications?.[app.channelId]?.placementResponse;

      return {
        name: app.displayName || app.username,
        avgScore,
        voteCount: scores.length,
        castingStatus,
        placementResponse,
        index: index + 1
      };
    });
    
    console.log(`🔍 DEBUG: View all scores - found ${applicantData.length} applicants with casting status breakdown`);
    
    // Group by casting status
    const castGroups = {
      cast: applicantData.filter(app => app.castingStatus === 'cast'),
      tentative: applicantData.filter(app => app.castingStatus === 'tentative'),
      alternative: applicantData.filter(app => app.castingStatus === 'alternative'),
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
      { key: 'alternative', title: '🔄 **ALTERNATE**', color: '🟡', group: castGroups.alternative },
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
          const resp = applicant.placementResponse === 'accepted' ? ' · 🎉 Accepted' : applicant.placementResponse === 'declined' ? ' · 🚫 Declined' : '';
          scoreSummary += `${ranking} **${applicant.name}** - ${scoreDisplay}/5.0 (${applicant.voteCount} vote${applicant.voteCount !== 1 ? 's' : ''})${resp}\n`;
        });
        scoreSummary += '\n';
      }
    });
    
    // Add overall statistics
    scoreSummary += `### 📊 **SUMMARY**\n`;
    scoreSummary += `> **Total Applicants:** ${allApplications.length}\n`;
    scoreSummary += `> **Cast:** ${castGroups.cast.length} | **Alternate:** ${castGroups.alternative.length} | **Tentative:** ${castGroups.tentative.length} | **Rejected:** ${castGroups.reject.length} | **Undecided:** ${castGroups.undecided.length}\n`;
    
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