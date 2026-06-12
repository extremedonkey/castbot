/**
 * Prod Watchdog — external liveness monitor for PRODUCTION, run from the TEST box (castbot-blue).
 *
 * Why this exists: prod's own monitors (Ultrathink, pm2ErrorLogger) run *inside* the prod
 * process, so they can't report prod being DOWN — a dead process writes no logs. The always-on
 * TEST instance can probe prod from the outside and ping Reece when it stops responding.
 *
 * Detection: HTTP GET prod's public interactions endpoint (exercises DNS+Apache+SSL+bot exactly
 * as Discord does). On K consecutive failures it SSHes the restricted forced-command `status`
 * for diagnostics, then posts a webhook alert (@mention) to #private-bugs. Read-only on prod;
 * never auto-acts (alert-only posture). Bulletproof — all errors caught, never crashes blue.
 *
 * Gated to INSTANCE_ROLE=test; no-ops everywhere else.
 */

import { execFile } from 'child_process';
import os from 'os';
import path from 'path';

const REECE_USER_ID = '391415444084490240';
const PROD_URL = 'https://castbotaws.reecewagner.com/interactions';
const PROD_SSH_TARGET = 'bitnami@13.238.148.170';
const REMEDIATE_KEY = path.join(os.homedir(), '.ssh', 'prod-remediate-key');

const PROBE_INTERVAL_MS = Number(process.env.PROD_WATCHDOG_INTERVAL_MS) || 60_000;   // probe cadence
const PROBE_TIMEOUT_MS = 10_000;                                                     // per-probe timeout
const FAILURE_THRESHOLD = Number(process.env.PROD_WATCHDOG_THRESHOLD) || 3;          // consecutive fails before DOWN alert
const REALERT_MS = 30 * 60_000;                                                      // re-ping cadence while still down

/**
 * Pure state machine: given current state + this probe's health, decide next state and which
 * alert (if any) to send. Kept pure so it's unit-testable without network/SSH.
 * action ∈ null | 'DOWN' | 'REMINDER' | 'RECOVERY'
 */
export function evaluateProbe(state, healthy, now, opts = {}) {
  const threshold = opts.threshold ?? FAILURE_THRESHOLD;
  const reAlertMs = opts.reAlertMs ?? REALERT_MS;
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

export class ProdWatchdog {
  constructor() {
    this.interval = null;
    this.webhookUrl = process.env.PROD_WATCHDOG_WEBHOOK_URL || null;
    this.state = { consecutiveFailures: 0, isDown: false, lastAlertAt: 0 };
  }

  /** HTTP probe: healthy = any response with status < 500. No response / 5xx = unhealthy. */
  async probe() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      const res = await fetch(PROD_URL, { method: 'GET', signal: ctrl.signal, redirect: 'manual' });
      clearTimeout(t);
      return { healthy: res.status < 500, detail: `HTTP ${res.status}` };
    } catch (e) {
      return { healthy: false, detail: `no response (${e.name === 'AbortError' ? 'timeout' : e.message})` };
    }
  }

  /** Read-only diagnostics from prod via the restricted forced-command key (status mode). */
  async prodStatus() {
    return new Promise((resolve) => {
      execFile('ssh', [
        '-i', REMEDIATE_KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10',
        PROD_SSH_TARGET, 'status'
      ], { timeout: 20_000 }, (err, stdout, stderr) => {
        if (err) return resolve(`SSH unreachable — box may be down or network blocked (${err.message})`);
        resolve((stdout || stderr || 'no output').trim());
      });
    });
  }

  async postAlert(content) {
    if (!this.webhookUrl) return;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'CastBot Prod Watchdog',
          content,
          allowed_mentions: { users: [REECE_USER_ID] }
        })
      });
    } catch (e) {
      console.error('[ProdWatchdog] Webhook post failed:', e.message);
    }
  }

  async tick() {
    const probe = await this.probe();
    const { state, action } = evaluateProbe(this.state, probe.healthy, Date.now());
    this.state = state;
    if (!action) return;

    if (action === 'RECOVERY') {
      console.log('[ProdWatchdog] 🟢 Prod recovered');
      await this.postAlert(`<@${REECE_USER_ID}> 🟢 **PROD RECOVERED** — responding again (${probe.detail}).`);
      return;
    }

    // DOWN or REMINDER — enrich with read-only prod diagnostics
    console.log(`[ProdWatchdog] 🔴 Prod ${action} (${probe.detail})`);
    const diag = await this.prodStatus();
    const title = action === 'REMINDER' ? 'PROD STILL DOWN' : 'PROD DOWN';
    await this.postAlert(
      `<@${REECE_USER_ID}> 🔴 **${title}** — probe: ${probe.detail}\n` +
      `\`\`\`\n${String(diag).slice(0, 1500)}\n\`\`\`\n` +
      `-# Restart via TEST bot → Reece's Stuff → Restart Prod`
    );
  }

  start() {
    if (process.env.INSTANCE_ROLE !== 'test') {
      console.log('[ProdWatchdog] Not the TEST instance — watchdog disabled');
      return;
    }
    if (!this.webhookUrl) {
      console.log('[ProdWatchdog] No PROD_WATCHDOG_WEBHOOK_URL set — watchdog disabled');
      return;
    }
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.tick().catch((e) => console.error('[ProdWatchdog] tick error (isolated):', e.message));
    }, PROBE_INTERVAL_MS);
    console.log(`[ProdWatchdog] ✅ Watching prod every ${PROBE_INTERVAL_MS / 1000}s (alert after ${FAILURE_THRESHOLD} fails → #private-bugs)`);
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }
}

let instance = null;
export const getProdWatchdog = () => {
  if (!instance) instance = new ProdWatchdog();
  return instance;
};

export default ProdWatchdog;
