// Tests for spelled-out season number parsing in vanity_role sort.
// Logic replicated inline from castlistSorter.js parseSeasonNumber/wordsToNumber
// (per TestingStandards: avoid importing heavy modules).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
};
const TENS_WORDS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

function wordsToNumber(phrase) {
  const tokens = phrase.toLowerCase().trim().split(/[\s-]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 2) return null;
  if (tokens.length === 1) {
    const w = tokens[0];
    if (NUMBER_WORDS[w] !== undefined) return NUMBER_WORDS[w];
    if (TENS_WORDS[w] !== undefined) return TENS_WORDS[w];
    return null;
  }
  const tens = TENS_WORDS[tokens[0]];
  const ones = NUMBER_WORDS[tokens[1]];
  if (tens !== undefined && ones !== undefined && ones < 10) return tens + ones;
  return null;
}

function parseSeasonNumber(roleName) {
  if (!roleName) return null;
  const sxMatch = roleName.match(/^S(\d{1,2}(?:\.\d+)?)\s/i);
  if (sxMatch) return { type: 'season', number: parseFloat(sxMatch[1]) };
  const seasonMatch = roleName.match(/^Season\s+(\d{1,2}(?:\.\d+)?)/i);
  if (seasonMatch) return { type: 'season', number: parseFloat(seasonMatch[1]) };
  const wordMatch = roleName.match(/^Season\s+([A-Za-z][A-Za-z\s-]*)$/i);
  if (wordMatch) {
    const num = wordsToNumber(wordMatch[1]);
    if (num !== null) return { type: 'season', number: num };
  }
  return null;
}

describe('parseSeasonNumber — spelled-out season numbers', () => {
  it('parses single-word numbers', () => {
    assert.equal(parseSeasonNumber('Season One')?.number, 1);
    assert.equal(parseSeasonNumber('Season Seven')?.number, 7);
    assert.equal(parseSeasonNumber('Season Ten')?.number, 10);
    assert.equal(parseSeasonNumber('Season Two')?.number, 2);
  });

  it('orders Ten after Two (the bug we set out to fix)', () => {
    assert.ok(parseSeasonNumber('Season Two').number < parseSeasonNumber('Season Ten').number);
  });

  it('parses teens and tens', () => {
    assert.equal(parseSeasonNumber('Season Eleven')?.number, 11);
    assert.equal(parseSeasonNumber('Season Nineteen')?.number, 19);
    assert.equal(parseSeasonNumber('Season Twenty')?.number, 20);
  });

  it('parses compound numbers (space and hyphen)', () => {
    assert.equal(parseSeasonNumber('Season Twenty One')?.number, 21);
    assert.equal(parseSeasonNumber('Season Thirty-Five')?.number, 35);
  });

  it('is case-insensitive', () => {
    assert.equal(parseSeasonNumber('season ten')?.number, 10);
    assert.equal(parseSeasonNumber('SEASON ONE')?.number, 1);
  });

  it('does NOT match non-number role names (left untouched → null)', () => {
    assert.equal(parseSeasonNumber('Season Pass'), null);
    assert.equal(parseSeasonNumber('Seasonal Vibes'), null);
    assert.equal(parseSeasonNumber('Season Finale'), null);
    assert.equal(parseSeasonNumber('Winners'), null);
    assert.equal(parseSeasonNumber('Season One Winner'), null); // trailing junk → not a clean number
    assert.equal(parseSeasonNumber('Season Twenty Ten'), null); // invalid compound
  });

  it('still parses digit forms (no regression)', () => {
    assert.equal(parseSeasonNumber('Season 1')?.number, 1);
    assert.equal(parseSeasonNumber('Season 11')?.number, 11);
    assert.equal(parseSeasonNumber('S6.5 - Returns')?.number, 6.5);
  });
});
