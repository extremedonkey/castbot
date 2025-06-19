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
    
    let timestamp, userInfo, serverInfo, actionType, actionDetail;
    
    if (line.includes('[ANALYTICS]')) {
      // Old format parsing
      timestamp = parseTimestamp(parts[0]);
      const userServerPart = parts[1];
      actionType = parts[2];
      actionDetail = parts[3] || '';
      
      const userMatch = userServerPart.match(/(\w+) in (.+)/);
      if (userMatch) {
        userInfo = { username: userMatch[1], displayName: userMatch[1] };
        serverInfo = { name: userMatch[2], id: 'unknown' };
      }
    } else {
      // New format parsing
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
    
    // Final validation that timestamp is a valid Date
    if (isNaN(timestamp.getTime())) {
      return null;
    }
    
    return {
      timestamp,
      user: userInfo,
      server: serverInfo,
      actionType: actionType.trim(),
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
    for (const line of lines) {
      const parsed = parseLogLine(line);
      if (parsed) {
        parsedEntries.push(parsed);
      } else {
        console.log(`📈 DEBUG: Failed to parse line: ${line.substring(0, 100)}...`);
      }
    }
    
    console.log(`📈 DEBUG: Successfully parsed ${parsedEntries.length} entries`);
    
    return parsedEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error reading analytics log:', error);
    return [];
  }
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
  
  // Filter entries within time period
  const recentEntries = logEntries.filter(entry => {
    const entryDate = entry.timestamp;
    
    // Validate that entryDate is a valid Date object
    if (!entryDate || isNaN(entryDate.getTime())) {
      console.log(`📈 DEBUG: Skipping entry with invalid date: ${entry.rawLine.substring(0, 50)}...`);
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
  
  for (const entry of recentEntries) {
    const serverId = entry.server.id;
    const serverName = entry.server.name;
    const serverKey = `${serverName} (${serverId})`;
    
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
        dailyActivity: {}
      };
    }
    
    const stats = serverStats[serverKey];
    
    // Update stats
    stats.totalInteractions++;
    stats.lastActivity = Math.max(stats.lastActivity || 0, new Date(entry.timestamp).getTime());
    
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
  });
  
  return serverStats;
}

/**
 * Generate server usage summary for Discord display
 * @param {number} daysBack - Number of days to analyze (default: 7)
 * @returns {Object} Analytics summary with rankings and insights
 */
async function generateServerUsageSummary(daysBack = 7) {
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
    commandHeavy: rankedServers.filter(s => s.commandToButtonRatio < 0.5),
    buttonHeavy: rankedServers.filter(s => s.commandToButtonRatio > 3),
    highEngagement: rankedServers.filter(s => s.avgDailyActivity > 50),
    powerUsers: rankedServers.filter(s => s.uniqueUserCount > 10)
  };
  
  return {
    period: `${daysBack} days`,
    totalInteractions,
    totalUniqueUsers,
    activeServers,
    rankedServers: rankedServers.slice(0, 15), // Top 15 servers
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
    // Medal emojis for top 3
    const medals = ['🥇', '🥈', '🥉'];
    
    rankedServers.slice(0, 10).forEach((server, index) => {
      const medal = index < 3 ? medals[index] : `${index + 1}️⃣`;
      const serverDisplay = server.serverName.length > 25 
        ? server.serverName.substring(0, 25) + '...'
        : server.serverName;
      
      rankingText += `${medal} **${serverDisplay}**: ${server.totalInteractions.toLocaleString()} interactions\n`;
      rankingText += `   └ ${server.uniqueUserCount} users • ${server.slashCommands} commands • ${server.buttonClicks} buttons\n\n`;
    });
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
  
  if (insights.commandHeavy.length > 0) {
    insightsText += `⌨️ **Command-Heavy Servers**: ${insights.commandHeavy.length} servers prefer slash commands\n`;
  }
  
  if (insights.buttonHeavy.length > 0) {
    insightsText += `🔘 **Button-Heavy Servers**: ${insights.buttonHeavy.length} servers prefer button interactions\n`;
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
          value: rankingText.substring(0, 1024) || 'No data available',
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

export { 
  parseUserAnalyticsLog, 
  calculateServerStats, 
  generateServerUsageSummary,
  formatServerUsageForDiscord,
  formatServerUsageAsText
};