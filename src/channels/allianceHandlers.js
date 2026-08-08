/**
 * Alliances — handler bodies (RaP 0892).
 *
 * Same contract as channelsHandlers.js: app.js routes, this module does the work, and the
 * admin entry points are reached ONLY through the channels_route / channels_modal_submit
 * factory blocks whose inline whitelist gate has already run. The two PLAYER entry points
 * (request button + request submit) are public by design and re-check the v1 whitelist here.
 *
 * Everything is two-phase: modal submit → PLAN (mutates nothing) → review screen → exec.
 * Alliances are single-channel jobs, so exec skips runPacedJob — but still rides
 * executePlan's job lock, snapshot, and lastRun bookkeeping.
 */
import { PermissionFlagsBits } from 'discord.js';
import { loadPlayerData } from '../../storage.js';
import { getRoleAccessOverwrites } from '../../utils/roleAccessUtils.js';
import {
  CHANNEL_ADMIN_USER_IDS, PLAYER_ACCESS, HOST_ACCESS,
  ALLIANCE_DEFAULTS, ALLIANCE_REQUEST_COOLDOWN_MS
} from './channelAdminConfig.js';
import { buildOverwrites, preflightBudget, mostRecentConfigId } from './channelPlan.js';
import {
  newAllianceId, allianceChannelName, assessTribeAlignment, diffMembers,
  parseAllianceCustomId, normalizeNotify
} from './alliancePlan.js';
import { snapshotGuild, checkBotPermissions, ensureCategory, ensureChannel, deleteChannels, resolvePrincipal, removeAccess } from './channelOps.js';
import { flushDeltas } from './channelRegistry.js';
import { expandMentionables } from './channelRoster.js';
import { buildConfirmScreen } from './channelsView.js';
import { buildAllianceManager, buildAllianceModal, buildRemoveMembersModal, buildAllianceRequestModal, buildAllianceRequestCard } from './allianceView.js';
import { stashPlan } from './channelsHandlers.js';

const viewChannelBit = PermissionFlagsBits.ViewChannel;
const err = (msg) => ({ components: [{ type: 17, accent_color: 0xe74c3c, components: [{ type: 10, content: `## ❌ ${msg}` }] }] });

const NOTIFY_LABELS = { silent: 'Silent', announce: 'Announce creation', announce_requestor: 'Announce requestor' };

/** In-memory anti-spam for player requests (resets on restart — fine, it's politeness not security). */
const requestCooldowns = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Manager screen
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAllianceManager({ configId, guildId, selectedId = null }) {
  const playerData = await loadPlayerData();
  const node = playerData[guildId]?.channelAdmin || {};
  const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || `Season ${configId}`;
  const valid = selectedId && node.alliances?.[selectedId] ? selectedId : null;
  const view = buildAllianceManager({
    configId, seasonName,
    alliances: node.alliances || {},
    requests: node.allianceRequests || {},
    selectedId: valid
  });
  const { countComponents } = await import('../../utils.js');
  countComponents(view.components, { verbosity: 'summary', label: `Alliances - ${seasonName}` });
  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal openers (requiresModal path — a non-modal return renders as an ephemeral message)
// ─────────────────────────────────────────────────────────────────────────────

export async function openAllianceModal({ customId, guildId }) {
  const parsed = parseAllianceCustomId(customId);
  const playerData = await loadPlayerData();
  const node = playerData[guildId]?.channelAdmin || {};

  switch (parsed?.verb) {
    case 'new':
      return { type: 9, data: buildAllianceModal({ configId: parsed.configId, mode: 'new' }) };

    case 'edit': {
      const alliance = node.alliances?.[parsed.allianceId];
      if (!alliance) return err('That alliance no longer exists.');
      return { type: 9, data: buildAllianceModal({ configId: parsed.configId, mode: 'edit', allianceId: parsed.allianceId, alliance }) };
    }

    case 'members': {
      const alliance = node.alliances?.[parsed.allianceId];
      if (!alliance?.members?.length) return err('That alliance has no members to remove.');
      return { type: 9, data: buildRemoveMembersModal({ configId: parsed.configId, allianceId: parsed.allianceId, alliance }) };
    }

    case 'review': {
      const request = node.allianceRequests?.[parsed.requestId];
      if (!request) return err('That alliance request no longer exists.');
      if (request.status !== 'open') return err('This request was already reviewed, or superseded by a newer one.');
      return { type: 9, data: buildAllianceModal({ configId: request.configId, mode: 'request', requestId: parsed.requestId, prefillMembers: request.members || [] }) };
    }

    default:
      return err('Unknown alliance action.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN phase
// ─────────────────────────────────────────────────────────────────────────────

/** Default-castlist tribe names per userId — the same-tribe warning's data source. Best-effort. */
async function tribeNamesByUser(guildId, client) {
  const map = new Map();
  try {
    const { getTribesForCastlist } = await import('../../castlistDataAccess.js');
    const tribes = await getTribesForCastlist(guildId, 'default', client);
    for (const tribe of tribes || []) {
      for (const m of tribe.members || []) {
        if (!map.has(m.id)) map.set(m.id, []);
        map.get(m.id).push(tribe.name);
      }
    }
  } catch (e) {
    console.warn(`⚠️ [ALLIANCE] Tribe lookup failed (warnings disabled this pass): ${e.message}`);
  }
  return map;
}

/** Re-expand a stored member snapshot (refreshes displayName/playerRoleId, drops departed). */
async function reExpand(guild, userIds) {
  return await expandMentionables(guild, { users: Object.fromEntries(userIds.map((id) => [id, true])) }, userIds);
}

const serializeMember = (m) => ({ userId: m.userId, displayName: m.displayName, playerRoleId: m.playerRoleId || null });

/**
 * Alliance modal submit → plan + review screen. Handles all four modal modes
 * (new / request / edit / members-removal) — parsed from the custom_id.
 */
export async function planAlliance({ customId, guildId, userId, client, fields, resolved }) {
  const parsed = parseAllianceCustomId(customId);
  if (parsed?.verb !== 'modal') return err('Unknown alliance submission.');
  const { mode, configId } = parsed;

  const guild = await client.guilds.fetch(guildId);
  const perms = await checkBotPermissions(guild);
  if (!perms.ok) return err(`CastBot is missing permissions: ${perms.missing.join(', ')}.`);

  const playerData = await loadPlayerData();
  const node = playerData[guildId]?.channelAdmin || {};
  const cancelId = `channels_alliances_${configId}`;

  // ── Resolve the target member set ──────────────────────────────────────────
  const existing = mode === 'edit' || mode === 'members' ? node.alliances?.[parsed.allianceId] : null;
  if ((mode === 'edit' || mode === 'members') && !existing) return err('That alliance no longer exists.');
  const request = mode === 'request' ? node.allianceRequests?.[parsed.requestId] : null;
  if (mode === 'request' && !request) return err('That alliance request no longer exists.');
  if (mode === 'request' && request.status !== 'open') return err('This request was already reviewed.');

  let expansion;
  if (mode === 'members') {
    // Removal: kept = stored minus selected. No mentionable field on this modal.
    const removeIds = new Set(fields.remove || []);
    if (!removeIds.size) return err('No members selected to remove.');
    expansion = await reExpand(guild, (existing.members || []).map((m) => m.userId).filter((id) => !removeIds.has(id)));
  } else if ((fields.members || []).length) {
    expansion = await expandMentionables(guild, resolved, fields.members);
  } else if (mode === 'request') {
    // default_values is unreliable in modals — an untouched select submits empty. Fall back
    // to what the player actually requested.
    expansion = await reExpand(guild, (request.members || []).map((m) => m.userId));
  } else if (mode === 'edit') {
    expansion = await reExpand(guild, (existing.members || []).map((m) => m.userId));
  } else {
    return err('Select at least one member.');
  }
  const { members, dropped } = expansion;
  if (!members.length && mode !== 'members') return err('No valid members — everyone selected has left the server.');

  // ── Tribe alignment (warn, never enforce) ─────────────────────────────────
  const tribeMap = await tribeNamesByUser(guildId, client);
  const assessed = members.map((m) => ({ userId: m.userId, displayName: m.displayName, tribeNames: tribeMap.get(m.userId) || [] }));
  const alignment = assessTribeAlignment(assessed);

  // ── Channel name + category ───────────────────────────────────────────────
  const snapshot = await snapshotGuild(guild);
  const name = mode === 'members'
    ? existing.name
    : (fields.channel_name?.[0]?.trim() ? allianceChannelName(fields.channel_name[0]) : (mode === 'edit' ? existing.name : allianceChannelName(null)));

  let categoryId = fields.category?.[0] || null;
  if (categoryId && resolved?.channels?.[categoryId] && resolved.channels[categoryId].type !== 4) {
    return err('The Alliance Category must be a category, not a channel.'); // belt-and-braces vs channel_types
  }
  if (!categoryId && (mode === 'edit' || mode === 'members')) categoryId = existing.categoryId || null;
  if (categoryId && !snapshot.channels.get(categoryId) && !snapshot.categories.find((c) => c.id === categoryId)) categoryId = null;
  let categoryLabel;
  let needNewCategory = false;
  if (categoryId) {
    categoryLabel = `<#${categoryId}>`;
  } else {
    // Reuse our default-category ledger if one of its entries is still alive; else create at exec.
    const live = (node.allianceCategories || []).find((id) => snapshot.categories.find((c) => c.id === id));
    if (live) {
      categoryId = live;
      categoryLabel = `<#${live}>`;
    } else {
      needNewCategory = true;
      categoryLabel = `**${ALLIANCE_DEFAULTS.categoryName}** (will be created)`;
    }
  }

  // ── Budget preflight ──────────────────────────────────────────────────────
  const isCreate = mode === 'new' || mode === 'request';
  const channelAlive = existing?.channelId && !!snapshot.channels.get(existing.channelId);
  const creates = { channels: isCreate || !channelAlive ? 1 : 0, categories: needNewCategory ? 1 : 0 };
  const budget = preflightBudget({ existing: snapshot.counts, create: creates });
  if (!budget.ok) {
    const v = budget.violations[0];
    return buildConfirmScreen({
      configId, cancelId, blocked: true,
      title: '🚫 Guild ceiling reached',
      lines: [`> Creating this alliance would breach the **${v.ceiling}** limit (${v.current} now, ${v.limit} max).`],
      confirmLabel: ''
    });
  }

  // ── Diff (edit modes) ─────────────────────────────────────────────────────
  const diff = existing ? diffMembers(existing.members || [], members) : { added: members.map((m) => m.userId), removed: [], kept: [] };
  const removedPrincipals = (existing?.members || []).filter((m) => diff.removed.includes(m.userId)).map(serializeMember);

  const notify = mode === 'members' ? (existing?.notify || 'silent') : normalizeNotify(fields.notify?.[0]);
  const requestedBy = mode === 'request' ? request.requesterId : existing?.requestedBy || null;
  const allianceId = existing ? parsed.allianceId : newAllianceId();

  const plan = {
    type: isCreate ? 'alliance_create' : 'alliance_edit',
    configId, guildId, allianceId,
    name, categoryId, categoryName: ALLIANCE_DEFAULTS.categoryName, needNewCategory,
    members: members.map(serializeMember),
    added: diff.added, removed: diff.removed, removedPrincipals,
    notify, requestedBy,
    requestId: mode === 'request' ? parsed.requestId : null
  };
  const token = stashPlan(userId, plan);

  // ── Review screen ─────────────────────────────────────────────────────────
  const warnIds = new Set(alignment.warnings.map((w) => w.userId));
  const memberLines = assessed.map((m) => {
    const tribes = m.tribeNames.length ? m.tribeNames.join(', ') : 'no tribe';
    return `> ${warnIds.has(m.userId) ? '⚠️ ' : ''}<@${m.userId}> — ${tribes}`;
  });

  const lines = [
    `> **Channel:** \`#${name}\` in ${categoryLabel}`,
    `> **Notify:** ${NOTIFY_LABELS[notify]}`,
    ...(requestedBy ? [`> **Requested by:** <@${requestedBy}>`] : []),
    '',
    `**Members (${members.length}):**`,
    ...memberLines.slice(0, 15),
    ...(memberLines.length > 15 ? [`> -# …and ${memberLines.length - 15} more`] : []),
    ...(diff.removed.length ? ['', `**➖ Removing (${diff.removed.length}):**`, ...removedPrincipals.slice(0, 10).map((m) => `> <@${m.userId}>`)] : []),
    ...(!isCreate && diff.added.length ? ['', `-# ➕ ${diff.added.length} newly added member${diff.added.length === 1 ? '' : 's'} will gain access${notify !== 'silent' ? ' (no announcement on edits)' : ''}.`] : []),
    ...(dropped?.length ? ['', `-# ${dropped.length} selection${dropped.length === 1 ? '' : 's'} dropped (left the server).`] : []),
    ...(!alignment.aligned ? ['', `> ⚠️ **Cross-tribe warning** — alliances are usually same-tribe. Spanning: ${alignment.tribesSpanned.join(' + ') || 'no tribes found'}. You can still proceed.`] : []),
    ...(members.length === 0 ? ['', '> ⚠️ This removes **every** member — only hosts will see the channel.'] : []),
    '',
    '-# Nothing has been created or changed yet.'
  ];

  return buildConfirmScreen({
    token, configId, cancelId,
    accent: alignment.aligned ? null : 0xf39c12,
    title: isCreate ? '🤝 Review alliance' : '🤝 Review alliance changes',
    lines,
    confirmLabel: isCreate ? 'Create Alliance' : 'Apply Changes'
  });
}

/** Delete button → confirm screen (no modal). */
export async function planAllianceDelete({ allianceId, configId, guildId, userId }) {
  const playerData = await loadPlayerData();
  const alliance = playerData[guildId]?.channelAdmin?.alliances?.[allianceId];
  if (!alliance) return err('That alliance no longer exists.');

  const token = stashPlan(userId, {
    type: 'alliance_delete', configId, guildId, allianceId,
    channelIds: alliance.channelId ? [alliance.channelId] : [],
    name: alliance.name
  });

  return buildConfirmScreen({
    token, configId, cancelId: `channels_alliances_${configId}`, destructive: true,
    title: `⚠️ Delete alliance \`#${alliance.name}\``,
    lines: [
      `> **Channel:** <#${alliance.channelId}> — permanently deleted, history and all`,
      `> **Members:** ${alliance.members?.length || 0}`,
      '',
      '**This action cannot be undone.**'
    ],
    confirmLabel: 'Yes, Delete Alliance'
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE phase (dispatched from channelsHandlers.executePlan — job lock already held)
// ─────────────────────────────────────────────────────────────────────────────

export async function execAlliance({ plan, guild, snapshot, playerData, userId, invokedChannelId }) {
  if (plan.type === 'alliance_delete') {
    const r = await deleteChannels(guild, plan.channelIds, { protectIds: invokedChannelId ? [invokedChannelId] : [] });
    // Only drop the registry entry when every channel actually died — a protected/failed delete
    // must NOT orphan a live secret channel (execDelete keys registry removals the same way).
    const deletedAll = plan.channelIds.every((id) => r.deleted.includes(id));
    if (deletedAll) await flushDeltas(plan.guildId, [{ kind: 'allianceRemove', allianceId: plan.allianceId }]);
    const screen = await handleAllianceManager({ configId: plan.configId, guildId: plan.guildId, selectedId: deletedAll ? null : plan.allianceId });
    return { created: r.deleted.length, skipped: r.protected.length, failed: r.failed.length, errors: r.failed.map((f) => f.error), screen };
  }

  // Stale-plan guards (plans live up to 10 min; the job lock serializes execs and playerData
  // was loaded fresh after acquiring it): a request already fulfilled by the other admin must
  // not create a SECOND channel, and an edit of a deleted alliance must not resurrect it.
  const node = playerData[plan.guildId]?.channelAdmin || {};
  if (plan.requestId && node.allianceRequests?.[plan.requestId]?.status !== 'open') {
    const screen = await handleAllianceManager({ configId: plan.configId, guildId: plan.guildId });
    return { created: 0, skipped: 1, failed: 0, errors: ['Request was already reviewed — nothing created.'], screen };
  }
  if (plan.type === 'alliance_edit' && !node.alliances?.[plan.allianceId]) {
    const screen = await handleAllianceManager({ configId: plan.configId, guildId: plan.guildId });
    return { created: 0, skipped: 1, failed: 0, errors: ['That alliance was deleted while this plan was pending — nothing changed.'], screen };
  }

  const deltas = [];
  const roleAccessEntries = await getRoleAccessOverwrites(guild, HOST_ACCESS, { playerData, logPrefix: 'ALLIANCE' });
  const everyoneId = guild.roles.everyone?.id ?? guild.id;

  // Category — name-adoption is DESIRABLE here (the shared default category), unlike the channel.
  // Only the DEFAULT-path category enters the allianceCategories ledger: ledgering a host-picked
  // category would silently redirect every future blank-category alliance into it.
  let categoryId = plan.categoryId;
  if (!categoryId) {
    const { category } = await ensureCategory(guild, plan.categoryName, {
      snapshot,
      overwrites: buildOverwrites({ everyoneId, principals: [], roleAccessEntries, viewChannelBit }),
      reason: 'CastBot alliance'
    });
    categoryId = category.id;
    const ledger = playerData[plan.guildId]?.channelAdmin?.allianceCategories || [];
    if (!ledger.includes(categoryId)) deltas.push({ kind: 'allianceCategory', categoryId });
  }

  // Principals — roles-first (playerRoleId XOR direct user). NO Trusted Spectator: alliances
  // outrank even spectator trust (RaP 0892).
  const principals = [];
  for (const m of plan.members) {
    const { entry, delta } = resolvePrincipal({ userId: m.userId, playerRoleId: m.playerRoleId, snapshot, allow: PLAYER_ACCESS });
    if (delta) deltas.push(delta);
    principals.push(entry);
  }
  const overwrites = buildOverwrites({ everyoneId, principals, roleAccessEntries, viewChannelBit });

  // Channel — adoptByName: false is the leak guard: alliances share the generic name
  // 'alliance', and adopting one alliance's channel for another merges memberships.
  const isEdit = plan.type === 'alliance_edit';
  const existing = playerData[plan.guildId]?.channelAdmin?.alliances?.[plan.allianceId];
  const { channel } = await ensureChannel(guild, {
    registryId: isEdit ? existing?.channelId || null : null,
    adoptByName: false,
    name: plan.name,
    parentId: categoryId,
    overwrites,
    allowRename: isEdit,
    snapshot,
    reason: 'CastBot alliance'
  });

  // Edit reconciliation: category move + revoke removed members' access.
  if (isEdit && channel.parentId !== categoryId) {
    await channel.setParent(categoryId, { lockPermissions: false }).catch((e) =>
      console.warn(`⚠️ [ALLIANCE] Category move failed for #${channel.name}: ${e.message}`));
  }
  if (isEdit && plan.removedPrincipals?.length) {
    const keep = new Set([
      ...plan.members.map((m) => m.userId),
      ...plan.members.map((m) => m.playerRoleId).filter(Boolean)
    ]);
    const revoke = plan.removedPrincipals
      .flatMap((m) => [m.userId, m.playerRoleId])
      .filter(Boolean)
      .filter((id) => !keep.has(id));
    await removeAccess(channel, revoke, { reason: 'CastBot alliance — member removed' });
  }

  // Registry — flushed immediately: single channel, and with adoptByName off the registry
  // pointer is the ONLY thing preventing a duplicate on re-run.
  deltas.push({
    kind: 'alliance',
    allianceId: plan.allianceId,
    patch: {
      name: channel.name,
      channelId: channel.id,
      categoryId,
      members: plan.members,
      notify: plan.notify,
      configId: plan.configId,
      ...(plan.requestedBy ? { requestedBy: plan.requestedBy } : {}),
      ...(isEdit ? {} : { createdBy: userId })
    }
  });
  if (plan.requestId) deltas.push({ kind: 'allianceRequest', requestId: plan.requestId, patch: { status: 'fulfilled', allianceId: plan.allianceId } });
  await flushDeltas(plan.guildId, deltas);

  // Notify — create only, and only when asked. allowed_mentions makes the pings real.
  if (!isEdit && plan.notify !== 'silent' && plan.members.length) {
    try {
      const { DiscordRequest } = await import('../../utils.js');
      // Discord caps allowed_mentions.users at 100 — cap at 90 so a role-expanded mega-alliance
      // degrades to "+N more" instead of a 400 that silently swallows the whole announcement.
      const tagged = plan.members.slice(0, 90);
      const mentions = tagged.map((m) => `<@${m.userId}>`).join(' ')
        + (plan.members.length > tagged.length ? ` +${plan.members.length - tagged.length} more` : '');
      const content = plan.notify === 'announce_requestor' && plan.requestedBy
        ? `## 🤝 A new alliance has formed!\n${mentions}\nWelcome to your alliance channel — requested by <@${plan.requestedBy}>.`
        : `## 🤝 A new alliance has formed!\n${mentions}\nWelcome to your alliance channel.`;
      await DiscordRequest(`channels/${channel.id}/messages`, {
        method: 'POST',
        body: {
          flags: (1 << 15),
          components: [{ type: 17, accent_color: 0x9B59B6, components: [{ type: 10, content }] }],
          allowed_mentions: { users: tagged.map((m) => m.userId) }
        }
      });
    } catch (e) {
      console.warn(`⚠️ [ALLIANCE] Notify post failed for #${channel.name}: ${e.message}`);
    }
  }

  const screen = await handleAllianceManager({ configId: plan.configId, guildId: plan.guildId, selectedId: plan.allianceId });
  return { created: isEdit ? 0 : 1, skipped: isEdit ? 1 : 0, failed: 0, errors: [], screen };
}

// ─────────────────────────────────────────────────────────────────────────────
// Player request flow (PUBLIC entry points — v1 whitelist re-checked here)
// ─────────────────────────────────────────────────────────────────────────────

/** v1: the request feature is whitelist-only while alliances are a hidden mockup. */
const canRequest = (userId) => CHANNEL_ADMIN_USER_IDS.includes(String(userId));

/** Player menu → Request Alliance button. Returns the request modal (or an ephemeral denial). */
export async function handleAllianceRequestButton({ guildId, userId }) {
  if (!canRequest(userId)) return err('Alliance requests are not available yet.');

  const last = requestCooldowns.get(userId);
  if (last && Date.now() - last < ALLIANCE_REQUEST_COOLDOWN_MS) {
    return err('Please wait a few minutes between alliance requests.');
  }

  const playerData = await loadPlayerData();
  const configId = mostRecentConfigId(playerData, guildId);
  if (!configId) return err('This server has no seasons yet.');

  return { type: 9, data: buildAllianceRequestModal({ configId }) };
}

/**
 * Request modal submit. The (deferred, PUBLIC) response IS the request card, posted in the
 * invoking channel — the modal warned the player about exactly that.
 */
export async function handleAllianceRequestSubmit({ customId, guildId, userId, displayName, channelId, client, components, resolved }) {
  if (!canRequest(userId)) return err('Alliance requests are not available yet.');
  const parsed = parseAllianceCustomId(customId);
  if (parsed?.verb !== 'request_submit') return err('Unknown request submission.');

  // Label-wrapped fields (channelsRouter convention): selects deliver values[].
  const fields = {};
  for (const row of (components || [])) {
    if (row?.type === 18 && row.component?.custom_id) {
      const f = row.component;
      fields[f.custom_id] = Array.isArray(f.values) ? f.values : (f.value != null ? [f.value] : []);
    }
  }

  const guild = await client.guilds.fetch(guildId);
  const { members } = await expandMentionables(guild, resolved, fields.members || []);
  if (!members.length) return err('No valid members — everyone selected has left the server.');

  requestCooldowns.set(userId, Date.now());
  const requestId = newAllianceId();
  // A new request SUPERSEDES the player's earlier open ones — otherwise a declined/ignored
  // request (whose card Production may simply delete) would have no closing transition at all.
  // Superseded requests' Review buttons refuse via the status check in openAllianceModal.
  const playerData = await loadPlayerData();
  const stale = Object.entries(playerData[guildId]?.channelAdmin?.allianceRequests || {})
    .filter(([id, r]) => id !== requestId && r?.requesterId === userId && r?.status === 'open')
    .map(([id]) => ({ kind: 'allianceRequest', requestId: id, patch: { status: 'superseded' } }));
  await flushDeltas(guildId, [...stale, {
    kind: 'allianceRequest',
    requestId,
    patch: {
      requesterId: userId,
      members: members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
      channelId,
      configId: parsed.configId,
      status: 'open'
    }
  }]);

  console.log(`🤝 [ALLIANCE] Request ${requestId} by ${userId} in guild ${guildId} (${members.length} members)`);
  return buildAllianceRequestCard({ requestId, requesterId: userId, requesterName: displayName, members });
}
