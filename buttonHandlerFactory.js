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
    style: 'Danger',
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

  // === SAFARI MENU SYSTEM ===
  'prod_safari_menu': {
    label: 'Safari',
    description: 'Safari dynamic content management system',
    emoji: '🦁',
    style: 'Primary',
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
  'safari_customize_terms': {
    label: '⚙️ Customize Safari',
    description: 'Customize Safari terminology and settings',
    emoji: '⚙️',
    style: 'Primary',
    category: 'safari'
  },
  'safari_round_results': {
    label: '🎨 Round Results',
    description: 'Safari round results management',
    emoji: '🎨',
    style: 'Primary',
    category: 'safari'
  },
  'safari_player_inventory': {
    label: '🦕 Player Inventory',
    description: 'Show current user Safari inventory',
    emoji: '🦕',
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
  'safari_item_create': {
    label: 'Create Item',
    description: 'Create new Safari item',
    emoji: '📝',
    style: 'Primary',
    category: 'safari_items'
  },
  'safari_item_list': {
    label: 'List Items',
    description: 'View all Safari items',
    emoji: '📋',
    style: 'Secondary',
    category: 'safari_items'
  },
  'safari_item_manage_existing': {
    label: 'Manage Items',
    description: 'Edit existing Safari items',
    emoji: '✏️',
    style: 'Secondary',
    category: 'safari_items'
  },
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
    messageId: req.body.message?.id,
    token: req.body.token,
    applicationId: req.body.application_id || process.env.APP_ID,
    customId: req.body.data?.custom_id,
    values: req.body.data?.values,
    components: req.body.message?.components
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
  // Preserve existing flags and add ephemeral if needed
  let flags = data.flags || 0;
  if (data.ephemeral) {
    flags |= InteractionResponseFlags.EPHEMERAL;
  }
  
  return res.send({
    type: updateMessage 
      ? InteractionResponseType.UPDATE_MESSAGE 
      : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
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
          return sendResponse(res, result, config.updateMessage);
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