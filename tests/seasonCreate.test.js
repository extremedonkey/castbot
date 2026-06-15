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

  const anyEstimate = [fields.est_players, fields.est_swaps, fields.est_ftc, fields.est_start_date]
    .some(v => v != null && String(v).trim() !== '');

  let hasPlannerData = false;
  let players, swaps, ftc, startDate;
  if (anyEstimate) {
    players = parseInt(fields.est_players);
    swaps = parseInt(fields.est_swaps);
    ftc = parseInt(fields.est_ftc);
    startDate = parseStartDate(fields.est_start_date);

    if (isNaN(players) || players < 1) errors.push('Players must be a number > 0');
    if (isNaN(swaps) || swaps < 0) errors.push('Swaps must be a number ≥ 0');
    if (isNaN(ftc) || ftc < 1) errors.push('FTC players must be a number > 0');
    if (!startDate) errors.push('Start date must be in mm/dd/yyyy format');
    if (!isNaN(players) && !isNaN(ftc) && ftc >= players) errors.push('FTC players must be less than total players');

    hasPlannerData = errors.length === 0;
  }

  return {
    valid: errors.length === 0,
    errors,
    hasPlannerData,
    data: {
      seasonName,
      hasPlannerData,
      estimatedTotalPlayers: hasPlannerData ? players : null,
      estimatedSwaps: hasPlannerData ? swaps : null,
      estimatedFTCPlayers: hasPlannerData ? ftc : null,
      estimatedStartDate: hasPlannerData && startDate ? startDate.getTime() : null,
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

describe('Unified season create — partial/invalid estimates are rejected', () => {
  it('rejects partial estimates (players given, others blank)', () => {
    const r = validatePlannerFields({ season_name: 'Partial', est_players: '18' });
    assert.equal(r.valid, false);
    assert.equal(r.hasPlannerData, false);
  });

  it('rejects FTC >= players', () => {
    const r = validatePlannerFields({
      season_name: 'Bad', est_players: '5', est_swaps: '1', est_ftc: '5', est_start_date: '03/07/2026'
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => /FTC/i.test(e)));
  });

  it('rejects a malformed start date', () => {
    const r = validatePlannerFields({
      season_name: 'BadDate', est_players: '18', est_swaps: '2', est_ftc: '3', est_start_date: '3/7/26'
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => /date/i.test(e)));
  });
});
