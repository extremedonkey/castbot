/**
 * 🛠️ Safari Plan Applier — applies validated Ask CastBot edit plans to live data.
 *
 * The other half of safariPlanSchema.js. The schema validates; this module mutates —
 * in-process, under the proper locks, with ONE save per file, mirroring the
 * transactional importSafariData pattern. The spawned CLI never writes anything.
 *
 * LOCK CHOREOGRAPHY (the part that must not change casually):
 *  1. Emoji sanitation + snapshots happen BEFORE any lock (Discord I/O stays outside).
 *  2. Safari cycle: withSafariLock → fresh loadSafariContent INSIDE the lock →
 *     RE-VALIDATE the plan against locked state (TOCTOU defense; drift → PlanStaleError,
 *     nothing written) → no-throw mutators → one saveSafariContent.
 *  3. Player cycle: a separate withStorageLock. NEVER call updateCurrency /
 *     self-saving addItemToInventory here — they take the lock themselves (deadlock).
 *  4. Anchor refreshes AFTER both locks (Discord calls, paced, warnings never fatal).
 *
 * The mutators replicate the mutation shapes of createItem / createStore /
 * createCustomButton / updateCustomTerms / the app.js stock inline — without their
 * load/save — and are exported for fixture-based unit tests.
 *
 * @module safariPlanApplier
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { validatePlan, SAFARI_OPS, PLAYER_OPS } from './safariPlanSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, 'backups', 'askcb-plan-snapshots'); // backups/ is gitignored + CLI-deny-listed

/** Thrown when the guild's data changed between preview and Apply. Nothing was written. */
export class PlanStaleError extends Error {
  constructor(validation) {
    super('The Safari data changed since the preview — the plan no longer applies cleanly.');
    this.name = 'PlanStaleError';
    this.validation = validation;
  }
}

// ---------------------------------------------------------------------------
// pure helpers + mutators (fixture-testable, no I/O)
// ---------------------------------------------------------------------------

/** Minimal replica of ensureGuildSafariData's structure guarantee (sync, no save). */
export function ensureGuildShape(data, guildId) {
  if (!data[guildId]) data[guildId] = {};
  const g = data[guildId];
  for (const key of ['buttons', 'safaris', 'applications', 'stores', 'items', 'enemies']) {
    if (!g[key]) g[key] = {};
  }
  if (!g.safariConfig) g.safariConfig = {};
  return g;
}

/**
 * Entity ID in the house style (slug + epoch-ms last 6, see generateButtonId in
 * safariManager.js) with a collision belt — the bare style collides when same-named
 * entities land in the same plan or ~16.7 min apart.
 */
export function makeEntityId(name, existingKeys, now = Date.now()) {
  const sanitized = String(name).toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 20) || 'entity';
  const timestamp = String(now).slice(-6);
  let candidate = `${sanitized}_${timestamp}`;
  let n = 2;
  while (existingKeys[candidate]) candidate = `${sanitized}_${timestamp}_${n++}`;
  return candidate;
}

/** Resolve a normalized reference ('$ref' or an existing id) via the apply-time refMap. */
const rid = (value, refMap) => (typeof value === 'string' && value.startsWith('$')) ? refMap[value.slice(1)] : value;

/** Deep-resolve $refs inside a normalized outcome's config (give_item / follow_up_button). */
function resolveOutcome(outcome, refMap) {
  const config = { ...outcome.config };
  if (config.itemId) config.itemId = rid(config.itemId, refMap);
  if (config.buttonId) config.buttonId = rid(config.buttonId, refMap);
  return { ...outcome, config };
}

/** Build the stored trigger shape (mirrors the app.js trigger-type switch). */
function buildTrigger(spec, { name, emoji, style }) {
  const type = spec?.type || 'button';
  const button = { label: name, emoji: emoji || null, style: style || 'Primary' };
  switch (type) {
    case 'modal':
      return { type, modal: { keywords: [], caseSensitive: false }, phrases: spec.phrases || [] };
    case 'button_modal':
      return { type, button, phrases: spec.phrases || [] };
    case 'button_input':
      return {
        type, button,
        inputLabel: spec.inputLabel || 'Your Input',
        inputPlaceholder: spec.inputPlaceholder || 'Type here...'
      };
    default:
      return { type: 'button', button };
  }
}

/**
 * Apply one validated safari-file op to the in-memory data object. NO-THROW BY
 * CONTRACT — validatePlan has already rejected everything this could choke on, and a
 * throw mid-loop would poison the shared safari cache. Returns a result line.
 */
export function applySafariOp(data, guildId, op, refMap, summary, { userId, now = Date.now() } = {}) {
  const g = data[guildId];
  const done = (line) => { summary.safariMutations++; summary.lines.push(line); return line; };

  switch (op.op) {
    case 'create_item': {
      const f = op.fields || {};
      const itemId = makeEntityId(f.name, g.items, now);
      g.items[itemId] = {
        id: itemId,
        name: f.name,
        description: f.description || '',
        emoji: f.emoji || '📦',
        category: f.category || 'General',
        basePrice: f.basePrice ?? 10,
        maxQuantity: f.maxQuantity ?? -1,
        goodOutcomeValue: f.goodOutcomeValue ?? null,
        badOutcomeValue: f.badOutcomeValue ?? null,
        attackValue: f.attackValue ?? null,
        defenseValue: f.defenseValue ?? null,
        consumable: f.consumable || 'No',
        staminaBoost: f.staminaBoost ?? 0,
        goodYieldEmoji: '☀️',
        badYieldEmoji: '☄️',
        metadata: { createdBy: userId, createdAt: now, lastModified: now, totalSold: 0, createdVia: 'askcb_edit', tags: f.tags || [] }
      };
      if (op.ref) refMap[op.ref] = itemId;
      summary.created.items++;
      return done(`🆕 Item **${f.name}** created`);
    }

    case 'update_item': {
      const itemId = rid(op.item, refMap);
      const item = g.items[itemId];
      if (!item) return done(`⚠️ Item ${itemId} vanished — skipped`);
      Object.assign(item, op.set);
      item.metadata = { ...item.metadata, lastModified: now };
      return done(`✏️ Item **${item.name}** updated (${Object.keys(op.set).join(', ')})`);
    }

    case 'create_store': {
      const f = op.fields || {};
      const storeId = makeEntityId(f.name, g.stores, now);
      g.stores[storeId] = {
        id: storeId,
        name: f.name,
        description: f.description || '',
        emoji: f.emoji || '🏪',
        items: [],
        settings: {
          storeownerText: f.storeownerText || 'Welcome to my store!',
          accentColor: f.accentColor ?? 0x2ecc71,
          requiresRole: null
        },
        metadata: { createdBy: userId, createdAt: now, lastModified: now, totalSales: 0, createdVia: 'askcb_edit' }
      };
      if (op.ref) refMap[op.ref] = storeId;
      summary.created.stores++;
      return done(`🏪 Store **${f.name}** created`);
    }

    case 'update_store': {
      const storeId = rid(op.store, refMap);
      const store = g.stores[storeId];
      if (!store) return done(`⚠️ Store ${storeId} vanished — skipped`);
      const { storeownerText, accentColor, ...top } = op.set;
      Object.assign(store, top);
      if (!store.settings) store.settings = {};
      if (storeownerText !== undefined) store.settings.storeownerText = storeownerText;
      if (accentColor !== undefined) store.settings.accentColor = accentColor;
      store.metadata = { ...store.metadata, lastModified: now };
      return done(`✏️ Store **${store.name}** updated (${Object.keys(op.set).join(', ')})`);
    }

    case 'stock_item': {
      const storeId = rid(op.store, refMap);
      const itemId = rid(op.item, refMap);
      const store = g.stores[storeId];
      const item = g.items[itemId];
      if (!store || !item) return done(`⚠️ Store or item vanished — stock skipped`);
      if (!store.items) store.items = [];
      // The engine charges item.basePrice everywhere (buyItem never reads the link
      // price — the link's price field is decorative, matching the inline app.js
      // stocking flow). An explicit plan price therefore SETS the item's price.
      if (op.price !== undefined) item.basePrice = op.price;
      const price = item.basePrice ?? 0;
      const link = { itemId, price, addedAt: now };
      if (op.stock !== undefined && op.stock >= 0) link.stock = op.stock;
      store.items.push(link);
      store.metadata = { ...store.metadata, lastModified: now };
      return done(`📦 **${item.name}** stocked in **${store.name}** @ ${price}`);
    }

    case 'set_stock': {
      const storeId = rid(op.store, refMap);
      const itemId = rid(op.item, refMap);
      const link = g.stores[storeId]?.items?.find(l => (l.itemId || l) === itemId);
      if (!link || typeof link !== 'object') return done(`⚠️ Stock entry vanished — skipped`);
      link.stock = op.stock; // -1 = unlimited (hasStock treats absent/null/-1 alike)
      return done(`📊 Stock of **${g.items[itemId]?.name || itemId}** set to ${op.stock === -1 ? 'unlimited' : op.stock}`);
    }

    case 'update_config': {
      Object.assign(g.safariConfig, op.set);
      return done(`⚙️ Settings updated: ${Object.entries(op.set).map(([k, v]) => `${k} → ${v}`).join(', ')}`);
    }

    case 'create_action': {
      const f = op.fields || {};
      const actionId = makeEntityId(f.name, g.buttons, now);
      const style = f.style || 'Primary';
      const outcomes = (op.outcomes || []).map((o, idx) => ({ ...resolveOutcome(o, refMap), order: idx }));
      // House convention: 'global' is a plan-input marker meaning "attach nowhere" —
      // it must NEVER be persisted into action.coordinates (legacy sync flows iterate
      // that array and would auto-create a phantom coordinates['global'] map cell).
      // An action with empty coordinates IS global.
      const realCoords = (op.coordinates || []).filter(c => c !== 'global');
      g.buttons[actionId] = {
        id: actionId,
        name: f.name,
        label: f.name,
        description: f.description || '',
        emoji: f.emoji || null,
        style,
        trigger: buildTrigger(op.trigger, { name: f.name, emoji: f.emoji, style }),
        conditions: (op.conditions || []).map(c => ({ ...c, itemId: c.itemId ? rid(c.itemId, refMap) : c.itemId })),
        actions: outcomes,
        coordinates: realCoords,
        metadata: { createdBy: userId, createdAt: now, lastModified: now, usageCount: 0, tags: f.tags || [], createdVia: 'askcb_edit' }
      };
      if (op.ref) refMap[op.ref] = actionId;
      attachToCoords(g, actionId, realCoords, summary);
      summary.created.actions++;
      const at = op.coordinates?.length ? ` @ ${op.coordinates.join(', ')}` : '';
      return done(`⚡ Action **${f.name}** created${at}`);
    }

    case 'update_action': {
      const actionId = rid(op.action, refMap);
      const action = g.buttons[actionId];
      if (!action) return done(`⚠️ Action ${actionId} vanished — skipped`);
      const set = op.set || {};
      if (set.name !== undefined) { action.name = set.name; action.label = set.name; }
      if (set.description !== undefined) action.description = set.description;
      if (set.emoji !== undefined) action.emoji = set.emoji;
      if (set.style !== undefined) action.style = set.style;
      if (set.tags !== undefined) action.metadata = { ...action.metadata, tags: set.tags };
      // Keep the rendered button in sync — trigger.button is what players actually see.
      if (action.trigger?.button) {
        if (set.name !== undefined) action.trigger.button.label = set.name;
        if (set.emoji !== undefined) action.trigger.button.emoji = set.emoji;
        if (set.style !== undefined) action.trigger.button.style = set.style;
      }
      action.metadata = { ...action.metadata, lastModified: now };
      queueActionAnchors(g, action, summary);
      return done(`✏️ Action **${action.name}** updated (${Object.keys(set).join(', ')})`);
    }

    case 'add_outcome': {
      const actionId = rid(op.action, refMap);
      const action = g.buttons[actionId];
      if (!action) return done(`⚠️ Action ${actionId} vanished — skipped`);
      if (!action.actions) action.actions = [];
      for (const outcome of op.outcomes || []) {
        action.actions.push({ ...resolveOutcome(outcome, refMap), order: action.actions.length });
      }
      action.metadata = { ...action.metadata, lastModified: now };
      queueActionAnchors(g, action, summary);
      return done(`➕ ${op.outcomes.map(o => o.type).join(' + ')} added to **${action.name}**`);
    }

    case 'attach_action': {
      const actionId = rid(op.action, refMap);
      const action = g.buttons[actionId];
      if (!action) return done(`⚠️ Action ${actionId} vanished — skipped`);
      if (!action.coordinates) action.coordinates = [];
      const attachCoords = (op.coordinates || []).filter(c => c !== 'global'); // 'global' is never persisted — see create_action
      for (const coord of attachCoords) {
        if (!action.coordinates.includes(coord)) action.coordinates.push(coord);
      }
      attachToCoords(g, actionId, attachCoords, summary);
      action.metadata = { ...action.metadata, lastModified: now };
      return done(`📍 **${action.name}** attached to ${attachCoords.join(', ') || 'nowhere new (global)'}`);
    }

    case 'update_map_cell': {
      const activeMapId = g.maps?.active;
      const coordData = g.maps?.[activeMapId]?.coordinates?.[op.coordinate];
      if (!coordData) return done(`⚠️ Cell ${op.coordinate} vanished — skipped`);
      if (!coordData.baseContent) coordData.baseContent = {};
      Object.assign(coordData.baseContent, op.set);
      coordData.metadata = { ...coordData.metadata, lastModified: now };
      summary.anchorCoords.add(op.coordinate);
      return done(`🗺️ Cell **${op.coordinate}** updated (${Object.keys(op.set).join(', ')})`);
    }
  }
  return null;
}

/** Bidirectional coordinate attach (coordData.buttons[] side) + anchor queue. */
function attachToCoords(g, actionId, coords, summary) {
  const activeMapId = g.maps?.active;
  if (!activeMapId) return;
  for (const coord of coords) {
    const coordData = g.maps[activeMapId]?.coordinates?.[coord];
    if (!coordData) continue;
    if (!coordData.buttons) coordData.buttons = [];
    if (!coordData.buttons.includes(actionId)) coordData.buttons.push(actionId);
    summary.anchorCoords.add(coord);
  }
}

/** Queue anchor refreshes for every real coordinate an action sits on. */
function queueActionAnchors(g, action, summary) {
  for (const coord of action.coordinates || []) {
    if (coord !== 'global') summary.anchorCoords.add(coord);
  }
}

/** Replica of initializePlayerSafari's shape (pure, minimal). */
function ensurePlayerSafari(playerData, guildId, userId, now) {
  if (!playerData[guildId]) playerData[guildId] = { players: {} };
  if (!playerData[guildId].players) playerData[guildId].players = {};
  if (!playerData[guildId].players[userId]) playerData[guildId].players[userId] = {};
  const player = playerData[guildId].players[userId];
  if (!player.safari) {
    player.safari = {
      currency: 0, history: [], lastInteraction: now, achievements: [],
      inventory: {}, cooldowns: {}, buttonUses: {}, storeHistory: []
    };
  }
  if (!player.safari.inventory) player.safari.inventory = {};
  return player.safari;
}

/**
 * Apply one validated player-file op. Same no-throw contract. `guildItems` is the
 * (already-saved) safari items map, used to mirror addItemToInventory's attack-item
 * bookkeeping (numAttacksAvailable).
 */
export function applyPlayerOp(playerData, guildId, op, refMap, summary, { guildItems = {}, now = Date.now() } = {}) {
  const done = (line) => { summary.playerMutations++; summary.lines.push(line); return line; };

  if (op.op === 'give_currency') {
    for (const playerId of op.playerIds) {
      const safari = ensurePlayerSafari(playerData, guildId, playerId, now);
      safari.currency = Math.max(0, (safari.currency || 0) + op.amount); // same floor as updateCurrency
      safari.lastInteraction = now;
    }
    return done(`🪙 ${op.amount > 0 ? '+' : ''}${op.amount} currency → ${op.playerIds.map(id => `<@${id}>`).join(', ')}`);
  }

  if (op.op === 'give_item') {
    const itemId = rid(op.item, refMap);
    const isAttackItem = guildItems[itemId]?.attackValue !== null && guildItems[itemId]?.attackValue !== undefined;
    for (const playerId of op.playerIds) {
      const safari = ensurePlayerSafari(playerData, guildId, playerId, now);
      const entry = safari.inventory[itemId];
      const base = (entry && typeof entry === 'object') ? entry : {};
      const quantity = (typeof entry === 'number' ? entry : (entry?.quantity || 0)) + op.quantity;
      safari.inventory[itemId] = {
        ...base,
        quantity,
        ...(isAttackItem ? { numAttacksAvailable: (base.numAttacksAvailable || 0) + op.quantity } : {}),
        ...(base.firstObtained ? {} : { firstObtained: now })
      };
      safari.lastInteraction = now;
    }
    return done(`🎁 ${op.quantity}× **${guildItems[itemId]?.name || itemId}** → ${op.playerIds.map(id => `<@${id}>`).join(', ')}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// emoji sanitation (async, CPU-only)
// ---------------------------------------------------------------------------

// Every place a RAW plan carries an emoji: top-level `emoji` on create_item /
// create_store / create_action, `set.emoji` on updates, and the config emoji keys.
// (The validator reads raw.emoji into op.fields — but sanitation runs on the RAW plan,
// so it must cover the top-level spelling, not the normalized one.)
const EMOJI_SITES = [
  [null, 'emoji'],
  ['set', 'emoji'],
  ['set', 'currencyEmoji'], ['set', 'inventoryEmoji'], ['set', 'craftingEmoji']
];

/**
 * Validate every emoji field in a raw plan via createSafeEmoji; invalid emojis are
 * dropped with a warning rather than failing the plan (matching quick-create UX).
 * This is also a defense line: an "emoji" of `@everyone` or `<@&id>` never becomes
 * a persisted entity emoji rendered by the bot. Returns a deep copy.
 */
export async function sanitizePlanEmojis(plan) {
  const warnings = [];
  const clean = JSON.parse(JSON.stringify(plan));
  let createSafeEmoji;
  try {
    ({ createSafeEmoji } = await import('./safariButtonHelper.js'));
  } catch {
    return { plan: clean, warnings }; // helper unavailable → let raw strings through
  }
  for (const op of clean.ops || []) {
    if (!op || typeof op !== 'object') continue;
    for (const [container, field] of EMOJI_SITES) {
      const holder = container === null ? op : op[container];
      if (!holder || typeof holder !== 'object' || holder[field] === undefined || holder[field] === null) continue;
      const validated = await createSafeEmoji(holder[field]).catch(() => undefined);
      if (!validated) {
        warnings.push(`"${String(holder[field]).substring(0, 40)}" isn't a usable emoji — dropped (a default will be used).`);
        delete holder[field];
      }
    }
  }
  return { plan: clean, warnings };
}

// ---------------------------------------------------------------------------
// the apply engine
// ---------------------------------------------------------------------------

function newSummary() {
  return {
    lines: [],
    created: { items: 0, stores: 0, actions: 0 },
    safariMutations: 0,
    playerMutations: 0,
    warnings: [],
    anchorCoords: new Set(),
    anchorsRefreshed: 0,
    snapshot: null
  };
}

/** Local timestamped snapshots into backups/ (gitignored + CLI-denied) + Discord backup. */
async function snapshotBeforeApply(guildId, includePlayerData, client, summary) {
  const stamp = Date.now();
  try {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fs.copyFile(path.join(__dirname, 'safariContent.json'), path.join(SNAPSHOT_DIR, `safariContent-${stamp}.json`)).catch(() => {});
    if (includePlayerData) {
      await fs.copyFile(path.join(__dirname, 'playerData.json'), path.join(SNAPSHOT_DIR, `playerData-${stamp}.json`)).catch(() => {});
    }
    summary.snapshot = stamp;
  } catch (error) {
    summary.warnings.push(`Local snapshot failed (${error.message}) — continuing.`);
  }
  // Off-box copy too: cheap insurance, best-effort, never blocks the apply on failure.
  if (client) {
    try {
      const { getBackupService } = await import('./src/monitoring/backupService.js');
      await getBackupService(client).runBackup('askcb-pre-edit');
    } catch (error) {
      summary.warnings.push('Discord backup before apply failed — local snapshot still taken.');
    }
  }
}

/** Post-lock anchor refreshes, paced to stay clear of rate limits. Never throws —
 * a refresh problem after data committed must not masquerade as a failed apply. */
async function refreshAnchors(guildId, coords, client, summary) {
  if (!coords.length || !client) return;
  let updateAnchorMessage;
  try {
    ({ updateAnchorMessage } = await import('./mapCellUpdater.js'));
  } catch (error) {
    summary.warnings.push(`Location cards couldn't be refreshed (${error.message}) — refresh them from Tools when convenient.`);
    return;
  }
  for (const coord of coords) {
    try {
      await updateAnchorMessage(guildId, coord, client);
      summary.anchorsRefreshed++;
    } catch (error) {
      summary.warnings.push(`Location card ${coord} couldn't be refreshed (${error.message}).`);
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
}

/** Audit: archive the raw plan to the guild's storage channel + analytics log. Best-effort. */
async function auditPlanApply(guildId, plan, summary, { userId, client }) {
  try {
    const { logInteraction } = await import('./src/analytics/analyticsLogger.js');
    logInteraction(userId, guildId, 'ASKCB_EDIT_APPLY',
      `${summary.safariMutations + summary.playerMutations} ops applied`, null, null, null, null, null, null);
  } catch { /* analytics is never fatal */ }
  if (!client) return;
  try {
    const guild = await client.guilds.fetch(guildId);
    const { findImageStorageChannel } = await import('./src/images/imageStorageChannel.js');
    const channel = findImageStorageChannel(guild, { extraNames: ['safari-storage'] });
    if (!channel) return;
    const buffer = Buffer.from(JSON.stringify(plan, null, 2), 'utf-8');
    await channel.send({
      content: `🛠️ **Ask CastBot edit applied** by <@${userId}> — ${summary.safariMutations + summary.playerMutations} changes (plan archived below)`,
      files: [{ attachment: buffer, name: `askcb-edit-${guildId}-${Date.now()}.json` }],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.log(`ℹ️ Ask CastBot plan archive skipped: ${error.message}`);
  }
}

/**
 * Apply a raw (unnormalized) plan to a guild. Validates inside the lock; throws
 * PlanStaleError (nothing written) when the data drifted since preview.
 *
 * @param {string} guildId
 * @param {Object} plan - the RAW plan as extracted from the CLI output
 * @param {{userId: string, client: Object}} context
 * @returns {Promise<{ok: true, summary: Object, refMap: Object}>}
 */
export async function applyPlan(guildId, plan, { userId, client }) {
  const summary = newSummary();

  // 1. Emoji sanitation (CPU-only, but async → outside the lock).
  const { plan: cleanPlan, warnings: emojiWarnings } = await sanitizePlanEmojis(plan);
  summary.warnings.push(...emojiWarnings);

  const hasPlayerOps = (cleanPlan.ops || []).some(o => PLAYER_OPS.includes(o?.op));

  // 2. Snapshots (Discord I/O → before the lock).
  await snapshotBeforeApply(guildId, hasPlayerOps, client, summary);

  const storage = await import('./storage.js');
  const sm = await import('./safariManager.js');

  // 3. SAFARI CYCLE — one lock, one save.
  let normalizedOps = [];
  const refMap = Object.create(null); // null-proto: a ref could never alias __proto__ etc.
  let guildItemsAfter = {};
  await storage.withSafariLock(async () => {
    const data = await sm.loadSafariContent(); // fresh — the lock dropped the cache
    const validation = validatePlan(cleanPlan, data[guildId] || null, null);
    if (!validation.ok) throw new PlanStaleError(validation);
    normalizedOps = validation.ops;
    summary.warnings.push(...validation.warnings);
    ensureGuildShape(data, guildId);
    try {
      for (const op of normalizedOps) {
        if (!SAFARI_OPS.includes(op.op)) continue;
        applySafariOp(data, guildId, op, refMap, summary, { userId });
      }
      if (summary.safariMutations > 0) await sm.saveSafariContent(data);
      guildItemsAfter = data[guildId]?.items || {};
    } catch (error) {
      // A throw mid-mutation means the shared cached object holds half a plan —
      // drop the cache so the next reader loads clean disk state (incident 07 rule).
      try { sm.clearSafariCache(); } catch { /* best effort */ }
      // Nothing reached disk (the single save failed or never ran) — zero the record
      // so the error screen can say so honestly instead of listing phantom changes.
      summary.lines = [];
      summary.safariMutations = 0;
      summary.created = { items: 0, stores: 0, actions: 0 };
      summary.anchorCoords.clear();
      error.summary = summary;
      throw error;
    }
  });

  // From here on, safari data IS committed — any failure below must surface the
  // partial record (error.summary) and still write the audit trail.
  try {
    // 4. PLAYER CYCLE — separate lock, separate save. Item IDs from step 3 are already
    //    committed, so a failure here leaves consistent safari data (reported honestly).
    const playerOps = normalizedOps.filter(op => PLAYER_OPS.includes(op.op));
    if (playerOps.length) {
      await storage.withStorageLock(async () => {
        const playerData = await storage.loadPlayerData();
        try {
          for (const op of playerOps) {
            applyPlayerOp(playerData, guildId, op, refMap, summary, { guildItems: guildItemsAfter });
          }
          await storage.savePlayerData(playerData);
        } catch (error) {
          try { storage.clearRequestCache(); } catch { /* best effort */ }
          // The player save never landed — strip the player lines from the record.
          summary.lines = summary.lines.slice(0, summary.lines.length - summary.playerMutations);
          summary.playerMutations = 0;
          throw error;
        }
      });
    }

    // 5. Post-lock Discord side effects (refreshAnchors never throws).
    await refreshAnchors(guildId, [...summary.anchorCoords], client, summary);

    // 6. Audit trail.
    await auditPlanApply(guildId, cleanPlan, summary, { userId, client });
  } catch (error) {
    error.summary = summary;
    // Live data changed — the audit trail must exist even though the apply failed.
    try { await auditPlanApply(guildId, cleanPlan, summary, { userId, client }); } catch { /* best effort */ }
    throw error;
  }

  console.log(`🛠️ Ask CastBot edit applied for guild ${guildId}: ${summary.safariMutations} safari + ${summary.playerMutations} player mutations, ${summary.anchorsRefreshed} anchors refreshed`);
  return { ok: true, summary, refMap };
}
