import fs from 'fs';
import path from 'path';

const ANALYTICS_LOG_FILE = './logs/user-analytics.log';

// Server name cache to eliminate 739KB file reads per interaction
const serverNameCache = new Map();

// Button label mappings for common buttons that may not be extractable from components
const BUTTON_LABEL_MAP = {
  // Production menu buttons
  'prod_setup': '🪛 Setup',
  'prod_manage_pronouns_timezones': '💜 Manage Pronouns/Timezones',
  'prod_manage_tribes': '🔥 Manage Tribes',
  'admin_manage_player': '🧑‍🤝‍🧑 Manage Players',
  'season_management_menu': '📝 Apps',
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
  'show_castlist2_default': 'Post Castlist',
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
 * @param {string} action - Action type ('SLASH_COMMAND', 'BUTTON_CLICK', 'SAFARI_WHISPER', 'SAFARI_ITEM', etc.)
 * @param {string} details - Command name or button custom ID
 * @param {string} username - Discord username
 * @param {string} guildName - Discord guild name
 * @param {Array} components - Discord message components (for button label extraction)
 * @param {string} channelName - Discord channel name (optional)
 * @param {string} displayName - User's server display name (optional)
 * @param {Object} safariContent - Safari-specific content for detailed logging (optional)
 */
async function logInteraction(userId, guildId, action, details, username, guildName, components = null, channelName = null, displayName = null, safariContent = null) {
  try {
    // Get environment-specific timezone offset
    const { getLoggingTimezoneOffset } = await import('../../storage.js');
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
    
    // Enhanced server display: "ServerName (guildId)" - use cache to avoid 739KB file reads
    let serverDisplay = `Unknown Server (${guildId})`;

    // Check cache first to avoid 739KB file read per interaction
    if (!serverNameCache.has(guildId)) {
      try {
        const rawData = fs.readFileSync('./playerData.json', 'utf8');
        const playerData = JSON.parse(rawData);
        const serverName = playerData[guildId]?.serverName || 'Unknown Server';
        serverNameCache.set(guildId, serverName);
      } catch (error) {
        serverNameCache.set(guildId, 'Unknown Server');
      }
    }

    const cachedServerName = serverNameCache.get(guildId);
    serverDisplay = `${cachedServerName} (${guildId})`;

    // Fallback to Discord API name if cached name is generic
    if (cachedServerName === 'Unknown Server' && guildName && guildName !== 'Unknown Server') {
      serverDisplay = `${guildName} (${guildId})`;
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
    console.log(`📊 DEBUG: About to call postToDiscordLogs - action: ${action}, safariContent exists: ${!!safariContent}, guildId: ${guildId}`);
    await postToDiscordLogs(logEntry.trim(), userId, action, details, components, guildId, safariContent);
    
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
 * @param {string} guildId - Discord guild ID
 * @param {Object} safariContent - Safari-specific content for detailed logging
 */
async function postToDiscordLogs(logEntry, userId, action, details, components, guildId = null, safariContent = null) {
  try {
    console.log(`📊 DEBUG: postToDiscordLogs ENTRY - action: ${action}, userId: ${userId}, guildId: ${guildId}`);
    
    // Skip if Discord client not available
    if (!discordClient) {
      console.log(`📊 DEBUG: postToDiscordLogs EARLY RETURN - Discord client not available`);
      return;
    }
    console.log(`📊 DEBUG: postToDiscordLogs - Discord client OK`);

    // Load environment config
    const { loadEnvironmentConfig } = await import('../../storage.js');
    const envConfig = await loadEnvironmentConfig();
    console.log(`📊 DEBUG: postToDiscordLogs - envConfig loaded`);
    
    const loggingConfig = envConfig.liveDiscordLogging;
    // Don't log the entire config (it might have old queue data)
    console.log(`📊 DEBUG: postToDiscordLogs - Logging enabled:`, loggingConfig.enabled);
    
    // Check if logging is enabled
    if (!loggingConfig.enabled) {
      console.log(`📊 DEBUG: postToDiscordLogs EARLY RETURN - Logging not enabled`);
      return;
    }
    console.log(`📊 DEBUG: postToDiscordLogs - Logging enabled OK`);
    
    // Check user exclusion (environment-specific)
    const isProduction = process.env.PRODUCTION === 'TRUE';

    // Handle both new object format and legacy array format
    let excludedUsers = [];
    if (Array.isArray(loggingConfig.excludedUserIds)) {
      // Legacy format: apply to both environments
      excludedUsers = loggingConfig.excludedUserIds;
    } else if (loggingConfig.excludedUserIds && typeof loggingConfig.excludedUserIds === 'object') {
      // New format: environment-specific
      excludedUsers = isProduction
        ? (loggingConfig.excludedUserIds.production || [])
        : (loggingConfig.excludedUserIds.development || []);
    }

    if (excludedUsers.includes(userId)) {
      console.log(`📊 DEBUG: postToDiscordLogs EARLY RETURN - User ${userId} is excluded in ${isProduction ? 'production' : 'development'}`);
      return;
    }
    console.log(`📊 DEBUG: postToDiscordLogs - User not excluded (${isProduction ? 'production' : 'development'} mode), continuing...`);
    
    // Get target channel if not cached
    console.log(`📊 DEBUG: postToDiscordLogs - Checking target channel cache`);
    if (!targetChannel) {
      console.log(`📊 DEBUG: postToDiscordLogs - Target channel not cached, fetching...`);
      try {
        const { getLoggingChannelId } = await import('../../storage.js');
        const targetChannelId = await getLoggingChannelId();
        console.log(`📊 DEBUG: postToDiscordLogs - Got target channel ID: ${targetChannelId}`);
        
        const targetGuild = await discordClient.guilds.fetch(loggingConfig.targetGuildId);
        console.log(`📊 DEBUG: postToDiscordLogs - Fetched target guild: ${targetGuild.name}`);
        
        targetChannel = await targetGuild.channels.fetch(targetChannelId);
        console.log(`📊 DEBUG: postToDiscordLogs - Fetched target channel: ${targetChannel?.name}`);
        
        if (!targetChannel) {
          console.error('Discord Logging: Target channel not found');
          return;
        }
      } catch (error) {
        console.error('Discord Logging: Error fetching target channel:', error);
        return;
      }
    } else {
      console.log(`📊 DEBUG: postToDiscordLogs - Using cached target channel: ${targetChannel.name}`);
    }
    
    // Format the log entry for Discord
    console.log(`📊 DEBUG: postToDiscordLogs - Formatting log entry`);
    const formattedMessage = `* ${formatAnalyticsLine(logEntry)}`;
    console.log(`📊 DEBUG: postToDiscordLogs - Formatted message: ${formattedMessage.substring(0, 100)}...`);
    
    // IMPORTANT: Check Safari Log conditions BEFORE rate limiting
    // This ensures Safari logs are posted even when analytics is rate limited
    console.log(`📊 DEBUG: Checking Safari Log conditions - safariContent: ${!!safariContent}, guildId: ${!!guildId}, action starts with SAFARI_: ${action.startsWith('SAFARI_')}, action: ${action}`);
    if (safariContent && guildId && action.startsWith('SAFARI_')) {
      console.log(`📊 DEBUG: All Safari Log conditions met, calling postToSafariLog`);
      try {
        await postToSafariLog(guildId, userId, action, details, safariContent);
        console.log(`📊 DEBUG: postToSafariLog completed successfully`);
      } catch (safariLogError) {
        console.error(`📊 ERROR: postToSafariLog failed:`, safariLogError);
        console.error(`📊 ERROR: Stack trace:`, safariLogError.stack);
      }
    } else {
      console.log(`📊 DEBUG: Safari Log conditions not met - skipping Safari Log posting`);
    }

    // Rate limiting check (simple implementation)
    console.log(`📊 DEBUG: postToDiscordLogs - Checking rate limits`);
    const now = Date.now();
    if (now - runtimeState.lastMessageTime < 1200) { // 1.2 seconds between messages
      console.log(`📊 DEBUG: postToDiscordLogs - Rate limited, adding to queue`);
      // Add to queue for later processing
      runtimeState.rateLimitQueue.push({
        message: formattedMessage,
        timestamp: now
      });
      
      // Limit queue size
      if (runtimeState.rateLimitQueue.length > 50) {
        runtimeState.rateLimitQueue.shift(); // Remove oldest
      }
      
      return;
    }
    console.log(`📊 DEBUG: postToDiscordLogs - Rate limit OK, proceeding to send`);
    
    // Update last message time
    runtimeState.lastMessageTime = now;
    
    // Send message to Discord
    console.log(`📊 DEBUG: postToDiscordLogs - Sending message to Discord`);
    await targetChannel.send(formattedMessage);
    console.log(`📊 DEBUG: postToDiscordLogs - Message sent successfully`);
    
    // Start queue processing if needed (singleton ensures only one processor runs)
    if (runtimeState.rateLimitQueue.length > 0) {
      console.log(`📊 DEBUG: postToDiscordLogs - Requesting queue processing for ${runtimeState.rateLimitQueue.length} messages`);
      setTimeout(async () => {
        await queueProcessor.startProcessing();
      }, 1200);
    }
    
  } catch (error) {
    console.error('Discord Logging Error (non-critical):', error);
    // Don't throw - this should never break the main bot functionality
  }
}

// In-memory runtime state (NOT persisted to disk)
const runtimeState = {
  rateLimitQueue: [],
  lastMessageTime: 0
};

// Singleton queue processor to prevent duplicates
class QueueProcessor {
  constructor() {
    this.isProcessing = false;
    this.timeoutId = null;
  }

  /**
   * Start processing the queue if not already running
   */
  async startProcessing() {
    // Only start if not already processing
    if (this.isProcessing) {
      console.log(`📊 DEBUG: QueueProcessor - Already processing, ignoring request`);
      return;
    }

    this.isProcessing = true;
    console.log(`📊 DEBUG: QueueProcessor - Starting singleton processor`);
    await this._processLoop();
  }

  /**
   * Internal processing loop that runs until queue is empty
   */
  async _processLoop() {
    try {
      while (runtimeState.rateLimitQueue.length > 0 && targetChannel) {
        const queueLength = runtimeState.rateLimitQueue.length;
        console.log(`📊 DEBUG: QueueProcessor - Processing ${queueLength} queued messages`);
        
        const message = runtimeState.rateLimitQueue.shift();
        await targetChannel.send(message.message);
        
        runtimeState.lastMessageTime = Date.now();
        console.log(`📊 DEBUG: QueueProcessor - Sent message, ${runtimeState.rateLimitQueue.length} remaining`);
        
        // Wait 1.2 seconds before next message (only if more messages exist)
        if (runtimeState.rateLimitQueue.length > 0) {
          await new Promise(resolve => {
            this.timeoutId = setTimeout(resolve, 1200);
          });
        }
      }
      
      console.log(`📊 DEBUG: QueueProcessor - Processing completed, queue empty`);
    } catch (error) {
      console.error('Discord Logging Queue Error (non-critical):', error);
    } finally {
      // Always release the processing lock
      this.isProcessing = false;
      this.timeoutId = null;
    }
  }

  /**
   * Stop the processor (for cleanup)
   */
  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isProcessing = false;
  }
}

// Create singleton queue processor
const queueProcessor = new QueueProcessor();

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
    const { loadEnvironmentConfig } = await import('../../storage.js');
    const envConfig = await loadEnvironmentConfig();
    
    const loggingConfig = envConfig.liveDiscordLogging;
    
    // Check if logging is enabled
    if (!loggingConfig.enabled) {
      return;
    }

    // Get environment-specific timezone offset
    const { getLoggingTimezoneOffset } = await import('../../storage.js');
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
    
    // Also write to analytics log file for server usage tracking
    const analyticsLogEntry = `${timestamp} | SERVER_INSTALL | ${guild.name} (${guild.id}) | Owner: ${ownerDisplay}\n`;
    
    // Ensure logs directory exists
    const logDir = path.dirname('./logs/user-analytics.log');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Append to analytics log file
    fs.appendFileSync('./logs/user-analytics.log', analyticsLogEntry);

    // Get target channel if not cached
    if (!targetChannel) {
      try {
        const { getLoggingChannelId } = await import('../../storage.js');
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
    if (now - runtimeState.lastMessageTime < 1200) { // 1.2 seconds between messages
      // Add to queue for later processing
      runtimeState.rateLimitQueue.push({
        message: announcementMessage,
        timestamp: now
      });
      
      // Limit queue size
      if (runtimeState.rateLimitQueue.length > 50) {
        runtimeState.rateLimitQueue.shift(); // Remove oldest
      }
      
      return;
    }
    
    // Update last message time
    runtimeState.lastMessageTime = now;
    
    // Send announcement to Discord
    await targetChannel.send(announcementMessage);
    
    // Start queue processing if needed (singleton ensures only one processor runs)
    if (runtimeState.rateLimitQueue.length > 0) {
      setTimeout(async () => {
        await queueProcessor.startProcessing();
      }, 1200);
    }
    
    console.log(`📢 Server install announcement posted to Discord: ${guild.name} (${guild.id})`);
    
  } catch (error) {
    console.error('Discord Server Install Announcement Error (non-critical):', error);
    // Don't throw - this should never break the main bot functionality
  }
}

/**
 * Post setup run announcement to Discord analytics channel
 * @param {Object} guild - Discord.js Guild object
 * @param {string} userId - User ID who ran setup
 * @param {string} userName - Display name of user who ran setup
 */
async function logSetupRun(guild, userId, userName) {
  try {
    // Skip if Discord client not available
    if (!discordClient) {
      return;
    }

    // Load environment config
    const { loadEnvironmentConfig } = await import('../../storage.js');
    const envConfig = await loadEnvironmentConfig();

    const loggingConfig = envConfig.liveDiscordLogging;

    // Check if logging is enabled
    if (!loggingConfig.enabled) {
      return;
    }

    // Get environment-specific timezone offset
    const { getLoggingTimezoneOffset } = await import('../../storage.js');
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

    // Create the announcement message in the same format as server install
    const announcementMessage = `# ${timestamp} | 🛠️✨ **Setup Run**: \`${guild.name}\` (${guild.id}) | User: ${userName} (${userId})`;

    // Also write to analytics log file
    const analyticsLogEntry = `${timestamp} | SETUP_RUN | ${guild.name} (${guild.id}) | User: ${userName} (${userId})\n`;

    // Ensure logs directory exists
    const logDir = path.dirname('./logs/user-analytics.log');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Append to analytics log file
    fs.appendFileSync('./logs/user-analytics.log', analyticsLogEntry);

    // Get target channel if not cached
    if (!targetChannel) {
      try {
        const { getLoggingChannelId } = await import('../../storage.js');
        const targetChannelId = await getLoggingChannelId();

        const targetGuild = await discordClient.guilds.fetch(loggingConfig.targetGuildId);
        targetChannel = await targetGuild.channels.fetch(targetChannelId);

        if (!targetChannel) {
          console.error('Discord Logging: Target channel not found for setup run announcement');
          return;
        }
      } catch (error) {
        console.error('Discord Logging: Error fetching target channel for setup run:', error);
        return;
      }
    }

    // Rate limiting check (simple implementation)
    const now = Date.now();
    if (now - runtimeState.lastMessageTime < 1200) { // 1.2 seconds between messages
      // Add to queue for later processing
      runtimeState.rateLimitQueue.push({ message: announcementMessage, targetChannel });
      console.log(`📊 Setup run announcement queued (rate limited): ${guild.name}`);
      return;
    }

    // Post to Discord channel
    await targetChannel.send(announcementMessage);
    runtimeState.lastMessageTime = now;

    // Start queue processing if needed (singleton ensures only one processor runs)
    if (runtimeState.rateLimitQueue.length > 0) {
      setTimeout(async () => {
        await queueProcessor.startProcessing();
      }, 1200);
    }

    console.log(`📢 Setup run announcement posted to Discord: ${guild.name} (${guild.id})`);

  } catch (error) {
    console.error('Discord Setup Run Announcement Error (non-critical):', error);
    // Don't throw - this should never break the main bot functionality
  }
}

/**
 * Post Safari-specific log to guild's Safari log channel
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - User who performed the action
 * @param {string} action - Safari action type
 * @param {string} details - Action details
 * @param {Object} safariContent - Safari-specific content
 */
async function postToSafariLog(guildId, userId, action, details, safariContent) {
  try {
    console.log(`🦁 DEBUG: postToSafariLog called - guildId: ${guildId}, userId: ${userId}, action: ${action}, details: ${details}`);
    console.log(`🦁 DEBUG: safariContent:`, JSON.stringify(safariContent, null, 2));
    
    // Skip if Discord client not available
    if (!discordClient) {
      console.log(`🦁 DEBUG: Discord client not available - skipping Safari Log`);
      return;
    }
    console.log(`🦁 DEBUG: Discord client is available`);

    // Load Safari content to get log settings
    const { loadSafariContent } = await import('../../safariManager.js');
    const safariData = await loadSafariContent();
    
    console.log(`🔍 Safari Log Debug: Processing ${action} for guild ${guildId}, user ${userId}`);
    
    // Check if Safari logging is enabled for this guild
    const logSettings = safariData[guildId]?.safariLogSettings;
    console.log(`🔍 Safari Log Debug: Log settings:`, JSON.stringify(logSettings, null, 2));
    
    if (!logSettings?.enabled || !logSettings?.logChannelId) {
      console.log(`🔍 Safari Log Debug: Safari logging disabled or no channel set for guild ${guildId}`);
      return;
    }
    
    // Check if this specific log type is enabled
    const logTypeMap = {
      'SAFARI_WHISPER': 'whispers',
      'SAFARI_ITEM_PICKUP': 'itemPickups',
      'SAFARI_CURRENCY': 'currencyChanges',
      'SAFARI_PURCHASE': 'storeTransactions',
      'SAFARI_BUTTON': 'buttonActions',
      'SAFARI_MOVEMENT': 'mapMovement',
      'SAFARI_ATTACK': 'attacks',
      'SAFARI_CUSTOM_ACTION': 'customActions',
      'SAFARI_TEST': 'testMessages'
    };
    
    const logType = logTypeMap[action];
    console.log(`🔍 Safari Log Debug: Action ${action} maps to logType ${logType}, enabled: ${logSettings.logTypes?.[logType]}`);
    
    if (!logType || !logSettings.logTypes?.[logType]) {
      console.log(`🔍 Safari Log Debug: Log type ${logType} not enabled for guild ${guildId}`);
      return;
    }
    
    // Get the Safari log channel
    console.log(`🔍 Safari Log Debug: Attempting to fetch channel ${logSettings.logChannelId} for guild ${guildId}`);
    
    let safariLogChannel;
    try {
      const guild = await discordClient.guilds.fetch(guildId);
      console.log(`🔍 Safari Log Debug: Guild fetched successfully: ${guild.name}`);
      
      safariLogChannel = await guild.channels.fetch(logSettings.logChannelId);
      
      if (!safariLogChannel) {
        console.error(`Safari Log: Channel ${logSettings.logChannelId} not found for guild ${guildId}`);
        return;
      }
      
      console.log(`🔍 Safari Log Debug: Channel fetched successfully: ${safariLogChannel.name}`);
    } catch (error) {
      console.error(`Safari Log: Error fetching channel for guild ${guildId}:`, error);
      return;
    }
    
    // Get channel name for enhanced location display
    const channelDisplay = safariContent.channelName ? ` (#${safariContent.channelName})` : '';
    
    // For Safari buttons, get the button label and emoji
    let buttonLabel = '';
    let buttonEmoji = '';
    if (action === 'SAFARI_CUSTOM_ACTION' && safariContent.actionType === 'safari_button') {
      try {
        const { loadSafariContent } = await import('../../safariManager.js');
        const safariData = await loadSafariContent();
        const button = safariData[guildId]?.buttons?.[safariContent.actionId];
        if (button) {
          buttonLabel = button.label || button.name || safariContent.actionId;
          buttonEmoji = button.emoji || '';
        } else {
          buttonLabel = safariContent.actionId;
        }
      } catch (error) {
        console.error('Error getting button details for Safari Log:', error);
        buttonLabel = safariContent.actionId;
      }
    }
    
    // Format the Safari log message based on action type
    let logMessage = '';
    
    // Get environment-specific timezone offset (same as analytics logs)
    const { getLoggingTimezoneOffset } = await import('../../storage.js');
    const timezoneOffset = await getLoggingTimezoneOffset();
    
    // Apply environment-specific timezone offset
    const utcDate = new Date();
    const localDate = new Date(utcDate.getTime() + (timezoneOffset * 60 * 60 * 1000));
    
    // Format as timestamp: [12:34PM]
    const hours = localDate.getHours();
    const minutes = localDate.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timestamp = `${displayHours}:${minutes}${ampm}`;
    
    switch (action) {
      case 'SAFARI_WHISPER':
        logMessage = `🤫 **WHISPER** | [${timestamp}] | <@${safariContent.senderId}> → <@${safariContent.recipientId}> at **${safariContent.location}**${channelDisplay}\n> ${safariContent.message}`;
        break;
        
      case 'SAFARI_ITEM_PICKUP':
        logMessage = `🧰 **ITEM PICKUP** | [${timestamp}] | <@${userId}> at **${safariContent.location}**${channelDisplay}\n> Collected: ${safariContent.itemEmoji} **${safariContent.itemName}** (x${safariContent.quantity})`;
        break;
        
      case 'SAFARI_CURRENCY':
        const changeType = safariContent.amount > 0 ? 'Gained' : 'Lost';
        logMessage = `🪙 **CURRENCY** | [${timestamp}] | <@${userId}> at **${safariContent.location}**${channelDisplay}\n> ${changeType} ${Math.abs(safariContent.amount)} ${safariContent.currencyName} from "${safariContent.source}"`;
        break;
        
      case 'SAFARI_PURCHASE':
        logMessage = `🛒 **PURCHASE** | [${timestamp}] | <@${userId}> at **${safariContent.storeName}** (${safariContent.location}${channelDisplay})\n> Bought: ${safariContent.itemEmoji} **${safariContent.itemName}** (x${safariContent.quantity}) for ${safariContent.price} ${safariContent.currencyName}`;
        break;
        
      case 'SAFARI_BUTTON':
        logMessage = `🎯 **SAFARI ACTION** | [${timestamp}] | <@${userId}> at **${safariContent.location}**${channelDisplay}\n> Clicked: "${safariContent.buttonLabel}" - ${safariContent.result}`;
        break;
        
      case 'SAFARI_MOVEMENT':
        const fromChannelDisplay = safariContent.fromChannelName ? ` (#${safariContent.fromChannelName})` : '';
        const toChannelDisplay = safariContent.toChannelName ? ` (#${safariContent.toChannelName})` : '';
        logMessage = `🗺️ **MOVEMENT** | [${timestamp}] | <@${userId}> moved from **${safariContent.fromLocation}**${fromChannelDisplay} to **${safariContent.toLocation}**${toChannelDisplay}`;
        break;
        
      case 'SAFARI_ATTACK':
        // Extract round number from the result string if available
        const roundMatch = safariContent.result?.match(/Round (\d+)/);
        const roundNumber = roundMatch ? roundMatch[1] : 'Unknown';
        logMessage = `⚔️ **ATTACK** | [${timestamp}] | <@${safariContent.attackerId}> scheduled an attack for <@${safariContent.targetId}> in Round ${roundNumber}${channelDisplay}\n> Result: ${safariContent.result}`;
        break;
        
      case 'SAFARI_CUSTOM_ACTION':
        const emoji = safariContent.actionType === 'player_command' ? '⌨️' : '🎯';
        let actionDetails = '';
        
        if (safariContent.success && safariContent.executedActions && safariContent.executedActions.length > 0) {
          // Format executed actions
          const actions = safariContent.executedActions.map(action => {
            if (action.type === 'display_text' && action.config) {
              // Truncate display text content if too long
              let content = action.config.content || 'No content';
              if (content.length > 200) {
                content = content.substring(0, 200) + '... [truncated]';
              }
              return `Display Text: "${action.config.title || 'No title'}" - ${content}`;
            }
            return `${action.type}: ${JSON.stringify(action.config || {})}`;
          }).join('\n> ');
          actionDetails = `\n> ${actions}`;
        } else if (!safariContent.success && safariContent.errorMessage) {
          actionDetails = `\n> ❌ ${safariContent.errorMessage}`;
        }
        
        if (safariContent.actionType === 'player_command') {
          logMessage = `${emoji} **PLAYER COMMAND** | [${timestamp}] | <@${userId}> at **${safariContent.location}**${channelDisplay}\n> Command: "${safariContent.actionId}"${actionDetails}`;
        } else {
          // Enhanced button display with emoji and label
          const buttonDisplay = buttonEmoji && buttonLabel 
            ? `${buttonEmoji} ${buttonLabel} (${safariContent.actionId})`
            : buttonLabel || safariContent.actionId;
          logMessage = `${emoji} **CUSTOM ACTION** | [${timestamp}] | <@${userId}> at **${safariContent.location}**${channelDisplay}\n> Button: ${buttonDisplay}${actionDetails}`;
        }
        break;
        
      case 'SAFARI_TEST':
        logMessage = `🧪 **TEST MESSAGE** | [${timestamp}] | <@${userId}> from safari-config\n> Safari Log system test - configured by ${safariContent.configuredBy || 'Unknown'}`;
        break;
        
      default:
        logMessage = `📝 **${action}** | [${timestamp}] | <@${userId}> - ${details}`;
    }
    
    // Send to Safari log channel
    console.log(`🔍 Safari Log Debug: Sending log message to channel ${safariLogChannel.name}:`, logMessage);
    
    // Truncate message if it exceeds Discord's 2000 character limit
    if (logMessage.length > 1900) {
      logMessage = logMessage.substring(0, 1900) + '\n... [Message truncated due to length]';
      console.log('⚠️ Safari Log: Message truncated from', logMessage.length, 'to 1900 characters');
    }
    
    await safariLogChannel.send(logMessage);
    
    console.log(`🔍 Safari Log Debug: Message sent successfully to Safari Log channel`);
    
  } catch (error) {
    console.error('Safari Log Error (non-critical):', error);
    console.error('Stack:', error.stack);
    // Don't throw - Safari logging should never break the main bot functionality
  }
}

export { logInteraction, getLogFilePath, setDiscordClient, logNewServerInstall, logSetupRun };