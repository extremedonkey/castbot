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

// `counter` is a mutable { n } threaded through a render pass so numbering can run continuously
// across multiple calls (Cast → Alternate → Undecided share one) instead of resetting per group.
// `opts.suppressAcceptedTag` drops the inline "· 🎉 Accepted"/"· ✅ Accepted (Alt)" markers — redundant
// once the row already sits under an "- Accepted" sub-heading. "· 🚫 Declined" is NEVER suppressed:
// Declined stays folded into "Offer Sent", so it's the only signal marking it there.
// Demographics now render on their OWN line (not appended inline) — long inline code spans wrap into
// several disconnected-looking boxes on Discord mobile; a full-width line wraps far more cleanly.
function renderRow(p, counter, opts = {}) {
  const scoreDisplay = p.avgScore > 0 ? p.avgScore.toFixed(1) : 'Unrated';
  const resp = (!opts.suppressAcceptedTag && p.placementResponse === 'accepted') ? ' · 🎉 Accepted'
    : (!opts.suppressAcceptedTag && p.placementResponse === 'accepted_alternative') ? ' · ✅ Accepted (Alt)'
    : p.placementResponse === 'declined' ? ' · 🚫 Declined' : '';
  counter.n += 1;
  const line1 = `${counter.n}. ${p.name} - ${scoreDisplay}/5.0 (${p.voteCount} vote${p.voteCount !== 1 ? 's' : ''})${resp}`;
  const demo = demographicsSuffix(p);
  return demo ? `${line1}\n${demo}` : line1;
}

// Mirrors buildMarooningView's demographicsSuffix — "{age} | @{pronoun} | @{timezone}" in backticks,
// same order/style as the Casting card's 👤 Overview line. Bare (no leading space) — it's its own line
// now, not an inline suffix. Test fixtures pass the already-resolved strings directly on `p`
// (pronoun/age/timezone) rather than replicating the guild-role-cache lookup, which is Discord-object-
// shaped and not pure logic (covered separately by resolvePlayerDemographics below).
function demographicsSuffix(p) {
  const bits = [p.age ? `${p.age}` : null, p.pronoun ? `@${p.pronoun}` : null, p.timezone ? `@${p.timezone}` : null].filter(Boolean);
  return bits.length ? `\`${bits.join(' | ')}\`` : '';
}

// Mirrors resolvePlayerDemographics (castRankingManager.js) — the shared age/pronoun/timezone resolver
// used by BOTH the Casting card and Marooning. Role-name lookup tries guild.roles.cache first, falling
// back to member.roles.cache (a GuildMember's roles.cache holds full Role objects, not just IDs).
// THIS is the fix for the prod bug: Marooning previously skipped the member-cache fallback entirely.
function resolvePlayerDemographics(playerData, guildId, userId, member, guild) {
  const age = playerData[guildId]?.players?.[userId]?.age;
  let pronounRoleId = null, timezoneRoleId = null;
  if (member?.roles) {
    const guildPronouns = playerData[guildId]?.pronounRoleIDs || [];
    const guildTimezones = Object.keys(playerData[guildId]?.timezones || {});
    const memberRoles = member.roles.cache ? Array.from(member.roles.cache.keys()) : member.roles;
    for (const roleId of memberRoles) { if (guildPronouns.includes(roleId)) { pronounRoleId = roleId; break; } }
    for (const roleId of memberRoles) { if (guildTimezones.includes(roleId)) { timezoneRoleId = roleId; break; } }
  }
  const roleNameOf = (id) => id ? (guild?.roles?.cache?.get(id)?.name || member?.roles?.cache?.get(id)?.name || null) : null;
  return { age, pronounName: roleNameOf(pronounRoleId), timezoneName: roleNameOf(timezoneRoleId) };
}

// Mirrors buildMarooningView's bulk member-fetch gate — only worth a gateway round-trip when the
// cache is meaningfully incomplete (matches castlistDataAccess.js's tribe-rendering precedent).
function shouldBulkFetchMembers(cacheSize, memberCount) {
  return cacheSize < memberCount * 0.8;
}

// Mirrors buildMarooningView's Cast Players header — "(N/Est)" once the Season Planner's Estimated
// Number of Players is set, else plain "(N)". Deliberately uncapped: exceeding the estimate is valid.
function castPlayersHeader(count, estimatedTotalPlayers) {
  const countSuffix = estimatedTotalPlayers != null ? `/${estimatedTotalPlayers}` : '';
  return `Cast Players (${count}${countSuffix})`;
}

// Mirrors buildMarooningView's splitByOfferStage — Cast/Alternate broken into Accepted / Offer Sent /
// Draft. Declined stays folded into Offer Sent (an offer WAS sent; the inline "· 🚫 Declined" marks it).
const OFFER_STAGE_ACCEPTED = new Set(['accepted', 'accepted_alternative']);
function splitByOfferStage(players) {
  const accepted = [], offerSent = [], draft = [];
  for (const p of players) {
    if (OFFER_STAGE_ACCEPTED.has(p.placementResponse)) accepted.push(p);
    else if (p.offerStatus) offerSent.push(p);
    else draft.push(p);
  }
  return { accepted, offerSent, draft };
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

// Deleted-role filter: gracefully ignore tribes whose Discord role no longer exists
// (guard fires only when a guild object is available; display-only, no data mutation).
function filterDeletedRoles(tribeRoleIds, guild) {
  if (!guild) return tribeRoleIds;
  return tribeRoleIds.filter(rid => guild.roles.cache.has(rid));
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
    const counter = { n: 0 };
    const rows = [
      { name: 'Internet Crybaby', avgScore: 4.0, voteCount: 1 },
      { name: 'Benja Man', avgScore: 2.0, voteCount: 1 }
    ].map(p => renderRow(p, counter));
    assert.equal(rows[0], '1. Internet Crybaby - 4.0/5.0 (1 vote)');
    assert.equal(rows[1], '2. Benja Man - 2.0/5.0 (1 vote)');
    assert.ok(!rows.join('').match(/🥇|🥈|🥉/), 'no medal emojis');
  });
  it('unrated + plural votes + placement annotation', () => {
    assert.equal(renderRow({ name: 'X', avgScore: 0, voteCount: 0 }, { n: 0 }), '1. X - Unrated/5.0 (0 votes)');
    assert.equal(renderRow({ name: 'Y', avgScore: 3, voteCount: 2, placementResponse: 'accepted' }, { n: 2 }),
      '3. Y - 3.0/5.0 (2 votes) · 🎉 Accepted');
  });
  it('accepted_alternative renders "Accepted (Alt)" (distinct from a main-cast accept)', () => {
    assert.equal(
      renderRow({ name: 'Z', avgScore: 4, voteCount: 1, placementResponse: 'accepted_alternative' }, { n: 0 }),
      '1. Z - 4.0/5.0 (1 vote) · ✅ Accepted (Alt)'
    );
  });
});

describe('Marooning Draft — demographics suffix (age | @pronoun | @timezone, matches Casting card Overview)', () => {
  it('all three present → on their OWN line, pipe-joined, backtick-wrapped, Age/Pronoun/Timezone order, @-prefixed', () => {
    assert.equal(
      renderRow({ name: 'Reece', avgScore: 5, voteCount: 1, pronoun: 'He/Him', age: 33, timezone: 'GMT+8' }, { n: 0 }),
      '1. Reece - 5.0/5.0 (1 vote)\n`33 | @He/Him | @GMT+8`'
    );
  });
  it('partial demographics — only the known bits appear, no dangling pipes', () => {
    assert.equal(
      renderRow({ name: 'X', avgScore: 0, voteCount: 0, age: 21 }, { n: 0 }),
      '1. X - Unrated/5.0 (0 votes)\n`21`'
    );
  });
  it('no demographics known → single-line row, no second line at all', () => {
    const row = renderRow({ name: 'X', avgScore: 0, voteCount: 0 }, { n: 0 });
    assert.equal(row, '1. X - Unrated/5.0 (0 votes)');
    assert.ok(!row.includes('\n'));
  });
});

describe('Marooning Draft — rows within a group butt directly together (no blank line — long-roster scroll length)', () => {
  it('consecutive 2-line rows join with a single newline, never a blank line', () => {
    const counter = { n: 0 };
    const rows = [
      { name: 'Q', avgScore: 5, voteCount: 2, age: 21, pronoun: 'He/Him', timezone: 'EST' },
      { name: 'Andrew', avgScore: 5, voteCount: 1, age: 27, pronoun: 'He/Him', timezone: 'CST' }
    ].map(p => renderRow(p, counter));
    // Mirrors renderPlayerList's row-join separator: '\n', not '\n\n'.
    const joined = rows.join('\n');
    assert.equal(
      joined,
      '1. Q - 5.0/5.0 (2 votes)\n`21 | @He/Him | @EST`\n2. Andrew - 5.0/5.0 (1 vote)\n`27 | @He/Him | @CST`'
    );
    assert.ok(!joined.includes('\n\n'), 'no blank line snuck in between entries');
  });
});

describe('resolvePlayerDemographics — role-name resolution (the actual prod bug)', () => {
  const fakeRole = name => ({ name });
  const playerData = { g1: { players: { u1: { age: 33 } }, pronounRoleIDs: ['pron1'], timezones: { tz1: { offset: 8 } } } };

  it('resolves via the GUILD role cache when present', () => {
    const member = { roles: { cache: new Map([['pron1', fakeRole('He/Him')], ['tz1', fakeRole('GMT+8')]]) } };
    const guild = { roles: { cache: new Map([['pron1', fakeRole('He/Him')], ['tz1', fakeRole('GMT+8')]]) } };
    const r = resolvePlayerDemographics(playerData, 'g1', 'u1', member, guild);
    assert.deepEqual(r, { age: 33, pronounName: 'He/Him', timezoneName: 'GMT+8' });
  });

  it('FALLS BACK to the MEMBER role cache when the guild role cache misses (prod bug repro)', () => {
    // guild.roles.cache is missing the timezone role entirely — member.roles.cache still has the full
    // Role object though (this is exactly what generateSeasonAppRankingUI's fetched applicantMember has).
    const member = { roles: { cache: new Map([['pron1', fakeRole('He/Him')], ['tz1', fakeRole('GMT+8')]]) } };
    const guild = { roles: { cache: new Map([['pron1', fakeRole('He/Him')]]) } }; // tz1 NOT cached at guild level
    const r = resolvePlayerDemographics(playerData, 'g1', 'u1', member, guild);
    assert.equal(r.timezoneName, 'GMT+8'); // recovered via the member fallback, not lost
  });

  it('no member object at all (uncached, not fetched) → pronoun/timezone both null, age still resolves', () => {
    // This was the ACTUAL prod bug: Marooning did guild.members.cache.get() (no fetch), and for a large
    // roster most members simply aren't in cache — so pronoun/timezone silently came back empty while
    // age (which needs no Discord object at all) kept working, making it look like a partial/random gap.
    const r = resolvePlayerDemographics(playerData, 'g1', 'u1', undefined, { roles: { cache: new Map() } });
    assert.deepEqual(r, { age: 33, pronounName: null, timezoneName: null });
  });
});

describe('Marooning — bulk member-fetch gate (warms the cache before resolving demographics)', () => {
  it('fetches when the cache is meaningfully incomplete (<80%)', () => {
    assert.equal(shouldBulkFetchMembers(10, 50), true); // 20% cached
  });
  it('skips the fetch when the cache is already warm (≥80%)', () => {
    assert.equal(shouldBulkFetchMembers(45, 50), false); // 90% cached
    assert.equal(shouldBulkFetchMembers(50, 50), false); // 100% cached
  });
});

describe('Marooning — Cast Players header shows "(N/Est)" once a Season Planner estimate is set', () => {
  it('no estimate set → plain "(N)", unchanged from before', () => {
    assert.equal(castPlayersHeader(17, undefined), 'Cast Players (17)');
    assert.equal(castPlayersHeader(17, null), 'Cast Players (17)');
  });
  it('estimate set → "(N/Est)"', () => {
    assert.equal(castPlayersHeader(17, 18), 'Cast Players (17/18)');
  });
  it('exceeding the estimate is a VALID figure — no capping, no clamping', () => {
    assert.equal(castPlayersHeader(22, 18), 'Cast Players (22/18)');
  });
  it('an estimate of 0 still renders (falsy but not null/undefined — != null is the right guard)', () => {
    assert.equal(castPlayersHeader(0, 0), 'Cast Players (0/0)');
  });
});

describe('Marooning Draft — continuous vs. restarting numbering (host counts toward a cast target)', () => {
  it('one counter threaded across Cast → Alternate → Undecided numbers them 1..N continuously', () => {
    const counter = { n: 0 };
    const cast = [{ name: 'C1', avgScore: 5, voteCount: 1 }, { name: 'C2', avgScore: 4, voteCount: 1 }];
    const alt = [{ name: 'A1', avgScore: 3, voteCount: 1 }];
    const und = [{ name: 'U1', avgScore: 0, voteCount: 0 }];
    const rows = [...cast, ...alt, ...und].map(p => renderRow(p, counter));
    assert.deepEqual(rows.map(r => r.split('.')[0]), ['1', '2', '3', '4']);
  });
  it('Don\'t Cast and Withdrawn each get their OWN fresh counter — not continuing from the candidate count', () => {
    const candidateCounter = { n: 0 };
    [{ name: 'C1', avgScore: 5, voteCount: 1 }, { name: 'C2', avgScore: 4, voteCount: 1 }]
      .forEach(p => renderRow(p, candidateCounter)); // pretend 2 candidates already rendered
    const dontCastRow = renderRow({ name: 'R1', avgScore: 1, voteCount: 1 }, { n: 0 });
    const withdrawnRow = renderRow({ name: 'W1', avgScore: 2, voteCount: 1 }, { n: 0 });
    assert.equal(dontCastRow.split('.')[0], '1'); // NOT '3'
    assert.equal(withdrawnRow.split('.')[0], '1'); // independent of Don't Cast's counter too
  });
});

describe('Marooning Draft — offer-stage breakdown (Cast/Alternate: Accepted / Offer Sent / Draft)', () => {
  it('splits by placementResponse (accepted) → offerStatus (sent, no response) → neither (draft)', () => {
    const players = [
      { name: 'Accepted1', placementResponse: 'accepted' },
      { name: 'AcceptedAlt', placementResponse: 'accepted_alternative' },
      { name: 'Sent1', offerStatus: 'offer' },
      { name: 'Declined1', offerStatus: 'offer', placementResponse: 'declined' }, // stays in Offer Sent, not its own bucket
      { name: 'Draft1' }
    ];
    const { accepted, offerSent, draft } = splitByOfferStage(players);
    assert.deepEqual(accepted.map(p => p.name), ['Accepted1', 'AcceptedAlt']);
    assert.deepEqual(offerSent.map(p => p.name), ['Sent1', 'Declined1']);
    assert.deepEqual(draft.map(p => p.name), ['Draft1']);
  });
  it('a Declined player still shows the inline suffix even though bucketed under Offer Sent', () => {
    const row = renderRow({ name: 'D', avgScore: 4, voteCount: 1, offerStatus: 'offer', placementResponse: 'declined' }, { n: 0 });
    assert.ok(row.includes('· 🚫 Declined'));
  });
  it('every player lands in exactly one bucket (no drops, no duplicates)', () => {
    const players = Array.from({ length: 12 }, (_, i) => ({
      name: `P${i}`,
      placementResponse: i % 4 === 0 ? 'accepted' : undefined,
      offerStatus: i % 3 === 0 ? 'offer' : undefined
    }));
    const { accepted, offerSent, draft } = splitByOfferStage(players);
    assert.equal(accepted.length + offerSent.length + draft.length, players.length);
  });
});

describe('Marooning Draft — suppressAcceptedTag (redundant once under an "- Accepted" sub-heading)', () => {
  it('accepted → no inline tag when suppressed (the "- Accepted" sub-section)', () => {
    const row = renderRow({ name: 'Mimi', avgScore: 5, voteCount: 2, placementResponse: 'accepted' }, { n: 0 }, { suppressAcceptedTag: true });
    assert.equal(row, '1. Mimi - 5.0/5.0 (2 votes)');
  });
  it('accepted_alternative → also suppressed', () => {
    const row = renderRow({ name: 'Mimi', avgScore: 5, voteCount: 2, placementResponse: 'accepted_alternative' }, { n: 0 }, { suppressAcceptedTag: true });
    assert.ok(!row.includes('Accepted'));
  });
  it('unsuppressed (default) still shows the accepted tag — e.g. a stale record sitting outside its expected bucket', () => {
    const row = renderRow({ name: 'Mimi', avgScore: 5, voteCount: 2, placementResponse: 'accepted' }, { n: 0 });
    assert.ok(row.includes('· 🎉 Accepted'));
  });
  it('Declined is NEVER suppressed, even with suppressAcceptedTag set — it\'s the only marker inside Offer Sent', () => {
    const row = renderRow({ name: 'D', avgScore: 4, voteCount: 1, placementResponse: 'declined' }, { n: 0 }, { suppressAcceptedTag: true });
    assert.ok(row.includes('· 🚫 Declined'));
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

// ── Context-aware New Tribe: origin threaded button → modal → submit so the submit refreshes the right view ──
function buildModalCustomId(castlistId, origin) {
  return `tribe_add_modal|${castlistId}${origin ? `|${origin}` : ''}`;
}
function routeTribeAddSubmit(customId) {
  const origin = customId.split('|')[2];
  if (origin && origin.startsWith('marooning_')) {
    return { target: 'marooning', configId: origin.slice('marooning_'.length) };
  }
  return { target: 'hub' };
}

describe('New Tribe — context-aware origin routing', () => {
  it('Castlist Manager flow (no origin) → modal id unchanged, refresh = Castlist Hub', () => {
    const id = buildModalCustomId('default', undefined);
    assert.equal(id, 'tribe_add_modal|default');
    assert.deepEqual(routeTribeAddSubmit(id), { target: 'hub' });
  });
  it('Marooning flow → origin appended, submit routes back to Marooning with the configId', () => {
    const origin = 'marooning_config_1783203296677_391415444084490240';
    const id = buildModalCustomId('default', origin);
    assert.equal(id, 'tribe_add_modal|default|marooning_config_1783203296677_391415444084490240');
    assert.deepEqual(routeTribeAddSubmit(id), { target: 'marooning', configId: 'config_1783203296677_391415444084490240' });
  });
  it('preserves underscores in the configId', () => {
    const r = routeTribeAddSubmit('tribe_add_modal|default|marooning_config_1_2_3');
    assert.equal(r.configId, 'config_1_2_3');
  });
  it('worst-case modal custom_id stays under Discord\'s 100-char limit', () => {
    const id = buildModalCustomId('default', 'marooning_config_1783203296677_391415444084490240');
    assert.ok(id.length < 100, `len ${id.length}`);
  });
});

describe('Marooning — deleted Discord roles are gracefully ignored', () => {
  const mockGuild = roleIds => ({ roles: { cache: new Map(roleIds.map(id => [id, {}])) } });

  it('deleted roles are filtered out; live roles kept in order', () => {
    const guild = mockGuild(['roleA', 'roleC']);
    assert.deepEqual(filterDeletedRoles(['roleA', 'roleB', 'roleC'], guild), ['roleA', 'roleC']);
  });
  it('ALL roles deleted → renders exactly like no tribes configured', () => {
    const filtered = filterDeletedRoles(['roleB'], mockGuild([]));
    assert.deepEqual(filtered, []);
    assert.equal(tribesLine(filtered, {}), '**Tribes:** None');
  });
  it('no guild available → filter is a no-op (fail open, current behavior)', () => {
    assert.deepEqual(filterDeletedRoles(['roleA', 'roleB'], null), ['roleA', 'roleB']);
  });
  it('draftees of a deleted tribe fall back to the undrafted list', () => {
    const userDraftTribe = buildUserDraftTribe({ roleDead: ['u1'], roleLive: ['u2'] });
    const live = filterDeletedRoles(['roleDead', 'roleLive'], mockGuild(['roleLive']));
    const players = [{ userId: 'u1', name: 'A' }, { userId: 'u2', name: 'B' }];
    const { perTribe, undrafted } = groupByTribe(players, userDraftTribe, live);
    assert.deepEqual([...perTribe.keys()], ['roleLive']);
    assert.deepEqual(undrafted.map(p => p.name), ['A']);
  });
  it('Draft Tribes gate: 2 tribes with 1 deleted → below the 2-tribe minimum (button disabled / modal null)', () => {
    const live = filterDeletedRoles(['roleA', 'roleDead'], mockGuild(['roleA']));
    assert.ok(live.length < 2);
  });
});
