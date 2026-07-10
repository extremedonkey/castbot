/**
 * Roles & Security (globalRoleAccess) — creation-time channel access grants.
 *
 * Whitelisted roles (playerData[guildId].permissions.globalRoleAccess, configured
 * via Settings → 🔐 Roles & Security) receive permission overwrites on channels
 * CastBot creates. Overwrites are applied ONLY at channel creation; changing the
 * whitelist never retroactively edits existing channels (deliberate design —
 * see docs/03-features/RolesSecurity.md).
 */
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { loadPlayerData } from '../storage.js';

/** Bits granted on Safari channels (map locations, categories, 🗺️map-storage).
 * SendMessages is explicit because 🗺️map-storage denies it at @everyone level —
 * without it, whitelisted roles could see the channel but not post (locations
 * only deny ViewChannel, so Send falls through to base perms there). */
export const SAFARI_CHANNEL_ACCESS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ManageChannels
];

/** Bits granted on Season Application channels (unchanged from pre-helper behavior). */
export const APPLICATION_CHANNEL_ACCESS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory
];

/**
 * Pure core — no I/O, no Discord objects (replicated inline in tests).
 * Dedupes role IDs, drops falsy entries, skips roles that no longer exist,
 * and filters @everyone: a whitelisted guild.id would collide with the caller's
 * @everyone deny entry (duplicate overwrite ID) and fail the entire
 * channels.create() call.
 *
 * @param {Object} p
 * @param {string[]} p.roleIds - raw globalRoleAccess list from playerData
 * @param {Set<string>} p.validRoleIds - IDs of roles that currently exist in the guild
 * @param {string} p.everyoneRoleId - @everyone role ID (=== guild ID)
 * @param {bigint[]} p.allow - permission bits to grant
 * @returns {{ entries: Array<{id: string, allow: bigint[]}>, skipped: string[] }}
 */
export function buildRoleAccessEntries({ roleIds, validRoleIds, everyoneRoleId, allow }) {
  const entries = [];
  const skipped = [];
  const seen = new Set();
  for (const roleId of roleIds || []) {
    if (!roleId || seen.has(roleId)) continue;
    seen.add(roleId);
    if (roleId === everyoneRoleId || !validRoleIds.has(roleId)) {
      skipped.push(roleId);
      continue;
    }
    entries.push({ id: roleId, allow });
  }
  return { entries, skipped };
}

/**
 * Build permission-overwrite entries for the guild's Roles & Security whitelist.
 * Callers spread the result into their channels.create() permissionOverwrites
 * array AFTER their own @everyone deny entry — the helper never carries deny bits.
 *
 * @param {import('discord.js').Guild} guild
 * @param {bigint[]} allow - SAFARI_CHANNEL_ACCESS or APPLICATION_CHANNEL_ACCESS
 * @param {Object} [options]
 * @param {Object} [options.playerData] - full playerData object if the caller
 *   already has it loaded (avoids a re-read); otherwise loaded via
 *   loadPlayerData(guild.id) (request-cached in storage.js)
 * @param {string} [options.logPrefix='ROLE_ACCESS']
 * @returns {Promise<Array<{id: string, allow: bigint[]}>>}
 */
export async function getRoleAccessOverwrites(guild, allow, { playerData = null, logPrefix = 'ROLE_ACCESS' } = {}) {
  const guildData = playerData ? playerData[guild.id] : await loadPlayerData(guild.id);
  const roleIds = guildData?.permissions?.globalRoleAccess || [];
  if (roleIds.length === 0) return [];

  await guild.roles.fetch(); // ensure role cache is populated before validating

  const { entries, skipped } = buildRoleAccessEntries({
    roleIds,
    validRoleIds: new Set(guild.roles.cache.keys()),
    everyoneRoleId: guild.roles.everyone?.id ?? guild.id,
    allow
  });

  for (const entry of entries) {
    console.log(`🔐 [${logPrefix}] Added globalRoleAccess role: ${guild.roles.cache.get(entry.id)?.name} (${entry.id})`);
  }
  for (const roleId of skipped) {
    console.warn(`🔐 [${logPrefix}] Skipping invalid globalRoleAccess role: ${roleId}`);
  }
  return entries;
}

/**
 * Pure core — true when an existing overwrite's allow bitfield already contains
 * every required bit (replicated inline in tests).
 * @param {bigint} existingAllow - the overwrite's current allow bitfield
 * @param {bigint[]} requiredBits - bits that must all be present
 * @returns {boolean}
 */
export function hasAllRequiredBits(existingAllow, requiredBits) {
  return requiredBits.every(bit => (existingAllow & bit) === bit);
}

/**
 * MERGE the whitelist's grants onto EXISTING channels via per-role
 * permissionOverwrites.edit() (never .set() — player/member overwrites are
 * untouched). Complements creation-time grants for channels that outlive
 * creation: the 🗺️map-storage channel survives map deletion, and Map Update
 * refreshes maps whose channels may predate the whitelist.
 *
 * Skips roles whose overwrite already carries all required bits (cache check,
 * no API call), so repeat invocations are cheap no-ops.
 *
 * @param {import('discord.js').Guild} guild
 * @param {Array<import('discord.js').GuildChannel|null>} channels - deduped by id; falsy entries ignored
 * @param {bigint[]} allow - SAFARI_CHANNEL_ACCESS or APPLICATION_CHANNEL_ACCESS
 * @param {Object} [options]
 * @param {Object} [options.playerData] - as in getRoleAccessOverwrites
 * @param {string} [options.logPrefix='ROLE_ACCESS']
 * @returns {Promise<number>} count of overwrites actually edited
 */
export async function ensureRoleAccessOnChannels(guild, channels, allow, { playerData = null, logPrefix = 'ROLE_ACCESS' } = {}) {
  const guildData = playerData ? playerData[guild.id] : await loadPlayerData(guild.id);
  const roleIds = guildData?.permissions?.globalRoleAccess || [];
  if (roleIds.length === 0) return 0;

  await guild.roles.fetch();
  const { entries, skipped } = buildRoleAccessEntries({
    roleIds,
    validRoleIds: new Set(guild.roles.cache.keys()),
    everyoneRoleId: guild.roles.everyone?.id ?? guild.id,
    allow
  });
  for (const roleId of skipped) {
    console.warn(`🔐 [${logPrefix}] Skipping invalid globalRoleAccess role: ${roleId}`);
  }
  if (entries.length === 0) return 0;

  // .edit() takes named boolean flags, not bitfields
  const editOptions = Object.fromEntries(new PermissionsBitField(allow).toArray().map(name => [name, true]));

  const seen = new Set();
  let applied = 0;
  for (const channel of channels) {
    if (!channel || seen.has(channel.id)) continue;
    seen.add(channel.id);
    for (const entry of entries) {
      const existing = channel.permissionOverwrites?.cache?.get(entry.id);
      if (existing && hasAllRequiredBits(existing.allow.bitfield, allow)) continue;
      try {
        await channel.permissionOverwrites.edit(entry.id, editOptions, { reason: 'CastBot Roles & Security' });
        applied++;
        console.log(`🔐 [${logPrefix}] Ensured globalRoleAccess role ${guild.roles.cache.get(entry.id)?.name} (${entry.id}) on #${channel.name}`);
      } catch (error) {
        // Missing bot permission on one channel must not abort the caller's operation
        console.warn(`🔐 [${logPrefix}] Could not grant role ${entry.id} on #${channel.name}: ${error.message}`);
      }
    }
  }
  return applied;
}
