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

const TOTAL_ROUNDS = 24;
const DOT = '\u2981'; // ⦁
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Generate 24 rounds starting Sat 7 Mar, +2 days each, F24 down to F1
const ALL_ROUNDS = Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
  const roundNum = i + 1;
  const finalists = TOTAL_ROUNDS + 1 - roundNum; // F24, F23, ... F1
  const date = new Date(2026, 2, 7 + (i * 2)); // 7 Mar 2026 + 2 days per round
  const dateStr = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;

  // Round summary label (shown as pre-selected default)
  let roundLabel;
  if (roundNum === 1) {
    roundLabel = `F${finalists} ${DOT} ${dateStr} ${DOT} Marooning ${DOT} Challenge 1`;
  } else if (roundNum === 23) {
    roundLabel = `F${finalists} (FTC) ${DOT} ${dateStr} ${DOT} Final Tribal Council`;
  } else if (roundNum === 24) {
    roundLabel = `F${finalists} ${DOT} ${dateStr} ${DOT} Reunion`;
  } else {
    roundLabel = `F${finalists} ${DOT} ${dateStr} ${DOT} Challenge ${roundNum} (TBC)`;
  }

  // Contextual dates: challenge = round date +2, tribal = round date +3
  const challengeDate = new Date(2026, 2, 7 + (i * 2) + 2);
  const tribalDate = new Date(2026, 2, 7 + (i * 2) + 3);
  const challengeDateStr = `${DAYS[challengeDate.getDay()]} ${challengeDate.getDate()} ${MONTHS[challengeDate.getMonth()]}`;
  const tribalDateStr = `${DAYS[tribalDate.getDay()]} ${tribalDate.getDate()} ${MONTHS[tribalDate.getMonth()]}`;

  // Mockup options — first is default-selected, rest are no-op actions
  const options = [
    { label: roundLabel, value: 'summary', default: true },
    { label: `${challengeDateStr} | Edit Challenge ${roundNum} (TBC)`, value: 'edit_challenge', emoji: { name: '🤸' }, description: 'Reece' },
    { label: `${tribalDateStr} | Edit F${finalists} Tribal (1 elim)`, value: 'edit_tribal', emoji: { name: '🔥' } },
    { label: '───────────────────', value: 'divider', description: ' ' },
    { label: 'Manage Marooning & Exile', value: 'marooning', emoji: { name: '🏝️' } },
    { label: 'Add Swap / Merge', value: 'swap_merge', emoji: { name: '🔀' } },
  ];

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
        { type: 2, custom_id: 'stress_applications', label: 'Applications', style: 2, emoji: { name: '📝' } },
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
