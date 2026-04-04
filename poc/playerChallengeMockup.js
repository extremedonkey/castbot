/**
 * Player Challenge View — UI Mockup (PoC)
 *
 * Shows what players see in their /menu when challenges are active.
 * Based on real challenge: Hurley's Lotto Sweepstakes
 * Entry: Reece's Stuff → Experimental → "Player Chal"
 *
 * DELETE THIS FILE when the real player challenge UI is built.
 */

import { countComponents } from '../utils.js';

// ═══════════════════════════════════════════════════════════
// Stub Data — Player's perspective
// ═══════════════════════════════════════════════════════════

const PLAYER = {
  id: '391415444084490240',
  name: 'Reece',
  tribe: 'Balboa',
  tribeRoleId: '987654321098765432',
};

// Active challenge — Hurley's Lotto (Challenge 8, F11)
const ACTIVE_CHALLENGE = {
  title: '🎟️Hurleys Lotto Sweepstakes 🎟️',
  round: 'F11 — Challenge 8',
  accentColor: 65280,
  image: 'https://cdn.discordapp.com/attachments/1337754151655833694/1482701225597341837/image7215695x.png',
  description: `While gathering items in the scavenger hunt, you found Hurley's winning lottery ticket! You're feeling lucky today, and you want to know if you can match his winnings. \n\nYou're going to be buying lottery tickets, and the tribe with the most money at the end of the challenge will win immunity. \n\nEach player begins with $1000, and each ticket costs $100. Lottery tickets will earn you nothing ($0), a certain amount of money or make you lose all of your money. You must buy at least 1 ticket. \n\nYou can buy 1 or more tickets at the same time, and buying more than one ticket will make you earn the ticket value multiplied by the number of tickets bought. \n\n\n**Example Playthrough:**\n* You start with $1000\n* You decide to buy 3 tickets at once for $300 by typing the command ?buy-lottery-ticket 3. The ticket is a winning one, worth $200.\n* You type the amount of money you now have : $1000-$300 (buying the tickets) + $600 (3 tickets of $200) = $1300.\n* You decide next to buy 5 tickets by typing the command ?buy-lottery-ticket 5. The ticket is worth $0.\n* You type the amount of money you now have: $1300-500 (buying the tickets) + $0 (earnings) = $800\n\n**End of Challenge: **\n* The challenge ends when you buy a lottery ticket that says you've lost all of your money or;\n* If you're out of money or;\n* When you choose to end your challenge by typing ?done.\n\nYou are NOT allowed to discuss how much money you have or anything specific you did or saw during the challenge. However, you are welcome to discuss general strategy about the challenge.\n\nThe tribe with the most money at the end will win immunity. In case of a tie, the tribe who bought the most tickets overall will win. \nThe final amount of money earned by each player will be revealed at the end of the challenge.`,
  // Player sees these actions (playerAll category)
  playerActions: [
    { id: 'buy_lottery_ticket_734262', name: '🎰 Buy Lottery Tickets', emoji: '🎰', style: 1 },
    { id: 'done_challenge_889123', name: '✋ Done', emoji: '✋', style: 2 },
  ],
};

// Previous challenge — Tribal Jigsaw (Challenge 7, F12) — completed
const PREV_CHALLENGE = {
  title: '🧩 Tribal Jigsaw Race',
  round: 'F12 — Challenge 7',
  accentColor: 0x3498DB,
  description: `Each player receives a link to an online jigsaw puzzle. Complete it as fast as you can — your time is recorded automatically!\n\nYou may only attempt the puzzle **once**. The tribe with the lowest combined time wins immunity.`,
  status: 'completed',
  result: '✅ Completed in **34m 22s** — 3rd fastest',
};

// Challenge select options
const CHALLENGE_LIST = [
  { value: 'active_lotto', label: '🎟️ Hurleys Lotto Sweepstakes', description: 'F11 — Active', emoji: { name: '🟢' }, default: true },
  { value: 'completed_jigsaw', label: '🧩 Tribal Jigsaw Race', description: 'F12 — Completed', emoji: { name: '✅' } },
];

// ═══════════════════════════════════════════════════════════
// Active Challenge View — Player sees challenge + action buttons
// ═══════════════════════════════════════════════════════════

function buildActiveChallengeView() {
  const ch = ACTIVE_CHALLENGE;

  const components = [
    // Header
    { type: 10, content: `## 🏃 Challenges\n-# ${PLAYER.name} · ${PLAYER.tribe}` },
    { type: 14 },

    // Challenge selector
    { type: 1, components: [{
      type: 3,
      custom_id: 'pcmock_challenge_select',
      placeholder: 'Select a challenge...',
      options: CHALLENGE_LIST,
    }]},

    // Challenge content — same richCard pattern as host view
    { type: 14 },
    { type: 10, content: `# ${ch.title}\n-# ${ch.round} · 🟢 **Active**` },
    { type: 10, content: ch.description },
    { type: 12, items: [{ media: { url: ch.image }, description: ch.title }] },

    // Player action buttons — these are the challenge actions visible to this player
    { type: 14 },
    { type: 10, content: `-# Use these buttons to play the challenge:` },
    { type: 1, components: ch.playerActions.map(a => ({
      type: 2,
      custom_id: `pcmock_action_${a.id}`,
      label: a.name,
      style: a.style,
      emoji: { name: a.emoji },
    }))},

    // Nav
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'pcmock_back', label: '← Menu', style: 2 },
    ]},
  ];

  const container = {
    type: 17,
    accent_color: ch.accentColor,
    components,
  };

  const count = countComponents([container], { verbosity: 'full', label: 'Player Challenge (Active)' });
  console.log(`📊 Player Challenge (Active): ${count}/40 components`);
  return { components: [container] };
}

// ═══════════════════════════════════════════════════════════
// Completed Challenge View — Read-only, shows result
// ═══════════════════════════════════════════════════════════

function buildCompletedChallengeView() {
  const ch = PREV_CHALLENGE;

  const components = [
    // Header
    { type: 10, content: `## 🏃 Challenges\n-# ${PLAYER.name} · ${PLAYER.tribe}` },
    { type: 14 },

    // Challenge selector
    { type: 1, components: [{
      type: 3,
      custom_id: 'pcmock_challenge_select',
      placeholder: 'Select a challenge...',
      options: CHALLENGE_LIST.map(o => ({
        ...o,
        default: o.value === 'completed_jigsaw',
      })),
    }]},

    // Challenge content
    { type: 14 },
    { type: 10, content: `# ${ch.title}\n-# ${ch.round} · ✅ **Completed**` },
    { type: 10, content: ch.description },

    // Result
    { type: 14 },
    { type: 10, content: `### \`\`\`📊 Your Result\`\`\`\n${ch.result}` },

    // Nav
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'pcmock_back', label: '← Menu', style: 2 },
    ]},
  ];

  const container = {
    type: 17,
    accent_color: ch.accentColor,
    components,
  };

  const count = countComponents([container], { verbosity: 'full', label: 'Player Challenge (Completed)' });
  console.log(`📊 Player Challenge (Completed): ${count}/40 components`);
  return { components: [container] };
}

// ═══════════════════════════════════════════════════════════
// Action Response Mockup — What happens when player clicks a button
// ═══════════════════════════════════════════════════════════

function buildActionResponseMockup(actionId) {
  if (actionId === 'buy_lottery_ticket_734262') {
    // Simulates what the player would see after buying 3 tickets
    const container = {
      type: 17,
      accent_color: 65280,
      components: [
        { type: 10, content: `## 🎰 Lottery Results\n-# You bought **3 tickets** for $300` },
        { type: 14 },
        { type: 10, content: `🎰 **Winning ticket!** Each ticket is worth **$200**\n\n💰 Earnings: 3 × $200 = **$600**\n💸 Cost: 3 × $100 = **$300**\n\n📊 **Balance: $1,300**\n-# (was $1,000 → −$300 + $600)` },
        { type: 14 },
        { type: 10, content: `-# Buy more tickets or type ✋ Done when finished` },
        { type: 1, components: [
          { type: 2, custom_id: 'pcmock_back_to_challenge', label: '← Back to Challenge', style: 2 },
        ]},
      ],
    };
    countComponents([container], { verbosity: 'summary', label: 'Lottery Result' });
    return { components: [container] };
  }

  if (actionId === 'done_challenge_889123') {
    const container = {
      type: 17,
      accent_color: 65280,
      components: [
        { type: 10, content: `## ✋ Challenge Complete!\n-# 🎟️Hurleys Lotto Sweepstakes 🎟️` },
        { type: 14 },
        { type: 10, content: `You ended your lottery run.\n\n📊 **Final Balance: $1,300**\n🎫 **Tickets Purchased: 8**\n\n-# Your results have been recorded. The winning tribe will be announced when all players have finished.` },
        { type: 14 },
        { type: 1, components: [
          { type: 2, custom_id: 'pcmock_back_to_challenge', label: '← Back to Challenge', style: 2 },
        ]},
      ],
    };
    countComponents([container], { verbosity: 'summary', label: 'Done Result' });
    return { components: [container] };
  }

  return buildActiveChallengeView();
}

// ═══════════════════════════════════════════════════════════
// Interaction Handler
// ═══════════════════════════════════════════════════════════

export async function handlePlayerChallengeMockup(context) {
  const { customId, values } = context;

  // Entry point
  if (customId === 'pcmock_open') {
    return buildActiveChallengeView();
  }

  // Challenge selector
  if (customId === 'pcmock_challenge_select') {
    const selected = values?.[0];
    if (selected === 'completed_jigsaw') {
      return buildCompletedChallengeView();
    }
    return buildActiveChallengeView();
  }

  // Action button clicks — show result mockup
  if (customId.startsWith('pcmock_action_')) {
    const actionId = customId.replace('pcmock_action_', '');
    return buildActionResponseMockup(actionId);
  }

  // Back buttons
  if (customId === 'pcmock_back' || customId === 'pcmock_back_to_challenge') {
    return buildActiveChallengeView();
  }

  return buildActiveChallengeView();
}
