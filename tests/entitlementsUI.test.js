/**
 * Entitlements UI — pure formatter coverage. formatGuildLine is a pure export
 * (no fs at import time); the async builders are Discord-I/O and not unit-tested.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatGuildLine } from '../entitlementsUI.js';

const base = { guildId: '1234567890', displayName: 'EpochORG', features: [], effectiveFeatures: [] };

describe('EntitlementsUI — formatGuildLine', () => {
  it('shows feature glyphs from effective features (tier-derived included)', () => {
    const line = formatGuildLine({ ...base, effectiveFeatures: ['ask_castbot', 'safari_edit'], tierState: { state: 'none', tier: null } });
    assert.ok(line.startsWith('👾🛠️'));
    assert.ok(line.includes('**EpochORG**'));
  });

  it('permanent premium shows the tier badge without a date', () => {
    const line = formatGuildLine({ ...base, effectiveFeatures: ['ask_castbot'], tierState: { state: 'active', tier: 'premium', permanent: true } });
    assert.ok(line.includes('⭐ Premium'));
    assert.ok(!line.includes('until <t:'));
  });

  it('expiring premium shows a Discord date; grace and lapsed get their own badges', () => {
    const active = formatGuildLine({ ...base, effectiveFeatures: [], tierState: { state: 'active', tier: 'premium', permanent: false, validUntil: 1785103200000, graceUntil: 1785708000000 } });
    assert.ok(active.includes('until <t:1785103200:d>'));
    const grace = formatGuildLine({ ...base, effectiveFeatures: [], tierState: { state: 'grace', tier: 'premium', permanent: false, validUntil: 1, graceUntil: 604800001 } });
    assert.ok(grace.includes('🕒'));
    const lapsed = formatGuildLine({ ...base, effectiveFeatures: [], tierState: { state: 'lapsed', tier: 'premium', permanent: false, validUntil: 1, graceUntil: 2 } });
    assert.ok(lapsed.includes('💀'));
  });

  it('flags guilds the bot is no longer in (displayName fell back to the id)', () => {
    const line = formatGuildLine({ ...base, displayName: base.guildId, tierState: { state: 'none', tier: null } });
    assert.ok(line.includes('bot not in this server'));
  });
});
