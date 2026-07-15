/**
 * Tests for storage.js withStorageLock — serialization of load-modify-save cycles.
 *
 * Imports the REAL lock (not replicated logic): the whole point is proving the actual
 * queue prevents lost updates. storage.js is safe to import under node:test since its
 * DST module-load init is guarded by NODE_TEST_CONTEXT.
 *
 * Regression for docs/incidents/05-LostMovementRace.md: two concurrent whole-file
 * load-modify-save cycles on playerData.json erased each other (gabi's F1→E2 move
 * was destroyed by a concurrent give_item save built from a pre-move snapshot).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withStorageLock } from '../storage.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Simulates a handler's load-modify-save cycle against a shared "file".
// The delay between load and save is the race window from the incident.
function makeCycle(store, mutate) {
  return async () => {
    const snapshot = { ...store.data };       // loadPlayerData (whole-file snapshot)
    await delay(5);                            // work happens; other handlers run
    mutate(snapshot);                          // mutate own copy
    store.data = snapshot;                     // savePlayerData (whole-file overwrite)
  };
}

describe('withStorageLock — lost-update prevention', () => {
  it('UNLOCKED concurrent cycles lose writes (reproduces the incident)', async () => {
    const store = { data: { location: 'F1', items: 0 } };
    const move = makeCycle(store, s => { s.location = 'E2'; });
    const giveItem = makeCycle(store, s => { s.items += 1; });

    await Promise.all([move(), giveItem()]);   // both load the same pre-change snapshot

    // Last save wins: exactly one of the two changes survives — never both
    const bothSurvived = store.data.location === 'E2' && store.data.items === 1;
    assert.equal(bothSurvived, false, 'unlocked cycles should exhibit the lost update');
  });

  it('LOCKED concurrent cycles both survive', async () => {
    const store = { data: { location: 'F1', items: 0 } };
    const move = makeCycle(store, s => { s.location = 'E2'; });
    const giveItem = makeCycle(store, s => { s.items += 1; });

    await Promise.all([
      withStorageLock(move),
      withStorageLock(giveItem)
    ]);

    assert.equal(store.data.location, 'E2', 'movement write survives');
    assert.equal(store.data.items, 1, 'item write survives');
  });

  it('serializes many concurrent increments (no lost counts)', async () => {
    const store = { data: { count: 0 } };
    const N = 10;
    await Promise.all(
      Array.from({ length: N }, () =>
        withStorageLock(makeCycle(store, s => { s.count += 1; }))
      )
    );
    assert.equal(store.data.count, N);
  });

  it('runs cycles in submission order', async () => {
    const order = [];
    await Promise.all([
      withStorageLock(async () => { await delay(10); order.push('first'); }),
      withStorageLock(async () => { order.push('second'); })
    ]);
    assert.deepEqual(order, ['first', 'second']);
  });

  it('an error inside the lock releases it (no jammed queue)', async () => {
    await assert.rejects(
      withStorageLock(async () => { throw new Error('boom'); }),
      /boom/
    );

    // Queue must still be usable afterwards
    let ran = false;
    await withStorageLock(async () => { ran = true; });
    assert.equal(ran, true);
  });

  it('returns the wrapped function result', async () => {
    const result = await withStorageLock(async () => 42);
    assert.equal(result, 42);
  });
});
