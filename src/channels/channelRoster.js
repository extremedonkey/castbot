/**
 * Channel Administration — who are the players?
 *
 * The roster routes through playerStatus.js's status engine rather than hand-rolling a filter.
 * That matters for two reasons:
 *   1. `offerStatus`/`placementResponse` have ZERO production data (verified: 0 of 63
 *      application records), so an "accepted offer" filter would match nobody. `castingStatus`
 *      is the only populated signal — and deriveStatus already encodes its precedence.
 *   2. Withdrawal has NO data field: it lives only in the ✖️ prefix on the LIVE channel name
 *      (buildStatusSignals, playerStatus.js:74). deriveStatus's stage-0 withdrawn row outranks
 *      everything, so routing through it excludes withdrawn players for free.
 */
import { loadPlayerData, getAllApplicationsFromData } from '../../storage.js';
import { buildStatusSignals, deriveStatus } from '../../playerStatus.js';
import { getTribesForCastlist } from '../../castlistDataAccess.js';
import { enumeratePairs } from './channelPlan.js';

/** Status IDs that count as "accepted cast". Withdrawn/declined lose by precedence, not by listing. */
export const ACCEPTED_STATUS_IDS = new Set(['cast', 'accepted', 'accepted_alt']);

/**
 * Rank each season by recency (0 = newest). Legacy apps carry no configId at all and sort LAST,
 * so a real season's record always outranks a legacy one for the same player.
 * @returns {Map<string, number>} configId → rank
 */
function seasonRanks(playerData, guildId) {
  const configs = Object.entries(playerData?.[guildId]?.applicationConfigs || {})
    .sort(([, a], [, b]) => (b?.lastUpdated || b?.createdAt || 0) - (a?.lastUpdated || a?.createdAt || 0));
  return new Map(configs.map(([id], i) => [id, i]));
}

/**
 * The accepted cast — unioned across EVERY season in the guild, one entry per player.
 *
 * Why not one season (changed 2026-08-08, Reece's call): the row that calls this now renders on
 * the season-less ⭐ Premium menu too, and single-season sourcing silently dropped anyone whose
 * accepted record lived under a different config — including the legacy apps that
 * `getApplicationsForSeason` excludes outright (no `configId` → filtered out). Union means nobody
 * gets "stuck" in a season the host isn't looking at.
 *
 * The cost is that a server reused across seasons can surface LAST season's cast. That is
 * mitigated by visibility, not by filtering: every confirm screen lists each player by name with
 * the season their record came from, so the host sees exactly who they're about to create for.
 *
 * Dedupe precedence (most→least important):
 *   1. Newest SEASON wins — this season's "Not Cast" must beat last season's "Cast".
 *   2. Within one season, `outranks` (withdrawn short-circuit ▸ higher stage ▸ newer record).
 *
 * @param {string} guildId
 * @param {string} configId - the calling surface's season; used only to LABEL entries
 *   (`fromCurrentSeason`), never to filter. Kept in the signature because every caller has one.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{roster: Array, skipped: Array}>}
 */
export async function getAcceptedCast(guildId, configId, guild) {
  const playerData = await loadPlayerData();
  const apps = await getAllApplicationsFromData(guildId);
  const players = playerData[guildId]?.players || {};
  const ranks = seasonRanks(playerData, guildId);
  const configs = playerData[guildId]?.applicationConfigs || {};
  const LAST = Number.MAX_SAFE_INTEGER;
  const rankOf = (app) => (app?.configId && ranks.has(app.configId)) ? ranks.get(app.configId) : LAST;
  const channelAdmin = playerData[guildId]?.channelAdmin || {};

  // ── Collapse APPLICATIONS to PLAYERS first ──
  // One user can hold SEVERAL application records in a single season (verified on the test box:
  // 3 records, all the same userId). Channels are per-PLAYER, so counting per application would
  // report one person as several — "Create 2 confessionals" that yields 1 channel. The most
  // committed record wins (highest status stage; newest breaks a tie).
  const byUser = new Map();
  for (const app of apps || []) {
    // ALWAYS read app.channelId — some map keys are legacy composite forms.
    const channelId = app?.channelId;
    if (!channelId || !app?.userId) continue;

    // The LIVE name carries the ✖️/☑️ markers; app.channelName is stale (never updated on rename).
    const liveChannelName = guild.channels.cache.get(channelId)?.name
      || (await guild.channels.fetch(channelId).catch(() => null))?.name
      || '';

    const status = deriveStatus(buildStatusSignals({ app, liveChannelName }));
    const prev = byUser.get(app.userId);
    // Newest season first; only inside ONE season does the stage/recency precedence apply.
    const beats = !prev
      || rankOf(app) < rankOf(prev.app)
      || (rankOf(app) === rankOf(prev.app) && outranks(status, app, prev.status, prev.app));
    if (beats) byUser.set(app.userId, { app, status, channelId, liveChannelName });
  }

  const roster = [];
  const skipped = [];

  for (const [userId, { app, status, channelId, liveChannelName }] of byUser) {
    if (!ACCEPTED_STATUS_IDS.has(status.statusId)) {
      // `offered` carries no STATUS_REGISTRY row (nothing tests offerStatus), so an applicant the
      // host has already INVITED reads as plain "Application Complete" and lands here. Per Reece
      // 2026-08-08 that stays excluded — offers are expected to follow a Cast decision — but the
      // flag rides along so the empty-roster error can name them instead of just saying "none".
      // Name comes off the app record: fetching members for skipped applicants is wasted API.
      skipped.push({
        userId,
        reason: status.label,
        displayName: app.displayName || app.username || userId,
        offered: app.offerStatus === 'offer' || app.offerStatus === 'offer_alternative'
      });
      continue;
    }

    const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
    if (!member) {
      skipped.push({ userId, reason: 'Left the server' });
      continue;
    }

    roster.push({
      userId,
      displayName: member.displayName || app.displayName || app.username || userId,
      member,
      app,
      appChannelId: channelId,
      liveChannelName,
      playerRoleId: players[userId]?.playerRoleId || null,
      status,
      // Provenance — surfaced on every confirm screen so a cross-season roster is auditable.
      configId: app.configId || null,
      seasonName: configs[app.configId]?.seasonName || (app.configId ? 'Unknown season' : 'Legacy application'),
      fromCurrentSeason: !!app.configId && app.configId === configId,
      // "Already made" markers. Subs are normally created BEFORE confessionals, so the host needs
      // to see both when planning either one.
      hasConfessional: hasChannelOfKind(channelAdmin, 'confessionals', userId),
      hasSubs: hasChannelOfKind(channelAdmin, 'subs', userId)
    });
  }

  return { roster, skipped };
}

/**
 * Has this player a channel of this kind recorded under ANY season?
 *
 * The registry is season-keyed (`channelAdmin[configId].confessionals[userId]`) while the roster
 * is now cross-season, so a season-scoped lookup would report "not created" for a channel that
 * demonstrably exists. Presence of the registry record is the signal — liveness is re-checked by
 * the planner against the guild snapshot, which is the thing that decides create-vs-skip.
 *
 * @param {Object} channelAdmin - playerData[guildId].channelAdmin
 * @param {'confessionals'|'subs'} bucket
 * @returns {boolean}
 */
function hasChannelOfKind(channelAdmin, bucket, userId) {
  for (const [key, season] of Object.entries(channelAdmin || {})) {
    // Guild-scoped siblings (oneOnOnes, alliances, allianceCategories…) are not season nodes.
    if (!season || typeof season !== 'object' || Array.isArray(season)) continue;
    if (key === 'oneOnOnes' || key === 'alliances' || key === 'allianceRequests') continue;
    if (season[bucket]?.[userId]?.channelId) return true;
  }
  return false;
}

/**
 * Which of a player's application records represents them? The most committed one.
 *
 * STATUS_REGISTRY `stage` is the commitment gradient (0 lifecycle ▸ 1 admin decision ▸ 2 player
 * response), so a higher stage wins. Withdrawn is stage 0 but must NOT lose to a stale stage-1
 * record — it's the latest lifecycle action — so it short-circuits. Ties go to the newest record.
 *
 * @returns {boolean} true when (status, app) should replace (prevStatus, prevApp)
 */
function outranks(status, app, prevStatus, prevApp) {
  if (status.statusId === 'withdrawn') return true;
  if (prevStatus.statusId === 'withdrawn') return false;
  const stage = status.stage ?? -1;
  const prevStage = prevStatus.stage ?? -1;
  if (stage !== prevStage) return stage > prevStage;
  return String(app.createdAt || '') > String(prevApp.createdAt || '');
}

/**
 * Expand a Mentionable Select's resolved payload (users and/or roles) into members.
 * Drops departed members only. Bots are valid targets — the host picked them explicitly,
 * and test servers use bot accounts as stand-in players (decision 2026-08-08; bots were
 * dropped before that and it read as channels silently not being created).
 *
 * @param {import('discord.js').Guild} guild
 * @param {{users?: Object, roles?: Object}} resolved - interaction data.resolved
 * @param {string[]} values - the selected ids
 * @returns {Promise<{members: Array, dropped: Array}>}
 */
export async function expandMentionables(guild, resolved, values) {
  const ids = new Set();
  const dropped = [];

  for (const id of values || []) {
    if (resolved?.roles?.[id]) {
      const role = guild.roles.cache.get(id) || (await guild.roles.fetch(id).catch(() => null));
      if (!role) continue;
      await ensureMembersFetched(guild);
      for (const m of role.members.values()) ids.add(m.id);
    } else {
      ids.add(id);
    }
  }

  const playerData = await loadPlayerData();
  const players = playerData[guild.id]?.players || {};
  const members = [];

  for (const id of ids) {
    const member = guild.members.cache.get(id) || (await guild.members.fetch(id).catch(() => null));
    if (!member) {
      dropped.push({ userId: id, reason: 'Left the server' });
      continue;
    }
    members.push({
      userId: id,
      displayName: member.displayName,
      member,
      playerRoleId: players[id]?.playerRoleId || null
    });
  }

  return { members, dropped };
}

/**
 * role.members is a filtered view of the MEMBER CACHE, not a complete list — without a bulk
 * fetch you silently get partial tribes (castlistDataAccess.js:80, CastlistArchitecture.md:395).
 */
async function ensureMembersFetched(guild) {
  if (guild.members.cache.size < (guild.memberCount || 0) * 0.8) {
    await guild.members.fetch({ timeout: 10000 }).catch(() => null);
  }
}

/**
 * Tribes of the default castlist, with their 1on1 pairs.
 *
 * Always goes through getTribesForCastlist — it owns the 80%-threshold bulk member fetch.
 *
 * @param {string} guildId
 * @param {string[]|null} tribeRoleIds - null/empty → all tribes in the default castlist
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<Array<{tribeRoleId, tribeName, members, pairs}>>}
 */
export async function getTribePairs(guildId, tribeRoleIds, client, guild) {
  const tribes = await getTribesForCastlist(guildId, 'default', client);
  const wanted = tribeRoleIds?.length ? new Set(tribeRoleIds) : null;
  const playerData = await loadPlayerData();
  const players = playerData[guildId]?.players || {};
  const out = [];

  for (const tribe of tribes || []) {
    if (wanted && !wanted.has(tribe.roleId)) continue;

    const members = [];
    for (const m of tribe.members || []) {
      members.push({
        userId: m.id,
        displayName: m.displayName,
        member: m,
        playerRoleId: players[m.id]?.playerRoleId || null
      });
    }

    const byId = new Map(members.map((m) => [m.userId, m]));
    const pairs = enumeratePairs(members.map((m) => m.userId)).map((p) => ({
      ...p,
      memberA: byId.get(p.a),
      memberB: byId.get(p.b)
    }));

    out.push({
      tribeRoleId: tribe.roleId,
      tribeName: tribe.name || guild?.roles.cache.get(tribe.roleId)?.name || 'Tribe',
      members,
      pairs // n<2 → [] (enumeratePairs guards this)
    });
  }

  return out;
}

/** Role IDs of the default castlist's tribes — used to pre-fill the 1on1 modal's Role Select. */
export async function getDefaultCastlistTribeRoleIds(guildId, client) {
  const tribes = await getTribesForCastlist(guildId, 'default', client).catch(() => []);
  return (tribes || []).map((t) => t.roleId).filter(Boolean);
}
