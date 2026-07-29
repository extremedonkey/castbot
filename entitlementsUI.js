/**
 * 🎟️ Entitlements UI — Reece-only admin surface for the runtime feature registry.
 *
 * Lives in Reece's Stuff (menuBuilder.js). MVP per Reece: "modal with ID and text
 * field for me to name the guild" — plus a revoke select, and the name auto-fills
 * from the bot's guild cache when left blank (the "maxVP" nicety for free).
 *
 * All handlers are hard-gated to the owner ID in app.js; this module is builders +
 * modal-submit logic only.
 *
 * @module entitlementsUI
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { FEATURES, grantFeature, revokeFeature, listEntitledGuilds } from './entitlements.js';

const ACCENT = 0x9b59b6;

/** The management container: entitled-guild list + Add button + revoke select. */
export async function buildEntitlementsManageUI() {
  const guilds = await listEntitledGuilds();
  const lines = guilds.length
    ? guilds.map(g => `- **${g.name}** \`${g.guildId}\` — ${g.features.join(', ')}`)
    : ['*No guilds entitled yet.*'];

  const components = [
    { type: 10, content: `## 🎟️ Entitlements\n${guilds.length} guild${guilds.length === 1 ? '' : 's'} with feature grants` },
    { type: 10, content: lines.slice(0, 40).join('\n') },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'entitlements_add', label: 'Add Guild', style: 3, emoji: { name: '➕' } }
    ]}
  ];

  if (guilds.length) {
    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: 'entitlements_revoke',
        placeholder: 'Revoke safari_edit from a guild...',
        options: guilds.slice(0, 25).map(g => ({
          label: g.name.substring(0, 100),
          value: g.guildId,
          description: g.guildId
        }))
      }]
    });
  }

  return { type: 17, accent_color: ACCENT, components };
}

/** The Add Guild modal (MVP: guild ID + optional display name). */
export function buildEntitlementsAddModal() {
  return {
    custom_id: 'entitlements_add_modal',
    title: '🎟️ Add Entitled Guild',
    components: [
      {
        type: 18,
        label: 'Guild ID',
        description: 'The Discord server ID to grant safari_edit',
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
 * Button dispatcher for the three entitlements custom_ids. The app.js branch already
 * hard-gates to Reece; this only picks the response shape per button.
 */
export async function handleEntitlementsButton(context) {
  if (context.customId === 'entitlements_add') {
    return { type: 9, data: buildEntitlementsAddModal() }; // InteractionResponseType.MODAL
  }
  if (context.customId === 'entitlements_revoke') {
    return handleEntitlementsRevoke(context);
  }
  return { components: [await buildEntitlementsManageUI()], ephemeral: true };
}

/** Modal-submit handler (dispatched from app.js MODAL_SUBMIT; owner gate lives HERE). */
export async function handleEntitlementsAddModal(req, res, client) {
  if ((req.body.member?.user?.id || req.body.user?.id) !== '391415444084490240') {
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
  await grantFeature(guildId, FEATURES.SAFARI_EDIT, { name, addedBy: req.body.member?.user?.id });
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { components: [await buildEntitlementsManageUI()], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
  });
}

/** Revoke-select handler (factory context; returns refreshed UI for updateMessage). */
export async function handleEntitlementsRevoke(context) {
  const guildId = context.values?.[0];
  if (guildId) await revokeFeature(guildId, FEATURES.SAFARI_EDIT);
  return { components: [await buildEntitlementsManageUI()] };
}
