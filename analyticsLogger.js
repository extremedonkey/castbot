import fs from 'fs';
import path from 'path';

const ANALYTICS_LOG_FILE = './logs/user-analytics.log';

/**
 * Extract human-readable button label from Discord components
 * @param {string} customId - The button's custom ID
 * @param {Array} components - Discord message components array
 * @returns {string} Human-readable button label with emoji, or custom ID as fallback
 */
function getButtonLabel(customId, components) {
  if (!components || !Array.isArray(components)) {
    return customId;
  }

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
            
            // Return enhanced label or fallback to custom_id
            return label.trim() || customId;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error extracting button label:', error);
  }
  
  // Fallback to custom_id if no label found
  return customId;
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
 */
function logInteraction(userId, guildId, action, details, username, guildName, components = null) {
  try {
    const timestamp = new Date().toISOString();
    let logDetails = details;
    
    // If it's a button click, try to get human-readable label
    if (action === 'BUTTON_CLICK' && components) {
      const humanLabel = getButtonLabel(details, components);
      logDetails = humanLabel;
    }
    
    // Create log entry in exact BACKLOG.md format
    const logEntry = `[ANALYTICS] ${timestamp} | ${username} in ${guildName} | ${action} | ${logDetails}\n`;
    
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