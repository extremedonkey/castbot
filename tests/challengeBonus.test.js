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
} from '../seasonPlanner.js';

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

  it('clamps an out-of-range stored duration into the radio', () => {
    const modal = buildChallengeEditModal({ fNumber: 9, challengeDays: 99 }, null, {}, {}, 'r9', 'c');
    const days = modal.components.find(c => c.component.custom_id === 'challenge_days').component;
    assert.equal(days.options.find(o => o.default).value, '7');
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

  it('clamps duration to the 1-7 radio range and ignores junk', () => {
    const round = {};
    applyChallengeEdit(round, null, { challenge_days: '99' }, []);
    assert.equal(round.challengeDays, 7);
    applyChallengeEdit(round, null, { challenge_days: 'abc' }, []);
    assert.equal(round.challengeDays, 7, 'junk must not overwrite a good value');
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
