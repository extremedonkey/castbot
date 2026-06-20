// Tests for the player-card "safari stats line" economy gate.
//
// Jason feedback (2026-06-18): in servers where Safari hasn't started, every profile
// showed a pointless "🪙 0 • 🧰 0". Reece: "only shows up once they've got some money or
// items". The currency+inventory pair now renders only when currency > 0 OR itemTotal > 0;
// it shows/hides together. Location/stamina parts remain independent.
//
// Pure logic replicated inline per TestingStandards.md (mirrors playerManagement.js:164-220).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// itemTotal reducer — handles current {quantity} object shape AND legacy plain-number shape.
function itemTotal(inv = {}) {
  return Object.values(inv).reduce(
    (sum, v) => sum + (typeof v === 'object' ? (v?.quantity || 0) : (v || 0)),
    0
  );
}

// Builds the parts array exactly like createPlayerDisplaySection, given a safari blob + extras.
function buildStatsParts(sp = {}, { currencyEmoji = '🪙', inventoryEmoji = '🧰', location = null, stamina = null } = {}) {
  const currency = sp.currency ?? 0;
  const total = itemTotal(sp.inventory || {});
  const showEconomy = currency > 0 || total > 0;
  const parts = showEconomy
    ? [`${currencyEmoji} ${currency}`, `${inventoryEmoji} ${total}`]
    : [];
  if (location) parts.push(`📍 ${location}`);
  if (stamina) parts.push(`⚡ ${stamina}`);
  return parts;
}

const statsLine = (...args) => buildStatsParts(...args).join(' • ');

describe('Player card — economy line gate', () => {
  it('hides currency/inventory when the player has no money and no items', () => {
    assert.equal(statsLine({ currency: 0, inventory: {} }), '');
  });

  it('hides when there is no safari data at all', () => {
    assert.equal(statsLine({}), '');
    assert.equal(statsLine(undefined), '');
  });

  it('shows the pair when the player has money (even with 0 items)', () => {
    assert.equal(statsLine({ currency: 5, inventory: {} }), '🪙 5 • 🧰 0');
  });

  it('shows the pair when the player has items (even with 0 money)', () => {
    assert.equal(statsLine({ currency: 0, inventory: { sword_1: { quantity: 2 } } }), '🪙 0 • 🧰 2');
  });

  it('counts legacy plain-number inventory entries too', () => {
    assert.equal(statsLine({ currency: 0, inventory: { nurturer_1: 1, scout_2: 3 } }), '🪙 0 • 🧰 4');
  });

  it('respects custom currency/inventory emojis', () => {
    assert.equal(
      statsLine({ currency: 7, inventory: {} }, { currencyEmoji: 'Ⓜ', inventoryEmoji: '🎒' }),
      'Ⓜ 7 • 🎒 0'
    );
  });

  it('still renders location/stamina independently when economy is hidden', () => {
    assert.equal(statsLine({ currency: 0, inventory: {} }, { location: 'B3', stamina: '5/5' }), '📍 B3 • ⚡ 5/5');
  });

  it('prepends the economy pair before location/stamina when shown', () => {
    assert.equal(
      statsLine({ currency: 10, inventory: { x: 1 } }, { location: 'A1', stamina: '3/5' }),
      '🪙 10 • 🧰 1 • 📍 A1 • ⚡ 3/5'
    );
  });
});
