/**
 * Season & Tribe Planner (Mockup) — UI prototype
 *
 * THIS IS A UI MOCKUP ONLY. Not a real feature.
 *
 * Demonstrates a player-admin-style screen with an embedded String Select +
 * progressively-enabled action buttons, walking the hierarchy:
 *
 *     📅 Season
 *       └ 📋 Castlist (e.g. "Default")
 *           └ 🔀 Game Phase by Round (Marooning / Swap N / Merge / FTC / Reunion)
 *               └ 🏕️ Tribe (resolved from castlist tribes)
 *                   └ 👤 Cast-Ranked Applicant (from applications + rankings)
 *
 * Architecture:
 *  - Reads real data from playerData (loadPlayerData) — never writes.
 *  - Per-user navigation state held in an in-memory Map (cleared on restart).
 *  - All write actions (Create Tribe / Assign Players / Clone / Remove) are
 *    NO-OPS that surface an ephemeral "would do…" preview. Productionising
 *    means swapping those handlers for real logic.
 *  - Single dispatch entry: `handleTribePlannerInteraction(req, res, client)`.
 *
 * To remove the prototype:
 *   1. Delete this file
 *   2. Drop the `tribeplan_*` entries from buttonHandlerFactory.js BUTTON_REGISTRY
 *   3. Drop the `startsWith('tribeplan_')` dispatch block in app.js
 *   4. Drop the entry button from menuBuilder.js buildReecesStuffMenu
 *
 * See docs/ui/UIPrototyping.md for the prototyping approach.
 */

import { countComponents, validateComponentLimit } from './utils.js';
import { loadPlayerData } from './storage.js';

const ACCENT = 0x9b59b6;          // Purple — castlist/season family
const DOT = '\u2981';              // ⦁
const IND = '\u00a0\u00a0\u00a0';  // 3 nbsp — visual indent inside select labels

// ─────────────────────────────────────────────
// In-memory per-user state (ephemeral)
// ─────────────────────────────────────────────

/** @typedef {{configId:string|null, castlistId:string|null, phaseId:string|null, tribeId:string|null}} TribePlannerState */
/** @type {Map<string, TribePlannerState>} */
const userState = new Map();

const emptyState = () => ({ configId: null, castlistId: null, phaseId: null, tribeId: null, castRankingView: false });

function getState(userId) {
  if (!userState.has(userId)) userState.set(userId, emptyState());
  return userState.get(userId);
}

function patchState(userId, patch) {
  Object.assign(getState(userId), patch);
}

/**
 * Returns the deepest selected level: 0=none, 1=season, 2=castlist, 3=phase, 4=tribe-or-cast-ranking.
 * Cast Ranking sits at the SAME depth as Tribe (both are siblings of the Phase node).
 * Conceptual flow: applicants → cast-ranked → cast → assigned to tribes.
 */
function depth(state) {
  if (state.tribeId || state.castRankingView) return 4;
  if (state.phaseId) return 3;
  if (state.castlistId) return 2;
  if (state.configId) return 1;
  return 0;
}

// ─────────────────────────────────────────────
// Data extraction (read-only)
// ─────────────────────────────────────────────

const STAGE_EMOJI = {
  planning: '🗓️', applications: '📝', voting: '🗳️',
  active: '▶️', complete: '✅', archived: '📦',
};

const PHASE_META = {
  marooning: { emoji: '🏝️', label: 'Marooning' },
  swap:      { emoji: '🔀', label: 'Swap' },
  merge:     { emoji: '🤝', label: 'Merge' },
  ftc:       { emoji: '🏆', label: 'FTC' },
  reunion:   { emoji: '🎉', label: 'Reunion' },
};

function getSeasons(guildData) {
  const configs = guildData?.applicationConfigs || {};
  return Object.entries(configs)
    .filter(([_, c]) => c?.seasonName)
    .map(([id, c]) => ({
      id, name: c.seasonName,
      seasonId: c.seasonId,
      stage: c.stage || c.currentStage || 'planning',
      players: c.estimatedTotalPlayers,
      ftc: c.estimatedFTCPlayers,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Castlists for a season. Tiering:
 *   - `default` is always shown first (system castlist for the guild).
 *   - Castlists explicitly tied to this season (`seasonId === seasonId`) are next.
 *   - Orphaned castlists (no `seasonId` set on the entity) are shown LAST and
 *     visually marked — most legacy castlists fall here, and excluding them
 *     leaves users with only "default" to pick.
 */
function getCastlists(guildData, seasonId) {
  const cls = guildData?.castlistConfigs || {};
  const out = [];
  for (const [id, cl] of Object.entries(cls)) {
    if (!cl) continue;
    let tier;
    if (id === 'default') tier = 0;
    else if (cl.seasonId === seasonId) tier = 1;
    else if (!cl.seasonId) tier = 2;        // orphan — show but mark
    else continue;                            // belongs to a DIFFERENT season → skip
    out.push({
      id, tier,
      name: cl.name || id,
      type: cl.type || 'custom',
      emoji: cl.metadata?.emoji || '📋',
      description: cl.metadata?.description || '',
    });
  }
  out.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  return out;
}

/**
 * Resolve a friendly tribe name. CastBot's stored `tribe.name` is sometimes the literal
 * placeholder "Tribe <roleId>" — fall back to the live Discord role name in that case.
 */
function resolveTribeName(client, guildId, roleId, t) {
  // Live role name beats anything stored
  const role = client?.guilds?.cache?.get(guildId)?.roles?.cache?.get(roleId);
  if (role?.name) return role.name;
  // Then friendly stored fields
  if (t.displayName) return t.displayName;
  if (t.name && !/^Tribe \d{15,}$/.test(t.name)) return t.name;  // reject placeholder
  return `Tribe ${roleId.slice(-4)}`;
}

function getTribes(guildData, castlist, { client, guildId } = {}) {
  const tribes = guildData?.tribes || {};
  const out = [];
  for (const [roleId, t] of Object.entries(tribes)) {
    if (!t) continue;
    const inIds   = Array.isArray(t.castlistIds) && t.castlistIds.includes(castlist.id);
    const inLegacy = t.castlist === castlist.name || t.castlist === castlist.id;
    if (inIds || inLegacy) {
      out.push({
        id: roleId,
        name: resolveTribeName(client, guildId, roleId, t),
        emoji: t.emoji || '🏕️',
        color: t.color,
        memberCount: t.memberCount || 0,
      });
    }
  }
  return out;
}

function classifyRound(r) {
  if (!r) return null;
  if (r.fNumber === 1) return 'reunion';
  if (r.ftcRound)      return 'ftc';
  if (r.mergeRound)    return 'merge';
  if (r.swapRound)     return 'swap';
  if (r.hasMarooning ?? (r.marooningDays > 0)) return 'marooning';
  return null;
}

function getGamePhases(guildData, seasonId) {
  const rounds = guildData?.seasonRounds?.[seasonId];
  if (!rounds) return [];
  const sorted = Object.entries(rounds).sort((a, b) => (a[1].seasonRoundNo || 0) - (b[1].seasonRoundNo || 0));
  let swapN = 0;
  const out = [];
  for (const [rId, r] of sorted) {
    const type = classifyRound(r);
    if (!type) continue;
    let label = PHASE_META[type].label;
    if (type === 'swap') { swapN++; label = r.eventLabel || `Swap ${swapN}`; }
    else if (r.eventLabel) label = r.eventLabel;
    out.push({
      id: rId, type, label,
      emoji: PHASE_META[type].emoji,
      roundNo: r.seasonRoundNo,
      fNumber: r.fNumber,
    });
  }
  return out;
}

/**
 * Resolve actual Discord role members for a tribe (since a tribe IS a Discord role).
 * Pulls from the Discord.js cache — no network fetch (mockup keeps it fast).
 *
 * Returns null if the client isn't passed in (degraded mode), [] if the role
 * exists but has no cached members, or a non-empty array of member descriptors.
 */
function getTribeRoleMembers(client, guildId, roleId) {
  if (!client?.guilds?.cache) return null;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const role = guild.roles.cache.get(roleId);
  if (!role) return [];
  const out = [];
  for (const m of role.members.values()) {
    out.push({
      userId: m.id,
      displayName: m.displayName || m.user?.globalName || m.user?.username || m.id,
      isBot: !!m.user?.bot,
    });
  }
  // Sort: humans before bots, then alphabetical
  out.sort((a, b) => (Number(a.isBot) - Number(b.isBot)) || a.displayName.localeCompare(b.displayName));
  return out;
}

function getCastRankedApplicants(guildData, configId) {
  const apps = guildData?.applications || {};
  const rankings = guildData?.rankings || {};
  const out = [];
  for (const [chId, a] of Object.entries(apps)) {
    if (!a || a.configId !== configId) continue;
    const scores = rankings[chId] ? Object.values(rankings[chId]).filter(v => typeof v === 'number') : [];
    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    out.push({
      userId: a.userId,
      channelId: chId,
      displayName: a.displayName || a.username || 'Unknown',
      castingStatus: a.castingStatus || null,
      avgScore: avg,
      voteCount: scores.length,
    });
  }
  out.sort((a, b) => {
    const rank = s => (s === 'cast' ? 0 : s === 'tentative' ? 1 : s === 'reject' ? 3 : 2);
    if (rank(a.castingStatus) !== rank(b.castingStatus)) return rank(a.castingStatus) - rank(b.castingStatus);
    return (b.avgScore || 0) - (a.avgScore || 0);
  });
  return out;
}

// ─────────────────────────────────────────────
// View construction
// ─────────────────────────────────────────────

const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : (s || ''));

/**
 * Defensive emoji picker for `emoji.name` slots.
 * Discord rejects:
 *  - custom emoji strings ("<:foo:123>") — need {id, name} shape we don't build here
 *  - Unicode symbols that aren't true emoji (↻ U+21BB, · U+00B7, ↑ U+2191, etc.) —
 *    error: COMPONENT_INVALID_EMOJI
 * Only allows codepoints inside the Unicode Emoji property (\p{Emoji}).
 */
function safeEmoji(raw, fallback) {
  if (typeof raw !== 'string' || !raw) return fallback;
  if (raw.startsWith('<') || raw.includes(':')) return fallback;
  if (raw.length > 4) return fallback;
  // Require at least one true Emoji codepoint (U+21BB ↻, U+2191 ↑, U+00B7 · would fail)
  if (!/\p{Extended_Pictographic}/u.test(raw)) return fallback;
  return raw;
}

/**
 * Build the prototype view from the user's current navigation state.
 * @param {string} guildId
 * @param {string} userId
 * @param {import('discord.js').Client} [client] - optional; required for live tribe-member resolution
 */
export async function buildTribePlannerView(guildId, userId, client = null) {
  const playerData = await loadPlayerData();
  const guildData = playerData?.[guildId] || {};
  const state = getState(userId);

  const seasons = getSeasons(guildData);
  const season = state.configId ? seasons.find(s => s.id === state.configId) || null : null;
  if (state.configId && !season) { state.configId = state.castlistId = state.phaseId = state.tribeId = null; }

  const castlists = season ? getCastlists(guildData, season.seasonId) : [];
  const castlist = state.castlistId ? castlists.find(c => c.id === state.castlistId) || null : null;
  if (state.castlistId && !castlist) { state.castlistId = state.phaseId = state.tribeId = null; }

  const phases = season ? getGamePhases(guildData, season.seasonId) : [];
  const phase = state.phaseId ? phases.find(p => p.id === state.phaseId) || null : null;
  if (state.phaseId && !phase) { state.phaseId = state.tribeId = null; }

  const tribes = castlist ? getTribes(guildData, castlist, { client, guildId }) : [];
  const tribe = state.tribeId ? tribes.find(t => t.id === state.tribeId) || null : null;
  if (state.tribeId && !tribe) { state.tribeId = null; }

  const lvl = depth(state);

  // ── Header & breadcrumb ──
  const breadcrumbParts = ['📅 Season Planner'];
  if (season) breadcrumbParts.push(`${STAGE_EMOJI[season.stage] || '📌'} ${season.name}`);
  if (castlist) breadcrumbParts.push(`${castlist.emoji} ${castlist.name}`);
  if (phase) breadcrumbParts.push(`${phase.emoji} ${phase.label}`);
  if (tribe) breadcrumbParts.push(`${tribe.emoji} ${tribe.name}`);
  if (state.castRankingView) breadcrumbParts.push(`🏆 Cast Ranking`);
  const breadcrumb = breadcrumbParts.join(`  ${DOT}  `);

  // ── Season select (always visible, search via Discord typeahead) ──
  const seasonOptions = seasons.length === 0
    ? [{ label: '(No seasons yet — create one in Season Planner)', value: 'none', emoji: { name: '⚠️' } }]
    : seasons.slice(0, 25).map(s => ({
        label: trunc(s.name, 95),
        value: s.id,
        description: trunc(`${s.players ? `F${s.players}→F${s.ftc || '?'}` : 'No planner data'}  ${DOT}  ${s.stage}`, 95),
        emoji: { name: STAGE_EMOJI[s.stage] || '📌' },
        default: s.id === state.configId,
      }));

  const seasonSelectRow = {
    type: 1,
    components: [{
      type: 3,
      custom_id: 'tribeplan_pick_season',
      placeholder: season
        ? `📅 ${trunc(season.name, 80)}`
        : 'Select a season… (type to search)',
      options: seasonOptions,
      min_values: 0, max_values: 1,
    }],
  };

  // ── Hierarchy select (only when a season is picked) ──
  let hierarchyBlock = null;
  if (season) {
    const opts = buildHierarchyOptions({ season, castlists, castlist, phases, phase, tribes, tribe, guildData, state, client, guildId });
    hierarchyBlock = {
      type: 1,
      components: [{
        type: 3,
        custom_id: 'tribeplan_navigate',
        placeholder: hierarchyPlaceholder({ castlist, phase, tribe, state }),
        options: opts.length ? opts : [{ label: '(empty)', value: 'noop', emoji: { name: '⚠️' } }],
        min_values: 0, max_values: 1,
      }],
    };
  }

  // ── Action buttons (greyed by level) ──
  // canCreateTribe needs a phase. Edit/Assign/Remove need a tribe selected (NOT castRankingView).
  // Open Cast Ranking launches the REAL season_app_ranking_<configId> handler when a season is picked.
  const inTribe = !!state.tribeId;
  const canCreateTribe   = lvl >= 3 && !state.castRankingView;
  const canEditTribe     = inTribe;
  const canAssignPlayers = inTribe;
  const canRemoveTribe   = inTribe;
  const canOpenCastRank  = !!state.configId;

  // The Cast Ranking button is the ONLY non-mockup action — it hands off to the real
  // ranking UI by using its registered custom_id. Falls back to a no-op if no season.
  const castRankCustomId = canOpenCastRank
    ? `season_app_ranking_${state.configId}`
    : 'tribeplan_act_open_cast_ranking_disabled';

  const actionsRow = {
    type: 1,
    components: [
      { type: 2, custom_id: 'tribeplan_act_create_tribe', label: 'Create Tribe',     style: 1, emoji: { name: '➕' }, disabled: !canCreateTribe },
      { type: 2, custom_id: 'tribeplan_act_edit_tribe',   label: 'Edit Tribe',       style: 2, emoji: { name: '✏️' }, disabled: !canEditTribe },
      { type: 2, custom_id: 'tribeplan_act_assign',       label: 'Assign Players',   style: 1, emoji: { name: '👥' }, disabled: !canAssignPlayers },
      { type: 2, custom_id: castRankCustomId,             label: 'Open Cast Ranking',style: 2, emoji: { name: '🏆' }, disabled: !canOpenCastRank },
      { type: 2, custom_id: 'tribeplan_act_remove',       label: 'Remove Tribe',     style: 4, emoji: { name: '🗑️' }, disabled: !canRemoveTribe },
    ],
  };

  // ── Compose container ──
  const components = [
    { type: 10, content: `## 🎯 Season & Tribe Planner ${DOT} Mockup` },
    { type: 10, content: `-# Plan tribe composition per game phase. The select supports type-to-search. Buttons unlock as you drill in.` },
    { type: 14 },
    { type: 10, content: `### \`\`\`📍 Current Path\`\`\`` },
    { type: 10, content: breadcrumb },
    { type: 14 },
    { type: 10, content: `### \`\`\`📅 Season\`\`\`` },
    seasonSelectRow,
  ];

  if (hierarchyBlock) {
    components.push(
      { type: 14 },
      { type: 10, content: `### \`\`\`🌲 Hierarchy\`\`\`` },
      { type: 10, content: hierarchyHelp({ castlist, phase, tribe, state }) },
      hierarchyBlock,
    );
  }

  components.push(
    { type: 14 },
    { type: 10, content: `### \`\`\`🎬 Actions\`\`\`` },
    actionsRow,
    { type: 14 },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'reeces_stuff', label: '← Reece\'s Stuff', style: 2 },
        { type: 2, custom_id: 'tribeplan_reset', label: 'Reset Selection', style: 2, emoji: { name: '🔄' }, disabled: lvl === 0 },
      ],
    },
  );

  const container = { type: 17, accent_color: ACCENT, components };
  countComponents([container], { verbosity: 'summary', label: 'Tribe Planner (Mockup)' });
  validateComponentLimit([container], 'Tribe Planner (Mockup)');

  return { components: [container] };
}

function hierarchyPlaceholder({ castlist, phase, tribe, state }) {
  if (state?.castRankingView) return `🏆 Pick an applicant to focus… (or ↑ Up)`;
  if (tribe) return `👤 Cast players for this tribe… (or ↑ Up)`;
  if (phase) return `🏆 Cast Ranking — or pick a tribe… (or ↑ Up)`;
  if (castlist) return `🔀 Pick a game phase… (or ↑ Up)`;
  return `📋 Pick a castlist…`;
}

function hierarchyHelp({ castlist, phase, tribe, state }) {
  if (state?.castRankingView) return `-# Full **Cast Ranking** pool for the season. Sorted: cast → tentative → pending → reject, then by avg score.`;
  if (tribe) return `-# Live members of the **${tribe.name}** Discord role. Glue logic to cross-reference with Cast Ranking is TBD.`;
  if (phase) return `-# At Phase level you have two sibling drilldowns: 🏆 **Cast Ranking** (the full applicant pool) and 🏕️ **Tribes** (containers). Both lead to depth 4.`;
  if (castlist) return `-# Showing **game phase** rounds only (marooning, swap, merge, FTC, reunion). Standard challenge rounds are hidden.`;
  return `-# Pick a castlist to start. Default is always available.`;
}

/**
 * Build options for the cascading hierarchy select.
 *
 * Hierarchy depth map:
 *   depth 0  → none
 *   depth 1  → season picked, no castlist          → shows castlists
 *   depth 2  → castlist picked, no phase           → shows phases
 *   depth 3  → phase picked, no tribe/castRanking  → shows [🏆 Cast Ranking, 🏕️ Tribes]  ← SIBLINGS
 *   depth 4  → tribe selected                      → shows cast players (placeholder for assignment-TBD)
 *   depth 4  → castRankingView                     → shows full ranked applicant pool
 *
 * Cast Ranking and Tribe drilldowns are at the SAME depth (4) — both children of Phase.
 *
 * Option value namespace: `up` | `cl:<id>` | `ph:<id>` | `tr:<id>` | `cr:open` | `noop`
 */
function buildHierarchyOptions({ season, castlists, castlist, phases, phase, tribes, tribe, guildData, state, client, guildId }) {
  const opts = [];

  // Depth 1 → showing castlists (no castlist picked yet)
  if (!castlist) {
    if (castlists.length === 0) {
      opts.push({ label: '(No castlists in this guild — create one via Castlist Hub)', value: 'noop', emoji: { name: '⚠️' } });
      return opts;
    }
    for (const cl of castlists.slice(0, 25)) {
      const tierLabel = cl.id === 'default' ? '  (Default)' : cl.tier === 2 ? '  (no season link)' : '';
      const desc = cl.description || (cl.tier === 1 ? `Linked to this season` : cl.tier === 2 ? `Orphaned — not tied to any season` : `${cl.type} castlist`);
      opts.push({
        label: trunc(`${cl.name}${tierLabel}`, 95),
        value: `cl:${cl.id}`,
        description: trunc(desc, 95),
        emoji: { name: safeEmoji(cl.emoji, '📋') },
      });
    }
    return opts;
  }

  // Depth 2 → showing phases (castlist picked, no phase yet)
  if (!phase) {
    opts.push({ label: '↑ Back to Castlists', value: 'up', emoji: { name: '⬆️' }, description: `Currently in ${castlist.name}` });
    if (phases.length === 0) {
      opts.push({ label: '(No game phases — set up Season Planner rounds first)', value: 'noop', emoji: { name: '⚠️' } });
      return opts;
    }
    for (const p of phases.slice(0, 24)) {
      opts.push({
        label: trunc(`${IND}R${p.roundNo} ${DOT} F${p.fNumber} ${DOT} ${p.label}`, 95),
        value: `ph:${p.id}`,
        description: trunc(`${PHASE_META[p.type].label} phase ${DOT} click to view phase contents`, 95),
        emoji: { name: p.emoji },
      });
    }
    return opts;
  }

  // Depth 4 (castRankingView) → full applicant pool, sorted
  if (state?.castRankingView) {
    opts.push({
      label: '↑ Back to Phase Contents', value: 'up', emoji: { name: '⬆️' },
      description: `Currently in 🏆 Cast Ranking for ${phase.label}`,
    });
    const applicants = getCastRankedApplicants(guildData, state.configId).slice(0, 24);
    if (applicants.length === 0) {
      opts.push({ label: '(No applicants for this season — start Season Apps)', value: 'noop', emoji: { name: '⚠️' } });
      return opts;
    }
    const statusEmoji = { cast: '✅', tentative: '🟦', reject: '⛔' };
    for (const a of applicants) {
      const score = a.avgScore != null ? `★ ${a.avgScore.toFixed(1)} (${a.voteCount})` : 'unranked';
      const status = a.castingStatus ? a.castingStatus.toUpperCase() : 'PENDING';
      opts.push({
        label: trunc(`${IND}${a.displayName}`, 95),
        value: `pl:${a.userId}`,
        description: trunc(`${status} ${DOT} ${score}`, 95),
        emoji: { name: safeEmoji(statusEmoji[a.castingStatus], '👤') },
      });
    }
    return opts;
  }

  // Depth 3 → phase picked, no tribe and no castRankingView. Show [Cast Ranking, Tribes]
  if (!tribe) {
    opts.push({
      label: '↑ Back to Game Phases', value: 'up', emoji: { name: '⬆️' },
      description: `Currently in ${castlist.name} ${DOT} ${phase.label}`,
    });

    // Cast Ranking sentinel — sibling of Tribes, leads to depth 4 alt path
    const allApplicants = getCastRankedApplicants(guildData, state.configId);
    const castCount = allApplicants.filter(a => a.castingStatus === 'cast').length;
    opts.push({
      label: trunc(`🏆 Cast Ranking  (${allApplicants.length} applicant${allApplicants.length === 1 ? '' : 's'}, ${castCount} cast)`, 95),
      value: 'cr:open',
      description: trunc(`Source-of-truth ranking pool for the season ${DOT} sibling of Tribes below`, 95),
      emoji: { name: '🏆' },
    });

    if (tribes.length === 0) {
      opts.push({ label: '(No tribes on this castlist — use Create Tribe)', value: 'noop', emoji: { name: '⚠️' } });
      return opts;
    }
    for (const t of tribes.slice(0, 23)) {  // 25 - 1 (up) - 1 (cast ranking) = 23 tribe slots
      // Prefer LIVE Discord role member count over the cached field — that's the truth
      const liveMembers = getTribeRoleMembers(client, guildId, t.id);
      const count = Array.isArray(liveMembers) ? liveMembers.length : (t.memberCount || 0);
      const liveTag = Array.isArray(liveMembers) ? '' : ' cached';
      opts.push({
        label: trunc(`${IND}${t.name}`, 95),
        value: `tr:${t.id}`,
        description: trunc(`${count} member${count === 1 ? '' : 's'}${liveTag} ${DOT} ${t.color || 'no color'}`, 95),
        emoji: { name: safeEmoji(t.emoji, '🏕️') },
      });
    }
    return opts;
  }

  // Depth 4 (tribe picked) → show actual Discord role members.
  // Tribe IS a Discord role; members IS role.members. Anything else is a stale abstraction.
  opts.push({
    label: '↑ Back to Phase Contents', value: 'up', emoji: { name: '⬆️' },
    description: `Currently in ${phase.label} ${DOT} ${tribe.name}`,
  });
  const members = getTribeRoleMembers(client, guildId, tribe.id);
  if (members === null) {
    opts.push({
      label: '(Discord client unavailable — can\'t resolve members)',
      value: 'noop',
      description: 'Mockup limitation: client wasn\'t threaded through this code path',
      emoji: { name: '⚠️' },
    });
    return opts;
  }
  if (members.length === 0) {
    opts.push({
      label: '(No members in this Discord role)',
      value: 'noop',
      description: 'Either no one has the role, or the cache is cold (try a real /castlist first)',
      emoji: { name: '🚧' },
    });
    return opts;
  }
  for (const m of members.slice(0, 24)) {
    opts.push({
      label: trunc(`${IND}${m.displayName}`, 95),
      value: `pl:${m.userId}`,
      description: trunc(`Discord role member ${m.isBot ? '(bot)' : ''} ${DOT} TBD: cross-reference with Cast Ranking`, 95),
      emoji: { name: m.isBot ? '🤖' : '👤' },
    });
  }
  return opts;
}

// ─────────────────────────────────────────────
// Factory-friendly handlers (called from app.js via ButtonHandlerFactory)
// ─────────────────────────────────────────────

/**
 * Mutate state for a given interaction, then return the rebuilt view.
 * Caller is a ButtonHandlerFactory handler with `updateMessage: true, deferred: true`,
 * so the factory handles ack + PATCH. We just return the view object.
 *
 * @param {Object} context - ButtonHandlerFactory context (guildId, userId, customId, values, ...)
 * @returns {Object} { components: [container] } | { components, _ephemeralRedirect: true }
 */
export async function processTribePlannerView(context) {
  const { guildId, userId, customId, values, client } = context;
  const v = Array.isArray(values) ? values[0] : undefined;

  if (customId === 'tribeplan_open') {
    // No state change — just open
  } else if (customId === 'tribeplan_reset') {
    userState.set(userId, emptyState());
  } else if (customId === 'tribeplan_pick_season') {
    if (v && v !== 'none') {
      patchState(userId, { configId: v, castlistId: null, phaseId: null, tribeId: null, castRankingView: false });
    }
  } else if (customId === 'tribeplan_navigate') {
    if (v && v !== 'noop') {
      const state = getState(userId);
      if (v === 'up') {
        // Pop one level: tribe-or-castRanking → phase → castlist
        if (state.tribeId || state.castRankingView) {
          state.tribeId = null;
          state.castRankingView = false;
        }
        else if (state.phaseId) state.phaseId = null;
        else if (state.castlistId) state.castlistId = null;
      } else {
        const [kind, id] = v.split(':', 2);
        if (kind === 'cl')      patchState(userId, { castlistId: id, phaseId: null, tribeId: null, castRankingView: false });
        else if (kind === 'ph') patchState(userId, { phaseId: id, tribeId: null, castRankingView: false });
        else if (kind === 'tr') patchState(userId, { tribeId: id, castRankingView: false });
        else if (kind === 'cr') patchState(userId, { castRankingView: true, tribeId: null });  // sibling of tribe at depth 4
        // 'pl' (player) is just informational — no state change, focus stays
      }
    }
  }

  return buildTribePlannerView(guildId, userId, client);
}

/**
 * Return the ephemeral preview for an action button (no-op in mockup).
 * Caller is a ButtonHandlerFactory handler with `ephemeral: true`.
 */
export async function previewTribePlannerAction(context) {
  const { userId, customId } = context;
  const state = getState(userId);
  const action = customId.replace('tribeplan_act_', '');
  const content = describeAction(action, state);
  return {
    components: [{
      type: 17,
      accent_color: ACCENT,
      components: [{ type: 10, content }],
    }],
  };
}

function describeAction(action, state) {
  const parts = [];
  if (state.configId) parts.push(`season \`${state.configId}\``);
  if (state.castlistId) parts.push(`castlist \`${state.castlistId}\``);
  if (state.phaseId) parts.push(`phase \`${state.phaseId}\``);
  if (state.tribeId) parts.push(`tribe \`${state.tribeId}\``);
  if (state.castRankingView) parts.push(`view \`cast-ranking\``);
  const scope = parts.length ? parts.join(' / ') : '(no scope)';
  switch (action) {
    case 'create_tribe':
      return `➕ **Create Tribe** (mockup) — would open a modal under ${scope} to create a new Discord role + tribe entry, then attach it to the selected phase.`;
    case 'edit_tribe':
      return `✏️ **Edit Tribe** (mockup) — would open the tribe editor (name/emoji/color/vanity roles) for ${scope}.`;
    case 'assign':
      return `👥 **Assign Players** (mockup) — would open a multi-select of CAST applicants from Cast Ranking, then write the tribe ↔ player mapping (the "glue logic" that doesn't exist yet) for ${scope}.`;
    case 'remove':
      return `🗑️ **Remove Tribe** (mockup) — would prompt for confirmation, then detach ${scope} from the phase (Discord role kept).`;
    default:
      return `Unknown action \`${action}\` for scope ${scope}.`;
  }
}

// (raw res.send helpers removed — all responses go through ButtonHandlerFactory now)
