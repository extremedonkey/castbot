import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure logic replicated inline (avoids importing the module, which pulls in network/SSH deps).
// Keep in sync with src/monitoring/prodWatchdog.js evaluateProbe().
function evaluateProbe(state, healthy, now, opts = {}) {
  const threshold = opts.threshold ?? 3;
  const reAlertMs = opts.reAlertMs ?? 30 * 60_000;
  let { consecutiveFailures, isDown, lastAlertAt } = state;
  let action = null;
  if (healthy) {
    if (isDown) { action = 'RECOVERY'; lastAlertAt = now; }
    consecutiveFailures = 0;
    isDown = false;
  } else {
    consecutiveFailures += 1;
    if (!isDown && consecutiveFailures >= threshold) {
      action = 'DOWN'; isDown = true; lastAlertAt = now;
    } else if (isDown && (now - lastAlertAt) >= reAlertMs) {
      action = 'REMINDER'; lastAlertAt = now;
    }
  }
  return { state: { consecutiveFailures, isDown, lastAlertAt }, action };
}

const fresh = () => ({ consecutiveFailures: 0, isDown: false, lastAlertAt: 0 });

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
    const r1 = evaluateProbe(s, false, 1000); s = r1.state;
    const r2 = evaluateProbe(s, false, 2000); s = r2.state;
    assert.equal(r1.action, null);
    assert.equal(r2.action, null);
    assert.equal(s.consecutiveFailures, 2);
    assert.equal(s.isDown, false);
  });

  it('fires DOWN exactly once at the threshold, not again while still down', () => {
    let s = fresh();
    assert.equal(evaluateProbe(s, false, 1000).action, null); s = evaluateProbe(s, false, 1000).state;
    // rebuild deterministically
    s = fresh();
    let r = evaluateProbe(s, false, 1000); s = r.state; assert.equal(r.action, null);
    r = evaluateProbe(s, false, 2000); s = r.state; assert.equal(r.action, null);
    r = evaluateProbe(s, false, 3000); s = r.state; assert.equal(r.action, 'DOWN');
    assert.equal(s.isDown, true);
    // next failing probe shortly after: no spam
    r = evaluateProbe(s, false, 4000); s = r.state;
    assert.equal(r.action, null);
  });

  it('fires REMINDER once the re-alert window elapses while still down', () => {
    let s = { consecutiveFailures: 3, isDown: true, lastAlertAt: 0 };
    let r = evaluateProbe(s, false, 10 * 60_000); s = r.state;
    assert.equal(r.action, null, 'too soon — no reminder');
    r = evaluateProbe(s, false, 31 * 60_000); s = r.state;
    assert.equal(r.action, 'REMINDER');
    assert.equal(s.lastAlertAt, 31 * 60_000);
  });

  it('fires RECOVERY when prod responds again, then resets', () => {
    let s = { consecutiveFailures: 5, isDown: true, lastAlertAt: 1000 };
    const r = evaluateProbe(s, true, 9000); s = r.state;
    assert.equal(r.action, 'RECOVERY');
    assert.equal(s.isDown, false);
    assert.equal(s.consecutiveFailures, 0);
    // subsequent healthy probes are silent
    assert.equal(evaluateProbe(s, true, 10000).action, null);
  });

  it('respects a custom threshold', () => {
    let s = fresh();
    let r = evaluateProbe(s, false, 1, { threshold: 1 });
    assert.equal(r.action, 'DOWN');
  });
});
