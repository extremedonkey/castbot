import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Pure logic replicated from dncManager.js ───

function getDncEntries(application) {
  if (application?.dncEntries?.length) return application.dncEntries;

  if (application?.dncList) {
    return application.dncList.split('\n').filter(l => l.trim()).map((name, i) => ({
      id: `dnc_migrated_${i}`,
      name: name.trim(),
      username: '',
      userId: null,
      issues: '',
      createdAt: Date.now()
    }));
  }

  return [];
}

function matchEntry(entry, targetUserId, targetUsername, targetDisplayName) {
  if (entry.userId && targetUserId && entry.userId === targetUserId) return 'exact';
  if (entry.username && targetUsername &&
      entry.username.toLowerCase() === targetUsername.toLowerCase()) return 'username';
  if (entry.name && targetDisplayName) {
    const entryLower = entry.name.toLowerCase();
    const targetLower = targetDisplayName.toLowerCase();
    if (entryLower === targetLower || targetLower.includes(entryLower) || entryLower.includes(targetLower)) return 'name';
  }
  if (entry.name && targetUsername) {
    if (entry.name.toLowerCase() === targetUsername.toLowerCase()) return 'name';
  }
  return null;
}

function findDncConflicts(currentApp, allApplications, playerData, guildId) {
  const conflicts = [];
  const currentEntries = getDncEntries(currentApp);
  const currentUserId = currentApp.userId;

  for (const otherApp of allApplications) {
    if (otherApp.channelId === currentApp.channelId) continue;
    const otherData = playerData[guildId]?.applications?.[otherApp.channelId];
    if (!otherData) continue;

    const otherName = otherData.displayName || otherData.username || 'Unknown';
    const otherUserId = otherData.userId;
    const otherUsername = otherData.username;
    const otherEntries = getDncEntries(otherData);

    for (const entry of currentEntries) {
      const tier = matchEntry(entry, otherUserId, otherUsername, otherName);
      if (tier) {
        conflicts.push({ direction: 'current_listed_other', otherName, otherChannelId: otherApp.channelId, entry, tier });
      }
    }

    for (const entry of otherEntries) {
      const tier = matchEntry(entry, currentUserId, currentApp.username, currentApp.displayName || currentApp.username);
      if (tier) {
        conflicts.push({ direction: 'other_listed_current', otherName, otherChannelId: otherApp.channelId, entry, tier });
      }
    }
  }
  return conflicts;
}

// ─── Replicated from dncManager.js buildGlobalDncOverview ───

function buildGlobalDncOverview(allApplications, playerData, guildId) {
  const applicantsWithDnc = [];
  const conflictPairs = new Map();
  const tierOrder = { exact: 3, username: 2, name: 1 };

  for (const app of allApplications) {
    const appData = playerData[guildId]?.applications?.[app.channelId];
    if (!appData) continue;

    const entries = getDncEntries(appData);
    if (entries.length > 0) {
      applicantsWithDnc.push({ name: appData.displayName || appData.username || 'Unknown', channelId: app.channelId, entries });
    }

    const conflicts = findDncConflicts(appData, allApplications, playerData, guildId);
    for (const conflict of conflicts) {
      const pairKey = [app.channelId, conflict.otherChannelId].sort().join('_');
      if (!conflictPairs.has(pairKey)) {
        conflictPairs.set(pairKey, { listers: new Map(), tier: conflict.tier, names: {} });
      }
      const pair = conflictPairs.get(pairKey);
      if (conflict.direction === 'current_listed_other') {
        if (!pair.listers.has(app.channelId)) {
          pair.listers.set(app.channelId, { entry: conflict.entry, listerName: appData.displayName || appData.username || 'Unknown', targetName: conflict.otherName });
        }
      } else {
        if (!pair.listers.has(conflict.otherChannelId)) {
          pair.listers.set(conflict.otherChannelId, { entry: conflict.entry, listerName: conflict.otherName, targetName: appData.displayName || appData.username || 'Unknown' });
        }
      }
      pair.names[app.channelId] = appData.displayName || appData.username || 'Unknown';
      pair.names[conflict.otherChannelId] = conflict.otherName;
      if ((tierOrder[conflict.tier] || 0) > (tierOrder[pair.tier] || 0)) pair.tier = conflict.tier;
    }
  }

  const mutualConflicts = [];
  const oneWayConflicts = [];
  for (const [, pair] of conflictPairs) {
    pair.isMutual = pair.listers.size >= 2;
    if (pair.isMutual) mutualConflicts.push(pair);
    else oneWayConflicts.push(pair);
  }

  const sortByTier = (a, b) => (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0);
  mutualConflicts.sort(sortByTier);
  oneWayConflicts.sort(sortByTier);

  let conflictText = '';
  const allConflicts = [...mutualConflicts, ...oneWayConflicts];
  if (allConflicts.length > 0) {
    const lines = [];
    for (const pair of allConflicts) {
      const tierSuffix = pair.tier === 'exact' ? '' : pair.tier === 'username' ? ' (username match)' : ' (possible match)';
      const listerEntries = Array.from(pair.listers.values());
      if (pair.isMutual) {
        const names = Object.values(pair.names);
        lines.push(`🔴 **${names[0]}** ↔ **${names[1]}** — mutual conflict${tierSuffix}`);
      } else {
        const lister = listerEntries[0];
        lines.push(`🟡 **${lister.listerName}** → **${lister.targetName}** (one-way)${tierSuffix}`);
      }
      for (const lister of listerEntries) {
        if (lister.entry?.issues) {
          const truncated = lister.entry.issues.length > 100 ? lister.entry.issues.substring(0, 97) + '...' : lister.entry.issues;
          lines.push(`> ${lister.listerName}: "${truncated}"`);
        }
      }
    }
    conflictText = lines.join('\n');
  }

  let entriesText = '';
  if (applicantsWithDnc.length > 0) {
    applicantsWithDnc.sort((a, b) => a.name.localeCompare(b.name));
    const lines = [];
    for (const applicant of applicantsWithDnc) {
      const countLabel = applicant.entries.length === 1 ? '1 entry' : `${applicant.entries.length} entries`;
      lines.push(`**${applicant.name}** — ${countLabel}`);
      for (const entry of applicant.entries) {
        const usernameDisplay = entry.username ? ` (@${entry.username})` : '';
        if (entry.issues) {
          const truncated = entry.issues.length > 100 ? entry.issues.substring(0, 97) + '...' : entry.issues;
          lines.push(`> 🚷 ${entry.name}${usernameDisplay}: "${truncated}"`);
        } else {
          lines.push(`> 🚷 ${entry.name}${usernameDisplay}: (no details)`);
        }
      }
    }
    entriesText = lines.join('\n');
  }

  const hasConflicts = conflictPairs.size > 0;
  const hasEntries = applicantsWithDnc.length > 0;
  const accentColor = hasConflicts ? 0xe74c3c : hasEntries ? 0x3498DB : 0x27ae60;

  return { conflictText, entriesText, hasConflicts, hasEntries, stats: { total: allApplications.length, withEntries: applicantsWithDnc.length, conflictCount: conflictPairs.size }, accentColor };
}

// ─── Test Helpers ───

function makeApp(channelId, displayName, username, userId, dncEntries = []) {
  return { channelId, displayName, username, userId, dncEntries };
}

function makePlayerData(guildId, applications) {
  const apps = {};
  for (const app of applications) {
    apps[app.channelId] = app;
  }
  return { [guildId]: { applications: apps } };
}

// ─── Tests ───

describe('DNC Overview — getDncEntries', () => {
  it('returns structured entries when dncEntries exists', () => {
    const app = { dncEntries: [{ id: 'dnc_1', name: 'Dave', username: '', userId: null, issues: '' }] };
    const entries = getDncEntries(app);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'Dave');
  });

  it('parses legacy dncList string into structured entries', () => {
    const app = { dncList: 'Dave\nMike\nSarah' };
    const entries = getDncEntries(app);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].name, 'Dave');
    assert.equal(entries[1].name, 'Mike');
    assert.equal(entries[2].name, 'Sarah');
    assert.equal(entries[0].username, '');
    assert.equal(entries[0].userId, null);
  });

  it('returns empty array when no DNC data', () => {
    assert.deepEqual(getDncEntries({}), []);
    assert.deepEqual(getDncEntries(null), []);
    assert.deepEqual(getDncEntries(undefined), []);
  });

  it('prefers dncEntries over dncList when both exist', () => {
    const app = {
      dncEntries: [{ id: 'dnc_1', name: 'Structured', username: '', userId: null, issues: '' }],
      dncList: 'Legacy'
    };
    const entries = getDncEntries(app);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'Structured');
  });
});

describe('DNC Overview — Conflict Deduplication', () => {
  const guildId = 'guild1';

  it('detects mutual conflict (both listed each other)', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: 'serviver', userId: 'userB', issues: 'Metagamed me' }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', [
      { id: 'dnc_2', name: 'Reece', username: 'extremedonkey', userId: 'userA', issues: 'Toxic' }
    ]);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    assert.equal(result.hasConflicts, true);
    assert.equal(result.stats.conflictCount, 1); // One pair, not two
    assert.ok(result.conflictText.includes('🔴')); // Mutual indicator
    assert.ok(result.conflictText.includes('↔'));
    assert.ok(result.conflictText.includes('mutual conflict'));
  });

  it('detects one-way conflict (only one listed the other)', () => {
    const appA = makeApp('chA', 'Sarah', 'sarah123', 'userA', [
      { id: 'dnc_1', name: 'Jason', username: 'jasondeez', userId: 'userB', issues: 'Harassment' }
    ]);
    const appB = makeApp('chB', 'Jason', 'jasondeez', 'userB', []); // Jason has no DNC entries
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    assert.equal(result.hasConflicts, true);
    assert.equal(result.stats.conflictCount, 1);
    assert.ok(result.conflictText.includes('🟡')); // One-way indicator
    assert.ok(result.conflictText.includes('→'));
    assert.ok(result.conflictText.includes('one-way'));
  });

  it('does not duplicate pairs when iterating bidirectionally', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: 'serviver', userId: 'userB', issues: '' }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', [
      { id: 'dnc_2', name: 'Reece', username: 'extremedonkey', userId: 'userA', issues: '' }
    ]);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    // Should be exactly 1 conflict pair, not 2 or 4
    assert.equal(result.stats.conflictCount, 1);
  });
});

describe('DNC Overview — Tier Classification', () => {
  const guildId = 'guild1';

  it('upgrades pair tier to best match (exact beats username)', () => {
    // A lists B by userId (exact), B lists A by username only
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: '', userId: 'userB', issues: '' }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', [
      { id: 'dnc_2', name: 'Reece', username: 'extremedonkey', userId: null, issues: '' }
    ]);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    // The pair should use 'exact' tier (no suffix in output)
    assert.ok(!result.conflictText.includes('username match'));
    assert.ok(!result.conflictText.includes('possible match'));
  });

  it('shows username match suffix for username-tier conflicts', () => {
    const appA = makeApp('chA', 'Sarah', 'sarah123', 'userA', [
      { id: 'dnc_1', name: 'Jason', username: 'jasondeez', userId: null, issues: '' }
    ]);
    const appB = makeApp('chB', 'Jason', 'jasondeez', 'userB', []);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    assert.ok(result.conflictText.includes('(username match)'));
  });

  it('shows possible match suffix for name-tier conflicts', () => {
    const appA = makeApp('chA', 'Sarah', 'sarah123', 'userA', [
      { id: 'dnc_1', name: 'Jason', username: '', userId: null, issues: '' }
    ]);
    const appB = makeApp('chB', 'Jason', 'jasondeez', 'userB', []);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    assert.ok(result.conflictText.includes('(possible match)'));
  });
});

describe('DNC Overview — Empty States', () => {
  const guildId = 'guild1';

  it('returns green accent and all-clear when no DNC entries exist', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', []);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', []);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    assert.equal(result.hasConflicts, false);
    assert.equal(result.hasEntries, false);
    assert.equal(result.accentColor, 0x27ae60); // green
    assert.equal(result.stats.withEntries, 0);
    assert.equal(result.conflictText, '');
    assert.equal(result.entriesText, '');
  });

  it('returns blue accent when entries exist but no conflicts', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'SomeoneNotInSeason', username: '', userId: null, issues: '' }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', []);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    assert.equal(result.hasConflicts, false);
    assert.equal(result.hasEntries, true);
    assert.equal(result.accentColor, 0x3498DB); // blue
    assert.equal(result.stats.withEntries, 1);
  });

  it('returns red accent when conflicts exist', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: '', userId: 'userB', issues: '' }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', []);
    const allApps = [appA, appB];
    const playerData = makePlayerData(guildId, [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, guildId);

    assert.equal(result.hasConflicts, true);
    assert.equal(result.accentColor, 0xe74c3c); // red
  });

  it('handles empty application list', () => {
    const result = buildGlobalDncOverview([], { guild1: { applications: {} } }, guildId);

    assert.equal(result.hasConflicts, false);
    assert.equal(result.hasEntries, false);
    assert.equal(result.stats.total, 0);
    assert.equal(result.accentColor, 0x27ae60); // green
  });
});

describe('DNC Overview — Reason Truncation', () => {
  it('truncates reasons over 100 chars in conflict text', () => {
    const longReason = 'A'.repeat(150);
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: '', userId: 'userB', issues: longReason }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', []);
    const allApps = [appA, appB];
    const playerData = makePlayerData('guild1', [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, 'guild1');

    // Should contain truncated version (97 chars + ...)
    assert.ok(result.conflictText.includes('A'.repeat(97) + '...'));
    assert.ok(!result.conflictText.includes('A'.repeat(150)));
  });

  it('does not truncate reasons under 100 chars', () => {
    const shortReason = 'Metagamed me in S4';
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: '', userId: 'userB', issues: shortReason }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', []);
    const allApps = [appA, appB];
    const playerData = makePlayerData('guild1', [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, 'guild1');

    assert.ok(result.conflictText.includes(shortReason));
  });

  it('truncates reasons in entries text', () => {
    const longReason = 'B'.repeat(150);
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'SomeoneNotInSeason', username: '', userId: null, issues: longReason }
    ]);
    const allApps = [appA];
    const playerData = makePlayerData('guild1', [appA]);

    const result = buildGlobalDncOverview(allApps, playerData, 'guild1');

    assert.ok(result.entriesText.includes('B'.repeat(97) + '...'));
    assert.ok(!result.entriesText.includes('B'.repeat(150)));
  });
});

describe('DNC Overview — Entries Formatting', () => {
  it('sorts applicants alphabetically', () => {
    const appA = makeApp('chA', 'Zara', 'zara', 'userA', [
      { id: 'dnc_1', name: 'Someone', username: '', userId: null, issues: '' }
    ]);
    const appB = makeApp('chB', 'Alice', 'alice', 'userB', [
      { id: 'dnc_2', name: 'Another', username: '', userId: null, issues: '' }
    ]);
    const allApps = [appA, appB];
    const playerData = makePlayerData('guild1', [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, 'guild1');

    const alicePos = result.entriesText.indexOf('**Alice**');
    const zaraPos = result.entriesText.indexOf('**Zara**');
    assert.ok(alicePos < zaraPos, 'Alice should appear before Zara');
  });

  it('shows username in entry when available', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: 'serviver', userId: null, issues: '' }
    ]);
    const allApps = [appA];
    const playerData = makePlayerData('guild1', [appA]);

    const result = buildGlobalDncOverview(allApps, playerData, 'guild1');

    assert.ok(result.entriesText.includes('(@serviver)'));
  });

  it('shows (no details) when entry has no issues', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: '', userId: null, issues: '' }
    ]);
    const allApps = [appA];
    const playerData = makePlayerData('guild1', [appA]);

    const result = buildGlobalDncOverview(allApps, playerData, 'guild1');

    assert.ok(result.entriesText.includes('(no details)'));
  });

  it('shows entry count label correctly for singular and plural', () => {
    const appA = makeApp('chA', 'Reece', 'extremedonkey', 'userA', [
      { id: 'dnc_1', name: 'Dave', username: '', userId: null, issues: '' }
    ]);
    const appB = makeApp('chB', 'Dave', 'serviver', 'userB', [
      { id: 'dnc_2', name: 'Alice', username: '', userId: null, issues: '' },
      { id: 'dnc_3', name: 'Bob', username: '', userId: null, issues: '' }
    ]);
    const allApps = [appA, appB];
    const playerData = makePlayerData('guild1', [appA, appB]);

    const result = buildGlobalDncOverview(allApps, playerData, 'guild1');

    assert.ok(result.entriesText.includes('1 entry'));
    assert.ok(result.entriesText.includes('2 entries'));
  });
});
