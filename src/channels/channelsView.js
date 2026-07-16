/**
 * Channel Administration — the 🔐 Channels tab + its modals and confirm screens.
 *
 * Chrome is a deliberate clone of buildMarooningView (castRankingManager.js:1004): same
 * Container type 17 / purple accent / shared header + nav + bottom row, so the hidden tab is
 * indistinguishable from a first-class one. Channels is expected to absorb Marooning later.
 *
 * MODAL COMPONENT CHOICES (learned the hard way — docs/standards/ComponentsV2.md):
 *  - String Select option `default: true` is NOT honored in modals → single-choice fields use
 *    Radio Group (type 21), whose option `default` DOES pre-select.
 *  - Exactly ONE Radio Group option may carry `default: true`; an explicit `default: false` on a
 *    sibling suppresses pre-selection for the WHOLE group → use conditional spreads.
 *  - user/role/channel select `default_values` is unreliable in modals → ALSO state the current
 *    value in the Label `description` (the logsConfigUI.js pattern).
 */
import { ACTIONS, CATEGORY_NAMES } from './channelAdminConfig.js';

/**
 * The Channels tab.
 * @param {Object} p - { configId, guildId, playerData, seasonName, guild, userId }
 * @returns {Promise<Object>} { components: [container] }
 */
export async function buildChannelsView({ configId, guildId, playerData, seasonName, guild, userId }) {
  const { buildSeasonNavRow, seasonManagerHeader, buildSeasonBottomRow } = await import('../../seasonSelector.js');
  const { getAcceptedCast } = await import('./channelRoster.js');

  const node = playerData?.[guildId]?.channelAdmin || {};
  const season = node[configId] || {};
  const confessionals = Object.keys(season.confessionals || {}).length;
  const subs = Object.keys(season.subs || {}).length;
  const oneOnOnes = Object.keys(node.oneOnOnes || {}).length;

  const specRoleId = playerData?.[guildId]?.permissions?.trustedSpectatorRoleId || null;
  const specLine = specRoleId ? `<@&${specRoleId}>` : '*not set*';

  // Roster is best-effort: the tab must still render if Discord is unhappy.
  let rosterCount = 0;
  let missingRoles = 0;
  try {
    const { roster } = await getAcceptedCast(guildId, configId, guild);
    rosterCount = roster.length;
    missingRoles = roster.filter((r) => !r.playerRoleId).length;
  } catch (e) {
    console.warn(`⚠️ [CHANNEL_ADMIN] Roster preview failed: ${e.message}`);
  }

  const body = [
    `> **Accepted cast:** ${rosterCount}${missingRoles ? ` (${missingRoles} without a player role)` : ''}`,
    `> **Confessionals:** ${confessionals} | **Subs:** ${subs} | **1on1s:** ${oneOnOnes}`,
    `> **Trusted Spectator:** ${specLine}`
  ].join('\n');

  const lastRun = season.lastRun || {};
  const lastRunLine = Object.entries(lastRun)
    .map(([action, s]) => `-# ${action}: ${s?.created ?? 0} created · ${s?.skipped ?? 0} unchanged${s?.failed ? ` · ${s.failed} failed` : ''}`)
    .join('\n');

  const container = {
    type: 17,
    accent_color: 0x9B59B6, // Purple — matches the rest of Season Manager
    components: [
      seasonManagerHeader('channels', seasonName),
      buildSeasonNavRow(configId, 'channels', userId),
      { type: 14 },
      { type: 10, content: '### ```🔐 Roles```\n-# Server-wide roles used to gate channel access.' },
      { type: 1, components: [
        { type: 2, custom_id: `channels_roles_${configId}`, label: 'Roles', style: 2, emoji: { name: '🔐' } },
        { type: 2, custom_id: `channels_playerroles_${configId}`, label: 'Player Roles', style: 2, emoji: { name: '🎭' } }
      ]},
      { type: 14 },
      { type: 10, content: '### ```💬 Channels```\n-# Bulk create / update the standard ORG channels.' },
      { type: 1, components: [
        { type: 2, custom_id: `channels_confessionals_${configId}`, label: 'Confessionals', style: 2, emoji: { name: '🎙️' } },
        { type: 2, custom_id: `channels_subs_${configId}`, label: 'Subs', style: 2, emoji: { name: '🗳️' } },
        { type: 2, custom_id: `channels_1on1s_${configId}`, label: '1 on 1s', style: 2, emoji: { name: '🤝' } }
      ]},
      { type: 14 },
      { type: 10, content: body + (lastRunLine ? `\n\n${lastRunLine}` : '') },
      { type: 14 },
      buildSeasonBottomRow(configId, 'channels')
    ]
  };

  const { countComponents } = await import('../../utils.js');
  countComponents([container], { verbosity: 'summary', label: `Channels - ${seasonName}` });

  return { components: [container] };
}

/** Roles modal — sets the guild's single Trusted Spectator role. */
export function buildRolesModal({ configId, currentRoleId, currentRoleName }) {
  return {
    custom_id: `channels_roles_modal_${configId}`,
    title: 'Channel Roles',
    components: [
      {
        type: 18, // Label
        label: 'Trusted Spectator Role',
        // default_values is unreliable in modals, so the current value is ALSO stated here.
        description: `Current: ${currentRoleName ? `@${currentRoleName}` : 'not set'} — can read + react in confessionals. Empty clears it.`,
        component: {
          type: 6, // Role Select
          custom_id: 'trusted_spectator_role',
          required: false,
          min_values: 0,
          max_values: 1,
          ...(currentRoleId ? { default_values: [{ id: currentRoleId, type: 'role' }] } : {})
        }
      }
    ]
  };
}

/** Player Roles modal. */
export function buildPlayerRolesModal({ configId }) {
  return {
    custom_id: `channels_playerroles_modal_${configId}`,
    title: 'Player Roles',
    components: [
      {
        type: 18,
        label: 'What to create',
        // Discord caps a Label description at 100 chars — an over-long one rejects the whole modal.
        description: 'One role per player — remove it to strip a voted-out player from every channel.',
        component: {
          type: 21, // Radio Group — its option `default` DOES pre-select in modals
          custom_id: 'mode',
          required: true,
          options: [
            { label: 'Create for all accepted cast', value: 'accepted', description: 'Every accepted, non-withdrawn player this season', default: true },
            { label: 'Create for specific players', value: 'specific', description: 'Uses the player picker below' }
          ]
        }
      },
      {
        type: 18,
        label: 'Players',
        description: "Only used with 'Create for specific players'.",
        component: {
          type: 5, // User Select
          custom_id: 'players',
          required: false,
          min_values: 0,
          max_values: 25
        }
      }
    ]
  };
}

/** Confessionals modal. */
export function buildConfessionalsModal({ configId }) {
  return {
    custom_id: `channels_confessionals_modal_${configId}`,
    title: 'Confessionals',
    components: [
      {
        type: 18,
        label: 'Action',
        description: `Creates #name-confessional under "${CATEGORY_NAMES.confessional}". Nothing runs until you confirm.`,
        component: {
          type: 21,
          custom_id: 'mode',
          required: true,
          options: [
            { label: 'Create / update all accepted cast', value: 'accepted', description: 'Safe to re-run — existing channels are left alone', default: true },
            { label: 'Add specific confessionals', value: 'specific', description: 'Uses the picker below (users or roles)' },
            { label: '⚠️ Delete ALL confessionals', value: 'delete_all', description: 'Deletes every confessional this season — you will confirm first' }
          ]
        }
      },
      {
        type: 18,
        label: 'Players or roles',
        description: "Only used with 'Add specific confessionals'. Roles expand to their members.",
        component: {
          type: 7, // Mentionable Select
          custom_id: 'targets',
          required: false,
          min_values: 0,
          max_values: 25
        }
      }
    ]
  };
}

/** Subs modal. */
export function buildSubsModal({ configId }) {
  return {
    custom_id: `channels_subs_modal_${configId}`,
    title: 'Subs',
    components: [
      {
        type: 18,
        label: 'Action',
        description: `Creates #name-subs under "${CATEGORY_NAMES.subs}". Nothing runs until you confirm.`,
        component: {
          type: 21,
          custom_id: 'mode',
          required: true,
          options: [
            { label: 'Convert application channels to subs', value: 'convert', description: "Renames each accepted player's app channel into their subs channel", default: true },
            { label: 'Create / update all accepted cast', value: 'accepted', description: 'Creates fresh subs channels instead of converting' },
            { label: 'Add specific subs', value: 'specific', description: 'Uses the picker below (users or roles)' },
            { label: '⚠️ Delete ALL subs', value: 'delete_all', description: 'Deletes every subs channel this season — you will confirm first' }
          ]
        }
      },
      {
        type: 18,
        label: 'Players or roles',
        description: "Only used with 'Add specific subs'. Roles expand to their members.",
        component: {
          type: 7,
          custom_id: 'targets',
          required: false,
          min_values: 0,
          max_values: 25
        }
      }
    ]
  };
}

/**
 * 1on1s modal.
 * @param {string[]} defaultTribeRoleIds - tribes of the default castlist
 * @param {string} tribeNames - human-readable list for the description (default_values is unreliable)
 */
export function buildOneOnOnesModal({ configId, defaultTribeRoleIds = [], tribeNames = '' }) {
  return {
    custom_id: `channels_1on1s_modal_${configId}`,
    title: '1 on 1s',
    components: [
      {
        type: 18,
        label: 'Action',
        description: '⚠️ One channel per PAIR: 12 players = 66, 20 = 190. Exact counts shown before anything runs.',
        component: {
          type: 21,
          custom_id: 'mode',
          required: true,
          options: [
            { label: 'Create / update 1on1s', value: 'create', description: 'Safe to re-run — existing pair channels are left alone', default: true },
            { label: '⚠️ Delete 1on1s', value: 'delete', description: 'Deletes the selected tribes\' pair channels — you will confirm first' }
          ]
        }
      },
      {
        type: 18,
        label: 'Tribes',
        description: tribeNames
          ? `Default castlist: ${tribeNames}. Leave empty to use all of them.`
          : 'No tribes found in the default castlist — pick roles manually.',
        component: {
          type: 6, // Role Select
          custom_id: 'tribes',
          required: false,
          min_values: 0,
          max_values: 10,
          ...(defaultTribeRoleIds.length ? { default_values: defaultTribeRoleIds.slice(0, 10).map((id) => ({ id, type: 'role' })) } : {})
        }
      }
    ]
  };
}

/**
 * The confirm screen. EVERY action goes through this — nothing mutates Discord on modal submit.
 *
 * The plan lives in a server-side Map keyed by `token`, NOT in the custom_id: custom_id has a
 * hard 100-char limit and 10 role IDs alone is ~190 chars.
 *
 * @param {Object} p
 * @param {string} p.token
 * @param {string} p.title
 * @param {string[]} p.lines - the plan summary
 * @param {string} p.confirmLabel - states the count, e.g. "Create 190 channels"
 * @param {boolean} [p.destructive]
 * @param {boolean} [p.blocked] - a ceiling breach / nothing to do → no confirm button
 */
export function buildConfirmScreen({ token, title, lines, confirmLabel, destructive = false, blocked = false, configId }) {
  const components = [
    { type: 10, content: `## ${title}\n${lines.join('\n')}` },
    { type: 14 }
  ];

  components.push({
    type: 1,
    components: blocked
      ? [{ type: 2, custom_id: `season_channels_${configId}`, label: '← Back to Channels', style: 2 }]
      : [
        { type: 2, custom_id: `channels_cancel_${configId}`, label: 'Cancel', style: 2 },
        { type: 2, custom_id: `channels_exec_${token}`, label: confirmLabel, style: destructive ? 4 : 1 }
      ]
  });

  return {
    components: [{
      type: 17,
      accent_color: blocked ? 0xe74c3c : (destructive ? 0xe74c3c : 0x9B59B6),
      components
    }]
  };
}

export { ACTIONS };
