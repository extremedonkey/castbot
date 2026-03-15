/**
 * Season Planner — round generation, swap/merge placement, and planner UI
 *
 * Parallel build: does NOT touch existing Season Apps flow.
 * Entry point: reeces_season_planner_mockup button in Reece's Stuff.
 * Spec: docs/01-RaP/0947_20260315_SeasonPlanner_Analysis.md
 */

import { countComponents, validateComponentLimit } from './utils.js';
import { loadPlayerData, savePlayerData } from './storage.js';

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
  if (hasMarooning) return (round.marooningDays ?? 1) + 2;                    // Marooning(0-N) + challenge + tribal
  if (round.swapRound || round.mergeRound) return (round.eventDays ?? 1) + 2; // Event(0-1) + challenge + tribal
  return 2;                                                                   // Standard: challenge + tribal
}

/**
 * Calculate dates for all rounds from a start date.
 * @param {Object} rounds - seasonRounds object
 * @param {Date} startDate - Season start date
 * @returns {Object} Map of roundId → { startDay, dates: { event?, challenge?, tribal? } }
 */
export function calculateRoundDates(rounds, startDate) {
  const roundIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const dates = {};
  let currentDay = 0; // offset from startDate

  for (const id of roundIds) {
    const round = rounds[id];
    const duration = getRoundDuration(round);
    const roundStart = new Date(startDate);
    roundStart.setDate(roundStart.getDate() + currentDay);

    const roundDates = { startOffset: currentDay };

    const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
    const mDays = round.marooningDays ?? 1;
    const eDays = round.eventDays ?? 1;

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
      if (mDays === 0) {
        // Marooning + challenge same day, tribal next day
        roundDates.event = formatDate(roundStart); // combined
        roundDates.challenge = formatDate(roundStart); // same date
        const tribalDate = new Date(roundStart);
        tribalDate.setDate(tribalDate.getDate() + 1);
        roundDates.tribal = formatDate(tribalDate);
      } else {
        // Marooning day 0, challenge day mDays, tribal day mDays+1
        roundDates.event = formatDate(roundStart);
        const challengeDate = new Date(roundStart);
        challengeDate.setDate(challengeDate.getDate() + mDays);
        roundDates.challenge = formatDate(challengeDate);
        const tribalDate = new Date(roundStart);
        tribalDate.setDate(tribalDate.getDate() + mDays + 1);
        roundDates.tribal = formatDate(tribalDate);
      }
    } else if (round.swapRound || round.mergeRound) {
      if (eDays === 0) {
        // Event + challenge same day, tribal next day
        roundDates.event = formatDate(roundStart);
        roundDates.challenge = formatDate(roundStart); // same date
        const tribalDate = new Date(roundStart);
        tribalDate.setDate(tribalDate.getDate() + 1);
        roundDates.tribal = formatDate(tribalDate);
      } else {
        // Event day 0, challenge day eDays, tribal day eDays+1
        roundDates.event = formatDate(roundStart);
        const challengeDate = new Date(roundStart);
        challengeDate.setDate(challengeDate.getDate() + eDays);
        roundDates.challenge = formatDate(challengeDate);
        const tribalDate = new Date(roundStart);
        tribalDate.setDate(tribalDate.getDate() + eDays + 1);
        roundDates.tribal = formatDate(tribalDate);
      }
    } else {
      // Standard: challenge day 0, tribal day 1
      roundDates.challenge = formatDate(roundStart);
      const tribalDate = new Date(roundStart);
      tribalDate.setDate(tribalDate.getDate() + 1);
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
export function buildSeasonPlannerModal(existing = null) {
  // Format start date for pre-fill: Unix timestamp → mm/dd/yyyy, or today for create mode
  let startDateValue = null;
  if (existing?.estimatedStartDate) {
    const d = new Date(existing.estimatedStartDate);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    startDateValue = `${mm}/${dd}/${d.getFullYear()}`;
  } else if (!existing?.configId) {
    // Create mode: default to today
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    startDateValue = `${mm}/${dd}/${now.getFullYear()}`;
  }

  return {
    custom_id: existing?.configId ? `planner_setup_modal:${existing.configId}` : 'planner_create_modal',
    title: existing?.configId ? 'Edit Season' : 'Create New Season',
    components: [
      {
        type: 18,
        label: 'Season Name',
        component: {
          type: 4, custom_id: 'season_name', style: 1,
          placeholder: 'e.g., "Season 12 - Jurassic Park"',
          required: true, max_length: 100,
          ...(existing?.seasonName ? { value: existing.seasonName } : {})
        }
      },
      {
        type: 18,
        label: 'Estimated Number of Players',
        description: 'Enter your total estimated players you will cast',
        component: {
          type: 4, custom_id: 'est_players', style: 1,
          placeholder: '18',
          required: true, max_length: 2, min_length: 1,
          ...(existing?.estimatedTotalPlayers ? { value: String(existing.estimatedTotalPlayers) } : {})
        }
      },
      {
        type: 18,
        label: 'Estimated Number of Swaps',
        description: 'Enter number of swaps you have planned, no need to include merge',
        component: {
          type: 4, custom_id: 'est_swaps', style: 1,
          placeholder: '2',
          required: true, max_length: 1, min_length: 1,
          ...(existing?.estimatedSwaps != null ? { value: String(existing.estimatedSwaps) } : {})
        }
      },
      {
        type: 18,
        label: 'Estimated # FTC Players',
        description: "Enter '2' for Final 2, '3' for final 3 — used to pre-populate data",
        component: {
          type: 4, custom_id: 'est_ftc', style: 1,
          placeholder: '3',
          required: true, max_length: 1, min_length: 1,
          ...(existing?.estimatedFTCPlayers ? { value: String(existing.estimatedFTCPlayers) } : {})
        }
      },
      {
        type: 18,
        label: 'Estimated Start Date',
        description: 'Enter in mm/dd/yyyy',
        component: {
          type: 4, custom_id: 'est_start_date', style: 1,
          placeholder: '03/07/2026',
          required: true,
          ...(startDateValue ? { value: startDateValue } : {})
        }
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
  const players = parseInt(fields.est_players);
  const swaps = parseInt(fields.est_swaps);
  const ftc = parseInt(fields.est_ftc);
  const startDate = parseStartDate(fields.est_start_date);

  if (!fields.season_name?.trim()) errors.push('Season name is required');
  if (isNaN(players) || players < 1) errors.push('Players must be a number > 0');
  if (isNaN(swaps) || swaps < 0) errors.push('Swaps must be a number ≥ 0');
  if (isNaN(ftc) || ftc < 1) errors.push('FTC players must be a number > 0');
  if (!startDate) errors.push('Start date must be in mm/dd/yyyy format');
  if (!isNaN(players) && !isNaN(ftc) && ftc >= players) errors.push('FTC players must be less than total players');

  return {
    valid: errors.length === 0,
    errors,
    data: {
      seasonName: fields.season_name?.trim(),
      estimatedTotalPlayers: players,
      estimatedSwaps: swaps,
      estimatedFTCPlayers: ftc,
      estimatedStartDate: startDate ? startDate.getTime() : null,
    }
  };
}

// ─────────────────────────────────────────────
// Season Planner View — Dynamic round display
// ─────────────────────────────────────────────

const SELECTS_PER_PAGE = 11;

/**
 * Build the Season Planner view for a real season.
 * @param {string} seasonName - Display name
 * @param {Object} rounds - seasonRounds object
 * @param {Date} startDate - Season start date
 * @param {string} configId - applicationConfigs key (for back navigation)
 * @param {number} page - 0-indexed page
 * @returns {Object} Components V2 response
 */
export function buildPlannerView(seasonName, rounds, startDate, configId, page = 0) {
  const roundIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const totalPages = Math.ceil(roundIds.length / SELECTS_PER_PAGE);
  if (page < 0 || page >= totalPages) page = 0;

  const dates = calculateRoundDates(rounds, startDate);
  const pageRoundIds = roundIds.slice(page * SELECTS_PER_PAGE, (page + 1) * SELECTS_PER_PAGE);

  const selectRows = pageRoundIds.map(id => {
    const round = rounds[id];
    const roundDates = dates[id];
    const options = buildRoundOptions(round, roundDates);

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

  const navButtons = [
    { type: 2, custom_id: 'reeces_season_planner_mockup', label: '← Seasons', style: 2 },
    { type: 2, custom_id: `planner_page_${page - 1}_${configId}`, label: '◀', style: 2, disabled: page === 0 },
    { type: 2, custom_id: `planner_page_${page + 1}_${configId}`, label: '▶', style: 2, disabled: page >= totalPages - 1 },
  ];

  const container = {
    type: 17, accent_color: 0x9b59b6,
    components: [
      { type: 10, content: `## 📝 Season Planner | ${seasonName}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `planner_edit_${configId}`, label: 'Edit', style: 2, emoji: { name: '✏️' } },
        { type: 2, custom_id: `planner_apps_${configId}`, label: 'Apps', style: 2, emoji: { name: '📝' } },
        { type: 2, custom_id: `season_app_ranking_${configId}`, label: 'Ranking', style: 2, emoji: { name: '🏆' } },
        { type: 2, custom_id: `planner_tribes_${configId}`, label: 'Tribes', style: 2, emoji: { name: '🔥' } },
      ]},
      ...selectRows,
      { type: 1, components: [
        { type: 2, custom_id: `planner_schedule_${configId}`, label: 'Schedule', style: 2, emoji: { name: '📋' } },
        { type: 2, custom_id: `planner_calendar_${configId}`, label: 'Calendar', style: 2, emoji: { name: '📅' } },
      ]},
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
function buildRoundOptions(round, dates) {
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

  const rawChallengeName = round.challengeName || `Challenge ${round.seasonRoundNo} (TBC)`;
  const challengeName = rawChallengeName.length > 50 ? rawChallengeName.substring(0, 47) + '...' : rawChallengeName;
  const host = round.host || 'TBC';
  const elims = round.eliminations ?? 1;
  const elimText = elims === 0 ? 'no elim' : elims === 1 ? '1 elim' : `${elims} elims`;

  const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
  if (hasMarooning) {
    // Marooning round
    const label = `F${f} ${DOT} ${dates.event} ${DOT} Marooning ${DOT} ${challengeName}`;
    return [
      { label, value: 'summary', default: true, emoji: { name: '🏝️' } },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' }, description: dates.event },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
      { label: `Edit F${f} Tribal (${elimText})`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
    ];
  }

  if (round.swapRound || round.mergeRound) {
    // Event round (swap or merge)
    const eventLabel = round.eventLabel || (round.swapRound ? 'Swap' : 'Merge');
    const eventEmoji = '🔀';
    const label = `F${f} ${DOT} ${dates.event} ${DOT} ${eventLabel} ${DOT} ${challengeName}`;
    return [
      { label, value: 'summary', default: true, emoji: { name: eventEmoji } },
      { label: `Manage ${eventLabel}`, value: 'manage_event', emoji: { name: '🔀' }, description: dates.event },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
      { label: `Edit F${f} Tribal (${elimText})`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
    ];
  }

  // Standard round
  const label = `F${f} ${DOT} ${dates.challenge} ${DOT} ${challengeName}`;
  return [
    { label, value: 'summary', default: true, emoji: { name: '▫️' } },
    { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
    { label: `Edit F${f} Tribal (${elimText})`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
    { label: '───────────────────', value: 'divider', description: ' ' },
    { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
    { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
    { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
  ];
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
  const playerData = await loadPlayerData();
  const configs = playerData[guildId]?.applicationConfigs || {};

  const options = [];

  // Add existing seasons
  for (const [configId, config] of Object.entries(configs)) {
    if (!config.seasonName) continue;
    const hasPlanner = !!playerData[guildId]?.seasonRounds?.[config.seasonId];
    const label = config.seasonName.substring(0, 100);
    const desc = hasPlanner ? '📅 Planner configured' : '⚠️ Needs setup';
    options.push({
      label, value: configId,
      description: desc,
      emoji: { name: hasPlanner ? '📅' : '⚠️' }
    });
  }

  // Add "Create New" at the top
  options.unshift({
    label: 'Create New Season',
    value: 'planner_create_new',
    description: 'Start planning a new season from scratch',
    emoji: { name: '➕' }
  });

  // Cap at 25 (Discord limit)
  if (options.length > 25) options.length = 25;

  const container = {
    type: 17, accent_color: 0x9b59b6,
    components: [
      { type: 10, content: '## 📝 Season Planner\n-# Select a season to plan or create a new one' },
      { type: 14 },
      { type: 1, components: [{
        type: 3,
        custom_id: 'planner_select_season',
        placeholder: 'Select a season...',
        options
      }]},
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 }
      ]}
    ]
  };

  return { components: [container] };
}

// ─────────────────────────────────────────────
// Data Persistence
// ─────────────────────────────────────────────

/**
 * Create a new season with planner data and generate rounds.
 * @param {string} guildId
 * @param {string} userId
 * @param {Object} data - Validated planner fields
 * @returns {{ configId: string, seasonId: string }}
 */
export async function createPlannerSeason(guildId, userId, data) {
  const { default: crypto } = await import('crypto');
  const playerData = await loadPlayerData();

  if (!playerData[guildId]) {
    playerData[guildId] = { players: {}, tribes: {}, timezones: {}, pronounRoleIDs: [] };
  }
  if (!playerData[guildId].applicationConfigs) {
    playerData[guildId].applicationConfigs = {};
  }
  if (!playerData[guildId].seasonRounds) {
    playerData[guildId].seasonRounds = {};
  }

  const seasonId = `season_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
  const configId = `config_${Date.now()}_${userId}`;

  // Create applicationConfigs entry (compatible with existing flow)
  let buttonText = `Apply to ${data.seasonName}`;
  if (buttonText.length > 80) {
    buttonText = `Apply to ${data.seasonName.substring(0, 68)}..`;
  }

  playerData[guildId].applicationConfigs[configId] = {
    buttonText,
    explanatoryText: '',
    completionDescription: 'Thank you for completing your application! A host will review it soon.',
    completionImage: null,
    channelFormat: '📝%name%-app',
    targetChannelId: null,
    categoryId: null,
    buttonStyle: 'Primary',
    createdBy: userId,
    stage: 'planning',
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    seasonId,
    seasonName: data.seasonName,
    questions: [],
    // New planner fields
    estimatedStartDate: data.estimatedStartDate,
    estimatedTotalPlayers: data.estimatedTotalPlayers,
    estimatedSwaps: data.estimatedSwaps,
    estimatedFTCPlayers: data.estimatedFTCPlayers,
    currentSeasonRoundID: 1,
  };

  // Generate rounds
  const rounds = generateSeasonRounds(data.estimatedTotalPlayers, data.estimatedSwaps, data.estimatedFTCPlayers);
  playerData[guildId].seasonRounds[seasonId] = rounds;

  await savePlayerData(playerData);
  console.log(`✅ Season Planner: Created "${data.seasonName}" (${configId}) with ${Object.keys(rounds).length} rounds`);

  return { configId, seasonId };
}

/**
 * Set up planner data for an existing season that doesn't have it yet.
 * @param {string} guildId
 * @param {string} configId - Existing applicationConfigs key
 * @param {Object} data - Validated planner fields
 * @returns {{ seasonId: string }}
 */
export async function setupPlannerForExistingSeason(guildId, configId, data) {
  const playerData = await loadPlayerData();
  const config = playerData[guildId]?.applicationConfigs?.[configId];
  if (!config) throw new Error(`Config ${configId} not found`);

  if (!playerData[guildId].seasonRounds) {
    playerData[guildId].seasonRounds = {};
  }

  // Update config with planner fields
  config.seasonName = data.seasonName;
  config.estimatedStartDate = data.estimatedStartDate;
  config.estimatedTotalPlayers = data.estimatedTotalPlayers;
  config.estimatedSwaps = data.estimatedSwaps;
  config.estimatedFTCPlayers = data.estimatedFTCPlayers;
  config.currentSeasonRoundID = config.currentSeasonRoundID || 1;
  config.lastUpdated = Date.now();

  // Generate rounds
  const rounds = generateSeasonRounds(data.estimatedTotalPlayers, data.estimatedSwaps, data.estimatedFTCPlayers);
  playerData[guildId].seasonRounds[config.seasonId] = rounds;

  await savePlayerData(playerData);
  console.log(`✅ Season Planner: Set up "${data.seasonName}" (${configId}) with ${Object.keys(rounds).length} rounds`);

  return { seasonId: config.seasonId };
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
    case 'edit_tribal':
      return {
        custom_id: modalId,
        title: `Edit F${f} Tribal Council`,
        components: [
          {
            type: 18,
            label: 'Eliminations',
            description: 'How many players are eliminated this round (0 = no elimination)',
            component: {
              type: 4, custom_id: 'eliminations', style: 1,
              placeholder: '1',
              required: true, max_length: 1, min_length: 1,
              value: String(round.eliminations || 1)
            }
          },
          {
            type: 18,
            label: 'Notes',
            description: 'Optional notes for this tribal (e.g., "double tribal", "rock draw")',
            component: {
              type: 4, custom_id: 'notes', style: 2,
              placeholder: 'Any special notes...',
              required: false, max_length: 200,
              ...(round.tribalNotes ? { value: round.tribalNotes } : {})
            }
          }
        ]
      };

    case 'marooning': {
      const hasMar = round.hasMarooning ?? (round.marooningDays > 0);
      const mDays = round.marooningDays ?? 1;
      let currentOption = 'none';
      if (hasMar && mDays === 0) currentOption = '0';
      else if (hasMar && mDays === 1) currentOption = '1';
      else if (hasMar && mDays > 1) currentOption = 'custom';

      return {
        custom_id: modalId,
        title: `Manage Marooning — F${f}`,
        components: [
          {
            type: 18,
            label: 'Marooning Duration',
            description: 'How this event fits into the round schedule',
            component: {
              type: 21, // Radio Group
              custom_id: 'event_duration',
              required: true,
              options: [
                { label: 'No Marooning', value: 'none', description: 'Remove marooning from this round', default: currentOption === 'none' },
                { label: 'Same Day as Challenge (0d)', value: '0', description: 'Marooning + challenge happen on the same day', default: currentOption === '0' },
                { label: 'Separate Day (1d)', value: '1', description: 'Marooning gets its own full day', default: currentOption === '1' },
                { label: 'Multiple Days', value: 'custom', description: 'Enter custom days below', default: currentOption === 'custom' },
              ]
            }
          },
          {
            type: 18,
            label: 'Custom Days (only if Multiple Days selected above)',
            description: 'How many days the marooning event spans (e.g., 2 for a 2-day marooning)',
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
              required: true, max_length: 2, min_length: 1,
              value: String(round.exiledPlayers)
            }
          }
        ]
      };
    }

    case 'swap_merge': {
      return {
        custom_id: modalId,
        title: `Add Event — F${f}`,
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
              required: true,
              options: [
                { label: 'Same Day as Challenge (0d)', value: '0', description: 'Event + challenge happen on the same day' },
                { label: 'Separate Day (1d)', value: '1', description: 'Event gets its own day (break day)', default: true },
                { label: 'Multiple Days', value: 'custom', description: 'Enter custom days below' },
              ]
            }
          },
          {
            type: 18,
            label: 'Custom Days (only if Multiple Days selected above)',
            description: 'How many days the event spans (e.g., 2 for a 2-day swap)',
            component: {
              type: 4, custom_id: 'custom_days', style: 1,
              placeholder: '2',
              required: false, max_length: 1,
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

      return {
        custom_id: modalId,
        title: `Manage ${eventType} — F${f}`,
        components: [
          {
            type: 18,
            label: 'Event Duration',
            description: 'How this event fits into the round schedule',
            component: {
              type: 21, // Radio Group
              custom_id: 'event_duration',
              required: true,
              options: [
                { label: `Remove ${eventType}`, value: 'none', description: 'Remove this event from the round' },
                { label: 'Same Day as Challenge (0d)', value: '0', description: 'Event + challenge happen on the same day', default: currentOption === '0' },
                { label: 'Separate Day (1d)', value: '1', description: 'Event gets its own day (break day)', default: currentOption === '1' },
                { label: 'Multiple Days', value: 'custom', description: 'Enter custom days below', default: currentOption === 'custom' },
              ]
            }
          },
          {
            type: 18,
            label: 'Custom Days (only if Multiple Days selected above)',
            description: 'How many days the event spans (e.g., 2 for a 2-day event)',
            component: {
              type: 4, custom_id: 'custom_days', style: 1,
              placeholder: '2',
              required: false, max_length: 1,
              ...(eDays > 1 ? { value: String(eDays) } : {})
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
              required: true, max_length: 1, min_length: 1,
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
        title: `Speech Writing — F${f}`,
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
        title: `Questioning & Votes — F${f}`,
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
      round.tribalNotes = fields.notes || '';
      break;
    }

    case 'marooning': {
      const duration = fields.event_duration;
      const exiled = parseInt(fields.exiled_players);
      if (isNaN(exiled) || exiled < 0) return { success: false, error: 'Exiled players must be ≥ 0' };
      if (duration === 'none') {
        round.hasMarooning = false;
        round.marooningDays = 0;
      } else if (duration === 'custom') {
        const customDays = parseInt(fields.custom_days);
        if (isNaN(customDays) || customDays < 2) return { success: false, error: 'Custom days must be ≥ 2' };
        round.hasMarooning = true;
        round.marooningDays = customDays;
      } else {
        round.hasMarooning = true;
        round.marooningDays = parseInt(duration) || 0;
      }
      round.exiledPlayers = exiled;
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

      const duration = fields.event_duration;
      if (duration === 'custom') {
        const customDays = parseInt(fields.custom_days);
        if (isNaN(customDays) || customDays < 2) return { success: false, error: 'Custom days must be ≥ 2' };
        round.eventDays = customDays;
      } else {
        round.eventDays = parseInt(duration) || 0;
      }
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
        if (duration === 'custom') {
          const customDays = parseInt(fields.custom_days);
          if (isNaN(customDays) || customDays < 2) return { success: false, error: 'Custom days must be ≥ 2' };
          round.eventDays = customDays;
        } else {
          round.eventDays = parseInt(duration) || 0;
        }
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

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }

  await savePlayerData(playerData);
  console.log(`📝 Season Planner: ${action} updated for ${roundId} (F${round.fNumber})`);
  return { success: true };
}
