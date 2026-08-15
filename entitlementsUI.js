/**
 * 🎟️ Entitlements UI — Reece-only admin surface for the runtime premium registry.
 *
 * Lives in the CastBot Premium menu → Utilities row (menuBuilder.js buildPremiumMenu),
 * Reece-only. This is where "which guilds have CastBot Premium" is maintained WITHOUT a
 * deploy — grants, expiry, revocation, and the expiry test stubs.
 *
 * SINGLE-SCREEN entity-select pattern (2026-08-16 redesign, mirrors the Alliance Manager /
 * Castlist Hub): ONE String Select picks a server, the same message re-renders with that
 * server's detail pane + contextual action rows. Selection is stateless — the chosen option
 * carries `default: true` and every enabled button bakes the guildId into its custom_id.
 * This replaced the old two-parallel-selects layout ("pick a guild" + "change access") and
 * its separate detail screen, which was the "weird component interactions" complaint.
 *
 * MODEL (since the v3 migration): a grant IS a premium tier — with an expiry (or permanent),
 * a source (🖐️ manual by Reece vs 💳 Ko-fi subscription), and an audit trail. À-la-carte
 * `features` arrays still exist in data as legacy records and display as small print, but
 * the panel no longer creates feature-only entries — that shape is how a comped guild ended
 * up staring at the paywall (hasPremiumAccessSync is tier-only, by design).
 *
 * @module entitlementsUI
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import {
  TIERS, GRACE_MS, listEntitledGuilds, getGuildEntitlement, setGuildNames,
  grantTier, extendTier, setTierValidUntil, revokeTier, removeGuildEntry, parseDuration
} from './entitlements.js';

const ACCENT = 0x9b59b6;
const OWNER_ID = '391415444084490240';

/** How far ahead "Expiring Soon" looks. Two weeks = enough runway to chase a renewal. */
export const EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

/** State emoji per tier state — the panel's one visual vocabulary, used everywhere. */
export function stateEmoji(ts) {
  if (!ts || ts.state === 'none') return '➖';
  return { active: '⭐', grace: '🕒', lapsed: '💀' }[ts.state] || '➖';
}

/** Source label — "how it was set". 💳 Ko-fi subscription vs 🖐️ manual (Reece). */
export function sourceLabel(g) {
  if (!g?.tierState || g.tierState.state === 'none') return null;
  return g.source === 'subscription' ? '💳 Ko-fi' : '🖐️ manual';
}

/**
 * Urgency sort for the list AND the select (same order, so the two never disagree):
 * grace (most urgent) → active dated, soonest first → active permanent → lapsed → no tier.
 */
export function sortGuilds(guilds) {
  const rank = (g) => {
    const ts = g.tierState;
    if (!ts || ts.state === 'none') return 4;
    if (ts.state === 'grace') return 0;
    if (ts.state === 'active') return ts.permanent ? 2 : 1;
    return 3; // lapsed
  };
  return [...(guilds || [])].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    const av = a.tierState?.validUntil ?? Infinity;
    const bv = b.tierState?.validUntil ?? Infinity;
    if (av !== bv) return av - bv;
    return String(a.displayName || a.name).localeCompare(String(b.displayName || b.name));
  });
}

/** One list-line per guild: state + name + premium status + source. Pure — unit-tested. */
export function formatGuildLine(g) {
  const ts = g.tierState;
  const name = `**${g.displayName || g.name}**`;
  const src = sourceLabel(g);
  const unknown = (g.displayName || g.name) === g.guildId ? ' *(bot not in this server)*' : '';
  let status;
  if (!ts || ts.state === 'none') {
    status = g.features?.length ? 'no premium *(legacy features only)*' : 'no premium';
  } else if (ts.state === 'active' && ts.permanent) {
    status = 'permanent';
  } else if (ts.state === 'active') {
    status = `until <t:${Math.floor(ts.validUntil / 1000)}:d>`;
  } else if (ts.state === 'grace') {
    status = `grace ends <t:${Math.floor(ts.graceUntil / 1000)}:R>`;
  } else {
    status = `lapsed <t:${Math.floor(ts.validUntil / 1000)}:R>`;
  }
  return `${stateEmoji(ts)} ${name} — ${status}${src ? ` · ${src}` : ''}${unknown} · \`${g.guildId}\``;
}

/**
 * Select-option description (Discord renders NO markdown/timestamps there — plain words
 * with an absolute date). Pure — unit-tested.
 */
export function describeOption(g, now = Date.now()) {
  const ts = g.tierState;
  if (!ts || ts.state === 'none') return g.features?.length ? 'No premium (legacy features only)' : 'No premium';
  const src = g.source === 'subscription' ? 'Ko-fi' : 'manual';
  const date = (ms) => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  if (ts.state === 'active' && ts.permanent) return `Permanent · ${src}`;
  if (ts.state === 'active') return `Until ${date(ts.validUntil)} · ${src}`;
  if (ts.state === 'grace') return `GRACE until ${date(ts.graceUntil)} · ${src}`;
  return `Lapsed ${date(ts.validUntil)} · ${src}`;
}

/**
 * Pure — the guilds worth chasing, soonest first.
 *
 * Includes a dated tier expiring within `windowMs`, plus anything already in GRACE
 * (past validUntil, still working) since that's the most urgent case of all. Excludes
 * permanent tiers (nothing to renew) and fully-lapsed ones (nothing left to save — they
 * already show 💀 in the main list). Unit-tested.
 */
export function selectExpiringSoon(guilds, now = Date.now(), windowMs = EXPIRING_SOON_MS) {
  return (guilds || [])
    .filter(g => {
      const ts = g.tierState;
      if (!ts || ts.permanent || ts.validUntil == null) return false;
      if (ts.state === 'grace') return true;
      return ts.state === 'active' && (ts.validUntil - now) <= windowMs;
    })
    .sort((a, b) => a.tierState.validUntil - b.tierState.validUntil);
}

/** One Expiring-Soon line. Pure — unit-tested. */
export function formatExpiringLine(g) {
  const ts = g.tierState;
  const label = TIERS[ts.tier]?.label || ts.tier;
  const expiry = Math.floor(ts.validUntil / 1000);
  return ts.state === 'grace'
    ? `🕒 **${g.displayName}** · ${label} expired <t:${expiry}:R> — grace ends <t:${Math.floor(ts.graceUntil / 1000)}:R>`
    : `⏳ **${g.displayName}** · ${label} expires <t:${expiry}:R>`;
}

/**
 * Cap a line list to a line count AND a character budget (Discord rejects a message when
 * its combined Text Display content passes 4000 chars — the whole panel shares that cap,
 * so the guild list gets an explicit budget instead of a silent 30-line slice). Returns
 * the kept lines plus an honest "+N more" sentinel when anything was dropped — silent
 * truncation reads as "that's everyone" (LeanUserInterfaceDesign / alliance precedent).
 * Pure — unit-tested.
 */
export function capLinesToBudget(lines, { maxLines = 25, maxChars = 2800 } = {}) {
  const kept = [];
  let used = 0;
  for (const line of lines || []) {
    if (kept.length >= maxLines || used + line.length + 1 > maxChars) break;
    kept.push(line);
    used += line.length + 1;
  }
  const hidden = (lines || []).length - kept.length;
  if (hidden > 0) kept.push(`-# …and ${hidden} more — the select lists the first 25; manage others via Add Server with their guild ID.`);
  return { lines: kept, hidden };
}

/** Truncate by CODE POINTS so an astral-plane emoji is never split into a lone surrogate
 *  (Discord rejects invalid Unicode in modal titles). Pure — unit-tested. */
export function safeTruncate(str, max) {
  const points = [...String(str ?? '')];
  return points.length <= max ? String(str ?? '') : points.slice(0, max - 1).join('') + '…';
}

/** Header summary counts. Pure — unit-tested. */
export function summarizeGuilds(guilds) {
  const c = { total: 0, active: 0, grace: 0, lapsed: 0, none: 0 };
  for (const g of guilds || []) {
    c.total++;
    const s = g.tierState?.state || 'none';
    c[s in c ? s : 'none']++;
  }
  const parts = [`${c.total} server${c.total === 1 ? '' : 's'}`];
  if (c.active) parts.push(`⭐ ${c.active} premium`);
  if (c.grace) parts.push(`🕒 ${c.grace} in grace`);
  if (c.lapsed) parts.push(`💀 ${c.lapsed} lapsed`);
  if (c.none) parts.push(`➖ ${c.none} none`);
  return parts.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Name resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve display names from the bot's own guild cache and persist any it learns.
 * The bot is a member of every entitled guild, so it already knows the names —
 * self-healing beats making the admin type them. Names are written back only when the
 * stored name is still the raw ID, so a guild the bot later leaves keeps its last name.
 */
async function resolveGuildNames(guilds, client) {
  const learned = {};
  for (const g of guilds) {
    const cached = client?.guilds?.cache?.get(g.guildId)?.name;
    g.displayName = cached || g.name;
    g.inGuild = !!cached;
    if (cached && g.name === g.guildId) {
      learned[g.guildId] = cached;
      g.name = cached;
    }
  }
  if (Object.keys(learned).length) {
    // ONE existence-guarded save — grantFeature here would re-create an entry a
    // concurrent Remove Server just deleted (phantom-resurrection race, review 2026-08-16).
    try { await setGuildNames(learned); } catch { /* naming is cosmetic — never fail the panel */ }
  }
  return guilds;
}

// ─────────────────────────────────────────────────────────────────────────────
// The panel (single screen)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * COMPUTED destructive-action warning — names what this entry actually holds instead of
 * a generic disclaimer (LeanUserInterfaceDesign "Unquantified Warnings"). Pure — tested.
 * @param {'remove'|'revoke'} action
 */
export function buildDestructiveWarning(action, e, displayName) {
  const ts = e.tierState;
  const held = [];
  if (ts.state !== 'none') {
    const life = ts.permanent ? 'permanent' : ts.state === 'active' ? `until <t:${Math.floor(ts.validUntil / 1000)}:d>` : ts.state;
    held.push(`${TIERS[ts.tier]?.emoji || '⭐'} Premium (${life}, ${e.source === 'subscription' ? 'Ko-fi' : 'manual'})`);
  }
  if (e.kofiEmail) held.push('the Ko-fi billing link (renewals will stop landing here)');
  if (action === 'remove' && e.features?.length) held.push(`${e.features.length} legacy feature grant${e.features.length === 1 ? '' : 's'}`);
  const what = held.length ? held.join(' · ') : 'an empty entry';
  return action === 'remove'
    ? `## ⚠️ Remove **${displayName}**?\nThis forgets: ${what}. The audit trail (who granted it, when, why) is deleted with it.`
    : `## ⚠️ Revoke Premium from **${displayName}**?\nThis removes: ${what}.${e.features?.length ? ` Legacy feature grants (${e.features.join(', ')}) stay.` : ''}`;
}

/** Detail-pane lines for the selected guild. Exported for tests. */
export function buildDetailLines(e, displayName) {
  const ts = e.tierState;
  const lines = [`### ${stateEmoji(ts)} ${displayName}`, `\`${e.guildId}\``];
  if (ts.state === 'none') {
    lines.push(`**Premium:** ➖ none`);
  } else if (ts.state === 'active' && ts.permanent) {
    lines.push(`**Premium:** 🟢 Active — permanent`);
  } else if (ts.state === 'active') {
    lines.push(`**Premium:** 🟢 Active — until <t:${Math.floor(ts.validUntil / 1000)}:D> (<t:${Math.floor(ts.validUntil / 1000)}:R>)`);
    lines.push(`**Grace ends:** <t:${Math.floor(ts.graceUntil / 1000)}:D> (<t:${Math.floor(ts.graceUntil / 1000)}:R>)`);
  } else if (ts.state === 'grace') {
    lines.push(`**Premium:** 🕒 IN GRACE — expired <t:${Math.floor(ts.validUntil / 1000)}:R>, features stop <t:${Math.floor(ts.graceUntil / 1000)}:R>`);
  } else {
    lines.push(`**Premium:** 💀 LAPSED — expired <t:${Math.floor(ts.validUntil / 1000)}:R>`);
  }
  if (ts.state !== 'none') {
    const when = e.grantedAt ? ` <t:${Math.floor(e.grantedAt / 1000)}:d>` : '';
    lines.push(e.source === 'subscription'
      ? `**Source:** 💳 Ko-fi subscription${when}${e.kofiEmail ? ' — email linked, renewals extend automatically' : ''}`
      : `**Source:** 🖐️ Manual${e.grantedBy ? ` — <@${e.grantedBy}>` : ''}${when}${e.reason ? ` · *"${e.reason}"*` : ''}`);
  }
  if (e.features?.length) lines.push(`-# Legacy feature grants (never expire): ${e.features.join(', ')}`);
  return lines;
}

/**
 * The Entitlements panel. Re-rendered in place by every interaction (updateMessage).
 * @param {Object} client - Discord client (guild-name cache)
 * @param {string|null} selectedId - guildId to show the detail pane for
 * @param {{arm?: 'remove'|'revoke'|null}} [opts] - arm = show that destructive confirm row
 */
export async function buildEntitlementsManageUI(client = null, selectedId = null, opts = {}) {
  const guilds = sortGuilds(await resolveGuildNames(await listEntitledGuilds(), client));
  const selected = selectedId ? guilds.find(g => g.guildId === selectedId) : null;
  const armed = opts.arm && selected ? opts.arm : null;

  const components = [
    { type: 10, content: `## 🎟️ Entitlements\n${summarizeGuilds(guilds)}` }
  ];

  // Renewal runway — only rendered when something actually needs chasing.
  const expiring = selectExpiringSoon(guilds);
  if (expiring.length) {
    components.push(
      { type: 10, content: '### ```⏳ Expiring Soon```' },
      { type: 10, content: expiring.slice(0, 10).map(formatExpiringLine).join('\n') }
    );
  }

  // Char-budgeted list (the panel's combined Text Display content shares Discord's
  // 4000-char cap) with an honest "+N more" sentinel — never a silent slice.
  const listLines = capLinesToBudget(guilds.map(formatGuildLine)).lines;
  components.push(
    { type: 10, content: guilds.length ? listLines.join('\n') : '*No servers yet — Add Server to grant the first premium.*' },
    { type: 14 }
  );

  if (guilds.length) {
    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: 'entitlements_guild',
        placeholder: 'Select a server to view & manage...',
        options: guilds.slice(0, 25).map(g => ({
          label: g.displayName.substring(0, 100),
          value: g.guildId,
          description: describeOption(g).substring(0, 100),
          emoji: { name: stateEmoji(g.tierState) },
          ...(g.guildId === selected?.guildId ? { default: true } : {})
        }))
      }]
    });
  }

  if (selected) {
    const e = getGuildEntitlement(selected.guildId);
    if (e.exists) {
      const ts = e.tierState;
      components.push({ type: 10, content: buildDetailLines(e, selected.displayName).join('\n') });

      if (armed) {
        // Armed destructive confirm — Critical Deletion standard: computed facts, separator
        // above the buttons, Cancel first (❌ Secondary), confirm last (🗑️ Danger). The
        // container accent flips red below.
        const cancelId = armed === 'remove' ? `entitlements_remove_cancel_${e.guildId}` : `entitlements_revoke_cancel_${e.guildId}`;
        const confirmId = armed === 'remove' ? `entitlements_remove_confirm_${e.guildId}` : `entitlements_revoke_confirm_${e.guildId}`;
        components.push({ type: 10, content: buildDestructiveWarning(armed, e, selected.displayName) });
        components.push({ type: 14 });
        components.push({ type: 1, components: [
          { type: 2, custom_id: cancelId, label: 'Cancel', style: 2, emoji: { name: '❌' } },
          { type: 2, custom_id: confirmId, label: armed === 'remove' ? 'Yes, Remove Server' : 'Yes, Revoke Premium', style: 4, emoji: { name: '🗑️' } }
        ]});
      } else {
        // Row A — premium lifecycle. Grant/Edit always; +30d only for dated tiers; Revoke
        // (arms a confirm) only when a tier exists.
        components.push({ type: 1, components: [
          { type: 2, custom_id: `entitlements_tier_grant_${e.guildId}`, label: ts.state === 'none' ? 'Grant Premium' : 'Edit Premium', style: 3, emoji: { name: '⭐' } },
          { type: 2, custom_id: `entitlements_tier_extend_${e.guildId}`, label: '+30 days', style: 2, emoji: { name: '⏳' }, disabled: ts.state === 'none' || ts.permanent },
          { type: 2, custom_id: `entitlements_tier_revoke_${e.guildId}`, label: 'Revoke Premium', style: 4, emoji: { name: '🗑️' }, disabled: ts.state === 'none' }
        ]});
        // Row B — expiry test stubs (real validUntil writes: what expires here is what
        // expires at scale) + full removal (arms a confirm).
        components.push({ type: 1, components: [
          { type: 2, custom_id: `entitlements_tier_expire_${e.guildId}`, label: 'Expire Now', style: 2, emoji: { name: '🧪' }, disabled: ts.state === 'none' },
          { type: 2, custom_id: `entitlements_tier_lapse_${e.guildId}`, label: 'Lapse Now', style: 2, emoji: { name: '💀' }, disabled: ts.state === 'none' },
          { type: 2, custom_id: `entitlements_remove_${e.guildId}`, label: 'Remove Server', style: 4, emoji: { name: '🗑️' } }
        ]});
      }
    }
  } else if (guilds.length) {
    components.push({ type: 10, content: '-# Select a server above to see its premium status, source and controls. Names auto-learn from the bot cache.' });
  }

  components.push({ type: 14 });
  components.push({ type: 1, components: [
    { type: 2, custom_id: 'entitlements_add', label: 'Add Server', style: 3, emoji: { name: '➕' } },
    // Skips typing the ID — the guild is already in the interaction; opens the same
    // Grant Premium modal (duration + reason) as the detail pane's ⭐ button.
    { type: 2, custom_id: 'entitlements_add_here', label: 'This Server', style: 2, emoji: { name: '➕' } }
  ]});

  // Armed destructive confirm flips the whole panel to the deletion-standard red.
  const container = { type: 17, accent_color: armed ? 0xed4245 : ACCENT, components };
  const { countComponents } = await import('./utils.js');
  countComponents([container], { enableLogging: true, verbosity: 'summary', label: 'Entitlements Panel' });
  return container;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────────

/** Add Server modal — grants a PREMIUM TIER (not feature flags) on submit. */
export function buildEntitlementsAddModal() {
  return {
    custom_id: 'entitlements_add_modal',
    title: '🎟️ Add Server — Grant Premium',
    components: [
      {
        type: 18,
        label: 'Server ID',
        description: 'The Discord guild ID to grant CastBot Premium to',
        component: { type: 4, custom_id: 'ent_guild_id', style: 1, required: true, min_length: 5, max_length: 25, placeholder: 'e.g. 1331657596087566398' }
      },
      {
        type: 18,
        label: 'Duration',
        description: 'e.g. 30d · 12h · 2w · 3mo — blank = permanent',
        component: { type: 4, custom_id: 'ent_tier_duration', style: 1, required: false, max_length: 20, placeholder: 'permanent' }
      },
      {
        type: 18,
        label: 'Reason (optional)',
        description: 'Audit note — e.g. "beta tester", "comp for S14"',
        component: { type: 4, custom_id: 'ent_tier_reason', style: 1, required: false, max_length: 100 }
      },
      {
        type: 18,
        label: 'Server name (optional)',
        description: 'Leave blank to auto-fill from the bot\'s guild cache',
        component: { type: 4, custom_id: 'ent_guild_name', style: 1, required: false, max_length: 100 }
      }
    ]
  };
}

/** The Grant/Edit Premium modal (duration + optional reason) for an existing entry. */
export function buildEntitlementsTierModal(guildId, guildName = null) {
  // safeTruncate: a plain substring(0,45) can split an astral-plane emoji in the guild
  // name into a lone surrogate, which Discord rejects — the modal would never open.
  const title = safeTruncate(`⭐ Premium — ${guildName || guildId}`, 45);
  return {
    custom_id: `entitlements_tier_modal_${guildId}`,
    title,
    components: [
      {
        type: 18,
        label: 'Duration',
        description: 'e.g. 30d · 12h · 45min · 2w · 3mo — blank = permanent',
        component: { type: 4, custom_id: 'ent_tier_duration', style: 1, required: false, max_length: 20, placeholder: '30d' }
      },
      {
        type: 18,
        label: 'Reason (optional)',
        description: 'Audit note — e.g. "beta tester", "comp for S14"',
        component: { type: 4, custom_id: 'ent_tier_reason', style: 1, required: false, max_length: 100 }
      }
    ]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

// `ephemeral: true` is LOAD-BEARING here: entitlements_manage (the panel's entry point)
// is served by this dispatcher as a NEW message, and without the flag the entire premium
// registry — every guild, state, source, audit note — posts PUBLICLY in the channel
// (caught by review 2026-08-16; the factory strips the flag on UPDATE_MESSAGE responses,
// so it is harmless on every other entitlements_* id).
const panel = async (context, selectedId = null, opts = {}) =>
  ({ components: [await buildEntitlementsManageUI(context.client, selectedId, opts)], ephemeral: true });

/**
 * Button/select dispatcher for all entitlements_* custom_ids. The app.js branch already
 * hard-gates to Reece; this only picks the response shape per control.
 * NOTE: `entitlements_remove_confirm_` / `_cancel_` MUST be tested before the bare
 * `entitlements_remove_` prefix they both share (same for `entitlements_revoke_*` vs the
 * legacy exact id `entitlements_revoke`, which has no trailing underscore and falls through).
 */
export async function handleEntitlementsButton(context) {
  const id = context.customId;
  if (id === 'entitlements_add') {
    return { type: 9, data: buildEntitlementsAddModal() }; // InteractionResponseType.MODAL
  }
  if (id === 'entitlements_add_here') {
    // No typing: the guild ID comes from the interaction — straight to the grant modal.
    const guildId = String(context.guildId || '');
    if (!/^\d{5,}$/.test(guildId)) {
      return { content: '🎟️ No guild in this interaction — use Add Server instead.', ephemeral: true };
    }
    return { type: 9, data: buildEntitlementsTierModal(guildId, context.client?.guilds?.cache?.get(guildId)?.name) };
  }
  if (id === 'entitlements_guild') {
    return panel(context, String(context.values?.[0] || '') || null);
  }
  if (id.startsWith('entitlements_tier_grant_')) {
    const guildId = id.replace('entitlements_tier_grant_', '');
    return { type: 9, data: buildEntitlementsTierModal(guildId, context.client?.guilds?.cache?.get(guildId)?.name) };
  }
  if (id.startsWith('entitlements_tier_extend_')) {
    const guildId = id.replace('entitlements_tier_extend_', '');
    await extendTier(guildId, 30 * 24 * 60 * 60 * 1000);
    return panel(context, guildId);
  }
  if (id.startsWith('entitlements_tier_expire_')) {
    const guildId = id.replace('entitlements_tier_expire_', '');
    await setTierValidUntil(guildId, Date.now() - 1000); // 1s in the past → grace
    return panel(context, guildId);
  }
  if (id.startsWith('entitlements_tier_lapse_')) {
    const guildId = id.replace('entitlements_tier_lapse_', '');
    await setTierValidUntil(guildId, Date.now() - GRACE_MS - 1000); // past grace → lapsed
    return panel(context, guildId);
  }
  if (id.startsWith('entitlements_tier_revoke_')) {
    // ARMS the confirm — revoking destroys the expiry, source, audit trail and Ko-fi link,
    // so it gets the same confirm-before-destroy as Remove (deletion standard).
    return panel(context, id.replace('entitlements_tier_revoke_', ''), { arm: 'revoke' });
  }
  if (id.startsWith('entitlements_revoke_confirm_')) {
    const guildId = id.replace('entitlements_revoke_confirm_', '');
    await revokeTier(guildId);
    // The entry may be gone entirely (no legacy features) — panel() ignores a dead selection.
    return panel(context, guildId);
  }
  if (id.startsWith('entitlements_revoke_cancel_')) {
    return panel(context, id.replace('entitlements_revoke_cancel_', ''));
  }
  if (id.startsWith('entitlements_remove_confirm_')) {
    await removeGuildEntry(id.replace('entitlements_remove_confirm_', ''));
    return panel(context, null);
  }
  if (id.startsWith('entitlements_remove_cancel_')) {
    return panel(context, id.replace('entitlements_remove_cancel_', ''));
  }
  if (id.startsWith('entitlements_remove_')) {
    return panel(context, id.replace('entitlements_remove_', ''), { arm: 'remove' });
  }
  // entitlements_back / legacy entitlements_revoke (old second select) / anything stale →
  // fresh panel, no selection.
  return panel(context, null);
}

/** Tier modal submit (dispatched from app.js MODAL_SUBMIT; owner gate lives HERE). */
export async function handleEntitlementsTierModal(req, res, client) {
  const userId = req.body.member?.user?.id || req.body.user?.id;
  if (userId !== OWNER_ID) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '🎟️ Reece only.', flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  const guildId = String(req.body.data.custom_id || '').replace('entitlements_tier_modal_', '');
  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    if (inner?.custom_id) fields[inner.custom_id] = inner.value ?? inner.values?.[0];
  }
  const dur = parseDuration(fields.ent_tier_duration);
  if (!dur.ok) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `🎟️ ${dur.error}`, flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  await grantTier(guildId, 'premium', {
    addedBy: userId,
    durationMs: dur.ms,
    reason: fields.ent_tier_reason?.trim() || undefined,
    name: client?.guilds?.cache?.get(guildId)?.name
  });
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { components: [await buildEntitlementsManageUI(client, guildId)], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
  });
}

/** Add Server modal submit — grants a PREMIUM TIER (owner gate lives HERE). */
export async function handleEntitlementsAddModal(req, res, client) {
  const userId = req.body.member?.user?.id || req.body.user?.id;
  if (userId !== OWNER_ID) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '🎟️ Reece only.', flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    if (inner?.custom_id) fields[inner.custom_id] = inner.value ?? inner.values?.[0];
  }
  const guildId = String(fields.ent_guild_id || '').trim();
  if (!/^\d{5,}$/.test(guildId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `🎟️ "${guildId}" doesn't look like a guild ID.`, flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  const dur = parseDuration(fields.ent_tier_duration);
  if (!dur.ok) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `🎟️ ${dur.error}`, flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  const name = fields.ent_guild_name?.trim()
    || client?.guilds?.cache?.get(guildId)?.name
    || guildId;
  await grantTier(guildId, 'premium', {
    addedBy: userId,
    durationMs: dur.ms,
    reason: fields.ent_tier_reason?.trim() || undefined,
    name
  });
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { components: [await buildEntitlementsManageUI(client, guildId)], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
  });
}
