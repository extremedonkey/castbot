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
 */

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
  return (BigInt(member.permissions) & permission) === permission;
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
  return res.send({
    type: updateMessage 
      ? InteractionResponseType.UPDATE_MESSAGE 
      : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      ...data,
      flags: data.ephemeral ? InteractionResponseFlags.EPHEMERAL : (data.flags || 0)
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