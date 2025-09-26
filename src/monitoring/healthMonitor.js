/**
 * Health Monitor Module
 * Provides interval-based production health monitoring with robust error handling
 * Never crashes the main bot - all errors are caught and logged
 */

import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DiscordRequest } from '../../utils.js';

const execAsync = promisify(exec);

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
      // Memory health
      const memory = metrics.bot.memory || 0;
      if (memory < 150) scores.memory = 100;
      else if (memory < 200) scores.memory = 75;
      else if (memory < 250) scores.memory = 25;
      else scores.memory = 0;

      // Performance health
      const cpu = metrics.bot.cpu || 0;
      if (cpu < 5) scores.performance = 100;
      else if (cpu < 20) scores.performance = 75;
      else if (cpu < 50) scores.performance = 50;
      else scores.performance = 0;

      // Stability health
      const restarts = metrics.bot.restarts || 0;
      if (restarts < 15) scores.stability = 100;
      else if (restarts < 20) scores.stability = 50;
      else if (restarts < 25) scores.stability = 25;
      else scores.stability = 0;

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
  formatForDiscord(metrics, scores) {
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

    // Check for alerts
    const alerts = [];
    if (metrics.bot.memory > 250) {
      alerts.push('🔴 **CRITICAL**: Bot memory exceeds 250MB');
    }
    if (metrics.bot.status !== 'online') {
      alerts.push('🔴 **CRITICAL**: Bot is offline');
    }
    if (metrics.system.memoryPercent > 85) {
      alerts.push('🟠 **WARNING**: System memory above 85%');
    }
    if (metrics.bot.restarts > 20) {
      alerts.push('🟠 **WARNING**: High restart count');
    }

    return {
      healthStatus,
      healthColor,
      alerts,
      content: this.buildDiscordContent(metrics, scores, healthStatus, alerts)
    };
  }

  /**
   * Build Discord message content
   */
  buildDiscordContent(metrics, scores, healthStatus, alerts) {
    const components = [
      {
        type: 10,
        content: `# 🎯 Ultrathink Health Monitor\n\n**Health Score**: ${scores.overall}/100 ${healthStatus}`
      },
      { type: 14 },
      {
        type: 10,
        content: `## 🤖 Bot Metrics\n\`\`\`\nMemory:   ${metrics.bot.memory}MB\nCPU:      ${metrics.bot.cpu}%\nUptime:   ${metrics.bot.uptime}\nRestarts: ${metrics.bot.restarts || 0}\nStatus:   ${metrics.bot.status === 'online' ? '🟢 Online' : '🔴 ' + metrics.bot.status}\n\`\`\``
      },
      { type: 14 },
      {
        type: 10,
        content: `## 🖥️ System Resources\n\`\`\`\nMemory: ${metrics.system.memoryPercent}% (${metrics.system.memoryUsed}MB/${metrics.system.memoryTotal}MB)\nDisk:   ${metrics.system.diskPercent}% (${metrics.system.diskUsed}/${metrics.system.diskTotal})\nLoad:   ${metrics.system.loadAverage}\n\`\`\``
      },
      { type: 14 },
      {
        type: 10,
        content: `## 📊 Health Scores\n\`\`\`\nMemory:      ${scores.memory}/100\nPerformance: ${scores.performance}/100\nStability:   ${scores.stability}/100\n\`\`\``
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

    return components;
  }

  /**
   * Start interval monitoring with bulletproof error handling
   */
  start(hours, channelId, guildId) {
    try {
      // Stop any existing interval
      this.stop();

      if (hours <= 0) {
        console.log('[HealthMonitor] ⏹️ Monitoring disabled (hours: 0)');
        return { success: true, message: 'Monitoring disabled' };
      }

      if (hours > 168) { // Max 1 week
        return { success: false, message: 'Maximum interval is 168 hours (1 week)' };
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
      monitoringState.interval = setInterval(async () => {
        try {
          await this.runHealthCheck();
        } catch (error) {
          // This catch ensures the interval continues even if health check fails
          console.error('[HealthMonitor] Interval error (isolated):', error.message);
        }
      }, hours * 3600000);

      // Run initial check after 5 seconds
      setTimeout(async () => {
        try {
          await this.runHealthCheck();
        } catch (error) {
          console.error('[HealthMonitor] Initial check error:', error.message);
        }
      }, 5000);

      console.log(`[HealthMonitor] ✅ Started monitoring every ${hours} hours to channel ${channelId}`);
      return { success: true, message: `Monitoring every ${hours} hours` };
    } catch (error) {
      console.error('[HealthMonitor] Start error:', error.message);
      return { success: false, message: 'Failed to start monitoring' };
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
      const formatted = this.formatForDiscord(metrics, scores);

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
   * Post health report to Discord channel
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

      await channel.send({
        embeds: [{
          title: '🎯 Scheduled Health Report',
          color: formatted.healthColor,
          description: formatted.healthStatus,
          fields: [
            {
              name: 'Next Check',
              value: `<t:${Math.floor(monitoringState.config.nextRun.getTime() / 1000)}:R>`,
              inline: true
            }
          ],
          timestamp: new Date().toISOString()
        }],
        content: formatted.alerts.length > 0 ? formatted.alerts.join('\n') : null
      });
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
export { HealthMonitor };
export default HealthMonitor;