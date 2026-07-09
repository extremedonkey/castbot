// Tests for the Ultrathink Health Monitor environment labeling.
// Pure logic replicated inline per TestingStandards.md (healthMonitor.js imports
// botEmojis/restartTracker which log at module load — unsafe to import here).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicated from src/monitoring/healthMonitor.getEnvName (single source of truth) ──
// Three-way env detection matching scripts/notify-restart.js: the always-on test box
// (castbot-blue) runs INSTANCE_ROLE=test with PRODUCTION=FALSE, so a two-way
// PRODUCTION check mislabels it "Dev" (the bug this guards against).
function getEnvName(env = {}) {
  return env.INSTANCE_ROLE === 'test' ? 'Test' : env.PRODUCTION === 'TRUE' ? 'Prod' : 'Dev';
}

describe('Health Monitor — environment label (getEnvName)', () => {
  it('test box (INSTANCE_ROLE=test, PRODUCTION=FALSE) labels Test — the reported bug', () => {
    assert.equal(getEnvName({ INSTANCE_ROLE: 'test', PRODUCTION: 'FALSE' }), 'Test');
  });

  it('INSTANCE_ROLE=test wins even if PRODUCTION=TRUE (blue/green flip safety)', () => {
    assert.equal(getEnvName({ INSTANCE_ROLE: 'test', PRODUCTION: 'TRUE' }), 'Test');
  });

  it('production labels Prod', () => {
    assert.equal(getEnvName({ PRODUCTION: 'TRUE' }), 'Prod');
  });

  it('dev laptop (no flags / PRODUCTION=FALSE) labels Dev', () => {
    assert.equal(getEnvName({}), 'Dev');
    assert.equal(getEnvName({ PRODUCTION: 'FALSE' }), 'Dev');
  });

  it('webhook author renders as CastBot Health Monitor - <Env>', () => {
    const name = (env) => `CastBot Health Monitor - ${getEnvName(env)}`;
    assert.equal(name({ INSTANCE_ROLE: 'test' }), 'CastBot Health Monitor - Test');
    assert.equal(name({ PRODUCTION: 'TRUE' }), 'CastBot Health Monitor - Prod');
    assert.equal(name({}), 'CastBot Health Monitor - Dev');
  });
});
