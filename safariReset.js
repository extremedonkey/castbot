/**
 * safariReset.js — "Reset Safari": wipe Safari PLAY STATE without touching authored CONTENT.
 *
 * The problem it solves: a host spends days testing a Safari before a season launches, and by
 * the time they're happy the world is full of residue — every `once_globally` idol has been
 * claimed by a tester, testers are carrying loot, stamina is drained, the round counter is wrong.
 * There was no way to see what needed undoing, let alone undo it in bulk.
 *
 * 🔴 THE INVARIANT: this module NEVER deletes an Action, Item, Store, Enemy, Attribute, Map or
 * Challenge. It only clears the state RECORDED AGAINST them. If you add a code path here that
 * removes an authored entity, you have broken the feature's contract.
 *
 * Three scopes (see RESET_SCOPES), each a strict superset of the one before:
 *   testing → outcome claims only. Players keep inventory/currency/points/location.
 *   full    → testing + every player's economy & progress wiped back to starting values.
 *   wipe    → full + de-initialise every player off the map (revokes channel access).
 *
 * ⚠️ Store stock is deliberately NOT reset. CastBot records only the CURRENT `stock` on a store
 * item, never the original — so there is nothing to restore to. The preview instead REPORTS every
 * stocked item so the host can fix them by hand. Do not "fix" this by guessing an original value.
 *
 * Claim state itself lives in claimsManager.js (`countClaims` / `clearAllClaims`); this module
 * only sweeps and reports. Pure collectors are exported for unit testing (tests/safariReset.test.js).
 */

// Only the PURE claim helpers are imported statically. Everything else (storage, safariManager,
// logger) is imported dynamically inside the impure functions so this module stays cheap to
// import — tests/safariReset.js exercises the collectors without dragging in safariManager.
import { clearAllClaims, countClaims, describeOutcome } from './claimsManager.js';

/** Lazily-resolved storage + safari helpers (see note above). */
async function deps() {
  const [storage, safari, log] = await Promise.all([
    import('./storage.js'),
    import('./safariManager.js'),
    import('./logger.js')
  ]);
  return {
    loadPlayerData: storage.loadPlayerData,
    savePlayerData: storage.savePlayerData,
    withStorageLock: storage.withStorageLock,
    loadSafariContent: safari.loadSafariContent,
    saveSafariContent: safari.saveSafariContent,
    getCustomTerms: safari.getCustomTerms,
    getStartingCurrency: safari.getStartingCurrency,
    grantDefaultItems: safari.grantDefaultItems,
    logger: log.logger
  };
}

// ==================== SCOPES ====================

/**
 * Reset scopes, ordered least → most destructive. `clearsPlayers` and `deinitializes` are the
 * only two behavioural switches; everything else is copy.
 */
export const RESET_SCOPES = {
  testing: {
    value: 'testing',
    emoji: '🧪',
    label: 'Testing Reset',
    blurb: 'Actions only — testers keep their items',
    description: 'Resets all actions which have a limit on the number of times it can be claimed, e.g., if you have an idol hidden in the safari and a tester has already found it, or you want to retest a full section of the Safari where you’ve already activated the actions.',
    clearsPlayers: false,
    deinitializes: false,
    accent: 0xf39c12 // orange — caution
  },
  full: {
    value: 'full',
    emoji: '🧹',
    label: 'Full Server Reset',
    blurb: 'Actions + wipe every inventory, currency & stamina',
    description: 'Testing Reset, plus every player’s inventory, currency, stamina/attributes and history reset to starting values. Players stay on the map where they are.',
    clearsPlayers: true,
    deinitializes: false,
    accent: 0xed4245 // red — destructive
  },
  wipe: {
    value: 'wipe',
    emoji: '🚪',
    label: 'Full Reset + Remove Players',
    blurb: 'Full Server Reset, then de-initialise everyone',
    description: 'Full Server Reset, then removes every player from the Safari entirely — map channel access is revoked and they must be re-added with Start Safari. Per-player starting locations are kept.',
    clearsPlayers: true,
    deinitializes: true,
    accent: 0xed4245 // red — destructive
  }
};

export const RESET_SCOPE_ORDER = ['testing', 'full', 'wipe'];

const MENU_LABELS = {
  player_menu: 'Player menu',
  crafting_menu: 'Crafting menu'
};

// ==================== PURE COLLECTORS ====================

/**
 * Where an action is reachable from, for the preview's locator column.
 * Map coordinates win (that's where hosts hide advantages); otherwise the menu it's pinned to.
 * @returns {string} e.g. "D1", "E1, E7", "Crafting menu", "—"
 */
export function locateAction(button) {
  const coords = Array.isArray(button?.coordinates) ? button.coordinates.filter(Boolean) : [];
  if (coords.length) return coords.join(', ');
  const vis = button?.menuVisibility;
  if (vis && vis !== 'none' && MENU_LABELS[vis]) return MENU_LABELS[vis];
  return '—';
}

/**
 * Sweep every action outcome that carries a usage limit.
 * @param {object} safariData - full safariContent
 * @param {string} guildId
 * @param {object} [customTerms] - from getCustomTerms(guildId); only affects display strings
 * @returns {Array<{buttonId, buttonName, actionIndex, limitType, claimCount, location, outcome, claimant}>}
 */
export function collectClaimTargets(safariData, guildId, customTerms = {}) {
  const buttons = safariData?.[guildId]?.buttons || {};
  const targets = [];

  for (const [buttonId, button] of Object.entries(buttons)) {
    const actions = Array.isArray(button?.actions) ? button.actions : [];
    const location = locateAction(button);

    actions.forEach((action, actionIndex) => {
      const limit = action?.config?.limit;
      if (!limit || !limit.type || limit.type === 'unlimited') return;

      targets.push({
        buttonId,
        buttonName: button?.name || button?.label || buttonId,
        actionIndex,
        limitType: limit.type,
        claimCount: countClaims(limit),
        location,
        outcome: describeOutcome(safariData, guildId, action, actionIndex, customTerms),
        // once_globally is the only single-claimant type — the one hosts need to eyeball
        claimant: (limit.type === 'once_globally' && typeof limit.claimedBy === 'string' && limit.claimedBy)
          ? limit.claimedBy
          : null
      });
    });
  }

  return targets;
}

/**
 * Roll a claim sweep up into the numbers the preview shows.
 * `globals` is returned in full (hosts want to see every one) — sorted claimed-first so the
 * entries that actually need attention survive any char-budget truncation downstream.
 */
export function summarizeClaimTargets(targets) {
  const totalClaims = targets.reduce((n, t) => n + t.claimCount, 0);
  const outcomesWithClaims = targets.filter(t => t.claimCount > 0).length;

  const globals = targets
    .filter(t => t.limitType === 'once_globally')
    .sort((a, b) => {
      if (!!b.claimant !== !!a.claimant) return b.claimant ? 1 : -1; // claimed first
      return a.location.localeCompare(b.location) || a.outcome.localeCompare(b.outcome);
    });

  return {
    totalClaims,
    outcomesWithClaims,
    limitedOutcomes: targets.length,
    globals,
    globalsClaimed: globals.filter(t => t.claimant).length
  };
}

/**
 * Every store item with a FINITE stock level — i.e. one that testing may have eaten into and that
 * this feature deliberately cannot restore (no original level is recorded anywhere).
 * `stock` of undefined/null/-1 all mean unlimited.
 */
export function collectStockedStoreItems(safariData, guildId) {
  const stores = safariData?.[guildId]?.stores || {};
  const items = safariData?.[guildId]?.items || {};
  const rows = [];

  for (const store of Object.values(stores)) {
    const storeItems = Array.isArray(store?.items) ? store.items : [];
    for (const si of storeItems) {
      const stock = si?.stock;
      if (stock === undefined || stock === null || stock === -1) continue;
      const item = items[si.itemId];
      rows.push({
        storeName: store?.name || store?.id || 'Unnamed store',
        storeEmoji: store?.emoji || '🏪',
        itemName: item?.name || si.itemId || 'Unknown item',
        itemEmoji: item?.emoji || '📦',
        stock: Number(stock)
      });
    }
  }

  return rows.sort((a, b) => a.stock - b.stock || a.storeName.localeCompare(b.storeName));
}

/** Per-player state that a `full`/`wipe` reset will clear. Counts only; names come from Discord. */
export function collectPlayerState(playerData, guildId, activeMapId) {
  const players = playerData?.[guildId]?.players || {};
  let withSafari = 0, onMap = 0, totalItems = 0, totalCurrency = 0, paused = 0;

  for (const [userId, player] of Object.entries(players)) {
    if (!/^\d{17,20}$/.test(userId)) continue; // skip non-snowflake keys (e.g. "admin")
    const safari = player?.safari;
    if (!safari) continue;
    withSafari++;
    if (activeMapId && safari.mapProgress?.[activeMapId]?.currentLocation) onMap++;
    if (safari.isPaused === true) paused++;
    totalItems += Object.keys(safari.inventory || {}).length;
    totalCurrency += Number(safari.currency) || 0;
  }

  return { withSafari, onMap, totalItems, totalCurrency, paused };
}

/**
 * Pack list lines into a character budget (Components V2 allows 4000 chars across ALL text
 * displays in one message, so every list here has to be measured, not counted).
 * @returns {{text: string, shown: number, hidden: number}}
 */
export function packLines(lines, budget) {
  const out = [];
  let used = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const remaining = lines.length - i;
    // Reserve room for the "…and N more" tail whenever anything could still be dropped
    const reserve = remaining > 1 ? 28 : 0;
    if (used + line.length + 1 + reserve > budget) break;
    out.push(line);
    used += line.length + 1;
  }

  const hidden = lines.length - out.length;
  if (hidden > 0) out.push(`> -# …and **${hidden}** more`);

  return { text: out.join('\n'), shown: lines.length - hidden, hidden };
}

// ==================== PREVIEW ====================

/**
 * Build the full pre-flight picture for a guild. Read-only — safe to call on every render.
 * @returns {Promise<object>} preview bundle consumed by buildResetUI
 */
export async function buildResetPreview(guildId) {
  const { loadSafariContent, loadPlayerData, getCustomTerms } = await deps();
  const safariData = await loadSafariContent();
  const playerData = await loadPlayerData();
  const customTerms = await getCustomTerms(guildId);

  const activeMapId = safariData[guildId]?.maps?.active;
  const targets = collectClaimTargets(safariData, guildId, customTerms);

  return {
    customTerms,
    hasMap: !!activeMapId,
    claims: summarizeClaimTargets(targets),
    stocked: collectStockedStoreItems(safariData, guildId),
    players: collectPlayerState(playerData, guildId, activeMapId),
    rounds: {
      currentRound: safariData[guildId]?.safariConfig?.currentRound ?? 0,
      queuedAttacks: Object.values(safariData[guildId]?.attackQueue || {})
        .reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
    }
  };
}

// ==================== EXECUTION ====================

/**
 * Clear all claim state on every limited outcome in the guild.
 * Mutates `safariData` in place; caller saves.
 * @returns {{outcomes: number, claims: number}}
 */
export function resetActionClaims(safariData, guildId) {
  const buttons = safariData?.[guildId]?.buttons || {};
  let outcomes = 0, claims = 0;

  for (const button of Object.values(buttons)) {
    const actions = Array.isArray(button?.actions) ? button.actions : [];
    for (const action of actions) {
      const limit = action?.config?.limit;
      if (!limit || !limit.type || limit.type === 'unlimited') continue;
      const before = countClaims(limit);
      clearAllClaims(limit);
      if (before > 0) { outcomes++; claims += before; }
    }
  }

  return { outcomes, claims };
}

/** Zero the cumulative sales counters that testing inflates (pure stats, not content). */
export function resetSalesCounters(safariData, guildId) {
  let reset = 0;
  for (const store of Object.values(safariData?.[guildId]?.stores || {})) {
    if (store?.metadata?.totalSales) { store.metadata.totalSales = 0; reset++; }
  }
  for (const item of Object.values(safariData?.[guildId]?.items || {})) {
    if (item?.metadata?.totalSold) { item.metadata.totalSold = 0; reset++; }
  }
  return reset;
}

/** Round/combat state — mirrors the older Reset Game flow. Mutates in place; caller saves. */
export function resetRoundState(safariData, guildId) {
  const guild = safariData?.[guildId];
  if (!guild) return;
  if (!guild.safariConfig) guild.safariConfig = {};
  guild.safariConfig.currentRound = 0;
  guild.safariConfig.lastRoundTimestamp = Date.now();
  if (guild.roundHistory) guild.roundHistory = [];
  if (guild.attackQueue) guild.attackQueue = {};
}

/**
 * Reset one player's economy/progress back to starting values, keeping them on the map.
 * Mutates `playerData` in place; caller saves. Points live in safariContent, cleared separately.
 */
async function resetPlayerEconomy(playerData, guildId, userId, startingCurrency, grantDefaultItems) {
  const safari = playerData[guildId].players[userId].safari;

  safari.currency = startingCurrency;
  safari.inventory = {};
  safari.history = [];
  safari.storeHistory = [];
  safari.cooldowns = {};
  safari.buttonUses = {};
  safari.achievements = [];
  safari.lastInteraction = Date.now();

  await grantDefaultItems(playerData, guildId, userId);
}

/** Snowflake-keyed players that actually carry Safari data ("admin" and friends are skipped). */
function safariUserIds(playerData, guildId) {
  return Object.entries(playerData?.[guildId]?.players || {})
    .filter(([userId, p]) => /^\d{17,20}$/.test(userId) && p?.safari)
    .map(([userId]) => userId);
}

/**
 * Delete a player's points record so the next read re-seeds it from config.
 * Mirrors de-init: initializeEntityPoints only creates when ABSENT, so a stale record would
 * survive with the old `current` while max got reconciled (the "3/999 after re-init" bug).
 */
function clearEntityPoints(safariData, guildId, userId) {
  const entityId = `player_${userId}`;
  if (safariData[guildId]?.entityPoints?.[entityId]) {
    delete safariData[guildId].entityPoints[entityId];
    return true;
  }
  return false;
}

/**
 * Execute a reset.
 *
 * Ordering matters: content-store (safariContent) sweeps run first and save once, then per-player
 * work runs. De-initialisation is delegated to the existing `bulkDeinitializePlayers` so the
 * channel-permission and entityPoints cleanup stays in exactly one place.
 *
 * @param {string} guildId
 * @param {string} scope - key of RESET_SCOPES
 * @param {object} client - Discord client (needed for `wipe` channel permission cleanup)
 * @returns {Promise<object>} tallies for the result screen
 */
export async function executeReset(guildId, scope, client) {
  const config = RESET_SCOPES[scope];
  if (!config) throw new Error(`executeReset: unknown scope "${scope}"`);

  const {
    loadPlayerData, savePlayerData, withStorageLock,
    loadSafariContent, saveSafariContent, getStartingCurrency, grantDefaultItems, logger
  } = await deps();

  logger.info('SAFARI_RESET', 'Reset started', { guildId, scope });

  // ---- Phase 1: safariContent sweeps (claims, world state, rounds) ----
  const safariData = await loadSafariContent();
  const claimResult = resetActionClaims(safariData, guildId);
  let salesReset = 0;

  if (config.clearsPlayers) {
    salesReset = resetSalesCounters(safariData, guildId);
    resetRoundState(safariData, guildId);
  }

  await saveSafariContent(safariData);

  // ---- Phase 2: player state ----
  const tally = {
    scope,
    outcomesReset: claimResult.outcomes,
    claimsCleared: claimResult.claims,
    salesCountersReset: salesReset,
    playersReset: 0,
    playersRemoved: 0,
    playersFailed: 0,
    startingCurrency: 0
  };

  if (!config.clearsPlayers) {
    logger.info('SAFARI_RESET', 'Reset complete (claims only)', { guildId, scope, ...tally });
    return tally;
  }

  if (config.deinitializes) {
    // De-init already clears playerData.safari AND entityPoints AND channel permissions, so it
    // owns its own load/mutate/save cycles — do NOT take the storage lock around it (it makes
    // Discord API calls per player, which must never run inside the lock).
    const playerData = await loadPlayerData();
    const userIds = safariUserIds(playerData, guildId);

    const { bulkDeinitializePlayers } = await import('./safariDeinitialization.js');
    const results = await bulkDeinitializePlayers(guildId, userIds, client);
    tally.playersRemoved = results.success.length;
    tally.playersFailed = results.failed.length;
  } else {
    // Resolve config BEFORE the lock so nothing avoidable runs inside it.
    const startingCurrency = await getStartingCurrency(guildId);
    tally.startingCurrency = startingCurrency;

    let resetUserIds = [];
    await withStorageLock(async () => {
      const playerData = await loadPlayerData(); // load INSIDE the lock, never before it
      const userIds = safariUserIds(playerData, guildId);

      for (const userId of userIds) {
        try {
          await resetPlayerEconomy(playerData, guildId, userId, startingCurrency, grantDefaultItems);
          // Legacy duplicate of the points record — de-init clears it by deleting safari wholesale
          delete playerData[guildId].players[userId].safari.points;
          resetUserIds.push(userId);
          tally.playersReset++;
        } catch (error) {
          tally.playersFailed++;
          logger.error('SAFARI_RESET', 'Player economy reset failed', { guildId, userId, error: error.message });
        }
      }

      await savePlayerData(playerData);
    });

    // Points live in the OTHER store (safariContent.entityPoints) — clear outside the playerData lock
    const pointsData = await loadSafariContent();
    let cleared = 0;
    for (const userId of resetUserIds) {
      if (clearEntityPoints(pointsData, guildId, userId)) cleared++;
    }
    if (cleared > 0) await saveSafariContent(pointsData);
  }

  logger.info('SAFARI_RESET', 'Reset complete', { guildId, scope, ...tally });
  return tally;
}

// ==================== UI ====================

const BACK_BUTTON = { type: 2, custom_id: 'safari_map_explorer', label: '← Map Explorer', style: 2 };

/** The scope String Select, with the chosen option pre-selected. */
function buildScopeSelect(scope) {
  return {
    type: 1,
    components: [{
      type: 3,
      custom_id: 'safari_reset_scope',
      placeholder: 'Choose what to reset...',
      options: RESET_SCOPE_ORDER.map(key => {
        const s = RESET_SCOPES[key];
        return {
          label: s.label,
          value: s.value,
          description: s.blurb,
          emoji: { name: s.emoji },
          default: scope === s.value
        };
      })
    }]
  };
}

/**
 * Render the `once_globally` roster — the outcomes hosts most need to eyeball before resetting.
 * Headed "Global Actions" rather than the internal `once_globally` type name: hosts think in
 * terms of the advantage, not the limit type.
 */
function buildGlobalsSection(globals, budget) {
  if (globals.length === 0) return null;

  const lines = globals.map(g => {
    const who = g.claimant ? `claimed by <@${g.claimant}>` : '*unclaimed*';
    return `> \`${g.location}\` ${g.outcome} — ${who}`;
  });

  const packed = packLines(lines, budget);

  return {
    type: 10,
    content: `### \`\`\`🌍 Global Actions (${globals.length})\`\`\`\n`
      + '-# These global actions are being reset - these are typically used for things like advantages '
      + 'where only one player can pick it up. For example, if a tester has claimed an idol, you want to '
      + 'reset the action so a real player is able to pick it up when the game starts.\n'
      + packed.text
  };
}

/** Store stock can't be restored — report it so the host fixes it by hand. */
function buildStockSection(stocked, budget) {
  if (stocked.length === 0) return null;

  const lines = stocked.map(s =>
    `> ${s.storeEmoji} ${s.storeName} — ${s.itemEmoji} ${s.itemName}: **${s.stock === 0 ? 'Sold Out' : `${s.stock} left`}**`
  );
  const packed = packLines(lines, budget);

  return {
    type: 10,
    content: `### \`\`\`📦 Manual follow-up — store stock (${stocked.length})\`\`\`\n`
      + `-# CastBot never recorded these items’ **original** stock levels, so a reset can’t restore them. Set them back by hand in \`/menu\` > Safari > Stores.\n`
      + packed.text
  };
}

/**
 * Render the Reset Safari screen from an already-fetched preview.
 * Pure and synchronous so tests can assert the Components V2 budgets (40 components / 4000 chars)
 * against pathological guilds without touching disk.
 *
 * @param {object} args
 * @param {object} args.preview - from buildResetPreview()
 * @param {string|null} [args.scope] - selected scope, or null before a choice is made
 * @returns {{components: object[]}}
 */
export function renderResetUI({ preview, scope = null }) {
  const config = scope ? RESET_SCOPES[scope] : null;

  const components = [
    { type: 10, content: '## 🔄 Reset Safari' },
    { type: 14 },
    {
      type: 10,
      content: '**Nothing is deleted.** Your Actions, Items, Stores, Enemies, Maps and Challenges all survive '
        + 'untouched — a reset only clears the *play state* recorded against them (who claimed what, who owns what).\n\n'
        + (config
          ? '⚠️ **This cannot be undone.** Review the preview below, then confirm.'
          : '⚠️ **This cannot be undone.** Pick a scope below to see exactly what it would clear.')
    },
    { type: 14 },
    buildScopeSelect(scope)
  ];

  if (!config) {
    components.push({ type: 14 });
    components.push({ type: 1, components: [BACK_BUTTON] });
    return { components: [{ type: 17, accent_color: 0xf39c12, components }] };
  }

  // ---- Preview for the chosen scope ----
  const { claims, players, stocked, rounds, customTerms } = preview;

  const clearLines = [
    `> ⚡ **${claims.totalClaims}** claim${claims.totalClaims === 1 ? '' : 's'}, held on **${claims.outcomesWithClaims}** of the **${claims.limitedOutcomes}** action outcome${claims.limitedOutcomes === 1 ? '' : 's'} that have a Usage Limit set`
  ];
  if (config.clearsPlayers) {
    if (config.deinitializes) {
      clearLines.push(`> 🚪 **${players.withSafari}** player${players.withSafari === 1 ? '' : 's'} de-initialised — inventories (**${players.totalItems}** stack${players.totalItems === 1 ? '' : 's'}), **${players.totalCurrency}** ${customTerms.currencyEmoji || '🪙'} ${customTerms.currencyName || 'currency'}, stamina/attributes, map location and channel access`);
    } else {
      clearLines.push(`> 🎒 **${players.withSafari}** player${players.withSafari === 1 ? '' : 's'} reset — inventories (**${players.totalItems}** stack${players.totalItems === 1 ? '' : 's'}) cleared, **${players.totalCurrency}** ${customTerms.currencyEmoji || '🪙'} ${customTerms.currencyName || 'currency'} back to the starting amount, stamina/attributes restored`);
    }
    clearLines.push(`> 🎲 Round state (currently round **${rounds.currentRound}**)${rounds.queuedAttacks ? ` and **${rounds.queuedAttacks}** queued attack${rounds.queuedAttacks === 1 ? '' : 's'}` : ''}, plus store/item sales counters`);
  }

  const keepLines = [];
  if (!config.clearsPlayers) {
    keepLines.push(`> 👥 Every player keeps their inventory, ${customTerms.currencyName || 'currency'}, stamina, map location and explored cells`);
    keepLines.push('> 🎲 Round and attack-queue state');
  } else if (!config.deinitializes) {
    keepLines.push('> 📍 Players stay on the map where they are — explored cells and channel access are unchanged');
    keepLines.push('> ⏸️ Paused players stay paused');
  } else {
    keepLines.push('> 📍 Per-player **starting locations** are preserved for the next Start Safari');
  }
  keepLines.push('> 🧱 All Actions, Items, Stores, Enemies, Attributes, Maps and Challenges');

  components.push({ type: 14 });
  components.push({
    type: 10,
    content: `### \`\`\`${config.emoji} ${config.label}\`\`\`\n-# ${config.description}\n\n`
      + `**Will be cleared**\n${clearLines.join('\n')}\n\n`
      + `**Left alone**\n${keepLines.join('\n')}`
  });

  // Char budget: Components V2 allows 4000 chars across ALL text displays in the message.
  const used = components.reduce((n, c) => n + (c.type === 10 ? c.content.length : 0), 0);
  const remaining = Math.max(0, 3900 - used);

  const globalsSection = buildGlobalsSection(claims.globals, Math.floor(remaining * 0.55));
  if (globalsSection) components.push(globalsSection);

  const stockUsed = globalsSection ? globalsSection.content.length : 0;
  const stockSection = buildStockSection(stocked, Math.max(0, remaining - stockUsed - 200));
  if (stockSection) components.push(stockSection);

  components.push({ type: 14 });
  components.push({
    type: 1,
    components: [
      BACK_BUTTON,
      {
        // Scope emoji (not a generic 🔄) so the button itself confirms WHICH reset you picked
        type: 2,
        custom_id: `safari_reset_go:${config.value}`,
        label: `Confirm ${config.label}`,
        style: 4,
        emoji: { name: config.emoji }
      }
    ]
  });

  return { components: [{ type: 17, accent_color: config.accent, components }] };
}

/**
 * Fetch + render the Reset Safari screen.
 * @param {object} args
 * @param {string} args.guildId
 * @param {string|null} [args.scope]
 * @returns {Promise<{components: object[]}>}
 */
export async function buildResetUI({ guildId, scope = null }) {
  const ui = renderResetUI({ preview: await buildResetPreview(guildId), scope });
  const { countComponents } = await import('./utils.js');
  countComponents(ui.components, { verbosity: 'summary', label: 'Reset Safari' });
  return ui;
}

/** Result screen after a reset runs. */
export function buildResetResultUI(tally) {
  const config = RESET_SCOPES[tally.scope];
  const lines = [
    `> ⚡ **${tally.claimsCleared}** claim${tally.claimsCleared === 1 ? '' : 's'} cleared across **${tally.outcomesReset}** outcome${tally.outcomesReset === 1 ? '' : 's'}`
  ];
  if (config.deinitializes) {
    lines.push(`> 🚪 **${tally.playersRemoved}** player${tally.playersRemoved === 1 ? '' : 's'} de-initialised`);
  } else if (config.clearsPlayers) {
    lines.push(`> 🎒 **${tally.playersReset}** player${tally.playersReset === 1 ? '' : 's'} reset to **${tally.startingCurrency}** starting currency + default items`);
  }
  if (config.clearsPlayers) {
    lines.push(`> 🎲 Round state reset to round 0 · **${tally.salesCountersReset}** sales counter${tally.salesCountersReset === 1 ? '' : 's'} zeroed`);
  }
  if (tally.playersFailed > 0) {
    lines.push(`> ⚠️ **${tally.playersFailed}** player${tally.playersFailed === 1 ? '' : 's'} could not be processed — check the logs`);
  }

  const footer = config.deinitializes
    ? '-# Use **🦁 Start Safari** to place your real cast on the map.'
    : '-# Remember to review store stock levels manually — CastBot can’t restore those.';

  return {
    components: [{
      type: 17,
      accent_color: 0x2ecc71,
      components: [
        { type: 10, content: `## ✅ Safari Reset Complete\n-# ${config.emoji} ${config.label}` },
        { type: 14 },
        { type: 10, content: `${lines.join('\n')}\n\n${footer}` },
        { type: 14 },
        { type: 1, components: [BACK_BUTTON] }
      ]
    }]
  };
}

// ==================== HANDLERS ====================

/**
 * Sub-router for every Reset Safari interaction. app.js routes the whole `safari_reset*` family
 * into here with one factory config, keeping the router thin (see the Golden Rule in CLAUDE.md).
 */
export async function routeResetInteraction(context) {
  const id = context.customId || '';
  if (id === 'safari_reset_scope') return handleResetScopeSelect(context);
  if (id.startsWith('safari_reset_go:')) return handleResetGo(context);
  return handleResetSafari(context);
}

/**
 * "Reset Currency" confirm (Safari > Manage Currency). Narrower than the scopes above — it zeroes
 * every player's balance and touches nothing else. Extracted out of app.js with the Reset Safari
 * build; the load/mutate/save cycle now runs under the storage lock, which it never did inline.
 */
export async function handleCurrencyResetConfirm(context) {
  console.log('🗑️ DEBUG: Currency reset confirmed');

  const { loadPlayerData, savePlayerData, withStorageLock } = await deps();
  let playersResetCount = 0;
  let totalCurrencyReset = 0;

  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    const guildPlayers = playerData[context.guildId]?.players || {};

    for (const player of Object.values(guildPlayers)) {
      if (player.safari?.currency !== undefined) {
        totalCurrencyReset += player.safari.currency;
        player.safari.currency = 0;
        player.safari.lastInteraction = Date.now();
        playersResetCount++;
      }
    }

    if (playersResetCount > 0) await savePlayerData(playerData);
  });

  return {
    flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 + EPHEMERAL
    components: [{
      type: 17,
      accent_color: 0x27ae60,
      components: [{
        type: 10,
        content: `✅ **Currency Reset Complete!**\n\n**Players affected:** ${playersResetCount}\n**Total currency reset:** ${totalCurrencyReset} coins\n\nAll player balances have been set to 0.`
      }]
    }]
  };
}

export async function handleResetSafari(context) {
  console.log(`🔄 START: safari_reset - user ${context.userId}`);
  return buildResetUI({ guildId: context.guildId, scope: null });
}

export async function handleResetScopeSelect(context) {
  const scope = context.values?.[0] || null;
  console.log(`🔄 START: safari_reset_scope - user ${context.userId}, scope ${scope}`);
  return buildResetUI({ guildId: context.guildId, scope: RESET_SCOPES[scope] ? scope : null });
}

export async function handleResetGo(context) {
  const scope = context.customId.split(':')[1];
  console.log(`🔄 START: safari_reset_go - user ${context.userId}, scope ${scope}`);

  if (!RESET_SCOPES[scope]) {
    return {
      components: [{
        type: 17,
        accent_color: 0xed4245,
        components: [
          { type: 10, content: '## ❌ Unknown Reset Scope\n\nPlease go back and choose a reset option again.' },
          { type: 14 },
          { type: 1, components: [BACK_BUTTON] }
        ]
      }]
    };
  }

  const tally = await executeReset(context.guildId, scope, context.client);
  console.log(`🔄 SUCCESS: safari_reset_go - scope ${scope}, ${tally.claimsCleared} claims cleared`);
  return buildResetResultUI(tally);
}
