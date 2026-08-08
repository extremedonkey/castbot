/**
 * Menu Builder System for CastBot
 * Provides centralized menu creation and legacy tracking
 */
import { InteractionResponseFlags } from 'discord-interactions';
import { getBotEmoji } from './botEmojis.js';
import { hasAskCastBotAccess } from './askCastBot.js';
import { hasPremiumAccessSync, getGuildEntitlement } from './entitlements.js';

const REECE_ID = '391415444084490240';

/**
 * Buttons/selects inside the Premium menu that stay LIVE for non-entitled guilds:
 * navigation, Donate (money path stays open, obviously), and the upsell entry itself.
 */
export const PREMIUM_KEEP_IDS = ['prod_menu_back', 'prod_donate', 'premium_get'];

/**
 * Pure — the Premium paywall lock-swap (RaP 0891 "rip the bandaid" 2026-08-08).
 *
 * Rewrites every interactive component's custom_id to `premium_locked_<original>` so ONE
 * handler serves the upsell screen, except keep-listed ids and Link buttons (style 5 —
 * no custom_id to rewrite). This is a COMMERCIAL gate, not a security boundary: the
 * underlying features stay reachable via their own surfaces/gates (Tools menu today),
 * and a hand-crafted click of a real id grants nothing those surfaces don't. Mutates
 * and returns `components`. Unit-tested.
 */
export function lockPremiumComponents(components, keepIds = PREMIUM_KEEP_IDS) {
  for (const node of components || []) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 1) { lockPremiumComponents(node.components, keepIds); continue; }
    if (node.type === 9) { // Section: lock its children AND its accessory button
      lockPremiumComponents(node.components, keepIds);
      if (node.accessory) lockPremiumComponents([node.accessory], keepIds);
      continue;
    }
    const interactive = node.type === 2 ? node.style !== 5 : (node.type >= 3 && node.type <= 8);
    if (interactive && node.custom_id && !keepIds.includes(node.custom_id) && !node.custom_id.startsWith('premium_locked_')) {
      node.custom_id = `premium_locked_${node.custom_id}`;
    }
  }
  return components;
}

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
    const isTest = process.env.INSTANCE_ROLE === 'test';

    // 🔵 Ask CastBot — trusted super-users only, DEV/TEST only (prod has no Claude CLI).
    // Everyone here already passed the Tools menu's Manage Roles gate; this narrows to
    // whitelisted guilds + users. The handlers re-check — this is display, not security.
    const specialFeatures = [
      { type: 2, custom_id: 'attribute_management', label: 'Attributes', style: 2, emoji: { name: '📊' } },
      { type: 2, custom_id: 'category_post', label: 'Category Post', style: 2, emoji: { name: '🖼️' } },
      { type: 2, custom_id: 'safari_manage_enemies', label: 'Enemies', style: 2, emoji: { name: '🐙' } }
    ];
    // 👾 Ask CastBot — one button for the whole feature: it answers questions AND makes
    // changes (admins in entitled guilds get a private preview + Apply). Post Ask sits
    // beside it — same feature, "put a button in a channel" instead of "use it now".
    // OWN ROW: kept separate so the gated Ask pair doesn't reshuffle the Special Features row.
    const askRow = hasAskCastBotAccess({ userId: context?.userId, guildId: context?.guildId })
      ? [{ type: 1, components: [
          { type: 2, custom_id: 'askcb_ask', label: 'Ask CastBot', style: 1, emoji: { name: '👾' } },
          { type: 2, custom_id: 'askcb_post', label: 'Post Ask CastBot', style: 2, emoji: { name: '👾' } }
        ]}]
      : [];

    // Cleanup section — admin maintenance tools. Archive Channels is TEST-only for now.
    const cleanupButtons = [];
    if (isTest) cleanupButtons.push({ type: 2, custom_id: 'archive_channel', label: 'Archiver', style: 2, emoji: { name: '🧹' } });
    // Clear Vanity Roles moved to CastBot Settings as Vanity Roles (2026-08-08)
    cleanupButtons.push(
      { type: 2, custom_id: 'prod_nuke_category', label: 'Nuke Category', style: 2, emoji: { name: '☢️' } }
    );

    const components = [
      { type: 10, content: `## ${menuConfig.title}` },
      { type: 14 },
      { type: 10, content: `### \`\`\`🐙 Special Features\`\`\`` },
      { type: 1, components: specialFeatures },
      ...askRow,
      { type: 10, content: `### \`\`\`🧹 Cleanup\`\`\`` },
      { type: 1, components: cleanupButtons },
      { type: 10, content: `### \`\`\`🔮 Utilities\`\`\`` },
      {
        type: 1,
        components: [
          // Setup + Scheduled Jobs moved to CastBot Settings (2026-07-29); Refresh Anchors
          // moved to Map Explorer as ⚓ Anchors — each now sits with the things it affects.
          // Timers section folded in here (2026-08-08): Stopwatch/Snowflake = the old
          // snowflake Calculator/Lookup, custom_ids unchanged.
          { type: 2, custom_id: 'snowflake_calculator', label: 'Stopwatch', style: 2, emoji: { name: '⏱️' } },
          { type: 2, custom_id: 'snowflake_lookup', label: 'Snowflake', style: 2, emoji: { name: '❄️' } },
          { type: 2, custom_id: 'prod_availability', label: 'Availability', style: 2, emoji: { name: '🕐' } },
          { type: 2, custom_id: 'emoji_editor', label: 'Emoji Editor', style: 2, emoji: { name: '🎨' } }
        ]
      }
    ];
    // Info & Support section retired (2026-08-08): ToS+Privacy → Settings Policy button,
    // Data/Reece's Stuff → Settings Advanced, Need Help → main menu Support link.

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
  static async buildPremiumMenu(menuConfig, context) {
    const isTest = process.env.INSTANCE_ROLE === 'test';

    // Category Post moved to 📢 Player Engagement (2026-08-08).
    // Import/Export moved under 🦁 Safari Premium (2026-08-08): round-tripping Safari content
    // is a Premium data op. Retired the standalone 📦 Safari Utilities header.
    const specialFeatures = [
      { type: 2, custom_id: 'attribute_management', label: 'Attributes', style: 2, emoji: { name: '📊' } },
      { type: 2, custom_id: 'safari_manage_enemies', label: 'Enemies', style: 2, emoji: { name: '🐙' } },
      { type: 2, custom_id: 'safari_import_data', label: 'Import', style: 2, emoji: { name: '📥' } },
      { type: 2, custom_id: 'safari_export_data', label: 'Export', style: 2, emoji: { name: '📤' } }
    ];
    // 👾 Ask CastBot — own header + row (Post first). ALWAYS rendered here (2026-08-08):
    // it's the flagship premium feature, so non-entitled guilds must SEE it — their clicks
    // lock-swap to the upsell like everything else. Entitled guilds get the real buttons,
    // whose handlers enforce the entitlement + environment gates regardless.
    const askSection = [
      { type: 10, content: `### \`\`\`👾 Ask CastBot\`\`\`` },
      { type: 10, content: `Ask CastBot is like giving ChatGPT access to CastBot. You can get it to bulk create items, generate flavor text for your safari, ask which player has which items, or even just general questions about how to do things in CastBot.` },
      { type: 1, components: [
        { type: 2, custom_id: 'askcb_post', label: 'Post Ask CastBot', style: 1, emoji: { name: '👾' } },
        { type: 2, custom_id: 'askcb_ask', label: 'Ask CastBot', style: 2, emoji: { name: '👾' } }
      ] }
    ];

    // 🧹 Cleanup section retired (2026-08-08): Nuke Category deleted from this menu (its
    // capability lives inside the Archiver flow), Archiver moved to lead Utilities.
    const isReece = String(context?.userId) === REECE_ID;

    // #️⃣ Channels — the SAME row the Season Manager Channels tab renders (RaP 0885 stage 1).
    // Resolved BEFORE assembly because the section now sits mid-menu (between Special Features
    // and Player Engagement), and Player Engagement's Msg Category button shares its gate.
    // Imported dynamically so this menu, built on every /menu open, doesn't drag the whole
    // channel-admin stack (discord.js + storage + ops) into the startup import graph.
    //
    // Season-less surface: the buttons' handlers all parse a configId off the custom_id, so one
    // is resolved lazily here by recency. No seasons → no configId → the section is omitted
    // rather than rendering buttons that would fail on click.
    let channelsConfigId = null;
    const { CHANNEL_ADMIN_USER_IDS } = await import('./src/channels/channelAdminConfig.js');
    if (CHANNEL_ADMIN_USER_IDS.includes(String(context?.userId)) && context?.guildId) {
      const { loadPlayerData } = await import('./storage.js');
      const { mostRecentConfigId } = await import('./src/channels/channelPlan.js');
      channelsConfigId = mostRecentConfigId(await loadPlayerData(), context.guildId);
    }

    let channelsSection = [];
    if (channelsConfigId) {
      const { buildChannelsSection } = await import('./src/channels/channelsView.js');
      const { setChannelsOrigin } = await import('./src/channels/channelsHandlers.js');
      setChannelsOrigin(context.userId, 'premium'); // Cancel / ← Back returns HERE, not to Season Manager
      channelsSection = buildChannelsSection(channelsConfigId);
    }

    const components = [
      // Title: for Reece the header nests in a Section (type 9) whose accessory is the
      // grey 🎟️ Entitlements button (2026-08-08) — premium ops rides the header, invisible
      // to everyone else. Display-only gate; the entitlements handlers re-check the owner ID.
      isReece
        ? { type: 9, components: [{ type: 10, content: `## ${menuConfig.title}` }],
            accessory: { type: 2, custom_id: 'entitlements_manage', label: 'Entitlements', style: 2, emoji: { name: '🎟️' } } }
        : { type: 10, content: `## ${menuConfig.title}` },
      { type: 14 },
      ...askSection,
      { type: 10, content: `### \`\`\`🦁 Safari Premium\`\`\`` },
      { type: 1, components: specialFeatures },
      ...channelsSection,
      // 📢 Player Engagement — host→player broadcast tools (2026-08-08): Category Post moved
      // out of Special Features; Msg Category moved out of the shared Channels row (its slot
      // went to Swap/Merge) and is whitelist-gated like the Channels section above.
      { type: 10, content: `### \`\`\`📢 Player Engagement\`\`\`` },
      { type: 1, components: [
        { type: 2, custom_id: 'category_post', label: 'Category Post', style: 2, emoji: { name: '🖼️' } },
        ...(channelsConfigId
          ? [{ type: 2, custom_id: `channels_msg_${channelsConfigId}`, label: 'Msg Category', style: 2, emoji: { name: '📨' } }]
          : [])
      ] },
      { type: 10, content: `### \`\`\`🔮 Utilities\`\`\`` },
      {
        type: 1,
        components: [
          // Archiver leads (moved from the retired Cleanup section 2026-08-08);
          // Stopwatch/Snowflake are the old Timers (same ids, new labels).
          { type: 2, custom_id: 'archive_channel', label: 'Archiver', style: 2, emoji: { name: '🧹' } },
          { type: 2, custom_id: 'snowflake_calculator', label: 'Stopwatch', style: 2, emoji: { name: '⏱️' } },
          { type: 2, custom_id: 'snowflake_lookup', label: 'Snowflake', style: 2, emoji: { name: '❄️' } },
          { type: 2, custom_id: 'prod_availability', label: 'Availability', style: 2, emoji: { name: '🕐' } },
          { type: 2, custom_id: 'emoji_editor', label: 'Emoji Editor', style: 2, emoji: { name: '🎨' } }
        ]
      }
    ];

    // 💳 The paywall (2026-08-08, bandaid ripped): the menu renders for EVERYONE — but in a
    // guild without an active/grace premium tier, every control except ← Menu / Donate /
    // Get Premium is lock-swapped to premium_locked_* → one handler serves the upsell.
    // Reece bypasses everywhere (design iteration + support).
    const entitled = hasPremiumAccessSync(context?.guildId) || String(context?.userId) === REECE_ID;

    // Navigation — Donate moved here from the main menu (2026-08-08): Premium is the money
    // path. ⭐ Get Premium renders for NON-entitled guilds only (Reece 2026-08-08): paying
    // servers don't need an upsell button, and it once pushed the heaviest entitled render
    // to 41/40. After the Cleanup-section retirement + header-Section rework: ~37/40.
    components.push(
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 },
        ...(!entitled ? [{ type: 2, custom_id: 'premium_get', label: 'Get Premium', style: 3, emoji: { name: '⭐' } }] : []),
        { type: 2, custom_id: 'prod_donate', label: 'Donate', style: 2, emoji: { name: '☕' } }
      ] }
    );

    if (!entitled) lockPremiumComponents(components);

    return {
      type: 17,
      accent_color: menuConfig.accent || 0x3498DB,
      components
    };
  }

  /**
   * ⭐ The Premium upsell/paywall screen — served by premium_get and every
   * premium_locked_* click. LEAN: computed entitlement state, numbered path to
   * purchase, Ko-fi link button. Redemption is a stub for now (see buildPremiumRedeemStub).
   * @param {Object} context - { guildId, userId }
   * @param {boolean} fromLock - true when the user clicked a locked feature button
   */
  static buildPremiumUpsell(context, fromLock = false) {
    // Computed fact, not a disclaimer (LeanUserInterfaceDesign): name THIS server's state.
    const ent = context?.guildId ? getGuildEntitlement(context.guildId) : { exists: false };
    const ts = ent.exists ? ent.tierState : null;
    let stateLine = `**This server doesn't have CastBot Premium yet.**`;
    if (ts?.state === 'lapsed') stateLine = `**This server's premium lapsed <t:${Math.floor(ts.graceUntil / 1000)}:R>** — renew to pick up where you left off.`;
    else if (ts?.state === 'grace') stateLine = `**This server's premium expired <t:${Math.floor(ts.validUntil / 1000)}:R>** — still working during grace, renew to keep it.`;
    else if (ts?.state === 'active') stateLine = `**This server has CastBot Premium** ${ts.permanent ? '(permanent)' : `until <t:${Math.floor(ts.validUntil / 1000)}:D>`}.`;

    const components = [
      { type: 10, content: `## ⭐ CastBot Premium` },
      { type: 14 },
      {
        type: 10,
        content: `${fromLock ? `-# 🔒 That's a Premium feature.\n` : ''}${stateLine}\n\n` +
          `**CastBot Premium** unlocks the full host toolkit for this server:\n` +
          `• 👾 **Ask CastBot** — ChatGPT-style help that can bulk-build Safari content for you\n` +
          `• 🧹 **Bulk tools** — channel archiving, cleanup, category messaging\n` +
          `• 🦁 **Safari power ops** — attributes, enemies, import/export\n` +
          `• 🚀 **Early access** to new features as they land`
      },
      {
        type: 10,
        content: `**How to get it**\n` +
          `1. Join the **CastBot Premium** membership at [ko-fi.com/CastBot](https://ko-fi.com/CastBot)\n` +
          `2. Come back here and tap **🎟️ Redeem** to link your subscription\n` +
          `3. Premium activates for this server — features unlock instantly\n` +
          `-# One subscription covers one server, and you can move it when a new season means a new server.`
      },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'premium_back', label: '← Premium', style: 2 },
        { type: 2, custom_id: 'premium_redeem_stub', label: 'Redeem', style: 3, emoji: { name: '🎟️' } },
        { type: 2, style: 5, label: 'ko-fi.com/CastBot', url: 'https://ko-fi.com/CastBot', emoji: { name: '☕' } }
      ] }
    ];
    return { type: 17, accent_color: 0xf39c12, components };
  }

  /** 🎟️ Redeem — honest placeholder until the self-service linking flow ships. */
  static buildPremiumRedeemStub() {
    return {
      type: 17,
      accent_color: 0xf39c12,
      components: [
        { type: 10, content: `## 🎟️ Redeem Premium` },
        { type: 14 },
        {
          type: 10,
          content: `Self-service redemption is nearly ready. Right now, premium is activated for you:\n` +
            `1. Subscribe at [ko-fi.com/CastBot](https://ko-fi.com/CastBot) (if you haven't yet)\n` +
            `2. Your subscription is picked up automatically and activated within a few hours\n` +
            `3. Need it sooner — or want it on a different server? Ask in the [CastBot server](https://discord.gg/H7MpJEjkwT)\n` +
            `-# Soon this button will link your subscription and activate instantly, right here.`
        },
        { type: 14 },
        { type: 1, components: [
          { type: 2, custom_id: 'premium_get', label: '← Back', style: 2 },
          { type: 2, style: 5, label: 'ko-fi.com/CastBot', url: 'https://ko-fi.com/CastBot', emoji: { name: '☕' } }
        ] }
      ]
    };
  }

  /**
   * Build Reece's Stuff menu — secret admin tools
   */
  static buildReecesStuffMenu(menuConfig, context) {
    const envLabel = process.env.INSTANCE_ROLE === 'test' ? 'Test' : process.env.NODE_ENV === 'production' ? 'Prod' : 'Dev';
    // ⚠️ WATCH DISCORD'S 40-COMPONENT CEILING — this menu hit 41 when Deploy Prod landed
    // (2026-08-08); the same day's PoC purge (Menu/Msg Test/Carlbot/Radio) brought it back
    // to 36. Verify with countComponents([menu]) before adding anything.
    const components = [
      { type: 10, content: `## ${menuConfig.title}` },
      { type: 10, content: `### \`\`\`🦠 Experimental\`\`\`` },
      // Post Moai sits next to Moai (same family — both drive Claude).
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'moai_ask', label: 'Moai', style: 2, emoji: { name: '🗿' } },
          { type: 2, custom_id: 'moai_post', label: 'Post Moai', style: 1, emoji: { name: '🗿' } },
          { type: 2, custom_id: 'pcard_open', label: 'Player Card', style: 2, emoji: { name: '🪪' } }
          // Entitlements moved to the CastBot Premium menu → Utilities (2026-08-08, Reece-only)
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
          { type: 2, custom_id: 'restart_prod', label: 'Restart Prod', style: 4, emoji: { name: '🔁' } },
          { type: 2, custom_id: 'deploy_prod', label: 'Deploy Prod', style: 4, emoji: { name: '🚀' } }
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
          { type: 2, custom_id: 'prod_toggle_live_analytics', label: 'CastBot Logs', style: 2, emoji: getBotEmoji('castbot_logo') }
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
