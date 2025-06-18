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
  
  // Special handling for show castlist buttons
  if (customId.startsWith('show_castlist2_')) {
    const castlistName = customId.replace('show_castlist2_', '');
    return `📋 Show ${castlistName || 'Default'} Castlist`;
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
function logInteraction(userId, guildId, action, details, username, guildName, components = null, channelName = null, displayName = null) {
  try {
    const timestamp = new Date().toISOString();
    let logDetails = details;
    
    console.log(`DEBUG: Analytics called with guildName: "${guildName}", guildId: "${guildId}"`);
    
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
      console.log(`DEBUG: Attempting direct playerData.json read for guild ${guildId}...`);
      const rawData = fs.readFileSync('./playerData.json', 'utf8');
      const playerData = JSON.parse(rawData);
      console.log(`DEBUG: File loaded successfully, found ${Object.keys(playerData).length} guilds`);
      
      if (playerData[guildId] && playerData[guildId].serverName) {
        serverDisplay = `${playerData[guildId].serverName} (${guildId})`;
        console.log(`DEBUG: Server name resolved: ${serverDisplay}`);
      } else {
        console.log(`DEBUG: No server name found for guild ${guildId} in playerData`);
        // Fallback to Discord API guild name if available
        if (guildName && guildName !== 'Unknown Server') {
          serverDisplay = `${guildName} (${guildId})`;
          console.log(`DEBUG: Server name resolved from Discord API: ${serverDisplay}`);
        }
      }
    } catch (error) {
      console.log('DEBUG: Error reading playerData.json:', error.message);
      // Fallback to Discord API guild name if available
      if (guildName && guildName !== 'Unknown Server') {
        serverDisplay = `${guildName} (${guildId})`;
        console.log(`DEBUG: Server name resolved from Discord API (fallback): ${serverDisplay}`);
      }
    }
    
    // Enhanced action display: include channel if available
    const actionDisplay = channelName ? `#${channelName}` : action;
    
    // Create enhanced log entry format
    const logEntry = `[ANALYTICS] ${timestamp} | ${userDisplay} in ${serverDisplay} | ${actionDisplay} | ${logDetails}\n`;
    
    // Ensure logs directory exists
    const logDir = path.dirname(ANALYTICS_LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Append to log file
    fs.appendFileSync(ANALYTICS_LOG_FILE, logEntry);
    
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

export { logInteraction, getLogFilePath };