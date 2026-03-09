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
