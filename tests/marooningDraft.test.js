// Tests for the Marooning Draft Tribes feature (castRankingManager.js buildMarooningView / buildDraftTribesModal).
// Pure logic replicated inline (avoids importing Discord/storage). Covers: the private draft→tribe grouping of
// the casting list, the score-row format (medals removed), the Tribes line, and the >5-tribe modal warning.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicas of the pure logic in buildMarooningView / buildDraftTribesModal ──

// userId → EVERY tribe that drafted them (was first-tribe-wins until 2026-08-09; see the suite below).
function buildUserDraftTribes(draftTribes) {
  const map = {};
  for (const [rid, ids] of Object.entries(draftTribes || {})) {
    for (const uid of (ids || [])) { (map[uid] ||= []).push(rid); }
  }
  return map;
}

function groupByTribe(players, userDraftTribes, tribeRoleIds) {
  const perTribe = new Map();
  const undrafted = [];
  for (const p of players) {
    const rids = (userDraftTribes[p.userId] || []).filter(rid => tribeRoleIds.includes(rid));
    if (rids.length) {
      for (const rid of rids) {
        if (!perTribe.has(rid)) perTribe.set(rid, []);
        perTribe.get(rid).push(p);
      }
    } else {
      undrafted.push(p);
    }
  }
  return { perTribe, undrafted };
}

// Drafted users with no application for this season — invisible in every roster before 2026-08-09.
function findOrphanDrafts(draftTribes, tribeRoleIds, applicantUserIds) {
  const out = [];
  for (const rid of tribeRoleIds) {
    const ids = (draftTribes[rid] || []).filter(uid => !applicantUserIds.has(uid));
    if (ids.length) out.push({ rid, ids });
  }
  return out;
}

// `counter` is a mutable { n } threaded through a render pass so numbering can run continuously
// across multiple calls (Cast → Alternate → Undecided share one) instead of resetting per group.
// `opts.suppressAcceptedTag` drops the inline "· 🎉 Accepted"/"· ✅ Accepted (Alt)" markers — redundant
// once the row already sits under an "- Accepted" sub-heading. "· 🚫 Declined" is NEVER suppressed:
// Declined stays folded into "Offer Sent", so it's the only signal marking it there.
// Demographics now render on their OWN line (not appended inline) — long inline code spans wrap into
// several disconnected-looking boxes on Discord mobile; a full-width line wraps far more cleanly.
// ONE line per player: "2. ReeceBot - 27yo | @Ask | @CST / CDT". Score/vote count led the row and
// demographics sat on a `-#` line beneath until 2026-08-09 — both dropped: by marooning the decision is
// already made, so the score was noise doubling every roster's height. Sort order still encodes it.
// Offer-progress flags. Accepted (the done state) carries NO marker — only outstanding work is flagged,
// so the exceptions stay visible. Replaced the "· 🎉 Accepted / · ✅ Accepted (Alt) / · 🚫 Declined"
// tags AND the three sub-headings they lived under (2026-08-09).
const FLAG_NO_OFFER = '⚠️✒️';
const FLAG_AWAITING = '⚠️📨';
const FLAG_DECLINED = '⚠️🚫';
const OFFER_ACCEPTED = new Set(['accepted', 'accepted_alternative']);
function offerStageRank(p) { return OFFER_ACCEPTED.has(p.placementResponse) ? 0 : (p.offerStatus ? 1 : 2); }
function offerFlagFor(p) {
  if (OFFER_ACCEPTED.has(p.placementResponse)) return '';
  if (p.placementResponse === 'declined') return FLAG_DECLINED;
  return p.offerStatus ? FLAG_AWAITING : FLAG_NO_OFFER;
}

function renderRow(p, counter, opts = {}) {
  const flag = opts.offerFlags ? offerFlagFor(p) : '';
  counter.n += 1;
  const demo = demographicsInline(p);
  return `${counter.n}. ${p.name}${demo ? ` - ${demo}` : ''}${flag ? ` ${flag}` : ''}`;
}

// Mirrors buildMarooningView's demographicsInline — "{age}yo | @{pronoun} | @{timezone}" on the player's
// own row. Test fixtures pass the already-resolved strings directly on `p` (pronoun/age/timezone) rather
// than replicating the guild-role-cache lookup, which is Discord-object-shaped and not pure logic
// (covered separately by resolvePlayerDemographics below).
function demographicsInline(p) {
  const bits = [p.age ? `${p.age}yo` : null, p.pronoun ? `@${p.pronoun}` : null, p.timezone ? `@${p.timezone}` : null].filter(Boolean);
  return bits.join(' | ');
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

// Mirrors renderMarooningRejectsToggle's custom_id parsing (castRankingManager.js).
function parseRejectsToggleCustomId(customId) {
  const showRejects = customId.startsWith('marooning_show_rejects_');
  const configId = customId.replace(showRejects ? 'marooning_show_rejects_' : 'marooning_hide_rejects_', '');
  return { showRejects, configId };
}

// Mirrors buildMarooningView's 🗑️ toggle button — label stays a STATIC "Rejects" regardless of state
// (the body text already makes current state obvious); only custom_id flips. Disabled when there's
// nothing to reveal (no dead-end click).
function rejectsToggleButton(showRejects, hasRejects, configId) {
  return {
    custom_id: showRejects ? `marooning_hide_rejects_${configId}` : `marooning_show_rejects_${configId}`,
    label: 'Rejects',
    disabled: !hasRejects
  };
}

// Mirrors buildMarooningView's collapsed-state hint line ("Rejects" — the button's actual label).
function hiddenRejectsHint(showRejects, rejectCount, withdrawnCount) {
  if (showRejects) return null;
  const hiddenCount = rejectCount + withdrawnCount;
  if (hiddenCount === 0) return null;
  return `-# 🗑️ ${hiddenCount} Don't Cast/Withdrawn applicant${hiddenCount !== 1 ? 's' : ''} hidden — click Rejects below to view.`;
}

// Mirrors buildMarooningView's Cast Players header — "(N/Est)" once the Season Planner's Estimated
// Number of Players is set, else plain "(N)". Deliberately uncapped: exceeding the estimate is valid.
function castPlayersHeader(count, estimatedTotalPlayers) {
  const countSuffix = estimatedTotalPlayers != null ? `/${estimatedTotalPlayers}` : '';
  return `Cast Players (${count}${countSuffix})`;
}

// Mirrors buildMarooningView's per-tribe header + the ⚠️ Key block (only flags actually in play).
function tribeHeader(rid, n) { return `> <@&${rid}> (${n} player${n === 1 ? '' : 's'})`; }
function keyBlock(flagsUsed) {
  const LINES = [
    [FLAG_NO_OFFER, "Hasn't been sent an offer — send one with ✒️ Bulk Offers, or ✒️ Send Offer on the 🏆 Casting tab."],
    [FLAG_AWAITING, "Offer sent, no reply yet — they haven't accepted or declined."],
    [FLAG_DECLINED, 'Declined their placement — they are NOT playing unless you re-offer.'],
  ].filter(([f]) => flagsUsed.has(f));
  return LINES.length ? `> **Key**\n${LINES.map(([f, t]) => `> ${f} ${t}`).join('\n')}` : '';
}

// Mirrors the duplicate-application detector: same person, several application channels in ONE season.
function findDuplicateApplicants(allApplications) {
  const byUser = new Map();
  for (const a of allApplications) {
    if (!byUser.has(a.userId)) byUser.set(a.userId, []);
    byUser.get(a.userId).push(a);
  }
  return [...byUser.entries()].filter(([, apps]) => apps.length > 1);
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

// Mirrors getMarooningTribeRoleIds (castRankingManager.js) — simplified from the old 3-format
// castlist-membership check (castlistIds[]/castlistId/legacy castlist string vs 'default') to a direct
// existence check: every tribe CastBot knows about, whose Discord role still exists. Fixes a real gap —
// a tribe created via the "Tribes (Legacy)" debug flow has no castlistIds and could fail every format check.
// Null/undefined tribe entries are skipped — prod data contains them (the virtual adapter guards
// `if (!tribe) continue` in three places for the same reason).
function getMarooningTribeRoleIds(playerData, guildId, guild) {
  const allTribeIds = Object.entries(playerData[guildId]?.tribes || {})
    .filter(([, tribe]) => tribe)
    .map(([roleId]) => roleId);
  return guild ? allTribeIds.filter(rid => guild.roles.cache.has(rid)) : allTribeIds;
}

describe('Marooning Draft — userDraftTribes map (EVERY tribe, not just the first)', () => {
  it('maps each userId to its drafting tribes', () => {
    const m = buildUserDraftTribes({ roleA: ['u1', 'u2'], roleB: ['u3'] });
    assert.deepEqual(m, { u1: ['roleA'], u2: ['roleA'], u3: ['roleB'] });
  });
  it('a user in two tribes keeps BOTH — the draft modal shows them in both, so this view must too', () => {
    // Regression: first-tribe-wins made the second tribe render empty while the modal showed the
    // player pre-selected in it (TEST 2026-08-09, CastBot-Test drafted into lk;klnk AND Any).
    assert.deepEqual(buildUserDraftTribes({ roleA: ['u1'], roleB: ['u1'] }).u1, ['roleA', 'roleB']);
  });
  it('empty / missing → empty map', () => {
    assert.deepEqual(buildUserDraftTribes({}), {});
    assert.deepEqual(buildUserDraftTribes(undefined), {});
  });
});

describe('Marooning Draft — grouping the casting list by draft tribe', () => {
  const tribeRoleIds = ['roleA', 'roleB'];
  const players = [
    { userId: 'u1', name: 'Alice' },
    { userId: 'u2', name: 'Bob' },
    { userId: 'u3', name: 'Cara' } // undrafted
  ];
  const userDraftTribes = buildUserDraftTribes({ roleA: ['u1'], roleB: ['u2'] });

  it('splits players into per-tribe buckets + an undrafted bucket', () => {
    const { perTribe, undrafted } = groupByTribe(players, userDraftTribes, tribeRoleIds);
    assert.deepEqual(perTribe.get('roleA').map(p => p.name), ['Alice']);
    assert.deepEqual(perTribe.get('roleB').map(p => p.name), ['Bob']);
    assert.deepEqual(undrafted.map(p => p.name), ['Cara']);
  });
  it('a player drafted into two tribes appears under BOTH', () => {
    const both = buildUserDraftTribes({ roleA: ['u1'], roleB: ['u1'] });
    const { perTribe, undrafted } = groupByTribe([players[0]], both, tribeRoleIds);
    assert.deepEqual(perTribe.get('roleA').map(p => p.name), ['Alice']);
    assert.deepEqual(perTribe.get('roleB').map(p => p.name), ['Alice']);
    assert.equal(undrafted.length, 0, 'appearing twice is the signal, not a reason to hide them');
  });
  it('a draft pointing at a tribe NOT on the castlist falls back to undrafted', () => {
    const stray = buildUserDraftTribes({ roleGONE: ['u1'] });
    const { perTribe, undrafted } = groupByTribe([players[0]], stray, tribeRoleIds);
    assert.equal(perTribe.size, 0);
    assert.deepEqual(undrafted.map(p => p.name), ['Alice']);
  });
  it('a player drafted into one live and one deleted tribe still shows under the live one', () => {
    const mixed = buildUserDraftTribes({ roleA: ['u1'], roleGONE: ['u1'] });
    const { perTribe, undrafted } = groupByTribe([players[0]], mixed, tribeRoleIds);
    assert.deepEqual(perTribe.get('roleA').map(p => p.name), ['Alice']);
    assert.equal(undrafted.length, 0);
  });
});

describe('Marooning Draft — drafted users with no application', () => {
  const tribeRoleIds = ['roleA', 'roleB'];

  it('surfaces a drafted non-applicant instead of silently dropping them', () => {
    // The draft modal's User Select offers EVERY server member, but every roster is built from
    // applications — so these users used to vanish, leaving a tribe looking half-empty.
    const orphans = findOrphanDrafts({ roleA: ['u1', 'ghost'] }, tribeRoleIds, new Set(['u1']));
    assert.deepEqual(orphans, [{ rid: 'roleA', ids: ['ghost'] }]);
  });

  it('reports nothing when every drafted user has an application', () => {
    assert.deepEqual(findOrphanDrafts({ roleA: ['u1'] }, tribeRoleIds, new Set(['u1'])), []);
  });

  it('groups orphans under each tribe, in tribe order', () => {
    const orphans = findOrphanDrafts({ roleB: ['g2'], roleA: ['g1'] }, tribeRoleIds, new Set());
    assert.deepEqual(orphans.map(o => o.rid), ['roleA', 'roleB'], 'follows tribeRoleIds order, not object key order');
  });

  it('ignores drafts pointing at tribes that no longer exist', () => {
    assert.deepEqual(findOrphanDrafts({ roleGONE: ['ghost'] }, tribeRoleIds, new Set()), []);
  });

  it('counts one orphan per tribe they were drafted into', () => {
    const orphans = findOrphanDrafts({ roleA: ['ghost'], roleB: ['ghost'] }, tribeRoleIds, new Set());
    assert.equal(orphans.reduce((n, o) => n + o.ids.length, 0), 2);
  });

  it('an empty season with only orphan drafts still has something to render', () => {
    const orphans = findOrphanDrafts({ roleA: ['ghost'] }, tribeRoleIds, new Set());
    assert.ok(orphans.length > 0, 'the "No applicants yet" empty state must not swallow this');
  });
});

describe('Marooning Draft — row format (numbered, no scores, no medals)', () => {
  it('numbers sequentially, no 🥇🥈🥉', () => {
    const counter = { n: 0 };
    const rows = [
      { name: 'Internet Crybaby', avgScore: 4.0, voteCount: 1 },
      { name: 'Benja Man', avgScore: 2.0, voteCount: 1 }
    ].map(p => renderRow(p, counter));
    assert.equal(rows[0], '1. Internet Crybaby');
    assert.equal(rows[1], '2. Benja Man');
    assert.ok(!rows.join('').match(/🥇|🥈|🥉/), 'no medal emojis');
  });
  it('NEVER shows the score or vote count — that is the Casting tab\'s job', () => {
    const row = renderRow({ name: 'X', avgScore: 4.5, voteCount: 3, age: 21 }, { n: 0 });
    assert.ok(!row.includes('/5.0'), row);
    assert.ok(!row.includes('vote'), row);
    assert.ok(!row.includes('Unrated'), row);
  });
  it('an unrated player looks exactly like a rated one', () => {
    const rated = renderRow({ name: 'X', avgScore: 5, voteCount: 9, age: 21 }, { n: 0 });
    const unrated = renderRow({ name: 'X', avgScore: 0, voteCount: 0, age: 21 }, { n: 0 });
    assert.equal(rated, unrated);
  });
  it('the old "· 🎉 Accepted" / "· ✅ Accepted (Alt)" word tags are gone — ⚠️ flags replaced them', () => {
    const acc = renderRow({ name: 'Y', age: 30, placementResponse: 'accepted' }, { n: 2 }, { offerFlags: true });
    assert.equal(acc, '3. Y - 30yo', 'accepted is the done state — no marker at all');
    assert.ok(!acc.includes('🎉') && !acc.includes('Accepted'));
    assert.equal(renderRow({ name: 'Z', placementResponse: 'accepted_alternative' }, { n: 0 }, { offerFlags: true }), '1. Z');
  });
  it('declined shows the ⚠️🚫 flag instead of the "· 🚫 Declined" tag', () => {
    assert.equal(renderRow({ name: 'W', placementResponse: 'declined', offerStatus: 'offer' }, { n: 0 }, { offerFlags: true }), '1. W ⚠️🚫');
  });
});

describe('Marooning Draft — demographics inline on the player row', () => {
  it('all three present → same row, pipe-joined, Age(yo)/Pronoun/Timezone order, @-prefixed', () => {
    assert.equal(
      renderRow({ name: 'Reece', avgScore: 5, voteCount: 1, pronoun: 'He/Him', age: 33, timezone: 'GMT+8' }, { n: 0 }),
      '1. Reece - 33yo | @He/Him | @GMT+8'
    );
  });
  it('is ONE line per player — the -# second line is gone', () => {
    const row = renderRow({ name: 'Reece', age: 33, pronoun: 'He/Him', timezone: 'GMT+8' }, { n: 0 });
    assert.ok(!row.includes('\n'), row);
    assert.ok(!row.includes('-#'), row);
  });
  it('partial demographics — only the known bits appear, no dangling pipes', () => {
    assert.equal(renderRow({ name: 'X', avgScore: 0, voteCount: 0, age: 21 }, { n: 0 }), '1. X - 21yo');
    assert.equal(renderRow({ name: 'X', timezone: 'EST' }, { n: 0 }), '1. X - @EST');
  });
  it('no demographics known → just the name, with no trailing dash', () => {
    const row = renderRow({ name: 'X', avgScore: 0, voteCount: 0 }, { n: 0 });
    assert.equal(row, '1. X');
    assert.ok(!row.endsWith('-'), 'a dangling separator would look like missing data');
  });
});

describe('Marooning Draft — rows within a group butt directly together (no blank line — long-roster scroll length)', () => {
  it('consecutive rows join with a single newline, one line each, never a blank line', () => {
    const counter = { n: 0 };
    const rows = [
      { name: 'Q', avgScore: 5, voteCount: 2, age: 21, pronoun: 'He/Him', timezone: 'EST' },
      { name: 'Andrew', avgScore: 5, voteCount: 1, age: 27, pronoun: 'He/Him', timezone: 'CST' }
    ].map(p => renderRow(p, counter));
    // Mirrors renderPlayerList's row-join separator: '\n', not '\n\n'.
    const joined = rows.join('\n');
    assert.equal(
      joined,
      '1. Q - 21yo | @He/Him | @EST\n2. Andrew - 27yo | @He/Him | @CST'
    );
    assert.equal(joined.split('\n').length, 2, 'two players = two lines (was four)');
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

describe('Marooning Draft — offer flags (replaced the Accepted/Offer Sent/Draft sub-headings)', () => {
  it('accepted carries NO flag — only outstanding work is marked', () => {
    assert.equal(offerFlagFor({ placementResponse: 'accepted' }), '');
    assert.equal(offerFlagFor({ placementResponse: 'accepted_alternative' }), '');
  });
  it('no offer sent → the "send them one" flag', () => {
    assert.equal(offerFlagFor({}), FLAG_NO_OFFER);
  });
  it('offer sent, no reply → the "awaiting reply" flag', () => {
    assert.equal(offerFlagFor({ offerStatus: 'offer' }), FLAG_AWAITING);
  });
  it('declined gets its own flag — it is NOT the same as awaiting a reply', () => {
    assert.equal(offerFlagFor({ offerStatus: 'offer', placementResponse: 'declined' }), FLAG_DECLINED);
  });
  it('every flag is distinct, so a row is never ambiguous', () => {
    assert.equal(new Set([FLAG_NO_OFFER, FLAG_AWAITING, FLAG_DECLINED]).size, 3);
  });
  it('flags render on the row, after the demographics', () => {
    assert.equal(
      renderRow({ name: 'ReeceBot', age: 27, pronoun: 'Ask', timezone: 'CST / CDT' }, { n: 1 }, { offerFlags: true }),
      '2. ReeceBot - 27yo | @Ask | @CST / CDT ⚠️✒️'
    );
  });
  it("sections without offerFlags (Undecided, Don't Cast, Withdrawn) show no flags at all", () => {
    // You can't chase an offer you haven't decided to make — flagging every Undecided row is pure noise.
    assert.equal(renderRow({ name: 'U' }, { n: 0 }), '1. U');
    assert.equal(renderRow({ name: 'U' }, { n: 0 }, { offerFlags: false }), '1. U');
  });
  it('an accepted player renders identically with or without flags enabled', () => {
    const p = { name: 'A', placementResponse: 'accepted', offerStatus: 'offer' };
    assert.equal(renderRow(p, { n: 0 }, { offerFlags: true }), renderRow(p, { n: 0 }));
  });
});

describe('Marooning Draft — stage ordering within a tribe', () => {
  it('ranks accepted → awaiting reply → no offer yet', () => {
    assert.equal(offerStageRank({ placementResponse: 'accepted' }), 0);
    assert.equal(offerStageRank({ offerStatus: 'offer' }), 1);
    assert.equal(offerStageRank({}), 2);
  });
  it('a declined player ranks with "offer sent" — an offer WAS made', () => {
    assert.equal(offerStageRank({ offerStatus: 'offer', placementResponse: 'declined' }), 1);
  });
  it('sinks the rows still needing action to the bottom of their tribe', () => {
    const players = [{ name: 'NoOffer' }, { name: 'Sent', offerStatus: 'offer' }, { name: 'Acc', placementResponse: 'accepted' }];
    const sorted = [...players].sort((a, b) => offerStageRank(a) - offerStageRank(b));
    assert.deepEqual(sorted.map(p => p.name), ['Acc', 'Sent', 'NoOffer']);
  });
  it('is stable — score order survives inside a stage', () => {
    const players = [{ name: 'HighScore' }, { name: 'LowScore' }];
    const sorted = [...players].sort((a, b) => offerStageRank(a) - offerStageRank(b));
    assert.deepEqual(sorted.map(p => p.name), ['HighScore', 'LowScore']);
  });
});

describe('Marooning Draft — tribe header shows size, not "(tentative)"', () => {
  it('pluralises the player count', () => {
    assert.equal(tribeHeader('r1', 4), '> <@&r1> (4 players)');
    assert.equal(tribeHeader('r1', 1), '> <@&r1> (1 player)');
  });
  it('drops "(tentative)" — the Tribes blurb already says drafts are private', () => {
    assert.ok(!tribeHeader('r1', 2).includes('tentative'));
  });
  it('is a quote line, giving each tribe a left rule separating it from its rows', () => {
    assert.ok(tribeHeader('r1', 2).startsWith('> '));
  });
});

describe('Marooning Draft — the ⚠️ Key block', () => {
  it('lists only the flags actually present', () => {
    const key = keyBlock(new Set([FLAG_NO_OFFER]));
    assert.ok(key.includes(FLAG_NO_OFFER));
    assert.ok(!key.includes(FLAG_AWAITING));
    assert.ok(!key.includes(FLAG_DECLINED));
  });
  it('renders nothing when no row is flagged', () => {
    assert.equal(keyBlock(new Set()), '');
  });
  it('tells you HOW to fix the most common flag', () => {
    assert.match(keyBlock(new Set([FLAG_NO_OFFER])), /Bulk Offers|Send Offer/);
  });
  it('keeps every line in one quote block', () => {
    const key = keyBlock(new Set([FLAG_NO_OFFER, FLAG_AWAITING, FLAG_DECLINED]));
    assert.ok(key.split('\n').every(l => l.startsWith('> ')), key);
  });
});

describe('Marooning Draft — duplicate applications', () => {
  const app = (userId, channelId) => ({ userId, channelId });

  it('flags a user with more than one application channel this season', () => {
    const dupes = findDuplicateApplicants([app('u1', 'c1'), app('u1', 'c2'), app('u2', 'c3')]);
    assert.equal(dupes.length, 1);
    assert.equal(dupes[0][0], 'u1');
    assert.deepEqual(dupes[0][1].map(a => a.channelId), ['c1', 'c2']);
  });
  it('says nothing when everyone has exactly one', () => {
    assert.deepEqual(findDuplicateApplicants([app('u1', 'c1'), app('u2', 'c2')]), []);
  });
  it('handles an empty season', () => {
    assert.deepEqual(findDuplicateApplicants([]), []);
  });
  it('catches three-way duplicates (the real TEST case: ReeceBot had 3)', () => {
    const dupes = findDuplicateApplicants([app('u1', 'c1'), app('u1', 'c2'), app('u1', 'c3')]);
    assert.equal(dupes[0][1].length, 3);
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

  it('Existing Tribe (tribe_existing_modal|) shares the routing contract — origin in the same slot', () => {
    // Different prefix, same |castlistId|origin shape: the submit's origin parse (split('|')[2])
    // must land on Marooning exactly like tribe_add_modal's. See tests/existingTribe.test.js for
    // the modal itself.
    const id = 'tribe_existing_modal|default|marooning_config_1783203296677_391415444084490240';
    assert.deepEqual(routeTribeAddSubmit(id), { target: 'marooning', configId: 'config_1783203296677_391415444084490240' });
    assert.ok(id.length < 100, `len ${id.length}`);
  });
});

// ── Planner eligibility — the REAL getMarooningTribeRoleIds (Reece 2026-08-16) ──
// Default castlist OR tribePlanner flag; archive/promo/legacy tribes are hidden. This replaced
// the 2026-07-25 show-every-known-tribe rule that surfaced years of old seasons on prod guilds.
describe('Marooning — planner tribe eligibility (default castlist OR tribePlanner flag)', () => {
  const load = async () => (await import('../castRankingManager.js')).getMarooningTribeRoleIds;
  const G = 'g1';
  const pd = (tribes) => ({ [G]: { tribes } });

  it('admits the default castlist in ALL three storage formats', async () => {
    const fn = await load();
    assert.deepEqual(fn(pd({
      r1: { castlistIds: ['default'] },          // v3
      r2: { castlistId: 'default' },             // mid-era
      r3: { castlist: 'default' },               // legacy string
      r4: { castlistIds: ['default', 'other'] }  // default among others still counts
    }), G), ['r1', 'r2', 'r3', 'r4']);
  });

  it('admits a tribePlanner-flagged tribe with NO castlist association (New Tribe / Existing Tribe)', async () => {
    const fn = await load();
    assert.deepEqual(fn(pd({ r1: { castlistIds: [], tribePlanner: true } }), G), ['r1']);
  });

  it('HIDES archive/custom-castlist tribes and unflagged legacy tribes — the prod complaint', async () => {
    const fn = await load();
    // Mirrors guild 974318870057848842: 8 archive-season tribes + 1 default tribe rendered.
    assert.deepEqual(fn(pd({
      winner: { castlistIds: ['castlist_1762009143029_system'], castlist: 'Winners' },
      s12:    { castlist: 'S12 - Jurassic Park' },                    // legacy string, non-default
      s1:     { castlistIds: ['castlist_1763247652320_custom'] },
      pre:    { castlistIds: ['castlist_archive_1774199671187'] },
      legacy: {},                                                     // debug-flow tribe, no association, no flag
      fun:    { castlistIds: ['default'], castlist: 'default' }
    }), G), ['fun']);
  });

  it('the flag re-admits a tribe that lives ONLY on an archive castlist (the Existing Tribe escape hatch)', async () => {
    const fn = await load();
    assert.deepEqual(fn(pd({ old: { castlistIds: ['castlist_archive_1'], tribePlanner: true } }), G), ['old']);
  });

  it('still skips null entries and (with a guild) deleted roles', async () => {
    const fn = await load();
    const tribes = { dead: null, live: { tribePlanner: true }, gone: { tribePlanner: true } };
    assert.deepEqual(fn(pd(tribes), G), ['live', 'gone'], 'no guild → no role filtering');
    const guild = { roles: { cache: new Map([['live', {}]]) } };
    assert.deepEqual(fn(pd(tribes), G, guild), ['live']);
  });

  it('truthy-but-not-true flag values do not qualify — the flag is an explicit stamp', async () => {
    const fn = await load();
    assert.deepEqual(fn(pd({ r1: { tribePlanner: 'yes' }, r2: { tribePlanner: 1 } }), G), []);
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
    const userDraftTribes = buildUserDraftTribes({ roleDead: ['u1'], roleLive: ['u2'] });
    const live = filterDeletedRoles(['roleDead', 'roleLive'], mockGuild(['roleLive']));
    const players = [{ userId: 'u1', name: 'A' }, { userId: 'u2', name: 'B' }];
    const { perTribe, undrafted } = groupByTribe(players, userDraftTribes, live);
    assert.deepEqual([...perTribe.keys()], ['roleLive']);
    assert.deepEqual(undrafted.map(p => p.name), ['A']);
  });
  it('Draft Tribes gate: 1 live tribe now MEETS the ≥1 minimum (was ≥2 — button enabled, not disabled)', () => {
    const live = filterDeletedRoles(['roleA', 'roleDead'], mockGuild(['roleA']));
    assert.equal(live.length, 1);
    assert.ok(live.length >= 1); // canDraft = true
  });
});

describe('getMarooningTribeRoleIds — simplified from castlist-membership to direct existence check', () => {
  const mockGuild = roleIds => ({ roles: { cache: new Map(roleIds.map(id => [id, {}])) } });

  it('returns every tribe key CastBot knows about — no castlist-membership check at all', () => {
    const playerData = { g1: { tribes: { roleA: { castlist: 'default' }, roleB: { castlistIds: ['other_castlist'] } } } };
    // roleB is on a DIFFERENT castlist entirely, yet still counts — this is the whole point of the change.
    const guild = mockGuild(['roleA', 'roleB']);
    assert.deepEqual(getMarooningTribeRoleIds(playerData, 'g1', guild).sort(), ['roleA', 'roleB']);
  });

  it('a tribe with NO castlistIds/castlistId/castlist field at all still counts (the legacy-debug-flow gap)', () => {
    const playerData = { g1: { tribes: { roleA: { emoji: '🔥', analyticsName: 'Legacy Tribe' } } } };
    const guild = mockGuild(['roleA']);
    assert.deepEqual(getMarooningTribeRoleIds(playerData, 'g1', guild), ['roleA']);
  });

  it('null/undefined tribe entries are skipped even when the Discord role still exists (adapter parity)', () => {
    // Prod data really contains tribes[roleId] = null — the virtual adapter guards `if (!tribe) continue`
    // in three places. A nulled-out tribe must not resurrect as a ghost (canDraft, Tribes line, modal).
    const playerData = { g1: { tribes: { roleNulled: null, roleLive: { emoji: '🔥' } } } };
    const guild = mockGuild(['roleNulled', 'roleLive']);
    assert.deepEqual(getMarooningTribeRoleIds(playerData, 'g1', guild), ['roleLive']);
    // ...and a guild that ONLY has nulled tribes reads as zero → Draft Tribes disabled.
    const onlyNulls = { g1: { tribes: { roleNulled: null } } };
    assert.deepEqual(getMarooningTribeRoleIds(onlyNulls, 'g1', mockGuild(['roleNulled'])), []);
  });

  it('filters out deleted-role tribes, same as before', () => {
    const playerData = { g1: { tribes: { roleA: {}, roleDead: {} } } };
    const guild = mockGuild(['roleA']);
    assert.deepEqual(getMarooningTribeRoleIds(playerData, 'g1', guild), ['roleA']);
  });

  it('no guild → no deleted-role filtering (fail open, same convention as filterDeletedRoles)', () => {
    const playerData = { g1: { tribes: { roleA: {}, roleB: {} } } };
    assert.deepEqual(getMarooningTribeRoleIds(playerData, 'g1', null).sort(), ['roleA', 'roleB']);
  });

  it('no tribes configured at all → empty array, not a throw', () => {
    assert.deepEqual(getMarooningTribeRoleIds({ g1: {} }, 'g1', mockGuild([])), []);
    assert.deepEqual(getMarooningTribeRoleIds({}, 'g1', mockGuild([])), []);
  });

  it('canDraft threshold: 0 tribes → disabled, 1 tribe → enabled (was ≥2)', () => {
    const zero = getMarooningTribeRoleIds({ g1: { tribes: {} } }, 'g1', mockGuild([]));
    const one = getMarooningTribeRoleIds({ g1: { tribes: { roleA: {} } } }, 'g1', mockGuild(['roleA']));
    assert.equal(zero.length >= 1, false);
    assert.equal(one.length >= 1, true);
  });
});

describe('Marooning — 🗑️ Show/Hide Rejects toggle', () => {
  it('parses show_rejects and hide_rejects custom_ids, incl. underscore-laden configId', () => {
    assert.deepEqual(
      parseRejectsToggleCustomId('marooning_show_rejects_config_1781015852414_454453967309504512'),
      { showRejects: true, configId: 'config_1781015852414_454453967309504512' }
    );
    assert.deepEqual(
      parseRejectsToggleCustomId('marooning_hide_rejects_config_1781015852414_454453967309504512'),
      { showRejects: false, configId: 'config_1781015852414_454453967309504512' }
    );
  });

  it('default (collapsed) state → static "Rejects" label, pointing at the show_rejects custom_id', () => {
    const btn = rejectsToggleButton(false, true, 'cfg1');
    assert.equal(btn.label, 'Rejects');
    assert.equal(btn.custom_id, 'marooning_show_rejects_cfg1');
    assert.equal(btn.disabled, false);
  });

  it('expanded state → SAME "Rejects" label (not "Hide Rejects"), pointing at the hide_rejects custom_id', () => {
    const btn = rejectsToggleButton(true, true, 'cfg1');
    assert.equal(btn.label, 'Rejects');
    assert.equal(btn.custom_id, 'marooning_hide_rejects_cfg1');
  });

  it('disabled (no dead-end click) when there is nothing to reveal', () => {
    assert.equal(rejectsToggleButton(false, false, 'cfg1').disabled, true);
    assert.equal(rejectsToggleButton(true, false, 'cfg1').disabled, true);
  });

  it('collapsed + hidden applicants present → hint line with the combined count, naming the actual button label', () => {
    assert.equal(
      hiddenRejectsHint(false, 3, 2),
      '-# 🗑️ 5 Don\'t Cast/Withdrawn applicants hidden — click Rejects below to view.'
    );
  });

  it('singular applicant → "applicant" not "applicants"', () => {
    assert.equal(
      hiddenRejectsHint(false, 1, 0),
      '-# 🗑️ 1 Don\'t Cast/Withdrawn applicant hidden — click Rejects below to view.'
    );
  });

  it('expanded → no hint line regardless of counts', () => {
    assert.equal(hiddenRejectsHint(true, 3, 2), null);
  });

  it('collapsed but nothing hidden → no hint line (avoids a pointless "0 hidden" message)', () => {
    assert.equal(hiddenRejectsHint(false, 0, 0), null);
  });
});
