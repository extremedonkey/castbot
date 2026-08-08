/**
 * 🎟️ Entitlements UI — Reece-only admin surface for the runtime feature registry.
 *
 * Lives in the CastBot Premium menu → Utilities row (menuBuilder.js buildPremiumMenu),
 * red + Reece-only (moved from Reece's Stuff 2026-08-08). This is where "which guilds can
 * use Ask CastBot" is maintained WITHOUT a deploy — the hardcoded ALLOWED_GUILD_IDS array
 * now only seeds this registry on first run.
 *
 * Two features per guild:
 *   👾 ask_castbot — may use Ask CastBot at all (Q&A)
 *   🛠️ safari_edit — may additionally make changes (admins get preview + Apply)
 * Add grants both (the common case); the per-guild select toggles edit off/on.
 *
 * @module entitlementsUI
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import {
  FEATURES, TIERS, GRACE_MS, grantFeature, revokeFeature, listEntitledGuilds,
  getGuildEntitlement, grantTier, extendTier, setTierValidUntil, revokeTier, parseDuration
} from './entitlements.js';

const ACCENT = 0x9b59b6;
const OWNER_ID = '391415444084490240';

/** How far ahead "Expiring Soon" looks. Two weeks = enough runway to chase a renewal. */
export const EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000;

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

/** One list-line per guild: feature glyphs + name + tier badge. Pure — unit-tested. */
export function formatGuildLine(g) {
  const eff = g.effectiveFeatures || g.features;
  const ask = eff.includes(FEATURES.ASK_CASTBOT) ? '👾' : '➖';
  const edit = eff.includes(FEATURES.SAFARI_EDIT) ? '🛠️' : '➖';
  const ts = g.tierState;
  let tierBadge = '';
  if (ts && ts.state !== 'none') {
    const t = TIERS[ts.tier];
    if (ts.state === 'active' && ts.permanent) tierBadge = ` · ${t.emoji} ${t.label}`;
    else if (ts.state === 'active') tierBadge = ` · ${t.emoji} ${t.label} until <t:${Math.floor(ts.validUntil / 1000)}:d>`;
    else if (ts.state === 'grace') tierBadge = ` · 🕒 ${t.label} GRACE ends <t:${Math.floor(ts.graceUntil / 1000)}:R>`;
    else tierBadge = ` · 💀 ${t.label} lapsed`;
  }
  const unknown = g.displayName === g.guildId ? ' *(bot not in this server)*' : '';
  return `${ask}${edit} **${g.displayName}**${tierBadge}${unknown} · \`${g.guildId}\``;
}

/**
 * Resolve display names from the bot's own guild cache and persist any it learns.
 *
 * Seeded/ID-only entries would otherwise read as a wall of snowflakes with no way to
 * fix them by hand. The bot is a member of every entitled guild, so it already knows
 * the names — self-healing beats making the admin type them. Names are written back
 * once (only when the stored name is still the raw ID), so a guild the bot later
 * leaves keeps its last known name.
 */
async function resolveGuildNames(guilds, client) {
  const learned = [];
  for (const g of guilds) {
    const cached = client?.guilds?.cache?.get(g.guildId)?.name;
    g.displayName = cached || g.name;
    g.inGuild = !!cached;
    if (cached && g.name === g.guildId) learned.push(g);
  }
  for (const g of learned) {
    try {
      await grantFeature(g.guildId, [], { name: g.displayName });
      g.name = g.displayName;
    } catch { /* naming is cosmetic — never fail the panel over it */ }
  }
  if (learned.length) console.log(`🎟️ Entitlements: learned ${learned.length} guild name(s) from the bot cache`);
  return guilds;
}

/** The management container: entitled-guild list + Add button + per-guild toggle select. */
export async function buildEntitlementsManageUI(client = null) {
  const guilds = await resolveGuildNames(await listEntitledGuilds(), client);
  const lines = guilds.length ? guilds.map(formatGuildLine) : ['*No guilds entitled yet.*'];

  const components = [
    { type: 10, content: `## 🎟️ Entitlements\n${guilds.length} guild${guilds.length === 1 ? '' : 's'} · 👾 = Ask CastBot · 🛠️ = Safari editing` },
    { type: 10, content: lines.slice(0, 30).join('\n') },
    { type: 10, content: `-# Names come from the bot's server list automatically. To set one by hand (or fix a server the bot has left), use Add Guild with that same guild ID and type the name.` },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'entitlements_add', label: 'Add Guild', style: 3, emoji: { name: '➕' } },
      // Skips the modal entirely — the guild ID is already in the interaction and the name
      // is in the bot cache, so there is nothing left for a human to type.
      { type: 2, custom_id: 'entitlements_add_here', label: 'This Guild', style: 2, emoji: { name: '➕' } }
    ]}
  ];

  // Renewal runway, above everything else — only rendered when something actually needs
  // chasing, so the panel doesn't grow a permanently-empty heading.
  const expiring = selectExpiringSoon(guilds);
  if (expiring.length) {
    components.splice(1, 0,
      { type: 10, content: '### ```⏳ Expiring Soon```' },
      { type: 10, content: expiring.slice(0, 10).map(formatExpiringLine).join('\n') },
      { type: 14 }
    );
  }

  if (guilds.length) {
    // Per-guild premium/testing surface — pick a guild, get its detail screen.
    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: 'entitlements_guild',
        placeholder: '⭐ Premium & expiry testing — pick a guild...',
        options: guilds.slice(0, 25).map(g => ({
          label: g.displayName.substring(0, 100),
          value: g.guildId,
          description: (g.tierState?.state !== 'none'
            ? `${g.tierState.tier} · ${g.tierState.state}${g.tierState.permanent ? ' (permanent)' : ''}`
            : 'no tier — feature grants only').substring(0, 100),
          emoji: { name: g.tierState?.state === 'grace' ? '🕒' : g.tierState?.state === 'lapsed' ? '💀' : '⭐' }
        }))
      }]
    });
    // One row per action: Discord selects can't mix "which guild" with "which change",
    // so the value encodes both — `<action>:<guildId>`.
    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: 'entitlements_revoke',
        placeholder: 'Change a guild\'s access...',
        options: guilds.slice(0, 8).flatMap(g => {
          const hasEdit = g.features.includes(FEATURES.SAFARI_EDIT);
          return [
            {
              label: `Remove all access — ${g.displayName}`.substring(0, 100),
              value: `remove:${g.guildId}`,
              description: g.guildId,
              emoji: { name: '🗑️' }
            },
            {
              label: `${hasEdit ? 'Disable' : 'Enable'} Safari editing — ${g.displayName}`.substring(0, 100),
              value: `${hasEdit ? 'noedit' : 'edit'}:${g.guildId}`,
              description: hasEdit ? 'Keeps Q&A, removes change-making' : 'Adds change-making on top of Q&A',
              emoji: { name: '🛠️' }
            }
          ];
        }).slice(0, 25)
      }]
    });
  }

  const container = { type: 17, accent_color: ACCENT, components };
  const { countComponents } = await import('./utils.js');
  countComponents([container], { enableLogging: true, verbosity: 'summary', label: 'Entitlements Panel' });
  return container;
}

/** The Add Guild modal (guild ID + optional display name). */
export function buildEntitlementsAddModal() {
  return {
    custom_id: 'entitlements_add_modal',
    title: '🎟️ Add Entitled Guild',
    components: [
      {
        type: 18,
        label: 'Guild ID',
        description: 'Grants Ask CastBot + Safari editing to this server',
        component: { type: 4, custom_id: 'ent_guild_id', style: 1, required: true, min_length: 5, max_length: 25, placeholder: 'e.g. 1331657596087566398' }
      },
      {
        type: 18,
        label: 'Guild name (optional)',
        description: 'Leave blank to auto-fill from the bot\'s guild cache',
        component: { type: 4, custom_id: 'ent_guild_name', style: 1, required: false, max_length: 100 }
      }
    ]
  };
}

/**
 * Per-guild detail screen: full tier state + grant/extend/revoke + the expiry TEST
 * STUBS (Expire Now → grace, Lapse Now → past grace). The stubs are real validUntil
 * writes through the real save path — what expires here is what expires at scale.
 */
export async function buildEntitlementsGuildUI(guildId, client = null) {
  const e = getGuildEntitlement(guildId);
  const displayName = client?.guilds?.cache?.get(guildId)?.name || e.name || guildId;
  if (!e.exists) {
    return { type: 17, accent_color: ACCENT, components: [
      { type: 10, content: `## 🎟️ ${displayName}\nNo entitlements entry for \`${guildId}\` (it may have just been fully revoked).` },
      { type: 14 },
      { type: 1, components: [{ type: 2, custom_id: 'entitlements_back', label: 'Back', style: 2, emoji: { name: '⬅️' } }] }
    ]};
  }

  const ts = e.tierState;
  const lines = [`## 🎟️ ${displayName}`, `\`${guildId}\``, ''];
  lines.push(`**Direct feature grants (never expire):** ${e.features.length ? e.features.join(', ') : '*none*'}`);
  if (ts.state === 'none') {
    lines.push(`**Tier:** *none*`);
  } else {
    const t = TIERS[ts.tier];
    const stateLabel = { active: '🟢 active', grace: '🕒 IN GRACE', lapsed: '💀 LAPSED' }[ts.state];
    lines.push(`**Tier:** ${t.emoji} ${t.label} — ${stateLabel}${ts.permanent ? ' (permanent)' : ''}`);
    if (!ts.permanent) {
      lines.push(`**Expires:** <t:${Math.floor(ts.validUntil / 1000)}:F> (<t:${Math.floor(ts.validUntil / 1000)}:R>)`);
      lines.push(`**Grace ends:** <t:${Math.floor(ts.graceUntil / 1000)}:F> (<t:${Math.floor(ts.graceUntil / 1000)}:R>)`);
    }
    if (e.grantedBy) lines.push(`-# granted by <@${e.grantedBy}>${e.reason ? ` — ${e.reason}` : ''}`);
  }
  lines.push(`**Effective features right now:** ${e.effectiveFeatures.length ? e.effectiveFeatures.join(', ') : '*none*'}`);

  const rows = [];
  const tierRow = [
    { type: 2, custom_id: `entitlements_tier_grant_${guildId}`, label: ts.state === 'none' ? 'Grant Premium' : 'Update Premium', style: 3, emoji: { name: '⭐' } }
  ];
  if (ts.state !== 'none' && !ts.permanent) {
    tierRow.push({ type: 2, custom_id: `entitlements_tier_extend_${guildId}`, label: '+30 days', style: 2, emoji: { name: '⏳' } });
  }
  if (ts.state !== 'none') {
    tierRow.push({ type: 2, custom_id: `entitlements_tier_revoke_${guildId}`, label: 'Revoke Tier', style: 4, emoji: { name: '🗑️' } });
  }
  rows.push({ type: 1, components: tierRow });
  if (ts.state !== 'none') {
    rows.push({ type: 1, components: [
      { type: 2, custom_id: `entitlements_tier_expire_${guildId}`, label: 'Expire Now (→ grace)', style: 2, emoji: { name: '🧪' } },
      { type: 2, custom_id: `entitlements_tier_lapse_${guildId}`, label: 'Lapse Now (past grace)', style: 2, emoji: { name: '💀' } }
    ]});
  }
  rows.push({ type: 1, components: [{ type: 2, custom_id: 'entitlements_back', label: 'Back', style: 2, emoji: { name: '⬅️' } }] });

  return { type: 17, accent_color: ACCENT, components: [
    { type: 10, content: lines.join('\n') },
    { type: 14 },
    ...rows
  ]};
}

/** The Grant/Update Premium modal (duration + optional reason). */
export function buildEntitlementsTierModal(guildId) {
  return {
    custom_id: `entitlements_tier_modal_${guildId}`,
    title: '⭐ Grant / Update Premium',
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

/**
 * Button/select dispatcher for all entitlements_* custom_ids. The app.js branch already
 * hard-gates to Reece; this only picks the response shape per control.
 */
export async function handleEntitlementsButton(context) {
  const id = context.customId;
  if (id === 'entitlements_add') {
    return { type: 9, data: buildEntitlementsAddModal() }; // InteractionResponseType.MODAL
  }
  if (id === 'entitlements_add_here') {
    // No modal: the guild ID comes from the interaction, the name from the bot cache.
    const guildId = String(context.guildId || '');
    if (!/^\d{5,}$/.test(guildId)) {
      return { content: '🎟️ No guild in this interaction — use Add Guild instead.', ephemeral: true };
    }
    const name = context.client?.guilds?.cache?.get(guildId)?.name || guildId;
    await grantFeature(guildId, [FEATURES.ASK_CASTBOT, FEATURES.SAFARI_EDIT], { name, addedBy: context.userId });
    return { components: [await buildEntitlementsManageUI(context.client)] };
  }
  if (id === 'entitlements_revoke') {
    return handleEntitlementsRevoke(context);
  }
  if (id === 'entitlements_guild') {
    return { components: [await buildEntitlementsGuildUI(String(context.values?.[0] || ''), context.client)] };
  }
  if (id.startsWith('entitlements_tier_grant_')) {
    return { type: 9, data: buildEntitlementsTierModal(id.replace('entitlements_tier_grant_', '')) };
  }
  if (id.startsWith('entitlements_tier_extend_')) {
    const guildId = id.replace('entitlements_tier_extend_', '');
    await extendTier(guildId, 30 * 24 * 60 * 60 * 1000);
    return { components: [await buildEntitlementsGuildUI(guildId, context.client)] };
  }
  if (id.startsWith('entitlements_tier_expire_')) {
    const guildId = id.replace('entitlements_tier_expire_', '');
    await setTierValidUntil(guildId, Date.now() - 1000); // 1s in the past → grace
    return { components: [await buildEntitlementsGuildUI(guildId, context.client)] };
  }
  if (id.startsWith('entitlements_tier_lapse_')) {
    const guildId = id.replace('entitlements_tier_lapse_', '');
    await setTierValidUntil(guildId, Date.now() - GRACE_MS - 1000); // past grace → lapsed
    return { components: [await buildEntitlementsGuildUI(guildId, context.client)] };
  }
  if (id.startsWith('entitlements_tier_revoke_')) {
    const guildId = id.replace('entitlements_tier_revoke_', '');
    await revokeTier(guildId);
    return { components: [await buildEntitlementsGuildUI(guildId, context.client)] };
  }
  if (id === 'entitlements_back') {
    return { components: [await buildEntitlementsManageUI(context.client)] };
  }
  return { components: [await buildEntitlementsManageUI(context.client)], ephemeral: true };
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
    data: { components: [await buildEntitlementsGuildUI(guildId, client)], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
  });
}

/** Modal-submit handler (dispatched from app.js MODAL_SUBMIT; owner gate lives HERE). */
export async function handleEntitlementsAddModal(req, res, client) {
  if ((req.body.member?.user?.id || req.body.user?.id) !== OWNER_ID) {
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
  const name = fields.ent_guild_name?.trim()
    || client?.guilds?.cache?.get(guildId)?.name
    || guildId;
  await grantFeature(guildId, [FEATURES.ASK_CASTBOT, FEATURES.SAFARI_EDIT], { name, addedBy: req.body.member?.user?.id });
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { components: [await buildEntitlementsManageUI(client)], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
  });
}

/** Access-change select handler (factory context; returns refreshed UI for updateMessage). */
export async function handleEntitlementsRevoke(context) {
  const [action, guildId] = String(context.values?.[0] || '').split(':');
  if (guildId) {
    if (action === 'remove') await revokeFeature(guildId, [FEATURES.ASK_CASTBOT, FEATURES.SAFARI_EDIT]);
    else if (action === 'noedit') await revokeFeature(guildId, FEATURES.SAFARI_EDIT);
    else if (action === 'edit') await grantFeature(guildId, FEATURES.SAFARI_EDIT, { addedBy: context.userId });
  }
  return { components: [await buildEntitlementsManageUI(context.client)] };
}
