/**
 * Season Planner — configurable challenge days + linked bonus/reward challenge.
 *
 * Imports the REAL seasonPlanner.js (heavy, but these helpers are pure and the destructive
 * ones — the regeneration sweep — deserve genuine coverage rather than a replicated copy
 * that can silently drift from the source).
 *
 * The day arithmetic itself lives in tests/seasonRoundSchedule.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getBonusChallengeOptions, buildChallengeEditModal, applyChallengeEdit,
  extractModalFields, generateAndStoreRounds, generateSeasonRounds,
  buildPlannerView, resolveHostNames,
} from '../seasonPlanner.js';
import {
  expandRoundDays, getRoundDuration, getRoundPhases, buildRoundSchedule, formatRoundDate,
} from '../seasonRoundSchedule.js';

const label = (c) => ({ component: c });

describe('extractModalFields — selects report values[], not value', () => {
  it('reads a Label-wrapped string select', () => {
    const f = extractModalFields([label({ custom_id: 'bonus_challenge', values: ['challenge_abc'] })]);
    assert.equal(f.bonus_challenge, 'challenge_abc');
  });

  it('reads a Label-wrapped user select', () => {
    const f = extractModalFields([label({ custom_id: 'prepping_host', values: ['391415444084490240'] })]);
    assert.equal(f.prepping_host, '391415444084490240');
  });

  it('still reads text inputs and radios via value', () => {
    const f = extractModalFields([
      label({ custom_id: 'challenge_name', value: 'Tycoons of the Nile' }),
      label({ custom_id: 'challenge_days', value: '3' }),
    ]);
    assert.equal(f.challenge_name, 'Tycoons of the Nile');
    assert.equal(f.challenge_days, '3');
  });

  it('an empty select (cleared) reads as undefined, not a crash', () => {
    assert.equal(extractModalFields([label({ custom_id: 'bonus_challenge', values: [] })]).bonus_challenge, undefined);
  });

  it('preserves an empty string from a cleared text input', () => {
    assert.equal(extractModalFields([label({ custom_id: 'challenge_name', value: '' })]).challenge_name, '');
  });
});

describe('getBonusChallengeOptions — which challenges can be a bonus', () => {
  const challenges = {
    c_primary1: { title: 'Immunity 1', lastUpdated: 5 },
    c_primary2: { title: 'Immunity 2', lastUpdated: 4 },
    c_spare1: { title: 'Loved Ones Reward', lastUpdated: 9 },
    c_spare2: { title: 'Food Auction', lastUpdated: 8 },
  };
  const seasonRounds = {
    s1: {
      r1: { seasonRoundNo: 1, challengeIDs: { primary: 'c_primary1' } },
      r2: { seasonRoundNo: 2, challengeIDs: { primary: 'c_primary2' } },
    },
  };

  it('excludes challenges already used as a round primary', () => {
    const { options } = getBonusChallengeOptions(challenges, seasonRounds, null);
    const values = options.map(o => o.value);
    assert.deepEqual(values, ['none', 'c_spare1', 'c_spare2']);
  });

  it('always offers a None row, defaulted when nothing is linked', () => {
    const { options } = getBonusChallengeOptions(challenges, seasonRounds, null);
    assert.equal(options[0].value, 'none');
    assert.equal(options[0].default, true);
  });

  it('marks the currently-linked bonus as default and drops None default', () => {
    const { options } = getBonusChallengeOptions(challenges, seasonRounds, 'c_spare2');
    assert.equal(options.find(o => o.value === 'none').default, undefined);
    assert.equal(options.find(o => o.value === 'c_spare2').default, true);
  });

  it('includes the current bonus even if it is ALSO a round primary', () => {
    // Otherwise re-opening the modal would silently clear a link the host had made.
    const { options } = getBonusChallengeOptions(challenges, seasonRounds, 'c_primary1');
    assert.ok(options.some(o => o.value === 'c_primary1'));
  });

  it('sorts by most recently updated', () => {
    const { options } = getBonusChallengeOptions(challenges, seasonRounds, null);
    assert.deepEqual(options.slice(1).map(o => o.value), ['c_spare1', 'c_spare2']);
  });

  it('ordering survives the 24-cap so recent challenges stay reachable', () => {
    // A modal select can't paginate or search, so the cap makes ordering load-bearing:
    // the 24 most recently touched challenges must be the ones that survive.
    const many = {};
    for (let i = 0; i < 40; i++) many[`c_${i}`] = { title: `Spare ${i}`, lastUpdated: i };
    const { options } = getBonusChallengeOptions(many, {}, null);
    const kept = options.slice(1).map(o => o.value);
    assert.equal(kept[0], 'c_39', 'newest must be first');
    assert.equal(kept.at(-1), 'c_16', 'the 24 newest must be the survivors');
    assert.equal(kept.includes('c_0'), false, 'the stalest must be dropped, not the freshest');
  });

  it('challenges with no lastUpdated sort last instead of throwing', () => {
    const mixed = {
      c_undated: { title: 'Hand-edited' },
      c_recent: { title: 'Recent', lastUpdated: 100 },
    };
    const { options } = getBonusChallengeOptions(mixed, {}, null);
    assert.deepEqual(options.slice(1).map(o => o.value), ['c_recent', 'c_undated']);
  });

  it('stays within Discord\'s 25-option cap and reports what it dropped', () => {
    const many = {};
    for (let i = 0; i < 60; i++) many[`c_${i}`] = { title: `Spare ${i}`, lastUpdated: i };
    const { options, truncated } = getBonusChallengeOptions(many, {}, null);
    assert.equal(options.length, 25); // 24 + None
    assert.equal(truncated, 36);
  });

  it('handles an empty guild', () => {
    const { options, truncated } = getBonusChallengeOptions({}, {}, null);
    assert.deepEqual(options.map(o => o.value), ['none']);
    assert.equal(truncated, 0);
  });
});

describe('buildChallengeEditModal — 5 components, no more', () => {
  const round = { fNumber: 16, seasonRoundNo: 3, challengeDays: 3, bonusChallengeId: 'c_spare', bonusOrder: 'last', challengeIDs: { primary: 'c_main' } };
  const challenges = { c_main: { title: 'Tycoons', creationHost: '123' }, c_spare: { title: 'Reward', lastUpdated: 1 } };

  it('is exactly at Discord\'s modal component cap', () => {
    const modal = buildChallengeEditModal(round, challenges.c_main, challenges, {}, 'r3', 'config_1_2');
    assert.equal(modal.components.length, 5);
    assert.ok(modal.components.every(c => c.type === 18), 'every field must be Label-wrapped');
  });

  it('pre-selects the round\'s current duration, bonus and placement', () => {
    const modal = buildChallengeEditModal(round, challenges.c_main, challenges, {}, 'r3', 'config_1_2');
    const def = (id) => modal.components.find(c => c.component.custom_id === id).component.options.find(o => o.default)?.value;
    assert.equal(def('challenge_days'), '3');
    assert.equal(def('bonus_challenge'), 'c_spare');
    assert.equal(def('bonus_order'), 'last');
  });

  it('defaults a bare round to 1 day / no bonus / first', () => {
    const modal = buildChallengeEditModal({ fNumber: 9 }, null, {}, {}, 'r9', 'config_1_2');
    const def = (id) => modal.components.find(c => c.component.custom_id === id).component.options.find(o => o.default)?.value;
    assert.equal(def('challenge_days'), '1');
    assert.equal(def('bonus_challenge'), 'none');
    assert.equal(def('bonus_order'), 'first');
  });

  it('routes back to the round it was opened from', () => {
    const modal = buildChallengeEditModal(round, null, {}, {}, 'r3', 'config_123_456');
    assert.equal(modal.custom_id, 'planner_challenge_edit:r3:config_123_456');
  });

  it('clamps an out-of-range stored duration into the select', () => {
    const modal = buildChallengeEditModal({ fNumber: 9, challengeDays: 99 }, null, {}, {}, 'r9', 'c');
    const days = modal.components.find(c => c.component.custom_id === 'challenge_days').component;
    assert.equal(days.options.find(o => o.default).value, '6');
  });
});

describe('applyChallengeEdit — modal submission → round + challenge', () => {
  const fields = { challenge_name: 'Renamed', challenge_days: '4', bonus_challenge: 'c_spare', bonus_order: 'last' };
  const raw = [label({ custom_id: 'prepping_host', values: ['999'] })];

  it('writes all three round fields plus the challenge title and host', () => {
    const round = {}, challenge = { title: 'old' };
    applyChallengeEdit(round, challenge, fields, raw);
    assert.equal(round.challengeDays, 4);
    assert.equal(round.bonusChallengeId, 'c_spare');
    assert.equal(round.bonusOrder, 'last');
    assert.equal(challenge.title, 'Renamed');
    assert.equal(challenge.creationHost, '999');
    assert.ok(challenge.lastUpdated > 0);
  });

  it('clears the bonus when the select is emptied or set to none', () => {
    for (const bonus_challenge of ['none', '', undefined]) {
      const round = { bonusChallengeId: 'c_old' };
      applyChallengeEdit(round, null, { challenge_days: '1', bonus_challenge }, []);
      assert.equal('bonusChallengeId' in round, false, `bonus survived "${bonus_challenge}"`);
    }
  });

  it('clears the prepping host when the user select is emptied', () => {
    const challenge = { title: 't', creationHost: '123' };
    applyChallengeEdit({}, challenge, { challenge_days: '1' }, [label({ custom_id: 'prepping_host', values: [] })]);
    assert.equal(challenge.creationHost, null);
  });

  it('clamps duration to the 0-6 select range and ignores junk', () => {
    const round = {};
    applyChallengeEdit(round, null, { challenge_days: '99' }, []);
    assert.equal(round.challengeDays, 6);
    applyChallengeEdit(round, null, { challenge_days: 'abc' }, []);
    assert.equal(round.challengeDays, 6, 'junk must not overwrite a good value');
  });

  it('ignores an unrecognised bonus placement', () => {
    const round = { bonusOrder: 'last' };
    applyChallengeEdit(round, null, { challenge_days: '1', bonus_order: 'sideways' }, []);
    assert.equal(round.bonusOrder, 'last');
  });

  it('tolerates a round with no linked challenge object', () => {
    const round = {};
    assert.doesNotThrow(() => applyChallengeEdit(round, null, fields, raw));
    assert.equal(round.challengeDays, 4);
  });

  it('does not blank a challenge title when the name field is empty', () => {
    const challenge = { title: 'Keep Me' };
    applyChallengeEdit({}, challenge, { challenge_name: '', challenge_days: '1' }, []);
    assert.equal(challenge.title, 'Keep Me');
  });
});

describe('Challenge Duration "0 days" — sugar over tribalDays, never stored as 0', () => {
  const pick = (round, days) => { applyChallengeEdit(round, null, { challenge_days: String(days) }, []); return round; };
  const shown = (round) => buildChallengeEditModal(round, null, {}, {}, 'r1', 'c')
    .components.find(c => c.component.custom_id === 'challenge_days')
    .component.options.find(o => o.default)?.value;

  it('INVARIANT: challengeDays is never persisted as 0, whatever is picked', () => {
    // The entire design rests on this — it is why seasonRoundSchedule.js needed no changes.
    for (const days of [0, 1, 2, 3, 4, 5, 6, 99]) {
      const round = pick({}, days);
      assert.notEqual(round.challengeDays, 0, `picking ${days} stored a 0`);
      assert.ok(round.challengeDays >= 1);
    }
  });

  it('picking 0 makes the tribal live and leaves a 1-day block', () => {
    const round = pick({}, 0);
    assert.equal(round.challengeDays, 1);
    assert.equal(round.tribalDays, 0);
  });

  it('picking 1 while collapsed separates the tribal again', () => {
    // Otherwise the pick would visibly do nothing.
    const round = pick({ challengeDays: 1, tribalDays: 0 }, 1);
    assert.equal(round.challengeDays, 1);
    assert.equal(round.tribalDays, 1);
  });

  it('picking a longer duration while collapsed also separates the tribal', () => {
    const round = pick({ challengeDays: 1, tribalDays: 0 }, 3);
    assert.equal(round.challengeDays, 3);
    assert.equal(round.tribalDays, 1);
  });

  it('a live tribal on a MULTI-day block survives a duration change', () => {
    // challengeDays 3 + tribalDays 0 is a real 3-day block, not the collapsed state, so
    // bumping it to 4 must not silently un-live the host's tribal.
    const round = pick({ challengeDays: 3, tribalDays: 0 }, 4);
    assert.equal(round.challengeDays, 4);
    assert.equal(round.tribalDays, 0, 'live tribal was clobbered');
  });

  it('a normal duration change never touches tribalDays', () => {
    const round = pick({ challengeDays: 2, tribalDays: 2 }, 5);
    assert.equal(round.tribalDays, 2);
  });

  it('the modal shows 0 only for a collapsed ONE-day block', () => {
    assert.equal(shown({ challengeDays: 1, tribalDays: 0 }), '0');
    assert.equal(shown({ challengeDays: 3, tribalDays: 0 }), '3', 'a 3-day block must not flatten to 0');
    assert.equal(shown({ challengeDays: 1, tribalDays: 1 }), '1');
    assert.equal(shown({}), '1', 'a bare round defaults to 1 day');
  });

  it('round-trips: what the modal shows is what re-picking preserves', () => {
    for (const round of [{ challengeDays: 1, tribalDays: 0 }, { challengeDays: 3, tribalDays: 0 }, { challengeDays: 2, tribalDays: 1 }, {}]) {
      const before = shown(round);
      const after = shown(pick({ ...round }, Number(before)));
      assert.equal(after, before, `re-picking ${before} changed the displayed value`);
    }
  });

  it('offers 0-6 and no longer offers 7', () => {
    const opts = buildChallengeEditModal({}, null, {}, {}, 'r1', 'c')
      .components.find(c => c.component.custom_id === 'challenge_days').component;
    assert.equal(opts.type, 3, 'duration must be a string select');
    assert.deepEqual(opts.options.map(o => o.value), ['0', '1', '2', '3', '4', '5', '6']);
    assert.ok(opts.options.every(o => o.description), 'every option needs its explanatory description');
  });
});

describe('Challenge Duration 0 — the worked cases render as described', () => {
  // Reece's three scenarios, asserted day-by-day through the real schedule model.
  // An omitted bonus_challenge means "cleared", so a round keeping its bonus must re-submit it.
  const apply0 = (round, extra = {}) => { applyChallengeEdit(round, null, { challenge_days: '0', ...extra }, []); return round; };
  const keys = (round) => expandRoundDays(round).map(d => d.phases.map(p => p.key));

  it('marooning 0d + challenge 0d → marooning, challenge and tribal all on one day', () => {
    const round = apply0({ fNumber: 18, hasMarooning: true, marooningDays: 0 });
    assert.equal(getRoundDuration(round), 1);
    assert.deepEqual(keys(round), [['event', 'challenge', 'tribal']]);
  });

  it('marooning 1d + challenge 0d → challenge lands on the tribal day', () => {
    const round = apply0({ fNumber: 18, hasMarooning: true, marooningDays: 1 });
    assert.equal(getRoundDuration(round), 2);
    assert.deepEqual(keys(round), [['event'], ['challenge', 'tribal']]);
  });

  it('marooning 0d + challenge 0d + tribal 0d → one day, the season start date', () => {
    const round = apply0({ fNumber: 18, hasMarooning: true, marooningDays: 0, tribalDays: 0 });
    assert.equal(getRoundDuration(round), 1);
    const schedule = buildRoundSchedule({ r1: { ...round, seasonRoundNo: 1 } }, new Date(2026, 2, 7));
    assert.equal(formatRoundDate(schedule.byId.r1.phases[0].date), 'Sat 7 Mar');
    assert.equal(schedule.totalDays, 1);
  });

  it('standard round + challenge 0d → a single day holding challenge and tribal', () => {
    const round = apply0({ fNumber: 15, marooningDays: 0 });
    assert.equal(getRoundDuration(round), 1);
    assert.deepEqual(keys(round), [['challenge', 'tribal']]);
  });

  it('a bonus on a 0-day challenge collapses onto the same day', () => {
    const round = apply0({ fNumber: 15, marooningDays: 0 }, { bonus_challenge: 'c_reward' });
    assert.equal(getRoundDuration(round), 1);
    assert.deepEqual(keys(round), [['bonus', 'challenge', 'tribal']]);
  });

  it('never produces an empty day or a negative offset', () => {
    // The failure mode a literal challengeDays:0 would have introduced.
    for (const base of [{ marooningDays: 0 }, { marooningDays: 2, hasMarooning: true }, { swapRound: true, eventDays: 1, marooningDays: 0 }]) {
      for (const tribalDays of [0, 1, 2]) {
        const round = apply0({ fNumber: 15, ...base, tribalDays });
        assert.ok(getRoundPhases(round).every(p => p.offset >= 0), `negative offset: ${JSON.stringify(round)}`);
        assert.ok(expandRoundDays(round).every(d => d.phases.length >= 1), `empty day: ${JSON.stringify(round)}`);
      }
    }
  });
});

describe('Round select rows — host, bonus behaviour and Go-to ordering', () => {
  const HOST = '1536007399112974367';
  const START = new Date(2026, 8, 9);
  const CFG = { estimatedTotalPlayers: 6, estimatedSwaps: 0, estimatedFTCPlayers: 3, estimatedStartDate: START.getTime() };
  const guild = { members: { cache: new Map([[HOST, { displayName: 'radicaldinosaur' }]]) } };

  /** A 2-round season whose round 2 carries a linked reward. */
  function season(bonusOrder = 'same') {
    const rounds = {
      r1: { seasonRoundNo: 1, fNumber: 6, marooningDays: 0, challengeIDs: { primary: 'c_main' }, challengeDays: 2, bonusChallengeId: 'c_rwd', bonusOrder },
      r2: { seasonRoundNo: 2, fNumber: 5, marooningDays: 0, challengeIDs: { primary: 'c_plain' } },
    };
    const challenges = {
      c_main: { title: 'Spam Musabi', creationHost: HOST },
      c_plain: { title: 'Plain One', creationHost: HOST },
      c_rwd: { title: 'CrossWorlds Luau', creationHost: HOST },
    };
    return { rounds, challenges };
  }

  const optionsFor = ({ rounds, challenges }, roundIdx, g = guild) =>
    buildPlannerView('S', rounds, START, 'config_1_2', 0, '', challenges, CFG, 'u1', g)
      .components[0].components.filter(c => c.type === 1 && c.components?.[0]?.type === 3)[roundIdx]
      .components[0].options;

  it('resolves the host from the CHALLENGE, not the never-written round.host', () => {
    // The prod bug: every description read "TBC" because round.host is a legacy field.
    const opts = optionsFor(season(), 0);
    const edit = opts.find(o => o.value === 'edit_challenge' && o.emoji.name === '🤸');
    assert.match(edit.description, /radicaldinosaur/);
    assert.equal(edit.description.includes('TBC'), false);
  });

  it('falls back to TBC when the host cannot be resolved from the member cache', () => {
    const edit = optionsFor(season(), 0, null).find(o => o.value === 'edit_challenge' && o.emoji.name === '🤸');
    assert.match(edit.description, /TBC/);
  });

  it('an unknown host id does not leak a raw snowflake into the description', () => {
    const s = season();
    s.challenges.c_main.creationHost = '999999999999999999';
    const edit = optionsFor(s, 0).find(o => o.value === 'edit_challenge' && o.emoji.name === '🤸');
    assert.equal(edit.description.includes('999999999999999999'), false);
  });

  it('the bonus row opens the same Edit Challenge modal as the main row', () => {
    const bonus = optionsFor(season(), 0).find(o => o.emoji.name === '🎁' && !o.label.startsWith('Go to'));
    assert.equal(bonus.value, 'edit_challenge');
    assert.equal(bonus.label, 'CrossWorlds Luau');
  });

  it('the main challenge description no longer names the bonus', () => {
    const edit = optionsFor(season(), 0).find(o => o.value === 'edit_challenge' && o.emoji.name === '🤸');
    assert.equal(edit.description.includes('CrossWorlds'), false);
  });

  it('adds a Go to row for the reward alongside the main one', () => {
    const gotos = optionsFor(season(), 0).filter(o => String(o.value).startsWith('go_challenge_'));
    assert.deepEqual(gotos.map(o => o.label), ['Go to CrossWorlds Luau', 'Go to Spam Musabi']);
  });

  it('Go to rows follow the same chronological order as the edit rows', () => {
    for (const [order, expected] of [
      ['first', ['Go to CrossWorlds Luau', 'Go to Spam Musabi']],
      ['same', ['Go to CrossWorlds Luau', 'Go to Spam Musabi']],
      ['last', ['Go to Spam Musabi', 'Go to CrossWorlds Luau']],
    ]) {
      const opts = optionsFor(season(order), 0);
      assert.deepEqual(opts.filter(o => String(o.value).startsWith('go_challenge_')).map(o => o.label), expected, order);
      // …and the edit-row pair must agree with it.
      const editRows = opts.filter(o => o.value === 'edit_challenge').map(o => o.emoji.name);
      assert.deepEqual(editRows, order === 'last' ? ['🤸', '🎁'] : ['🎁', '🤸'], order);
    }
  });

  it('a round with no bonus has exactly one Go to row and a plain description', () => {
    const opts = optionsFor(season(), 1);
    assert.deepEqual(opts.filter(o => String(o.value).startsWith('go_challenge_')).map(o => o.label), ['Go to Plain One']);
    assert.equal(opts.filter(o => o.value === 'edit_challenge').length, 1);
  });

  it('a dangling bonus link stays visible but offers no Go to row', () => {
    const s = season();
    delete s.challenges.c_rwd;
    const opts = optionsFor(s, 0);
    assert.ok(opts.some(o => o.emoji.name === '⚠️'), 'missing bonus must still surface');
    assert.deepEqual(opts.filter(o => String(o.value).startsWith('go_challenge_')).map(o => o.label), ['Go to Spam Musabi']);
  });

  it('stays within Discord\'s 25-option select cap with a bonus linked', () => {
    assert.ok(optionsFor(season(), 0).length <= 25);
  });
});

describe('generateAndStoreRounds — the bonus link must survive regeneration', () => {
  const GUILD = 'g1', SEASON = 's1';
  const estimates = (players) => ({ estimatedTotalPlayers: players, estimatedSwaps: 1, estimatedFTCPlayers: 3 });

  /** A guild whose season already has rounds, one of which links a host-made reward challenge. */
  async function seeded() {
    const playerData = { [GUILD]: { seasonRounds: {}, challenges: {} } };
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(12), 'u1');
    const g = playerData[GUILD];
    // A reward challenge the host made in the Challenges menu and linked to round 2.
    g.challenges.c_reward = { title: 'Loved Ones Reward', seasonId: SEASON, lastUpdated: 1 };
    g.seasonRounds[SEASON].r2.bonusChallengeId = 'c_reward';
    g.seasonRounds[SEASON].r2.bonusOrder = 'last';
    g.seasonRounds[SEASON].r2.challengeDays = 3;
    return playerData;
  }

  it('does NOT delete the reward challenge when the cast size changes', async () => {
    // The sweep removes season-owned challenges not linked to any new round. A bonus is not
    // any round's `primary`, so without explicit protection it would be deleted outright.
    const playerData = await seeded();
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(18), 'u1');
    assert.ok(playerData[GUILD].challenges.c_reward, 'the host\'s reward challenge was deleted');
  });

  it('carries the bonus link + placement + duration onto the same round number', async () => {
    const playerData = await seeded();
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(18), 'u1');
    const r2 = playerData[GUILD].seasonRounds[SEASON].r2;
    assert.equal(r2.bonusChallengeId, 'c_reward');
    assert.equal(r2.bonusOrder, 'last');
    assert.equal(r2.challengeDays, 3);
  });

  it('leaves rounds that never had a bonus untouched', async () => {
    const playerData = await seeded();
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(18), 'u1');
    const r3 = playerData[GUILD].seasonRounds[SEASON].r3;
    assert.equal(r3.bonusChallengeId, undefined);
    assert.equal(r3.challengeDays, undefined);
  });

  it('still sweeps genuinely orphaned season challenges', async () => {
    const playerData = await seeded();
    playerData[GUILD].challenges.c_orphan = { title: 'Orphan', seasonId: SEASON };
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(18), 'u1');
    assert.equal(playerData[GUILD].challenges.c_orphan, undefined);
  });

  it('never sweeps a challenge belonging to another season', async () => {
    const playerData = await seeded();
    playerData[GUILD].challenges.c_other = { title: 'Other season', seasonId: 's2' };
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(18), 'u1');
    assert.ok(playerData[GUILD].challenges.c_other);
  });

  it('shrinking the cast still keeps a carried bonus on a surviving round', async () => {
    const playerData = await seeded();
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(8), 'u1');
    assert.ok(playerData[GUILD].challenges.c_reward);
    assert.equal(playerData[GUILD].seasonRounds[SEASON].r2.bonusChallengeId, 'c_reward');
  });

  it('first-time generation produces no bonus fields', async () => {
    const playerData = { [GUILD]: { seasonRounds: {}, challenges: {} } };
    await generateAndStoreRounds(playerData, GUILD, SEASON, estimates(18), 'u1');
    for (const round of Object.values(playerData[GUILD].seasonRounds[SEASON])) {
      assert.equal(round.bonusChallengeId, undefined);
      assert.equal(round.challengeDays, undefined);
    }
  });
});

describe('swapFields covers every round field the planner writes', () => {
  it('challengeDays / bonusChallengeId / bonusOrder travel on a round swap', async () => {
    // Guards the documented hazard: swap_round moves an explicit field LIST, so a new round
    // field that is not added to it silently stays behind.
    const src = await import('node:fs');
    const source = src.readFileSync(new URL('../seasonPlanner.js', import.meta.url), 'utf8');
    const block = source.slice(source.indexOf('const swapFields = ['));
    const list = block.slice(0, block.indexOf(']'));
    for (const field of ['challengeDays', 'bonusChallengeId', 'bonusOrder']) {
      assert.ok(list.includes(`'${field}'`), `swapFields is missing ${field}`);
    }
  });
});

describe('generateSeasonRounds is unaffected by the new fields', () => {
  it('still emits no challengeDays/bonus keys', () => {
    const rounds = generateSeasonRounds(18, 2, 3);
    const keys = new Set(Object.values(rounds).flatMap(r => Object.keys(r)));
    assert.equal(keys.has('challengeDays'), false);
    assert.equal(keys.has('bonusChallengeId'), false);
    assert.equal(keys.has('bonusOrder'), false);
  });
});
