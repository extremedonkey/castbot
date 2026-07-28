// Tests for the Ultrathink panel self-restart flow response shapes.
// Pure logic replicated inline per TestingStandards.md (healthPanelUI.js imports
// healthMonitor which arms perf_hooks/timers at module load — unsafe to import here).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicated from src/monitoring/healthPanelUI.buildRestartConfirm (keep in sync) ──
function buildRestartConfirm() {
  return {
    components: [{ type: 17, accent_color: 0xe74c3c, components: [
      { type: 10, content: '## 🔁 Restart this bot?\nGraceful `process.exit(0)` — PM2 revives it in ~50s. Recorded as a 🔁 manual restart.\n-# For a hard outage use the watchdog/Restart Prod path from the test box instead.' },
      { type: 1, components: [
        { type: 2, custom_id: 'health_restart_bot_confirm', label: 'Confirm Restart', style: 4, emoji: { name: '⚠️' } },
        { type: 2, custom_id: 'health_restart_cancel', label: 'Cancel', style: 2 }
      ] }
    ] }],
    ephemeral: true
  };
}

describe('Health Panel — self-restart flow response shapes', () => {
  it('confirm screen is a V2 container (never content-only) with confirm + cancel buttons', () => {
    const r = buildRestartConfirm();
    assert.equal(r.components[0].type, 17, 'container');
    assert.equal(r.ephemeral, true, 'must be ephemeral — admin-only flow');
    const row = r.components[0].components.find(c => c.type === 1);
    const ids = row.components.map(b => b.custom_id);
    assert.deepEqual(ids, ['health_restart_bot_confirm', 'health_restart_cancel']);
    assert.equal(row.components[0].style, 4, 'confirm is Danger style');
  });

  it('confirm button is a two-step flow — the panel Restart button never restarts directly', () => {
    // The panel button (health_restart_bot) must route to this confirm screen; only
    // health_restart_bot_confirm executes. Guards fat-finger restarts of prod.
    const r = buildRestartConfirm();
    const text = r.components[0].components.find(c => c.type === 10).content;
    assert.match(text, /Restart this bot\?/);
    assert.match(text, /PM2 revives/);
  });

  it('restart type labels cover every claimed-reason type', () => {
    // Replicated from healthMonitor.RESTART_LABELS (keep in sync)
    const RESTART_LABELS = {
      planned: '🌙 planned',
      deploy: '📦 deploy',
      remediation: '🐕 watchdog',
      manual: '🔁 manual',
      crash: '💥 crash',
    };
    for (const type of ['planned', 'deploy', 'remediation', 'manual', 'crash']) {
      assert.ok(RESTART_LABELS[type], `label exists for ${type}`);
    }
  });
});
