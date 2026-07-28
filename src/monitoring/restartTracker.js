/**
 * Restart Tracker - Records bot startup timestamps for health monitoring.
 * Keeps the last 20 entries in restartHistory.json.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = path.join(__dirname, '..', '..', 'restartHistory.json');
const REASON_MARKER = path.join(__dirname, '..', '..', 'logs', 'restart-reason.json');
const LEGACY_MARKER = path.join(__dirname, '..', '..', 'logs', 'planned-restart.json');
const MAX_ENTRIES = 20;
const MARKER_FRESH_MS = 10 * 60 * 1000;

/**
 * Restart types (the claimed-reason model): every deliberate restart initiator drops a
 * marker via writeRestartMarker() before restarting; a boot that finds NO fresh marker is
 * classified 'crash' — the restart nothing claimed is exactly the one you want flagged.
 *   planned      🌙  scheduled 🌙 restart (restartScheduler)
 *   deploy       📦  deploy pipelines (deploy-remote-wsl / win-restart / dev-restart / box-restart)
 *   remediation  🐕  watchdog / Restart Prod button via remediate-castbot.sh
 *   manual       🔁  Ultrathink panel Restart button
 *   crash        💥  unclaimed (PM2 revived a dead process, or an untracked hand-restart)
 */
export async function writeRestartMarker(type) {
  try {
    await fs.mkdir(path.dirname(REASON_MARKER), { recursive: true });
    await fs.writeFile(REASON_MARKER, JSON.stringify({ type, at: Date.now() }));
  } catch (err) {
    console.error('[RestartTracker] Failed to write restart marker:', err.message);
  }
}

/**
 * Record a restart timestamp. Call once on bot startup.
 */
export async function recordRestart() {
  try {
    let history = [];
    try {
      const raw = await fs.readFile(HISTORY_FILE, 'utf8');
      history = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[RestartTracker] Failed to read history:', err.message);
      }
    }

    // Consume the typed reason marker (or the legacy planned-restart marker from
    // pre-typed-scheduler code); stale markers (>10 min) are leftovers from a restart
    // that never happened — ignore them so they can't mislabel a later crash.
    let type = 'crash';
    for (const [markerFile, legacyType] of [[REASON_MARKER, null], [LEGACY_MARKER, 'planned']]) {
      try {
        const marker = JSON.parse(await fs.readFile(markerFile, 'utf8'));
        if (marker?.at && Date.now() - marker.at < MARKER_FRESH_MS) {
          type = legacyType ?? marker.type ?? 'crash';
        }
        await fs.unlink(markerFile);
        break;
      } catch { /* marker absent — try next / default to crash */ }
    }

    // planned:true kept alongside type for backward compat with older readers
    history.push(type === 'planned'
      ? { timestamp: Date.now(), planned: true, type }
      : { timestamp: Date.now(), type });

    // Keep only the last MAX_ENTRIES
    if (history.length > MAX_ENTRIES) {
      history = history.slice(-MAX_ENTRIES);
    }

    const tmpPath = HISTORY_FILE + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(history, null, 2));
    await fs.rename(tmpPath, HISTORY_FILE);

    console.log(`📋 [RestartTracker] Recorded restart (#${history.length} in history)`);
  } catch (err) {
    console.error('[RestartTracker] Failed to record restart:', err.message);
  }
}

/**
 * Get the last N restart timestamps.
 * @param {number} count - Number of entries to return (default 5)
 * @returns {Array<{timestamp: number}>}
 */
export async function getRestartHistory(count = 5) {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const history = JSON.parse(raw);
    return history.slice(-count).reverse(); // Most recent first
  } catch (err) {
    return [];
  }
}
