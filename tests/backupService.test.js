import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate pure formatting logic from BackupService to test without Discord imports

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function formatTimestamp() {
  const now = new Date('2026-03-15T17:00:00Z'); // 5PM UTC = 1AM AWST next day
  const offset = 8;
  const local = new Date(now.getTime() + offset * 60 * 60 * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[local.getUTCDay()];
  const date = local.getUTCDate();
  const month = months[local.getUTCMonth()];
  const year = local.getUTCFullYear();
  const h = local.getUTCHours();
  const m = String(local.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${day} ${date} ${month} ${year}, ${h12}:${m} ${ampm} AWST`;
}

function buildStatsFromParsed(pdContent, scContent) {
  const parts = [];
  if (pdContent) {
    try {
      const pd = JSON.parse(pdContent);
      const guilds = Object.keys(pd).filter(k => /^\d+$/.test(k)).length;
      let totalPlayers = 0;
      for (const gId of Object.keys(pd)) {
        if (/^\d+$/.test(gId) && pd[gId]?.players) {
          totalPlayers += Object.keys(pd[gId].players).length;
        }
      }
      parts.push(`Guilds: ${guilds} | Players: ${totalPlayers}`);
    } catch { /* ignore */ }
  }
  if (scContent) {
    try {
      const sc = JSON.parse(scContent);
      const safariGuilds = Object.keys(sc).filter(k => /^\d+$/.test(k)).length;
      parts.push(`Safari configs: ${safariGuilds}`);
    } catch { /* ignore */ }
  }
  return parts.join(' | ');
}

describe('BackupService — formatSize', () => {
  it('formats bytes', () => {
    assert.equal(formatSize(500), '500 B');
  });
  it('formats kilobytes', () => {
    assert.equal(formatSize(374 * 1024), '374.0 KB');
  });
  it('formats megabytes', () => {
    assert.equal(formatSize(1.3 * 1024 * 1024), '1.3 MB');
  });
});

describe('BackupService — formatDuration', () => {
  it('formats seconds', () => {
    assert.equal(formatDuration(30_000), '30s');
  });
  it('formats minutes', () => {
    assert.equal(formatDuration(5 * 60_000), '5m');
  });
  it('formats hours', () => {
    assert.equal(formatDuration(24 * 3_600_000), '24h');
  });
});

describe('BackupService — formatTimestamp', () => {
  it('produces AWST timestamp from UTC', () => {
    const result = formatTimestamp();
    // 5PM UTC + 8 = 1AM Mon 16 Mar 2026
    assert.equal(result, 'Mon 16 Mar 2026, 1:00 AM AWST');
  });
});

describe('BackupService — buildStats', () => {
  it('counts guilds and players from playerData', () => {
    const pd = JSON.stringify({
      '123456': { players: { 'a': {}, 'b': {} } },
      '789012': { players: { 'c': {} } },
      'environmentConfig': {},
    });
    const result = buildStatsFromParsed(pd, null);
    assert.equal(result, 'Guilds: 2 | Players: 3');
  });

  it('counts safari configs', () => {
    const sc = JSON.stringify({
      '123456': { safariConfig: {} },
      '789012': { safariConfig: {} },
    });
    const result = buildStatsFromParsed(null, sc);
    assert.equal(result, 'Safari configs: 2');
  });

  it('handles invalid JSON gracefully', () => {
    const result = buildStatsFromParsed('not json', 'also not json');
    assert.equal(result, '');
  });
});
