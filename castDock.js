/**
 * CastDock — sticky /menu for a channel (typically a player's subs channel).
 *
 * When enabled for a channel, CastBot keeps a public (non-ephemeral) copy of one
 * player's /menu as the newest message in that channel: whenever anyone posts,
 * the previous CastDock message is deleted and a fresh one is posted at the bottom.
 *
 * Storage: playerData[guildId].castDock.channels[channelId] = { enabled, targetUserId,
 * enabledBy, enabledAt, disabledAt, selectedButtons }. selectedButtons is null until the
 * owner customizes the button select (defaults to all of CASTDOCK_SELECTABLE_BUTTONS), or
 * an explicit array (including []) once they have. lastMessageId/lastRepostAt live only in
 * the in-memory client.castDockChannels cache (mirrors client.roleReactions) to avoid a
 * playerData write on every chat message.
 *
 * Activation is deferred: choosing "Enable" shows buildCastDockSetupScreen (explains what
 * CastDock is, the privacy caveat, and the button-selection multi-select) WITHOUT touching
 * playerData or posting anything. Only clicking "Activate CastDock" (castdock_activate in
 * app.js) actually calls applyCastDockToggle — the same function the old immediate-enable
 * flow used.
 *
 * storage.js and playerManagement.js are imported dynamically inside functions:
 * playerManagement.js imports this module's pure builders statically, so a static
 * import back here would be a require cycle.
 */

export const CASTDOCK_COOLDOWN_MS = 3000;

// ── Config (persisted) ──────────────────────────────────────────────────────

/** Pure — coerce stored/partial data to a safe shape. */
export function normalizeCastDockConfig(raw) {
  if (!raw || typeof raw !== 'object' || !raw.targetUserId) return { enabled: false, selectedButtons: null };
  return {
    enabled: raw.enabled === true,
    targetUserId: raw.targetUserId,
    enabledBy: raw.enabledBy || null,
    enabledAt: raw.enabledAt || null,
    selectedButtons: Array.isArray(raw.selectedButtons) ? raw.selectedButtons : null
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
      // Spread the existing entry — a selectedButtons choice saved on the setup screen
      // (setCastDockButtonSelection) must survive activation. Live bug 2026-07-25: a fresh
      // object literal here wiped the just-picked selection and the dock rendered defaults.
      channels[channelId] = { ...channels[channelId], enabled: true, targetUserId, enabledBy, enabledAt: Date.now(), disabledAt: null };
    } else if (channels[channelId]) {
      channels[channelId] = { ...channels[channelId], enabled: false, disabledAt: Date.now() };
    }
    await savePlayerData(playerData);
    return channels[channelId] || { enabled: false };
  });
}

/**
 * Config-only write — persists which compact-view buttons are selected without touching
 * `enabled` (preserves whatever it already was). Used while the setup screen is still
 * showing, before "Activate CastDock" has been clicked (and also usable later if a
 * reconfigure-while-active entry point is ever added).
 * @param {string[]} selectedButtons - ids from CASTDOCK_SELECTABLE_BUTTONS; [] is a valid,
 *   respected choice (show none), distinct from null/undefined (never configured → defaults)
 */
export async function setCastDockButtonSelection(guildId, channelId, targetUserId, selectedButtons) {
  const { withStorageLock, loadPlayerData, savePlayerData } = await import('./storage.js');
  return withStorageLock(async () => {
    const playerData = await loadPlayerData();
    if (!playerData[guildId]) playerData[guildId] = {};
    const channels = (playerData[guildId].castDock ||= {}).channels ||= {};
    const existing = channels[channelId] || {};
    // A pre-activation selection write must never retarget or mutate a dock that is LIVE
    // for a different player (deferred-activation contract) — reject untouched.
    if (existing.enabled === true && existing.targetUserId && existing.targetUserId !== targetUserId) {
      return { ...existing, rejected: true };
    }
    channels[channelId] = { ...existing, targetUserId, selectedButtons, enabled: existing.enabled === true };
    await savePlayerData(playerData);
    return channels[channelId];
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

// The complete set of buttons a CastDock owner can choose to show on the compact view.
// Order here IS the render order — buttons always render in this order regardless of the
// order they were picked in the multi-select. 'stamina'/'stores' are deliberately absent —
// dropped from compact mode entirely (the full menu is unaffected).
// defaultOn:false = excluded from the default selection (only matters while selectedButtons
// is null — an explicit selection always wins). Map is off by default so the five default
// buttons fit on a single ActionRow (Discord's 5-button row limit); a sixth wraps to row 2.
export const CASTDOCK_SELECTABLE_BUTTONS = [
  { id: 'commands', label: 'Commands', emoji: '🕹️', description: 'Lets player type in commands in actions' },
  { id: 'inventory', label: 'Inventory', emoji: '🧰', description: "Shows the players' inventory" },
  { id: 'actions', label: 'Actions', emoji: '⚡', description: 'Shows any actions configured to player menu' },
  { id: 'challenges', label: 'Challenges', emoji: '🏃', description: 'Shows any active challenge actions' },
  { id: 'crafting', label: 'Crafting', emoji: '🛠️', description: 'Shows crafting options' },
  { id: 'map', label: 'Map', emoji: '🗺️', description: 'Shows the navigate pane if the player is in Safari', defaultOn: false },
];

/** Pure — the ids selected by default (when selectedButtons is null/undefined): every entry not marked defaultOn:false. */
export function defaultCastDockButtonIds() {
  return CASTDOCK_SELECTABLE_BUTTONS.filter(b => b.defaultOn !== false).map(b => b.id);
}

/**
 * Pure — resolves which compact-row ids to render, in CASTDOCK_SELECTABLE_BUTTONS order.
 * null/undefined (never configured) → the default five (Map is off by default). An explicit
 * array — including [] — is a real, respected choice, not defaulted. Unknown ids are dropped.
 */
export function resolveCompactRowIds(selectedButtons) {
  const chosen = Array.isArray(selectedButtons) ? new Set(selectedButtons) : new Set(defaultCastDockButtonIds());
  return CASTDOCK_SELECTABLE_BUTTONS.filter(b => chosen.has(b.id)).map(b => b.id);
}

// Why a selected button can STILL be missing from the dock: the guild has that feature switched
// off or has nothing configured behind it (calculateVisibility's gatedBy === 'config'). Keyed by
// button id; shown verbatim on the setup screen so a host is never left guessing. Kept under
// ~90 chars — Discord truncates a select option description at 100.
export const CASTDOCK_CONFIG_GATE_REASONS = {
  commands: 'Global commands are switched off in Safari settings',
  inventory: "Hidden by this server's inventory visibility setting",
  actions: 'No actions are set to show on the player menu yet',
  challenges: 'No challenge actions are configured yet',
  crafting: 'No crafting recipes are configured yet',
  map: 'No active Safari map in this server yet',
};

/**
 * Pure — the compact row's own visibility, derived from the player menu's.
 *
 * Ticking a button on the setup screen is an explicit, deliberate, per-channel decision by the
 * host, so it OUTRANKS the player menu's per-player tidiness heuristics ('player' gates —
 * Inventory hiding while the player is broke, Map hiding until they're placed on the map). Those
 * buttons have real empty states (an empty bag; "hasn't started exploring yet"), and the dock
 * re-renders on every message, so they light up on their own the moment the player has something.
 *
 * A 'config' gate is never overruled: the guild has the feature off or has nothing configured,
 * so the button would be permanent dead weight on a public sticky message. buildCastDockSetupScreen
 * surfaces those explicitly instead (see castDockBlockedSelections).
 *
 * @param {Object} visibility - from calculateVisibility (PLAYER mode)
 * @param {string[]} rowIds - from resolveCompactRowIds
 * @returns {Object} a shallow copy — never mutates the caller's visibility map
 */
export function applyCastDockSelection(visibility, rowIds) {
  const out = { ...(visibility || {}) };
  for (const id of rowIds || []) {
    const vis = out[id];
    if (!vis || vis.show) continue;
    if (vis.gatedBy === 'player') out[id] = { ...vis, show: true, forcedBySelection: true };
  }
  return out;
}

/**
 * Pure — of the given ids, the ones that will NOT render even though they're selected, each with
 * a human reason. Anything a selection can overrule is already excluded (applyCastDockSelection),
 * so everything returned here is a genuine guild-config gap the host needs to know about.
 * @returns {Array<{id: string, label: string, emoji: string, reason: string}>}
 */
export function castDockBlockedSelections(visibility, rowIds) {
  const applied = applyCastDockSelection(visibility, rowIds);
  const meta = new Map(CASTDOCK_SELECTABLE_BUTTONS.map(b => [b.id, b]));
  return (rowIds || [])
    .filter(id => !applied[id]?.show)
    .map(id => ({
      id,
      label: meta.get(id)?.label || id,
      emoji: meta.get(id)?.emoji || '•',
      reason: CASTDOCK_CONFIG_GATE_REASONS[id] || 'Not available in this server yet'
    }));
}

/**
 * Pure — the "Select CastDock buttons" multi-select shown on the setup screen. Options are
 * always in CASTDOCK_SELECTABLE_BUTTONS order; `default:` reflects the current selection
 * (or the default five — Map off — if selectedButtons is null/undefined, never configured).
 * @param {Array<{id: string, reason: string}>} [blocked] - from castDockBlockedSelections; those
 *   options swap their description for the reason they won't render, so the screen never shows a
 *   ticked box that silently does nothing (the whole point of the 2026-08-01 fix).
 */
export function buildCastDockButtonSelectRow(customId, selectedButtons, blocked = []) {
  const chosen = Array.isArray(selectedButtons) ? new Set(selectedButtons) : new Set(defaultCastDockButtonIds());
  const reasons = new Map((blocked || []).map(b => [b.id, b.reason]));
  return {
    type: 1, // ActionRow
    components: [{
      type: 3, // String Select
      custom_id: customId,
      placeholder: 'Default buttons selected',
      min_values: 0,
      // Discord rejects the whole message ("interaction failed") if max_values exceeds
      // the option count — cap at however many selectable buttons exist.
      max_values: Math.min(10, CASTDOCK_SELECTABLE_BUTTONS.length),
      options: CASTDOCK_SELECTABLE_BUTTONS.map(b => ({
        label: b.label,
        value: b.id,
        description: (reasons.has(b.id) ? `⚠️ ${reasons.get(b.id)}` : b.description).slice(0, 100),
        emoji: { name: b.emoji },
        default: chosen.has(b.id)
      }))
    }]
  };
}

/**
 * Impure — the setup screen shown after choosing "Enable": explains what CastDock is, the
 * privacy caveat, and lets the owner pick which buttons show — all BEFORE anything actually
 * activates. Nothing is persisted or posted until "Activate CastDock" is clicked (a separate
 * handler in app.js). Deliberately NOT the red Critical Deletion pattern — this isn't
 * destructive or gated, just informational, so it uses the same purple "info tier" accent
 * as the Safari import prep screen (app.js's safari_import_data handler) rather than
 * orange/red.
 *
 * It also DRY-RUNS the compact row's visibility (same calculateVisibility call the dock itself
 * makes) so a ticked button that this server can't render yet is flagged here rather than just
 * silently missing from the dock — see castDockBlockedSelections.
 * @param {string} guildId
 * @param {string} channelId
 * @param {boolean} isAdminMode
 * @param {string} [targetUserId] - required when isAdminMode, to build custom_ids
 */
/**
 * Pure — turns a raw "other players who can see this" count into the screen's verdict.
 *
 * `null` count = we couldn't work it out (uncached members, missing channel, no client);
 * the screen then falls back to the old generic caveat rather than asserting something
 * false. Unit-tested.
 */
export function assessCastDockAudience(otherPlayerCount) {
  if (otherPlayerCount == null) return { level: 'unknown' };
  return otherPlayerCount === 0
    ? { level: 'private', otherPlayerCount: 0 }
    : { level: 'shared', otherPlayerCount };
}

/**
 * Counts NON-ADMIN, non-bot members (other than the dock's target) who can see the channel.
 *
 * Admins are deliberately excluded: CastDock's designed home is a subs channel where the
 * player and their hosts are both present, and hosts seeing the dock is the entire point.
 * What makes a channel wrong for CastDock is *other players* being able to read it — which
 * is exactly what happened in EpochORG S14 on 2026-08-04, where a player self-activated in
 * a shared map channel and their menu sat publicly readable for four days.
 *
 * Best-effort: returns null on any failure so setup is never blocked by a failed count.
 */
export async function countCastDockAudience(client, guildId, channelId, targetUserId) {
  try {
    if (!client) return null;
    const { PermissionFlagsBits } = await import('discord.js');
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.members) return null; // not a guild text channel, or members uncached
    const names = [];
    let others = 0;
    for (const [, m] of channel.members) {
      if (m.user?.bot || m.id === targetUserId) continue;
      if (m.permissions?.has(PermissionFlagsBits.ManageRoles)) continue; // host — intended viewer
      others++;
      if (names.length < 3) names.push(m.displayName);
    }
    return { others, names };
  } catch (e) {
    console.warn(`CastDock: could not compute audience for ${guildId}/${channelId}: ${e.message}`);
    return null;
  }
}

export async function buildCastDockSetupScreen(guildId, channelId, isAdminMode, targetUserId = null, client = null) {
  const { countComponents } = await import('./utils.js');
  const { getBotEmoji } = await import('./botEmojis.js');
  const { loadPlayerData } = await import('./storage.js');
  const playerData = await loadPlayerData();
  const config = await getCastDockConfig(guildId, channelId, playerData);
  const activateId = isAdminMode ? `castdock_activate_${targetUserId}` : 'castdock_activate';
  const selectButtonsId = isAdminMode ? `castdock_select_buttons_${targetUserId}` : 'castdock_select_buttons';

  // Predict exactly what the dock will render — same inputs, same PLAYER-mode visibility the
  // compact view uses — so a ticked box that can't currently show says so on this screen instead
  // of quietly rendering nothing (the "I selected six, I got two" report, 2026-08-01).
  let blocked = [];
  try {
    const { calculateVisibility, PlayerManagementMode } = await import('./playerManagement.js');
    const { loadSafariContent } = await import('./safariManager.js');
    const visibility = await calculateVisibility(guildId, targetUserId, playerData, await loadSafariContent(), PlayerManagementMode.PLAYER, null, channelId);
    blocked = castDockBlockedSelections(visibility, CASTDOCK_SELECTABLE_BUTTONS.map(b => b.id));
  } catch (e) {
    // Advisory only — never block setup on it. Worst case the screen reads as it did before.
    console.warn(`CastDock: could not evaluate button availability for ${guildId}/${targetUserId}: ${e.message}`);
  }
  const selectedIds = new Set(resolveCompactRowIds(config.selectedButtons));
  const blockedAndSelected = blocked.filter(b => selectedIds.has(b.id));

  // Count the real audience rather than asking the reader to assess their own channel.
  // The prose version of this warning has been on this screen the whole time and was read
  // past twice (2026-08-01 button selection, 2026-08-04 shared-channel activation); per
  // LeanUserInterfaceDesign.md the thing that actually lands is a computed, specific fact.
  const audience = assessCastDockAudience((await countCastDockAudience(client, guildId, channelId, targetUserId))?.others ?? null);
  const isShared = audience.level === 'shared';

  const audienceBlock = isShared
    ? {
      type: 10,
      content: `**${audience.otherPlayerCount} other player${audience.otherPlayerCount === 1 ? '' : 's'} can see this channel.**\n` +
        `All of them will see this dock's currency, item counts, safari stats and map position — ` +
        `and it stays there, reposting itself, until it's turned off.\n\n` +
        `CastDock is meant for a player's own subs/submission channel. This doesn't look like one.`
    }
    : audience.level === 'private'
      ? { type: 10, content: '-# No other players can see this channel — only hosts. That\'s exactly where CastDock belongs.' }
      : { type: 10, content: '-# Since it\'s public now, whatever shows on it — currency, item counts, safari stats — is visible to everyone in this channel. Best kept to a private submission/subs channel, not anywhere spectators or other players can see it.' };

  const container = {
    type: 17, // Container
    // Orange only when the count says this is the wrong kind of channel; the calm purple
    // info tier otherwise, so the warning colour keeps meaning something.
    accent_color: isShared ? 0xf39c12 : 0x9b59b6,
    components: [
      { type: 10, content: '## 📌 Set Up CastDock' },
      { type: 14 },
      { type: 10, content: '### ```📌 What is CastDock?```' },
      { type: 10, content: 'CastDock pins this menu as a **public** message in this channel — it\'s always the newest message here, automatically reposting itself whenever anyone sends a new message.' },
      { type: 14 },
      { type: 10, content: isShared ? '### ```⚠️ Who can see this```' : '### ```👀 Who can see this```' },
      audienceBlock,
      { type: 14 },
      { type: 10, content: '### ```🔘 Select CastDock buttons```' },
      { type: 10, content: '-# Choose which buttons appear on CastDock (shown in this order: Commands, Inventory, Actions, Challenges, Crafting, Map). The default five fit neatly on one row — Map is off by default, as a sixth button wraps onto a second row. Anything you tick shows even if the player has nothing yet — the only exception is a feature this server hasn\'t set up at all, which is flagged with a ⚠️ below.' },
      buildCastDockButtonSelectRow(selectButtonsId, config.selectedButtons, blocked),
      { type: 14 },
      { type: 1, components: [
        // "Activate Anyway" makes the informed-consent step explicit when the count says
        // this is a shared channel — the label itself carries the warning to the click.
        { type: 2, custom_id: activateId, label: isShared ? 'Activate Anyway' : 'Activate CastDock', style: isShared ? 2 : 1, emoji: getBotEmoji('castbot_logo') }
      ]}
    ]
  };

  if (blockedAndSelected.length) {
    const list = blockedAndSelected.map(b => `${b.emoji} **${b.label}** — ${b.reason.toLowerCase()}`).join('\n');
    // Sits directly under the select, above the Activate row's separator.
    container.components.splice(container.components.length - 2, 0, {
      type: 10,
      content: `-# ⚠️ **Selected, but won't appear yet:**\n${list}\n-# These light up on the dock automatically once configured — no need to come back here.`
    });
  }

  countComponents([container], { enableLogging: true, verbosity: 'summary', label: 'CastDock Setup Screen' });
  return { flags: (1 << 15), components: [container] };
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

/**
 * Pure — is this interaction a self-scoped control being clicked on SOMEONE ELSE'S public
 * CastDock sticky? Those controls resolve to the clicker, so letting them through would
 * publish the clicker's own menu into a channel they don't own. Unit-tested.
 */
export function isForeignCastDockSticky({ entry, messageId, clickerUserId }) {
  if (!entry?.enabled || !entry.lastMessageId || !messageId) return false;
  if (String(entry.lastMessageId) !== String(messageId)) return false;
  return String(entry.targetUserId) !== String(clickerUserId);
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

/** Pure — drops the label from every button in a row (or array of rows), keeping only its emoji. */
export function stripButtonLabels(rows) {
  for (const row of [].concat(rows)) {
    for (const component of row?.components || []) {
      delete component.label;
    }
  }
  return rows;
}

// Compact-mode-only custom_ids for buttons that skip the hot-swap select and either act
// directly (inventory/map) or open a select scoped to CastDock's own safe fallback
// (crafting/challenges — see buildCompactCastDockMenu's activeSelectCategory param).
// 'commands' and 'actions' are untouched, still routing through the full menu's custom_ids.
export const COMPACT_DIRECT_ACTION_REMAP = {
  player_set_inventory: 'castdock_view_inventory',
  player_set_map: 'castdock_view_navigate',
  player_set_crafting: 'castdock_open_crafting',
  player_set_challenges: 'castdock_open_challenges',
};

/** Pure — rewrites specific button custom_ids per COMPACT_DIRECT_ACTION_REMAP, leaving the rest untouched. */
export function remapCompactButtonIds(rows) {
  for (const row of [].concat(rows)) {
    for (const component of row?.components || []) {
      const replacement = COMPACT_DIRECT_ACTION_REMAP[component.custom_id];
      if (replacement) component.custom_id = replacement;
    }
  }
  return rows;
}

/**
 * Builds the compact CastDock view: a "CastDock" header Section with the '^' expand
 * toggle as its accessory, JUST the player's stats line (no name, no pronouns/age/timezone,
 * no Local time, no thumbnail — built directly via buildPlayerStatsLine rather than through
 * createPlayerDisplaySection's combined card), and the bare Safari button row (with Commands
 * merged in, Currency removed, no section heading text above it) — all emoji-only. No Row 1
 * (Castlists & Profile), no Advanced section, no hot-swap select by default — a minimal
 * "home" view, not a full menu replacement.
 *
 * Inventory and Map skip the hot-swap select entirely (their custom_ids are remapped to
 * dedicated handlers that jump straight to the view-inventory / navigate-pane action).
 * Crafting and Challenges instead open their existing hot-swap select, rendered inline below
 * this same compact row via activeSelectCategory — pass 'crafting' or 'challenges' to append
 * it (used by the castdock_open_crafting/castdock_open_challenges handlers in app.js).
 * @param {string|null} [activeSelectCategory] - 'crafting' | 'challenges' | null
 */
export async function buildCompactCastDockMenu(client, guildId, targetMember, playerData, channelId, activeSelectCategory = null) {
  const { calculateVisibility, buildSectionRow, buildSuperSelect, buildPlayerStatsLine, PlayerManagementMode } = await import('./playerManagement.js');
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
      components: [{ type: 10, content: '## CastDock' }],
      accessory: { type: 2, custom_id: 'castdock_expand', label: '^', style: 2 }
    }]
  };

  const statsLine = await buildPlayerStatsLine(guildId, targetMember, playerData);
  if (statsLine) container.components.push({ type: 10, content: statsLine });

  container.components.push({ type: 14 }); // Separator

  const config = await getCastDockConfig(guildId, channelId, playerData);
  const rowIds = resolveCompactRowIds(config.selectedButtons);
  // The host's explicit tick beats the player menu's per-player tidiness gates (but not a
  // guild-wide config gate) — see applyCastDockSelection.
  const row2 = buildSectionRow(rowIds, targetUserId, null, applyCastDockSelection(visibility, rowIds), PlayerManagementMode.PLAYER);
  stripButtonLabels(row2);
  remapCompactButtonIds(row2);
  row2.forEach(r => container.components.push(r));

  if (activeSelectCategory) {
    const selectRow = await buildSuperSelect(activeSelectCategory, targetMember, playerData, safariData, guildId, PlayerManagementMode.PLAYER, client, null, targetUserId, channelId);
    if (selectRow) container.components.push(selectRow);
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
export async function applyCastDockToggle(client, guildId, channelId, targetUserId, action, actorUserId, { allowRetarget = false } = {}) {
  if (!client.castDockChannels) client.castDockChannels = new Map();
  if (action === 'enable') {
    // setCastDockButtonSelection has refused cross-player retargeting since day one; this
    // path never did, so a player could silently take over a channel another player's dock
    // was live in (leaving the old sticky orphaned). Hosts activating in admin mode pass
    // allowRetarget — reassigning a dock is a legitimate thing for them to do.
    const live = client.castDockChannels.get(channelId);
    if (!allowRetarget && live?.enabled && live.targetUserId && live.targetUserId !== targetUserId) {
      console.log(`📌 CastDock: refused retarget of ${channelId} (live for ${live.targetUserId}, ${actorUserId} tried to claim it)`);
      return { ok: false, reason: 'occupied', existingTargetUserId: live.targetUserId };
    }
    await setCastDockConfig(guildId, channelId, { enabled: true, targetUserId, enabledBy: actorUserId });
    // Carry over the previous sticky's id — re-activating an already-active dock (the
    // reconfigure flow) must delete the old message on first post, not orphan it forever.
    const prevMessageId = client.castDockChannels.get(channelId)?.lastMessageId ?? null;
    const entry = { enabled: true, targetUserId, guildId, lastMessageId: prevMessageId, lastRepostAt: Date.now() };
    client.castDockChannels.set(channelId, entry);
    await repostCastDockMenu(client, guildId, channelId, entry); // immediate first post
  } else {
    await handleCastDockDisable(client, guildId, channelId, actorUserId);
  }
  return { ok: true };
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
