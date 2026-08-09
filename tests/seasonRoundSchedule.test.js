/**
 * Season Round Schedule — the shared day arithmetic.
 *
 * Unlike tests/seasonPlanner.test.js (which replicates logic inline to avoid importing
 * storage/Discord), this imports the REAL module — seasonRoundSchedule.js is pure and
 * dependency-free precisely so it can be tested for real.
 *
 * Covers: duration parity with the pre-extraction implementation, the phase model, the
 * expandRoundDays === duration invariant the calendar depends on, and the FTC-at-F1
 * classification bug that made the planner render "F1 ⦁ undefined ⦁ Reunion".
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getRoundType, getRoundPhases, getRoundDuration, roundHasMarooning,
  buildRoundSchedule, expandRoundDays, getSkippedRounds, sortRoundIds,
  formatRoundDate, formatMonthDay, addDays,
} from '../seasonRoundSchedule.js';

// Round factories — `marooningDays: 0` on non-marooning rounds mirrors generateSeasonRounds
const standard = (o = {}) => ({ fNumber: 15, seasonRoundNo: 4, marooningDays: 0, ftcRound: false, ...o });
const marooning = (o = {}) => ({ fNumber: 18, seasonRoundNo: 1, hasMarooning: true, marooningDays: 1, ftcRound: false, ...o });
const swap = (o = {}) => ({ fNumber: 16, seasonRoundNo: 3, swapRound: true, eventDays: 1, marooningDays: 0, ftcRound: false, ...o });
const merge = (o = {}) => ({ fNumber: 10, seasonRoundNo: 9, mergeRound: true, eventDays: 1, marooningDays: 0, ftcRound: false, ...o });
const ftc = (o = {}) => ({ fNumber: 3, seasonRoundNo: 16, ftcRound: true, marooningDays: 0, ...o });
const reunion = (o = {}) => ({ fNumber: 1, seasonRoundNo: 17, marooningDays: 0, ftcRound: false, ...o });

describe('getRoundType — classification', () => {
  it('classifies each round shape', () => {
    assert.equal(getRoundType(standard()), 'standard');
    assert.equal(getRoundType(marooning()), 'marooning');
    assert.equal(getRoundType(swap()), 'swap');
    assert.equal(getRoundType(merge()), 'merge');
    assert.equal(getRoundType(ftc()), 'ftc');
    assert.equal(getRoundType(reunion()), 'reunion');
  });

  it('FTC beats reunion at F1 — the "F1 undefined Reunion" bug', () => {
    // estimatedFTCPlayers: 1 is valid and suppresses the separate reunion round.
    // If this ever returns 'reunion', the select reads dates.event (which FTC never produces).
    assert.equal(getRoundType({ fNumber: 1, ftcRound: true }), 'ftc');
  });

  it('marooning beats swap/merge when both flags are set', () => {
    assert.equal(getRoundType({ fNumber: 18, hasMarooning: true, marooningDays: 1, swapRound: true }), 'marooning');
  });

  it('back-compat: marooningDays > 0 implies marooning when hasMarooning is absent', () => {
    assert.equal(roundHasMarooning({ marooningDays: 1 }), true);
    assert.equal(roundHasMarooning({ marooningDays: 0 }), false);
    assert.equal(getRoundType({ fNumber: 18, marooningDays: 2, ftcRound: false }), 'marooning');
  });

  it('hasMarooning: false wins over a stale non-zero marooningDays', () => {
    assert.equal(roundHasMarooning({ hasMarooning: false, marooningDays: 3 }), false);
  });
});

describe('getRoundDuration — parity with the pre-extraction implementation', () => {
  it('reunion is 1 day', () => assert.equal(getRoundDuration(reunion()), 1));
  it('standard is 2 days', () => assert.equal(getRoundDuration(standard()), 2));
  it('marooning is 3 days', () => assert.equal(getRoundDuration(marooning()), 3));
  it('swap is 3 days', () => assert.equal(getRoundDuration(swap()), 3));
  it('merge is 3 days', () => assert.equal(getRoundDuration(merge()), 3));
  it('FTC defaults to 2 days', () => assert.equal(getRoundDuration(ftc()), 2));

  it('FTC honours custom speech/vote days', () => {
    assert.equal(getRoundDuration(ftc({ speechDays: 2, votesDays: 1 })), 3);
    assert.equal(getRoundDuration(ftc({ speechDays: 1, votesDays: 0 })), 1);
  });
  it('FTC has a 1-day minimum even at 0 + 0', () => {
    assert.equal(getRoundDuration(ftc({ speechDays: 0, votesDays: 0 })), 1);
  });
  it('FTC at F1 gets speeches+votes, not the 1-day reunion', () => {
    assert.equal(getRoundDuration({ fNumber: 1, ftcRound: true }), 2);
    assert.equal(getRoundDuration({ fNumber: 1, ftcRound: true, speechDays: 2, votesDays: 1 }), 3);
  });

  it('multi-day marooning extends the round', () => {
    assert.equal(getRoundDuration(marooning({ marooningDays: 2 })), 4);
  });
  it('0-day marooning shares the challenge day', () => {
    assert.equal(getRoundDuration(marooning({ marooningDays: 0 })), 2);
  });
  it('0-day swap event shares the challenge day', () => {
    assert.equal(getRoundDuration(swap({ eventDays: 0 })), 2);
  });

  it('live tribal (tribalDays 0) shortens every round type by a day', () => {
    assert.equal(getRoundDuration(standard({ tribalDays: 0 })), 1);
    assert.equal(getRoundDuration(swap({ tribalDays: 0 })), 2);
    assert.equal(getRoundDuration(marooning({ tribalDays: 0 })), 2);
  });
  it('multi-day tribal lengthens the round', () => {
    assert.equal(getRoundDuration(standard({ tribalDays: 2 })), 3);
  });
});

describe('getRoundPhases — tribalDays is an offset FROM THE CHALLENGE DAY', () => {
  const offsets = (round) => Object.fromEntries(getRoundPhases(round).map(p => [p.key, p.offset]));

  it('standard: challenge day 0, tribal at tribalDays', () => {
    assert.deepEqual(offsets(standard()), { challenge: 0, tribal: 1 });
    assert.deepEqual(offsets(standard({ tribalDays: 0 })), { challenge: 0, tribal: 0 });
    assert.deepEqual(offsets(standard({ tribalDays: 2 })), { challenge: 0, tribal: 2 });
  });

  it('marooning: tribal = marooningDays + tribalDays (NOT marooningDays + 1)', () => {
    assert.deepEqual(offsets(marooning()), { event: 0, challenge: 1, tribal: 2 });
    assert.deepEqual(offsets(marooning({ marooningDays: 2 })), { event: 0, challenge: 2, tribal: 3 });
    // The regression the extraction fixed: the Schedule image used to put this tribal at day 1.
    assert.deepEqual(offsets(marooning({ tribalDays: 0 })), { event: 0, challenge: 1, tribal: 1 });
  });

  it('swap/merge: tribal = eventDays + tribalDays', () => {
    assert.deepEqual(offsets(swap()), { event: 0, challenge: 1, tribal: 2 });
    assert.deepEqual(offsets(swap({ eventDays: 0 })), { event: 0, challenge: 0, tribal: 1 });
    assert.deepEqual(offsets(merge({ eventDays: 0, tribalDays: 0 })), { event: 0, challenge: 0, tribal: 0 });
  });

  it('FTC: votes start after speechDays', () => {
    assert.deepEqual(offsets(ftc()), { speeches: 0, votes: 1 });
    assert.deepEqual(offsets(ftc({ speechDays: 3 })), { speeches: 0, votes: 3 });
  });

  it('reunion has a single event phase', () => {
    assert.deepEqual(offsets(reunion()), { event: 0 });
  });

  it('phase activity tokens drive the calendar colours', () => {
    assert.equal(getRoundPhases(swap())[0].activity, 'swap');
    assert.equal(getRoundPhases(merge())[0].activity, 'merge');
    assert.equal(getRoundPhases(marooning())[0].activity, 'marooning');
    assert.equal(getRoundPhases(reunion())[0].activity, 'reunion');
  });
});

describe('expandRoundDays — the calendar invariant', () => {
  const cases = [
    standard(), standard({ tribalDays: 0 }), standard({ tribalDays: 2 }),
    marooning(), marooning({ marooningDays: 2 }), marooning({ marooningDays: 0 }), marooning({ tribalDays: 0 }),
    swap(), swap({ eventDays: 0 }), swap({ tribalDays: 0 }), merge(),
    ftc(), ftc({ speechDays: 2, votesDays: 3 }), ftc({ speechDays: 0, votesDays: 0 }),
    ftc({ speechDays: 2, votesDays: 0 }), reunion(),
  ];

  it('always yields exactly getRoundDuration(round) day slots', () => {
    // This is what stops calendar cells drifting out of step with the timeline's start dates.
    for (const round of cases) {
      assert.equal(expandRoundDays(round).length, getRoundDuration(round),
        `duration mismatch for ${getRoundType(round)} ${JSON.stringify(round)}`);
    }
  });

  it('every day slot carries at least one phase', () => {
    for (const round of cases) {
      for (const day of expandRoundDays(round)) {
        assert.ok(day.phases.length >= 1, `empty day in ${getRoundType(round)}`);
      }
    }
  });

  it('a multi-day marooning repeats rather than leaving a blank day', () => {
    const days = expandRoundDays(marooning({ marooningDays: 2 }));
    assert.equal(days.length, 4);
    assert.deepEqual(days.map(d => d.phases[0].key), ['event', 'event', 'challenge', 'tribal']);
  });

  it('a live tribal shares its day with the challenge', () => {
    const days = expandRoundDays(standard({ tribalDays: 0 }));
    assert.equal(days.length, 1);
    assert.deepEqual(days[0].phases.map(p => p.key), ['challenge', 'tribal']);
  });

  it('a zero-length trailing phase folds into the last day rather than vanishing', () => {
    // FTC votesDays: 0 = "concurrent with speeches"
    const days = expandRoundDays(ftc({ speechDays: 2, votesDays: 0 }));
    assert.equal(days.length, 2);
    assert.ok(days[1].phases.some(p => p.key === 'votes'));
  });
});

describe('getSkippedRounds — multi-elimination', () => {
  const rounds = {
    r1: { seasonRoundNo: 1, fNumber: 18 },
    r2: { seasonRoundNo: 2, fNumber: 17, eliminations: 3 },
    r3: { seasonRoundNo: 3, fNumber: 16 },
    r4: { seasonRoundNo: 4, fNumber: 15 },
    r5: { seasonRoundNo: 5, fNumber: 14 },
  };

  it('skips the next N-1 rounds after an N-elimination', () => {
    const skipped = getSkippedRounds(rounds);
    assert.deepEqual([...skipped.keys()], ['r3', 'r4']);
    assert.deepEqual(skipped.get('r3'), { skippedBy: 17, elimCount: 3 });
  });

  it('a single elimination skips nothing', () => {
    assert.equal(getSkippedRounds({ r1: { seasonRoundNo: 1, fNumber: 5, eliminations: 1 } }).size, 0);
  });

  it('a no-elim round (0) skips nothing', () => {
    assert.equal(getSkippedRounds({ r1: { seasonRoundNo: 1, fNumber: 5, eliminations: 0 } }).size, 0);
  });

  it('does not run off the end of the season', () => {
    const skipped = getSkippedRounds({ r1: { seasonRoundNo: 1, fNumber: 3, eliminations: 9 } });
    assert.equal(skipped.size, 0);
  });
});

describe('sortRoundIds — numeric, not lexicographic', () => {
  it('orders r10 after r2', () => {
    const rounds = { r10: { seasonRoundNo: 10 }, r2: { seasonRoundNo: 2 }, r1: { seasonRoundNo: 1 } };
    assert.deepEqual(sortRoundIds(rounds), ['r1', 'r2', 'r10']);
  });
});

describe('buildRoundSchedule — cumulative offsets into real dates', () => {
  // Sat 7 Mar 2026 — the worked example in docs/03-features/SeasonPlanner.md
  const START = new Date(2026, 2, 7);

  const season = {
    r1: marooning({ seasonRoundNo: 1, fNumber: 18 }),
    r2: standard({ seasonRoundNo: 2, fNumber: 17 }),
    r3: swap({ seasonRoundNo: 3, fNumber: 16 }),
  };

  it('rounds are strictly back-to-back', () => {
    const s = buildRoundSchedule(season, START);
    assert.equal(s.byId.r1.startOffset, 0);
    assert.equal(s.byId.r2.startOffset, 3); // marooning = 3 days
    assert.equal(s.byId.r3.startOffset, 5); // + standard = 2 days
    assert.equal(s.totalDays, 8);
  });

  it('produces the documented worked-example dates', () => {
    const s = buildRoundSchedule(season, START);
    const dates = (id) => Object.fromEntries(s.byId[id].phases.map(p => [p.key, formatRoundDate(p.date)]));
    assert.deepEqual(dates('r1'), { event: 'Sat 7 Mar', challenge: 'Sun 8 Mar', tribal: 'Mon 9 Mar' });
    assert.deepEqual(dates('r2'), { challenge: 'Tue 10 Mar', tribal: 'Wed 11 Mar' });
    assert.deepEqual(dates('r3'), { event: 'Thu 12 Mar', challenge: 'Fri 13 Mar', tribal: 'Sat 14 Mar' });
  });

  it('a live tribal pulls every later round a day earlier', () => {
    const withLive = { ...season, r2: standard({ seasonRoundNo: 2, fNumber: 17, tribalDays: 0 }) };
    const s = buildRoundSchedule(withLive, START);
    assert.equal(s.byId.r3.startOffset, 4); // was 5
    assert.equal(s.totalDays, 7);           // was 8
    // …and the tribal lands on the challenge day, which is exactly what the select shows.
    const r2 = s.byId.r2.phases;
    assert.equal(formatRoundDate(r2[0].date), formatRoundDate(r2[1].date));
  });

  it('skipped rounds consume zero days and carry no phases', () => {
    const withDouble = {
      r1: standard({ seasonRoundNo: 1, fNumber: 18, eliminations: 2 }),
      r2: standard({ seasonRoundNo: 2, fNumber: 17 }),
      r3: standard({ seasonRoundNo: 3, fNumber: 16 }),
    };
    const s = buildRoundSchedule(withDouble, START);
    assert.equal(s.byId.r2.skipped, true);
    assert.equal(s.byId.r2.duration, 0);
    assert.deepEqual(s.byId.r2.phases, []);
    assert.deepEqual(s.byId.r2.skipInfo, { skippedBy: 18, elimCount: 2 });
    assert.equal(s.byId.r3.startOffset, 2); // r1 only — r2 added nothing
    assert.equal(s.totalDays, 4);
  });

  it('skipped rounds stay in ids so the planner can still render them', () => {
    const withDouble = {
      r1: standard({ seasonRoundNo: 1, fNumber: 18, eliminations: 2 }),
      r2: standard({ seasonRoundNo: 2, fNumber: 17 }),
    };
    assert.deepEqual(buildRoundSchedule(withDouble, START).ids, ['r1', 'r2']);
  });

  it('the total equals the sum of unskipped durations', () => {
    const s = buildRoundSchedule(season, START);
    const sum = s.ids.reduce((t, id) => t + s.byId[id].duration, 0);
    assert.equal(s.totalDays, sum);
  });
});

describe('date formatting', () => {
  it('formatRoundDate renders "Sat 7 Mar"', () => {
    assert.equal(formatRoundDate(new Date(2026, 2, 7)), 'Sat 7 Mar');
  });
  it('formatMonthDay renders "Mar 7"', () => {
    assert.equal(formatMonthDay(new Date(2026, 2, 7)), 'Mar 7');
  });
  it('addDays does not mutate its input', () => {
    const base = new Date(2026, 2, 7);
    const next = addDays(base, 5);
    assert.equal(formatRoundDate(base), 'Sat 7 Mar');
    assert.equal(formatRoundDate(next), 'Thu 12 Mar');
  });
  it('addDays rolls across month boundaries', () => {
    assert.equal(formatRoundDate(addDays(new Date(2026, 2, 30), 5)), 'Sat 4 Apr');
  });
});
