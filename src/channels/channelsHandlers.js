/**
 * Channel Administration — handler bodies.
 *
 * app.js only routes; all logic lives here. Every action is a two-phase flow:
 *   modal submit → PLAN (pure preflight, mutates nothing) → confirm screen
 *   confirm      → EXECUTE (paced, streamed, upserting)
 *
 * Authority is the factory requiresPermission (CHANNEL_ADMIN_PERMISSIONS) on the app.js
 * channels blocks — the old per-entry whitelist re-checks are gone with the whitelist itself
 * (2026-08-16). Premium gating is the buildChannelsSection lock-swap, display-side.
 */
import { PermissionFlagsBits } from 'discord.js';
import { loadPlayerData } from '../../storage.js';
import { getRoleAccessOverwrites } from '../../utils/roleAccessUtils.js';
import {
  PLAYER_ACCESS, SPECTATOR_ACCESS, HOST_ACCESS,
  CATEGORY_NAMES, ACTIONS, PLAN_TTL_MS, MAX_JOB_SECONDS, PACE_DELETE, PACE_SEND
} from './channelAdminConfig.js';
import {
  channelName, assignChannelNames, buildOverwrites, preflightBudget, planCategoryBuckets, pairKey,
  planSubsPlacement, sanitizeCategoryBase
} from './channelPlan.js';
import {
  snapshotGuild, checkBotPermissions, ensureCategory, ensureChannel,
  deleteChannels, ensurePlayerRole, resolvePrincipal, moveChannelSafe
} from './channelOps.js';
import { runPacedJob, acquireJobLock, releaseJobLock, JobBusyError, renderProgress, patchOriginal } from './channelJob.js';
import { makeDeltaBuffer, flushDeltas } from './channelRegistry.js';
import { getAcceptedCast, expandMentionables, getTribePairs } from './channelRoster.js';
import { buildConfirmScreen, rosterLines } from './channelsView.js';

/**
 * Pending plans, keyed by a short token. The plan CANNOT live in the custom_id (100-char limit).
 * TTL-swept on every write so a stale plan can't be executed much later against a changed guild.
 */
const pendingPlans = new Map();

export function stashPlan(userId, plan) {
  const now = Date.now();
  for (const [k, v] of pendingPlans) if (now - v.at > PLAN_TTL_MS) pendingPlans.delete(k);
  const token = `${userId}_${now.toString(36)}`;
  pendingPlans.set(token, { ...plan, at: now, userId });
  return token;
}

export function takePlan(token, userId) {
  const plan = pendingPlans.get(token);
  if (!plan) return null;
  if (plan.userId !== String(userId)) return null; // a plan is not transferable
  if (Date.now() - plan.at > PLAN_TTL_MS) {
    pendingPlans.delete(token);
    return null;
  }
  pendingPlans.delete(token); // single-use — prevents a double-click running twice
  return plan;
}

/**
 * Which surface a user last opened the Channels row from, so Cancel / ← Back returns THERE
 * rather than always dumping them on the Season Manager tab.
 *
 * Recorded at RENDER time by whoever draws the row — buildChannelsView → 'season',
 * MenuBuilder.buildPremiumMenu → 'premium'. It is a plain Map and NOT part of any custom_id
 * because every Channels id already spends its 100-char budget on the configId, and the
 * alliance parsers (alliancePlan.js:114-131) treat the trailing remainder AS the configId —
 * there is nowhere to put an origin token without touching eight parse sites.
 *
 * Deliberate limitation: it tracks the LAST render, so clicking a button on a stale Premium
 * message after opening the Season Manager tab returns you to the tab. It self-corrects on the
 * next render, and Stage 2 (dropping configId from the ids) removes the need for this entirely.
 */
const channelsOrigin = new Map();

/** @param {'season'|'premium'} origin */
export function setChannelsOrigin(userId, origin) {
  if (userId) channelsOrigin.set(String(userId), origin);
}

/** @returns {'season'|'premium'} defaults to 'season' — the pre-Premium behaviour */
export function getChannelsOrigin(userId) {
  return channelsOrigin.get(String(userId)) || 'season';
}

const err = (msg) => ({ components: [{ type: 17, accent_color: 0xe74c3c, components: [{ type: 10, content: `## ❌ ${msg}` }] }] });

/** The Channels tab itself. */
export async function handleChannelsTab({ configId, guildId, userId, client }) {
  const { buildChannelsView } = await import('./channelsView.js');
  const guild = await client.guilds.fetch(guildId);
  const playerData = await loadPlayerData();
  const seasonName = playerData[guildId]?.applicationConfigs?.[configId]?.seasonName || `Season ${configId}`;
  return await buildChannelsView({ configId, guildId, playerData, seasonName, guild, userId });
}

/** Roles modal submit — the one action with no bulk work, so it applies immediately. */
export async function setTrustedSpectator({ guildId, roleId }) {
  await flushDeltas(guildId, [{ kind: 'trustedSpectator', roleId: roleId || null }]);
  return {
    components: [{
      type: 17,
      accent_color: 0x2ecc71,
      components: [{
        type: 10,
        content: roleId
          ? `## ✅ Trusted Spectator set\n<@&${roleId}> can now read and react in confessionals created from here.\n-# Existing channels aren't retroactively updated — re-run Confessionals to apply it to them.`
          : '## ✅ Trusted Spectator cleared\nNo role will be granted spectator access on new confessionals.'
      }]
    }]
  };
}

/**
 * 🔗 Manual Roles — link ONE player to an EXISTING role (interop with hand-made or
 * other-bot roles, 2026-08-16). Writes the same {kind:'playerRole'} delta the Player Roles
 * exec emits, so everything downstream (resolvePrincipal, the kill switch, the roster line)
 * treats the foreign role exactly like a CastBot-created one. Deliberately does NOT assign
 * the role to the member — holding it could expose their casting status early.
 */
export async function applyManualRole({ configId, guildId, userId, client, fields }) {
  const err = (msg) => ({ components: [{ type: 17, accent_color: 0xe74c3c, components: [
    { type: 10, content: `## ❌ ${msg}` }
  ]}] });

  const targetUserId = fields.user?.[0];
  const roleId = fields.role?.[0];
  if (!targetUserId || !roleId) return err('Pick both a player and a role.');

  const guild = await client.guilds.fetch(guildId);
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return err('That role no longer exists.');
  if (role.managed) return err('That role belongs to an integration/bot and cannot be assigned to players — pick a normal role.');
  if (role.id === guildId) return err('@everyone cannot be a personal player role.');

  const playerData = await loadPlayerData();
  const previous = playerData[guildId]?.players?.[targetUserId]?.playerRoleId || null;
  await flushDeltas(guildId, [{ kind: 'playerRole', userId: targetUserId, roleId }]);
  console.log(`🔗 [CHANNEL_ADMIN] Manual role link: ${targetUserId} → role ${roleId} (${role.name})${previous ? ` (replaced ${previous})` : ''} by ${userId} in guild ${guildId}`);

  // The Channels tab is the confirmation — its Player Roles roster line now names the link.
  return await handleChannelsTab({ configId, guildId, userId, client });
}

/**
 * Pure — invert players[*].playerRoleId into roleId → [userIds]. An ARRAY per role because a
 * mis-click in Manually Link can point two players at one role; Activate must then assign
 * both (and the summary makes the duplication visible) rather than silently picking one.
 * Exported for tests.
 */
export function invertPlayerRoles(players) {
  const byRole = new Map();
  for (const [userId, p] of Object.entries(players || {})) {
    if (!p?.playerRoleId) continue;
    if (!byRole.has(p.playerRoleId)) byRole.set(p.playerRoleId, []);
    byRole.get(p.playerRoleId).push(userId);
  }
  return byRole;
}

/**
 * 🟢 Activate button → the modal (or an explanation when there is nothing to activate).
 * Options are resolved HERE (live roles + member names) because a modal can't filter a
 * Role Select — the String Select's options ARE the linked roles.
 */
export async function openActivateModal({ configId, guildId, client }) {
  const err = (msg) => ({ components: [{ type: 17, accent_color: 0xf39c12, components: [
    { type: 10, content: `## 🟢 Nothing to activate\n${msg}` }
  ]}] });

  const playerData = await loadPlayerData();
  const byRole = invertPlayerRoles(playerData[guildId]?.players);
  if (!byRole.size) return err('No player roles are linked yet — run 🎭 Auto Create or 🔗 Manually Link first.');

  const guild = await client.guilds.fetch(guildId);
  const allIds = [...byRole.values()].flat();
  await guild.members.fetch({ user: allIds }).catch(() => {});

  const options = [];
  for (const [roleId, userIds] of byRole) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue; // deleted since linking — resolvePrincipal self-heals it on the next run
    for (const userId of userIds) {
      const member = guild.members.cache.get(userId);
      options.push({
        roleId,
        playerName: member?.displayName || role.name,
        roleName: role.name
      });
    }
  }
  if (!options.length) return err('Every linked role has been deleted in Discord — re-run 🎭 Auto Create.');

  options.sort((a, b) => a.playerName.localeCompare(b.playerName));
  const { buildActivateModal } = await import('./channelsView.js');
  return { type: 9, data: buildActivateModal({ configId, options, hidden: Math.max(0, options.length - 25) }) };
}

/**
 * Pure — classify what Activate will do per (role, player) link. Exported for tests.
 * @param {string[]} picked - roleIds chosen in the modal
 * @param {Map<string, string[]>} byRole - invertPlayerRoles output
 * @param {Map<string, string>} roles - ALL live roleId → name (old-role lookups need non-picked roles)
 * @param {Map<string, {displayName: string, roleIds: Set<string>}>} members - live members only
 * @param {Map<string, string>} previous - userId → previousPlayerRoleId (the re-link marker)
 * @returns {{items: Array, already: Array, notes: string[]}} items = what exec will do
 *   ({userId, displayName, roleId, roleName, oldRoleId, oldRoleName} — oldRole* set only when the
 *   player still HOLDS a different, still-live previous player role: the @old → @new move).
 */
export function classifyActivation({ picked, byRole, roles, members, previous }) {
  const items = [];
  const already = [];
  const notes = [];
  for (const roleId of picked) {
    const roleName = roles.get(roleId);
    const userIds = byRole.get(roleId) || [];
    if (!roleName) { notes.push(`> ❌ \`${roleId}\` — role no longer exists`); continue; }
    if (!userIds.length) { notes.push(`> ❌ @${roleName} — no longer linked to a player`); continue; }
    for (const uid of userIds) {
      const m = members.get(uid);
      if (!m) { notes.push(`> ❌ @${roleName} — linked player left the server`); continue; }
      if (m.roleIds.has(roleId)) { already.push({ displayName: m.displayName, roleName }); continue; }
      const prev = previous.get(uid);
      const oldRoleName = (prev && prev !== roleId && m.roleIds.has(prev)) ? (roles.get(prev) || null) : null;
      items.push({
        userId: uid, displayName: m.displayName, roleId, roleName,
        oldRoleId: oldRoleName ? prev : null, oldRoleName
      });
    }
  }
  return { items, already, notes };
}

/**
 * 🟢 Activate submit → PLAN. Nothing is assigned here — the classification becomes a confirm
 * screen naming every change (➕ gains / 🔁 @old → @new move / ✅ no change), and only
 * channels_exec_* touches Discord, matching every other Channels action. Moves come from
 * previousPlayerRoleId (stamped by the playerRole delta when a link is re-pointed);
 * executing a move removes the old role too, so the player never wears both.
 */
export async function planActivate({ configId, guildId, userId, client, fields }) {
  const picked = fields.activate_roles || [];
  if (!picked.length) return err('Pick at least one player role to assign.');

  const playerData = await loadPlayerData();
  const players = playerData[guildId]?.players || {};
  const byRole = invertPlayerRoles(players);
  const guild = await client.guilds.fetch(guildId);
  const linkedIds = [...byRole.values()].flat();
  await guild.members.fetch({ user: linkedIds }).catch(() => {});

  const { items, already, notes } = classifyActivation({
    picked,
    byRole,
    roles: new Map(guild.roles.cache.map((r) => [r.id, r.name])),
    members: new Map(linkedIds
      .map((uid) => [uid, guild.members.cache.get(uid)])
      .filter(([, m]) => m)
      .map(([uid, m]) => [uid, { displayName: m.displayName, roleIds: new Set(m.roles.cache.keys()) }])),
    previous: new Map(Object.entries(players)
      .filter(([, p]) => p?.previousPlayerRoleId)
      .map(([uid, p]) => [uid, p.previousPlayerRoleId]))
  });

  // Every change on ONE screen, exact and per-player — the confirm IS the data-change review.
  const changeLines = [
    ...items.map((it) => it.oldRoleId
      ? `> 🔁 **${it.displayName}** — @${it.oldRoleName} → @${it.roleName} *(old role removed)*`
      : `> ➕ **${it.displayName}** — gains @${it.roleName}`),
    ...already.map((a) => `> ✅ **${a.displayName}** — @${a.roleName} *(already assigned — no change)*`),
    ...notes
  ];
  const shown = changeLines.slice(0, 20);
  const overflow = changeLines.length - shown.length;

  if (!items.length) {
    return buildConfirmScreen({
      configId,
      blocked: true,
      title: 'Nothing to assign',
      lines: [
        ...shown,
        ...(overflow > 0 ? [`> -# …and ${overflow} more`] : []),
        '',
        '-# Every selected role is already where it should be — nothing would change.'
      ],
      confirmLabel: ''
    });
  }

  const moves = items.filter((it) => it.oldRoleId).length;
  const token = stashPlan(userId, { type: 'activate', configId, guildId, items });
  return buildConfirmScreen({
    token,
    configId,
    title: `🟢 Activate ${items.length} player role${items.length > 1 ? 's' : ''}?`,
    lines: [
      `> **${items.length}** to assign${moves ? ` · **${moves}** move${moves > 1 ? 's' : ''}` : ''}${already.length ? ` · **${already.length}** already assigned` : ''}`,
      '',
      '**Changes:**',
      ...shown,
      ...(overflow > 0 ? [`> -# …and ${overflow} more`] : []),
      '',
      "-# ⚠️ **This is the reveal.** Assigned roles appear on player profiles — players and specs can see who has been cast. Don't run this before marooning unless you intend that."
    ],
    confirmLabel: `Assign ${items.length} role${items.length > 1 ? 's' : ''}`
  });
}

/**
 * 🟢 Activate exec — the ONLY step that touches Discord. Paced role edits; a move also removes
 * the old role, then drops the previousPlayerRoleId marker (buffered delta — runPacedJob flushes
 * between batches, never inside the API loop). Idempotent: an already-held role is left alone.
 */
async function execActivate({ plan, guild, buffer, flush, progress }) {
  await guild.members.fetch({ user: plan.items.map((it) => it.userId) }).catch(() => {});

  return await runPacedJob({
    items: plan.items,
    buffer, flush, progress,
    step: async (it) => {
      const member = guild.members.cache.get(it.userId) || (await guild.members.fetch(it.userId).catch(() => null));
      if (!member) return { ok: false, error: `${it.displayName} — left the server` };
      try {
        if (!member.roles.cache.has(it.roleId)) {
          await member.roles.add(it.roleId, 'CastBot player-role activation');
        }
        if (it.oldRoleId && member.roles.cache.has(it.oldRoleId)) {
          await member.roles.remove(it.oldRoleId, 'CastBot player-role move — old role superseded');
        }
        if (it.oldRoleId) buffer.push({ kind: 'playerRole', userId: it.userId, clearPrevious: true });
        return { ok: true, label: `${it.displayName} — @${it.roleName}` };
      } catch (e) {
        // Most common cause: the role sits ABOVE CastBot's highest role.
        return { ok: false, error: `${it.displayName} — @${it.roleName} (${e.message?.includes('Missing Permissions') ? 'role is above CastBot in the role list' : e.message})` };
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 📨 Msg Category — broadcast composer
// ─────────────────────────────────────────────────────────────────────────────

/** Read the persisted draft for this season. */
async function getDraft(guildId, configId) {
  const playerData = await loadPlayerData();
  return playerData[guildId]?.channelAdmin?.[configId]?.broadcast || {};
}

/**
 * Expand the picked channels/categories into the real post list.
 * Reuses channelArchiver's pure expander: it dedupes (a category AND a child inside it won't post
 * twice) and tags each channel with its category name.
 */
async function expandTargets(guild, targets) {
  const { expandArchiveSelection } = await import('../../channelArchiver.js');
  const all = await guild.channels.fetch(); // cache holds only ~50 — must fetch
  const normalized = [...all.values()].filter(Boolean).map((c) => ({
    id: c.id, name: c.name, type: c.type, parent_id: c.parentId, position: c.position
  }));
  return expandArchiveSelection(targets || [], normalized);
}

/** Render the composer (the tab's 📨 Msg Category button, and every refresh after an edit). */
export async function handleMsgComposer({ configId, guildId, client }) {
  const { buildMsgComposer } = await import('./channelsView.js');
  const draft = await getDraft(guildId, configId);

  let targetSummary = null;
  if (draft.targets?.length) {
    const guild = await client.guilds.fetch(guildId);
    const { channels, categoryCount } = await expandTargets(guild, draft.targets);
    const parts = [`**${channels.length}** channel${channels.length === 1 ? '' : 's'} selected`];
    if (categoryCount) parts.push(`from **${categoryCount}** categor${categoryCount === 1 ? 'y' : 'ies'}`);
    targetSummary = channels.length ? parts.join(' ') : '⚠️ Selection expands to **0** channels.';
  }

  return buildMsgComposer({ configId, draft, targetSummary });
}

/** The Channel Select — persist the picked targets, then re-render. */
export async function saveMsgTargets({ configId, guildId, client, values }) {
  await flushDeltas(guildId, [{ kind: 'broadcast', configId, patch: { targets: values || [] } }]);
  return await handleMsgComposer({ configId, guildId, client });
}

/** The compose modal submit — persist the card fields, then re-render. */
export async function saveMsgDraft({ configId, guildId, client, data }) {
  const { extractRichCardValues } = await import('../../richCardUI.js');
  const values = extractRichCardValues(data);

  // Upload-mode image: re-host to #🗺️castbot-images; 0 files = keep the draft's
  // current image (the patch below would otherwise clear it with ''). Runs inside
  // an already-deferred handler (channels_modal_submit), so network here is safe.
  const { resolveUploadedImageField } = await import('../images/modalImageUpload.js');
  const currentImage = (await getDraft(guildId, configId)).image || '';
  const guild = await client.guilds.fetch(guildId);
  await resolveUploadedImageField({ fields: values, data, guild,
    context: `channels_msg_${configId}`, currentValue: currentImage,
    description: `Channels broadcast image (${configId})` });

  const { title, content, color, image } = values;
  // `targets` is deliberately absent from the patch so the channel selection survives an edit.
  await flushDeltas(guildId, [{ kind: 'broadcast', configId, patch: { title, content, color, image } }]);
  return await handleMsgComposer({ configId, guildId, client });
}

/** Plan the broadcast — expands categories and shows the real blast radius before anything posts. */
export async function planBroadcast({ configId, guildId, userId, client }) {
  const guild = await client.guilds.fetch(guildId);
  const draft = await getDraft(guildId, configId);

  if (!draft.content && !draft.title && !draft.image) return err('Write a message first.');
  if (!draft.targets?.length) return err('Pick at least one channel or category first.');

  const { channels, categoryCount } = await expandTargets(guild, draft.targets);
  if (!channels.length) return err('That selection expands to no text channels.');

  // Fail fast rather than posting half the list and 403ing on the rest.
  const me = guild.members?.me ?? (await guild.members.fetchMe().catch(() => null));
  const blocked = channels.filter((c) => {
    const ch = guild.channels.cache.get(c.id);
    return ch && me && !ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages);
  });
  const sendable = channels.filter((c) => !blocked.some((b) => b.id === c.id));
  if (!sendable.length) return err('CastBot cannot post in any of the selected channels.');

  const etaSeconds = Math.ceil((sendable.length / PACE_SEND.n) * (PACE_SEND.ms / 1000));
  const token = stashPlan(userId, {
    type: 'broadcast', configId, guildId,
    channels: sendable.map((c) => ({ id: c.id, name: c.name })),
    card: { title: draft.title, content: draft.content, color: draft.color, image: draft.image }
  });

  return buildConfirmScreen({
    token,
    configId,
    title: `⚠️ Post this message to ${sendable.length} channel${sendable.length === 1 ? '' : 's'}?`,
    lines: [
      `> **${sendable.length}** channel${sendable.length === 1 ? '' : 's'}${categoryCount ? ` · **${categoryCount}** categor${categoryCount === 1 ? 'y' : 'ies'} expanded` : ''}`,
      `> Estimated time: **~${formatEta(etaSeconds)}**`,
      '',
      ...sendable.slice(0, 15).map((c) => `> • #${c.name}`),
      ...(sendable.length > 15 ? [`> -# …and ${sendable.length - 15} more`] : []),
      ...(blocked.length ? ['', `> ⚠️ **${blocked.length}** skipped — CastBot can't post there: ${blocked.slice(0, 5).map((c) => `#${c.name}`).join(', ')}`] : []),
      '',
      '-# **This cannot be undone** — players see it immediately. Re-sending posts a SECOND copy.'
    ],
    confirmLabel: `Post to ${sendable.length} channel${sendable.length === 1 ? '' : 's'}`,
    destructive: true
  });
}

/** Shared: resolve the member list an action targets. */
async function resolveTargets({ mode, guild, guildId, configId, resolved, values }) {
  if (mode === 'specific') {
    const { members, dropped } = await expandMentionables(guild, resolved, values);
    return { members, dropped, skipped: [] };
  }
  const { roster, skipped } = await getAcceptedCast(guildId, configId, guild);
  return { members: roster, dropped: [], skipped };
}

/**
 * "No accepted cast" — but say WHY, naming anyone who has been offered a place and not marked Cast.
 *
 * That combination is the one silent failure mode of the roster: the host has done the work
 * (invites are out) and still sees an empty roster, because nothing in STATUS_REGISTRY tests
 * `offerStatus`. Naming them turns a dead end into an instruction.
 */
function emptyRosterMessage(skipped = []) {
  const offered = skipped.filter((s) => s.offered);
  if (!offered.length) {
    return 'No accepted cast in this server yet. Set players to **Cast** on the Casting tab first.';
  }
  const names = offered.slice(0, 10).map((s) => s.displayName).join(', ');
  return `No accepted cast yet — but **${offered.length}** player${offered.length > 1 ? 's have' : ' has'} been ` +
    `offered a place without being marked **Cast**: ${names}` +
    `${offered.length > 10 ? `, …and ${offered.length - 10} more` : ''}. ` +
    'Mark them **Cast** on the Casting tab and run this again.';
}

/**
 * RaP 0881 — resolve the pure placement planner's tribe inputs.
 * Draft tribes come from the DEFAULT castlist (the same source 1on1s trusts); registry
 * per-tribe categories are live-filtered so a hand-deleted category is recreated, not pointed at.
 */
async function subsPlacementInputs({ placement, guildId, client, node, snapshot }) {
  const tribesByUser = new Map();
  if (placement === 'per_tribe') {
    const { getTribesForCastlist } = await import('../../castlistDataAccess.js');
    const tribes = await getTribesForCastlist(guildId, 'default', client).catch(() => []);
    for (const t of tribes || []) {
      for (const m of t.members || []) {
        if (!tribesByUser.has(m.id)) tribesByUser.set(m.id, []);
        tribesByUser.get(m.id).push({ roleId: t.roleId, name: t.name });
      }
    }
  }

  const tribeCategories = {};
  for (const [rid, cid] of Object.entries(node.categories?.subsByTribe || {})) {
    if (snapshot.channels.get(cid)) tribeCategories[rid] = { id: cid, childCount: snapshot.childCount.get(cid) || 0 };
  }

  return { tribesByUser, tribeCategories };
}

/** RaP 0881 — confirm-screen lines for a non-default placement. */
function placementLines(pp, base) {
  if (!pp) return [];
  const lines = [];
  const parts = pp.buckets.filter((b) => b.items.length).map((b) => `**${b.categoryName}** (${b.items.length})`);
  if (parts.length) lines.push(`> 📂 ${parts.slice(0, 6).join(' · ')}${parts.length > 6 ? ` · …and ${parts.length - 6} more` : ''}`);
  if (pp.moves.length) lines.push(`> 📦 **${pp.moves.length}** existing channel${pp.moves.length > 1 ? 's' : ''} will be **moved** (permissions untouched).`);
  if (pp.tribeless.length) lines.push(`-# ${pp.tribeless.length} player${pp.tribeless.length > 1 ? 's have' : ' has'} no draft tribe → "${base}".`);
  if (pp.multiTribe.length) lines.push(`-# ⚠️ ${pp.multiTribe.length} on multiple tribes (first wins): ${pp.multiTribe.slice(0, 5).map((m) => m.displayName).join(', ')}`);
  return lines;
}

/** RaP 0881 — stash shape for placement buckets (items collapse to userIds). */
function serializeBuckets(pp) {
  if (!pp) return null;
  return pp.buckets.map((b) => ({
    categoryName: b.categoryName,
    categoryId: b.categoryId,
    tribeRoleId: b.tribeRoleId || null,
    userIds: b.items.map((i) => i.userId)
  }));
}

/** Shared: host overwrites (globalRoleAccess) + @everyone id. */
async function accessContext(guild, playerData) {
  const roleAccessEntries = await getRoleAccessOverwrites(guild, HOST_ACCESS, { playerData, logPrefix: 'CHANNEL_ADMIN' });
  return { everyoneId: guild.roles.everyone?.id ?? guild.id, roleAccessEntries };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the plan + confirm screen for confessionals/subs.
 * @param {'confessional'|'subs'} kind
 */
export async function planChannels({ kind, mode, configId, guildId, userId, client, resolved, values, placement = 'keep', categoryName = '' }) {
  // Placement is a subs-only concept (RaP 0881); the confessionals modal has no such field.
  if (kind !== 'subs' || !['keep', 'single', 'per_tribe'].includes(placement)) placement = 'keep';
  const guild = await client.guilds.fetch(guildId);
  const perms = await checkBotPermissions(guild);
  if (!perms.ok) return err(`CastBot is missing the **${perms.missing.join('** and **')}** permission${perms.missing.length > 1 ? 's' : ''}.`);

  const snapshot = await snapshotGuild(guild);
  const playerData = await loadPlayerData();
  const node = playerData[guildId]?.channelAdmin?.[configId] || {};
  const registry = kind === 'subs' ? (node.subs || {}) : (node.confessionals || {});
  const bucket = kind === 'subs' ? 'subs' : 'confessional';

  // ── Delete ALL ──────────────────────────────────────────────────────────────
  if (mode === 'delete_all') {
    // NEVER name-match guild-wide: only registry entries and children of OUR categories, so a
    // hand-made #foo-confessional elsewhere is untouched.
    const ourCategoryIds = (node.categories?.[bucket] || []);
    const ids = new Set(Object.values(registry).map((r) => r.channelId).filter(Boolean));
    for (const ch of snapshot.channels.values()) {
      if (ch?.parentId && ourCategoryIds.includes(ch.parentId)) ids.add(ch.id);
    }
    const targets = [...ids].map((id) => snapshot.channels.get(id)).filter(Boolean);

    if (!targets.length) return err(`No ${kind === 'subs' ? 'subs' : 'confessional'} channels to delete for this season.`);

    // channelId → registry key, so a successful delete also clears its registry entry.
    const keyByChannel = {};
    for (const [uid, rec] of Object.entries(registry)) {
      if (rec?.channelId) keyByChannel[rec.channelId] = uid;
    }

    const token = stashPlan(userId, { type: 'delete', kind, configId, guildId, channelIds: targets.map((c) => c.id), keyByChannel });
    return buildConfirmScreen({
      token,
      configId,
      title: `⚠️ Delete ${targets.length} ${kind === 'subs' ? 'subs' : 'confessional'} channel${targets.length > 1 ? 's' : ''}?`,
      lines: [
        '**This permanently deletes the channels and all their history.**',
        '',
        ...targets.slice(0, 15).map((c) => `> • #${c.name}`),
        ...(targets.length > 15 ? [`> -# …and ${targets.length - 15} more`] : []),
        '',
        '-# Only channels CastBot created for this season (its registry + its own categories) are listed.'
      ],
      confirmLabel: `Delete ${targets.length} channel${targets.length > 1 ? 's' : ''}`,
      destructive: true
    });
  }

  // ── Convert application channels to subs ────────────────────────────────────
  if (mode === 'convert') {
    const { roster, skipped } = await getAcceptedCast(guildId, configId, guild);
    const names = assignChannelNames(roster, 'subs');
    const items = [];
    const blocked = [];

    for (const p of roster) {
      const live = snapshot.channels.get(p.appChannelId);
      if (!live) {
        blocked.push(`${p.displayName} — application channel is gone`);
        continue;
      }
      items.push({ ...p, targetName: names.get(p.userId), appChannel: live });
    }

    if (!items.length) return err('No accepted applicants with a live application channel to convert.');

    // RaP 0881 — non-default placement also MOVES the converted channels into their category.
    let pp = null;
    const base = sanitizeCategoryBase(categoryName, CATEGORY_NAMES.subs);
    if (placement !== 'keep') {
      const { tribesByUser, tribeCategories } = await subsPlacementInputs({ placement, guildId, client, node, snapshot });
      const channelsByUser = new Map(items.map((i) => [i.userId, { channelId: i.appChannel.id, parentId: i.appChannel.parentId || null }]));
      const existingCats = (node.categories?.subs || [])
        .map((id) => snapshot.channels.get(id))
        .filter(Boolean)
        .map((c) => ({ id: c.id, name: c.name, childCount: snapshot.childCount.get(c.id) || 0 }));
      pp = planSubsPlacement(items, { placement, baseName: base, tribesByUser, tribeCategories, existing: existingCats, channelsByUser });

      const newCategories = pp.buckets.filter((b) => !b.categoryId && b.items.length).length;
      const budget = preflightBudget({ existing: snapshot.counts, create: { channels: 0, categories: newCategories } });
      if (!budget.ok) return budgetRefusal(budget, configId);
    }

    const token = stashPlan(userId, {
      type: 'convert', kind: 'subs', configId, guildId,
      items: items.map(serializeItem),
      placement, buckets: serializeBuckets(pp)
    });
    return buildConfirmScreen({
      token,
      configId,
      title: `Convert ${items.length} application channel${items.length > 1 ? 's' : ''} to subs?`,
      lines: [
        `> **${items.length}** channel${items.length > 1 ? 's' : ''} will be renamed and re-permissioned${placement === 'keep' ? ' in place' : ''}.`,
        ...placementLines(pp, base),
        `> Both the player **and** their player role get access (belt-and-braces).`,
        '',
        ...items.slice(0, 25).map((i) =>
          `> • **${i.displayName}** — #${i.appChannel.name} → #${i.targetName}` +
          (i.fromCurrentSeason ? '' : ` -# *${i.seasonName}*`)),
        ...(items.length > 25 ? [`> -# …and ${items.length - 25} more`] : []),
        ...(blocked.length ? ['', ...blocked.slice(0, 5).map((b) => `> ⚠️ ${b}`)] : []),
        ...(skipped.length ? ['', `-# ${skipped.length} applicant(s) skipped (not accepted / withdrawn / left).`] : []),
        '',
        '-# Discord limits renames to 2 per 10 minutes per channel — a rename that hits it is reported, not failed.'
      ],
      confirmLabel: `Convert ${items.length} channel${items.length > 1 ? 's' : ''}`
    });
  }

  // ── Create / update ─────────────────────────────────────────────────────────
  const { members, dropped, skipped } = await resolveTargets({ mode, guild, guildId, configId, resolved, values });
  if (!members.length) {
    return err(mode === 'specific'
      ? 'No valid players selected — everyone you picked has left the server.'
      : emptyRosterMessage(skipped));
  }

  const names = assignChannelNames(members, kind === 'subs' ? 'subs' : 'confessional');
  const toCreate = members.filter((m) => {
    const known = registry[m.userId]?.channelId;
    if (known && snapshot.channels.get(known)) return false;
    return !snapshot.findByName(names.get(m.userId), null) || true; // adopt-by-name is resolved at run time
  });
  const creatingIds = new Set(toCreate.map((m) => m.userId));

  const existingCats = (node.categories?.[bucket] || [])
    .map((id) => snapshot.channels.get(id))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name, childCount: snapshot.childCount.get(c.id) || 0 }));

  // RaP 0881 — subs buckets are placement-aware; confessionals keep the default tree.
  const base = sanitizeCategoryBase(categoryName, CATEGORY_NAMES.subs);
  let pp = null;
  let buckets;
  if (kind === 'subs') {
    const { tribesByUser, tribeCategories } = await subsPlacementInputs({ placement, guildId, client, node, snapshot });
    const channelsByUser = new Map();
    for (const [uid, rec] of Object.entries(registry)) {
      const live = rec?.channelId ? snapshot.channels.get(rec.channelId) : null;
      if (live) channelsByUser.set(uid, { channelId: live.id, parentId: live.parentId || null });
    }
    pp = planSubsPlacement(members, {
      placement,
      baseName: placement === 'keep' ? CATEGORY_NAMES.subs : base,
      tribesByUser, tribeCategories, existing: existingCats, channelsByUser
    });
    buckets = pp.buckets;
  } else {
    buckets = planCategoryBuckets(members, { baseName: CATEGORY_NAMES[bucket], existing: existingCats });
  }
  const newCategories = buckets.filter((b) => !b.categoryId).length;
  const moveCount = pp?.moves.length || 0;

  const budget = preflightBudget({
    existing: snapshot.counts,
    create: { channels: toCreate.length, categories: newCategories }
  });

  if (!budget.ok) return budgetRefusal(budget, configId);
  if (budget.etaSeconds > MAX_JOB_SECONDS) return etaRefusal(budget, configId);

  const token = stashPlan(userId, {
    type: 'create', kind, configId, guildId, placement,
    items: members.map((m) => ({ ...serializeItem(m), targetName: names.get(m.userId) })),
    buckets: buckets.map((b) => ({ categoryName: b.categoryName, categoryId: b.categoryId, tribeRoleId: b.tribeRoleId || null, userIds: b.items.map((i) => i.userId) }))
  });

  return buildConfirmScreen({
    token,
    configId,
    title: `Create / update ${members.length} ${kind === 'subs' ? 'subs' : 'confessional'} channel${members.length > 1 ? 's' : ''}?`,
    lines: [
      `> **${toCreate.length}** to create · **${members.length - toCreate.length}** already exist (${placement === 'keep' ? 'left alone' : 'moved if misplaced'})`,
      `> **${newCategories}** new categor${newCategories === 1 ? 'y' : 'ies'} · guild after: **${budget.after.channels}/500** channels, **${budget.after.categories}/50** categories`,
      `> Estimated time: **~${formatEta(budget.etaSeconds + moveCount)}**`,
      ...(placement !== 'keep' ? placementLines(pp, base) : []),
      '',
      ...(kind === 'confessional'
        ? ['> Player gets access via their **player role** where one exists, else directly.',
           '> Trusted Spectators can **read + react** (not post).']
        : ['> **Both** the player and their player role get access.']),
      ...rosterLines(members, { creating: creatingIds }),
      ...(dropped.length ? ['', `-# Dropped (left the server): ${dropped.slice(0, 10).map((d) => `<@${d.userId}>`).join(', ')}${dropped.length > 10 ? ` …and ${dropped.length - 10} more` : ''}`] : []),
      ...(skipped.length ? ['', `-# ${skipped.length} applicant(s) skipped (not accepted / withdrawn).`] : [])
    ],
    confirmLabel: toCreate.length ? `Create ${toCreate.length} channel${toCreate.length > 1 ? 's' : ''}` : 'Re-apply permissions'
  });
}

/** Plan the Player Roles action. */
export async function planPlayerRoles({ mode, configId, guildId, userId, client, values }) {
  const guild = await client.guilds.fetch(guildId);
  const perms = await checkBotPermissions(guild, [PermissionFlagsBits.ManageRoles]);
  if (!perms.ok) return err(`CastBot is missing the **${perms.missing.join('** and **')}** permission.`);

  const snapshot = await snapshotGuild(guild);
  let members;
  let skipped = [];

  if (mode === 'specific') {
    const { members: m, dropped } = await expandMentionables(guild, { users: Object.fromEntries((values || []).map((v) => [v, true])) }, values);
    members = m;
    skipped = dropped;
  } else {
    const r = await getAcceptedCast(guildId, configId, guild);
    members = r.roster;
    skipped = r.skipped;
  }

  if (!members.length) {
    return err(mode === 'specific' ? 'No valid players selected.' : emptyRosterMessage(skipped));
  }

  // A registry pointer to a role that no longer exists must be recreated, not reused.
  const needing = members.filter((m) => !m.playerRoleId || !snapshot.hasRole(m.playerRoleId));
  const budget = preflightBudget({ existing: snapshot.counts, create: { roles: needing.length } });
  if (!budget.ok) return budgetRefusal(budget, configId);

  if (!needing.length) {
    return err('Every targeted player already has a player role. Nothing to do.');
  }

  const token = stashPlan(userId, { type: 'player_roles', configId, guildId, items: needing.map(serializeItem) });
  return buildConfirmScreen({
    token,
    configId,
    title: `Create ${needing.length} player role${needing.length > 1 ? 's' : ''}?`,
    lines: [
      `> **${needing.length}** to create · **${members.length - needing.length}** already have one`,
      `> Guild after: **${budget.after.roles}/250** roles`,
      // The FULL targeted set, not just `needing` — the host needs to see who is in scope, with
      // ➕/✅ showing which of them actually get a new role.
      ...rosterLines(members, { creating: new Set(needing.map((m) => m.userId)) }),
      '',
      '-# Roles are created uncoloured and non-mentionable; recolour them in Discord as you like.',
      ...(skipped.length ? [`-# ${skipped.length} skipped (not accepted / withdrawn / left).`] : [])
    ],
    confirmLabel: `Create ${needing.length} role${needing.length > 1 ? 's' : ''}`
  });
}

/** Plan the 1on1 action. */
export async function planOneOnOnes({ mode, configId, guildId, userId, client, values }) {
  const guild = await client.guilds.fetch(guildId);
  const perms = await checkBotPermissions(guild);
  if (!perms.ok) return err(`CastBot is missing the **${perms.missing.join('** and **')}** permission${perms.missing.length > 1 ? 's' : ''}.`);

  const snapshot = await snapshotGuild(guild);
  const playerData = await loadPlayerData();
  const node = playerData[guildId]?.channelAdmin || {};
  const registry = node.oneOnOnes || {};

  const tribes = await getTribePairs(guildId, values, client, guild);
  if (!tribes.length) return err('No tribes found. Add tribes to the default castlist first (Marooning → New Tribe).');

  const allPairs = tribes.flatMap((t) => t.pairs.map((p) => ({ ...p, tribeRoleId: t.tribeRoleId, tribeName: t.tribeName })));
  if (!allPairs.length) return err('The selected tribes have fewer than 2 members each — no pairs to create.');

  // ── Delete ──────────────────────────────────────────────────────────────────
  if (mode === 'delete') {
    const ids = new Set();
    const keyByChannel = {};
    for (const p of allPairs) {
      const known = registry[p.pairKey]?.channelId;
      if (known && snapshot.channels.get(known)) {
        ids.add(known);
        keyByChannel[known] = p.pairKey;
      }
    }
    if (!ids.size) return err('No 1on1 channels recorded for the selected tribes.');

    const token = stashPlan(userId, { type: 'delete', kind: 'oneonone', configId, guildId, channelIds: [...ids], keyByChannel });
    return buildConfirmScreen({
      token,
      configId,
      title: `⚠️ Delete ${ids.size} 1on1 channel${ids.size > 1 ? 's' : ''}?`,
      lines: [
        '**This permanently deletes the channels and all their history.**',
        `> Tribes: ${tribes.map((t) => t.tribeName).join(', ')}`,
        '',
        '-# Only pair channels CastBot recorded are deleted.'
      ],
      confirmLabel: `Delete ${ids.size} channel${ids.size > 1 ? 's' : ''}`,
      destructive: true
    });
  }

  // ── Create / update ─────────────────────────────────────────────────────────
  // A pair already recorded (e.g. from another tribe pre-swap) is ADOPTED, never duplicated.
  const toCreate = allPairs.filter((p) => {
    const known = registry[p.pairKey]?.channelId;
    return !(known && snapshot.channels.get(known));
  });

  const existingCats = (node.oneOnOneCategories || [])
    .map((id) => snapshot.channels.get(id))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name, childCount: snapshot.childCount.get(c.id) || 0 }));

  const buckets = planCategoryBuckets(toCreate, { baseName: CATEGORY_NAMES.oneonone, existing: existingCats });
  const newCategories = buckets.filter((b) => !b.categoryId).length;

  const budget = preflightBudget({
    existing: snapshot.counts,
    create: { channels: toCreate.length, categories: newCategories }
  });

  if (!budget.ok) return budgetRefusal(budget, configId, tribes);
  if (budget.etaSeconds > MAX_JOB_SECONDS) return etaRefusal(budget, configId);

  if (!toCreate.length) return err('Every pair already has a 1on1 channel. Nothing to do.');

  const token = stashPlan(userId, {
    type: 'oneonone', configId, guildId,
    buckets: buckets.map((b) => ({
      categoryName: b.categoryName,
      categoryId: b.categoryId,
      pairs: b.items.map((p) => ({
        pairKey: p.pairKey,
        tribeRoleId: p.tribeRoleId,
        a: serializeItem(p.memberA),
        b: serializeItem(p.memberB)
      }))
    }))
  });

  return buildConfirmScreen({
    token,
    configId,
    title: `❔ Create ${toCreate.length} 1on1 channel${toCreate.length > 1 ? 's' : ''}?`,
    lines: [
      // Names, not just counts: pairs are combinatorial, so one unexpected member is the
      // difference between 66 and 78 channels. Listing PLAYERS (not pairs) keeps it readable.
      ...tribes.flatMap((t) => [
        `> **${t.tribeName}** — ${t.members.length} players → ${t.pairs.length} pairs`,
        `> -# ${t.members.slice(0, 25).map((m) => m.displayName).join(' · ')}` +
          (t.members.length > 25 ? ` …and ${t.members.length - 25} more` : '')
      ]),
      '',
      `> **${toCreate.length}** to create · **${allPairs.length - toCreate.length}** already exist`,
      `> **${newCategories}** new categor${newCategories === 1 ? 'y' : 'ies'}`,
      `> Guild after: **${budget.after.channels}/500** channels, **${budget.after.categories}/50** categories`,
      `> Estimated time: **~${formatEta(budget.etaSeconds)}**`,
      '',
      '-# Each pair gets one private channel; both players get access via their player role where one exists.'
    ],
    confirmLabel: `Create ${toCreate.length} channel${toCreate.length > 1 ? 's' : ''}`,
    destructive: toCreate.length >= 50
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a stashed plan. Called from the confirm button (already deferred by the factory).
 * @returns {Promise<Object>} the final summary Container
 */
export async function executePlan({ plan, guildId, userId, client, interactionToken, applicationId, invokedChannelId }) {
  const action = planAction(plan);
  let lockKey;
  try {
    lockKey = acquireJobLock(guildId, action, userId);
  } catch (e) {
    if (e instanceof JobBusyError) return err(e.message);
    throw e;
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    const snapshot = await snapshotGuild(guild);
    const playerData = await loadPlayerData();
    const buffer = makeDeltaBuffer();
    const flush = (deltas) => flushDeltas(guildId, deltas);
    const progress = { interactionToken, applicationId, title: planTitle(plan) };

    let summary;
    if (plan.type === 'broadcast') summary = await execBroadcast({ plan, progress });
    else if (plan.type?.startsWith('alliance_')) summary = await (await import('./allianceHandlers.js')).execAlliance({ plan, guild, snapshot, playerData, userId, invokedChannelId });
    else if (plan.type === 'delete') summary = await execDelete({ plan, guild, buffer, flush, progress, invokedChannelId });
    else if (plan.type === 'player_roles') summary = await execPlayerRoles({ plan, guild, snapshot, buffer, flush, progress });
    else if (plan.type === 'activate') summary = await execActivate({ plan, guild, buffer, flush, progress });
    else if (plan.type === 'convert') summary = await execConvert({ plan, guild, snapshot, playerData, buffer, flush, progress });
    else if (plan.type === 'oneonone') summary = await execOneOnOnes({ plan, guild, snapshot, playerData, buffer, flush, progress });
    else summary = await execCreate({ plan, guild, snapshot, playerData, buffer, flush, progress });

    await flushDeltas(guildId, [{
      kind: 'lastRun',
      configId: plan.configId,
      action,
      summary: { at: new Date().toISOString(), userId, created: summary.created, skipped: summary.skipped, failed: summary.failed }
    }]);

    // Alliance execs hand back the re-rendered manager (with the alliance selected) instead
    // of the generic summary card.
    return summary.screen || renderSummary(plan, summary);
  } finally {
    releaseJobLock(guildId, action);
  }
}

/**
 * Post the card to every planned channel, paced and streamed.
 *
 * Uses the raw REST endpoint rather than channel.send(): posting a Components V2 container needs
 * the IS_COMPONENTS_V2 flag, which is the established pattern (app.js:31476). DiscordRequest
 * throws on 429, so each channel is caught individually — one bad channel can't abort the run.
 */
async function execBroadcast({ plan, progress }) {
  const { DiscordRequest } = await import('../../utils.js');
  const { buildRichCardContainer } = await import('../../richCardUI.js');
  const container = buildRichCardContainer(plan.card);

  return await runPacedJob({
    items: plan.channels,
    pace: PACE_SEND,
    progress,
    step: async (ch) => {
      try {
        await DiscordRequest(`channels/${ch.id}/messages`, {
          method: 'POST',
          body: { flags: (1 << 15), components: [container] } // IS_COMPONENTS_V2
        });
        return { ok: true, label: ch.name };
      } catch (e) {
        return { ok: false, error: `#${ch.name}: ${e.message}` };
      }
    }
  });
}

async function execDelete({ plan, guild, progress, invokedChannelId }) {
  // Never delete the channel this interaction came from — progress rides the webhook token
  // (channel-independent), but deleting it mid-run is still a foot-gun.
  const r = await deleteChannels(guild, plan.channelIds, {
    pace: PACE_DELETE,
    protectIds: invokedChannelId ? [invokedChannelId] : []
  });

  const deltas = plan.channelIds
    .filter((id) => r.deleted.includes(id))
    .map((id) => ({ kind: 'remove', bucket: plan.kind === 'subs' ? 'subs' : (plan.kind === 'oneonone' ? 'oneonone' : 'confessional'), configId: plan.configId, key: keyForChannel(plan, id) }))
    .filter((d) => d.key);
  if (deltas.length) await flushDeltas(plan.guildId, deltas);

  return {
    created: r.deleted.length,
    skipped: r.protected.length,
    failed: r.failed.length,
    errors: r.failed.map((f) => f.error),
    deleted: true,
    protectedIds: r.protected
  };
}

async function execPlayerRoles({ plan, guild, snapshot, buffer, flush, progress }) {
  return await runPacedJob({
    items: plan.items,
    buffer, flush, progress,
    step: async (m) => {
      const { role, action } = await ensurePlayerRole(guild, {
        userId: m.userId,
        displayName: m.displayName,
        registryRoleId: m.playerRoleId,
        color: 0, // colour is a future enhancement — the parameter is already plumbed
        snapshot
      });
      buffer.push({ kind: 'playerRole', userId: m.userId, roleId: role.id });
      return { ok: true, skipped: action === 'reused', label: role.name };
    }
  });
}

async function execCreate({ plan, guild, snapshot, playerData, buffer, flush, progress }) {
  const { everyoneId, roleAccessEntries } = await accessContext(guild, playerData);
  const specRoleId = plan.kind === 'confessional'
    ? (playerData[plan.guildId]?.permissions?.trustedSpectatorRoleId || null)
    : null;

  const byUser = new Map(plan.items.map((i) => [i.userId, i]));
  const work = [];
  for (const b of plan.buckets) {
    for (const uid of b.userIds) work.push({ bucket: b, item: byUser.get(uid) });
  }

  const categoryIds = new Map();

  return await runPacedJob({
    items: work,
    buffer, flush, progress,
    step: async ({ bucket, item }) => {
      if (!item) return { ok: true, skipped: true };

      // Category is created lazily, once, on first use.
      let parentId = bucket.categoryId || categoryIds.get(bucket.categoryName);
      if (!parentId) {
        const { category } = await ensureCategory(guild, bucket.categoryName, {
          snapshot,
          overwrites: buildOverwrites({
            everyoneId, principals: [], roleAccessEntries, viewChannelBit: PermissionFlagsBits.ViewChannel
          })
        });
        parentId = category.id;
        categoryIds.set(bucket.categoryName, parentId);
        buffer.push(bucket.tribeRoleId
          ? { kind: 'tribeCategory', configId: plan.configId, tribeRoleId: bucket.tribeRoleId, categoryId: parentId }
          : { kind: 'category', bucket: plan.kind === 'subs' ? 'subs' : 'confessional', configId: plan.configId, categoryId: parentId });
      }

      const principals = principalsFor(plan.kind, item, snapshot, buffer);
      const overwrites = buildOverwrites({
        everyoneId, principals, spectatorRoleId: specRoleId, spectatorAccess: SPECTATOR_ACCESS,
        roleAccessEntries, viewChannelBit: PermissionFlagsBits.ViewChannel
      });

      const known = registryChannelId(playerData, plan, item.userId);
      const { channel, action } = await ensureChannel(guild, {
        registryId: known,
        name: item.targetName,
        parentId,
        overwrites,
        topic: plan.kind === 'subs'
          ? `Private submissions channel for ${item.displayName}`
          : `Confessional for ${item.displayName}`,
        snapshot
      });

      // RaP 0881 — non-default placement moves misplaced existing channels. `lockPermissions:
      // false` inside moveChannelSafe is what keeps the overwrites we just applied intact.
      let moved = false;
      if (plan.placement && plan.placement !== 'keep' && action !== 'created' && channel.parentId !== parentId) {
        moved = (await moveChannelSafe(channel, parentId)).moved;
      }

      buffer.push({
        kind: plan.kind === 'subs' ? 'subs' : 'confessional',
        configId: plan.configId, userId: item.userId,
        channelId: channel.id, name: channel.name, categoryId: parentId
      });

      return {
        ok: true,
        skipped: (action === 'reused' || action === 'adopted') && !moved,
        label: moved ? `${channel.name} (moved)` : channel.name
      };
    }
  });
}

async function execConvert({ plan, guild, snapshot, playerData, buffer, flush, progress }) {
  const { everyoneId, roleAccessEntries } = await accessContext(guild, playerData);

  // RaP 0881 — placement buckets (null when 'keep': converted channels stay where they are).
  const bucketByUser = new Map();
  if (plan.placement && plan.placement !== 'keep') {
    for (const b of plan.buckets || []) for (const uid of b.userIds) bucketByUser.set(uid, b);
  }
  const categoryIds = new Map();

  return await runPacedJob({
    items: plan.items,
    buffer, flush, progress,
    step: async (item) => {
      const channel = snapshot.channels.get(item.appChannelId) || (await guild.channels.fetch(item.appChannelId).catch(() => null));
      if (!channel) return { ok: false, error: `${item.displayName}: application channel gone` };

      // A withdrawn applicant's ✖️ marker must never be renamed away — see the F2 note below.
      if (/^✖️/.test(channel.name)) return { ok: true, skipped: true, label: `${channel.name} (withdrawn — skipped)` };

      // CRITICAL: withdrawn/submitted are derived ONLY from the LIVE channel name
      // (buildStatusSignals, playerStatus.js:74-75). Renaming ☑️x-app → x-subs would erase that
      // signal forever. Persist it as data FIRST so deriveStatus keeps working after the rename.
      buffer.push({
        kind: 'appConvert',
        channelId: item.appChannelId,
        completedAt: new Date().toISOString(),
        preConvertChannelName: channel.name,
        convertedToSubsAt: new Date().toISOString()
      });
      await flush(buffer.drain()); // must land BEFORE the rename

      // Subs: BOTH the user and their player role (deliberate — avoids lockout accidents).
      const principals = principalsFor('subs', item, snapshot, buffer);
      const overwrites = buildOverwrites({
        everyoneId, principals, roleAccessEntries, viewChannelBit: PermissionFlagsBits.ViewChannel
      });

      const { channel: ch, action, renamePending } = await ensureChannel(guild, {
        registryId: item.appChannelId,
        name: item.targetName,
        parentId: channel.parentId,
        overwrites,
        allowRename: true,
        snapshot
      });

      // RaP 0881 — move the converted channel into its planned category (permissions were
      // applied above; lockPermissions:false in moveChannelSafe keeps them intact).
      let moved = false;
      let targetCategoryId = null;
      const bucket = bucketByUser.get(item.userId);
      if (bucket) {
        targetCategoryId = bucket.categoryId || categoryIds.get(bucket.categoryName);
        if (!targetCategoryId) {
          const { category } = await ensureCategory(guild, bucket.categoryName, {
            snapshot,
            overwrites: buildOverwrites({ everyoneId, principals: [], roleAccessEntries, viewChannelBit: PermissionFlagsBits.ViewChannel })
          });
          targetCategoryId = category.id;
          categoryIds.set(bucket.categoryName, targetCategoryId);
          buffer.push(bucket.tribeRoleId
            ? { kind: 'tribeCategory', configId: plan.configId, tribeRoleId: bucket.tribeRoleId, categoryId: targetCategoryId }
            : { kind: 'category', bucket: 'subs', configId: plan.configId, categoryId: targetCategoryId });
        }
        moved = (await moveChannelSafe(ch, targetCategoryId)).moved;
      }

      buffer.push({
        kind: 'subs', configId: plan.configId, userId: item.userId,
        channelId: ch.id, name: ch.name, convertedFrom: item.appChannelId,
        ...(targetCategoryId ? { categoryId: targetCategoryId } : {})
      });

      return {
        ok: true,
        skipped: action === 'reused' && !renamePending && !moved,
        label: renamePending ? `${ch.name} (rename deferred — rate limit)` : (moved ? `${ch.name} (moved)` : ch.name)
      };
    }
  });
}

async function execOneOnOnes({ plan, guild, snapshot, playerData, buffer, flush, progress }) {
  const { everyoneId, roleAccessEntries } = await accessContext(guild, playerData);
  const registry = playerData[plan.guildId]?.channelAdmin?.oneOnOnes || {};
  const categoryIds = new Map();

  const work = plan.buckets.flatMap((b) => b.pairs.map((p) => ({ bucket: b, pair: p })));

  return await runPacedJob({
    items: work,
    buffer, flush, progress,
    step: async ({ bucket, pair }) => {
      let parentId = bucket.categoryId || categoryIds.get(bucket.categoryName);
      if (!parentId) {
        const { category } = await ensureCategory(guild, bucket.categoryName, {
          snapshot,
          overwrites: buildOverwrites({
            everyoneId, principals: [], roleAccessEntries, viewChannelBit: PermissionFlagsBits.ViewChannel
          })
        });
        parentId = category.id;
        categoryIds.set(bucket.categoryName, parentId);
        buffer.push({ kind: 'category', bucket: 'oneonone', categoryId: parentId });
      }

      const principals = [
        ...principalsFor('oneonone', pair.a, snapshot, buffer),
        ...principalsFor('oneonone', pair.b, snapshot, buffer)
      ];
      const overwrites = buildOverwrites({
        everyoneId, principals, roleAccessEntries, viewChannelBit: PermissionFlagsBits.ViewChannel
      });

      const name = channelName('oneonone', [
        { displayName: pair.a.displayName, userId: pair.a.userId },
        { displayName: pair.b.displayName, userId: pair.b.userId }
      ]);

      const { channel, action } = await ensureChannel(guild, {
        registryId: registry[pair.pairKey]?.channelId || null,
        name,
        parentId,
        overwrites,
        topic: `1on1 — ${pair.a.displayName} & ${pair.b.displayName}`,
        snapshot
      });

      buffer.push({
        kind: 'oneonone', pairKey: pair.pairKey, channelId: channel.id, name: channel.name,
        a: pair.a.userId, b: pair.b.userId, tribeRoleId: pair.tribeRoleId
      });

      return { ok: true, skipped: action === 'reused' || action === 'adopted', label: channel.name };
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confessional = role XOR user. Subs/1on1 = role AND user (subs deliberately; 1on1 uses
 * role-preferred-else-user per player).
 */
function principalsFor(kind, item, snapshot, buffer) {
  const { entry, delta } = resolvePrincipal({
    userId: item.userId, playerRoleId: item.playerRoleId, snapshot, allow: PLAYER_ACCESS
  });
  if (delta) buffer.push(delta); // the stored role is dead — clear it

  if (kind === 'subs' && entry.id !== item.userId) {
    // Belt-and-braces: the user directly AS WELL AS the role.
    return [entry, { id: item.userId, allow: PLAYER_ACCESS }];
  }
  return [entry];
}

function serializeItem(m) {
  return m ? { userId: m.userId, displayName: m.displayName, playerRoleId: m.playerRoleId || null, appChannelId: m.appChannelId || null, targetName: m.targetName } : null;
}

function registryChannelId(playerData, plan, userId) {
  const node = playerData[plan.guildId]?.channelAdmin?.[plan.configId] || {};
  const bucket = plan.kind === 'subs' ? node.subs : node.confessionals;
  return bucket?.[userId]?.channelId || null;
}

function keyForChannel(plan, channelId) {
  // Reverse-lookup the registry key so a delete removes the right entry.
  return plan.keyByChannel?.[channelId] || null;
}

function planAction(plan) {
  if (plan.type === 'broadcast') return ACTIONS.BROADCAST;
  if (plan.type?.startsWith('alliance_')) return ACTIONS.ALLIANCES;
  // Activate shares the player-roles lock: creating and assigning the same roles must not interleave.
  if (plan.type === 'player_roles' || plan.type === 'activate') return ACTIONS.PLAYER_ROLES;
  if (plan.type === 'oneonone' || plan.kind === 'oneonone') return ACTIONS.ONE_ON_ONES;
  if (plan.kind === 'subs') return ACTIONS.SUBS;
  return ACTIONS.CONFESSIONALS;
}

function planTitle(plan) {
  if (plan.type === 'broadcast') return '📨 Posting message';
  if (plan.type?.startsWith('alliance_')) return '🤝 Alliances';
  if (plan.type === 'delete') return '🗑️ Deleting channels';
  if (plan.type === 'player_roles') return '🎭 Creating player roles';
  if (plan.type === 'activate') return '🟢 Activating player roles';
  if (plan.type === 'convert') return '🗳️ Converting applications to subs';
  if (plan.type === 'oneonone') return '👥 Creating 1on1 channels';
  return plan.kind === 'subs' ? '🗳️ Creating subs channels' : '🎙️ Creating confessionals';
}

function formatEta(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

function budgetRefusal(budget, configId, tribes = null) {
  const lines = budget.violations.map((v) => {
    const label = { channels: 'channels', categories: 'categories', roles: 'roles' }[v.ceiling];
    return `> ❌ **${label}**: would reach **${v.after}**, Discord's limit is **${v.limit}** (currently ${v.current}).`;
  });
  return buildConfirmScreen({
    configId,
    blocked: true,
    title: "That would exceed Discord's limits",
    lines: [
      ...lines,
      '',
      ...(tribes ? ['-# Try selecting fewer tribes, or delete channels you no longer need.'] : ['-# Delete channels you no longer need, then try again.'])
    ],
    confirmLabel: ''
  });
}

function etaRefusal(budget, configId) {
  return buildConfirmScreen({
    configId,
    blocked: true,
    title: 'That job is too large to run in one go',
    lines: [
      `> It would take about **${formatEta(budget.etaSeconds)}**, and Discord only lets CastBot report back for 15 minutes.`,
      '',
      '-# Run it for fewer tribes/players at a time — the job is resumable, so re-running picks up where it left off.'
    ],
    confirmLabel: ''
  });
}

function renderSummary(plan, s) {
  const isBroadcast = plan.type === 'broadcast';
  const isActivate = plan.type === 'activate';
  const verb = isBroadcast ? 'posted' : (s.deleted ? 'deleted' : (isActivate ? 'assigned' : 'created/updated'));
  const lines = [
    `> ✅ **${s.created}** ${verb}`,
    ...(isBroadcast || isActivate ? [] : [`> ⏭️ **${s.skipped}** ${s.deleted ? 'protected (skipped)' : 'already correct'}`]),
    ...(s.failed ? [`> ❌ **${s.failed}** failed`] : []),
    ...(s.aborted ? ['> ⚠️ Aborted early'] : []),
    ...(s.protectedIds?.length ? ['', '-# The channel you ran this from was skipped — delete it manually or re-run from elsewhere.'] : []),
    ...(s.errors?.length ? ['', ...s.errors.slice(0, 5).map((e) => `-# ❌ ${e}`)] : []),
    '',
    // A broadcast is NOT idempotent — unlike every other action here, re-running posts a second
    // copy. Never tell the host it's safe to re-run.
    isBroadcast
      ? '-# ⚠️ Already sent — running this again posts **another** copy to every channel.'
      : (isActivate
        ? '-# Roles are now visible on player profiles. To remove one (the elimination kill switch), edit the role in Discord.'
        : '-# Safe to re-run: existing channels are reused, not duplicated.')
  ];
  return {
    components: [{
      type: 17,
      accent_color: s.failed ? 0xf39c12 : 0x2ecc71,
      components: [
        { type: 10, content: `## ${planTitle(plan)} — done\n${lines.join('\n')}` },
        { type: 14 },
        { type: 1, components: [{ type: 2, custom_id: `season_channels_${plan.configId}`, label: '← Back to Channels', style: 2 }] }
      ]
    }]
  };
}

export { pendingPlans };
