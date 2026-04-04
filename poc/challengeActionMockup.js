/**
 * Challenge Action Categories — UI Mockup (PoC)
 *
 * Static mockup of the Phase 1B challenge action manager.
 * Based on real challenge: Hurley's Lotto Sweepstakes (challenge_a38ccad9c8e3)
 * Mirrors buildChallengeScreen layout with unified action select.
 * Entry: Reece's Stuff → Experimental → "Chal Actions"
 *
 * SELECT PATTERN: Follows createCustomActionSelectionUI() from customActionUI.js
 * (Create New, Search, Clone, then actions sorted by lastModified)
 * with type-indicating emojis: 🦸 Host, 🏃 Player, 🔥 Tribe
 *
 * DELETE THIS FILE when the real UI is built in challengeManager.js.
 */

import { countComponents } from '../utils.js';

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

// All challenge actions in one flat list — type emoji indicates category
// Sorted by lastModified (newest first) — same as createCustomActionSelectionUI
const STUB_ALL_ACTIONS = [
  { id: 'buy_lottery_ticket_734262', name: 'Buy Lottery Tickets', emoji: '🎰', type: 'player', description: 'Player enters ticket count · ⌨️ User Input · 3 outcomes', lastModified: 1774918900000 },
  { id: 'done_challenge_889123', name: 'Done', emoji: '✋', type: 'player', description: 'Player ends their challenge run · 🖱️ Button · 2 outcomes', lastModified: 1774918800000 },
  { id: 'reveal_results_991234', name: 'Reveal Results', emoji: '📊', type: 'host', description: 'Post final earnings leaderboard · 🖱️ Button · 2 outcomes', lastModified: 1774918700000 },
];

// Type → emoji mapping for select options
const TYPE_EMOJI = {
  player: '🏃',  // Player Challenge Actions
  host: '🦸',    // Prod/Host Challenge Actions
  tribe: '🔥',   // Tribe Challenge Actions
};

const STUB_CHALLENGE_LIST = [
  { id: 'challenge_a38ccad9c8e3', title: '🎟️Hurleys Lotto Sweepstakes 🎟️' },
  { id: 'challenge_88293a6c958f', title: 'Forbidden Island' },
  { id: 'challenge_7500643189a9', title: 'Spreadsheet Art' },
];

// ═══════════════════════════════════════════════════════════
// Main Mockup — Challenge Detail + Unified Action Select
// ═══════════════════════════════════════════════════════════

export function buildChallengeActionMockup() {
  const ch = STUB_CHALLENGE;

  // ── Challenge select (matches buildChallengeScreen) ──
  const challengeSelectOptions = STUB_CHALLENGE_LIST.map(c => ({
    label: c.title.substring(0, 100),
    value: c.id,
    emoji: { name: '🏃' },
    default: c.id === ch.id,
  }));
  challengeSelectOptions.unshift(
    { label: 'Create New Challenge', value: 'challenge_create_new', emoji: { name: '➕' }, description: 'Create a new challenge from scratch' },
  );

  // ── Action select (follows createCustomActionSelectionUI pattern) ──
  const actionOptions = [
    { label: '➕ Create New Challenge Action', value: 'create_new', description: 'Design a new action for this challenge', emoji: { name: '➕' } },
  ];
  if (STUB_ALL_ACTIONS.length > 10) {
    actionOptions.push({ label: '🔍 Search Actions', value: 'search_actions', description: 'Search through all challenge actions', emoji: { name: '🔍' } });
  }
  if (STUB_ALL_ACTIONS.length > 0) {
    actionOptions.push({ label: '🔄 Clone Action', value: 'clone_action', description: 'Duplicate an existing action', emoji: { name: '🔄' } });
  }

  // Actions sorted by lastModified (newest first)
  const sorted = [...STUB_ALL_ACTIONS].sort((a, b) => b.lastModified - a.lastModified);
  for (const action of sorted) {
    actionOptions.push({
      label: action.name.substring(0, 100),
      value: action.id,
      description: action.description.substring(0, 100),
      emoji: { name: action.emoji || '⚡' },
    });
  }

  const components = [
    // ── Header + challenge select ──
    { type: 10, content: '# 🏃 Challenges' },
    { type: 14 },
    { type: 1, components: [{
      type: 3,
      custom_id: 'challenge_select',
      placeholder: 'Select or create a challenge...',
      options: challengeSelectOptions,
    }]},

    // ── Challenge preview ──
    { type: 14 },
    { type: 10, content: `# ${ch.title}\n-# Host: <@${ch.creationHost}>` },
    { type: 10, content: ch.description },
    { type: 12, items: [{ media: { url: ch.image }, description: ch.title }] },

    // ── Challenge buttons (Edit, Round, Post, Publish, Delete) ──
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: `challenge_edit_${ch.id}`, label: 'Edit', style: 2, emoji: { name: '✏️' } },
      { type: 2, custom_id: `challenge_round_${ch.id}`, label: 'Round', style: 2, emoji: { name: '🔥' } },
      { type: 2, custom_id: `challenge_post_${ch.id}`, label: 'Post to Channel', style: 2, emoji: { name: '#️⃣' } },
    ]},
    { type: 1, components: [
      { type: 2, custom_id: `challenge_publish_${ch.id}`, label: 'Publish', style: 2, emoji: { name: '📤' } },
      { type: 2, custom_id: `challenge_delete_${ch.id}`, label: 'Delete', style: 4, emoji: { name: '🗑️' } },
    ]},

    // ── Unified Challenge Actions select ──
    { type: 14 },
    { type: 10, content: `### \`\`\`⚡ Challenge Actions\`\`\`\n-# Equivalent to carlbot \`?tags\` (but better!)` },
    { type: 1, components: [{
      type: 3,
      custom_id: 'camock_action_select',
      placeholder: `${STUB_ALL_ACTIONS.length} action${STUB_ALL_ACTIONS.length === 1 ? '' : 's'} · 🏃 Player  🦸 Host  🔥 Tribe`,
      options: actionOptions.slice(0, 25),
    }]},

    // ── Navigation ──
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 },
      { type: 2, custom_id: 'library_home', label: 'Challenge Library', style: 2, emoji: { name: '📚' } },
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
// Action Detail / Manage Screen (when selecting an action)
// ═══════════════════════════════════════════════════════════

function buildActionDetail(action) {
  const typeLabels = { player: '🏃 Player Action', host: '🦸 Host Action', tribe: '🔥 Tribe Action' };

  const container = {
    type: 17,
    accent_color: STUB_CHALLENGE.accentColor,
    components: [
      { type: 10, content: `## ${action.name}\n-# ${typeLabels[action.type] || '⚡ Action'} · **${STUB_CHALLENGE.title}**` },
      { type: 14 },
      { type: 10, content: action.detail },
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

  countComponents([container], { verbosity: 'summary', label: 'Action Detail' });
  return { components: [container] };
}

const ACTION_DETAILS = {
  buy_lottery_ticket_734262: {
    name: '🎰 Buy Lottery Tickets', type: 'player',
    detail: '⌨️ **User Input** trigger — player clicks, enters number of tickets\n\n**Outcomes:**\n1. `give_currency` — deduct ticket cost ($100 × count)\n2. `random_outcome` — lottery result (win multiplier / $0 / lose all)\n3. `display_text` — show result and running balance\n\n-# Replaces `?buy-lottery-ticket 3`',
  },
  done_challenge_889123: {
    name: '✋ Done', type: 'player',
    detail: '🖱️ **Button** trigger — player clicks to end their run\n\n**Outcomes:**\n1. `display_text` — confirm challenge ended, show final balance\n2. `apply_cooldown` — prevent further ticket purchases\n\n-# Replaces `?done`',
  },
  reveal_results_991234: {
    name: '📊 Reveal Results', type: 'host',
    detail: '🖱️ **Button** trigger — host clicks to end the challenge\n\n**Outcomes:**\n1. `display_text` — post earnings leaderboard per player\n2. `display_text` — announce winning tribe\n\n-# Host-only: triggers in challenge channel',
  },
};

// ═══════════════════════════════════════════════════════════
// Interaction Handler
// ═══════════════════════════════════════════════════════════

export async function handleChallengeActionMockup(context) {
  const { customId, values } = context;

  if (customId === 'camock_open') {
    return buildChallengeActionMockup();
  }

  // Action select
  if (customId === 'camock_action_select') {
    const selected = values?.[0];
    if (selected && ACTION_DETAILS[selected]) {
      return buildActionDetail(ACTION_DETAILS[selected]);
    }
    return buildChallengeActionMockup();
  }

  // Back from action detail — refresh main
  if (customId === 'camock_back_to_main') {
    return buildChallengeActionMockup();
  }

  // Manage action buttons — refresh main (stub)
  if (customId === 'camock_edit_action' || customId === 'camock_unlink_action' || customId === 'camock_delete_action') {
    return buildChallengeActionMockup();
  }

  return buildChallengeActionMockup();
}
