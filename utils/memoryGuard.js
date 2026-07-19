/**
 * Memory Guard — shared pre-flight checks for computationally expensive interactions.
 *
 * Extracted from mapExplorer.js (RaP 0896 map-build guards) after incident 06
 * (docs/incidents/06-HeapDriftGCDeathSpiral.md): two bulk analytics parses landed
 * the killing blow on a heap already at its 320MB ceiling.
 *
 * Two orthogonal memory budgets — check the one(s) the operation actually spends:
 *  - Box RAM (`MemAvailable`): native allocations outside V8 (sharp/libvips image
 *    work). Exhaustion ends in a kernel OOM kill.
 *  - V8 heap headroom (`heap_size_limit - used_heap_size`): large JS allocations
 *    (JSON.parse of data files, full log-file parses). Exhaustion ends in a
 *    GC death spiral then FATAL heap OOM — swap cannot absorb this one.
 *
 * Readings return null where unavailable (e.g. /proc/meminfo on non-Linux dev
 * boxes); a null reading skips that check, matching the original map behavior.
 */

import { readFileSync } from 'fs';
import v8 from 'v8';

/**
 * MemAvailable from /proc/meminfo in MB (actual usable memory — os.freemem() misleads on
 * Linux by ignoring reclaimable cache; see docs/infrastructure-security/InfrastructureArchitecture.md).
 * @returns {number|null} available MB, or null when unreadable (non-Linux dev boxes → skip checks)
 */
export function getAvailableMemMB() {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const match = meminfo.match(/MemAvailable:\s+(\d+)/);
    return match ? parseInt(match[1]) / 1024 : null;
  } catch {
    return null;
  }
}

/**
 * Distance between current V8 heap usage and the hard heap ceiling, in MB.
 * @returns {number|null}
 */
export function getHeapHeadroomMB() {
  try {
    const stats = v8.getHeapStatistics();
    return (stats.heap_size_limit - stats.used_heap_size) / (1024 * 1024);
  } catch {
    return null;
  }
}

/**
 * Pure threshold evaluation (exported for tests). Null readings skip their check;
 * a threshold of 0/undefined disables that check.
 * @param {{availableMB: number|null, heapHeadroomMB: number|null}} readings
 * @param {{minAvailableMB?: number, minHeapHeadroomMB?: number}} thresholds
 * @returns {{ok: boolean, reason: string|null}}
 */
export function evaluateHeadroom(readings, thresholds = {}) {
  const { availableMB, heapHeadroomMB } = readings;
  const { minAvailableMB = 0, minHeapHeadroomMB = 0 } = thresholds;

  if (minAvailableMB && availableMB !== null && availableMB < minAvailableMB) {
    return { ok: false, reason: `MemAvailable ${availableMB.toFixed(0)}MB < ${minAvailableMB}MB floor` };
  }
  if (minHeapHeadroomMB && heapHeadroomMB !== null && heapHeadroomMB < minHeapHeadroomMB) {
    return { ok: false, reason: `V8 heap headroom ${heapHeadroomMB.toFixed(0)}MB < ${minHeapHeadroomMB}MB floor` };
  }
  return { ok: true, reason: null };
}

/**
 * Live pre-flight for an expensive interaction. Real numbers go to the log only —
 * user-facing copy stays "high usage" (no memory internals; same convention as map builds).
 * @param {{minAvailableMB?: number, minHeapHeadroomMB?: number, label?: string}} opts
 * @returns {{ok: boolean, reason: string|null, availableMB: number|null, heapHeadroomMB: number|null}}
 */
export function checkExpensiveOpHeadroom({ minAvailableMB = 0, minHeapHeadroomMB = 0, label = 'expensive op' } = {}) {
  const readings = { availableMB: getAvailableMemMB(), heapHeadroomMB: getHeapHeadroomMB() };
  const verdict = evaluateHeadroom(readings, { minAvailableMB, minHeapHeadroomMB });
  if (!verdict.ok) {
    console.warn(`⚠️ Memory pre-flight (${label}): ${verdict.reason} — declining (avail=${readings.availableMB?.toFixed(0) ?? 'n/a'}MB, heapHeadroom=${readings.heapHeadroomMB?.toFixed(0) ?? 'n/a'}MB)`);
  }
  return { ...verdict, ...readings };
}

/**
 * Components V2 "High Usage" container shown when a pre-flight declines.
 * Pass proceedCustomId to offer an explicit Proceed Anyway button (map-build flow);
 * omit it for a plain refusal (bulk analytics).
 * @param {{proceedCustomId?: string|null, bodyText?: string}} opts
 * @returns {Object} response data ({flags, components})
 */
export function buildHighUsageWarning({ proceedCustomId = null, bodyText = null } = {}) {
  const container = {
    type: 17, // Container
    components: [
      {
        type: 10, // Text Display
        content: bodyText ||
          `## ⚠️ High Usage\n\nCastBot is under heavy ORG usage currently.\n\nBest option: try again in a few hours.${proceedCustomId ? ' Or proceed now at your own risk.' : ''}`
      },
      ...(proceedCustomId ? [{
        type: 1, // Action Row
        components: [{
          type: 2, // Button
          custom_id: proceedCustomId,
          label: 'Proceed Anyway',
          style: 4, // Danger
          emoji: { name: '⚠️' }
        }]
      }] : [])
    ]
  };
  return {
    flags: 64 | (1 << 15), // EPHEMERAL | IS_COMPONENTS_V2
    components: [container]
  };
}
