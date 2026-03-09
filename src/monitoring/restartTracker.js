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
const MAX_ENTRIES = 20;

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

    history.push({ timestamp: Date.now() });

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
