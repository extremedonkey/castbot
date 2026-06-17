/**
 * Tests for the unified season-create validation (RaP 0910, Layer B).
 *
 * validatePlannerFields() now makes the 4 planner estimates OPTIONAL:
 *   - name only            → valid, hasPlannerData = false (no rounds)
 *   - name + all estimates → valid, hasPlannerData = true  (rounds generated)
 *   - name + partial/bad   → invalid (so the user fixes or clears them)
 *
 * Pure logic replicated inline to avoid importing storage.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate parseStartDate + validatePlannerFields
// ─────────────────────────────────────────────

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
  const seasonName = fields.season_name?.trim();
  if (!seasonName) errors.push('Season name is required');

  // Each estimate validated INDEPENDENTLY so partial progress persists. Only a missing name fails.
  const playersRaw = parseInt(fields.est_players);
  const swapsRaw = parseInt(fields.est_swaps);
  const ftcRaw = parseInt(fields.est_ftc);
  const startDate = parseStartDate(fields.est_start_date);

  const players = (!isNaN(playersRaw) && playersRaw >= 1) ? playersRaw : null;
  const swaps = (!isNaN(swapsRaw) && swapsRaw >= 0) ? swapsRaw : null;
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
      estimatedTotalPlayers: players,
      estimatedSwaps: swaps,
      estimatedFTCPlayers: ftc,
      estimatedStartDate,
    }
  };
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('Unified season create — name only', () => {
  it('is valid with no planner data when only a name is given', () => {
    const r = validatePlannerFields({ season_name: 'My Season' });
    assert.equal(r.valid, true);
    assert.equal(r.hasPlannerData, false);
    assert.equal(r.data.seasonName, 'My Season');
    assert.equal(r.data.estimatedTotalPlayers, null);
    assert.equal(r.data.estimatedStartDate, null);
  });

  it('treats whitespace-only estimates as "no estimates"', () => {
    const r = validatePlannerFields({ season_name: 'S', est_players: '   ', est_swaps: '', est_ftc: '', est_start_date: '' });
    assert.equal(r.valid, true);
    assert.equal(r.hasPlannerData, false);
  });

  it('rejects a blank season name', () => {
    const r = validatePlannerFields({ season_name: '   ' });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => /name/i.test(e)));
  });
});

describe('Unified season create — full estimates', () => {
  it('is valid with planner data when all estimates are supplied', () => {
    const r = validatePlannerFields({
      season_name: 'Planned', est_players: '18', est_swaps: '2', est_ftc: '3', est_start_date: '03/07/2026'
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasPlannerData, true);
    assert.equal(r.data.estimatedTotalPlayers, 18);
    assert.equal(r.data.estimatedSwaps, 2);
    assert.equal(r.data.estimatedFTCPlayers, 3);
    assert.ok(typeof r.data.estimatedStartDate === 'number');
  });

  it('accepts 0 swaps', () => {
    const r = validatePlannerFields({
      season_name: 'NoSwap', est_players: '12', est_swaps: '0', est_ftc: '2', est_start_date: '03/07/2026'
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasPlannerData, true);
    assert.equal(r.data.estimatedSwaps, 0);
  });
});

describe('Unified season — partial/invalid estimates are IGNORED, never block the save (host-edit fix)', () => {
  it('saves name-only (valid) when estimates are partial — players given, others blank', () => {
    const r = validatePlannerFields({ season_name: 'Partial', est_players: '18' });
    assert.equal(r.valid, true);          // editing/creating is NOT blocked
    assert.equal(r.hasPlannerData, false); // ...but no rounds until all four are valid
    assert.deepEqual(r.errors, []);
  });

  it('saves (valid) but skips planner data when FTC >= players', () => {
    const r = validatePlannerFields({
      season_name: 'Bad', est_players: '5', est_swaps: '1', est_ftc: '5', est_start_date: '03/07/2026'
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasPlannerData, false);
  });

  it('saves (valid) but skips planner data on a malformed start date', () => {
    const r = validatePlannerFields({
      season_name: 'BadDate', est_players: '18', est_swaps: '2', est_ftc: '3', est_start_date: '3/7/26'
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasPlannerData, false);
  });

  it('the ONLY thing that blocks a submit is a missing season name', () => {
    assert.equal(validatePlannerFields({ season_name: '' }).valid, false);
    assert.equal(validatePlannerFields({ season_name: 'X', est_players: '18' }).valid, true);
  });
});

describe('Incremental planner setup — partial estimates are persisted (the save bug)', () => {
  it('persists a lone players estimate (others stay null)', () => {
    const { data } = validatePlannerFields({ season_name: 'S', est_players: '18' });
    assert.equal(data.estimatedTotalPlayers, 18); // saved, not discarded
    assert.equal(data.estimatedSwaps, null);
    assert.equal(data.estimatedFTCPlayers, null);
    assert.equal(data.estimatedStartDate, null);
    assert.equal(data.hasPlannerData, false);     // ...but no rounds yet
  });

  it('persists players + 0 swaps incrementally, still no rounds until all four', () => {
    const { data } = validatePlannerFields({ season_name: 'S', est_players: '18', est_swaps: '0' });
    assert.equal(data.estimatedTotalPlayers, 18);
    assert.equal(data.estimatedSwaps, 0); // 0 is a real value, not "missing"
    assert.equal(data.hasPlannerData, false);
  });

  it('keeps the valid fields and drops only the invalid one (FTC >= players)', () => {
    const { data } = validatePlannerFields({
      season_name: 'S', est_players: '5', est_swaps: '1', est_ftc: '5', est_start_date: '03/07/2026'
    });
    assert.equal(data.estimatedTotalPlayers, 5);
    assert.equal(data.estimatedSwaps, 1);
    assert.equal(data.estimatedFTCPlayers, null); // 5 is not < 5 → dropped, not blocking
    assert.ok(typeof data.estimatedStartDate === 'number');
    assert.equal(data.hasPlannerData, false);
  });

  it('generates planner data once all four are present & valid', () => {
    const { data } = validatePlannerFields({
      season_name: 'S', est_players: '18', est_swaps: '2', est_ftc: '3', est_start_date: '03/07/2026'
    });
    assert.equal(data.hasPlannerData, true);
    assert.equal(data.estimatedFTCPlayers, 3);
  });
});

describe('updateSeason merge — completing the planner across separate edits', () => {
  // Mirror of updateSeason's merge: only PROVIDED estimates are written; rounds generate when the
  // merged CONFIG (not one submit) holds all four.
  function applyEdit(config, fields) {
    const { data } = validatePlannerFields({ season_name: 'S', ...fields });
    if (data.estimatedTotalPlayers != null) config.estimatedTotalPlayers = data.estimatedTotalPlayers;
    if (data.estimatedSwaps != null) config.estimatedSwaps = data.estimatedSwaps;
    if (data.estimatedFTCPlayers != null) config.estimatedFTCPlayers = data.estimatedFTCPlayers;
    if (data.estimatedStartDate != null) config.estimatedStartDate = data.estimatedStartDate;
    return config.estimatedTotalPlayers != null && config.estimatedSwaps != null
      && config.estimatedFTCPlayers != null && config.estimatedStartDate != null; // configComplete
  }

  it('accumulates estimates across edits and only completes on the last field', () => {
    const config = {};
    assert.equal(applyEdit(config, { est_swaps: '2' }), false);
    assert.equal(applyEdit(config, { est_ftc: '3' }), false);
    assert.equal(applyEdit(config, { est_start_date: '03/07/2026' }), false);
    // matches the real "nbj" data: swaps/ftc/date set, players still missing, no rounds
    assert.equal(config.estimatedSwaps, 2);
    assert.equal(config.estimatedFTCPlayers, 3);
    assert.equal(config.estimatedTotalPlayers, undefined);
    // adding players finally completes it → rounds would generate
    assert.equal(applyEdit(config, { est_players: '18' }), true);
    assert.equal(config.estimatedTotalPlayers, 18);
  });

  it('adding one estimate never wipes the others (blank fields ignored — the bug)', () => {
    const config = { estimatedSwaps: 2, estimatedFTCPlayers: 3, estimatedStartDate: 123 };
    const complete = applyEdit(config, { est_players: '18' }); // only players provided; rest blank
    assert.equal(config.estimatedSwaps, 2);
    assert.equal(config.estimatedFTCPlayers, 3);
    assert.equal(config.estimatedStartDate, 123);
    assert.equal(config.estimatedTotalPlayers, 18);
    assert.equal(complete, true);
  });

  it('a blank submit does not wipe existing estimates', () => {
    const config = { estimatedTotalPlayers: 18, estimatedSwaps: 2, estimatedFTCPlayers: 3, estimatedStartDate: 123 };
    assert.equal(applyEdit(config, {}), true);
    assert.equal(config.estimatedTotalPlayers, 18);
  });
});

describe('updateSeason — structural estimate change triggers round regeneration', () => {
  // Mirror of updateSeason: merge estimates, then decide whether the round STRUCTURE must regenerate.
  // Players/swaps/FTC are structural; the start date is not (dates recompute on render).
  function editAndCheckStructural(config, fields) {
    const { data } = validatePlannerFields({ season_name: 'S', ...fields });
    const prevPlayers = config.estimatedTotalPlayers;
    const prevSwaps = config.estimatedSwaps;
    const prevFtc = config.estimatedFTCPlayers;
    if (data.estimatedTotalPlayers != null) config.estimatedTotalPlayers = data.estimatedTotalPlayers;
    if (data.estimatedSwaps != null) config.estimatedSwaps = data.estimatedSwaps;
    if (data.estimatedFTCPlayers != null) config.estimatedFTCPlayers = data.estimatedFTCPlayers;
    if (data.estimatedStartDate != null) config.estimatedStartDate = data.estimatedStartDate;
    return config.estimatedTotalPlayers !== prevPlayers
      || config.estimatedSwaps !== prevSwaps
      || config.estimatedFTCPlayers !== prevFtc;
  }

  const base = () => ({ estimatedTotalPlayers: 18, estimatedSwaps: 2, estimatedFTCPlayers: 3, estimatedStartDate: 100 });

  it('regenerates when player count changes (18 → 20)', () => {
    assert.equal(editAndCheckStructural(base(), { est_players: '20', est_swaps: '2', est_ftc: '3', est_start_date: '03/07/2026' }), true);
  });
  it('regenerates when FTC changes (3 → 2)', () => {
    assert.equal(editAndCheckStructural(base(), { est_players: '18', est_swaps: '2', est_ftc: '2', est_start_date: '03/07/2026' }), true);
  });
  it('regenerates when swaps change (2 → 1)', () => {
    assert.equal(editAndCheckStructural(base(), { est_players: '18', est_swaps: '1', est_ftc: '3', est_start_date: '03/07/2026' }), true);
  });
  it('does NOT regenerate on a date-only change (structure unchanged)', () => {
    assert.equal(editAndCheckStructural(base(), { est_players: '18', est_swaps: '2', est_ftc: '3', est_start_date: '08/01/2027' }), false);
  });
  it('does NOT regenerate when re-submitting identical estimates', () => {
    assert.equal(editAndCheckStructural(base(), { est_players: '18', est_swaps: '2', est_ftc: '3', est_start_date: '03/07/2026' }), false);
  });
  it('does NOT regenerate when a field comes back blank (merge keeps old value)', () => {
    assert.equal(editAndCheckStructural(base(), { est_start_date: '03/07/2026' }), false); // only date present
  });
});

describe('generateSeasonRounds round count — FTC F2 adds a round vs F3 (user-described logic)', () => {
  // Playable rounds = F{totalPlayers}..F{ftcPlayers} inclusive, plus the F1 reunion.
  function roundCount(totalPlayers, ftcPlayers) {
    let n = 0;
    for (let f = totalPlayers; f >= ftcPlayers; f--) n++;
    return n + 1; // + reunion
  }

  it('F2 has exactly one more round than F3 (the extra F2 tribal/challenge)', () => {
    assert.equal(roundCount(18, 2) - roundCount(18, 3), 1);
  });
  it('more players → more rounds (end date pushed back)', () => {
    assert.ok(roundCount(20, 3) > roundCount(18, 3));
    assert.equal(roundCount(20, 3) - roundCount(18, 3), 2);
  });
  it('18 players / F3 = 17 rounds (16 playable + reunion)', () => {
    assert.equal(roundCount(18, 3), 17);
  });
});

describe('Modal start-date pre-fill — create mode stays blank (regression: title-only create)', () => {
  // Mirrors buildSeasonPlannerModal's start-date pre-fill: existing season → its date, create → BLANK.
  function startDateValue(existing) {
    if (existing?.estimatedStartDate) {
      const d = new Date(existing.estimatedStartDate);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${mm}/${dd}/${d.getFullYear()}`;
    }
    return null; // create mode: blank — NO default-to-today (that tripped the all-or-nothing validation)
  }

  it('leaves the date blank when creating a new season', () => {
    assert.equal(startDateValue(null), null);
  });

  it('pre-fills the date from an existing season when editing', () => {
    const ts = new Date(2026, 2, 7).getTime(); // 03/07/2026
    assert.equal(startDateValue({ estimatedStartDate: ts }), '03/07/2026');
  });

  it('title-only create stays valid even with a stray date (defence in depth)', () => {
    // Two independent guards now protect title-only create: the modal no longer pre-fills the date,
    // AND validation never blocks on estimates. So even a stray date submit is valid (just no rounds).
    const r = validatePlannerFields({ season_name: 'X', est_start_date: '06/17/2026' });
    assert.equal(r.valid, true);
    assert.equal(r.hasPlannerData, false);
    assert.equal(validatePlannerFields({ season_name: 'X' }).valid, true);
  });
});

describe('Planner empty-state — getMissingPlannerFields', () => {
  const ALL = ['estimatedTotalPlayers', 'estimatedSwaps', 'estimatedFTCPlayers', 'estimatedStartDate'];
  // Replicated from seasonPlanner.js
  function getMissingPlannerFields(config, rounds) {
    if (config) return ALL.filter(k => config[k] == null);
    return (rounds && Object.keys(rounds).length > 0) ? [] : ALL;
  }

  it('reports all 4 fields missing for a name-only season', () => {
    assert.deepEqual(getMissingPlannerFields({ seasonName: 'X' }, {}), ALL);
  });

  it('reports none missing when all estimates are present (0 swaps counts as present)', () => {
    const cfg = { estimatedTotalPlayers: 12, estimatedSwaps: 0, estimatedFTCPlayers: 2, estimatedStartDate: 123 };
    assert.deepEqual(getMissingPlannerFields(cfg, {}), []);
  });

  it('reports only the missing subset (per-field)', () => {
    const cfg = { estimatedTotalPlayers: 12, estimatedStartDate: 123 };
    assert.deepEqual(getMissingPlannerFields(cfg, {}), ['estimatedSwaps', 'estimatedFTCPlayers']);
  });

  it('falls back to the rounds invariant when no config is passed', () => {
    assert.deepEqual(getMissingPlannerFields(null, {}), ALL);        // no rounds → not set up
    assert.deepEqual(getMissingPlannerFields(null, { r1: {} }), []); // rounds exist → set up
  });
});
