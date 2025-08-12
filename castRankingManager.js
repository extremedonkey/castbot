/**
 * Cast Ranking Manager
 * 
 * Centralized UI generation for the Cast Ranking system.
 * This module eliminates code duplication across 8+ handlers in app.js.
 * 
 * PHASE 2: Option A - Dedicated Module
 * - ✅ Core season_app_ranking handler migration COMPLETE
 * - ⏳ Migrate ranking navigation handlers (prev/next)
 * - ⏳ Migrate rank button handlers (1-5 stars)
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { loadPlayerData } from './storage.js';

/**
 * Generate complete Cast Ranking UI for a specific applicant
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
  
  // Create Media Gallery component for displaying applicant avatar
  const avatarDisplayComponent = {
    type: 12, // Media Gallery component
    items: [
      {
        media: {
          url: applicantAvatarURL
        },
        description: `Avatar of applicant ${currentApp.displayName || currentApp.username}`
      }
    ]
  };

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
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(appIndex === 0),
      new ButtonBuilder()
        .setCustomId(`ranking_next_${appIndex}_${configId}${ephemeralSuffix}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(appIndex === allApplications.length - 1)
    );
  }
  
  // Add View All Scores button (season-scoped)
  navButtons.push(
    new ButtonBuilder()
      .setCustomId(`ranking_view_all_scores_${configId}${ephemeralSuffix}`)
      .setLabel('📊 View All Scores')
      .setStyle(ButtonStyle.Primary)
  );
  
  const navRow = new ActionRowBuilder().addComponents(navButtons);
  
  // Calculate average score for current applicant
  const allRankings = playerData[guildId]?.applications?.[currentApp.channelId]?.rankings || {};
  const rankings = Object.values(allRankings).filter(r => r !== undefined);
  const avgScore = rankings.length > 0 ? (rankings.reduce((a, b) => a + b, 0) / rankings.length).toFixed(1) : 'No scores';
  
  // Get casting status for display
  const castingStatus = playerData[guildId]?.applications?.[currentApp.channelId]?.castingStatus;
  let castingStatusText = '';
  if (castingStatus === 'cast') {
    castingStatusText = '✅ Cast';
  } else if (castingStatus === 'tentative') {
    castingStatusText = '❓ Tentative';
  } else if (castingStatus === 'reject') {
    castingStatusText = '🗑️ Don\'t Cast';
  } else {
    castingStatusText = '⚪ Undecided';
  }
  
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
  
  // Get applicant's age from playerData
  const applicantAge = playerData[guildId]?.players?.[currentApp.userId]?.age;
  console.log(`🔍 DEBUG: Demographics - User ${currentApp.userId} age: ${applicantAge || 'not set'}`);
  
  // Get applicant's pronoun and timezone roles
  let pronounRoleId = null;
  let timezoneRoleId = null;
  
  // Check if applicantMember has roles (it should if fetched successfully)
  if (applicantMember && applicantMember.roles) {
    console.log(`🔍 DEBUG: Demographics - Member has roles:`, applicantMember.roles);
    // Get guild's configured pronoun and timezone roles
    const guildPronouns = playerData[guildId]?.pronounRoleIDs || [];
    const guildTimezones = Object.keys(playerData[guildId]?.timezones || {}); // Get timezone role IDs from keys
    console.log(`🔍 DEBUG: Demographics - Guild timezones configured: ${guildTimezones.length} roles`);
    console.log(`🔍 DEBUG: Demographics - Guild pronouns configured: ${guildPronouns.length} roles`);
    
    // Find if user has any of these roles
    const memberRoles = applicantMember.roles.cache ? 
      Array.from(applicantMember.roles.cache.keys()) : // If it's a full member object
      applicantMember.roles; // If it's just an array of role IDs
    
    // Find first matching pronoun role
    for (const roleId of memberRoles) {
      if (guildPronouns.includes(roleId)) {
        pronounRoleId = roleId;
        break;
      }
    }
    
    // Find first matching timezone role  
    for (const roleId of memberRoles) {
      if (guildTimezones.includes(roleId)) {
        timezoneRoleId = roleId;
        console.log(`🔍 DEBUG: Demographics - Found timezone role: ${roleId}`);
        break;
      }
    }
  }
  
  // Build the demographic info string
  let demographicInfo = '';
  const infoParts = [];
  
  if (applicantAge) {
    infoParts.push(applicantAge);
  }
  
  if (pronounRoleId) {
    infoParts.push(`<@&${pronounRoleId}>`);
  }
  
  if (timezoneRoleId) {
    infoParts.push(`<@&${timezoneRoleId}>`);
  }
  
  console.log(`🔍 DEBUG: Demographics - Building info: Age=${applicantAge}, Pronoun=${pronounRoleId}, Timezone=${timezoneRoleId}`);
  
  // Only add brackets if there's any demographic info
  if (infoParts.length > 0) {
    demographicInfo = ` (${infoParts.join(', ')})`;
  }
  
  console.log(`🔍 DEBUG: Demographics - Final info string: "${demographicInfo}"`);
  
  // Determine name display format - use Discord mention if member is still in server, fallback if they left
  let nameDisplay;
  if (applicantMember.id && applicantMember.guild) {
    // Member is still in server - use Discord mention syntax for clickable profile
    nameDisplay = `<@${currentApp.userId}>`;
    console.log(`🔍 DEBUG: Name Display - Using mention syntax for active member: ${currentApp.userId}`);
  } else {
    // Member has left server - use fallback with displayName and indicator
    nameDisplay = `${currentApp.displayName || currentApp.username} - left server`;
    console.log(`🔍 DEBUG: Name Display - Using fallback for left member: ${currentApp.displayName || currentApp.username}`);
  }
  
  // Create Components V2 Container for Cast Ranking interface
  // IMPORTANT: This follows the current layout pattern with navigation above applicant info
  const containerComponents = [
    {
      type: 10, // Text Display component
      content: `## Cast Ranking - ${seasonName} | ${guild.name}`
    },
    navRow.toJSON(), // Navigation controls above applicant info
    {
      type: 10, // Text Display component
      content: `> **Applicant ${appIndex + 1} of ${allApplications.length}**\n**Name:** ${nameDisplay}${demographicInfo}\n**Average Score:** ${avgScore} (${rankings.length} vote${rankings.length !== 1 ? 's' : ''})\n**Your Score:** ${userRanking || 'Not rated'}\n**Casting Status:** ${castingStatusText}\n**App:** <#${currentApp.channelId}>`
    }
  ];
  
  // Add applicant jump select menu if there are multiple applications
  if (allApplications.length > 1) {
    // Calculate current page based on appIndex
    const itemsPerPage = 24;
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
    
    const applicantSelectRow = {
      type: 1, // Action Row
      components: [{
        type: 3, // String Select
        custom_id: `ranking_select_${appIndex}_${configId}_${currentPage}`,
        placeholder: '🔍 Jump to applicant...',
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
  } else {
    // If no select menu, still add separator after navigation
    containerComponents.splice(-1, 0, {
      type: 14 // Separator
    });
  }
  
  // Add remaining interface components after applicant info
  containerComponents.push(
    {
      type: 14 // Separator - single divider after applicant info
    },
    avatarDisplayComponent, // Applicant avatar display
    {
      type: 10, // Text Display component  
      content: `> **Rate this applicant (1-5)**`
    },
    rankingRow.toJSON(), // Ranking buttons
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
          .setLabel('✏️ Edit Player Notes')
          .setStyle(ButtonStyle.Primary)
          .toJSON(),
        new ButtonBuilder()
          .setCustomId(`personal_ranker_${currentApp.channelId}_${appIndex}_${configId}`)
          .setLabel('🤸 Personal Ranker')
          .setStyle(ButtonStyle.Secondary)
          .toJSON()
      ]
    }
  );
  
  // Create main container
  const castRankingContainer = {
    type: 17, // Container
    components: containerComponents
  };
  
  return {
    flags: ephemeral ? ((1 << 15) | (1 << 6)) : (1 << 15), // IS_COMPONENTS_V2 + EPHEMERAL if personal
    components: [castRankingContainer]
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
    
    let scoreSummary = `## Cast Ranking Summary\n### ${seasonName}\n\n`;
    
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
        .setLabel('← Cast Ranking')
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
    const newIndex = newPage * 24;
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