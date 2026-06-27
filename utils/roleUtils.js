// Role utility functions extracted from app.js
// Handles role hierarchy checks, permissions, and specialized role setup

import { PermissionFlagsBits } from 'discord.js';

/**
 * Check if bot has permission to assign a specific role
 * @param {Object} guild - Discord guild object
 * @param {string} roleId - Role ID to check
 * @param {Object} client - Discord client object (optional, will import if not provided)
 * @returns {Object} Result object with allowed status and reason
 */
export async function checkRoleHierarchyPermission(guild, roleId, client = null) {
  // Use provided client or import dynamically
  if (!client) {
    const importedModule = await import('../app.js');
    client = importedModule.client;
  }
  
  // Check if client and client.user are available
  if (!client || !client.user) {
    console.error('❌ Client or client.user is not available in checkRoleHierarchyPermission');
    return { 
      allowed: false, 
      reason: 'Bot client is not ready' 
    };
  }
  
  const bot = await guild.members.fetch(client.user.id);
  const role = await guild.roles.fetch(roleId);
  
  // Handle case where role was deleted
  if (!role) {
    console.log(`⚠️ SILENT: Role ${roleId} not found (likely deleted) - skipping role assignment`);
    return { 
      allowed: false, 
      reason: 'Role not found (may have been deleted)' 
    };
  }
  
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { 
      allowed: false, 
      reason: 'Bot is missing Manage Roles permission' 
    };
  }

  if (role.position >= bot.roles.highest.position) {
    return { 
      allowed: false, 
      reason: `Cannot assign role ${role.name} as it is higher than or equal to the bot's highest role. Go to Server Settings > Roles and drag the CastBot role to the very top of the list, so it is above your timezone and pronoun roles.` 
    };
  }

  return { allowed: true };
}

/**
 * Standardised Components V2 error shown when CastBot can't manage a role.
 *
 * Use this anywhere we add/remove Discord roles (pronouns, timezone, vanity sync, ban roles, etc.).
 * Returns a FULL Container response so it renders correctly on BOTH new messages AND UPDATE_MESSAGE —
 * returning a plain `{ content }` to UPDATE a Components V2 message is silently rejected by Discord,
 * producing the classic "This interaction failed" with no visible message (see ComponentsV2Issues.md §7).
 *
 * Most failures are code 50013 (Missing Permissions), which for role assignment almost always means a
 * role-hierarchy problem: CastBot's role sits below the role it's trying to manage.
 *
 * @param {Object} [opts]
 * @param {string} [opts.roleType='these'] - human label for the role family, e.g. 'pronoun' / 'timezone'
 * @param {string} [opts.roleName] - the specific role CastBot couldn't manage (optional, sharpens the copy)
 * @param {number} [opts.code] - the Discord error code (50013 → hierarchy guidance; anything else → generic)
 * @param {boolean} [opts.ephemeral=false] - add EPHEMERAL flag (for NEW messages; OMIT for UPDATE_MESSAGE,
 *                                            where ButtonHandlerFactory strips flags anyway)
 * @returns {Object} a Components V2 response object: { flags, components: [container] }
 */
export function roleErrorText({ roleType = 'these', roleName, code } = {}) {
  const what = roleName ? `the **${roleName}** role` : `${roleType} roles`;
  return code === 50013
    ? `### ⚠️ CastBot can't manage ${what}\n` +
      `Discord blocked the change because **CastBot's role is below ${what}** in the server's role list.\n` +
      `**Production team fix:** Server Settings → **Roles** → drag the **CastBot** role *above* ` +
      `${roleName ? `**${roleName}**` : `your ${roleType} roles`}, then try again.`
    : `### ❌ Couldn't update ${roleType}\n` +
      `Something went wrong assigning ${what} — the role may have been deleted. Please try again or ask the production team.`;
}

/**
 * Wraps roleErrorText() in a full Components V2 Container response — for STANDALONE contexts (a new
 * ephemeral message, or a handler that has nothing else to show). For handlers that re-render a menu,
 * prefer prepending `{ type: 10, content: roleErrorText(...) }` as a BANNER so the menu stays intact.
 * @param {Object} [opts] - { roleType, roleName, code, ephemeral }
 * @returns {Object} Components V2 response: { flags, components: [container] }
 */
export function buildRoleErrorResponse({ roleType = 'these', roleName, code, ephemeral = false } = {}) {
  let flags = (1 << 15); // IS_COMPONENTS_V2
  if (ephemeral) flags |= (1 << 6); // EPHEMERAL
  return {
    flags,
    components: [{
      type: 17, // Container
      accent_color: 0xED4245, // Discord red
      components: [{ type: 10, content: roleErrorText({ roleType, roleName, code }) }] // Text Display
    }]
  };
}

/**
 * Setup specialized Tycoons game roles
 * @param {Object} guild - Discord guild object
 * @returns {Object} Result object with created role IDs and formatted output
 */
export async function handleSetupTycoons(guild) {
  // Arrays to hold the role IDs for each category
  const moneyRoles = [];
  const safeFarmRoles = [];
  const riskyFarmRoles = [];
  const siloRoles = [];
  const attackRoles = [];

  try {
    // Create money balance roles: b.0 - b.9
    for (let i = 0; i <= 9; i++) {
      const roleName = `b.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons money balance role"
        });
      }
      moneyRoles.push(role.id);
    }

    // Create safe farm roles: pr.0 - pr.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `pr.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons safe farm role"
        });
      }
      safeFarmRoles.push(role.id);
    }

    // Create risky farm roles: lr.0 - lr.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `lr.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons risky farm role"
        });
      }
      riskyFarmRoles.push(role.id);
    }

    // Create silo roles: sr.0 - sr.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `sr.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons silo role"
        });
      }
      siloRoles.push(role.id);
    }

    // Create attack roles: ar.0 - ar.5
    for (let i = 0; i <= 5; i++) {
      const roleName = `ar.${i}`;
      let role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        role = await guild.roles.create({ 
          name: roleName,
          reason: "Tycoons attack role"
        });
      }
      attackRoles.push(role.id);
    }

    // Format the output in the required format
    return {
      moneyRoles,
      safeFarmRoles,
      riskyFarmRoles,
      siloRoles,
      attackRoles,
      formattedOutput: `Money Balance:\n{=(b):${moneyRoles.join('|')}}\n\nSafe Farm Balance:\n{=(pr):${safeFarmRoles.join('|')}}\n\nRisky Farm Balance:\n{=(lr):${riskyFarmRoles.join('|')}}\n\nSilo balance:\n{=(sr):${siloRoles.join('|')}}\n\nAttack name:\n{=(ar):${attackRoles.join('|')}}`
    };
  } catch (error) {
    console.error('Error setting up Tycoons roles:', error);
    throw error;
  }
}