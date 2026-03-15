/**
 * Tests for Season Planner — round generation, swap/merge placement, date parsing
 * Pure logic replicated inline to avoid importing heavy modules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate pure logic inline
// ─────────────────────────────────────────────

function getSwapFNumbers(totalPlayers, numSwaps) {
  if (numSwaps === 0) return [];
  const firstSwapOffset = 2;
  const swapSpacing = 2;
  const swaps = [];
  for (let i = 0; i < numSwaps; i++) {
    const fNumber = totalPlayers - firstSwapOffset - (i * swapSpacing);
    if (fNumber > 1) swaps.push(fNumber);
  }
  return swaps;
}

function getMergeFNumber(totalPlayers, swapFNumbers = []) {
  const target = Math.round(totalPlayers * 0.58);
  let merge = Math.max(10, Math.min(12, target));
  while (swapFNumbers.includes(merge) && merge > 2) {
    merge--;
  }
  return merge;
}

function generateSeasonRounds(totalPlayers, numSwaps, ftcPlayers) {
  const rounds = {};
  const swapFNumbers = getSwapFNumbers(totalPlayers, numSwaps);
  const mergeFNumber = getMergeFNumber(totalPlayers, swapFNumbers);

  let roundNo = 1;
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

function parseStartDate(dateStr) {
  if (!dateStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null;
  const [mm, dd, yyyy] = dateStr.split('/').map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 2020) return null;
  const date = new Date(yyyy, mm - 1, dd);
  if (date.getMonth() !== mm - 1 || date.getDate() !== dd) return null;
  return date;
}

function validatePlannerFields(fields) {
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

function getRoundDuration(round) {
  if (round.ftcRound) return Math.max(1, (round.speechDays ?? 1) + (round.votesDays ?? 1));
  if (round.fNumber === 1) return 1;
  const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
  const tribalDays = round.tribalDays ?? 1;
  if (hasMarooning) return (round.marooningDays ?? 1) + 1 + tribalDays;
  if (round.swapRound || round.mergeRound) return (round.eventDays ?? 1) + 1 + tribalDays;
  return 1 + tribalDays;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('getSwapFNumbers — swap placement', () => {
  it('returns empty for 0 swaps', () => {
    assert.deepEqual(getSwapFNumbers(18, 0), []);
  });

  it('places 1 swap 2 rounds in', () => {
    assert.deepEqual(getSwapFNumbers(18, 1), [16]);
  });

  it('places 2 swaps with spacing of 2', () => {
    assert.deepEqual(getSwapFNumbers(18, 2), [16, 14]);
  });

  it('handles 20 players with 2 swaps', () => {
    assert.deepEqual(getSwapFNumbers(20, 2), [18, 16]);
  });

  it('handles 24 players with 2 swaps', () => {
    assert.deepEqual(getSwapFNumbers(24, 2), [22, 20]);
  });

  it('handles 16 players with 1 swap', () => {
    assert.deepEqual(getSwapFNumbers(16, 1), [14]);
  });

  it('filters out swaps that would be F1 or below', () => {
    // 6 players, 3 swaps → [4, 2] (third would be 0, filtered)
    assert.deepEqual(getSwapFNumbers(6, 3), [4, 2]);
  });
});

describe('getMergeFNumber — merge placement', () => {
  it('returns F10 for 18 players', () => {
    assert.equal(getMergeFNumber(18), 10);
  });

  it('returns F12 for 20 players', () => {
    assert.equal(getMergeFNumber(20), 12);
  });

  it('clamps to F10 for small seasons', () => {
    assert.equal(getMergeFNumber(12), 10); // 12 * 0.58 = 7 → clamped to 10
  });

  it('clamps to F12 for large seasons', () => {
    assert.equal(getMergeFNumber(24), 12); // 24 * 0.58 = 14 → clamped to 12
  });

  it('avoids collision with swap at F10 (12 players)', () => {
    // 12 players: merge target = 10, but swap is also at F10
    const swaps = getSwapFNumbers(12, 1); // [10]
    assert.equal(getMergeFNumber(12, swaps), 9); // shifted down to F9
  });

  it('avoids collision with swap at F10 (14 players, 2 swaps)', () => {
    const swaps = getSwapFNumbers(14, 2); // [12, 10]
    assert.equal(getMergeFNumber(14, swaps), 9); // F10 taken by swap, shift to F9
  });
});

describe('generateSeasonRounds — full round generation', () => {
  it('generates correct number of rounds (18 players, F3 FTC)', () => {
    const rounds = generateSeasonRounds(18, 2, 3);
    const count = Object.keys(rounds).length;
    // F18 down to F3 = 16 rounds + F1 reunion = 17
    assert.equal(count, 17);
  });

  it('generates correct number of rounds (20 players, F2 FTC)', () => {
    const rounds = generateSeasonRounds(20, 2, 2);
    const count = Object.keys(rounds).length;
    // F20 down to F2 = 19 rounds + F1 reunion = 20
    assert.equal(count, 20);
  });

  it('no duplicate reunion when FTC is F1', () => {
    const rounds = generateSeasonRounds(11, 0, 1);
    const f1Rounds = Object.values(rounds).filter(r => r.fNumber === 1);
    assert.equal(f1Rounds.length, 1, 'Should only have one F1 round');
    assert.equal(f1Rounds[0].ftcRound, true, 'F1 should be the FTC round');
    // Total: F11 down to F1 = 11 rounds, no separate reunion
    assert.equal(Object.keys(rounds).length, 11);
  });

  it('first round has marooning', () => {
    const rounds = generateSeasonRounds(18, 0, 3);
    assert.equal(rounds.r1.marooningDays, 1);
    assert.equal(rounds.r1.fNumber, 18);
  });

  it('non-first rounds have no marooning', () => {
    const rounds = generateSeasonRounds(18, 0, 3);
    assert.equal(rounds.r2.marooningDays, 0);
  });

  it('last playable round is FTC', () => {
    const rounds = generateSeasonRounds(18, 0, 3);
    // F3 is the FTC round — round 16 (F18 down to F3 = 16 rounds)
    assert.equal(rounds.r16.ftcRound, true);
    assert.equal(rounds.r16.fNumber, 3);
  });

  it('reunion is the final round', () => {
    const rounds = generateSeasonRounds(18, 0, 3);
    assert.equal(rounds.r17.fNumber, 1);
    assert.equal(rounds.r17.ftcRound, false);
  });

  it('places swaps at correct F-numbers', () => {
    const rounds = generateSeasonRounds(18, 2, 3);
    // Swaps at F16, F14
    const swapRounds = Object.values(rounds).filter(r => r.swapRound);
    const swapFs = swapRounds.map(r => r.fNumber).sort((a, b) => b - a);
    assert.deepEqual(swapFs, [16, 14]);
  });

  it('places merge at correct F-number', () => {
    const rounds = generateSeasonRounds(18, 0, 3);
    const mergeRounds = Object.values(rounds).filter(r => r.mergeRound);
    assert.equal(mergeRounds.length, 1);
    assert.equal(mergeRounds[0].fNumber, 10);
  });

  it('F-numbers decrease sequentially', () => {
    const rounds = generateSeasonRounds(18, 2, 3);
    const fNumbers = Object.keys(rounds)
      .sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo)
      .map(id => rounds[id].fNumber);
    // Should be 18, 17, 16, ..., 3, 1 (no F2 since FTC is F3)
    for (let i = 0; i < fNumbers.length - 2; i++) {
      assert.equal(fNumbers[i] - fNumbers[i + 1], 1, `F${fNumbers[i]} to F${fNumbers[i + 1]} should decrease by 1`);
    }
    // Last jump: F3 → F1 (reunion, skipping F2)
    assert.equal(fNumbers[fNumbers.length - 1], 1);
  });

  it('no round has both swap and merge', () => {
    // 12 players, 1 swap previously caused collision at F10
    const rounds = generateSeasonRounds(12, 1, 2);
    for (const [id, r] of Object.entries(rounds)) {
      assert.ok(!(r.swapRound && r.mergeRound), `${id} (F${r.fNumber}) has both swap AND merge`);
    }
  });

  it('no round has both swap and merge (14 players, 2 swaps)', () => {
    const rounds = generateSeasonRounds(14, 2, 2);
    for (const [id, r] of Object.entries(rounds)) {
      assert.ok(!(r.swapRound && r.mergeRound), `${id} (F${r.fNumber}) has both swap AND merge`);
    }
  });

  it('round IDs are r1, r2, r3...', () => {
    const rounds = generateSeasonRounds(12, 0, 2);
    const ids = Object.keys(rounds).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
    ids.forEach((id, i) => {
      assert.equal(id, `r${i + 1}`);
    });
  });
});

describe('parseStartDate — date parsing', () => {
  it('parses valid mm/dd/yyyy', () => {
    const d = parseStartDate('03/07/2026');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 2); // March = 2 (0-indexed)
    assert.equal(d.getDate(), 7);
  });

  it('rejects invalid format', () => {
    assert.equal(parseStartDate('3/7/2026'), null);
    assert.equal(parseStartDate('2026-03-07'), null);
    assert.equal(parseStartDate(''), null);
    assert.equal(parseStartDate(null), null);
  });

  it('rejects invalid dates', () => {
    assert.equal(parseStartDate('02/30/2026'), null); // Feb 30 doesn't exist
    assert.equal(parseStartDate('13/01/2026'), null);  // Month 13
    assert.equal(parseStartDate('00/15/2026'), null);  // Month 0
  });

  it('rejects years before 2020', () => {
    assert.equal(parseStartDate('01/01/2019'), null);
  });
});

describe('validatePlannerFields — modal validation', () => {
  const validFields = {
    season_name: 'Season 12',
    est_players: '18',
    est_swaps: '2',
    est_ftc: '3',
    est_start_date: '03/07/2026'
  };

  it('accepts valid input', () => {
    const result = validatePlannerFields(validFields);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.data.estimatedTotalPlayers, 18);
    assert.equal(result.data.estimatedSwaps, 2);
    assert.equal(result.data.estimatedFTCPlayers, 3);
  });

  it('rejects empty season name', () => {
    const result = validatePlannerFields({ ...validFields, season_name: '' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Season name')));
  });

  it('rejects 0 players', () => {
    const result = validatePlannerFields({ ...validFields, est_players: '0' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Players')));
  });

  it('allows 0 swaps', () => {
    const result = validatePlannerFields({ ...validFields, est_swaps: '0' });
    assert.equal(result.valid, true);
  });

  it('rejects FTC >= total players', () => {
    const result = validatePlannerFields({ ...validFields, est_ftc: '18' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('FTC players must be less')));
  });

  it('rejects invalid date', () => {
    const result = validatePlannerFields({ ...validFields, est_start_date: 'garbage' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('date')));
  });
});

describe('getRoundDuration — round duration calculation', () => {
  it('reunion is 1 day', () => {
    assert.equal(getRoundDuration({ fNumber: 1 }), 1);
  });

  it('FTC defaults to 2 days', () => {
    assert.equal(getRoundDuration({ fNumber: 3, ftcRound: true, marooningDays: 0 }), 2);
  });

  it('FTC with custom speech/vote days', () => {
    assert.equal(getRoundDuration({ fNumber: 3, ftcRound: true, marooningDays: 0, speechDays: 2, votesDays: 1 }), 3);
    assert.equal(getRoundDuration({ fNumber: 3, ftcRound: true, marooningDays: 0, speechDays: 1, votesDays: 0 }), 1);
  });

  it('FTC at F1 gets FTC duration, not reunion 1-day', () => {
    // FTC check must take priority over reunion (fNumber===1) check
    assert.equal(getRoundDuration({ fNumber: 1, ftcRound: true }), 2); // speeches(1) + votes(1)
    assert.equal(getRoundDuration({ fNumber: 1, ftcRound: true, speechDays: 2, votesDays: 1 }), 3);
  });

  it('FTC minimum 1 day even with 0+0', () => {
    assert.equal(getRoundDuration({ fNumber: 3, ftcRound: true, speechDays: 0, votesDays: 0 }), 1);
  });

  it('marooning round defaults to 3 days', () => {
    assert.equal(getRoundDuration({ fNumber: 18, marooningDays: 1, ftcRound: false }), 3);
  });

  it('marooning with 2-day event is 4 days', () => {
    assert.equal(getRoundDuration({ fNumber: 18, marooningDays: 2, ftcRound: false, hasMarooning: true }), 4);
  });

  it('marooning 0-day (same day as challenge) is 2 days', () => {
    assert.equal(getRoundDuration({ fNumber: 18, marooningDays: 0, hasMarooning: true, ftcRound: false }), 2);
  });

  it('swap with 0 eventDays is 2 days', () => {
    assert.equal(getRoundDuration({ fNumber: 16, swapRound: true, eventDays: 0, marooningDays: 0, ftcRound: false }), 2);
  });

  it('swap with 1 eventDay is 3 days (default)', () => {
    assert.equal(getRoundDuration({ fNumber: 16, swapRound: true, eventDays: 1, marooningDays: 0, ftcRound: false }), 3);
  });

  it('live tribal (0-day tribal) reduces standard round to 1 day', () => {
    assert.equal(getRoundDuration({ fNumber: 15, marooningDays: 0, ftcRound: false, tribalDays: 0 }), 1);
  });

  it('live tribal on swap round is 2 days', () => {
    assert.equal(getRoundDuration({ fNumber: 16, swapRound: true, eventDays: 1, marooningDays: 0, ftcRound: false, tribalDays: 0 }), 2);
  });

  it('swap round is 3 days', () => {
    assert.equal(getRoundDuration({ fNumber: 16, swapRound: true, marooningDays: 0, ftcRound: false }), 3);
  });

  it('merge round is 3 days', () => {
    assert.equal(getRoundDuration({ fNumber: 10, mergeRound: true, marooningDays: 0, ftcRound: false }), 3);
  });

  it('standard round is 2 days', () => {
    assert.equal(getRoundDuration({ fNumber: 15, marooningDays: 0, ftcRound: false }), 2);
  });
});

describe('Season total duration — end-to-end', () => {
  it('18 players, 2 swaps, F3 FTC — total days', () => {
    const rounds = generateSeasonRounds(18, 2, 3);
    const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
    let totalDays = 0;
    for (const id of sortedIds) {
      totalDays += getRoundDuration(rounds[id]);
    }
    // Round 1 (marooning): 3 days
    // Rounds with swap (2 swaps): 2 × 3 = 6 days
    // Round with merge: 3 days
    // FTC round: 2 days
    // Reunion: 1 day
    // Standard rounds: remaining = 17 - 1 - 2 - 1 - 1 - 1 = 11 rounds × 2 = 22 days
    // Total: 3 + 6 + 3 + 2 + 1 + 22 = 37 days
    assert.equal(totalDays, 37);
  });
});
