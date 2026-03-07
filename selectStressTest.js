/**
 * Season Planner (Mockup) — UI/UX prototype built directly in Discord
 *
 * THIS IS A UI MOCKUP ONLY — not a real feature implementation.
 * All buttons and selects are no-ops with placeholder data.
 * See docs/ui/UIPrototyping.md for the prototyping approach.
 *
 * When productionizing: replace dummy data with real season/round data,
 * wire buttons to actual handlers, and move to a feature module.
 *
 * 24 total selects across 2 pages (12 per page).
 * Accessible via Reece's Stuff > Season Planner (Mockup) button.
 */

import { countComponents, validateComponentLimit } from './utils.js';

const TOTAL_ROUNDS = 20;
const DOT = '\u2981'; // ⦁
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Challenge names and hosts keyed by F-number
const CHALLENGE_NAMES = {
  20: 'Training Boot Camp/Olympics',
  19: 'Verbal Jigsaw',
  18: 'Forbidden Island',
  17: 'Ancient Greek Guess Who',
  16: 'Worthy Sacrifice',
  15: 'Get on Da Ship',
  14: 'Tycoons',
  13: 'Stacking Challenge',
  12: 'Tic Tac Trivia',
  11: 'Oracle of Delphi',
  10: 'Pairs Challenge',
  9:  'Democracy',
  8:  'Folklore',
  7:  "Ren's Social Challenge",
  6:  'Anonymous Boat Battle',
  5:  'Pick Your Poison',
  4:  'Fallen Comrades',
  3:  'Trivia Murder Party',
};

const CHALLENGE_HOSTS = {
  20: 'Kayl',     19: 'Britt',          18: 'Kayl',
  17: 'Kayl',     16: 'Wain',           15: 'Anthony',
  14: 'Reece',    13: 'Cat',            12: 'Mike',
  11: 'Kayl',     10: 'Mike/Anthony',   9:  'Kayl',
  8:  'Mike/Anthony', 7: 'Ren',         6:  'Britt',
  5:  'Anthony',  4:  'Anthony',        3:  'Cat',
};

// Swap/Merge events keyed by roundNum (roundNum = TOTAL_ROUNDS + 1 - finalists)
// Each adds 1 extra day to the round (event day + challenge + tribal = 3 days)
const ROUND_EVENTS = {
  5:  { type: 'swap',  label: 'Swap 1', emoji: '🔀' },  // F16
  8:  { type: 'swap',  label: 'Swap 2', emoji: '🔀' },  // F13
  10: { type: 'merge', label: 'Merge',  emoji: '🔀' },  // F11
};

// Live tribals: challenge + tribal happen on the same day (1-day round)
// F9 (round 12): Democracy was a live tribal — challenge and vote in same 24hr period
const LIVE_TRIBALS = {
  12: true,  // F9
};

// Round durations: marooning & event rounds = 3 days, reunion = 1, live tribal = 1, standard = 2
function getRoundDuration(roundNum) {
  if (roundNum === 1) return 3;  // marooning + challenge + tribal
  if (roundNum === TOTAL_ROUNDS) return 1;  // reunion only
  if (LIVE_TRIBALS[roundNum]) return 1;  // challenge + tribal same day
  if (ROUND_EVENTS[roundNum]) return 3;  // event + challenge + tribal
  return 2;  // challenge + tribal
}

// Cumulative date calculation — accounts for variable round durations
const SEASON_START = 7; // Day of month
const SEASON_MONTH = 1; // 0-indexed: 1 = February

function calcRoundStart(roundIndex) {
  let day = SEASON_START;
  for (let i = 0; i < roundIndex; i++) {
    day += getRoundDuration(i + 1);
  }
  return day;
}

const fmtDate = (dayOffset) => {
  const d = new Date(2026, SEASON_MONTH, dayOffset);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const ALL_ROUNDS = Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
  const roundNum = i + 1;
  const finalists = TOTAL_ROUNDS + 1 - roundNum; // F24, F23, ... F1
  const startDay = calcRoundStart(i);
  const dateStr = fmtDate(startDay);

  const event = ROUND_EVENTS[roundNum];
  const hasEvent = !!event;
  const challengeName = CHALLENGE_NAMES[finalists] || `Challenge ${roundNum} (TBC)`;
  const host = CHALLENGE_HOSTS[finalists] || 'TBC';

  // Round summary label (shown as pre-selected default)
  // If round has an event (marooning/swap/merge), include it in the summary
  let roundLabel;
  if (roundNum === 1) {
    roundLabel = `F${finalists} ${DOT} ${dateStr} ${DOT} Marooning ${DOT} ${challengeName}`;
  } else if (roundNum === TOTAL_ROUNDS - 1) {
    roundLabel = `F${finalists} (FTC) ${DOT} ${dateStr} ${DOT} Final Tribal Council`;
  } else if (roundNum === TOTAL_ROUNDS) {
    roundLabel = `F${finalists} ${DOT} ${dateStr} ${DOT} Reunion`;
  } else if (hasEvent) {
    roundLabel = `F${finalists} ${DOT} ${dateStr} ${DOT} ${event.label} ${DOT} ${challengeName}`;
  } else {
    roundLabel = `F${finalists} ${DOT} ${dateStr} ${DOT} ${challengeName}`;
  }

  // Date offsets within the round:
  // Marooning/event rounds (3 days): event day 0, challenge day 1, tribal day 2
  // Standard rounds (2 days): challenge day 0, tribal day 1
  // Live tribal rounds (1 day): challenge day 0, tribal day 0 (same day)
  const isLiveTribunal = LIVE_TRIBALS[roundNum];
  const hasExtraDay = roundNum === 1 || hasEvent;
  const challengeDateStr = hasExtraDay ? fmtDate(startDay + 1) : fmtDate(startDay);
  const tribalDateStr = isLiveTribunal ? fmtDate(startDay) : (hasExtraDay ? fmtDate(startDay + 2) : fmtDate(startDay + 1));

  // Option ordering rule:
  // If round has marooning or swap/merge configured → that event is 2nd (with date)
  // Otherwise → marooning and swap/merge stay below divider without dates
  const isFTC = roundNum === TOTAL_ROUNDS - 1;

  let options;
  if (roundNum === 1) {
    // Marooning round: marooning 2nd, structural actions below divider
    options = [
      { label: roundLabel, value: 'summary', default: true, emoji: { name: '🏝️' } },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' }, description: dateStr },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${challengeDateStr} ${DOT} ${host}` },
      { label: `Edit F${finalists} Tribal (1 elim)`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${tribalDateStr} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
    ];
  } else if (isFTC) {
    // FTC round: no challenge — speech writing + Q&A/votes replace challenge/tribal
    // Speech writing = day 0 (start), Q&A + Votes = day 1 (start + 1)
    options = [
      { label: roundLabel, value: 'summary', default: true, emoji: { name: '🔥' } },
      { label: 'Speech Writing', value: 'ftc_speeches', emoji: { name: '💬' }, description: fmtDate(startDay) },
      { label: 'Questioning / Votes', value: 'ftc_votes', emoji: { name: '🗳️' }, description: fmtDate(startDay + 1) },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
    ];
  } else if (hasEvent) {
    // Event round: swap/merge 2nd with date, structural actions below divider
    options = [
      { label: roundLabel, value: 'summary', default: true, emoji: { name: event.emoji } },
      { label: `Manage ${event.label}`, value: 'manage_event', emoji: { name: '🔀' }, description: dateStr },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${challengeDateStr} ${DOT} ${host}` },
      { label: `Edit F${finalists} Tribal (1 elim)`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${tribalDateStr} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
    ];
  } else {
    // Standard round: all structural actions below divider
    options = [
      { label: roundLabel, value: 'summary', default: true, emoji: { name: '▫️' } },
      { label: `Edit ${challengeName}`, value: 'edit_challenge', emoji: { name: '🤸' }, description: `${challengeDateStr} ${DOT} ${host}` },
      { label: `Edit F${finalists} Tribal (1 elim)`, value: 'edit_tribal', emoji: { name: '🔥' }, description: `${tribalDateStr} ${DOT} ${host}` },
      { label: '───────────────────', value: 'divider', description: ' ' },
      { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
      { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
      { label: 'Manage Final Tribal Council', value: 'ftc', emoji: { name: '⚖️' } },
    ];
  }

  return { id: `round_${roundNum}`, placeholder: roundLabel, options };
});

const SELECTS_PER_PAGE = 12;
const TOTAL_PAGES = Math.ceil(ALL_ROUNDS.length / SELECTS_PER_PAGE);

/**
 * Build a single page of the Season Planner
 * @param {number} page - 0-indexed page number
 * @returns {Object} Components V2 response
 */
export function buildSelectStressPage(page = 0) {
  if (page < 0 || page >= TOTAL_PAGES) page = 0;

  const startIndex = page * SELECTS_PER_PAGE;
  const pageRounds = ALL_ROUNDS.slice(startIndex, startIndex + SELECTS_PER_PAGE);

  const selectRows = pageRounds.map((round, i) => ({
    type: 1,
    components: [{
      type: 3,
      custom_id: `stress_select_${round.id}`,
      placeholder: `${startIndex + i + 1}. ${round.placeholder}`,
      options: round.options
    }]
  }));

  const navButtons = [
    { type: 2, custom_id: 'reeces_stuff', label: "← Reece's Stuff", style: 2 },
    { type: 2, custom_id: `stress_page_${page - 1}`, label: '◀ Previous', style: 2, disabled: page === 0 },
    { type: 2, custom_id: `stress_page_${page + 1}`, label: 'Next ▶', style: 2, disabled: page >= TOTAL_PAGES - 1 },
  ];

  const container = {
    type: 17, accent_color: 0x9b59b6,
    components: [
      { type: 10, content: `## 📝 Season Planner | S12: Sacred Band of Thebes` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'stress_edit_season', label: 'Edit', style: 2, emoji: { name: '✏️' } },
        { type: 2, custom_id: 'stress_schedule', label: 'Schedule', style: 2, emoji: { name: '📅' } },
        { type: 2, custom_id: 'stress_applications', label: 'Apps', style: 2, emoji: { name: '📝' } },
        { type: 2, custom_id: 'stress_cast_ranking', label: 'Ranking', style: 2, emoji: { name: '🏆' } },
        { type: 2, custom_id: 'stress_tribes', label: 'Tribes', style: 2, emoji: { name: '🔥' } },
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
 * Build the Edit Season modal (mockup)
 * Pre-filled with current prototype values
 */
export function buildEditSeasonModal() {
  return {
    type: 9, // MODAL
    data: {
    custom_id: 'stress_edit_season_modal',
    title: 'Edit Season',
    components: [
      {
        type: 18,
        label: 'Season Name',
        component: {
          type: 4, custom_id: 'season_name', style: 1,
          value: 'S12: Sacred Band of Thebes',
          required: true,
        }
      },
      {
        type: 18,
        label: 'Estimated Number of Players',
        description: 'Enter your total estimated players you will cast',
        component: {
          type: 4, custom_id: 'est_players', style: 1,
          placeholder: '18', value: '20',
          required: true, max_length: 2, min_length: 1,
        }
      },
      {
        type: 18,
        label: 'Estimated Number of Swaps',
        description: 'Enter number of swaps you have planned, no need to include merge',
        component: {
          type: 4, custom_id: 'est_swaps', style: 1,
          placeholder: '2', value: '2',
          required: true, max_length: 1, min_length: 1,
        }
      },
      {
        type: 18,
        label: 'Estimated # FTC Players',
        description: "Enter '2' for Final 2, '3' for final 3 - used to pre-populate data",
        component: {
          type: 4, custom_id: 'est_ftc', style: 1,
          placeholder: '3', value: '2',
          required: true, max_length: 1, min_length: 1,
        }
      },
      {
        type: 18,
        label: 'Estimated Start Date',
        description: 'Enter in mm/dd/yyyy',
        component: {
          type: 4, custom_id: 'est_start_date', style: 1,
          placeholder: '03/07/2026', value: '02/07/2026',
          required: true,
        }
      },
    ]
  }};
}

/**
 * Handle Edit Season modal submission (mockup — no data saved)
 * Returns a summary of what was submitted
 */
export function handleEditSeasonSubmit(fields) {
  const name = fields.season_name || 'Unknown';
  const players = fields.est_players || '?';
  const swaps = fields.est_swaps || '?';
  const ftc = fields.est_ftc || '?';
  const startDate = fields.est_start_date || '?';

  const errors = [];
  const playersNum = parseInt(players);
  const ftcNum = parseInt(ftc);
  if (isNaN(playersNum) || playersNum < 1) errors.push('Players must be a number > 0');
  if (isNaN(ftcNum) || ftcNum < 1) errors.push('FTC players must be a number > 0');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(startDate)) errors.push('Start date must be in mm/dd/yyyy format');

  const DOT = '\u2981';
  const container = {
    type: 17, accent_color: errors.length ? 0xe74c3c : 0x2ecc71,
    components: [
      { type: 10, content: errors.length
        ? `## ❌ Validation Errors\n${errors.map(e => `- ${e}`).join('\n')}`
        : `## ✅ Season Updated (Mockup)\n**${name}**\n${players} players ${DOT} ${swaps} swaps ${DOT} Final ${ftc} ${DOT} Starts ${startDate}\n\n-# This is a mockup — no data was saved.`
      },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'reeces_season_planner_mockup', label: '← Season Planner', style: 2 }
      ]}
    ]
  };

  return { components: [container] };
}
