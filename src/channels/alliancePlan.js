/**
 * Alliances — pure planning helpers (RaP 0892).
 *
 * Like channelPlan.js: NO Discord imports, NO storage imports, no top-level console.log.
 * This module carries the alliance unit-test surface (tests/alliancePlan.test.js imports
 * the real functions).
 *
 * Secrecy invariants encoded here:
 * - allianceChannelName() NEVER derives a name from member display names — the default is
 *   the deliberately generic 'alliance' so a channel list leaks nothing.
 * - IDs from newAllianceId() are base36 with no underscores, because configIds DO contain
 *   underscores and every alliance custom_id parses as  ..._{id}_{configId}  with the id
 *   being [a-z0-9]+ and the configId the trailing remainder.
 */
import { ALLIANCE_DEFAULTS } from './channelAdminConfig.js';

/**
 * Base36 timestamp id + 2 chars of entropy — no underscores (see module header).
 * The entropy tail keeps two same-millisecond requests from patch-merging into one record.
 */
export function newAllianceId(now = Date.now()) {
  return now.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
}

/**
 * Channel name for an alliance. Blank/whitespace/unsluggable input → the generic default.
 * NOT channelPlan.toSlug: its empty-input fallback is `player-XXXX`, which is exactly the
 * kind of accidental hint an alliance channel name must never carry.
 */
export function allianceChannelName(rawInput) {
  const slug = (rawInput || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // fold accents: José → Jose
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 90)
    .replace(/-$/, '');
  return slug || ALLIANCE_DEFAULTS.channelName;
}

/**
 * Same-tribe warning guard — warn, never enforce.
 *
 * @param {Array<{userId: string, displayName: string, tribeNames: string[]}>} members
 * @returns {{ aligned: boolean, tribesSpanned: string[], warnings: Array<{userId, displayName, reason: 'cross_tribe'|'no_tribe'}> }}
 *
 * Rules:
 * - A member in NO tribe → 'no_tribe' warning.
 * - If the members (that have tribes) span more than one tribe, every member outside the
 *   majority tribe gets 'cross_tribe'. Ties pick the first-seen tribe as the anchor so the
 *   output is deterministic.
 */
export function assessTribeAlignment(members) {
  const withTribes = (members || []).filter((m) => (m.tribeNames || []).length > 0);
  const tallies = new Map(); // tribeName → count, insertion-ordered
  for (const m of withTribes) {
    for (const t of m.tribeNames) tallies.set(t, (tallies.get(t) || 0) + 1);
  }
  const tribesSpanned = [...tallies.keys()];
  let anchor = null;
  for (const [name, count] of tallies) {
    if (anchor === null || count > tallies.get(anchor)) anchor = name;
  }

  const warnings = [];
  for (const m of members || []) {
    const tribes = m.tribeNames || [];
    if (tribes.length === 0) {
      warnings.push({ userId: m.userId, displayName: m.displayName, reason: 'no_tribe' });
    } else if (tribesSpanned.length > 1 && !tribes.includes(anchor)) {
      warnings.push({ userId: m.userId, displayName: m.displayName, reason: 'cross_tribe' });
    }
  }
  return { aligned: warnings.length === 0, tribesSpanned, warnings };
}

/**
 * Diff two member lists by userId.
 * @returns {{ added: string[], removed: string[], kept: string[] }}
 */
export function diffMembers(oldMembers, newMembers) {
  const oldIds = new Set((oldMembers || []).map((m) => m.userId ?? m));
  const newIds = new Set((newMembers || []).map((m) => m.userId ?? m));
  return {
    added: [...newIds].filter((id) => !oldIds.has(id)),
    removed: [...oldIds].filter((id) => !newIds.has(id)),
    kept: [...newIds].filter((id) => oldIds.has(id))
  };
}

/**
 * One place that understands every alliance custom_id (taxonomy in RaP 0892).
 *
 *   channels_alliances_{configId}                      → { verb: 'manager', configId }
 *   channels_alliance_select_{configId}                → { verb: 'select', configId }
 *   channels_alliance_new_{configId}                   → { verb: 'new', configId }
 *   channels_alliance_edit_{allianceId}_{configId}     → { verb: 'edit', allianceId, configId }
 *   channels_alliance_members_{allianceId}_{configId}  → { verb: 'members', allianceId, configId }
 *   channels_alliance_delete_{allianceId}_{configId}   → { verb: 'delete', allianceId, configId }
 *   channels_alliance_review_{requestId}               → { verb: 'review', requestId }
 *   channels_alliance_modal_new_{configId}             → { verb: 'modal', mode: 'new', configId }
 *   channels_alliance_modal_r{requestId}_{configId}    → { verb: 'modal', mode: 'request', requestId, configId }
 *   channels_alliance_modal_e{allianceId}_{configId}   → { verb: 'modal', mode: 'edit', allianceId, configId }
 *   channels_alliance_modal_m{allianceId}_{configId}   → { verb: 'modal', mode: 'members', allianceId, configId }
 *   alliance_request_modal_{configId}                  → { verb: 'request_submit', configId }
 *
 * Returns null for anything else. allianceId/requestId are base36 [a-z0-9]+ (no underscores);
 * configId is always the trailing remainder (it contains underscores).
 */
export function parseAllianceCustomId(customId) {
  if (!customId) return null;
  let m;
  if ((m = customId.match(/^channels_alliances_(.+)$/))) return { verb: 'manager', configId: m[1] };
  if ((m = customId.match(/^channels_alliance_select_(.+)$/))) return { verb: 'select', configId: m[1] };
  if ((m = customId.match(/^channels_alliance_new_(.+)$/))) return { verb: 'new', configId: m[1] };
  if ((m = customId.match(/^channels_alliance_(edit|members|delete)_([a-z0-9]+)_(.+)$/))) {
    return { verb: m[1], allianceId: m[2], configId: m[3] };
  }
  if ((m = customId.match(/^channels_alliance_review_([a-z0-9]+)$/))) return { verb: 'review', requestId: m[1] };
  if ((m = customId.match(/^channels_alliance_modal_new_(.+)$/))) return { verb: 'modal', mode: 'new', configId: m[1] };
  if ((m = customId.match(/^channels_alliance_modal_r([a-z0-9]+)_(.+)$/))) {
    return { verb: 'modal', mode: 'request', requestId: m[1], configId: m[2] };
  }
  if ((m = customId.match(/^channels_alliance_modal_e([a-z0-9]+)_(.+)$/))) {
    return { verb: 'modal', mode: 'edit', allianceId: m[1], configId: m[2] };
  }
  if ((m = customId.match(/^channels_alliance_modal_m([a-z0-9]+)_(.+)$/))) {
    return { verb: 'modal', mode: 'members', allianceId: m[1], configId: m[2] };
  }
  if ((m = customId.match(/^alliance_request_modal_(.+)$/))) return { verb: 'request_submit', configId: m[1] };
  return null;
}

/**
 * Requesters are ALWAYS members of the alliance they request (servivorg 2026-08-15: a request
 * that only named others created a channel its own requester couldn't see). Requester-first
 * ordering so the request card and review modal lead with them; no dupe if self-selected.
 */
export function includeRequester(requesterId, selectedIds) {
  const selected = selectedIds || [];
  return selected.includes(requesterId) ? [...selected] : [requesterId, ...selected];
}

/** Notify modes — Radio Group values. Silent is the secrecy-safe default. */
export const NOTIFY_MODES = ['silent', 'announce', 'announce_requestor'];

export function normalizeNotify(value) {
  return NOTIFY_MODES.includes(value) ? value : 'silent';
}
