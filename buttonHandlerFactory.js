import {
  InteractionResponseType,
  InteractionResponseFlags,
} from 'discord-interactions';
import { PermissionFlagsBits } from 'discord.js';
import { DiscordRequest } from './utils.js';

/**
 * Button Handler Factory System
 * 
 * Reduces code duplication by providing a factory pattern for button handlers.
 * Handles common patterns like context extraction, permission checking, error handling.
 * 
 * Features:
 * - Button Registry for easy identification by label/description
 * - Menu Factory for reusable menu patterns
 * - Natural language interface for Claude Code
 */

/**
 * Button Registry - Central repository of all button definitions
 * Enables natural language identification of buttons and menus
 */
export const BUTTON_REGISTRY = {
  // === DATA ADMIN MENU ===
  'data_admin': {
    label: 'Data',
    description: 'Data and admin dashboard (Reece-only)',
    emoji: '🧮',
    style: 'Danger',
    menu: 'data_admin',
    parent: 'castbot_tools',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  
  // Analytics Row 1
  'refresh_tips': {
    label: 'Refresh Tips',
    description: 'Upload all tips images to Discord CDN for current environment',
    emoji: '💡',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'playerdata_export_all': {
    label: 'All playerData',
    description: 'Export entire playerData.json across all servers',
    emoji: '💿',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'playerdata_export': {
    label: 'Server playerData',
    description: 'Export playerData for current guild only',
    emoji: '💿',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'safaricontent_export_all': {
    label: 'All safariContent',
    description: 'Export entire safariContent.json across all servers',
    emoji: '💿',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'playerdata_import': {
    label: 'Import Server',
    description: 'Import playerData from a file for current guild',
    emoji: '📥',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'playerdata_import_cancel': {
    label: 'Cancel Import',
    description: 'Cancel an in-progress playerData import',
    emoji: '❌',
    style: 'Danger',
    parent: 'playerdata_import',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'reeces_season_planner_mockup': {
    label: 'Season Planner',
    description: 'Season Planner — plan rounds, swaps, merge, FTC for a season',
    emoji: '📝',
    style: 'Primary',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_select_season': {
    label: 'Season Select',
    description: 'Select a season to plan or create new',
    emoji: '📅',
    style: 'String Select',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_page_*': {
    label: 'Planner Page',
    description: 'Pagination for Season Planner rounds view',
    emoji: '📄',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_round_*': {
    label: 'Round Select',
    description: 'Select a round action in Season Planner',
    emoji: '📝',
    style: 'String Select',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  // === CHALLENGES ===
  'challenge_screen': {
    label: 'Challenges',
    description: 'Challenge management screen',
    emoji: '🏃',
    style: 'Secondary',
    parent: 'castbot_tools',
    category: 'challenges'
  },
  'challenge_select': {
    label: 'Challenge Select',
    description: 'Select or create a challenge',
    emoji: '🏃',
    style: 'String Select',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  'challenge_edit_*': {
    label: 'Edit Challenge',
    description: 'Edit challenge details',
    emoji: '✏️',
    style: 'Secondary',
    parent: 'challenge_screen',
    requiresModal: true,
    category: 'challenges'
  },
  'challenge_post_*': {
    label: 'Post to Channel',
    description: 'Post challenge card as a public message',
    emoji: '📤',
    style: 'Primary',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  'challenge_delete_*': {
    label: 'Delete Challenge',
    description: 'Delete a challenge',
    emoji: '🗑️',
    style: 'Danger',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  'challenge_delete_confirm_*': {
    label: 'Confirm Delete',
    description: 'Confirm challenge deletion',
    emoji: '🗑️',
    style: 'Danger',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  'challenge_round_*': {
    label: 'Round',
    description: 'Link challenge to a season round',
    emoji: '🔥',
    style: 'Secondary',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  'challenge_round_select_*': {
    label: 'Round Select',
    description: 'Select a round to link challenge to',
    emoji: '🔥',
    style: 'String Select',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  'challenge_round_search_*': {
    label: 'Search Rounds',
    description: 'Search rounds by name, season, or F-number',
    emoji: '🔍',
    style: 'Secondary',
    parent: 'challenge_screen',
    requiresModal: true,
    category: 'challenges'
  },
  'challenge_select_nav_*': {
    label: 'Back',
    description: 'Return to challenge detail from round selector',
    emoji: '←',
    style: 'Secondary',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  // === CHALLENGE LIBRARY ===
  'library_home': {
    label: 'Challenge Library',
    description: 'Community challenge library — browse and share',
    emoji: '📚',
    style: 'Secondary',
    parent: 'challenge_screen',
    category: 'challenges'
  },
  'library_select': {
    label: 'Library Browse',
    description: 'Browse library challenges',
    emoji: '📚',
    style: 'String Select',
    parent: 'library_home',
    category: 'challenges'
  },
  'library_search_btn': {
    label: 'Search Library',
    description: 'Search the challenge library',
    emoji: '🔍',
    style: 'Primary',
    parent: 'library_home',
    requiresModal: true,
    category: 'challenges'
  },
  'library_rate_*': {
    label: 'Rate',
    description: 'Rate a library challenge',
    emoji: '⭐',
    style: 'Secondary',
    parent: 'library_home',
    category: 'challenges'
  },
  'library_import_*': {
    label: 'Import',
    description: 'Import a library challenge to your server',
    emoji: '📥',
    style: 'Success',
    parent: 'library_home',
    category: 'challenges'
  },
  'library_unpublish_*': {
    label: 'Unpublish',
    description: 'Remove your challenge from the library',
    emoji: '🗑️',
    style: 'Danger',
    parent: 'library_home',
    category: 'challenges'
  },
  'challenge_publish_*': {
    label: 'Publish',
    description: 'Publish challenge to community library',
    emoji: '📤',
    style: 'Secondary',
    parent: 'challenge_screen',
    requiresModal: true,
    category: 'challenges'
  },
  'planner_ideas_*': {
    label: 'Ideas',
    description: 'Edit free-form season ideas and brainstorming notes',
    emoji: '💡',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    requiresModal: true,
    category: 'experimental'
  },
  'planner_edit_*': {
    label: 'Edit Season',
    description: 'Edit season details in Season Planner',
    emoji: '✏️',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    requiresModal: true,
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_force_setup_*': {
    label: 'Set Up Planner',
    description: 'Set up planner data for existing season',
    emoji: '📅',
    style: 'Primary',
    parent: 'reeces_season_planner_mockup',
    requiresModal: true,
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_schedule_*': {
    label: 'Schedule',
    description: 'Post schedule timeline image to channel',
    emoji: '📋',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_calendar_*': {
    label: 'Calendar',
    description: 'Post calendar image to channel',
    emoji: '📅',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_apps_*': {
    label: 'Apps',
    description: 'Season applications (not yet implemented)',
    emoji: '📝',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'planner_tribes_*': {
    label: 'Tribes',
    description: 'Tribe management (not yet implemented)',
    emoji: '🔥',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'stress_page_*': {
    label: 'Legacy Planner Page',
    description: 'Legacy mockup pagination — redirects to planner selector',
    emoji: '📄',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'legacy'
  },
  'stress_select_*': {
    label: 'Legacy Planner Select',
    description: 'Legacy mockup select — redirects to planner selector',
    emoji: '📝',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'legacy'
  },
  'stress_edit_season': {
    label: 'Legacy Edit Season',
    description: 'Legacy mockup edit — redirects to planner selector',
    emoji: '✏️',
    style: 'Secondary',
    parent: 'reeces_season_planner_mockup',
    restrictedUser: '391415444084490240',
    category: 'legacy'
  },
  'file_import_safari': {
    label: 'Import Safari',
    description: 'Import Safari data via File Upload modal (Type 19) — no MessageContent intent needed',
    emoji: '🦁',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    requiresModal: true,
    category: 'admin'
  },
  'file_import_seasonquestions': {
    label: 'Import Questions',
    description: 'Import season application questions from exported JSON file',
    emoji: '📝',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    requiresModal: true,
    category: 'admin'
  },
  'file_export_seasonquestions': {
    label: 'Export Questions',
    description: 'Export all season application questions as JSON file for reuse',
    emoji: '📝',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'season_export_questions_*': {
    label: 'Export Questions',
    description: 'Export questions from a single season config as flat JSON',
    emoji: '📤',
    style: 'Secondary',
    category: 'seasons'
  },
  'season_import_questions_*': {
    label: 'Import Questions',
    description: 'Import questions into a single season config via File Upload modal',
    emoji: '📥',
    style: 'Secondary',
    requiresModal: true,
    category: 'seasons'
  },
  'question_special_player_setup_*': {
    label: 'Player Setup',
    description: 'Special question component: Pronouns, Timezone, Age (no-op placeholder)',
    emoji: '💜',
    style: 'Secondary',
    category: 'seasons'
  },
  'question_completion_select_*': {
    label: 'App Completed Message',
    description: 'Edit the completion message shown when an application is submitted',
    emoji: '🏁',
    style: 'Secondary',
    requiresModal: true,
    category: 'seasons'
  },
  'app_dnc_add_*': {
    label: 'Add DNC Entry',
    description: 'Opens modal to add a new person to the Do Not Cast list',
    emoji: '➕',
    style: 'Secondary',
    requiresModal: true,
    category: 'seasons'
  },
  'app_dnc_select_*': {
    label: 'DNC Entry Select',
    description: 'Per-entry select with Edit and Delete options for DNC list entries',
    emoji: '🚷',
    style: 'Primary',
    category: 'seasons'
  },
  'apply_*': {
    label: 'Apply',
    description: 'Season application — creates private channel for applicant to answer questions',
    emoji: '📝',
    style: 'Primary',
    category: 'seasons'
  },
  'reeces_radio_mockup': {
    label: 'Radio PoC (Mockup)',
    description: 'UI mockup: Radio Group (Type 21) in modal with 10 options. Not a real feature.',
    emoji: '📻',
    style: 'Primary',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240',
    requiresModal: true,
    category: 'legacy'
  },
  'safari_guide_*': {
    label: 'Guide',
    description: 'Paginated player-friendly Safari guide (stamina, items, regen)',
    emoji: '🦁',
    style: 'Secondary',
    parent: 'prod_player_menu',
    category: 'player_management'
  },
  'stamina_guide_*': {
    label: 'Stamina Guide',
    description: 'Paginated stamina guide (legacy entry from Reece\'s Stuff)',
    emoji: '⚡',
    style: 'Primary',
    parent: 'reeces_stuff',
    category: 'experimental'
  },
  'safari_config_group_*': {
    label: 'Config Group',
    description: 'Safari settings field group modal (Currency, Events, Rounds)',
    emoji: '⚙️',
    style: 'Secondary',
    parent: 'castbot_settings',
    category: 'safari',
    requiresModal: true
  },
  'prod_guide_*': {
    label: 'Guide',
    description: 'Host-facing production guide (stamina config, logging, admin tools)',
    emoji: '🦁',
    style: 'Secondary',
    parent: 'castbot_settings',
    category: 'safari'
  },
  'richcard_demo': {
    label: 'Rich Card',
    description: 'Rich Card UI reference implementation demo',
    emoji: '🎴',
    style: 'Primary',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'richcard_demo_edit': {
    label: 'Edit Card',
    description: 'Edit rich card demo via modal',
    emoji: '✏️',
    style: 'Primary',
    parent: 'richcard_demo',
    restrictedUser: '391415444084490240',
    requiresModal: true,
    category: 'experimental'
  },
  'richcard_demo_select': {
    label: 'Demo Select',
    description: 'Demo string select showing extraComponents pattern',
    emoji: '📋',
    style: 'Secondary',
    parent: 'richcard_demo',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'richcard_demo_delete': {
    label: 'Delete',
    description: 'Demo delete confirmation following LEAN deletion standard',
    emoji: '🗑️',
    style: 'Danger',
    parent: 'richcard_demo',
    restrictedUser: '391415444084490240',
    category: 'experimental'
  },
  'prod_live_analytics': {
    label: 'Print Logs',
    description: 'Display recent analytics logs from local file',
    emoji: '⚠️',
    style: 'Secondary',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'prod_server_usage_stats': {
    label: 'Server Stats',
    description: 'Display server usage statistics',
    emoji: '📈',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'prod_ultrathink_monitor': {
    label: 'Ultramonitor',
    description: 'Real-time production health monitoring dashboard',
    emoji: '🌈',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'health_monitor_schedule': {
    label: 'Schedule',
    description: 'Schedule automated health monitoring',
    emoji: '📅',
    style: 'Secondary',
    parent: 'prod_ultrathink_monitor',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },

  // Legacy (in Reece's Stuff)
  'prod_toggle_live_analytics': {
    label: 'Toggle Logs',
    description: 'Toggle live analytics logging for current channel',
    emoji: '🔃',
    style: 'Secondary',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'prod_nuke_category': {
    label: 'Nuke Category',
    description: 'Select and delete all channels in a Discord category',
    emoji: '🧹',
    style: 'Danger',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_cat_select': {
    label: 'Category Select',
    description: 'Select a category to delete all channels from',
    emoji: '🧹',
    style: 'Secondary',
    parent: 'prod_nuke_category',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_cat_confirm_*': {
    label: 'Confirm Category Nuke',
    description: 'Confirm deletion of all channels in selected category',
    emoji: '🗑️',
    style: 'Danger',
    parent: 'prod_nuke_category',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_cat_cancel': {
    label: 'Cancel Category Nuke',
    description: 'Cancel category deletion',
    emoji: '❌',
    style: 'Secondary',
    parent: 'prod_nuke_category',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'restart_bot': {
    label: 'Restart Bot',
    description: 'Restart CastBot process (PM2 auto-restarts in prod)',
    emoji: '🔄',
    style: 'Danger',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'restart_bot_confirm': {
    label: 'Confirm Restart',
    description: 'Confirm bot restart — process.exit(0) with PM2 recovery',
    emoji: '🔄',
    style: 'Danger',
    parent: 'restart_bot',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'test_role_hierarchy': {
    label: 'Check Roles',
    description: 'Test and display role hierarchy information',
    emoji: '🔰',
    style: 'Secondary',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240',
    category: 'testing'
  },
  'admin_dst_toggle': {
    label: 'DST Manager',
    description: 'Manage Daylight Saving Time states for timezones',
    emoji: '🌍',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'dst_timezone_select': {
    label: 'DST Timezone Select',
    description: 'Select timezone to toggle DST state',
    emoji: '🌍',
    style: 'String Select',
    parent: 'admin_dst_toggle',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  // merge_timezone_roles removed — superseded by setup_castbot
  'prod_all_servers': {
    label: 'All Servers',
    description: 'List all servers the bot is installed in with details',
    emoji: '🌐',
    style: 'Secondary',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'all_servers_page_*': {
    label: 'Server List Page',
    description: 'Paginate through the full server list',
    emoji: '🌐',
    style: 'Secondary',
    parent: 'prod_all_servers',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'all_servers_sort': {
    label: 'Sort Servers',
    description: 'Change sort order of server list',
    emoji: '🔀',
    style: 'Secondary',
    parent: 'prod_all_servers',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'all_servers_nav': {
    label: 'Page Navigation',
    description: 'Navigate between server list pages',
    emoji: '📄',
    style: 'Secondary',
    parent: 'prod_all_servers',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'all_servers_refresh_*': {
    label: 'Refresh Server List',
    description: 'Refresh the server list data',
    emoji: '🔄',
    style: 'Secondary',
    parent: 'prod_all_servers',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'nuke_roles': {
    label: 'Nuke Roles',
    description: 'Remove all roles from server (DANGEROUS)',
    emoji: '💥',
    style: 'Danger',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'emergency_app_reinit': {
    label: 'Emergency Re-Init',
    description: 'Emergency re-initialization of season applications',
    emoji: '🚨',
    style: 'Danger',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'emergency'
  },
  'nuke_player_data': {
    label: 'Nuke playerData',
    description: 'Clear all guild data from playerData.json (DANGER ZONE)',
    emoji: '☢️',
    style: 'Danger',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_player_data_confirm': {
    label: 'Yes, Nuke All Data',
    description: 'Confirm complete data wipe for this guild',
    emoji: '⚠️',
    style: 'Danger',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_player_data_cancel': {
    label: 'Cancel',
    description: 'Cancel data nuke operation',
    emoji: '❌',
    style: 'Secondary',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_safari_content': {
    label: 'Nuke safariContent',
    description: 'Clear all guild Safari data from safariContent.json (DANGER ZONE)',
    emoji: '☢️',
    style: 'Danger',
    parent: 'data_admin',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_safari_content_confirm': {
    label: 'Yes, Nuke All Safari Data',
    description: 'Confirm complete Safari data wipe for this guild',
    emoji: '⚠️',
    style: 'Danger',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'nuke_safari_content_cancel': {
    label: 'Cancel Safari Nuke',
    description: 'Cancel Safari data nuke operation',
    emoji: '❌',
    style: 'Secondary',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'msg_test': {
    label: 'Msg Test',
    description: 'Test sending a message from CastBot to user',
    emoji: '💬',
    style: 'Secondary',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'prod_setup_wizard': {
    label: 'Setup Wizard',
    description: 'Show CastBot features and setup help (ephemeral) - shares UI with msg_test DM delivery',
    emoji: '🧙',
    style: 'Primary',
    parent: 'castbot_tools',
    category: 'admin'
  },
  'dm_poc_button': {
    label: 'Click Me!',
    description: 'PoC button inside DM demonstrating UPDATE_MESSAGE with Components V2',
    emoji: '👋',
    style: 'Success',
    category: 'testing'
  },
  'dm_view_tips': {
    label: 'New Features',
    description: 'View new Castlist Manager features (Alumni lists, swaps, etc)',
    emoji: '✨',
    style: 'Secondary',
    category: 'features'
  },
  'tips_next_*': {
    label: 'Next ▶',
    description: 'Navigate to next screenshot in tips gallery',
    style: 'Secondary',
    category: 'navigation'
  },
  'tips_prev_*': {
    label: '◀ Previous',
    description: 'Navigate to previous screenshot in tips gallery',
    style: 'Secondary',
    category: 'navigation'
  },
  'edit_tip_*': {
    label: 'Edit',
    description: 'Edit tips gallery content (admin only)',
    emoji: '✏️',
    style: 'Success',
    category: 'tips_management',
    parent: 'dm_view_tips'
  },
  'share_tip_*': {
    label: 'Share',
    description: 'Share tip to channel as non-ephemeral message',
    emoji: '🔁',
    style: 'Primary',
    category: 'tips_management',
    parent: 'dm_view_tips'
  },
  'tips_shared_prev_*': {
    label: '◀ Previous',
    description: 'Navigate to previous tip in shared (non-ephemeral) gallery',
    style: 'Primary',
    category: 'navigation'
  },
  'tips_shared_next_*': {
    label: 'Next ▶',
    description: 'Navigate to next tip in shared (non-ephemeral) gallery',
    style: 'Primary',
    category: 'navigation'
  },
  'dm_back_to_welcome': {
    label: '← Back to Welcome',
    description: 'Return to welcome screen from tips gallery',
    style: 'Secondary',
    category: 'navigation'
  },
  'compact_castlist_*': {
    label: 'Compact Castlist',
    description: 'Generate castlist as PNG image using Sharp',
    emoji: '🍒',
    style: 'Secondary',
    category: 'castlist',
    parent: 'castlist_hub_main'
  },

  'show_castlist2_*': {
    label: 'Show Castlist',
    description: 'Display castlist with tribes and player cards',
    emoji: '📋',
    style: 'Primary',
    category: 'castlist',
    parent: 'viral_menu'
  },
  'castlist2_nav_*': {
    label: 'Castlist Navigation',
    description: 'Navigate between tribes and pages in castlist display',
    emoji: '🧭',
    style: 'Secondary',
    category: 'castlist',
    parent: 'show_castlist2'
  },

  // Navigation
  'prod_menu_back': {
    label: '← Menu',
    description: 'Return to main production menu',
    style: 'Secondary',
    category: 'navigation'
  },
  'prod_production_menu': {
    label: '← Back',
    description: 'Return to main production menu (from Settings)',
    style: 'Secondary',
    category: 'navigation'
  },

  // === GENERAL NAVIGATION ===
  'viral_menu': {
    label: '📋 Open Prod Menu',
    description: 'Quick access to production menu from restart notifications',
    emoji: '📋',
    style: 'Primary',
    category: 'navigation'
  },
  'prod_player_menu': {
    label: 'Player Menu',
    description: 'View player menu experience (admin preview)',
    emoji: '🪪',
    style: 'Secondary',
    category: 'navigation',
    parent: 'menu'
  },

  // === CASTLIST V3 ===
  // Note: castlist_create_new_button removed - select menu now directly shows modal

  // === PRODUCTION SETUP ===
  'castbot_tools': {
    label: 'Tools',
    description: 'CastBot Tools menu — setup, roles, emojis, and admin',
    emoji: '🪛',
    style: 'Primary',
    category: 'admin',
    menu: 'setup_menu'
  },
  'setup_castbot': {
    label: 'Run Setup',
    description: 'Execute initial CastBot setup - creates pronoun and timezone roles',
    emoji: '🪛',
    style: 'Primary',
    category: 'admin',
    parent: 'castbot_tools'
  },
  'prod_terms_of_service': {
    label: 'Terms of Service',
    description: 'View CastBot Terms of Service',
    emoji: '📜',
    style: 'Secondary',
    category: 'legal',
    parent: 'castbot_tools'
  },
  'prod_privacy_policy': {
    label: 'Privacy Policy',
    description: 'View CastBot Privacy Policy',
    emoji: '🔒',
    style: 'Secondary',
    category: 'legal',
    parent: 'castbot_tools'
  },

  // === ATTRIBUTE SYSTEM ===
  'attribute_management': {
    label: 'Attributes',
    description: 'Manage custom attributes like HP, Mana, Strength for Safari',
    emoji: '📊',
    style: 'Secondary',
    category: 'attributes',
    parent: 'castbot_tools'
  },
  'attr_add_custom': {
    label: 'Add Attribute',
    description: 'Create a new custom attribute',
    emoji: '➕',
    style: 'Primary',
    category: 'attributes',
    parent: 'attribute_management'
  },
  'attr_enable_preset': {
    label: 'Enable Preset',
    description: 'Enable a built-in attribute preset like Mana or HP',
    emoji: '⚡',
    style: 'Secondary',
    category: 'attributes',
    parent: 'attribute_management'
  },
  'attr_preset_select': {
    label: 'Preset Select',
    description: 'Select menu for choosing attribute presets',
    emoji: '📋',
    style: 'Secondary',
    category: 'attributes',
    parent: 'attribute_management'
  },
  'attr_manage_existing': {
    label: 'Edit/Delete',
    description: 'Edit or delete existing attributes',
    emoji: '✏️',
    style: 'Secondary',
    category: 'attributes',
    parent: 'attribute_management'
  },
  'attr_edit_select': {
    label: 'Attribute Select',
    description: 'Select menu for choosing attribute to edit/delete',
    emoji: '📋',
    style: 'Secondary',
    category: 'attributes',
    parent: 'attr_manage_existing'
  },
  'attr_edit_*': {
    label: 'Edit Attribute',
    description: 'Open modal to edit a specific attribute (wildcard pattern)',
    emoji: '✏️',
    style: 'Primary',
    category: 'attributes',
    requiresModal: true,
    parent: 'attr_manage_existing'
  },
  'attr_delete_*': {
    label: 'Delete Attribute',
    description: 'Delete a specific attribute (wildcard pattern)',
    emoji: '🗑️',
    style: 'Danger',
    category: 'attributes',
    parent: 'attr_manage_existing'
  },
  'admin_set_attributes_*': {
    label: 'Stats',
    description: 'Modify player attributes in Player Admin',
    emoji: '📊',
    style: 'Secondary',
    category: 'attributes',
    parent: 'prod_player_admin'
  },
  'admin_integrated_attributes_*': {
    label: 'Attribute Select',
    description: 'Select which attribute to modify for a player',
    emoji: '📊',
    style: 'Secondary',
    category: 'attributes',
    parent: 'admin_set_attributes_*'
  },

  // === EMOJI MANAGEMENT ===
  'prod_create_emojis': {
    label: 'Player Emojis',
    description: 'Auto-create or remove player emojis from role members',
    emoji: '😀',
    style: 'Secondary',
    category: 'admin',
    parent: 'castbot_tools'
  },
  'prod_emoji_role_select': {
    label: 'Emoji Role Select',
    description: 'Select a role to generate or clear emojis for',
    emoji: '🎭',
    style: 'Secondary',
    category: 'admin',
    type: 'select_menu',
    parent: 'prod_create_emojis'
  },

  // === REECE'S STUFF (SECRET ADMIN) ===
  'reeces_stuff': {
    label: "Reece's Stuff",
    description: 'Secret admin tools menu (Reece-only)',
    emoji: '🐧',
    style: 'Danger',
    category: 'admin',
    parent: 'castbot_tools',
    restrictedUser: '391415444084490240'
  },
  'becs_cool_cats': {
    label: "Bec's Button",
    description: "Bec's Cool Area — shows a random cat picture",
    emoji: '🐱',
    style: 'Primary',
    category: 'experimental',
    parent: 'reeces_stuff'
  },

  // === PLAYER CARD ===
  'pcard_*': {
    label: 'Player Card',
    description: 'Player Card menu and interactions',
    emoji: '🪪',
    style: 'Secondary',
    category: 'admin',
    parent: 'reeces_stuff'
  },

  // === TRIBES (LEGACY) ===
  'prod_manage_tribes_legacy_debug': {
    label: 'Tribes (Legacy)',
    description: 'Access legacy tribes management submenu',
    emoji: '🔥',
    style: 'Secondary',
    category: 'admin',
    parent: 'reeces_stuff',
    restrictedUser: '391415444084490240'
  },

  // === REACTION ROLES MANAGEMENT ===
  'prod_manage_pronouns_timezones': {
    label: 'Reaction Roles',
    description: 'Manage server reaction roles (pronouns, timezones, ban traps)',
    emoji: '🎯',
    style: 'Secondary',
    category: 'production_admin',
    parent: 'castbot_tools'
  },
  'prod_view_timezones': {
    label: 'View Timezones',
    description: 'Display all configured timezone roles with UTC offsets',
    emoji: '🌍',
    style: 'Secondary',
    category: 'reaction_roles',
    parent: 'prod_manage_pronouns_timezones'
  },
  'prod_edit_timezones': {
    label: 'Bulk Modify',
    description: 'Add/remove timezone roles without setting UTC offsets',
    emoji: '⏲️',
    style: 'Secondary',
    category: 'reaction_roles',
    parent: 'prod_manage_pronouns_timezones'
  },
  'prod_add_timezone': {
    label: 'Custom Timezone',
    description: 'Add timezone role with UTC offset configuration',
    emoji: '🗺️',
    style: 'Secondary',
    category: 'reaction_roles',
    parent: 'prod_manage_pronouns_timezones'
  },
  'prod_view_pronouns': {
    label: 'View Pronouns',
    description: 'Display all configured pronoun roles',
    emoji: '💜',
    style: 'Secondary',
    category: 'reaction_roles',
    parent: 'prod_manage_pronouns_timezones'
  },
  'prod_edit_pronouns': {
    label: 'Edit Pronouns',
    description: 'Add/remove pronoun roles for server',
    emoji: '💙',
    style: 'Secondary',
    category: 'reaction_roles',
    parent: 'prod_manage_pronouns_timezones'
  },
  'prod_ban_react': {
    label: 'Bans',
    description: 'Post a honeypot reaction message that auto-bans bots who react',
    emoji: '🎯',
    style: 'Secondary',
    category: 'reaction_roles',
    parent: 'prod_manage_pronouns_timezones'
  },

  // === CUSTOM REACTS ===
  'cr_list': {
    label: 'Custom Reacts',
    description: 'View and manage custom reaction role panels',
    emoji: '🧩',
    style: 'Secondary',
    category: 'reaction_roles',
    parent: 'prod_manage_pronouns_timezones'
  },
  'cr_add_panel': {
    label: 'Create New Panel',
    description: 'Create a new custom reaction role panel',
    emoji: '➕',
    style: 'Secondary',
    category: 'custom_reacts',
    parent: 'cr_list'
  },
  'cr_panel_select_*': {
    label: 'Panel Action',
    description: 'Select action for a custom react panel (edit, post, delete)',
    emoji: '🧩',
    style: 'Secondary',
    category: 'custom_reacts',
    parent: 'cr_list'
  },
  'cr_delete_confirm_*': {
    label: 'Confirm Delete',
    description: 'Confirm deletion of a custom react panel',
    emoji: '🗑️',
    style: 'Danger',
    category: 'custom_reacts',
    parent: 'cr_list'
  },
  'cr_detail_page_*': {
    label: 'Panel Detail',
    description: 'View/paginate custom react panel details',
    emoji: '🧩',
    style: 'Secondary',
    category: 'custom_reacts',
    parent: 'cr_list'
  },
  'cr_mapping_select_*': {
    label: 'Mapping Action',
    description: 'Select action for a reaction role mapping (edit, move, remove)',
    emoji: '🎯',
    style: 'Secondary',
    category: 'custom_reacts',
    parent: 'cr_list'
  },
  'cr_add_mapping_*': {
    label: 'Add Reaction Role',
    description: 'Add a reaction role to a custom react panel',
    emoji: '➕',
    style: 'Secondary',
    category: 'custom_reacts',
    parent: 'cr_list'
  },
  'cr_role_select_*': {
    label: 'Select Role',
    description: 'Select a Discord role to add as a reaction role',
    emoji: '🏷️',
    style: 'Secondary',
    category: 'custom_reacts',
    parent: 'cr_list',
    requiresModal: true
  },
  'cr_confirm_dangerous_*': {
    label: 'Confirm Dangerous Role',
    description: 'Confirm adding a role with elevated permissions',
    emoji: '⚠️',
    style: 'Danger',
    category: 'custom_reacts',
    parent: 'cr_list',
    requiresModal: true
  },
  'cr_post_channel_*': {
    label: 'Post to Channel',
    description: 'Select channel to post a custom react panel',
    emoji: '📨',
    style: 'Primary',
    category: 'custom_reacts',
    parent: 'cr_list'
  },
  'cr_channel_select_*': {
    label: 'Channel Select',
    description: 'Channel selected for posting a custom react panel',
    emoji: '📨',
    style: 'Secondary',
    category: 'custom_reacts',
    parent: 'cr_list'
  },

  // === TRIBE MANAGEMENT ===
  'prod_view_tribes': {
    label: 'View Tribes',
    description: 'Display all tribes organized by castlist',
    emoji: '🔥',
    style: 'Primary',
    category: 'tribe_management',
    parent: 'prod_manage_tribes_legacy_debug'
  },
  'prod_add_tribe': {
    label: 'Add Tribe',
    description: 'Add a new tribe to the server',
    emoji: '🛠️',
    style: 'Secondary',
    category: 'tribe_management',
    parent: 'prod_manage_tribes_legacy_debug'
  },
  'prod_clear_tribe': {
    label: 'Clear Tribe',
    description: 'Clear a tribe from the server',
    emoji: '🧹',
    style: 'Secondary',
    category: 'tribe_management',
    parent: 'prod_manage_tribes_legacy_debug'
  },

  // === RESTART TESTING TRACKER ===
  'restart_test_not_tested': {
    label: '⏳ Not Tested',
    description: 'Mark restart changes as not tested',
    emoji: '⏳',
    style: 'Secondary',
    category: 'testing'
  },
  'restart_test_tested': {
    label: '✅ Tested',
    description: 'Mark restart changes as tested',
    emoji: '✅',
    style: 'Secondary',
    category: 'testing'
  },
  'restart_status_passed': {
    label: '✅ Pass',
    description: 'Toggle deployment test status to passed',
    emoji: '✅',
    style: 'Secondary',
    category: 'testing'
  },
  'restart_status_failed': {
    label: '❌ Fail',
    description: 'Toggle deployment test status to failed',
    emoji: '❌',
    style: 'Secondary',
    category: 'testing'
  },

  // === RANKING SYSTEM ===
  'ranking_scores_refresh': {
    label: 'Refresh',
    description: 'Refresh the View All Scores summary data',
    emoji: '🔄',
    style: 'Secondary', 
    category: 'ranking'
  },
  'ranking_scores_back': {
    label: '← Cast Ranking',
    description: 'Return to Cast Ranking interface',
    emoji: '🏆',
    style: 'Secondary',
    category: 'ranking'
  },
  'personal_ranker': {
    label: '🤸 Personal Ranker',
    description: 'Open ephemeral personal Cast Ranking interface',
    emoji: '🤸',
    style: 'Secondary',
    category: 'ranking'
  },

  // === CASTLIST HUB ===
  'castlist_hub_main': {
    label: 'Castlist Manager',
    description: 'Open the Castlist Management Hub',
    emoji: '📋',
    style: 'Primary',
    category: 'castlist'
  },
  'castlist_hub_main_new': {
    label: 'Castlist Manager',
    description: 'Open the Castlist Management Hub as NEW ephemeral message (from Setup Wizard)',
    emoji: '📋',
    style: 'Secondary',
    parent: 'prod_setup_wizard',
    category: 'castlist'
  },
  'castlist_select': {
    label: 'Select Castlist',
    description: 'Select a castlist to view or manage',
    emoji: '📋',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_view_*': {
    label: 'View',
    description: 'View and post castlist to channel',
    emoji: '👁️',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_edit_info_*': {
    label: 'Edit Info',
    description: 'Edit castlist name and emoji',
    emoji: '✏️',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_placements_*': {
    label: 'Tribes & Placements',
    description: 'Edit player placements in castlist',
    emoji: '🔥',
    style: 'Primary',
    category: 'castlist'
  },
  'castlist_add_tribe_*': {
    label: 'New Tribe',
    description: 'Add or remove tribes from castlist',
    emoji: '🏕️',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_order_*': {
    label: 'Order',
    description: 'Change castlist sort order',
    emoji: '🔄',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_delete_*': {
    label: 'Delete Castlist',
    description: 'Shows confirmation dialog for castlist deletion',
    emoji: '🗑️',
    style: 'Danger',
    category: 'castlist'
  },
  'castlist_delete_confirm_*': {
    label: 'Confirm Delete Castlist',
    description: 'Confirms deletion of a castlist after warning',
    emoji: '🗑️',
    style: 'Danger',
    category: 'castlist'
  },
  'castlist_swap_merge_*': {
    label: 'Swap/Merge Tribes',
    description: 'Create dramatic tribe swap with automatic role assignment and archival',
    emoji: '🔀',
    style: 'Secondary',
    category: 'castlist',
    parent: 'castlist_hub_main'
  },
  'edit_placement_*': {
    label: 'Edit Placement',
    description: 'Edit player season placement (1st, 2nd, etc.)',
    emoji: '✏️',
    style: 'Secondary',
    category: 'castlist'
  },
  'show_castlist2': {
    label: 'Post Castlist',
    description: 'Post castlist to channel',
    emoji: '📋',
    style: 'Success',
    category: 'castlist'
  },
  'castlist_sort_*': {
    label: 'Sort Strategy',
    description: 'Select castlist sort strategy',
    emoji: '🔄',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_tribe_select_*': {
    label: 'Tribe Select',
    description: 'Select tribes for castlist',
    emoji: '🏕️',
    style: 'Secondary',
    category: 'castlist'
  },
  'tribe_edit_button_*': {
    label: 'Edit Tribe',
    description: 'Edit tribe settings and metadata',
    emoji: '✏️',
    style: 'Secondary',
    category: 'castlist',
    requiresModal: true
  },
  'tribe_add_button_*': {
    label: 'Add Tribe',
    description: 'Create a new Discord role and add as tribe to castlist',
    emoji: '🏕️',
    style: 'Secondary',
    category: 'castlist',
    requiresModal: true
  },
  'castlist_create_season': {
    label: 'From Season',
    description: 'Create castlist from season applications',
    emoji: '🎭',
    style: 'Primary',
    category: 'castlist'
  },
  'castlist_create_role': {
    label: 'From Role',
    description: 'Import castlist from Discord role',
    emoji: '👥',
    style: 'Primary',
    category: 'castlist'
  },
  'castlist_create_custom': {
    label: 'Custom',
    description: 'Create a custom castlist',
    emoji: '✨',
    style: 'Primary',
    category: 'castlist'
  },
  'castlist_import': {
    label: 'Import',
    description: 'Import castlist from file',
    emoji: '📥',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_templates': {
    label: 'Templates',
    description: 'Browse castlist templates',
    emoji: '📑',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_export': {
    label: 'Export',
    description: 'Export castlist data',
    emoji: '📤',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_settings': {
    label: 'Settings',
    description: 'Castlist system settings',
    emoji: '⚙️',
    style: 'Secondary',
    category: 'castlist'
  },
  'castlist_migration': {
    label: 'Migrate',
    description: 'Migrate legacy castlists to entities',
    emoji: '🔄',
    style: 'Secondary',
    category: 'castlist'
  },

  // === PRODUCTION MENU ITEMS ===
  'prod_change_season': {
    label: 'Change Szn',
    description: 'Change the active season for the server',
    emoji: '🔃',
    style: 'Secondary',
    category: 'production_menu',
    restrictedUser: '391415444084490240' // Restricted to Reece during development
  },
  
  // === SAFARI MENU SYSTEM ===
  'prod_safari_menu': {
    label: 'Safari',
    description: 'Safari dynamic content management system',
    emoji: '🦁',
    style: 'Primary',
    category: 'safari'
  },

  // Safari Action Management
  'safari_finish_button_*': {
    label: '← Location Manager',
    description: 'Navigate back from action editor to location manager',
    emoji: '📍',
    style: 'Secondary',
    category: 'safari'
  },
  'action_editor_back_*': {
    label: '← Actions',
    description: 'Back button from Action Editor to Action list',
    emoji: '←',
    style: 'Secondary',
    category: 'safari'
  },
  'action_post_channel_*': {
    label: 'Post to Channel',
    description: 'Post action button to a Discord channel from the Action Editor',
    emoji: '#️⃣',
    style: 'Secondary',
    category: 'safari'
  },
  'untrack_channel_*': {
    label: 'Remove Channel',
    description: 'Remove a tracked posted channel from an action',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari'
  },
  'outcome_select_*': {
    label: 'Outcome Actions',
    description: 'String select per outcome — edit, reorder, clone, toggle pass/fail, delete',
    emoji: '▫️',
    style: 'Secondary',
    category: 'safari',
    type: 'select_menu'
  },
  'safari_remove_action_*': {
    label: 'Remove Outcome',
    description: 'Remove an outcome from an action',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari'
  },
  'safari_edit_action_*': {
    label: 'Edit Outcome',
    description: 'Edit an existing outcome in an action',
    emoji: '📝',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_add_action_*': {
    label: 'Add Outcome',
    description: 'Add a new outcome to an action',
    emoji: '➕',
    style: 'Primary',
    category: 'safari'
  },
  'custom_action_up_*': {
    label: 'Move Outcome Up',
    description: 'Move outcome higher in execution order within an action',
    emoji: '⬆️',
    style: 'Secondary',
    category: 'safari'
  },
  
  // Safari Rounds Management
  'safari_rounds_menu': {
    label: 'Rounds',
    description: 'Manage Safari rounds and game progression',
    emoji: '⏳',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_confirm_reset_game': {
    label: 'Confirm Reset',
    description: 'Confirm Safari game data reset',
    emoji: '🔄',
    style: 'Danger',
    category: 'safari'
  },
  
  'safari_configure_rounds': {
    label: 'Configure Rounds',
    description: 'Configure the number of rounds per Safari game',
    emoji: '⚙️',
    style: 'Secondary',
    category: 'safari'
  },
  'map_location_actions': {
    label: 'Location Actions',
    description: 'View and manage actions for a map location',
    emoji: '📍',
    style: 'Primary',
    category: 'safari'
  },
  // Quick Create buttons
  'quick_currency_*': {
    label: 'Quick Currency',
    description: 'Quick-create a give currency action at a location',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari_quick_create',
    requiresModal: true
  },
  'quick_item_*': {
    label: 'Quick Item',
    description: 'Quick-create a give item action at a location',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari_quick_create',
    requiresModal: true
  },
  'safari_location_editor': {
    label: 'Location Editor',
    description: 'Open map location editor interface',
    emoji: '📍',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_action_editor': {
    label: 'Action Editor',
    description: 'Manage actions across all locations',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari'
  },

  // Safari Main Menu Buttons
  'safari_manage_safari_buttons': {
    label: '📌 Manage Safari Buttons',
    description: 'Create, edit, view, and post Safari actions',
    emoji: '📌',
    style: 'Primary',
    category: 'safari'
  },
  'safari_manage_currency': {
    label: 'Currency',
    description: 'Safari currency management - view all, set player currency, reset all',
    emoji: '💰',
    style: 'Secondary',
    parent: 'prod_safari_menu',
    category: 'safari'
  },
  'safari_manage_enemies': {
    label: '👹 Manage Enemies',
    description: 'Safari enemy management - create, edit, manage enemies',
    emoji: '👹',
    style: 'Secondary',
    category: 'safari'
  },
  'entity_turnorder_enemy_*': {
    label: 'Enemy Turn Order',
    description: 'Set enemy turn order for combat',
    emoji: '🔄',
    category: 'safari'
  },
  'safari_fight_enemy_select_*': {
    label: 'Select Enemy',
    description: 'Select enemy for fight outcome',
    emoji: '👹',
    category: 'custom_actions'
  },
  'safari_fight_enemy_execute_on_*': {
    label: 'Fight Execute On',
    description: 'Set when fight enemy outcome executes',
    emoji: '👹',
    category: 'custom_actions'
  },
  'safari_fight_enemy_limit_*': {
    label: 'Fight Usage Limit',
    description: 'Set usage limit for fight enemy outcome',
    emoji: '👹',
    category: 'custom_actions'
  },
  'safari_manage_items': {
    label: '📦 Manage Items',
    description: 'Safari item management - create, edit, manage items',
    emoji: '📦',
    style: 'Primary',
    category: 'safari'
  },
  'safari_store_manage_items': {
    label: 'Manage Store Items',
    description: 'Add/remove items from stores and manage store inventory',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_stores',
    parent: 'prod_safari_menu'
  },
  'safari_all_server_items': {
    label: 'All Items',
    description: 'View all items on this server with prices and details',
    emoji: '📄',
    style: 'Secondary',
    category: 'safari_stores',
    parent: 'prod_safari_menu'
  },
  'safari_store_items_select_back_*': {
    label: 'Back to Store',
    description: 'Return to specific store management interface from All Items view',
    emoji: '🏪',
    style: 'Secondary',
    category: 'safari_stores'
  },
  'safari_store_browse_*': {
    label: 'Browse Store',
    description: 'Browse a global store with paginated items for sale',
    emoji: '🏪',
    style: 'Primary',
    category: 'safari_stores',
    parent: 'safari_player_inventory'
  },
  'safari_store_page_*': {
    label: 'Store Page',
    description: 'Navigate between pages of store items',
    emoji: '📄',
    style: 'Secondary',
    category: 'safari_stores',
    parent: 'safari_store_browse'
  },
  'safari_use_item': {
    label: 'Use Item',
    description: 'Use a consumable item from inventory',
    emoji: '⚡',
    style: 'Success',
    category: 'safari'
  },
  'castbot_settings': {
    label: 'Settings',
    description: 'CastBot settings — currency, stamina, events, rounds, player menu, logs',
    emoji: '⚙️',
    style: 'Primary',
    category: 'settings'
  },
  'castbot_roles_security': {
    label: 'Roles & Security',
    description: 'Configure which roles have full CastBot access',
    emoji: '🔐',
    style: 'Secondary',
    parent: 'castbot_settings',
    category: 'settings'
  },
  'castbot_roles_security_select': {
    label: 'Role Select',
    description: 'Select roles with full CastBot access',
    emoji: '🔐',
    style: 'Secondary',
    parent: 'castbot_roles_security',
    category: 'settings'
  },
  'castbot_roles_security_clear': {
    label: 'Clear All Roles',
    description: 'Remove all additional CastBot access roles',
    emoji: '🗑️',
    style: 'Danger',
    parent: 'castbot_roles_security',
    category: 'settings'
  },
  'safari_configure_log': {
    label: 'Logs',
    description: 'Configure CastBot Logs channel and settings',
    emoji: '🪵',
    style: 'Secondary',
    parent: 'castbot_settings',
    category: 'safari'
  },
  'safari_config_reset_defaults': {
    label: 'Reset',
    description: 'Reset all Safari customizations to default values',
    emoji: '🔄',
    style: 'Danger',
    parent: 'castbot_settings',
    category: 'safari'
  },
  'safari_log_toggle': {
    label: 'Toggle Safari Log',
    description: 'Enable or disable Safari logging',
    emoji: '🔧',
    style: 'Dynamic',
    category: 'safari'
  },
  'safari_log_channel_select': {
    label: 'Set Log Channel',
    description: 'Select a channel for Safari logs',
    emoji: '📝',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_log_channel_set': {
    label: 'Channel Selected',
    description: 'Handle channel selection for Safari logs',
    emoji: '📝',
    style: 'Hidden',
    category: 'safari'
  },
  'safari_log_types_config': {
    label: 'Configure Log Types',
    description: 'Select which types of interactions to log',
    emoji: '⚙️',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_log_types_set': {
    label: 'Types Selected',
    description: 'Handle log type selection',
    emoji: '⚙️',
    style: 'Hidden',
    category: 'safari'
  },
  'safari_log_test': {
    label: 'Send Test Message',
    description: 'Send a test message to Safari Log channel',
    emoji: '🧪',
    style: 'Secondary',
    category: 'safari'
  },
  'stamina_location_config': {
    label: 'Stamina Settings',
    description: 'Per-server stamina configuration (location in Rounds)',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari_admin'
  },
  'safari_player_menu_config': {
    label: 'Player Menu',
    description: 'Configure global command button in player menu',
    emoji: '🕹️',
    style: 'Secondary',
    category: 'safari'
  },
  'player_enter_command_global': {
    label: 'Enter Command',
    description: 'Enter a text command from anywhere (global)',
    emoji: '🕹️',
    style: 'Secondary',
    category: 'safari_player'
  },
  'safari_round_results': {
    label: '🎨 Round Results',
    description: 'Safari round results management',
    emoji: '🎨',
    style: 'Primary',
    category: 'safari'
  },
  'safari_result_ordering': {
    label: 'Result Ordering',
    description: 'Configure ordering of Safari round results by Discord roles',
    emoji: '📊',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_result_ordering_save': {
    label: 'Save Ordering',
    description: 'Save role-based result ordering configuration',
    emoji: '✅',
    style: 'Success',
    category: 'safari'
  },
  'safari_result_ordering_cancel': {
    label: 'Cancel',
    description: 'Cancel result ordering changes',
    emoji: '❌',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_result_ordering_select': {
    label: 'Result Ordering Select',
    description: 'Select roles for result ordering',
    emoji: '📊',
    style: 'Secondary',
    category: 'safari',
    type: 'select_menu'
  },
  'safari_player_status': {
    label: '🏋️ Player Status',
    description: 'Display all player balances grouped by priority roles',
    emoji: '🏋️',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_player_inventory': {
    label: '📦 Player Inventory',
    description: 'Show current user Safari inventory',
    emoji: '📦',
    style: 'Primary',
    category: 'safari'
  },
  'safari_attack_player': {
    label: 'Attack Player',
    description: 'Select target player for attack with attack item',
    emoji: '⚔️',
    style: 'Danger',
    category: 'safari'
  },
  'safari_schedule_attack': {
    label: 'Schedule Attack',
    description: 'Confirm and schedule attack against target player for next round',
    emoji: '⚔️',
    style: 'Danger',
    category: 'safari'
  },
  'safari_view_player_inventory': {
    label: '👀 View Player Inventory',
    description: 'Admin view of any player Safari inventory',
    emoji: '👀',
    style: 'Primary',
    category: 'safari'
  },
  'safari_map_explorer': {
    label: '🗺️ Map Explorer',
    description: 'Safari Map Explorer interface with grid-based exploration',
    emoji: '🗺️',
    style: 'Primary',
    category: 'safari'
  },
  'safari_shared_map': {
    label: 'Shared Map',
    description: 'Share map publicly in channel (non-ephemeral map view)',
    emoji: '🗺️',
    style: 'Secondary',
    category: 'safari',
    parent: 'safari_progress'
  },
  'map_update': {
    label: 'Update Map',
    description: 'Update the existing map image with a new one',
    emoji: '🔄',
    style: 'Primary',
    category: 'safari'
  },
  'safari_map_init_player': {
    label: 'Start Exploring',
    description: 'Initialize player on Safari map with starting position and stamina',
    emoji: '🚶',
    style: 'Success',
    category: 'safari'
  },

  // Safari Map Movement Buttons (dynamic pattern: safari_move_COORDINATE)
  'safari_move_*': {
    label: 'Movement',
    description: 'Player movement between map coordinates',
    emoji: '🗺️',
    style: 'Secondary',
    category: 'safari_movement'
  },
  
  // Safari Show Movement Options (for admin-moved players)
  'safari_show_movement_*': {
    label: 'Show Movement Options',
    description: 'Show movement options after admin move',
    emoji: '🗺️',
    style: 'Primary',
    category: 'safari_movement'
  },
  
  // Safari Navigate (shows movement options and deletes itself)
  'safari_navigate_*': {
    label: 'Navigate',
    description: 'Show navigation options for current location',
    emoji: '🗺️',
    style: 'Secondary',
    category: 'safari_movement'
  },
  
  // Safari Navigation Refresh
  'safari_navigate_refresh_*': {
    label: 'Refresh',
    description: 'Refresh stamina and movement display',
    emoji: '🧭',
    style: 'Secondary',
    category: 'safari_movement'
  },
  
  // Map Location Actions
  'map_location_actions_*': {
    label: 'Location Actions',
    description: 'Admin actions for map cell content management',
    emoji: '📍',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  
  // Map Item Drop Management
  'map_add_item_drop_*': {
    label: 'Add Item Drop',
    description: 'Add item drop to map location with searchable item selection',
    emoji: '📦',
    style: 'Primary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  
  // Map Item Search
  'map_item_search_*': {
    label: 'Search Items',
    description: 'Search items for map location selection',
    emoji: '🔍',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  
  // Map Store Management
  'map_stores_select_*': {
    label: 'Store Selection',
    description: 'Select stores to add to map location',
    emoji: '🏪',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },

  // Store Selector - Add to Location (Toggle)
  'safari_store_select_add_to_location_*': {
    label: 'Store Selection (Toggle)',
    description: 'Add/remove stores from map location with toggle behavior',
    emoji: '🏪',
    style: 'Primary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_coord_store_*': {
    label: 'Store Access',
    description: 'Access store from map location',
    emoji: '🏪',
    style: 'Secondary',
    category: 'safari_map'
  },
  
  // Map Item Drop Selection
  'map_item_drop_select_*': {
    label: 'Configure Item Drop',
    description: 'Configure item drop settings for map location',
    emoji: '📦',
    style: 'Primary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  
  // Map Drop Management
  'map_drop_save_*': {
    label: 'Save Item Drop',
    description: 'Save item drop configuration for map location',
    emoji: '✅',
    style: 'Success',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'map_drop_remove_*': {
    label: 'Remove Item Drop',
    description: 'Remove item drop from map location',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'map_drop_style_*': {
    label: 'Drop Button Style',
    description: 'Select button style for item drop',
    emoji: '🎨',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'map_drop_type_*': {
    label: 'Drop Type',
    description: 'Select drop type (once per player/season)',
    emoji: '🔄',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  
  // Map Item/Currency Drops (removed duplicate - keeping the one above)
  'map_add_currency_drop_*': {
    label: 'Add Currency Drop',
    description: 'Configure currency drop for location',
    emoji: '🪙',
    style: 'Primary',
    category: 'safari_map_admin'
  },
  'map_item_drop_select_*': {
    label: 'Item Drop Select',
    description: 'Select item for drop configuration',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_item_drop_config_*': {
    label: 'Configure Item Drop',
    description: 'Configure existing item drop settings',
    emoji: '⚙️',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'map_item_drop_*': {
    label: 'Item Drop',
    description: 'Player collects item drop',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map'
  },
  'map_currency_drop_config_*': {
    label: 'Configure Currency Drop',
    description: 'Configure currency drop settings',
    emoji: '⚙️',
    style: 'Secondary',
    category: 'safari_map'
  },
  'map_currency_drop_style_*': {
    label: 'Currency Drop Style',
    description: 'Select currency drop button style',
    emoji: '🎨',
    style: 'Secondary',
    category: 'safari_map'
  },
  'map_currency_drop_type_*': {
    label: 'Currency Drop Type',
    description: 'Select currency drop type',
    emoji: '🔢',
    style: 'Secondary',
    category: 'safari_map'
  },
  'map_currency_drop_save_*': {
    label: 'Save Currency Drop',
    description: 'Save currency drop configuration',
    emoji: '✅',
    style: 'Success',
    category: 'safari_map'
  },
  'map_currency_drop_remove_*': {
    label: 'Remove Currency Drop',
    description: 'Remove currency drop from location',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map'
  },
  'map_currency_drop_*': {
    label: 'Currency Drop',
    description: 'Player collects currency drop',
    emoji: '🪙',
    style: 'Secondary',
    category: 'safari_map'
  },
  
  // Map Drop Configuration
  'map_drop_style_*': {
    label: 'Drop Style',
    description: 'Configure drop button style',
    emoji: '🎨',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_drop_type_*': {
    label: 'Drop Type',
    description: 'Configure drop availability',
    emoji: '🎯',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_drop_text_*': {
    label: 'Set Button Text',
    description: 'Configure drop button text',
    emoji: '✏️',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresModal: true
  },
  'map_drop_save_*': {
    label: 'Save Drop',
    description: 'Save item drop configuration',
    emoji: '✅',
    style: 'Success',
    category: 'safari_map_admin'
  },
  'map_drop_remove_*': {
    label: 'Remove Drop',
    description: 'Remove item drop from location',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_drop_reset_*': {
    label: 'Reset Drop',
    description: 'Reset drop claims for testing',
    emoji: '🔃',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  
  // Map Currency Configuration
  'map_currency_style_*': {
    label: 'Currency Style',
    description: 'Configure currency button style',
    emoji: '🎨',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_currency_type_*': {
    label: 'Currency Type',
    description: 'Configure currency availability',
    emoji: '🎯',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_currency_edit_*': {
    label: 'Edit Currency',
    description: 'Edit currency amount/text',
    emoji: '✏️',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresModal: true
  },
  'map_currency_remove_*': {
    label: 'Remove Currency',
    description: 'Remove currency drop from location',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_currency_reset_*': {
    label: 'Reset Currency',
    description: 'Reset currency claims for testing',
    emoji: '🔃',
    style: 'Secondary',
    category: 'safari_map_admin'
  },

  // Safari Currency Configuration (Action Outcomes)
  // NOTE: safari_currency_style_* removed - button style is set at parent Action level
  'safari_currency_save_*': {
    label: 'Save Currency',
    description: 'Save currency action configuration',
    emoji: '✅',
    style: 'Success',
    category: 'safari_management'
  },

  // Safari Player Admin
  'safari_map_admin': {
    label: 'Player Admin',
    description: 'Admin panel for managing player map states',
    emoji: '🛡️',
    style: 'Danger',
    category: 'safari',
    requiresPermission: 'ManageRoles'
  },
  
  // Safari Progress Overview
  'safari_progress': {
    label: 'Safari Progress',
    description: 'View comprehensive safari map progress and claim status',
    emoji: '🚀',
    style: 'Primary',
    category: 'safari',
    requiresPermission: 'ManageRoles'
  },
  
  // Safari Progress Navigation
  'safari_progress_prev_*': {
    label: 'Previous Row',
    description: 'Navigate to previous row in safari progress',
    emoji: '◀',
    style: 'Secondary',
    category: 'safari',
    requiresPermission: 'ManageRoles'
  },
  'safari_progress_next_*': {
    label: 'Next Row',
    description: 'Navigate to next row in safari progress',
    emoji: '▶',
    style: 'Secondary',
    category: 'safari',
    requiresPermission: 'ManageRoles'
  },
  'safari_progress_jump': {
    label: 'Jump to Row',
    description: 'Jump to specific row in safari progress',
    emoji: '📍',
    style: 'Secondary',
    category: 'safari',
    requiresPermission: 'ManageRoles',
    type: 'select_menu'
  },
  'safari_progress_global_items': {
    label: 'Advantages',
    description: 'View all once_globally give_item actions across the map',
    emoji: '🎁',
    style: 'Secondary',
    category: 'safari',
    requiresPermission: 'ManageRoles'
  },
  'safari_show_advantages_public': {
    label: 'Show Advantages (Public!)',
    description: 'Display advantages overview publicly for all players to see',
    emoji: '⚠️',
    style: 'Danger',
    category: 'safari',
    requiresPermission: 'ManageRoles'
  },
  'safari_progress_back_to_rows': {
    label: 'Back to Rows',
    description: 'Return to row-based Safari Progress view',
    emoji: '←',
    style: 'Secondary',
    category: 'safari',
    requiresPermission: 'ManageRoles'
  },
  'map_admin_blacklist': {
    label: 'Blacklisted Coordinates',
    description: 'Manage restricted coordinates on the map',
    emoji: '🚫',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'map_admin_refresh_anchors': {
    label: 'Refresh Anchors',
    description: 'Manually refresh anchor messages for specific coordinates',
    emoji: '🔄',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'safari_paused_players': {
    label: 'Paused Players',
    description: 'Manage paused Safari players (remove channel access while maintaining state)',
    emoji: '⏸️',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'safari_pause_players_select': {
    label: 'Select Paused Players',
    description: 'User select for pausing/unpausing Safari players',
    emoji: '⏸️',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'safari_start_safari': {
    label: 'Start Safari',
    description: 'Bulk initialize multiple players onto the Safari map',
    emoji: '🦁',
    style: 'Primary',
    category: 'safari_map_admin',
    parent: 'safari_map_explorer'
  },
  'safari_start_user_select': {
    label: 'Select Players',
    description: 'User select menu for bulk Safari initialization',
    emoji: '👥',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'safari_start_safari_go': {
    label: 'Start Safari',
    description: 'Execute bulk Safari initialization for selected players',
    emoji: '▶️',
    style: 'Primary',
    category: 'safari_map_admin'
  },
  'safari_remove_players': {
    label: 'Remove Players',
    description: 'Bulk de-initialize multiple players from the Safari map',
    emoji: '🚪',
    style: 'Danger',
    category: 'safari_map_admin',
    parent: 'safari_map_explorer'
  },
  'safari_remove_user_select': {
    label: 'Select Players to Remove',
    description: 'User select menu for bulk Safari de-initialization',
    emoji: '👥',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'safari_remove_players_go': {
    label: 'Remove Players',
    description: 'Execute bulk Safari de-initialization for selected players',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_player_locations': {
    label: 'Player Locations',
    description: 'View all player locations on the map',
    emoji: '👥',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'map_player_locations_refresh': {
    label: 'Refresh',
    description: 'Refresh player locations display',
    emoji: '🔄',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresPermission: 'ManageRoles'
  },
  'map_delete': {
    label: 'Delete Map',
    description: 'Delete entire map with confirmation',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_delete_confirm': {
    label: 'Confirm Map Deletion',
    description: 'Confirm permanent map deletion',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_delete_cancel': {
    label: 'Cancel Map Deletion',
    description: 'Cancel map deletion and return to menu',
    emoji: '❌',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'map_admin_user_select': {
    label: 'User Select',
    description: 'Select player for map administration',
    emoji: '👤',
    style: 'Primary',
    category: 'safari_map_admin'
  },
  'map_admin_select_new': {
    label: 'Select Different Player',
    description: 'Return to player selection',
    emoji: '👤',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'safari_init_player_*': {
    label: 'Initialize Safari',
    description: 'Initialize player in Safari system',
    emoji: '🚀',
    style: 'Success',
    category: 'safari_admin'
  },
  'safari_deinit_player_*': {
    label: 'De-initialize Safari',
    description: 'Remove player from Safari system with warning',
    emoji: '🛬',
    style: 'Danger',
    category: 'safari_admin'
  },
  'safari_deinit_confirm_*': {
    label: 'Confirm De-initialization',
    description: 'Confirm removal of player Safari data',
    emoji: '⚠️',
    style: 'Danger',
    category: 'safari_admin'
  },
  'safari_pause_player_*': {
    label: 'Pause',
    description: 'Temporarily remove player from map channel',
    emoji: '⏸️',
    style: 'Secondary',
    category: 'safari_admin'
  },
  'safari_unpause_player_*': {
    label: 'Unpause',
    description: 'Restore player access to map channel',
    emoji: '⏯️',
    style: 'Secondary',
    category: 'safari_admin'
  },
  'safari_starting_info_*': {
    label: 'Starting Info',
    description: 'Set player starting location (and future starting gold override)',
    emoji: '🚩',
    style: 'Secondary',
    category: 'safari_admin',
    requiresModal: true
  },
  'map_admin_move_player_*': {
    label: 'Move Player',
    description: 'Move player to specific coordinate',
    emoji: '📍',
    style: 'Primary',
    category: 'safari_map_admin',
    requiresModal: true
  },
  'map_admin_grant_stamina_*': {
    label: 'Stamina',
    description: 'Set player stamina points',
    emoji: '⚡',
    style: 'Success',
    category: 'safari_map_admin',
    requiresModal: true
  },
  'map_admin_reset_explored_*': {
    label: 'Reset Explored',
    description: 'Reset player exploration progress',
    emoji: '🔄',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_admin_edit_currency_*': {
    label: 'Edit Currency',
    description: 'Set player currency amount',
    emoji: '💰',
    style: 'Secondary',
    category: 'safari_map_admin',
    requiresModal: true
  },
  'map_admin_edit_items_*': {
    label: 'Edit Player Items',
    description: 'Player-centric item quantity editing interface',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'player_item_select_*': {
    label: 'Player Item Select',
    description: 'Select item for player quantity editing',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_admin_item_select_*': {
    label: 'Item Select',
    description: 'Select item for map admin quantity edit',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },

  // Player Admin - Player Management
  'map_admin_add_item_*': {
    label: 'Add Item',
    description: 'Add items to player inventory',
    emoji: '➕',
    style: 'Success',
    category: 'safari_map_admin'
  },
  'map_admin_edit_quantities_*': {
    label: 'Edit Quantities', 
    description: 'Edit item quantities in player inventory',
    emoji: '✏️',
    style: 'Primary',
    category: 'safari_map_admin'
  },
  'map_admin_clear_inventory_*': {
    label: 'Clear All',
    description: 'Clear player inventory (with confirmation)',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_admin_add_item_select_*': {
    label: 'Add Item Select',
    description: 'Select item to add to player inventory',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_admin_edit_qty_select_*': {
    label: 'Edit Quantity Select',
    description: 'Select item quantity to edit',
    emoji: '✏️',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },
  'map_admin_clear_inventory_confirm_*': {
    label: 'Confirm Clear',
    description: 'Confirm clearing player inventory',
    emoji: '⚠️',
    style: 'Danger',
    category: 'safari_map_admin'
  },
  'map_admin_user_select_continue_*': {
    label: 'Back',
    description: 'Return to player map admin menu',
    emoji: '⬅️',
    style: 'Secondary',
    category: 'safari_map_admin'
  },

  // Safari Currency Management Submenu
  'safari_currency_view_all': {
    label: 'View All Balances',
    description: 'Display all player currency balances',
    emoji: '👥',
    style: 'Primary',
    category: 'safari_currency'
  },
  'safari_currency_set_player': {
    label: 'Set Player Currency',
    description: 'Set specific player currency amount',
    emoji: '💰',
    style: 'Secondary',
    category: 'safari_currency'
  },
  'safari_currency_reset_all': {
    label: 'Reset All Currency',
    description: 'Reset all player currency (DANGEROUS)',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_currency'
  },
  'safari_currency_select_user': {
    label: 'Select User',
    description: 'User selection for currency operations',
    emoji: '👤',
    style: 'Secondary',
    category: 'safari_currency'
  },
  'safari_currency_reset_confirm': {
    label: 'Confirm Reset',
    description: 'Confirm currency reset operation',
    emoji: '⚠️',
    style: 'Danger',
    category: 'safari_currency'
  },

  // Safari Item Management Submenu
  'safari_item_edit_select': {
    label: 'Select Item',
    description: 'Select item to edit',
    emoji: '🎯',
    style: 'Secondary',
    category: 'safari_items'
  },
  'safari_item_player_qty': {
    label: 'Set Player Quantity',
    description: 'Set item quantity for specific player',
    emoji: '📊',
    style: 'Secondary',
    category: 'safari_items'
  },
  'safari_item_qty_user_select': {
    label: 'User Select for Item Quantity',
    description: 'User selection for item quantity management',
    emoji: '👤',
    style: 'Secondary',
    category: 'safari_items'
  },
  'safari_item_qty_modal': {
    label: 'Item Quantity Modal',
    description: 'Modal handler for setting item quantities',
    emoji: '📝',
    style: 'Primary',
    category: 'safari_items'
  },
  'safari_item_modal': {
    label: 'Create Item Modal',
    description: 'Modal handler for creating new Safari items',
    emoji: '📦',
    style: 'Primary',
    category: 'safari_items'
  },

  // === ENTITY MANAGEMENT SYSTEM ===
  'entity_select_*': {
    label: 'Entity Selection',
    description: 'Handle entity selection from dropdown (seasons, items, stores, etc.)',
    emoji: '📋',
    style: 'Primary',
    category: 'entity_management'
  },
  'castlist_season_select': {
    label: 'Castlist Season Selection',
    description: 'Select a season for castlist management',
    emoji: '📋',
    style: 'Secondary',
    category: 'castlist'
  },
  'entity_field_group_*': {
    label: 'Field Group Edit',
    description: 'Handle field group button click for editing',
    emoji: '✏️',
    style: 'Secondary',
    category: 'entity_management'
  },
  'entity_edit_mode': {
    label: 'Edit Mode',
    description: 'Switch entity to edit mode',
    emoji: '✏️',
    style: 'Primary',
    category: 'entity_management'
  },
  'entity_view_mode': {
    label: 'View Mode',
    description: 'Switch entity to view mode',
    emoji: '👁️',
    style: 'Secondary',
    category: 'entity_management'
  },
  'entity_delete_mode': {
    label: 'Delete Mode',
    description: 'Switch entity to delete confirmation mode',
    emoji: '🗑️',
    style: 'Danger',
    category: 'entity_management'
  },
  'entity_confirm_delete': {
    label: 'Confirm Delete',
    description: 'Confirm and execute entity deletion',
    emoji: '⚠️',
    style: 'Danger',
    category: 'entity_management'
  },
  'entity_search_again': {
    label: 'Search Again',
    description: 'Reopen search modal when too many results found',
    emoji: '🔍',
    style: 'Primary',
    category: 'entity_management'
  },

  // === PHASE 5: ITEM ATTRIBUTE MODIFIERS ===
  'item_attr_add': {
    label: 'Add Bonus',
    description: 'Add attribute bonus to an item',
    emoji: '➕',
    style: 'Success',
    category: 'item_attributes'
  },
  'item_attr_select': {
    label: 'Select Attribute',
    description: 'Select which attribute to add bonus for',
    emoji: '📊',
    style: 'Secondary',
    category: 'item_attributes'
  },
  'item_attr_manage': {
    label: 'Manage Bonus',
    description: 'Manage existing attribute bonuses on item',
    emoji: '⚙️',
    style: 'Secondary',
    category: 'item_attributes'
  },
  'item_attr_edit': {
    label: 'Edit Bonus',
    description: 'Edit existing attribute bonus value',
    emoji: '✏️',
    style: 'Primary',
    category: 'item_attributes'
  },
  'item_attr_remove': {
    label: 'Remove Bonus',
    description: 'Remove attribute bonus from item',
    emoji: '🗑️',
    style: 'Danger',
    category: 'item_attributes'
  },

  // === APPLICATION MANAGEMENT SYSTEM ===
  'season_management_menu': {
    label: 'Apps',
    description: 'Comprehensive season-based application management system',
    emoji: '📝',
    style: 'Primary',
    category: 'application_management'
  },
  'season_new_question_*': {
    label: 'New Question',
    description: 'Create a new application question in season management',
    emoji: '✨',
    style: 'Secondary',
    category: 'application_management'
  },
  'season_post_button_*': {
    label: 'Post to Channel',
    description: 'Post the application button to a channel',
    emoji: '#️⃣',
    style: 'Secondary',
    category: 'application_management'
  },
  'season_app_ranking_*': {
    label: 'Cast Ranking',
    description: 'Comprehensive applicant ranking and evaluation system for specific season',
    emoji: '🏆',
    style: 'Secondary',
    category: 'application_management'
  },
  'cast_player_*': {
    label: 'Cast Player',
    description: 'Mark applicant as cast',
    emoji: '🎬',
    style: 'Secondary',
    category: 'casting_management'
  },
  'cast_tentative_*': {
    label: 'Tentative',
    description: 'Mark applicant as tentative',
    emoji: '❓',
    style: 'Secondary',
    category: 'casting_management'
  },
  'cast_reject_*': {
    label: 'Don\'t Cast',
    description: 'Mark applicant as not cast',
    emoji: '🗑️',
    style: 'Secondary',
    category: 'casting_management'
  },
  'edit_player_notes_*': {
    label: 'Edit Player Notes',
    description: 'Add or update casting notes for applicant',
    emoji: '✏️',
    style: 'Primary',
    category: 'casting_management'
  },
  'delete_application_mode_*': {
    label: 'Delete Application',
    description: 'Delete application and channel with confirmation',
    emoji: '🗑️',
    style: 'Danger',
    category: 'casting_management'
  },
  'delete_application_confirm_*': {
    label: 'Yes, Delete Application',
    description: 'Confirm application deletion',
    emoji: '⚠️',
    style: 'Danger',
    category: 'casting_management'
  },
  'cancel_delete_application_*': {
    label: 'Cancel',
    description: 'Cancel application deletion',
    emoji: '❌',
    style: 'Secondary',
    category: 'casting_management'
  },
  'season_question_edit_*': {
    label: 'Edit Question',
    description: 'Edit application question details',
    emoji: '✏️',
    style: 'Secondary',
    category: 'application_management'
  },
  'season_question_up_*': {
    label: 'Move Question Up',
    description: 'Move question higher in the order',
    emoji: '⬆️',
    style: 'Secondary',
    category: 'application_management'
  },
  'season_question_down_*': {
    label: 'Move Question Down',
    description: 'Move question lower in the order',
    emoji: '⬇️',
    style: 'Secondary',
    category: 'application_management'
  },
  'season_question_delete_*': {
    label: 'Delete Question',
    description: 'Delete application question',
    emoji: '🗑️',
    style: 'Danger',
    category: 'application_management'
  },
  'season_delete_*': {
    label: 'Delete Season',
    description: 'Delete entire season and all questions',
    emoji: '🗑️',
    style: 'Danger',
    category: 'application_management'
  },
  'season_delete_confirm_*': {
    label: 'Yes, Delete Season',
    description: 'Confirm season deletion',
    emoji: '⚠️',
    style: 'Danger',
    category: 'application_management'
  },
  'season_delete_cancel_*': {
    label: 'Cancel',
    description: 'Cancel season deletion',
    emoji: '❌',
    style: 'Secondary',
    category: 'application_management'
  },
  'season_edit_info_*': {
    label: 'Edit Season',
    description: 'Edit season name and description',
    emoji: '✏️',
    style: 'Secondary',
    category: 'application_management'
  },

  'season_nav_prev_*': {
    label: 'Previous Page',
    description: 'Navigate to previous page in season management',
    emoji: '◀',
    style: 'Secondary',
    category: 'application_management'
  },
  
  'season_nav_next_*': {
    label: 'Next Page', 
    description: 'Navigate to next page in season management',
    emoji: '▶',
    style: 'Secondary',
    category: 'application_management'
  },
  'create_app_button_*': {
    label: 'Post to Channel',
    description: 'Creates and posts the configured application button to the selected channel',
    emoji: '#️⃣',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_target_channel': {
    label: 'Select Target Channel',
    description: 'Channel select for application button posting target',
    emoji: '#️⃣',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_target_channel_*': {
    label: 'Select Target Channel',
    description: 'Channel select for application button posting target (with config ID)',
    emoji: '#️⃣',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_application_category': {
    label: 'Select Category',
    description: 'Category select for application channel creation',
    emoji: '📁',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_application_category_*': {
    label: 'Select Category',
    description: 'Category select for application channel creation (with config ID)',
    emoji: '📁',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_button_style': {
    label: 'Select Button Style',
    description: 'Style select for application button appearance',
    emoji: '🎨',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_button_style_*': {
    label: 'Select Button Style',
    description: 'Style select for application button appearance (with config ID)',
    emoji: '🎨',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_production_role': {
    label: 'Select Production Role',
    description: 'Role select for application production role assignment',
    emoji: '🏷️',
    style: 'Secondary',
    category: 'application_management'
  },
  'select_production_role_*': {
    label: 'Select Production Role',
    description: 'Role select for application production role assignment (with config ID)',
    emoji: '🏷️',
    style: 'Secondary',
    category: 'application_management'
  },

  // === SAFARI ACTIONS SYSTEM (terminology: Action = entity, Trigger = invocation, Outcome = step) ===
  'entity_custom_action_select': {
    label: 'Actions',
    description: 'Manage actions for this location',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_management'
  },
  'entity_custom_action_select_*': {
    label: 'Action Multi-Select',
    description: 'Select actions to assign to location',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'entity_custom_action_list_*': {
    label: 'Action List',
    description: 'Select an action to manage or create new',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'entity_clone_source_list_*': {
    label: 'Clone Source List',
    description: 'Select an action to clone/duplicate',
    emoji: '🔄',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'entity_custom_action_create': {
    label: 'Create New Action',
    description: 'Create a new action',
    emoji: '➕',
    style: 'Success',
    category: 'safari_management'
  },
  'entity_custom_action_edit_info_*': {
    label: 'Action Info',
    description: 'Edit action name and description',
    emoji: '📝',
    style: 'Secondary',
    category: 'safari_management'
  },
  'entity_action_trigger_*': {
    label: 'Edit Trigger',
    description: 'Configure action trigger type and settings',
    emoji: '🎯',
    style: 'Secondary',
    category: 'safari_management'
  },
  'entity_action_conditions_*': {
    label: 'Edit Conditions',
    description: 'Configure action conditions and logic',
    emoji: '🔧',
    style: 'Secondary',
    category: 'safari_management'
  },
  'entity_action_coords_*': {
    label: 'Manage Coordinates',
    description: 'Manage coordinate assignments for action',
    emoji: '📍',
    style: 'Secondary',
    category: 'safari_management'
  },
  'ca_linked_items_*': {
    label: 'Item Action',
    description: 'Open item link sub-UI for linking items to action',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_management'
  },
  'ca_link_item_select_*': {
    label: 'Link Item Select',
    description: 'Select an item to link to an action',
    emoji: '🔗',
    style: 'Secondary',
    category: 'safari_management'
  },
  'ca_unlink_item_*': {
    label: 'Unlink Item',
    description: 'Remove item link from an action',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_management'
  },
  'safari_use_linked_*': {
    label: 'Use Item Action',
    description: 'Execute single action linked to inventory item',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_item_uses_*': {
    label: 'Item Uses Select',
    description: 'Choose between attack, stamina, or actions for multi-use item',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari'
  },
  'entity_action_post_channel_*': {
    label: 'Post to Channel',
    description: 'Post action trigger button to a Discord channel',
    emoji: '#️⃣',
    style: 'Secondary',
    category: 'safari_management',
    parent: 'entity_action_coords'
  },
  'custom_action_trigger_type_*': {
    label: 'Trigger Type Select',
    description: 'Select trigger type for action',
    emoji: '🎯',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'custom_action_button_style_*': {
    label: 'Button Style Select',
    description: 'Select button color/style for action trigger',
    emoji: '🎨',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'ca_schedule_channel_*': {
    label: 'Schedule Channel',
    description: 'Select channel for scheduled action execution',
    emoji: '📺',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'ca_schedule_task_*': {
    label: 'Schedule Task',
    description: 'Open scheduling modal for action',
    emoji: '⏰',
    style: 'Success',
    category: 'safari_management'
  },
  'ca_schedule_cancel_*': {
    label: 'Cancel Schedule',
    description: 'Cancel a scheduled action execution',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_management'
  },
  'button_preview_*': {
    label: 'Button Preview',
    description: 'Preview button that does nothing when clicked',
    emoji: '👁️',
    style: 'Primary',
    category: 'safari_management'
  },
  'custom_action_condition_logic_*': {
    label: 'Condition Logic',
    description: 'Select AND/OR logic for conditions',
    emoji: '🔀',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'custom_action_add_condition_*': {
    label: 'Add Condition',
    description: 'Add a new condition to action',
    emoji: '➕',
    style: 'Primary',
    category: 'safari_management'
  },
  'custom_action_remove_condition_*': {
    label: 'Remove Condition',
    description: 'Remove condition from action',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_management'
  },
  'custom_action_test_*': {
    label: 'Test Action',
    description: 'Test custom action execution',
    emoji: '🧪',
    style: 'Success',
    category: 'safari_management'
  },
  'custom_action_delete_*': {
    label: 'Delete Action',
    description: 'Delete custom action (with confirmation)',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_management'
  },
  'custom_action_delete_confirm_*': {
    label: 'Confirm Delete',
    description: 'Confirm action deletion',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_management'
  },
  'custom_action_delete_cancel_*': {
    label: 'Cancel Delete',
    description: 'Cancel action deletion',
    emoji: '❌',
    style: 'Secondary',
    category: 'safari_management'
  },
  'remove_coord_*': {
    label: 'Remove Coordinate',
    description: 'Remove coordinate assignment from action',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari_management'
  },
  'add_coord_modal_*': {
    label: 'Add Coordinate',
    description: 'Add coordinate assignment to action',
    emoji: '➕',
    style: 'Primary',
    category: 'safari_management',
    requiresModal: true
  },
  'menu_visibility_select_*': {
    label: 'Menu Visibility',
    description: 'Select where action appears (Hidden/Player Menu/Crafting)',
    emoji: '📋',
    category: 'safari_management'
  },
  'safari_crafting_menu_*': {
    label: 'Crafting',
    description: 'Open crafting menu showing crafting actions',
    emoji: '🛠️',
    style: 'Primary',
    category: 'safari_player'
  },
  'configure_modal_trigger_*': {
    label: 'Configure Phrases',
    description: 'Set command phrases for modal trigger',
    emoji: '💬',
    style: 'Secondary',
    category: 'safari_management'
  },
  'player_enter_command_*': {
    label: 'Enter Command',
    description: 'Enter a text command at this location',
    emoji: '🕹️',
    style: 'Secondary',
    category: 'safari_player'
  },
  'admin_test_command_*': {
    label: 'Test Command',
    description: 'Admin test command triggers at this location',
    emoji: '🧪',
    style: 'Secondary',
    category: 'safari_admin'
  },

  // === SAFARI DYNAMIC EXECUTION ===
  'safari_*_*_*': {
    label: 'Safari Action',
    description: 'Execute action on map location',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_execution'
  },
  'safari_action_type_select_*': {
    label: 'Select Outcome Type',
    description: 'Add outcome to action. Suffix _true = Pass, _false = Fail. Uses shared OUTCOME_TYPE_OPTIONS from customActionUI.js',
    emoji: '🎯',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'safari_give_item_select_*': {
    label: 'Select Item for Outcome',
    description: 'String select menu for choosing item in give_item outcome',
    emoji: '🎁',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'safari_item_limit_*': {
    label: 'Item Drop Limit',
    description: 'Set usage limit for item drop outcome',
    emoji: '🔢',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'safari_item_operation_*': {
    label: 'Item Operation',
    description: 'Select give/take operation for item outcome',
    emoji: '🔧',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'safari_item_quantity_*': {
    label: 'Item Quantity',
    description: 'Set quantity for item outcome',
    emoji: '📊',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'safari_view_claims_*': {
    label: 'View Claims',
    description: 'View claims data for an outcome (give_item, give_currency, etc.)',
    emoji: '📋',
    style: 'Secondary',
    category: 'safari_management'
  },
  'custom_action_editor_*': {
    label: 'Action Editor',
    description: 'Open or return to the custom action editor',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari_management'
  },
  'safari_item_save_*': {
    label: 'Save Item Outcome',
    description: 'Save give_item outcome configuration to action',
    emoji: '💾',
    style: 'Primary',
    category: 'safari_management'
  },
  'safari_follow_up_select': {
    label: 'Select Follow-up Button',
    description: 'String select menu for choosing follow-up button to chain',
    emoji: '🔗',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'safari_give_role_select': {
    label: 'Select Role to Give',
    description: 'Role select menu for choosing role to give to users',
    emoji: '👑',
    style: 'Primary',
    category: 'safari_management',
    type: 'role_select'
  },
  'safari_remove_role_select': {
    label: 'Select Role to Remove',
    description: 'Role select menu for choosing role to remove from users',
    emoji: '🚫',
    style: 'Primary',
    category: 'safari_management',
    type: 'role_select'
  },
  'safari_calculate_results_scope': {
    label: 'Results Calculation Scope',
    description: 'Select which players to process harvest results for (all players or executing player)',
    emoji: '👥',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_calculate_results_display': {
    label: 'Results Display Mode',
    description: 'Select whether to display harvest results or process silently',
    emoji: '📊',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_calculate_results_execute_on': {
    label: 'Results Execution Condition',
    description: 'Select when calculate results action should execute (conditions true/false)',
    emoji: '✅',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_calculate_attack_scope': {
    label: 'Attack Player Scope',
    description: 'Select which players to process attacks for (all players or executing player)',
    emoji: '👥',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_calculate_attack_display': {
    label: 'Attack Display Mode',
    description: 'Select whether to display attack results or process silently',
    emoji: '📊',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_calculate_attack_execute_on': {
    label: 'Attack Execution Condition',
    description: 'Select when calculate attack action should execute (conditions true/false)',
    emoji: '✅',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },

  // Manage Player State config selects/buttons
  'safari_player_state_mode_*': {
    label: 'Player State Mode',
    description: 'Select mode: initialize, teleport, init or teleport, or de-initialize',
    emoji: '🚀',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_player_state_execute_on_*': {
    label: 'Player State Execution Condition',
    description: 'Select when player state outcome should execute (conditions true/false)',
    emoji: '✅',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_player_state_coord_modal_*': {
    label: 'Set Target Coordinate',
    description: 'Open modal to set the target coordinate for initialization or teleport',
    emoji: '📍',
    style: 'Primary',
    category: 'safari_custom_actions',
    requiresModal: true
  },
  'safari_player_state_coord_clear_*': {
    label: 'Use Default Coordinate',
    description: 'Clear custom coordinate and use default starting location resolution',
    emoji: '🔄',
    style: 'Secondary',
    category: 'safari_custom_actions'
  },
  'safari_player_state_coord_submit_*': {
    label: 'Coordinate Modal Submit',
    description: 'Process coordinate modal submission for player state outcome',
    emoji: '📍',
    style: 'Primary',
    category: 'safari_custom_actions'
  },

  // Modify Attribute Action config selects
  'safari_modify_attr_select': {
    label: 'Attribute Selection',
    description: 'Select which attribute to modify in this action',
    emoji: '📊',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_modify_attr_operation': {
    label: 'Attribute Operation',
    description: 'Select how to modify the attribute (add, subtract, or set)',
    emoji: '➕',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_modify_attr_display': {
    label: 'Attribute Display Mode',
    description: 'Select whether to show feedback when attribute changes',
    emoji: '💬',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_modify_attr_execute_on': {
    label: 'Attribute Execution Condition',
    description: 'Select when modify attribute action should execute (conditions true/false)',
    emoji: '✅',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_modify_attr_limit': {
    label: 'Usage Limit',
    description: 'Set how many times this attribute action can be used (unlimited, once per player, once globally)',
    emoji: '♾️',
    style: 'Primary',
    category: 'safari_custom_actions',
    type: 'select_menu'
  },
  'safari_modify_attr_amount': {
    label: 'Set Amount',
    description: 'Open modal to set the amount for attribute modification',
    emoji: '✏️',
    style: 'Primary',
    category: 'safari_custom_actions'
  },
  'safari_modify_attr_reset': {
    label: 'Reset Claims',
    description: 'Reset all claims for this attribute action, allowing players to use it again',
    emoji: '🔄',
    style: 'Secondary',
    category: 'safari_custom_actions'
  },

  // === CONDITIONAL LOGIC SYSTEM ===
  // Condition Manager buttons
  'condition_manager_*': {
    label: 'Condition Manager',
    description: 'Access condition management for custom action',
    emoji: '🧩',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_edit_*': {
    label: 'Edit',
    description: 'Edit condition configuration',
    emoji: '✏️',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_up_*': {
    label: '',
    description: 'Move condition up in evaluation order',
    emoji: '⬆️',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_down_*': {
    label: '',
    description: 'Move condition down in evaluation order',
    emoji: '⬇️',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_delete_*': {
    label: 'Delete',
    description: 'Delete this condition',
    emoji: '🗑️',
    style: 'Danger',
    category: 'conditional_logic'
  },
  'condition_logic_*': {
    label: 'AND/OR',
    description: 'Toggle logic operator (AND/OR)',
    emoji: '🔀',
    style: 'Primary',
    category: 'conditional_logic'
  },
  'condition_add_*': {
    label: 'Add Condition',
    description: 'Add a new condition',
    emoji: '➕',
    style: 'Primary',
    category: 'conditional_logic'
  },
  'condition_nav_prev_*': {
    label: '◀',
    description: 'Previous page of conditions',
    emoji: '◀',
    style: 'Primary',
    category: 'conditional_logic'
  },
  'condition_nav_next_*': {
    label: '▶',
    description: 'Next page of conditions',
    emoji: '▶',
    style: 'Primary',
    category: 'conditional_logic'
  },

  // Condition Editor buttons
  'condition_type_select_*': {
    label: 'Condition Type',
    description: 'Select type of condition',
    emoji: '🎯',
    style: 'Secondary',
    category: 'conditional_logic',
    type: 'select_menu'
  },
  'condition_currency_gte_*': {
    label: '≥',
    description: 'Greater than or equal to',
    emoji: '🔢',
    style: 'Primary',
    category: 'conditional_logic'
  },
  'condition_currency_lte_*': {
    label: '≤',
    description: 'Less than or equal to',
    emoji: '🔢',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_currency_zero_*': {
    label: '= 0',
    description: 'Exactly zero',
    emoji: '0️⃣',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_set_currency_*': {
    label: 'Set Currency',
    description: 'Set currency amount to check',
    emoji: '🪙',
    style: 'Primary',
    category: 'conditional_logic',
    requiresModal: true
  },
  'condition_has_*': {
    label: 'Has',
    description: 'Has item/role',
    emoji: '✅',
    style: 'Primary',
    category: 'conditional_logic'
  },
  'condition_not_has_*': {
    label: 'Does not have',
    description: 'Does not have item/role',
    emoji: '❌',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_item_select_*': {
    label: 'Select Item',
    description: 'Select item for condition',
    emoji: '📦',
    style: 'Secondary',
    category: 'conditional_logic',
    type: 'select_menu'
  },
  'condition_role_select_*': {
    label: 'Select Role',
    description: 'Select role for condition',
    emoji: '👑',
    style: 'Secondary',
    category: 'conditional_logic',
    type: 'role_select'
  },
  'condition_attr_select_*': {
    label: 'Select Attribute',
    description: 'Select attribute to check',
    emoji: '📊',
    style: 'Secondary',
    category: 'conditional_logic',
    type: 'select_menu'
  },
  'condition_attr_target_*': {
    label: 'Target',
    description: 'Select what to compare (current/max/percent)',
    emoji: '🎯',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_attr_comp_*': {
    label: 'Comparison',
    description: 'Select comparison operator',
    emoji: '⚖️',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_attr_value_*': {
    label: 'Set Value',
    description: 'Set threshold value for condition',
    emoji: '🔢',
    style: 'Primary',
    category: 'conditional_logic'
  },
  'condition_attr_itembonuses_*': {
    label: 'Item Bonuses Toggle',
    description: 'Toggle inclusion of item equipment bonuses',
    emoji: '📦',
    style: 'Secondary',
    category: 'conditional_logic'
  },

  // === ATTRIBUTE COMPARE CONDITION BUTTONS ===
  'condition_attrcomp_left_*': {
    label: 'Left Attribute',
    description: 'Select first attribute to compare',
    emoji: '⚔️',
    style: 'Secondary',
    category: 'conditional_logic',
    type: 'select_menu'
  },
  'condition_attrcomp_lefttarget_*': {
    label: 'Left Target',
    description: 'Select what to compare for left attribute',
    emoji: '📉',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_attrcomp_comp_*': {
    label: 'Comparison',
    description: 'Select comparison operator',
    emoji: '⚖️',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_attrcomp_right_*': {
    label: 'Right Attribute',
    description: 'Select second attribute to compare',
    emoji: '⚔️',
    style: 'Secondary',
    category: 'conditional_logic',
    type: 'select_menu'
  },
  'condition_attrcomp_righttarget_*': {
    label: 'Right Target',
    description: 'Select what to compare for right attribute',
    emoji: '📈',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_attrcomp_itembonuses_*': {
    label: 'Item Bonuses Toggle',
    description: 'Toggle inclusion of item equipment bonuses',
    emoji: '📦',
    style: 'Secondary',
    category: 'conditional_logic'
  },

  // === MULTI-ATTRIBUTE CONDITION BUTTONS ===
  'condition_multiattr_mode_*': {
    label: 'Mode',
    description: 'Select check mode (all/any/sum/average)',
    emoji: '📈',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_multiattr_attrs_*': {
    label: 'Select Attributes',
    description: 'Select which attributes to check',
    emoji: '📊',
    style: 'Secondary',
    category: 'conditional_logic',
    type: 'select_menu'
  },
  'condition_multiattr_comp_*': {
    label: 'Comparison',
    description: 'Select comparison operator',
    emoji: '⚖️',
    style: 'Secondary',
    category: 'conditional_logic'
  },
  'condition_multiattr_value_*': {
    label: 'Set Value',
    description: 'Set threshold value for multi-attribute check',
    emoji: '🔢',
    style: 'Primary',
    category: 'conditional_logic'
  },
  'condition_multiattr_itembonuses_*': {
    label: 'Item Bonuses Toggle',
    description: 'Toggle inclusion of item equipment bonuses',
    emoji: '📦',
    style: 'Secondary',
    category: 'conditional_logic'
  },

  // === SAFARI SOCIAL FEATURES ===
  'safari_whisper': {
    label: 'Whisper',
    description: 'Send private message to player at location',
    emoji: '💬',
    style: 'Secondary',
    category: 'safari_social'
  },
  'whisper_reply': {
    label: 'Reply',
    description: 'Reply to whisper',
    emoji: '💬',
    style: 'Secondary',
    category: 'safari_social'
  },
  'whisper_read': {
    label: 'Read Message',
    description: 'Read private whisper message',
    emoji: '💬',
    style: 'Primary',
    category: 'safari_social'
  },
  'whisper_player_select': {
    label: 'Select Player',
    description: 'Select player to whisper to',
    emoji: '👤',
    style: 'Secondary',
    category: 'safari_social',
    isSelectMenu: true
  },
  
  // === AVAILABILITY SYSTEM ===
  'prod_availability': {
    label: 'Availability',
    description: 'Player availability management system',
    emoji: '🕐',
    style: 'Secondary',
    category: 'admin',
    parent: 'castbot_tools',
    menu: 'availability_menu'
  },
  'prod_availability_react': {
    label: 'Post Availability Times',
    description: 'Post reaction message for players to indicate availability',
    emoji: '📅',
    style: 'Primary',
    parent: 'prod_availability',
    category: 'availability'
  },
  'prod_availability_options': {
    label: 'View Availability Groups',
    description: 'View and manage player availability groupings',
    emoji: '👥',
    style: 'Secondary',
    parent: 'prod_availability',
    category: 'availability'
  },
  'prod_availability_clear': {
    label: 'Clear My Availability',
    description: 'Clear your availability settings',
    emoji: '🗑️',
    style: 'Danger',
    parent: 'prod_availability',
    category: 'availability'
  },
  
  // === PLAYER MANAGEMENT - BUTTON HANDLERS ===
  'admin_set_pronouns_*': {
    label: 'Set Pronouns Button',
    description: 'Opens pronouns management interface',
    emoji: '🏷️',
    style: 'Secondary',
    category: 'player_management'
  },
  'admin_set_timezone_*': {
    label: 'Set Timezone Button',
    description: 'Opens timezone management interface',
    emoji: '🌍',
    style: 'Secondary',
    category: 'player_management'
  },
  'admin_set_age_*': {
    label: 'Set Age Button',
    description: 'Opens age management interface',
    emoji: '🎂',
    style: 'Secondary',
    category: 'player_management'
  },
  'admin_manage_vanity_*': {
    label: 'Manage Vanity Button',
    description: 'Opens vanity roles management interface',
    emoji: '✨',
    style: 'Secondary',
    category: 'player_management'
  },

  // === PLAYER MANAGEMENT - INTEGRATED HANDLERS ===
  'admin_manage_player': {
    label: 'Manage Players',
    description: 'Admin player management interface with user selector',
    emoji: '🧑‍🤝‍🧑',
    style: 'Primary',
    category: 'player_management'
  },
  'prod_donate': {
    label: 'Donate',
    description: 'Support CastBot development with a donation',
    emoji: '☕',
    style: 'Secondary',
    category: 'production_admin'
  },
  'admin_player_select_update': {
    label: 'Player Select (Admin)',
    description: 'User select dropdown for admin player management',
    emoji: '👥',
    style: 'Secondary',
    category: 'player_management'
  },
  'admin_integrated_vanity': {
    label: 'Vanity Roles',
    description: 'Manage player vanity roles with auto-refresh (deferred response)',
    emoji: '✨',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'admin_integrated_vanity_*': {
    label: 'Vanity Roles (Dynamic)',
    description: 'Manage player vanity roles with user ID (pattern handler)',
    emoji: '✨',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'admin_integrated_pronouns': {
    label: 'Pronouns',
    description: 'Manage player pronouns with auto-refresh (deferred response)',
    emoji: '🏷️',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'admin_integrated_pronouns_*': {
    label: 'Pronouns (Dynamic)',
    description: 'Manage player pronouns with user ID (pattern handler)',
    emoji: '🏷️',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'admin_integrated_timezone': {
    label: 'Timezone',
    description: 'Manage player timezone with auto-refresh (deferred response)',
    emoji: '🌍',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'admin_integrated_timezone_*': {
    label: 'Timezone (Dynamic)',
    description: 'Manage player timezone with user ID (pattern handler)',
    emoji: '🌍',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'admin_integrated_age': {
    label: 'Age',
    description: 'Manage player age with auto-refresh (deferred response)',
    emoji: '🎂',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'admin_integrated_age_*': {
    label: 'Age (Dynamic)',
    description: 'Manage player age with user ID (pattern handler)',
    emoji: '🎂',
    style: 'Primary',
    category: 'player_management',
    usesDeferred: true
  },
  'player_integrated_pronouns': {
    label: 'My Pronouns',
    description: 'Set my pronouns with auto-refresh (deferred response)',
    emoji: '🏷️',
    style: 'Primary',
    category: 'player_menu',
    usesDeferred: true
  },
  'player_integrated_timezone': {
    label: 'My Timezone',
    description: 'Set my timezone with auto-refresh (deferred response)',
    emoji: '🌍',
    style: 'Primary',
    category: 'player_menu',
    usesDeferred: true
  },
  'player_integrated_age': {
    label: 'My Age',
    description: 'Set my age with auto-refresh (deferred response)',
    emoji: '🎂',
    style: 'Primary',
    category: 'player_menu',
    usesDeferred: true
  },

  // === Activity Log Buttons ===
  'admin_view_logs_*': {
    label: 'Logs',
    description: 'View activity log for selected player (admin)',
    emoji: '📜',
    style: 'Secondary',
    category: 'player_management',
    parent: 'admin_manage_player'
  },
  'player_view_logs': {
    label: 'Activity Log',
    description: 'View your recent activity and actions',
    emoji: '📜',
    style: 'Secondary',
    category: 'player_menu'
  },
  'activity_log_prev_*': {
    label: '◀ Prev',
    description: 'Previous page of activity log',
    emoji: '◀',
    style: 'Secondary',
    category: 'navigation',
    parent: 'activity_log'
  },
  'activity_log_next_*': {
    label: 'Next ▶',
    description: 'Next page of activity log',
    emoji: '▶',
    style: 'Secondary',
    category: 'navigation',
    parent: 'activity_log'
  },
  'activity_log_refresh_*': {
    label: 'Refresh',
    description: 'Refresh activity log to show latest entries',
    emoji: '🔃',
    style: 'Secondary',
    category: 'navigation',
    parent: 'activity_log'
  },
  'activity_log_back_*': {
    label: '← Back',
    description: 'Return from activity log to previous panel',
    emoji: '◀',
    style: 'Secondary',
    category: 'navigation',
    parent: 'activity_log'
  },
  'admin_populate_logs': {
    label: 'Populate Logs',
    description: 'Backfill player activity logs from existing store and movement history',
    emoji: '📜',
    style: 'Secondary',
    category: 'admin',
    parent: 'reeces_stuff'
  },
  'admin_backfill_channel_logs': {
    label: 'Backfill Channel',
    description: 'Backfill activity logs from Safari Log channel messages (movement, currency, items, actions, whispers)',
    emoji: '📡',
    style: 'Secondary',
    category: 'admin',
    parent: 'reeces_stuff'
  },
  'export_channel': {
    label: 'Export Channel',
    description: 'Export all messages from a channel as a text file (REST API only, no Privileged Intents)',
    emoji: '📥',
    style: 'Secondary',
    category: 'admin',
    parent: 'reeces_stuff'
  },
  'export_channel_select': {
    label: 'Export Channel Select',
    description: 'Channel select handler for channel export feature',
    emoji: '📥',
    style: 'Secondary',
    category: 'admin',
    parent: 'export_channel'
  },

  // === MOAI (Claude Code Integration) ===
  'moai_ask': {
    label: 'Ask Moai',
    description: 'Open the Moai prompt modal for Claude Code queries',
    emoji: '🗿',
    style: 'Secondary',
    requiresModal: true,
    category: 'moai',
    parent: 'reeces_stuff'
  },
  'moai_ask_ctx_*': {
    label: 'Ask Another',
    description: 'Ask Moai a follow-up question with previous response context',
    emoji: '🗿',
    style: 'Secondary',
    requiresModal: true,
    category: 'moai',
    parent: 'moai_ask'
  },
  'moai_share_*': {
    label: 'Share',
    description: 'Share Moai response publicly in channel',
    emoji: '📤',
    style: 'Secondary',
    category: 'moai',
    parent: 'moai_ask'
  },
  'moai_restart_dev': {
    label: 'Restart Dev',
    description: 'Restart CastBot development server via dev-restart.sh',
    emoji: '🔄',
    style: 'Danger',
    category: 'moai',
    parent: 'moai_ask'
  },

  // ═══════════════════════════════════════════════════════════════
  // AUTO-REGISTERED: Factory handlers missing wildcard registry entries
  // Added 2026-03-24 — these were already using ButtonHandlerFactory
  // but showed [🪨 LEGACY] because they weren't in the registry.
  // ═══════════════════════════════════════════════════════════════

  // Season Applications
  'app_config_selection': { label: 'App Config Selection', emoji: '📋', category: 'seasons' },
  'app_dnc_edit_*': { label: 'DNC Edit (Legacy)', emoji: '🚷', category: 'seasons' },
  'casting_status_*': { label: 'Casting Status', emoji: '🎭', category: 'seasons' },
  'question_add_*': { label: 'Add Question', emoji: '➕', category: 'seasons' },
  'question_add_dnc': { label: 'Add DNC Question', emoji: '🚷', category: 'seasons' },
  'question_select_*': { label: 'Question Select', emoji: '📝', category: 'seasons' },
  'rank_applicant_*': { label: 'Rank Applicant', emoji: '⭐', category: 'seasons' },
  'ranking_navigation_*': { label: 'Ranking Navigation', emoji: '🔄', category: 'seasons' },
  'ranking_select_*': { label: 'Ranking Select', emoji: '🏆', category: 'seasons' },
  'save_player_notes_*': { label: 'Save Player Notes', emoji: '📝', category: 'seasons' },
  'season_new_question_config_*': { label: 'New Question Config', emoji: '⚙️', category: 'seasons' },
  'season_post_button_config_*': { label: 'Post Button Config', emoji: '📮', category: 'seasons' },

  // Season Planner
  'planner_challenge_edit_*': { label: 'Planner Challenge Edit', emoji: '🏃', category: 'planner' },
  'planner_ideas_save': { label: 'Planner Ideas Save', emoji: '💡', category: 'planner' },
  'planner_modal_submit': { label: 'Planner Modal Submit', emoji: '📋', category: 'planner' },
  'planner_ranking_legacy_*': { label: 'Planner Ranking', emoji: '🏆', category: 'planner' },
  'planner_round_action_*': { label: 'Planner Round Action', emoji: '🎯', category: 'planner' },
  'planner_round_edit_submit': { label: 'Planner Round Edit Submit', emoji: '✏️', category: 'planner' },
  'planner_toolbar_noop': { label: 'Planner Toolbar', emoji: '🔧', category: 'planner' },

  // Safari Actions / Outcomes
  'safari_currency_amount_*': { label: 'Currency Amount', emoji: '💰', category: 'safari_actions' },
  'safari_currency_execute_on_*': { label: 'Currency Execute On', emoji: '💰', category: 'safari_actions' },
  'safari_currency_limit_*': { label: 'Currency Limit', emoji: '💰', category: 'safari_actions' },
  'safari_currency_modal_*': { label: 'Currency Modal', emoji: '💰', category: 'safari_actions' },
  'safari_currency_reset_*': { label: 'Currency Reset', emoji: '💰', category: 'safari_actions' },
  'safari_display_text_edit_*': { label: 'Display Text Edit', emoji: '💬', category: 'safari_actions' },
  'safari_display_text_execute_on_*': { label: 'Display Text Execute On', emoji: '💬', category: 'safari_actions' },
  'safari_drop_reset_*': { label: 'Drop Reset', emoji: '🔄', category: 'safari_actions' },
  'safari_drop_save_*': { label: 'Drop Save', emoji: '💾', category: 'safari_actions' },
  'safari_drop_style_*': { label: 'Drop Style', emoji: '🎨', category: 'safari_actions' },
  'safari_drop_style_select_*': { label: 'Drop Style Select', emoji: '🎨', category: 'safari_actions' },
  'safari_drop_type_*': { label: 'Drop Type', emoji: '📦', category: 'safari_actions' },
  'safari_drop_type_select_*': { label: 'Drop Type Select', emoji: '📦', category: 'safari_actions' },
  'safari_followup_execute_on_*': { label: 'Followup Execute On', emoji: '🔗', category: 'safari_actions' },
  'safari_followup_save_*': { label: 'Followup Save', emoji: '💾', category: 'safari_actions' },
  'safari_item_execute_on_*': { label: 'Item Execute On', emoji: '📦', category: 'safari_actions' },
  'safari_item_reset_*': { label: 'Item Reset', emoji: '🔄', category: 'safari_actions' },
  'safari_role_select_*': { label: 'Role Select', emoji: '🎭', category: 'safari_actions' },
  'safari_role_update_*': { label: 'Role Update', emoji: '🎭', category: 'safari_actions' },
  'condition_currency_operator_*': { label: 'Condition Currency Op', emoji: '⚖️', category: 'safari_actions' },
  'condition_has_toggle_*': { label: 'Condition Has Toggle', emoji: '🔀', category: 'safari_actions' },
  'configure_input_label_*': { label: 'Configure Input Label', emoji: '🏷️', category: 'safari_actions' },
  'custom_action_search_again_*': { label: 'Action Search Again', emoji: '🔍', category: 'safari_actions' },

  // Safari General
  'safari_menu_*': { label: 'Safari Menu', emoji: '🦁', category: 'safari' },
  'safari_inv_page_*': { label: 'Safari Inventory Page', emoji: '🎒', category: 'safari' },

  // Safari Map
  'map_admin_blacklist_modal_*': { label: 'Map Blacklist Modal', emoji: '🗺️', category: 'safari_map' },
  'map_admin_edit_items_deprecated_*': { label: 'Map Edit Items (Deprecated)', emoji: '🗺️', category: 'safari_map' },
  'map_admin_refresh_anchors_modal_*': { label: 'Map Refresh Anchors Modal', emoji: '🗺️', category: 'safari_map' },
  'map_admin_view_inventory_*': { label: 'Map View Inventory', emoji: '🎒', category: 'safari_map' },
  'map_currency_drop_player_*': { label: 'Map Currency Drop', emoji: '💰', category: 'safari_map' },
  'map_item_drop_player_*': { label: 'Map Item Drop', emoji: '📦', category: 'safari_map' },
  'map_location_display_*': { label: 'Map Location Display', emoji: '📍', category: 'safari_map' },
  'safari_map_admin_player_*': { label: 'Map Admin Player', emoji: '👤', category: 'safari_map' },

  // Challenges
  'challenge_action_back_*': { label: 'Challenge Action Back', emoji: '⬅️', category: 'challenges' },
  'challenge_action_search_*': { label: 'Challenge Action Search', emoji: '🔍', category: 'challenges' },
  'challenge_action_toggle_*': { label: 'Challenge Action Toggle', emoji: '🔀', category: 'challenges' },
  'challenge_actions_*': { label: 'Challenge Actions', emoji: '🏃', category: 'challenges' },
  'challenge_modal_submit': { label: 'Challenge Modal Submit', emoji: '📋', category: 'challenges' },
  'challenge_post_send_*': { label: 'Challenge Post Send', emoji: '📮', category: 'challenges' },
  'challenge_round_link_*': { label: 'Challenge Round Link', emoji: '🔗', category: 'challenges' },
  'challenge_round_picker_*': { label: 'Challenge Round Picker', emoji: '🎯', category: 'challenges' },
  'challenge_round_search_submit': { label: 'Challenge Round Search', emoji: '🔍', category: 'challenges' },
  'challenge_search_submit': { label: 'Challenge Search', emoji: '🔍', category: 'challenges' },

  // D20 / Probability
  'd20_dc_submit': { label: 'D20 DC Submit', emoji: '🎲', category: 'd20' },
  'd20_display_mode_*': { label: 'D20 Display Mode', emoji: '🎲', category: 'd20' },
  'd20_mod_submit': { label: 'D20 Mod Submit', emoji: '🎲', category: 'd20' },
  'd20_result_submit': { label: 'D20 Result Submit', emoji: '🎲', category: 'd20' },
  'd20_set_dc_*': { label: 'D20 Set DC', emoji: '🎲', category: 'd20' },
  'd20_set_mod_*': { label: 'D20 Set Mod', emoji: '🎲', category: 'd20' },
  'd20_set_result_*': { label: 'D20 Set Result', emoji: '🎲', category: 'd20' },
  'prob_display_mode_*': { label: 'Probability Display', emoji: '📊', category: 'd20' },
  'prob_modal_submit': { label: 'Probability Modal', emoji: '📊', category: 'd20' },
  'prob_set_modal_*': { label: 'Probability Set Modal', emoji: '📊', category: 'd20' },

  // Entity Management
  'entity_custom_action_edit_*': { label: 'Entity Action Edit', emoji: '⚡', category: 'entity_management' },
  'modal_attr_edit_*': { label: 'Attribute Edit Modal', emoji: '📊', category: 'entity_management' },
  'search_term_*': { label: 'Search Term', emoji: '🔍', category: 'entity_management' },

  // Admin / Analytics
  'castlist_hub_*': { label: 'Castlist Hub', emoji: '📋', category: 'admin' },
  'nuke_roles_cancel': { label: 'Nuke Roles Cancel', emoji: '❌', category: 'admin' },
  'nuke_roles_confirm': { label: 'Nuke Roles Confirm', emoji: '💀', category: 'admin' },
  'prod_add_timezone_select': { label: 'Add Timezone Select', emoji: '🕐', category: 'admin' },
  'server_stats_page_*': { label: 'Server Stats Page', emoji: '📊', category: 'analytics' },

  // Import/Export
  'file_import_submit': { label: 'File Import Submit', emoji: '📥', category: 'import_export' },
  'library_publish_submit': { label: 'Library Publish', emoji: '📤', category: 'import_export' },
  'library_search_submit': { label: 'Library Search', emoji: '🔍', category: 'import_export' },

  // Stress Test (Legacy)
  'stress_edit_season_modal_legacy': { label: 'Stress Edit Season', emoji: '🧪', category: 'stress_test' },
  'stress_page_legacy_*': { label: 'Stress Page', emoji: '🧪', category: 'stress_test' },
  'stress_select_legacy': { label: 'Stress Select', emoji: '🧪', category: 'stress_test' },

  // Panel
  'panel_name_*': { label: 'Panel Name', emoji: '🏷️', category: 'panel' }
};

/**
 * Menu Factory - Reusable menu patterns and configurations
 */
export const MENU_FACTORY = {
  reece_analytics: {
    title: 'Analytics & Admin Menu',
    description: 'Analytics tools and admin functions for Reece',
    restrictedUser: '391415444084490240',
    layout: [
      // Row 1: Analytics Functions
      ['prod_analytics_dump', 'prod_live_analytics', 'prod_server_usage_stats'],
      // Row 2: Admin Functions
      ['prod_toggle_live_analytics', 'test_role_hierarchy', 'nuke_roles'],
      // Row 3: Danger Zone - Data Nukes
      ['emergency_app_reinit', 'nuke_player_data', 'nuke_safari_content'],
      // Row 4: Navigation
      ['prod_menu_back']
    ],
    maxButtonsPerRow: 5,
    ephemeral: true
  }
};

/**
 * Button Registry Helper Functions
 */
export const ButtonRegistry = {
  /**
   * Find button by label (case-insensitive)
   * @param {string} label - Button label to search for
   * @returns {string|null} Button ID or null if not found
   */
  findByLabel(label) {
    const searchLabel = label.toLowerCase();
    for (const [id, button] of Object.entries(BUTTON_REGISTRY)) {
      if (button.label.toLowerCase().includes(searchLabel)) {
        return id;
      }
    }
    return null;
  },

  /**
   * Find button by description (case-insensitive)
   * @param {string} description - Description text to search for
   * @returns {string|null} Button ID or null if not found
   */
  findByDescription(description) {
    const searchDesc = description.toLowerCase();
    for (const [id, button] of Object.entries(BUTTON_REGISTRY)) {
      if (button.description.toLowerCase().includes(searchDesc)) {
        return id;
      }
    }
    return null;
  },

  /**
   * Get all buttons for a specific menu
   * @param {string} menuId - Menu ID to get buttons for
   * @returns {Object[]} Array of button objects with IDs
   */
  getMenuButtons(menuId) {
    const buttons = [];
    for (const [id, button] of Object.entries(BUTTON_REGISTRY)) {
      if (button.parent === menuId) {
        buttons.push({ id, ...button });
      }
    }
    return buttons;
  },

  /**
   * Get button information by ID
   * @param {string} buttonId - Button ID to look up
   * @returns {Object|null} Button object or null if not found
   */
  getButton(buttonId) {
    return BUTTON_REGISTRY[buttonId] || null;
  },

  /**
   * Search buttons by category
   * @param {string} category - Category to search for
   * @returns {Object[]} Array of button objects with IDs
   */
  findByCategory(category) {
    const buttons = [];
    for (const [id, button] of Object.entries(BUTTON_REGISTRY)) {
      if (button.category === category) {
        buttons.push({ id, ...button });
      }
    }
    return buttons;
  },

  /**
   * Natural language search across all button properties
   * @param {string} query - Search query
   * @returns {Object[]} Array of matching button objects with IDs
   */
  search(query) {
    const searchQuery = query.toLowerCase();
    const results = [];
    
    for (const [id, button] of Object.entries(BUTTON_REGISTRY)) {
      const searchText = [
        button.label,
        button.description,
        button.category,
        id
      ].join(' ').toLowerCase();
      
      if (searchText.includes(searchQuery)) {
        results.push({ id, ...button });
      }
    }
    
    return results;
  }
};

/**
 * Menu Factory Helper Functions
 */
export const MenuFactory = {
  /**
   * Get menu configuration by ID
   * @param {string} menuId - Menu ID to look up
   * @returns {Object|null} Menu configuration or null if not found
   */
  getMenu(menuId) {
    return MENU_FACTORY[menuId] || null;
  },

  /**
   * Create Discord components for a menu
   * @param {string} menuId - Menu ID to create components for
   * @returns {Object[]} Array of Discord ActionRow components
   */
  createComponents(menuId) {
    const menu = MENU_FACTORY[menuId];
    if (!menu) return [];

    const components = [];
    
    for (const row of menu.layout) {
      const buttons = row.map(buttonId => {
        const buttonConfig = BUTTON_REGISTRY[buttonId];
        if (!buttonConfig) {
          console.warn(`Button ${buttonId} not found in registry`);
          return null;
        }
        
        return {
          type: 2, // Button
          custom_id: buttonId,
          label: buttonConfig.label,
          style: this.getButtonStyle(buttonConfig.style),
          emoji: buttonConfig.emoji ? { name: buttonConfig.emoji } : undefined
        };
      }).filter(Boolean);

      if (buttons.length > 0) {
        components.push({
          type: 1, // ActionRow
          components: buttons
        });
      }
    }

    return components;
  },

  /**
   * Convert style name to Discord button style number
   * @param {string} styleName - Style name (Primary, Secondary, Success, Danger)
   * @returns {number} Discord button style number
   */
  getButtonStyle(styleName) {
    const styles = {
      'Primary': 1,
      'Secondary': 2,
      'Success': 3,
      'Danger': 4
    };
    return styles[styleName] || 2; // Default to Secondary
  }
};

/**
 * Extract context from Discord button interaction request
 * @param {Object} req - Express request object
 * @returns {Object} Extracted context object
 */
export function extractButtonContext(req) {
  return {
    guildId: req.body.guild_id,
    userId: req.body.member?.user?.id || req.body.user?.id,
    member: req.body.member,
    channelId: req.body.channel_id,
    channelName: req.body.channel?.name || 'Unknown',
    messageId: req.body.message?.id,
    message: req.body.message, // Add full message object for UPDATE_MESSAGE handlers
    token: req.body.token,
    applicationId: req.body.application_id || process.env.APP_ID,
    customId: req.body.data?.custom_id,
    values: req.body.data?.values,
    components: req.body.data?.components || req.body.message?.components
  };
}

/**
 * Check if member has required permission
 * @param {Object} member - Discord member object
 * @param {BigInt} permission - Discord permission flag
 * @returns {boolean} Whether member has permission
 */
export function hasPermission(member, permission) {
  if (!member?.permissions) return false;
  return (BigInt(member.permissions) & permission) !== 0n;
}

/**
 * Send standard error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message to display
 * @param {boolean} ephemeral - Whether message should be ephemeral
 */
export function sendErrorResponse(res, message = '❌ An error occurred. Please try again.', ephemeral = true) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: message,
      flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : 0
    }
  });
}

/**
 * Send permission denied response
 * @param {Object} res - Express response object
 * @param {string} permissionName - Name of required permission
 */
export function sendPermissionDenied(res, permissionName) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `❌ You need ${permissionName} permission to use this feature.`,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  });
}

/**
 * Send response with proper type detection
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {boolean} updateMessage - Whether to update existing message
 */
export function sendResponse(res, data, updateMessage = false) {
  // Response validation - prevent common Discord rejection patterns
  const validateResponse = (responseData) => {
    if (updateMessage) {
      // For UPDATE_MESSAGE, check for empty content patterns
      const { content = '', components = [], embeds = [] } = responseData;
      const hasContent = content && content.trim().length > 0;
      const hasComponents = components.length > 0;
      const hasEmbeds = embeds.length > 0;
      
      if (!hasContent && !hasComponents && !hasEmbeds) {
        console.warn('⚠️ WARNING: Completely empty UPDATE_MESSAGE detected - Discord may reject this');
        return false;
      }
      
      // Check for Components V2 structure
      if (hasComponents) {
        const hasComponentsV2 = components.some(comp => comp.type === 17); // Container type
        if (!hasComponentsV2 && responseData.flags && (responseData.flags & (1 << 15))) {
          console.warn('⚠️ WARNING: Components V2 flag set but no Container component found');
        }
      }
    }
    return true;
  };

  // If the response already has a type set (like MODAL), send it directly
  if (data.type) {
    console.log(`📝 Sending ${data.type} response directly [📝 MODAL]`);
    return res.send(data);
  }

  // For UPDATE_MESSAGE responses
  if (updateMessage) {
    console.log(`📝 [⚡ IMMEDIATE-UPDATE]${data.ephemeral ? ' [🔒 EPHEMERAL]' : ''} — UPDATE_MESSAGE (no flags)`);
    // CRITICAL: UPDATE_MESSAGE cannot have flags - Discord will reject the interaction
    // Always strip flags and ephemeral for UPDATE_MESSAGE responses
    const { flags, ephemeral, ...cleanData } = data;
    
    // Validate the response
    if (!validateResponse(cleanData)) {
      console.error('❌ VALIDATION FAILED: Response may be rejected by Discord');
    }
    
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: cleanData
    });
  }
  
  // For new messages, handle flags normally
  let flags = data.flags || 0;
  if (data.ephemeral) {
    flags |= InteractionResponseFlags.EPHEMERAL;
  }
  
  // CRITICAL: Always add IS_COMPONENTS_V2 flag when components are present
  if (data.components && data.components.length > 0) {
    flags |= (1 << 15); // IS_COMPONENTS_V2
  }

  const visTag = (flags & InteractionResponseFlags.EPHEMERAL) ? ' [🔒 EPHEMERAL]' : ' [👁️ PUBLIC]';
  console.log(`📝 [⚡ IMMEDIATE-NEW]${visTag} — CHANNEL_MESSAGE_WITH_SOURCE`);

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      ...data,
      flags: flags
    }
  });
}

/**
 * Send deferred response for long-running operations
 * @param {Object} res - Express response object
 * @param {boolean} ephemeral - Whether response should be ephemeral
 * @param {boolean} updateMessage - Whether to update existing message (vs create new)
 */
export async function sendDeferredResponse(res, ephemeral = true, updateMessage = false) {
  // For button/select interactions that update existing messages, use DEFERRED_UPDATE_MESSAGE
  if (updateMessage) {
    console.log(`📝 [🔄 DEFERRED-UPDATE] — silent ACK, will PATCH @original`);
    return res.send({
      type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      data: {}
    });
  }

  // For new messages (slash commands), use DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  const visTag = ephemeral ? ' [🔒 EPHEMERAL]' : ' [👁️ PUBLIC]';
  console.log(`📝 [🔄 DEFERRED-NEW]${visTag} — "thinking...", will PATCH @original`);
  return res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : 0
    }
  });
}

/**
 * Update deferred response via webhook
 * @param {string} token - Interaction token
 * @param {Object} data - Response data
 */
export async function updateDeferredResponse(token, data) {
  const endpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`;

  // Simplified logging - just show key info
  const isComponentsV2 = data.components?.[0]?.type === 17;
  console.log(`📝 [🔗 WEBHOOK-PATCH] — updating @original${isComponentsV2 ? ' (Components V2)' : ''}`);

  // Transform Components V2 container structure for webhook PATCH
  const webhookData = {
    ...data
  };

  // CRITICAL: Remove ALL legacy fields for Components V2 - Discord error prevention
  if (data.components && data.components.length > 0 && data.components[0].type === 17) {
    // Components V2 cannot use ANY legacy fields - remove them if present
    delete webhookData.content;
    delete webhookData.embeds;
    delete webhookData.attachments;
    delete webhookData.allowed_mentions;
    delete webhookData.tts;
    // Removed verbose log - operation is implied
  }

  // CRITICAL: Preserve IS_COMPONENTS_V2 flag for Components V2 messages
  // Discord requires this flag to remain set once used - cannot be removed
  let flags = data.flags || 0;
  if (data.components && data.components.length > 0 && data.components[0].type === 17) {
    // Ensure IS_COMPONENTS_V2 flag is set for container responses
    flags |= (1 << 15); // IS_COMPONENTS_V2
  }
  if (data.ephemeral) {
    flags |= InteractionResponseFlags.EPHEMERAL;
  }
  webhookData.flags = flags;

  // If this is a Components V2 response, preserve Container structure
  if (data.components && data.components.length > 0 && data.components[0].type === 17) {
    // CRITICAL: Keep Components V2 flag and Container structure
    // Discord error: MESSAGE_CANNOT_REMOVE_COMPONENTS_V2_FLAG
    // Must preserve both the flag and the Container format for webhook PATCH
    webhookData.flags = webhookData.flags | (1 << 15); // Ensure IS_COMPONENTS_V2 flag is set

    // Simplified log - just confirm V2 preservation
    console.log(`✅ updateDeferredResponse: Components V2 preserved`);
  }

  return DiscordRequest(endpoint, {
    method: 'PATCH',
    body: webhookData
  });
}

/**
 * Create a follow-up message via webhook (posts NEW message)
 * @param {string} token - Interaction token
 * @param {Object} data - Response data
 */
export async function createFollowupMessage(token, data) {
  const endpoint = `webhooks/${process.env.APP_ID}/${token}`;

  const isComponentsV2 = data.components?.[0]?.type === 17;
  console.log(`📝 [🔗 WEBHOOK-POST] — new follow-up message${isComponentsV2 ? ' (Components V2)' : ''}`);

  // Transform Components V2 container structure for webhook POST
  const webhookData = {
    ...data
  };

  // Remove legacy fields for Components V2
  if (data.components && data.components.length > 0 && data.components[0].type === 17) {
    delete webhookData.content;
    delete webhookData.embeds;
    delete webhookData.attachments;
    delete webhookData.allowed_mentions;
    delete webhookData.tts;
  }

  // Set flags (ephemeral, Components V2)
  let flags = data.flags || 0;
  if (data.components && data.components.length > 0 && data.components[0].type === 17) {
    flags |= (1 << 15); // IS_COMPONENTS_V2
  }
  if (data.ephemeral) {
    flags |= InteractionResponseFlags.EPHEMERAL;
  }
  webhookData.flags = flags;

  return DiscordRequest(endpoint, {
    method: 'POST',
    body: webhookData
  });
}

/**
 * Button Handler Factory
 * 
 * Creates standardized button handlers with automatic:
 * - Context extraction
 * - Permission checking
 * - Error handling
 * - Response formatting
 */
export class ButtonHandlerFactory {
  /**
   * Create a button handler with factory pattern
   * @param {Object} config - Handler configuration
   * @param {string} config.id - Handler ID for logging
   * @param {BigInt} config.requiresPermission - Required Discord permission
   * @param {string} config.permissionName - Human-readable permission name
   * @param {Function} config.handler - Handler function
   * @param {boolean} config.deferred - Whether to use deferred response
   * @param {boolean} config.updateMessage - Whether to update existing message
   * @returns {Function} Handler function
   */
  static create(config) {
    // followUp: true is an alias for deferred + new follow-up message (not PATCH @original)
    if (config.followUp) {
      config.deferred = true;
      config.updateMessage = false;
    }

    // Auto-register in BUTTON_REGISTRY if not already present (prevents false [🪨 LEGACY] flags)
    if (config.id && !BUTTON_REGISTRY[config.id] && !BUTTON_REGISTRY[config.id + '_*']) {
      BUTTON_REGISTRY[config.id + '_*'] = { label: config.id, autoRegistered: true };
    }

    return async (req, res, client) => {
      try {
        // 0. Runtime auto-register: if custom_id doesn't match any registry entry, register its prefix
        const runtimeCustomId = req.body?.data?.custom_id;
        if (runtimeCustomId && !BUTTON_REGISTRY[runtimeCustomId]) {
          // Extract base prefix (everything before the last numeric/dynamic segment)
          const basePrefix = runtimeCustomId.replace(/_[a-f0-9]{10,}.*$|_\d+$/, '');
          if (basePrefix && !BUTTON_REGISTRY[basePrefix + '_*']) {
            BUTTON_REGISTRY[basePrefix + '_*'] = { label: config.id || basePrefix, autoRegistered: true, requiresModal: config.requiresModal };
          }
        }

        // 1. Extract context
        const context = extractButtonContext(req);
        
        // 2. Add client and guild to context
        context.client = client;
        if (context.guildId && client) {
          context.guild = await client.guilds.fetch(context.guildId);
        }
        
        // 3. Permission checking
        if (config.requiresPermission) {
          if (!hasPermission(context.member, config.requiresPermission)) {
            return sendPermissionDenied(res, config.permissionName || 'required permissions');
          }
        }
        
        // 4. Handle deferred response
        if (config.deferred) {
          await sendDeferredResponse(res, config.ephemeral !== false, config.updateMessage);
        }

        // 5. Execute handler logic
        const result = await config.handler(context, req, res, client);
        
        // 6. Send response (skip if deferred or handler sent response)
        if (!config.deferred && result && !res.headersSent) {
          // CRITICAL: Modal responses cannot be sent as UPDATE_MESSAGE
          const isModal = result.type === InteractionResponseType.MODAL;
          const shouldUpdateMessage = config.updateMessage && !isModal;

          // Inject ephemeral flag from config into result data
          if (config.ephemeral && !shouldUpdateMessage && !isModal) {
            result.ephemeral = true;
          }

          console.log(`🔍 ButtonHandlerFactory sending response for ${config.id}, updateMessage: ${shouldUpdateMessage}, isModal: ${isModal}`);
          return sendResponse(res, result, shouldUpdateMessage);
        }
        
        // 7. Handle deferred response update
        if (config.deferred && result) {
          // Check if this is a modal response - modals can't be sent via webhook
          if (result.type === InteractionResponseType.MODAL) {
            console.error(`🚨 ButtonHandlerFactory: Cannot send modal via deferred response for ${config.id}`);
            console.error(`🚨 Solution: Remove deferred: true from handler config when returning modals`);
            // Send error message instead
            return updateDeferredResponse(context.token, {
              content: '❌ Unable to display modal. Please try again.',
              flags: (1 << 15) | (1 << 6) // IS_COMPONENTS_V2 + EPHEMERAL
            });
          }

          // Unwrap data field if handler returned full interaction response
          // Some handlers return { type: 4, data: {...} } instead of just {...}
          const webhookData = result.data || result;

          // Choose between updating existing message or creating new follow-up
          if (config.updateMessage === false) {
            // Create NEW follow-up message (for visual history tracking)
            return createFollowupMessage(context.token, webhookData);
          } else {
            // Update existing message (default behavior)
            return updateDeferredResponse(context.token, webhookData);
          }
        }
        
      } catch (error) {
        console.error(`Error in ${config.id} handler:`, error);
        
        // Handle error response based on whether we've already sent a response
        if (config.deferred && !res.headersSent) {
          // For deferred responses, update via webhook
          try {
            const { sanitizeErrorMessage } = await import('./utils.js');
            const errorMessage = sanitizeErrorMessage(error);
            return updateDeferredResponse(context.token, {
              components: [{
                type: 17, accent_color: 0xe74c3c,
                components: [
                  { type: 10, content: `## ❌ Error\n\n${errorMessage}` }
                ]
              }]
            });
          } catch (webhookError) {
            console.error(`Failed to update deferred response for ${config.id}:`, webhookError);
          }
        } else if (!res.headersSent) {
          // For immediate responses, send error
          return sendErrorResponse(res);
        }
      }
    };
  }
}

// CIF — ComponentInteractionFactory (the accurate name)
// ButtonHandlerFactory is kept for backwards compatibility
export { ButtonHandlerFactory as ComponentInteractionFactory };
export default ButtonHandlerFactory;