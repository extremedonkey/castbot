/**
 * SAFARI ARCHIVE — zero-dep ZIP create/read hardening tests
 *
 * safariArchive.js parses UNTRUSTED user uploads (Safari package imports), so
 * beyond the happy-path round trip these tests pin the security behaviors:
 * traversal-name rejection, zip64/encryption/method rejection, zip-bomb caps,
 * CRC integrity, and interop with OS-created zips that use data descriptors
 * (central-directory-driven reading must not care about zeroed local sizes).
 *
 * The module is dependency-free, so it is imported directly (no inline replicas).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createArchive, readArchive, isZipBuffer, crc32, ArchiveError } from '../safariArchive.js';

describe('safariArchive — crc32', () => {
  it('matches the standard test vector', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
  });

  it('empty buffer is 0', () => {
    assert.equal(crc32(Buffer.alloc(0)), 0);
  });
});

describe('safariArchive — round trip', () => {
  it('stores and deflates entries and reads them back byte-identical', () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4]);
    const zip = createArchive([
      { name: 'manifest.json', data: '{"format":"castbot-safari-export"}', compress: true },
      { name: 'data.json', data: JSON.stringify({ items: {}, stores: {} }), compress: true },
      { name: 'assets/map.png', data: png, compress: false }
    ]);

    assert.ok(isZipBuffer(zip));
    const entries = readArchive(zip);
    assert.equal(entries.size, 3);
    assert.equal(entries.get('manifest.json').toString(), '{"format":"castbot-safari-export"}');
    assert.deepEqual(JSON.parse(entries.get('data.json').toString()), { items: {}, stores: {} });
    assert.ok(entries.get('assets/map.png').equals(png));
  });

  it('preserves UTF-8 entry names', () => {
    const zip = createArchive([{ name: 'assets/🗺️map.png', data: Buffer.from([1]), compress: false }]);
    const entries = readArchive(zip);
    assert.ok(entries.has('assets/🗺️map.png'));
  });

  it('large compressible data survives deflate round trip', () => {
    const big = Buffer.from('safari '.repeat(100_000));
    const zip = createArchive([{ name: 'data.json', data: big, compress: true }]);
    assert.ok(zip.length < big.length / 10, 'deflate should compress repetitive data heavily');
    assert.ok(readArchive(zip).get('data.json').equals(big));
  });

  it('reads zips whose local headers use data descriptors (OS re-zip interop)', () => {
    // Simulate macOS/Windows zippers: local header sizes/CRC zeroed + flag bit 3 set,
    // real values only in the central directory. Reader must not care.
    const zip = createArchive([{ name: 'data.json', data: '{"items":{}}', compress: true }]);
    // Local header starts at 0: flags at +6, crc/sizes at +14/+18/+22
    zip.writeUInt16LE(zip.readUInt16LE(6) | 0x0008, 6);
    zip.writeUInt32LE(0, 14);
    zip.writeUInt32LE(0, 18);
    zip.writeUInt32LE(0, 22);
    const entries = readArchive(zip);
    assert.equal(entries.get('data.json').toString(), '{"items":{}}');
  });
});

describe('safariArchive — junk entries are skipped, not fatal', () => {
  it('ignores __MACOSX/, dotfiles, and directory entries', () => {
    const zip = createArchive([
      { name: 'data.json', data: '{}', compress: true },
      { name: '__MACOSX/data.json', data: 'resource fork junk', compress: false },
      { name: '.DS_Store', data: 'junk', compress: false },
      { name: 'assets/', data: '', compress: false },
      { name: 'assets/.hidden', data: 'junk', compress: false }
    ]);
    const entries = readArchive(zip);
    assert.deepEqual([...entries.keys()], ['data.json']);
  });
});

describe('safariArchive — malformed input rejection', () => {
  it('rejects non-zip garbage', () => {
    assert.equal(isZipBuffer(Buffer.from('definitely not a zip file at all')), false);
    assert.throws(() => readArchive(Buffer.from('definitely not a zip file at all')), ArchiveError);
  });

  it('rejects truncated archives', () => {
    const zip = createArchive([{ name: 'data.json', data: '{"a":1}', compress: true }]);
    assert.throws(() => readArchive(zip.subarray(0, zip.length - 30)), ArchiveError);
  });

  it('rejects an entry whose bytes were corrupted (CRC integrity)', () => {
    const zip = createArchive([{ name: 'assets/map.png', data: Buffer.from('imagebytesimagebytes'), compress: false }]);
    // Flip one payload byte (payload of a stored entry starts at 30 + name length)
    const dataStart = 30 + 'assets/map.png'.length;
    zip[dataStart + 3] ^= 0xFF;
    assert.throws(() => readArchive(zip), /integrity check/);
  });

  it('rejects zip64 markers with a clear message', () => {
    const zip = createArchive([{ name: 'data.json', data: '{}', compress: true }]);
    zip.writeUInt16LE(0xFFFF, zip.length - 22 + 10); // EOCD total entry count → zip64 marker
    assert.throws(() => readArchive(zip), /zip64/);
  });

  it('rejects encrypted entries', () => {
    const zip = createArchive([{ name: 'data.json', data: '{}', compress: true }]);
    const centralOffset = zip.readUInt32LE(zip.length - 22 + 16);
    zip.writeUInt16LE(zip.readUInt16LE(centralOffset + 8) | 0x0001, centralOffset + 8);
    assert.throws(() => readArchive(zip), /Encrypted/);
  });

  it('rejects unsupported compression methods', () => {
    const zip = createArchive([{ name: 'data.json', data: '{}', compress: true }]);
    const centralOffset = zip.readUInt32LE(zip.length - 22 + 16);
    zip.writeUInt16LE(9, centralOffset + 10); // method 9 = deflate64
    assert.throws(() => readArchive(zip), /unsupported compression/);
  });
});

describe('safariArchive — unsafe entry names are a hard reject', () => {
  for (const name of ['../evil.json', 'a/../../evil.json', '/etc/passwd', 'a\\b.json']) {
    it(`rejects "${name}"`, () => {
      const zip = createArchive([{ name, data: 'x', compress: false }]);
      assert.throws(() => readArchive(zip), /unsafe entry name/);
    });
  }
});

describe('safariArchive — size caps (zip-bomb protection)', () => {
  it('rejects archives with too many entries', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.json`, data: '{}', compress: false }));
    const zip = createArchive(entries);
    assert.throws(() => readArchive(zip, { maxEntries: 4 }), /too many files/);
  });

  it('rejects a single over-cap entry via its declared size (before decompression)', () => {
    const big = Buffer.alloc(2 * 1024 * 1024); // 2MB of zeros → tiny deflate
    const zip = createArchive([{ name: 'data.json', data: big, compress: true }]);
    assert.ok(zip.length < 50_000, 'bomb fixture should be tiny compressed');
    assert.throws(() => readArchive(zip, { maxEntryUncompressed: 1024 * 1024 }), /too large/);
  });

  it('rejects archives whose total expansion exceeds the cap', () => {
    const chunk = Buffer.alloc(512 * 1024);
    const zip = createArchive([
      { name: 'a.bin', data: chunk, compress: true },
      { name: 'b.bin', data: chunk, compress: true },
      { name: 'c.bin', data: chunk, compress: true }
    ]);
    assert.throws(() => readArchive(zip, { maxTotalUncompressed: 1024 * 1024 }), /expands beyond/);
  });

  it('a lying declared size cannot smuggle oversized output past the inflate cap', () => {
    // Declare a small uncompressedSize in the central dir but ship a payload that
    // actually inflates larger — maxOutputLength must stop it, then integrity fails.
    const big = Buffer.alloc(4 * 1024 * 1024);
    const zip = createArchive([{ name: 'data.json', data: big, compress: true }]);
    const centralOffset = zip.readUInt32LE(zip.length - 22 + 16);
    zip.writeUInt32LE(1000, centralOffset + 24); // lie: claim 1000 bytes uncompressed
    assert.throws(() => readArchive(zip), ArchiveError);
  });
});

describe('safariArchive — writer validation', () => {
  it('refuses to create an empty archive', () => {
    assert.throws(() => createArchive([]), ArchiveError);
  });

  it('output opens with a standard local-header signature', () => {
    const zip = createArchive([{ name: 'x', data: 'y', compress: false }]);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
  });

  it('deflate output verified independently by zlib', () => {
    const zip = createArchive([{ name: 'data.json', data: '{"round":"trip"}', compress: true }]);
    // Extract payload manually: local header 30 bytes + name, compressed size at +18
    const compSize = zip.readUInt32LE(18);
    const payload = zip.subarray(30 + 'data.json'.length, 30 + 'data.json'.length + compSize);
    assert.equal(zlib.inflateRawSync(payload).toString(), '{"round":"trip"}');
  });
});
