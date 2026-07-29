/**
 * 🎟️ Entitlements UI — Reece-only admin surface for the runtime feature registry.
 *
 * Lives in Reece's Stuff (menuBuilder.js). This is where "which guilds can use Ask
 * CastBot" is maintained WITHOUT a deploy — the hardcoded ALLOWED_GUILD_IDS array now
 * only seeds this registry on first run.
 *
 * Two features per guild:
 *   👾 ask_castbot — may use Ask CastBot at all (Q&A)
 *   🛠️ safari_edit — may additionally make changes (admins get preview + Apply)
 * Add grants both (the common case); the per-guild select toggles edit off/on.
 *
 * @module entitlementsUI
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { FEATURES, grantFeature, revokeFeature, listEntitledGuilds } from './entitlements.js';

const ACCENT = 0x9b59b6;
const OWNER_ID = '391415444084490240';

/** The management container: entitled-guild list + Add button + per-guild toggle select. */
export async function buildEntitlementsManageUI() {
  const guilds = await listEntitledGuilds();
  const lines = guilds.length
    ? guilds.map(g => {
        const ask = g.features.includes(FEATURES.ASK_CASTBOT) ? '👾' : '➖';
        const edit = g.features.includes(FEATURES.SAFARI_EDIT) ? '🛠️' : '➖';
        return `${ask}${edit} **${g.name}** \`${g.guildId}\``;
      })
    : ['*No guilds entitled yet.*'];

  const components = [
    { type: 10, content: `## 🎟️ Entitlements\n${guilds.length} guild${guilds.length === 1 ? '' : 's'} · 👾 = Ask CastBot · 🛠️ = Safari editing` },
    { type: 10, content: lines.slice(0, 30).join('\n') },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'entitlements_add', label: 'Add Guild', style: 3, emoji: { name: '➕' } }
    ]}
  ];

  if (guilds.length) {
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
              label: `Remove all access — ${g.name}`.substring(0, 100),
              value: `remove:${g.guildId}`,
              description: g.guildId,
              emoji: { name: '🗑️' }
            },
            {
              label: `${hasEdit ? 'Disable' : 'Enable'} Safari editing — ${g.name}`.substring(0, 100),
              value: `${hasEdit ? 'noedit' : 'edit'}:${g.guildId}`,
              description: hasEdit ? 'Keeps Q&A, removes change-making' : 'Adds change-making on top of Q&A',
              emoji: { name: '🛠️' }
            }
          ];
        }).slice(0, 25)
      }]
    });
  }

  return { type: 17, accent_color: ACCENT, components };
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
    data: { components: [await buildEntitlementsManageUI()], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
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
  return { components: [await buildEntitlementsManageUI()] };
}
