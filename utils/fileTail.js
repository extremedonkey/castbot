/**
 * Bounded tail reads for append-only log files (incident 06 follow-up).
 *
 * The analytics log keeps FULL history on disk by design (Reece wants the archive),
 * but in-process consumers must never materialize the whole file — they read at most
 * a caller-chosen byte budget from the END via a positional fd read. Same idea as
 * pm2ErrorLogger.readNewBytes, generalized for "last N bytes" instead of "since offset".
 */

import fs from 'fs';

/**
 * When a tail read starts mid-file, the first decoded line is almost always partial
 * (and may open on a split multi-byte char) — drop through the first newline.
 * Pure; exported for tests.
 * @param {string} text
 * @param {boolean} startedMidFile
 * @returns {string}
 */
export function alignToLineStart(text, startedMidFile) {
  if (!startedMidFile) return text;
  const firstNewline = text.indexOf('\n');
  return firstNewline === -1 ? '' : text.substring(firstNewline + 1);
}

/**
 * Read at most `maxBytes` from the end of `filePath`, aligned to a line boundary.
 * @param {string} filePath
 * @param {number} maxBytes - byte budget for the read
 * @returns {Promise<{text: string, fileSize: number, truncated: boolean}|null>}
 *   null when the file doesn't exist. `truncated` = true when older lines were skipped.
 */
export async function readFileTail(filePath, maxBytes) {
  let fileHandle;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const { size } = await fileHandle.stat();
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fileHandle.read(buffer, 0, length, start);
    const truncated = start > 0;
    return {
      text: alignToLineStart(buffer.toString('utf8', 0, bytesRead), truncated),
      fileSize: size,
      truncated
    };
  } finally {
    await fileHandle.close();
  }
}
