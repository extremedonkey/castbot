/**
 * Entitlements UI — pure formatter coverage. formatGuildLine is a pure export
 * (no fs at import time); the async builders are Discord-I/O and not unit-tested.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatGuildLine, selectExpiringSoon, formatExpiringLine, EXPIRING_SOON_MS } from '../entitlementsUI.js';

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

// ── Expiring Soon ────────────────────────────────────────────────────────────

const NOW = 1_800_000_000_000;
const days = n => n * 24 * 60 * 60 * 1000;
const guild = (name, tierState) => ({ ...base, displayName: name, tierState });
const active = (validUntil) => ({ state: 'active', tier: 'premium', permanent: false, validUntil, graceUntil: validUntil + days(7) });

describe('EntitlementsUI — selectExpiringSoon', () => {
  it('includes a dated tier inside the two-week window, excludes one beyond it', () => {
    const soon = guild('Soon', active(NOW + days(3)));
    const later = guild('Later', active(NOW + days(40)));
    const picked = selectExpiringSoon([soon, later], NOW);
    assert.deepEqual(picked.map(g => g.displayName), ['Soon']);
  });

  it('includes grace regardless of how far past expiry it is — most urgent case', () => {
    const grace = guild('Grace', { state: 'grace', tier: 'premium', permanent: false, validUntil: NOW - days(3), graceUntil: NOW + days(4) });
    assert.equal(selectExpiringSoon([grace], NOW).length, 1);
  });

  it('excludes permanent, no-tier, and fully-lapsed guilds', () => {
    const perm = guild('Perm', { state: 'active', tier: 'premium', permanent: true, validUntil: null });
    const none = guild('None', { state: 'none', tier: null });
    const lapsed = guild('Lapsed', { state: 'lapsed', tier: 'premium', permanent: false, validUntil: NOW - days(30), graceUntil: NOW - days(23) });
    assert.deepEqual(selectExpiringSoon([perm, none, lapsed, guild('NoState', undefined)], NOW), []);
  });

  it('sorts soonest-first so the top line is the most urgent', () => {
    const a = guild('A', active(NOW + days(10)));
    const b = guild('B', active(NOW + days(1)));
    const c = guild('C', active(NOW + days(5)));
    assert.deepEqual(selectExpiringSoon([a, b, c], NOW).map(g => g.displayName), ['B', 'C', 'A']);
  });

  it('treats the window edge inclusively and tolerates an empty/missing list', () => {
    const edge = guild('Edge', active(NOW + EXPIRING_SOON_MS));
    assert.equal(selectExpiringSoon([edge], NOW).length, 1);
    assert.deepEqual(selectExpiringSoon([], NOW), []);
    assert.deepEqual(selectExpiringSoon(undefined, NOW), []);
  });
});

describe('EntitlementsUI — formatExpiringLine', () => {
  it('active renders an expiry countdown', () => {
    const line = formatExpiringLine(guild('EpochORG', active(NOW + days(2))));
    assert.ok(line.startsWith('⏳'));
    assert.ok(line.includes(`expires <t:${Math.floor((NOW + days(2)) / 1000)}:R>`));
  });

  it('grace names both the expiry and the grace deadline', () => {
    const line = formatExpiringLine(guild('EpochORG', { state: 'grace', tier: 'premium', permanent: false, validUntil: NOW - days(1), graceUntil: NOW + days(6) }));
    assert.ok(line.startsWith('🕒'));
    assert.ok(line.includes('grace ends <t:'));
  });
});
