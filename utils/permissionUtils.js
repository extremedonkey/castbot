// Permission utility functions for Discord interactions
// Consolidates repeated permission checking patterns from app.js
//
// 🚨 Every check here routes through utils/effectivePermissions.js — the single reader. Do NOT
// reintroduce a raw `BigInt(member.permissions) & X` here or at a call site:
//   • a raw `&` skips the Administrator override (locked Administrator-only hosts out of Casting,
//     2026-08-09)
//   • it also skips the Global Access grant, so whitelisted roles would work in some screens and
//     mysteriously not others
// See docs/infrastructure-security/SecurityArchitecture.md.

import {
  InteractionResponseType,
  InteractionResponseFlags
} from 'discord-interactions';
import { PermissionFlagsBits } from 'discord.js';
import { memberHasAnyPermission } from './effectivePermissions.js';

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
    const guildId = req.body.guild_id;

    if (!memberHasAnyPermission(member, guildId, requiredPermission)) {
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
 * Check if user has permission without sending a response (for conditional logic)
 * @param {Object} member - Discord member object from req.body.member
 * @param {BigInt} requiredPermission - Discord permission flag
 * @param {string} [guildId] - Pass it. Without it the Global Access whitelist is not consulted,
 *                             so a whitelisted host silently fails this one check.
 * @returns {boolean} True if user has permission
 */
export function hasPermission(member, requiredPermission, guildId) {
    return memberHasAnyPermission(member, guildId, requiredPermission);
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

// Removed 2026-08-09: `requireAdminPermission` and `requireSpecificUser` had zero call sites
// (flagged as dead code in RaP 0900 back on 2026-07-11 and never adopted). They were a trap —
// two more "blessed" primitives for an agent to pick, neither exercised by any test. Use
// `requirePermission` / `hasPermission`, or the factory's `security:` tier, instead.
