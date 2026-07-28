/**
 * Health Monitor Module
 * Provides interval-based production health monitoring with robust error handling
 * Never crashes the main bot - all errors are caught and logged
 */

import os from 'os';
import v8 from 'v8';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { monitorEventLoopDelay } from 'perf_hooks';
import { getBotEmoji } from '../../botEmojis.js';
import { getRestartHistory } from './restartTracker.js';

const execAsync = promisify(exec);

// Armed once at module load (bot boot):
// - Event-loop delay histogram — the freeze detector. Incident 08's box served nothing for
//   94 minutes while PM2 said "online"; loop lag is the in-process signal that catches that
//   class while it's still degradation, not death. Reset after each report so readings cover
//   the window since the last check.
// - Heap baseline — drift rate (MB/h) is the ceiling predictor from incident 06 (~13MB/h
//   under load → 320MB cap in 17h). Measured from boot, reported with an ETA to 85% of limit.
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
const heapBaseline = { mb: process.memoryUsage().heapUsed / 1048576, at: Date.now() };

// Detect environment for report title + webhook name. Three-way, matching the canonical
// pattern in scripts/notify-restart.js — the always-on test box (castbot-blue) sets
// INSTANCE_ROLE=test with PRODUCTION=FALSE, so a two-way PRODUCTION check mislabels it "Dev".
function getEnvName(env = process.env) {
  return env.INSTANCE_ROLE === 'test' ? 'Test' : env.PRODUCTION === 'TRUE' ? 'Prod' : 'Dev';
}

// Global state for monitoring (survives function calls, cleared on restart)
let monitoringState = {
  interval: null,
  config: {
    hours: 0,
    channelId: null,
    guildId: null,
    lastRun: null,
    nextRun: null,
    errorCount: 0,
    consecutiveErrors: 0
  }
};

/**
 * Health Monitor Class - Bulletproof monitoring that can't crash the bot
 */
export class HealthMonitor {
  constructor(client) {
    this.client = client;
    this.maxConsecutiveErrors = 5; // Auto-disable after 5 consecutive failures
  }

  /**
   * Get current monitoring status
   */
  getStatus() {
    return {
      active: monitoringState.interval !== null,
      ...monitoringState.config
    };
  }

  /**
   * Collect metrics safely - returns default values on any error
   */
  async collectMetrics() {
    const defaultMetrics = {
      bot: {
        memory: 0,
        cpu: 0,
        uptime: '0s',
        restarts: 0,
        status: 'unknown',
        pid: process.pid
      },
      system: {
        memoryPercent: 0,
        memoryUsed: 0,
        memoryTotal: 0,
        diskPercent: 0,
        diskUsed: '0G',
        diskTotal: '0G',
        loadAverage: '0.00, 0.00, 0.00'
      }
    };

    try {
      // Collect bot metrics
      const botMetrics = await this.getBotMetrics();

      // Collect system metrics
      const systemMetrics = await this.getSystemMetrics();

      return {
        bot: { ...defaultMetrics.bot, ...botMetrics },
        system: { ...defaultMetrics.system, ...systemMetrics }
      };
    } catch (error) {
      console.error('[HealthMonitor] Error collecting metrics:', error.message);
      return defaultMetrics;
    }
  }

  /**
   * Get bot-specific metrics based on environment
   */
  async getBotMetrics() {
    try {
      const metrics = {
        pid: process.pid,
        status: 'online'
      };

      // Memory usage (works in both dev and prod)
      const memUsage = process.memoryUsage();
      metrics.memory = Math.round(memUsage.heapUsed / 1048576);

      // V8 heap vs limit — the TRUE OOM crash predictor (in-process, always accurate).
      // NOTE: in prod, metrics.memory below gets overwritten with PM2's RSS (line ~131),
      // which is capped by physical RAM (swapped pages don't count) so it plateaus and
      // hides real heap growth. heapUsed/heap_size_limit is what actually predicts the crash.
      const heapStats = v8.getHeapStatistics();
      metrics.heapUsed = Math.round(memUsage.heapUsed / 1048576);
      metrics.heapLimit = Math.round(heapStats.heap_size_limit / 1048576);
      metrics.heapPercent = Math.round((memUsage.heapUsed / heapStats.heap_size_limit) * 100);
      metrics.rss = Math.round(memUsage.rss / 1048576);

      // Event-loop lag since the last check (ns → ms). Reset so each report is a window reading.
      metrics.loopP50 = Math.round(loopDelay.percentile(50) / 1e6);
      metrics.loopP99 = Math.round(loopDelay.percentile(99) / 1e6);
      loopDelay.reset();

      // Heap drift since boot + ETA to 85% of the V8 limit at the current rate.
      // Needs ≥30 min of uptime to mean anything; ETA only shown while drift is real (>0.5MB/h).
      const hoursUp = (Date.now() - heapBaseline.at) / 3600000;
      if (hoursUp >= 0.5) {
        metrics.driftMbPerHour = Math.round(((metrics.heapUsed - heapBaseline.mb) / hoursUp) * 10) / 10;
        if (metrics.driftMbPerHour > 0.5) {
          metrics.ceilingEtaHours = Math.round((0.85 * metrics.heapLimit - metrics.heapUsed) / metrics.driftMbPerHour);
        }
      }

      // CRASH restarts in the last 24h — the stability signal. Typed entries count only
      // type='crash' (deploys/planned/manual/remediation are all claimed, deliberate restarts);
      // legacy untyped entries fall back to !planned as a conservative default and age out of
      // the 24h window naturally.
      try {
        const history = await getRestartHistory(20);
        const dayAgo = Date.now() - 86400000;
        metrics.crashes24h = history.filter(r =>
          r.timestamp > dayAgo && (r.type ? r.type === 'crash' : !r.planned)
        ).length;
      } catch { metrics.crashes24h = 0; }

      // CPU usage (simplified, works everywhere)
      const cpuUsage = process.cpuUsage();
      metrics.cpu = Math.round(cpuUsage.system / 1000000);

      // Uptime
      const uptimeSeconds = Math.floor(process.uptime());
      if (uptimeSeconds < 60) {
        metrics.uptime = `${uptimeSeconds}s`;
      } else if (uptimeSeconds < 3600) {
        metrics.uptime = `${Math.floor(uptimeSeconds / 60)}m`;
      } else if (uptimeSeconds < 86400) {
        metrics.uptime = `${Math.floor(uptimeSeconds / 3600)}h`;
      } else {
        metrics.uptime = `${Math.floor(uptimeSeconds / 86400)}d`;
      }

      // Try to get PM2 metrics if in production
      if (process.env.NODE_ENV === 'production' || process.env.name === 'castbot-pm') {
        try {
          const { stdout } = await execAsync('pm2 jlist 2>/dev/null');
          const pm2Data = JSON.parse(stdout);
          const castbot = pm2Data.find(p => p.name === 'castbot-pm');

          if (castbot) {
            metrics.memory = Math.round(castbot.monit.memory / 1048576);
            metrics.cpu = castbot.monit.cpu;
            metrics.restarts = castbot.pm2_env.restart_time || 0;
            metrics.status = castbot.pm2_env.status || 'online';
          }
        } catch (pm2Error) {
          // PM2 not available or error - use fallback values
          console.log('[HealthMonitor] PM2 metrics unavailable, using process metrics');
        }
      }

      return metrics;
    } catch (error) {
      console.error('[HealthMonitor] Bot metrics error:', error.message);
      return {};
    }
  }

  /**
   * Get system metrics safely
   */
  async getSystemMetrics() {
    try {
      const metrics = {};

      // Memory (using Node's os module - no external commands needed)
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      metrics.memoryTotal = Math.round(totalMem / 1048576);
      metrics.memoryUsed = Math.round(usedMem / 1048576);
      metrics.memoryPercent = Math.round((usedMem / totalMem) * 100);

      // Load average (built-in, no external command needed)
      const loadAvg = os.loadavg();
      metrics.loadAverage = loadAvg.map(l => l.toFixed(2)).join(', ');

      // Swap (Linux only; null elsewhere) — the box-thrash early warning. Incident 08's freeze
      // was ~495MB of swap in use on a 447MB box; on the 2GB box sustained swap use is the
      // "something is wrong" tripwire (see ProdBoxMigration.md swap decision).
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const kb = (label) => parseInt(meminfo.match(new RegExp(`${label}:\\s+(\\d+)`))?.[1] ?? 'NaN');
        const swapTotal = kb('SwapTotal') / 1024;
        const swapFree = kb('SwapFree') / 1024;
        if (Number.isFinite(swapTotal) && Number.isFinite(swapFree)) {
          metrics.swapTotal = Math.round(swapTotal);
          metrics.swapUsed = Math.round(swapTotal - swapFree);
        }
      } catch { /* non-Linux dev — leave undefined, renders n/a */ }

      // Try to get disk usage (may fail in some environments)
      try {
        const { stdout } = await execAsync('df -h / | tail -1');
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 5) {
          metrics.diskTotal = parts[1];
          metrics.diskUsed = parts[2];
          metrics.diskPercent = parseInt(parts[4]);
        }
      } catch (diskError) {
        // Disk metrics unavailable - use defaults
        metrics.diskTotal = 'N/A';
        metrics.diskUsed = 'N/A';
        metrics.diskPercent = 0;
      }

      return metrics;
    } catch (error) {
      console.error('[HealthMonitor] System metrics error:', error.message);
      return {};
    }
  }

  /**
   * Calculate health scores
   */
  calculateHealthScores(metrics) {
    const scores = {
      memory: 100,
      performance: 100,
      stability: 100,
      overall: 100
    };

    try {
      // Memory health — self-calibrating: score the V8 heap against ITS OWN limit (the true
      // OOM predictor), never absolute MB. The old 150/200/250MB RSS tiers were sized for the
      // retired 512MB box and scored the healthy 2GB box 0/100 (post-migration, 2026-07-28).
      const heapPct = metrics.bot.heapPercent ?? 0;
      if (heapPct < 50) scores.memory = 100;
      else if (heapPct < 70) scores.memory = 75;
      else if (heapPct < 85) scores.memory = 40;
      else scores.memory = 0;
      // Box-level pressure caps the score regardless of heap health:
      if ((metrics.system.memoryPercent || 0) > 90) scores.memory = Math.min(scores.memory, 50);
      const swapUsed = metrics.system.swapUsed;
      if (Number.isFinite(swapUsed)) {
        if (swapUsed > 300) scores.memory = 0;                                // incident-08 territory
        else if (swapUsed > 100) scores.memory = Math.min(scores.memory, 40); // early warning
      }

      // Performance health — CPU plus event-loop responsiveness (a starved loop is the real
      // "prod is down while PM2 says online" failure mode).
      const cpu = metrics.bot.cpu || 0;
      if (cpu < 5) scores.performance = 100;
      else if (cpu < 20) scores.performance = 75;
      else if (cpu < 50) scores.performance = 50;
      else scores.performance = 0;
      const loopP99 = metrics.bot.loopP99;
      if (Number.isFinite(loopP99)) {
        if (loopP99 > 1000) scores.performance = 0;
        else if (loopP99 > 250) scores.performance = Math.min(scores.performance, 50);
        else if (loopP99 > 100) scores.performance = Math.min(scores.performance, 75);
      }

      // Stability health — CRASH restarts in the last 24h (typed; deploys/planned/manual are
      // deliberate and don't count). The lifetime PM2 counter only climbs; scoring it punished
      // long-lived boxes and ignored planned 🌙 restarts.
      const crashes = metrics.bot.crashes24h ?? 0;
      if (crashes === 0) scores.stability = 100;
      else if (crashes === 1) scores.stability = 75;
      else if (crashes === 2) scores.stability = 50;
      else if (crashes === 3) scores.stability = 25;
      else scores.stability = 0;
      if (metrics.bot.status !== 'online') scores.stability = 0;

      // Overall (weighted average)
      scores.overall = Math.round(
        (scores.memory * 0.4) +
        (scores.performance * 0.3) +
        (scores.stability * 0.3)
      );
    } catch (error) {
      console.error('[HealthMonitor] Score calculation error:', error.message);
    }

    return scores;
  }

  /**
   * Format metrics for Discord display
   */
  async formatForDiscord(metrics, scores) {
    // Determine health status and color
    let healthStatus, healthColor;
    if (scores.overall >= 90) {
      healthStatus = '🟢 EXCELLENT';
      healthColor = 0x2ecc71;
    } else if (scores.overall >= 75) {
      healthStatus = '🟡 GOOD';
      healthColor = 0xf1c40f;
    } else if (scores.overall >= 50) {
      healthStatus = '🟠 WARNING';
      healthColor = 0xe67e22;
    } else {
      healthStatus = '🔴 CRITICAL';
      healthColor = 0xe74c3c;
    }

    // Check for alerts — every threshold here maps to a documented failure mode:
    // heap % → incident 03/06 (V8 ceiling); swap → incident 08 (box thrash); loop lag →
    // incident 06/08 (frozen loop behind an "online" PM2); unplanned restarts → crash loops.
    const alerts = [];
    if (metrics.bot.status !== 'online') {
      alerts.push('🔴 **CRITICAL**: Bot is offline');
    }
    if ((metrics.bot.heapPercent ?? 0) >= 85) {
      alerts.push(`🔴 **CRITICAL**: Heap at ${metrics.bot.heapPercent}% of V8 limit — OOM imminent (incident 03/06 class)`);
    } else if ((metrics.bot.heapPercent ?? 0) >= 70) {
      alerts.push(`🟠 **WARNING**: Heap at ${metrics.bot.heapPercent}% of V8 limit`);
    }
    const swapUsed = metrics.system.swapUsed;
    if (Number.isFinite(swapUsed) && swapUsed > 300) {
      alerts.push(`🔴 **CRITICAL**: ${swapUsed}MB of swap in use — box is thrashing (incident 08 class)`);
    } else if (Number.isFinite(swapUsed) && swapUsed > 100) {
      alerts.push(`🟠 **WARNING**: ${swapUsed}MB of swap in use — memory pressure building`);
    }
    if (Number.isFinite(metrics.bot.loopP99) && metrics.bot.loopP99 > 1000) {
      alerts.push(`🔴 **CRITICAL**: Event loop stalling (p99 ${metrics.bot.loopP99}ms) — interactions will time out`);
    } else if (Number.isFinite(metrics.bot.loopP99) && metrics.bot.loopP99 > 250) {
      alerts.push(`🟠 **WARNING**: Event loop lag elevated (p99 ${metrics.bot.loopP99}ms)`);
    }
    if ((metrics.system.memoryPercent || 0) > 90) {
      alerts.push('🟠 **WARNING**: System memory above 90%');
    }
    if ((metrics.bot.crashes24h ?? 0) >= 3) {
      alerts.push(`🟠 **WARNING**: ${metrics.bot.crashes24h} crash restarts in 24h — possible crash loop`);
    }
    if (Number.isFinite(metrics.bot.ceilingEtaHours) && metrics.bot.ceilingEtaHours < 24) {
      alerts.push(`🟠 **WARNING**: Heap drift reaches 85% of limit in ~${metrics.bot.ceilingEtaHours}h at current rate`);
    }

    return {
      healthStatus,
      healthColor,
      alerts,
      content: await this.buildDiscordContent(metrics, scores, healthStatus, alerts)
    };
  }

  /**
   * Traffic lights — thresholds encode CastBot's documented failure envelope, not generic
   * defaults: heap tiers match the scoring (incidents 03/06), swap tiers match the incident-08
   * tripwire in ProdBoxMigration.md, disk is ANOMALY-based (working set is ~9GB; 35GB+ means
   * something pathological like runaway logs/dumps — the temp/ incident ×30), load is vs cores.
   */
  lights = {
    heap: (pct) => pct < 50 ? '🟢' : pct < 70 ? '🟠' : '🔴',
    sysMem: (pct) => pct < 70 ? '🟢' : pct < 90 ? '🟠' : '🔴',
    swap: (mb) => !Number.isFinite(mb) ? '' : mb < 100 ? '🟢' : mb <= 300 ? '🟠' : '🔴',
    diskGb: (gb) => !Number.isFinite(gb) ? '' : gb < 20 ? '🟢' : gb < 35 ? '🟠' : '🔴',
    load: (oneMin, cores) => oneMin < cores * 0.5 ? '🟢' : oneMin < cores ? '🟠' : '🔴',
  };

  /** Restart-type labels for the Last N Restarts list (see restartTracker.js type model). */
  static RESTART_LABELS = {
    planned: '🌙 planned',
    deploy: '📦 deploy',
    remediation: '🐕 watchdog',
    manual: '🔁 manual',
    crash: '💥 crash',
  };

  /**
   * Drift line: heap growth rate since boot + ETA to 85% of the V8 limit.
   * "warming up" under 30m uptime (rate meaningless), "stable" when drift ≤0.5MB/h.
   */
  formatDrift(bot) {
    if (!Number.isFinite(bot.driftMbPerHour)) return 'warming up (<30m uptime)';
    if (bot.driftMbPerHour <= 0.5) return `${bot.driftMbPerHour >= 0 ? '+' : ''}${bot.driftMbPerHour}MB/h (stable)`;
    const eta = Number.isFinite(bot.ceilingEtaHours)
      ? (bot.ceilingEtaHours > 168 ? ' (ceiling >1 week away)' : ` → 85% ceiling in ~${bot.ceilingEtaHours}h`)
      : '';
    return `+${bot.driftMbPerHour}MB/h${eta}`;
  }

  /**
   * Build Discord message content
   */
  async buildDiscordContent(metrics, scores, healthStatus, alerts) {
    // Add user ping if CRITICAL only (score < 50)
    const healthLine = scores.overall >= 50 ?
      `**Health Score**: ${scores.overall}/100 ${healthStatus}` :
      `**Health Score**: ${scores.overall}/100 ${healthStatus} <@391415444084490240>`;

    // Build environment-aware title
    const envEmoji = getBotEmoji('castbot_logo');
    const envName = getEnvName();
    const titleEmoji = envEmoji ? `<:castbot_logo:${envEmoji.id}>` : '🎯';

    const components = [
      {
        type: 10,
        content: `# ${titleEmoji} Ultrathink Health Monitor \`${envName}\`\n\n${healthLine}`
      },
      { type: 14 },
      {
        type: 10,
        content: `## 🤖 Bot Metrics\n\`\`\`\nHeap:     ${metrics.bot.heapUsed ?? '?'}MB/${metrics.bot.heapLimit ?? '?'}MB (${metrics.bot.heapPercent ?? '?'}%) ${this.lights.heap(metrics.bot.heapPercent ?? 0)}\nDrift:    ${this.formatDrift(metrics.bot)}\nLoop lag: ${Number.isFinite(metrics.bot.loopP99) ? `p50 ${metrics.bot.loopP50}ms · p99 ${metrics.bot.loopP99}ms` : 'n/a'}\nUptime:   ${metrics.bot.uptime}\n\`\`\``
      },
      { type: 14 },
      {
        type: 10,
        content: `## 🖥️ System Resources\n\`\`\`\nMemory: ${metrics.system.memoryUsed}MB/${metrics.system.memoryTotal}MB (${metrics.system.memoryPercent}%) ${this.lights.sysMem(metrics.system.memoryPercent || 0)}\nSwap:   ${Number.isFinite(metrics.system.swapUsed) ? `${metrics.system.swapUsed}MB/${metrics.system.swapTotal}MB ${this.lights.swap(metrics.system.swapUsed)}` : 'n/a'}\nDisk:   ${String(metrics.system.diskUsed).replace(/G$/, 'GB')}/${String(metrics.system.diskTotal).replace(/G$/, 'GB')} (${metrics.system.diskPercent}%) ${this.lights.diskGb(parseFloat(metrics.system.diskUsed))}\nLoad:   ${(os.loadavg()[0]).toFixed(2)}/${os.cpus().length}.0 cores (1m avg) ${this.lights.load(os.loadavg()[0], os.cpus().length)}\n\`\`\`\n-# Load = average processes wanting CPU; at ${os.cpus().length}.0 the box is saturated`
      }
    ];

    if (alerts.length > 0) {
      components.push(
        { type: 14 },
        {
          type: 10,
          content: `## ⚠️ Alerts\n\n${alerts.join('\n')}`
        }
      );
    }

    // Last 10 restarts, labeled by claimed type (unclaimed = 💥 crash; legacy untyped
    // entries show only their planned flag rather than being falsely branded crashes)
    try {
      const restarts = await getRestartHistory(10);
      if (restarts.length > 0) {
        const lines = restarts.map((r) => {
          const unixSec = Math.floor(r.timestamp / 1000);
          const label = r.type
            ? ` ${HealthMonitor.RESTART_LABELS[r.type] ?? r.type}`
            : (r.planned ? ' 🌙 planned' : '');
          return `<t:${unixSec}:f> — <t:${unixSec}:R>${label}`;
        });
        components.push(
          { type: 14 },
          {
            type: 10,
            content: `## 🔄 Last ${restarts.length} Restart${restarts.length === 1 ? '' : 's'}`
          },
          {
            type: 10,
            content: lines.join('\n')
          }
        );
      }
    } catch (err) {
      // Non-critical — skip silently
    }

    return components;
  }

  /**
   * Start interval monitoring with bulletproof error handling
   */
  async start(hours, channelId, guildId) {
    try {
      // Stop any existing interval
      this.stop();

      if (hours <= 0) {
        // Clear persisted config
        try {
          const { loadPlayerData, savePlayerData } = await import('../../storage.js');
          const pd = await loadPlayerData();
          if (pd.environmentConfig?.healthMonitor) {
            delete pd.environmentConfig.healthMonitor;
            await savePlayerData(pd);
          }
        } catch { /* non-fatal */ }
        console.log('[HealthMonitor] ⏹️ Monitoring disabled (hours: 0)');
        return { success: true, message: 'Monitoring disabled' };
      }

      if (hours < 0.016 || hours > 168) { // Min ~1 minute (with floating point tolerance), Max 1 week
        return { success: false, message: 'Interval must be between 1 minute and 168 hours (1 week)' };
      }

      // Update configuration
      monitoringState.config = {
        hours,
        channelId,
        guildId,
        lastRun: null,
        nextRun: new Date(Date.now() + hours * 3600000),
        errorCount: 0,
        consecutiveErrors: 0
      };

      // Create interval with error isolation
      const intervalMs = hours * 3600000;
      monitoringState.interval = setInterval(async () => {
        try {
          await this.runHealthCheck();
        } catch (error) {
          // This catch ensures the interval continues even if health check fails
          console.error('[HealthMonitor] Interval error (isolated):', error.message);
        }
      }, intervalMs);

      // Run initial check after 5 seconds
      setTimeout(async () => {
        try {
          await this.runHealthCheck();
        } catch (error) {
          console.error('[HealthMonitor] Initial check error:', error.message);
        }
      }, 5000);

      // Persist config so monitoring survives restarts
      try {
        const { loadPlayerData, savePlayerData } = await import('../../storage.js');
        const pd = await loadPlayerData();
        if (!pd.environmentConfig) pd.environmentConfig = {};
        pd.environmentConfig.healthMonitor = { hours, channelId, guildId };
        await savePlayerData(pd);
        console.log(`[HealthMonitor] 💾 Config persisted (${hours}h, channel ${channelId})`);
      } catch (err) {
        console.error('[HealthMonitor] Failed to persist config (non-fatal):', err.message);
      }

      console.log(`[HealthMonitor] ✅ Started monitoring every ${hours} hours to channel ${channelId}`);
      return { success: true, message: `Monitoring every ${hours} hours` };
    } catch (error) {
      console.error('[HealthMonitor] Start error:', error.message);
      return { success: false, message: 'Failed to start monitoring' };
    }
  }

  /**
   * Restore monitoring from persisted config (called at startup)
   */
  async restoreFromConfig() {
    try {
      const { loadPlayerData } = await import('../../storage.js');
      const pd = await loadPlayerData();
      const config = pd.environmentConfig?.healthMonitor;
      if (config?.hours && config?.channelId) {
        console.log(`[HealthMonitor] 🔄 Restoring monitoring: ${config.hours}h to channel ${config.channelId}`);
        this.start(config.hours, config.channelId, config.guildId);
      }
    } catch (err) {
      console.error('[HealthMonitor] Failed to restore config (non-fatal):', err.message);
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    try {
      if (monitoringState.interval) {
        clearInterval(monitoringState.interval);
        monitoringState.interval = null;
        console.log('[HealthMonitor] ⏹️ Monitoring stopped');
      }
      monitoringState.config.hours = 0;
    } catch (error) {
      console.error('[HealthMonitor] Stop error:', error.message);
    }
  }

  /**
   * Run a health check with full error isolation
   */
  async runHealthCheck() {
    const { channelId, guildId } = monitoringState.config;

    try {
      console.log('[HealthMonitor] 🏥 Running scheduled health check');

      // Collect metrics
      const metrics = await this.collectMetrics();
      const scores = this.calculateHealthScores(metrics);
      const formatted = await this.formatForDiscord(metrics, scores);

      // Post to Discord channel
      await this.postToChannel(channelId, guildId, formatted);

      // Update state
      monitoringState.config.lastRun = new Date();
      monitoringState.config.nextRun = new Date(Date.now() + monitoringState.config.hours * 3600000);
      monitoringState.config.consecutiveErrors = 0;

      console.log('[HealthMonitor] ✅ Health check completed');
    } catch (error) {
      console.error('[HealthMonitor] Health check failed:', error.message);

      // Increment error counters
      monitoringState.config.errorCount++;
      monitoringState.config.consecutiveErrors++;

      // Auto-disable after too many failures
      if (monitoringState.config.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error('[HealthMonitor] 🛑 Auto-disabling after 5 consecutive errors');
        this.stop();
      }
    }
  }

  /**
   * Post health report to Discord channel using webhook pattern
   * (matches Safari's proven scheduled posting approach)
   */
  async postToChannel(channelId, guildId, formatted) {
    try {
      if (!this.client) {
        throw new Error('Discord client not available');
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      // Build full Components V2 container (same as manual check)
      const containerComponents = [...formatted.content];

      // Add scheduled monitoring status
      if (monitoringState.config.nextRun) {
        containerComponents.push(
          { type: 14 },
          {
            type: 10,
            content: `## ⏰ Scheduled Report\n**Next Check**: <t:${Math.floor(monitoringState.config.nextRun.getTime() / 1000)}:R>`
          }
        );
      }

      // Add divider before buttons
      containerComponents.push({ type: 14 });

      // Add navigation buttons using plain Components V2 objects (no Discord.js builders)
      const actionRow = {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            custom_id: 'prod_ultrathink_monitor',
            label: 'View Live',
            style: 2, // Secondary
            emoji: { name: '🌈' }
          },
          {
            type: 2, // Button
            custom_id: 'health_monitor_schedule',
            label: 'Schedule',
            style: 2, // Secondary
            emoji: { name: '📅' }
          },
          {
            // Self-restart (this instance): graceful exit under PM2 with a typed 'manual'
            // marker. Routes to THIS bot (webhook buttons route to the owning app), so it
            // works whenever the bot is alive — hard-outage restarts remain the watchdog's
            // job from castbot-blue (incident 08 escalation).
            type: 2, // Button
            custom_id: 'health_restart_bot',
            label: 'Restart',
            style: 4, // Danger
            emoji: { name: '🔁' }
          }
        ]
      };
      containerComponents.push(actionRow);

      // Build message payload
      const messagePayload = {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: [{
          type: 17, // Container
          accent_color: formatted.healthColor,
          components: containerComponents
        }]
      }

      // Use Safari's webhook pattern for reliable Components V2 posting
      console.log('[HealthMonitor] Creating webhook for scheduled report');
      const envName = getEnvName();
      const webhook = await channel.createWebhook({
        name: `CastBot Health Monitor - ${envName}`,
        reason: 'Scheduled health monitoring report'
      });

      // Post via webhook (works reliably in scheduled context)
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messagePayload)
      });

      // Check response status
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Webhook post failed (${response.status}): ${errorText}`);
      }

      console.log('[HealthMonitor] ✅ Scheduled report posted to Discord');

      // Clean up webhook after short delay
      setTimeout(async () => {
        try {
          await webhook.delete('Cleanup after scheduled report');
          console.log('[HealthMonitor] 🧹 Cleaned up webhook');
        } catch (err) {
          console.error('[HealthMonitor] ⚠️ Could not delete webhook:', err.message);
        }
      }, 5000);

    } catch (error) {
      console.error('[HealthMonitor] Failed to post to Discord:', error.message);
      throw error; // Re-throw to trigger error handling
    }
  }
}

// Export singleton instance and state
let healthMonitorInstance = null;

export const getHealthMonitor = (client) => {
  if (!healthMonitorInstance && client) {
    healthMonitorInstance = new HealthMonitor(client);
  }
  return healthMonitorInstance;
};

export const getMonitoringState = () => monitoringState;
export default HealthMonitor;