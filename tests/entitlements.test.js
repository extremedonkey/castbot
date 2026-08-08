/**
 * Entitlements — the runtime per-guild feature registry (premium hook).
 *
 * The module's load/save is fs-bound and lazily SEEDS the data file on first read,
 * so unit tests replicate the pure logic inline (TestingStandards) rather than
 * import it — an import-and-call would write entitlements.json into the repo.
 * Keep the replicas in sync with entitlements.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated from entitlements.js — keep in sync. (KNOWN_TIERS stands in for TIERS.)
const KNOWN_TIERS = { premium: true };
function normalize(data) {
  const guilds = (data && typeof data.guilds === 'object' && data.guilds) || {};
  const clean = {};
  for (const [guildId, entry] of Object.entries(guilds)) {
    if (!/^\d{5,}$/.test(guildId)) continue;
    clean[guildId] = {
      name: String(entry?.name || guildId),
      features: Array.isArray(entry?.features) ? entry.features.filter(f => typeof f === 'string') : [],
      addedBy: entry?.addedBy || null,
      addedAt: entry?.addedAt || null,
      ...(entry?.tier && KNOWN_TIERS[entry.tier] ? {
        tier: entry.tier,
        validUntil: Number.isFinite(entry.validUntil) ? entry.validUntil : null,
        source: entry.source === 'subscription' ? 'subscription' : 'manual',
        grantedBy: entry.grantedBy || null,
        grantedAt: entry.grantedAt || null,
        ...(typeof entry.reason === 'string' && entry.reason ? { reason: entry.reason } : {})
      } : {})
    };
  }
  return { guilds: clean };
}

const hasFeatureIn = (data, guildId, feature) => !!data.guilds[guildId]?.features?.includes(feature);

describe('Entitlements — normalize (shape guard)', () => {
  it('drops non-snowflake guild keys and non-string features', () => {
    const data = normalize({ guilds: {
      '1331657596087566398': { name: 'Real', features: ['safari_edit', 42, null] },
      'not-a-guild': { name: 'Fake', features: ['safari_edit'] },
      '__proto__x': { features: ['safari_edit'] }
    }});
    assert.deepEqual(Object.keys(data.guilds), ['1331657596087566398']);
    assert.deepEqual(data.guilds['1331657596087566398'].features, ['safari_edit']);
  });

  it('survives junk input entirely', () => {
    assert.deepEqual(normalize(null), { guilds: {} });
    assert.deepEqual(normalize({ guilds: 'lol' }), { guilds: {} });
    assert.deepEqual(normalize([]), { guilds: {} });
  });

  it('defaults name to the guild id and preserves grant metadata', () => {
    const data = normalize({ guilds: { '1234567890': { features: ['safari_edit'], addedBy: 'u1', addedAt: 5 } } });
    assert.equal(data.guilds['1234567890'].name, '1234567890');
    assert.equal(data.guilds['1234567890'].addedBy, 'u1');
  });

  it('carries v2 tier fields for a known tier; an UNKNOWN tier degrades to feature-only (never grants by accident)', () => {
    const data = normalize({ guilds: {
      '1111111111': { features: [], tier: 'premium', validUntil: 123, grantedBy: 'u1', reason: 'beta' },
      '2222222222': { features: ['ask_castbot'], tier: 'diamond_deluxe', validUntil: 123 }
    }});
    assert.equal(data.guilds['1111111111'].tier, 'premium');
    assert.equal(data.guilds['1111111111'].validUntil, 123);
    assert.equal(data.guilds['1111111111'].reason, 'beta');
    assert.equal(data.guilds['2222222222'].tier, undefined);
    assert.deepEqual(data.guilds['2222222222'].features, ['ask_castbot']);
  });

  it('non-finite validUntil normalizes to null (permanent), not NaN', () => {
    const data = normalize({ guilds: { '1111111111': { features: [], tier: 'premium', validUntil: 'soon' } } });
    assert.equal(data.guilds['1111111111'].validUntil, null);
  });
});

describe('Entitlements — feature checks', () => {
  const data = normalize({ guilds: {
    '1331657596087566398': { name: 'A', features: ['ask_castbot', 'safari_edit'] },
    '1524773737973682267': { name: 'B', features: ['ask_castbot'] },
    '1385679393237635122': { name: 'C', features: [] }
  }});

  it('grants only the guilds holding the feature', () => {
    assert.equal(hasFeatureIn(data, '1331657596087566398', 'safari_edit'), true);
    assert.equal(hasFeatureIn(data, '1524773737973682267', 'safari_edit'), false);
    assert.equal(hasFeatureIn(data, '999999999999999999', 'safari_edit'), false);
  });

  it('separates Q&A access from edit access — a guild can hold ask_castbot without safari_edit', () => {
    assert.equal(hasFeatureIn(data, '1524773737973682267', 'ask_castbot'), true);
    assert.equal(hasFeatureIn(data, '1524773737973682267', 'safari_edit'), false);
    assert.equal(hasFeatureIn(data, '1385679393237635122', 'ask_castbot'), false);
  });

  it('an unknown feature name never matches', () => {
    assert.equal(hasFeatureIn(data, '1331657596087566398', 'safari_edit_v2'), false);
  });
});

// Replicated from entitlements.js loadEntitlementsSync — keep in sync.
function backfill(data) {
  for (const entry of Object.values(data.guilds)) {
    if (entry.features.includes('safari_edit') && !entry.features.includes('ask_castbot')) {
      entry.features.unshift('ask_castbot');
    }
  }
  return data;
}

describe('Entitlements — ask_castbot backfill (registries written before the key existed)', () => {
  it('adds ask_castbot to every guild already holding safari_edit', () => {
    const data = backfill(normalize({ guilds: {
      '1331657596087566398': { name: 'A', features: ['safari_edit'] }
    }}));
    assert.deepEqual(data.guilds['1331657596087566398'].features, ['ask_castbot', 'safari_edit']);
  });

  it('leaves a guild with neither feature alone (revoked stays revoked)', () => {
    const data = backfill(normalize({ guilds: { '1331657596087566398': { name: 'A', features: [] } } }));
    assert.deepEqual(data.guilds['1331657596087566398'].features, []);
  });
});

// ── v2: tiers, expiry, grace ─────────────────────────────────────────────────
// resolveTierState / parseDuration / TIERS / GRACE_MS are PURE exports — importing
// them runs no fs code (the registry file is only touched by load/grant calls).
import { resolveTierState, parseDuration, TIERS, GRACE_MS, FEATURES } from '../entitlements.js';

describe('Entitlements v2 — resolveTierState lifecycle', () => {
  const NOW = 1_800_000_000_000;

  it('no tier (or unknown tier) → none', () => {
    assert.equal(resolveTierState(undefined, NOW).state, 'none');
    assert.equal(resolveTierState({ features: [] }, NOW).state, 'none');
    assert.equal(resolveTierState({ tier: 'gold_plated' }, NOW).state, 'none');
  });

  it('validUntil null → active permanently', () => {
    const ts = resolveTierState({ tier: 'premium', validUntil: null }, NOW);
    assert.equal(ts.state, 'active');
    assert.equal(ts.permanent, true);
  });

  it('before expiry → active; exactly at expiry still active (inclusive boundary)', () => {
    assert.equal(resolveTierState({ tier: 'premium', validUntil: NOW + 1 }, NOW).state, 'active');
    assert.equal(resolveTierState({ tier: 'premium', validUntil: NOW }, NOW).state, 'active');
  });

  it('past expiry but inside GRACE_MS → grace, with graceUntil = validUntil + GRACE_MS', () => {
    const ts = resolveTierState({ tier: 'premium', validUntil: NOW - 1000 }, NOW);
    assert.equal(ts.state, 'grace');
    assert.equal(ts.graceUntil, NOW - 1000 + GRACE_MS);
  });

  it('past grace → lapsed', () => {
    const ts = resolveTierState({ tier: 'premium', validUntil: NOW - GRACE_MS - 1000 }, NOW);
    assert.equal(ts.state, 'lapsed');
  });
});

describe('Entitlements v2 — feature resolution through tiers (hasFeatureSync core)', () => {
  // Replicated union logic from hasFeatureSync — keep in sync (the real fn reads the file).
  const effectiveHas = (entry, feature, now) => {
    if (entry.features?.includes(feature)) return true;
    const ts = resolveTierState(entry, now);
    if (ts.state !== 'active' && ts.state !== 'grace') return false;
    return TIERS[ts.tier].features.includes(feature);
  };
  const NOW = 1_800_000_000_000;

  it('an active premium tier grants the whole bundle', () => {
    const entry = { features: [], tier: 'premium', validUntil: NOW + 86400000 };
    assert.equal(effectiveHas(entry, FEATURES.ASK_CASTBOT, NOW), true);
    assert.equal(effectiveHas(entry, FEATURES.SAFARI_EDIT, NOW), true);
  });

  it('grace keeps features working (RaP 0891: 7-day grace, never a mid-season cliff)', () => {
    const entry = { features: [], tier: 'premium', validUntil: NOW - 1000 };
    assert.equal(effectiveHas(entry, FEATURES.ASK_CASTBOT, NOW), true);
  });

  it('lapsed tier grants nothing — but à-la-carte feature grants survive the lapse', () => {
    const lapsed = { features: [], tier: 'premium', validUntil: NOW - GRACE_MS - 1 };
    assert.equal(effectiveHas(lapsed, FEATURES.ASK_CASTBOT, NOW), false);
    const lapsedWithGrant = { features: [FEATURES.ASK_CASTBOT], tier: 'premium', validUntil: NOW - GRACE_MS - 1 };
    assert.equal(effectiveHas(lapsedWithGrant, FEATURES.ASK_CASTBOT, NOW), true);
    assert.equal(effectiveHas(lapsedWithGrant, FEATURES.SAFARI_EDIT, NOW), false);
  });
});

describe('Entitlements v2 — parseDuration', () => {
  it('accepts the documented units', () => {
    assert.equal(parseDuration('30d').ms, 30 * 86400000);
    assert.equal(parseDuration('12h').ms, 12 * 3600000);
    assert.equal(parseDuration('45min').ms, 45 * 60000);
    assert.equal(parseDuration('2w').ms, 2 * 604800000);
    assert.equal(parseDuration('3mo').ms, 3 * 2592000000);
  });

  it('bare number = days; blank/perm/permanent = null (no expiry)', () => {
    assert.equal(parseDuration('14').ms, 14 * 86400000);
    assert.equal(parseDuration('').ms, null);
    assert.equal(parseDuration('  ').ms, null);
    assert.equal(parseDuration('perm').ms, null);
    assert.equal(parseDuration('Permanent').ms, null);
  });

  it('rejects ambiguous "m", zero, and garbage — with ok:false, never a throw', () => {
    assert.equal(parseDuration('3m').ok, false);
    assert.equal(parseDuration('0d').ok, false);
    assert.equal(parseDuration('a month').ok, false);
    assert.equal(parseDuration('-5d').ok, false);
  });
});
