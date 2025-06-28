// Permission utility functions for Discord interactions
// Consolidates repeated permission checking patterns from app.js

import { 
  InteractionResponseType, 
  InteractionResponseFlags 
} from 'discord-interactions';
import { PermissionFlagsBits } from 'discord.js';

/**
 * Check if a member has the required permission and send error response if not
 * @param {Object} req - Express request object containing Discord interaction
 * @param {Object} res - Express response object  
 * @param {BigInt} requiredPermission - Discord permission flag (e.g., PermissionFlagsBits.ManageRoles)
 * @param {string} customMessage - Optional custom error message
 * @returns {boolean} True if user has permission, false if permission denied (and error sent)
 */
export function requirePermission(req, res, requiredPermission, customMessage = null) {
    const member = req.body.member;
    
    if (!member?.permissions || !(BigInt(member.permissions) & requiredPermission)) {
        const defaultMessages = {
            [PermissionFlagsBits.ManageRoles]: 'You need Manage Roles permission to use this feature.',
            [PermissionFlagsBits.ManageChannels]: 'You need Manage Channels permission to use this feature.',
            [PermissionFlagsBits.ManageGuild]: 'You need Manage Server permission to use this feature.',
            [PermissionFlagsBits.Administrator]: 'You need Administrator permission to use this feature.'
        };
        
        const message = customMessage || defaultMessages[requiredPermission] || 'You need additional permissions to use this feature.';
        
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `❌ ${message}`,
                flags: InteractionResponseFlags.EPHEMERAL
            }
        });
        return false;
    }
    return true;
}

/**
 * Check if a user has admin permissions (any admin-level permission)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} customMessage - Optional custom error message
 * @returns {boolean} True if user has admin permissions
 */
export function requireAdminPermission(req, res, customMessage = null) {
    const member = req.body.member;
    const memberPermissions = BigInt(member?.permissions || 0);
    
    const adminPermissions = [
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels, 
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.Administrator
    ];
    
    const hasAdminPermission = adminPermissions.some(perm => memberPermissions & perm);
    
    if (!hasAdminPermission) {
        const message = customMessage || 'You need admin permissions (Manage Roles, Manage Channels, Manage Server, or Administrator) to use this feature.';
        
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `❌ ${message}`,
                flags: InteractionResponseFlags.EPHEMERAL
            }
        });
        return false;
    }
    return true;
}

/**
 * Check if user matches a specific user ID restriction
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} allowedUserId - Discord user ID that's allowed
 * @param {string} customMessage - Optional custom error message
 * @returns {boolean} True if user is allowed
 */
export function requireSpecificUser(req, res, allowedUserId, customMessage = null) {
    const userId = req.body.member?.user?.id || req.body.user?.id;
    
    if (userId !== allowedUserId) {
        const message = customMessage || 'This feature is restricted.';
        
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `❌ ${message}`,
                flags: InteractionResponseFlags.EPHEMERAL
            }
        });
        return false;
    }
    return true;
}

/**
 * Check if user has permission without sending a response (for conditional logic)
 * @param {Object} member - Discord member object from req.body.member
 * @param {BigInt} requiredPermission - Discord permission flag
 * @returns {boolean} True if user has permission
 */
export function hasPermission(member, requiredPermission) {
    return member?.permissions && (BigInt(member.permissions) & requiredPermission);
}

/**
 * Common permission presets for easy use
 */
export const PERMISSIONS = {
    MANAGE_ROLES: PermissionFlagsBits.ManageRoles,
    MANAGE_CHANNELS: PermissionFlagsBits.ManageChannels,
    MANAGE_GUILD: PermissionFlagsBits.ManageGuild,
    ADMINISTRATOR: PermissionFlagsBits.Administrator
};