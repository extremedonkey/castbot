/**
 * CastDock — sticky /menu for a channel (typically a player's subs channel).
 *
 * When enabled for a channel, CastBot keeps a public (non-ephemeral) copy of one
 * player's /menu as the newest message in that channel: whenever anyone posts,
 * the previous CastDock message is deleted and a fresh one is posted at the bottom.
 *
 * Storage: playerData[guildId].castDock.channels[channelId] = { enabled, targetUserId,
 * enabledBy, enabledAt, disabledAt }. Only the enabled flag + target are persisted —
 * lastMessageId/lastRepostAt live only in the in-memory client.castDockChannels cache
 * (mirrors client.roleReactions) to avoid a playerData write on every chat message.
 *
 * storage.js and playerManagement.js are imported dynamically inside functions:
 * playerManagement.js imports this module's pure builders statically, so a static
 * import back here would be a require cycle.
 */

export const CASTDOCK_COOLDOWN_MS = 3000;

// ── Config (persisted) ──────────────────────────────────────────────────────

/** Pure — coerce stored/partial data to a safe shape. */
export function normalizeCastDockConfig(raw) {
  if (!raw || typeof raw !== 'object' || !raw.targetUserId) return { enabled: false };
  return {
    enabled: raw.enabled === true,
    targetUserId: raw.targetUserId,
    enabledBy: raw.enabledBy || null,
    enabledAt: raw.enabledAt || null
  };
}

export async function getCastDockConfig(guildId, channelId, playerData = null) {
  const { loadPlayerData } = await import('./storage.js');
  const guildData = playerData ? playerData[guildId] : (await loadPlayerData())[guildId];
  return normalizeCastDockConfig(guildData?.castDock?.channels?.[channelId]);
}

/**
 * Full load→mutate→save cycle — runs under withStorageLock (CLAUDE.md rule).
 * @returns {Promise<Object>} the stored channel config
 */
export async function setCastDockConfig(guildId, channelId, { enabled, targetUserId, enabledBy }) {
  const { withStorageLock, loadPlayerData, savePlayerData } = await import('./storage.js');
  return withStorageLock(async () => {
    const playerData = await loadPlayerData();
    if (!playerData[guildId]) playerData[guildId] = {};
    const channels = (playerData[guildId].castDock ||= {}).channels ||= {};
    if (enabled) {
      channels[channelId] = { enabled: true, targetUserId, enabledBy, enabledAt: Date.now(), disabledAt: null };
    } else if (channels[channelId]) {
      channels[channelId] = { ...channels[channelId], enabled: false, disabledAt: Date.now() };
    }
    await savePlayerData(playerData);
    return channels[channelId] || { enabled: false };
  });
}

// ── UI builder (pure) ───────────────────────────────────────────────────────

/**
 * Builds the Enable/Disable String Select ActionRow shown under the CastDock button.
 * Message-level select (not a modal) — `default:` is honored here.
 */
export function buildCastDockSelectRow(customId, config) {
  const enabled = config?.enabled === true;
  return {
    type: 1, // ActionRow
    components: [{
      type: 3, // String Select
      custom_id: customId,
      placeholder: `CastDock: currently ${enabled ? 'Enabled' : 'Disabled'} in this channel`.slice(0, 150),
      min_values: 1,
      max_values: 1,
      options: [
        { label: 'Enable', value: 'enable', description: 'Pin this menu publicly — always the newest message in this channel', emoji: { name: '📌' }, default: enabled },
        { label: 'Disable', value: 'disable', description: 'Stop pinning this menu in this channel', emoji: { name: '🔕' }, default: !enabled }
      ]
    }]
  };
}

/** Pure — safe default is 'disable' for any missing/garbage value. */
export function parseCastDockAction(values) {
  return values?.[0] === 'enable' ? 'enable' : 'disable';
}

// ── Anti-loop / cooldown decision (pure — the core unit-test target) ────────

/**
 * Decides whether a messageCreate event should trigger a CastDock repost.
 * @param {Object} opts
 * @param {Object} opts.entry - client.castDockChannels cache entry (or undefined)
 * @param {boolean} opts.authorIsBot - message.author.bot
 * @param {number} [opts.now]
 * @param {number} [opts.cooldownMs]
 * @returns {{action: 'repost'|'skip', reason: string}}
 */
export function evaluateCastDockTrigger({ entry, authorIsBot, now = Date.now(), cooldownMs = CASTDOCK_COOLDOWN_MS }) {
  if (!entry || !entry.enabled) return { action: 'skip', reason: 'not_enabled' };
  if (authorIsBot) return { action: 'skip', reason: 'bot_author' }; // stops the bot's own repost from re-triggering itself
  if (entry.lastRepostAt && (now - entry.lastRepostAt) < cooldownMs) return { action: 'skip', reason: 'cooldown' };
  return { action: 'repost', reason: 'ok' };
}

// ── In-memory boot cache (client.castDockChannels, keyed by channelId) ──────

/**
 * Populates client.castDockChannels from persisted config, then best-effort
 * reconciles each channel's last message so a restart doesn't duplicate the sticky.
 */
export async function initCastDockCache(client) {
  const { loadPlayerData } = await import('./storage.js');
  client.castDockChannels = new Map();

  const playerData = await loadPlayerData();
  for (const [guildId, guildData] of Object.entries(playerData)) {
    for (const [channelId, cfg] of Object.entries(guildData?.castDock?.channels || {})) {
      if (!cfg?.enabled) continue;
      client.castDockChannels.set(channelId, {
        enabled: true,
        targetUserId: cfg.targetUserId,
        guildId,
        lastMessageId: null,
        lastRepostAt: 0
      });
    }
  }

  for (const [channelId, entry] of client.castDockChannels) {
    try {
      const channel = await client.channels.fetch(channelId);
      const recent = await channel.messages.fetch({ limit: 1 });
      const last = recent.first();
      if (last?.author.id === client.user.id) entry.lastMessageId = last.id;
    } catch (e) {
      console.warn(`CastDock: boot reconciliation failed for channel ${channelId} (deleted/inaccessible?): ${e.message}`);
    }
  }

  console.log(`📥 CastDock: ${client.castDockChannels.size} channel(s) enabled across all guilds`);
}

// ── Compact view (the CastDock steady-state UI) ─────────────────────────────

// 'commands' listed first so it always lands in the same ActionRow as currency/inventory —
// buildSectionRow chunks visible buttons into rows of 5 in array order, so whatever's
// first is guaranteed to share row 1 with the row's other early entries.
export const COMPACT_ROW2_IDS = ['commands', 'currency', 'inventory', 'map', 'stamina', 'challenges', 'crafting', 'actions', 'stores'];
export const COMPACT_ROW3_IDS = ['attributes', 'castdock']; // 'commands' removed — relocated to row 2 above

/** Pure — drops the label from every button in a row (or array of rows), keeping only its emoji. */
export function stripButtonLabels(rows) {
  for (const row of [].concat(rows)) {
    for (const component of row?.components || []) {
      delete component.label;
    }
  }
  return rows;
}

/**
 * Builds the compact CastDock view: header (+ '^' expand toggle), player info, and the
 * Safari + Advanced button rows with 'commands' merged into Safari — all emoji-only.
 * No Row 1 (Castlists & Profile) and no hot-swap select; this is a minimal "home" view,
 * not a full menu replacement — clicking any button still routes through the exact same
 * handlers the full menu uses, which is what surfaces the full menu (with its own
 * CastDock collapse toggle, added by createPlayerManagementUI for any CastDock channel).
 */
export async function buildCompactCastDockMenu(client, guildId, targetMember, playerData, channelId) {
  const { calculateVisibility, buildSectionRow, createPlayerDisplaySection, PlayerManagementMode } = await import('./playerManagement.js');
  const { loadSafariContent } = await import('./safariManager.js');
  const { countComponents } = await import('./utils.js');

  const targetUserId = targetMember.id;
  const safariData = await loadSafariContent();
  const visibility = await calculateVisibility(guildId, targetUserId, playerData, safariData, PlayerManagementMode.PLAYER, client, channelId);

  const container = {
    type: 17, // Container
    accent_color: 0x3498DB,
    components: [{
      type: 9, // Section — header with the expand toggle as its accessory
      components: [{ type: 10, content: '## CastBot | Player Menu' }],
      accessory: { type: 2, custom_id: 'castdock_expand', label: '^', style: 2 }
    }]
  };

  container.components.push({ type: 14 }); // Separator

  const playerSection = await createPlayerDisplaySection(targetMember, playerData, guildId);
  if (playerSection) container.components.push(playerSection);

  container.components.push({ type: 14 }); // Separator

  const row2 = buildSectionRow(COMPACT_ROW2_IDS, targetUserId, null, visibility, PlayerManagementMode.PLAYER);
  if (row2.length) {
    stripButtonLabels(row2);
    container.components.push({ type: 10, content: '### ```🦁 Idol Hunts, Challenges and Safari```' });
    row2.forEach(r => container.components.push(r));
  }

  const row3 = buildSectionRow(COMPACT_ROW3_IDS, targetUserId, null, visibility, PlayerManagementMode.PLAYER);
  if (row3.length) {
    stripButtonLabels(row3);
    container.components.push({ type: 10, content: '### ```💎 Advanced```' });
    row3.forEach(r => container.components.push(r));
  }

  countComponents([container], { enableLogging: true, verbosity: 'summary', label: 'CastDock Compact Menu' });

  return { flags: (1 << 15), components: [container] };
}

// ── Repost (impure — single code path for both the Enable action and the hot path) ──

/**
 * Fetches the target member fresh, builds their menu, posts it, then deletes the
 * previous sticky message (post-then-delete: a delete failure leaves a harmless
 * stray duplicate rather than a channel with no sticky at all).
 */
export async function repostCastDockMenu(client, guildId, channelId, entry) {
  const { loadPlayerData } = await import('./storage.js');
  const { sanitizeComponentEmojis } = await import('./utils/emojiUtils.js');

  let guild, targetMember;
  try {
    guild = await client.guilds.fetch(guildId);
    targetMember = await guild.members.fetch(entry.targetUserId); // fresh — never cached, roles/nickname drive the render
  } catch (e) {
    console.warn(`CastDock: target ${entry.targetUserId} not resolvable in guild ${guildId} — skipping repost for channel ${channelId}`);
    return;
  }

  const playerData = await loadPlayerData();
  // Reposts always render compact (the steady-state view) — a viewer who expanded it
  // via the '^' button gets reset to compact on the next repost, same as any other state.
  const menuUI = await buildCompactCastDockMenu(client, guildId, targetMember, playerData, channelId);
  // Bypassing the interaction-response path (raw fetch below), so sanitize explicitly —
  // an invalid/deleted custom emoji in the menu would otherwise fail the whole POST unattended.
  sanitizeComponentEmojis(menuUI.components);

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(menuUI)
  });
  if (!res.ok) {
    console.error(`CastDock: repost POST failed in channel ${channelId}:`, res.status, await res.json().catch(() => ({})));
    return; // leave lastMessageId as-is; the next trigger (after cooldown) retries
  }

  const oldMessageId = entry.lastMessageId;
  entry.lastMessageId = (await res.json()).id;

  if (oldMessageId) {
    try {
      const ch = await client.channels.fetch(channelId);
      await ch.messages.delete(oldMessageId);
    } catch (e) {
      // already deleted / no longer accessible — nothing to do
    }
  }
}

// ── Disable / cleanup ────────────────────────────────────────────────────────

export async function handleCastDockDisable(client, guildId, channelId, userId) {
  const entry = client.castDockChannels?.get(channelId);
  await setCastDockConfig(guildId, channelId, { enabled: false, targetUserId: entry?.targetUserId, enabledBy: userId });
  if (entry?.lastMessageId) {
    try {
      const ch = await client.channels.fetch(channelId);
      await ch.messages.delete(entry.lastMessageId);
    } catch (e) {
      // already deleted / no longer accessible — nothing to do
    }
  }
  client.castDockChannels?.delete(channelId);
}

/** channelDelete cleanup — the channel is already gone, no message-delete attempt. */
export async function handleCastDockChannelDeleted(client, guildId, channelId) {
  if (!client.castDockChannels?.has(channelId)) return;
  client.castDockChannels.delete(channelId);
  await setCastDockConfig(guildId, channelId, { enabled: false });
}

// ── Router-facing wrappers (keep app.js a thin dispatcher — CLAUDE.md golden rule) ──

/** Applies an Enable/Disable select choice — shared by both the player and admin handlers. */
export async function applyCastDockToggle(client, guildId, channelId, targetUserId, action, actorUserId) {
  if (!client.castDockChannels) client.castDockChannels = new Map();
  if (action === 'enable') {
    await setCastDockConfig(guildId, channelId, { enabled: true, targetUserId, enabledBy: actorUserId });
    const entry = { enabled: true, targetUserId, guildId, lastMessageId: null, lastRepostAt: Date.now() };
    client.castDockChannels.set(channelId, entry);
    await repostCastDockMenu(client, guildId, channelId, entry); // immediate first post
  } else {
    await handleCastDockDisable(client, guildId, channelId, actorUserId);
  }
}

/** Full messageCreate gateway listener body (app.js only wires the client.on(...) call). */
export async function handleCastDockMessageCreate(client, message) {
  try {
    if (!message.guild) return;
    const entry = client.castDockChannels?.get(message.channel.id);
    const verdict = evaluateCastDockTrigger({ entry, authorIsBot: !!message.author?.bot });
    if (verdict.action !== 'repost') return;
    entry.lastRepostAt = Date.now(); // claimed synchronously before any await — guards against a second rapid-fire event
    await repostCastDockMenu(client, entry.guildId, message.channel.id, entry);
  } catch (error) {
    console.error('Error in CastDock messageCreate handler:', error);
  }
}

/** Full channelDelete gateway listener body (app.js only wires the client.on(...) call). */
export async function handleCastDockChannelDelete(client, channel) {
  try {
    if (!channel.guild || !client.castDockChannels?.has(channel.id)) return;
    await handleCastDockChannelDeleted(client, channel.guild.id, channel.id);
    console.log(`🗑️ CastDock: cleaned up config for deleted channel ${channel.id}`);
  } catch (error) {
    console.error('Error cleaning up CastDock on channel delete:', error);
  }
}
