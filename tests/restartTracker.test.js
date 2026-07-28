import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILE = path.join(__dirname, '..', 'restartHistory.test.json');

// Replicate core logic inline to avoid importing heavy modules
function formatRestartLine(timestamp, index) {
  const d = new Date(timestamp);
  const gmt8 = new Date(d.getTime() + 8 * 3600000);
  const dateStr = gmt8.toISOString().replace('T', ' ').slice(0, 19);
  return `${index + 1}. ${dateStr}`;
}

describe('Restart Tracker — GMT+8 Formatting', () => {
  it('formats UTC midnight as 08:00 GMT+8', () => {
    // 2026-03-09T00:00:00Z = 2026-03-09T08:00:00 GMT+8
    const ts = new Date('2026-03-09T00:00:00Z').getTime();
    const line = formatRestartLine(ts, 0);
    assert.equal(line, '1. 2026-03-09 08:00:00');
  });

  it('formats UTC 16:00 as next day 00:00 GMT+8', () => {
    const ts = new Date('2026-03-09T16:00:00Z').getTime();
    const line = formatRestartLine(ts, 2);
    assert.equal(line, '3. 2026-03-10 00:00:00');
  });

  it('numbers entries correctly', () => {
    const ts = new Date('2026-01-01T12:00:00Z').getTime();
    assert.match(formatRestartLine(ts, 0), /^1\./);
    assert.match(formatRestartLine(ts, 4), /^5\./);
  });
});

describe('Restart Tracker — History Trimming', () => {
  it('trims history to MAX_ENTRIES', () => {
    const MAX_ENTRIES = 20;
    let history = Array.from({ length: 25 }, (_, i) => ({ timestamp: i * 1000 }));
    if (history.length > MAX_ENTRIES) {
      history = history.slice(-MAX_ENTRIES);
    }
    assert.equal(history.length, 20);
    assert.equal(history[0].timestamp, 5000); // First 5 trimmed
  });

  it('returns most recent first when reversed', () => {
    const history = [
      { timestamp: 1000 },
      { timestamp: 2000 },
      { timestamp: 3000 }
    ];
    const last2 = history.slice(-2).reverse();
    assert.equal(last2[0].timestamp, 3000);
    assert.equal(last2[1].timestamp, 2000);
  });
});

// ── Replicated from restartTracker.recordRestart type classification (keep in sync) ──
// Claimed-reason model: a fresh marker types the restart; no fresh marker = 'crash'.
function classifyRestart(markers, now = 1_000_000) {
  const FRESH_MS = 10 * 60 * 1000;
  for (const [marker, legacyType] of markers) {
    if (!marker) continue;
    if (marker.at && now - marker.at < FRESH_MS) return legacyType ?? marker.type ?? 'crash';
    return 'crash'; // stale marker consumed but ignored
  }
  return 'crash';
}

describe('Restart Tracker — typed reason markers (claimed-reason model)', () => {
  const now = 10 * 60 * 1000 + 1;

  it('fresh typed markers classify correctly', () => {
    for (const type of ['planned', 'deploy', 'remediation', 'manual']) {
      assert.equal(classifyRestart([[{ type, at: now - 1000 }, null]], now), type);
    }
  });

  it('no marker = crash (the restart nothing claimed)', () => {
    assert.equal(classifyRestart([[null, null], [null, 'planned']], now), 'crash');
  });

  it('stale marker (>10min) = crash — leftovers from a restart that never happened', () => {
    assert.equal(classifyRestart([[{ type: 'deploy', at: 0 }, null]], now), 'crash');
  });

  it('legacy planned-restart.json marker maps to planned', () => {
    assert.equal(classifyRestart([[null, null], [{ at: now - 1000 }, 'planned']].filter(([m]) => m), now), 'planned');
  });

  it('typed marker without a type field defaults to crash, not undefined', () => {
    assert.equal(classifyRestart([[{ at: now - 1000 }, null]], now), 'crash');
  });
});

// ── Replicated from healthMonitor crashes24h counting (keep in sync) ──
function countCrashes24h(history, now) {
  const dayAgo = now - 86400000;
  return history.filter(r => r.timestamp > dayAgo && (r.type ? r.type === 'crash' : !r.planned)).length;
}

describe('Restart Tracker — crash counting for stability score', () => {
  const now = 100 * 86400000;

  it('typed deploys/planned/manual/remediation do not count as crashes', () => {
    const history = [
      { timestamp: now - 1000, type: 'deploy' },
      { timestamp: now - 2000, type: 'planned', planned: true },
      { timestamp: now - 3000, type: 'manual' },
      { timestamp: now - 4000, type: 'remediation' },
      { timestamp: now - 5000, type: 'crash' }
    ];
    assert.equal(countCrashes24h(history, now), 1);
  });

  it('legacy untyped entries fall back to !planned (conservative)', () => {
    const history = [
      { timestamp: now - 1000 },                    // legacy unplanned → counts
      { timestamp: now - 2000, planned: true }      // legacy planned → does not
    ];
    assert.equal(countCrashes24h(history, now), 1);
  });

  it('entries older than 24h age out', () => {
    const history = [{ timestamp: now - 86400001, type: 'crash' }];
    assert.equal(countCrashes24h(history, now), 0);
  });
});
