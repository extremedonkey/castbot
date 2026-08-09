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
import { ACTIONS, CATEGORY_NAMES, BROADCAST_CHANNEL_TYPES, MAX_SELECT_TARGETS } from './channelAdminConfig.js';
import { buildRichCardContainer, buildRichCardModal } from '../../richCardUI.js';

/**
 * "Exactly who is this about?" — the roster block every create/update confirm screen carries.
 *
 * Added 2026-08-08 with the cross-season roster: once the applicant pool spans every season, a
 * bare count ("16 players") is not enough information to approve an irreversible bulk job. The
 * host must be able to see a name they don't recognise and cancel.
 *
 * Per player: the ✅/➕ create marker, the name, the already-made channel markers (🎙️/🗳️ — subs
 * are normally created first, so both are always shown), and the source season when it is NOT
 * the season the surface is scoped to.
 *
 * @param {Array} members - roster entries (getAcceptedCast) or picker members (expandMentionables)
 * @param {Object} [opts]
 * @param {Set<string>} [opts.creating] - userIds that will actually be created (others = left alone)
 * @param {number} [opts.limit=25] - hard cap; the remainder is summarised, never silently dropped
 * @returns {string[]} lines for the confirm screen (empty array when there is nothing to list)
 */
export function rosterLines(members, { creating = null, limit = 25 } = {}) {
  if (!members?.length) return [];
  const lines = ['', '**Players:**'];

  for (const m of members.slice(0, limit)) {
    const mark = !creating ? '•' : (creating.has(m.userId) ? '➕' : '✅');
    const made = [m.hasConfessional ? '🎙️' : '', m.hasSubs ? '🗳️' : ''].filter(Boolean).join('');
    // Only call out the season when it ISN'T the one the host is looking at — that's the
    // cross-season case they need to notice.
    const season = (m.seasonName && !m.fromCurrentSeason) ? ` -# *${m.seasonName}*` : '';
    lines.push(`> ${mark} ${m.displayName}${made ? ` ${made}` : ''}${season}`);
  }

  if (members.length > limit) lines.push(`> -# …and ${members.length - limit} more`);
  if (creating) lines.push('-# ➕ will be created · ✅ already exists · 🎙️ has a confessional · 🗳️ has subs');
  return lines;
}

/**
 * The #️⃣ Channels heading + its 5 action buttons — THE single definition of that row.
 *
 * Rendered by BOTH the Season Manager Channels tab (below) and the ⭐ Premium menu
 * (MenuBuilder.buildPremiumMenu), so the two surfaces cannot drift apart. Returns bare
 * components, NOT a container: each host wraps it in its own chrome (Season Manager's purple
 * container + nav/bottom rows; Premium's own container).
 *
 * ⚠️ The row is AT Discord's hard 5-buttons-per-ActionRow cap. A sixth action needs a second row.
 * Msg Category left this row 2026-08-08 (→ Premium's 📢 Player Engagement row; the Season tab
 * renders its own copy below the shared section) to free the slot for Swap/Merge — a straight
 * copy of the Castlist Hub button, so it is the one id here NOT keyed by configId.
 *
 * @param {string} configId - season key; every channels_* handler still parses it off the
 *   custom_id (Stage 1 of the migration keeps ids untouched — see RaP 0885 / ChannelAdministration.md)
 * @returns {Array} [Text Display, ActionRow] — 7 components
 */
export function buildChannelsSection(configId) {
  return [
    { type: 10, content: '### ```#️⃣ Channels```\n-# Bulk create / update the standard ORG channels.' },
    { type: 1, components: [
      { type: 2, custom_id: `channels_confessionals_${configId}`, label: 'Confessionals', style: 2, emoji: { name: '🎙️' } },
      { type: 2, custom_id: `channels_subs_${configId}`, label: 'Subs', style: 2, emoji: { name: '🗳️' } },
      { type: 2, custom_id: `channels_1on1s_${configId}`, label: '1 on 1s', style: 2, emoji: { name: '👥' } },
      { type: 2, custom_id: `channels_alliances_${configId}`, label: 'Alliances', style: 2, emoji: { name: '🤝' } },
      { type: 2, custom_id: 'castlist_swap_merge_default', label: 'Swap/Merge', style: 2, emoji: { name: '🔀' } }
    ]}
  ];
}

/**
 * The Channels tab.
 * @param {Object} p - { configId, guildId, playerData, seasonName, guild, userId }
 * @returns {Promise<Object>} { components: [container] }
 */
export async function buildChannelsView({ configId, guildId, playerData, seasonName, guild, userId }) {
  const { buildSeasonNavRow, seasonManagerHeader, buildSeasonBottomRow } = await import('../../seasonSelector.js');
  const { getAcceptedCast } = await import('./channelRoster.js');
  // Dynamic import (not top-level): channelsHandlers imports buildConfirmScreen from THIS file,
  // so a static import here would close the cycle at module-init time.
  const { setChannelsOrigin } = await import('./channelsHandlers.js');
  setChannelsOrigin(userId, 'season'); // Cancel / ← Back from here returns to this tab

  const node = playerData?.[guildId]?.channelAdmin || {};
  const season = node[configId] || {};
  const confessionals = Object.keys(season.confessionals || {}).length;
  const subs = Object.keys(season.subs || {}).length;
  const oneOnOnes = Object.keys(node.oneOnOnes || {}).length;
  const alliances = Object.keys(node.alliances || {}).length;

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
    // "Accepted cast" is now guild-wide (every season, deduped) — say so, or the number looks
    // wrong to a host who is looking at one season's tab.
    `> **Accepted cast (all seasons):** ${rosterCount}${missingRoles ? ` (${missingRoles} without a player role)` : ''}`,
    `> **Confessionals:** ${confessionals} | **Subs:** ${subs} | **1on1s:** ${oneOnOnes} | **Alliances:** ${alliances}`,
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
      ...buildChannelsSection(configId),
      // Msg Category kept on the tab after leaving the shared row (2026-08-08) — the shared
      // row's slot went to Swap/Merge, and Premium renders this button in 📢 Player Engagement.
      { type: 1, components: [
        { type: 2, custom_id: `channels_msg_${configId}`, label: 'Msg Category', style: 2, emoji: { name: '📨' } }
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

/**
 * 📨 Msg Category — the broadcast composer.
 *
 * The standard buildRichCardContainer() (richCardUI.js) previewing exactly what will be posted,
 * with the target picker + actions appended via `extraComponents`.
 *
 * The picker is a Channel Select (type 8), NOT a Mentionable Select (type 7): a mentionable can
 * only list users and roles, so it physically cannot target channels or categories. Types
 * [0, 4, 5] = text · category · announcement, mirroring channelArchiver.js:79.
 *
 * Select `default_values` works reliably in MESSAGES (unlike modals), so the saved targets
 * re-render on every refresh.
 *
 * @param {Object} p - { configId, draft, targetSummary }
 * @returns {Object} { components: [container] }
 */
export function buildMsgComposer({ configId, draft = {}, targetSummary = null }) {
  const hasMessage = !!(draft.title || draft.content || draft.image);
  const targets = draft.targets || [];

  // Discord renders no label/description on a select in a MESSAGE (those are modal-only Labels),
  // so the "what will happen" warning is a Text Display directly above it.
  const warning = [
    '### ```📨 Send to```',
    '-# Posts the card above **once to every channel you pick**. A category expands to all its text channels —',
    '-# picking one category can mean dozens of messages. Sending is paced and cannot be undone.',
    ...(targetSummary ? ['', `> ${targetSummary}`] : [])
  ].join('\n');

  const extraComponents = [
    { type: 14 },
    { type: 10, content: warning },
    { type: 1, components: [{
      type: 8, // Channel Select — the only component that can list channels/categories
      custom_id: `channels_msg_targets_${configId}`,
      placeholder: 'Select channels and/or categories...',
      channel_types: BROADCAST_CHANNEL_TYPES,
      min_values: 0,
      max_values: MAX_SELECT_TARGETS,
      ...(targets.length ? { default_values: targets.slice(0, MAX_SELECT_TARGETS).map((id) => ({ id, type: 'channel' })) } : {})
    }]},
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: `season_channels_${configId}`, label: '← Channels', style: 2 },
      { type: 2, custom_id: `channels_msg_edit_${configId}`, label: hasMessage ? 'Edit Message' : 'Write Message', style: 1, emoji: { name: '✏️' } },
      // Nothing to send until there's both a message and somewhere to put it.
      { type: 2, custom_id: `channels_msg_send_${configId}`, label: 'Send', style: 4, emoji: { name: '📨' }, disabled: !hasMessage || targets.length === 0 }
    ]}
  ];

  const container = buildRichCardContainer({
    title: draft.title,
    content: draft.content || '-# *No message yet — hit **Write Message** to compose one. This card is exactly what gets posted.*',
    color: draft.color || '#9B59B6',
    image: draft.image,
    extraComponents
  });

  return { components: [container] };
}

/** The 📨 Msg Category edit modal — reuses the shared rich card modal, pre-filled with the draft. */
export function buildMsgModal({ configId, draft = {}, imageUploadMode }) {
  return buildRichCardModal({
    customId: `channels_msg_modal_${configId}`,
    modalTitle: '📨 Compose Message',
    imageUploadMode,
    values: { title: draft.title, content: draft.content, color: draft.color, image: draft.image },
    fields: {
      content: { label: 'Message', placeholder: 'What every selected channel will receive...', required: true }
    }
  });
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
        // RaP 0881 — placement is a Radio Group, not a String Select: String Select's
        // `default` is dead in modals, and 'Don't touch' MUST be the default (zero
        // behaviour change — this feature has live PROD users).
        type: 18,
        label: 'Subs category',
        description: 'Where subs channels live — different servers organise these differently.',
        component: {
          type: 21,
          custom_id: 'placement',
          required: true,
          options: [
            { label: "Don't touch", value: 'keep', description: "New channels go under 'Subs'; converted channels stay where they are now.", default: true },
            { label: 'Single category', value: 'single', description: 'Everything in ONE category — existing/converted channels are MOVED into it. Name below.' },
            { label: 'One category per tribe', value: 'per_tribe', description: "e.g. 'Balboa Subs' from each player's draft tribe. Tribe-less players use the single category." }
          ]
        }
      },
      {
        type: 18,
        label: 'Category name (optional)',
        description: 'Single: the category name. Per tribe: the word after the tribe name. Default: Subs',
        component: {
          type: 4,
          custom_id: 'category_name',
          style: 1,
          required: false,
          max_length: 60,
          placeholder: 'Subs'
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
 * @param {number} [p.accent] - overrides the non-blocked accent (alliances use 0xf39c12 for tribe warnings)
 * @param {string} [p.cancelId] - overrides where Cancel / the blocked Back button lands (default: Channels tab)
 */
export function buildConfirmScreen({ token, title, lines, confirmLabel, destructive = false, blocked = false, configId, accent = null, cancelId = null }) {
  const components = [
    { type: 10, content: `## ${title}\n${lines.join('\n')}` },
    { type: 14 }
  ];

  components.push({
    type: 1,
    components: blocked
      ? [{ type: 2, custom_id: cancelId || `season_channels_${configId}`, label: cancelId ? '← Back' : '← Back to Channels', style: 2 }]
      : [
        { type: 2, custom_id: cancelId || `channels_cancel_${configId}`, label: 'Cancel', style: 2 },
        { type: 2, custom_id: `channels_exec_${token}`, label: confirmLabel, style: destructive ? 4 : 1 }
      ]
  });

  return {
    components: [{
      type: 17,
      accent_color: blocked ? 0xe74c3c : (destructive ? 0xe74c3c : (accent ?? 0x9B59B6)),
      components
    }]
  };
}

export { ACTIONS };
