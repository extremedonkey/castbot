/**
 * Season Round Schedule — THE single source of truth for Season Planner day arithmetic.
 *
 * Every consumer of round dates imports from here. Nothing in this file touches storage,
 * Discord, or sharp: it is pure, synchronous, and directly unit-testable
 * (tests/seasonRoundSchedule.test.js imports it for real rather than replicating it).
 *
 * Consumers:
 *   - seasonPlanner.js       → round string-select labels + option descriptions
 *   - scheduleImageGenerator.js → 📋 Schedule timeline + 📅 Calendar images
 *
 * WHY THIS FILE EXISTS: the duration/date logic used to be COPIED into
 * scheduleImageGenerator.js. The copies drifted — `getScheduleColumns` hard-coded the tribal
 * at "challenge + 1 day", so a live tribal (tribalDays: 0) showed same-day in the planner's
 * select and next-day in the Schedule image, and the calendar's fixed-length day lists
 * left blank cells for multi-day marooning. Add day logic HERE, never in a consumer.
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────────
 * Whole days only. No hours, no timezones. Rounds are strictly back-to-back.
 *
 *   1. getRoundType(round)      → which of 6 shapes this round is
 *   2. getRoundPhases(round)    → the named events inside it, at day OFFSETS from round start
 *   3. getRoundDuration(round)  → how many days the round consumes
 *   4. buildRoundSchedule(...)  → walks all rounds, accumulating offsets into real Dates
 *
 * `tribalDays` is an OFFSET FROM THE CHALLENGE DAY, not a length:
 *   0 → live tribal, same calendar day as the challenge (round is a day shorter)
 *   1 → default, the day after
 *   2+ → the tribal lands that many days after the challenge
 * `marooningDays` / `eventDays` use the same convention: 0 means "shares the challenge's
 * day", NOT "no event" (removal is a separate flag — hasMarooning / swapRound / mergeRound).
 *
 * Docs: docs/03-features/SeasonPlanner.md § The Day Logic
 */

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat 7 Mar" — the format used in round select labels and Schedule columns. */
export function formatRoundDate(date) {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

/** "Mar 7" — the compact format used in image headers. */
export function formatMonthDay(date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

/** Non-mutating date + N days. */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Does this round have a marooning?
 * Back-compat: rounds generated before `hasMarooning` existed only carried `marooningDays`,
 * so absence falls back to "marooningDays > 0". Do NOT normalize this away — the fallback is
 * what keeps old seasons rendering.
 */
export function roundHasMarooning(round) {
  return round.hasMarooning ?? (round.marooningDays > 0);
}

/**
 * Classify a round. GUARD ORDER IS LOAD-BEARING:
 * `ftcRound` is checked BEFORE `fNumber === 1` so an FTC held at F1 (a valid config —
 * estimatedFTCPlayers: 1 suppresses the separate reunion round) gets speeches+votes rather
 * than the 1-day reunion treatment. Getting this order wrong is what made the planner's
 * select render "F1 ⦁ undefined ⦁ Reunion".
 * @returns {'ftc'|'reunion'|'marooning'|'swap'|'merge'|'standard'}
 */
export function getRoundType(round) {
  if (round.ftcRound) return 'ftc';
  if (round.fNumber === 1) return 'reunion';
  if (roundHasMarooning(round)) return 'marooning';
  if (round.swapRound) return 'swap';
  if (round.mergeRound) return 'merge';
  return 'standard';
}

/**
 * The named events inside a round, in chronological order, as day offsets from the round's
 * own start (day 0). This is the ONE place the within-round arithmetic lives.
 *
 * `key` is the stable identifier consumers switch on ('event' | 'challenge' | 'tribal' |
 * 'speeches' | 'votes'); `activity` is the colour/category token the images use.
 *
 * @returns {Array<{key: string, activity: string, offset: number}>}
 */
export function getRoundPhases(round) {
  const type = getRoundType(round);
  const tribalDays = round.tribalDays ?? 1;

  switch (type) {
    case 'reunion':
      return [{ key: 'event', activity: 'reunion', offset: 0 }];

    case 'ftc': {
      const speechDays = round.speechDays ?? 1;
      return [
        { key: 'speeches', activity: 'speeches', offset: 0 },
        { key: 'votes', activity: 'votes', offset: speechDays },
      ];
    }

    case 'marooning': {
      const marooningDays = round.marooningDays ?? 1;
      return [
        { key: 'event', activity: 'marooning', offset: 0 },
        { key: 'challenge', activity: 'challenge', offset: marooningDays },
        { key: 'tribal', activity: 'tribal', offset: marooningDays + tribalDays },
      ];
    }

    case 'swap':
    case 'merge': {
      const eventDays = round.eventDays ?? 1;
      return [
        { key: 'event', activity: type, offset: 0 },
        { key: 'challenge', activity: 'challenge', offset: eventDays },
        { key: 'tribal', activity: 'tribal', offset: eventDays + tribalDays },
      ];
    }

    default:
      return [
        { key: 'challenge', activity: 'challenge', offset: 0 },
        { key: 'tribal', activity: 'tribal', offset: tribalDays },
      ];
  }
}

/**
 * How many days a round consumes.
 *
 * For every type except FTC this is "last phase offset + 1" — i.e. the final event (tribal /
 * reunion) takes one day, and the challenge day is the implicit +1 baked into the phase
 * offsets. FTC is the exception: its two phases each have their OWN length (speechDays,
 * votesDays), so its duration is their sum rather than a final-offset walk.
 *
 * The bare challenge day is 1 and is NOT configurable — multi-day challenges would need a
 * change here and in getRoundPhases, and nowhere else.
 */
export function getRoundDuration(round) {
  if (getRoundType(round) === 'ftc') {
    return Math.max(1, (round.speechDays ?? 1) + (round.votesDays ?? 1)); // Minimum 1 day
  }
  const phases = getRoundPhases(round);
  return phases[phases.length - 1].offset + 1;
}

/** Round ids ordered by seasonRoundNo. NEVER sort the raw keys — "r10" sorts before "r2". */
export function sortRoundIds(rounds) {
  return Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
}

/**
 * Which rounds are consumed by a multi-elimination earlier in the season.
 * If round X eliminates N players, the next N-1 rounds are skipped: zero duration, no dates.
 * @returns {Map<string, {skippedBy: number, elimCount: number}>} roundId → skip info
 */
export function getSkippedRounds(rounds) {
  const skipped = new Map();
  const sortedIds = sortRoundIds(rounds);

  for (let i = 0; i < sortedIds.length; i++) {
    const round = rounds[sortedIds[i]];
    const elims = round.eliminations ?? 1;
    if (elims > 1) {
      for (let skip = 1; skip < elims && (i + skip) < sortedIds.length; skip++) {
        skipped.set(sortedIds[i + skip], { skippedBy: round.fNumber, elimCount: elims });
      }
    }
  }

  return skipped;
}

/**
 * Walk every round from the season start date, accumulating durations into real Dates.
 * This is what every consumer should call — the planner view, both image generators.
 *
 * @param {Object} rounds - seasonRounds object
 * @param {Date} startDate - season start (local midnight)
 * @param {Map} [skippedMap] - from getSkippedRounds(); computed here when omitted
 * @returns {{
 *   ids: string[],                 // ordered by seasonRoundNo, INCLUDING skipped rounds
 *   byId: Object,                  // id → { id, round, type, startOffset, duration, start, skipped, skipInfo, phases }
 *   totalDays: number,             // season length in days
 *   skippedMap: Map
 * }}  each phase gains a real `date` alongside its `offset`.
 */
export function buildRoundSchedule(rounds, startDate, skippedMap = null) {
  const ids = sortRoundIds(rounds);
  const skipped = skippedMap ?? getSkippedRounds(rounds);
  const byId = {};
  let currentDay = 0;

  for (const id of ids) {
    const round = rounds[id];
    const type = getRoundType(round);

    // Skipped rounds add ZERO days — the next round starts on the same day.
    if (skipped.has(id)) {
      byId[id] = {
        id, round, type,
        startOffset: currentDay,
        duration: 0,
        start: addDays(startDate, currentDay),
        skipped: true,
        skipInfo: skipped.get(id),
        phases: [],
      };
      continue;
    }

    const start = addDays(startDate, currentDay);
    byId[id] = {
      id, round, type,
      startOffset: currentDay,
      duration: getRoundDuration(round),
      start,
      skipped: false,
      skipInfo: null,
      phases: getRoundPhases(round).map(p => ({ ...p, date: addDays(start, p.offset) })),
    };
    currentDay += byId[id].duration;
  }

  return { ids, byId, totalDays: currentDay, skippedMap: skipped };
}

/**
 * Expand one round into exactly `duration` day slots — what the 📅 Calendar paints.
 *
 * Each day carries the phases that are ACTIVE on it. A day where nothing new starts inherits
 * the previous phase (so a 2-day marooning paints "Marooning" twice instead of leaving a
 * blank cell), and phases sharing an offset land on the same day (so a live tribal paints
 * "Challenge + Tribal" instead of spilling onto the next round's first day).
 *
 * Guaranteed: `result.length === getRoundDuration(round)`. That invariant is what keeps the
 * calendar's day cells aligned with the timeline's round start dates.
 *
 * @returns {Array<{dayOffset: number, phases: Array}>}
 */
export function expandRoundDays(round) {
  const duration = getRoundDuration(round);
  const phases = getRoundPhases(round);

  const byOffset = new Map();
  for (const p of phases) {
    if (!byOffset.has(p.offset)) byOffset.set(p.offset, []);
    byOffset.get(p.offset).push(p);
  }

  const days = [];
  let active = [];
  for (let d = 0; d < duration; d++) {
    if (byOffset.has(d)) active = byOffset.get(d);
    days.push({ dayOffset: d, phases: active });
  }

  // A phase can fall outside the duration when a later phase has zero length
  // (e.g. FTC with votesDays: 0 = "concurrent with speeches"). Fold it into the last day
  // rather than dropping it silently.
  const overflow = phases.filter(p => p.offset >= duration);
  if (overflow.length && days.length) {
    const last = days[days.length - 1];
    last.phases = [...last.phases, ...overflow.filter(p => !last.phases.includes(p))];
  }

  return days;
}
