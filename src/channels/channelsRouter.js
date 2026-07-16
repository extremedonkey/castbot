/**
 * Channel Administration — handler bodies for the app.js router blocks.
 *
 * app.js owns the two ButtonHandlerFactory.create() blocks (so both repo ratchets can see them:
 * the pre-commit legacy-handler check and tests/securityDeclarations.test.js) and delegates the
 * BODY here — app.js is a router, not a processor, and is under a shrink-only line ratchet.
 *
 * Callers have ALREADY enforced the whitelist. Nothing here re-checks it; do not call these
 * from a new entry point without gating first.
 */

/**
 * Denial screen for a non-whitelisted user. A V2 container, never `{ content }` — a content-only
 * return from an updateMessage handler is silently rejected by Discord (interactionResponseShape).
 * The GATE itself stays inline in app.js so the security ratchet can see it; only the body is here.
 */
export function channelsDenied() {
  return { components: [{ type: 17, accent_color: 0xe74c3c, components: [
    { type: 10, content: '## ❌ Not available\nChannel Administration is still being built.' }
  ]}] };
}

/**
 * Route a Channels button. custom_id shapes:
 *   season_channels_{configId}   → the tab
 *   channels_cancel_{configId}   → discard a plan, back to the tab
 *   channels_exec_{token}        → run a stashed plan (the ONLY step that mutates Discord)
 *   channels_{action}_{configId} → open the action's modal
 *
 * @param {Object} p
 * @param {Object} p.context - ButtonHandlerFactory context (guildId, userId, client, customId)
 * @param {Object} p.req - raw request (interaction token / channel_id for the exec job)
 */
export async function routeChannelsButton({ context, req }) {
  const { guildId, userId, client, customId } = context;

  if (customId.startsWith('season_channels_')) {
    const { handleChannelsTab } = await import('./channelsHandlers.js');
    return await handleChannelsTab({ configId: customId.replace('season_channels_', ''), guildId, userId, client });
  }

  if (customId.startsWith('channels_cancel_')) {
    const { handleChannelsTab } = await import('./channelsHandlers.js');
    return await handleChannelsTab({ configId: customId.replace('channels_cancel_', ''), guildId, userId, client });
  }

  if (customId.startsWith('channels_exec_')) {
    const { takePlan, executePlan } = await import('./channelsHandlers.js');
    const plan = takePlan(customId.replace('channels_exec_', ''), userId);
    if (!plan) {
      // Single-use + 10-min TTL: a double-click or a stale screen lands here rather than
      // re-running a job against a guild that has since changed.
      return { components: [{ type: 17, accent_color: 0xe74c3c, components: [
        { type: 10, content: '## ⏰ That plan expired\nRe-open the action and try again — nothing was changed.' }
      ]}] };
    }
    return await executePlan({
      plan, guildId, userId, client,
      interactionToken: req.body.token,
      applicationId: process.env.APP_ID,
      invokedChannelId: req.body.channel_id
    });
  }

  // 📨 Msg Category. Order matters: the more specific ids must be tested BEFORE the bare
  // `channels_msg_` composer prefix, which all three share.
  if (customId.startsWith('channels_msg_')) {
    const H = await import('./channelsHandlers.js');

    if (customId.startsWith('channels_msg_edit_')) {
      const { buildMsgModal } = await import('./channelsView.js');
      const configId = customId.replace('channels_msg_edit_', '');
      const { loadPlayerData } = await import('../../storage.js');
      const draft = (await loadPlayerData())[guildId]?.channelAdmin?.[configId]?.broadcast || {};
      return buildMsgModal({ configId, draft });
    }
    if (customId.startsWith('channels_msg_send_')) {
      return await H.planBroadcast({ configId: customId.replace('channels_msg_send_', ''), guildId, userId, client });
    }
    if (customId.startsWith('channels_msg_targets_')) {
      // Channel Select — its picks arrive in data.values, not the custom_id.
      return await H.saveMsgTargets({
        configId: customId.replace('channels_msg_targets_', ''),
        guildId, client, values: req.body.data?.values || []
      });
    }
    return await H.handleMsgComposer({ configId: customId.replace('channels_msg_', ''), guildId, client });
  }

  // One of the 5 action buttons → its modal.
  const { buildChannelsModal } = await import('./channelsModalRouter.js');
  return await buildChannelsModal({ customId, guildId, client });
}

/**
 * Route a Channels modal submit. These only PLAN — each returns a confirm screen, and nothing
 * touches Discord until channels_exec_* runs.
 *
 * @param {Object} p
 * @param {Object} p.context - factory context
 * @param {Array} p.components - modal components (Label-wrapped)
 * @param {Object} p.data - raw interaction data (carries `resolved` for the mentionable select)
 */
export async function routeChannelsModalSubmit({ context, components, data }) {
  const { guildId, userId, client, customId } = context;

  // Label-wrapped fields: selects deliver values[], radio groups deliver value.
  const fields = {};
  for (const row of (components || [])) {
    if (row?.type === 18 && row.component?.custom_id) {
      const f = row.component;
      fields[f.custom_id] = Array.isArray(f.values) ? f.values : (f.value != null ? [f.value] : []);
    }
  }

  const m = customId.match(/^channels_(roles|playerroles|confessionals|subs|1on1s|msg)_modal_(.+)$/);
  const kind = m?.[1];
  const configId = m?.[2];
  const mode = fields.mode?.[0];
  const H = await import('./channelsHandlers.js');

  // 📨 Msg Category composes via the shared rich card modal, so it parses its own fields
  // (extractRichCardValues) rather than the Label loop above.
  if (kind === 'msg') return await H.saveMsgDraft({ configId, guildId, client, data });
  if (kind === 'roles') return await H.setTrustedSpectator({ guildId, roleId: fields.trusted_spectator_role?.[0] || null });
  if (kind === 'playerroles') return await H.planPlayerRoles({ mode, configId, guildId, userId, client, values: fields.players || [] });
  if (kind === '1on1s') return await H.planOneOnOnes({ mode, configId, guildId, userId, client, values: fields.tribes || [] });

  return await H.planChannels({
    kind: kind === 'subs' ? 'subs' : 'confessional',
    mode, configId, guildId, userId, client,
    resolved: data?.resolved || {}, values: fields.targets || []
  });
}
