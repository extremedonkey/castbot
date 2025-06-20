/**
 * Button Handler Utilities
 * 
 * Centralized helper functions to ensure consistent button handler implementations
 * and prevent common errors like undefined variables and missing context.
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { PermissionFlagsBits } from 'discord.js';

/**
 * Extract standard context from Discord interaction request body
 * @param {Object} reqBody - The req.body from Discord interaction
 * @returns {Object} Standardized context object with all common variables
 */
export function extractButtonContext(reqBody) {
    return {
        // Core identifiers
        guildId: reqBody.guild_id,
        userId: reqBody.member?.user?.id || reqBody.user?.id,
        channelId: reqBody.channel_id,
        
        // User/member data
        member: reqBody.member,
        user: reqBody.member?.user || reqBody.user,
        
        // Message context
        messageId: reqBody.message?.id,
        message: reqBody.message,
        
        // Interaction details
        customId: reqBody.data?.custom_id,
        componentType: reqBody.data?.component_type,
        values: reqBody.data?.values, // For select menus
        
        // API requirements
        token: reqBody.token,
        applicationId: reqBody.application_id || process.env.APP_ID,
        
        // Full request body (for edge cases)
        fullBody: reqBody
    };
}

/**
 * Check if member has required admin permissions
 * @param {Object} member - Discord member object
 * @param {BigInt} requiredPermission - Permission flag from PermissionFlagsBits
 * @returns {boolean} Whether member has the permission
 */
export function hasPermission(member, requiredPermission) {
    if (!member?.permissions) return false;
    return Boolean(BigInt(member.permissions) & requiredPermission);
}

/**
 * Send a standardized error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message to display
 * @param {InteractionResponseType} responseType - Type of response (default: CHANNEL_MESSAGE_WITH_SOURCE)
 */
export function sendErrorResponse(res, message = '❌ An error occurred. Please try again.', responseType = InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE) {
    return res.send({
        type: responseType,
        data: {
            content: message,
            flags: InteractionResponseFlags.EPHEMERAL
        }
    });
}

/**
 * Send a permission denied response
 * @param {Object} res - Express response object
 * @param {string} permissionName - Human-readable permission name
 */
export function sendPermissionDenied(res, permissionName = 'perform this action') {
    return sendErrorResponse(res, `❌ You need permission to ${permissionName}.`);
}

/**
 * Standard button handler wrapper with error handling
 * @param {Function} handler - The actual handler function
 * @param {string} handlerName - Name for logging purposes
 * @returns {Function} Wrapped handler with try-catch
 */
export function wrapButtonHandler(handler, handlerName) {
    return async (req, res, client) => {
        try {
            const context = extractButtonContext(req.body);
            console.log(`🔍 DEBUG: Processing ${handlerName} for user ${context.userId}`);
            return await handler(context, req, res, client);
        } catch (error) {
            console.error(`❌ Error in ${handlerName}:`, error);
            return sendErrorResponse(res);
        }
    };
}

/**
 * Check if user is restricted (for user-specific features)
 * @param {string} userId - User ID to check
 * @param {string} allowedUserId - Allowed user ID
 * @returns {boolean} Whether user is allowed
 */
export function isUserAllowed(userId, allowedUserId) {
    return userId === allowedUserId;
}

/**
 * Parse custom ID with underscore separators
 * @param {string} customId - The custom_id to parse
 * @param {number} expectedParts - Expected number of parts (optional)
 * @returns {Array} Array of ID parts
 */
export function parseCustomId(customId, expectedParts = null) {
    const parts = customId.split('_');
    if (expectedParts && parts.length < expectedParts) {
        console.warn(`⚠️ Custom ID '${customId}' has ${parts.length} parts, expected ${expectedParts}`);
    }
    return parts;
}

/**
 * Get Discord client objects safely
 * @param {Object} client - Discord.js client
 * @param {Object} context - Button context from extractButtonContext
 * @returns {Object} Safe references to guild and channel
 */
export function getDiscordObjects(client, context) {
    return {
        guild: client?.guilds?.cache?.get(context.guildId),
        channel: client?.channels?.cache?.get(context.channelId),
        member: context.member
    };
}

/**
 * Standard response builder for Components V2
 * @param {Object} data - Response data
 * @param {InteractionResponseType} type - Response type
 * @param {boolean} useComponentsV2 - Whether to add Components V2 flag
 * @returns {Object} Formatted response
 */
export function buildResponse(data, type = InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, useComponentsV2 = false) {
    const response = { type, data };
    
    if (useComponentsV2 && data) {
        data.flags = (data.flags || 0) | (1 << 15); // IS_COMPONENTS_V2
    }
    
    return response;
}

/**
 * Template for creating a new button handler
 * @example
 * const myHandler = createButtonHandler('my_button', async (context, req, res, client) => {
 *     // Your handler logic here
 *     // All context variables are already extracted and available
 *     const { guildId, userId, member } = context;
 *     
 *     // Permission check example
 *     if (!hasPermission(member, PermissionFlagsBits.ManageRoles)) {
 *         return sendPermissionDenied(res, 'manage roles');
 *     }
 *     
 *     // Your logic here...
 *     
 *     return res.send(buildResponse({
 *         content: 'Success!',
 *         components: []
 *     }));
 * });
 */
export function createButtonHandler(handlerName, handlerFunction) {
    return wrapButtonHandler(handlerFunction, handlerName);
}

// Export all utilities
export default {
    extractButtonContext,
    hasPermission,
    sendErrorResponse,
    sendPermissionDenied,
    wrapButtonHandler,
    isUserAllowed,
    parseCustomId,
    getDiscordObjects,
    buildResponse,
    createButtonHandler
};