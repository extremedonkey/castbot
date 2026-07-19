/**
 * Tests for utils/memoryGuard.js — shared memory pre-flight for expensive interactions.
 * Extracted from mapExplorer after incident 06 (docs/incidents/06-HeapDriftGCDeathSpiral.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateHeadroom,
  buildHighUsageWarning,
  getHeapHeadroomMB,
  checkExpensiveOpHeadroom
} from '../utils/memoryGuard.js';

describe('Memory Guard — evaluateHeadroom (pure thresholds)', () => {
  it('passes when both readings clear their floors', () => {
    const v = evaluateHeadroom({ availableMB: 200, heapHeadroomMB: 200 }, { minAvailableMB: 50, minHeapHeadroomMB: 150 });
    assert.equal(v.ok, true);
    assert.equal(v.reason, null);
  });

  it('declines on low box RAM (kernel-OOM budget)', () => {
    const v = evaluateHeadroom({ availableMB: 30, heapHeadroomMB: 300 }, { minAvailableMB: 50, minHeapHeadroomMB: 150 });
    assert.equal(v.ok, false);
    assert.match(v.reason, /MemAvailable 30MB < 50MB/);
  });

  it('declines on low V8 heap headroom (heap-FATAL budget) even with plenty of box RAM', () => {
    // The incident-06 shape: box RAM fine, heap pinned at the ceiling
    const v = evaluateHeadroom({ availableMB: 113, heapHeadroomMB: 20 }, { minAvailableMB: 50, minHeapHeadroomMB: 150 });
    assert.equal(v.ok, false);
    assert.match(v.reason, /heap headroom 20MB < 150MB/);
  });

  it('null readings skip their check (non-Linux dev boxes)', () => {
    const v = evaluateHeadroom({ availableMB: null, heapHeadroomMB: null }, { minAvailableMB: 50, minHeapHeadroomMB: 150 });
    assert.equal(v.ok, true);
  });

  it('a zero/omitted threshold disables that check', () => {
    const v = evaluateHeadroom({ availableMB: 10, heapHeadroomMB: 10 }, {});
    assert.equal(v.ok, true);
    const heapOnly = evaluateHeadroom({ availableMB: 10, heapHeadroomMB: 300 }, { minHeapHeadroomMB: 150 });
    assert.equal(heapOnly.ok, true, 'availableMB ignored when minAvailableMB unset');
  });

  it('box-RAM floor is reported first when both are low', () => {
    const v = evaluateHeadroom({ availableMB: 10, heapHeadroomMB: 10 }, { minAvailableMB: 50, minHeapHeadroomMB: 150 });
    assert.match(v.reason, /MemAvailable/);
  });
});

describe('Memory Guard — buildHighUsageWarning (Components V2 shape)', () => {
  it('plain refusal: container with text only, no Proceed button', () => {
    const data = buildHighUsageWarning();
    assert.equal(data.flags, 64 | (1 << 15), 'EPHEMERAL | IS_COMPONENTS_V2');
    assert.equal(data.components.length, 1);
    const container = data.components[0];
    assert.equal(container.type, 17);
    assert.equal(container.components.length, 1, 'no Action Row without proceedCustomId');
    assert.equal(container.components[0].type, 10);
    assert.match(container.components[0].content, /High Usage/);
    assert.doesNotMatch(container.components[0].content, /proceed now/i);
  });

  it('with proceedCustomId: Danger Proceed Anyway button carries the id (map-build flow)', () => {
    const data = buildHighUsageWarning({ proceedCustomId: 'map_build_proceed' });
    const container = data.components[0];
    assert.equal(container.components.length, 2);
    const row = container.components[1];
    assert.equal(row.type, 1);
    const button = row.components[0];
    assert.equal(button.type, 2);
    assert.equal(button.custom_id, 'map_build_proceed');
    assert.equal(button.style, 4);
    assert.match(container.components[0].content, /proceed now at your own risk/i);
  });

  it('custom bodyText replaces the default copy', () => {
    const data = buildHighUsageWarning({ bodyText: 'custom message' });
    assert.equal(data.components[0].components[0].content, 'custom message');
  });
});

describe('Memory Guard — live readers', () => {
  it('getHeapHeadroomMB returns a positive finite number in-process', () => {
    const headroom = getHeapHeadroomMB();
    assert.equal(typeof headroom, 'number');
    assert.ok(Number.isFinite(headroom) && headroom > 0, `expected positive headroom, got ${headroom}`);
  });

  it('checkExpensiveOpHeadroom returns verdict + readings and passes with tiny floors', () => {
    const result = checkExpensiveOpHeadroom({ minHeapHeadroomMB: 1, label: 'test' });
    assert.equal(result.ok, true);
    assert.ok('availableMB' in result && 'heapHeadroomMB' in result);
  });
});
