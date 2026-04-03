/**
 * Tests for challengeActionCreate.js — Challenge Action Categories
 * Pure logic replicated inline to avoid importing heavy modules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate pure logic inline
// ─────────────────────────────────────────────

function getChallengeActions(challenge) {
  if (challenge.actions) {
    return {
      playerAll: challenge.actions.playerAll || [],
      playerIndividual: challenge.actions.playerIndividual || {},
      tribe: challenge.actions.tribe || {},
      host: challenge.actions.host || [],
    };
  }
  return {
    playerAll: challenge.actionIds || [],
    playerIndividual: {},
    tribe: {},
    host: [],
  };
}

function syncActionIds(challenge) {
  if (!challenge.actions) return;
  const all = new Set();
  for (const id of (challenge.actions.playerAll || [])) all.add(id);
  for (const id of Object.values(challenge.actions.playerIndividual || {})) all.add(id);
  for (const id of Object.values(challenge.actions.tribe || {})) all.add(id);
  for (const id of (challenge.actions.host || [])) all.add(id);
  challenge.actionIds = [...all];
}

function ensureActions(challenge) {
  if (!challenge.actions) {
    challenge.actions = {
      playerAll: [...(challenge.actionIds || [])],
      playerIndividual: {},
      tribe: {},
      host: [],
    };
  }
  if (!challenge.actions.playerAll) challenge.actions.playerAll = [];
  if (!challenge.actions.playerIndividual) challenge.actions.playerIndividual = {};
  if (!challenge.actions.tribe) challenge.actions.tribe = {};
  if (!challenge.actions.host) challenge.actions.host = [];
}

const CATEGORY_TYPES = {
  playerAll:        { label: 'Player Action — All',      emoji: '⚡', description: 'Same command for all players (e.g., jigsaw link)' },
  playerIndividual: { label: 'Individual Player Action', emoji: '👤', description: 'Unique command per player (e.g., private sheet)' },
  tribe:            { label: 'Tribe Challenge Action',    emoji: '🏰', description: 'Unique command per tribe (e.g., tribe attack)' },
  host:             { label: 'Host Challenge Action',     emoji: '🔧', description: 'Automation for hosts beyond challenge text' },
};

// Replicate modal builder field5 logic
function buildField5(category) {
  if (category === 'playerIndividual') {
    return { type: 18, label: 'Assign to Players', component: { type: 5, custom_id: 'assign_to' } };
  }
  if (category === 'tribe') {
    return { type: 18, label: 'Assign to Tribes', component: { type: 6, custom_id: 'assign_to' } };
  }
  return { type: 18, label: 'Button Color', component: { type: 3, custom_id: 'button_color' } };
}

function buildQuickChallengeActionModal(challengeId, category = null) {
  const CATEGORY_OPTIONS = Object.entries(CATEGORY_TYPES).map(([value, meta]) => ({
    label: meta.label, value, emoji: { name: meta.emoji }, description: meta.description,
  }));
  return {
    custom_id: `challenge_action_create_modal_${challengeId}`,
    title: 'Quick Challenge Action',
    components: [
      { type: 18, label: 'Action Type', component: { type: 3, custom_id: 'action_category', options: CATEGORY_OPTIONS.map(o => ({ ...o, default: o.value === category })) } },
      { type: 18, label: 'Action Name', component: { type: 4, custom_id: 'action_name' } },
      { type: 18, label: 'Display Text', component: { type: 4, custom_id: 'display_text' } },
      { type: 18, label: 'Button Emoji (Optional)', component: { type: 4, custom_id: 'button_emoji' } },
      buildField5(category),
    ],
  };
}

// Replicate link/unlink logic (pure data manipulation)
function linkAction(challenge, actionId, category, assignmentId) {
  ensureActions(challenge);
  if (category === 'playerAll') {
    if (!challenge.actions.playerAll.includes(actionId)) challenge.actions.playerAll.push(actionId);
  } else if (category === 'host') {
    if (!challenge.actions.host.includes(actionId)) challenge.actions.host.push(actionId);
  } else if (category === 'playerIndividual') {
    challenge.actions.playerIndividual[assignmentId] = actionId;
  } else if (category === 'tribe') {
    challenge.actions.tribe[assignmentId] = actionId;
  }
  syncActionIds(challenge);
}

function unlinkAction(challenge, actionId, category) {
  ensureActions(challenge);
  if (category === 'playerAll') {
    challenge.actions.playerAll = challenge.actions.playerAll.filter(id => id !== actionId);
  } else if (category === 'host') {
    challenge.actions.host = challenge.actions.host.filter(id => id !== actionId);
  } else if (category === 'playerIndividual') {
    for (const [key, val] of Object.entries(challenge.actions.playerIndividual)) {
      if (val === actionId) { delete challenge.actions.playerIndividual[key]; break; }
    }
  } else if (category === 'tribe') {
    for (const [key, val] of Object.entries(challenge.actions.tribe)) {
      if (val === actionId) { delete challenge.actions.tribe[key]; break; }
    }
  }
  syncActionIds(challenge);
}

// ─────────────────────────────────────────────
// Tests — getChallengeActions
// ─────────────────────────────────────────────

describe('getChallengeActions — reads categorized or falls back to legacy', () => {
  it('returns actions object when present', () => {
    const challenge = {
      actions: {
        playerAll: ['a1'],
        playerIndividual: { user1: 'a2' },
        tribe: { role1: 'a3' },
        host: ['a4'],
      },
    };
    const result = getChallengeActions(challenge);
    assert.deepEqual(result.playerAll, ['a1']);
    assert.deepEqual(result.playerIndividual, { user1: 'a2' });
    assert.deepEqual(result.tribe, { role1: 'a3' });
    assert.deepEqual(result.host, ['a4']);
  });

  it('falls back actionIds to playerAll when actions absent', () => {
    const challenge = { actionIds: ['legacy1', 'legacy2'] };
    const result = getChallengeActions(challenge);
    assert.deepEqual(result.playerAll, ['legacy1', 'legacy2']);
    assert.deepEqual(result.playerIndividual, {});
    assert.deepEqual(result.tribe, {});
    assert.deepEqual(result.host, []);
  });

  it('handles empty challenge (no actionIds, no actions)', () => {
    const result = getChallengeActions({});
    assert.deepEqual(result.playerAll, []);
    assert.deepEqual(result.playerIndividual, {});
    assert.deepEqual(result.tribe, {});
    assert.deepEqual(result.host, []);
  });

  it('fills missing categories with defaults', () => {
    const challenge = { actions: { playerAll: ['a1'] } };
    const result = getChallengeActions(challenge);
    assert.deepEqual(result.playerAll, ['a1']);
    assert.deepEqual(result.playerIndividual, {});
    assert.deepEqual(result.tribe, {});
    assert.deepEqual(result.host, []);
  });

  it('returns reference to actionIds for legacy fallback (no copy)', () => {
    const challenge = { actionIds: ['x'] };
    const result = getChallengeActions(challenge);
    // Legacy fallback returns a direct reference — this is by design
    // (same pattern as the rest of the codebase for performance)
    assert.equal(result.playerAll, challenge.actionIds);
  });
});

// ─────────────────────────────────────────────
// Tests — syncActionIds
// ─────────────────────────────────────────────

describe('syncActionIds — flat union of all categories', () => {
  it('produces flat array from all categories', () => {
    const challenge = {
      actions: {
        playerAll: ['a1'],
        playerIndividual: { user1: 'a2', user2: 'a3' },
        tribe: { role1: 'a4' },
        host: ['a5'],
      },
    };
    syncActionIds(challenge);
    assert.equal(challenge.actionIds.length, 5);
    assert.ok(challenge.actionIds.includes('a1'));
    assert.ok(challenge.actionIds.includes('a2'));
    assert.ok(challenge.actionIds.includes('a3'));
    assert.ok(challenge.actionIds.includes('a4'));
    assert.ok(challenge.actionIds.includes('a5'));
  });

  it('deduplicates if same ID in multiple categories', () => {
    const challenge = {
      actions: {
        playerAll: ['shared'],
        playerIndividual: {},
        tribe: {},
        host: ['shared'],
      },
    };
    syncActionIds(challenge);
    assert.equal(challenge.actionIds.length, 1);
    assert.deepEqual(challenge.actionIds, ['shared']);
  });

  it('produces empty array from empty actions', () => {
    const challenge = {
      actions: { playerAll: [], playerIndividual: {}, tribe: {}, host: [] },
    };
    syncActionIds(challenge);
    assert.deepEqual(challenge.actionIds, []);
  });

  it('no-ops when challenge.actions is absent', () => {
    const challenge = { actionIds: ['keep'] };
    syncActionIds(challenge);
    assert.deepEqual(challenge.actionIds, ['keep']);
  });

  it('handles only playerIndividual and tribe values', () => {
    const challenge = {
      actions: {
        playerAll: [],
        playerIndividual: { u1: 'ind1', u2: 'ind2' },
        tribe: { r1: 'tri1' },
        host: [],
      },
    };
    syncActionIds(challenge);
    assert.equal(challenge.actionIds.length, 3);
    assert.ok(challenge.actionIds.includes('ind1'));
    assert.ok(challenge.actionIds.includes('ind2'));
    assert.ok(challenge.actionIds.includes('tri1'));
  });

  it('handles missing sub-categories gracefully', () => {
    const challenge = { actions: { playerAll: ['a1'] } };
    syncActionIds(challenge);
    assert.deepEqual(challenge.actionIds, ['a1']);
  });
});

// ─────────────────────────────────────────────
// Tests — ensureActions (lazy init)
// ─────────────────────────────────────────────

describe('ensureActions — lazy initialization from legacy actionIds', () => {
  it('initializes actions from actionIds', () => {
    const challenge = { actionIds: ['legacy1', 'legacy2'] };
    ensureActions(challenge);
    assert.deepEqual(challenge.actions.playerAll, ['legacy1', 'legacy2']);
    assert.deepEqual(challenge.actions.playerIndividual, {});
    assert.deepEqual(challenge.actions.tribe, {});
    assert.deepEqual(challenge.actions.host, []);
  });

  it('does not overwrite existing actions', () => {
    const challenge = {
      actions: { playerAll: ['existing'], playerIndividual: { u1: 'a1' }, tribe: {}, host: [] },
    };
    ensureActions(challenge);
    assert.deepEqual(challenge.actions.playerAll, ['existing']);
    assert.deepEqual(challenge.actions.playerIndividual, { u1: 'a1' });
  });

  it('handles empty challenge', () => {
    const challenge = {};
    ensureActions(challenge);
    assert.deepEqual(challenge.actions.playerAll, []);
    assert.deepEqual(challenge.actions.playerIndividual, {});
  });

  it('fills missing categories on partial actions', () => {
    const challenge = { actions: { playerAll: ['a1'] } };
    ensureActions(challenge);
    assert.deepEqual(challenge.actions.playerAll, ['a1']);
    assert.deepEqual(challenge.actions.playerIndividual, {});
    assert.deepEqual(challenge.actions.tribe, {});
    assert.deepEqual(challenge.actions.host, []);
  });

  it('copies actionIds by value not reference', () => {
    const challenge = { actionIds: ['x'] };
    ensureActions(challenge);
    challenge.actions.playerAll.push('y');
    assert.deepEqual(challenge.actionIds, ['x']);
  });
});

// ─────────────────────────────────────────────
// Tests — buildQuickChallengeActionModal
// ─────────────────────────────────────────────

describe('buildQuickChallengeActionModal — modal structure', () => {
  it('has 5 components, all type 18 (Label)', () => {
    const modal = buildQuickChallengeActionModal('test_123');
    assert.equal(modal.components.length, 5);
    for (const comp of modal.components) {
      assert.equal(comp.type, 18);
    }
  });

  it('custom_id includes challengeId', () => {
    const modal = buildQuickChallengeActionModal('test_abc');
    assert.equal(modal.custom_id, 'challenge_action_create_modal_test_abc');
  });

  it('field 1 is String Select with 4 category options', () => {
    const modal = buildQuickChallengeActionModal('test_123');
    const field1 = modal.components[0].component;
    assert.equal(field1.type, 3); // String Select
    assert.equal(field1.options.length, 4);
    const values = field1.options.map(o => o.value);
    assert.deepEqual(values, ['playerAll', 'playerIndividual', 'tribe', 'host']);
  });

  it('pre-selects category in String Select options', () => {
    const modal = buildQuickChallengeActionModal('test_123', 'tribe');
    const field1 = modal.components[0].component;
    const tribeOpt = field1.options.find(o => o.value === 'tribe');
    const otherOpt = field1.options.find(o => o.value === 'playerAll');
    assert.equal(tribeOpt.default, true);
    assert.equal(otherOpt.default, false);
  });

  it('field 5 is User Select when category is playerIndividual', () => {
    const modal = buildQuickChallengeActionModal('test_123', 'playerIndividual');
    const field5 = modal.components[4].component;
    assert.equal(field5.type, 5); // User Select
    assert.equal(field5.custom_id, 'assign_to');
  });

  it('field 5 is Role Select when category is tribe', () => {
    const modal = buildQuickChallengeActionModal('test_123', 'tribe');
    const field5 = modal.components[4].component;
    assert.equal(field5.type, 6); // Role Select
    assert.equal(field5.custom_id, 'assign_to');
  });

  it('field 5 is String Select (color) when category is playerAll', () => {
    const modal = buildQuickChallengeActionModal('test_123', 'playerAll');
    const field5 = modal.components[4].component;
    assert.equal(field5.type, 3); // String Select
    assert.equal(field5.custom_id, 'button_color');
  });

  it('field 5 is String Select (color) when category is host', () => {
    const modal = buildQuickChallengeActionModal('test_123', 'host');
    const field5 = modal.components[4].component;
    assert.equal(field5.type, 3);
    assert.equal(field5.custom_id, 'button_color');
  });

  it('field 5 is String Select (color) when category is null', () => {
    const modal = buildQuickChallengeActionModal('test_123', null);
    const field5 = modal.components[4].component;
    assert.equal(field5.type, 3);
    assert.equal(field5.custom_id, 'button_color');
  });

  it('no category option has default true when category is null', () => {
    const modal = buildQuickChallengeActionModal('test_123', null);
    const field1 = modal.components[0].component;
    const anyDefault = field1.options.some(o => o.default === true);
    assert.equal(anyDefault, false);
  });
});

// ─────────────────────────────────────────────
// Tests — Link/Unlink logic
// ─────────────────────────────────────────────

describe('linkAction — add to category', () => {
  it('links to playerAll array', () => {
    const challenge = { actionIds: [] };
    linkAction(challenge, 'a1', 'playerAll');
    assert.deepEqual(challenge.actions.playerAll, ['a1']);
    assert.deepEqual(challenge.actionIds, ['a1']);
  });

  it('links to host array', () => {
    const challenge = { actionIds: [] };
    linkAction(challenge, 'h1', 'host');
    assert.deepEqual(challenge.actions.host, ['h1']);
    assert.deepEqual(challenge.actionIds, ['h1']);
  });

  it('links to playerIndividual with userId key', () => {
    const challenge = { actionIds: [] };
    linkAction(challenge, 'a2', 'playerIndividual', 'user123');
    assert.equal(challenge.actions.playerIndividual['user123'], 'a2');
    assert.deepEqual(challenge.actionIds, ['a2']);
  });

  it('links to tribe with roleId key', () => {
    const challenge = { actionIds: [] };
    linkAction(challenge, 'a3', 'tribe', 'role456');
    assert.equal(challenge.actions.tribe['role456'], 'a3');
    assert.deepEqual(challenge.actionIds, ['a3']);
  });

  it('initializes actions from legacy actionIds on first link', () => {
    const challenge = { actionIds: ['legacy1'] };
    linkAction(challenge, 'new1', 'host');
    assert.deepEqual(challenge.actions.playerAll, ['legacy1']);
    assert.deepEqual(challenge.actions.host, ['new1']);
    assert.equal(challenge.actionIds.length, 2);
    assert.ok(challenge.actionIds.includes('legacy1'));
    assert.ok(challenge.actionIds.includes('new1'));
  });

  it('does not duplicate in playerAll', () => {
    const challenge = { actions: { playerAll: ['a1'], playerIndividual: {}, tribe: {}, host: [] } };
    linkAction(challenge, 'a1', 'playerAll');
    assert.deepEqual(challenge.actions.playerAll, ['a1']);
  });

  it('does not duplicate in host', () => {
    const challenge = { actions: { playerAll: [], playerIndividual: {}, tribe: {}, host: ['h1'] } };
    linkAction(challenge, 'h1', 'host');
    assert.deepEqual(challenge.actions.host, ['h1']);
  });
});

describe('unlinkAction — remove from category', () => {
  it('removes from playerAll array', () => {
    const challenge = {
      actions: { playerAll: ['a1', 'a2'], playerIndividual: {}, tribe: {}, host: [] },
    };
    unlinkAction(challenge, 'a1', 'playerAll');
    assert.deepEqual(challenge.actions.playerAll, ['a2']);
    assert.deepEqual(challenge.actionIds, ['a2']);
  });

  it('removes from host array', () => {
    const challenge = {
      actions: { playerAll: [], playerIndividual: {}, tribe: {}, host: ['h1', 'h2'] },
    };
    unlinkAction(challenge, 'h1', 'host');
    assert.deepEqual(challenge.actions.host, ['h2']);
  });

  it('removes from playerIndividual by value lookup', () => {
    const challenge = {
      actions: { playerAll: [], playerIndividual: { u1: 'a1', u2: 'a2' }, tribe: {}, host: [] },
    };
    unlinkAction(challenge, 'a1', 'playerIndividual');
    assert.equal(challenge.actions.playerIndividual['u1'], undefined);
    assert.equal(challenge.actions.playerIndividual['u2'], 'a2');
    assert.deepEqual(challenge.actionIds, ['a2']);
  });

  it('removes from tribe by value lookup', () => {
    const challenge = {
      actions: { playerAll: [], playerIndividual: {}, tribe: { r1: 't1', r2: 't2' }, host: [] },
    };
    unlinkAction(challenge, 't1', 'tribe');
    assert.equal(challenge.actions.tribe['r1'], undefined);
    assert.equal(challenge.actions.tribe['r2'], 't2');
  });

  it('syncs actionIds after unlink', () => {
    const challenge = {
      actions: { playerAll: ['a1', 'a2'], playerIndividual: { u1: 'a3' }, tribe: {}, host: [] },
    };
    unlinkAction(challenge, 'a1', 'playerAll');
    assert.equal(challenge.actionIds.length, 2);
    assert.ok(challenge.actionIds.includes('a2'));
    assert.ok(challenge.actionIds.includes('a3'));
    assert.ok(!challenge.actionIds.includes('a1'));
  });

  it('no-ops for non-existent action in playerAll', () => {
    const challenge = {
      actions: { playerAll: ['a1'], playerIndividual: {}, tribe: {}, host: [] },
    };
    unlinkAction(challenge, 'nonexistent', 'playerAll');
    assert.deepEqual(challenge.actions.playerAll, ['a1']);
  });

  it('no-ops for non-existent action in playerIndividual', () => {
    const challenge = {
      actions: { playerAll: [], playerIndividual: { u1: 'a1' }, tribe: {}, host: [] },
    };
    unlinkAction(challenge, 'nonexistent', 'playerIndividual');
    assert.equal(challenge.actions.playerIndividual['u1'], 'a1');
  });
});

// ─────────────────────────────────────────────
// Tests — Full CRUD workflow
// ─────────────────────────────────────────────

describe('Full CRUD workflow — link, read, unlink', () => {
  it('complete lifecycle: legacy → link → read → unlink → verify sync', () => {
    // Start with legacy challenge
    const challenge = { actionIds: ['old1'] };

    // Link a new playerAll action
    linkAction(challenge, 'new1', 'playerAll');
    assert.deepEqual(challenge.actions.playerAll, ['old1', 'new1']);
    assert.equal(challenge.actionIds.length, 2);

    // Link individual player actions
    linkAction(challenge, 'ind1', 'playerIndividual', 'player_a');
    linkAction(challenge, 'ind2', 'playerIndividual', 'player_b');
    assert.equal(challenge.actionIds.length, 4);

    // Link tribe action
    linkAction(challenge, 'tri1', 'tribe', 'tribe_role');
    assert.equal(challenge.actionIds.length, 5);

    // Link host action
    linkAction(challenge, 'host1', 'host');
    assert.equal(challenge.actionIds.length, 6);

    // Read via getChallengeActions
    const actions = getChallengeActions(challenge);
    assert.deepEqual(actions.playerAll, ['old1', 'new1']);
    assert.deepEqual(actions.playerIndividual, { player_a: 'ind1', player_b: 'ind2' });
    assert.deepEqual(actions.tribe, { tribe_role: 'tri1' });
    assert.deepEqual(actions.host, ['host1']);

    // Unlink one individual
    unlinkAction(challenge, 'ind1', 'playerIndividual');
    assert.equal(challenge.actionIds.length, 5);
    assert.ok(!challenge.actionIds.includes('ind1'));
    assert.equal(challenge.actions.playerIndividual['player_a'], undefined);

    // Unlink legacy action from playerAll
    unlinkAction(challenge, 'old1', 'playerAll');
    assert.equal(challenge.actionIds.length, 4);
    assert.ok(!challenge.actionIds.includes('old1'));
  });
});

// ─────────────────────────────────────────────
// Tests — getChallengeActionSummary shape
// ─────────────────────────────────────────────

describe('getChallengeActionSummary — counts (replicated logic)', () => {
  function summarize(challenge) {
    const actions = getChallengeActions(challenge);
    const indEntries = Object.entries(actions.playerIndividual);
    const triEntries = Object.entries(actions.tribe);
    return {
      playerAll: { count: actions.playerAll.length, ids: actions.playerAll },
      playerIndividual: { count: indEntries.length, assignments: actions.playerIndividual },
      tribe: { count: triEntries.length, assignments: actions.tribe },
      host: { count: actions.host.length, ids: actions.host },
      total: actions.playerAll.length + indEntries.length + triEntries.length + actions.host.length,
    };
  }

  it('counts all categories', () => {
    const challenge = {
      actions: {
        playerAll: ['a1', 'a2'],
        playerIndividual: { u1: 'a3', u2: 'a4', u3: 'a5' },
        tribe: { r1: 'a6' },
        host: ['a7'],
      },
    };
    const summary = summarize(challenge);
    assert.equal(summary.playerAll.count, 2);
    assert.equal(summary.playerIndividual.count, 3);
    assert.equal(summary.tribe.count, 1);
    assert.equal(summary.host.count, 1);
    assert.equal(summary.total, 7);
  });

  it('returns zero counts for empty challenge', () => {
    const summary = summarize({});
    assert.equal(summary.total, 0);
    assert.equal(summary.playerAll.count, 0);
    assert.equal(summary.playerIndividual.count, 0);
    assert.equal(summary.tribe.count, 0);
    assert.equal(summary.host.count, 0);
  });

  it('counts legacy actionIds as playerAll', () => {
    const summary = summarize({ actionIds: ['x', 'y'] });
    assert.equal(summary.playerAll.count, 2);
    assert.equal(summary.total, 2);
  });
});
