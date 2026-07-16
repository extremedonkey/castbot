/**
 * Channel Administration — handler bodies.
 *
 * app.js only routes; all logic lives here. Every action is a two-phase flow:
 *   modal submit → PLAN (pure preflight, mutates nothing) → confirm screen
 *   confirm      → EXECUTE (paced, streamed, upserting)
 *
 * Nothing here trusts the caller: each entry point re-checks the whitelist, because
 * BUTTON_REGISTRY's `restrictedUser` enforces nothing (RaP 0900).
 */
import { PermissionFlagsBits } from 'discord.js';
import { loadPlayerData } from '../../storage.js';
import { getRoleAccessOverwrites } from '../../utils/roleAccessUtils.js';
import {
  CHANNEL_ADMIN_USER_IDS, PLAYER_ACCESS, SPECTATOR_ACCESS, HOST_ACCESS,
  CATEGORY_NAMES, ACTIONS, PLAN_TTL_MS, MAX_JOB_SECONDS, PACE_DELETE, PACE_SEND
} from './channelAdminConfig.js';
import {
  channelName, assignChannelNames, buildOverwrites, preflightBudget, planCategoryBuckets, pairKey
} from './channelPlan.js';
import {
  snapshotGuild, checkBotPermissions, ensureCategory, ensureChannel,
  deleteChannels, ensurePlayerRole, resolvePrincipal
} from './channelOps.js';
import { runPacedJob, acquireJobLock, releaseJobLock, JobBusyError, renderProgress, patchOriginal } from './channelJob.js';
import { makeDeltaBuffer, flushDeltas } from './channelRegistry.js';
import { getAcceptedCast, expandMentionables, getTribePairs } from './channelRoster.js';
import { buildConfirmScreen } from './channelsView.js';

/** Whitelist check. Mirrors seasonSelector.isChannelAdmin (display) — this one is enforcement. */
export function isChannelAdmin(userId) {
  return !!userId && CHANNEL_ADMIN_USER_IDS.includes(String(userId));
}

/**
 * Pending plans, keyed by a short token. The plan CANNOT live in the custom_id (100-char limit).
 * TTL-swept on every write so a stale plan can't be executed much later against a changed guild.
 */
const pendingPlans = new Map();

function stashPlan(userId, plan) {
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
  const { title, content, color, image } = extractRichCardValues(data);
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
export async function planChannels({ kind, mode, configId, guildId, userId, client, resolved, values }) {
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

    const token = stashPlan(userId, { type: 'convert', kind: 'subs', configId, guildId, items: items.map(serializeItem) });
    return buildConfirmScreen({
      token,
      configId,
      title: `Convert ${items.length} application channel${items.length > 1 ? 's' : ''} to subs?`,
      lines: [
        `> **${items.length}** channel${items.length > 1 ? 's' : ''} will be renamed and re-permissioned in place.`,
        `> Both the player **and** their player role get access (belt-and-braces).`,
        '',
        ...items.slice(0, 10).map((i) => `> • #${i.appChannel.name} → #${i.targetName}`),
        ...(items.length > 10 ? [`> -# …and ${items.length - 10} more`] : []),
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
      ? 'No valid players selected (bots and departed members are skipped).'
      : 'No accepted cast for this season yet. Set players to **Cast** on the Casting tab first.');
  }

  const names = assignChannelNames(members, kind === 'subs' ? 'subs' : 'confessional');
  const toCreate = members.filter((m) => {
    const known = registry[m.userId]?.channelId;
    if (known && snapshot.channels.get(known)) return false;
    return !snapshot.findByName(names.get(m.userId), null) || true; // adopt-by-name is resolved at run time
  });

  const existingCats = (node.categories?.[bucket] || [])
    .map((id) => snapshot.channels.get(id))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name, childCount: snapshot.childCount.get(c.id) || 0 }));

  const buckets = planCategoryBuckets(members, { baseName: CATEGORY_NAMES[bucket], existing: existingCats });
  const newCategories = buckets.filter((b) => !b.categoryId).length;

  const budget = preflightBudget({
    existing: snapshot.counts,
    create: { channels: toCreate.length, categories: newCategories }
  });

  if (!budget.ok) return budgetRefusal(budget, configId);
  if (budget.etaSeconds > MAX_JOB_SECONDS) return etaRefusal(budget, configId);

  const token = stashPlan(userId, {
    type: 'create', kind, configId, guildId,
    items: members.map((m) => ({ ...serializeItem(m), targetName: names.get(m.userId) })),
    buckets: buckets.map((b) => ({ categoryName: b.categoryName, categoryId: b.categoryId, userIds: b.items.map((i) => i.userId) }))
  });

  return buildConfirmScreen({
    token,
    configId,
    title: `Create / update ${members.length} ${kind === 'subs' ? 'subs' : 'confessional'} channel${members.length > 1 ? 's' : ''}?`,
    lines: [
      `> **${toCreate.length}** to create · **${members.length - toCreate.length}** already exist (left alone)`,
      `> **${newCategories}** new categor${newCategories === 1 ? 'y' : 'ies'} · guild after: **${budget.after.channels}/500** channels, **${budget.after.categories}/50** categories`,
      `> Estimated time: **~${formatEta(budget.etaSeconds)}**`,
      '',
      ...(kind === 'confessional'
        ? ['> Player gets access via their **player role** where one exists, else directly.',
           '> Trusted Spectators can **read + react** (not post).']
        : ['> **Both** the player and their player role get access.']),
      ...(dropped.length ? ['', `-# ${dropped.length} target(s) dropped (bots / left the server).`] : []),
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
    return err(mode === 'specific' ? 'No valid players selected.' : 'No accepted cast for this season yet.');
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
      '',
      ...needing.slice(0, 12).map((m) => `> • ${m.displayName}`),
      ...(needing.length > 12 ? [`> -# …and ${needing.length - 12} more`] : []),
      '',
      '-# Roles are created uncoloured and non-mentionable; recolour them in Discord as you like.',
      ...(skipped.length ? [`-# ${skipped.length} skipped (not accepted / withdrawn / bot / left).`] : [])
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
    title: `⚠️ Create ${toCreate.length} 1on1 channel${toCreate.length > 1 ? 's' : ''}?`,
    lines: [
      ...tribes.map((t) => `> **${t.tribeName}** — ${t.members.length} players → ${t.pairs.length} pairs`),
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
    else if (plan.type === 'delete') summary = await execDelete({ plan, guild, buffer, flush, progress, invokedChannelId });
    else if (plan.type === 'player_roles') summary = await execPlayerRoles({ plan, guild, snapshot, buffer, flush, progress });
    else if (plan.type === 'convert') summary = await execConvert({ plan, guild, snapshot, playerData, buffer, flush, progress });
    else if (plan.type === 'oneonone') summary = await execOneOnOnes({ plan, guild, snapshot, playerData, buffer, flush, progress });
    else summary = await execCreate({ plan, guild, snapshot, playerData, buffer, flush, progress });

    await flushDeltas(guildId, [{
      kind: 'lastRun',
      configId: plan.configId,
      action,
      summary: { at: new Date().toISOString(), userId, created: summary.created, skipped: summary.skipped, failed: summary.failed }
    }]);

    return renderSummary(plan, summary);
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
        buffer.push({ kind: 'category', bucket: plan.kind === 'subs' ? 'subs' : 'confessional', configId: plan.configId, categoryId: parentId });
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

      buffer.push({
        kind: plan.kind === 'subs' ? 'subs' : 'confessional',
        configId: plan.configId, userId: item.userId,
        channelId: channel.id, name: channel.name, categoryId: parentId
      });

      return { ok: true, skipped: action === 'reused' || action === 'adopted', label: channel.name };
    }
  });
}

async function execConvert({ plan, guild, snapshot, playerData, buffer, flush, progress }) {
  const { everyoneId, roleAccessEntries } = await accessContext(guild, playerData);

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

      buffer.push({
        kind: 'subs', configId: plan.configId, userId: item.userId,
        channelId: ch.id, name: ch.name, convertedFrom: item.appChannelId
      });

      return {
        ok: true,
        skipped: action === 'reused' && !renamePending,
        label: renamePending ? `${ch.name} (rename deferred — rate limit)` : ch.name
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
  if (plan.type === 'player_roles') return ACTIONS.PLAYER_ROLES;
  if (plan.type === 'oneonone' || plan.kind === 'oneonone') return ACTIONS.ONE_ON_ONES;
  if (plan.kind === 'subs') return ACTIONS.SUBS;
  return ACTIONS.CONFESSIONALS;
}

function planTitle(plan) {
  if (plan.type === 'broadcast') return '📨 Posting message';
  if (plan.type === 'delete') return '🗑️ Deleting channels';
  if (plan.type === 'player_roles') return '🎭 Creating player roles';
  if (plan.type === 'convert') return '🗳️ Converting applications to subs';
  if (plan.type === 'oneonone') return '🤝 Creating 1on1 channels';
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
  const verb = isBroadcast ? 'posted' : (s.deleted ? 'deleted' : 'created/updated');
  const lines = [
    `> ✅ **${s.created}** ${verb}`,
    ...(isBroadcast ? [] : [`> ⏭️ **${s.skipped}** ${s.deleted ? 'protected (skipped)' : 'already correct'}`]),
    ...(s.failed ? [`> ❌ **${s.failed}** failed`] : []),
    ...(s.aborted ? ['> ⚠️ Aborted early'] : []),
    ...(s.protectedIds?.length ? ['', '-# The channel you ran this from was skipped — delete it manually or re-run from elsewhere.'] : []),
    ...(s.errors?.length ? ['', ...s.errors.slice(0, 5).map((e) => `-# ❌ ${e}`)] : []),
    '',
    // A broadcast is NOT idempotent — unlike every other action here, re-running posts a second
    // copy. Never tell the host it's safe to re-run.
    isBroadcast
      ? '-# ⚠️ Already sent — running this again posts **another** copy to every channel.'
      : '-# Safe to re-run: existing channels are reused, not duplicated.'
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
