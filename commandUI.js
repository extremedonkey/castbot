/**
 * Command UI — shared builders for the Command system.
 *
 * Contains:
 *   1. buildCommandModal()        — the Enter Command modal (player-facing)
 *   2. buildCommandPrefixesUI()   — admin config UI for managing prefixes
 *   3. buildAddPrefixModal()      — modal to add a new prefix
 *
 * Entry points for the player modal:
 *   - Anchor message "Command" button  (player_enter_command_{coord})
 *   - Explore > Enter Command button   (player_enter_command_{coord})
 *   - /menu > Commands button           (player_enter_command_global)
 *   - Admin > Test Command button       (admin_test_command_{coord})
 */

import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { SAFARI_LIMITS } from './config/safariLimits.js';
import { resolveEmoji } from './utils/emojiUtils.js';

/**
 * Build the Enter Command modal.
 *
 * @param {Object} options
 * @param {string}  options.coord        - Map coordinate or 'global'
 * @param {boolean} [options.isAdmin]    - Admin test mode (changes title)
 * @param {string[]} [options.prefixes]  - Guild command prefixes (future — Phase 3)
 * @returns {Object} Modal interaction response (type 9)
 */
export function buildCommandModal({ coord, isAdmin = false, prefixes = [] }) {
  const customId = isAdmin
    ? `admin_command_modal_${coord}`
    : `player_command_modal_${coord}`;

  const title = isAdmin ? 'Test Command (Admin)' : 'Enter Command';

  const components = [];

  // Show prefix select when guild has prefixes configured
  if (prefixes.length > 0) {
    const prefixOptions = [
      {
        label: 'Freeform (no prefix)',
        value: 'freeform',
        description: 'Enter the full command exactly as it is — common for idol hunts',
        emoji: { name: '♾️' },
        default: true
      }
    ];
    for (const prefix of prefixes) {
      prefixOptions.push({
        label: prefix.label,
        value: prefix.label.toLowerCase(),
        description: (prefix.description || `Prepends "${prefix.label}" to your command`).substring(0, 100),
        emoji: resolveEmoji(prefix.emoji, '🏷️')
      });
    }
    components.push({
      type: 18, // Label
      label: 'Prefix (optional)',
      description: 'Pick an action verb, or choose Freeform to enter the full command yourself',
      component: {
        type: 3, // String Select
        custom_id: 'command_prefix',
        min_values: 1,
        max_values: 1,
        options: prefixOptions
      }
    });
  }

  // Command text input (Label wrapper — Components V2 modal standard)
  components.push({
    type: 18, // Label
    label: 'Command',
    description: 'Enter a secret word, phrase, or code',
    component: {
      type: 4, // Text Input
      custom_id: 'command',
      style: 1, // Short
      required: true,
      placeholder: 'e.g., tree, rock, secret-code',
      min_length: 1,
      max_length: 100
    }
  });

  return {
    type: 9, // MODAL
    data: {
      custom_id: customId,
      title,
      components
    }
  };
}

/**
 * Build the Command Prefixes admin configuration UI.
 *
 * @param {string} guildId - Guild ID
 * @returns {Object} Components V2 response data (flags + components)
 */
export async function buildCommandPrefixesUI(guildId) {
  const safariData = await loadSafariContent();
  const config = safariData[guildId]?.safariConfig || {};
  const prefixes = config.commandPrefixes || [];

  const components = [
    {
      type: 10,
      content: `## ❗ Commands\n-# Players can type secret words or phrases to trigger hidden actions at map locations or from their menu. Commands power Easter eggs, puzzles, secret codes, and interactive story moments.`
    },
    { type: 14 },
    {
      type: 10,
      content: `### \`\`\`🧗 Command Prefixes (${prefixes.length}/${SAFARI_LIMITS.MAX_COMMAND_PREFIXES})\`\`\`\n-# Prefixes give players a set of pre-defined action verbs (e.g. climb, inspect, open) shown as a dropdown when entering commands. This saves players from guessing and reduces spam — they pick an action, then type the target. The prefix and target are combined before matching (e.g. "climb" + "tree" = "climb tree").`
    },
    { type: 14 }
  ];

  if (prefixes.length === 0) {
    components.push({
      type: 10,
      content: `*No prefixes configured. Players type freeform commands.*`
    });
  } else {
    for (let i = 0; i < prefixes.length; i++) {
      const prefix = prefixes[i];
      const emoji = prefix.emoji || '🏷️';
      const descLine = prefix.description ? `\n-# ${prefix.description}` : '';
      components.push({
        type: 9, // Section
        components: [{
          type: 10,
          content: `${emoji} **${prefix.label}**${descLine}`
        }],
        accessory: {
          type: 2, // Button
          custom_id: `command_prefix_remove_${i}`,
          label: 'Remove',
          style: 4, // Danger
          emoji: { name: '🗑️' }
        }
      });
    }
  }

  components.push({ type: 14 });

  const atLimit = prefixes.length >= SAFARI_LIMITS.MAX_COMMAND_PREFIXES;
  components.push({
    type: 1, // ActionRow
    components: [
      { type: 2, custom_id: 'safari_customization_back', label: '← Settings', style: 2 },
      atLimit
        ? { type: 2, custom_id: 'command_prefix_add', label: 'Limit Reached — Delete a Prefix', style: 2, disabled: true }
        : { type: 2, custom_id: 'command_prefix_add', label: 'Add Prefix', style: 2, emoji: { name: '🧗' } }
    ]
  });

  const result = [{
    type: 17, // Container
    accent_color: 0x3498DB,
    components
  }];

  const { countComponents } = await import('./utils.js');
  countComponents(result, { verbosity: 'full', label: 'Command Prefixes' });

  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: result
  };
}

/**
 * Build the Add Prefix modal.
 *
 * @returns {Object} Modal interaction response (type 9)
 */
export function buildAddPrefixModal() {
  return {
    type: 9, // MODAL
    data: {
      custom_id: 'command_prefix_add_modal',
      title: 'Add Command Prefix',
      components: [
        {
          type: 18, // Label
          label: 'Prefix',
          description: 'The action verb players will see (e.g. climb, inspect, open)',
          component: {
            type: 4, // Text Input
            custom_id: 'prefix_label',
            style: 1, // Short
            required: true,
            placeholder: 'e.g., climb, inspect, dive, open',
            min_length: 1,
            max_length: 30
          }
        },
        {
          type: 18, // Label
          label: 'Emoji (optional)',
          description: 'Displays next to the prefix in the dropdown for players',
          component: {
            type: 4, // Text Input
            custom_id: 'prefix_emoji',
            style: 1, // Short
            required: false,
            placeholder: 'e.g., 🧗, 🔍, 🤿',
            max_length: 50
          }
        },
        {
          type: 18, // Label
          label: 'Description (optional)',
          description: 'Gives the player some additional information about when they should use this prefix',
          component: {
            type: 4, // Text Input
            custom_id: 'prefix_description',
            style: 1, // Short
            required: false,
            placeholder: 'e.g., Gives a closer look at something in the location',
            max_length: 100
          }
        }
      ]
    }
  };
}

/**
 * Add a prefix to a guild's command prefixes.
 *
 * @param {string} guildId
 * @param {string} label - Prefix text
 * @param {string} [emoji] - Optional emoji
 * @param {string} [description] - Optional description
 * @returns {{ success: boolean, error?: string }}
 */
export async function addCommandPrefix(guildId, label, emoji, description) {
  const safariData = await loadSafariContent();
  if (!safariData[guildId]) safariData[guildId] = {};
  if (!safariData[guildId].safariConfig) safariData[guildId].safariConfig = {};

  const config = safariData[guildId].safariConfig;
  if (!config.commandPrefixes) config.commandPrefixes = [];

  const normalized = label.trim().toLowerCase();
  if (!normalized) return { success: false, error: 'Prefix cannot be empty.' };

  if (config.commandPrefixes.some(p => p.label.toLowerCase() === normalized)) {
    return { success: false, error: `Prefix "${label.trim()}" already exists.` };
  }

  if (config.commandPrefixes.length >= SAFARI_LIMITS.MAX_COMMAND_PREFIXES) {
    return { success: false, error: `Maximum ${SAFARI_LIMITS.MAX_COMMAND_PREFIXES} prefixes allowed.` };
  }

  config.commandPrefixes.push({
    label: label.trim(),
    ...(emoji?.trim() ? { emoji: emoji.trim() } : {}),
    ...(description?.trim() ? { description: description.trim() } : {})
  });

  await saveSafariContent(safariData);
  return { success: true };
}

/**
 * Remove a prefix by index from a guild's command prefixes.
 *
 * @param {string} guildId
 * @param {number} index
 * @returns {{ success: boolean, error?: string, removed?: string }}
 */
export async function removeCommandPrefix(guildId, index) {
  const safariData = await loadSafariContent();
  const config = safariData[guildId]?.safariConfig;
  if (!config?.commandPrefixes || index < 0 || index >= config.commandPrefixes.length) {
    return { success: false, error: 'Prefix not found.' };
  }

  const [removed] = config.commandPrefixes.splice(index, 1);
  await saveSafariContent(safariData);
  return { success: true, removed: removed.label };
}

// ─── Phrase Management ──────────────────────────────────────────────────

/**
 * Detect if a phrase starts with a configured prefix.
 * Checks longest prefixes first to handle "climb up" vs "climb".
 *
 * @param {string} phrase - The full phrase (e.g., "climb tree")
 * @param {Array} prefixes - Guild command prefixes [{ label, emoji? }]
 * @returns {{ prefix: Object, remainder: string } | null}
 */
export function detectPhrasePrefix(phrase, prefixes) {
  if (!prefixes?.length) return null;
  const sorted = [...prefixes].sort((a, b) => b.label.length - a.label.length);
  const phraseLower = phrase.toLowerCase();
  for (const prefix of sorted) {
    const prefixLower = prefix.label.toLowerCase();
    if (phraseLower.startsWith(prefixLower + ' ') && phrase.length > prefixLower.length + 1) {
      return { prefix, remainder: phrase.substring(prefix.label.length + 1) };
    }
  }
  return null;
}

/**
 * Build the Add Phrase modal.
 *
 * @param {Object} options
 * @param {string} options.actionId - Action ID
 * @param {Array}  options.prefixes - Guild command prefixes [{ label, emoji? }]
 * @returns {Object} Modal interaction response (type 9)
 */
export function buildAddPhraseModal({ actionId, prefixes = [] }) {
  const options = [
    {
      label: 'Freeform (no prefix)',
      value: 'freeform',
      description: 'Best for idol hunt commands (e.g., my-secret-idol)',
      emoji: { name: '♾️' },
      default: true
    }
  ];

  for (const prefix of prefixes) {
    options.push({
      label: prefix.label,
      value: prefix.label.toLowerCase(),
      description: (prefix.description || `Prepends "${prefix.label}" to your phrase`).substring(0, 100),
      emoji: resolveEmoji(prefix.emoji, '🏷️')
    });
  }

  return {
    type: 9, // MODAL
    data: {
      custom_id: `action_phrase_add_modal_${actionId}`,
      title: 'Add Command Phrase',
      components: [
        {
          type: 18, // Label
          label: 'Prefix',
          description: 'Prefixes prepend an action verb. Select Freeform for exact phrases like idol hunt codes.',
          component: {
            type: 3, // String Select
            custom_id: 'phrase_prefix',
            min_values: 1,
            max_values: 1,
            options
          }
        },
        {
          type: 18, // Label
          label: 'Command Phrase',
          description: 'The word or phrase the player types. If using a prefix, this is what follows it.',
          component: {
            type: 4, // Text Input
            custom_id: 'phrase_text',
            style: 1, // Short
            required: true,
            placeholder: 'e.g., tree, rock, secret-code',
            min_length: 1,
            max_length: 100
          }
        }
      ]
    }
  };
}

/**
 * Add a phrase to an action's trigger phrases.
 *
 * @param {string} guildId
 * @param {string} actionId
 * @param {string} phrase
 * @returns {{ success: boolean, error?: string }}
 */
export async function addActionPhrase(guildId, actionId, phrase) {
  const safariData = await loadSafariContent();
  const action = safariData[guildId]?.buttons?.[actionId];
  if (!action) return { success: false, error: 'Action not found.' };

  if (!action.trigger) action.trigger = { type: 'modal' };
  if (!action.trigger.phrases) action.trigger.phrases = [];

  const trimmed = phrase.trim();
  if (!trimmed) return { success: false, error: 'Phrase cannot be empty.' };

  if (action.trigger.phrases.length >= SAFARI_LIMITS.MAX_PHRASES_PER_ACTION) {
    return { success: false, error: `Maximum ${SAFARI_LIMITS.MAX_PHRASES_PER_ACTION} phrases allowed.` };
  }

  if (action.trigger.phrases.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: `Phrase "${trimmed}" already exists.` };
  }

  action.trigger.phrases.push(trimmed.toLowerCase());
  if (action.metadata) {
    action.metadata.lastModified = Date.now();
  }
  await saveSafariContent(safariData);
  return { success: true };
}

/**
 * Remove a phrase by index from an action's trigger phrases.
 *
 * @param {string} guildId
 * @param {string} actionId
 * @param {number} index
 * @returns {{ success: boolean, error?: string, removed?: string }}
 */
export async function removeActionPhrase(guildId, actionId, index) {
  const safariData = await loadSafariContent();
  const action = safariData[guildId]?.buttons?.[actionId];
  if (!action?.trigger?.phrases || index < 0 || index >= action.trigger.phrases.length) {
    return { success: false, error: 'Phrase not found.' };
  }

  const [removed] = action.trigger.phrases.splice(index, 1);
  if (action.metadata) {
    action.metadata.lastModified = Date.now();
  }
  await saveSafariContent(safariData);
  return { success: true, removed };
}
