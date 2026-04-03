/**
 * Challenge Action Categories — UI Mockup (PoC)
 *
 * Static mockup of the Phase 1B categorized action manager.
 * Uses stub data only — no real challenge or action loading.
 * Entry: Reece's Stuff → Experimental → "Chal Actions"
 *
 * DELETE THIS FILE when the real UI is built in challengeManager.js.
 */

import { countComponents } from '../utils.js';
import { CATEGORY_TYPES } from '../challengeActionCreate.js';

// ═══════════════════════════════════════════════════════════
// Stub Data
// ═══════════════════════════════════════════════════════════

const STUB_CHALLENGE = {
  title: 'Spreadsheet Art',
  description: 'Each player receives a unique Google Sheets link.\nCreate your masterpiece within 48 hours!',
  accentColor: 0x2ECC71,
  creationHost: '391415444084490240',
};

const STUB_ACTIONS = {
  playerAll: [],
  playerIndividual: {
    '391415444084490240': { id: 'sheet_reece_123456', name: 'Spreadsheet Art (Reece)' },
    '123456789012345678': { id: 'sheet_sarah_654321', name: 'Spreadsheet Art (Sarah)' },
  },
  tribe: {},
  host: {
    'host_results_789': { id: 'host_results_789', name: 'Post Results' },
  },
};

const STUB_PLAYERS = {
  '391415444084490240': 'Reece',
  '123456789012345678': 'Sarah',
  '111111111111111111': 'Tom',
  '222222222222222222': 'Alex',
  '333333333333333333': 'Jordan',
  '444444444444444444': 'Casey',
};

// ═══════════════════════════════════════════════════════════
// Main Mockup Screen — Categorized Action Manager
// ═══════════════════════════════════════════════════════════

function buildCategorySection(categoryKey, meta, data) {
  const components = [];

  if (categoryKey === 'playerAll') {
    const linked = data.playerAll || [];
    const options = [
      { label: '➕ Create New', value: 'create_playerAll', emoji: { name: '➕' }, description: 'Create a new action for all players' },
    ];
    if (linked.length === 0) {
      options.push({ label: 'No actions linked', value: '_noop', description: 'Use ➕ Create New to add one' });
    }
    components.push(
      { type: 10, content: `### \`\`\`${meta.emoji} ${meta.label}\`\`\`\n-# ${meta.description}` },
      { type: 1, components: [{
        type: 3,
        custom_id: 'camock_select_playerAll',
        placeholder: linked.length > 0 ? `${linked.length} action linked` : 'No actions — select to create...',
        options,
      }]},
    );
  }

  if (categoryKey === 'playerIndividual') {
    const assignments = data.playerIndividual || {};
    const assignedCount = Object.keys(assignments).length;
    const totalPlayers = Object.keys(STUB_PLAYERS).length;

    const options = [
      { label: '➕ Create for Players', value: 'create_playerIndividual', emoji: { name: '➕' }, description: 'Bulk-create actions for selected players' },
    ];

    // Show assigned players
    for (const [userId, actionData] of Object.entries(assignments)) {
      const name = STUB_PLAYERS[userId] || `<@${userId}>`;
      options.push({
        label: `✅ ${name}`,
        value: `manage_${userId}`,
        description: `${actionData.name} — select to manage`,
        emoji: { name: '👤' },
      });
    }

    // Show unassigned players
    for (const [userId, name] of Object.entries(STUB_PLAYERS)) {
      if (assignments[userId]) continue;
      if (options.length >= 25) break;
      options.push({
        label: `⬜ ${name}`,
        value: `assign_${userId}`,
        description: 'No action assigned',
        emoji: { name: '👤' },
      });
    }

    components.push(
      { type: 10, content: `### \`\`\`${meta.emoji} ${meta.label}\`\`\`\n-# ${meta.description}\n-# **${assignedCount}** of ${totalPlayers} players assigned` },
      { type: 1, components: [{
        type: 3,
        custom_id: 'camock_select_playerIndividual',
        placeholder: assignedCount > 0 ? `${assignedCount} of ${totalPlayers} players assigned` : 'No players assigned — select to create...',
        options,
      }]},
    );
  }

  if (categoryKey === 'tribe') {
    const assignments = data.tribe || {};
    const options = [
      { label: '➕ Create for Tribes', value: 'create_tribe', emoji: { name: '➕' }, description: 'Create actions for selected tribe roles' },
    ];
    if (Object.keys(assignments).length === 0) {
      options.push({ label: 'No tribe actions', value: '_noop_tribe', description: 'Use ➕ to assign tribe roles' });
    }
    components.push(
      { type: 10, content: `### \`\`\`${meta.emoji} ${meta.label}\`\`\`\n-# ${meta.description}` },
      { type: 1, components: [{
        type: 3,
        custom_id: 'camock_select_tribe',
        placeholder: 'No tribes assigned — select to create...',
        options,
      }]},
    );
  }

  if (categoryKey === 'host') {
    const hostActions = Object.values(data.host || {});
    const options = [
      { label: '➕ Create New', value: 'create_host', emoji: { name: '➕' }, description: 'Create a host automation action' },
    ];
    for (const action of hostActions) {
      options.push({
        label: `✅ ${action.name}`,
        value: `manage_host_${action.id}`,
        description: 'Select to manage (edit / unlink / delete)',
        emoji: { name: '🔧' },
      });
    }
    components.push(
      { type: 10, content: `### \`\`\`${meta.emoji} ${meta.label}\`\`\`\n-# ${meta.description}` },
      { type: 1, components: [{
        type: 3,
        custom_id: 'camock_select_host',
        placeholder: hostActions.length > 0 ? `${hostActions.length} host action${hostActions.length === 1 ? '' : 's'}` : 'No actions — select to create...',
        options,
      }]},
    );
  }

  return components;
}

export function buildChallengeActionMockup() {
  const ch = STUB_CHALLENGE;
  const components = [];

  // Header
  components.push(
    { type: 10, content: `## ⚡ Challenge Actions\n-# **${ch.title}**` },
  );

  // Category sections
  for (const [key, meta] of Object.entries(CATEGORY_TYPES)) {
    components.push({ type: 14 });
    components.push(...buildCategorySection(key, meta, { ...STUB_ACTIONS }));
  }

  // Navigation
  components.push(
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'camock_back', label: '← Back to Challenge', style: 2 },
    ]},
  );

  const container = {
    type: 17,
    accent_color: ch.accentColor,
    components,
  };

  const count = countComponents([container], { verbosity: 'full', label: 'Challenge Action Mockup' });
  console.log(`📊 Challenge Action Mockup: ${count}/40 components`);

  return { components: [container] };
}

// ═══════════════════════════════════════════════════════════
// Manage Action Sub-Screen (when selecting an assigned player/host action)
// ═══════════════════════════════════════════════════════════

export function buildManageActionMockup(actionName = 'Spreadsheet Art (Reece)', category = 'playerIndividual') {
  const categoryMeta = CATEGORY_TYPES[category] || CATEGORY_TYPES.playerAll;

  const container = {
    type: 17,
    accent_color: STUB_CHALLENGE.accentColor,
    components: [
      { type: 10, content: `## ⚡ Manage Action\n-# ${categoryMeta.emoji} ${categoryMeta.label}\n\n**${actionName}**` },
      { type: 10, content: `-# This is a \`display_text\` action that shows content when a player clicks the button.` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'camock_edit', label: 'Edit in Action Editor', style: 1, emoji: { name: '✏️' } },
        { type: 2, custom_id: 'camock_unlink', label: 'Unlink', style: 2, emoji: { name: '🔗' } },
        { type: 2, custom_id: 'camock_delete', label: 'Delete', style: 4, emoji: { name: '🗑️' } },
      ]},
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'camock_back_to_actions', label: '← Back to Actions', style: 2 },
      ]},
    ],
  };

  countComponents([container], { verbosity: 'summary', label: 'Manage Action Mockup' });
  return { components: [container] };
}

// ═══════════════════════════════════════════════════════════
// Interaction Handler
// ═══════════════════════════════════════════════════════════

export async function handleChallengeActionMockup(context) {
  const { customId, values } = context;

  if (customId === 'camock_open') {
    return buildChallengeActionMockup();
  }

  // Select handlers — all route back to main or show manage screen
  if (customId.startsWith('camock_select_')) {
    const selected = values?.[0];
    if (selected?.startsWith('manage_')) {
      const playerName = Object.values(STUB_PLAYERS).find((_, i) =>
        Object.keys(STUB_PLAYERS)[i] === selected.replace('manage_', '')
      ) || 'Unknown';
      return buildManageActionMockup(`Spreadsheet Art (${playerName})`, 'playerIndividual');
    }
    if (selected?.startsWith('manage_host_')) {
      return buildManageActionMockup('Post Results', 'host');
    }
    // Create/assign/noop — just refresh main screen
    return buildChallengeActionMockup();
  }

  // Back buttons
  if (customId === 'camock_back' || customId === 'camock_back_to_actions') {
    return buildChallengeActionMockup();
  }

  // Edit/unlink/delete — show main screen (stub)
  if (customId === 'camock_edit' || customId === 'camock_unlink' || customId === 'camock_delete') {
    return buildChallengeActionMockup();
  }

  // Fallback
  return buildChallengeActionMockup();
}
