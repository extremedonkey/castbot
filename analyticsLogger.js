import fs from 'fs';
import path from 'path';

const ANALYTICS_LOG_FILE = './logs/user-analytics.log';

// Button label mappings for common buttons that may not be extractable from components
const BUTTON_LABEL_MAP = {
  // Production menu buttons
  'prod_setup': '🪛 Setup',
  'prod_manage_pronouns_timezones': '💜 Manage Pronouns/Timezones',
  'prod_manage_tribes': '🔥 Manage Tribes',
  'admin_manage_player': '🧑‍🤝‍🧑 Manage Players',
  'prod_season_applications': '📝 Season Applications',
  'prod_setup_tycoons': '💰 Tycoons',
  'prod_analytics_dump': '📊 Analytics',
  'prod_live_analytics': '🔴 Live Analytics',
  'prod_player_menu': '👤 Player Menu',
  
  // Tribe management buttons
  'prod_view_tribes': 'View Tribes',
  'prod_add_tribe': 'Add Tribe',
  'prod_clear_tribe': 'Clear Tribe',
  'prod_create_emojis': 'Create Emojis',
  
  // Season applications
  'season_app_creation': 'App Creation',
  'season_app_ranking': '🏆 Cast Ranking',
  'ranking_view_all_scores': 'View All Scores',
  
  // Castlist display
  'show_castlist2_default': 'Show Default Castlist',
  'show_castlist2': 'Show Castlist',
  
  // Menu buttons
  'viral_menu': '📋 Menu',
  'prod_menu_back': 'Back to Production Menu',
  
  // Player Management buttons
  'admin_player_select_update': '🔄 Update Player Selection',
  
  // Navigation patterns
  'castlist2_nav_next_page': '▶ Next Page',
  'castlist2_nav_last_tribe': '▶ Last Tribe',
  'castlist2_nav_first_tribe': '◀ First Tribe',
  'castlist2_prev': '◀ Previous',
  'castlist2_next': '▶ Next'
};

/**
 * Extract human-readable button label from Discord components
 * @param {string} customId - The button's custom ID
 * @param {Array} components - Discord message components array
 * @returns {string} Human-readable button label with emoji, or custom ID as fallback
 */
function getButtonLabel(customId, components) {
  // First try to extract from components
  if (components && Array.isArray(components)) {
    try {
      for (const row of components) {
        if (row.components && Array.isArray(row.components)) {
          for (const component of row.components) {
            if (component.custom_id === customId) {
              // Build human-readable label
              let label = '';
              
              // Add emoji if present
              if (component.emoji) {
                if (component.emoji.name) {
                  label += `${component.emoji.name} `;
                }
              }
              
              // Add text label
              if (component.label) {
                label += component.label;
              }
              
              // Return enhanced label if found
              if (label.trim()) {
                return label.trim();
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error extracting button label:', error);
    }
  }
  
  // Try predefined button mapping
  if (BUTTON_LABEL_MAP[customId]) {
    return BUTTON_LABEL_MAP[customId];
  }
  
  // Check for pattern matches (like navigation buttons)
  for (const [pattern, label] of Object.entries(BUTTON_LABEL_MAP)) {
    if (customId.startsWith(pattern)) {
      return label;
    }
  }
  
  // Special handling for ranking buttons
  if (customId.startsWith('rank_')) {
    const parts = customId.split('_');
    if (parts.length >= 2) {
      return `🏆 Rank ${parts[1]}`;
    }
  }
  
  // Special handling for castlist navigation
  if (customId.includes('castlist2_nav_')) {
    if (customId.includes('next_page')) return '▶ Next Page';
    if (customId.includes('last_tribe')) return '▶ Last Tribe';
    if (customId.includes('first_tribe')) return '◀ First Tribe';
  }
  
  // Special handling for player management buttons with user IDs
  if (customId.startsWith('admin_set_pronouns_')) {
    return '🏷️ Set Player Pronouns';
  }
  if (customId.startsWith('admin_set_timezone_')) {
    return '🌍 Set Player Timezone';
  }
  if (customId.startsWith('admin_set_age_')) {
    return '🎂 Set Player Age';
  }
  if (customId.startsWith('admin_manage_vanity_')) {
    return '✨ Manage Player Vanity Roles';
  }
  if (customId.startsWith('admin_integrated_vanity_')) {
    return '✨ Integrated Vanity Management';
  }
  if (customId.startsWith('admin_integrated_pronouns_')) {
    return '🏷️ Integrated Pronouns Management';
  }
  if (customId.startsWith('admin_integrated_timezone_')) {
    return '🌍 Integrated Timezone Management';
  }
  if (customId.startsWith('admin_integrated_age_')) {
    return '🎂 Integrated Age Management';
  }
  
  // Player-side management buttons
  if (customId.startsWith('player_set_pronouns_')) {
    return '🏷️ Set My Pronouns';
  }
  if (customId.startsWith('player_set_timezone_')) {
    return '🌍 Set My Timezone';
  }
  if (customId.startsWith('player_set_age_')) {
    return '🎂 Set My Age';
  }
  if (customId.startsWith('player_integrated_')) {
    return '⚙️ Player Management';
  }
  
  // Special handling for show castlist buttons
  if (customId.startsWith('show_castlist2_')) {
    const castlistName = customId.replace('show_castlist2_', '');
    return `📋 Show ${castlistName || 'Default'} Castlist`;
  }
  
  // Special handling for select menu interactions (these might be components, not buttons)
  if (customId.includes('_select_')) {
    return '📋 Select Menu Interaction';
  }
  
  // Fallback - return "Unknown" for button clicks, custom_id for everything else
  return 'Unknown';
}

/**
 * Log user interaction to analytics file
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID  
 * @param {string} action - Action type ('SLASH_COMMAND' or 'BUTTON_CLICK')
 * @param {string} details - Command name or button custom ID
 * @param {string} username - Discord username
 * @param {string} guildName - Discord guild name
 * @param {Array} components - Discord message components (for button label extraction)
 * @param {string} channelName - Discord channel name (optional)
 * @param {string} displayName - User's server display name (optional)
 */
async function logInteraction(userId, guildId, action, details, username, guildName, components = null, channelName = null, displayName = null) {
  try {
    // Get environment-specific timezone offset
    const { getLoggingTimezoneOffset } = await import('./storage.js');
    const timezoneOffset = await getLoggingTimezoneOffset();
    
    // Apply environment-specific timezone offset
    const utcDate = new Date();
    const localDate = new Date(utcDate.getTime() + (timezoneOffset * 60 * 60 * 1000));
    
    // Format as timestamp: [12:34PM] Thu 19 Jun 25
    const hours = localDate.getHours();
    const minutes = localDate.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeStr = `${displayHours}:${minutes}${ampm}`;
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[localDate.getDay()];
    const day = localDate.getDate();
    const month = months[localDate.getMonth()];
    const year = localDate.getFullYear().toString().slice(-2);
    const dateStr = `${dayName} ${day} ${month} ${year}`;
    
    const timestamp = `[${timeStr}] ${dateStr}`;
    let logDetails = details;
    
    
    // If it's a button click, try to get human-readable label with fallback mapping
    if (action === 'BUTTON_CLICK') {
      const humanLabel = getButtonLabel(details, components);
      // Format as "ButtonName (command)" if we have a mapped label
      if (humanLabel !== 'Unknown' && humanLabel !== details) {
        logDetails = `${humanLabel} (${details})`;
      } else {
        logDetails = `Unknown (${details})`;
      }
    }
    
    // Enhanced user display: "DisplayName (username)" or just "username"
    const userDisplay = displayName && displayName !== username 
      ? `${displayName} (${username})`
      : username;
    
    // Enhanced server display: "ServerName (guildId)" - prioritize playerData.json since it's more reliable
    let serverDisplay = `Unknown Server (${guildId})`;
    
    // Try to get server name from playerData.json file directly
    try {
      const rawData = fs.readFileSync('./playerData.json', 'utf8');
      const playerData = JSON.parse(rawData);
      
      if (playerData[guildId] && playerData[guildId].serverName) {
        serverDisplay = `${playerData[guildId].serverName} (${guildId})`;
      } else {
        // Fallback to Discord API guild name if available
        if (guildName && guildName !== 'Unknown Server') {
          serverDisplay = `${guildName} (${guildId})`;
        }
      }
    } catch (error) {
      // Fallback to Discord API guild name if available
      if (guildName && guildName !== 'Unknown Server') {
        serverDisplay = `${guildName} (${guildId})`;
      }
    }
    
    // Enhanced action display: include channel and action type
    const actionDisplay = channelName ? `#${channelName} | ${action}` : action;
    
    // Create enhanced log entry format - remove [ANALYTICS] prefix for cleaner display
    const logEntry = `${timestamp} | ${userDisplay} in ${serverDisplay} | ${actionDisplay} | ${logDetails}\n`;
    
    // Ensure logs directory exists
    const logDir = path.dirname(ANALYTICS_LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Append to log file
    fs.appendFileSync(ANALYTICS_LOG_FILE, logEntry);
    
    // Try Discord logging (non-blocking)
    await postToDiscordLogs(logEntry.trim(), userId, action, details, components);
    
  } catch (error) {
    console.error('Analytics logging error:', error);
    // Don't throw - analytics shouldn't break the bot
  }
}

/**
 * Get analytics log file path (for external scripts)
 */
function getLogFilePath() {
  return ANALYTICS_LOG_FILE;
}

// Discord client reference (will be set from app.js)
let discordClient = null;
let targetChannel = null;

/**
 * Set Discord client reference for posting logs
 * @param {Client} client - Discord.js client instance
 */
function setDiscordClient(client) {
  discordClient = client;
  // Clear cached channel when client changes (for environment switches)
  targetChannel = null;
}

/**
 * Format analytics line with Markdown (reused from app.js Live Analytics)
 * @param {string} line - Raw log line
 * @returns {string} Formatted line with Discord Markdown
 */
function formatAnalyticsLine(line) {
  // Parse format with optional channel:
  // [8:33AM] Thu 19 Jun 25 | User (username) in Server Name (1234567890) | #channel | ACTION_TYPE | details
  // [8:33AM] Thu 19 Jun 25 | User (username) in Server Name (1234567890) | ACTION_TYPE | details
  
  // First try the new format with channel
  let match = line.match(/^(\[[\d:APM]+\]\s+\w{3}\s+\d{1,2}\s+\w{3}\s+\d{2})\s+\|\s+(.+?)\s+in\s+(.+?)\s+\((\d+)\)\s+\|\s+(#[\w\-⁠]+)\s+\|\s+([\w_]+)\s+\|\s+(.+)$/);
  
  if (match) {
    // New format with channel
    const [, timestamp, user, serverName, serverId, channel, actionType, details] = match;
    
    // Format components with Markdown
    const formattedUser = `**\`${user}\`**`;
    const formattedServer = `__\`${serverName}\`__`;
    const formattedChannel = `**${channel}**`;
    
    // Format the action details based on action type
    let formattedDetails = formatActionDetails(actionType, details);
    
    return `${timestamp} | ${formattedUser} in ${formattedServer} (${serverId}) | ${formattedChannel} | ${actionType} | ${formattedDetails}`;
  }
  
  // Fallback to old format without channel
  match = line.match(/^(\[[\d:APM]+\]\s+\w{3}\s+\d{1,2}\s+\w{3}\s+\d{2})\s+\|\s+(.+?)\s+in\s+(.+?)\s+\((\d+)\)\s+\|\s+([\w_]+)\s+\|\s+(.+)$/);
  
  if (!match) {
    return line; // Return original if parsing fails
  }
  
  const [, timestamp, user, serverName, serverId, actionType, details] = match;
  
  // Format components with Markdown
  const formattedUser = `**\`${user}\`**`;
  const formattedServer = `__\`${serverName}\`__`;
  
  // Format the action details based on action type
  let formattedDetails = formatActionDetails(actionType, details);
  
  return `${timestamp} | ${formattedUser} in ${formattedServer} (${serverId}) | ${actionType} | ${formattedDetails}`;
}

/**
 * Format action details based on action type
 * @param {string} actionType - The action type (SLASH_COMMAND, BUTTON_CLICK, etc.)
 * @param {string} details - The action details
 * @returns {string} Formatted details with appropriate markdown
 */
function formatActionDetails(actionType, details) {
  if (actionType === 'SLASH_COMMAND') {
    // Bold the entire command for slash commands (e.g., **/menu**)
    return `**${details}**`;
  } else if (actionType === 'BUTTON_CLICK') {
    // For button clicks, bold just the button name (first part before parentheses)
    const buttonMatch = details.match(/^(.+?)\s+\((.+)\)$/);
    if (buttonMatch) {
      const [, buttonName, buttonId] = buttonMatch;
      return `**${buttonName}** (${buttonId})`;
    } else {
      // Fallback if no parentheses found, bold the whole thing
      return `**${details}**`;
    }
  } else {
    // For other action types, keep details as-is
    return details;
  }
}

/**
 * Post formatted log message to Discord channel
 * @param {string} logEntry - Raw log entry
 * @param {string} userId - Discord user ID
 * @param {string} action - Action type
 * @param {string} details - Action details
 * @param {Array} components - Discord components for button label extraction
 */
async function postToDiscordLogs(logEntry, userId, action, details, components) {
  try {
    // Skip if Discord client not available
    if (!discordClient) {
      return;
    }

    // Load environment config
    const { loadEnvironmentConfig } = await import('./storage.js');
    const envConfig = await loadEnvironmentConfig();
    
    const loggingConfig = envConfig.liveDiscordLogging;
    
    // Check if logging is enabled
    if (!loggingConfig.enabled) {
      return;
    }
    
    // Check user exclusion (Option A: Complete Exclusion)
    if (loggingConfig.excludedUserIds.includes(userId)) {
      return;
    }
    
    // Get target channel if not cached
    if (!targetChannel) {
      try {
        const { getLoggingChannelId } = await import('./storage.js');
        const targetChannelId = await getLoggingChannelId();
        
        const targetGuild = await discordClient.guilds.fetch(loggingConfig.targetGuildId);
        targetChannel = await targetGuild.channels.fetch(targetChannelId);
        
        if (!targetChannel) {
          console.error('Discord Logging: Target channel not found');
          return;
        }
      } catch (error) {
        console.error('Discord Logging: Error fetching target channel:', error);
        return;
      }
    }
    
    // Format the log entry for Discord
    const formattedMessage = `* ${formatAnalyticsLine(logEntry)}`;
    
    // Rate limiting check (simple implementation)
    const now = Date.now();
    if (now - loggingConfig.lastMessageTime < 1200) { // 1.2 seconds between messages
      // Add to queue for later processing
      loggingConfig.rateLimitQueue.push({
        message: formattedMessage,
        timestamp: now
      });
      
      // Limit queue size
      if (loggingConfig.rateLimitQueue.length > 50) {
        loggingConfig.rateLimitQueue.shift(); // Remove oldest
      }
      
      return;
    }
    
    // Update last message time
    loggingConfig.lastMessageTime = now;
    
    // Send message to Discord
    await targetChannel.send(formattedMessage);
    
    // Process any queued messages
    if (loggingConfig.rateLimitQueue.length > 0) {
      setTimeout(async () => {
        await processQueuedMessages(loggingConfig);
      }, 1200);
    }
    
  } catch (error) {
    console.error('Discord Logging Error (non-critical):', error);
    // Don't throw - this should never break the main bot functionality
  }
}

/**
 * Process queued messages with rate limiting
 * @param {Object} loggingConfig - Logging configuration object
 */
async function processQueuedMessages(loggingConfig) {
  try {
    if (loggingConfig.rateLimitQueue.length === 0 || !targetChannel) {
      return;
    }
    
    const message = loggingConfig.rateLimitQueue.shift();
    await targetChannel.send(message.message);
    
    loggingConfig.lastMessageTime = Date.now();
    
    // Schedule next message if queue not empty
    if (loggingConfig.rateLimitQueue.length > 0) {
      setTimeout(async () => {
        await processQueuedMessages(loggingConfig);
      }, 1200);
    }
  } catch (error) {
    console.error('Discord Logging Queue Error (non-critical):', error);
  }
}

/**
 * Post new server installation announcement to Discord analytics channel
 * @param {Object} guild - Discord.js Guild object
 * @param {Object} ownerInfo - Owner information from ensureServerData
 */
async function logNewServerInstall(guild, ownerInfo = null) {
  try {
    // Skip if Discord client not available
    if (!discordClient) {
      return;
    }

    // Load environment config
    const { loadEnvironmentConfig } = await import('./storage.js');
    const envConfig = await loadEnvironmentConfig();
    
    const loggingConfig = envConfig.liveDiscordLogging;
    
    // Check if logging is enabled
    if (!loggingConfig.enabled) {
      return;
    }

    // Get environment-specific timezone offset
    const { getLoggingTimezoneOffset } = await import('./storage.js');
    const timezoneOffset = await getLoggingTimezoneOffset();
    
    // Apply environment-specific timezone offset
    const utcDate = new Date();
    const localDate = new Date(utcDate.getTime() + (timezoneOffset * 60 * 60 * 1000));
    
    // Format timestamp: [12:34PM] Thu 19 Jun 25
    const hours = localDate.getHours();
    const minutes = localDate.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeStr = `${displayHours}:${minutes}${ampm}`;
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[localDate.getDay()];
    const day = localDate.getDate();
    const month = months[localDate.getMonth()];
    const year = localDate.getFullYear().toString().slice(-2);
    const dateStr = `${dayName} ${day} ${month} ${year}`;
    
    const timestamp = `[${timeStr}] ${dateStr}`;
    
    // Format owner information
    let ownerDisplay = 'Unknown Owner';
    if (ownerInfo) {
      // Format: !j (@jfranc) (703448702320246815)
      const globalName = ownerInfo.globalName || ownerInfo.username;
      ownerDisplay = `${globalName} (@${ownerInfo.username}) (${guild.ownerId})`;
    } else {
      ownerDisplay = `Unknown (@unknown) (${guild.ownerId})`;
    }

    // Create the announcement message in the same format as regular logs
    const announcementMessage = `# ${timestamp} | 🎉🥳 **New Server Install**: \`${guild.name}\` (${guild.id}) | Owner: ${ownerDisplay}`;

    // Get target channel if not cached
    if (!targetChannel) {
      try {
        const { getLoggingChannelId } = await import('./storage.js');
        const targetChannelId = await getLoggingChannelId();
        
        const targetGuild = await discordClient.guilds.fetch(loggingConfig.targetGuildId);
        targetChannel = await targetGuild.channels.fetch(targetChannelId);
        
        if (!targetChannel) {
          console.error('Discord Logging: Target channel not found for server install announcement');
          return;
        }
      } catch (error) {
        console.error('Discord Logging: Error fetching target channel for server install:', error);
        return;
      }
    }

    // Rate limiting check (simple implementation)
    const now = Date.now();
    if (now - loggingConfig.lastMessageTime < 1200) { // 1.2 seconds between messages
      // Add to queue for later processing
      loggingConfig.rateLimitQueue.push({
        message: announcementMessage,
        timestamp: now
      });
      
      // Limit queue size
      if (loggingConfig.rateLimitQueue.length > 50) {
        loggingConfig.rateLimitQueue.shift(); // Remove oldest
      }
      
      return;
    }
    
    // Update last message time
    loggingConfig.lastMessageTime = now;
    
    // Send announcement to Discord
    await targetChannel.send(announcementMessage);
    
    // Process any queued messages
    if (loggingConfig.rateLimitQueue.length > 0) {
      setTimeout(async () => {
        await processQueuedMessages(loggingConfig);
      }, 1200);
    }
    
    console.log(`📢 Server install announcement posted to Discord: ${guild.name} (${guild.id})`);
    
  } catch (error) {
    console.error('Discord Server Install Announcement Error (non-critical):', error);
    // Don't throw - this should never break the main bot functionality
  }
}

export { logInteraction, getLogFilePath, setDiscordClient, logNewServerInstall };