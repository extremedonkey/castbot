// Tests for computeCastingOrder + the Casting jump-select's sorted display
// (castRankingManager.js): Marooning-order grouping (cast → alternative → tentative
// → reject → undecided), score-desc stable sort, sorted-page slicing/sentinels,
// page_N resolution, Status-engine icons, and label truncation.
// Pure logic replicated inline to avoid importing the Discord/file-I/O-heavy module.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ITEMS_PER_PAGE = 23;
const CASTING_GROUP_ORDER = ['cast', 'alternative', 'tentative', 'reject', 'undecided'];

// Mirrors computeCastingOrder (castRankingManager.js)
function computeCastingOrder(allApplications, playerData, guildId) {
  const entries = allApplications.map((app, insertionIndex) => {
    const rec = playerData[guildId]?.applications?.[app.channelId] || {};
    const scores = Object.values(rec.rankings || {}).filter(r => r !== undefined);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const rawStatus = rec.castingStatus || 'undecided';
    return {
      app,
      insertionIndex,
      userId: app.userId,
      name: app.displayName || app.username,
      avgScore,
      voteCount: scores.length,
      castingStatus: CASTING_GROUP_ORDER.includes(rawStatus) ? rawStatus : 'undecided',
      placementResponse: rec.placementResponse,
      hasNotes: !!rec.playerNotes
    };
  });

  const groups = {};
  for (const status of CASTING_GROUP_ORDER) {
    groups[status] = entries.filter(e => e.castingStatus === status);
    groups[status].sort((a, b) => b.avgScore - a.avgScore);
  }

  return { groups, ordered: CASTING_GROUP_ORDER.flatMap(status => groups[status]) };
}

// Mirrors the jump-select's page derivation (generateSeasonAppRankingUI)
function derivePage(ordered, appIndex) {
  let sortedPos = ordered.findIndex(e => e.insertionIndex === appIndex);
  if (sortedPos === -1) sortedPos = 0;
  return { sortedPos, currentPage: Math.floor(sortedPos / ITEMS_PER_PAGE) };
}

// Mirrors the sentinel/option assembly (labels only where asserted)
function buildOptions(ordered, currentPage) {
  const startIdx = currentPage * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, ordered.length);
  const options = [];
  if (currentPage > 0) {
    options.push({ label: `◀ Show Applications ${(currentPage - 1) * ITEMS_PER_PAGE + 1}-${currentPage * ITEMS_PER_PAGE}`, value: `page_${currentPage - 1}` });
  }
  for (let i = startIdx; i < endIdx; i++) {
    options.push({ label: `${i + 1}.`, value: ordered[i].insertionIndex.toString() });
  }
  if (endIdx < ordered.length) {
    options.push({ label: `▶ Show Applications ${endIdx + 1}-${Math.min(endIdx + ITEMS_PER_PAGE, ordered.length)}`, value: `page_${currentPage + 1}` });
  }
  return options;
}

// Mirrors handleRankingSelect's page_N branch
function resolvePageJump(ordered, newPage) {
  return ordered[Math.min(Math.max(newPage, 0) * ITEMS_PER_PAGE, ordered.length - 1)];
}

// Mirrors deriveApplicationStatus (Status engine — now the select's icon source)
function deriveApplicationStatus(app = {}, liveChannelName = '') {
  const castingStatus = app.castingStatus;
  const placementResponse = app.placementResponse;
  const voteCount = Object.keys(app.rankings || {}).length;
  if (/^✖️/.test(liveChannelName)) return { icon: '✖️', name: 'Withdrawn' };
  if (placementResponse === 'accepted') return { icon: '🎉', name: 'Accepted Placement' };
  if (placementResponse === 'declined') return { icon: '🚫', name: 'Declined Placement' };
  if (castingStatus === 'cast')        return { icon: '✅', name: 'Cast' };
  if (castingStatus === 'alternative') return { icon: '🔄', name: 'Alternate' };
  if (castingStatus === 'tentative')   return { icon: '❓', name: 'Tentatively Cast' };
  if (castingStatus === 'reject')      return { icon: '❌', name: 'Not Cast' };
  if (voteCount >= 2)                  return { icon: '☑️', name: 'Reviewed' };
  if (voteCount >= 1)                  return { icon: '🗳️', name: `Scoring (${voteCount} vote${voteCount === 1 ? '' : 's'})` };
  return { icon: '📝', name: 'Awaiting Votes' };
}

// Mirrors the option label builder incl. 100-char truncation
function buildLabel(icon, position, displayName, username, avgScore, voteCount, hasNotes) {
  const scoreText = avgScore > 0 ? `${avgScore.toFixed(1)}/5.0` : 'Unrated';
  const voteText = voteCount === 1 ? '1 vote' : `${voteCount} votes`;
  const notesIndicator = hasNotes ? ' 💬' : '';
  let label = `${icon} ${position}. ${displayName} (${username}) - ${scoreText} (${voteText})${notesIndicator}`;
  if (label.length > 100) {
    const fixedParts = `${icon} ${position}. ${displayName} () - ${scoreText} (${voteText})${notesIndicator}`;
    const availableSpace = 100 - fixedParts.length;
    if (availableSpace > 0) {
      const truncatedUsername = username.length > availableSpace ?
        username.substring(0, availableSpace - 1) + '…' : username;
      label = `${icon} ${position}. ${displayName} (${truncatedUsername}) - ${scoreText} (${voteText})${notesIndicator}`;
    } else {
      label = label.substring(0, 97) + '...';
    }
  }
  return label;
}

// Mirrors handleRankingSelect's custom_id parse
function parseRankingSelectId(customId) {
  const parts = customId.split('_');
  const currentIndex = parseInt(parts[2]);
  const currentPage = parseInt(parts[parts.length - 1]) || 0;
  let configId = null;
  if (parts.length > 4) configId = parts.slice(3, -1).join('_');
  return { currentIndex, configId, currentPage };
}

// --- fixtures ---
const GUILD = 'g1';
function fixture(apps) {
  // apps: [{ userId, name, status, scores, notes, channelId? }]
  const playerData = { [GUILD]: { applications: {} } };
  const allApplications = apps.map((a, i) => {
    const channelId = a.channelId || `ch${i}`;
    const rec = { channelId, userId: a.userId || `u${i}`, displayName: a.name, username: (a.name || '').toLowerCase() };
    if (a.status !== undefined) rec.castingStatus = a.status;
    if (a.scores) rec.rankings = Object.fromEntries(a.scores.map((s, j) => [`admin${j}`, s]));
    if (a.notes) rec.playerNotes = a.notes;
    if (a.placementResponse) rec.placementResponse = a.placementResponse;
    playerData[GUILD].applications[channelId] = rec;
    return rec;
  });
  return { allApplications, playerData };
}

describe('computeCastingOrder — grouping', () => {
  it('orders groups cast → alternative → tentative → reject → undecided', () => {
    const { allApplications, playerData } = fixture([
      { name: 'Und' },
      { name: 'Rej', status: 'reject' },
      { name: 'Ten', status: 'tentative' },
      { name: 'Alt', status: 'alternative' },
      { name: 'Cast', status: 'cast' }
    ]);
    const { ordered } = computeCastingOrder(allApplications, playerData, GUILD);
    assert.deepEqual(ordered.map(e => e.name), ['Cast', 'Alt', 'Ten', 'Rej', 'Und']);
  });

  it('a high-scored reject never outranks a low-scored cast (group beats score)', () => {
    const { allApplications, playerData } = fixture([
      { name: 'Rej5', status: 'reject', scores: [5, 5] },
      { name: 'Cast3', status: 'cast', scores: [3] }
    ]);
    const { ordered } = computeCastingOrder(allApplications, playerData, GUILD);
    assert.deepEqual(ordered.map(e => e.name), ['Cast3', 'Rej5']);
  });

  it('empty groups vanish seamlessly (no holes)', () => {
    const { allApplications, playerData } = fixture([
      { name: 'A', status: 'cast' },
      { name: 'B' }
    ]);
    const { ordered, groups } = computeCastingOrder(allApplications, playerData, GUILD);
    assert.equal(ordered.length, 2);
    assert.equal(groups.tentative.length, 0);
  });

  it('undefined AND unknown statuses land in undecided — never dropped', () => {
    const { allApplications, playerData } = fixture([
      { name: 'NoStatus' },
      { name: 'Corrupt', status: 'maybe' }
    ]);
    const { ordered, groups } = computeCastingOrder(allApplications, playerData, GUILD);
    assert.equal(ordered.length, 2);
    assert.deepEqual(groups.undecided.map(e => e.name), ['NoStatus', 'Corrupt']);
  });
});

describe('computeCastingOrder — within-group score sort', () => {
  it('sorts by average score descending', () => {
    const { allApplications, playerData } = fixture([
      { name: 'Low', status: 'cast', scores: [2] },
      { name: 'High', status: 'cast', scores: [5, 4] },
      { name: 'Mid', status: 'cast', scores: [3, 4] }
    ]);
    const { ordered } = computeCastingOrder(allApplications, playerData, GUILD);
    assert.deepEqual(ordered.map(e => e.name), ['High', 'Mid', 'Low']);
  });

  it('stable ties keep insertion order; unrated sink to group bottom', () => {
    const { allApplications, playerData } = fixture([
      { name: 'TieA', status: 'cast', scores: [4] },
      { name: 'Unrated1', status: 'cast' },
      { name: 'TieB', status: 'cast', scores: [4] },
      { name: 'Unrated2', status: 'cast' }
    ]);
    const { ordered } = computeCastingOrder(allApplications, playerData, GUILD);
    assert.deepEqual(ordered.map(e => e.name), ['TieA', 'TieB', 'Unrated1', 'Unrated2']);
  });
});

describe('computeCastingOrder — completeness invariant', () => {
  it('every applicant appears exactly once with their insertion index', () => {
    const { allApplications, playerData } = fixture(
      Array.from({ length: 40 }, (_, i) => ({
        name: `P${i}`,
        status: ['cast', 'alternative', 'tentative', 'reject', undefined, 'garbage'][i % 6],
        scores: i % 3 === 0 ? [((i * 7) % 5) + 1] : undefined
      }))
    );
    const { ordered } = computeCastingOrder(allApplications, playerData, GUILD);
    assert.equal(ordered.length, allApplications.length);
    const seen = new Set(ordered.map(e => e.insertionIndex));
    assert.equal(seen.size, allApplications.length);
    // values stay resolvable: ordered entry N points back at its original record
    for (const e of ordered) assert.equal(allApplications[e.insertionIndex], e.app);
  });

  it('missing playerData record → avgScore 0, undecided (matches Marooning)', () => {
    const orphan = { channelId: 'gone', userId: 'uX', displayName: 'Ghost', username: 'ghost' };
    const playerData = { [GUILD]: { applications: {} } };
    const { ordered, groups } = computeCastingOrder([orphan], playerData, GUILD);
    assert.equal(ordered.length, 1);
    assert.equal(groups.undecided[0].avgScore, 0);
  });
});

describe('Jump-select — sorted page derivation & slicing', () => {
  const { allApplications, playerData } = fixture(
    Array.from({ length: 50 }, (_, i) => ({
      name: `P${i}`,
      status: i < 10 ? 'cast' : i < 20 ? 'reject' : undefined,
      scores: [(i % 5) + 1]
    }))
  );
  const { ordered } = computeCastingOrder(allApplications, playerData, GUILD);

  it('currentPage comes from sorted position, not insertion index', () => {
    // insertionIndex 15 is a reject → sorts after all 10 casts, somewhere in 10..19
    const { sortedPos, currentPage } = derivePage(ordered, 15);
    assert.equal(ordered[sortedPos].insertionIndex, 15);
    assert.equal(currentPage, Math.floor(sortedPos / ITEMS_PER_PAGE));
  });

  it('current applicant always lands inside its derived page slice', () => {
    for (const appIndex of [0, 7, 15, 26, 49]) {
      const { sortedPos, currentPage } = derivePage(ordered, appIndex);
      const start = currentPage * ITEMS_PER_PAGE;
      assert.ok(sortedPos >= start && sortedPos < start + ITEMS_PER_PAGE);
    }
  });

  it('findIndex miss falls back to sortedPos 0 / page 0', () => {
    assert.deepEqual(derivePage(ordered, 999), { sortedPos: 0, currentPage: 0 });
  });

  it('page 0 has no ◀, has ▶ with sorted range, 23 applicants → 24 options', () => {
    const options = buildOptions(ordered, 0);
    assert.equal(options.length, 24);
    assert.ok(!options.some(o => o.label.startsWith('◀')));
    assert.equal(options.at(-1).label, '▶ Show Applications 24-46');
    assert.equal(options.at(-1).value, 'page_1');
  });

  it('middle page has both sentinels → exactly 25 options (Discord cap)', () => {
    const options = buildOptions(ordered, 1);
    assert.equal(options.length, 25);
    assert.equal(options[0].label, '◀ Show Applications 1-23');
    assert.equal(options.at(-1).label, '▶ Show Applications 47-50');
  });

  it('last page has no ▶', () => {
    const options = buildOptions(ordered, 2);
    assert.ok(!options.some(o => o.label.startsWith('▶')));
    assert.equal(options[0].value, 'page_1');
  });

  it('option values are insertion indices of the SORTED entries', () => {
    const options = buildOptions(ordered, 0).filter(o => !o.value.startsWith('page_'));
    assert.deepEqual(options.map(o => o.value), ordered.slice(0, 23).map(e => e.insertionIndex.toString()));
  });
});

describe('Jump-select — page_N resolution (handleRankingSelect)', () => {
  const { allApplications, playerData } = fixture(
    Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, scores: [(i % 5) + 1] }))
  );
  const { ordered } = computeCastingOrder(allApplications, playerData, GUILD);

  it('resolves to the first applicant of the sorted page', () => {
    assert.equal(resolvePageJump(ordered, 1), ordered[23]);
  });

  it('clamps a page past the end to the last applicant', () => {
    assert.equal(resolvePageJump(ordered, 5), ordered[29]);
  });

  it('empty list → undefined (error path)', () => {
    assert.equal(resolvePageJump([], 0), undefined);
  });

  it('NaN page → undefined (error path)', () => {
    assert.equal(resolvePageJump(ordered, NaN), undefined);
  });

  it('negative page clamps to page 0', () => {
    assert.equal(resolvePageJump(ordered, -3), ordered[0]);
  });
});

describe('Jump-select — Status-engine icons (full alignment)', () => {
  it('tentative → ❓ (previously fell through to ☑️/🗳️)', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'tentative', rankings: { a: 5, b: 4 } }).icon, '❓');
  });
  it('zero votes → 📝 (previously 🗳️)', () => {
    assert.equal(deriveApplicationStatus({}).icon, '📝');
  });
  it('withdrawn channel name → ✖️ (new to the select)', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'cast' }, '✖️tuckie-app').icon, '✖️');
  });
  it('placementResponse beats castingStatus', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'reject', placementResponse: 'accepted' }).icon, '🎉');
  });
  it('vote-progress fallbacks unchanged: ≥2 → ☑️, 1 → 🗳️', () => {
    assert.equal(deriveApplicationStatus({ rankings: { a: 5, b: 3 } }).icon, '☑️');
    assert.equal(deriveApplicationStatus({ rankings: { a: 5 } }).icon, '🗳️');
  });
});

describe('Jump-select — label build & truncation', () => {
  it('scored applicant shows avg + votes', () => {
    assert.equal(
      buildLabel('✅', 2, 'Tuckie', 'tuckie', 4.5, 2, true),
      '✅ 2. Tuckie (tuckie) - 4.5/5.0 (2 votes) 💬'
    );
  });
  it('unrated applicant shows Unrated (mirrors Marooning renderRow)', () => {
    assert.equal(
      buildLabel('📝', 30, 'Dan', 'dan', 0, 0, false),
      '📝 30. Dan (dan) - Unrated (0 votes)'
    );
  });
  it('long username truncates with … and stays ≤100 chars', () => {
    const label = buildLabel('✅', 1, 'A'.repeat(50), 'u'.repeat(60), 4.0, 3, false);
    assert.ok(label.length <= 100);
    assert.ok(label.includes('…'));
  });
  it('degenerate overlong displayName falls back to hard cut', () => {
    const label = buildLabel('✅', 1, 'A'.repeat(120), 'user', 4.0, 3, false);
    assert.equal(label.length, 100);
    assert.ok(label.endsWith('...'));
  });
});

describe('Jump-select — custom_id round-trip (format unchanged)', () => {
  it('parses an underscore-laden configId intact', () => {
    const parsed = parseRankingSelectId('ranking_select_7_config_1781015852414_454453967309504512_2');
    assert.equal(parsed.currentIndex, 7);
    assert.equal(parsed.configId, 'config_1781015852414_454453967309504512');
    assert.equal(parsed.currentPage, 2);
  });
});

describe('Marooning parity — helper matches the old inline logic', () => {
  // OLD inline logic, verbatim from pre-refactor buildMarooningView
  function oldMarooningGroups(allApplications, playerData, guildId) {
    const applicantData = allApplications.map((app) => {
      const rec = playerData[guildId]?.applications?.[app.channelId] || {};
      const scores = Object.values(rec.rankings || {}).filter(r => r !== undefined);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return {
        userId: app.userId,
        name: app.displayName || app.username,
        avgScore,
        voteCount: scores.length,
        castingStatus: rec.castingStatus || 'undecided',
        placementResponse: rec.placementResponse
      };
    });
    const castGroups = {
      cast: applicantData.filter(a => a.castingStatus === 'cast'),
      alternative: applicantData.filter(a => a.castingStatus === 'alternative'),
      tentative: applicantData.filter(a => a.castingStatus === 'tentative'),
      reject: applicantData.filter(a => a.castingStatus === 'reject'),
      undecided: applicantData.filter(a => a.castingStatus === 'undecided')
    };
    Object.values(castGroups).forEach(g => g.sort((a, b) => b.avgScore - a.avgScore));
    return castGroups;
  }

  it('per-group projections deepEqual across old and new (all statuses, ties, missing record)', () => {
    const { allApplications, playerData } = fixture([
      { name: 'C1', status: 'cast', scores: [5] },
      { name: 'C2', status: 'cast', scores: [5] },      // tie with C1
      { name: 'A1', status: 'alternative', scores: [3] },
      { name: 'T1', status: 'tentative' },
      { name: 'R1', status: 'reject', scores: [1, 2] },
      { name: 'U1' },
      { name: 'U2', scores: [4], placementResponse: 'accepted' }
    ]);
    // plus an app whose playerData record is missing entirely
    const ghost = { channelId: 'ghost', userId: 'uG', displayName: 'Ghost', username: 'ghost' };
    const apps = [...allApplications, ghost];

    const oldGroups = oldMarooningGroups(apps, playerData, GUILD);
    const { groups: newGroups } = computeCastingOrder(apps, playerData, GUILD);

    const project = g => g.map(({ userId, name, avgScore, voteCount, placementResponse }) =>
      ({ userId, name, avgScore, voteCount, placementResponse }));
    for (const status of CASTING_GROUP_ORDER) {
      assert.deepEqual(project(newGroups[status]), project(oldGroups[status]), `group ${status}`);
    }
  });
});
