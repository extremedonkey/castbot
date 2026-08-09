/**
 * Effective Permissions — the single reader for "what can this clicker do?"
 *
 * ## Why this exists
 *
 * Two separate incidents made this necessary (both 2026-08-09):
 *
 * 1. Casting gates read permissions off a `guild.members.fetch()` result. That object's
 *    `.permissions` is discord.js recomputing locally — a raw OR of role bits — which does NOT
 *    expand Administrator, ignores channel overwrites, and depends on `guild.roles.cache`. An
 *    Administrator-only host was locked out of 18 screens.
 * 2. `globalRoleAccess` ("Global Access roles") needed to behave exactly like holding
 *    Manage Roles, everywhere. Teaching ~440 gates about a whitelist is untenable; computing one
 *    effective permission set that every gate already consults is not.
 *
 * ## The rule
 *
 * Pass the INTERACTION PAYLOAD member (`context.member` / `req.body.member`). Discord computes
 * that value itself — Administrator expands to everything, channel overwrites are applied, and
 * timeouts are honoured. A fetched GuildMember still works here (BigInt() reads its bitfield and
 * `.has()` restores the Administrator override) but it is strictly worse; prefer the payload.
 *
 * ## Why the cache, and why this stays synchronous
 *
 * `globalRoleAccess` lives in playerData, which is an async read. If permission checks became
 * async, every one of ~440 call sites would need `await` — and a single forgotten `await` returns
 * a **Promise, which is truthy**, silently granting admin to everyone with no error and no log
 * line. A permission check must never be able to fail OPEN.
 *
 * So the whitelist is mirrored in a module-level Map (195 guilds × ≤10 role IDs — a few KB),
 * hydrated once at boot and updated by the two handlers that write it. Checks stay synchronous
 * with zero I/O and the failure mode cannot exist.
 *
 * @see docs/infrastructure-security/SecurityArchitecture.md
 */

import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';

/**
 * What a Global Access role is worth. Deliberately Manage Roles + Manage Channels and NOT
 * Administrator: the whitelist should make someone a CastBot host, not grant a Discord-level
 * god-mode bit that `.has()` would then use to satisfy *every* permission check in the codebase
 * (including ones added later for genuinely destructive things).
 */
export const GLOBAL_ACCESS_GRANT =
  PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels;

/** guildId -> Set<roleId>. Mirror of playerData[guildId].permissions.globalRoleAccess. */
const roleAccessCache = new Map();

/**
 * Sanitise a stored whitelist. PURE — unit-tested.
 *
 * Drops falsy entries, dedupes, and removes `@everyone` (whose role ID equals the guild ID).
 * The @everyone filter is load-bearing security, not tidiness: one `@everyone` in the Role Select
 * would otherwise make every member of the server a CastBot admin in a single click.
 *
 * @param {string[]} roleIds
 * @param {string} guildId
 * @returns {string[]} sanitised role IDs
 */
export function sanitizeRoleAccessIds(roleIds, guildId) {
  if (!Array.isArray(roleIds)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of roleIds) {
    if (!raw) continue;
    const id = String(raw);
    if (id === String(guildId)) continue;   // @everyone — never grants CastBot admin
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Load every guild's whitelist into the cache. Call once at boot, after playerData is available.
 * @param {Object} playerData
 * @returns {{guilds: number, roles: number}} counts, for the startup log line
 */
export function hydrateGlobalRoleAccess(playerData) {
  roleAccessCache.clear();
  let roles = 0;
  for (const [guildId, guild] of Object.entries(playerData || {})) {
    const stored = guild?.permissions?.globalRoleAccess;
    if (!Array.isArray(stored) || stored.length === 0) continue;
    const clean = sanitizeRoleAccessIds(stored, guildId);
    if (clean.length === 0) continue;
    roleAccessCache.set(String(guildId), new Set(clean));
    roles += clean.length;
  }
  return { guilds: roleAccessCache.size, roles };
}

/**
 * Update one guild's whitelist in the cache. MUST be called by any handler that writes
 * `playerData[guildId].permissions.globalRoleAccess`, or the grant goes stale until next boot.
 * @returns {string[]} the sanitised IDs that should also be persisted
 */
export function setGuildRoleAccess(guildId, roleIds) {
  const clean = sanitizeRoleAccessIds(roleIds, guildId);
  if (clean.length === 0) roleAccessCache.delete(String(guildId));
  else roleAccessCache.set(String(guildId), new Set(clean));
  return clean;
}

/** @returns {string[]} the cached whitelist for a guild (empty if none). */
export function getGuildRoleAccess(guildId) {
  return [...(roleAccessCache.get(String(guildId)) || [])];
}

/**
 * Does this member hold a Global Access role in this guild?
 * Accepts a payload member (`roles` = array of IDs) or a discord.js GuildMember (`roles.cache`).
 */
export function hasGlobalRoleAccess(member, guildId) {
  const whitelist = roleAccessCache.get(String(guildId));
  if (!whitelist || whitelist.size === 0) return false;

  const roles = member?.roles;
  if (!roles) return false;

  if (Array.isArray(roles)) return roles.some(id => whitelist.has(String(id)));
  // discord.js GuildMemberRoleManager
  if (roles.cache?.some) return roles.cache.some(role => whitelist.has(String(role.id)));
  return false;
}

/**
 * The clicker's effective permissions: what Discord says, plus the Global Access grant.
 *
 * @param {Object} member - `context.member` / `req.body.member` (payload preferred)
 * @param {string} [guildId] - required for the Global Access grant; omit and you get Discord's raw answer
 * @returns {PermissionsBitField} always a bitfield, never null — safe to call `.has()` on
 */
export function effectivePermissions(member, guildId) {
  let bits = 0n;
  const raw = member?.permissions;
  if (raw !== undefined && raw !== null) {
    try { bits = BigInt(raw); } catch { bits = 0n; }
  }
  if (guildId && hasGlobalRoleAccess(member, guildId)) bits |= GLOBAL_ACCESS_GRANT;
  return new PermissionsBitField(bits);
}

/**
 * Does the member have ANY of these permissions?
 *
 * Use this instead of a raw `&`. Each permission is tested separately because
 * `PermissionsBitField.has(A | B)` demands BOTH bits — and `.has()` (unlike `.any()`) applies the
 * Administrator override, which is exactly the bug that locked Administrator-only hosts out of
 * Casting.
 *
 * @param {Object} member - payload member
 * @param {string} guildId
 * @param {...bigint} permissions
 */
export function memberHasAnyPermission(member, guildId, ...permissions) {
  if (!member?.permissions && !hasGlobalRoleAccess(member, guildId)) return false;
  const perms = effectivePermissions(member, guildId);
  return permissions.flat().some(permission => perms.has(permission));
}

/** Test-only: wipe the cache between cases. */
export function __resetGlobalRoleAccessCache() {
  roleAccessCache.clear();
}
