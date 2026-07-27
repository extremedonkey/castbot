import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure logic replicated inline (avoids importing the module, which pulls in network/SSH deps).
// Keep in sync with src/monitoring/prodWatchdog.js evaluateProbe().
function evaluateProbe(state, healthy, now, opts = {}) {
  const threshold = opts.threshold ?? 1;
  const reAlertMs = opts.reAlertMs ?? 30 * 60_000;
  const autoRemediate = opts.autoRemediate ?? true;
  const remediateAfterMs = opts.remediateAfterMs ?? 15 * 60_000;
  const remediateCooldownMs = opts.remediateCooldownMs ?? 30 * 60_000;
  const maxRemediations = opts.maxRemediations ?? 2;
  let { consecutiveFailures, isDown, lastAlertAt, downSince = 0, remediationAttempts = 0, lastRemediationAt = 0 } = state;
  let action = null;

  if (healthy) {
    if (isDown) { action = 'RECOVERY'; lastAlertAt = now; }
    consecutiveFailures = 0;
    isDown = false;
    downSince = 0;
    remediationAttempts = 0;
    lastRemediationAt = 0;
  } else {
    consecutiveFailures += 1;
    if (consecutiveFailures === 1) downSince = now;
    if (!isDown && consecutiveFailures >= threshold) {
      action = 'DOWN'; isDown = true; lastAlertAt = now;
    } else if (isDown) {
      const remediationDue = autoRemediate
        && remediationAttempts < maxRemediations
        && (now - downSince) >= remediateAfterMs
        && (lastRemediationAt === 0 || (now - lastRemediationAt) >= remediateCooldownMs);
      if (remediationDue) {
        action = 'AUTO_REMEDIATE'; remediationAttempts += 1; lastRemediationAt = now; lastAlertAt = now;
      } else if ((now - lastAlertAt) >= reAlertMs) {
        action = 'REMINDER'; lastAlertAt = now;
      }
    }
  }

  return { state: { consecutiveFailures, isDown, lastAlertAt, downSince, remediationAttempts, lastRemediationAt }, action };
}

const fresh = () => ({ consecutiveFailures: 0, isDown: false, lastAlertAt: 0, downSince: 0, remediationAttempts: 0, lastRemediationAt: 0 });
const MIN = 60_000;

describe('ProdWatchdog — evaluateProbe state machine', () => {
  it('stays silent while healthy', () => {
    let s = fresh();
    for (let i = 0; i < 5; i++) {
      const r = evaluateProbe(s, true, i * 1000);
      s = r.state;
      assert.equal(r.action, null);
      assert.equal(s.isDown, false);
    }
  });

  it('does NOT alert on failures below threshold (avoids deploy-restart false alarms)', () => {
    let s = fresh();
    const r1 = evaluateProbe(s, false, 1000, { threshold: 3 }); s = r1.state;
    const r2 = evaluateProbe(s, false, 2000, { threshold: 3 }); s = r2.state;
    assert.equal(r1.action, null);
    assert.equal(r2.action, null);
    assert.equal(s.consecutiveFailures, 2);
    assert.equal(s.isDown, false);
  });

  it('fires DOWN exactly once at the threshold, not again while still down', () => {
    let s = fresh();
    let r = evaluateProbe(s, false, 1000, { threshold: 3 }); s = r.state; assert.equal(r.action, null);
    r = evaluateProbe(s, false, 2000, { threshold: 3 }); s = r.state; assert.equal(r.action, null);
    r = evaluateProbe(s, false, 3000, { threshold: 3 }); s = r.state; assert.equal(r.action, 'DOWN');
    assert.equal(s.isDown, true);
    // next failing probe shortly after: no spam
    r = evaluateProbe(s, false, 4000, { threshold: 3 }); s = r.state;
    assert.equal(r.action, null);
  });

  it('anchors downSince at the FIRST failed probe, before the alert threshold', () => {
    let s = fresh();
    s = evaluateProbe(s, false, 5000, { threshold: 3 }).state;
    s = evaluateProbe(s, false, 6000, { threshold: 3 }).state;
    s = evaluateProbe(s, false, 7000, { threshold: 3 }).state;
    assert.equal(s.downSince, 5000, 'downtime is measured from the first failure, not the alert');
  });

  it('fires REMINDER once the re-alert window elapses while still down (remediation disabled)', () => {
    let s = { ...fresh(), consecutiveFailures: 3, isDown: true, lastAlertAt: 0, downSince: 0 };
    let r = evaluateProbe(s, false, 10 * MIN, { autoRemediate: false }); s = r.state;
    assert.equal(r.action, null, 'too soon — no reminder');
    r = evaluateProbe(s, false, 31 * MIN, { autoRemediate: false }); s = r.state;
    assert.equal(r.action, 'REMINDER');
    assert.equal(s.lastAlertAt, 31 * MIN);
  });

  it('fires RECOVERY when prod responds again, then resets', () => {
    let s = { ...fresh(), consecutiveFailures: 5, isDown: true, lastAlertAt: 1000, downSince: 500, remediationAttempts: 2, lastRemediationAt: 900 };
    const r = evaluateProbe(s, true, 9000); s = r.state;
    assert.equal(r.action, 'RECOVERY');
    assert.equal(s.isDown, false);
    assert.equal(s.consecutiveFailures, 0);
    assert.equal(s.downSince, 0);
    assert.equal(s.remediationAttempts, 0, 'a new down-episode gets a fresh remediation budget');
    assert.equal(s.lastRemediationAt, 0);
    // subsequent healthy probes are silent
    assert.equal(evaluateProbe(s, true, 10000).action, null);
  });

  it('respects a custom threshold', () => {
    let s = fresh();
    let r = evaluateProbe(s, false, 1, { threshold: 1 });
    assert.equal(r.action, 'DOWN');
  });
});

describe('ProdWatchdog — auto-remediation escalation (incident 08)', () => {
  const OPTS = { threshold: 1, reAlertMs: 30 * MIN, autoRemediate: true, remediateAfterMs: 15 * MIN, remediateCooldownMs: 30 * MIN, maxRemediations: 2 };

  it('never remediates on flapping — any recovery resets the episode clock', () => {
    let s = fresh();
    // three flap cycles: down ~5m, up 1 probe, repeat — 15m+ total downtime but never continuous
    let t = 0;
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 5; i++) {
        const r = evaluateProbe(s, false, t, OPTS); s = r.state;
        assert.notEqual(r.action, 'AUTO_REMEDIATE', `no remediation at t=${t / MIN}m`);
        t += MIN;
      }
      const r = evaluateProbe(s, true, t, OPTS); s = r.state; t += MIN;
      assert.equal(s.remediationAttempts, 0);
    }
  });

  it('fires AUTO_REMEDIATE only after remediateAfterMs of continuous downtime', () => {
    let s = fresh();
    let r = evaluateProbe(s, false, 1 * MIN, OPTS); s = r.state;
    assert.equal(r.action, 'DOWN');
    for (let t = 2; t < 16; t++) {
      r = evaluateProbe(s, false, t * MIN, OPTS); s = r.state;
      assert.equal(r.action, null, `no action at ${t - 1}m of downtime`);
    }
    r = evaluateProbe(s, false, 16 * MIN, OPTS); s = r.state;
    assert.equal(r.action, 'AUTO_REMEDIATE', 'fires at 15m continuous down');
    assert.equal(s.remediationAttempts, 1);
    assert.equal(s.lastRemediationAt, 16 * MIN);
    assert.equal(s.lastAlertAt, 16 * MIN, 'remediation counts as an alert — reminder clock resets');
  });

  it('gates the second attempt behind the cooldown and caps attempts per episode', () => {
    let s = { ...fresh(), consecutiveFailures: 16, isDown: true, lastAlertAt: 16 * MIN, downSince: 1 * MIN, remediationAttempts: 1, lastRemediationAt: 16 * MIN };
    // 29m after attempt 1: cooldown not elapsed
    let r = evaluateProbe(s, false, 45 * MIN, OPTS); s = r.state;
    assert.notEqual(r.action, 'AUTO_REMEDIATE');
    // 30m after attempt 1: attempt 2 fires (takes precedence over the simultaneously-due reminder)
    r = evaluateProbe(s, false, 46 * MIN, OPTS); s = r.state;
    assert.equal(r.action, 'AUTO_REMEDIATE');
    assert.equal(s.remediationAttempts, 2);
    // another 30m: budget exhausted — reminder instead, forever after
    r = evaluateProbe(s, false, 76 * MIN, OPTS); s = r.state;
    assert.equal(r.action, 'REMINDER');
    assert.equal(s.remediationAttempts, 2);
    r = evaluateProbe(s, false, 106 * MIN, OPTS); s = r.state;
    assert.equal(r.action, 'REMINDER');
  });

  it('does nothing extra when autoRemediate is disabled — reminders only', () => {
    let s = fresh();
    let t = MIN;
    const actions = [];
    for (; t <= 120 * MIN; t += MIN) {
      const r = evaluateProbe(s, false, t, { ...OPTS, autoRemediate: false }); s = r.state;
      if (r.action) actions.push(r.action);
    }
    assert.deepEqual(actions, ['DOWN', 'REMINDER', 'REMINDER', 'REMINDER'], 'alert-only legacy posture');
  });

  it('replays incident 08: 94-minute hang is remediated at +15m instead of +94m', () => {
    // 2026-07-27: continuous probe failures from 09:56:13Z; manual click came at 11:29:31Z.
    // With escalation defaults the outage ends at the 15-minute mark.
    let s = fresh();
    const actions = [];
    for (let t = 1 * MIN; t <= 120 * MIN; t += MIN) {
      const r = evaluateProbe(s, false, t, OPTS); s = r.state;
      if (r.action) actions.push(`${r.action}@${t / MIN}m`);
    }
    assert.deepEqual(actions, [
      'DOWN@1m',
      'AUTO_REMEDIATE@16m',    // 15m after first failure — prod restarts here in the real world
      'AUTO_REMEDIATE@46m',    // cooldown-gated second attempt (only if still down)
      'REMINDER@76m',          // budget exhausted — back to paging the human
      'REMINDER@106m'
    ]);
  });
});
