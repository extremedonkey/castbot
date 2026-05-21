/**
 * Vanity Role Manager
 *
 * Admin cleanup tool for "vanity roles" — the cosmetic extra tribe roles stored at
 * playerData[guildId].players[playerId].vanityRoles[] and rendered as role mentions
 * on castlists (see castlistV2.js). They accumulate via the Tribe Swap/Merge feature
 * and have no removal path, so this tool wipes them in bulk.
 *
 * Flow (mirrors dataNuker.js):
 *   1. data_clear_vanity              → role-select screen (buildClearVanityUI)
 *   2. data_clear_vanity_select       → confirmation w/ impact counts (handleVanityRoleSelect)
 *   3. data_clear_vanity_confirm_<id> → execute + result (handleVanityClearConfirm)
 *
 * Scope: clears the cosmetic vanityRoles DATA only. The actual Discord role stays on
 * the member (consistent with how Tribe Swap leaves roles in place).
 */

import { loadPlayerData, savePlayerData } from './storage.js';

const ACCENT_RED = 0xe74c3c;

/**
 * PURE: given a guild's players map and the set of member IDs holding the selected role,
 * determine which players actually have vanity roles to clear and how many entries total.
 * Kept pure (no I/O) so it can be unit-tested without Discord/storage.
 *
 * @param {Object} players - playerData[guildId].players (id → player record)
 * @param {string[]} memberIdsWithRole - user IDs that have the selected role
 * @returns {{ idsToClear: string[], entriesRemoved: number, membersChecked: number }}
 */
export function computeVanityClear(players = {}, memberIdsWithRole = []) {
  const idsToClear = [];
  let entriesRemoved = 0;

  for (const id of memberIdsWithRole) {
    const vanity = players?.[id]?.vanityRoles;
    if (Array.isArray(vanity) && vanity.length > 0) {
      idsToClear.push(id);
      entriesRemoved += vanity.length;
    }
  }

  return { idsToClear, entriesRemoved, membersChecked: memberIdsWithRole.length };
}

/**
 * Resolve the member IDs that currently hold a role (REST member list → role cache).
 * @returns {Promise<{ roleName: string, memberIds: string[] }>}
 */
async function resolveRoleMembers(guildId, roleId, client) {
  const guild = await client.guilds.fetch(guildId);
  // Populate member cache so role.members is accurate (same pattern as castlistHub.js)
  await guild.members.list({ limit: 1000 });
  const role = guild.roles.cache.get(roleId);
  const memberIds = role ? Array.from(role.members.keys()) : [];
  return { roleName: role?.name || 'Unknown Role', memberIds };
}

/**
 * Screen 1: the Role Select picker.
 */
export function buildClearVanityUI() {
  return {
    components: [{
      type: 17, // Container
      accent_color: ACCENT_RED,
      components: [
        { type: 10, content: '## 🧹 Clear Vanity Roles' },
        { type: 14 },
        {
          type: 10,
          content: 'Select a role below. **Every member who has that role** will have all of their ' +
            'vanity roles (the extra tribe roles shown on castlists) cleared.\n\n' +
            '-# This only clears the cosmetic castlist data — the Discord role itself is left on members.'
        },
        {
          type: 1, // Action Row
          components: [{
            type: 6, // Role Select
            custom_id: 'data_clear_vanity_select',
            placeholder: 'Select a role — its members lose all vanity roles',
            min_values: 1,
            max_values: 1
          }]
        },
        { type: 14 },
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'data_admin', label: '← Data Menu', style: 2 }
          ]
        }
      ]
    }]
  };
}

/**
 * Screen 2: confirmation, after a role is selected. Shows impact counts.
 */
export async function handleVanityRoleSelect(context) {
  const roleId = context.values?.[0];
  if (!roleId) {
    return { components: [{ type: 17, accent_color: ACCENT_RED, components: [
      { type: 10, content: '❌ No role selected. Please try again.' }
    ] }] };
  }

  const { roleName, memberIds } = await resolveRoleMembers(context.guildId, roleId, context.client);
  const playerData = await loadPlayerData();
  const players = playerData[context.guildId]?.players || {};
  const { idsToClear, entriesRemoved } = computeVanityClear(players, memberIds);

  console.log(`🧹 [VANITY] Preview for role ${roleName} (${roleId}): ${memberIds.length} members, ` +
    `${idsToClear.length} with vanity (${entriesRemoved} entries)`);

  // Nothing to clear — short-circuit with an informational screen.
  if (idsToClear.length === 0) {
    return { components: [{ type: 17, accent_color: ACCENT_RED, components: [
      { type: 10, content: '## 🧹 Clear Vanity Roles' },
      { type: 14 },
      { type: 10, content: `<@&${roleId}> has **${memberIds.length}** member(s), but **none** of them have ` +
        `any vanity roles. Nothing to clear.` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'data_clear_vanity', label: '← Pick Another Role', style: 2 },
        { type: 2, custom_id: 'data_admin', label: 'Data Menu', style: 2 }
      ] }
    ] }] };
  }

  return { components: [{ type: 17, accent_color: ACCENT_RED, components: [
    { type: 10, content: '## ⚠️ Confirm Clear Vanity Roles' },
    { type: 14 },
    { type: 10, content: `This will clear vanity roles from all members of <@&${roleId}>:\n\n` +
      `• **${memberIds.length}** member(s) have this role\n` +
      `• **${idsToClear.length}** of them have vanity roles\n` +
      `• **${entriesRemoved}** total vanity entry/entries will be removed\n\n` +
      `-# Cosmetic castlist data only — Discord roles are not touched. This cannot be undone.` },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: `data_clear_vanity_confirm_${roleId}`, label: 'Clear Vanity Roles', style: 4, emoji: { name: '🧹' } },
      { type: 2, custom_id: 'data_clear_vanity', label: 'Cancel', style: 2, emoji: { name: '❌' } }
    ] }
  ] }] };
}

/**
 * Screen 3: execute the clear and report results.
 */
export async function handleVanityClearConfirm(context) {
  const roleId = context.customId.replace('data_clear_vanity_confirm_', '');
  const { roleName, memberIds } = await resolveRoleMembers(context.guildId, roleId, context.client);

  const playerData = await loadPlayerData();
  const players = playerData[context.guildId]?.players || {};
  const { idsToClear, entriesRemoved } = computeVanityClear(players, memberIds);

  for (const id of idsToClear) {
    players[id].vanityRoles = [];
  }

  if (idsToClear.length > 0) {
    await savePlayerData(playerData);
  }

  console.log(`🧹 [VANITY] ✅ Cleared vanity for role ${roleName} (${roleId}): ` +
    `${idsToClear.length} players, ${entriesRemoved} entries removed (by ${context.userId})`);

  return { components: [{ type: 17, accent_color: ACCENT_RED, components: [
    { type: 10, content: '## ✅ Vanity Roles Cleared' },
    { type: 14 },
    { type: 10, content: `Cleared vanity roles for members of <@&${roleId}>:\n\n` +
      `• **${idsToClear.length}** player(s) updated\n` +
      `• **${entriesRemoved}** vanity entry/entries removed` },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'data_clear_vanity', label: '← Clear Another', style: 2 },
      { type: 2, custom_id: 'data_admin', label: 'Data Menu', style: 2 }
    ] }
  ] }] };
}

export default {
  computeVanityClear,
  buildClearVanityUI,
  handleVanityRoleSelect,
  handleVanityClearConfirm
};
