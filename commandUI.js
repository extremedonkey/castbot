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

  // Future: when prefixes are configured, add a String Select above the text input
  // Phase 3 will add:
  //   if (prefixes.length > 0) { components.push(prefixSelect); }

  // Command text input (Label wrapper — Components V2 modal standard)
  components.push({
    type: 18, // Label
    label: 'Command',
    description: 'Type a command to interact with this location',
    component: {
      type: 4, // Text Input
      custom_id: 'command',
      style: 1, // Short
      required: true,
      placeholder: 'e.g., climb tree, inspect rock, open chest',
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
      components.push({
        type: 9, // Section
        components: [{
          type: 10,
          content: `${emoji} **${prefix.label}**`
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
  components.push({
    type: 1, // ActionRow
    components: [
      { type: 2, custom_id: 'safari_customization_back', label: '← Settings', style: 2 },
      { type: 2, custom_id: 'command_prefix_add', label: 'Add Prefix', style: 2, emoji: { name: '🧗' } }
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
 * @returns {{ success: boolean, error?: string }}
 */
export async function addCommandPrefix(guildId, label, emoji) {
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
    ...(emoji?.trim() ? { emoji: emoji.trim() } : {})
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
