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
  playerData
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
  const rankingButtons = [];
  const userRanking = playerData[guildId]?.applications?.[currentApp.channelId]?.rankings?.[userId];
  
  for (let i = 1; i <= 5; i++) {
    const isSelected = userRanking === i;
    rankingButtons.push(
      new ButtonBuilder()
        .setCustomId(`rank_${i}_${currentApp.channelId}_${appIndex}_${configId}`)
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
        .setCustomId(`ranking_prev_${appIndex}_${configId}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(appIndex === 0),
      new ButtonBuilder()
        .setCustomId(`ranking_next_${appIndex}_${configId}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(appIndex === allApplications.length - 1)
    );
  }
  
  // Add View All Scores button (season-scoped)
  navButtons.push(
    new ButtonBuilder()
      .setCustomId(`ranking_view_all_scores_${configId}`)
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
    const guildTimezones = playerData[guildId]?.timezoneRoleIDs || [];
    
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
  
  // Create Components V2 Container for Cast Ranking interface
  // IMPORTANT: This follows the current layout pattern with navigation above applicant info
  const containerComponents = [
    {
      type: 10, // Text Display component
      content: `## Cast Ranking - ${seasonName} | ${guild.name}`
    },
    {
      type: 14 // Separator
    },
    navRow.toJSON(), // Navigation controls above applicant info
    {
      type: 10, // Text Display component
      content: `> **Applicant ${appIndex + 1} of ${allApplications.length}**\n**Name:** ${currentApp.displayName || currentApp.username}${demographicInfo}\n**Average Score:** ${avgScore} (${rankings.length} vote${rankings.length !== 1 ? 's' : ''})\n**Your Score:** ${userRanking || 'Not rated'}\n**Casting Status:** ${castingStatusText}\n**App:** <#${currentApp.channelId}>`
    }
  ];
  
  // Add applicant jump select menu if there are multiple applications
  if (allApplications.length > 1) {
    // Inline implementation of createApplicantSelectOptions for now
    const itemsPerPage = 24;
    const startIdx = 0 * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, allApplications.length);
    
    const options = [];
    
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
        value: `page_1`,
        description: `View next set of applications`,
        emoji: { name: '📄' }
      });
    }
    
    const applicantSelectRow = {
      type: 1, // Action Row
      components: [{
        type: 3, // String Select
        custom_id: `ranking_select_${appIndex}_${configId}_0`,
        placeholder: '🔍 Jump to applicant...',
        options: options,
        min_values: 1,
        max_values: 1
      }]
    };
    // Insert select menu right after navigation buttons but before applicant info
    containerComponents.splice(-1, 0, applicantSelectRow);
  }
  
  // Add separator between navigation and applicant info
  containerComponents.push({
    type: 14 // Separator
  });
  
  // Add remaining interface components after applicant info
  containerComponents.push(
    {
      type: 14 // Separator
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
    flags: (1 << 15), // IS_COMPONENTS_V2
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
  client
}) {
  // Load data
  const playerData = await loadPlayerData();
  const { getAllApplicationsFromData } = await import('./storage.js');
  const allApplications = await getAllApplicationsFromData(guildId);

  // Handle "view all scores" button
  if (customId === 'ranking_view_all_scores') {
    // Generate comprehensive score summary
    let scoreSummary = `## All Cast Rankings | ${guild.name}\n\n`;
    
    // Calculate scores for each applicant
    const applicantScores = allApplications.map((app, index) => {
      const rankings = playerData[guildId]?.rankings?.[app.channelId] || {};
      const scores = Object.values(rankings).filter(r => r !== undefined);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      
      return {
        name: app.displayName || app.username,
        avgScore,
        voteCount: scores.length,
        index: index + 1
      };
    });
    
    // Sort by average score (highest first)
    applicantScores.sort((a, b) => b.avgScore - a.avgScore);
    
    // Build ranking display
    scoreSummary += '> **Ranked by Average Score:**\n\n';
    applicantScores.forEach((applicant, rank) => {
      const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`;
      const scoreDisplay = applicant.avgScore > 0 ? applicant.avgScore.toFixed(1) : 'Unrated';
      scoreSummary += `${medal} **${applicant.name}** - ${scoreDisplay}/5.0 (${applicant.voteCount} vote${applicant.voteCount !== 1 ? 's' : ''})\n`;
    });
    
    const summaryContainer = {
      type: 17,
      accent_color: 0xF39C12,
      components: [
        {
          type: 10,
          content: scoreSummary
        }
      ]
    };
    
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2 flag only, remove EPHEMERAL to make public
      components: [summaryContainer]
    };
  }

  // Handle navigation (prev/next) with configId support
  // Format: ranking_prev_{index}_{configId} or ranking_next_{index}_{configId}
  const navMatch = customId.match(/^ranking_(prev|next)_(\d+)(?:_(.+))?$/);
  if (!navMatch) {
    throw new Error(`Invalid navigation custom_id format: ${customId}`);
  }

  const [, direction, currentIndexStr, extractedConfigId] = navMatch;
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
    playerData
  });
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
  const rankMatch = customId.match(/^rank_(\d+)_(.+)_(\d+)(?:_(.+))?$/);
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
  if (!playerData[guildId].rankings) playerData[guildId].rankings = {};
  if (!playerData[guildId].rankings[channelId]) playerData[guildId].rankings[channelId] = {};
  
  // Record the user's ranking for this application
  playerData[guildId].rankings[channelId][userId] = rankingScore;
  await savePlayerData(playerData);
  
  // Get updated application data
  const { getAllApplicationsFromData } = await import('./storage.js');
  const allApplications = await getAllApplicationsFromData(guildId);
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