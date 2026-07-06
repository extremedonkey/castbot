/**
 * Tests for the shared Season Selector option-building logic.
 *
 * Covers the Layer-A unification (RaP 0910): createSeasonSelector now drives
 * both the Apps selector and the (formerly forked) Planner selector via
 * requireSeasonName / createNew* / decorateSeason options.
 *
 * Pure logic replicated inline to avoid importing storage.js / discord.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate the option-building logic from createSeasonSelector()
// ─────────────────────────────────────────────

function getSeasonStageEmoji(stage) {
  const stageEmojis = {
    planning: '📝', applications: '📝', active: '📝',
    cast_review: '🎯', casting_offers: '🎯', pre_marooning: '🏝️',
    pre_swap: '🎮', swap1: '🔄', swap2: '🔄', swap3: '🔄',
    merge: '🤝', complete: '🏆'
  };
  return stageEmojis[stage] || '📅';
}

function buildSeasonOptions(seasons, guildData, options = {}) {
  const {
    includeCreateNew = true,
    showArchived = false,
    filterStage = null,
    requireSeasonName = false,
    createNewLabel = '➕ Create New Season',
    createNewValue = 'create_new_season',
    createNewEmoji = { name: '✨' },
    createNewDescription = 'Start planning a new season',
    decorateSeason = null
  } = options;

  const seasonList = Object.entries(seasons)
    .filter(([_, season]) => {
      if (requireSeasonName && !season.seasonName) return false;
      if (!showArchived && season.archived) return false;
      if (filterStage && season.stage !== filterStage) return false;
      return true;
    })
    .sort(([, a], [, b]) => (b.lastUpdated || b.createdAt || 0) - (a.lastUpdated || a.createdAt || 0));

  const out = [];

  if (includeCreateNew) {
    out.push({ label: createNewLabel, value: createNewValue, emoji: createNewEmoji, description: createNewDescription });
  }

  for (const [configId, season] of seasonList) {
    let emoji = getSeasonStageEmoji(season.stage || 'planning');
    let description;
    if (season.explanatoryText && season.explanatoryText.trim().length > 0) {
      description = season.explanatoryText.length > 100
        ? season.explanatoryText.substring(0, 98) + '..'
        : season.explanatoryText;
    }
    if (decorateSeason) {
      const deco = decorateSeason(configId, season, guildData) || {};
      if (deco.emoji !== undefined) emoji = deco.emoji;
      if (deco.description !== undefined) description = deco.description;
    }
    const option = { label: `${emoji} ${season.seasonName || 'Unnamed Season'}`, value: configId };
    if (description) option.description = description;
    out.push(option);
  }

  return out;
}

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const guildData = {
  applicationConfigs: {
    config_a: { seasonName: 'Alpha', seasonId: 'season_a', stage: 'applications', explanatoryText: 'Join Alpha!', lastUpdated: 200 },
    config_b: { seasonName: 'Beta', seasonId: 'season_b', stage: 'planning', lastUpdated: 100 },
    config_nameless: { seasonId: 'season_x', stage: 'planning', lastUpdated: 50 }
  },
  seasonRounds: { season_a: { r1: {} } } // Alpha has planner data, Beta does not
};

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('Season Selector — Apps default behavior (unchanged)', () => {
  it('puts Create New first with the unified sentinel', () => {
    const opts = buildSeasonOptions(guildData.applicationConfigs, guildData);
    assert.equal(opts[0].value, 'create_new_season');
    assert.equal(opts[0].label, '➕ Create New Season');
  });

  it('decorates rows with stage emoji + explanatoryText description by default', () => {
    const opts = buildSeasonOptions(guildData.applicationConfigs, guildData);
    const alpha = opts.find(o => o.value === 'config_a');
    assert.equal(alpha.label, '📝 Alpha');
    assert.equal(alpha.description, 'Join Alpha!');
  });

  it('includes nameless configs as "Unnamed Season" when requireSeasonName is off', () => {
    const opts = buildSeasonOptions(guildData.applicationConfigs, guildData);
    assert.ok(opts.some(o => o.value === 'config_nameless'));
  });
});

describe('Season Selector — Planner mode (Layer A unification)', () => {
  const plannerOpts = {
    requireSeasonName: true,
    createNewLabel: 'Create New Season',
    createNewEmoji: { name: '➕' },
    createNewDescription: 'Start planning a new season from scratch',
    decorateSeason: (configId, season, gd) => {
      const hasPlanner = !!gd?.seasonRounds?.[season.seasonId];
      return {
        emoji: hasPlanner ? '📅' : '⚠️',
        description: hasPlanner ? '📅 Planner configured' : '⚠️ Needs setup'
      };
    }
  };

  it('skips nameless configs when requireSeasonName is on', () => {
    const opts = buildSeasonOptions(guildData.applicationConfigs, guildData, plannerOpts);
    assert.ok(!opts.some(o => o.value === 'config_nameless'));
  });

  it('shows planner-configured status for seasons with rounds', () => {
    const opts = buildSeasonOptions(guildData.applicationConfigs, guildData, plannerOpts);
    const alpha = opts.find(o => o.value === 'config_a');
    assert.equal(alpha.label, '📅 Alpha');
    assert.equal(alpha.description, '📅 Planner configured');
  });

  it('shows "needs setup" for seasons without rounds', () => {
    const opts = buildSeasonOptions(guildData.applicationConfigs, guildData, plannerOpts);
    const beta = opts.find(o => o.value === 'config_b');
    assert.equal(beta.label, '⚠️ Beta');
    assert.equal(beta.description, '⚠️ Needs setup');
  });

  it('still emits the unified create_new_season sentinel in planner mode', () => {
    const opts = buildSeasonOptions(guildData.applicationConfigs, guildData, plannerOpts);
    assert.equal(opts[0].value, 'create_new_season');
    assert.equal(opts[0].label, 'Create New Season');
  });
});

// ─────────────────────────────────────────────
// Season Manager config indicators (📝 Apps • 🏆 Ranking • 📅 Planner)
// ─────────────────────────────────────────────

function computeIndicators(configId, season, guildData) {
  const parts = [];
  const appsConfigured = !!season.targetChannelId
    || (season.questions || []).some(q => q.questionType !== 'completion' && q.questionTitle && q.questionTitle !== 'Click here to set first question');
  if (appsConfigured) parts.push('📝 Apps');
  const hasRankings = Object.values(guildData?.applications || {}).some(app =>
    app.configId === configId && ((app.rankings && Object.keys(app.rankings).length > 0) || app.castingStatus)
  );
  if (hasRankings) parts.push('🏆 Ranking');
  if (guildData?.seasonRounds?.[season.seasonId]) parts.push('📅 Planner');
  return parts.length ? parts.join(' • ') : '⚠️ Not configured yet';
}

describe('Season Manager — config indicators', () => {
  it('shows "not configured" for a bare name-only season', () => {
    const season = { seasonId: 'season_x', questions: [{ questionType: 'completion', questionTitle: 'Thanks' }, { questionTitle: 'Click here to set first question' }] };
    assert.equal(computeIndicators('cfg', season, {}), '⚠️ Not configured yet');
  });

  it('shows 📝 Apps when the application is posted (targetChannelId)', () => {
    const season = { seasonId: 'season_x', targetChannelId: '123' };
    assert.equal(computeIndicators('cfg', season, {}), '📝 Apps');
  });

  it('shows 📝 Apps when a real (non-placeholder) question exists', () => {
    const season = { seasonId: 'season_x', questions: [{ questionTitle: 'What is your name?' }] };
    assert.equal(computeIndicators('cfg', season, {}), '📝 Apps');
  });

  it('shows 🏆 Ranking when an application has ranking scores', () => {
    const guildData = { applications: { chan1: { configId: 'cfg', rankings: { admin1: 5 } } } };
    const season = { seasonId: 'season_x' };
    assert.equal(computeIndicators('cfg', season, guildData), '🏆 Ranking');
  });

  it('shows 🏆 Ranking when an application has a casting decision', () => {
    const guildData = { applications: { chan1: { configId: 'cfg', castingStatus: 'cast' } } };
    const season = { seasonId: 'season_x' };
    assert.equal(computeIndicators('cfg', season, guildData), '🏆 Ranking');
  });

  it('does NOT show 🏆 Ranking for rankings belonging to a different season', () => {
    const guildData = { applications: { chan1: { configId: 'other', rankings: { admin1: 5 } } } };
    const season = { seasonId: 'season_x' };
    assert.equal(computeIndicators('cfg', season, guildData), '⚠️ Not configured yet');
  });

  it('shows 📅 Planner when rounds exist', () => {
    const guildData = { seasonRounds: { season_x: { r1: {} } } };
    const season = { seasonId: 'season_x' };
    assert.equal(computeIndicators('cfg', season, guildData), '📅 Planner');
  });

});

// ─────────────────────────────────────────────
// Search option + capacity math (never exceed 25 options)
// ─────────────────────────────────────────────

function selectorMeta(seasonCount, { includeCreateNew = true, includeSearch = false } = {}) {
  const hasSearch = includeSearch && seasonCount > 10;
  const controlSlots = (includeCreateNew ? 1 : 0) + (hasSearch ? 1 : 0);
  const capacity = 25 - controlSlots;
  const willOverflow = seasonCount > capacity;
  const maxSeasons = willOverflow ? capacity - 1 : capacity;
  const shown = Math.min(seasonCount, maxSeasons);
  const total = controlSlots + shown + (willOverflow ? 1 : 0);
  return { hasSearch, total, shown, willOverflow };
}

describe('Season selector — search option + capacity', () => {
  it('no search option below the 10-season threshold', () => {
    const m = selectorMeta(5, { includeSearch: true });
    assert.equal(m.hasSearch, false);
    assert.equal(m.total, 6); // create + 5
    assert.equal(m.willOverflow, false);
  });

  it('adds search option above threshold, no overflow when it fits', () => {
    const m = selectorMeta(20, { includeSearch: true });
    assert.equal(m.hasSearch, true);
    assert.equal(m.shown, 20);
    assert.equal(m.total, 22); // create + search + 20
  });

  it('never exceeds 25 options when overflowing with search', () => {
    const m = selectorMeta(30, { includeSearch: true });
    assert.equal(m.hasSearch, true);
    assert.equal(m.willOverflow, true);
    assert.equal(m.total, 25); // create + search + 22 + overflow
    assert.ok(m.total <= 25);
  });

  it('never exceeds 25 options when overflowing without search', () => {
    const m = selectorMeta(30, { includeSearch: false });
    assert.equal(m.total, 25); // create + 23 + overflow
    assert.ok(m.total <= 25);
  });
});

describe('Season Manager — indicator ordering', () => {
  it('combines all three in order: Apps • Ranking • Planner', () => {
    const guildData = {
      applications: { chan1: { configId: 'cfg', rankings: { admin1: 4 } } },
      seasonRounds: { season_x: { r1: {} } }
    };
    const season = { seasonId: 'season_x', targetChannelId: '123' };
    assert.equal(computeIndicators('cfg', season, guildData), '📝 Apps • 🏆 Ranking • 📅 Planner');
  });
});

// ─────────────────────────────────────────────
// Shared Season Manager header (seasonManagerHeader) — single source of truth
// for the two lines above the nav row on every tab. Mirrors seasonSelector.js.
// ─────────────────────────────────────────────

function seasonManagerHeader(active, seasonName) {
  const titles = {
    apps: '📝 Season Applications',
    planner: '📅 Season Planner',
    ranking: '🏆 Casting',
    marooning: '🚣 Marooning'
  };
  const title = titles[active] || '📋 Season Manager';
  return { type: 10, content: `## ${title}\n> ### ${seasonName}` };
}

describe('Season Manager — shared header', () => {
  it('line 2 (season name) is byte-identical across all tabs', () => {
    const name = 'S14: Empire of Mali';
    const line2 = (h) => h.content.split('\n')[1];
    const apps = seasonManagerHeader('apps', name);
    const planner = seasonManagerHeader('planner', name);
    const ranking = seasonManagerHeader('ranking', name);
    const marooning = seasonManagerHeader('marooning', name);
    assert.equal(line2(apps), '> ### S14: Empire of Mali');
    assert.equal(line2(apps), line2(planner));
    assert.equal(line2(planner), line2(ranking));
    assert.equal(line2(ranking), line2(marooning));
  });

  it('only line 1 (title) differs between tabs', () => {
    const name = 'X';
    const line1 = (a) => seasonManagerHeader(a, name).content.split('\n')[0];
    assert.equal(line1('apps'), '## 📝 Season Applications');
    assert.equal(line1('planner'), '## 📅 Season Planner');
    assert.equal(line1('ranking'), '## 🏆 Casting');
    assert.equal(line1('marooning'), '## 🚣 Marooning');
  });

  it('uses Unicode emoji (no :pencil: shortcode regression)', () => {
    const all = ['apps', 'planner', 'ranking', 'marooning'].map(a => seasonManagerHeader(a, 'X').content).join('');
    assert.ok(!/:[a-z_]+:/.test(all), 'header must not contain Discord emoji shortcodes');
  });

  it('falls back to a generic title for an unknown tab', () => {
    assert.equal(seasonManagerHeader('bogus', 'X').content.split('\n')[0], '## 📋 Season Manager');
  });

  it('always emits a type-10 Text Display with the h3 blockquote season line', () => {
    const h = seasonManagerHeader('ranking', 'Season Z');
    assert.equal(h.type, 10);
    assert.match(h.content, /^## .+\n> ### Season Z$/);
  });
});

// ─────────────────────────────────────────────
// Shared Season Manager NAV row (buildSeasonNavRow) + BOTTOM row (buildSeasonBottomRow).
// Replicated inline from seasonSelector.js — the single source of truth for tab chrome.
// ─────────────────────────────────────────────

function buildSeasonNavRow(configId, active) {
  const tab = (key, customId, label, emoji) => ({
    type: 2, custom_id: customId, label,
    style: active === key ? 1 : 2,
    emoji: { name: emoji }
  });
  return {
    type: 1,
    components: [
      tab('apps', `planner_apps_${configId}`, 'Apps', '📝'),
      tab('planner', `apps_planner_${configId}`, 'Planner', '📅'),
      tab('ranking', `season_app_ranking_${configId}`, 'Casting', '🏆'),
      tab('marooning', `season_marooning_${configId}`, 'Marooning', '🚣')
    ]
  };
}

function buildSeasonBottomRow(configId, active, extraButtons = []) {
  return {
    type: 1,
    components: [
      { type: 2, custom_id: 'season_manager', label: '← Seasons', style: 2 },
      { type: 2, custom_id: `season_edit_info_${active}_${configId}`, label: 'Edit', style: 2, emoji: { name: '✏️' } },
      ...extraButtons
    ]
  };
}

describe('Season Manager — nav row (buildSeasonNavRow)', () => {
  const CID = 'config_123';

  it('has exactly 4 peer tabs in order Apps · Planner · Casting · Marooning', () => {
    const row = buildSeasonNavRow(CID, 'ranking');
    assert.equal(row.type, 1);
    assert.equal(row.components.length, 4);
    assert.deepEqual(row.components.map(b => b.label), ['Apps', 'Planner', 'Casting', 'Marooning']);
    assert.deepEqual(row.components.map(b => b.emoji.name), ['📝', '📅', '🏆', '🚣']);
  });

  it('emits the correct custom_id per tab (Marooning → season_marooning_*)', () => {
    const row = buildSeasonNavRow(CID, 'apps');
    assert.deepEqual(row.components.map(b => b.custom_id), [
      `planner_apps_${CID}`,
      `apps_planner_${CID}`,
      `season_app_ranking_${CID}`,
      `season_marooning_${CID}`
    ]);
  });

  it('no longer contains an Edit button (Edit moved to the bottom row)', () => {
    const row = buildSeasonNavRow(CID, 'marooning');
    assert.ok(!row.components.some(b => b.label === 'Edit'), 'Edit must not be in the nav row');
    assert.ok(!row.components.some(b => (b.custom_id || '').startsWith('season_edit_info_')));
  });

  it('the active tab is Primary (style 1); the rest Secondary (style 2)', () => {
    for (const active of ['apps', 'planner', 'ranking', 'marooning']) {
      const row = buildSeasonNavRow(CID, active);
      const byKey = { apps: 0, planner: 1, ranking: 2, marooning: 3 };
      row.components.forEach((b, i) => {
        assert.equal(b.style, i === byKey[active] ? 1 : 2, `tab ${i} style for active=${active}`);
      });
    }
  });
});

describe('Season Manager — bottom row (buildSeasonBottomRow)', () => {
  const CID = 'config_123';

  it('is [← Seasons][✏️ Edit] with no extra buttons by default', () => {
    const row = buildSeasonBottomRow(CID, 'ranking');
    assert.equal(row.type, 1);
    assert.equal(row.components.length, 2);
    assert.equal(row.components[0].custom_id, 'season_manager');
    assert.equal(row.components[0].label, '← Seasons');
    assert.equal(row.components[1].label, 'Edit');
    assert.equal(row.components[1].emoji.name, '✏️');
  });

  it('Edit carries the CURRENT tab as origin (season_edit_info_{active}_{configId})', () => {
    for (const active of ['apps', 'planner', 'ranking', 'marooning']) {
      const row = buildSeasonBottomRow(CID, active);
      assert.equal(row.components[1].custom_id, `season_edit_info_${active}_${CID}`);
    }
  });

  it('appends extra buttons (e.g. pagination) AFTER Edit', () => {
    const pagination = [
      { type: 2, custom_id: `planner_page_0_${CID}`, label: '◀', style: 2 },
      { type: 2, custom_id: `planner_page_2_${CID}`, label: '▶', style: 1 }
    ];
    const row = buildSeasonBottomRow(CID, 'planner', pagination);
    assert.equal(row.components.length, 4);
    assert.deepEqual(row.components.slice(2), pagination);
    // stays within the 5-button ActionRow limit
    assert.ok(row.components.length <= 5);
  });

  it('both fixed actions are Secondary (grey) — Edit is an action, never an active tab', () => {
    const row = buildSeasonBottomRow(CID, 'apps');
    assert.equal(row.components[0].style, 2);
    assert.equal(row.components[1].style, 2);
  });
});
