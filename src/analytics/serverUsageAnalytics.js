#!/usr/bin/env node

/**
 * Server Usage Analytics
 * Analyzes user-analytics.log to provide server usage statistics and rankings
 */

import fs from 'fs';
import path from 'path';

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
  
  // Handle different log formats
  // New format: [8:18AM] Thu 19 Jun 25 | ReeceBot (extremedonkey) in CastBot (1331657596087566398) | BUTTON_CLICK | Show Default Castlist (show_castlist2_default)
  // Old format: [ANALYTICS] 2025-06-18T15:01:16.725Z | extremedonkey in Unknown Server | SLASH_COMMAND | /castlist
  
  try {
    const parts = line.split(' | ');
    if (parts.length < 3) return null;
    
    let timestamp, userInfo, serverInfo, actionType, actionDetail, channelName;
    
    if (line.includes('[ANALYTICS]')) {
      // Format 1: [ANALYTICS] 2025-06-18T15:01:16.725Z | extremedonkey in Unknown Server | SLASH_COMMAND | /castlist
      timestamp = parseTimestamp(parts[0]);
      const userServerPart = parts[1];
      actionType = parts[2];
      actionDetail = parts[3] || '';
      
      const userMatch = userServerPart.match(/(\w+) in (.+)/);
      if (userMatch) {
        userInfo = { username: userMatch[1], displayName: userMatch[1] };
        serverInfo = { name: userMatch[2], id: 'unknown' };
      }
    } else if (parts[1] && (parts[1].includes('SLASH_COMMAND in') || parts[1].includes('BUTTON_CLICK in'))) {
      // Format 3: [5:52PM] Thu 19 Jun 25 | SLASH_COMMAND in /dev_menu (TestUser) | 1331657596087566398 | 1385059476243218552
      timestamp = parseTimestamp(parts[0]);
      const actionPart = parts[1];
      const serverId = parts[2];
      const channelId = parts[3] || '';
      
      // Extract action type and details from "SLASH_COMMAND in /dev_menu (TestUser)"
      const actionMatch = actionPart.match(/(SLASH_COMMAND|BUTTON_CLICK) in (.+?) \((.+?)\)/);
      if (actionMatch) {
        actionType = actionMatch[1];
        actionDetail = actionMatch[2];
        userInfo = { username: actionMatch[3], displayName: actionMatch[3] };
        serverInfo = { name: 'CastBot', id: serverId.trim() };
      }
    } else if (parts.length >= 5 && parts[2].startsWith('#')) {
      // NEW FORMAT 4: [8:18AM] Thu 19 Jun 25 | ReeceBot (extremedonkey) in CastBot (1331657596087566398) | #channel | BUTTON_CLICK | 📋 Menu (viral_menu)
      timestamp = parseTimestamp(parts[0]);
      const userServerPart = parts[1];
      channelName = parts[2]; // #channel
      actionType = parts[3];
      actionDetail = parts[4] || '';
      
      // Extract user info: "ReeceBot (extremedonkey) in CastBot (1331657596087566398)"
      const userServerMatch = userServerPart.match(/(.+?) \((.+?)\) in (.+?)$/);
      if (userServerMatch) {
        userInfo = { 
          displayName: userServerMatch[1], 
          username: userServerMatch[2] 
        };
        
        const serverPart = userServerMatch[3].trim();
        // Check if server part ends with (ID)
        const serverIdMatch = serverPart.match(/^(.+?) \((\d+)\)$/);
        if (serverIdMatch) {
          serverInfo = { 
            name: serverIdMatch[1], 
            id: serverIdMatch[2] 
          };
        } else {
          // Server name without explicit ID
          serverInfo = { 
            name: serverPart, 
            id: 'unknown' 
          };
        }
      }
    } else {
      // Format 2: [8:18AM] Thu 19 Jun 25 | ReeceBot (extremedonkey) in CastBot (1331657596087566398) | BUTTON_CLICK | 📋 Menu (viral_menu)
      timestamp = parseTimestamp(parts[0]);
      const userServerPart = parts[1];
      actionType = parts[2];
      actionDetail = parts[3] || '';
      
      // Extract user info: "ReeceBot (extremedonkey) in CastBot (1331657596087566398)"
      // Handle both "Server (ID)" and "Server Name" formats
      const userServerMatch = userServerPart.match(/(.+?) \((.+?)\) in (.+?)$/);
      if (userServerMatch) {
        userInfo = { 
          displayName: userServerMatch[1], 
          username: userServerMatch[2] 
        };
        
        const serverPart = userServerMatch[3].trim();
        // Check if server part ends with (ID)
        const serverIdMatch = serverPart.match(/^(.+?) \((\d+)\)$/);
        if (serverIdMatch) {
          serverInfo = { 
            name: serverIdMatch[1], 
            id: serverIdMatch[2] 
          };
        } else {
          // Server name without explicit ID
          serverInfo = { 
            name: serverPart, 
            id: 'unknown' 
          };
        }
      }
    }
    
    if (!userInfo || !serverInfo || !timestamp || !actionType) {
      return null;
    }
    
    // Handle edge cases with Safari logs
    // Skip entries with "undefined" usernames (corrupted Safari logs)
    if (userInfo.username === 'undefined' || userInfo.displayName === 'undefined') {
      return null;
    }
    
    // Convert Safari action types to standard analytics format for counting
    let normalizedActionType = actionType.trim();
    if (normalizedActionType.startsWith('SAFARI_')) {
      // Safari actions count as BUTTON_CLICK for analytics purposes
      // since they represent user interactions with Safari buttons
      if (normalizedActionType === 'SAFARI_CUSTOM_ACTION' || 
          normalizedActionType === 'SAFARI_BUTTON' ||
          normalizedActionType === 'SAFARI_MOVEMENT' ||
          normalizedActionType === 'SAFARI_ITEM_PICKUP' ||
          normalizedActionType === 'SAFARI_CURRENCY' ||
          normalizedActionType === 'SAFARI_WHISPER' ||
          normalizedActionType === 'SAFARI_TEST') {
        normalizedActionType = 'BUTTON_CLICK';
      }
    }
    
    // Final validation that timestamp is a valid Date
    if (isNaN(timestamp.getTime())) {
      return null;
    }
    
    return {
      timestamp,
      user: userInfo,
      server: serverInfo,
      actionType: normalizedActionType,
      actionDetail: actionDetail.trim(),
      rawLine: line
    };
  } catch (error) {
    console.warn('Failed to parse log line:', line, error.message);
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
        } else {
          console.log(`📈 DEBUG: Failed to parse line: ${line.substring(0, 100)}...`);
        }
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
    if (customId.includes('season_app') || customId.includes('apply_') || customId.includes('prod_season_applications')) {
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
    
    // 💜 React for Roles - prod_timezone_react and prod_pronoun_react buttons
    if (customId.includes('prod_timezone_react') || customId.includes('prod_pronoun_react')) {
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
      console.log(`📈 DEBUG: Skipping entry with invalid date: ${entry.rawLine.substring(0, 50)}...`);
      return false;
    }
    
    // Exclude specific server ID (CastBot server)
    if (entry.server.id === '1331657596087566398') {
      return false;
    }
    
    const isRecent = entryDate >= cutoffDate;
    if (!isRecent) {
      console.log(`📈 DEBUG: Filtering out old entry: ${entry.rawLine.substring(0, 50)}... (${entryDate.toISOString()})`);
    }
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
  
  // Convert to array and sort by total interactions
  const rankedServers = Object.values(serverStats)
    .sort((a, b) => b.totalInteractions - a.totalInteractions);
  
  // Calculate totals and insights
  const totalInteractions = rankedServers.reduce((sum, server) => sum + server.totalInteractions, 0);
  const totalUniqueUsers = new Set(logEntries.map(entry => entry.user.username)).size;
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
 * Format server usage summary for Discord Components V2 display
 * @param {Object} summary - Server usage summary from generateServerUsageSummary
 * @returns {Object} Discord Components V2 response data
 */
async function formatServerUsageForDiscordV2(summary) {
  const { rankedServers, totalInteractions, totalUniqueUsers, activeServers, period, insights } = summary;
  
  // Get recent server installs (most recent 5, regardless of time)
  const recentInstalls = await parseRecentServerInstalls(5);
  
  // Calculate optimal server display limit
  const { displayServers, hasMore, estimatedLength, componentCount } = calculateOptimalServerLimit(rankedServers);
  
  console.log(`📊 DEBUG: Components V2 Analytics - ${displayServers.length} servers, ${componentCount} components, ~${estimatedLength} chars, ${recentInstalls.length} recent installs`);
  
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
  
  // Build a simpler Components V2 structure using only Text Display components in a flat layout
  const components = [];
  
  // Create a single text block with all the content
  let fullContent = `> ## 📈 Server Usage Analytics\n\n`;
  
  // Summary statistics
  fullContent += `📊 **Total Interactions**: ${totalInteractions.toLocaleString()}\n`;
  fullContent += `👥 **Unique Users**: ${totalUniqueUsers}\n`;
  fullContent += `🏰 **Active Servers**: ${activeServers}\n`;
  fullContent += `⏱️ **Period**: Last ${period}\n`;
  fullContent += `📈 **Showing**: Top ${displayServers.length} of ${rankedServers.length} servers\n\n`;
  
  // Server rankings
  if (displayServers.length > 0) {
    fullContent += `> ## 🏆 Server Rankings\n\n`;
    
    displayServers.forEach((server, index) => {
      const medal = getRankEmoji(index);
      const serverDisplay = server.serverName.length > 25 
        ? server.serverName.substring(0, 25) + '...'
        : server.serverName;
      
      fullContent += `\`${medal} ${serverDisplay}: ${server.totalInteractions.toLocaleString()} interactions ${server.activityLevel.emoji}\`\n`;
      
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
        fullContent += `   └ ${server.uniqueUserCount} users • ${featureList.join(' • ')}\n`;
      } else {
        fullContent += `   └ ${server.uniqueUserCount} users • ${server.slashCommands} commands • ${server.buttonClicks} buttons\n`;
      }
      
      // Add last activity if available
      if (server.lastActivityEntry) {
        const lastEntry = server.lastActivityEntry;
        // Extract full timestamp including date from the raw log line
        // Format: [4:04PM] Sun 29 Jun 25 | Connor (.connah) in EpochORG...
        const timestampMatch = lastEntry.rawLine.match(/^(\[[^\]]+\] \w{3} \d{1,2} \w{3} \d{2})/);
        const timestamp = timestampMatch ? timestampMatch[1] : '[Unknown]';
        
        // Format: └ Last Activity: [4:04PM] Sun 29 Jun 25 | Username
        fullContent += `   └ Last Activity: ${timestamp} | ${lastEntry.user.displayName || lastEntry.user.username}\n`;
      }
      
      fullContent += `\n`;
    });
    
    if (hasMore) {
      fullContent += `📋 And ${rankedServers.length - displayServers.length} more servers...\n\n`;
    }
  } else {
    fullContent += `📭 **No server activity found**\n\nNo interactions recorded in the specified period.\n\n`;
  }
  
  // Insights section removed per user request
  
  // Recent Server Installs section
  if (recentInstalls.length > 0) {
    fullContent += `> ## 🆕 Most Recent Server Installs (Latest ${recentInstalls.length})\n\n`;
    
    recentInstalls.forEach((install, index) => {
      // Format timestamp in compact format
      const installDate = new Date(install.timestamp);
      const timeStr = installDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      const dayStr = installDate.toLocaleDateString('en-US', { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric'
      });
      
      // Truncate server name if too long
      const serverDisplay = install.serverName.length > 30 
        ? install.serverName.substring(0, 30) + '...'
        : install.serverName;
      
      // Extract just the username from owner string (remove @ and ID)
      const ownerMatch = install.owner.match(/^(.+?)\s*\(@/);
      const ownerName = ownerMatch ? ownerMatch[1] : install.owner.split(' ')[0];
      
      fullContent += `📅 **${serverDisplay}** ([${timeStr}] ${dayStr}, ${ownerName})\n`;
    });
  } else {
    fullContent += `> ## 🆕 Most Recent Server Installs\n\n`;
    fullContent += `📭 No server installations found in logs\n\n`;
  }
  
  // Footer
  fullContent += `🕒 Generated at ${new Date(summary.generatedAt).toLocaleString('en-US', { 
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })} UTC`;
  
  // Trim content to fit Discord's 4000 character limit
  if (fullContent.length > 3800) {
    fullContent = fullContent.substring(0, 3800) + '\n\n... (content truncated)';
  }
  
  // Create Components V2 structure with Container, text content, and refresh button
  components.push({
    type: 17, // Container
    accent_color: 0xFF0000, // Red accent bar
    components: [
      {
        type: 10, // Text Display
        content: fullContent
      },
      {
        type: 1, // Action Row
        components: [{
          type: 2, // Button
          style: 4, // Danger (red)
          emoji: { name: '📈' },
          label: 'Refresh Stats',
          custom_id: 'prod_server_usage_stats'
        }]
      }
    ]
  });
  
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