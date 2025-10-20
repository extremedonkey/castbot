/**
 * PM2 Error Logger Module
 * Monitors PM2 logs and posts errors to Discord
 * Supports both local (dev) and remote (prod via SSH) log reading
 * Never crashes the main bot - all errors are caught and logged
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

// Configuration
const PM2_ERROR_CHANNEL_ID = '1416025517706186845';  // #error channel
const PM2_LOG_CHECK_INTERVAL = 60000;  // 60 seconds

// PM2 log paths based on environment
const PM2_LOG_PATHS = {
  dev: {
    out: './logs/pm2-out.log',
    error: './logs/pm2-error.log',
    processName: 'castbot-pm-dev',
    local: true  // Always read local files in dev
  },
  prod: {
    out: '/home/bitnami/.pm2/logs/castbot-pm-out.log',
    error: '/home/bitnami/.pm2/logs/castbot-pm-error.log',
    processName: 'castbot-pm',
    local: false  // Default to remote, will be overridden if running on prod server
  }
};

// Global state for monitoring (survives function calls, cleared on restart)
let monitoringState = {
  interval: null,
  positions: {
    dev: { out: 0, error: 0 },
    prod: { out: 0, error: 0 }
  }
};

/**
 * PM2 Error Logger Class - Bulletproof monitoring that can't crash the bot
 */
export class PM2ErrorLogger {
  constructor(client) {
    this.client = client;
    this.channelId = PM2_ERROR_CHANNEL_ID;
  }

  /**
   * Detect if we're running ON the production server
   * Check if we're the bitnami user on the Lightsail instance
   */
  isRunningOnProdServer() {
    try {
      // Check if we're the bitnami user
      const username = os.userInfo().username;

      // Check if the production log directory exists (unique to prod server)
      const prodLogDirExists = fs.existsSync('/home/bitnami/.pm2/logs');

      return username === 'bitnami' && prodLogDirExists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load position tracking from file
   */
  loadPositions() {
    try {
      const posData = fs.readFileSync('./logs/pm2-positions.json', 'utf8');
      return JSON.parse(posData);
    } catch {
      return {
        dev: { out: 0, error: 0 },
        prod: { out: 0, error: 0 }
      };
    }
  }

  /**
   * Save position tracking to file
   */
  savePositions(positions) {
    try {
      if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs', { recursive: true });
      }
      fs.writeFileSync('./logs/pm2-positions.json', JSON.stringify(positions, null, 2));
    } catch (error) {
      console.error('[PM2Logger] Failed to save log positions:', error);
    }
  }

  /**
   * Read local PM2 logs (dev)
   */
  async readLogsLocal(config, positions) {
    const logs = [];

    // Read error log
    try {
      if (fs.existsSync(config.error)) {
        const errorContent = fs.readFileSync(config.error, 'utf8');

        // Detect log rotation - if file size < last position, log was rotated
        if (errorContent.length < positions.error) {
          console.log('[PM2Logger] 🔄 Log rotation detected on error log - resetting position');
          positions.error = 0;
        }

        if (errorContent.length > positions.error) {
          const newErrors = errorContent.slice(positions.error);
          const errorLines = newErrors.split('\n')
            .filter(line => line.trim())
            .slice(-50); // Last 50 lines max

          if (errorLines.length > 0) {
            logs.push('=== ERRORS ===');
            logs.push(...errorLines);
          }
          positions.error = errorContent.length;
        }
      }
    } catch (e) {
      console.error('[PM2Logger] Error reading PM2 error log:', e);
    }

    // Read stdout for critical patterns only
    try {
      if (fs.existsSync(config.out)) {
        const outContent = fs.readFileSync(config.out, 'utf8');

        // Detect log rotation - if file size < last position, log was rotated
        if (outContent.length < positions.out) {
          console.log('[PM2Logger] 🔄 Log rotation detected on output log - resetting position');
          positions.out = 0;
        }

        if (outContent.length > positions.out) {
          const newOut = outContent.slice(positions.out);
          const criticalLines = newOut.split('\n')
            .filter(line =>
              line.trim() && (
                line.includes('ERROR') ||
                line.includes('FATAL') ||
                line.includes('CRITICAL') ||
                line.includes('❌') ||
                line.includes('failed') ||
                line.includes('Failed') ||
                line.includes('Error:') ||
                line.includes('TypeError') ||
                line.includes('ReferenceError') ||
                line.includes('SyntaxError')
              ))
            .slice(-30); // Last 30 critical lines max

          if (criticalLines.length > 0) {
            if (logs.length > 0) logs.push('');
            logs.push('=== CRITICAL OUTPUT ===');
            logs.push(...criticalLines);
          }
          positions.out = outContent.length;
        }
      }
    } catch (e) {
      console.error('[PM2Logger] Error reading PM2 output log:', e);
    }

    return logs;
  }

  /**
   * Read remote PM2 logs (prod) via SSH
   */
  async readLogsRemote(config, positions) {
    const logs = [];

    try {
      const SSH_KEY_PATH = path.join(os.homedir(), '.ssh', 'castbot-key.pem');
      const SSH_TARGET = 'bitnami@13.238.148.170';

      // Get recent errors from production
      const errorCommand = `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no ${SSH_TARGET} "tail -n 100 ${config.error} 2>/dev/null || echo 'No error log'"`;
      const errorResult = execSync(errorCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

      const errorLines = errorResult.split('\n')
        .filter(line => line.trim() && line !== 'No error log')
        .slice(-50);

      if (errorLines.length > 0) {
        logs.push('=== PRODUCTION ERRORS ===');
        logs.push(...errorLines);
      }

      // Get critical output lines
      const outCommand = `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no ${SSH_TARGET} "grep -E 'ERROR|FATAL|❌|Failed' ${config.out} 2>/dev/null | tail -n 30 || echo 'No critical logs'"`;
      const outResult = execSync(outCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

      const criticalLines = outResult.split('\n')
        .filter(line => line.trim() && line !== 'No critical logs')
        .slice(-30);

      if (criticalLines.length > 0) {
        if (logs.length > 0) logs.push('');
        logs.push('=== PRODUCTION CRITICAL ===');
        logs.push(...criticalLines);
      }
    } catch (error) {
      console.error('[PM2Logger] Failed to read remote PM2 logs:', error.message);
      // Don't throw - continue operation
    }

    return logs;
  }

  /**
   * Start PM2 log monitoring
   */
  start() {
    try {
      console.log('[PM2Logger] 📋 Starting PM2 Discord logger...');

      // Load initial positions
      monitoringState.positions = this.loadPositions();

      // Start monitoring interval
      monitoringState.interval = setInterval(async () => {
        try {
          await this.checkLogs();
        } catch (error) {
          // This catch ensures the interval continues even if check fails
          console.error('[PM2Logger] Interval error (isolated):', error.message);
        }
      }, PM2_LOG_CHECK_INTERVAL);

      console.log(`[PM2Logger] ✅ PM2 Discord logger started - posting to #error channel every ${PM2_LOG_CHECK_INTERVAL/1000}s`);
    } catch (error) {
      console.error('[PM2Logger] Start error:', error.message);
    }
  }

  /**
   * Stop PM2 log monitoring
   */
  stop() {
    try {
      if (monitoringState.interval) {
        clearInterval(monitoringState.interval);
        monitoringState.interval = null;
        console.log('[PM2Logger] ⏹️  PM2 logger stopped');
      }
    } catch (error) {
      console.error('[PM2Logger] Stop error:', error.message);
    }
  }

  /**
   * Check logs and post to Discord if errors found
   */
  async checkLogs() {
    try {
      const env = process.env.PRODUCTION === 'TRUE' ? 'prod' : 'dev';
      const config = PM2_LOG_PATHS[env];
      let logs = [];

      // Determine if we should read local or remote
      // If running ON prod server, always read local files
      // If running in dev, always read local files
      // If PRODUCTION=TRUE but not on prod server, read remote via SSH
      const isOnProdServer = this.isRunningOnProdServer();
      const shouldReadLocal = env === 'dev' || isOnProdServer;

      console.log(`[PM2Logger] Check: env=${env}, isOnProdServer=${isOnProdServer}, shouldReadLocal=${shouldReadLocal}`);

      if (shouldReadLocal) {
        // Read local PM2 logs (dev OR running on prod server)
        logs = await this.readLogsLocal(config, monitoringState.positions[env]);
      } else {
        // Read remote PM2 logs via SSH (monitoring prod from dev machine)
        logs = await this.readLogsRemote(config, monitoringState.positions[env]);
      }

      if (logs.length > 0) {
        // Get the Discord channel
        const channel = await this.client.channels.fetch(this.channelId);
        if (!channel) {
          console.error('[PM2Logger] Could not find #error channel');
          return;
        }

        // Format with environment tag and timestamp
        const tag = env === 'prod' ? '🔴 **[PM2-PROD]**' : '🟡 **[PM2-DEV]**';
        const timestamp = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        // Truncate if too long for Discord (2000 char limit)
        let logContent = logs.slice(0, 100).join('\n');
        if (logContent.length > 1900) {
          logContent = logContent.substring(0, 1900) + '\n... [truncated]';
        }

        const message = `${tag} ${timestamp}\n\`\`\`\n${logContent}\n\`\`\``;

        await channel.send(message);
        console.log(`[PM2Logger] 📋 PM2 logs posted to Discord (${logs.length} lines)`);
      }

      // Always save positions, even if no errors found (prevents stale position tracking)
      this.savePositions(monitoringState.positions);
    } catch (error) {
      console.error('[PM2Logger] Log check error (non-critical):', error);
      // Don't throw - this should never break the bot
    }
  }
}

// Export singleton instance
let pm2LoggerInstance = null;

export const getPM2ErrorLogger = (client) => {
  if (!pm2LoggerInstance && client) {
    pm2LoggerInstance = new PM2ErrorLogger(client);
  }
  return pm2LoggerInstance;
};

export default PM2ErrorLogger;