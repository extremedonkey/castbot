/**
 * Tests for PM2ErrorLogger tail-read (readNewBytes) — the memory-footprint fix
 * that replaced whole-file readFileSync with positional fd reads (RaP 0904).
 *
 * The module has no top-level Discord/network imports, so we import the real
 * class and exercise readNewBytes against temp files.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PM2ErrorLogger } from '../src/monitoring/pm2ErrorLogger.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm2logger-test-'));
const logger = new PM2ErrorLogger(null);

function tmpFile(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe('PM2ErrorLogger — readNewBytes tail reads', () => {
  it('returns null for a missing file', () => {
    assert.equal(logger.readNewBytes(path.join(tmpDir, 'nope.log'), 0), null);
  });

  it('reads the whole file from position 0', () => {
    const p = tmpFile('a.log', 'line1\nline2\n');
    const r = logger.readNewBytes(p, 0);
    assert.equal(r.text, 'line1\nline2\n');
    assert.equal(r.newPosition, Buffer.byteLength('line1\nline2\n'));
  });

  it('returns only appended bytes on subsequent reads', () => {
    const p = tmpFile('b.log', 'old content\n');
    const first = logger.readNewBytes(p, 0);
    fs.appendFileSync(p, 'NEW ERROR line\n');
    const second = logger.readNewBytes(p, first.newPosition);
    assert.equal(second.text, 'NEW ERROR line\n');
    assert.equal(second.newPosition, fs.statSync(p).size);
  });

  it('returns empty text when nothing was appended', () => {
    const p = tmpFile('c.log', 'stable\n');
    const first = logger.readNewBytes(p, 0);
    const second = logger.readNewBytes(p, first.newPosition);
    assert.equal(second.text, '');
    assert.equal(second.newPosition, first.newPosition);
  });

  it('resets to start when the file shrank (log rotation)', () => {
    const p = tmpFile('d.log', 'after rotation\n');
    // Position from the pre-rotation file was far beyond the new size
    const r = logger.readNewBytes(p, 999999);
    assert.equal(r.text, 'after rotation\n');
    assert.equal(r.newPosition, fs.statSync(p).size);
  });

  it('caps a huge backlog read to the tail (never materializes the whole file)', () => {
    const CAP = 512 * 1024;
    const big = 'x'.repeat(CAP + 10000) + '\nfinal line\n';
    const p = tmpFile('e.log', big);
    const r = logger.readNewBytes(p, 0);
    assert.equal(r.text.length, CAP);
    assert.ok(r.text.endsWith('\nfinal line\n'));
    assert.equal(r.newPosition, Buffer.byteLength(big));
  });

  it('byte positions handle multi-byte emoji content correctly', () => {
    const p = tmpFile('f.log', '🚨 emoji error\n');
    const first = logger.readNewBytes(p, 0);
    assert.equal(first.text, '🚨 emoji error\n');
    fs.appendFileSync(p, '✅ second 🎯 line\n');
    const second = logger.readNewBytes(p, first.newPosition);
    assert.equal(second.text, '✅ second 🎯 line\n');
  });
});

describe('PM2ErrorLogger — readLogsLocal position migration', () => {
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-baselines legacy (string-length) positions to byte offsets and skips the tick', async () => {
    const errPath = tmpFile('mig-error.log', 'PRE-EXISTING ERROR backlog\n');
    const outPath = tmpFile('mig-out.log', 'old output ERROR noise\n');
    const config = { error: errPath, out: outPath };
    const positions = { out: 5, error: 3 }; // legacy positions, no _unit marker

    const logs = await logger.readLogsLocal(config, positions);
    assert.deepEqual(logs, []); // migration tick emits nothing (no backlog spam)
    assert.equal(positions._unit, 'bytes');
    assert.equal(positions.error, fs.statSync(errPath).size);
    assert.equal(positions.out, fs.statSync(outPath).size);

    // Next tick picks up only fresh lines
    fs.appendFileSync(errPath, 'FRESH ERROR after migration\n');
    const logs2 = await logger.readLogsLocal(config, positions);
    assert.ok(logs2.some(l => l.includes('FRESH ERROR after migration')));
    assert.ok(!logs2.some(l => l.includes('PRE-EXISTING')));
  });
});
