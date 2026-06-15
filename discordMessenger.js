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
    console.log(`🎉 Sending welcome package for ${guild.name} (${guild.id})`);

    let dmSent = false;
    let channelMessageSent = false;

    try {
      // 1. DM the server owner the Components V2 welcome (shared helper)
      const owner = await guild.fetchOwner();
      const dmResult = await this.sendWelcomeDM(client, owner.id);
      dmSent = dmResult.success;

      // 2. Best-effort post the channel-context wizard to the system channel
      if (guild.systemChannel) {
        try {
          const response = await fetch(`https://discord.com/api/v10/channels/${guild.systemChannel.id}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              flags: 1 << 15, // IS_COMPONENTS_V2
              components: this.createWelcomeComponents({ context: 'channel', hasSetup: false })
            })
          });
          channelMessageSent = response.ok;
          if (!response.ok) {
            console.warn(`⚠️ System-channel welcome failed (${response.status}) for ${guild.name}`);
          }
        } catch (chErr) {
          console.warn(`⚠️ System-channel welcome error for ${guild.name}:`, chErr.message);
        }
      }

      return { success: true, dmSent, channelMessageSent };
    } catch (error) {
      console.error(`❌ Failed to send welcome package:`, error);
      return { success: false, dmSent, channelMessageSent, error: error.message };
    }
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
      const members = await guild.members.list({ limit: 1000 });
      
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
   * Create welcome/setup wizard UI components
   * Reusable across DM delivery (msg_test) and ephemeral channel responses (setup_wizard)
   *
   * @param {Object} options - Configuration options
   * @param {string} options.context - 'dm' or 'channel' - affects button visibility and messaging
   * @param {boolean} options.hasSetup - Whether server has at least 1 pronoun AND 1 timezone (enables Castlist Manager)
   * @returns {Array} Components V2 container array for Discord
   */
  static createWelcomeComponents(options = { context: 'dm', hasSetup: false }) {
    const isDM = options.context === 'dm';
    const hasSetup = options.hasSetup || false;

    // Build action row components based on context
    const actionButtons = [];

    // Channel-only buttons for Setup Wizard
    if (!isDM) {
      // Run Setup button - always available in channel context
      actionButtons.push({
        type: 2, // Button
        custom_id: 'setup_castbot',
        label: 'Run Setup',
        style: 1, // Primary (blue)
        emoji: { name: '🪛' }
      });

      // Castlist Manager - disabled if no pronouns/timezones
      actionButtons.push({
        type: 2, // Button
        custom_id: 'castlist_hub_main_new',  // NEW: Creates new ephemeral message instead of replacing
        label: 'Castlist Manager',
        style: 2, // Secondary (grey)
        emoji: { name: '📋' },
        disabled: !hasSetup
      });
    }

    // Castbot Features (View Tips) - available in both contexts
    actionButtons.push({
      type: 2, // Button
      custom_id: 'dm_view_tips',
      label: 'Castbot Features',
      style: 2, // Secondary (grey)
      emoji: { name: '✨' }
    });

    // Support server link - always available
    actionButtons.push({
      type: 2, // Link Button
      label: 'CastBot Help Server',
      style: 5, // Link style
      url: 'https://discord.gg/H7MpJEjkwT',
      emoji: { name: '💬' }
    });

    // Note: Main Menu button removed from Setup Wizard - it's now on the subsequent screens
    // (setup_castbot completion, castlist_hub, etc.) to avoid redundancy

    // DM content uses the original demo message
    const dmContent = {
      title: '## 🎭 Welcome to CastBot!\n\nThank you for trying the DM demo! CastBot helps you run online reality game seasons with powerful features:',
      features: '> **`💚 Key Features`**\n• 🎬 Season management & applications\n• 🏆 Cast rankings & voting systems\n• 🦁 Safari adventure challenges\n• 📋 Dynamic castlist displays\n• ⏰ Timezone & pronoun roles',
      help: '> **`💬 Need Help?`**\nJoin our support server for:\n• ✅ Feature tutorials & guides\n• 🔧 Technical support\n• 🎯 New feature announcements\n• 👥 Community discussions'
    };

    // Channel (Setup Wizard) content - new instructional copy
    const channelContent = {
      title: '## 🧙🏽 CastBot Setup Wizard\n\nWelcome to CastBot - your one stop shop for managing your Cast Experience! Manage your Season Applications, create Castlists, create Idol Hunts & Safaris, and much more!',
      instructions: '> **`How to get started`**\n\n**1. Click the 🪛 Run Setup button below**\nCastBot uses Discord Roles for player Pronouns and Timezones. Setup will automatically create pronoun and timezone roles in your server, and add them to CastBot. Don\'t worry if you already have some - CastBot will detect and add them to CastBot.\n\n**2. Create your first Castlist**\nOnce you\'ve ran setup, click Castlist Manager and create your first castlist. CastBot also uses roles to manage castlists - during a season you\'ll simply add your tribe roles to CastBot and it will do the rest! We recommend testing this out with your production team role before your season starts to get used to it.',
      footer: 'To get back to CastBot, type `/menu` from any channel in your server! Once your season is up and running, use `/castlist` to summon the active castlist showing players. You can get back to this menu from /menu → Tools'
    };

    // Build components based on context
    const components = isDM
      ? [
          { type: 10, content: dmContent.title },
          { type: 14 },
          { type: 10, content: dmContent.features },
          { type: 14 },
          { type: 10, content: dmContent.help },
          { type: 14 },
          { type: 1, components: actionButtons }
        ]
      : [
          { type: 10, content: channelContent.title },
          { type: 14 },
          { type: 10, content: channelContent.instructions },
          { type: 14 },
          { type: 10, content: channelContent.footer },
          { type: 14 },
          { type: 1, components: actionButtons }
        ];

    return [
      {
        type: 17, // Container
        accent_color: 0x3498DB, // Blue - standard CastBot color
        components
      }
    ];
  }

  /**
   * Send the Components V2 welcome message to a user's DMs.
   * Shared by msg_test (manual) and the APPLICATION_AUTHORIZED webhook (on install).
   * Uses the REST API directly (Components V2 over Discord.js).
   *
   * @param {Client} client - Discord.js client
   * @param {string} userId - Discord user ID to DM
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  static async sendWelcomeDM(client, userId) {
    try {
      const user = await client.users.fetch(userId);
      const dmChannel = await user.createDM();
      console.log(`📬 Welcome DM channel for ${userId}: ${dmChannel.id}`);

      // CRITICAL: IS_COMPONENTS_V2 flag required for Container (type 17)
      const v2Message = {
        flags: 1 << 15, // IS_COMPONENTS_V2 (32768)
        components: this.createWelcomeComponents({ context: 'dm' })
      };

      const response = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(v2Message)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Welcome DM API error:', errorData);
        return { success: false, error: `Discord API ${response.status}: ${JSON.stringify(errorData)}` };
      }

      const messageData = await response.json();
      console.log(`✅ Welcome DM sent to ${userId}! Message ID: ${messageData.id}`);
      return { success: true, messageId: messageData.id };
    } catch (error) {
      console.error(`❌ Failed to send welcome DM to ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle a Discord APPLICATION_AUTHORIZED webhook event (fired on install).
   * Unlike gateway GUILD_CREATE, this event's payload identifies the installing user,
   * so we can DM the welcome message directly to whoever added the bot.
   *
   * @param {Client} client - Discord.js client
   * @param {Object} data - event.data from the webhook payload
   *   { integration_type: 0|1, user: {id, ...}, guild?: {...}, scopes: [...] }
   * @returns {Promise<{success: boolean, skipped?: string}>}
   */
  static async handleApplicationAuthorized(client, data = {}) {
    const { integration_type, user, guild } = data;

    // integration_type: 0 = guild install, 1 = user install (no guild)
    if (integration_type !== 0) {
      console.log(`🔕 APPLICATION_AUTHORIZED: skipping user-install (integration_type=${integration_type})`);
      return { success: false, skipped: 'user_install' };
    }
    if (!user?.id) {
      console.warn('⚠️ APPLICATION_AUTHORIZED: no installing user in payload, cannot DM');
      return { success: false, skipped: 'no_user' };
    }

    console.log(`🎉 APPLICATION_AUTHORIZED: ${user.username || user.id} installed CastBot${guild ? ` to guild ${guild.id}` : ''}`);
    const result = await this.sendWelcomeDM(client, user.id);
    return { success: result.success };
  }

  /**
   * Send a test message (used by Msg Test button)
   * @param {Client} client - Discord.js client
   * @param {string} userId - Discord user ID
   * @returns {Object} Result with response for button interaction
   */
  static async sendTestMessage(client, userId) {
    console.log(`🔍 PoC: Sending ComponentsV2 welcome DM via REST API`);

    try {
      // Delegate the actual DM send to the shared helper
      const dmResult = await this.sendWelcomeDM(client, userId);
      if (!dmResult.success) {
        throw new Error(dmResult.error || 'Welcome DM failed');
      }
      const dmChannel = await (await client.users.fetch(userId)).createDM();

      return {
        success: true,
        response: {
          content: `✅ **Welcome message sent to your DMs!**\n\n**Features Demonstrated:**\n• 🎨 Components V2 Container with blue accent\n• 📝 Text Display with markdown formatting\n• ➖ Visual separators for organization\n• 🎭 CastBot-branded emojis (🎬 🏆 🦁 💚)\n• 🔘 Interactive button (green "Try Interactive Button")\n• 🔗 Link button (opens support server)\n\n**Technical Details:**\n\`\`\`\nMethod: Discord REST API (bypassed Discord.js)\nEndpoint: POST /channels/${dmChannel.id}/messages\nFlags: IS_COMPONENTS_V2 (1 << 15)\nComponents: Container → 3 Text Displays + 2 Separators + 2 Buttons\n\`\`\`\n\n💡 **Click the green button in your DM to see UPDATE_MESSAGE in action!**`,
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