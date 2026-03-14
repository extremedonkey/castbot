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
export function getMergeFNumber(totalPlayers) {
  const target = Math.round(totalPlayers * 0.58);
  return Math.max(10, Math.min(12, target));
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
  const mergeFNumber = getMergeFNumber(totalPlayers);

  let roundNo = 1;

  // Playable rounds: F{totalPlayers} down to F{ftcPlayers}
  for (let f = totalPlayers; f >= ftcPlayers; f--) {
    rounds[`r${roundNo}`] = {
      seasonRoundNo: roundNo,
      fNumber: f,
      exiledPlayers: 0,
      marooningDays: (roundNo === 1) ? 1 : 0,
      challengeIDs: {},
      tribalCouncilIDs: {},
      ftcRound: (f === ftcPlayers),
      swapRound: swapFNumbers.includes(f),
      mergeRound: (f === mergeFNumber),
      juryStart: false
    };
    roundNo++;
  }

  // F1 Reunion
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
  if (round.fNumber === 1) return 1;                        // Reunion
  if (round.ftcRound) return 2;                             // FTC: speeches + votes
  if (round.marooningDays > 0) return 3;                    // Marooning round
  if (round.swapRound || round.mergeRound) return 3;        // Event round
  return 2;                                                 // Standard
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

    if (round.fNumber === 1) {
      // Reunion: single day
      roundDates.event = formatDate(roundStart);
    } else if (round.ftcRound) {
      // FTC: speeches day 0, votes day 1
      roundDates.speeches = formatDate(roundStart);
      const votesDate = new Date(roundStart);
      votesDate.setDate(votesDate.getDate() + 1);
      roundDates.votes = formatDate(votesDate);
    } else if (round.marooningDays > 0) {
      // Marooning: event day 0, challenge day 1, tribal day 2
      roundDates.event = formatDate(roundStart);
      const challengeDate = new Date(roundStart);
      challengeDate.setDate(challengeDate.getDate() + 1);
      roundDates.challenge = formatDate(challengeDate);
      const tribalDate = new Date(roundStart);
      tribalDate.setDate(tribalDate.getDate() + 2);
      roundDates.tribal = formatDate(tribalDate);
    } else if (round.swapRound || round.mergeRound) {
      // Event round: event day 0, challenge day 1, tribal day 2
      roundDates.event = formatDate(roundStart);
      const challengeDate = new Date(roundStart);
      challengeDate.setDate(challengeDate.getDate() + 1);
      roundDates.challenge = formatDate(challengeDate);
      const tribalDate = new Date(roundStart);
      tribalDate.setDate(tribalDate.getDate() + 2);
      roundDates.tribal = formatDate(tribalDate);
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
  // Format start date for pre-fill: Unix timestamp → mm/dd/yyyy
  let startDateValue = null;
  if (existing?.estimatedStartDate) {
    const d = new Date(existing.estimatedStartDate);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    startDateValue = `${mm}/${dd}/${d.getFullYear()}`;
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

const SELECTS_PER_PAGE = 12;

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
    { type: 2, custom_id: 'reeces_season_planner_mockup', label: "← Season Planner", style: 2 },
    { type: 2, custom_id: `planner_page_${page - 1}_${configId}`, label: '◀ Previous', style: 2, disabled: page === 0 },
    { type: 2, custom_id: `planner_page_${page + 1}_${configId}`, label: 'Next ▶', style: 2, disabled: page >= totalPages - 1 },
  ];

  const container = {
    type: 17, accent_color: 0x9b59b6,
    components: [
      { type: 10, content: `## 📝 Season Planner | ${seasonName}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `planner_edit_${configId}`, label: 'Edit', style: 2, emoji: { name: '✏️' } },
        { type: 2, custom_id: `planner_schedule_${configId}`, label: 'Schedule', style: 2, emoji: { name: '📅' } },
        { type: 2, custom_id: `planner_apps_${configId}`, label: 'Apps', style: 2, emoji: { name: '📝' } },
        { type: 2, custom_id: `planner_ranking_${configId}`, label: 'Ranking', style: 2, emoji: { name: '🏆' } },
        { type: 2, custom_id: `planner_tribes_${configId}`, label: 'Tribes', style: 2, emoji: { name: '🔥' } },
      ]},
      ...selectRows,
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
    // Reunion
    return [
      { label: `F1 ${DOT} ${dates.event} ${DOT} Reunion`, value: 'summary', default: true, emoji: { name: '🎉' } },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
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

  const challengeName = `Challenge ${round.seasonRoundNo} (TBC)`;
  const host = 'TBC';

  if (round.marooningDays > 0) {
    // Marooning round
    const label = `F${f} ${DOT} ${dates.event} ${DOT} Marooning ${DOT} ${challengeName}`;
    return [
      { label, value: 'summary', default: true, emoji: { name: '🏝️' } },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' }, description: dates.event },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
      { label: `Edit F${f} Tribal (1 elim)`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
    ];
  }

  if (round.swapRound || round.mergeRound) {
    // Event round (swap or merge)
    const eventLabel = round.swapRound ? 'Swap' : 'Merge';
    const eventEmoji = '🔀';
    const label = `F${f} ${DOT} ${dates.event} ${DOT} ${eventLabel} ${DOT} ${challengeName}`;
    return [
      { label, value: 'summary', default: true, emoji: { name: eventEmoji } },
      { label: `Manage ${eventLabel}`, value: 'manage_event', emoji: { name: '🔀' }, description: dates.event },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${dates.challenge} ${DOT} ${host}` },
      { label: `Edit F${f} Tribal (1 elim)`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
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
    { label: `Edit F${f} Tribal (1 elim)`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${dates.tribal} ${DOT} ${host}` },
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

  // Add "Create New" option
  options.push({
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
        { type: 2, custom_id: 'reeces_stuff', label: "← Reece's Stuff", style: 2 }
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
