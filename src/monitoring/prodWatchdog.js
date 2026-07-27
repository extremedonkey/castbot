/**
 * Prod Watchdog — external liveness monitor for PRODUCTION, run from the TEST box (castbot-blue).
 *
 * Why this exists: prod's own monitors (Ultrathink, pm2ErrorLogger) run *inside* the prod
 * process, so they can't report prod being DOWN — a dead process writes no logs. The always-on
 * TEST instance can probe prod from the outside and ping Reece when it stops responding.
 *
 * Detection: HTTP GET prod's public interactions endpoint (exercises DNS+Apache+SSL+bot exactly
 * as Discord does). On K consecutive failures it SSHes the restricted forced-command `status`
 * for diagnostics, then posts a webhook alert (@mention) to #private-bugs.
 *
 * Escalation (incident 08): after AUTO_REMEDIATE_AFTER_MS of *continuous* downtime it runs the
 * forced-command remediation itself (same script the Restart Prod button uses — the key can do
 * nothing else on prod), bounded by a cooldown and a per-episode attempt cap, then keeps
 * reminding. The original alert-only posture left prod hung for 94 minutes on 2026-07-27 while
 * every in-process restart layer (PM2 autorestart, 🌙 scheduler) was starved by the frozen
 * event loop it was meant to cure — an external actor is the only layer that can fire.
 * Brief flaps never remediate: any successful probe resets the episode.
 * Bulletproof — all errors caught, never crashes blue.
 *
 * Gated to INSTANCE_ROLE=test; no-ops everywhere else.
 */

import { execFile } from 'child_process';
import os from 'os';
import path from 'path';

const REECE_USER_ID = '391415444084490240';
const BUGS_CHANNEL_ID = '1335678517907816530';   // #private-bugs in the community server
const PROD_URL = 'https://castbotaws.reecewagner.com/interactions';
const PROD_SSH_TARGET = 'bitnami@13.238.148.170';
const REMEDIATE_KEY = path.join(os.homedir(), '.ssh', 'prod-remediate-key');

const PROBE_INTERVAL_MS = Number(process.env.PROD_WATCHDOG_INTERVAL_MS) || 60_000;   // probe cadence
const PROBE_TIMEOUT_MS = 10_000;                                                     // per-probe timeout
const FAILURE_THRESHOLD = Number(process.env.PROD_WATCHDOG_THRESHOLD) || 1;          // consecutive fails before DOWN alert (1 = ping on first failure)
const REALERT_MS = Number(process.env.PROD_WATCHDOG_REALERT_MS) || 30 * 60_000;      // re-ping cadence while still down

// Auto-remediation escalation (incident 08). Default ON — set PROD_WATCHDOG_AUTO_REMEDIATE=0 to disable.
const AUTO_REMEDIATE = !['0', 'false', 'off'].includes(String(process.env.PROD_WATCHDOG_AUTO_REMEDIATE ?? '').toLowerCase());
const AUTO_REMEDIATE_AFTER_MS = Number(process.env.PROD_WATCHDOG_AUTO_REMEDIATE_AFTER_MS) || 15 * 60_000;   // continuous downtime before first attempt
const AUTO_REMEDIATE_COOLDOWN_MS = Number(process.env.PROD_WATCHDOG_AUTO_REMEDIATE_COOLDOWN_MS) || 30 * 60_000; // between attempts
const AUTO_REMEDIATE_MAX_ATTEMPTS = Number(process.env.PROD_WATCHDOG_AUTO_REMEDIATE_MAX) || 2;              // per down-episode; resets on recovery

/**
 * Pure state machine: given current state + this probe's health, decide next state and which
 * action (if any) to take. Kept pure so it's unit-testable without network/SSH.
 * action ∈ null | 'DOWN' | 'REMINDER' | 'AUTO_REMEDIATE' | 'RECOVERY'
 *
 * downSince anchors at the FIRST failed probe of an episode (before the alert threshold), so
 * remediation timing reflects true downtime. Any healthy probe resets the whole episode —
 * flapping (down 2m, up, down 2m) can never accumulate toward an auto-remediation.
 */
export function evaluateProbe(state, healthy, now, opts = {}) {
  const threshold = opts.threshold ?? FAILURE_THRESHOLD;
  const reAlertMs = opts.reAlertMs ?? REALERT_MS;
  const autoRemediate = opts.autoRemediate ?? AUTO_REMEDIATE;
  const remediateAfterMs = opts.remediateAfterMs ?? AUTO_REMEDIATE_AFTER_MS;
  const remediateCooldownMs = opts.remediateCooldownMs ?? AUTO_REMEDIATE_COOLDOWN_MS;
  const maxRemediations = opts.maxRemediations ?? AUTO_REMEDIATE_MAX_ATTEMPTS;
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

export class ProdWatchdog {
  constructor(client = null) {
    this.client = client;
    this.interval = null;
    this.webhookUrl = process.env.PROD_WATCHDOG_WEBHOOK_URL || null;
    this.state = { consecutiveFailures: 0, isDown: false, lastAlertAt: 0, downSince: 0, remediationAttempts: 0, lastRemediationAt: 0 };
    this._busy = false;
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

  /**
   * Full remediation on prod via the same restricted forced-command key — no command argument
   * selects the script's default (restart) mode, exactly like the manual Restart Prod button
   * (app.js restart_prod_confirm). The key can execute nothing but remediate-castbot.sh.
   */
  async remediate() {
    return new Promise((resolve) => {
      execFile('ssh', [
        '-i', REMEDIATE_KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=12',
        PROD_SSH_TARGET
      ], { timeout: 90_000 }, (err, stdout, stderr) => {
        resolve(`${stdout || ''}${stderr || ''}${err ? `\n[ssh exit ${err.code ?? err.message}]` : ''}`.trim() || '(no output)');
      });
    });
  }

  /** Fallback alert: webhook ping only (a manual webhook cannot carry a working button). */
  async postWebhook(content) {
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

  /** "down for Xm" line for down-kind alerts (empty when downSince unknown). */
  downDurationLine() {
    if (!this.state.downSince) return '';
    const mins = Math.round((Date.now() - this.state.downSince) / 60_000);
    return `\n**Down for:** ~${mins}m`;
  }

  /** One-line auto-remediation status so alerts say what the watchdog will (or won't) do next. */
  remediationStatusLine(kind) {
    if (kind === 'AUTO_REMEDIATE') return '\n**Action:** running remediation on prod (output below)';
    if (!AUTO_REMEDIATE) return '\n-# Auto-remediation disabled (PROD_WATCHDOG_AUTO_REMEDIATE=0) — manual restart required';
    const { remediationAttempts, downSince, lastRemediationAt } = this.state;
    if (remediationAttempts >= AUTO_REMEDIATE_MAX_ATTEMPTS) {
      return `\n-# ⚠️ Auto-remediation exhausted (${remediationAttempts}/${AUTO_REMEDIATE_MAX_ATTEMPTS} attempts) — manual action required`;
    }
    const gate = remediationAttempts === 0
      ? downSince + AUTO_REMEDIATE_AFTER_MS
      : lastRemediationAt + AUTO_REMEDIATE_COOLDOWN_MS;
    const mins = Math.max(1, Math.ceil((gate - Date.now()) / 60_000));
    return `\n-# Auto-remediation in ~${mins}m if still down (attempt ${remediationAttempts + 1}/${AUTO_REMEDIATE_MAX_ATTEMPTS})`;
  }

  /**
   * Send an alert. Preferred path: post AS the bot (Components V2 + one-click Restart Prod
   * button) — requires CastBot-Test to be a member of the community server, and the button
   * routes back to this always-on box. Falls back to a webhook ping (no button) otherwise.
   * kind ∈ 'DOWN' | 'REMINDER' | 'AUTO_REMEDIATE' | 'RECOVERY'
   */
  async alert(kind, probe, diag) {
    const isRecovery = kind === 'RECOVERY';
    const title = isRecovery ? '🟢 Prod Recovered'
      : kind === 'AUTO_REMEDIATE' ? `🔁 Prod Auto-Remediation (attempt ${this.state.remediationAttempts}/${AUTO_REMEDIATE_MAX_ATTEMPTS})`
      : kind === 'REMINDER' ? '🔴 Prod Still Down' : '🔴 Prod Down';
    const detail = isRecovery
      ? `Prod is responding again (${probe.detail}).`
      : `**Probe:** ${probe.detail}${this.downDurationLine()}${this.remediationStatusLine(kind)}\n\`\`\`\n${String(diag || '').slice(0, 1200)}\n\`\`\``;

    if (this.client) {
      try {
        // Raw REST, not channel.send(): discord.js message builders can't normalize raw
        // Components V2 JSON (throws "ActionRowBuilder is not a constructor" /
        // "component.toJSON is not a function"), which silently downgraded every alert to
        // the buttonless webhook fallback. Same pattern as the fog anchor posts.
        const inner = [{ type: 10, content: `<@${REECE_USER_ID}>\n## ${title}\n${detail}` }];
        if (!isRecovery) {
          inner.push(
            { type: 14 },
            { type: 1, components: [
              { type: 2, custom_id: 'restart_prod_confirm', label: 'Restart Prod Now', style: 4, emoji: { name: '🔁' } }
            ] }
          );
        }
        const { DiscordRequest } = await import('../../utils.js');
        await DiscordRequest(`channels/${BUGS_CHANNEL_ID}/messages`, {
          method: 'POST',
          body: {
            flags: 1 << 15, // IS_COMPONENTS_V2
            components: [{ type: 17, accent_color: isRecovery ? 0x27ae60 : kind === 'AUTO_REMEDIATE' ? 0xe67e22 : 0xe74c3c, components: inner }],
            allowed_mentions: { users: [REECE_USER_ID] }
          }
        });
        return;
      } catch (e) {
        console.error('[ProdWatchdog] Bot post failed (bot not in community server?) — webhook fallback:', e.message);
      }
    }

    // Fallback: ping only (manual webhook can't host a working button)
    await this.postWebhook(
      `<@${REECE_USER_ID}> ${title} — ${isRecovery ? probe.detail : `probe: ${probe.detail}`}` +
      (isRecovery ? '' : `\n\`\`\`\n${String(diag || '').slice(0, 1200)}\n\`\`\`\n-# Restart via TEST bot → Reece's Stuff → Restart Prod`)
    );
  }

  async tick() {
    if (this._busy) return;   // a slow SSH/remediation cycle must not overlap the next probe
    this._busy = true;
    try {
      const probe = await this.probe();
      const { state, action } = evaluateProbe(this.state, probe.healthy, Date.now());
      this.state = state;
      if (!action) return;

      if (action === 'RECOVERY') {
        console.log('[ProdWatchdog] 🟢 Prod recovered');
        await this.alert('RECOVERY', probe, null);
        return;
      }

      if (action === 'AUTO_REMEDIATE') {
        console.log(`[ProdWatchdog] 🔁 AUTO-REMEDIATING prod (attempt ${state.remediationAttempts}/${AUTO_REMEDIATE_MAX_ATTEMPTS}, down since ${new Date(state.downSince).toISOString()})`);
        const output = await this.remediate();
        console.log(`[ProdWatchdog] remediation output:\n${output.slice(0, 2000)}`);
        await this.alert('AUTO_REMEDIATE', probe, output);
        return;
      }

      // DOWN or REMINDER — enrich with read-only prod diagnostics. Log the diag locally too:
      // during incident 08 the SSH diagnostics existed only inside Discord alert bodies,
      // leaving the box's own logs unable to answer what prod looked like at alert time.
      console.log(`[ProdWatchdog] 🔴 Prod ${action} (${probe.detail})`);
      const diag = await this.prodStatus();
      console.log(`[ProdWatchdog] prod diag:\n${String(diag).slice(0, 1500)}`);
      await this.alert(action, probe, diag);
    } finally {
      this._busy = false;
    }
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
    console.log(`[ProdWatchdog] ✅ Watching prod every ${PROBE_INTERVAL_MS / 1000}s (alert after ${FAILURE_THRESHOLD} fails → #private-bugs; auto-remediate ${AUTO_REMEDIATE ? `after ${AUTO_REMEDIATE_AFTER_MS / 60_000}m down, max ${AUTO_REMEDIATE_MAX_ATTEMPTS} attempts/${AUTO_REMEDIATE_COOLDOWN_MS / 60_000}m cooldown` : 'OFF'})`);
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }
}

let instance = null;
export const getProdWatchdog = (client = null) => {
  if (!instance) instance = new ProdWatchdog(client);
  else if (client && !instance.client) instance.client = client;
  return instance;
};

export default ProdWatchdog;
