// Tests for config-field preservation across app-button edits, and for the Season Planner setup
// state staying self-consistent. Both trace to one prod incident (guild 1400479796219215959,
// 2026-08-09): a host edited their apply button, which silently wiped the season's four planner
// estimates while seasonRounds (a separate tree) survived — so the Planner showed "Set up Season
// Planner" AND working page arrows, and the Edit modal came back blank.
// Pure logic replicated inline (mirrors applicationManager.js + seasonPlanner.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replica: saveApplicationConfig (applicationManager.js) ──
function saveApplicationConfig(store, configId, config, now = 1000) {
  const existing = store[configId];
  store[configId] = {
    ...existing,
    ...config,
    createdAt: existing?.createdAt ?? config.createdAt ?? now,
    lastUpdated: now
  };
  return store[configId];
}

// ── Replica: the tempConfig build in handleApplicationButtonModalSubmit ──
function buildTempConfig({ buttonText, explanatoryText, channelFormat }, existingConfig, now = 1000) {
  return {
    ...(existingConfig || {}),
    buttonText,
    explanatoryText,
    channelFormat,
    stage: 'awaiting_selections',
    ...(existingConfig && { questions: existingConfig.questions || [], lastUpdated: now })
  };
}

// A season config as it exists AFTER Season Planner setup — the shape the old whitelist destroyed.
const plannedSeason = () => ({
  buttonText: 'Apply to S1 - PremiumVivor',
  explanatoryText: 'Great season',
  channelFormat: '👾%name%',
  stage: 'active',
  seasonId: 'season_ab50df235a2242b4',
  seasonName: 'S1 - PremiumVivor',
  questions: [{ id: 'q1' }, { id: 'q2' }],
  targetChannelId: '1535889177390874715',
  categoryId: '1528729391415427255',
  buttonStyle: 'Primary',
  productionRole: '1530478047881330789',
  createdBy: '1086246253819613274',
  createdAt: 100,
  lastUpdated: 100,
  draftTribes: { role1: ['u1'] },
  estimatedTotalPlayers: 18,
  estimatedSwaps: 2,
  estimatedFTCPlayers: 3,
  estimatedStartDate: 1786000000000,
  currentSeasonRoundID: 1,
  seasonIdeas: 'brainstorm'
});

const PLANNER_FIELDS = ['estimatedTotalPlayers', 'estimatedSwaps', 'estimatedFTCPlayers', 'estimatedStartDate'];

describe('saveApplicationConfig — merges instead of replacing', () => {
  it('a partial save keeps every field the caller did not mention', () => {
    const store = { c1: plannedSeason() };
    saveApplicationConfig(store, 'c1', { buttonText: 'New text' });
    for (const f of PLANNER_FIELDS) assert.equal(store.c1[f], plannedSeason()[f], f);
    assert.equal(store.c1.buttonText, 'New text');
    assert.equal(store.c1.seasonIdeas, 'brainstorm');
    assert.equal(store.c1.currentSeasonRoundID, 1);
    assert.deepEqual(store.c1.draftTribes, { role1: ['u1'] });
  });

  it('createdAt survives every subsequent save (it is the season birthday, not a save stamp)', () => {
    const store = { c1: plannedSeason() };
    saveApplicationConfig(store, 'c1', { buttonText: 'x' }, 5000);
    assert.equal(store.c1.createdAt, 100);
    assert.equal(store.c1.lastUpdated, 5000);
  });

  it('a brand-new config still gets createdAt stamped', () => {
    const store = {};
    saveApplicationConfig(store, 'new', { buttonText: 'x' }, 7000);
    assert.equal(store.new.createdAt, 7000);
    assert.equal(store.new.lastUpdated, 7000);
  });

  it('explicit values still win — clearing productionRole to null works', () => {
    const store = { c1: plannedSeason() };
    saveApplicationConfig(store, 'c1', { productionRole: null });
    assert.equal(store.c1.productionRole, null);
  });

  it('regression: the old wholesale-replace shape would have dropped the estimates', () => {
    // What the bug did — kept here so nobody "simplifies" the merge back out.
    const old = { ...{ buttonText: 'x' }, createdAt: 999, lastUpdated: 999 };
    for (const f of PLANNER_FIELDS) assert.equal(old[f], undefined);
  });
});

describe('app-button modal edit — carries the whole season forward', () => {
  const modal = { buttonText: 'Apply now', explanatoryText: 'Come play', channelFormat: '%name%' };

  it('preserves the planner estimates (the actual prod data-loss bug)', () => {
    const cfg = buildTempConfig(modal, plannedSeason());
    for (const f of PLANNER_FIELDS) assert.equal(cfg[f], plannedSeason()[f], f);
  });

  it('preserves fields no whitelist ever knew about (draftTribes, seasonIdeas, currentSeasonRoundID)', () => {
    const cfg = buildTempConfig(modal, plannedSeason());
    assert.deepEqual(cfg.draftTribes, { role1: ['u1'] });
    assert.equal(cfg.seasonIdeas, 'brainstorm');
    assert.equal(cfg.currentSeasonRoundID, 1);
  });

  it('still applies the three modal fields and re-enters the selection flow', () => {
    const cfg = buildTempConfig(modal, plannedSeason());
    assert.equal(cfg.buttonText, 'Apply now');
    assert.equal(cfg.explanatoryText, 'Come play');
    assert.equal(cfg.channelFormat, '%name%');
    assert.equal(cfg.stage, 'awaiting_selections'); // NOT 'active' — the post step restores that
  });

  it('preserves season identity and questions', () => {
    const cfg = buildTempConfig(modal, plannedSeason());
    assert.equal(cfg.seasonId, 'season_ab50df235a2242b4');
    assert.equal(cfg.seasonName, 'S1 - PremiumVivor');
    assert.equal(cfg.questions.length, 2);
  });

  it('defaults questions to [] for an existing config that has none', () => {
    const cfg = buildTempConfig(modal, { seasonId: 's1' });
    assert.deepEqual(cfg.questions, []);
  });

  it('a brand-new config (no existing) carries only the modal fields', () => {
    const cfg = buildTempConfig(modal, null);
    assert.deepEqual(Object.keys(cfg).sort(), ['buttonText', 'channelFormat', 'explanatoryText', 'stage']);
  });

  it('end-to-end: edit the button, then save — estimates survive the round trip', () => {
    const store = { c1: plannedSeason() };
    saveApplicationConfig(store, 'c1', buildTempConfig(modal, store.c1));
    for (const f of PLANNER_FIELDS) assert.equal(store.c1[f], plannedSeason()[f], f);
    assert.equal(store.c1.createdAt, 100);
  });
});

// ── Replica: buildPlannerView's readiness/pagination decisions ──
const ALL_PLANNER_FIELDS = PLANNER_FIELDS;
function getMissingPlannerFields(config, rounds) {
  if (config) return ALL_PLANNER_FIELDS.filter(k => config[k] == null);
  return (rounds && Object.keys(rounds).length > 0) ? [] : ALL_PLANNER_FIELDS;
}
function plannerChrome(config, rounds, page = 0, perPage = 10) {
  const totalPages = Math.ceil(Object.keys(rounds).length / perPage);
  const plannerReady = getMissingPlannerFields(config, rounds).length === 0;
  return {
    plannerReady,
    pageInfo: plannerReady && totalPages > 1 ? ` (Pg ${page + 1}/${totalPages})` : '',
    arrows: plannerReady ? 2 : 0,
    showsSelects: plannerReady,
    showsSetupPrompt: !plannerReady
  };
}

describe('Season Planner setup state — no contradictory chrome', () => {
  const complete = { estimatedTotalPlayers: 18, estimatedSwaps: 2, estimatedFTCPlayers: 3, estimatedStartDate: 1 };
  const rounds17 = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`r${i + 1}`, { seasonRoundNo: i + 1 }]));

  it('a fully set-up season shows selects, the page counter and both arrows', () => {
    const c = plannerChrome(complete, rounds17);
    assert.deepEqual(c, { plannerReady: true, pageInfo: ' (Pg 1/2)', arrows: 2, showsSelects: true, showsSetupPrompt: false });
  });

  it('THE BUG: rounds exist but estimates were wiped → setup prompt, and NO page counter or arrows', () => {
    const c = plannerChrome({ seasonName: 'X' }, rounds17);
    assert.equal(c.showsSetupPrompt, true);
    assert.equal(c.pageInfo, '', 'a page counter above a setup prompt is a contradiction');
    assert.equal(c.arrows, 0, 'arrows would page to selects the prompt claims do not exist');
  });

  it('a partially set-up season is still not ready (one missing field is enough)', () => {
    const c = plannerChrome({ ...complete, estimatedSwaps: null }, rounds17);
    assert.equal(c.plannerReady, false);
    assert.equal(c.arrows, 0);
  });

  it('every entry point agrees now that config is passed everywhere', () => {
    // Before the fix, only 3 of 10 buildPlannerView call sites passed `config`; the rest fell back
    // to "rounds exist ⟺ set up", so paging flipped the view into the ready state mid-session.
    const wiped = { seasonName: 'X' };
    const withConfig = plannerChrome(wiped, rounds17).plannerReady;
    const withoutConfig = plannerChrome(null, rounds17).plannerReady;
    assert.equal(withConfig, false);
    assert.equal(withoutConfig, true, 'the null fallback disagrees — which is exactly why every call site must pass config');
  });

  it('a name-only season with no rounds shows the prompt and no chrome', () => {
    const c = plannerChrome({ seasonName: 'X' }, {});
    assert.deepEqual(c, { plannerReady: false, pageInfo: '', arrows: 0, showsSelects: false, showsSetupPrompt: true });
  });

  it('one page of rounds gets no page counter even when ready', () => {
    const rounds5 = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`r${i + 1}`, { seasonRoundNo: i + 1 }]));
    assert.equal(plannerChrome(complete, rounds5).pageInfo, '');
  });
});
