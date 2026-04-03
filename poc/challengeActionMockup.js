/**
 * Challenge Action Categories — UI Mockup (PoC)
 *
 * Static mockup of the Phase 1B categorized action manager.
 * Based on real challenge: Hurley's Lotto Sweepstakes (challenge_a38ccad9c8e3)
 * Entry: Reece's Stuff → Experimental → "Chal Actions"
 *
 * DELETE THIS FILE when the real UI is built in challengeManager.js.
 */

import { countComponents } from '../utils.js';
import { CATEGORY_TYPES } from '../challengeActionCreate.js';

// ═══════════════════════════════════════════════════════════
// Stub Data — based on real Hurley's Lotto Sweepstakes
// ═══════════════════════════════════════════════════════════

const STUB_CHALLENGE = {
  title: '🎟️Hurleys Lotto Sweepstakes 🎟️',
  accentColor: 65280, // bright green
  creationHost: '391415444084490240',
  image: 'https://cdn.discordapp.com/attachments/1337754151655833694/1482701225597341837/image7215695x.png',
};

// Mapping the ?commands from the challenge description to action categories:
// ?buy-lottery-ticket 3  → Player Action All (everyone uses same command)
// ?done                  → Player Action All (everyone uses same command)
// Host: reveal results   → Host Action (host triggers at end of challenge)
const STUB_ACTIONS = {
  playerAll: [
    { id: 'buy_lottery_ticket_734262', name: '🎰 Buy Lottery Tickets', emoji: '🎰', trigger: 'button_input', description: 'Replaces ?buy-lottery-ticket — player enters ticket count' },
    { id: 'done_challenge_889123', name: '✋ Done', emoji: '✋', trigger: 'button', description: 'Replaces ?done — player ends their challenge run' },
  ],
  playerIndividual: {},
  tribe: {},
  host: [
    { id: 'reveal_results_991234', name: '📊 Reveal Results', emoji: '📊', trigger: 'button', description: 'Post final earnings per player to challenge channel' },
  ],
};

// 18 players (realistic season size)
const STUB_PLAYERS = [
  'Reece', 'Sarah', 'Tom', 'Alex', 'Jordan', 'Casey',
  'Morgan', 'Taylor', 'Riley', 'Quinn', 'Avery', 'Parker',
  'Hayden', 'Drew', 'Sage', 'Rowan', 'Blake', 'Cameron',
];

// ═══════════════════════════════════════════════════════════
// Main Mockup — Categorized Action Manager
// ═══════════════════════════════════════════════════════════

function buildPlayerAllSection(actions) {
  const triggerLabels = { button: '🖱️ Button', button_input: '⌨️ User Input', button_modal: '🔐 Secret Code' };
  const options = [
    { label: '➕ Create New', value: 'create_playerAll', emoji: { name: '➕' }, description: 'Same action for all players (e.g., ?buy-lottery-ticket)' },
  ];
  for (const a of actions) {
    options.push({
      label: `✅ ${a.name}`,
      value: `manage_pa_${a.id}`,
      description: `${triggerLabels[a.trigger] || '🖱️ Button'} — select to manage`,
      emoji: { name: a.emoji },
    });
  }
  return [
    { type: 10, content: `### \`\`\`${CATEGORY_TYPES.playerAll.emoji} ${CATEGORY_TYPES.playerAll.label}\`\`\`\n-# ${CATEGORY_TYPES.playerAll.description}` },
    { type: 1, components: [{
      type: 3,
      custom_id: 'camock_select_playerAll',
      placeholder: actions.length > 0 ? `${actions.length} action${actions.length === 1 ? '' : 's'} linked` : 'No actions — select to create...',
      options,
    }]},
  ];
}

function buildPlayerIndividualSection(assignments, totalPlayers) {
  const assignedCount = Object.keys(assignments).length;
  const options = [
    { label: '➕ Create for Players', value: 'create_playerIndividual', emoji: { name: '➕' }, description: 'Bulk-create individual actions for selected players' },
  ];

  // This challenge doesn't use individual actions — show empty state
  if (assignedCount === 0) {
    options.push({
      label: 'No individual actions',
      value: '_noop_ind',
      description: 'Not needed for this challenge type',
    });
  }

  return [
    { type: 10, content: `### \`\`\`${CATEGORY_TYPES.playerIndividual.emoji} ${CATEGORY_TYPES.playerIndividual.label}\`\`\`\n-# ${CATEGORY_TYPES.playerIndividual.description}` },
    { type: 1, components: [{
      type: 3,
      custom_id: 'camock_select_playerIndividual',
      placeholder: assignedCount > 0 ? `${assignedCount} of ${totalPlayers} assigned` : 'Not used — select to create if needed...',
      options,
    }]},
  ];
}

function buildTribeSection(assignments) {
  const assignedCount = Object.keys(assignments).length;
  const options = [
    { label: '➕ Create for Tribes', value: 'create_tribe', emoji: { name: '➕' }, description: 'Create actions for selected tribe roles' },
  ];
  if (assignedCount === 0) {
    options.push({
      label: 'No tribe actions',
      value: '_noop_tribe',
      description: 'Not needed for this challenge type',
    });
  }
  return [
    { type: 10, content: `### \`\`\`${CATEGORY_TYPES.tribe.emoji} ${CATEGORY_TYPES.tribe.label}\`\`\`\n-# ${CATEGORY_TYPES.tribe.description}` },
    { type: 1, components: [{
      type: 3,
      custom_id: 'camock_select_tribe',
      placeholder: 'Not used — select to create if needed...',
      options,
    }]},
  ];
}

function buildHostSection(actions) {
  const options = [
    { label: '➕ Create New', value: 'create_host', emoji: { name: '➕' }, description: 'Automate host tasks (e.g., reveal results)' },
  ];
  for (const a of actions) {
    options.push({
      label: `✅ ${a.name}`,
      value: `manage_host_${a.id}`,
      description: `${a.description || 'Select to manage'}`,
      emoji: { name: a.emoji },
    });
  }
  return [
    { type: 10, content: `### \`\`\`${CATEGORY_TYPES.host.emoji} ${CATEGORY_TYPES.host.label}\`\`\`\n-# ${CATEGORY_TYPES.host.description}` },
    { type: 1, components: [{
      type: 3,
      custom_id: 'camock_select_host',
      placeholder: actions.length > 0 ? `${actions.length} host action${actions.length === 1 ? '' : 's'}` : 'No actions — select to create...',
      options,
    }]},
  ];
}

export function buildChallengeActionMockup() {
  const ch = STUB_CHALLENGE;
  const totalActions = STUB_ACTIONS.playerAll.length + STUB_ACTIONS.host.length;

  const components = [
    // Header — shows challenge context
    { type: 10, content: `## ⚡ Challenge Actions\n-# **${ch.title}**\n-# ${totalActions} action${totalActions === 1 ? '' : 's'} linked · Host: <@${ch.creationHost}>` },
  ];

  // Challenge image thumbnail
  if (ch.image) {
    components.push({
      type: 9, // Section
      components: [{ type: 10, content: `-# Manage the actions players and hosts use during this challenge. Actions replace Carlbot \`?commands\` with interactive buttons.` }],
      accessory: { type: 11, media: { url: ch.image } },
    });
  }

  // Player All — this challenge's main actions
  components.push({ type: 14 });
  components.push(...buildPlayerAllSection(STUB_ACTIONS.playerAll));

  // Individual — empty for this challenge type
  components.push({ type: 14 });
  components.push(...buildPlayerIndividualSection(STUB_ACTIONS.playerIndividual, STUB_PLAYERS.length));

  // Tribe — empty for this challenge type
  components.push({ type: 14 });
  components.push(...buildTribeSection(STUB_ACTIONS.tribe));

  // Host actions
  components.push({ type: 14 });
  components.push(...buildHostSection(STUB_ACTIONS.host));

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
// Manage Action Sub-Screen
// ═══════════════════════════════════════════════════════════

function buildManageScreen(actionName, emoji, category, description) {
  const categoryMeta = CATEGORY_TYPES[category];

  const container = {
    type: 17,
    accent_color: STUB_CHALLENGE.accentColor,
    components: [
      { type: 10, content: `## ${emoji} ${actionName}\n-# ${categoryMeta.emoji} ${categoryMeta.label} · **${STUB_CHALLENGE.title}**` },
      { type: 14 },
      { type: 10, content: description },
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

  if (customId.startsWith('camock_select_')) {
    const selected = values?.[0];

    // Player All action management
    if (selected === 'manage_pa_buy_lottery_ticket_734262') {
      return buildManageScreen(
        '🎰 Buy Lottery Tickets', '🎰', 'playerAll',
        '⌨️ **User Input** trigger — player clicks, enters number of tickets\n\n**Outcomes:**\n1. `give_currency` — deduct ticket cost ($100 × count)\n2. `random_outcome` — lottery result (win multiplier / $0 / lose all)\n3. `display_text` — show result and running balance\n\n-# Replaces `?buy-lottery-ticket 3`',
      );
    }
    if (selected === 'manage_pa_done_challenge_889123') {
      return buildManageScreen(
        '✋ Done', '✋', 'playerAll',
        '🖱️ **Button** trigger — player clicks to end their run\n\n**Outcomes:**\n1. `display_text` — confirm challenge ended, show final balance\n2. `apply_cooldown` — prevent further ticket purchases\n\n-# Replaces `?done`',
      );
    }

    // Host action management
    if (selected === 'manage_host_reveal_results_991234') {
      return buildManageScreen(
        '📊 Reveal Results', '📊', 'host',
        '🖱️ **Button** trigger — host clicks to end the challenge\n\n**Outcomes:**\n1. `display_text` — post earnings leaderboard per player\n2. `display_text` — announce winning tribe\n\n-# Host-only: triggers in challenge channel',
      );
    }

    return buildChallengeActionMockup();
  }

  if (customId === 'camock_back' || customId === 'camock_back_to_actions') {
    return buildChallengeActionMockup();
  }

  if (customId === 'camock_edit' || customId === 'camock_unlink' || customId === 'camock_delete') {
    return buildChallengeActionMockup();
  }

  return buildChallengeActionMockup();
}
