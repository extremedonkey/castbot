import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';

// Replicate atomicSave logic inline to avoid global mutex leaking across test files.
// This matches the project pattern of extracting pure logic for tests.

let _testQueue = Promise.resolve();
function withMutex(fn) {
  let resolve;
  const next = new Promise(r => { resolve = r; });
  const prev = _testQueue;
  _testQueue = next;
  return prev.then(fn).finally(resolve);
}

async function atomicSave(filePath, data, options = {}) {
  return withMutex(() => _atomicSaveUnsafe(filePath, data, options));
}

async function _atomicSaveUnsafe(filePath, data, options) {
  const { minSize = 100, validate = null, label = 'test', onSaved = null } = options;

  const dataStr = JSON.stringify(data, null, 2);

  if (dataStr.length < minSize) {
    await fs.writeFile(filePath + '.REJECTED', dataStr);
    throw new Error(`${label} save rejected — too small (${dataStr.length} bytes < ${minSize})`);
  }

  if (validate) {
    const result = validate(data);
    if (!result.ok) {
      await fs.writeFile(filePath + '.REJECTED', dataStr);
      throw new Error(`${label} save rejected — ${result.reason}`);
    }
  }

  try {
    await fs.access(filePath);
    await fs.copyFile(filePath, filePath + '.backup');
  } catch { /* first save */ }

  const tempPath = filePath + '.tmp';
  await fs.writeFile(tempPath, dataStr);

  const tempStats = await fs.stat(tempPath);
  if (tempStats.size < minSize) {
    await fs.unlink(tempPath);
    throw new Error(`${label} temp file verification failed`);
  }

  await fs.rename(tempPath, filePath);

  if (onSaved) {
    try { onSaved(); } catch { /* ignore */ }
  }
}

// Unique dir per test
let c = 0;
async function freshFile() {
  const dir = `/tmp/atomicSave-test-${Date.now()}-${c++}`;
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, 'test.json');
}

describe('atomicSave — basic writes', () => {
  it('writes valid JSON to file', async () => {
    const f = await freshFile();
    const data = { guilds: { '123': { players: {} } } };
    await atomicSave(f, data, { minSize: 10 });
    assert.deepEqual(JSON.parse(await fs.readFile(f, 'utf8')), data);
  });

  it('creates .backup on second write', async () => {
    const f = await freshFile();
    await atomicSave(f, { version: 1 }, { minSize: 10 });
    await atomicSave(f, { version: 2 }, { minSize: 10 });
    assert.equal(JSON.parse(await fs.readFile(f, 'utf8')).version, 2);
    assert.equal(JSON.parse(await fs.readFile(f + '.backup', 'utf8')).version, 1);
  });

  it('does not leave .tmp file on success', async () => {
    const f = await freshFile();
    await atomicSave(f, { ok: true }, { minSize: 5 });
    await assert.rejects(fs.access(f + '.tmp'));
  });
});

describe('atomicSave — size validation', () => {
  it('rejects data below minSize', async () => {
    const f = await freshFile();
    await assert.rejects(atomicSave(f, {}, { minSize: 1000 }), /too small/);
  });

  it('creates .REJECTED file on size failure', async () => {
    const f = await freshFile();
    try { await atomicSave(f, {}, { minSize: 1000 }); } catch { /* expected */ }
    assert.equal(await fs.readFile(f + '.REJECTED', 'utf8'), '{}');
  });

  it('does not overwrite main file on rejection', async () => {
    const f = await freshFile();
    await atomicSave(f, { safe: true }, { minSize: 5 });
    try { await atomicSave(f, {}, { minSize: 1000 }); } catch { /* expected */ }
    assert.equal(JSON.parse(await fs.readFile(f, 'utf8')).safe, true);
  });
});

describe('atomicSave — structure validation', () => {
  it('rejects when validate returns not ok', async () => {
    const f = await freshFile();
    const validate = () => ({ ok: false, reason: 'data is empty' });
    await assert.rejects(atomicSave(f, {}, { minSize: 1, validate }), /data is empty/);
  });

  it('accepts when validate returns ok', async () => {
    const f = await freshFile();
    const validate = (d) => ({ ok: d.valid === true });
    await atomicSave(f, { valid: true }, { minSize: 5, validate });
    assert.equal(JSON.parse(await fs.readFile(f, 'utf8')).valid, true);
  });
});

describe('atomicSave — onSaved callback', () => {
  it('calls onSaved after successful write', async () => {
    const f = await freshFile();
    let called = false;
    await atomicSave(f, { x: 1 }, { minSize: 5, onSaved: () => { called = true; } });
    assert.equal(called, true);
  });

  it('does not call onSaved on rejection', async () => {
    const f = await freshFile();
    let called = false;
    try { await atomicSave(f, {}, { minSize: 1000, onSaved: () => { called = true; } }); } catch { /* expected */ }
    assert.equal(called, false);
  });
});

describe('atomicSave — mutex serialization', () => {
  it('handles concurrent saves without corruption', async () => {
    const f = await freshFile();
    await Promise.all(Array.from({ length: 5 }, (_, i) =>
      atomicSave(f, { seq: i }, { minSize: 5 })
    ));
    const content = JSON.parse(await fs.readFile(f, 'utf8'));
    assert.ok(content.seq >= 0 && content.seq <= 4);
  });
});
