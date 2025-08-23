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
  // === REECE STUFF MENU SYSTEM ===
  'reece_stuff_menu': {
    label: 'Analytics',
    description: 'Main analytics and admin menu for Reece',
    emoji: '🧮',
    style: 'Secondary',
    menu: 'reece_analytics',
    parent: null,
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  
  // Analytics Row 1
  'prod_analytics_dump': {
    label: 'Server List',
    description: 'Analytics dump of all servers',
    emoji: '📊',
    style: 'Secondary',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'prod_live_analytics': {
    label: 'Print Logs',
    description: 'Display recent analytics logs',
    emoji: '📝',
    style: 'Secondary',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'prod_server_usage_stats': {
    label: 'Server Stats',
    description: 'Display server usage statistics',
    emoji: '📈',
    style: 'Secondary',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  
  // Analytics Row 2
  'prod_toggle_live_analytics': {
    label: 'Toggle Channel Logs',
    description: 'Toggle live analytics logging for current channel',
    emoji: '🔄',
    style: 'Secondary',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
    category: 'analytics'
  },
  'test_role_hierarchy': {
    label: 'Test Role Hierarchy',
    description: 'Test and display role hierarchy information',
    emoji: '🧪',
    style: 'Secondary',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
    category: 'testing'
  },
  'nuke_roles': {
    label: 'Nuke Roles',
    description: 'Remove all roles from server (DANGEROUS)',
    emoji: '💥',
    style: 'Danger',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
    category: 'admin'
  },
  'emergency_app_reinit': {
    label: 'Emergency Re-Init',
    description: 'Emergency re-initialization of season applications',
    emoji: '🚨',
    style: 'Danger',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
    category: 'emergency'
  },
  
  // Navigation
  'prod_menu_back': {
    label: '⬅ Menu',
    description: 'Return to main production menu',
    emoji: '⬅',
    style: 'Primary',
    parent: 'reece_stuff_menu',
    restrictedUser: '391415444084490240',
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
  
  // === PRODUCTION SETUP ===
  'prod_setup': {
    label: 'Setup',
    description: 'Setup CastBot pronoun and timezone roles for server',
    emoji: '⚙️',
    style: 'Primary',
    category: 'admin'
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

  // === SAFARI MENU SYSTEM ===
  'prod_safari_menu': {
    label: 'Safari',
    description: 'Safari dynamic content management system',
    emoji: '🦁',
    style: 'Primary',
    category: 'safari'
  },

  // Safari Button Management
  'safari_finish_button': {
    label: '← Location Manager',
    description: 'Navigate back to the Map Location Manager',
    emoji: '📍',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_remove_action': {
    label: 'Remove Action',
    description: 'Remove an action from a custom Safari button',
    emoji: '🗑️',
    style: 'Danger',
    category: 'safari'
  },
  'safari_edit_action': {
    label: 'Edit Action',
    description: 'Edit an existing action in a custom Safari button',
    emoji: '📝',
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
  'safari_location_editor': {
    label: 'Location Editor',
    description: 'Open map location editor interface',
    emoji: '📍',
    style: 'Secondary',
    category: 'safari'
  },
  'safari_action_editor': {
    label: 'Action Editor',
    description: 'Manage custom actions across all locations',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari'
  },

  // Safari Main Menu Buttons
  'safari_manage_safari_buttons': {
    label: '📌 Manage Safari Buttons',
    description: 'Create, edit, view, and post custom Safari buttons',
    emoji: '📌',
    style: 'Primary',
    category: 'safari'
  },
  'safari_manage_currency': {
    label: '💰 Manage Currency',
    description: 'Safari currency management - view all, set player currency, reset all',
    emoji: '💰',
    style: 'Primary',
    category: 'safari'
  },
  'safari_manage_stores': {
    label: '🏪 Manage Stores',
    description: 'Safari store management - create, edit, delete stores',
    emoji: '🏪',
    style: 'Primary',
    category: 'safari'
  },
  'safari_manage_items': {
    label: '📦 Manage Items',
    description: 'Safari item management - create, edit, manage items',
    emoji: '📦',
    style: 'Primary',
    category: 'safari'
  },
  'safari_use_item': {
    label: 'Use Item',
    description: 'Use a consumable item from inventory',
    emoji: '⚡',
    style: 'Success',
    category: 'safari'
  },
  'safari_customize_terms': {
    label: '⚙️ Customize Safari',
    description: 'Customize Safari terminology and settings',
    emoji: '⚙️',
    style: 'Primary',
    category: 'safari'
  },
  'safari_configure_log': {
    label: '📊 Logs',
    description: 'Configure Safari Log channel and settings',
    emoji: '📊',
    style: 'Secondary',
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
  'stamina_global_config': {
    label: 'Stamina Settings',
    description: 'Global stamina configuration (admin only)',
    emoji: '⚡',
    style: 'Secondary',
    category: 'safari_admin'
  },
  'safari_round_results': {
    label: '🎨 Round Results',
    description: 'Safari round results management',
    emoji: '🎨',
    style: 'Primary',
    category: 'safari'
  },
  'safari_player_inventory': {
    label: '📦 Player Inventory',
    description: 'Show current user Safari inventory',
    emoji: '📦',
    style: 'Primary',
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

  // Safari Currency Configuration (Custom Actions)
  'safari_currency_style_*': {
    label: 'Currency Style',
    description: 'Configure currency button style for custom actions',
    emoji: '🎨',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'safari_currency_save_*': {
    label: 'Save Currency',
    description: 'Save currency action configuration',
    emoji: '✅',
    style: 'Success',
    category: 'safari_management'
  },

  // Safari Map Admin
  'safari_map_admin': {
    label: 'Map Admin',
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
    label: 'Global Items',
    description: 'View all once_globally give_item actions across the map',
    emoji: '🎁',
    style: 'Secondary',
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
  'map_player_locations': {
    label: 'Player Locations',
    description: 'View all player locations on the map',
    emoji: '👥',
    style: 'Primary',
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
  'map_admin_init_player_*': {
    label: 'Initialize on Map',
    description: 'Initialize player at starting position',
    emoji: '🚀',
    style: 'Success',
    category: 'safari_map_admin'
  },
  'map_admin_move_player_*': {
    label: 'Move Player',
    description: 'Move player to specific coordinate',
    emoji: '📍',
    style: 'Primary',
    category: 'safari_map_admin'
  },
  'map_admin_grant_stamina_*': {
    label: 'Grant Stamina',
    description: 'Grant stamina points to player',
    emoji: '⚡',
    style: 'Success',
    category: 'safari_map_admin'
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
    label: 'Edit Items (WIP - use main items menu)',
    description: 'Manage player inventory items - currently disabled, use main items menu',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'map_admin_view_raw_*': {
    label: 'View Raw Data',
    description: 'View raw Safari data JSON',
    emoji: '📄',
    style: 'Secondary',
    category: 'safari_map_admin'
  },
  'map_admin_item_select_*': {
    label: 'Item Select',
    description: 'Select item for map admin quantity edit',
    emoji: '📦',
    style: 'Secondary',
    category: 'safari_map_admin',
    type: 'select_menu'
  },

  // Map Admin Player Management
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
  'entity_select': {
    label: 'Entity Selection',
    description: 'Handle entity selection from dropdown',
    emoji: '📋',
    style: 'Primary',
    category: 'entity_management'
  },
  'entity_field_group': {
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

  // === APPLICATION MANAGEMENT SYSTEM ===
  'season_management_menu': {
    label: 'Season Applications',
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
    label: 'Post Apps Button',
    description: 'Post the application button to a channel',
    emoji: '✅',
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
    label: 'Create App Button',
    description: 'Creates and posts the configured application button to the selected channel',
    emoji: '🎯',
    style: 'Success',
    category: 'application_management'
  },

  // === SAFARI CUSTOM ACTIONS SYSTEM ===
  'entity_custom_action_select': {
    label: 'Custom Actions',
    description: 'Manage custom actions for this location',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_management'
  },
  'entity_custom_action_select_*': {
    label: 'Custom Action Multi-Select',
    description: 'Select custom actions to assign to location',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'entity_custom_action_list_*': {
    label: 'Custom Action List',
    description: 'Select a custom action to manage or create new',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
  },
  'entity_custom_action_create': {
    label: 'Create New Action',
    description: 'Create a new custom action',
    emoji: '➕',
    style: 'Success',
    category: 'safari_management'
  },
  'entity_custom_action_edit_info_*': {
    label: 'Action Info',
    description: 'Edit custom action name and description',
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
  'custom_action_trigger_type_*': {
    label: 'Trigger Type Select',
    description: 'Select trigger type for custom action',
    emoji: '🎯',
    style: 'Secondary',
    category: 'safari_management',
    type: 'select_menu'
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
    emoji: '⌨️',
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
    label: 'Safari Custom Action',
    description: 'Execute custom action on map location',
    emoji: '⚡',
    style: 'Primary',
    category: 'safari_execution'
  },
  'safari_action_type_select': {
    label: 'Select Action Type',
    description: 'String select menu for choosing action type to add',
    emoji: '🎯',
    style: 'Primary',
    category: 'safari_management',
    type: 'select_menu'
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
  }
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
      ['prod_toggle_live_analytics', 'test_role_hierarchy', 'nuke_roles', 'emergency_app_reinit'],
      // Row 3: Navigation
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
    console.log(`📝 Sending ${data.type} response directly`);
    return res.send(data);
  }
  
  // For UPDATE_MESSAGE responses
  if (updateMessage) {
    console.log('📝 Sending UPDATE_MESSAGE response (no flags - Discord requirement)');
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
    console.log('🎯 Added IS_COMPONENTS_V2 flag for components response');
  }
  
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
 */
export async function sendDeferredResponse(res, ephemeral = true) {
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
  return DiscordRequest(endpoint, {
    method: 'PATCH',
    body: {
      ...data,
      flags: data.ephemeral ? InteractionResponseFlags.EPHEMERAL : (data.flags || 0)
    }
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
    return async (req, res, client) => {
      try {
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
          await sendDeferredResponse(res, config.ephemeral !== false);
        }
        
        // 5. Execute handler logic
        const result = await config.handler(context, req, res, client);
        
        // 6. Send response (skip if deferred or handler sent response)
        if (!config.deferred && result && !res.headersSent) {
          // CRITICAL: Modal responses cannot be sent as UPDATE_MESSAGE
          const isModal = result.type === InteractionResponseType.MODAL;
          const shouldUpdateMessage = config.updateMessage && !isModal;
          
          console.log(`🔍 ButtonHandlerFactory sending response for ${config.id}, updateMessage: ${shouldUpdateMessage}, isModal: ${isModal}`);
          return sendResponse(res, result, shouldUpdateMessage);
        }
        
        // 7. Handle deferred response update
        if (config.deferred && result) {
          return updateDeferredResponse(context.token, result);
        }
        
      } catch (error) {
        console.error(`Error in ${config.id} handler:`, error);
        
        // Handle error response based on whether we've already sent a response
        if (config.deferred && !res.headersSent) {
          // For deferred responses, update via webhook
          try {
            return updateDeferredResponse(context.token, {
              content: '❌ An error occurred. Please try again.',
              ephemeral: true
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

export default ButtonHandlerFactory;