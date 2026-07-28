/**
 * Ultrathink Health Panel UI — response builders for the manual Ultramonitor panel and the
 * self-restart flow. Extracted from app.js handlers (router, not processor — CLAUDE.md).
 *
 * The Restart button restarts THIS instance (prod panel → prod bot, test panel → test bot)
 * via graceful process.exit(0) under PM2, recorded as a 🔁 manual restart through the typed
 * marker system (restartTracker.js). Hard-outage restarts remain the ProdWatchdog's job from
 * castbot-blue (incident 08 escalation) — a dead bot can't serve its own button.
 */

import { getHealthMonitor } from './healthMonitor.js';
import { writeRestartMarker } from './restartTracker.js';

/** Full manual Ultramonitor panel (mirrors the scheduled webhook report + nav buttons). */
export async function buildUltramonitorPanel(client) {
  console.log('[🌈 Ultramonitor] Starting health check');
  try {
    const monitor = getHealthMonitor(client);
    const metrics = await monitor.collectMetrics();
    const scores = monitor.calculateHealthScores(metrics);
    const formatted = await monitor.formatForDiscord(metrics, scores);
    const status = monitor.getStatus();

    const containerComponents = formatted.content;
    if (status.active) {
      containerComponents.push(
        { type: 14 },
        {
          type: 10,
          content: `## ⏰ Scheduled Monitoring\n**Interval**: Every ${status.hours} hours\n**Next Check**: <t:${Math.floor(status.nextRun?.getTime() / 1000)}:R>`
        }
      );
    }
    containerComponents.push(
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'data_admin', label: '← Data', style: 2 },
        { type: 2, custom_id: 'prod_ultrathink_monitor', label: 'Refresh', style: 2, emoji: { name: '🔄' } },
        { type: 2, custom_id: 'health_monitor_schedule', label: 'Schedule', style: 2, emoji: { name: '📅' } },
        { type: 2, custom_id: 'health_restart_bot', label: 'Restart', style: 4, emoji: { name: '🔁' } }
      ] }
    );

    console.log(`[🌈 Ultramonitor] Complete - score: ${scores.overall}/100`);
    return {
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: [{ type: 17, accent_color: formatted.healthColor, components: containerComponents }]
    };
  } catch (error) {
    console.error('[🌈 Ultramonitor] Error:', error.message);
    return {
      content: `❌ **Error running health monitor:**\n\`\`\`\n${error.message}\n\`\`\`\nThis is likely a temporary issue. Please try again.`
    };
  }
}

/** Confirm screen for the panel self-restart. */
export function buildRestartConfirm() {
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

/** Execute the self-restart: typed marker → ack → graceful exit under PM2 supervision. */
export async function performManualRestart(userId) {
  await writeRestartMarker('manual');
  console.log(`🔁 [HEALTH-RESTART] Manual restart via Ultrathink panel by ${userId}`);
  setTimeout(() => process.exit(0), 1500); // let the ack flush; PM2 revives
  return {
    components: [{ type: 17, accent_color: 0x2ecc71, components: [
      { type: 10, content: '## 🔁 Restarting…\nBack in ~50s. This will appear as `🔁 manual` in the restart list.' }
    ] }]
  };
}

/** Cancelled state for the confirm screen. */
export function buildRestartCancelled() {
  return {
    components: [{ type: 17, components: [{ type: 10, content: 'Cancelled — no restart.' }] }]
  };
}
