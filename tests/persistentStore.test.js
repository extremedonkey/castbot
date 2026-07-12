/**
 * PersistentStore — disk-backed Map durability tests.
 *
 * Born from the whisper restart-persistence work (2026-07-12): whispers sent
 * within the store's 1s save debounce were lost on deploy/restart because
 * nothing flushed on shutdown, and the recipient got a false "already been
 * read". These tests exercise the real module (it's dependency-light):
 * write-through flush, reload round trip, and the synchronous shutdown flush.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PersistentStore } from '../persistentStore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_NAMES = [];
function testStoreName(suffix) {
  const name = `testtmp_${process.pid}_${suffix}`;
  TEST_NAMES.push(name);
  return name;
}
const fileFor = (name) => path.join(ROOT, `data_${name}.json`);

after(() => {
  for (const name of TEST_NAMES) {
    for (const p of [fileFor(name), fileFor(name) + '.tmp']) {
      try { unlinkSync(p); } catch { /* not created */ }
    }
  }
});

describe('PersistentStore — flush + reload round trip (whisper survival path)', () => {
  it('set → flush → fresh instance load() sees the entry (survives "restart")', async () => {
    const name = testStoreName('roundtrip');
    const store = new PersistentStore(name);
    store.set('whisper_1', { message: 'meet me at C3', targetUserId: '42' });
    await store.flush();

    const reloaded = new PersistentStore(name);   // fresh instance = simulated restart
    await reloaded.load();
    assert.deepEqual(reloaded.get('whisper_1'), { message: 'meet me at C3', targetUserId: '42' });
  });

  it('delete → flush → gone after reload (read whispers cannot resurrect)', async () => {
    const name = testStoreName('delete');
    const store = new PersistentStore(name);
    store.set('a', 1);
    store.set('b', 2);
    await store.flush();
    store.delete('a');
    await store.flush();

    const reloaded = new PersistentStore(name);
    await reloaded.load();
    assert.equal(reloaded.has('a'), false);
    assert.equal(reloaded.get('b'), 2);
  });

  it('without flush, the debounced save has not written yet (documents the old loss window)', () => {
    const name = testStoreName('debounce');
    const store = new PersistentStore(name);
    store.set('k', 'v');
    assert.equal(existsSync(fileFor(name)), false,
      'file should not exist inside the 1s debounce window — this is exactly why write-through/flush matters');
    // Cancel the pending timer so the debounced save can't fire after tests finish
    store._saveTimer && clearTimeout(store._saveTimer);
  });
});

describe('PersistentStore — flushAllSync (SIGINT/SIGTERM shutdown path)', () => {
  it('synchronously writes dirty registered stores', () => {
    const name = testStoreName('sync');
    const store = PersistentStore.create(name);   // registry path — what flushAllSync iterates
    store.set('pending', { sent: 'just before deploy' });
    PersistentStore.flushAllSync();

    assert.ok(existsSync(fileFor(name)), 'sync flush must write the file immediately');
    const onDisk = JSON.parse(readFileSync(fileFor(name), 'utf8'));
    assert.deepEqual(onDisk.pending, { sent: 'just before deploy' });
  });

  it('is a no-op for clean stores (does not churn disk)', () => {
    const name = testStoreName('clean');
    PersistentStore.create(name);                 // registered but never written to
    PersistentStore.flushAllSync();
    assert.equal(existsSync(fileFor(name)), false, 'clean store must not be written');
  });
});

