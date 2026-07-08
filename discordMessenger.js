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
import { expandBotEmojis } from './botEmojis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGE_HISTORY_PATH = path.join(__dirname, 'messageHistory.json');
const MAX_HISTORY_ENTRIES = 1000;

// Dedupe welcome DMs: on install, the owner path (guildCreate → sendWelcomePackage)
// and the installer path (APPLICATION_AUTHORIZED webhook) can both target the same
// user. Track recent welcome-DM userIds so the second one within the window is skipped.
// Keyed per-user, so owner ≠ installer still gets one DM each.
const recentWelcomeDMs = new Map(); // userId -> timestamp (ms)
const WELCOME_DM_DEDUPE_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// SETUP WIZARD — BUTTON STATE MODEL (single source of truth for task-button gating)
//
// Every wizard task button is driven by TWO independent booleans:
//   • gate → is the prerequisite met? ENABLED when true, disabled/greyed when false.
//   • done → is the task complete? Green "✅ <doneLabel>" when true (still clickable),
//            otherwise grey "<emoji> <label>". Omit doneLabel for tasks with no
//            completion state (they're just gated grey buttons).
//
// The gate/done SIGNALS are computed by the callers and passed into
// createWelcomeComponents() — see createProductionMenuInterface, prod_setup_wizard,
// and setup_castbot in app.js. The signals themselves:
//   hasSetup          ≥1 pronoun AND ≥1 timezone role   (roleManager.hasCompletedSetup)
//   hasCastlist       default castlist has ≥1 tribe role (castlistManager.defaultCastlistHasTribes)
//   hasPostedCastlist server ever clicked Post Castlist  (playerData[g].setupProgress.castlistPosted)
//   hasSeason         guild has ≥1 season               (playerData[g].applicationConfigs has any key)
//
//   Task             gate         done (green ✅)                  notes
//   1 Run Setup      (special)    hasSetup                        action button; extra "⏳ Setting up..." state
//   2 Season Manager hasSetup     hasSeason                       gated nav + done ("✅ Season Created")
//   3 Castlist Mgr   hasSetup     hasCastlist                     gated nav + done
//   4 Post Castlist  hasCastlist  hasPostedCastlist && hasCastlist gated nav + done (green only once a tribe exists too)
//
// To add a task: pick its gate + (optional) done signal, then add one buildWizardTaskButton.
// ─────────────────────────────────────────────────────────────────────────────
function buildWizardTaskButton({ customId, emoji, label, gate, done = false, doneLabel }) {
  if (done && doneLabel) {
    // Completed: green ✅ badge, still navigable (disabled only if the gate isn't met)
    return { type: 2, custom_id: customId, label: doneLabel, style: 3, emoji: { name: '✅' }, disabled: !gate };
  }
  // Not done: grey button, enabled only when its prerequisite (gate) is met
  return { type: 2, custom_id: customId, label, style: 2, emoji: { name: emoji }, disabled: !gate };
}

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
      const dmResult = await this.sendWelcomeDM(client, owner.id, { serverName: guild.name });
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
   * @param {boolean} options.hasSetup - Whether server has at least 1 pronoun AND 1 timezone (drives Run Setup / Castlist Manager state)
   * @param {boolean} options.hasCastlist - Whether the active/default castlist has any tribes assigned (drives Castlist Manager "done" state)
   * @param {boolean} options.hasPostedCastlist - Whether this server has ever clicked Post Castlist (drives Post Castlist "done" state)
   * @param {boolean} options.setupInProgress - Render Run Setup as a green "⏳ Setting up..." (disabled) while setup runs
   * @param {string} options.banner - Optional small text banner shown ABOVE the title (channel only).
   *   Used only by the post-Run-Setup fresh wizard: "✅ Setup Complete", or a "⚠️ Setup ran
   *   with issues" warning when role-hierarchy problems were detected (see buildSetupWizardBanner).
   * @param {string} options.serverName - Guild name to personalize the DM copy
   * @returns {Array} Components V2 container array for Discord
   */
  static createWelcomeComponents(options = { context: 'dm', hasSetup: false }) {
    const isDM = options.context === 'dm';
    const hasSetup = options.hasSetup || false;
    const hasCastlist = options.hasCastlist || false;
    const hasPostedCastlist = options.hasPostedCastlist || false;
    const hasSeason = options.hasSeason || false;
    const setupInProgress = options.setupInProgress || false;
    const banner = options.banner || null; // optional code-block banner above the title (channel only)

    // Channel-only task buttons — rendered as Section (type 9) accessories, one per task.
    // Each task is a Section: nested Text Display (left) + its action button (accessory, right).
    // This mirrors the /castlist Section pattern (castlistV2.js:312) but with a button
    // accessory instead of a thumbnail. More tasks can be added as additional Sections.

    // Per the BUTTON STATE MODEL above (top of file). Signals: hasSetup / hasCastlist / hasPostedCastlist.

    // Task 1 — Run Setup: the one ACTION button (not a gated nav button).
    //   not set up → blue "🪛 Run Setup"; running → green "⏳ Setting up..."; set up → green "✅ Setup Complete".
    const runSetupButton = setupInProgress
      ? { type: 2, custom_id: 'setup_castbot', label: 'Setting up...', style: 3, emoji: { name: '⏳' }, disabled: true }
      : hasSetup
      ? { type: 2, custom_id: 'setup_castbot', label: 'Setup Complete', style: 3, emoji: { name: '✅' }, disabled: true }
      : { type: 2, custom_id: 'setup_castbot', label: 'Run Setup', style: 1, emoji: { name: '🪛' } };

    // Task 2 — Season Manager: gated on hasSetup, done (green ✅ Season Created) when a season exists.
    // Opens as a NEW ephemeral message (season_manager_new), like Castlist Manager.
    const seasonManagerButton = buildWizardTaskButton({
      customId: 'season_manager_new', emoji: '📅', label: 'Season Manager',
      gate: hasSetup, done: hasSeason, doneLabel: 'Season Created'
    });

    // Task 3 — Castlist Manager: gated on hasSetup, done when default castlist has tribes
    const castlistButton = buildWizardTaskButton({
      customId: 'castlist_hub_main_new', emoji: '📋', label: 'Castlist Manager',
      gate: hasSetup, done: hasCastlist, doneLabel: 'First Castlist Made'
    });

    // Task 4 — Post Castlist: gated on hasCastlist (can't display an empty castlist).
    // Green "Castlist Posted" only once the button has been clicked AND a tribe exists in
    // the default castlist (otherwise a stale click flag would show green with no castlist).
    const postCastlistButton = buildWizardTaskButton({
      customId: 'wizard_post_castlist', emoji: '📃', label: 'Post Castlist',
      gate: hasCastlist, done: hasPostedCastlist && hasCastlist, doneLabel: 'Castlist Posted'
    });

    // Row (both contexts): Castbot Features (first) + CastBot Help Server link
    const featuresRow = [
      {
        type: 2, custom_id: 'dm_view_tips',
        label: 'Castbot Features',
        style: 2, // Secondary (grey)
        emoji: { name: '✨' }
      },
      {
        type: 2, // Link Button
        label: 'CastBot Help Server',
        style: 5, // Link style
        url: 'https://discord.gg/H7MpJEjkwT',
        emoji: { name: '💬' }
      }
    ];

    // Note: Main Menu button removed from Setup Wizard - it's now on the subsequent screens
    // (setup_castbot completion, castlist_hub, etc.) to avoid redundancy

    // DM content (welcome message sent on install + msg_test demo)
    // serverName is filled when we know which guild the bot was added to; falls back to generic.
    const serverRef = options.serverName ? `**${options.serverName}**` : 'your server';
    const dmContent = {
      title: '# <:cb_blue> Welcome to CastBot!\nCastBot is your one-stop shop for managing your Cast Experience! Manage your Season Applications, create Castlists, create Idol Hunts & Safaris, and much more!',
      instructions: '## ```🏁 What to do next```\n1. Go to any channel in ' + serverRef + ' and type <:cb_blue> `/menu` to run the setup wizard and get started!\n2. Join the CastBot help server below for the latest updates, tips and support.'
    };

    // Channel (Setup Wizard) content — each task is a full-width header Text Display
    // ABOVE a Section (body text + its button accessory), so the header reads flush.
    const channelContent = {
      title: '# 🧙🏽 CastBot Setup Wizard\nWelcome to CastBot - your one stop shop for managing your Cast Experience! Manage your Season Applications, create Castlists, create Idol Hunts & Safaris, and much more!',
      howTo: '## How to get started',
      setupHeader: '## ``` 🪛 1. Click the Run Setup button```',
      setupBody: '-# > ⌚ Takes 30 seconds\nCastBot uses Discord Roles for player Pronouns and Timezones. Setup will automatically create pronoun and timezone roles in your server, and add them to CastBot. Don\'t worry if you already have some - CastBot will detect and add them to CastBot.',
      seasonHeader: '## ``` 📅️ 2. Create a Season Application process (optional)```',
      seasonBody: '-# > ⌚ Takes 2 minutes\nClick 📅 `Season Manager`, create a season, add some questions and then click `#️⃣ Post to Channel`. If you aren\'t ready to open your applications, you can test this out in a production bots / testing channel.',
      castlistHeader: '## ``` ✏️ 3. Create your first Castlist```',
      castlistBody: '-# > ⌚ Takes 2 minutes\nClick the `📋 Castlist Manager` button to the right, then under *Select a castlist to manage..* choose ✅ Active Castlist. In the \'Tribe Roles\' pop-up, select a role to add to the castlist. If you are just testing the feature out ahead of the season, choose a role like your @Production role.',
      displayHeader: '## ``` 📋 4. Display your Castlist```',
      displayBody: '-# > ⌚ Takes 5 seconds\nIn any Discord channel (including this one), type <:cb_blue> `/castlist` to display the castlist you just made. You can also click the `📃 Post Castlist` button to the right.',
      footer: 'To get back to CastBot, type `/menu` from any channel in your server! Once your season is up and running, use `/castlist` to summon the active castlist showing players. You can get back to this menu from `/menu` → `🪛 Tools`'
    };

    // Build components based on context
    const components = isDM
      ? [
          { type: 10, content: expandBotEmojis(dmContent.title) },
          { type: 14 },
          { type: 10, content: expandBotEmojis(dmContent.instructions) },
          { type: 14 },
          { type: 1, components: featuresRow }
        ]
      : [
          // Optional banner above the title (e.g. "✅ Setup Complete" on the post-Run-Setup re-post)
          ...(banner ? [{ type: 10, content: banner }] : []),
          { type: 10, content: channelContent.title },
          { type: 14 },
          { type: 10, content: channelContent.howTo },
          // Task 1 — full-width header, then Section (body + Run Setup accessory)
          { type: 10, content: channelContent.setupHeader },
          {
            type: 9, // Section
            components: [{ type: 10, content: channelContent.setupBody }],
            accessory: runSetupButton
          },
          // Task 2 — full-width header, then Section (body + Season Manager accessory)
          { type: 10, content: channelContent.seasonHeader },
          {
            type: 9, // Section
            components: [{ type: 10, content: channelContent.seasonBody }],
            accessory: seasonManagerButton
          },
          // Task 3 — full-width header, then Section (body + Castlist accessory)
          { type: 10, content: channelContent.castlistHeader },
          {
            type: 9, // Section
            components: [{ type: 10, content: channelContent.castlistBody }],
            accessory: castlistButton
          },
          // Task 3 — full-width header, then Section (body + Post Castlist accessory)
          { type: 10, content: channelContent.displayHeader },
          {
            type: 9, // Section
            components: [{ type: 10, content: expandBotEmojis(channelContent.displayBody) }],
            accessory: postCastlistButton
          },
          { type: 14 },
          { type: 10, content: channelContent.footer },
          { type: 14 },
          { type: 1, components: featuresRow }
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
   * @param {Object} [opts]
   * @param {string} [opts.serverName] - Guild name to personalize the message (falls back to generic)
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  static async sendWelcomeDM(client, userId, { serverName = null } = {}) {
    // Dedupe: skip if this user was already sent a welcome DM very recently
    // (handles owner-path + installer-path both firing on a single install)
    const now = Date.now();
    const last = recentWelcomeDMs.get(userId);
    if (last && (now - last) < WELCOME_DM_DEDUPE_MS) {
      console.log(`🔁 Welcome DM to ${userId} skipped (already sent ${Math.round((now - last) / 1000)}s ago)`);
      return { success: true, skipped: 'duplicate' };
    }
    recentWelcomeDMs.set(userId, now);
    // Opportunistic cleanup of stale entries
    for (const [uid, ts] of recentWelcomeDMs) {
      if (now - ts > WELCOME_DM_DEDUPE_MS) recentWelcomeDMs.delete(uid);
    }

    try {
      const user = await client.users.fetch(userId);
      const dmChannel = await user.createDM();
      console.log(`📬 Welcome DM channel for ${userId}: ${dmChannel.id}`);

      // CRITICAL: IS_COMPONENTS_V2 flag required for Container (type 17)
      const v2Message = {
        flags: 1 << 15, // IS_COMPONENTS_V2 (32768)
        components: this.createWelcomeComponents({ context: 'dm', serverName })
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
    const result = await this.sendWelcomeDM(client, user.id, { serverName: guild?.name || null });
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