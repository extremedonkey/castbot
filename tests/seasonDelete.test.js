/**
 * Tests for the season delete cascade (deleteSeason, RaP 0908 Tier 1 + castlist unlink).
 * Pure mutation logic replicated inline to avoid storage I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function deleteSeasonCascade(g, configId) {
  const config = g.applicationConfigs?.[configId];
  if (!config) return { deleted: false, notFound: true };
  const seasonId = config.seasonId;
  let apps = 0, rounds = 0, challenges = 0, castlists = 0;

  for (const [channelId, app] of Object.entries(g.applications || {})) {
    if (app.configId === configId) { delete g.applications[channelId]; apps++; }
  }
  if (seasonId && g.seasonRounds?.[seasonId]) {
    rounds = Object.keys(g.seasonRounds[seasonId]).length;
    delete g.seasonRounds[seasonId];
  }
  for (const [chalId, chal] of Object.entries(g.challenges || {})) {
    if (seasonId && chal.seasonId === seasonId) { delete g.challenges[chalId]; challenges++; }
  }
  for (const cl of Object.values(g.castlistConfigs || {})) {
    if (seasonId && cl.seasonId === seasonId) { delete cl.seasonId; castlists++; }
  }
  delete g.applicationConfigs[configId];
  return { deleted: true, seasonName: config.seasonName, apps, rounds, challenges, castlists };
}

function fixture() {
  return {
    applicationConfigs: {
      cfgA: { seasonName: 'A', seasonId: 'sA' },
      cfgB: { seasonName: 'B', seasonId: 'sB' }
    },
    applications: {
      ch1: { configId: 'cfgA', rankings: { u1: 5 } },
      ch2: { configId: 'cfgA' },
      ch3: { configId: 'cfgB' } // belongs to B — must survive
    },
    seasonRounds: { sA: { r1: {}, r2: {} }, sB: { r1: {} } },
    challenges: {
      c1: { seasonId: 'sA' },
      c2: { seasonId: 'sA' },
      c3: { seasonId: 'sB' } // B's — must survive
    },
    castlistConfigs: {
      cl1: { seasonId: 'sA', settings: { sortStrategy: 'placements' } },
      cl2: { seasonId: 'sB' } // B's — link must survive
    }
  };
}

describe('deleteSeason cascade — Tier 1 + castlist unlink', () => {
  it('removes the season config', () => {
    const g = fixture();
    deleteSeasonCascade(g, 'cfgA');
    assert.equal(g.applicationConfigs.cfgA, undefined);
  });

  it('removes only this season\'s applications', () => {
    const g = fixture();
    const r = deleteSeasonCascade(g, 'cfgA');
    assert.equal(r.apps, 2);
    assert.equal(g.applications.ch1, undefined);
    assert.equal(g.applications.ch2, undefined);
    assert.ok(g.applications.ch3); // B's survives
  });

  it('removes rounds + season-owned challenges only', () => {
    const g = fixture();
    const r = deleteSeasonCascade(g, 'cfgA');
    assert.equal(r.rounds, 2);
    assert.equal(r.challenges, 2);
    assert.equal(g.seasonRounds.sA, undefined);
    assert.ok(g.seasonRounds.sB); // B's survives
    assert.equal(g.challenges.c1, undefined);
    assert.ok(g.challenges.c3); // B's survives
  });

  it('unlinks castlists (keeps them) — only this season\'s link', () => {
    const g = fixture();
    const r = deleteSeasonCascade(g, 'cfgA');
    assert.equal(r.castlists, 1);
    assert.ok(g.castlistConfigs.cl1); // castlist still exists
    assert.equal(g.castlistConfigs.cl1.seasonId, undefined); // link cleared
    assert.equal(g.castlistConfigs.cl1.settings.sortStrategy, 'placements'); // rest untouched
    assert.equal(g.castlistConfigs.cl2.seasonId, 'sB'); // B's link survives
  });

  it('leaves the other season fully intact', () => {
    const g = fixture();
    deleteSeasonCascade(g, 'cfgA');
    assert.ok(g.applicationConfigs.cfgB);
    assert.ok(g.seasonRounds.sB);
    assert.ok(g.challenges.c3);
  });

  it('returns notFound for a missing config', () => {
    const g = fixture();
    const r = deleteSeasonCascade(g, 'nope');
    assert.equal(r.deleted, false);
    assert.equal(r.notFound, true);
  });
});
