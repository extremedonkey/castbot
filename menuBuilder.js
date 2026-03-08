/**
 * Menu Builder System for CastBot
 * Provides centralized menu creation and legacy tracking
 */

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
   * Build the setup_menu with conditional Reece-only button
   * @param {Object} menuConfig - Menu configuration from registry
   * @param {Object} context - Context object with userId
   * @returns {Object} Menu container
   */
  static buildSetupMenu(menuConfig, context) {
    const isReece = context?.userId === '391415444084490240';

    const components = [
      { type: 10, content: `## ${menuConfig.title}` },
      { type: 14 },
      { type: 10, content: `### \`\`\`🧙 Setup & Configuration\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'prod_setup_wizard', label: 'Setup Wizard', style: 1, emoji: { name: '🧙' } },
          { type: 2, custom_id: 'attribute_management', label: 'Attributes', style: 2, emoji: { name: '📊' } },
          { type: 2, custom_id: 'prod_create_emojis', label: 'Player Emojis', style: 2, emoji: { name: '😀' } }
        ]
      },
      { type: 10, content: `### \`\`\`💜 Roles & Availability\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'prod_manage_pronouns_timezones', label: 'Reaction Roles', style: 2, emoji: { name: '💜' } },
          { type: 2, custom_id: 'prod_availability', label: 'Availability', style: 2, emoji: { name: '🕐' } }
        ]
      },
      { type: 10, content: `### \`\`\`📜 Info & Support\`\`\`` }
    ];

    const infoRow = [];
    if (isReece) {
      infoRow.push(
        { type: 2, custom_id: 'reeces_stuff', label: "Reece's Stuff", style: 4, emoji: { name: '🐧' } },
        { type: 2, custom_id: 'analytics_admin', label: 'Analytics', style: 4, emoji: { name: '🧮' } }
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
    const components = [
      { type: 10, content: `## ${menuConfig.title}` },
      { type: 14 },
      { type: 10, content: `### \`\`\`🦠 Experimental\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'pcard_open', label: 'Player Card', style: 2, emoji: { name: '🪪' } },
          { type: 2, custom_id: 'msg_test', label: 'Msg Test', style: 2, emoji: { name: '💬' } },
          { type: 2, custom_id: 'richcard_demo', label: 'Rich Card', style: 1, emoji: { name: '🎴' } },
          { type: 2, custom_id: 'reeces_season_planner_mockup', label: 'Season Planner (Mockup)', style: 1, emoji: { name: '📝' } },
          { type: 2, custom_id: 'reeces_radio_mockup', label: 'Radio PoC (Mockup)', style: 1, emoji: { name: '📻' } }
        ]
      },
      { type: 10, content: `### \`\`\`🔧 Admin Tools\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'test_role_hierarchy', label: 'Check Roles', style: 2, emoji: { name: '🔰' } },
          { type: 2, custom_id: 'admin_populate_logs', label: 'Populate Logs', style: 2, emoji: { name: '📜' } },
          { type: 2, custom_id: 'admin_backfill_channel_logs', label: 'Backfill Channel', style: 2, emoji: { name: '📡' } },
          { type: 2, custom_id: 'emergency_app_reinit', label: 'App Re-Init', style: 4, emoji: { name: '🚨' } },
          { type: 2, custom_id: 'restart_bot', label: 'Restart Bot', style: 4, emoji: { name: '🔄' } }
        ]
      },
      { type: 10, content: `### \`\`\`📼 Legacy\`\`\`` },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'prod_manage_tribes_legacy_debug', label: 'Tribes (Legacy)', style: 2, emoji: { name: '🔥' } },
          { type: 2, custom_id: 'prod_live_analytics', label: 'Print Logs', style: 2, emoji: { name: '⚠️' } },
          { type: 2, custom_id: 'prod_toggle_live_analytics', label: 'Toggle Logs', style: 2, emoji: { name: '🔃' } }
        ]
      },
      { type: 14 },
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
