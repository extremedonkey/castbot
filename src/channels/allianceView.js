/**
 * Alliances — UI builders (RaP 0892). No storage/Discord I/O; handlers feed in data.
 *
 * Secrecy is the design driver: alliance existence is season-deciding information, so
 * every screen here is ephemeral (or, for the request card, deliberately explicit that it
 * is public), channel names default to the generic 'alliance', and nothing ever renders a
 * member list outside the whitelisted admin flow except the request card the player
 * knowingly posted.
 *
 * MODAL COMPONENT CHOICES — same rules as channelsView.js (docs/standards/ComponentsV2.md):
 *  - Radio Group (21) for single-choice fields; exactly ONE option carries `default: true`
 *    via conditional spread.
 *  - Select `default_values` is unreliable in modals → current values ALSO stated in Label
 *    descriptions, and submits fall back server-side to stored members when empty.
 *  - Modals cannot carry custom Cancel buttons — every modal's Text Display says a review
 *    step follows, and the review screen has the real Cancel.
 */
import { ALLIANCE_DEFAULTS } from './channelAdminConfig.js';

const PURPLE = 0x9B59B6;

/**
 * Neutralize mention syntax in user-controlled names before they enter a PUBLIC message.
 * A nickname can legally BE '@everyone' or '<@&roleId>' — and the factory's deferred path
 * strips allowed_mentions (buttonHandlerFactory.js editWebhookMessage), so the builder-level
 * `parse: []` cannot be relied on. A zero-width space after '@' breaks every mention token.
 */
function sanitizeName(name) {
  return String(name || '').replace(/@/g, '@' + '​');
}

/** Compact "A, B, C +2 more" summary capped for select descriptions (100 chars). */
function memberSummary(members, max = 90) {
  const names = (members || []).map((m) => m.displayName || m.userId);
  let out = '';
  for (let i = 0; i < names.length; i++) {
    const next = out ? `${out}, ${names[i]}` : names[i];
    if (next.length > max) return `${out} +${names.length - i} more`;
    out = next;
  }
  return out || 'no members';
}

/**
 * The Alliance Manager — castlist_hub pattern: everything visible, action buttons disabled
 * until the select has a selection. Selection is stateless: `default: true` on the selected
 * option + allianceId baked into the enabled buttons' custom_ids.
 *
 * @param {Object} p
 * @param {string} p.configId
 * @param {string} p.seasonName
 * @param {Object} p.alliances - registry map allianceId → record
 * @param {Object} p.requests - registry map requestId → record
 * @param {string|null} p.selectedId
 * @returns {Object} { components: [container] }
 */
export function buildAllianceManager({ configId, seasonName, alliances = {}, requests = {}, selectedId = null }) {
  const entries = Object.entries(alliances);
  const selected = selectedId ? alliances[selectedId] : null;
  const openRequests = Object.values(requests).filter((r) => r?.status === 'open').length;

  // Select — newest first, 25-cap with a sentinel (playerManagement.js:948 pattern).
  let selectRow;
  if (entries.length === 0) {
    selectRow = { type: 1, components: [{
      type: 3, custom_id: `channels_alliance_select_${configId}`, placeholder: 'No alliances yet — create one below',
      min_values: 0, max_values: 1, disabled: true,
      options: [{ label: 'No alliances', value: 'none' }]
    }]};
  } else {
    const options = entries
      .sort(([, a], [, b]) => (b?.createdAt || '').localeCompare(a?.createdAt || ''))
      .slice(0, 25)
      .map(([id, a]) => ({
        label: `#${a.name || ALLIANCE_DEFAULTS.channelName}`.substring(0, 100),
        value: id,
        description: memberSummary(a.members).substring(0, 100),
        emoji: { name: '🤝' },
        ...(id === selectedId ? { default: true } : {})
      }));
    if (entries.length > 25) {
      options[24] = { label: '❌ Max alliances shown', value: '_error_max', description: 'Too many alliances to display' };
    }
    selectRow = { type: 1, components: [{
      type: 3, custom_id: `channels_alliance_select_${configId}`, placeholder: 'Select an alliance to manage...',
      min_values: 0, max_values: 1, options
    }]};
  }

  // Detail pane
  let detail;
  if (selected) {
    const memberLines = (selected.members || [])
      .map((m) => `> <@${m.userId}>${m.playerRoleId ? '' : ' -# (no player role — direct access)'}`);
    detail = [
      `**Channel:** <#${selected.channelId}>`,
      `**Members (${(selected.members || []).length}):**`,
      ...memberLines.slice(0, 15),
      ...(memberLines.length > 15 ? [`> …and ${memberLines.length - 15} more`] : []),
      `**Notify:** ${selected.notify || 'silent'} · **Created:** <t:${Math.floor(new Date(selected.createdAt || Date.now()).getTime() / 1000)}:R>`,
      `**Created by:** <@${selected.createdBy}>${selected.requestedBy ? ` · **Requested by:** <@${selected.requestedBy}>` : ''}`
    ].join('\n');
  } else {
    detail = '-# Select an alliance to manage it, or create a new one.';
  }
  if (openRequests) detail += `\n-# 📨 ${openRequests} open request${openRequests === 1 ? '' : 's'} — review from the request card in its channel.`;

  const idPart = selectedId || 'none';
  const container = {
    type: 17,
    accent_color: PURPLE,
    components: [
      { type: 10, content: `## 🤝 Alliances\n-# ${seasonName} — channels are visible ONLY to their members and hosts. Handle with care.` },
      { type: 14 },
      selectRow,
      { type: 10, content: detail },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `channels_alliance_new_${configId}`, label: 'New Alliance', style: 1, emoji: { name: '🤝' } },
        { type: 2, custom_id: `channels_alliance_edit_${idPart}_${configId}`, label: 'Edit', style: 2, emoji: { name: '✏️' }, disabled: !selected },
        { type: 2, custom_id: `channels_alliance_members_${idPart}_${configId}`, label: 'Remove Members', style: 2, emoji: { name: '➖' }, disabled: !selected },
        { type: 2, custom_id: `channels_alliance_delete_${idPart}_${configId}`, label: 'Delete', style: 4, emoji: { name: '🗑️' }, disabled: !selected }
      ]},
      { type: 14 },
      { type: 1, components: [{ type: 2, custom_id: `season_channels_${configId}`, label: '← Channels', style: 2 }] }
    ]
  };

  return { components: [container] };
}

/**
 * The Create / Edit alliance modal — exactly 5 top-level components (Discord's modal cap).
 *
 * @param {Object} p
 * @param {string} p.configId
 * @param {'new'|'request'|'edit'} p.mode
 * @param {string} [p.requestId] - request mode: the stored request being reviewed
 * @param {string} [p.allianceId] - edit mode
 * @param {Object} [p.alliance] - edit mode: current record (prefills)
 * @param {Array} [p.prefillMembers] - request mode: [{userId, displayName}]
 */
export function buildAllianceModal({ configId, mode = 'new', requestId = null, allianceId = null, alliance = null, prefillMembers = [] }) {
  const isEdit = mode === 'edit';
  const isRequest = mode === 'request';
  const customId = isEdit
    ? `channels_alliance_modal_e${allianceId}_${configId}`
    : isRequest
      ? `channels_alliance_modal_r${requestId}_${configId}`
      : `channels_alliance_modal_new_${configId}`;

  const prefill = isEdit ? (alliance?.members || []) : prefillMembers;
  const currentNotify = alliance?.notify || 'silent';
  const showRequestorOption = isRequest || !!alliance?.requestedBy;

  const membersDescription = isEdit
    ? `Currently ${prefill.length} member${prefill.length === 1 ? '' : 's'} — leave empty to keep them unchanged.`
    : isRequest
      ? `Requested: ${prefill.length} member${prefill.length === 1 ? '' : 's'} — leave empty to accept as requested.`
      : 'Users and/or roles — roles expand to their members. Cross-tribe is warned at review.';

  const notifyOptions = [
    { label: 'Silent', value: 'silent', description: "Channel quietly appears in members' channel lists",
      ...(currentNotify === 'silent' ? { default: true } : {}) },
    { label: 'Announce creation', value: 'announce', description: 'Tags alliance members in the channel after creation',
      ...(currentNotify === 'announce' ? { default: true } : {}) },
    ...(showRequestorOption ? [{ label: 'Announce requestor', value: 'announce_requestor', description: 'Tags members AND names who requested the alliance',
      ...(currentNotify === 'announce_requestor' ? { default: true } : {}) }] : [])
  ];

  return {
    custom_id: customId,
    title: isEdit ? 'Edit Alliance' : 'Create Alliance',
    components: [
      {
        type: 10, // Text Display — counts toward the 5-component modal cap
        content: isEdit
          ? '### 🤫 Nothing changes yet\nYou will review the changes (members, tribes, warnings) before they apply.'
          : '### 🤫 Nothing is created yet\nYou will review everything (members, tribes, warnings) before the channel exists.'
      },
      {
        type: 18,
        label: 'Alliance Members',
        description: membersDescription.substring(0, 100),
        component: {
          type: 7, // Mentionable Select — the "combo user/role select"
          custom_id: 'members',
          required: mode === 'new',
          min_values: mode === 'new' ? 1 : 0,
          max_values: 25
          // Deliberately NO default_values: it's unreliable in modals, and worse — a >25-member
          // alliance sliced into it would submit as a silent mass-REMOVAL of members 26+. An
          // untouched (empty) select means "keep/accept current", enforced server-side.
        }
      },
      {
        type: 18,
        label: 'Alliance Category',
        description: `Optional — blank uses/creates "${ALLIANCE_DEFAULTS.categoryName}".`.substring(0, 100),
        component: {
          type: 8, // Channel Select
          custom_id: 'category',
          channel_types: [4], // categories only
          required: false,
          min_values: 0,
          max_values: 1,
          ...(alliance?.categoryId ? { default_values: [{ id: alliance.categoryId, type: 'channel' }] } : {})
        }
      },
      {
        type: 18,
        label: 'Channel Name (optional)',
        description: `Blank → "${ALLIANCE_DEFAULTS.channelName}". Avoid names that reveal members or plans.`,
        component: {
          type: 4, // Text Input
          custom_id: 'channel_name',
          style: 1,
          required: false,
          max_length: 90,
          placeholder: ALLIANCE_DEFAULTS.channelName,
          ...(isEdit && alliance?.name ? { value: alliance.name } : {})
        }
      },
      {
        type: 18,
        label: 'Notify on creation?',
        description: 'Silent is the secrecy-safe default.',
        component: {
          type: 21, // Radio Group — its option `default` DOES pre-select in modals
          custom_id: 'notify',
          required: true,
          options: notifyOptions
        }
      }
    ]
  };
}

/** Remove Members — cut-down modal: a String Select of the alliance's current members. */
export function buildRemoveMembersModal({ configId, allianceId, alliance }) {
  const all = alliance?.members || [];
  const members = all.slice(0, 25); // Discord's select-option cap
  const truncNote = all.length > 25 ? `\n-# ⚠️ Showing the first 25 of ${all.length} members — remove in passes.` : '';
  return {
    custom_id: `channels_alliance_modal_m${allianceId}_${configId}`,
    title: 'Remove Members',
    components: [
      {
        type: 10,
        content: `### 🤫 Nothing changes yet\nYou will review the removals before they apply. Removed members lose channel access; the channel stays.${truncNote}`
      },
      {
        type: 18,
        label: 'Members to remove',
        description: 'Their access (player role or direct) is revoked on apply.',
        component: {
          type: 3, // String Select of stored member snapshots — clearer than a guild-wide user select
          custom_id: 'remove',
          required: true,
          min_values: 1,
          max_values: Math.max(1, members.length),
          options: members.map((m) => ({
            label: (m.displayName || m.userId).substring(0, 100),
            value: m.userId,
            emoji: { name: '➖' }
          }))
        }
      }
    ]
  };
}

/** The player-facing request modal — members only. */
export function buildAllianceRequestModal({ configId }) {
  return {
    custom_id: `alliance_request_modal_${configId}`,
    title: 'Request Alliance',
    components: [
      {
        type: 10,
        content: '### 📨 Goes to Production for review\nSubmitting posts a request card **in this channel** — use a private channel (e.g. your confessional). Nothing is created unless Production approves, and you will not be notified of a rejection.'
      },
      {
        type: 18,
        label: 'Alliance Members',
        description: 'Users and/or roles — include yourself if you are in it.',
        component: {
          type: 7, // Mentionable Select
          custom_id: 'members',
          required: true,
          min_values: 1,
          max_values: 25
        }
      }
    ]
  };
}

/**
 * The PUBLIC request card posted in the invoking channel. Names are plain text (no pings);
 * the response carries allowed_mentions parse:[] belt-and-braces.
 */
export function buildAllianceRequestCard({ requestId, requesterId, requesterName, members = [] }) {
  const names = members.map((m) => sanitizeName(m.displayName) || m.userId).join(', ');
  return {
    allowed_mentions: { parse: [] },
    components: [{
      type: 17,
      accent_color: PURPLE,
      components: [
        { type: 10, content: [
          '## 🤝 Alliance Request',
          `**Requested by:** ${sanitizeName(requesterName) || requesterId}`,
          `**Members (${members.length}):** ${names}`,
          '-# Production: hit Review to create this alliance — you will see tribes and warnings before anything is made.'
        ].join('\n') },
        { type: 14 },
        { type: 1, components: [
          { type: 2, custom_id: `channels_alliance_review_${requestId}`, label: 'Review Alliance', style: 1, emoji: { name: '🔍' } }
        ]}
      ]
    }]
  };
}
