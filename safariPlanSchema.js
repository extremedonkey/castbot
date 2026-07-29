/**
 * 🛠️ Safari Plan Schema — validation for LLM-proposed Safari mutation plans.
 *
 * Ask CastBot's Edit mode has the Claude CLI emit a JSON "plan" (a list of ops) instead
 * of touching files — the CLI has no write tools, and an out-of-process write would be
 * silently clobbered by the bot's own cache/save cycles (see docs/incidents/05 + 07).
 * This module is the security boundary: every field of every op is validated here
 * against the real guild data BEFORE preview, and AGAIN inside the safari lock at apply
 * time (TOCTOU defense). The applier (safariPlanApplier.js) trusts validated ops and is
 * no-throw by contract.
 *
 * PURE ON PURPOSE: no I/O, no imports beyond limit constants — fully unit-testable
 * (tests/safariPlanSchema.test.js) and safe to run inside withSafariLock.
 *
 * REF SEMANTICS (dependency mapping): a create op may declare `"ref": "pokestore"`;
 * later ops reference `"$pokestore"`. Refs must be declared BEFORE use. Plain strings
 * resolve against EXISTING entities: exact ID first, else unique case-insensitive name.
 * No silent auto-create — a missing dependency is a validation error telling the model
 * to emit the create op explicitly, so the human preview is honest.
 *
 * @module safariPlanSchema
 */

import { SAFARI_LIMITS } from './config/safariLimits.js';

export const PLAN_VERSION = 1;
export const MAX_OPS_PER_PLAN = 60;

/** Ops that mutate safariContent.json (applied in the withSafariLock cycle). */
export const SAFARI_OPS = [
  'create_item', 'update_item', 'create_store', 'update_store',
  'stock_item', 'set_stock', 'update_config',
  'create_action', 'create_recipe', 'update_action', 'add_outcome', 'attach_action',
  'update_map_cell'
];

/** Where an action shows up outside the map. Mirrors the Action Editor's select. */
export const MENU_VISIBILITY = ['none', 'crafting_menu', 'player_menu'];

/** Ops that mutate playerData.json (applied in a separate withStorageLock cycle). */
export const PLAYER_OPS = ['give_currency', 'give_item'];

export const OUTCOME_TYPES = ['display_text', 'give_currency', 'give_item', 'give_role', 'remove_role', 'follow_up_button'];
export const TRIGGER_TYPES = ['button', 'modal', 'button_modal', 'button_input'];
export const CONDITION_TYPES = ['currency', 'item', 'role'];
export const BUTTON_STYLES = ['Primary', 'Secondary', 'Success', 'Danger'];

const COORD_RE = /^[A-Z][0-9]{1,2}$/;
const SNOWFLAKE_RE = /^\d{17,20}$/;
const REF_NAME_RE = /^[a-z0-9_-]{1,32}$/;
// Names that alias Object.prototype members — as a ref they'd poison the refMap; as a
// plain-string lookup they'd resolve THROUGH the prototype chain (g.items['__proto__']
// is truthy!) and update_item would Object.assign onto Object.prototype. Hard-reject.
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// display_text accent colors per button style — mirrors quickActionCreate's map.
const STYLE_TO_ACCENT_COLOR = { Primary: '3498db', Secondary: '95a5a6', Success: '2ecc71', Danger: 'e74c3c' };

/**
 * Validate a raw plan against a guild's current Safari data.
 *
 * @param {Object} plan - parsed JSON from the CLI ({version, summary, ops})
 * @param {Object|null} guildSafari - safariData[guildId] (null = no safari data yet)
 * @param {Object|null} [guildPlayers] - playerData[guildId].players (warnings only)
 * @returns {{ok: boolean, errors: Array<{opIndex: number, message: string}>,
 *            warnings: string[], ops: Array<Object>}} normalized ops (only meaningful when ok)
 */
export function validatePlan(plan, guildSafari, guildPlayers = null) {
  const errors = [];
  const warnings = [];
  const err = (opIndex, message) => errors.push({ opIndex, message });

  // --- envelope ---
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, errors: [{ opIndex: -1, message: 'Plan must be a JSON object with an "ops" array.' }], warnings, ops: [] };
  }
  if (plan.version !== undefined && plan.version !== PLAN_VERSION) {
    warnings.push(`Plan version ${plan.version} (expected ${PLAN_VERSION}) — validating anyway.`);
  }
  if (!Array.isArray(plan.ops) || plan.ops.length === 0) {
    return { ok: false, errors: [{ opIndex: -1, message: 'Plan has no ops.' }], warnings, ops: [] };
  }
  if (plan.ops.length > MAX_OPS_PER_PLAN) {
    return { ok: false, errors: [{ opIndex: -1, message: `Plan has ${plan.ops.length} ops — the maximum is ${MAX_OPS_PER_PLAN}. Split the request.` }], warnings, ops: [] };
  }

  // --- indexes over existing guild data ---
  const g = guildSafari || {};
  const existing = {
    item: indexEntities(g.items, e => e?.name),
    store: indexEntities(g.stores, e => e?.name),
    action: indexEntities(g.buttons, e => e?.name || e?.label)
  };
  const activeMapId = g.maps?.active;
  const mapCoords = activeMapId ? new Set(Object.keys(g.maps?.[activeMapId]?.coordinates || {})) : null;

  // --- running projections (existing counts + in-plan creates) ---
  const counts = {
    item: Object.keys(g.items || {}).length,
    store: Object.keys(g.stores || {}).length,
    action: Object.keys(g.buttons || {}).length
  };
  // per-store stocked-item projection: storeKey ('$ref' or id) → Set of item keys
  const storeStock = new Map();
  const stockSetFor = (storeKey) => {
    if (!storeStock.has(storeKey)) {
      const set = new Set();
      const store = g.stores?.[storeKey];
      for (const link of (store?.items || [])) set.add(link.itemId || link);
      storeStock.set(storeKey, set);
    }
    return storeStock.get(storeKey);
  };
  // per-action outcome-count projection: actionKey → count
  const outcomeCounts = new Map();
  const outcomeCountFor = (actionKey) => {
    if (!outcomeCounts.has(actionKey)) {
      outcomeCounts.set(actionKey, g.buttons?.[actionKey]?.actions?.length || 0);
    }
    return outcomeCounts.get(actionKey);
  };
  // in-plan created names, for duplicate detection: kind → Set of lowercased names
  const plannedNames = { item: new Set(), store: new Set(), action: new Set() };

  // --- ref tracking ---
  const declaredRefs = new Map(); // ref → kind

  /**
   * Resolve an entity reference field to a normalized value: '$ref' (kept for the
   * applier's refMap) or an existing entity ID. Pushes an error and returns null on
   * failure.
   */
  const resolveRef = (value, kind, opIndex, fieldName) => {
    if (typeof value !== 'string' || !value.trim()) {
      err(opIndex, `"${fieldName}" must name a ${kind} (an ID, a unique name, or a "$ref").`);
      return null;
    }
    const v = value.trim();
    if (RESERVED_KEYS.has(v) || RESERVED_KEYS.has(v.toLowerCase())) {
      err(opIndex, `"${v}" is not a usable ${kind} name.`);
      return null;
    }
    if (v.startsWith('$')) {
      const ref = v.slice(1);
      const declaredKind = declaredRefs.get(ref);
      if (!declaredKind) {
        err(opIndex, `"$${ref}" is not declared by any earlier op — declare "ref": "${ref}" on the create op FIRST (refs must appear before use).`);
        return null;
      }
      if (declaredKind !== kind) {
        err(opIndex, `"$${ref}" is a ${declaredKind}, but "${fieldName}" needs a ${kind}.`);
        return null;
      }
      return v;
    }
    const idx = existing[kind];
    if (Object.hasOwn(idx.byId, v)) return v; // hasOwn: never resolve through the prototype chain
    const matches = idx.byName.get(v.toLowerCase()) || [];
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      err(opIndex, `${kind} name "${v}" is ambiguous (${matches.join(', ')}) — use the exact ID.`);
      return null;
    }
    err(opIndex, `No ${kind} named "${v}" exists — create it first (with a "ref" you then reference as "$...").`);
    return null;
  };

  const normalized = [];

  for (let i = 0; i < plan.ops.length; i++) {
    const raw = plan.ops[i];
    if (!raw || typeof raw !== 'object' || typeof raw.op !== 'string') {
      err(i, 'Each op must be an object with an "op" type field.');
      continue;
    }
    const opType = raw.op;
    if (!SAFARI_OPS.includes(opType) && !PLAYER_OPS.includes(opType)) {
      err(i, `Unknown op type "${opType}".`);
      continue;
    }
    const op = { op: opType };

    // ref declaration (creates only)
    if (raw.ref !== undefined) {
      const kind = { create_item: 'item', create_store: 'store', create_action: 'action' }[opType];
      if (!kind) {
        err(i, `"ref" may only be declared on create_item / create_store / create_action ops.`);
      } else if (typeof raw.ref !== 'string' || !REF_NAME_RE.test(raw.ref) || RESERVED_KEYS.has(raw.ref)) {
        err(i, `"ref" must match ${REF_NAME_RE} (short lowercase slug).`);
      } else if (declaredRefs.has(raw.ref)) {
        err(i, `"ref": "${raw.ref}" is declared twice — refs must be unique within the plan.`);
      } else {
        declaredRefs.set(raw.ref, kind);
        op.ref = raw.ref;
      }
    }

    switch (opType) {
      case 'create_item': {
        op.fields = validateItemFields(raw, i, err, { requireName: true });
        if (op.fields?.name) {
          const lower = op.fields.name.toLowerCase();
          if (existing.item.byName.has(lower) || plannedNames.item.has(lower)) {
            err(i, `An item named "${op.fields.name}" already exists — use update_item, or pick another name.`);
          }
          plannedNames.item.add(lower);
        }
        counts.item++;
        if (counts.item > SAFARI_LIMITS.MAX_ITEMS_PER_GUILD) {
          err(i, `Guild item limit reached (${SAFARI_LIMITS.MAX_ITEMS_PER_GUILD}).`);
        }
        break;
      }

      case 'update_item': {
        op.item = resolveRef(raw.item, 'item', i, 'item');
        op.set = validateItemFields(raw.set, i, err, { requireName: false });
        if (!raw.set || typeof raw.set !== 'object' || Object.keys(op.set || {}).length === 0) {
          err(i, 'update_item needs a non-empty "set" object.');
        }
        break;
      }

      case 'create_store': {
        op.fields = validateStoreFields(raw, i, err, { requireName: true });
        if (op.fields?.name) {
          const lower = op.fields.name.toLowerCase();
          if (existing.store.byName.has(lower) || plannedNames.store.has(lower)) {
            err(i, `A store named "${op.fields.name}" already exists.`);
          }
          plannedNames.store.add(lower);
        }
        counts.store++;
        if (counts.store > SAFARI_LIMITS.MAX_STORES_PER_GUILD) {
          err(i, `Guild store limit reached (${SAFARI_LIMITS.MAX_STORES_PER_GUILD}).`);
        }
        if (op.ref) stockSetFor(`$${op.ref}`); // seed empty projection for in-plan stocking
        break;
      }

      case 'update_store': {
        op.store = resolveRef(raw.store, 'store', i, 'store');
        op.set = validateStoreFields(raw.set, i, err, { requireName: false });
        if (!raw.set || typeof raw.set !== 'object' || Object.keys(op.set || {}).length === 0) {
          err(i, 'update_store needs a non-empty "set" object.');
        }
        break;
      }

      case 'stock_item': {
        op.store = resolveRef(raw.store, 'store', i, 'store');
        op.item = resolveRef(raw.item, 'item', i, 'item');
        // The game engine charges item.basePrice everywhere — a per-store price does not
        // exist (buyItem reads the item, not the store link). An explicit price here
        // therefore SETS the item's price, and we warn when that changes an existing one.
        if (raw.price !== undefined) {
          op.price = intIn(raw.price, 0, SAFARI_LIMITS.MAX_CURRENCY_CHANGE);
          if (op.price === null) err(i, `stock_item "price" must be an integer 0–${SAFARI_LIMITS.MAX_CURRENCY_CHANGE}.`);
          else if (op.item && !op.item.startsWith('$')) {
            const existingItem = existing.item.byId[op.item];
            if (existingItem && existingItem.basePrice !== undefined && existingItem.basePrice !== op.price) {
              warnings.push(`Op ${i + 1} changes **${existingItem.name}**'s price ${existingItem.basePrice} → ${op.price} everywhere it's sold (the game charges the item's price, not a per-store price).`);
            }
          }
        }
        if (raw.stock !== undefined) {
          op.stock = intIn(raw.stock, -1, 999999);
          if (op.stock === null) err(i, 'stock_item "stock" must be an integer ≥ -1 (-1 = unlimited).');
        }
        if (op.store && op.item) {
          const set = stockSetFor(op.store);
          if (set.has(op.item)) err(i, `That item is already stocked in that store.`);
          else if (set.size >= SAFARI_LIMITS.MAX_ITEMS_PER_STORE) {
            err(i, `Store is full (${SAFARI_LIMITS.MAX_ITEMS_PER_STORE} items max).`);
          } else set.add(op.item);
        }
        break;
      }

      case 'set_stock': {
        op.store = resolveRef(raw.store, 'store', i, 'store');
        op.item = resolveRef(raw.item, 'item', i, 'item');
        op.stock = intIn(raw.stock, -1, 999999);
        if (op.stock === null) err(i, 'set_stock "stock" must be an integer ≥ -1 (-1 = unlimited).');
        if (op.store && op.item && !stockSetFor(op.store).has(op.item)) {
          err(i, `That item is not stocked in that store — stock_item it first.`);
        }
        break;
      }

      case 'update_config': {
        op.set = validateConfigFields(raw.set, i, err, mapCoords);
        break;
      }

      case 'create_recipe': {
        // Sugar for the real crafting shape (quickActionCreate.buildCraftingLogic): an
        // Action with "has item" conditions and remove/remove/give outcomes, surfaced in
        // the Crafting menu. Recipes are NOT a separate entity type in CastBot.
        op.fields = validateActionShell(raw, i, err);
        op.inputs = [];
        const rawInputs = Array.isArray(raw.inputs) ? raw.inputs : [];
        if (rawInputs.length < 1 || rawInputs.length > 3) {
          err(i, 'create_recipe needs "inputs": 1–3 items consumed by the craft.');
        }
        for (const input of rawInputs) {
          const isObject = input && typeof input === 'object';
          const itemId = resolveRef(isObject ? input.item : input, 'item', i, 'recipe input');
          if (!itemId) continue;
          const quantity = intIn(isObject ? (input.quantity ?? 1) : 1, 1, 99);
          if (quantity === null) { err(i, 'Recipe input "quantity" must be 1–99.'); continue; }
          op.inputs.push({ itemId, quantity });
        }
        op.output = { itemId: resolveRef(raw.output?.item ?? raw.output, 'item', i, 'recipe output'), quantity: intIn(raw.output?.quantity ?? 1, 1, 99) ?? 1 };
        if (!op.output.itemId) err(i, 'create_recipe needs "output": the item the craft produces.');
        // Same input twice must merge, or the remove outcomes fight each other.
        const seen = new Map();
        for (const input of op.inputs) seen.set(input.itemId, (seen.get(input.itemId) || 0) + input.quantity);
        op.inputs = [...seen].map(([itemId, quantity]) => ({ itemId, quantity }));
        // conditions + 1 remove per input + 1 give must stay inside the outcome cap.
        if (op.inputs.length + 1 > SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON) {
          err(i, `A recipe with ${op.inputs.length} inputs needs ${op.inputs.length + 1} outcomes (max ${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON}).`);
        }
        op.coordinates = validateCoordinates(raw.coordinates, i, err, mapCoords, { allowEmpty: true });
        counts.action++;
        if (counts.action > SAFARI_LIMITS.MAX_BUTTONS_PER_GUILD) {
          err(i, `Guild action limit reached (${SAFARI_LIMITS.MAX_BUTTONS_PER_GUILD}).`);
        }
        break;
      }

      case 'create_action': {
        op.fields = validateActionShell(raw, i, err);
        if (op.fields?.name) plannedNames.action.add(op.fields.name.toLowerCase());
        op.trigger = validateTrigger(raw.trigger, i, err);
        op.conditions = validateConditions(raw.conditions, i, err, resolveRef);
        op.coordinates = validateCoordinates(raw.coordinates, i, err, mapCoords, { allowEmpty: true });
        op.outcomes = validateOutcomes(raw.outcomes, i, err, warnings, resolveRef, 0);
        counts.action++;
        if (counts.action > SAFARI_LIMITS.MAX_BUTTONS_PER_GUILD) {
          err(i, `Guild action limit reached (${SAFARI_LIMITS.MAX_BUTTONS_PER_GUILD}).`);
        }
        if (op.ref) outcomeCounts.set(`$${op.ref}`, op.outcomes?.length || 0);
        break;
      }

      case 'update_action': {
        op.action = resolveRef(raw.action, 'action', i, 'action');
        op.set = validateActionShell(raw.set, i, err, { partial: true });
        if (!raw.set || typeof raw.set !== 'object' || Object.keys(op.set || {}).length === 0) {
          err(i, 'update_action needs a non-empty "set" object (name, emoji, style, description, tags).');
        }
        break;
      }

      case 'add_outcome': {
        op.action = resolveRef(raw.action, 'action', i, 'action');
        const validated = validateOutcomes(raw.outcome ? [raw.outcome] : raw.outcomes, i, err, warnings, resolveRef, 0);
        op.outcomes = validated;
        if (op.action && validated.length) {
          const current = outcomeCountFor(op.action);
          if (current + validated.length > SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON) {
            err(i, `Action would exceed ${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON} outcomes (has ${current}).`);
          } else {
            outcomeCounts.set(op.action, current + validated.length);
          }
        }
        if (!validated.length) err(i, 'add_outcome needs an "outcome" object.');
        break;
      }

      case 'attach_action': {
        op.action = resolveRef(raw.action, 'action', i, 'action');
        op.coordinates = validateCoordinates(raw.coordinates, i, err, mapCoords, { allowEmpty: false });
        break;
      }

      case 'update_map_cell': {
        if (!mapCoords) {
          err(i, 'This guild has no active map — update_map_cell is unavailable.');
          break;
        }
        const coord = String(raw.coordinate || '').toUpperCase().trim();
        if (!COORD_RE.test(coord) || !mapCoords.has(coord)) {
          err(i, `"${raw.coordinate}" is not a coordinate on the active map.`);
          break;
        }
        op.coordinate = coord;
        op.set = {};
        const set = raw.set || {};
        if (set.title !== undefined) {
          if (!strIn(set.title, 1, SAFARI_LIMITS.MAX_ACTION_TITLE_LENGTH)) err(i, `Cell title must be 1–${SAFARI_LIMITS.MAX_ACTION_TITLE_LENGTH} chars.`);
          else op.set.title = set.title.trim();
        }
        if (set.description !== undefined) {
          if (!strIn(set.description, 1, 1000)) err(i, 'Cell description must be 1–1000 chars.');
          else op.set.description = set.description.trim();
        }
        if (Object.keys(op.set).length === 0) err(i, 'update_map_cell needs "set" with title and/or description.');
        break;
      }

      case 'give_currency': {
        op.playerIds = validatePlayerIds(raw.playerId ?? raw.playerIds, i, err);
        op.amount = intIn(raw.amount, SAFARI_LIMITS.MIN_CURRENCY_CHANGE, SAFARI_LIMITS.MAX_CURRENCY_CHANGE);
        if (op.amount === null || op.amount === 0) err(i, `give_currency "amount" must be a non-zero integer within ±${SAFARI_LIMITS.MAX_CURRENCY_CHANGE}.`);
        warnUnknownPlayers(op.playerIds, guildPlayers, warnings);
        break;
      }

      case 'give_item': {
        op.playerIds = validatePlayerIds(raw.playerId ?? raw.playerIds, i, err);
        op.item = resolveRef(raw.item, 'item', i, 'item');
        op.quantity = intIn(raw.quantity ?? 1, 1, 99);
        if (op.quantity === null) err(i, 'give_item "quantity" must be an integer 1–99.');
        warnUnknownPlayers(op.playerIds, guildPlayers, warnings);
        break;
      }
    }

    normalized.push(op);
  }

  return { ok: errors.length === 0, errors, warnings, ops: normalized };
}

// ---------------------------------------------------------------------------
// field validators (module-private, exercised through validatePlan)
// ---------------------------------------------------------------------------

function indexEntities(map, nameOf) {
  const byId = map || {};
  const byName = new Map();
  for (const [id, entity] of Object.entries(byId)) {
    const name = nameOf(entity);
    if (!name) continue;
    const lower = String(name).toLowerCase();
    if (!byName.has(lower)) byName.set(lower, []);
    byName.get(lower).push(id);
  }
  return { byId, byName };
}

function intIn(value, min, max) {
  const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? parseInt(value, 10) : value;
  return (Number.isInteger(n) && n >= min && n <= max) ? n : null;
}

function strIn(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

/** Emoji fields: length-checked here; the applier sanitizes via createSafeEmoji (invalid → dropped with a warning, matching quick-create UX). */
function emojiOk(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= 100);
}

function validateItemFields(src, opIndex, err, { requireName }) {
  if (!src || typeof src !== 'object') { if (requireName) err(opIndex, 'create_item needs item fields.'); return null; }
  const out = {};
  if (src.name !== undefined || requireName) {
    if (!strIn(src.name, 1, SAFARI_LIMITS.MAX_ITEM_NAME_LENGTH)) err(opIndex, `Item "name" must be 1–${SAFARI_LIMITS.MAX_ITEM_NAME_LENGTH} chars.`);
    else out.name = src.name.trim();
  }
  if (src.description !== undefined) {
    if (!strIn(src.description, 0, SAFARI_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH) && src.description !== '') err(opIndex, `Item "description" max ${SAFARI_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH} chars.`);
    else out.description = String(src.description).trim();
  }
  if (src.emoji !== undefined) {
    if (!emojiOk(src.emoji)) err(opIndex, 'Item "emoji" is too long.');
    else out.emoji = src.emoji;
  }
  if (src.category !== undefined) {
    if (!strIn(src.category, 1, 30)) err(opIndex, 'Item "category" must be 1–30 chars.');
    else out.category = src.category.trim();
  }
  const numeric = [
    ['basePrice', 0, SAFARI_LIMITS.MAX_CURRENCY_CHANGE],
    ['maxQuantity', -1, 999999],
    ['staminaBoost', 0, 10],
    ['attackValue', 0, 999],
    ['defenseValue', 0, 999],
    ['goodOutcomeValue', -999, 999],
    ['badOutcomeValue', -999, 999]
  ];
  for (const [field, min, max] of numeric) {
    if (src[field] === undefined || src[field] === null) continue;
    const v = intIn(src[field], min, max);
    if (v === null) err(opIndex, `Item "${field}" must be an integer ${min}–${max}.`);
    else out[field] = v;
  }
  if (src.consumable !== undefined) {
    if (src.consumable !== 'Yes' && src.consumable !== 'No') err(opIndex, `Item "consumable" must be "Yes" or "No".`);
    else out.consumable = src.consumable;
  }
  if (src.tags !== undefined) {
    if (!Array.isArray(src.tags) || src.tags.length > SAFARI_LIMITS.MAX_TAGS_PER_ITEM
        || src.tags.some(t => !strIn(t, 1, SAFARI_LIMITS.MAX_TAG_LENGTH))) {
      err(opIndex, `Item "tags" must be up to ${SAFARI_LIMITS.MAX_TAGS_PER_ITEM} strings of ≤${SAFARI_LIMITS.MAX_TAG_LENGTH} chars.`);
    } else out.tags = src.tags.map(t => t.trim());
  }
  return out;
}

function validateStoreFields(src, opIndex, err, { requireName }) {
  if (!src || typeof src !== 'object') { if (requireName) err(opIndex, 'create_store needs store fields.'); return null; }
  const out = {};
  if (src.name !== undefined || requireName) {
    if (!strIn(src.name, 1, SAFARI_LIMITS.MAX_STORE_NAME_LENGTH)) err(opIndex, `Store "name" must be 1–${SAFARI_LIMITS.MAX_STORE_NAME_LENGTH} chars.`);
    else out.name = src.name.trim();
  }
  if (src.description !== undefined) out.description = String(src.description).substring(0, 500);
  if (src.emoji !== undefined) {
    if (!emojiOk(src.emoji)) err(opIndex, 'Store "emoji" is too long.');
    else out.emoji = src.emoji;
  }
  if (src.storeownerText !== undefined) {
    if (!strIn(src.storeownerText, 0, SAFARI_LIMITS.MAX_STOREOWNER_TEXT_LENGTH) && src.storeownerText !== '') {
      err(opIndex, `Store "storeownerText" max ${SAFARI_LIMITS.MAX_STOREOWNER_TEXT_LENGTH} chars.`);
    } else out.storeownerText = String(src.storeownerText);
  }
  if (src.accentColor !== undefined) {
    const v = intIn(src.accentColor, 0, 0xFFFFFF);
    if (v === null) err(opIndex, 'Store "accentColor" must be an integer color (0–16777215).');
    else out.accentColor = v;
  }
  return out;
}

const CONFIG_FIELDS = {
  currencyName: v => strIn(v, 1, 30),
  currencyEmoji: v => emojiOk(v) && v,
  inventoryName: v => strIn(v, 1, 30),
  inventoryEmoji: v => emojiOk(v) && v,
  craftingName: v => strIn(v, 1, 30),
  craftingEmoji: v => emojiOk(v) && v,
  defaultStartingCurrencyValue: v => intIn(v, 0, 100000) !== null,
  defaultStartingCoordinate: v => typeof v === 'string' && COORD_RE.test(v.toUpperCase().trim())
};

function validateConfigFields(set, opIndex, err, mapCoords) {
  if (!set || typeof set !== 'object' || Object.keys(set).length === 0) {
    err(opIndex, `update_config needs "set" with at least one of: ${Object.keys(CONFIG_FIELDS).join(', ')}.`);
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(set)) {
    const check = CONFIG_FIELDS[key];
    if (!check) { err(opIndex, `update_config cannot change "${key}" — allowed: ${Object.keys(CONFIG_FIELDS).join(', ')}.`); continue; }
    if (!check(value)) { err(opIndex, `update_config "${key}" value is invalid.`); continue; }
    if (key === 'defaultStartingCurrencyValue') out[key] = intIn(value, 0, 100000);
    else if (key === 'defaultStartingCoordinate') {
      const coord = value.toUpperCase().trim();
      if (mapCoords && !mapCoords.has(coord)) { err(opIndex, `Starting coordinate ${coord} is not on the active map.`); continue; }
      out[key] = coord;
    }
    else out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

function validateActionShell(src, opIndex, err, { partial = false } = {}) {
  if (!src || typeof src !== 'object') { if (!partial) err(opIndex, 'create_action needs action fields.'); return null; }
  const out = {};
  if (src.name !== undefined || !partial) {
    if (!strIn(src.name, 1, SAFARI_LIMITS.MAX_BUTTON_LABEL_LENGTH)) err(opIndex, `Action "name" must be 1–${SAFARI_LIMITS.MAX_BUTTON_LABEL_LENGTH} chars.`);
    else out.name = src.name.trim();
  }
  if (src.description !== undefined) {
    if (!strIn(src.description, 0, 200) && src.description !== '') err(opIndex, 'Action "description" max 200 chars.');
    else out.description = String(src.description);
  }
  if (src.emoji !== undefined) {
    if (!emojiOk(src.emoji)) err(opIndex, 'Action "emoji" is too long.');
    else out.emoji = src.emoji;
  }
  if (src.style !== undefined) {
    if (!BUTTON_STYLES.includes(src.style)) err(opIndex, `Action "style" must be one of ${BUTTON_STYLES.join('/')}.`);
    else out.style = src.style;
  }
  if (src.tags !== undefined) {
    if (!Array.isArray(src.tags) || src.tags.some(t => !strIn(t, 1, SAFARI_LIMITS.MAX_TAG_LENGTH))) err(opIndex, 'Action "tags" invalid.');
    else out.tags = src.tags.map(t => t.trim());
  }
  if (src.menuVisibility !== undefined) {
    if (!MENU_VISIBILITY.includes(src.menuVisibility)) err(opIndex, `Action "menuVisibility" must be one of ${MENU_VISIBILITY.join('/')}.`);
    else out.menuVisibility = src.menuVisibility;
  }
  return out;
}

/**
 * Normalize a trigger spec into the exact stored shape (see app.js trigger-type switch —
 * the canonical writer): button{label,emoji,style} / modal{keywords,caseSensitive}+phrases /
 * button_modal button+phrases / button_input button+inputLabel+inputPlaceholder.
 * Label/emoji are filled at apply time from the action shell.
 */
function validateTrigger(src, opIndex, err) {
  const type = src?.type || 'button';
  if (!TRIGGER_TYPES.includes(type)) {
    err(opIndex, `Trigger "type" must be one of ${TRIGGER_TYPES.join('/')} (schedule is not supported here).`);
    return null;
  }
  const out = { type };
  const needsPhrases = type === 'modal' || type === 'button_modal';
  if (needsPhrases) {
    const phrases = src?.phrases;
    if (!Array.isArray(phrases) || phrases.length === 0 || phrases.length > SAFARI_LIMITS.MAX_PHRASES_PER_ACTION
        || phrases.some(p => !strIn(p, 1, 100))) {
      err(opIndex, `Trigger type "${type}" needs 1–${SAFARI_LIMITS.MAX_PHRASES_PER_ACTION} "phrases" (each ≤100 chars).`);
    } else {
      out.phrases = phrases.map(p => p.trim().toLowerCase());
    }
  }
  if (type === 'button_input') {
    if (src.inputLabel !== undefined) {
      if (!strIn(src.inputLabel, 1, 45)) err(opIndex, 'Trigger "inputLabel" must be 1–45 chars.');
      else out.inputLabel = src.inputLabel.trim();
    }
    if (src.inputPlaceholder !== undefined) {
      if (!strIn(src.inputPlaceholder, 1, 100)) err(opIndex, 'Trigger "inputPlaceholder" must be 1–100 chars.');
      else out.inputPlaceholder = src.inputPlaceholder.trim();
    }
  }
  return out;
}

/**
 * Conditions are stored as a FLAT ARRAY of {type, operator, ..., logic} — `logic` on
 * condition i connects it to condition i+1 (see evaluateConditions in safariManager.js).
 * The `{logic, items}` object form is legacy and broken at runtime; never emit it.
 */
function validateConditions(src, opIndex, err, resolveRef) {
  if (src === undefined || src === null) return [];
  if (!Array.isArray(src)) { err(opIndex, 'Action "conditions" must be an array.'); return []; }
  if (src.length > 10) { err(opIndex, 'Too many conditions (max 10).'); return []; }
  const out = [];
  for (const c of src) {
    if (!c || typeof c !== 'object' || !CONDITION_TYPES.includes(c.type)) {
      err(opIndex, `Condition "type" must be one of ${CONDITION_TYPES.join('/')}.`);
      continue;
    }
    const cond = { type: c.type };
    if (c.logic !== undefined) {
      if (c.logic !== 'AND' && c.logic !== 'OR') { err(opIndex, 'Condition "logic" must be AND or OR.'); continue; }
      cond.logic = c.logic;
    }
    if (c.type === 'currency') {
      if (!['gte', 'lte', 'eq_zero'].includes(c.operator)) { err(opIndex, 'Currency condition "operator" must be gte/lte/eq_zero.'); continue; }
      cond.operator = c.operator;
      if (c.operator !== 'eq_zero') {
        const v = intIn(c.value, 0, SAFARI_LIMITS.MAX_CURRENCY_CHANGE);
        if (v === null) { err(opIndex, 'Currency condition "value" must be an integer ≥ 0.'); continue; }
        cond.value = v;
      }
    } else if (c.type === 'item') {
      if (c.operator !== 'has' && c.operator !== 'not_has') { err(opIndex, 'Item condition "operator" must be has/not_has.'); continue; }
      cond.operator = c.operator;
      const itemId = resolveRef(c.item ?? c.itemId, 'item', opIndex, 'condition item');
      if (!itemId) continue;
      cond.itemId = itemId;
      if (c.quantity !== undefined) {
        const q = intIn(c.quantity, 1, 999);
        if (q === null) { err(opIndex, 'Item condition "quantity" must be an integer 1–999.'); continue; }
        cond.quantity = q;
      }
    } else if (c.type === 'role') {
      if (c.operator !== 'has' && c.operator !== 'not_has') { err(opIndex, 'Role condition "operator" must be has/not_has.'); continue; }
      cond.operator = c.operator;
      if (!SNOWFLAKE_RE.test(String(c.roleId || ''))) { err(opIndex, 'Role condition "roleId" must be a Discord role ID.'); continue; }
      cond.roleId = String(c.roleId);
    }
    out.push(cond);
  }
  return out;
}

function validateCoordinates(src, opIndex, err, mapCoords, { allowEmpty }) {
  if (src === undefined || src === null || (Array.isArray(src) && src.length === 0)) {
    if (!allowEmpty) err(opIndex, 'This op needs a "coordinates" array (or ["global"]).');
    return [];
  }
  if (!Array.isArray(src)) { err(opIndex, '"coordinates" must be an array like ["A1","A2"] or ["global"].'); return []; }
  const out = [];
  for (const rawCoord of src) {
    const coord = String(rawCoord).trim();
    if (coord.toLowerCase() === 'global') { if (!out.includes('global')) out.push('global'); continue; }
    const upper = coord.toUpperCase();
    if (!COORD_RE.test(upper)) { err(opIndex, `"${rawCoord}" is not a valid coordinate (A1–Z99).`); continue; }
    if (!mapCoords) { err(opIndex, 'This guild has no active map — coordinates other than "global" are unavailable.'); continue; }
    if (!mapCoords.has(upper)) { err(opIndex, `${upper} is not on the active map.`); continue; }
    if (!out.includes(upper)) out.push(upper);
  }
  return out;
}

/**
 * Usage-limit sugar → the exact stored shapes periodUtils.js checkLimitGate reads:
 *   {once:'per_player'}                → {type:'once_per_player', claimedBy: []}
 *   {once:'globally'}                  → {type:'once_globally',  claimedBy: null}
 *   {once:'per_period', hours: 12}     → {type:'once_per_period', periodMs: 43200000, claimedBy: {}}
 * Canonical {type: ...} forms pass through with claimedBy reset to fresh-empty.
 */
export function normalizeLimit(src, opIndex, err) {
  if (src === undefined || src === null || src === 'unlimited') return undefined;
  if (typeof src !== 'object') { err(opIndex, 'Outcome "limit" must be an object or "unlimited".'); return undefined; }
  const once = src.once || ({ once_per_player: 'per_player', once_globally: 'globally', once_per_period: 'per_period' })[src.type];
  if (once === 'per_player') return { type: 'once_per_player', claimedBy: [] };
  if (once === 'globally') return { type: 'once_globally', claimedBy: null };
  if (once === 'per_period') {
    let periodMs = null;
    if (src.periodMs !== undefined) periodMs = intIn(src.periodMs, 60000, 365 * 86400000);
    else if (src.hours !== undefined) {
      const hours = intIn(src.hours, 1, 8760);
      periodMs = hours === null ? null : hours * 3600000;
    } else if (src.minutes !== undefined) {
      const minutes = intIn(src.minutes, 1, 525600);
      periodMs = minutes === null ? null : minutes * 60000;
    }
    if (periodMs === null) { err(opIndex, 'A per-period limit needs "hours" (1–8760), "minutes", or "periodMs".'); return undefined; }
    return { type: 'once_per_period', periodMs, claimedBy: {} };
  }
  err(opIndex, 'Outcome "limit" must set "once" to per_player / globally / per_period.');
  return undefined;
}

function validateOutcomes(src, opIndex, err, warnings, resolveRef, existingCount) {
  if (!Array.isArray(src) || src.length === 0) {
    err(opIndex, `An action needs 1–${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON} "outcomes".`);
    return [];
  }
  if (existingCount + src.length > SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON) {
    err(opIndex, `Too many outcomes (max ${SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON} per action).`);
    return [];
  }
  const out = [];
  for (const o of src) {
    if (!o || typeof o !== 'object' || !OUTCOME_TYPES.includes(o.type)) {
      err(opIndex, `Outcome "type" must be one of ${OUTCOME_TYPES.join('/')}.`);
      continue;
    }
    const executeOn = o.executeOn ?? 'true';
    if (!['always', 'true', 'false'].includes(executeOn)) {
      err(opIndex, 'Outcome "executeOn" must be always/true/false.');
      continue;
    }
    const cfg = o.config || o; // tolerate flattened configs from the model
    const outcome = { type: o.type, executeOn, config: {} };

    if (o.type === 'display_text') {
      if (!strIn(cfg.content, 1, SAFARI_LIMITS.MAX_ACTION_CONTENT_LENGTH)) {
        err(opIndex, `display_text needs "content" (1–${SAFARI_LIMITS.MAX_ACTION_CONTENT_LENGTH} chars).`);
        continue;
      }
      outcome.config = {
        title: strIn(cfg.title, 1, SAFARI_LIMITS.MAX_ACTION_TITLE_LENGTH) ? cfg.title.trim() : '',
        content: cfg.content.trim(),
        image: '',
        color: typeof cfg.color === 'string' && /^[0-9a-fA-F]{6}$/.test(cfg.color) ? cfg.color : STYLE_TO_ACCENT_COLOR.Primary
      };
    } else if (o.type === 'give_currency') {
      const amount = intIn(cfg.amount, SAFARI_LIMITS.MIN_CURRENCY_CHANGE, SAFARI_LIMITS.MAX_CURRENCY_CHANGE);
      if (amount === null || amount === 0) { err(opIndex, 'give_currency outcome needs a non-zero integer "amount".'); continue; }
      outcome.config = { amount };
    } else if (o.type === 'give_item') {
      const itemId = resolveRef(cfg.item ?? cfg.itemId, 'item', opIndex, 'outcome item');
      if (!itemId) continue;
      const quantity = intIn(cfg.quantity ?? 1, 1, 99);
      if (quantity === null) { err(opIndex, 'give_item outcome "quantity" must be 1–99.'); continue; }
      outcome.config = { itemId, quantity, operation: 'give' };
    } else if (o.type === 'give_role' || o.type === 'remove_role') {
      if (!SNOWFLAKE_RE.test(String(cfg.roleId || ''))) { err(opIndex, `${o.type} outcome needs a Discord "roleId".`); continue; }
      outcome.config = { roleId: String(cfg.roleId) };
      warnings.push(`Op ${opIndex + 1} ${o.type === 'give_role' ? 'grants' : 'removes'} the Discord role <@&${cfg.roleId}> — double-check that's the intended role.`);
    } else if (o.type === 'follow_up_button') {
      const buttonId = resolveRef(cfg.action ?? cfg.buttonId, 'action', opIndex, 'follow-up action');
      if (!buttonId) continue;
      outcome.config = { buttonId };
    }

    const limit = normalizeLimit(cfg.limit, opIndex, err);
    if (limit) outcome.config.limit = limit;
    out.push(outcome);
  }
  return out;
}

function validatePlayerIds(src, opIndex, err) {
  const list = Array.isArray(src) ? src : (src !== undefined && src !== null ? [src] : []);
  if (list.length === 0 || list.length > 25) {
    err(opIndex, 'Player ops need "playerId" (one ID or an array of up to 25).');
    return [];
  }
  const out = [];
  for (const id of list) {
    if (!SNOWFLAKE_RE.test(String(id))) { err(opIndex, `"${id}" is not a Discord user ID.`); continue; }
    if (!out.includes(String(id))) out.push(String(id));
  }
  return out;
}

function warnUnknownPlayers(playerIds, guildPlayers, warnings) {
  if (!guildPlayers) return;
  for (const id of playerIds || []) {
    if (!guildPlayers[id]) warnings.push(`Player ${id} has no record in this guild yet — they'll be initialized.`);
  }
}

// ---------------------------------------------------------------------------
// preview rendering
// ---------------------------------------------------------------------------

const OP_EMOJI = {
  create_item: '🆕', update_item: '✏️', create_store: '🏪', update_store: '✏️',
  stock_item: '📦', set_stock: '📊', update_config: '⚙️',
  create_action: '⚡', create_recipe: '🛠️', update_action: '✏️', add_outcome: '➕',
  attach_action: '📍', update_map_cell: '🗺️', give_currency: '🪙', give_item: '🎁'
};

/**
 * Render one normalized op as a stable preview line. `names` maps ids/$refs → display
 * names; `coordChannels` maps coordinates → their Discord channel IDs, rendering
 * "@ A1" as a clickable <#channel> mention when the cell has a channel.
 */
export function describeOp(op, names = {}, coordChannels = {}) {
  const nameOf = (key) => names[key] || (typeof key === 'string' && key.startsWith('$') ? key.slice(1) : key);
  const coordLabel = (c) => coordChannels[c] ? `<#${coordChannels[c]}>` : c;
  const coordList = (coords = []) => coords.map(coordLabel).join(', ');
  // Cap mention lists so a single line can't blow the message character budget
  // (25 players × ~23 chars of <@id> would be ~600 chars on one line).
  const mentions = (ids = []) => {
    const shown = ids.slice(0, 3).map(id => `<@${id}>`).join(', ');
    return ids.length > 3 ? `${shown} +${ids.length - 3} more` : shown;
  };
  const emoji = OP_EMOJI[op.op] || '🔧';
  switch (op.op) {
    case 'create_item': return `${emoji} Create item **${op.fields?.name}**${op.fields?.emoji ? ` ${op.fields.emoji}` : ''}`;
    case 'update_item': return `${emoji} Update item **${nameOf(op.item)}** (${Object.keys(op.set || {}).join(', ')})`;
    case 'create_store': return `${emoji} Create store **${op.fields?.name}**${op.fields?.emoji ? ` ${op.fields.emoji}` : ''}`;
    case 'update_store': return `${emoji} Update store **${nameOf(op.store)}** (${Object.keys(op.set || {}).join(', ')})`;
    case 'stock_item': return `${emoji} Stock **${nameOf(op.item)}** in **${nameOf(op.store)}**${op.price !== undefined ? ` @ ${op.price}` : ''}${op.stock !== undefined && op.stock >= 0 ? ` (stock ${op.stock})` : ''}`;
    case 'set_stock': return `${emoji} Set stock of **${nameOf(op.item)}** in **${nameOf(op.store)}** to ${op.stock === -1 ? 'unlimited' : op.stock}`;
    case 'update_config': return `${emoji} Update settings: ${Object.entries(op.set || {}).map(([k, v]) => `${k} → ${v}`).join(', ')}`;
    case 'create_action': {
      const coords = op.coordinates?.length ? ` @ ${coordList(op.coordinates)}` : '';
      const outs = (op.outcomes || []).map(o => o.type).join(' + ');
      return `${emoji} Create action **${op.fields?.name}** [${op.trigger?.type || 'button'}]${coords} → ${outs}`;
    }
    case 'create_recipe': {
      const inputs = (op.inputs || []).map(i => `${i.quantity > 1 ? `${i.quantity}× ` : ''}**${nameOf(i.itemId)}**`).join(' + ');
      const where = op.coordinates?.filter(c => c !== 'global').length ? ` @ ${coordList(op.coordinates.filter(c => c !== 'global'))}` : ' (Crafting menu)';
      return `${emoji} Recipe **${op.fields?.name}**: ${inputs} → ${op.output?.quantity > 1 ? `${op.output.quantity}× ` : ''}**${nameOf(op.output?.itemId)}**${where}`;
    }
    case 'update_action': return `${emoji} Update action **${nameOf(op.action)}** (${Object.keys(op.set || {}).join(', ')})`;
    case 'add_outcome': return `${emoji} Add ${(op.outcomes || []).map(o => o.type).join(' + ')} to **${nameOf(op.action)}**`;
    case 'attach_action': return `${emoji} Attach **${nameOf(op.action)}** to ${coordList(op.coordinates)}`;
    case 'update_map_cell': return `${emoji} Update cell **${coordLabel(op.coordinate)}** (${Object.keys(op.set || {}).join(', ')})`;
    case 'give_currency': return `${emoji} ${op.amount > 0 ? 'Give' : 'Take'} ${Math.abs(op.amount)} currency ${op.amount > 0 ? 'to' : 'from'} ${mentions(op.playerIds)}`;
    case 'give_item': return `${emoji} Give ${op.quantity}× **${nameOf(op.item)}** to ${mentions(op.playerIds)}`;
    default: return `${emoji} ${op.op}`;
  }
}
