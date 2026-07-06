/**
 * Restart Scheduler — planned, cancellable self-restarts to reset the V8 heap
 * before the multi-day drift reaches the 320MB ceiling (OOM every ~3-5 days).
 * Design + rationale: docs/01-RaP/0903_20260706_MemoryFootprint_Analysis.md
 * Feature doc: docs/03-features/ScheduledRestart.md
 *
 * Flow: arm() → [T-warnMinutes] postWarning() (Components V2, tags Reece,
 * Cancel button) → [T+0] executeRestart() → clean process.exit(0) → PM2
 * autorestart revives (~50s) → fresh boot restoreFromConfig() re-arms.
 *
 * Runaway-state guards (all deliberate — do not "simplify" away):
 *  - Ships disabled; enabled only via the Data menu modal
 *  - MIN_INTERVAL_MS clamp at validation AND at arm time
 *  - No successful warning post → no restart (skip cycle, advance, re-arm)
 *  - Boot inside the warn window → push to the next cycle (always full warning)
 *  - executeRestart re-reads persisted config (enabled/skipNext) before exiting
 *  - Missed fires advance in interval steps; invalid config disables, never loops
 *  - process.exit only under PM2 supervision (prod/test); dev logs and re-arms
 *  - Singleton + arm() always clears existing timers first
 *  - Every timer callback is try/catch isolated (never crashes the bot)
 */

const TAG_USER_ID = '391415444084490240'; // Reece
const DEFAULT_CHANNEL_ID = '1420926549921763339'; // health monitor channel
export const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;  // 4h — PROD restart-loop guard
export const DEV_MIN_INTERVAL_MS = 60 * 1000;        // 1m — dev/test flow testing
export const MAX_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
export const DEFAULT_WARN_MINUTES = 30;

/**
 * Environment-aware minimum interval: prod keeps the 4h restart-loop guard;
 * dev and the test box allow 1 minute so the full warn→fire flow is testable.
 */
export function getMinIntervalMs() {
  const isProd = process.env.PRODUCTION === 'TRUE' && process.env.INSTANCE_ROLE !== 'test';
  return isProd ? MIN_INTERVAL_MS : DEV_MIN_INTERVAL_MS;
}

/**
 * Combine the modal's Days/Hours/Minutes text inputs into ms.
 * Empty/blank fields count as 0; non-numeric or negative input → null;
 * all-zero → null (callers treat as "no interval given").
 */
export function combineDhm(daysStr, hoursStr, minutesStr) {
  const parse = (s) => {
    const t = String(s ?? '').trim();
    if (t === '') return 0;
    if (!/^\d+$/.test(t)) return null;
    return parseInt(t, 10);
  };
  const d = parse(daysStr), h = parse(hoursStr), m = parse(minutesStr);
  if (d === null || h === null || m === null) return null;
  const ms = d * 86400000 + h * 3600000 + m * 60000;
  return ms > 0 ? ms : null;
}

/**
 * Warn-window rule (Reece, 2026-07-06): IF the restart interval is ≤ 60 minutes
 * THEN warn at interval/2 (e.g. 3m interval → 90s warning); ELSE the standard
 * 30 minutes. (Equivalent to min(30, interval/2) — kept as an explicit branch
 * to match the stated spec.)
 */
export function computeWarnMinutes(intervalMs) {
  const intervalMin = intervalMs / 60000;
  if (intervalMin <= 60) return intervalMin / 2;
  return DEFAULT_WARN_MINUTES;
}

/** Display a warn window: whole minutes as "30 min", short/fractional as "90s" / "2m 30s". */
export function formatWarnWindow(warnMinutes) {
  if (Number.isInteger(warnMinutes)) return `${warnMinutes} min`;
  const totalSec = Math.round(warnMinutes * 60);
  if (totalSec < 120) return `${totalSec}s`;
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
}

/** Split ms into { days, hours, minutes } for prefilling the modal inputs. */
export function splitDhm(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return { days: 0, hours: 0, minutes: 0 };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  return { days, hours, minutes };
}

/**
 * Format ms as composed d/h/m shorthand ("1d", "12h", "4h 3m") — mirrors the
 * modal's three inputs so a mixed interval is unmistakable (a flat "243m"
 * disguised the 4h-prefill + 3m-typed combination incident).
 */
export function formatInterval(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '?';
  const { days, hours, minutes } = splitDhm(ms);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ') || '?';
}

/**
 * Compute the next valid fire time. Advances a stale nextFireAt past `now` in
 * whole interval steps, and pushes one more cycle if we're already inside the
 * warning window (a restart must always be preceded by the full warning).
 * Pure — exported for tests.
 */
export function computeNextFire(nowMs, nextFireAt, intervalMs, warnMinutes = DEFAULT_WARN_MINUTES, minIntervalMs = getMinIntervalMs()) {
  const interval = Math.max(intervalMs, minIntervalMs); // corrupted-config clamp
  let fireAt = Number.isFinite(nextFireAt) && nextFireAt > 0 ? nextFireAt : nowMs + interval;
  if (fireAt > nowMs + MAX_INTERVAL_MS + interval) fireAt = nowMs + interval; // absurd future = reset
  const warnMs = warnMinutes * 60000;
  while (fireAt - warnMs <= nowMs) {
    fireAt += interval;
  }
  return fireAt;
}

/** Stale-click guard: a Cancel is only valid for the currently armed fire time. */
export function isCancelCurrent(clickedFireEpochSec, armedFireAtMs) {
  if (!Number.isFinite(clickedFireEpochSec) || !armedFireAtMs) return false;
  return Math.floor(armedFireAtMs / 1000) === clickedFireEpochSec;
}

class RestartScheduler {
  constructor(client) {
    this.client = client;
    this.warnTimer = null;
    this.fireTimer = null;
    this.armedFireAt = null;      // ms — the fire this instance has timers for
    this.warningMessage = null;   // { channelId, messageId } of the live warning
  }

  isSupervised() {
    return process.env.PRODUCTION === 'TRUE' || process.env.INSTANCE_ROLE === 'test';
  }

  async loadConfig() {
    const { loadPlayerData } = await import('../../storage.js');
    const pd = await loadPlayerData();
    return pd.environmentConfig?.restartScheduler || null;
  }

  async saveConfig(patch) {
    const { loadPlayerData, savePlayerData } = await import('../../storage.js');
    const pd = await loadPlayerData();
    if (!pd.environmentConfig) pd.environmentConfig = {};
    pd.environmentConfig.restartScheduler = {
      ...(pd.environmentConfig.restartScheduler || {}),
      ...patch
    };
    await savePlayerData(pd);
    return pd.environmentConfig.restartScheduler;
  }

  clearTimers() {
    if (this.warnTimer) { clearTimeout(this.warnTimer); this.warnTimer = null; }
    if (this.fireTimer) { clearTimeout(this.fireTimer); this.fireTimer = null; }
    this.armedFireAt = null;
  }

  /**
   * Enable/update from the Data menu modal. Computes a fresh nextFireAt from
   * now ("happens in perpetuity over that interval" anchored at submission).
   */
  async enable({ intervalMs, channelId, updatedBy }) {
    const interval = Math.min(Math.max(intervalMs, getMinIntervalMs()), MAX_INTERVAL_MS);
    const nextFireAt = Date.now() + interval;
    // Warn window: interval ≤ 60m → interval/2 (stays < interval, or computeNextFire
    // would push the fire time forever); longer intervals (all prod) → 30m.
    const warnMinutes = computeWarnMinutes(interval);
    const config = await this.saveConfig({
      enabled: true,
      intervalMs: interval,
      warnMinutes,
      channelId: channelId || DEFAULT_CHANNEL_ID,
      tagUserId: TAG_USER_ID,
      nextFireAt,
      skipNext: false,
      updatedBy: updatedBy || null,
      updatedAt: Date.now()
    });
    await this.arm(config);
    return config;
  }

  async disable(updatedBy) {
    this.clearTimers();
    return this.saveConfig({ enabled: false, skipNext: false, updatedBy: updatedBy || null, updatedAt: Date.now() });
  }

  /** Called at startup (app.js ready handler). Recomputes and re-arms. */
  async restoreFromConfig() {
    try {
      const config = await this.loadConfig();
      if (!config?.enabled) {
        console.log('[RestartScheduler] Disabled — not arming');
        return;
      }
      await this.arm(config);
    } catch (err) {
      console.error('[RestartScheduler] Failed to restore config (non-fatal):', err.message);
    }
  }

  /**
   * Arm timers for the next fire. Always clears existing timers first, always
   * validates the interval, persists any nextFireAt advancement.
   */
  async arm(config) {
    try {
      this.clearTimers();
      if (!config?.enabled) return;

      if (!Number.isFinite(config.intervalMs) || config.intervalMs < getMinIntervalMs()) {
        // Corrupted/hand-edited config: refuse to run rather than risk a loop
        console.error(`[RestartScheduler] ⛔ Invalid intervalMs (${config.intervalMs}) — disabling`);
        await this.saveConfig({ enabled: false });
        return;
      }

      const warnMinutes = config.warnMinutes || DEFAULT_WARN_MINUTES;
      const now = Date.now();
      const fireAt = computeNextFire(now, config.nextFireAt, config.intervalMs, warnMinutes);
      if (fireAt !== config.nextFireAt) {
        await this.saveConfig({ nextFireAt: fireAt });
      }

      this.armedFireAt = fireAt;
      const warnDelay = fireAt - warnMinutes * 60000 - now;
      this.warnTimer = setTimeout(() => {
        this.onWarnTime().catch(e => console.error('[RestartScheduler] warn error (isolated):', e.message));
      }, warnDelay);

      const supervised = this.isSupervised() ? '' : ' (DEV: will log instead of restarting)';
      console.log(`[RestartScheduler] 🌙 Armed — restart at ${new Date(fireAt).toISOString()}, warning ${warnMinutes}m prior${supervised}`);
    } catch (err) {
      console.error('[RestartScheduler] arm() failed (non-fatal):', err.message);
    }
  }

  /** T-warnMinutes: post the tagged warning. No successful post → no restart. */
  async onWarnTime() {
    const config = await this.loadConfig();
    if (!config?.enabled || !this.armedFireAt) return;
    const warnMinutes = config.warnMinutes || DEFAULT_WARN_MINUTES;
    const fireAt = this.armedFireAt;

    const posted = await this.postWarning(config, fireAt);
    if (!posted) {
      // Never restart unannounced: skip this cycle entirely
      console.error('[RestartScheduler] ⚠️ Warning post failed — SKIPPING this restart cycle');
      await this.saveConfig({ nextFireAt: fireAt + config.intervalMs });
      await this.arm({ ...config, nextFireAt: fireAt + config.intervalMs });
      return;
    }

    this.fireTimer = setTimeout(() => {
      this.executeRestart().catch(e => console.error('[RestartScheduler] fire error (isolated):', e.message));
    }, Math.max(fireAt - Date.now(), 0));
    console.log(`[RestartScheduler] ⏳ Warning posted — restart in ${warnMinutes}m unless canceled`);
  }

  /**
   * Post the Components V2 warning with ping + Cancel button.
   *
   * POSTs raw JSON via DiscordRequest (bot-token REST), NOT channel.send():
   * discord.js v14's MessagePayload wraps raw top-level component objects in
   * `new ActionRowBuilder(...)`, which blows up on a Components V2 Container
   * ("ActionRowBuilder is not a constructor" — hit live 2026-07-06). This is
   * the same reason healthMonitor posts scheduled CV2 reports via webhook
   * ("no Discord.js builders"). REST-as-bot is used here instead of a channel
   * webhook because webhook messages can't host working custom_id buttons
   * (see prodWatchdog.js fallback comment) — and the Cancel button is the point.
   */
  async postWarning(config, fireAt) {
    try {
      const fireEpoch = Math.floor(fireAt / 1000);
      const tagUserId = config.tagUserId || TAG_USER_ID;
      const { DiscordRequest } = await import('../../utils.js');
      const message = await DiscordRequest(`channels/${config.channelId}/messages`, {
        method: 'POST',
        body: {
          flags: 1 << 15, // IS_COMPONENTS_V2
          components: [{
            type: 17, // Container
            accent_color: 0xf39c12, // orange — warning/caution
            components: [
              {
                type: 10, // Text Display
                content: `<@${tagUserId}>\n## 🌙 Scheduled Restart <t:${fireEpoch}:R>\nCastBot will restart at <t:${fireEpoch}:t> to reset the V8 heap (OOM prevention — RaP 0903). PM2 revives it in ~50s.\n-# Recurs every ${formatInterval(config.intervalMs)}. Cancel skips this one only.`
              },
              { type: 14 }, // Separator
              {
                type: 1, // Action Row
                components: [
                  {
                    type: 2, // Button
                    custom_id: `restart_sched_cancel_${fireEpoch}`,
                    label: 'Cancel This Restart',
                    style: 4, // Danger
                    emoji: { name: '🌙' }
                  },
                  {
                    type: 2, // Button — quick access to the config modal (same handler as the Data menu)
                    custom_id: 'restart_scheduler',
                    label: 'Auto-Restart',
                    style: 2, // Secondary
                    emoji: { name: '⚙️' }
                  }
                ]
              }
            ]
          }],
          allowed_mentions: { users: [tagUserId] }
        }
      }, 'RestartScheduler warning');
      // DiscordRequest returns null (not throw) for deleted channel/message —
      // treat anything without a message id as a failed warning (→ skip cycle)
      if (!message?.id) {
        console.error('[RestartScheduler] postWarning failed: no message returned (channel gone or post rejected)');
        return false;
      }
      this.warningMessage = { channelId: config.channelId, messageId: message.id };
      return true;
    } catch (err) {
      console.error('[RestartScheduler] postWarning failed:', err.message);
      return false;
    }
  }

  /**
   * Cancel button handler entry. Skips the armed fire only; re-arms next cycle.
   * Returns { canceled, nextFireAt } or { stale: true }.
   */
  async cancelTonight(userId, clickedFireEpochSec) {
    if (!isCancelCurrent(clickedFireEpochSec, this.armedFireAt)) {
      return { stale: true };
    }
    // Flag first: if executeRestart is already in flight (sub-second race near
    // T+0), its persisted-state re-check sees skipNext and aborts the exit.
    await this.saveConfig({ skipNext: true });
    const config = await this.loadConfig();
    const nextFireAt = this.armedFireAt + (config?.intervalMs || MIN_INTERVAL_MS);
    this.clearTimers();
    await this.saveConfig({ nextFireAt, skipNext: false });
    console.log(`[RestartScheduler] 🚫 Restart canceled by ${userId} — next: ${new Date(nextFireAt).toISOString()}`);
    await this.arm({ ...config, nextFireAt });
    return { canceled: true, nextFireAt };
  }

  /** T+0: final safety re-checks, then clean exit (PM2 revives). */
  async executeRestart() {
    // Re-read persisted state — defends against cancel/disable races and
    // hand-edits since the warning was posted.
    const config = await this.loadConfig();
    if (!config?.enabled) {
      console.log('[RestartScheduler] Disabled since warning — not restarting');
      this.clearTimers();
      return;
    }
    if (config.skipNext) {
      console.log('[RestartScheduler] skipNext set — skipping this restart');
      const nextFireAt = (this.armedFireAt || Date.now()) + config.intervalMs;
      await this.saveConfig({ skipNext: false, nextFireAt });
      await this.arm({ ...config, skipNext: false, nextFireAt });
      return;
    }

    // Advance the schedule BEFORE exiting so the reborn process arms the next cycle
    const nextFireAt = (this.armedFireAt || Date.now()) + config.intervalMs;
    await this.saveConfig({ nextFireAt });

    // Best-effort: mark the warning message as executing.
    // Raw REST PATCH — same discord.js MessagePayload/ActionRowBuilder pitfall
    // as postWarning applies to msg.edit() with raw CV2 components.
    try {
      if (this.warningMessage) {
        const { DiscordRequest } = await import('../../utils.js');
        await DiscordRequest(`channels/${this.warningMessage.channelId}/messages/${this.warningMessage.messageId}`, {
          method: 'PATCH',
          body: {
            components: [{
              type: 17,
              accent_color: 0x3498db,
              components: [{ type: 10, content: `## 🔄 Restarting now…\nBack in ~50s. Next scheduled restart: <t:${Math.floor(nextFireAt / 1000)}:F>.` }]
            }]
          }
        }, 'RestartScheduler restarting-edit');
      }
    } catch (e) {
      console.error('[RestartScheduler] Warning-message edit failed (continuing):', e.message);
    }

    if (!this.isSupervised()) {
      // Dev safety: nohup node has no supervisor — a real exit would kill the bot dead
      console.log('[RestartScheduler] 🧪 DEV (no supervisor) — would process.exit(0) now; re-arming instead');
      await this.arm({ ...config, nextFireAt });
      return;
    }

    // Planned-restart marker so RestartTracker/Ultrathink can label this restart
    try {
      const fs = await import('fs');
      if (!fs.existsSync('./logs')) fs.mkdirSync('./logs', { recursive: true });
      fs.writeFileSync('./logs/planned-restart.json', JSON.stringify({ reason: 'scheduled-restart', at: Date.now() }));
    } catch (e) {
      console.error('[RestartScheduler] Marker write failed (continuing):', e.message);
    }

    console.log('[RestartScheduler] 🌙 Executing scheduled restart (planned, exit 0) — PM2 will revive');
    setTimeout(() => process.exit(0), 1500); // let the log line + message edit flush
  }

  getStatus() {
    return {
      armed: !!this.armedFireAt,
      armedFireAt: this.armedFireAt,
      supervised: this.isSupervised()
    };
  }
}

let instance = null;
export function getRestartScheduler(client = null) {
  if (!instance) instance = new RestartScheduler(client);
  else if (client && !instance.client) instance.client = client;
  return instance;
}
