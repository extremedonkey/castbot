// Tests for the Marooning Draft Tribes feature (castRankingManager.js buildMarooningView / buildDraftTribesModal).
// Pure logic replicated inline (avoids importing Discord/storage). Covers: the private draft→tribe grouping of
// the casting list, the score-row format (medals removed), the Tribes line, and the >5-tribe modal warning.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicas of the pure logic in buildMarooningView / buildDraftTribesModal ──

function buildUserDraftTribe(draftTribes) {
  const userDraftTribe = {};
  for (const [rid, ids] of Object.entries(draftTribes || {})) {
    for (const uid of (ids || [])) { if (!userDraftTribe[uid]) userDraftTribe[uid] = rid; }
  }
  return userDraftTribe;
}

function groupByTribe(players, userDraftTribe, tribeRoleIds) {
  const perTribe = new Map();
  const undrafted = [];
  for (const p of players) {
    const rid = userDraftTribe[p.userId];
    if (rid && tribeRoleIds.includes(rid)) {
      if (!perTribe.has(rid)) perTribe.set(rid, []);
      perTribe.get(rid).push(p);
    } else {
      undrafted.push(p);
    }
  }
  return { perTribe, undrafted };
}

function renderRow(p, i) {
  const scoreDisplay = p.avgScore > 0 ? p.avgScore.toFixed(1) : 'Unrated';
  const resp = p.placementResponse === 'accepted' ? ' · 🎉 Accepted'
    : p.placementResponse === 'declined' ? ' · 🚫 Declined' : '';
  return `${i + 1}. ${p.name} - ${scoreDisplay}/5.0 (${p.voteCount} vote${p.voteCount !== 1 ? 's' : ''})${resp}`;
}

function tribesLine(tribeRoleIds, tribes) {
  return tribeRoleIds.length > 0
    ? `**Tribes:** ${tribeRoleIds.map(id => `${tribes[id]?.emoji || '🏕️'} <@&${id}>`).join(', ')}`
    : '**Tribes:** None';
}

// which shown-label index (if any) carries the overflow warning
function overflowWarningIndex(tribeRoleIds) {
  const shown = tribeRoleIds.slice(0, 5);
  return tribeRoleIds.length > 5 ? shown.length - 1 : -1;
}

describe('Marooning Draft — userDraftTribe map (first tribe wins)', () => {
  it('maps each userId to its first drafting tribe', () => {
    const m = buildUserDraftTribe({ roleA: ['u1', 'u2'], roleB: ['u3'] });
    assert.deepEqual(m, { u1: 'roleA', u2: 'roleA', u3: 'roleB' });
  });
  it('a user in two tribes keeps the FIRST (stable, no duplicates)', () => {
    const m = buildUserDraftTribe({ roleA: ['u1'], roleB: ['u1'] });
    assert.equal(m.u1, 'roleA');
  });
  it('empty / missing → empty map', () => {
    assert.deepEqual(buildUserDraftTribe({}), {});
    assert.deepEqual(buildUserDraftTribe(undefined), {});
  });
});

describe('Marooning Draft — grouping the casting list by draft tribe', () => {
  const tribeRoleIds = ['roleA', 'roleB'];
  const players = [
    { userId: 'u1', name: 'Alice' },
    { userId: 'u2', name: 'Bob' },
    { userId: 'u3', name: 'Cara' } // undrafted
  ];
  const userDraftTribe = buildUserDraftTribe({ roleA: ['u1'], roleB: ['u2'] });

  it('splits players into per-tribe buckets + an undrafted bucket', () => {
    const { perTribe, undrafted } = groupByTribe(players, userDraftTribe, tribeRoleIds);
    assert.deepEqual(perTribe.get('roleA').map(p => p.name), ['Alice']);
    assert.deepEqual(perTribe.get('roleB').map(p => p.name), ['Bob']);
    assert.deepEqual(undrafted.map(p => p.name), ['Cara']);
  });
  it('a draft pointing at a tribe NOT on the castlist falls back to undrafted', () => {
    const stray = buildUserDraftTribe({ roleGONE: ['u1'] });
    const { perTribe, undrafted } = groupByTribe([players[0]], stray, tribeRoleIds);
    assert.equal(perTribe.size, 0);
    assert.deepEqual(undrafted.map(p => p.name), ['Alice']);
  });
});

describe('Marooning Draft — score row format (no medals, numbered)', () => {
  it('numbers sequentially, no 🥇🥈🥉', () => {
    const rows = [
      { name: 'Internet Crybaby', avgScore: 4.0, voteCount: 1 },
      { name: 'Benja Man', avgScore: 2.0, voteCount: 1 }
    ].map(renderRow);
    assert.equal(rows[0], '1. Internet Crybaby - 4.0/5.0 (1 vote)');
    assert.equal(rows[1], '2. Benja Man - 2.0/5.0 (1 vote)');
    assert.ok(!rows.join('').match(/🥇|🥈|🥉/), 'no medal emojis');
  });
  it('unrated + plural votes + placement annotation', () => {
    assert.equal(renderRow({ name: 'X', avgScore: 0, voteCount: 0 }, 0), '1. X - Unrated/5.0 (0 votes)');
    assert.equal(renderRow({ name: 'Y', avgScore: 3, voteCount: 2, placementResponse: 'accepted' }, 2),
      '3. Y - 3.0/5.0 (2 votes) · 🎉 Accepted');
  });
});

describe('Marooning Draft — Tribes line', () => {
  it('None when no tribes', () => {
    assert.equal(tribesLine([], {}), '**Tribes:** None');
  });
  it('emoji + role mention, comma-joined; default 🏕️ when no emoji', () => {
    const line = tribesLine(['r1', 'r2'], { r1: { emoji: '🔥' } });
    assert.equal(line, '**Tribes:** 🔥 <@&r1>, 🏕️ <@&r2>');
  });
});

describe('Marooning Draft — modal caps at 5 with an overflow warning', () => {
  it('no warning at ≤5 tribes', () => {
    assert.equal(overflowWarningIndex(['a', 'b', 'c']), -1);
    assert.equal(overflowWarningIndex(['a', 'b', 'c', 'd', 'e']), -1);
  });
  it('warning on the LAST shown label when >5 tribes', () => {
    assert.equal(overflowWarningIndex(['a', 'b', 'c', 'd', 'e', 'f']), 4); // 5th shown label (index 4)
  });
});
