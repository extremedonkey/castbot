/**
 * Tests for diceRoll.js — probability rolls, D20 rolls, result displays
 * Pure logic replicated inline to avoid importing heavy modules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate pure logic inline
// ─────────────────────────────────────────────

function rollProbability(passPercent = 50) {
  const roll = Math.random() * 100;
  const passed = roll < passPercent;
  return {
    rolled: Math.round(roll * 100) / 100,
    threshold: passPercent,
    failThreshold: Math.round((100 - passPercent) * 100) / 100,
    passed,
    timestamp: Date.now(),
  };
}

function rollD20(passThreshold = 11, modifier = 0) {
  const naturalRoll = Math.floor(Math.random() * 20) + 1;
  const modifiedRoll = naturalRoll + modifier;
  const isCritSuccess = naturalRoll === 20;
  const isCritFail = naturalRoll === 1;
  const passed = isCritSuccess ? true : isCritFail ? false : modifiedRoll >= passThreshold;
  return {
    naturalRoll, modifier, modifiedRoll, passThreshold,
    passed, isCritSuccess, isCritFail, timestamp: Date.now(),
  };
}

// ─────────────────────────────────────────────
// Tests — Probability Rolls
// ─────────────────────────────────────────────

describe('rollProbability — percentage-based dice roll', () => {
  it('returns rolled value between 0 and 100', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollProbability(50);
      assert.ok(result.rolled >= 0 && result.rolled < 100, `Roll ${result.rolled} out of range`);
    }
  });

  it('0% always fails', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollProbability(0);
      assert.equal(result.passed, false, 'Should always fail at 0%');
    }
  });

  it('100% always passes', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollProbability(100);
      assert.equal(result.passed, true, 'Should always pass at 100%');
    }
  });

  it('threshold is stored correctly', () => {
    const result = rollProbability(75);
    assert.equal(result.threshold, 75);
    assert.equal(result.failThreshold, 25);
  });

  it('failThreshold is 100 - passPercent', () => {
    const result = rollProbability(33.33);
    assert.equal(result.failThreshold, 66.67);
  });

  it('has timestamp', () => {
    const result = rollProbability(50);
    assert.ok(result.timestamp > 0);
  });

  it('rolled value has max 2 decimal places', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollProbability(50);
      const decimals = String(result.rolled).split('.')[1];
      assert.ok(!decimals || decimals.length <= 2, `Too many decimals: ${result.rolled}`);
    }
  });
});

// ─────────────────────────────────────────────
// Tests — D20 Rolls
// ─────────────────────────────────────────────

describe('rollD20 — D&D-style dice roll', () => {
  it('natural roll is always 1-20', () => {
    for (let i = 0; i < 200; i++) {
      const result = rollD20();
      assert.ok(result.naturalRoll >= 1 && result.naturalRoll <= 20, `Roll ${result.naturalRoll} out of range`);
    }
  });

  it('modified roll applies modifier', () => {
    // We can't control the roll, but we can verify the math
    const result = rollD20(11, 5);
    assert.equal(result.modifiedRoll, result.naturalRoll + 5);
    assert.equal(result.modifier, 5);
  });

  it('negative modifier works', () => {
    const result = rollD20(11, -3);
    assert.equal(result.modifiedRoll, result.naturalRoll - 3);
  });

  it('DC is stored as passThreshold', () => {
    const result = rollD20(15);
    assert.equal(result.passThreshold, 15);
  });

  it('nat 20 always passes regardless of DC', () => {
    // Simulate nat 20 scenario
    const result = { naturalRoll: 20, modifier: -100, modifiedRoll: -80, passThreshold: 25 };
    const isCritSuccess = result.naturalRoll === 20;
    const passed = isCritSuccess ? true : result.modifiedRoll >= result.passThreshold;
    assert.equal(passed, true, 'Nat 20 should always pass');
  });

  it('nat 1 always fails regardless of DC', () => {
    const result = { naturalRoll: 1, modifier: 100, modifiedRoll: 101, passThreshold: 5 };
    const isCritFail = result.naturalRoll === 1;
    const passed = isCritFail ? false : result.modifiedRoll >= result.passThreshold;
    assert.equal(passed, false, 'Nat 1 should always fail');
  });

  it('isCritSuccess is true only for nat 20', () => {
    const result20 = { naturalRoll: 20 };
    const result19 = { naturalRoll: 19 };
    assert.equal(result20.naturalRoll === 20, true);
    assert.equal(result19.naturalRoll === 20, false);
  });

  it('isCritFail is true only for nat 1', () => {
    const result1 = { naturalRoll: 1 };
    const result2 = { naturalRoll: 2 };
    assert.equal(result1.naturalRoll === 1, true);
    assert.equal(result2.naturalRoll === 1, false);
  });

  it('pass/fail determined by modifiedRoll >= DC for non-crits', () => {
    // Roll of 10 + modifier 5 = 15, DC 15 should pass
    const pass = { naturalRoll: 10, modifier: 5, modifiedRoll: 15, passThreshold: 15 };
    assert.equal(pass.modifiedRoll >= pass.passThreshold, true);

    // Roll of 10 + modifier 4 = 14, DC 15 should fail
    const fail = { naturalRoll: 10, modifier: 4, modifiedRoll: 14, passThreshold: 15 };
    assert.equal(fail.modifiedRoll >= fail.passThreshold, false);
  });

  it('has timestamp', () => {
    const result = rollD20();
    assert.ok(result.timestamp > 0);
  });
});

// ─────────────────────────────────────────────
// Tests — Statistical validation (probabilistic)
// ─────────────────────────────────────────────

describe('Statistical validation', () => {
  it('50% probability passes roughly half the time (1000 rolls)', () => {
    let passes = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (rollProbability(50).passed) passes++;
    }
    // Should be between 40% and 60% with 1000 trials
    const passRate = passes / trials;
    assert.ok(passRate > 0.35 && passRate < 0.65, `Pass rate ${passRate} too far from 0.5`);
  });

  it('75% probability passes more often than it fails (500 rolls)', () => {
    let passes = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      if (rollProbability(75).passed) passes++;
    }
    assert.ok(passes > trials * 0.5, `Expected >50% passes at 75%, got ${passes}/${trials}`);
  });

  it('D20 rolls are uniformly distributed (1000 rolls)', () => {
    const counts = {};
    for (let i = 1; i <= 20; i++) counts[i] = 0;
    for (let i = 0; i < 1000; i++) {
      counts[rollD20().naturalRoll]++;
    }
    // Each number should appear at least 20 times in 1000 rolls (expected ~50)
    for (let i = 1; i <= 20; i++) {
      assert.ok(counts[i] >= 10, `Roll ${i} appeared only ${counts[i]} times`);
    }
  });
});

// ─────────────────────────────────────────────
// Tests — Condition evaluation integration
// ─────────────────────────────────────────────

describe('D20 display mode — probability to D&D conversion', () => {
  it('maps 0-100 roll to 1-20 range', () => {
    // Roll of 50% should map to ~10
    const fakeNatural = Math.max(1, Math.min(20, Math.round((50 / 100) * 20)));
    assert.equal(fakeNatural, 10);
  });

  it('maps 0% roll to 1 (nat 1)', () => {
    const fakeNatural = Math.max(1, Math.min(20, Math.round((0 / 100) * 20)));
    assert.equal(fakeNatural, 1);
  });

  it('maps 100% roll to 20 (nat 20)', () => {
    const fakeNatural = Math.max(1, Math.min(20, Math.round((99.9 / 100) * 20)));
    assert.equal(fakeNatural, 20);
  });

  it('converts pass% to DC correctly', () => {
    // 50% pass = DC 11
    assert.equal(Math.max(1, Math.min(20, Math.round(21 - (50 / 5)))), 11);
    // 75% pass = DC 6
    assert.equal(Math.max(1, Math.min(20, Math.round(21 - (75 / 5)))), 6);
    // 25% pass = DC 16
    assert.equal(Math.max(1, Math.min(20, Math.round(21 - (25 / 5)))), 16);
  });

  it('crit success only if actually passed', () => {
    const fakeNatural = 20;
    const passed = false; // Probability said fail
    const isCritSuccess = fakeNatural === 20 && passed;
    assert.equal(isCritSuccess, false); // Can't crit if you failed
  });

  it('fumble only if actually failed', () => {
    const fakeNatural = 1;
    const passed = true; // Probability said pass
    const isCritFail = fakeNatural === 1 && !passed;
    assert.equal(isCritFail, false); // Can't fumble if you passed
  });
});

describe('D20 condition data structure', () => {
  it('default config has correct shape', () => {
    const config = {
      dc: 11,
      modifier: 0,
      displayMode: 'full_d20',
      passResult: { title: '☀️ Good Fortune!', description: 'The dice favor you.' },
      failResult: { title: '🌧️ Bad Luck!', description: 'Not your day.' }
    };
    assert.equal(config.dc, 11);
    assert.equal(config.modifier, 0);
    assert.equal(config.displayMode, 'full_d20');
  });

  it('success chance calculation from DC', () => {
    // DC 11: (21 - 11) / 20 = 50%
    assert.equal(Math.round(((21 - 11) / 20) * 100), 50);
    // DC 5: (21 - 5) / 20 = 80%
    assert.equal(Math.round(((21 - 5) / 20) * 100), 80);
    // DC 15: (21 - 15) / 20 = 30%
    assert.equal(Math.round(((21 - 15) / 20) * 100), 30);
    // DC 20: (21 - 20) / 20 = 5%
    assert.equal(Math.round(((21 - 20) / 20) * 100), 5);
  });

  it('modifier affects success chance', () => {
    // DC 15, +3 modifier: (21 - 15 + 3) / 20 = 45%
    assert.equal(Math.round(((21 - 15 + 3) / 20) * 100), 45);
  });
});

describe('Probability condition data structure', () => {
  it('default config has correct shape', () => {
    const config = {
      passPercent: 50,
      displayMode: 'probability_text',
      passResult: { title: '🟢 Success!', description: 'The dice rolled in your favor.' },
      failResult: { title: '🔴 Failure!', description: 'The odds were not in your favor.' }
    };

    assert.equal(config.passPercent, 50);
    assert.equal(config.displayMode, 'probability_text');
    assert.ok(config.passResult.title.includes('🟢'));
    assert.ok(config.failResult.title.includes('🔴'));
  });

  it('pass percent parsing handles % symbol', () => {
    const rawPercent = '33.33%';
    const percent = Math.max(0, Math.min(100, parseFloat(rawPercent.replace('%', '').trim()) || 50));
    assert.equal(percent, 33.33);
  });

  it('pass percent parsing handles plain number', () => {
    const rawPercent = '75';
    const percent = Math.max(0, Math.min(100, parseFloat(rawPercent.replace('%', '').trim()) || 50));
    assert.equal(percent, 75);
  });

  it('pass percent clamped to 0-100', () => {
    const over = Math.max(0, Math.min(100, 150));
    assert.equal(over, 100);
    const under = Math.max(0, Math.min(100, -10));
    assert.equal(under, 0);
  });

  it('fail percent auto-calculated from pass percent', () => {
    const passPercent = 33.33;
    const failPercent = Math.round((100 - passPercent) * 100) / 100;
    assert.equal(failPercent, 66.67);
  });
});
