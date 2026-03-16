/**
 * D20 Dice Roll System — D&D-style probability for Actions
 *
 * Provides both:
 * 1. Random Probability condition type (pass/fail based on %)
 * 2. D20 Dice Roll outcome type (full D&D experience with modifiers, crits, nat 1s)
 *
 * The condition determines pass/fail. The outcome TYPE is the theatrical display.
 */

import { buildRichCardContainer, parseAccentColor } from './richCardUI.js';

// ─── D20 Constants ───
const CRIT_SUCCESS = 20;  // Natural 20
const CRIT_FAIL = 1;      // Natural 1
const D20_ACCENT_PASS = 0x4ade80;    // Green
const D20_ACCENT_FAIL = 0xe74c3c;    // Red
const D20_ACCENT_CRIT = 0xffd700;    // Gold
const D20_ACCENT_FUMBLE = 0x8b0000;  // Dark red
const D20_ACCENT_NEUTRAL = 0x5865F2; // Blurple

// ─── Roll Descriptions ───
const CRIT_DESCRIPTIONS = [
  "⚡ **CRITICAL HIT!** The gods smile upon you!",
  "⚡ **NATURAL 20!** Legendary! The tavern erupts in cheers!",
  "⚡ **CRITICAL SUCCESS!** You've transcended mortal limits!",
  "⚡ **NAT 20!** The bards will sing of this moment!",
  "⚡ **PERFECT ROLL!** Even the Dungeon Master is impressed!",
];

const FUMBLE_DESCRIPTIONS = [
  "💀 **CRITICAL FAIL!** You trip over your own feet...",
  "💀 **NATURAL 1!** Catastrophic! The dice gods have forsaken you!",
  "💀 **FUMBLE!** Your weapon flies from your hands!",
  "💀 **NAT 1!** A legendary disaster! The bards will mock this forever!",
  "💀 **CRITICAL MISS!** Everything that could go wrong, did.",
];

const PASS_DESCRIPTIONS = [
  "The dice favor you today, adventurer.",
  "A solid roll! Fortune smiles upon the bold.",
  "Success! Your training has paid off.",
  "Well played! The odds were in your favor.",
];

const FAIL_DESCRIPTIONS = [
  "Not this time, adventurer. The dice are cruel.",
  "So close, yet so far. Better luck next encounter.",
  "The fates have other plans for you today.",
  "A narrow miss. Regroup and try again.",
];

// ─── Dice Art ───
const DICE_FACES = {
  1:  '⚀', 2:  '⚁', 3:  '⚂', 4:  '⚃', 5:  '⚄', 6:  '⚅',
};

/**
 * Roll a d20 and determine pass/fail with modifiers.
 * @param {number} passThreshold - DC (Difficulty Class), 1-20
 * @param {number} modifier - Bonus/penalty to the roll
 * @returns {Object} Full roll result
 */
export function rollD20(passThreshold = 11, modifier = 0) {
  const naturalRoll = Math.floor(Math.random() * 20) + 1; // 1-20
  const modifiedRoll = naturalRoll + modifier;
  const isCritSuccess = naturalRoll === CRIT_SUCCESS;
  const isCritFail = naturalRoll === CRIT_FAIL;

  // Nat 20 always passes, Nat 1 always fails, regardless of DC
  const passed = isCritSuccess ? true : isCritFail ? false : modifiedRoll >= passThreshold;

  return {
    naturalRoll,
    modifier,
    modifiedRoll,
    passThreshold,
    passed,
    isCritSuccess,
    isCritFail,
    timestamp: Date.now(),
  };
}

/**
 * Roll a simple percentage (0-100) for the probability condition.
 * @param {number} passPercent - Chance of passing (0-100)
 * @returns {Object} Roll result
 */
export function rollProbability(passPercent = 50) {
  const roll = Math.random() * 100;
  const passed = roll < passPercent;

  return {
    rolled: Math.round(roll * 100) / 100,
    threshold: passPercent,
    failThreshold: Math.round((100 - passPercent) * 100) / 100,
    passed,
    timestamp: Date.now(),
  };
}

/**
 * Build the D20 dice roll result display — the theatrical output.
 * This is the fun part.
 */
export function buildD20ResultDisplay(result, config = {}) {
  const { naturalRoll, modifier, modifiedRoll, passThreshold, passed, isCritSuccess, isCritFail } = result;

  // Pick flavor text
  let flavorText, accent;
  if (isCritSuccess) {
    flavorText = CRIT_DESCRIPTIONS[Math.floor(Math.random() * CRIT_DESCRIPTIONS.length)];
    accent = D20_ACCENT_CRIT;
  } else if (isCritFail) {
    flavorText = FUMBLE_DESCRIPTIONS[Math.floor(Math.random() * FUMBLE_DESCRIPTIONS.length)];
    accent = D20_ACCENT_FUMBLE;
  } else if (passed) {
    flavorText = PASS_DESCRIPTIONS[Math.floor(Math.random() * PASS_DESCRIPTIONS.length)];
    accent = D20_ACCENT_PASS;
  } else {
    flavorText = FAIL_DESCRIPTIONS[Math.floor(Math.random() * FAIL_DESCRIPTIONS.length)];
    accent = D20_ACCENT_FAIL;
  }

  // Build the roll breakdown
  const modSign = modifier >= 0 ? '+' : '';
  const modText = modifier !== 0 ? ` ${modSign}${modifier}` : '';
  const resultEmoji = passed ? '🟢' : '🔴';
  const resultText = passed ? 'PASS' : 'FAIL';
  const critBadge = isCritSuccess ? ' 👑' : isCritFail ? ' 💀' : '';

  // The dice display — big dramatic reveal
  const diceDisplay = `# 🎲 ${naturalRoll}${critBadge}`;
  const rollBreakdown = modifier !== 0
    ? `**Roll:** \`${naturalRoll}\`${modText} = **${modifiedRoll}** vs DC **${passThreshold}**`
    : `**Roll:** \`${naturalRoll}\` vs DC **${passThreshold}**`;

  const components = [
    { type: 10, content: diceDisplay },
    { type: 10, content: `${flavorText}\n\n${rollBreakdown}\n${resultEmoji} **${resultText}**` },
  ];

  // Add pass/fail result card if configured
  const resultConfig = passed ? config.passResult : config.failResult;
  if (resultConfig?.title || resultConfig?.description) {
    components.push({ type: 14 });
    components.push({ type: 10, content: `${resultConfig.title || ''}\n${resultConfig.description || ''}` });
    if (resultConfig.image) {
      try {
        new URL(resultConfig.image);
        components.push({ type: 12, items: [{ media: { url: resultConfig.image } }] });
      } catch { /* skip */ }
    }
  }

  return {
    type: 17,
    accent_color: resultConfig?.accentColor || accent,
    components
  };
}

/**
 * Build the compact probability result display.
 */
export function buildProbabilityResultDisplay(result, config = {}, mode = 'probability_text') {
  const { rolled, threshold, passed } = result;
  const resultEmoji = passed ? '🟢' : '🔴';
  const resultText = passed ? 'PASS' : 'FAIL';

  if (mode === 'silent') return null;

  if (mode === 'probability_only') {
    // Compact dice roll card
    return {
      type: 17,
      accent_color: 0x2a2a4a,
      components: [
        { type: 10, content: `🎲 **Roll:** ${rolled.toFixed(2)}% — **Threshold:** ${threshold}% — ${resultEmoji} **${resultText}**` },
      ]
    };
  }

  // probability_text or text_only
  const resultConfig = passed ? config.passResult : config.failResult;
  const components = [];

  if (mode === 'probability_text') {
    components.push({ type: 10, content: `🎲 **Roll:** ${rolled.toFixed(2)}% — **Threshold:** ${threshold}% — ${resultEmoji} **${resultText}**` });
  }

  if (resultConfig?.title || resultConfig?.description) {
    if (components.length > 0) components.push({ type: 14 });
    components.push({ type: 10, content: `${resultConfig.title || ''}\n${resultConfig.description || ''}` });
    if (resultConfig.image) {
      try {
        new URL(resultConfig.image);
        components.push({ type: 12, items: [{ media: { url: resultConfig.image } }] });
      } catch { /* skip */ }
    }
  }

  return {
    type: 17,
    accent_color: resultConfig?.accentColor || (passed ? D20_ACCENT_PASS : D20_ACCENT_FAIL),
    components
  };
}

/**
 * Build the D20 configuration UI for the Action Editor.
 * This is the admin screen where hosts set up the dice roll.
 */
export function buildD20ConfigUI(actionId, conditionIndex, config = {}) {
  const passThreshold = config.passThreshold || 11;
  const modifier = config.modifier || 0;
  const passPercent = Math.round(((21 - passThreshold) / 20) * 100);
  const failPercent = 100 - passPercent;
  const displayMode = config.displayMode || 'full';

  const passResult = config.passResult || { title: '🟢 Success!', description: 'You passed the check.' };
  const failResult = config.failResult || { title: '🔴 Failure!', description: 'You failed the check.' };

  const dcDescriptions = {
    5: 'Very Easy', 10: 'Easy', 11: 'Medium',
    15: 'Hard', 20: 'Very Hard', 25: 'Nearly Impossible'
  };
  const dcLabel = dcDescriptions[passThreshold] || (passThreshold <= 5 ? 'Trivial' : passThreshold >= 20 ? 'Legendary' : 'Custom');

  return {
    components: [{
      type: 17,
      accent_color: D20_ACCENT_NEUTRAL,
      components: [
        { type: 10, content: `## 🎲 Random Probability Configuration` },
        { type: 14 },
        { type: 10, content: `When the ⚡ Action is executed, randomise the chance of this condition passing or failing.\n\nIf multiple different types of conditions are set, random probability will evaluate alongside those conditions.\n\n> __Example__\n> Condition #1: Player must have \`🗡️ Sword of 1000 Truths\`\n> Condition #2: Player has a 75% chance of a 🟢 Pass Outcome\n> -# In the example above, the Fail Outcomes will always run if the player does not have the Sword of 1000 Truths.\n> -# But even if the player has the item, they still have a 1 in 4 shot of failing due to the random probability.` },
        { type: 14 },
        // Display mode
        { type: 10, content: `**Display Mode**\nHow should probability results be displayed?` },
        { type: 1, components: [{
          type: 3,
          custom_id: `prob_display_mode_${actionId}_${conditionIndex}`,
          placeholder: 'Select display mode...',
          options: [
            { label: 'Probability + Display Text', value: 'probability_text', emoji: { name: '📊' }, description: 'Shows dice roll result + pass/fail card', default: displayMode === 'probability_text' },
            { label: 'Display Text Only', value: 'text_only', emoji: { name: '📊' }, description: 'Shows only the pass/fail result card', default: displayMode === 'text_only' },
            { label: 'Probability Only', value: 'probability_only', emoji: { name: '🎲' }, description: 'Compact card with roll % and result', default: displayMode === 'probability_only' },
            { label: 'Silent', value: 'silent', emoji: { name: '🔇' }, description: 'No output — result captured in logs only', default: displayMode === 'silent' },
          ]
        }]},
        { type: 14 },
        // Pass probability
        {
          type: 9,
          components: [{ type: 10, content: `**🟢 Probability of Pass outcome**\n${passPercent}% — ${passPercent === 100 ? 'Always passes' : passPercent === 0 ? 'Never passes' : `~${Math.round(20 * passPercent / 100)} in 20 rolls will succeed`}` }],
          accessory: { type: 2, custom_id: `prob_set_pass_${actionId}_${conditionIndex}`, label: '🟢 Set', style: 2 }
        },
        // Pass result preview
        ...(passResult.title || passResult.description ? [
          { type: 10, content: `📊 **Pass Result Text**\n${passResult.title || ''}\n${passResult.description || ''}` }
        ] : []),
        { type: 14 },
        // Fail probability
        {
          type: 9,
          components: [{ type: 10, content: `**🔴 Probability of Fail outcome**\n${failPercent}% — ${failPercent === 100 ? 'Always fails' : failPercent === 0 ? 'Never fails' : `~${Math.round(20 * failPercent / 100)} in 20 rolls will fail`}` }],
          accessory: { type: 2, custom_id: `prob_set_fail_${actionId}_${conditionIndex}`, label: '🔴 Set', style: 2 }
        },
        // Fail result preview
        ...(failResult.title || failResult.description ? [
          { type: 10, content: `📊 **Fail Result Text**\n${failResult.title || ''}\n${failResult.description || ''}` }
        ] : []),
        { type: 14 },
        // Back button
        { type: 1, components: [
          { type: 2, custom_id: `condition_manager_${actionId}_0`, label: '← Back to Conditions', style: 2 },
        ]}
      ]
    }]
  };
}

/**
 * Build the Set Probability modal (for pass or fail).
 */
export function buildProbabilityModal(actionId, conditionIndex, side = 'pass', currentConfig = {}) {
  const isPass = side === 'pass';
  const currentPercent = isPass ? (currentConfig.passPercent ?? 50) : (100 - (currentConfig.passPercent ?? 50));
  const resultConfig = isPass ? (currentConfig.passResult || {}) : (currentConfig.failResult || {});
  const emoji = isPass ? '🟢' : '🔴';
  const label = isPass ? 'Pass' : 'Fail';

  return {
    type: 9,
    data: {
      custom_id: `prob_modal_${side}_${actionId}_${conditionIndex}`,
      title: `${emoji} Set ${label} Probability`,
      components: [
        {
          type: 18,
          label: `${label} Probability (%)`,
          description: isPass
            ? 'Chance of pass outcome (0-100). Fail is auto-calculated.'
            : 'Chance of fail outcome (0-100). Pass is auto-calculated.',
          component: {
            type: 4, custom_id: 'probability', style: 1,
            placeholder: '75',
            required: true, max_length: 6,
            value: String(currentPercent)
          }
        },
        {
          type: 18,
          label: `${label} Result Title`,
          description: `Title shown to the player on ${label.toLowerCase()}`,
          component: {
            type: 4, custom_id: 'result_title', style: 1,
            placeholder: isPass ? '☀️ Good Fortune!' : '🌧️ Bad Luck!',
            required: false, max_length: 100,
            ...(resultConfig.title ? { value: resultConfig.title } : {})
          }
        },
        {
          type: 18,
          label: `${label} Result Description`,
          description: 'Description shown below the title (supports markdown)',
          component: {
            type: 4, custom_id: 'result_description', style: 2,
            placeholder: isPass ? 'The dice rolled in your favor...' : 'The odds were not in your favor...',
            required: false, max_length: 1000,
            ...(resultConfig.description ? { value: resultConfig.description } : {})
          }
        },
        {
          type: 18,
          label: 'Image URL (optional)',
          description: 'Image shown in the result card',
          component: {
            type: 4, custom_id: 'result_image', style: 1,
            placeholder: 'https://...',
            required: false, max_length: 500,
            ...(resultConfig.image ? { value: resultConfig.image } : {})
          }
        },
        {
          type: 18,
          label: 'Accent Color',
          description: 'Hex color for the result card border',
          component: {
            type: 4, custom_id: 'accent_color', style: 1,
            placeholder: isPass ? '#4ade80' : '#e74c3c',
            required: false, max_length: 10,
            value: resultConfig.accentColor
              ? `#${resultConfig.accentColor.toString(16).padStart(6, '0')}`
              : (isPass ? '#4ade80' : '#e74c3c')
          }
        },
      ]
    }
  };
}
