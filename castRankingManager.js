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
  
  // Create navigation buttons if there are multiple applications
  const navButtons = [];
  if (allApplications.length > 1) {
    navButtons.push(
      new ButtonBuilder()
        .setCustomId(`ranking_prev_${appIndex}_${configId}${ephemeralSuffix}`)
        .setLabel('◀ Previous')
        .setStyle(appIndex === 0 ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(appIndex === 0),
      new ButtonBuilder()
        .setCustomId(`ranking_next_${appIndex}_${configId}${ephemeralSuffix}`)
        .setLabel('Next ▶')
        .setStyle(appIndex === allApplications.length - 1 ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(appIndex === allApplications.length - 1)
    );
  }

  // View All Scores moved to the bottom navigation row. navRow now holds only applicant prev/next.
  const navRow = navButtons.length > 0 ? new ActionRowBuilder().addComponents(navButtons) : null;
  
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
    
    let votingText = `### 🗳️ Votes\n> **Average:** ${avgScore}/5.0 (${scores.length} vote${scores.length !== 1 ? 's' : ''})\n`;
    
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

  // Create Components V2 Container for Casting interface
  // IMPORTANT: This follows the current layout pattern with navigation above applicant info
  // Trimmed: Name/pronouns/tz → now in the identity Section; Average & Your Score → shown in the
  // Votes section + the highlighted 1-5 button; Casting Status → shown by the coloured casting
  // buttons. We keep only the position, the app-channel link, and any DNC summary.
  const applicantInfo = `> **Applicant ${appIndex + 1} of ${allApplications.length}**\n**App:** <#${currentApp.channelId}>${dncSummaryText ? `\n${dncSummaryText}` : ''}`;

  const { buildSeasonNavRow } = await import('./seasonSelector.js');
  const containerComponents = [
    rankingHeader(seasonName),
    // Active-tab nav row — Apps · Planner · Ranking · Edit (current view = Ranking, shaded blue)
    buildSeasonNavRow(configId, 'ranking'),
  ];
  if (navRow) containerComponents.push(navRow.toJSON()); // Applicant prev/next (only when >1 applicant)

  // DNC conflict warnings (above applicant info for visibility)
  if (dncWarningText) {
    containerComponents.push({
      type: 10,
      content: dncWarningText
    });
  }

  containerComponents.push({
    type: 10, // Text Display component
    content: applicantInfo
  });
  
  // Applicant jump select — ALWAYS rendered (even for a single applicant). A state-aware placeholder
  // means the control is never a confusing empty/why-is-it-here element. (Discord requires ≥1 option,
  // so the only time it's absent is the 0-applicant empty state, which is a different screen.)
  {
    // Calculate current page based on appIndex
    const itemsPerPage = 23;
    const totalPages = Math.ceil(allApplications.length / itemsPerPage);
    const currentPage = Math.floor(appIndex / itemsPerPage);
    const startIdx = currentPage * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, allApplications.length);

    const options = [];
    
    // Add "Previous page" option if not on first page
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
    
    // Add applicant options for current page
    for (let i = startIdx; i < endIdx; i++) {
      const app = allApplications[i];
      const rankings = playerData[guildId]?.applications?.[app.channelId]?.rankings || {};
      const voteCount = Object.keys(rankings).length;
      const castingStatus = playerData[guildId]?.applications?.[app.channelId]?.castingStatus;
      const hasNotes = !!playerData[guildId]?.applications?.[app.channelId]?.playerNotes;
      
      // Determine icon based on priority
      let icon = '🗳️'; // Default: not enough votes
      if (castingStatus === 'cast') {
        icon = '✅';
      } else if (castingStatus === 'reject') {
        icon = '❌';
      } else if (voteCount >= 2) {
        icon = '☑️';
      }
      
      // Format label (max 100 chars)
      const position = i + 1;
      const displayName = app.displayName || 'Unknown';
      const username = app.username || 'unknown';
      const voteText = voteCount === 1 ? '1 vote' : `${voteCount} votes`;
      const notesIndicator = hasNotes ? ' 💬' : '';
      
      // Build initial label
      let label = `${icon} ${position}. ${displayName} (${username}) - ${voteText}${notesIndicator}`;
      
      // Truncate if too long (Discord limit is 100 chars)
      if (label.length > 100) {
        // Calculate how much space we have for username
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
      
      options.push({
        label: label,
        value: i.toString(),
        description: `Jump to ${displayName}'s application`
      });
    }
    
    // Add "Next page" option if more items exist
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
    
    // State-aware placeholder so an always-present control still reads clearly.
    let selectPlaceholder;
    if (allApplications.length === 1) {
      selectPlaceholder = '🔍 1 applicant so far';
    } else if (totalPages === 1) {
      selectPlaceholder = `🔍 Jump to applicant… (${allApplications.length} total)`;
    } else {
      selectPlaceholder = `🔍 Jump to applicant… (page ${currentPage + 1}/${totalPages}, ${allApplications.length} total)`;
    }

    const applicantSelectRow = {
      type: 1, // Action Row
      components: [{
        type: 3, // String Select
        custom_id: `ranking_select_${appIndex}_${configId}_${currentPage}`,
        placeholder: selectPlaceholder,
        options: options,
        min_values: 1,
        max_values: 1
      }]
    };
    // Insert select menu right after navigation buttons but before applicant info
    containerComponents.splice(-1, 0, applicantSelectRow);
    // Add separator after the select menu
    containerComponents.splice(-1, 0, {
      type: 14 // Separator
    });
  }
  
  // Build the SHARED identity Section (same builder as the Player Menu / application-channel card)
  // for identical UI: **name** • pronouns • age • timezone • 🕛 local-time clock + avatar thumbnail.
  // Returns null when the applicant can't be resolved as a guild member (e.g. they left the server);
  // fall back to a minimal name + avatar Section so the card never renders blank.
  const { createPlayerDisplaySection } = await import('./playerManagement.js');
  let identitySection = await createPlayerDisplaySection(applicantMember, playerData, guildId);
  if (!identitySection) {
    identitySection = {
      type: 9, // Section
      components: [{ type: 10, content: `**${currentApp.displayName || currentApp.username}**\n-# ⚠️ Left server` }],
      accessory: { type: 11, media: { url: applicantAvatarURL }, description: 'Applicant avatar' }
    };
  }

  // Add remaining interface components after applicant info
  containerComponents.push(
    {
      type: 14 // Separator - single divider after applicant info
    },
    identitySection, // Applicant identity card (Section + avatar thumbnail) — replaces Media Gallery
    rankingRow.toJSON(), // Ranking buttons (1-5 — self-explanatory; instructional line trimmed for the +1 nav button)
    {
      type: 14 // Separator
    },
    // Inline implementation of createCastingButtons for now
    {
      type: 1, // Action Row
      components: [
        new ButtonBuilder()
          .setCustomId(`cast_player_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('🎬 Cast Player')
          .setStyle(castingStatus === 'cast' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .toJSON(),
        new ButtonBuilder()
          .setCustomId(`cast_tentative_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('❓ Tentative')
          .setStyle(castingStatus === 'tentative' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .toJSON(),
        new ButtonBuilder()
          .setCustomId(`cast_reject_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('🗑️ Don\'t Cast')
          .setStyle(castingStatus === 'reject' ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .toJSON()
      ]
    }
  );
  
  // Add voting breakdown if there are votes
  if (votingBreakdown) {
    containerComponents.push(
      {
        type: 14 // Separator
      },
      votingBreakdown
    );
  }
  
  // Add player notes section
  const existingNotes = playerData[guildId]?.applications?.[currentApp.channelId]?.playerNotes;
  const notesText = existingNotes || 'Record casting notes, connections or potential issues...';

  containerComponents.push(
    {
      type: 14 // Separator
    },
    {
      type: 10, // Text Display component
      content: `### ✏️ Player Notes\n${notesText}`
    },
    {
      type: 1, // Action Row for notes button
      components: [
        new ButtonBuilder()
          .setCustomId(`edit_player_notes_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('✏️ Edit Notes')
          .setStyle(ButtonStyle.Secondary)
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
    }
  );
  
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