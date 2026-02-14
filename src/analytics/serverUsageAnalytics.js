#!/usr/bin/env node

/**
 * Server Usage Analytics
 * Analyzes user-analytics.log to provide server usage statistics and rankings
 */

import fs from 'fs';
import path from 'path';
import { formatBotEmoji } from '../../botEmojis.js';

const USER_ANALYTICS_LOG = './logs/user-analytics.log';

/**
 * Parse timestamp from log line
 * @param {string} timestampStr - Timestamp string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseTimestamp(timestampStr) {
  try {
    // Handle different timestamp formats
    
    // Format 1: [8:18AM] Thu 19 Jun 25
    const newFormatMatch = timestampStr.match(/\[(\d{1,2}:\d{2}[AP]M)\] (\w{3}) (\d{1,2}) (\w{3}) (\d{2})/);
    if (newFormatMatch) {
      const [, time, dayName, day, month, year] = newFormatMatch;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = months.indexOf(month);
      
      if (monthIndex === -1) return null;
      
      // Convert to 24-hour format
      let [hours, minutes] = time.slice(0, -2).split(':').map(Number);
      const ampm = time.slice(-2);
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      
      const date = new Date(2000 + parseInt(year), monthIndex, parseInt(day), hours, parseInt(minutes));
      
      // Validate the created date
      if (isNaN(date.getTime())) {
        console.warn('Invalid date created from:', timestampStr);
        return null;
      }
      
      return date;
    }
    
    // Format 2: [ANALYTICS] 2025-06-18T15:01:16.725Z
    if (timestampStr.includes('[ANALYTICS]')) {
      const isoMatch = timestampStr.match(/\[ANALYTICS\] (.+)/);
      if (isoMatch) {
        const date = new Date(isoMatch[1]);
        // Validate the created date
        if (isNaN(date.getTime())) {
          console.warn('Invalid ISO date from:', isoMatch[1]);
          return null;
        }
        return date;
      }
    }
    
    // Format 3: [12:14 am] Thu, 19 June 25
    const timeAmPmMatch = timestampStr.match(/\[(\d{1,2}:\d{2}\s?[ap]m)\]\s*(\w{3}),?\s*(\d{1,2})\s*(\w+)\s*(\d{2})/i);
    if (timeAmPmMatch) {
      const [, time, dayName, day, month, year] = timeAmPmMatch;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthIndex = months.indexOf(month) % 12; // Handle both short and long month names
      
      if (monthIndex === -1) return null;
      
      // Parse time with proper handling of spaces
      const timeClean = time.replace(/\s/g, '').toLowerCase();
      let [hours, minutes] = timeClean.slice(0, -2).split(':').map(Number);
      const ampm = timeClean.slice(-2);
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const date = new Date(2000 + parseInt(year), monthIndex, parseInt(day), hours, parseInt(minutes));
      
      // Validate the created date
      if (isNaN(date.getTime())) {
        console.warn('Invalid date created from time format:', timestampStr);
        return null;
      }
      
      return date;
    }
    
    // Fallback: try to parse directly
    const fallbackDate = new Date(timestampStr);
    if (isNaN(fallbackDate.getTime())) {
      return null;
    }
    return fallbackDate;
  } catch (error) {
    console.warn('Failed to parse timestamp:', timestampStr, error.message);
    return null;
  }
}

/**
 * Parse a log line and extract relevant data
 * @param {string} line - Log line to parse
 * @returns {Object|null} Parsed log data or null if invalid
 */
function parseLogLine(line) {
  if (!line.trim()) return null;
  
  try {
    // Split by pipe FIRST - most reliable delimiter
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) return null;
    
    // Part 0: Timestamp
    const timestamp = parseTimestamp(parts[0]);
    if (!timestamp || isNaN(timestamp.getTime())) return null;
    
    // Initialize variables
    let userInfo, serverInfo, channelName, actionType, actionDetail;
    let actionStartIndex = 2;
    
    // Check if part[2] is a channel (starts with #)
    if (parts[2] && parts[2].startsWith('#')) {
      channelName = parts[2]; // Keep emojis and all special characters
      actionStartIndex = 3;
    }
    
    // Part 1: User in Server - parse backwards to handle pipes in usernames
    const userServerPart = parts[1];
    const lastInIndex = userServerPart.lastIndexOf(' in ');
    
    if (lastInIndex > -1) {
      // Everything before "in" is username (may contain pipes, special chars)
      const userPart = userServerPart.substring(0, lastInIndex).trim();
      const serverPart = userServerPart.substring(lastInIndex + 4).trim();
      
      // Extract username from parentheses if present (handle multiple parentheses)
      const lastParenMatch = userPart.match(/\(([^)]+)\)$/);
      userInfo = {
        username: lastParenMatch ? lastParenMatch[1] : userPart,
        displayName: lastParenMatch ? 
          userPart.substring(0, userPart.lastIndexOf('(')).trim() : 
          userPart
      };
      
      // Skip entries with "undefined" usernames (corrupted Safari logs)
      if (userInfo.username === 'undefined' || userInfo.displayName === 'undefined') {
        return null;
      }
      
      // Extract server info (may have ID in parentheses)
      const serverIdMatch = serverPart.match(/\((\d+)\)$/);
      serverInfo = {
        name: serverIdMatch ? 
          serverPart.substring(0, serverPart.lastIndexOf('(')).trim() : 
          serverPart,
        id: serverIdMatch ? serverIdMatch[1] : 'unknown'
      };
    } else if (parts[1] && (parts[1].includes('SLASH_COMMAND in') || parts[1].includes('BUTTON_CLICK in'))) {
      // Special format: action type in part[1]
      const actionMatch = parts[1].match(/(SLASH_COMMAND|BUTTON_CLICK) in (.+?) \((.+?)\)/);
      if (actionMatch) {
        actionType = actionMatch[1];
        actionDetail = actionMatch[2];
        userInfo = { username: actionMatch[3], displayName: actionMatch[3] };
        serverInfo = { name: 'CastBot', id: parts[2] ? parts[2].trim() : 'unknown' };
        
        // Already have action info, skip normal action parsing
        actionStartIndex = -1;
      } else {
        return null;
      }
    } else {
      return null; // Can't parse without "in"
    }
    
    // Parse action type and detail if not already parsed
    if (actionStartIndex !== -1 && actionStartIndex < parts.length) {
      actionType = parts[actionStartIndex] || '';
      actionDetail = parts[actionStartIndex + 1] || '';
      
      // Convert Safari action types to standard analytics format
      let normalizedActionType = actionType.trim();
      if (normalizedActionType.startsWith('SAFARI_')) {
        // Safari actions count as BUTTON_CLICK for analytics purposes
        if (normalizedActionType === 'SAFARI_CUSTOM_ACTION' || 
            normalizedActionType === 'SAFARI_BUTTON' ||
            normalizedActionType === 'SAFARI_MOVEMENT' ||
            normalizedActionType === 'SAFARI_ITEM_PICKUP' ||
            normalizedActionType === 'SAFARI_CURRENCY' ||
            normalizedActionType === 'SAFARI_WHISPER' ||
            normalizedActionType === 'SAFARI_TEST') {
          actionType = 'BUTTON_CLICK';
        }
      }
    }
    
    // Validate required fields
    if (!userInfo || !serverInfo || !timestamp || !actionType) {
      return null;
    }
    
    return {
      timestamp,
      user: userInfo,
      server: serverInfo,
      channelName,
      actionType: actionType.trim(),
      actionDetail: actionDetail ? actionDetail.trim() : '',
      rawLine: line
    };
    
  } catch (error) {
    // Silent fail in production, only log in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('Parse error:', error.message);
    }
    return null;
  }
}

/**
 * Read and parse the user analytics log file
 * @returns {Array} Array of parsed log entries
 */
async function parseUserAnalyticsLog() {
  try {
    if (!fs.existsSync(USER_ANALYTICS_LOG)) {
      console.warn(`Analytics log file not found: ${USER_ANALYTICS_LOG}`);
      return [];
    }
    
    const logData = await fs.promises.readFile(USER_ANALYTICS_LOG, 'utf8');
    const lines = logData.split('\n').filter(line => line.trim());
    
    console.log(`📈 DEBUG: Found ${lines.length} lines in analytics log`);
    
    const parsedEntries = [];
    let skippedUndefined = 0;
    let skippedSafari = 0;
    let parsedSafari = 0;
    
    for (const line of lines) {
      const parsed = parseLogLine(line);
      if (parsed) {
        parsedEntries.push(parsed);
        // Track Safari conversions
        if (line.includes('SAFARI_')) {
          parsedSafari++;
        }
      } else {
        if (line.includes('undefined in')) {
          skippedUndefined++;
        } else if (line.includes('SAFARI_')) {
          skippedSafari++;
        }
        // Removed verbose "Failed to parse line" logging that was causing spam
      }
    }
    
    console.log(`📈 DEBUG: Parsing summary - Parsed: ${parsedEntries.length}, Safari converted: ${parsedSafari}, Skipped undefined: ${skippedUndefined}, Skipped Safari: ${skippedSafari}`);
    
    console.log(`📈 DEBUG: Successfully parsed ${parsedEntries.length} entries`);
    
    return parsedEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error reading analytics log:', error);
    return [];
  }
}

/**
 * Calculate server activity level based on last activity timestamp
 * @param {number|null} lastActivityTimestamp - Unix timestamp in milliseconds of last activity
 * @returns {Object} Activity level info with emoji and description
 */
function calculateActivityLevel(lastActivityTimestamp) {
  // Handle null/undefined timestamps (servers with no activity)
  if (!lastActivityTimestamp || isNaN(lastActivityTimestamp)) {
    return {
      emoji: '🔴',
      level: 'inactive',
      description: 'No recent activity'
    };
  }
  
  // Get current time in milliseconds (UTC)
  const now = Date.now();
  
  // Calculate time thresholds in milliseconds
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in ms
  const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000; // 4 days in ms
  
  // Calculate time differences
  const timeDiff = now - lastActivityTimestamp;
  
  // Add debug info for troubleshooting
  console.log(`📊 DEBUG: Activity calculation - Now: ${new Date(now).toISOString()}, Last: ${new Date(lastActivityTimestamp).toISOString()}, Diff: ${Math.round(timeDiff / (60 * 60 * 1000))} hours`);
  
  // Determine activity level
  if (timeDiff <= TWENTY_FOUR_HOURS) {
    return {
      emoji: '🟢',
      level: 'recent',
      description: 'Active within 24 hours'
    };
  } else if (timeDiff <= FOUR_DAYS) {
    return {
      emoji: '🟠', 
      level: 'moderate',
      description: 'Active within 4 days'
    };
  } else {
    return {
      emoji: '🔴',
      level: 'inactive', 
      description: 'Inactive for more than 4 days'
    };
  }
}

/**
 * Detect CastBot feature usage from log entries
 * @param {Array} entries - Log entries for a specific server
 * @returns {Object} Feature usage statistics
 */
function detectFeatureUsage(entries) {
  const features = {
    castlist: 0,
    seasonApplications: 0,
    safari: 0,
    castRanking: 0,
    reactForRoles: 0,
    playerEmojis: 0,
    vanityRoles: 0
  };
  
  for (const entry of entries) {
    const detail = entry.actionDetail.toLowerCase();
    const customId = entry.rawLine.match(/\(([^)]+)\)$/)?.[1] || '';
    
    // 🖼️ Castlist - /castlist command and show_castlist buttons
    if (entry.actionType === 'SLASH_COMMAND' && detail.includes('/castlist')) {
      features.castlist++;
    } else if (customId.includes('show_castlist')) {
      features.castlist++;
    }
    
    // 📝 Season Applications - season_app_* and apply_* buttons
    if (customId.includes('season_app') || customId.includes('apply_') || customId.includes('season_management_menu')) {
      features.seasonApplications++;
    }
    
    // 🦁 Safari - safari_* buttons, prod_safari_menu, SAFARI_* actions
    if (customId.includes('safari_') || customId.includes('prod_safari_menu') || entry.actionType.startsWith('SAFARI_')) {
      features.safari++;
    }
    
    // 🏆 Cast Ranking - ranking_* and rank_* buttons
    if (customId.includes('ranking_') || customId.includes('rank_') || customId.includes('season_app_ranking')) {
      features.castRanking++;
    }
    
    // 🎯 React for Roles - prod_timezone_react, prod_pronoun_react, and prod_ban_react buttons
    if (customId.includes('prod_timezone_react') || customId.includes('prod_pronoun_react') || customId.includes('prod_ban_react')) {
      features.reactForRoles++;
    }
    
    // 😀 Player Emojis - prod_create_emojis and prod_emoji_role_select buttons
    if (customId.includes('prod_create_emojis') || customId.includes('prod_emoji_role_select')) {
      features.playerEmojis++;
    }
    
    // ✨ Vanity Roles - admin_manage_vanity_* and admin_integrated_vanity_* buttons
    if (customId.includes('admin_manage_vanity_') || customId.includes('admin_integrated_vanity_')) {
      features.vanityRoles++;
    }
  }
  
  return features;
}

/**
 * Calculate server usage statistics for a given time period
 * @param {Array} logEntries - Parsed log entries
 * @param {number} daysBack - Number of days to look back
 * @returns {Object} Server usage statistics
 */
function calculateServerStats(logEntries, daysBack = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  console.log(`📈 DEBUG: Calculating stats for ${logEntries.length} log entries`);
  console.log(`📈 DEBUG: Cutoff date: ${cutoffDate.toISOString()}`);
  
  // Filter entries within time period and exclude specific server
  const recentEntries = logEntries.filter(entry => {
    const entryDate = entry.timestamp;
    
    // Validate that entryDate is a valid Date object
    if (!entryDate || isNaN(entryDate.getTime())) {
      // Skip entries with invalid dates (logging removed to prevent spam)
      return false;
    }
    
    // Exclude specific server ID (CastBot server)
    if (entry.server.id === '1331657596087566398') {
      return false;
    }
    
    const isRecent = entryDate >= cutoffDate;
    // Removed verbose debug logging that was causing performance issues
    return isRecent;
  });
  
  console.log(`📈 DEBUG: ${recentEntries.length} entries within ${daysBack} days`);
  
  const serverStats = {};
  const userActivity = {};
  
  // Group entries by server for feature detection
  const serverEntries = {};
  
  for (const entry of recentEntries) {
    const serverId = entry.server.id;
    const serverName = entry.server.name;
    const serverKey = `${serverName} (${serverId})`;
    
    // Initialize server entries array
    if (!serverEntries[serverKey]) {
      serverEntries[serverKey] = [];
    }
    serverEntries[serverKey].push(entry);
    
    // Initialize server stats
    if (!serverStats[serverKey]) {
      serverStats[serverKey] = {
        serverName,
        serverId,
        totalInteractions: 0,
        slashCommands: 0,
        buttonClicks: 0,
        uniqueUsers: new Set(),
        lastActivity: null,
        lastActivityEntry: null,
        dailyActivity: {},
        features: {} // Will be populated by feature detection
      };
    }
    
    const stats = serverStats[serverKey];
    
    // Update stats
    stats.totalInteractions++;
    const entryTime = new Date(entry.timestamp).getTime();
    
    // Track the most recent activity entry
    if (!stats.lastActivity || entryTime > stats.lastActivity) {
      stats.lastActivity = entryTime;
      stats.lastActivityEntry = entry;
    }
    
    if (entry.actionType === 'SLASH_COMMAND') {
      stats.slashCommands++;
    } else if (entry.actionType === 'BUTTON_CLICK') {
      stats.buttonClicks++;
    }
    
    // Track unique users
    stats.uniqueUsers.add(entry.user.username);
    
    // Track daily activity
    const day = new Date(entry.timestamp).toISOString().split('T')[0];
    stats.dailyActivity[day] = (stats.dailyActivity[day] || 0) + 1;
  }
  
  // Detect feature usage for each server
  Object.keys(serverStats).forEach(serverKey => {
    const entries = serverEntries[serverKey] || [];
    serverStats[serverKey].features = detectFeatureUsage(entries);
  });
  
  // Convert Sets to counts and calculate additional metrics
  Object.values(serverStats).forEach(stats => {
    stats.uniqueUserCount = stats.uniqueUsers.size;
    delete stats.uniqueUsers; // Remove Set object
    
    stats.avgDailyActivity = Object.keys(stats.dailyActivity).length > 0 
      ? Math.round(stats.totalInteractions / Math.min(daysBack, Object.keys(stats.dailyActivity).length))
      : 0;
    
    stats.commandToButtonRatio = stats.slashCommands > 0 
      ? Math.round((stats.buttonClicks / stats.slashCommands) * 100) / 100
      : 0;
    
    // Calculate activity level based on last activity timestamp
    stats.activityLevel = calculateActivityLevel(stats.lastActivity);
  });
  
  return serverStats;
}

/**
 * Generate server usage summary for Discord display
 * @param {number} daysBack - Number of days to analyze (default: 42)
 * @returns {Object} Analytics summary with rankings and insights
 */
async function generateServerUsageSummary(daysBack = 42) {
  const logEntries = await parseUserAnalyticsLog();
  const serverStats = calculateServerStats(logEntries, daysBack);
  
  // Convert to array and sort by activity level first, then by total interactions
  const rankedServers = Object.values(serverStats)
    .sort((a, b) => {
      // Define activity level priority (lower number = higher priority)
      const activityPriority = {
        'recent': 1,    // 🟢 Green - highest priority
        'moderate': 2,  // 🟠 Orange - medium priority
        'inactive': 3   // 🔴 Red - lowest priority
      };
      
      // Get activity levels
      const aLevel = a.activityLevel?.level || 'inactive';
      const bLevel = b.activityLevel?.level || 'inactive';
      
      // Compare by activity level first
      const levelDiff = activityPriority[aLevel] - activityPriority[bLevel];
      
      // If activity levels are different, sort by level
      if (levelDiff !== 0) {
        return levelDiff;
      }
      
      // If activity levels are the same, sort by total interactions (descending)
      return b.totalInteractions - a.totalInteractions;
    });
  
  // Calculate totals and insights
  const totalInteractions = rankedServers.reduce((sum, server) => sum + server.totalInteractions, 0);
  
  // Get recent entries within the time period for unique user calculation
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const recentLogEntries = logEntries.filter(entry => {
    // Exclude CastBot dev server
    if (entry.server.id === '1331657596087566398') {
      return false;
    }
    return entry.timestamp && entry.timestamp >= cutoffDate;
  });
  
  // Calculate unique users from filtered entries
  const totalUniqueUsers = new Set(recentLogEntries.map(entry => entry.user.username)).size;
  
  const activeServers = rankedServers.filter(server => server.totalInteractions > 0).length;
  
  // Identify trends and insights
  const insights = {
    mostActive: rankedServers[0] || null,
    leastActive: rankedServers[rankedServers.length - 1] || null,
    highEngagement: rankedServers.filter(s => s.avgDailyActivity > 50),
    powerUsers: rankedServers.filter(s => s.uniqueUserCount > 10)
  };
  
  return {
    period: `${daysBack} days`,
    totalInteractions,
    totalUniqueUsers,
    activeServers,
    rankedServers: rankedServers, // All servers
    insights,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Format server usage summary for Discord display
 * @param {Object} summary - Server usage summary from generateServerUsageSummary
 * @returns {Object} Discord embed data
 */
function formatServerUsageForDiscord(summary) {
  const { rankedServers, totalInteractions, totalUniqueUsers, activeServers, period, insights } = summary;
  
  // Build main ranking text
  let rankingText = '';
  
  if (rankedServers.length === 0) {
    rankingText = 'No server activity found in the specified period.';
  } else {
    // Helper function to generate rank emojis
    function getRankEmoji(rank) {
      const medals = ['🥇', '🥈', '🥉'];
      if (rank < 3) return medals[rank];
      
      const rankNum = rank + 1;
      if (rankNum < 10) return `${rankNum}️⃣`;
      
      // For numbers 10+, combine digit emojis
      const digits = rankNum.toString().split('');
      return digits.map(digit => `${digit}️⃣`).join('');
    }
    
    // Limit to top 8 servers to prevent Discord embed size limits
    const displayServers = rankedServers.slice(0, 8);
    const hasMoreServers = rankedServers.length > 8;
    
    displayServers.forEach((server, index) => {
      const medal = getRankEmoji(index);
      const serverDisplay = server.serverName.length > 25 
        ? server.serverName.substring(0, 25) + '...'
        : server.serverName;
      
      rankingText += `${medal} **${serverDisplay}**: ${server.totalInteractions.toLocaleString()} (${server.uniqueUserCount} users, ${server.slashCommands}cmd/${server.buttonClicks}btn)\n`;
    });
    
    if (hasMoreServers) {
      rankingText += `... and ${rankedServers.length - 8} more servers\n`;
    }
  }
  
  // Build insights text
  let insightsText = '';
  
  if (insights.mostActive) {
    insightsText += `🔥 **Most Active**: ${insights.mostActive.serverName} (${insights.mostActive.avgDailyActivity}/day avg)\n`;
  }
  
  if (insights.powerUsers.length > 0) {
    insightsText += `👥 **High User Engagement**: ${insights.powerUsers.length} servers with 10+ active users\n`;
  }
  
  if (insights.highEngagement.length > 0) {
    insightsText += `⚡ **High Activity**: ${insights.highEngagement.length} servers with 50+ daily interactions\n`;
  }
  
  
  if (!insightsText) {
    insightsText = 'No specific trends detected in this period.';
  }
  
  // Build summary stats
  const summaryText = [
    `📊 **Total Interactions**: ${totalInteractions.toLocaleString()}`,
    `👥 **Unique Users**: ${totalUniqueUsers}`,
    `🏰 **Active Servers**: ${activeServers}`,
    `⏱️ **Period**: Last ${period}`
  ].join('\n');
  
  return {
    embeds: [{
      title: '📈 Server Usage Analytics',
      description: summaryText,
      color: 0x3498db, // Blue color
      fields: [
        {
          name: '🏆 Server Rankings',
          value: rankingText.substring(0, 1020) || 'No data available',
          inline: false
        },
        {
          name: '💡 Insights',
          value: insightsText.substring(0, 1024),
          inline: false
        }
      ],
      footer: {
        text: `Generated at ${new Date(summary.generatedAt).toLocaleString('en-US', { 
          timeZone: 'UTC',
          year: 'numeric',
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })} UTC`
      },
      timestamp: summary.generatedAt
    }]
  };
}

/**
 * Create a condensed text summary for cases where embeds might be too long
 * @param {Object} summary - Server usage summary
 * @returns {string} Text-only summary
 */
function formatServerUsageAsText(summary) {
  const { rankedServers, totalInteractions, totalUniqueUsers, activeServers, period } = summary;
  
  let text = `📈 **Server Usage Analytics (Last ${period})**\n\n`;
  text += `📊 ${totalInteractions.toLocaleString()} total interactions across ${activeServers} servers\n`;
  text += `👥 ${totalUniqueUsers} unique users active\n\n`;
  
  if (rankedServers.length > 0) {
    text += '🏆 **Top Servers:**\n';
    rankedServers.slice(0, 5).forEach((server, index) => {
      const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
      text += `${medal} ${server.serverName}: ${server.totalInteractions} interactions\n`;
    });
  }
  
  return text;
}

/**
 * Calculate optimal server limit for Components V2 based on Discord limits
 * @param {Array} rankedServers - Array of server data
 * @returns {Object} { displayServers, hasMore, estimatedLength }
 */
function calculateOptimalServerLimit(rankedServers) {
  const CHAR_LIMIT = 4000; // Maximum total message length
  const SAFETY_BUFFER = 200; // Reduced safety buffer for simple structure
  
  // Since we're using a single Container with one Text Display component,
  // we don't need to worry about component limits (only 2 components total)
  // The only real limit is the 4000 character content limit
  
  let displayServers = [];
  let totalLength = 0;
  
  // Calculate base content length (everything except server rankings)
  const baseContent = `📈 **Server Usage Analytics**

📊 **Total Interactions**: 9,999
👥 **Unique Users**: 999
🏰 **Active Servers**: 99
⏱️ **Period**: Last 42 days
📈 **Showing**: Top 99 of 99 servers

🏆 **Server Rankings**

💡 **Key Insights**

🔥 **Most Active**: Sample Server Name (999/day avg)
👥 **High User Engagement**: 99 servers with 10+ active users
⚡ **High Activity**: 99 servers with 50+ daily interactions

🕒 Generated at Jun 28, 2025, 07:42 AM UTC`;
  
  totalLength = baseContent.length + SAFETY_BUFFER;
  
  // Add servers until we approach the character limit
  for (let i = 0; i < rankedServers.length; i++) {
    const server = rankedServers[i];
    if (!server) break;
    
    // Calculate the exact format used in production
    const serverDisplay = server.serverName.length > 25 
      ? server.serverName.substring(0, 25) + '...'
      : server.serverName;
    
    // Match the exact production format: emoji + name + stats + last activity + newlines
    let serverContent = `🏆 **${serverDisplay}**: ${server.totalInteractions.toLocaleString()} interactions\n`;
    serverContent += `   └ ${server.uniqueUserCount} users • ${server.slashCommands} commands • ${server.buttonClicks} buttons\n`;
    
    // Add estimated space for last activity line
    if (server.lastActivityEntry) {
      serverContent += `   └ Last Activity: [12:34AM] Wed 01 Jan 25 | SampleUsername\n`;
    }
    
    serverContent += `\n`;
    
    // Check if adding this server would exceed the limit
    if (totalLength + serverContent.length > CHAR_LIMIT) {
      console.log(`📊 DEBUG: Server limit reached at ${i} servers, estimated ${totalLength + serverContent.length} chars would exceed ${CHAR_LIMIT}`);
      break;
    }
    
    displayServers.push(server);
    totalLength += serverContent.length;
  }
  
  console.log(`📊 DEBUG: Selected ${displayServers.length} servers, estimated total: ${totalLength} chars`);
  
  return {
    displayServers,
    hasMore: rankedServers.length > displayServers.length,
    estimatedLength: totalLength,
    componentCount: 2 // Container + Text Display
  };
}

/**
 * Parse recent server installs from analytics log
 * @param {number} limit - Number of most recent installs to return (default: 5)
 * @returns {Array} Array of recent server installs
 */
async function parseRecentServerInstalls(limit = 5) {
  try {
    if (!fs.existsSync(USER_ANALYTICS_LOG)) {
      return [];
    }
    
    const logData = await fs.promises.readFile(USER_ANALYTICS_LOG, 'utf8');
    const lines = logData.split('\n').filter(line => line.trim());
    
    const serverInstalls = [];
    
    for (const line of lines) {
      // Look for server install announcements: "🎉🥳 **New Server Install**: `ServerName` (ID) | Owner: User" or SERVER_INSTALL entries
      if (line.includes('New Server Install') || line.includes('SERVER_INSTALL')) {
        try {
          // Extract timestamp from the line (various formats)
          let timestamp = null;
          
          // Format 1: [timestamp] at start (standard SERVER_INSTALL format)
          const bracketTimestampMatch = line.match(/^(\[[^\]]+\])\s+([^|]+)/);
          if (bracketTimestampMatch) {
            const fullTimestamp = `${bracketTimestampMatch[1]} ${bracketTimestampMatch[2].trim()}`;
            timestamp = parseTimestamp(fullTimestamp);
          }
          
          // Format 2: # [timestamp] | announcement (from Discord announcements)
          if (!timestamp) {
            const hashTimestampMatch = line.match(/^#\s*(.+?)\s*\|/);
            if (hashTimestampMatch) {
              timestamp = parseTimestamp(hashTimestampMatch[1]);
            }
          }
          
          // Skip entries without valid timestamps
          if (!timestamp) {
            console.log(`📈 DEBUG: Skipping server install line without timestamp: ${line.substring(0, 100)}`);
            continue;
          }
          
          let serverName, serverId, ownerInfo;
          
          // Format 1: New SERVER_INSTALL format - [timestamp] | SERVER_INSTALL | ServerName (ID) | Owner: DisplayName
          if (line.includes('SERVER_INSTALL')) {
            const serverInstallMatch = line.match(/SERVER_INSTALL\s*\|\s*([^(]+?)\s*\((\d+)\)\s*\|\s*Owner:\s*(.+)$/);
            if (serverInstallMatch) {
              [, serverName, serverId, ownerInfo] = serverInstallMatch;
              serverName = serverName.trim();
              ownerInfo = ownerInfo.trim();
            }
          } else {
            // Format 2: Discord announcement format - `ServerName` (ID) | Owner: DisplayName
            const serverMatch = line.match(/`([^`]+)`\s*\((\d+)\)/);
            if (serverMatch) {
              [, serverName, serverId] = serverMatch;
              
              // Extract owner info - format: Owner: DisplayName (username) (ID)
              const ownerMatch = line.match(/Owner:\s*([^(]+?)(?:\s*\(([^)]+)\))?(?:\s*\((\d+)\))?/);
              if (ownerMatch) {
                const [, displayName, username, ownerId] = ownerMatch;
                if (username && username !== 'unknown') {
                  ownerInfo = `${displayName.trim()} (${username})`;
                } else {
                  ownerInfo = displayName.trim();
                }
              } else {
                ownerInfo = 'Unknown';
              }
            }
          }
          
          if (serverName && serverId) {
            serverInstalls.push({
              timestamp,
              serverName,
              serverId,
              owner: ownerInfo || 'Unknown',
              rawLine: line
            });
          }
        } catch (parseError) {
          console.warn('Failed to parse server install line:', line, parseError.message);
        }
      }
    }
    
    // Sort by timestamp (newest first) and return the most recent ones
    return serverInstalls
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
      
  } catch (error) {
    console.error('Error parsing recent server installs:', error);
    return [];
  }
}

/**
 * Format server usage summary for Discord Components V2 display with pagination
 * @param {Object} summary - Server usage summary from generateServerUsageSummary
 * @param {number} currentPage - Current page number (0-indexed)
 * @returns {Object} Discord Components V2 response data
 */
async function formatServerUsageForDiscordV2(summary, currentPage = 0) {
  const { rankedServers, totalInteractions, totalUniqueUsers, activeServers, period, insights } = summary;
  
  // Get recent server installs (most recent 5, regardless of time)
  const recentInstalls = await parseRecentServerInstalls(5);
  
  // Pagination configuration
  const SERVERS_PER_PAGE = 10; // Fixed number of servers per page
  const totalServers = rankedServers.length;
  const totalPages = Math.max(1, Math.ceil(totalServers / SERVERS_PER_PAGE));
  
  // Ensure current page is within bounds
  const validPage = Math.max(0, Math.min(currentPage, totalPages - 1));
  
  // Get servers for current page
  const startIndex = validPage * SERVERS_PER_PAGE;
  const endIndex = Math.min(startIndex + SERVERS_PER_PAGE, totalServers);
  const displayServers = rankedServers.slice(startIndex, endIndex);
  
  console.log(`📊 DEBUG: Server Stats Pagination - Page ${validPage + 1}/${totalPages}, showing servers ${startIndex + 1}-${endIndex} of ${totalServers}`);
  
  // Helper function to generate rank emojis
  function getRankEmoji(rank) {
    const medals = ['🥇', '🥈', '🥉'];
    if (rank < 3) return medals[rank];
    
    const rankNum = rank + 1;
    if (rankNum < 10) return `${rankNum}️⃣`;
    
    // For numbers 10+, combine digit emojis
    const digits = rankNum.toString().split('');
    return digits.map(digit => `${digit}️⃣`).join('');
  }
  
  // Helper function to build pagination buttons - returns separate objects for pagination and refresh
  function buildPaginationButtons(currentPage, totalPages, totalServers) {
    const result = {
      paginationRow: null,
      refreshRow: {
        type: 1, // Action Row
        components: [{
          type: 2, // Button
          style: 4, // Danger (red)
          emoji: { name: '📈' },
          label: 'Refresh',
          custom_id: 'prod_server_usage_stats'
        }]
      }
    };
    
    // If only one page, don't add pagination row
    if (totalPages <= 1) {
      return result;
    }
    
    // Helper function to generate range label for a page
    function getRangeLabel(page) {
      const start = (page * SERVERS_PER_PAGE) + 1;
      const end = Math.min((page + 1) * SERVERS_PER_PAGE, totalServers);
      return `${start}-${end}`;
    }
    
    // Build pagination buttons (can now have up to 5)
    const paginationButtons = [];
    
    if (totalPages <= 5) {
      // Show all page ranges if 5 or fewer pages
      for (let page = 0; page < totalPages; page++) {
        paginationButtons.push({
          type: 2, // Button
          custom_id: `server_stats_page_${page}`,
          label: getRangeLabel(page),
          style: page === currentPage ? 1 : 2, // Primary if current, Secondary otherwise
          disabled: page === currentPage
        });
      }
    } else {
      // Smart pagination for more than 5 pages
      // Always show first, last, and current page
      // Fill remaining slots with adjacent pages
      
      const pagesToShow = new Set();
      
      // Always include first and last
      pagesToShow.add(0);
      pagesToShow.add(totalPages - 1);
      
      // Include current page and adjacent pages
      pagesToShow.add(currentPage);
      if (currentPage > 0) pagesToShow.add(currentPage - 1);
      if (currentPage < totalPages - 1) pagesToShow.add(currentPage + 1);
      
      // Convert to sorted array and take first 5
      const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b).slice(0, 5);
      
      for (const page of sortedPages) {
        paginationButtons.push({
          type: 2, // Button
          custom_id: `server_stats_page_${page}`,
          label: getRangeLabel(page),
          style: page === currentPage ? 1 : 2, // Primary if current, Secondary otherwise
          disabled: page === currentPage
        });
      }
    }
    
    // Add pagination action row if we have pagination buttons
    if (paginationButtons.length > 0) {
      result.paginationRow = {
        type: 1, // Action Row
        components: paginationButtons
      };
    }
    
    return result;
  }
  
  // Build Components V2 structure with proper separators between sections
  const components = [];
  const containerComponents = [];
  
  // Add main heading above the container
  components.push({
    type: 10, // Text Display
    content: `# ${formatBotEmoji('castbot_logo')} CastBot Analytics`
  });
  
  // Section 1: Recent Server Installs
  let installsContent = '';
  if (recentInstalls.length > 0) {
    installsContent += `### 💾 Latest ${recentInstalls.length} Server Installs\n\n`;
    
    recentInstalls.forEach((install, index) => {
      // Format timestamp in compact format
      const installDate = new Date(install.timestamp);
      const dayStr = installDate.toLocaleDateString('en-US', { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric'
      });
      
      // Truncate server name if too long
      const serverDisplay = install.serverName.length > 35 
        ? install.serverName.substring(0, 35) + '...'
        : install.serverName;
      
      // Extract display name and username from owner string
      const ownerMatch = install.owner.match(/^(.+?)\s*\((@[^)]+)\)/);
      const displayName = ownerMatch ? ownerMatch[1] : install.owner.split(' ')[0];
      const username = ownerMatch ? ownerMatch[2] : '';
      const ownerDisplay = username ? `${displayName} (${username})` : displayName;
      
      installsContent += `• \`${dayStr}\` | **${serverDisplay}** | ${ownerDisplay}\n`;
    });
    installsContent += '\n';
  } else {
    installsContent += `### 💾 Latest Server Installs\n\n`;
    installsContent += `📭 No server installations found in logs\n\n`;
  }
  
  containerComponents.push({
    type: 10, // Text Display
    content: installsContent
  });
  
  // Add separator between sections
  containerComponents.push({
    type: 14, // Separator
    divider: true,
    spacing: 1
  });
  
  // Section 2: Server Rankings
  let rankingsContent = '';
  if (displayServers.length > 0) {
    rankingsContent += `### 🏆 Server Rankings (Page ${validPage + 1}/${totalPages})\n\n`;
    
    displayServers.forEach((server, pageIndex) => {
      const actualRank = startIndex + pageIndex; // Calculate actual rank in full list
      const medal = getRankEmoji(actualRank);
      const serverDisplay = server.serverName.length > 25 
        ? server.serverName.substring(0, 25) + '...'
        : server.serverName;
      
      rankingsContent += `\`${medal} ${serverDisplay}: ${server.totalInteractions.toLocaleString()} interactions ${server.activityLevel.emoji}\`\n`;
      
      // Build feature usage display
      const featureList = [];
      const features = server.features || {};
      
      if (features.castlist > 0) {
        featureList.push(`🖼️ castlist (x${features.castlist})`);
      }
      if (features.seasonApplications > 0) {
        featureList.push(`📝 szn apps (x${features.seasonApplications})`);
      }
      if (features.safari > 0) {
        featureList.push(`🦁 safari (x${features.safari})`);
      }
      if (features.castRanking > 0) {
        featureList.push(`🏆 ranking (x${features.castRanking})`);
      }
      if (features.reactForRoles > 0) {
        featureList.push(`💜 r4r (x${features.reactForRoles})`);
      }
      if (features.playerEmojis > 0) {
        featureList.push(`😀 player emojis (x${features.playerEmojis})`);
      }
      if (features.vanityRoles > 0) {
        featureList.push(`✨ vanity roles (x${features.vanityRoles})`);
      }
      
      // Display features or fallback to basic stats if no features detected
      if (featureList.length > 0) {
        rankingsContent += `   └ ${server.uniqueUserCount} users • ${featureList.join(' • ')}\n`;
      } else {
        rankingsContent += `   └ ${server.uniqueUserCount} users • ${server.slashCommands} commands • ${server.buttonClicks} buttons\n`;
      }
      
      // Add last activity if available
      if (server.lastActivityEntry) {
        const lastEntry = server.lastActivityEntry;
        // Extract full timestamp including date from the raw log line
        // Format: [4:04PM] Sun 29 Jun 25 | Connor (.connah) in EpochORG...
        const timestampMatch = lastEntry.rawLine.match(/^(\[[^\]]+\] \w{3} \d{1,2} \w{3} \d{2})/);
        const timestamp = timestampMatch ? timestampMatch[1] : '[Unknown]';
        
        // Format: └ Last Activity: [4:04PM] Sun 29 Jun 25 | Username | Action Detail
        let activityLine = `   └ Last Activity: ${timestamp} | ${lastEntry.user.displayName || lastEntry.user.username}`;
        
        // Add action detail if available
        if (lastEntry.actionDetail && lastEntry.actionDetail.trim()) {
          activityLine += ` | ${lastEntry.actionDetail}`;
        }
        
        rankingsContent += `${activityLine}\n`;
      }
      
      rankingsContent += `\n`;
    });
  } else {
    rankingsContent += `📭 **No server activity found**\n\nNo interactions recorded in the specified period.\n\n`;
  }
  
  containerComponents.push({
    type: 10, // Text Display
    content: rankingsContent
  });
  
  // Add separator between sections
  containerComponents.push({
    type: 14, // Separator
    divider: true,
    spacing: 1
  });
  
  // Section 3: Server Stats - Totals with period in header
  let analyticsContent = '';
  analyticsContent += `### 📈 Server Stats - Totals (${period})\n`;
  
  // Summary statistics on a single line with pipe separators - removed Active Servers and period
  analyticsContent += `📊 Interactions: ${totalInteractions.toLocaleString()} | 👥 Unique Users: ${totalUniqueUsers}\n`;
  
  // Calculate activity level breakdown
  const activityBreakdown = {
    recent: 0,    // 🟢 ≤1d
    moderate: 0,  // 🟠 ≤4d
    inactive: 0   // 🔴 ≥4d
  };
  
  // Count servers by activity level
  rankedServers.forEach(server => {
    const level = server.activityLevel?.level || 'inactive';
    activityBreakdown[level]++;
  });
  
  // Add activity breakdown on new line
  analyticsContent += `\`🟢 ≤1d\` ${activityBreakdown.recent} servers | \`🟠 ≤4d\` ${activityBreakdown.moderate} servers | \`🔴 ≥4d\` ${activityBreakdown.inactive} servers\n\n`;
  
  containerComponents.push({
    type: 10, // Text Display
    content: analyticsContent
  });
  
  // Get button rows - pagination goes inside container, refresh goes outside
  const buttonRows = buildPaginationButtons(validPage, totalPages, totalServers);
  
  // Add separator before pagination buttons (if they exist)
  if (buttonRows.paginationRow) {
    containerComponents.push({
      type: 14, // Separator
      divider: true,
      spacing: 1
    });
    // Add pagination buttons INSIDE the container
    containerComponents.push(buttonRows.paginationRow);
  }
  
  // Create Components V2 Container structure (with pagination inside)
  components.push({
    type: 17, // Container
    accent_color: 0xFF0000, // Red accent bar
    components: containerComponents
  });
  
  // Add refresh button OUTSIDE the container
  components.push(buttonRows.refreshRow);
  
  return {
    components,
    flags: (1 << 15) // IS_COMPONENTS_V2 flag
  };
}

export { 
  parseUserAnalyticsLog, 
  calculateServerStats, 
  generateServerUsageSummary,
  formatServerUsageForDiscord,
  formatServerUsageAsText,
  formatServerUsageForDiscordV2,
  calculateOptimalServerLimit,
  parseRecentServerInstalls,
  detectFeatureUsage,
  calculateActivityLevel
};