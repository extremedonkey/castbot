/**
 * Backup Service — Automated Discord channel backups of data files
 * Posts playerData.json, safariContent.json, and scheduledJobs.json
 * to a designated Discord channel on a configurable interval.
 *
 * Never crashes the bot — all errors isolated.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Files to back up (relative to project root)
const BACKUP_FILES = [
  { name: 'playerData.json', critical: true },
  { name: 'safariContent.json', critical: true },
  { name: 'scheduledJobs.json', critical: false },
];

// Default config
const DEFAULT_CHANNEL_ID = '1480242675725897789';
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_DELAY_MS = 30_000; // 30s after ready before first backup

let instance = null;

export class BackupService {
  constructor(client) {
    this.client = client;
    this.channelId = DEFAULT_CHANNEL_ID;
    this.intervalMs = DEFAULT_INTERVAL_MS;
    this.intervalHandle = null;
    this.startupTimeout = null;
    this.lastBackupTime = null;
    this.backupCount = 0;
  }

  /**
   * Start the backup service.
   * @param {object} options
   * @param {string} [options.channelId] - Discord channel ID to post backups
   * @param {number} [options.intervalMs] - Interval in milliseconds between backups
   */
  start(options = {}) {
    if (options.channelId) this.channelId = options.channelId;
    if (options.intervalMs) this.intervalMs = options.intervalMs;

    console.log(`📦 [BACKUP] Starting backup service — interval: ${this.formatDuration(this.intervalMs)}, channel: ${this.channelId}`);

    // First backup after startup delay
    this.startupTimeout = setTimeout(() => {
      this.runBackup('startup');
      // Then recurring
      this.intervalHandle = setInterval(() => {
        this.runBackup('scheduled');
      }, this.intervalMs);
    }, STARTUP_DELAY_MS);
  }

  stop() {
    if (this.startupTimeout) clearTimeout(this.startupTimeout);
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.startupTimeout = null;
    this.intervalHandle = null;
    console.log('📦 [BACKUP] Service stopped');
  }

  async runBackup(trigger = 'manual') {
    try {
      console.log(`📦 [BACKUP] Running ${trigger} backup...`);

      const files = [];
      let totalSize = 0;

      for (const fileDef of BACKUP_FILES) {
        const filePath = path.join(PROJECT_ROOT, fileDef.name);
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const size = Buffer.byteLength(content, 'utf8');
          files.push({ name: fileDef.name, content, size, critical: fileDef.critical });
          totalSize += size;
        } catch (err) {
          if (fileDef.critical) {
            console.error(`📦 [BACKUP] ❌ Failed to read critical file ${fileDef.name}:`, err.message);
            return; // Abort if a critical file is missing
          }
          console.warn(`📦 [BACKUP] ⚠️ Skipping optional file ${fileDef.name}: ${err.message}`);
        }
      }

      // Build stats
      const stats = await this.buildStats(files);
      const timestamp = this.formatTimestamp();
      const isProduction = process.env.PRODUCTION === 'TRUE';
      const env = isProduction ? 'PROD' : 'DEV';

      // Build message
      const message = [
        `📦 **Backup — ${timestamp}** [${env}] (${trigger})`,
        '',
        ...files.map(f => `\`${f.name}\` — ${this.formatSize(f.size)}`),
        '',
        stats,
      ].join('\n');

      // Post via REST API with file attachments
      await this.postBackup(message, files);

      this.lastBackupTime = new Date();
      this.backupCount++;
      console.log(`📦 [BACKUP] ✅ Backup #${this.backupCount} complete (${this.formatSize(totalSize)} total)`);

    } catch (error) {
      console.error('📦 [BACKUP] ❌ Backup failed (non-fatal):', error.message);
      // Never crash the bot
    }
  }

  async buildStats(files) {
    const parts = [];

    // playerData stats
    const pdFile = files.find(f => f.name === 'playerData.json');
    if (pdFile) {
      try {
        const pd = JSON.parse(pdFile.content);
        const guilds = Object.keys(pd).filter(k => /^\d+$/.test(k)).length;
        let totalPlayers = 0;
        for (const gId of Object.keys(pd)) {
          if (/^\d+$/.test(gId) && pd[gId]?.players) {
            totalPlayers += Object.keys(pd[gId].players).length;
          }
        }
        parts.push(`Guilds: ${guilds} | Players: ${totalPlayers}`);
      } catch { /* ignore parse errors */ }
    }

    // safariContent stats
    const scFile = files.find(f => f.name === 'safariContent.json');
    if (scFile) {
      try {
        const sc = JSON.parse(scFile.content);
        const safariGuilds = Object.keys(sc).filter(k => /^\d+$/.test(k)).length;
        parts.push(`Safari configs: ${safariGuilds}`);
      } catch { /* ignore */ }
    }

    return parts.join(' | ');
  }

  async postBackup(message, files) {
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    form.append('payload_json', JSON.stringify({ content: message }));

    for (let i = 0; i < files.length; i++) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = path.extname(files[i].name);
      const base = path.basename(files[i].name, ext);
      const filename = `${base}-${timestamp}${ext}`;

      form.append(`files[${i}]`, Buffer.from(files[i].content, 'utf8'), {
        filename,
        contentType: 'application/json',
      });
    }

    const url = `https://discord.com/api/v10/channels/${this.channelId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Discord API ${response.status}: ${body}`);
    }
  }

  formatTimestamp() {
    const now = new Date();
    // GMT+8 (AWST)
    const offset = 8;
    const local = new Date(now.getTime() + offset * 60 * 60 * 1000);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = days[local.getUTCDay()];
    const date = local.getUTCDate();
    const month = months[local.getUTCMonth()];
    const year = local.getUTCFullYear();
    const h = local.getUTCHours();
    const m = String(local.getUTCMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${day} ${date} ${month} ${year}, ${h12}:${m} ${ampm} AWST`;
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDuration(ms) {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${Math.round(ms / 3_600_000)}h`;
  }
}

/**
 * Get or create the singleton BackupService instance.
 */
export function getBackupService(client) {
  if (!instance) {
    instance = new BackupService(client);
  }
  return instance;
}
