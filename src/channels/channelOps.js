/**
 * Channel Administration — atomic Discord primitives.
 *
 * This is the shared channel-creation abstraction the codebase never had: before this,
 * `[{id: everyone, deny:[ViewChannel]}, ...roleAccessEntries]` was hand-rolled at 4 call
 * sites (mapExplorer ×3, applicationManager ×1), none of which check the guild's ceilings.
 *
 * Every operation here is an UPSERT and safe to re-run — see ensureChannel's identity order.
 */
import { ChannelType, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { hasAllRequiredBits } from '../../utils/roleAccessUtils.js';
import { REQUIRED_BOT_PERMISSIONS, PACE_DELETE, RENAME_DELAY_MS } from './channelAdminConfig.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One authoritative read of the guild's channels + roles.
 *
 * guild.channels.fetch() is REQUIRED — the cache only holds ~50 entries, so cache-only
 * counting silently under-reports and would defeat the ceiling checks (mapExplorer.js:707
 * learned this the hard way).
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<Object>} snapshot
 */
export async function snapshotGuild(guild) {
  const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);

  const categories = channels.filter((c) => c && c.type === ChannelType.GuildCategory);
  const childCount = new Map();
  for (const ch of channels.values()) {
    if (!ch?.parentId) continue;
    childCount.set(ch.parentId, (childCount.get(ch.parentId) || 0) + 1);
  }

  return {
    channels,
    roles,
    categories,
    childCount,
    counts: {
      channels: channels.filter(Boolean).size,
      categories: categories.size,
      roles: roles.filter(Boolean).size
    },
    /** Find a live channel by exact name within a parent (the adopt-by-name path). */
    findByName(name, parentId = null) {
      return channels.find((c) => c && c.name === name && (parentId ? c.parentId === parentId : !c.parentId)) || null;
    },
    hasRole(roleId) {
      return !!(roleId && roles.get(roleId));
    }
  };
}

/**
 * Fail fast when the bot lacks the permissions a bulk run needs.
 *
 * Without this, a 190-channel run fires 190 DiscordAPIError 50013s and spams the prod error
 * log — the exact problem roleManager.js:2814 documents for role creation.
 *
 * @returns {Promise<{ok: boolean, missing: string[]}>}
 */
export async function checkBotPermissions(guild, required = REQUIRED_BOT_PERMISSIONS) {
  const me = guild.members?.me ?? (await guild.members.fetchMe().catch(() => null));
  const names = { [PermissionFlagsBits.ManageChannels]: 'Manage Channels', [PermissionFlagsBits.ManageRoles]: 'Manage Roles' };
  const missing = required.filter((bit) => !me?.permissions?.has(bit)).map((bit) => names[bit] || String(bit));
  return { ok: missing.length === 0, missing };
}

/**
 * Upsert a category. Adopts an existing same-named category rather than making a second one.
 * @returns {Promise<{category: Object, created: boolean}>}
 */
export async function ensureCategory(guild, name, { snapshot, knownId = null, overwrites = [], reason = 'CastBot channel admin' } = {}) {
  if (knownId) {
    const existing = snapshot?.channels.get(knownId) || (await guild.channels.fetch(knownId).catch(() => null));
    if (existing && existing.type === ChannelType.GuildCategory) return { category: existing, created: false };
  }

  const byName = snapshot?.categories.find((c) => c.name === name);
  if (byName) return { category: byName, created: false };

  const category = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason
  });
  return { category, created: true };
}

/**
 * Upsert a text channel.
 *
 * IDENTITY ORDER — this is the whole interruption-recovery story:
 *   1. registryId  → the authoritative pointer
 *   2. name within parentId → ADOPTS orphans left by an interrupted run
 *   3. create
 *
 * Step 2 is why no resume state machine is needed: a run that dies halfway leaves channels
 * that the next run adopts instead of duplicating, even if the registry never recorded them.
 * (mapExplorer persists channel IDs only after its whole loop finishes — mapExplorer.js:1602
 * — so an interrupt there orphans everything. This does not.)
 *
 * Overwrites are passed INTO create() rather than applied afterwards: a 276-channel run would
 * otherwise need ~550 extra REST calls and blow the 15-minute interaction token.
 *
 * @returns {Promise<{channel: Object, action: 'reused'|'adopted'|'created'|'renamed', renamePending?: boolean}>}
 */
export async function ensureChannel(guild, {
  registryId = null,
  name,
  parentId = null,
  overwrites = [],
  topic = undefined,
  allowRename = false,
  snapshot,
  reason = 'CastBot channel admin'
}) {
  // 1. Registry pointer
  let channel = registryId ? (snapshot?.channels.get(registryId) || (await guild.channels.fetch(registryId).catch(() => null))) : null;
  let action = channel ? 'reused' : null;

  // 2. Adopt an existing channel by name (recovers orphans from an interrupted run)
  if (!channel) {
    channel = snapshot?.findByName(name, parentId);
    if (channel) action = 'adopted';
  }

  // 3. Create
  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      ...(parentId ? { parent: parentId } : {}),
      ...(topic ? { topic } : {}),
      permissionOverwrites: overwrites,
      reason
    });
    return { channel, action: 'created' };
  }

  // Reconcile an existing channel's access (cheap — skips when the bits already match).
  await applyAccess(channel, overwrites);

  // Renames are best-effort ONLY. Discord allows 2 per 10 minutes PER CHANNEL and discord.js
  // blocks for minutes on that limit (app.js:49440), so a rename must never fail the job.
  let renamePending = false;
  if (allowRename && channel.name !== name) {
    try {
      await channel.setName(name, reason);
      action = 'renamed';
    } catch (e) {
      renamePending = true;
      console.warn(`⚠️ [CHANNEL_ADMIN] Rename deferred for #${channel.name} → ${name}: ${e.message}`);
    }
  }

  return { channel, action, renamePending };
}

/**
 * Apply permission overwrites to an EXISTING channel, one principal at a time.
 *
 * Uses .edit() per principal, never .set() — .set() would wipe overwrites this framework
 * doesn't own (mirrors ensureRoleAccessOnChannels' contract, roleAccessUtils.js:126).
 *
 * @returns {Promise<{edited: number, skipped: number}>}
 */
export async function applyAccess(channel, overwrites) {
  let edited = 0;
  let skipped = 0;

  for (const entry of overwrites || []) {
    if (!entry?.id) continue;
    try {
      const existing = channel.permissionOverwrites?.cache?.get(entry.id);
      const wantAllow = entry.allow || [];
      const wantDeny = entry.deny || [];

      if (existing
        && hasAllRequiredBits(existing.allow?.bitfield ?? 0n, wantAllow)
        && hasAllRequiredBits(existing.deny?.bitfield ?? 0n, wantDeny)) {
        skipped++;
        continue;
      }

      const payload = {
        ...Object.fromEntries(new PermissionsBitField(wantAllow).toArray().map((n) => [n, true])),
        ...Object.fromEntries(new PermissionsBitField(wantDeny).toArray().map((n) => [n, false]))
      };
      await channel.permissionOverwrites.edit(entry.id, payload, { reason: 'CastBot channel admin' });
      edited++;
    } catch (e) {
      // One bad principal (e.g. a role deleted mid-run) must not abort the channel.
      console.warn(`⚠️ [CHANNEL_ADMIN] Overwrite for ${entry.id} on #${channel.name}: ${e.message}`);
    }
  }

  return { edited, skipped };
}

/**
 * Paced bulk delete.
 * @param {string[]} channelIds
 * @param {Object} [opts]
 * @param {string[]} [opts.protectIds] - never delete these (e.g. the invoking channel)
 * @returns {Promise<{deleted: string[], protected: string[], failed: Array}>}
 */
export async function deleteChannels(guild, channelIds, { pace = PACE_DELETE, protectIds = [], onProgress = null } = {}) {
  const deleted = [];
  const protectedIds = [];
  const failed = [];
  const ids = [...new Set(channelIds || [])];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (protectIds.includes(id)) {
      protectedIds.push(id);
      continue;
    }
    if (i > 0 && i % pace.n === 0) await sleep(pace.ms);

    try {
      const ch = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
      if (!ch) {
        deleted.push(id); // already gone — the desired end state
        continue;
      }
      await ch.delete('CastBot channel admin');
      deleted.push(id);
    } catch (e) {
      failed.push({ id, error: e.message });
    }
    if (onProgress) await onProgress({ done: i + 1, total: ids.length });
  }

  return { deleted, protected: protectedIds, failed };
}

/**
 * Idempotently ensure a player's personal role exists.
 *
 * Modelled on ensureBanRole (roleManager.js:2703) but resolves by STORED ID only — never by
 * name, because duplicate role names are legal in Discord and a name match could adopt a
 * tribe/vanity role that happens to share the player's display name.
 *
 * `color` is a parameter (default 0 = uncoloured) so colour customisation can land later
 * without touching callers.
 *
 * @returns {Promise<{role: Object, action: 'reused'|'created'}>}
 */
export async function ensurePlayerRole(guild, { userId, displayName, registryRoleId = null, color = 0, snapshot }) {
  if (registryRoleId) {
    const existing = snapshot?.roles.get(registryRoleId) || (await guild.roles.fetch(registryRoleId).catch(() => null));
    if (existing) return { role: existing, action: 'reused' };
    // Registry points at a deleted role — fall through and recreate.
  }

  const role = await guild.roles.create({
    name: displayName,
    color,
    mentionable: false,
    permissions: [],
    reason: `CastBot player role for ${userId}`
  });
  return { role, action: 'created' };
}

/**
 * Decide how a player gets access: their personal role when it's live, else the user directly.
 * A registry pointer to a deleted role yields a delta that clears the field (never reference
 * an unvalidated role ID in an overwrite).
 *
 * @returns {{entry: {id: string, allow: bigint[]}, via: 'role'|'user', delta: Object|null}}
 */
export function resolvePrincipal({ userId, playerRoleId, snapshot, allow }) {
  if (playerRoleId && snapshot.hasRole(playerRoleId)) {
    return { entry: { id: playerRoleId, allow }, via: 'role', delta: null };
  }
  return {
    entry: { id: userId, allow },
    via: 'user',
    delta: playerRoleId ? { kind: 'playerRole', userId, roleId: null } : null
  };
}

export { sleep, RENAME_DELAY_MS };
