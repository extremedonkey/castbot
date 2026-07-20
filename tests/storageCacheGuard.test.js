/**
 * Tests for storage.js cache-poisoning defences (docs/incidents/07-CachePoisonedLostMove.md).
 *
 * Incident 07: a player's committed map move (B6→A6) was erased by its own activity-log
 * flush. The flush ran under withStorageLock and loaded "inside the lock" — but its
 * loadPlayerData() was served a PRE-move snapshot from the shared request cache, poisoned
 * by a concurrent interaction whose disk read raced the move-save's atomic rename
 * (the read opened the old inode, completed AFTER onSaved's cache clear, and re-cached
 * stale data). Two defences, both tested here against the REAL implementation via the
 * __storageInternals test seam (no playerData.json disk I/O):
 *
 *   1. withStorageLock drops the request cache at cycle entry → locked cycles read disk.
 *   2. Generation guard: a read result is only cached if no save landed mid-read.
 *
 * Safari-side twins (safariManager.js) mirror this logic; importing safariManager here
 * would pull the whole module graph, so the storage-side hook mechanism is tested via
 * registerSafariCacheDrop instead.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  withStorageLock,
  withSafariLock,
  registerSafariCacheDrop,
  __storageInternals,
} from '../storage.js';

const { requestCache, getGeneration, bumpGeneration, cacheIfFresh } = __storageInternals;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

beforeEach(() => requestCache.clear());

describe('withStorageLock — cache dropped at cycle entry', () => {
  it('a poisoned cache entry does not survive into a locked cycle', async () => {
    requestCache.set('playerData_all', { stale: true });

    await withStorageLock(async () => {
      assert.equal(requestCache.size, 0, 'locked cycle must start with an empty cache');
    });
  });

  it('drops entries cached between queued cycles (not just at call time)', async () => {
    // Cycle 1 poisons the cache while cycle 2 is already queued — the drop must
    // happen when cycle 2 RUNS, not when it was enqueued.
    const seenSizes = [];
    await Promise.all([
      withStorageLock(async () => {
        await delay(5);
        requestCache.set('playerData_all', { stale: true });
      }),
      withStorageLock(async () => {
        seenSizes.push(requestCache.size);
      }),
    ]);
    assert.deepEqual(seenSizes, [0]);
  });

  it('still returns the wrapped result and releases on error', async () => {
    assert.equal(await withStorageLock(async () => 42), 42);
    await assert.rejects(withStorageLock(async () => { throw new Error('boom'); }), /boom/);
    let ran = false;
    await withStorageLock(async () => { ran = true; });
    assert.equal(ran, true);
  });
});

describe('generation guard — stale in-flight reads are not cached', () => {
  it('caches when no save landed during the read', () => {
    const gen = getGeneration();
    const cached = cacheIfFresh('playerData_all', { fresh: true }, gen);
    assert.equal(cached, true);
    assert.deepEqual(requestCache.get('playerData_all'), { fresh: true });
  });

  it('refuses to cache when a save landed mid-read', () => {
    const genAtRead = getGeneration();   // read starts, captures generation
    bumpGeneration();                    // a save lands while the read is in flight
    const cached = cacheIfFresh('playerData_all', { stale: true }, genAtRead);
    assert.equal(cached, false);
    assert.equal(requestCache.has('playerData_all'), false, 'stale snapshot must not be cached');
  });

  it('incident 07 interleaving: stale read cannot poison the flush cycle', async () => {
    // T0: concurrent interaction's read starts (pre-move snapshot in flight)
    const genAtRead = getGeneration();

    // T1: the move's setPlayerLocation cycle saves — onSaved bumps gen + clears cache
    bumpGeneration();
    requestCache.clear();

    // T2: the in-flight read completes AFTER the clear and tries to cache its
    //     pre-move snapshot (this is what poisoned the cache in the incident)
    cacheIfFresh('playerData_all', { currentLocation: 'B6-stale' }, genAtRead);
    assert.equal(requestCache.has('playerData_all'), false, 'poison rejected by generation guard');

    // T3: the activity-log flush runs under the lock — even if something HAD been
    //     cached, the lock-entry drop guarantees a fresh read
    requestCache.set('playerData_all', { currentLocation: 'B6-stale' }); // belt-and-braces: force the poison
    await withStorageLock(async () => {
      assert.equal(requestCache.size, 0, 'flush cycle cannot see a cached snapshot');
    });
  });
});

describe('withSafariLock — registered cache drop runs at cycle entry', () => {
  it('calls the registered drop before fn, every cycle', async () => {
    const calls = [];
    registerSafariCacheDrop(() => calls.push('drop'));
    await withSafariLock(async () => calls.push('fn1'));
    await withSafariLock(async () => calls.push('fn2'));
    registerSafariCacheDrop(null); // detach so other tests aren't affected
    assert.deepEqual(calls, ['drop', 'fn1', 'drop', 'fn2']);
  });
});
