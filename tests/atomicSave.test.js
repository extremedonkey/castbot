import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { atomicSave } from '../atomicSave.js';

// Each test gets a unique dir to avoid cleanup races with the global mutex
let testCounter = 0;
async function freshFile() {
  const dir = `/tmp/atomicSave-test-${Date.now()}-${testCounter++}`;
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, 'test.json');
}

describe('atomicSave — basic writes', () => {
  it('writes valid JSON to file', async () => {
    const f = await freshFile();
    const data = { guilds: { '123': { players: {} } } };
    await atomicSave(f, data, { minSize: 10, label: 'test' });
    const content = await fs.readFile(f, 'utf8');
    assert.deepEqual(JSON.parse(content), data);
  });

  it('creates .backup on second write', async () => {
    const f = await freshFile();
    await atomicSave(f, { version: 1 }, { minSize: 10, label: 'test' });
    await atomicSave(f, { version: 2 }, { minSize: 10, label: 'test' });

    const main = JSON.parse(await fs.readFile(f, 'utf8'));
    const backup = JSON.parse(await fs.readFile(f + '.backup', 'utf8'));
    assert.equal(main.version, 2);
    assert.equal(backup.version, 1);
  });

  it('does not leave .tmp file on success', async () => {
    const f = await freshFile();
    await atomicSave(f, { ok: true }, { minSize: 5, label: 'test' });
    await assert.rejects(fs.access(f + '.tmp'));
  });
});

describe('atomicSave — size validation', () => {
  it('rejects data below minSize', async () => {
    const f = await freshFile();
    await assert.rejects(
      atomicSave(f, {}, { minSize: 1000, label: 'test' }),
      /too small/
    );
  });

  it('creates .REJECTED file on size failure', async () => {
    const f = await freshFile();
    try { await atomicSave(f, {}, { minSize: 1000, label: 'test' }); } catch { /* expected */ }
    const rejected = await fs.readFile(f + '.REJECTED', 'utf8');
    assert.equal(rejected, '{}');
  });

  it('does not overwrite main file on rejection', async () => {
    const f = await freshFile();
    await atomicSave(f, { safe: true }, { minSize: 5, label: 'test' });
    try { await atomicSave(f, {}, { minSize: 1000, label: 'test' }); } catch { /* expected */ }
    const content = JSON.parse(await fs.readFile(f, 'utf8'));
    assert.equal(content.safe, true);
  });
});

describe('atomicSave — structure validation', () => {
  it('rejects when validate returns not ok', async () => {
    const f = await freshFile();
    const validate = (data) => ({
      ok: Object.keys(data).length > 0,
      reason: 'data is empty'
    });
    await assert.rejects(
      atomicSave(f, {}, { minSize: 1, validate, label: 'test' }),
      /data is empty/
    );
  });

  it('accepts when validate returns ok', async () => {
    const f = await freshFile();
    const validate = (data) => ({ ok: data.valid === true });
    await atomicSave(f, { valid: true }, { minSize: 5, validate, label: 'test' });
    const content = JSON.parse(await fs.readFile(f, 'utf8'));
    assert.equal(content.valid, true);
  });
});

describe('atomicSave — onSaved callback', () => {
  it('calls onSaved after successful write', async () => {
    const f = await freshFile();
    let called = false;
    await atomicSave(f, { x: 1 }, {
      minSize: 5, label: 'test',
      onSaved: () => { called = true; },
    });
    assert.equal(called, true);
  });

  it('does not call onSaved on rejection', async () => {
    const f = await freshFile();
    let called = false;
    try {
      await atomicSave(f, {}, {
        minSize: 1000, label: 'test',
        onSaved: () => { called = true; },
      });
    } catch { /* expected */ }
    assert.equal(called, false);
  });
});

describe('atomicSave — mutex serialization', () => {
  it('handles concurrent saves without corruption', async () => {
    const f = await freshFile();
    const saves = Array.from({ length: 5 }, (_, i) =>
      atomicSave(f, { seq: i }, { minSize: 5, label: 'test' })
    );
    await Promise.all(saves);

    const content = JSON.parse(await fs.readFile(f, 'utf8'));
    assert.ok(content.seq >= 0 && content.seq <= 4);
    assert.ok(typeof content.seq === 'number');
  });
});
