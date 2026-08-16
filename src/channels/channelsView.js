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
export function buildChannelsSection(configId, { entitled = true, layout = 'row' } = {}) {
  // 💎 Premium (Reece 2026-08-16): the four channel-fabrication buttons lock-swap to
  // premium_locked_* for unentitled guilds — the Premium menu's convention, so the ONE
  // upsell handler (app.js premium_locked_) serves the click. Swap/Merge stays live (a
  // castlist feature, not channel fabrication), and the Player Roles row rendered by
  // buildChannelsView is deliberately free too. The Premium menu passes the default
  // (entitled: true) because lockPremiumComponents already locks its whole container.
  const gate = (id) => (entitled ? id : `premium_locked_${id}`);

  // SEASON order (Reece 2026-08-16) — the buttons walk the timeline a season actually runs:
  // subs as castings are accepted → confessionals pre-reveal → (🚣 Marooning announces) →
  // 1on1s once tribes exist → swap/merge mid-game → alliances as the game runs.
  const BTN = {
    subs: { type: 2, custom_id: gate(`channels_subs_${configId}`), label: 'Subs', style: 2, emoji: { name: '🗳️' } },
    confessionals: { type: 2, custom_id: gate(`channels_confessionals_${configId}`), label: 'Confessionals', style: 2, emoji: { name: '🎙️' } },
    oneOnOnes: { type: 2, custom_id: gate(`channels_1on1s_${configId}`), label: '1 on 1s', style: 2, emoji: { name: '👥' } },
    swapMerge: { type: 2, custom_id: 'castlist_swap_merge_default', label: 'Swap/Merge', style: 2, emoji: { name: '🔀' } },
    alliances: { type: 2, custom_id: gate(`channels_alliances_${configId}`), label: 'Alliances', style: 2, emoji: { name: '🤝' } }
  };

  if (layout === 'row') {
    // Compact — the Premium menu's shape (its container is already dense; the walkthrough
    // guidance lives on the Season Manager tab, where the work is actually staged from).
    return [
      { type: 10, content: '### ```#️⃣ Channels```\n-# Bulk create / update the standard ORG channels.' },
      { type: 1, components: [BTN.subs, BTN.confessionals, BTN.oneOnOnes, BTN.swapMerge, BTN.alliances] }
    ];
  }

  // 'sections' — the Season tab's guided walkthrough: one Section (Text Display + button
  // accessory) per action, numbered in season order. Bulk channel creation is a high-anxiety
  // task; the guidance (and the reminder that every action previews before running) is the
  // point. Component cost: 16 (heading + 5 × [Section + Text + accessory]) vs the row's 7 —
  // buildChannelsView budgets for this.
  const section = (text, button) => ({ type: 9, components: [{ type: 10, content: text }], accessory: button });
  return [
    { type: 10, content: '### ```#️⃣ Channels```\n-# The standard ORG channels, in the order a season runs them. Nothing is created on click — every action shows you exactly what it will do first.' },
    section('**1 · Subs** — as players accept their casting: convert each application channel into their private player↔host subs channel (or create fresh ones).', BTN.subs),
    section('**2 · Confessionals** — before the cast reveal: every player\'s private diary room. Players get access straight away; Trusted Spectators read along.', BTN.confessionals),
    section('**3 · 1 on 1s** — after 🚣 Marooning announces the tribes: one private channel per pair of tribemates, so hosts can watch player-to-player chat.', BTN.oneOnOnes),
    section('**4 · Swap/Merge** — at a tribe swap or merge: archives the old tribes as a castlist and moves everyone onto the new ones.', BTN.swapMerge),
    section('**5 · Alliances** — as the game runs: secret channels for alliances. Their existence is season-deciding info — no spectators, generic names.', BTN.alliances)
  ];
}

/**
 * The 🎭 Player Roles status line — names every player→role link as PLAIN TEXT (no <@>
 * mentions, Reece 2026-08-16): `Reece (extremedonkey / @Winner Reece), …`. Replaces the
 * bare `player_roles: N created` counter, which said nothing about WHO got linked to WHAT.
 * @param {Array<{displayName: string, username: string, roleName: string}>} entries
 * @returns {string|null} the -# line, or null when nobody holds a player role
 */
export function formatPlayerRolesLine(entries, max = 15) {
  if (!entries?.length) return null;
  const sorted = [...entries].sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  const shown = sorted.slice(0, max).map((e) => `${e.displayName} (${e.username} / @${e.roleName})`);
  const more = sorted.length - shown.length;
  return `-# **Player Roles:** ${shown.join(', ')}${more > 0 ? `, +${more} more` : ''}`;
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

  // 💎 Premium: Confessionals/Subs/1on1s/Alliances lock-swap for unentitled guilds — the same
  // entitled rule as menuBuilder's Premium menu, owner-bypass included so dev servers stay
  // usable. The 🎭 Player Roles row and Swap/Merge stay free (Reece 2026-08-16).
  const { hasPremiumAccessSync } = await import('../../entitlements.js');
  const entitled = hasPremiumAccessSync(guildId) || String(userId) === '391415444084490240';

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

  // 🎭 Player Roles roster (guild-scoped, like playerRoleId itself) — names each link as
  // plain text. Best-effort: a Discord hiccup must not take the tab down with it.
  let playerRolesLine = null;
  try {
    const linked = Object.entries(playerData?.[guildId]?.players || {})
      .filter(([, p]) => p?.playerRoleId);
    if (linked.length && guild) {
      // One bulk fetch so usernames are real, not cache-luck ("left server" must mean left).
      await guild.members.fetch({ user: linked.map(([uid]) => uid) }).catch(() => {});
      playerRolesLine = formatPlayerRolesLine(linked.map(([uid, p]) => {
        const role = guild.roles.cache.get(p.playerRoleId) || null;
        const member = guild.members.cache.get(uid) || null;
        return {
          displayName: member?.displayName || role?.name || uid,
          username: member?.user?.username || 'left server',
          roleName: role?.name || 'role deleted'
        };
      }));
    }
  } catch (e) {
    console.warn(`⚠️ [CHANNEL_ADMIN] Player-roles line failed: ${e.message}`);
  }

  const lastRun = season.lastRun || {};
  const lastRunLine = Object.entries(lastRun)
    // The roster line REPLACES the bare player_roles counter — unless the run had failures,
    // which the roster line can't express.
    .filter(([action, s]) => !(action === 'player_roles' && playerRolesLine && !s?.failed))
    .map(([action, s]) => `-# ${action}: ${s?.created ?? 0} created · ${s?.skipped ?? 0} unchanged${s?.failed ? ` · ${s.failed} failed` : ''}`)
    .concat(playerRolesLine ? [playerRolesLine] : [])
    .join('\n');

  const container = {
    type: 17,
    accent_color: 0x9B59B6, // Purple — matches the rest of Season Manager
    components: [
      seasonManagerHeader('channels', seasonName),
      buildSeasonNavRow(configId, 'channels', userId),
      { type: 14 },
      { type: 10, content: '### ```🎭 Player Roles```\n-# Automatically create Player Roles for easy removal of players when eliminated. You can safely create player roles before your season starts — they\'re only assigned (and visible to players and specs) when 🟢 Activate is used, which we recommend doing during or after marooning.' },
      { type: 1, components: [
        { type: 2, custom_id: `channels_roles_${configId}`, label: 'Roles', style: 2, emoji: { name: '🔐' } },
        { type: 2, custom_id: `channels_playerroles_${configId}`, label: 'Auto Create', style: 2, emoji: { name: '🎭' } },
        // Interop: link ONE player to a role that already exists (hand-made or another bot's) —
        // Auto Create only ever makes fresh roles (resolve-by-stored-ID, never by name).
        { type: 2, custom_id: `channels_manualrole_${configId}`, label: 'Manually Link', style: 2, emoji: { name: '🔗' } },
        // The reveal step: assigns linked roles to their players (closes the "role nobody
        // holds" gap — until now the host had to hand-assign every role in Discord).
        { type: 2, custom_id: `channels_activate_${configId}`, label: 'Activate', style: 3, emoji: { name: '🟢' } }
      ]},
      { type: 14 },
      // Guided walkthrough layout (16 components — the tab sits ~38/40 with it; anything new
      // here must re-count). Msg Category left the tab entirely 2026-08-16 (Reece) — it lives
      // on ⭐ Premium's 📢 Player Engagement row only.
      ...buildChannelsSection(configId, { entitled, layout: 'sections' }),
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
/**
 * 🔗 Manual Roles modal — link ONE player to an EXISTING role (interop with hand-made or
 * other-bot roles, Reece 2026-08-16). Atomic by design: one player, one role, applied on
 * submit (a data-pointer write only — no channels touched, so no plan/confirm ceremony).
 * The link is recorded WITHOUT assigning the role: a player suddenly holding their personal
 * role would announce their casting status before the season does.
 */
export function buildManualRoleModal({ configId }) {
  return {
    custom_id: `channels_manualrole_modal_${configId}`,
    title: '🔗 Manual Player Role',
    components: [
      {
        type: 10, // Text Display
        content: '### Link a player to an existing role\nUse this when player roles were already created by hand or by another bot. CastBot records the link and uses that role for confessionals, subs, 1on1s and alliances — exactly as if 🎭 Player Roles had created it.'
      },
      {
        type: 18, // Label
        label: 'Player',
        description: 'Who this personal role belongs to',
        component: { type: 5, custom_id: 'user', required: true, min_values: 1, max_values: 1, placeholder: 'Select the player...' }
      },
      {
        type: 18, // Label
        label: 'Existing role',
        description: 'Their personal role. Replaces any previously linked role for this player.',
        component: { type: 6, custom_id: 'role', required: true, min_values: 1, max_values: 1, placeholder: 'Select their role...' }
      },
      {
        type: 10, // Text Display
        content: '-# ⚠️ CastBot only **records** the link — it does NOT assign the role to the player. Holding their personal role could expose their casting status before the season reveals it. Assign it yourself when the time is right.'
      }
    ]
  };
}

/**
 * 🟢 Activate modal — THE reveal step: assign previously linked player roles to their
 * players. A Role Select can't be filtered, so the picker is a String Select whose options
 * ARE the CastBot-linked roles (players[*].playerRoleId, live roles only, ≤25).
 * @param {Object} p
 * @param {string} p.configId
 * @param {Array<{roleId: string, playerName: string, roleName: string}>} p.options - resolved links
 * @param {number} [p.hidden] - links beyond Discord's 25-option cap (named honestly, never silent)
 */
export function buildActivateModal({ configId, options, hidden = 0 }) {
  return {
    custom_id: `channels_activate_modal_${configId}`,
    title: '🟢 Activate Player Roles',
    components: [
      {
        type: 10, // Text Display
        content: '### Assign player roles to their players\nEach selected role is assigned to the player it\'s linked to in CastBot (via 🎭 Auto Create or 🔗 Manually Link). **Nothing happens yet** — you\'ll review every change first, including any role moves from a re-link.'
      },
      {
        type: 18, // Label
        label: 'Player roles to assign',
        description: 'Only roles linked in CastBot are listed. Pick everyone, or stagger it.',
        component: {
          type: 3, // String Select (multi) — options are the linked roles
          custom_id: 'activate_roles',
          required: true,
          min_values: 1,
          max_values: Math.min(options.length, 25),
          placeholder: 'Select the player roles to assign...',
          options: options.slice(0, 25).map((o) => ({
            label: o.playerName.substring(0, 100),
            value: o.roleId,
            description: `@${o.roleName}`.substring(0, 100),
            emoji: { name: '🎭' }
          }))
        }
      },
      {
        type: 10, // Text Display
        content: `-# ⚠️ **Timing matters.** Once assigned, the role appears on the player's profile — players and specs can read the member list and see who has been cast. Don't activate before marooning unless you intend that reveal.${hidden ? `\n-# …${hidden} more link${hidden === 1 ? '' : 's'} beyond Discord's 25-option cap — run Activate again for the rest.` : ''}`
      }
      // The confirm screen (planActivate) repeats the reveal warning next to the exact change
      // list — the modal alone is never the last stop anymore.
    ]
  };
}

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
