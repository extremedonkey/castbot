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
  },
  // TEST instance (castbot-blue, Ubuntu): pm2 runs as 'ubuntu', logs live here. Always local.
  test: {
    out: '/home/ubuntu/.pm2/logs/castbot-pm-out.log',
    error: '/home/ubuntu/.pm2/logs/castbot-pm-error.log',
    processName: 'castbot-pm',
    local: true
  }
};

// Global state for monitoring (survives function calls, cleared on restart)
let monitoringState = {
  interval: null,
  positions: {
    dev: { out: 0, error: 0 },
    test: { out: 0, error: 0 },
    prod: { out: 0, error: 0 }
  }
};

// ── Noise filters (exported for tests) ──────────────────────────────────────
// Success summaries like "sent 1, failed 0" or "0 failed, 0 orphaned" contain the
// keyword 'failed' but are not errors — strip zero-count tokens before matching.
export function stripZeroCountTokens(line) {
  return line
    .replace(/\bfailed\b[:=]?\s*0\b/gi, '')
    .replace(/\b0\s+failed\b/gi, '');
}

const CRITICAL_KEYWORDS = [
  'ERROR', 'FATAL', 'CRITICAL', 'failed', 'Failed',
  'Error:', 'TypeError', 'ReferenceError', 'SyntaxError'
];

// A stdout line is worth posting to #error only if a keyword survives the noise strip
export function isCriticalLine(line) {
  if (!line.trim()) return false;
  const stripped = stripZeroCountTokens(line);
  return CRITICAL_KEYWORDS.some(keyword => stripped.includes(keyword));
}

// Stderr lines that are deliberate warnings, not errors (logged via console.error by
// design — e.g. "⚠️ DEPRECATED season_management_menu hit ..." redirect notices)
export function isBenignStderrLine(line) {
  return line.includes('ExperimentalWarning') ||
    line.includes('--trace-warnings') ||
    line.includes('DEPRECATED');
}

// Per-environment card identity. Colors match the deploy-notification convention
// (prod red would be alarming for dev noise; dev gets yellow, test the blue box).
const ENV_CARD_META = {
  prod: { tag: '🔴 PM2 Errors · PROD', accent: 0xe74c3c },
  test: { tag: '🟦 PM2 Errors · TEST', accent: 0x3498db },
  dev: { tag: '🟡 PM2 Errors · DEV', accent: 0xf1c40f }
};

// Discord caps TOTAL text across a message's Text Displays at 4000 chars; the header
// line takes ~40, the code fences 8 — cap the log body well inside that.
const LOG_CONTENT_CAP = 3500;

/**
 * Build the Components V2 card for a batch of PM2 log lines.
 * Exported pure so tests can exercise it without Discord.
 * @param {Object} opts
 * @param {'dev'|'test'|'prod'} opts.env
 * @param {string} opts.timeString - preformatted local time
 * @param {string} opts.logContent - joined log lines
 * @param {boolean} [opts.askEnabled] - append the Ask Moai button (DEV/TEST only —
 *   prod has no Claude CLI; the container itself renders everywhere)
 * @returns {Object} type-17 Container
 */
export function buildErrorLogContainer({ env, timeString, logContent, askEnabled = process.env.PRODUCTION !== 'TRUE' }) {
  const meta = ENV_CARD_META[env] || { tag: `PM2 Errors · ${String(env).toUpperCase()}`, accent: 0x95a5a6 };
  let content = String(logContent || '');
  if (content.length > LOG_CONTENT_CAP) {
    content = content.substring(0, LOG_CONTENT_CAP) + '\n... [truncated]';
  }
  return {
    type: 17,
    accent_color: meta.accent,
    components: [
      { type: 10, content: `## ${meta.tag}\n-# 🕐 ${timeString}` },
      { type: 10, content: `\`\`\`\n${content}\n\`\`\`` },
      ...(askEnabled ? [
        { type: 14 },
        {
          type: 1, components: [
            { type: 2, custom_id: 'moai_ask_msg', label: 'Ask Moai', style: 2, emoji: { name: '🗿' } }
          ]
        }
      ] : [])
    ]
  };
}

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
        test: { out: 0, error: 0 },
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
   * Read only the bytes appended to a file since `position` (byte offset).
   * Never materializes the whole file: reads at most TAIL_READ_CAP bytes via
   * a positional fd read. Rotation (file shrunk below position) resets to 0.
   * Returns { text, newPosition } or null if the file doesn't exist.
   */
  readNewBytes(filePath, position) {
    if (!fs.existsSync(filePath)) return null;
    const fd = fs.openSync(filePath, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      let start = position;
      if (size < start) {
        console.log(`[PM2Logger] 🔄 Log rotation detected on ${path.basename(filePath)} - resetting position`);
        start = 0;
      }
      if (size === start) return { text: '', newPosition: size };
      // Downstream keeps at most the last 50 lines — never read more than the cap
      const TAIL_READ_CAP = 512 * 1024;
      if (size - start > TAIL_READ_CAP) start = size - TAIL_READ_CAP;
      const buf = Buffer.alloc(size - start);
      const bytesRead = fs.readSync(fd, buf, 0, size - start, start);
      return { text: buf.toString('utf8', 0, bytesRead), newPosition: size };
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Read local PM2 logs (dev)
   */
  async readLogsLocal(config, positions) {
    const logs = [];

    // One-time migration: positions used to be JS string lengths (post-UTF-8 decode);
    // they are now byte offsets. Re-baseline to current file sizes and skip this tick.
    if (positions._unit !== 'bytes') {
      try {
        positions.error = fs.existsSync(config.error) ? fs.statSync(config.error).size : 0;
        positions.out = fs.existsSync(config.out) ? fs.statSync(config.out).size : 0;
        positions._unit = 'bytes';
        console.log('[PM2Logger] 📐 Migrated log positions to byte offsets (re-baselined)');
      } catch (e) {
        console.error('[PM2Logger] Position migration failed:', e.message);
      }
      return logs;
    }

    // Read error log
    try {
      const errorRead = this.readNewBytes(config.error, positions.error);
      if (errorRead) {
        if (errorRead.text.length > 0) {
          const errorLines = errorRead.text.split('\n')
            .filter(line => line.trim() && !isBenignStderrLine(line))
            .slice(-50); // Last 50 lines max

          if (errorLines.length > 0) {
            logs.push('=== ERRORS ===');
            logs.push(...errorLines);
          }
        }
        positions.error = errorRead.newPosition;
      }
    } catch (e) {
      console.error('[PM2Logger] Error reading PM2 error log:', e);
    }

    // Read stdout for critical patterns only
    try {
      const outRead = this.readNewBytes(config.out, positions.out);
      if (outRead) {
        if (outRead.text.length > 0) {
          const criticalLines = outRead.text.split('\n')
            .filter(isCriticalLine)
            .slice(-30); // Last 30 critical lines max

          if (criticalLines.length > 0) {
            if (logs.length > 0) logs.push('');
            logs.push('=== CRITICAL OUTPUT ===');
            logs.push(...criticalLines);
          }
        }
        positions.out = outRead.newPosition;
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
        .filter(line => line.trim() && line !== 'No error log' && !isBenignStderrLine(line))
        .slice(-50);

      if (errorLines.length > 0) {
        logs.push('=== PRODUCTION ERRORS ===');
        logs.push(...errorLines);
      }

      // Get critical output lines
      const outCommand = `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no ${SSH_TARGET} "grep -E 'ERROR|FATAL|Failed' ${config.out} 2>/dev/null | tail -n 30 || echo 'No critical logs'"`;
      const outResult = execSync(outCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

      const criticalLines = outResult.split('\n')
        .filter(line => line.trim() && line !== 'No critical logs' && isCriticalLine(line))
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
      const env = process.env.INSTANCE_ROLE === 'test' ? 'test'
        : process.env.PRODUCTION === 'TRUE' ? 'prod' : 'dev';
      const config = PM2_LOG_PATHS[env];
      if (!monitoringState.positions[env]) monitoringState.positions[env] = { out: 0, error: 0 };
      let logs = [];

      // Determine if we should read local or remote
      // dev/test always read local files; on prod server read local; PRODUCTION from dev machine reads remote via SSH
      const isOnProdServer = this.isRunningOnProdServer();
      const shouldReadLocal = env === 'dev' || env === 'test' || isOnProdServer;

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
        const tag = env === 'prod' ? '🔴 **[PM2-PROD]**' : env === 'test' ? '🟦 **[PM2-TEST]**' : '🟡 **[PM2-DEV]**';
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