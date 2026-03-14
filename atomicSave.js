/**
 * atomicSave — Unified safe-write utility for JSON data files.
 *
 * Extracted from storage.js's battle-tested 7-step save pattern.
 * All critical JSON files should use this instead of raw fs.writeFile.
 *
 * Features:
 * - Write mutex (prevents concurrent .tmp corruption)
 * - Size validation (refuses suspiciously small saves)
 * - Optional structure validation (custom callback)
 * - Rolling backup (.backup before each write)
 * - Atomic write (temp file + rename)
 * - Temp file verification
 */

import fs from 'fs/promises';

// Global write mutex — shared across all files to prevent any concurrent .tmp races
let _saveQueue = Promise.resolve();

/**
 * Enqueue a save operation through the global write mutex.
 * @param {Function} fn - async function to run exclusively
 */
function withMutex(fn) {
  let resolve;
  const next = new Promise(r => { resolve = r; });
  const prev = _saveQueue;
  _saveQueue = next;
  return prev.then(fn).finally(resolve);
}

/**
 * Safely write a JSON data file with full protection.
 *
 * @param {string} filePath - Absolute path to the target file
 * @param {object} data - Data to serialize and save
 * @param {object} options
 * @param {number} options.minSize - Minimum byte size to accept (wipe protection)
 * @param {function} [options.validate] - Optional fn(data) → { ok: boolean, reason?: string }
 * @param {string} [options.label] - Human-readable name for log messages (e.g. 'playerData')
 * @param {function} [options.onSaved] - Called after successful write (e.g. to clear a cache)
 */
export async function atomicSave(filePath, data, options = {}) {
  return withMutex(() => _atomicSaveUnsafe(filePath, data, options));
}

async function _atomicSaveUnsafe(filePath, data, options) {
  const {
    minSize = 100,
    validate = null,
    label = filePath.split('/').pop(),
    onSaved = null,
  } = options;

  // 1. SERIALIZE
  const dataStr = JSON.stringify(data, null, 2);

  // 2. SIZE VALIDATION
  if (dataStr.length < minSize) {
    console.error(`🚨 REFUSING to save ${label}: ${dataStr.length} bytes < ${minSize} byte threshold`);
    await fs.writeFile(filePath + '.REJECTED', dataStr);
    throw new Error(`${label} save rejected — too small (${dataStr.length} bytes < ${minSize})`);
  }

  // 3. STRUCTURE VALIDATION (optional)
  if (validate) {
    const result = validate(data);
    if (!result.ok) {
      console.error(`🚨 REFUSING to save ${label}: ${result.reason}`);
      await fs.writeFile(filePath + '.REJECTED', dataStr);
      throw new Error(`${label} save rejected — ${result.reason}`);
    }
  }

  // 4. ROLLING BACKUP (.backup)
  try {
    await fs.access(filePath);
    await fs.copyFile(filePath, filePath + '.backup');
  } catch {
    // File doesn't exist yet — first save, no backup needed
  }

  // 5. ATOMIC WRITE (temp file)
  const tempPath = filePath + '.tmp';
  await fs.writeFile(tempPath, dataStr);

  // 6. VERIFY TEMP FILE
  const tempStats = await fs.stat(tempPath);
  if (tempStats.size < minSize) {
    await fs.unlink(tempPath);
    throw new Error(`${label} temp file verification failed (${tempStats.size} bytes < ${minSize})`);
  }

  // 7. ATOMIC RENAME
  await fs.rename(tempPath, filePath);

  // 8. POST-SAVE CALLBACK (cache clearing etc.)
  if (onSaved) {
    try { onSaved(); } catch { /* never fail on callback */ }
  }

  console.log(`✅ Saved ${label} (${dataStr.length} bytes)`);
}
