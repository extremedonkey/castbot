/**
 * safariArchive.js — minimal, hardened, zero-dependency ZIP create/read
 *
 * Purpose-built for Safari export packages (manifest.json + data.json + assets/map.png).
 * Deliberately NOT a general-purpose zip library:
 *   - Everything happens IN MEMORY. Entry names are never used as filesystem paths,
 *     which eliminates the zip path-traversal class entirely — callers look entries
 *     up by exact expected name from the returned Map.
 *   - Writer emits standard store/deflate zips readable by any OS tool.
 *   - Reader is CENTRAL-DIRECTORY driven (sizes/CRCs always come from the central
 *     directory, so data-descriptor zips from macOS Archive Utility / Windows
 *     Explorer / Info-ZIP just work), with hard caps against zip bombs.
 *   - zip64, encryption, and exotic compression methods are rejected with clear,
 *     user-presentable errors — impossible to hit with a <10MB re-zip from any
 *     mainstream tool.
 *
 * Node 18 compatible (no zlib.crc32 — hand-rolled table below).
 */

import zlib from 'node:zlib';

/** User-presentable archive failure. `.message` is safe to show in Discord. */
export class ArchiveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArchiveError';
  }
}

// ── CRC-32 (standard polynomial 0xEDB88320) ──────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

/**
 * CRC-32 of a buffer (unsigned 32-bit result).
 * @param {Buffer} buf
 * @returns {number}
 */
export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Signatures & limits ──────────────────────────────────────────────────────

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const DEFAULT_LIMITS = {
  maxEntries: 32,
  maxTotalUncompressed: 20 * 1024 * 1024, // 20MB
  maxEntryUncompressed: 16 * 1024 * 1024  // 16MB
};

/**
 * Quick magic-bytes check: does this buffer look like a ZIP archive?
 * Accepts a normal zip (local header first) or an empty zip (EOCD first).
 * @param {Buffer} buf
 * @returns {boolean}
 */
export function isZipBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  const sig = buf.readUInt32LE(0);
  return sig === SIG_LOCAL || sig === SIG_EOCD;
}

// ── Writer ───────────────────────────────────────────────────────────────────

/** MS-DOS date/time pair for zip headers (2-second resolution, floor 1980). */
function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

/**
 * Build a ZIP archive from in-memory entries.
 * @param {Array<{name: string, data: Buffer|string, compress?: boolean}>} entries
 *   - name: forward-slash relative path inside the archive (e.g. 'assets/map.png')
 *   - data: entry content
 *   - compress: true → deflate (use for text/JSON); false/omitted → store (use for PNG/JPG)
 * @returns {Buffer} Complete zip file
 */
export function createArchive(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ArchiveError('Cannot create an empty archive');
  }

  const { dosTime, dosDate } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32(data);
    const method = entry.compress ? 8 : 0;
    const payload = entry.compress ? zlib.deflateRawSync(data, { level: 9 }) : data;

    // Local file header (30 bytes fixed + name)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);            // extra length

    localParts.push(local, nameBuf, payload);

    // Central directory record (46 bytes fixed + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0x0800, 8);      // flags: UTF-8 names
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    // extra(30)=0, comment(32)=0, disk(34)=0, internal attrs(36)=0, external attrs(38)=0
    central.writeUInt32LE(offset, 42);     // local header offset

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);

  // End of central directory (22 bytes, no comment)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  // disk numbers (4, 6) = 0
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  // comment length (20) = 0

  return Buffer.concat([...localParts, centralDir, eocd]);
}

// ── Reader ───────────────────────────────────────────────────────────────────

/** Entry names that are ignored (OS junk), not rejected. */
function isJunkEntry(name) {
  if (name.endsWith('/')) return true;                 // directory entries
  const base = name.split('/').pop();
  if (name.startsWith('__MACOSX/')) return true;       // macOS resource forks
  if (base.startsWith('.')) return true;               // .DS_Store and friends
  return false;
}

/** Entry names that make the whole archive untrusted → hard reject. */
function isUnsafeEntryName(name) {
  if (name.length === 0 || name.length > 512) return true;
  if (name.includes('\\')) return true;                // backslash paths
  if (name.startsWith('/')) return true;               // absolute paths
  if (name.split('/').includes('..')) return true;     // traversal segments
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 0x20) return true;        // control chars
  }
  return false;
}

/**
 * Read a ZIP archive fully in memory, driven by the central directory.
 * Never touches the filesystem; entry names are ONLY map keys.
 *
 * @param {Buffer} buffer - The complete zip file
 * @param {Object} [limits] - {maxEntries, maxTotalUncompressed, maxEntryUncompressed}
 * @returns {Map<string, Buffer>} entry name → content (junk entries omitted)
 * @throws {ArchiveError} on malformed/unsupported/oversized archives
 */
export function readArchive(buffer, limits = {}) {
  const { maxEntries, maxTotalUncompressed, maxEntryUncompressed } = { ...DEFAULT_LIMITS, ...limits };

  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new ArchiveError('This file is not a valid ZIP archive');
  }

  // 1. Find End Of Central Directory: scan backwards over the max comment length
  let eocdPos = -1;
  const scanFloor = Math.max(0, buffer.length - 22 - 65535);
  for (let i = buffer.length - 22; i >= scanFloor; i--) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos === -1) {
    throw new ArchiveError('This file is not a valid ZIP archive (no end-of-central-directory record)');
  }

  const entryCount = buffer.readUInt16LE(eocdPos + 10);
  const centralSize = buffer.readUInt32LE(eocdPos + 12);
  const centralOffset = buffer.readUInt32LE(eocdPos + 16);

  // 2. Reject zip64 (irrelevant for <10MB packages; keeps the parser simple & safe)
  if (entryCount === 0xFFFF || centralSize === 0xFFFFFFFF || centralOffset === 0xFFFFFFFF) {
    throw new ArchiveError('This ZIP archive is too large or uses an unsupported format (zip64)');
  }
  if (entryCount > maxEntries) {
    throw new ArchiveError(`This ZIP archive contains too many files (${entryCount}, max ${maxEntries})`);
  }
  if (centralOffset + centralSize > buffer.length) {
    throw new ArchiveError('This ZIP archive is corrupt (central directory out of bounds)');
  }

  // 3. Walk central directory records
  const result = new Map();
  let pos = centralOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== SIG_CENTRAL) {
      throw new ArchiveError('This ZIP archive is corrupt (bad central directory record)');
    }

    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const crc = buffer.readUInt32LE(pos + 16);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x0001) {
      throw new ArchiveError('Encrypted ZIP archives are not supported');
    }
    if (isJunkEntry(name)) continue;
    if (isUnsafeEntryName(name)) {
      throw new ArchiveError(`This ZIP archive contains an unsafe entry name and was rejected`);
    }
    if (method !== 0 && method !== 8) {
      throw new ArchiveError('This ZIP archive uses an unsupported compression method — re-zip it with standard settings');
    }
    if (uncompressedSize > maxEntryUncompressed) {
      throw new ArchiveError(`An entry in this ZIP archive is too large (max ${Math.floor(maxEntryUncompressed / (1024 * 1024))}MB per file)`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maxTotalUncompressed) {
      throw new ArchiveError(`This ZIP archive expands beyond the allowed size (max ${Math.floor(maxTotalUncompressed / (1024 * 1024))}MB total)`);
    }

    // 4. Parse the LOCAL header at the recorded offset — its name/extra lengths can
    //    differ from the central record's, so the payload position must come from it.
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new ArchiveError('This ZIP archive is corrupt (bad local file header)');
    }
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compressedSize > buffer.length) {
      throw new ArchiveError('This ZIP archive is corrupt (entry data out of bounds)');
    }
    const payload = buffer.subarray(dataStart, dataStart + compressedSize);

    // 5. Decompress (method 8) or slice (method 0), with a bomb-proof output cap
    let data;
    if (method === 0) {
      data = Buffer.from(payload);
    } else {
      try {
        data = zlib.inflateRawSync(payload, {
          maxOutputLength: Math.min(uncompressedSize || maxEntryUncompressed, maxEntryUncompressed)
        });
      } catch {
        throw new ArchiveError('This ZIP archive is corrupt (an entry failed to decompress)');
      }
    }

    // 6. Integrity: CRC + declared size must match
    if (data.length !== uncompressedSize || crc32(data) !== crc) {
      throw new ArchiveError('This ZIP archive is corrupt (an entry failed its integrity check)');
    }

    result.set(name, data);
  }

  return result;
}
