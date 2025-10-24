/**
 * Discord Messaging Service
 * Centralized service for all Discord messaging operations
 * 
 * Design Principles:
 * - Maximum reusability across all features
 * - Consistent error handling
 * - Components V2 compliant
 * - Lightweight message history tracking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionFlagsBits } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGE_HISTORY_PATH = path.join(__dirname, 'messageHistory.json');
const MAX_HISTORY_ENTRIES = 1000;

class DiscordMessenger {
  /**
   * Core message sending to a user via DM
   * @param {Client} client - Discord.js client
   * @param {string} userId - Discord user ID
   * @param {string|Object} content - Message content or Components V2 structure
   * @param {Object} options - Additional options
   * @returns {Object} Result object with success status
   */
  static async sendDM(client, userId, content, options = {}) {
    const startTime = Date.now();
    
    try {
      // Fetch the user
      const user = await client.users.fetch(userId);
      
      // Format the message for DMs if it's a string
      const messageData = typeof content === 'string' 
        ? this.formatTextMessage(content, true)  // true = isDM
        : content;
      
      // Send the DM
      const sentMessage = await user.send(messageData);
      
      // Log to history
      await this.logMessage('DM', userId, 'success', {
        messageId: sentMessage.id,
        executionTime: Date.now() - startTime
      });
      
      console.log(`✅ DM sent to ${user.tag} (${userId})`);
      
      return {
        success: true,
        messageId: sentMessage.id,
        recipient: user.tag
      };
    } catch (error) {
      // Log failure
      await this.logMessage('DM', userId, 'failed', {
        error: error.message,
        executionTime: Date.now() - startTime
      });
      
      console.error(`❌ Failed to send DM to ${userId}:`, error.message);
      
      return {
        success: false,
        error: error.message,
        fallbackAvailable: options.fallbackChannelId ? true : false
      };
    }
  }
  
  /**
   * Send message to a specific channel
   * @param {Client} client - Discord.js client
   * @param {string} channelId - Discord channel ID
   * @param {string|Object} content - Message content or Components V2 structure
   * @param {Object} options - Additional options
   * @returns {Object} Result object with success status
   */
  static async sendToChannel(client, channelId, content, options = {}) {
    const startTime = Date.now();
    
    try {
      // Fetch the channel
      const channel = await client.channels.fetch(channelId);
      
      // Check permissions if it's a guild channel
      if (channel.guild) {
        const permissions = channel.permissionsFor(channel.guild.members.me);
        if (!permissions.has(PermissionFlagsBits.SendMessages)) {
          throw new Error('Missing SendMessages permission');
        }
      }
      
      // Format the message for channels if it's a string
      const messageData = typeof content === 'string'
        ? this.formatTextMessage(content, false)  // false = not a DM
        : content;
      
      // Send the message
      const sentMessage = await channel.send(messageData);
      
      // Log to history
      await this.logMessage('CHANNEL', channelId, 'success', {
        messageId: sentMessage.id,
        guildId: channel.guild?.id,
        executionTime: Date.now() - startTime
      });
      
      console.log(`✅ Message sent to channel ${channel.name} (${channelId})`);
      
      return {
        success: true,
        messageId: sentMessage.id,
        channel: channel.name
      };
    } catch (error) {
      // Log failure
      await this.logMessage('CHANNEL', channelId, 'failed', {
        error: error.message,
        executionTime: Date.now() - startTime
      });
      
      console.error(`❌ Failed to send to channel ${channelId}:`, error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Send welcome package to new server owner
   * @param {Client} client - Discord.js client
   * @param {Guild} guild - Discord guild object
   * @returns {Object} Result object with success status
   */
  static async sendWelcomePackage(client, guild) {
    // TEMPORARILY DISABLED - Welcome messages are ready but not launched yet
    console.log(`🔕 Welcome messages temporarily disabled for ${guild.name} (${guild.id})`);
    return {
      success: true,
      dmSent: false,
      channelMessageSent: false,
      note: 'Welcome messages temporarily disabled'
    };
    
    /* READY FOR LAUNCH - Uncomment when ready to enable welcome messages
    console.log(`🎉 Sending welcome package for ${guild.name} (${guild.id})`);
    
    try {
      // Fetch the guild owner
      const owner = await guild.fetchOwner();
      
      // Create welcome message using Components V2
      const welcomeMessage = {
        embeds: [{
          color: 0x00FF00,
          title: '🎉 Welcome to CastBot!',
          description: `Thank you for adding CastBot to **${guild.name}**!\n\nHere's how to get started:`,
          fields: [
            {
              name: '🚀 Quick Start',
              value: '• Use `/menu` to open the main menu\n• Use `/castlist` to see your server members\n• Server admins can access production tools via `/menu`',
              inline: false
            },
            {
              name: '📋 Key Features',
              value: '• Season application management\n• Cast ranking and voting system\n• Safari adventure system\n• Player profiles and timezones',
              inline: false
            },
            {
              name: '⚙️ Admin Setup',
              value: 'Access the Production Menu through `/menu` to:\n• Configure application systems\n• Set up cast rankings\n• Manage Safari content\n• View analytics',
              inline: false
            },
            {
              name: '💡 Need Help?',
              value: 'Report issues at: https://github.com/anthropics/claude-code/issues',
              inline: false
            }
          ],
          footer: {
            text: 'CastBot - Reality TV Server Management',
            icon_url: 'https://cdn.discordapp.com/app-icons/1331671251038740611/9e13ab7c1fe0e2c59c4f55d5f1e4c303.png'
          },
          timestamp: new Date().toISOString()
        }]
      };
      
      // Send DM to owner
      const dmResult = await this.sendDM(client, owner.id, {
        content: `Hello ${owner.user.username}! 👋`,
        ...welcomeMessage
      });
      
      // Try to send to system channel as well
      if (guild.systemChannel) {
        const systemChannelMessage = {
          embeds: [{
            color: 0x00FF00,
            title: '👋 CastBot is here!',
            description: 'Thank you for inviting me! Use `/menu` to get started.',
            fields: [
              {
                name: 'First Steps',
                value: '• `/menu` - Open the main interface\n• `/castlist` - View server members\n• Admins: Access Production Menu via `/menu`',
                inline: false
              }
            ],
            footer: {
              text: 'CastBot',
              icon_url: 'https://cdn.discordapp.com/app-icons/1331671251038740611/9e13ab7c1fe0e2c59c4f55d5f1e4c303.png'
            }
          }]
        };
        
        await this.sendToChannel(client, guild.systemChannel.id, systemChannelMessage);
      }
      
      return {
        success: true,
        dmSent: dmResult.success,
        channelMessageSent: guild.systemChannel ? true : false
      };
    } catch (error) {
      console.error(`❌ Failed to send welcome package:`, error);
      return {
        success: false,
        error: error.message
      };
    }
    */
  }
  
  /**
   * Send admin alert to all administrators
   * @param {Client} client - Discord.js client
   * @param {string} guildId - Discord guild ID
   * @param {string} message - Alert message
   * @param {string} severity - Alert severity (info, warning, error, critical)
   * @returns {Object} Result object with success count
   */
  static async sendAdminAlert(client, guildId, message, severity = 'info') {
    const severityColors = {
      info: 0x0099FF,
      warning: 0xFFCC00,
      error: 0xFF6666,
      critical: 0xFF0000
    };
    
    const severityEmojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };
    
    try {
      const guild = await client.guilds.fetch(guildId);
      const members = await guild.members.fetch();
      
      // Find all administrators
      const admins = members.filter(member => 
        member.permissions.has(PermissionFlagsBits.Administrator) && 
        !member.user.bot
      );
      
      console.log(`📢 Sending ${severity} alert to ${admins.size} admins in ${guild.name}`);
      
      // Create alert message
      const alertMessage = {
        embeds: [{
          color: severityColors[severity],
          title: `${severityEmojis[severity]} Admin Alert - ${severity.toUpperCase()}`,
          description: message,
          fields: [
            {
              name: 'Server',
              value: guild.name,
              inline: true
            },
            {
              name: 'Time',
              value: new Date().toLocaleString(),
              inline: true
            }
          ],
          footer: {
            text: 'CastBot Admin Alert System'
          }
        }]
      };
      
      // Send to all admins
      let successCount = 0;
      let failureCount = 0;
      
      for (const [adminId, admin] of admins) {
        const result = await this.sendDM(client, adminId, alertMessage);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }
      
      console.log(`✅ Alert sent to ${successCount} admins, ${failureCount} failures`);
      
      return {
        success: successCount > 0,
        successCount,
        failureCount,
        totalAdmins: admins.size
      };
    } catch (error) {
      console.error(`❌ Failed to send admin alert:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Send a test message (used by Msg Test button)
   * @param {Client} client - Discord.js client
   * @param {string} userId - Discord user ID
   * @returns {Object} Result with response for button interaction
   */
  static async sendTestMessage(client, userId) {
    console.log(`🔍 PoC: Sending ComponentsV2 via Discord REST API (bypassing Discord.js)`);

    try {
      // Step 1: Get or create DM channel
      const user = await client.users.fetch(userId);
      const dmChannel = await user.createDM();
      console.log(`📬 DM Channel ID: ${dmChannel.id}`);

      // Step 2: Prepare Components V2 message
      // CRITICAL: Must include flags field with IS_COMPONENTS_V2 flag!
      const v2Message = {
        flags: 1 << 15, // IS_COMPONENTS_V2 (32768) - REQUIRED for Container type 17!
        components: [
          {
            type: 17, // Container
            accent_color: 0x3498DB, // Blue accent
            components: [
              {
                type: 10, // Text Display
                content: '## 🧪 REST API PoC\n\nThis message was sent via Discord REST API, bypassing Discord.js builders!\n\n**Components V2 works in DMs!**'
              },
              { type: 14 }, // Separator
              {
                type: 10,
                content: '> **`✅ Success`**\nContainer + Text Display + Separator all working!'
              }
            ]
          }
        ]
      };

      // Step 3: Send via Discord REST API
      const discordApiUrl = `https://discord.com/api/v10/channels/${dmChannel.id}/messages`;
      const response = await fetch(discordApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(v2Message)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Discord API error:', errorData);
        throw new Error(`Discord API returned ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const messageData = await response.json();
      console.log(`✅ REST API success! Message ID: ${messageData.id}`);

      return {
        success: true,
        response: {
          content: `✅ **PoC Success!** Components V2 sent via REST API!\n\n**Method:** Direct Discord REST API (bypassed Discord.js)\n**Endpoint:** \`POST /channels/${dmChannel.id}/messages\`\n**Structure:** Container → Text Display + Separator\n\n**Check your DMs for formatted message!**`,
          ephemeral: true
        }
      };

    } catch (error) {
      console.error('❌ REST API PoC failed:', error);
      return {
        success: false,
        response: {
          content: `❌ REST API PoC failed: ${error.message}\n\nSee logs for details.`,
          ephemeral: true
        }
      };
    }
  }
  
  /**
   * Check if a user can receive DMs
   * @param {Client} client - Discord.js client
   * @param {string} userId - Discord user ID
   * @returns {boolean} Whether user can receive DMs
   */
  static async canDMUser(client, userId) {
    try {
      const user = await client.users.fetch(userId);
      // Try to create DM channel - this doesn't send a message
      await user.createDM();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Format a simple text message (Components V2 for channels, plain text for DMs)
   * @param {string} text - Plain text to format
   * @param {boolean} isDM - Whether this is for a DM (default: true)
   * @returns {Object|string} Formatted message object
   *
   * NOTE: DMs traditionally don't support Components V2, but we're testing this.
   * If Discord rejects ComponentsV2 in DMs, the message will fail and we'll use plain text.
   */
  static formatTextMessage(text, isDM = true) {
    // For simple text strings, use plain content in DMs (safer compatibility)
    if (isDM) {
      return { content: text };
    }

    // Channels use Components V2 for consistency
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: [{
        type: 17, // Container
        components: [
          {
            type: 10, // Text Display
            content: text
          }
        ]
      }]
    };
  }
  
  /**
   * Log message to history file
   * @private
   */
  static async logMessage(type, target, status, details = {}) {
    try {
      // Load existing history
      let history = [];
      if (fs.existsSync(MESSAGE_HISTORY_PATH)) {
        const data = fs.readFileSync(MESSAGE_HISTORY_PATH, 'utf8');
        history = JSON.parse(data);
      }
      
      // Add new entry
      history.push({
        timestamp: new Date().toISOString(),
        type,
        target,
        status,
        ...details
      });
      
      // Keep only last MAX_HISTORY_ENTRIES
      if (history.length > MAX_HISTORY_ENTRIES) {
        history = history.slice(-MAX_HISTORY_ENTRIES);
      }
      
      // Save back to file
      fs.writeFileSync(MESSAGE_HISTORY_PATH, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Failed to log message history:', error);
      // Don't throw - logging failure shouldn't break messaging
    }
  }
  
  /**
   * Get message history statistics
   * @returns {Object} Statistics about message history
   */
  static async getMessageStats() {
    try {
      if (!fs.existsSync(MESSAGE_HISTORY_PATH)) {
        return { totalMessages: 0, successRate: 0 };
      }
      
      const data = fs.readFileSync(MESSAGE_HISTORY_PATH, 'utf8');
      const history = JSON.parse(data);
      
      const stats = {
        totalMessages: history.length,
        successful: history.filter(h => h.status === 'success').length,
        failed: history.filter(h => h.status === 'failed').length,
        byType: {}
      };
      
      // Count by type
      history.forEach(entry => {
        if (!stats.byType[entry.type]) {
          stats.byType[entry.type] = { success: 0, failed: 0 };
        }
        stats.byType[entry.type][entry.status]++;
      });
      
      stats.successRate = stats.totalMessages > 0 
        ? (stats.successful / stats.totalMessages * 100).toFixed(2) + '%'
        : '0%';
      
      return stats;
    } catch (error) {
      console.error('Failed to get message stats:', error);
      return { error: error.message };
    }
  }
}

// Future feature stubs (documented but not implemented)

/**
 * FUTURE FEATURE: Thread Support
 * @stub Not implemented yet
 * 
 * Design:
 * - createThread(channelId, name, message)
 * - replyInThread(threadId, message)
 * - archiveThread(threadId)
 * 
 * Use cases:
 * - Application discussion threads
 * - Safari event threads
 * - Voting discussion threads
 */

/**
 * FUTURE FEATURE: Scheduled Messaging
 * @stub Not implemented yet
 * 
 * Design:
 * - scheduleMessage(target, message, timestamp)
 * - cancelScheduledMessage(messageId)
 * - getScheduledMessages()
 * 
 * Storage: scheduledMessages.json
 * Execution: Cron job or interval check
 * 
 * Use cases:
 * - Application deadline reminders
 * - Safari event announcements
 * - Voting reminders
 */

/**
 * FUTURE FEATURE: Rich Components V2 Formatting
 * @stub Not implemented yet
 * 
 * Design:
 * - formatRichMessage(title, sections, buttons)
 * - createMediaGallery(images)
 * - createInteractiveForm(fields)
 * 
 * Note: Embeds are legacy, use Components V2 patterns
 */

export default DiscordMessenger;