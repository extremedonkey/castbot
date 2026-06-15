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
