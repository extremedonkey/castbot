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

// Replicated from entitlements.js — keep in sync.
function normalize(data) {
  const guilds = (data && typeof data.guilds === 'object' && data.guilds) || {};
  const clean = {};
  for (const [guildId, entry] of Object.entries(guilds)) {
    if (!/^\d{5,}$/.test(guildId)) continue;
    clean[guildId] = {
      name: String(entry?.name || guildId),
      features: Array.isArray(entry?.features) ? entry.features.filter(f => typeof f === 'string') : [],
      addedBy: entry?.addedBy || null,
      addedAt: entry?.addedAt || null
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
});

describe('Entitlements — feature checks', () => {
  const data = normalize({ guilds: {
    '1331657596087566398': { name: 'A', features: ['safari_edit'] },
    '1524773737973682267': { name: 'B', features: [] }
  }});

  it('grants only the guilds holding the feature', () => {
    assert.equal(hasFeatureIn(data, '1331657596087566398', 'safari_edit'), true);
    assert.equal(hasFeatureIn(data, '1524773737973682267', 'safari_edit'), false);
    assert.equal(hasFeatureIn(data, '999999999999999999', 'safari_edit'), false);
  });

  it('an unknown feature name never matches', () => {
    assert.equal(hasFeatureIn(data, '1331657596087566398', 'safari_edit_v2'), false);
  });
});
