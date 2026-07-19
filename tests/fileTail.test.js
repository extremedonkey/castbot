/**
 * Tests for utils/fileTail.js — bounded tail reads for append-only logs (incident 06).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { alignToLineStart, readFileTail } from '../utils/fileTail.js';

describe('File Tail — alignToLineStart (pure)', () => {
  it('returns text unchanged when the read started at file offset 0', () => {
    assert.equal(alignToLineStart('partial\nline2\n', false), 'partial\nline2\n');
  });

  it('drops the partial first line when the read started mid-file', () => {
    assert.equal(alignToLineStart('rtial line\nline2\nline3\n', true), 'line2\nline3\n');
  });

  it('mid-file text without any newline yields empty string', () => {
    assert.equal(alignToLineStart('one-truncated-line-no-newline', true), '');
  });
});

describe('File Tail — readFileTail (fd positional read)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filetail-test-'));
  const file = path.join(dir, 'log.txt');
  const lines = Array.from({ length: 100 }, (_, i) => `line-${String(i).padStart(3, '0')} payload`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const fullSize = fs.statSync(file).size;

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('budget >= file size reads everything, untruncated', async () => {
    const tail = await readFileTail(file, fullSize + 1000);
    assert.equal(tail.truncated, false);
    assert.equal(tail.fileSize, fullSize);
    assert.equal(tail.text, lines.join('\n') + '\n');
  });

  it('small budget returns only recent lines, line-aligned, truncated=true', async () => {
    const tail = await readFileTail(file, 100);
    assert.equal(tail.truncated, true);
    const got = tail.text.split('\n').filter(Boolean);
    assert.ok(got.length >= 1 && got.length <= 6);
    // Every returned line is complete (matches the known format) and the last line is the file's last
    for (const line of got) assert.match(line, /^line-\d{3} payload$/);
    assert.equal(got[got.length - 1], 'line-099 payload');
  });

  it('missing file returns null', async () => {
    assert.equal(await readFileTail(path.join(dir, 'nope.txt'), 100), null);
  });

  it('multi-byte characters split at the boundary are confined to the dropped partial line', async () => {
    const emojiFile = path.join(dir, 'emoji.txt');
    const emojiLines = Array.from({ length: 50 }, (_, i) => `🦁 safari ${i} 🗺️`);
    fs.writeFileSync(emojiFile, emojiLines.join('\n') + '\n');
    // Probe several budgets so some land mid-emoji; returned lines must always be intact
    for (const budget of [37, 41, 53, 67, 101]) {
      const tail = await readFileTail(emojiFile, budget);
      for (const line of tail.text.split('\n').filter(Boolean)) {
        assert.match(line, /^🦁 safari \d+ 🗺️$/, `budget ${budget} produced corrupt line: ${JSON.stringify(line)}`);
      }
    }
  });
});
