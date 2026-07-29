/**
 * Menu Builder System for CastBot
 * Provides centralized menu creation and legacy tracking
 */
import { InteractionResponseFlags } from 'discord-interactions';
import { getBotEmoji } from './botEmojis.js';
import { hasAskCastBotAccess } from './askCastBot.js';

/**
 * Menu Registry - Central source of truth for all menus
 * As menus are migrated from legacy inline patterns, they get registered here
 */
export const MENU_REGISTRY = {
  // Setup Menu - Initial server configuration
  'setup_menu': {
    title: '🪛 CastBot | Tools',
    accent: 0x3498DB, // Blue for standard menus
    ephemeral: true, // REQUIRED: Admin menu (default for all menus unless explicitly set to false)
    builder: 'buildSetupMenu', // Custom builder for Reece-only conditional button
    sections: [] // Built dynamically
  },

  // Premium Menu - mockup clone of Tools (Reece-only entry point)
  'premium_menu': {
    title: '⭐ CastBot | Premium',
    accent: 0x3498DB, // keep blue for faithful clone (gold 0xf39c12 is a 1-line iteration later)
    ephemeral: true,
    builder: 'buildPremiumMenu',
    sections: [] // Built dynamically
  },

  // Reece's Stuff - secret admin tools (Reece-only)
  'reeces_stuff': {
    title: "🐧 Reece's Stuff",
    accent: 0xe74c3c, // Red
    ephemeral: false, // updateMessage from Tools menu
    builder: 'buildReecesStuffMenu',
    sections: []
  }
};

/**
 * MenuBuilder class - Handles menu creation and legacy tracking
 */
export class MenuBuilder {
  /**
   * Track legacy menu usage for migration visibility
   * @param {string} location - Where the menu is defined (e.g., 'reeces_stuff')
   * @param {string} description - Human-readable description of the menu
   */
  static trackLegacyMenu(location, description) {
    console.log(`MENU DEBUG: Legacy menu at ${location} - ${description} [⚱️ MENULEGACY]`);
  }

  /**
   * Create a menu from the registry
   * @param {string} menuId - The menu identifier in MENU_REGISTRY
   * @param {Object} context - Context object with guild, user, etc.
   * @returns {Object} Menu container following Components V2 format
   */
  static async create(menuId, context) {
    console.log(`MENU DEBUG: Building ${menuId} [🛸 MENUSYSTEM]`);

    const menuConfig = MENU_REGISTRY[menuId];
    if (!menuConfig) {
      console.log(`MENU DEBUG: Menu ${menuId} not found in registry [⚠️ UNREGISTERED]`);
      throw new Error(`Menu ${menuId} not found in MENU_REGISTRY. Has it been migrated yet?`);
    }

    // If menu has custom builder, use it
    if (menuConfig.builder && typeof this[menuConfig.builder] === 'function') {
      return await this[menuConfig.builder](menuConfig, context);
    }

    // Default builder for standard menus
    return this.buildStandardMenu(menuConfig, context);
  }

  /**
   * Build a full ephemeral factory-handler response for a registry menu:
   * container + component-count logging + Components V2/ephemeral flags.
   * Shared by the castbot_tools and castbot_premium handlers in app.js.
   * @param {string} menuId - The menu identifier in MENU_REGISTRY
   * @param {Object} context - Context object with guild, user, etc.
   * @param {string} label - Label for the component-count log line
   * @returns {Object} Factory handler response ({ flags, components })
   */
  static async buildMenuResponse(menuId, context, label) {
    const container = await this.create(menuId, context);
    const { countComponents } = await import('./utils.js');
    countComponents([container], { verbosity: "full", label });
    return {
      flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL (admin UI)
      components: [container]
    };
  }

  /**
   * Build the setup_menu with conditional Reece-only button
   * @param {Object} menuConfig - Menu configuration from registry
   * @param {Object} context - Context object with userId
   * @returns {Object} Menu container
   */
  static buildSetupMenu(menuConfig, context) {
    const isReece = ['391415444084490240', '1086246253819613274'].includes(context?.userId);
    const isTest = process.env.INSTANCE_ROLE === 'test';

    // 🔵 Ask CastBot — trusted super-users only, DEV/TEST only (prod has no Claude CLI).
    // Everyone here already passed the Tools menu's Manage Roles gate; this narrows to
    // whitelisted guilds + users. The handlers re-check — this is display, not security.
    const specialFeatures = [
      { type: 2, custom_id: 'attribute_management', label: 'Attributes', style: 2, emoji: { name: '📊' } },
      { type: 2, custom_id: 'category_post', label: 'Category Post', style: 2, emoji: { name: '🖼️' } },
      { type: 2, custom_id: 'safari_manage_enemies', label: 'Enemies', style: 2, emoji: { name: '🐙' } },
      { type: 2, custom_id: 'tycoons_legacy', label: 'Tycoons', style: 2, emoji: { name: '💼' } }
    ];
    // 👾 Ask CastBot — one button for the whole feature: it answers questions AND makes
    // changes (admins in entitled guilds get a private preview + Apply). Post Ask sits
    // beside it — same feature, "put a button in a channel" instead of "use it now".
    // OWN ROW: specialFeatures is already 4 and Discord caps an ActionRow at 5 buttons.
    const askRow = hasAskCastBotAccess({ userId: context?.userId, guildId: context?.guildId })
      ? [{ type: 1, components: [
          { type: 2, custom_id: 'askcb_ask', label: 'Ask CastBot', style: 1, emoji: { name: '👾' } },
          { type: 2, custom_id: 'askcb_post', label: 'Post Ask CastBot', style: 2, emoji: { name: '👾' } }
        ]}]
      : [];

    // Cleanup section — admin maintenance tools. Archive Channels is TEST-only for now.
    const cleanupButtons = [];
    if (isTest) cleanupButtons.push({ type: 2, custom_id: 'archive_channel', label: 'Archive Channels', style: 2, emoji: { name: '🧹' } });
    cleanupButtons.push(
      { type: 2, custom_id: 'nav_tidy_open', label: 'Navigate Tidy', style: 2, emoji: { name: '🗺️' } },
      { type: 2, custom_id: 'prod_nuke_category', label: 'Nuke Category', style: 2, emoji: { name: '☢️' } },
      { type: 2, custom_id: 'data_clear_vanity', label: 'Clear Vanity Roles', style: 2, emoji: { name: '💅' } }
    );

    const components = [
      { type: 10, content: `## ${menuConfig.title}` },
      { type: 14 },
      { type: 10, content: `### \`\`\`🐙 Special Features\`\`\`` },
      { type: 1, components: specialFeatures },
      ...askRow,
      { type: 10, content: `### \`\`\`🧹 Cleanup\`\`\`` },
      { type: 1, components: cleanupButtons },
      { type: 10, content: `### \`\`\`❄️ Timers (Snowflake)\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'snowflake_calculator', label: 'Calculator', style: 2, emoji: { name: '⏱️' } },
          { type: 2, custom_id: 'snowflake_lookup', label: 'Lookup', style: 2, emoji: { name: '🔍' } }
        ]
      },
      { type: 10, content: `### \`\`\`🔮 Utilities\`\`\`` },
      {
        type: 1,
        components: [
          // Setup + Scheduled Jobs moved to CastBot Settings (2026-07-29); Refresh Anchors
          // moved to Map Explorer as ⚓ Anchors — each now sits with the things it affects.
          { type: 2, custom_id: 'prod_availability', label: 'Availability', style: 2, emoji: { name: '🕐' } },
          { type: 2, custom_id: 'emoji_editor', label: 'Emoji Editor', style: 2, emoji: { name: '🎨' } }
        ]
      },
      { type: 10, content: `### \`\`\`📜 Info & Support\`\`\`` }
    ];

    const infoRow = [];
    if (isReece) {
      infoRow.push(
        { type: 2, custom_id: 'data_admin', label: 'Data', style: 4, emoji: { name: '🧮' } },
        { type: 2, custom_id: 'reeces_stuff', label: "Reece's Stuff", style: 4, emoji: { name: '🐧' } }
      );
    }
    infoRow.push(
      { type: 2, custom_id: 'prod_terms_of_service', label: 'Terms of Service', style: 2, emoji: { name: '📜' } },
      { type: 2, custom_id: 'prod_privacy_policy', label: 'Privacy Policy', style: 2, emoji: { name: '🔒' } },
      { type: 2, label: 'Need Help?', style: 5, emoji: { name: '❓' }, url: 'https://discord.gg/H7MpJEjkwT' }
    );
    components.push({ type: 1, components: infoRow });

    // Navigation
    components.push(
      { type: 14 },
      { type: 1, components: [{ type: 2, custom_id: 'prod_menu_back', label: 'Menu', style: 1, emoji: getBotEmoji('cb_transparent') }] }
    );

    return {
      type: 17,
      accent_color: menuConfig.accent || 0x3498DB,
      components
    };
  }

  /**
   * Build the premium_menu — Premium mockup, fork of buildSetupMenu.
   * Iterate HERE, never touch buildSetupMenu: this clone exists so the Premium
   * menu can diverge without risking the live Tools menu.
   * @param {Object} menuConfig - Menu configuration from registry
   * @param {Object} context - Context object with userId
   * @returns {Object} Menu container
   */
  static buildPremiumMenu(menuConfig, context) {
    const isTest = process.env.INSTANCE_ROLE === 'test';

    // 🔵 Ask CastBot — trusted super-users only, DEV/TEST only (prod has no Claude CLI).
    // Display-only gate; the handlers re-check.
    const specialFeatures = [
      { type: 2, custom_id: 'attribute_management', label: 'Attributes', style: 2, emoji: { name: '📊' } },
      { type: 2, custom_id: 'category_post', label: 'Category Post', style: 2, emoji: { name: '🖼️' } },
      { type: 2, custom_id: 'safari_manage_enemies', label: 'Enemies', style: 2, emoji: { name: '🐙' } }
    ];
    if (hasAskCastBotAccess({ userId: context?.userId, guildId: context?.guildId })) {
      specialFeatures.unshift(
        { type: 2, custom_id: 'askcb_ask', label: 'Ask CastBot', style: 1, emoji: { name: '👾' } },
        { type: 2, custom_id: 'askcb_post', label: 'Post Ask CastBot', style: 2, emoji: { name: '👾' } }
      );
    }

    // Cleanup section — admin maintenance tools. Archive Channels is ungated HERE (the
    // Premium menu) as of 2026-07-29; it stays TEST-only in the Tools menu above.
    const cleanupButtons = [
      { type: 2, custom_id: 'archive_channel', label: 'Archive Channels', style: 2, emoji: { name: '🧹' } },
      { type: 2, custom_id: 'nav_tidy_open', label: 'Navigate Tidy', style: 2, emoji: { name: '🗺️' } },
      { type: 2, custom_id: 'prod_nuke_category', label: 'Nuke Category', style: 2, emoji: { name: '☢️' } },
      { type: 2, custom_id: 'data_clear_vanity', label: 'Clear Vanity Roles', style: 2, emoji: { name: '💅' } }
    ];

    const components = [
      { type: 10, content: `## ${menuConfig.title}` },
      { type: 14 },
      { type: 10, content: `### \`\`\`🐙 Special Features\`\`\`` },
      { type: 1, components: specialFeatures },
      { type: 10, content: `### \`\`\`🧹 Cleanup\`\`\`` },
      { type: 1, components: cleanupButtons },
      { type: 10, content: `### \`\`\`❄️ Timers (Snowflake)\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'snowflake_calculator', label: 'Calculator', style: 2, emoji: { name: '⏱️' } },
          { type: 2, custom_id: 'snowflake_lookup', label: 'Lookup', style: 2, emoji: { name: '🔍' } }
        ]
      },
      { type: 10, content: `### \`\`\`🔮 Utilities\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'prod_availability', label: 'Availability', style: 2, emoji: { name: '🕐' } },
          { type: 2, custom_id: 'emoji_editor', label: 'Emoji Editor', style: 2, emoji: { name: '🎨' } },
          { type: 2, custom_id: 'tycoons_legacy', label: 'Tycoons', style: 2, emoji: { name: '💼' } }
        ]
      }
    ];

    // Navigation
    components.push(
      { type: 14 },
      { type: 1, components: [{ type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 }] }
    );

    return {
      type: 17,
      accent_color: menuConfig.accent || 0x3498DB,
      components
    };
  }

  /**
   * Build Reece's Stuff menu — secret admin tools
   */
  static buildReecesStuffMenu(menuConfig, context) {
    const envLabel = process.env.INSTANCE_ROLE === 'test' ? 'Test' : process.env.NODE_ENV === 'production' ? 'Prod' : 'Dev';
    // ⚠️ THIS MENU IS AT DISCORD'S 40-COMPONENT CEILING (40/40 as of 2026-07-29 —
    // Entitlements took the last seat). Adding ANYTHING here now requires removing
    // something first. Verify with countComponents([menu]).
    const components = [
      { type: 10, content: `## ${menuConfig.title}` },
      { type: 10, content: `### \`\`\`🦠 Experimental\`\`\`` },
      // Two rows: Discord caps an ActionRow at 5 buttons. Post Moai sits next to Moai
      // (same family — both drive Claude). Post Ask CastBot moved to Tools → Special
      // Features beside Ask CastBot itself when Edit Safari merged into it (2026-07-29).
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'poc_menu_button', label: 'Menu', style: 1, emoji: getBotEmoji('cb_transparent') },
          { type: 2, custom_id: 'moai_ask', label: 'Moai', style: 2, emoji: { name: '🗿' } },
          { type: 2, custom_id: 'pcard_open', label: 'Player Card', style: 2, emoji: { name: '🪪' } }
        ]
      },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'msg_test', label: 'Msg Test', style: 2, emoji: { name: '💬' } },
          { type: 2, custom_id: 'moai_post', label: 'Post Moai', style: 1, emoji: { name: '🗿' } },
          { type: 2, custom_id: 'entitlements_manage', label: 'Entitlements', style: 2, emoji: { name: '🎟️' } }
        ]
      },
      { type: 10, content: `### \`\`\`🔧 Admin Tools\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'test_role_hierarchy', label: 'Check Roles', style: 2, emoji: { name: '🔰' } },
          { type: 2, custom_id: 'admin_populate_logs', label: 'Populate Logs', style: 2, emoji: { name: '📜' } },
          { type: 2, custom_id: 'admin_backfill_channel_logs', label: 'Backfill Channel', style: 2, emoji: { name: '📡' } },
          { type: 2, custom_id: 'emergency_app_reinit', label: 'App Re-Init', style: 2, emoji: { name: '🚨' } },
          { type: 2, custom_id: 'reece_uptime', label: 'Uptime', style: 2, emoji: { name: '🕰️' } }
        ]
      },
      { type: 10, content: `### \`\`\`📺 Restart\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'restart_bot', label: `Restart ${envLabel}`, style: 4, emoji: { name: '🔄' } },
          { type: 2, custom_id: 'restart_prod', label: 'Restart Prod', style: 4, emoji: { name: '🔁' } }
        ]
      },
      { type: 10, content: `### \`\`\`🗺️ Map Tools\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'bulk_rename_map_channels', label: 'Rename Channels', style: 2, emoji: { name: '📍' } }
        ]
      },
      { type: 10, content: `### \`\`\`📼 Legacy\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'prod_manage_tribes_legacy_debug', label: 'Tribes (Legacy)', style: 2, emoji: { name: '🔥' } },
          { type: 2, custom_id: 'safari_location_editor', label: 'Location Editor', style: 2, emoji: { name: '📍' } },
          { type: 2, custom_id: 'prod_live_analytics', label: 'Print Logs', style: 2, emoji: { name: '⚠️' } },
          { type: 2, custom_id: 'prod_toggle_live_analytics', label: 'CastBot Logs', style: 2, emoji: getBotEmoji('castbot_logo') },
          { type: 2, custom_id: 'reeces_radio_mockup', label: 'Radio PoC (Mockup)', style: 2, emoji: { name: '📻' } }
        ]
      },
      {
        // 🗿 DEPRECATED legacy Player Admin — superseded by the Player Manager (/menu → Manage Players).
        // Kept here (Reece-only) for fallback access; hidden from the main menu.
        type: 1,
        components: [
          { type: 2, custom_id: 'safari_map_admin', label: 'Player Admin (Legacy)', style: 2, emoji: { name: '🧭' } }
        ]
      },
      { type: 10, content: `### \`\`\`🎯 Prototypes\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'tribeplan_open', label: 'Tribe Planner (Mockup)', style: 1, emoji: { name: '🎯' } }
        ]
      },
      { type: 1, components: [{ type: 2, custom_id: 'castbot_tools', label: '← Tools', style: 2 }] }
    ];

    return {
      type: 17,
      accent_color: menuConfig.accent || 0xe74c3c,
      components
    };
  }

  /**
   * Build a standard menu following LeanUserInterfaceDesign.md patterns
   * @param {Object} menuConfig - Menu configuration from registry
   * @param {Object} context - Context object
   * @returns {Object} Menu container
   */
  static buildStandardMenu(menuConfig, context) {
    const components = [];

    // Header (LeanUserInterfaceDesign.md pattern)
    components.push({
      type: 10, // Text Display
      content: `## ${menuConfig.title}`
    });
    components.push({ type: 14 }); // Separator

    // Build sections
    if (menuConfig.sections) {
      menuConfig.sections.forEach((section, index) => {
        if (section.label) {
          components.push({
            type: 10,
            content: `### \`\`\`${section.label}\`\`\``
          });
        }

        // Add section components (buttons, selects, etc.)
        if (section.components) {
          components.push(...section.components);
        }

        // Add separator between sections, but NOT after the last section
        // Container itself provides the visual boundary
        const isLastSection = index === menuConfig.sections.length - 1;
        if (!isLastSection) {
          components.push({ type: 14 }); // Separator between sections only
        }
      });
    }

    // Return Components V2 container
    return {
      type: 17, // Container
      accent_color: menuConfig.accent || 0x3498DB,
      components
    };
  }

  /**
   * Check if a menu is registered
   * @param {string} menuId - Menu identifier
   * @returns {boolean} True if menu is in registry
   */
  static isRegistered(menuId) {
    return MENU_REGISTRY.hasOwnProperty(menuId);
  }

  /**
   * Get menu configuration
   * @param {string} menuId - Menu identifier
   * @returns {Object|null} Menu configuration or null
   */
  static getMenuConfig(menuId) {
    return MENU_REGISTRY[menuId] || null;
  }

  /**
   * Register a new menu
   * @param {string} menuId - Menu identifier
   * @param {Object} config - Menu configuration
   */
  static registerMenu(menuId, config) {
    console.log(`MENU DEBUG: Registering menu ${menuId} [➕ NEW]`);
    MENU_REGISTRY[menuId] = config;
  }

  /**
   * Get migration statistics for logging
   * @returns {Object} Stats about menu migration progress
   */
  static getMigrationStats() {
    const registered = Object.keys(MENU_REGISTRY).length;
    return {
      registered,
      status: `${registered} menus migrated to MenuSystem`
    };
  }
}

// Export default for simpler imports
export default MenuBuilder;
