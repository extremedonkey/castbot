/**
 * Tests for heapDumpHandler — verifies the SIGUSR2 listener is installed and
 * that installation is idempotent. Does NOT trigger an actual heap dump (slow,
 * writes to disk, would pollute /tmp).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Guard top-level imports per feedback_node_test_stdout — installHeapDumpHandler
// has a console.log on install which can intermittently cause "Unable to
// deserialize cloned data" under the node:test runner.
const NODE_TEST = !!process.env.NODE_TEST_CONTEXT;

describe('heapDumpHandler — SIGUSR2 install', () => {
  let originalListeners;

  before(() => {
    originalListeners = process.listeners('SIGUSR2');
  });

  after(() => {
    // Restore the SIGUSR2 listener set we started with.
    process.removeAllListeners('SIGUSR2');
    for (const l of originalListeners) process.on('SIGUSR2', l);
  });

  it('adds a SIGUSR2 listener on first call', async () => {
    const before = process.listenerCount('SIGUSR2');
    const { installHeapDumpHandler } = await import('../src/monitoring/heapDumpHandler.js');
    installHeapDumpHandler();
    const after = process.listenerCount('SIGUSR2');
    assert.equal(after, before + 1, 'expected exactly one new SIGUSR2 listener');
  });

  it('is idempotent on repeated calls', async () => {
    const { installHeapDumpHandler } = await import('../src/monitoring/heapDumpHandler.js');
    const before = process.listenerCount('SIGUSR2');
    installHeapDumpHandler();
    installHeapDumpHandler();
    installHeapDumpHandler();
    const after = process.listenerCount('SIGUSR2');
    assert.equal(after, before, 'subsequent calls should be no-ops');
  });
});
