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

const emptyState = () => ({ configId: null, castlistId: null, phaseId: null, tribeId: null });

function getState(userId) {
  if (!userState.has(userId)) userState.set(userId, emptyState());
  return userState.get(userId);
}

function patchState(userId, patch) {
  Object.assign(getState(userId), patch);
}

/** Returns the deepest selected level: 0=none,1=season,2=castlist,3=phase,4=tribe */
function depth(state) {
  if (state.tribeId) return 4;
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

function getCastlists(guildData, seasonId) {
  const cls = guildData?.castlistConfigs || {};
  const out = [];
  for (const [id, cl] of Object.entries(cls)) {
    if (!cl) continue;
    if (id === 'default' || cl.seasonId === seasonId) {
      out.push({
        id,
        name: cl.name || id,
        type: cl.type || 'custom',
        emoji: cl.metadata?.emoji || '📋',
        description: cl.metadata?.description || '',
      });
    }
  }
  out.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.name.localeCompare(b.name)));
  return out;
}

function getTribes(guildData, castlist) {
  const tribes = guildData?.tribes || {};
  const out = [];
  for (const [roleId, t] of Object.entries(tribes)) {
    if (!t) continue;
    const inIds   = Array.isArray(t.castlistIds) && t.castlistIds.includes(castlist.id);
    const inLegacy = t.castlist === castlist.name || t.castlist === castlist.id;
    if (inIds || inLegacy) {
      out.push({
        id: roleId,
        name: t.displayName || t.name || `Tribe ${roleId.slice(-4)}`,
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
 */
export async function buildTribePlannerView(guildId, userId) {
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

  const tribes = castlist ? getTribes(guildData, castlist) : [];
  const tribe = state.tribeId ? tribes.find(t => t.id === state.tribeId) || null : null;
  if (state.tribeId && !tribe) { state.tribeId = null; }

  const lvl = depth(state);

  // ── Header & breadcrumb ──
  const breadcrumbParts = ['📅 Season Planner'];
  if (season) breadcrumbParts.push(`${STAGE_EMOJI[season.stage] || '📌'} ${season.name}`);
  if (castlist) breadcrumbParts.push(`${castlist.emoji} ${castlist.name}`);
  if (phase) breadcrumbParts.push(`${phase.emoji} ${phase.label}`);
  if (tribe) breadcrumbParts.push(`${tribe.emoji} ${tribe.name}`);
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
    const opts = buildHierarchyOptions({ season, castlists, castlist, phases, phase, tribes, tribe, guildData, state });
    hierarchyBlock = {
      type: 1,
      components: [{
        type: 3,
        custom_id: 'tribeplan_navigate',
        placeholder: hierarchyPlaceholder({ castlist, phase, tribe }),
        options: opts.length ? opts : [{ label: '(empty)', value: 'noop', emoji: { name: '⚠️' } }],
        min_values: 0, max_values: 1,
      }],
    };
  }

  // ── Action buttons (greyed by level) ──
  const canCreateTribe   = lvl >= 3;            // need a phase (we'd attach the new tribe to the castlist for this phase)
  const canEditTribe     = lvl >= 4;
  const canAssignPlayers = lvl >= 4;
  const canClonePhase    = lvl >= 3;
  const canRemoveTribe   = lvl >= 4;

  const actionsRow = {
    type: 1,
    components: [
      { type: 2, custom_id: 'tribeplan_act_create_tribe', label: 'Create Tribe',     style: 1, emoji: { name: '➕' }, disabled: !canCreateTribe },
      { type: 2, custom_id: 'tribeplan_act_edit_tribe',   label: 'Edit Tribe',       style: 2, emoji: { name: '✏️' }, disabled: !canEditTribe },
      { type: 2, custom_id: 'tribeplan_act_assign',       label: 'Assign Players',   style: 1, emoji: { name: '👥' }, disabled: !canAssignPlayers },
      { type: 2, custom_id: 'tribeplan_act_clone',        label: 'Clone From Prev',  style: 2, emoji: { name: '📋' }, disabled: !canClonePhase },
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
      { type: 10, content: hierarchyHelp({ castlist, phase, tribe }) },
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

function hierarchyPlaceholder({ castlist, phase, tribe }) {
  if (tribe) return `👤 Pick a cast-ranked player… (or ↑ Up)`;
  if (phase) return `🏕️ Pick a tribe… (or ↑ Up)`;
  if (castlist) return `🔀 Pick a game phase… (or ↑ Up)`;
  return `📋 Pick a castlist…`;
}

function hierarchyHelp({ castlist, phase, tribe }) {
  if (tribe) return `-# Showing cast-ranked applicants. Mock data — pick one to focus, then use Assign/Remove.`;
  if (phase) return `-# Showing tribes from the selected castlist. In production these would be the tribes assigned to **${phase.label}** specifically.`;
  if (castlist) return `-# Showing **game phase** rounds only (marooning, swap, merge, FTC, reunion). Standard challenge rounds are hidden.`;
  return `-# Pick a castlist to start. Default is always available.`;
}

/**
 * Build options for the cascading hierarchy select.
 * Pattern: option values are namespaced — `up`, `cl:<id>`, `ph:<id>`, `tr:<id>`, `pl:<userId>`.
 * The first option is always an "↑ Up" affordance once we're past the top of the tree.
 */
function buildHierarchyOptions({ season, castlists, castlist, phases, phase, tribes, tribe, guildData, state }) {
  const opts = [];

  // Determine current view + parent-up label
  if (!castlist) {
    // Showing castlists for the season
    if (castlists.length === 0) {
      opts.push({ label: '(No castlists for this season — create one via Castlist Hub)', value: 'noop', emoji: { name: '⚠️' } });
      return opts;
    }
    for (const cl of castlists.slice(0, 25)) {
      opts.push({
        label: trunc(`${cl.name}${cl.id === 'default' ? '  (Default)' : ''}`, 95),
        value: `cl:${cl.id}`,
        description: trunc(cl.description || `${cl.type} castlist`, 95),
        emoji: { name: cl.emoji },
      });
    }
    return opts;
  }

  if (!phase) {
    // Showing phases for the castlist
    opts.push({ label: '↑ Back to Castlists', value: 'up', emoji: { name: '⬆️' }, description: `Currently in ${castlist.name}` });
    if (phases.length === 0) {
      opts.push({ label: '(No game phases — set up Season Planner rounds first)', value: 'noop', emoji: { name: '⚠️' } });
      return opts;
    }
    for (const p of phases.slice(0, 24)) {
      opts.push({
        label: trunc(`${IND}R${p.roundNo} ${DOT} F${p.fNumber} ${DOT} ${p.label}`, 95),
        value: `ph:${p.id}`,
        description: trunc(`${PHASE_META[p.type].label} phase ${DOT} click to view tribes`, 95),
        emoji: { name: p.emoji },
      });
    }
    return opts;
  }

  if (!tribe) {
    // Showing tribes for the phase (sourced from castlist for the mockup)
    opts.push({
      label: '↑ Back to Game Phases', value: 'up', emoji: { name: '⬆️' },
      description: `Currently in ${castlist.name} ${DOT} ${phase.label}`,
    });
    if (tribes.length === 0) {
      opts.push({ label: '(No tribes on this castlist — use Create Tribe)', value: 'noop', emoji: { name: '⚠️' } });
      return opts;
    }
    for (const t of tribes.slice(0, 24)) {
      opts.push({
        label: trunc(`${IND}${t.name}`, 95),
        value: `tr:${t.id}`,
        description: trunc(`${t.memberCount || 0} members ${DOT} ${t.color || 'no color'}`, 95),
        emoji: { name: safeEmoji(t.emoji, '🏕️') },
      });
    }
    return opts;
  }

  // Showing cast-ranked applicants for the tribe (mock: pulled from season's apps)
  opts.push({
    label: '↑ Back to Tribes', value: 'up', emoji: { name: '⬆️' },
    description: `Currently in ${phase.label} ${DOT} ${tribe.name}`,
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
      emoji: { name: statusEmoji[a.castingStatus] || '👤' },
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
  const { guildId, userId, customId, values } = context;
  const v = Array.isArray(values) ? values[0] : undefined;

  if (customId === 'tribeplan_open') {
    // No state change — just open
  } else if (customId === 'tribeplan_reset') {
    userState.set(userId, emptyState());
  } else if (customId === 'tribeplan_pick_season') {
    if (v && v !== 'none') {
      patchState(userId, { configId: v, castlistId: null, phaseId: null, tribeId: null });
    }
  } else if (customId === 'tribeplan_navigate') {
    if (v && v !== 'noop') {
      const state = getState(userId);
      if (v === 'up') {
        if (state.tribeId) state.tribeId = null;
        else if (state.phaseId) state.phaseId = null;
        else if (state.castlistId) state.castlistId = null;
      } else {
        const [kind, id] = v.split(':', 2);
        if (kind === 'cl') patchState(userId, { castlistId: id, phaseId: null, tribeId: null });
        else if (kind === 'ph') patchState(userId, { phaseId: id, tribeId: null });
        else if (kind === 'tr') patchState(userId, { tribeId: id });
        // 'pl' (player) is just informational — no state change, view stays at tribe level
      }
    }
  }

  return buildTribePlannerView(guildId, userId);
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
  const scope = parts.length ? parts.join(' / ') : '(no scope)';
  switch (action) {
    case 'create_tribe':
      return `➕ **Create Tribe** (mockup) — would open a modal under ${scope} to create a new Discord role + tribe entry, then attach it to the selected phase.`;
    case 'edit_tribe':
      return `✏️ **Edit Tribe** (mockup) — would open the tribe editor (name/emoji/color/vanity roles) for ${scope}.`;
    case 'assign':
      return `👥 **Assign Players** (mockup) — would open a multi-select of cast-ranked applicants to attach to ${scope}. Currently selected applicants would be pre-checked.`;
    case 'clone':
      return `📋 **Clone From Previous Phase** (mockup) — would copy the tribe → player composition from the previous game phase into ${scope}.`;
    case 'remove':
      return `🗑️ **Remove Tribe** (mockup) — would prompt for confirmation, then detach ${scope} from the phase (Discord role kept).`;
    default:
      return `Unknown action \`${action}\` for scope ${scope}.`;
  }
}

// (raw res.send helpers removed — all responses go through ButtonHandlerFactory now)
