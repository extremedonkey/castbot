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
// Stub Data — from real challenge_a38ccad9c8e3
// ═══════════════════════════════════════════════════════════

const STUB_CHALLENGE = {
  title: '🎟️Hurleys Lotto Sweepstakes 🎟️',
  accentColor: 65280,
  creationHost: '391415444084490240',
  image: 'https://cdn.discordapp.com/attachments/1337754151655833694/1482701225597341837/image7215695x.png',
  description: `While gathering items in the scavenger hunt, you found Hurley's winning lottery ticket! You're feeling lucky today, and you want to know if you can match his winnings.

You're going to be buying lottery tickets, and the tribe with the most money at the end of the challenge will win immunity.

Each player begins with $1000, and each ticket costs $100. Lottery tickets will earn you nothing ($0), a certain amount of money or make you lose all of your money. You must buy at least 1 ticket.

You can buy 1 or more tickets at the same time, and buying more than one ticket will make you earn the ticket value multiplied by the number of tickets bought.


**Example Playthrough:**
* You start with $1000
* You decide to buy 3 tickets at once for $300 by typing the command ?buy-lottery-ticket 3. The ticket is a winning one, worth $200.
* You type the amount of money you now have : $1000-$300 (buying the tickets) + $600 (3 tickets of $200) = $1300.
* You decide next to buy 5 tickets by typing the command ?buy-lottery-ticket 5. The ticket is worth $0.
* You type the amount of money you now have: $1300-500 (buying the tickets) + $0 (earnings) = $800

**End of Challenge: **
* The challenge ends when you buy a lottery ticket that says you've lost all of your money or;
* If you're out of money or;
* When you choose to end your challenge by typing ?done.

You are NOT allowed to discuss how much money you have or anything specific you did or saw during the challenge. However, you are welcome to discuss general strategy about the challenge.

The tribe with the most money at the end will win immunity. In case of a tie, the tribe who bought the most tickets overall will win.
The final amount of money earned by each player will be revealed at the end of the challenge.`,
};

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

// ═══════════════════════════════════════════════════════════
// Category Section Builders
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

function buildPlayerIndividualSection() {
  const options = [
    { label: '➕ Create for Players', value: 'create_playerIndividual', emoji: { name: '➕' }, description: 'Bulk-create individual actions for selected players' },
    { label: 'No individual actions', value: '_noop_ind', description: 'Not needed for this challenge type' },
  ];
  return [
    { type: 10, content: `### \`\`\`${CATEGORY_TYPES.playerIndividual.emoji} ${CATEGORY_TYPES.playerIndividual.label}\`\`\`\n-# ${CATEGORY_TYPES.playerIndividual.description}` },
    { type: 1, components: [{
      type: 3,
      custom_id: 'camock_select_playerIndividual',
      placeholder: 'Not used — select to create if needed...',
      options,
    }]},
  ];
}

function buildTribeSection() {
  const options = [
    { label: '➕ Create for Tribes', value: 'create_tribe', emoji: { name: '➕' }, description: 'Create actions for selected tribe roles' },
    { label: 'No tribe actions', value: '_noop_tribe', description: 'Not needed for this challenge type' },
  ];
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

// ═══════════════════════════════════════════════════════════
// Main Mockup — Challenge Detail + Action Categories
// Mirrors buildChallengeScreen pattern exactly
// ═══════════════════════════════════════════════════════════

export function buildChallengeActionMockup() {
  const ch = STUB_CHALLENGE;
  const totalActions = STUB_ACTIONS.playerAll.length + STUB_ACTIONS.host.length;

  const components = [];

  // ── Challenge Preview (same as buildChallengeScreen lines 185-198) ──
  const titleText = ch.title.startsWith('#') ? ch.title : `# ${ch.title}`;
  const hostText = ch.creationHost ? `-# Host: <@${ch.creationHost}>` : '';
  components.push({ type: 10, content: `${titleText}\n${hostText}` });

  if (ch.description) {
    components.push({ type: 10, content: ch.description });
  }

  if (ch.image) {
    components.push({ type: 12, items: [{ media: { url: ch.image }, description: ch.title }] });
  }

  // ── Action count summary ──
  components.push({ type: 10, content: `-# ⚡ ${totalActions} action${totalActions === 1 ? '' : 's'} linked` });

  // ── Challenge buttons (same as buildChallengeScreen lines 207-218, minus ⚡ Actions) ──
  components.push(
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'camock_noop_edit', label: 'Edit', style: 2, emoji: { name: '✏️' } },
      { type: 2, custom_id: 'camock_noop_round', label: 'Round', style: 2, emoji: { name: '🔥' } },
      { type: 2, custom_id: 'camock_noop_post', label: 'Post to Channel', style: 2, emoji: { name: '#️⃣' } },
    ]},
    { type: 1, components: [
      { type: 2, custom_id: 'camock_noop_publish', label: 'Publish', style: 2, emoji: { name: '📤' } },
      { type: 2, custom_id: 'camock_noop_delete', label: 'Delete', style: 4, emoji: { name: '🗑️' } },
    ]},
  );

  // ── Action Categories ──
  components.push({ type: 14 });
  components.push(...buildPlayerAllSection(STUB_ACTIONS.playerAll));

  components.push({ type: 14 });
  components.push(...buildPlayerIndividualSection());

  components.push({ type: 14 });
  components.push(...buildTribeSection());

  components.push({ type: 14 });
  components.push(...buildHostSection(STUB_ACTIONS.host));

  // ── Navigation ──
  components.push(
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'camock_back', label: '← Menu', style: 2 },
      { type: 2, custom_id: 'camock_noop_library', label: 'Challenge Library', style: 2, emoji: { name: '📚' } },
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

  // Noop buttons (Edit, Round, Post, Publish, Delete, Library) — just refresh
  if (customId.startsWith('camock_noop_')) {
    return buildChallengeActionMockup();
  }

  return buildChallengeActionMockup();
}
