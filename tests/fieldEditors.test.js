import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Pure logic replicated from fieldEditors.js (avoids importing heavy modules) ---

// Mirrors the numeric branch of parseModalSubmission's switch.
function parseNumericField(fieldId, value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = parseInt(value, 10);
  if (isNaN(num)) throw new Error(`${fieldId} must be a number`);
  return num;
}

// Mirrors the turnOrder branch.
function parseTurnOrder(value) {
  return value || 'player_first';
}

// Mirrors numericFieldValue() used when rendering Text Input values.
function numericFieldValue(v) {
  if (v === null || v === undefined || v === '') return '';
  return isNaN(Number(v)) ? '' : v.toString();
}

describe('parseModalSubmission — numeric fields no longer default to player_first', () => {
  for (const field of ['basePrice', 'goodOutcomeValue', 'badOutcomeValue', 'attackValue', 'defenseValue', 'staminaBoost']) {
    it(`${field} left blank parses to null (not 'player_first')`, () => {
      assert.equal(parseNumericField(field, ''), null);
      assert.equal(parseNumericField(field, undefined), null);
      assert.equal(parseNumericField(field, null), null);
    });

    it(`${field} parses a valid number`, () => {
      assert.equal(parseNumericField(field, '42'), 42);
      assert.equal(parseNumericField(field, '-5'), -5);
    });

    it(`${field} throws on non-numeric input`, () => {
      assert.throws(() => parseNumericField(field, 'player_first'), /must be a number/);
      assert.throws(() => parseNumericField(field, 'abc'), /must be a number/);
    });
  }

  it('turnOrder still defaults to player_first when blank', () => {
    assert.equal(parseTurnOrder(''), 'player_first');
    assert.equal(parseTurnOrder('enemy_first'), 'enemy_first');
  });
});

describe('numericFieldValue — renders legacy-corrupt values safely', () => {
  it('renders blank for the legacy player_first corruption', () => {
    // 'player_first' is 12 chars and would overflow a max_length:4 input,
    // causing Discord to silently reject the whole modal.
    assert.equal(numericFieldValue('player_first'), '');
  });

  it('renders blank for null/undefined/empty', () => {
    assert.equal(numericFieldValue(null), '');
    assert.equal(numericFieldValue(undefined), '');
    assert.equal(numericFieldValue(''), '');
  });

  it('renders numeric values (including 0 and negatives) as strings', () => {
    assert.equal(numericFieldValue(0), '0');
    assert.equal(numericFieldValue(42), '42');
    assert.equal(numericFieldValue(-5), '-5');
    assert.equal(numericFieldValue('100'), '100');
  });
});
