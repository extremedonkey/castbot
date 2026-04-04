/**
 * Challenge Action Categories — UI Mockup (PoC)
 *
 * Static mockup of the Phase 1B categorized action manager.
 * Based on real challenge: Hurley's Lotto Sweepstakes (challenge_a38ccad9c8e3)
 * Mirrors buildChallengeScreen layout exactly, with action categories integrated.
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
  id: 'challenge_a38ccad9c8e3',
  title: '🎟️Hurleys Lotto Sweepstakes 🎟️',
  accentColor: 65280,
  creationHost: '391415444084490240',
  image: 'https://cdn.discordapp.com/attachments/1337754151655833694/1482701225597341837/image7215695x.png',
  description: `While gathering items in the scavenger hunt, you found Hurley's winning lottery ticket! You're feeling lucky today, and you want to know if you can match his winnings. \n\nYou're going to be buying lottery tickets, and the tribe with the most money at the end of the challenge will win immunity. \n\nEach player begins with $1000, and each ticket costs $100. Lottery tickets will earn you nothing ($0), a certain amount of money or make you lose all of your money. You must buy at least 1 ticket. \n\nYou can buy 1 or more tickets at the same time, and buying more than one ticket will make you earn the ticket value multiplied by the number of tickets bought. \n\n\n**Example Playthrough:**\n* You start with $1000\n* You decide to buy 3 tickets at once for $300 by typing the command ?buy-lottery-ticket 3. The ticket is a winning one, worth $200.\n* You type the amount of money you now have : $1000-$300 (buying the tickets) + $600 (3 tickets of $200) = $1300.\n* You decide next to buy 5 tickets by typing the command ?buy-lottery-ticket 5. The ticket is worth $0.\n* You type the amount of money you now have: $1300-500 (buying the tickets) + $0 (earnings) = $800\n\n**End of Challenge: **\n* The challenge ends when you buy a lottery ticket that says you've lost all of your money or;\n* If you're out of money or;\n* When you choose to end your challenge by typing ?done.\n\nYou are NOT allowed to discuss how much money you have or anything specific you did or saw during the challenge. However, you are welcome to discuss general strategy about the challenge.\n\nThe tribe with the most money at the end will win immunity. In case of a tie, the tribe who bought the most tickets overall will win. \nThe final amount of money earned by each player will be revealed at the end of the challenge.`,
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

const STUB_CHALLENGE_LIST = [
  { id: 'challenge_a38ccad9c8e3', title: '🎟️Hurleys Lotto Sweepstakes 🎟️' },
  { id: 'challenge_88293a6c958f', title: 'Forbidden Island' },
  { id: 'challenge_7500643189a9', title: 'Spreadsheet Art' },
];

// ═══════════════════════════════════════════════════════════
// Category Section Builders (heading + select = 2 components each)
// ═══════════════════════════════════════════════════════════

function buildCategorySelect(categoryKey, actions) {
  const meta = CATEGORY_TYPES[categoryKey];
  const triggerLabels = { button: '🖱️ Button', button_input: '⌨️ User Input', button_modal: '🔐 Secret Code' };

  const options = [
    { label: '➕ Create New', value: `create_${categoryKey}`, emoji: { name: '➕' }, description: meta.description.substring(0, 100) },
  ];

  if (Array.isArray(actions) && actions.length > 0) {
    for (const a of actions) {
      options.push({
        label: `✅ ${a.name}`.substring(0, 100),
        value: `manage_${categoryKey}_${a.id}`,
        description: `${triggerLabels[a.trigger] || '🖱️ Button'} — select to manage`.substring(0, 100),
        emoji: { name: a.emoji || '⚡' },
      });
    }
  } else if (!Array.isArray(actions) || actions.length === 0) {
    options.push({
      label: 'No actions linked',
      value: `_noop_${categoryKey}`,
      description: 'Use ➕ Create New to add one',
    });
  }

  const count = Array.isArray(actions) ? actions.length : Object.keys(actions || {}).length;
  const placeholder = count > 0
    ? `${count} action${count === 1 ? '' : 's'} linked`
    : 'No actions — select to create...';

  return [
    { type: 10, content: `### \`\`\`${meta.emoji} ${meta.label}\`\`\`\n-# ${meta.description}` },
    { type: 1, components: [{
      type: 3,
      custom_id: `camock_cat_${categoryKey}`,
      placeholder,
      options: options.slice(0, 25),
    }]},
  ];
}

// ═══════════════════════════════════════════════════════════
// Main Mockup — Full Challenge Detail + Action Categories
// Mirrors buildChallengeScreen (challengeManager.js:107-242)
// ═══════════════════════════════════════════════════════════

export function buildChallengeActionMockup() {
  const ch = STUB_CHALLENGE;
  const totalActions = STUB_ACTIONS.playerAll.length + STUB_ACTIONS.host.length;

  // ── Challenge select (matches buildChallengeScreen lines 169-178) ──
  const selectOptions = STUB_CHALLENGE_LIST.map(c => ({
    label: c.title.substring(0, 100),
    value: c.id,
    emoji: { name: '🏃' },
    default: c.id === ch.id,
  }));
  selectOptions.unshift(
    { label: 'Create New Challenge', value: 'challenge_create_new', emoji: { name: '➕' }, description: 'Create a new challenge from scratch' },
  );

  const components = [
    // ── Header + challenge select ──
    { type: 10, content: '# 🏃 Challenges' },
    { type: 14 },
    { type: 1, components: [{
      type: 3,
      custom_id: 'camock_challenge_select',
      placeholder: 'Select or create a challenge...',
      options: selectOptions,
    }]},

    // ── Challenge preview (matches buildChallengeScreen lines 185-204) ──
    { type: 14 },
    { type: 10, content: `# ${ch.title}\n-# Host: <@${ch.creationHost}>` },
    { type: 10, content: ch.description },
    { type: 12, items: [{ media: { url: ch.image }, description: ch.title }] },
    { type: 10, content: `-# ⚡ ${totalActions} action${totalActions === 1 ? '' : 's'} linked` },

    // ── Challenge buttons (matches lines 207-218, ⚡ Actions removed) ──
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

    // ── Action Categories (replaces ⚡ Actions button) ──
    { type: 14 },
    ...buildCategorySelect('playerAll', STUB_ACTIONS.playerAll),
    { type: 14 },
    ...buildCategorySelect('playerIndividual', []),
    { type: 14 },
    ...buildCategorySelect('tribe', []),
    { type: 14 },
    ...buildCategorySelect('host', STUB_ACTIONS.host),

    // ── Navigation (matches lines 223-229) ──
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'camock_noop_menu', label: '← Menu', style: 2 },
      { type: 2, custom_id: 'camock_noop_library', label: 'Challenge Library', style: 2, emoji: { name: '📚' } },
    ]},
  ];

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

function buildManageScreen(actionName, emoji, category, outcomeDescription) {
  const meta = CATEGORY_TYPES[category];

  const container = {
    type: 17,
    accent_color: STUB_CHALLENGE.accentColor,
    components: [
      { type: 10, content: `## ${emoji} ${actionName}\n-# ${meta.emoji} ${meta.label} · **${STUB_CHALLENGE.title}**` },
      { type: 14 },
      { type: 10, content: outcomeDescription },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'camock_edit_action', label: 'Edit in Action Editor', style: 1, emoji: { name: '✏️' } },
        { type: 2, custom_id: 'camock_unlink_action', label: 'Unlink', style: 2, emoji: { name: '🔗' } },
        { type: 2, custom_id: 'camock_delete_action', label: 'Delete', style: 4, emoji: { name: '🗑️' } },
      ]},
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'camock_back_to_main', label: '← Back', style: 2 },
      ]},
    ],
  };

  countComponents([container], { verbosity: 'summary', label: 'Manage Action' });
  return { components: [container] };
}

// ═══════════════════════════════════════════════════════════
// Interaction Handler
// ═══════════════════════════════════════════════════════════

export async function handleChallengeActionMockup(context) {
  const { customId, values } = context;

  // Entry point
  if (customId === 'camock_open') {
    return buildChallengeActionMockup();
  }

  // Category select handlers
  if (customId.startsWith('camock_cat_')) {
    const selected = values?.[0];

    if (selected === 'manage_playerAll_buy_lottery_ticket_734262') {
      return buildManageScreen('🎰 Buy Lottery Tickets', '🎰', 'playerAll',
        '⌨️ **User Input** trigger — player clicks, enters number of tickets\n\n**Outcomes:**\n1. `give_currency` — deduct ticket cost ($100 × count)\n2. `random_outcome` — lottery result (win multiplier / $0 / lose all)\n3. `display_text` — show result and running balance\n\n-# Replaces `?buy-lottery-ticket 3`');
    }
    if (selected === 'manage_playerAll_done_challenge_889123') {
      return buildManageScreen('✋ Done', '✋', 'playerAll',
        '🖱️ **Button** trigger — player clicks to end their run\n\n**Outcomes:**\n1. `display_text` — confirm challenge ended, show final balance\n2. `apply_cooldown` — prevent further ticket purchases\n\n-# Replaces `?done`');
    }
    if (selected === 'manage_host_reveal_results_991234') {
      return buildManageScreen('📊 Reveal Results', '📊', 'host',
        '🖱️ **Button** trigger — host clicks to end the challenge\n\n**Outcomes:**\n1. `display_text` — post earnings leaderboard per player\n2. `display_text` — announce winning tribe\n\n-# Host-only: triggers in challenge channel');
    }

    // Create / noop — refresh main
    return buildChallengeActionMockup();
  }

  // Challenge select — refresh main
  if (customId === 'camock_challenge_select') {
    return buildChallengeActionMockup();
  }

  // Back / noop buttons — refresh main
  if (customId === 'camock_back_to_main' || customId.startsWith('camock_noop_')) {
    return buildChallengeActionMockup();
  }

  // Manage action buttons — refresh main
  if (customId === 'camock_edit_action' || customId === 'camock_unlink_action' || customId === 'camock_delete_action') {
    return buildChallengeActionMockup();
  }

  return buildChallengeActionMockup();
}
