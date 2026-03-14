import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { atomicSave } from '../atomicSave.js';

const TEST_DIR = '/tmp/atomicSave-test';
const TEST_FILE = path.join(TEST_DIR, 'test.json');

beforeEach(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('atomicSave — basic writes', () => {
  it('writes valid JSON to file', async () => {
    const data = { guilds: { '123': { players: {} } } };
    await atomicSave(TEST_FILE, data, { minSize: 10, label: 'test' });
    const content = await fs.readFile(TEST_FILE, 'utf8');
    assert.deepEqual(JSON.parse(content), data);
  });

  it('creates .backup on second write', async () => {
    const v1 = { version: 1 };
    const v2 = { version: 2 };
    await atomicSave(TEST_FILE, v1, { minSize: 10, label: 'test' });
    await atomicSave(TEST_FILE, v2, { minSize: 10, label: 'test' });

    const main = JSON.parse(await fs.readFile(TEST_FILE, 'utf8'));
    const backup = JSON.parse(await fs.readFile(TEST_FILE + '.backup', 'utf8'));
    assert.equal(main.version, 2);
    assert.equal(backup.version, 1);
  });

  it('does not leave .tmp file on success', async () => {
    await atomicSave(TEST_FILE, { ok: true }, { minSize: 5, label: 'test' });
    await assert.rejects(fs.access(TEST_FILE + '.tmp'));
  });
});

describe('atomicSave — size validation', () => {
  it('rejects data below minSize', async () => {
    await assert.rejects(
      atomicSave(TEST_FILE, {}, { minSize: 1000, label: 'test' }),
      /too small/
    );
  });

  it('creates .REJECTED file on size failure', async () => {
    try {
      await atomicSave(TEST_FILE, {}, { minSize: 1000, label: 'test' });
    } catch { /* expected */ }
    const rejected = await fs.readFile(TEST_FILE + '.REJECTED', 'utf8');
    assert.equal(rejected, '{}');
  });

  it('does not overwrite main file on rejection', async () => {
    const original = { safe: true };
    await atomicSave(TEST_FILE, original, { minSize: 5, label: 'test' });
    try {
      await atomicSave(TEST_FILE, {}, { minSize: 1000, label: 'test' });
    } catch { /* expected */ }
    const content = JSON.parse(await fs.readFile(TEST_FILE, 'utf8'));
    assert.equal(content.safe, true);
  });
});

describe('atomicSave — structure validation', () => {
  it('rejects when validate returns not ok', async () => {
    const validate = (data) => ({
      ok: Object.keys(data).length > 0,
      reason: 'data is empty'
    });
    await assert.rejects(
      atomicSave(TEST_FILE, {}, { minSize: 1, validate, label: 'test' }),
      /data is empty/
    );
  });

  it('accepts when validate returns ok', async () => {
    const validate = (data) => ({ ok: data.valid === true });
    await atomicSave(TEST_FILE, { valid: true }, { minSize: 5, validate, label: 'test' });
    const content = JSON.parse(await fs.readFile(TEST_FILE, 'utf8'));
    assert.equal(content.valid, true);
  });
});

describe('atomicSave — onSaved callback', () => {
  it('calls onSaved after successful write', async () => {
    let called = false;
    await atomicSave(TEST_FILE, { x: 1 }, {
      minSize: 5,
      label: 'test',
      onSaved: () => { called = true; },
    });
    assert.equal(called, true);
  });

  it('does not call onSaved on rejection', async () => {
    let called = false;
    try {
      await atomicSave(TEST_FILE, {}, {
        minSize: 1000,
        label: 'test',
        onSaved: () => { called = true; },
      });
    } catch { /* expected */ }
    assert.equal(called, false);
  });
});

describe('atomicSave — mutex serialization', () => {
  it('handles concurrent saves without corruption', async () => {
    // Fire 5 concurrent saves — all should complete without .tmp races
    const saves = Array.from({ length: 5 }, (_, i) =>
      atomicSave(TEST_FILE, { seq: i }, { minSize: 5, label: 'test' })
    );
    await Promise.all(saves);

    const content = JSON.parse(await fs.readFile(TEST_FILE, 'utf8'));
    // Last write wins — seq should be one of 0-4
    assert.ok(content.seq >= 0 && content.seq <= 4);

    // Main file should be valid JSON
    assert.ok(typeof content.seq === 'number');
  });
});
