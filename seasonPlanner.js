/**
 * Season Planner — round generation, swap/merge placement, and planner UI
 *
 * Parallel build: does NOT touch existing Season Apps flow.
 * Entry point: season_manager button in Reece's Stuff.
 * Spec: docs/01-RaP/0947_20260315_SeasonPlanner_Analysis.md
 */

import { countComponents, validateComponentLimit } from './utils.js';
import { loadPlayerData, savePlayerData } from './storage.js';
import { buildSeasonNavRow } from './seasonSelector.js';

const DOT = '\u2981'; // ⦁
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────────────────────────
// Pure Logic — Round Generation
// ─────────────────────────────────────────────

/**
 * Determine which F-numbers get tribe swaps.
 * Pattern: first swap ~2 eliminations in, subsequent swaps spaced ~2 apart.
 * e.g., 18 players, 2 swaps → [F16, F14]
 */
export function getSwapFNumbers(totalPlayers, numSwaps) {
  if (numSwaps === 0) return [];
  const firstSwapOffset = 2; // 2 eliminations before first swap
  const swapSpacing = 2;     // 2 rounds between swaps
  const swaps = [];
  for (let i = 0; i < numSwaps; i++) {
    const fNumber = totalPlayers - firstSwapOffset - (i * swapSpacing);
    if (fNumber > 1) swaps.push(fNumber);
  }
  return swaps;
}

/**
 * Determine merge F-number (~55-60% through the game, clamped F10-F12).
 * e.g., 18 players → F10, 20 players → F12
 */
/**
 * Determine merge F-number (~55-60% through the game, clamped F10-F12).
 * Avoids collision with swap F-numbers.
 */
export function getMergeFNumber(totalPlayers, swapFNumbers = []) {
  const target = Math.round(totalPlayers * 0.58);
  let merge = Math.max(10, Math.min(12, target));

  // Avoid collision with swaps — shift merge down until clear
  while (swapFNumbers.includes(merge) && merge > 2) {
    merge--;
  }
  return merge;
}

/**
 * Generate the full seasonRounds object for a new season.
 * @param {number} totalPlayers - Total cast size (e.g., 18)
 * @param {number} numSwaps - Number of tribe swaps (e.g., 2)
 * @param {number} ftcPlayers - FTC size (e.g., 3 for Final 3)
 * @returns {Object} Round objects keyed by "r1", "r2", etc.
 */
export function generateSeasonRounds(totalPlayers, numSwaps, ftcPlayers) {
  const rounds = {};
  const swapFNumbers = getSwapFNumbers(totalPlayers, numSwaps);
  const mergeFNumber = getMergeFNumber(totalPlayers, swapFNumbers);

  let roundNo = 1;

  // Playable rounds: F{totalPlayers} down to F{ftcPlayers}
  for (let f = totalPlayers; f >= ftcPlayers; f--) {
    const isMarooning = (roundNo === 1);
    const isSwap = swapFNumbers.includes(f);
    const isMerge = (f === mergeFNumber);
    rounds[`r${roundNo}`] = {
      seasonRoundNo: roundNo,
      fNumber: f,
      exiledPlayers: 0,
      hasMarooning: isMarooning,
      marooningDays: isMarooning ? 1 : 0,
      eventDays: (isSwap || isMerge) ? 1 : 0,
      challengeIDs: {},
      tribalCouncilIDs: {},
      ftcRound: (f === ftcPlayers),
      swapRound: isSwap,
      mergeRound: isMerge,
      juryStart: false
    };
    roundNo++;
  }

  // F1 Reunion — only if FTC isn't already at F1
  if (ftcPlayers > 1) {
    rounds[`r${roundNo}`] = {
      seasonRoundNo: roundNo,
      fNumber: 1,
      exiledPlayers: 0,
      marooningDays: 0,
      challengeIDs: {},
      tribalCouncilIDs: {},
      ftcRound: false,
      swapRound: false,
      mergeRound: false,
      juryStart: false
    };
  }

  return rounds;
}

// ─────────────────────────────────────────────
// Date Calculations
// ─────────────────────────────────────────────

/**
 * Get the duration (in days) for a round based on its properties.
 * - Marooning (round 1): 3 days (marooning + challenge + tribal)
 * - Swap/Merge rounds: 3 days (event + challenge + tribal)
 * - FTC: 2 days (speeches + Q&A/votes)
 * - Reunion (F1): 1 day
 * - Standard: 2 days (challenge + tribal)
 */
export function getRoundDuration(round) {
  // FTC checked BEFORE reunion — FTC at F1 should get speeches+votes, not 1-day reunion treatment
  if (round.ftcRound) {                                                       // FTC: configurable
    const duration = (round.speechDays ?? 1) + (round.votesDays ?? 1);
    return Math.max(1, duration);                                             // Minimum 1 day
  }
  if (round.fNumber === 1) return 1;                                          // Reunion
  // hasMarooning: backwards compat — old data uses marooningDays > 0
  const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
  const tribalDays = round.tribalDays ?? 1;
  if (hasMarooning) return (round.marooningDays ?? 1) + 1 + tribalDays;       // Marooning + challenge(1) + tribal
  if (round.swapRound || round.mergeRound) return (round.eventDays ?? 1) + 1 + tribalDays; // Event + challenge(1) + tribal
  return 1 + tribalDays;                                                      // challenge(1) + tribal
}

/**
 * Calculate dates for all rounds from a start date.
 * @param {Object} rounds - seasonRounds object
 * @param {Date} startDate - Season start date
 * @returns {Object} Map of roundId → { startDay, dates: { event?, challenge?, tribal? } }
 */
export function calculateRoundDates(rounds, startDate, skippedMap = null) {
  const roundIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const dates = {};
  let currentDay = 0; // offset from startDate

  for (const id of roundIds) {
    const round = rounds[id];

    // Skipped rounds get 0 duration and no dates
    if (skippedMap?.has(id)) {
      dates[id] = { startOffset: currentDay, skipped: true };
      continue; // No duration added — next round starts at same day
    }

    const duration = getRoundDuration(round);
    const roundStart = new Date(startDate);
    roundStart.setDate(roundStart.getDate() + currentDay);

    const roundDates = { startOffset: currentDay };

    const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
    const mDays = round.marooningDays ?? 1;
    const eDays = round.eventDays ?? 1;
    const tDays = round.tribalDays ?? 1;

    // FTC checked BEFORE reunion
    if (round.ftcRound) {
      const speechDays = round.speechDays ?? 1;
      roundDates.speeches = formatDate(roundStart);
      const votesDate = new Date(roundStart);
      votesDate.setDate(votesDate.getDate() + speechDays);
      roundDates.votes = formatDate(votesDate);
    } else if (round.fNumber === 1) {
      roundDates.event = formatDate(roundStart);
    } else if (hasMarooning) {
      const challOffset = mDays; // 0 = same day, 1+ = after marooning
      roundDates.event = formatDate(roundStart);
      const challengeDate = new Date(roundStart);
      challengeDate.setDate(challengeDate.getDate() + challOffset);
      roundDates.challenge = formatDate(challengeDate);
      const tribalDate = new Date(challengeDate);
      tribalDate.setDate(tribalDate.getDate() + tDays); // 0 = same day as challenge (live), 1 = next day
      roundDates.tribal = formatDate(tribalDate);
    } else if (round.swapRound || round.mergeRound) {
      const challOffset = eDays; // 0 = same day, 1+ = after event
      roundDates.event = formatDate(roundStart);
      const challengeDate = new Date(roundStart);
      challengeDate.setDate(challengeDate.getDate() + challOffset);
      roundDates.challenge = formatDate(challengeDate);
      const tribalDate = new Date(challengeDate);
      tribalDate.setDate(tribalDate.getDate() + tDays);
      roundDates.tribal = formatDate(tribalDate);
    } else {
      // Standard: challenge day 0, tribal offset by tribalDays
      roundDates.challenge = formatDate(roundStart);
      const tribalDate = new Date(roundStart);
      tribalDate.setDate(tribalDate.getDate() + tDays); // 0 = live tribal (same day), 1 = next day
      roundDates.tribal = formatDate(tribalDate);
    }

    dates[id] = roundDates;
    currentDay += duration;
  }

  return dates;
}

function formatDate(date) {
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// ─────────────────────────────────────────────
// Date Parsing
// ─────────────────────────────────────────────

/**
 * Parse mm/dd/yyyy string to a Date object (midnight UTC).
 * Returns null if invalid.
 */
export function parseStartDate(dateStr) {
  if (!dateStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null;
  const [mm, dd, yyyy] = dateStr.split('/').map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 2020) return null;
  const date = new Date(yyyy, mm - 1, dd);
  // Validate the date is real (e.g., 02/30/2026 would roll to March)
  if (date.getMonth() !== mm - 1 || date.getDate() !== dd) return null;
  return date;
}

// ─────────────────────────────────────────────
// Modal Builder
// ─────────────────────────────────────────────

/**
 * Build the Season Planner create/setup modal.
 * @param {Object} [existing] - Pre-fill values from existing season (for setup flow)
 * @returns {Object} Modal interaction response data
 */
export function buildSeasonPlannerModal(existing = null, opts = {}) {
  // Estimates are OPTIONAL in every mode — create AND edit (RaP 0910). Season Name is the only
  // required field; rounds generate only when all estimates are supplied.
  const isSetup = !!existing?.configId;
  const estRequired = false;
  const createCustomId = opts.createCustomId || 'planner_create_modal';
  const editCustomId = opts.editCustomId || `planner_setup_modal:${existing?.configId}`;

  // Pre-fill the start date ONLY from an existing season. In create mode it stays BLANK on purpose:
  // a pre-filled date counts as a supplied estimate, which would trip the all-or-nothing validation
  // (validatePlannerFields) and block title-only season creation (RaP 0910).
  let startDateValue = null;
  if (existing?.estimatedStartDate) {
    const d = new Date(existing.estimatedStartDate);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    startDateValue = `${mm}/${dd}/${d.getFullYear()}`;
  }

  // Estimate text input — required on setup, optional on create
  const estField = (custom_id, { max_length, min_length, placeholder, value }) => {
    const c = { type: 4, custom_id, style: 1, required: estRequired, placeholder };
    if (max_length) c.max_length = max_length;
    if (estRequired && min_length) c.min_length = min_length;
    if (value != null) c.value = String(value);
    return c;
  };

  return {
    custom_id: isSetup ? editCustomId : createCustomId,
    title: isSetup ? 'Edit Season' : 'Create New Season',
    components: [
      {
        type: 18,
        label: 'Season Name',
        component: {
          type: 4, custom_id: 'season_name', style: 1,
          placeholder: 'e.g., "Season 12 - Zelda: Ocarina of Time"',
          required: true, max_length: 100,
          ...(existing?.seasonName ? { value: existing.seasonName } : {})
        }
      },
      {
        type: 18,
        label: 'Estimated Number of Players',
        description: estRequired ? 'Total estimated players you will cast' : 'Optional — fill all 4 estimates to auto-generate rounds',
        component: estField('est_players', { max_length: 2, min_length: 1, placeholder: '18', value: existing?.estimatedTotalPlayers })
      },
      {
        type: 18,
        label: 'Estimated Number of Swaps',
        description: estRequired ? 'Swaps planned, no need to include merge' : 'Optional — swaps planned (excl. merge)',
        component: estField('est_swaps', { max_length: 1, min_length: 1, placeholder: '2', value: existing?.estimatedSwaps })
      },
      {
        type: 18,
        label: 'Estimated # FTC Players',
        description: estRequired ? "'2' for Final 2, '3' for Final 3" : "Optional — '2' for Final 2, '3' for Final 3",
        component: estField('est_ftc', { max_length: 1, min_length: 1, placeholder: '3', value: existing?.estimatedFTCPlayers })
      },
      {
        type: 18,
        label: 'Estimated Start Date',
        description: estRequired ? 'Enter in mm/dd/yyyy' : 'Optional — mm/dd/yyyy',
        component: estField('est_start_date', { placeholder: '03/07/2026', value: startDateValue })
      },
    ]
  };
}

// ─────────────────────────────────────────────
// Modal Validation
// ─────────────────────────────────────────────

/**
 * Validate and parse modal fields.
 * @param {Object} fields - { season_name, est_players, est_swaps, est_ftc, est_start_date }
 * @returns {{ valid: boolean, errors: string[], data: Object }}
 */
export function validatePlannerFields(fields) {
  const errors = [];
  const seasonName = fields.season_name?.trim();
  if (!seasonName) errors.push('Season name is required');

  // Each estimate is parsed & validated INDEPENDENTLY so partial progress is saved (incremental planner
  // setup — add players now, swaps later). Rounds generate ONLY when ALL FOUR are present & valid.
  // Nothing here blocks the save — the ONLY thing that makes a submit invalid is a missing season name.
  // null = not provided / invalid this submit (the value is then cleared on save, matching the modal).
  const playersRaw = parseInt(fields.est_players);
  const swapsRaw = parseInt(fields.est_swaps);
  const ftcRaw = parseInt(fields.est_ftc);
  const startDate = parseStartDate(fields.est_start_date);

  const players = (!isNaN(playersRaw) && playersRaw >= 1) ? playersRaw : null;
  const swaps = (!isNaN(swapsRaw) && swapsRaw >= 0) ? swapsRaw : null;
  // FTC must be a positive int and (when total players is known) strictly fewer than total players.
  const ftc = (!isNaN(ftcRaw) && ftcRaw >= 1 && (players == null || ftcRaw < players)) ? ftcRaw : null;
  const estimatedStartDate = startDate ? startDate.getTime() : null;

  const hasPlannerData = players != null && swaps != null && ftc != null && estimatedStartDate != null;

  return {
    valid: errors.length === 0,
    errors,
    hasPlannerData,
    data: {
      seasonName,
      hasPlannerData,
      // Individually-valid estimates (may be partial); null = not provided/invalid this submit.
      estimatedTotalPlayers: players,
      estimatedSwaps: swaps,
      estimatedFTCPlayers: ftc,
      estimatedStartDate,
    }
  };
}

// ─────────────────────────────────────────────
// Skipped Round Detection
// ─────────────────────────────────────────────

/**
 * Calculate which rounds are skipped due to multi-eliminations.
 * If round X has N eliminations, the next N-1 rounds are skipped.
 * @param {Object} rounds - seasonRounds object
 * @returns {Map<string, { skippedBy: number, elimCount: number }>} roundId → skip info
 */
export function getSkippedRounds(rounds) {
  const skipped = new Map();
  const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);

  for (let i = 0; i < sortedIds.length; i++) {
    const id = sortedIds[i];
    const round = rounds[id];
    const elims = round.eliminations ?? 1;
    if (elims > 1) {
      // Skip the next (elims - 1) rounds
      for (let skip = 1; skip < elims && (i + skip) < sortedIds.length; skip++) {
        const skippedId = sortedIds[i + skip];
        skipped.set(skippedId, {
          skippedBy: round.fNumber,
          elimCount: elims
        });
      }
    }
  }

  return skipped;
}

// ─────────────────────────────────────────────
// Season Planner View — Dynamic round display
// ─────────────────────────────────────────────

const SELECTS_PER_PAGE = 10;

// Planner estimate fields the user must supply (via the Edit modal) before the schedule/calendar is
// usable. Order = display order in the setup prompt. estimatedSwaps can legitimately be 0, so
// presence is checked with `== null` (0 counts as supplied, only null/undefined count as missing).
const PLANNER_FIELD_PROMPTS = {
  estimatedTotalPlayers: 'Add estimated number of total players in the season',
  estimatedSwaps: 'Add estimated number of swaps',
  estimatedFTCPlayers: 'Add indicative Final Tribal Council players (e.g. F2 vs. F3)',
  estimatedStartDate: 'Set an indicative Season Start date',
};
const ALL_PLANNER_FIELDS = Object.keys(PLANNER_FIELD_PROMPTS);

/**
 * Which planner estimate fields are still missing. Prefers the live config (per-field check), and
 * falls back to the all-or-nothing rounds invariant when no config is passed (rounds exist ⟺ all
 * estimates were supplied).
 */
export function getMissingPlannerFields(config, rounds) {
  if (config) return ALL_PLANNER_FIELDS.filter(k => config[k] == null);
  return (rounds && Object.keys(rounds).length > 0) ? [] : ALL_PLANNER_FIELDS;
}

/** Plain-text setup prompt shown in the planner when estimates are missing (lists only what's left). */
export function buildPlannerSetupPrompt(missing) {
  const fields = missing && missing.length ? missing : ALL_PLANNER_FIELDS;
  const bullets = fields.map(k => `* ${PLANNER_FIELD_PROMPTS[k]}`).join('\n');
  return [
    '## 📅 Set up Season Planner',
    '',
    'Season Planner lets you plan out your rounds, swaps and challenges and view a season schedule / calendar showing key dates. To use Season Planner, click the `✏️ Edit` button above and input the following details:',
    bullets,
    '',
    "Once these details are populated, you'll be able to use Season Planner!",
  ].join('\n');
}

/**
 * Build the Season Planner view for a real season.
 * @param {string} seasonName - Display name
 * @param {Object} rounds - seasonRounds object
 * @param {Date} startDate - Season start date
 * @param {string} configId - applicationConfigs key (for back navigation)
 * @param {number} page - 0-indexed page
 * @param {Object} [config] - applicationConfigs entry; enables per-field "set up planner" detection
 * @returns {Object} Components V2 response
 */
export function buildPlannerView(seasonName, rounds, startDate, configId, page = 0, ideas = '', challenges = {}, config = null) {
  // Guard a missing/invalid start date so round dates never render as "undefined NaN undefined"
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) startDate = new Date();
  const roundIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const totalPages = Math.ceil(roundIds.length / SELECTS_PER_PAGE);
  if (page < 0 || page >= totalPages) page = 0;
  const pageInfo = totalPages > 1 ? ` (Pg ${page + 1}/${totalPages})` : '';

  const skippedMap = getSkippedRounds(rounds);
  const dates = calculateRoundDates(rounds, startDate, skippedMap);
  const pageRoundIds = roundIds.slice(page * SELECTS_PER_PAGE, (page + 1) * SELECTS_PER_PAGE);

  const selectRows = pageRoundIds.map(id => {
    const round = rounds[id];
    const roundDates = dates[id];
    const skipInfo = skippedMap.get(id);
    const options = skipInfo
      ? [{ label: `F${round.fNumber} ${DOT} Skipped (F${skipInfo.skippedBy} eliminates ${skipInfo.elimCount})`, value: 'summary', default: true, emoji: { name: '⏭️' } }]
      : buildRoundOptions(round, roundDates, challenges);

    return {
      type: 1,
      components: [{
        type: 3,
        custom_id: `planner_round_${id}_${configId}`,
        placeholder: `${round.seasonRoundNo}. ${options[0].label}`,
        options
      }]
    };
  });

  // Planner readiness: per-field when a config is supplied, else inferred from generated rounds.
  const missing = getMissingPlannerFields(config, rounds);
  const plannerReady = missing.length === 0;

  // Schedule body: round selects + active actions when set up; otherwise a setup prompt with the
  // Schedule/Calendar actions disabled until every estimate is supplied via the Edit modal.
  const scheduleBody = plannerReady
    ? [
        ...selectRows,
        { type: 1, components: [
          { type: 2, custom_id: `planner_schedule_${configId}`, label: 'Schedule', style: 2, emoji: { name: '📋' } },
          { type: 2, custom_id: `planner_calendar_${configId}`, label: 'Calendar', style: 2, emoji: { name: '📅' } },
        ]},
      ]
    : [
        { type: 10, content: buildPlannerSetupPrompt(missing) },
        { type: 1, components: [
          { type: 2, custom_id: `planner_schedule_${configId}`, label: 'Schedule', style: 2, emoji: { name: '📋' }, disabled: true },
          { type: 2, custom_id: `planner_calendar_${configId}`, label: 'Calendar', style: 2, emoji: { name: '📅' }, disabled: true },
        ]},
      ];

  const navButtons = [
    { type: 2, custom_id: 'season_manager', label: '← Seasons', style: 2 },
    { type: 2, custom_id: `planner_page_${page - 1}_${configId}`, label: '◀', style: page === 0 ? 2 : 1, disabled: page === 0 },
    { type: 2, custom_id: `planner_page_${page + 1}_${configId}`, label: '▶', style: page >= totalPages - 1 ? 2 : 1, disabled: page >= totalPages - 1 },
  ];

  const container = {
    type: 17, accent_color: 0x9b59b6,
    components: [
      { type: 10, content: `## 📅 Season Planner\n> ### ${seasonName}` },
      // Active-tab nav row — Apps · Planner · Ranking · Edit (current view = Planner, shaded blue)
      buildSeasonNavRow(configId, 'planner'),
      { type: 14 },
      { type: 10, content: `### \`\`\`📅 Manage Season Schedule${pageInfo}\`\`\`` },
      ...scheduleBody,
      { type: 14 },
      { type: 1, components: navButtons },
    ]
  };

  countComponents([container], { verbosity: "full", label: `Season Planner (Page ${page + 1})` });
  validateComponentLimit([container], `Season Planner (Page ${page + 1})`);

  return { components: [container] };
}

/**
 * Build string select options for a single round.
 */
function buildRoundOptions(round, dates, challenges = {}) {
  const f = round.fNumber;

  // Determine round type and summary label
  if (f === 1) {
    // Reunion — no editable actions
    return [
      { label: `F1 ${DOT} ${dates.event} ${DOT} Reunion`, value: 'summary', default: true, emoji: { name: '🎉' } },
    ];
  }

  if (round.ftcRound) {
    // FTC round
    return [
      { label: `F${f} (FTC) ${DOT} ${dates.speeches} ${DOT} Final Tribal Council`, value: 'summary', default: true, emoji: { name: '🔥' } },
      { label: 'Speech Writing', value: 'ftc_speeches', emoji: { name: '💬' }, description: dates.speeches },
      { label: 'Questioning / Votes', value: 'ftc_votes', emoji: { name: '🗳️' }, description: dates.votes },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
    ];
  }

  // Derive challenge name: linked challenge title > stored name > default
  const linkedChallenge = round.challengeIDs?.primary ? challenges[round.challengeIDs.primary] : null;
  const rawChallengeName = linkedChallenge?.title || round.challengeName || `Challenge ${round.seasonRoundNo} (TBC)`;
  const challengeName = rawChallengeName.length > 50 ? rawChallengeName.substring(0, 47) + '...' : rawChallengeName;
  const host = round.host || 'TBC';
  const elims = round.eliminations ?? 1;
  const elimText = elims === 0 ? 'no elim' : elims === 1 ? '1 elim' : `${elims} elims`;

  // "Go to Challenge" option — only if linked
  const linkedChalId = round.challengeIDs?.primary;
  const goToChallenge = linkedChalId
    ? { label: `Go to ${challengeName}`, value: `go_challenge_${linkedChalId}`, emoji: { name: '🏃' } }
    : null;

  const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
  if (hasMarooning) {
    const label = `F${f} ${DOT} ${dates.event} ${DOT} Marooning ${DOT} ${challengeName}`;
    const opts = [
      { label, value: 'summary', default: true, emoji: { name: '🏝️' } },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' }, description: dates.event },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
      { label: `Edit F${f} Tribal (${elimText})`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
      { label: 'Swap Events With Another Round', value: 'swap_round', emoji: { name: '↔️' } },
    ];
    if (goToChallenge) opts.push(goToChallenge);
    return opts;
  }

  if (round.swapRound || round.mergeRound) {
    const eventLabel = round.eventLabel || (round.swapRound ? 'Swap' : 'Merge');
    const label = `F${f} ${DOT} ${dates.event} ${DOT} ${eventLabel} ${DOT} ${challengeName}`;
    const opts = [
      { label, value: 'summary', default: true, emoji: { name: '🔀' } },
      { label: `Manage ${eventLabel}`, value: 'manage_event', emoji: { name: '🔀' }, description: dates.event },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
      { label: `Edit F${f} Tribal (${elimText})`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
      { label: 'Swap Events With Another Round', value: 'swap_round', emoji: { name: '↔️' } },
    ];
    if (goToChallenge) opts.push(goToChallenge);
    return opts;
  }

  // Standard round
  const label = `F${f} ${DOT} ${dates.challenge} ${DOT} ${challengeName}`;
  const opts = [
    { label, value: 'summary', default: true, emoji: { name: '▫️' } },
    { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
    { label: `Edit F${f} Tribal (${elimText})`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
    { label: '───────────────────', value: 'divider', description: ' ' },
    { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
    { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
    { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
    { label: 'Swap Events With Another Round', value: 'swap_round', emoji: { name: '↔️' } },
  ];
  if (goToChallenge) opts.push(goToChallenge);
  return opts;
}

// ─────────────────────────────────────────────
// Season Selector View
// ─────────────────────────────────────────────

/**
 * Build the season planner selector — shows existing seasons + create new option.
 * @param {string} guildId
 * @returns {Object} Components V2 response
 */
export async function buildPlannerSelector(guildId) {
  const { createSeasonSelector, seasonConfigIndicators } = await import('./seasonSelector.js');

  // Reuse the shared season selector with config-indicator descriptions + a Search option (>10 seasons).
  // Emits the unified 'create_new_season' sentinel (handled in app.js alongside legacy 'planner_create_new').
  const selector = await createSeasonSelector(guildId, {
    customId: 'planner_select_season',
    placeholder: 'Select a season to manage...',
    requireSeasonName: true,
    showRowEmoji: false, // drop the stage-emoji prefix — the config indicators carry the meaning now
    includeSearch: true,
    createNewLabel: 'Create New Season',
    createNewEmoji: { name: '➕' },
    createNewDescription: 'Create and configure a new season',
    // Config indicators (shared with search results via seasonConfigIndicators)
    decorateSeason: (configId, season, guildData) => ({ description: seasonConfigIndicators(configId, season, guildData) })
  });

  const container = {
    type: 17, accent_color: 0x9b59b6,
    components: [
      { type: 10, content: '## 📅 Season Manager\n-# Select a season to manage or create a new one' },
      { type: 14 },
      { type: 1, components: [selector.toJSON()] },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 },
        { type: 2, custom_id: 'season_delete_mode', label: 'Delete Mode', style: 4, emoji: { name: '🗑️' } }
      ]}
    ]
  };

  return { components: [container] };
}

/**
 * Search modal for the Season Manager — routes to the shared entity_search_modal_seasons[_delete] handler.
 * @param {string} mode - '' for manage, 'delete' for the Delete Mode flow
 */
export function buildSeasonSearchModal(mode = '') {
  const entityType = mode === 'delete' ? 'seasons_delete' : 'seasons';
  return {
    custom_id: `entity_search_modal_${entityType}`,
    title: mode === 'delete' ? 'Search Seasons to Delete' : 'Search Seasons',
    components: [
      {
        type: 18,
        label: 'Season name',
        component: {
          type: 4, custom_id: 'search_term', style: 1,
          placeholder: 'e.g. "S55" or "Unify"',
          required: true, max_length: 100
        }
      }
    ]
  };
}

// ─────────────────────────────────────────────
// Delete Mode (season deletion — confirmation built, actual delete STUBBED; see RaP 0908)
// ─────────────────────────────────────────────

/**
 * Build the Delete Mode selector — red-accented season picker (with search) for choosing a
 * season to delete. No "Create New". Selecting a season routes to the delete confirmation.
 */
export async function buildSeasonDeleteSelector(guildId) {
  const { createSeasonSelector, seasonConfigIndicators } = await import('./seasonSelector.js');
  const selector = await createSeasonSelector(guildId, {
    customId: 'season_delete_select',
    placeholder: 'Select a season to delete...',
    requireSeasonName: true,
    showRowEmoji: false,
    includeCreateNew: false,
    includeSearch: true,
    decorateSeason: (configId, season, guildData) => ({ description: seasonConfigIndicators(configId, season, guildData) })
  });

  const container = {
    type: 17, accent_color: 0xe74c3c, // red — danger
    components: [
      { type: 10, content: "## 🗑️ Delete a Season\n-# Pick a season to permanently delete — you'll see exactly what's affected before confirming." },
      { type: 14 },
      { type: 1, components: [selector.toJSON()] },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'season_manager', label: '← Manage', style: 2 }
      ]}
    ]
  };
  return { components: [container] };
}

/**
 * Build the LEAN deletion confirmation for a season, with a real impact summary (counts).
 * Returns null if the config doesn't exist.
 */
export async function buildSeasonDeleteConfirm(guildId, configId) {
  const playerData = await loadPlayerData();
  const g = playerData[guildId] || {};
  const config = g.applicationConfigs?.[configId];
  if (!config) return null;

  const seasonId = config.seasonId;
  const apps = Object.values(g.applications || {}).filter(a => a.configId === configId);
  const rounds = seasonId ? Object.keys(g.seasonRounds?.[seasonId] || {}).length : 0;
  const challenges = Object.values(g.challenges || {}).filter(c => c.seasonId === seasonId).length;
  const castlists = Object.values(g.castlistConfigs || {}).filter(cl => cl.seasonId === seasonId).length;
  const plural = (n) => (n === 1 ? '' : 's');

  // 🗑️ Permanently deleted (Tier 1 — atomic data cascade)
  const deleted = [`• Season config + **${apps.length}** application${plural(apps.length)} (scores, notes, casting decisions)`];
  if (rounds) deleted.push(`• **${rounds}** planner round${plural(rounds)} + **${challenges}** challenge${plural(challenges)}`);

  // 🔗 Also affected (Tier 2 — castlists auto-unlinked, kept)
  const also = [];
  if (castlists) also.push(`• **${castlists}** castlist${plural(castlists)} unlinked from this season *(kept — placement sorting resets to default)*`);

  // 📌 Kept / not touched (Discord resources — no channel deletion)
  const kept = [];
  if (apps.length) kept.push(`• **${apps.length}** application channel${plural(apps.length)} in Discord *(delete manually if you want them gone)*`);
  if (config.targetChannelId) kept.push(`• The posted **"Apply" button** *(players could still click it — remove the post manually)*`);

  const sections = [`### \`\`\`🗑️ Permanently deleted\`\`\`\n${deleted.join('\n')}`];
  if (also.length) sections.push(`### \`\`\`🔗 Also affected\`\`\`\n${also.join('\n')}`);
  if (kept.length) sections.push(`### \`\`\`📌 Kept — not touched\`\`\`\n${kept.join('\n')}`);

  return {
    components: [{
      type: 17, accent_color: 0xe74c3c, // red — irreversible
      components: [
        { type: 10, content: `## ⚠️ Delete "${config.seasonName}"?` },
        { type: 14 },
        { type: 10, content: sections.join('\n\n') },
        { type: 14 },
        { type: 10, content: `**This cannot be undone.**` },
        { type: 14 },
        { type: 1, components: [
          { type: 2, custom_id: 'season_delete_mode', label: 'Cancel', style: 2, emoji: { name: '❌' } },
          { type: 2, custom_id: `season_delete_confirm_${configId}`, label: 'Yes, Delete Season', style: 4, emoji: { name: '🗑️' } }
        ]}
      ]
    }]
  };
}

/**
 * Delete a season — Tier 1 atomic data cascade + Tier 2 castlist unlink (RaP 0908).
 * Deletes: applicationConfigs[configId], its applications (scores/notes/casting), seasonRounds,
 * and season-owned challenges. Unlinks (keeps) castlists referencing this season.
 * Does NOT touch Discord resources (channels/category/role/apply post) — decided 2026-06-15.
 * All writes via savePlayerData (atomicSave under the hood).
 * @returns {{ deleted: boolean, notFound?: boolean, seasonName?, apps?, rounds?, challenges?, castlists? }}
 */
export async function deleteSeason(guildId, configId) {
  const playerData = await loadPlayerData();
  const g = playerData[guildId];
  const config = g?.applicationConfigs?.[configId];
  if (!config) return { deleted: false, notFound: true };

  const seasonId = config.seasonId;
  let apps = 0, rounds = 0, challenges = 0, castlists = 0;

  // Applicant records for this season (scores, notes, casting decisions live here)
  for (const [channelId, app] of Object.entries(g.applications || {})) {
    if (app.configId === configId) { delete g.applications[channelId]; apps++; }
  }

  // Planner rounds
  if (seasonId && g.seasonRounds?.[seasonId]) {
    rounds = Object.keys(g.seasonRounds[seasonId]).length;
    delete g.seasonRounds[seasonId];
  }

  // Season-owned challenges
  for (const [chalId, chal] of Object.entries(g.challenges || {})) {
    if (seasonId && chal.seasonId === seasonId) { delete g.challenges[chalId]; challenges++; }
  }

  // Castlists — unlink (keep the castlist, clear its season link so placement sorting falls back)
  for (const cl of Object.values(g.castlistConfigs || {})) {
    if (seasonId && cl.seasonId === seasonId) { delete cl.seasonId; castlists++; }
  }

  // The season config itself
  delete g.applicationConfigs[configId];

  await savePlayerData(playerData);
  console.log(`🗑️ Season deleted: "${config.seasonName}" (${configId}) — ${apps} apps, ${rounds} rounds, ${challenges} challenges, ${castlists} castlists unlinked`);
  return { deleted: true, seasonName: config.seasonName, apps, rounds, challenges, castlists };
}

// ─────────────────────────────────────────────
// Data Persistence
// ─────────────────────────────────────────────

/**
 * Generate the round structure + one challenge per round (except F1 reunion) and store them
 * on playerData. Shared by createSeason() and updateSeason(). Mutates playerData in place.
 * @returns {{ roundCount: number, chalCount: number }}
 */
async function generateAndStoreRounds(playerData, guildId, seasonId, data, createdBy) {
  const { default: crypto } = await import('crypto');
  if (!playerData[guildId].seasonRounds) playerData[guildId].seasonRounds = {};
  if (!playerData[guildId].challenges) playerData[guildId].challenges = {};

  const rounds = generateSeasonRounds(data.estimatedTotalPlayers, data.estimatedSwaps, data.estimatedFTCPlayers);
  playerData[guildId].seasonRounds[seasonId] = rounds;

  let chalCount = 0;
  for (const [, round] of Object.entries(rounds)) {
    if (round.fNumber === 1) continue; // Skip reunion — no challenge
    const chalId = `challenge_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const chalTitle = round.ftcRound
      ? `Challenge ${round.seasonRoundNo} (FTC Speech)`
      : `Challenge ${round.seasonRoundNo} (TBC)`;
    playerData[guildId].challenges[chalId] = {
      title: chalTitle,
      description: '',
      image: '',
      accentColor: 0x5865F2,
      creationHost: createdBy || null,
      runningHost: null,
      seasonId,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
    round.challengeIDs = { primary: chalId };
    chalCount++;
  }

  return { roundCount: Object.keys(rounds).length, chalCount };
}

/**
 * Create a new season (unified create path — RaP 0910, Layer B).
 * Always seeds default application questions. Generates rounds/challenges only when
 * data.hasPlannerData is true (all estimates supplied).
 * @param {string} guildId
 * @param {string} userId
 * @param {Object} data - Validated fields from validatePlannerFields().data
 * @returns {{ configId: string, seasonId: string, hasPlannerData: boolean }}
 */
export async function createSeason(guildId, userId, data) {
  const { default: crypto } = await import('crypto');
  const playerData = await loadPlayerData();

  if (!playerData[guildId]) {
    playerData[guildId] = { players: {}, tribes: {}, timezones: {}, pronounRoleIDs: [] };
  }
  if (!playerData[guildId].applicationConfigs) {
    playerData[guildId].applicationConfigs = {};
  }

  const seasonId = `season_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
  const configId = `config_${Date.now()}_${userId}`;
  const hasPlannerData = !!data.hasPlannerData;

  let buttonText = `Apply to ${data.seasonName}`;
  if (buttonText.length > 80) {
    buttonText = `Apply to ${data.seasonName.substring(0, 68)}..`;
  }

  // Base config — every season is application-ready (seeded with default questions).
  // explanatoryText is the apply-button blurb; it's set later during app-button setup, not at birth.
  const config = {
    buttonText,
    explanatoryText: '',
    completionDescription: 'Thank you for completing your application! A host will review it soon.',
    completionImage: null,
    channelFormat: '📝%name%-app',
    targetChannelId: null,
    categoryId: null,
    buttonStyle: 'Primary',
    createdBy: userId,
    stage: hasPlannerData ? 'planning' : 'draft',
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    seasonId,
    seasonName: data.seasonName,
    questions: [
      {
        id: `question_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`,
        order: 1,
        questionTitle: 'Click here to set first question',
        questionText: 'Edit this question or add more using the menu below.',
        questionStyle: 1,
        createdAt: Date.now()
      },
      {
        id: `question_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`,
        questionType: 'completion',
        questionTitle: 'Thank you for applying to the season!',
        questionText: 'Include information such as next steps on casting process, casting decision dates and marooning / season start dates.',
        createdAt: Date.now()
      }
    ],
  };

  // Persist only the estimates that were PROVIDED (may be partial — incremental planner setup); never
  // write null placeholders. The Planner view prompts for whatever is still missing. Round/challenge
  // generation happens only when ALL FOUR are present & valid (hasPlannerData).
  if (data.estimatedTotalPlayers != null) config.estimatedTotalPlayers = data.estimatedTotalPlayers;
  if (data.estimatedSwaps != null) config.estimatedSwaps = data.estimatedSwaps;
  if (data.estimatedFTCPlayers != null) config.estimatedFTCPlayers = data.estimatedFTCPlayers;
  if (data.estimatedStartDate != null) config.estimatedStartDate = data.estimatedStartDate;
  if (hasPlannerData) {
    config.currentSeasonRoundID = 1;
    config.seasonIdeas = 'Free-form section to brainstorm season themes, twists and challenges before assigning to rounds.';
  }

  playerData[guildId].applicationConfigs[configId] = config;

  let roundCount = 0, chalCount = 0;
  if (hasPlannerData) {
    ({ roundCount, chalCount } = await generateAndStoreRounds(playerData, guildId, seasonId, data, userId));
  }

  await savePlayerData(playerData);
  console.log(`✅ Season created: "${data.seasonName}" (${configId})${hasPlannerData ? ` with ${roundCount} rounds and ${chalCount} challenges` : ' (name only)'}`);

  return { configId, seasonId, hasPlannerData };
}

/**
 * Update an existing season (unified edit path — RaP 0910).
 * Always updates name + apply-button text. When estimates are supplied (data.hasPlannerData),
 * persists them on the config and generates rounds ONLY for first-time setup (season has no
 * rounds yet). Existing rounds are preserved — manual round/challenge edits are never wiped.
 * @param {string} guildId
 * @param {string} configId - Existing applicationConfigs key
 * @param {Object} data - validatePlannerFields().data (seasonName + optional estimates)
 * @returns {{ seasonId: string, hasPlannerData: boolean, generatedRounds: boolean }}
 */
export async function updateSeason(guildId, configId, data) {
  const playerData = await loadPlayerData();
  const config = playerData[guildId]?.applicationConfigs?.[configId];
  if (!config) throw new Error(`Config ${configId} not found`);

  // Name + apply-button text (explanatoryText is intentionally left untouched — it's the
  // apply-button blurb, set during app-button setup, not here)
  config.seasonName = data.seasonName;
  let buttonText = `Apply to ${data.seasonName}`;
  if (buttonText.length > 80) buttonText = `Apply to ${data.seasonName.substring(0, 68)}..`;
  config.buttonText = buttonText;
  config.lastUpdated = Date.now();

  // MERGE each PROVIDED estimate into the config (incremental planner setup). NEVER wipe a
  // previously-saved value on a blank field — the modal pre-fill can be imperfect, so a host
  // "adding players" must not clear swaps/ftc/date. This is the real fix for the partial-save bug.
  if (data.estimatedTotalPlayers != null) config.estimatedTotalPlayers = data.estimatedTotalPlayers;
  if (data.estimatedSwaps != null) config.estimatedSwaps = data.estimatedSwaps;
  if (data.estimatedFTCPlayers != null) config.estimatedFTCPlayers = data.estimatedFTCPlayers;
  if (data.estimatedStartDate != null) config.estimatedStartDate = data.estimatedStartDate;

  // Rounds generate once the merged CONFIG (not just this single submit) holds all four estimates —
  // and only if it has no rounds yet. Existing rounds are never regenerated. This lets a host
  // complete the planner across several edits (players in one, swaps in another, …).
  const configComplete = config.estimatedTotalPlayers != null && config.estimatedSwaps != null
    && config.estimatedFTCPlayers != null && config.estimatedStartDate != null;

  let generatedRounds = false;
  if (configComplete) {
    config.currentSeasonRoundID = config.currentSeasonRoundID || 1;
    config.seasonIdeas = config.seasonIdeas || 'Free-form section to brainstorm season themes, twists and challenges before assigning to rounds.';
    if (config.stage === 'draft') config.stage = 'planning';

    const existingRounds = playerData[guildId]?.seasonRounds?.[config.seasonId];
    if (!existingRounds || Object.keys(existingRounds).length === 0) {
      // First-time setup — generate from the MERGED config values (not the single submit's data).
      await generateAndStoreRounds(playerData, guildId, config.seasonId, {
        estimatedTotalPlayers: config.estimatedTotalPlayers,
        estimatedSwaps: config.estimatedSwaps,
        estimatedFTCPlayers: config.estimatedFTCPlayers,
        estimatedStartDate: config.estimatedStartDate,
      }, config.createdBy);
      generatedRounds = true;
    }
  }

  await savePlayerData(playerData);
  console.log(`✅ Season updated: "${data.seasonName}" (${configId})${generatedRounds ? ' — generated rounds + challenges' : ''}`);

  return { seasonId: config.seasonId, hasPlannerData: configComplete, generatedRounds };
}

// ─────────────────────────────────────────────
// Round Editing Modals
// ─────────────────────────────────────────────

/**
 * Build a round-editing modal based on the selected action.
 * @param {string} action - The select value (edit_tribal, marooning, swap_merge, etc.)
 * @param {Object} round - The round data from seasonRounds
 * @param {string} roundId - e.g., "r3"
 * @param {string} configId - applicationConfigs key
 * @returns {Object|null} Modal data object, or null for no-op actions
 */
export function buildRoundModal(action, round, roundId, configId) {
  const modalId = `planner_modal:${action}:${roundId}:${configId}`;
  const f = round.fNumber;

  switch (action) {
    case 'edit_tribal': {
      const tribalDays = round.tribalDays ?? 1;
      let currentTribalOption = '1';
      if (tribalDays === 0) currentTribalOption = '0';
      else if (tribalDays > 1) currentTribalOption = 'custom';

      const tribalOptions = [
        { label: 'Same Day as Challenge (0d)', value: '0', description: 'Challenge + tribal happen on the same day (live tribal)' },
        { label: 'Separate Day (1d)', value: '1', description: 'Tribal gets its own day after challenge' },
        { label: 'Multiple Days', value: 'custom', description: 'Enter custom days below' },
      ];
      const selectedTribal = tribalOptions.find(o => o.value === currentTribalOption);
      if (selectedTribal) selectedTribal.default = true;

      return {
        custom_id: modalId,
        title: `Edit F${f} Tribal Council`,
        components: [
          {
            type: 18,
            label: 'Tribal Duration',
            description: 'How the tribal fits into the round schedule',
            component: {
              type: 21, // Radio Group
              custom_id: 'tribal_duration',
              options: tribalOptions
            }
          },
          {
            type: 18,
            label: 'Custom Days (only if Multiple Days selected)',
            description: 'How many days the tribal spans (e.g., 2 for a 2-day tribal)',
            component: {
              type: 4, custom_id: 'custom_days', style: 1,
              placeholder: '2',
              required: false, max_length: 1,
              ...(tribalDays > 1 ? { value: String(tribalDays) } : {})
            }
          },
          {
            type: 18,
            label: 'Eliminations',
            description: 'How many players eliminated (0 = no elim, 2 = double tribal)',
            component: {
              type: 4, custom_id: 'eliminations', style: 1,
              placeholder: '1',
              required: true, max_length: 1, min_length: 1,
              value: String(round.eliminations ?? 1)
            }
          }
        ]
      };
    }

    case 'marooning': {
      const hasMar = round.hasMarooning ?? (round.marooningDays > 0);
      const mDays = round.marooningDays ?? 1;
      let currentOption = 'none';
      if (hasMar && mDays === 0) currentOption = '0';
      else if (hasMar && mDays === 1) currentOption = '1';
      else if (hasMar && mDays > 1) currentOption = 'custom';

      // Only set default:true on the selected option — omit default entirely for others
      const marOptions = [
        { label: 'No Marooning', value: 'none', description: 'Remove marooning from this round' },
        { label: 'Same Day as Challenge (0d)', value: '0', description: 'Marooning + challenge happen on the same day' },
        { label: 'Separate Day (1d)', value: '1', description: 'Marooning gets its own full day' },
        { label: 'Multiple Days', value: 'custom', description: 'Enter custom days below' },
      ];
      const selectedMar = marOptions.find(o => o.value === currentOption);
      if (selectedMar) selectedMar.default = true;

      return {
        custom_id: modalId,
        title: `Manage Marooning - F${f}`,
        components: [
          {
            type: 18,
            label: 'Marooning Duration',
            description: 'How this event fits into the round schedule',
            component: {
              type: 21, // Radio Group
              custom_id: 'event_duration',
              options: marOptions
            }
          },
          {
            type: 18,
            label: 'Custom Days (only if Multiple Days selected)',
            description: 'How many days the marooning spans (e.g., 2 for a 2-day marooning)',
            component: {
              type: 4, custom_id: 'custom_days', style: 1,
              placeholder: '2',
              required: false, max_length: 1,
              ...(mDays > 1 ? { value: String(mDays) } : {})
            }
          },
          {
            type: 18,
            label: 'Exiled Players',
            description: 'Players in exile (eliminated but could return via twist)',
            component: {
              type: 4, custom_id: 'exiled_players', style: 1,
              placeholder: '0',
              required: false, max_length: 2,
              value: String(round.exiledPlayers)
            }
          }
        ]
      };
    }

    case 'swap_merge': {
      return {
        custom_id: modalId,
        title: `Add Event - F${f}`,
        components: [
          {
            type: 18,
            label: 'Event Type',
            description: 'Choose the type of event',
            component: {
              type: 21, // Radio Group
              custom_id: 'event_type',
              required: true,
              options: [
                { label: 'Tribe Swap', value: 'swap', description: 'Shuffle players between tribes' },
                { label: 'Tribe Merge', value: 'merge', description: 'Combine all tribes into one' }
              ]
            }
          },
          {
            type: 18,
            label: 'Event Label',
            description: 'Display name for this event (e.g., "Swap 1", "Merge")',
            component: {
              type: 4, custom_id: 'event_label', style: 1,
              placeholder: 'Swap 1',
              required: true, max_length: 20,
            }
          },
          {
            type: 18,
            label: 'Event Duration',
            description: 'How this event fits into the round schedule',
            component: {
              type: 21, // Radio Group
              custom_id: 'event_duration',
              options: [
                { label: 'Same Day as Challenge (0d)', value: '0', description: 'Event + challenge happen on the same day' },
                { label: 'Separate Day (1d)', value: '1', description: 'Event gets its own day (break day)', default: true },
              ]
            }
          }
        ]
      };
    }

    case 'manage_event': {
      const eventType = round.swapRound ? 'Swap' : 'Merge';
      const eDays = round.eventDays ?? 1;
      let currentOption = '1';
      if (eDays === 0) currentOption = '0';
      else if (eDays > 1) currentOption = 'custom';

      const manageOptions = [
        { label: `Remove ${eventType}`, value: 'none', description: 'Remove this event from the round' },
        { label: 'Same Day as Challenge (0d)', value: '0', description: 'Event + challenge happen on the same day' },
        { label: 'Separate Day (1d)', value: '1', description: 'Event gets its own day (break day)' },
        { label: 'Multiple Days', value: 'custom', description: 'Enter custom days below' },
      ];
      const selectedManage = manageOptions.find(o => o.value === currentOption);
      if (selectedManage) selectedManage.default = true;

      return {
        custom_id: modalId,
        title: `Manage ${eventType} - F${f}`,
        components: [
          {
            type: 18,
            label: 'Event Duration',
            description: 'How this event fits into the round schedule',
            component: {
              type: 21, // Radio Group
              custom_id: 'event_duration',
              options: manageOptions
            }
          },
          {
            type: 18,
            label: 'Event Label',
            description: 'Display name for this event',
            component: {
              type: 4, custom_id: 'event_label', style: 1,
              placeholder: eventType,
              required: true, max_length: 20,
              value: round.eventLabel || eventType
            }
          }
        ]
      };
    }

    case 'ftc':
      return {
        custom_id: modalId,
        title: 'Manage Final Tribal Council',
        components: [
          {
            type: 18,
            label: 'FTC Players',
            description: "How many players in FTC — enter '2' for Final 2, '3' for Final 3",
            component: {
              type: 4, custom_id: 'ftc_players', style: 1,
              placeholder: '3',
              required: true, max_length: 2, min_length: 1,
              value: String(f)
            }
          },
          {
            type: 18,
            label: 'Notes',
            description: 'Optional notes (e.g., "live FTC", "pre-recorded")',
            component: {
              type: 4, custom_id: 'notes', style: 2,
              placeholder: 'Any special notes...',
              required: false, max_length: 200,
              ...(round.ftcNotes ? { value: round.ftcNotes } : {})
            }
          }
        ]
      };

    case 'ftc_speeches':
      return {
        custom_id: modalId,
        title: `Speech Writing - F${f}`,
        components: [
          {
            type: 18,
            label: 'Duration (days)',
            description: 'How many days for speech writing',
            component: {
              type: 4, custom_id: 'duration', style: 1,
              placeholder: '1',
              required: true, max_length: 1, min_length: 1,
              value: String(round.speechDays || 1)
            }
          },
          {
            type: 18,
            label: 'Notes',
            description: 'Optional notes for speech writing phase',
            component: {
              type: 4, custom_id: 'notes', style: 2,
              placeholder: 'Any special notes...',
              required: false, max_length: 200,
              ...(round.speechNotes ? { value: round.speechNotes } : {})
            }
          }
        ]
      };

    case 'ftc_votes':
      return {
        custom_id: modalId,
        title: `Questioning & Votes - F${f}`,
        components: [
          {
            type: 18,
            label: 'Duration (days)',
            description: 'How many days for Q&A and voting (0 if concurrent with speeches)',
            component: {
              type: 4, custom_id: 'duration', style: 1,
              placeholder: '1',
              required: true, max_length: 1, min_length: 1,
              value: String(round.votesDays || 1)
            }
          },
          {
            type: 18,
            label: 'Notes',
            description: 'Optional notes for Q&A/votes phase',
            component: {
              type: 4, custom_id: 'notes', style: 2,
              placeholder: 'Any special notes...',
              required: false, max_length: 200,
              ...(round.votesNotes ? { value: round.votesNotes } : {})
            }
          }
        ]
      };

    case 'swap_round':
      return {
        custom_id: modalId,
        title: `Swap F${f} Events`,
        components: [
          {
            type: 18,
            label: 'Swap with F-number',
            description: `Enter the F-number to swap all events with (e.g., ${f > 5 ? f - 3 : f + 3})`,
            component: {
              type: 4, custom_id: 'target_f', style: 1,
              placeholder: `F${f > 5 ? f - 3 : f + 3}`,
              required: true, max_length: 4, min_length: 1,
            }
          }
        ]
      };

    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// Round Edit Processing
// ─────────────────────────────────────────────

/**
 * Extract modal fields from Discord's component structure.
 * Handles both Label (type 18) and legacy ActionRow patterns.
 */
export function extractModalFields(components) {
  const fields = {};
  for (const comp of (components || [])) {
    if (comp.component && comp.component.custom_id) {
      // Label-wrapped component (type 18)
      fields[comp.component.custom_id] = comp.component.value;
    } else if (comp.components) {
      // Legacy ActionRow pattern
      for (const c of comp.components) {
        if (c.custom_id) fields[c.custom_id] = c.value;
      }
    }
  }
  return fields;
}

/**
 * Process a round edit modal submission and save changes.
 * @param {string} guildId
 * @param {string} action - edit_tribal, marooning, swap_merge, manage_event, ftc, ftc_speeches, ftc_votes
 * @param {string} roundId - e.g., "r3"
 * @param {string} configId - applicationConfigs key
 * @param {Object} fields - Extracted modal fields
 * @returns {{ success: boolean, error?: string }}
 */
export async function processRoundEdit(guildId, action, roundId, configId, fields) {
  const playerData = await loadPlayerData();
  const config = playerData[guildId]?.applicationConfigs?.[configId];
  if (!config) return { success: false, error: 'Season not found' };

  const seasonRounds = playerData[guildId]?.seasonRounds?.[config.seasonId];
  if (!seasonRounds) return { success: false, error: 'No planner data found' };

  const round = seasonRounds[roundId];
  if (!round) return { success: false, error: `Round ${roundId} not found` };

  switch (action) {
    case 'edit_tribal': {
      const elims = parseInt(fields.eliminations);
      if (isNaN(elims) || elims < 0) return { success: false, error: 'Eliminations must be ≥ 0' };
      round.eliminations = elims;

      const duration = fields.tribal_duration;
      const customDays = fields.custom_days?.trim() ? parseInt(fields.custom_days) : null;

      if (duration === 'custom' || customDays != null) {
        // Custom days field takes priority — accepts 0, 1, 2+ as shortcuts
        const days = customDays ?? 2;
        round.tribalDays = (!isNaN(days) && days >= 0) ? days : 1;
      } else {
        round.tribalDays = parseInt(duration) || 0;
      }
      break;
    }

    case 'marooning': {
      const duration = fields.event_duration;
      const customDays = fields.custom_days?.trim() ? parseInt(fields.custom_days) : null;

      if (duration === 'none') {
        round.hasMarooning = false;
        round.marooningDays = 0;
      } else if (duration === 'custom' || customDays != null) {
        // Custom days field takes priority — accepts 0, 1, 2+ as shortcuts
        const days = customDays ?? 2;
        if (isNaN(days) || days < 0) return { success: false, error: 'Days must be 0 or more' };
        round.hasMarooning = days > 0 || duration !== 'none';
        round.marooningDays = days;
      } else {
        round.hasMarooning = true;
        round.marooningDays = parseInt(duration) || 0;
      }
      const exiled = parseInt(fields.exiled_players);
      if (!isNaN(exiled) && exiled >= 0) round.exiledPlayers = exiled;
      break;
    }

    case 'swap_merge': {
      const eventType = fields.event_type;
      if (!eventType || !['swap', 'merge'].includes(eventType)) {
        return { success: false, error: 'Must select Swap or Merge' };
      }
      round.swapRound = (eventType === 'swap');
      round.mergeRound = (eventType === 'merge');
      round.eventLabel = fields.event_label || (eventType === 'swap' ? 'Swap' : 'Merge');
      round.eventDays = parseInt(fields.event_duration) || 0;
      break;
    }

    case 'manage_event': {
      const duration = fields.event_duration;
      if (duration === 'none') {
        round.swapRound = false;
        round.mergeRound = false;
        round.eventLabel = '';
        round.eventDays = 0;
        console.log(`📝 Season Planner: Removed event from ${roundId} (F${round.fNumber})`);
      } else {
        round.eventLabel = fields.event_label || '';
        round.eventDays = parseInt(duration) || 0;
      }
      break;
    }

    case 'ftc': {
      const ftcPlayers = parseInt(fields.ftc_players);
      if (isNaN(ftcPlayers) || ftcPlayers < 1) return { success: false, error: 'FTC players must be > 0' };
      // Clear FTC flag from all rounds, set on the correct one
      for (const r of Object.values(seasonRounds)) {
        if (r.ftcRound) r.ftcRound = false;
      }
      // Find the round with matching fNumber
      const targetRound = Object.values(seasonRounds).find(r => r.fNumber === ftcPlayers);
      if (targetRound) {
        targetRound.ftcRound = true;
        targetRound.ftcNotes = fields.notes || '';
      } else {
        return { success: false, error: `No round found for F${ftcPlayers}` };
      }
      break;
    }

    case 'ftc_speeches': {
      const days = parseInt(fields.duration);
      if (isNaN(days) || days < 0) return { success: false, error: 'Duration must be ≥ 0' };
      round.speechDays = days;
      round.speechNotes = fields.notes || '';
      break;
    }

    case 'ftc_votes': {
      const days = parseInt(fields.duration);
      if (isNaN(days) || days < 0) return { success: false, error: 'Duration must be ≥ 0' };
      round.votesDays = days;
      round.votesNotes = fields.notes || '';
      break;
    }

    case 'swap_round': {
      // Accept formats: 13, F13, f13, F-13, f-13
      const cleanedInput = String(fields.target_f).replace(/^[Ff]-?/, '');
      const targetF = parseInt(cleanedInput);
      if (isNaN(targetF) || targetF < 1) return { success: false, error: 'Enter a valid F-number (e.g., 13 or F13)' };
      if (targetF === round.fNumber) return { success: false, error: 'Cannot swap a round with itself' };

      // Find the target round by F-number
      const targetEntry = Object.entries(seasonRounds).find(([_, r]) => r.fNumber === targetF);
      if (!targetEntry) return { success: false, error: `No round found for F${targetF}` };
      const targetRound = targetEntry[1];

      // Swap all event data — keep fNumber and seasonRoundNo fixed
      const swapFields = [
        'hasMarooning', 'marooningDays', 'eventDays', 'tribalDays',
        'swapRound', 'mergeRound', 'eventLabel', 'ftcRound',
        'eliminations', 'exiledPlayers', 'challengeIDs', 'tribalCouncilIDs',
        'challengeName', 'host', 'juryStart',
        'tribalNotes', 'ftcNotes', 'speechDays', 'votesDays', 'speechNotes', 'votesNotes'
      ];
      for (const field of swapFields) {
        const temp = round[field];
        round[field] = targetRound[field];
        targetRound[field] = temp;
      }

      console.log(`↔️ Season Planner: Swapped F${round.fNumber} ↔ F${targetF} events`);
      break;
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }

  await savePlayerData(playerData);
  console.log(`📝 Season Planner: ${action} updated for ${roundId} (F${round.fNumber})`);
  return { success: true };
}
