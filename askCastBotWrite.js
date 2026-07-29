/**
 * 🛠️ Ask CastBot — Edit mode (natural-language Safari data changes).
 *
 * The write-side sibling of askCastBot.js. The CLI stays READ-ONLY — it proposes a
 * structured mutation plan in a ```castbot-plan fenced block; this module extracts it,
 * validates it (safariPlanSchema.js), shows the admin an ephemeral preview with
 * Apply/Cancel, and applies it in-process (safariPlanApplier.js) under the storage
 * locks. See those modules for why the CLI must never write the data files itself.
 *
 * ACCESS: guild must hold the `safari_edit` entitlement (entitlements.js — runtime
 * registry, the future premium hook) AND the clicker must be a CastBot admin
 * (isAdminMember — same four permission bits as app.js hasAdminPermissions). There is
 * deliberately NO user-ID bypass: write access is guild-scoped.
 *
 * TWO ENTRY ROUTES (pilot): the Tools-menu button (fully ephemeral) and a posted
 * public card (askcb_edit_post) whose button is still admin-gated per click; the flow
 * stays ephemeral either way, but the public route posts a "Safari updated" summary
 * card to the channel after a successful Apply (audit-by-visibility).
 *
 * @module askCastBotWrite
 */

import fs from 'fs';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import {
  runClaudeJob, safeDeliver, formatElapsed, HARD_KILL_MS,
  buildModelSelectField, resolveModelChoice, modelLabel, canUseModel
} from './claudeRunner.js';
import {
  isAskCastBotEnvironment, resolveWriteDenyRules, neutralizeMentions, truncate
} from './askCastBot.js';
import { validatePlan, describeOp, MAX_OPS_PER_PLAN, PLAN_VERSION } from './safariPlanSchema.js';
import { logAskEvent } from './src/analytics/askLog.js';
import { hasFeature, FEATURES } from './entitlements.js';

export const ACCENT = 0xe67e22; // orange — visually distinct from read-mode blue

/** Write jobs are heavier than reads (bigger prompts, bigger outputs) — one at a time. */
const WRITE_MAX_CONCURRENT = 1;
let writeInFlight = 0;

const PLAN_TTL_MS = 30 * 60 * 1000;
const PLAN_CACHE_MAX = 5;

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

/**
 * Replica of app.js hasAdminPermissions (module-local there, not exported): any of
 * ManageChannels / ManageGuild / ManageRoles / Administrator.
 * @param {Object} member - raw interaction member (permissions is a bitfield string)
 */
export function isAdminMember(member) {
  if (!member || !member.permissions) return false;
  let permissions;
  try { permissions = BigInt(member.permissions); } catch { return false; }
  const ADMIN_BITS = (1n << 4n)   // MANAGE_CHANNELS
    | (1n << 5n)                  // MANAGE_GUILD
    | (1n << 28n)                 // MANAGE_ROLES
    | (1n << 3n);                 // ADMINISTRATOR
  return (permissions & ADMIN_BITS) !== 0n;
}

/**
 * The full Edit-mode gate: environment + guild entitlement + admin bits.
 * Enforced at the entry button, the modal submit, AND the Apply click.
 * @param {{guildId?: string, member?: Object}} ctx
 * @returns {Promise<boolean>}
 */
export async function hasSafariEditAccess({ guildId, member } = {}) {
  if (!isAskCastBotEnvironment()) return false;
  if (!guildId || !(await hasFeature(guildId, FEATURES.SAFARI_EDIT))) return false;
  return isAdminMember(member);
}

// ---------------------------------------------------------------------------
// plan extraction + cache
// ---------------------------------------------------------------------------

const PLAN_BLOCK_RE = /```castbot-plan\s*\n([\s\S]*?)```/g;

/**
 * Pull the plan block out of the CLI's answer. The LAST block wins (a model that
 * "thinks out loud" with a draft block first still lands on its final answer); every
 * block is stripped from the conversational reply either way.
 * @param {string} text
 * @returns {{reply: string, planJson: Object|null, parseError: string|null}}
 */
export function extractPlan(text) {
  const source = String(text ?? '');
  const matches = [...source.matchAll(PLAN_BLOCK_RE)];
  const reply = source.replace(PLAN_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  if (matches.length === 0) return { reply, planJson: null, parseError: null };
  try {
    return { reply, planJson: JSON.parse(matches[matches.length - 1][1]), parseError: null };
  } catch (error) {
    return { reply, planJson: null, parseError: `The proposed plan wasn't valid JSON (${error.message}).` };
  }
}

/** One-shot plan cache: preview → Apply. Restart or TTL expiry = "plan expired, ask again". */
export function rememberPlan(planId, entry) {
  if (!global.askCastBotPlans) global.askCastBotPlans = new Map();
  global.askCastBotPlans.set(planId, { ...entry, createdAt: Date.now() });
  while (global.askCastBotPlans.size > PLAN_CACHE_MAX) {
    const oldest = global.askCastBotPlans.keys().next().value;
    global.askCastBotPlans.delete(oldest);
  }
}

export function recallPlan(planId) {
  const entry = global.askCastBotPlans?.get(planId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PLAN_TTL_MS) {
    global.askCastBotPlans.delete(planId);
    return null;
  }
  return entry;
}

/** Atomic recall-and-delete — the one-shot guard against double-Apply. */
export function consumePlan(planId) {
  const entry = recallPlan(planId);
  if (entry) global.askCastBotPlans.delete(planId);
  return entry;
}

// ---------------------------------------------------------------------------
// guild digest (the model's picture of current state)
// ---------------------------------------------------------------------------

/**
 * Compact, authoritative summary of the guild's Safari state, injected into the write
 * prompt so the model doesn't burn its time budget spelunking a multi-MB JSON.
 * Pure formatter — I/O lives in buildGuildDigest.
 */
export function formatGuildDigest(guildSafari, guildPlayers = {}, names = {}) {
  const g = guildSafari || {};
  const cfg = g.safariConfig || {};
  const lines = [];

  lines.push(`SETTINGS: currency "${cfg.currencyName || 'Dollars'}" ${cfg.currencyEmoji || '🪙'} · inventory "${cfg.inventoryName || 'Inventory'}" ${cfg.inventoryEmoji || '🧰'} · starting currency ${cfg.defaultStartingCurrencyValue ?? 100} · starting coordinate ${cfg.defaultStartingCoordinate || '(unset)'}`);

  const items = Object.values(g.items || {});
  const stores = Object.values(g.stores || {});
  const actions = Object.entries(g.buttons || {});
  lines.push(`COUNTS: items ${items.length}/200 · stores ${stores.length}/50 · actions ${actions.length}/100`);

  const capList = (list, cap, render) => {
    const shown = list.slice(0, cap).map(render);
    if (list.length > cap) shown.push(`… +${list.length - cap} more`);
    return shown;
  };

  lines.push('', `ITEMS (id — name · price):`);
  lines.push(...(items.length ? capList(items, 120, it => `  ${it.id} — ${it.name} ${it.emoji || ''} · ${it.basePrice ?? 0}`) : ['  (none)']));

  lines.push('', `STORES (id — name · stocked items):`);
  lines.push(...(stores.length ? capList(stores, 40, st => {
    const stocked = (st.items || []).map(l => `${l.itemId || l}@${l.price ?? '?'}`).join(', ');
    return `  ${st.id} — ${st.name} ${st.emoji || ''} · [${stocked || 'empty'}]`;
  }) : ['  (none)']));

  lines.push('', `ACTIONS (id — name · trigger · coordinates · outcomes):`);
  lines.push(...(actions.length ? capList(actions, 80, ([id, a]) => {
    const outs = (a.actions || []).map(o => o.type).join('+') || 'none';
    const coords = (a.coordinates || []).join(',') || 'unattached';
    return `  ${id} — ${a.name || a.label || 'unnamed'} · ${a.trigger?.type || 'button'} · ${coords} · ${outs}`;
  }) : ['  (none)']));

  const enemies = Object.values(g.enemies || {});
  if (enemies.length) {
    lines.push('', `ENEMIES (id — name · hp/attack):`);
    lines.push(...capList(enemies, 40, e => `  ${e.id} — ${e.name} ${e.emoji || ''} · ❤️${e.hp} ⚔️${e.attackValue}`));
  }

  const activeMapId = g.maps?.active;
  if (activeMapId && g.maps?.[activeMapId]) {
    const map = g.maps[activeMapId];
    const coords = Object.keys(map.coordinates || {});
    lines.push('', `ACTIVE MAP: ${map.gridWidth || '?'}×${map.gridHeight || '?'} — coordinates: ${coords.join(', ') || '(none)'}`);
  } else {
    lines.push('', 'ACTIVE MAP: none — coordinate-based ops are unavailable (use "global").');
  }

  const playerLines = formatPlayerLines(guildPlayers, guildSafari, names);
  if (playerLines.length) {
    lines.push('', `PLAYERS (id — name · currency · items · location):`, ...playerLines);
  }

  return lines.join('\n');
}

/**
 * Total items a player holds, across BOTH inventory formats.
 *
 * ~68% of live inventory entries are still bare numbers (the legacy shape) rather than
 * `{quantity}` objects, so a naive `.quantity` read reports 0 for two thirds of real
 * data. Same reduce as playerManagement.js's buildPlayerStatsLine — keep them in step.
 */
export function countItems(inventory) {
  return Object.values(inventory || {})
    .reduce((sum, v) => sum + (typeof v === 'object' ? (v?.quantity || 0) : (v || 0)), 0);
}

/** Player-controlled text entering a prompt: flatten newlines/backticks and cap. */
const safeName = (name) => String(name ?? 'unknown').replace(/[\r\n`]+/g, ' ').substring(0, 30);

/**
 * One digest line per safari player. Deliberately EXCLUDES history, movementHistory and
 * storeHistory — that's a behavioural trail (and where the kilobytes are); counts answer
 * every question a host actually asks.
 *
 * @param {Object} guildPlayers - playerData[guildId].players
 * @param {Object} guildSafari - safariData[guildId] (for the active map id)
 * @param {Object} [names] - userId → display name, resolved from Discord by the caller.
 *   Names are NOT persisted on player records (app.js deletes them before save), so
 *   without this every line would read "unknown".
 */
export function formatPlayerLines(guildPlayers, guildSafari, names = {}) {
  const players = Object.entries(guildPlayers || {})
    .filter(([id, p]) => /^\d{17,20}$/.test(id) && p?.safari); // skip non-snowflake keys like "admin"
  if (!players.length) return [];

  const activeMapId = guildSafari?.maps?.active;
  const shown = players.slice(0, 50).map(([id, p]) => {
    const safari = p.safari || {};
    const location = activeMapId ? safari.mapProgress?.[activeMapId]?.currentLocation : null;
    const stamina = safari.points?.stamina?.current;
    return `  ${id} — ${safeName(names[id])} · ${safari.currency ?? 0} · ${countItems(safari.inventory)} items`
      + (location ? ` · 📍${location}` : '')
      + (Number.isFinite(stamina) ? ` · ⚡${stamina}` : '')
      + (safari.isPaused === true ? ' · ⏸️paused' : '');
  });
  if (players.length > 50) shown.push(`  … +${players.length - 50} more`);
  return shown;
}

/**
 * I/O wrapper: read both files (plain reads, no lock needed), resolve player names from
 * Discord, and format.
 * @param {string} guildId
 * @param {Object} [client] - Discord client; without it names fall back to "unknown"
 */
export async function buildGuildDigest(guildId, client = null) {
  const { loadSafariContent } = await import('./safariManager.js');
  const { loadPlayerData } = await import('./storage.js');
  const safariData = await loadSafariContent();
  const playerData = await loadPlayerData();
  const guildPlayers = playerData[guildId]?.players || {};
  return formatGuildDigest(safariData[guildId] || {}, guildPlayers,
    await resolvePlayerNames(guildId, guildPlayers, client));
}

/**
 * READ-MODE player roster — the answer to "who has the most items", "where is everyone",
 * "what does X have". Includes each player's actual inventory (item NAMES, not the raw
 * ids that are stored) because otherwise the model can only report counts.
 *
 * Scoped to one guild by construction: the CLI never opens the multi-tenant data files.
 * Deliberately excludes history / movementHistory / storeHistory.
 * @returns {Promise<string>} '' when the guild has no safari players
 */
export async function buildPlayerDigestSection(guildId, client = null) {
  const { loadSafariContent } = await import('./safariManager.js');
  const { loadPlayerData } = await import('./storage.js');
  const safariData = await loadSafariContent();
  const playerData = await loadPlayerData();
  const guildSafari = safariData[guildId] || {};
  const guildPlayers = playerData[guildId]?.players || {};
  const names = await resolvePlayerNames(guildId, guildPlayers, client);
  return formatPlayerDigest(guildPlayers, guildSafari, names);
}

/** Pure formatter for the read-mode roster. */
export function formatPlayerDigest(guildPlayers, guildSafari, names = {}) {
  const players = Object.entries(guildPlayers || {})
    .filter(([id, p]) => /^\d{17,20}$/.test(id) && p?.safari);
  if (!players.length) return '';

  const items = guildSafari?.items || {};
  const cfg = guildSafari?.safariConfig || {};
  const activeMapId = guildSafari?.maps?.active;
  const itemName = (id) => items[id]?.name || id;

  const lines = [`CURRENCY: "${cfg.currencyName || 'Dollars'}" ${cfg.currencyEmoji || '🪙'}`, ''];
  lines.push(`PLAYERS (${players.length}) — name · currency · total items · location · inventory:`);

  for (const [id, p] of players.slice(0, 50)) {
    const safari = p.safari || {};
    const location = activeMapId ? safari.mapProgress?.[activeMapId]?.currentLocation : null;
    const inventory = Object.entries(safari.inventory || {})
      .map(([itemId, v]) => [itemName(itemId), typeof v === 'object' ? (v?.quantity || 0) : (v || 0)])
      .filter(([, qty]) => qty > 0)
      .map(([name, qty]) => `${name}×${qty}`);
    lines.push(`  ${safeName(names[id])} (${id}) · ${safari.currency ?? 0} · ${countItems(safari.inventory)} items`
      + (location ? ` · 📍${location}` : '')
      + (safari.isPaused === true ? ' · ⏸️paused' : '')
      + ` · [${inventory.join(', ') || 'empty'}]`);
  }
  if (players.length > 50) lines.push(`  … +${players.length - 50} more players`);
  return lines.join('\n');
}

/**
 * userId → display name from Discord's cache/API. Best-effort: a failed lookup just
 * leaves that player as "unknown" rather than failing the whole digest.
 */
export async function resolvePlayerNames(guildId, guildPlayers, client) {
  const names = {};
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return names;
  const ids = Object.keys(guildPlayers || {}).filter(id => /^\d{17,20}$/.test(id)).slice(0, 50);
  for (const id of ids) {
    const cached = guild.members.cache.get(id);
    if (cached) { names[id] = cached.displayName || cached.user?.username; continue; }
    try {
      const member = await guild.members.fetch(id);
      names[id] = member.displayName || member.user?.username;
    } catch { /* left unknown */ }
  }
  return names;
}

// ---------------------------------------------------------------------------
// the write prompt
// ---------------------------------------------------------------------------

/** Condensed op reference inlined into every write prompt (full doc: docs/askcastbot-kb/write-ops.md). */
const OPS_REFERENCE = `THE PLAN FORMAT — emit AT MOST ONE fenced block, at the very END of your reply:
\`\`\`castbot-plan
{"version": ${PLAN_VERSION}, "summary": "one line", "ops": [ ... ]}
\`\`\`
Up to ${MAX_OPS_PER_PLAN} ops, applied in order. A create op may declare "ref": "slug"; later ops reference it as "$slug". Refs MUST be declared before use. Plain strings must be an existing entity's exact id or unique name — NOTHING is auto-created, so if a store/item/action the request needs doesn't exist in CURRENT STATE, emit its create op first.

OP TYPES (safariContent):
- {"op":"create_item","ref?":"r","name":"≤80","emoji?":"🐕","description?":"≤500","basePrice?":int,"maxQuantity?":int(-1=∞),"consumable?":"Yes|No","staminaBoost?":0-10,"attackValue?":int,"defenseValue?":int,"tags?":[..]}
- {"op":"update_item","item":"id|name|$ref","set":{any create_item fields}}
- {"op":"create_store","ref?":"r","name":"≤100","emoji?":"🏪","description?":"...","storeownerText?":"≤500","accentColor?":int}
- {"op":"update_store","store":"...","set":{...}}
- {"op":"stock_item","store":"...","item":"...","price?":int,"stock?":int(-1=∞)} — price is OPTIONAL and sets the ITEM's price everywhere it's sold (the game has no per-store prices); omit it to keep the item's current price
- {"op":"set_stock","store":"...","item":"...","stock":int}
- {"op":"update_config","set":{"currencyName?":"≤30","currencyEmoji?":"💎","inventoryName?","inventoryEmoji?","craftingName?","craftingEmoji?","defaultStartingCurrencyValue?":int,"defaultStartingCoordinate?":"A1"}}
- {"op":"create_action","ref?":"r","name":"≤80","emoji?":"...","style?":"Primary|Secondary|Success|Danger","description?":"≤200",
   "trigger":{"type":"button|modal|button_modal|button_input","phrases?":["needed for modal/button_modal, 1-8"],"inputLabel?":"...","inputPlaceholder?":"..."},
   "conditions?":[{"type":"currency","operator":"gte|lte|eq_zero","value":int,"logic?":"AND|OR"},{"type":"item","operator":"has|not_has","item":"...","quantity?":int},{"type":"role","operator":"has|not_has","roleId":"..."}],
   "coordinates?":["A1","B2"] or ["global"],
   "outcomes":[1-6 of:
     {"type":"display_text","config":{"title?":"≤100","content":"≤2000"},"executeOn?":"always|true|false"},
     {"type":"give_currency","config":{"amount":int,"limit?":LIMIT}},
     {"type":"give_item","config":{"item":"...","quantity?":1-99,"limit?":LIMIT}},
     {"type":"give_role","config":{"roleId":"..."}}, {"type":"remove_role","config":{"roleId":"..."}},
     {"type":"follow_up_button","config":{"action":"..."}},
     {"type":"fight_enemy","config":{"enemy":"...","limit?":LIMIT}} — starts a combat encounter; defaults to executeOn "always"]}
- {"op":"create_enemy","ref?":"r","name":"≤80","emoji?":"👹","description?":"≤500","hp?":int(1-9999,default 10),"attackValue?":int(1-999,default 1),"turnOrder?":"player_first|enemy_first"}
- {"op":"create_recipe","ref?":"r","name":"≤80","emoji?":"...","description?":"...","inputs":[{"item":"...","quantity?":1-99} or just "item", 1-3 of them],"output":{"item":"...","quantity?":1-99},"coordinates?":["A1"]} — CRAFTING. A recipe is an Action that consumes the inputs and gives the output; it appears in the player's Crafting menu automatically (add coordinates only if it should ALSO sit on map cells). Same item twice = quantity 2.
- {"op":"update_action","action":"...","set":{"name?","emoji?","style?","description?","tags?","menuVisibility?":"none|crafting_menu|player_menu"}}
- {"op":"add_outcome","action":"...","outcome":{...as above}}
- {"op":"attach_action","action":"...","coordinates":["A1"]}
- {"op":"update_map_cell","coordinate":"A1","set":{"title?":"≤100","description?":"≤1000","emoji?":"🌴"}} — the cell emoji and title together form the location's Discord CHANNEL NAME, so setting them renames that channel (done automatically after Apply, paced for Discord's limits). "Change the channel emoji/name for a location" IS supported — do it this way.
OP TYPES (playerData):
- {"op":"give_currency","playerId":"id or [ids, ≤25]","amount":±int}
- {"op":"give_item","playerId":"...","item":"...","quantity?":1-99}
LIMIT (usage limits on give_currency/give_item outcomes): {"once":"per_player"} | {"once":"globally"} | {"once":"per_period","hours":12}
"modal" trigger = a text Command the player types (phrases are what they type). "button" = a clickable button on the location's card. executeOn: "true" runs when conditions pass (default), "false" when they fail, "always" regardless.
BIAS TO ACTION: when the request names a concrete change — even a creative one ("write flavor text for H5", "make me an item") — draft the content YOURSELF and emit the plan. NEVER present a draft and ask "shall I apply it?": the preview's Apply/Refine/Cancel buttons ARE the approval step, and an answer without a plan block gives the admin nothing to click. Reserve the no-plan reply for genuine blockers (unknown target, unsupported op, contradictory request).
NOT SUPPORTED (do not emit; explain instead): deleting anything, attributes, scheduled actions, map creation/resizing, moving players, "all players" bulk grants.
CRAFTING NOTE: recipes live in the Crafting menu, not on a coordinate — but you CAN pass coordinates to also place the craft button on map cells. If the user names an input item that doesn't exist, create it in the same plan (with a ref) rather than refusing.`;

/**
 * Assemble the Edit-mode prompt.
 * @param {{query: string, digest: string, prevContextText?: string}} opts
 */
export function buildWritePrompt({ query, digest, prevContextText = '' }) {
  const essence = fs.readFileSync('./docs/askcastbot.md', 'utf8');
  const prevSection = prevContextText?.trim()
    ? `\n\nPREVIOUS EXCHANGE (context — the admin may be refining it):\n${prevContextText}\n\n---\n`
    : '';
  return `You are Ask CastBot 👾 in EDIT MODE — the in-Discord CastBot expert, now proposing real changes to this server's Safari game. Persona essence:

${essence}

EDIT MODE OVERRIDE — supersedes the persona essence where they conflict:
The essence says you cannot change anything and must never offer to. In EDIT MODE that rule is replaced: your job IS to change things — but never directly. You PROPOSE a structured plan; a human admin reviews an itemized preview and clicks Apply; the bot then makes the changes. You still have only Read/Glob/Grep. You never edit files.

${OPS_REFERENCE}

CURRENT STATE of this server's Safari (authoritative — trust it over anything you read elsewhere; you may Read docs for mechanics questions, but entity ids/names come from here):
${digest}

RULES:
- Fulfil the request with the smallest correct plan. Create missing dependencies explicitly (with refs) BEFORE using them.
- Respect the limits shown in CURRENT STATE's counts line and the field caps above — a plan that busts a limit is rejected whole.
- If the request is ambiguous, out of scope, destructive, or doesn't map onto the supported ops: emit NO plan block. Ask a clarifying question or explain what's possible instead.
- Your conversational reply (before the plan block) is shown to the admin ABOVE the itemized preview: keep it to 2-5 sentences saying what the plan does and calling out anything they should double-check. No internals (file paths, JSON keys, function names) — speak in game terms.
- Content you invent (item descriptions, NPC dialogue, flavour text) should be genuinely good — playful, thematic, concise. That's the fun part; don't phone it in.${prevSection}

The admin's request:
${query}`;
}

// ---------------------------------------------------------------------------
// modal + containers (Components V2)
// ---------------------------------------------------------------------------

/**
 * The Edit-mode modal. Route (menu vs posted-public card) is encoded in the custom_id
 * stem, mirroring buildAskModal: askcb_edit_modal / askcb_editpub_modal.
 */
export function buildEditModal(prevContext = null, prevId = null, isPublic = false) {
  const stem = isPublic ? 'askcb_editpub_modal' : 'askcb_edit_modal';
  return {
    custom_id: prevId ? `${stem}_${prevId}` : stem,
    title: '🛠️ Edit Safari',
    components: [
      buildModelSelectField('askcb_model', prevContext?.model || 'sonnet'),
      ...(prevContext ? [{
        type: 18,
        label: 'Previous exchange (context)',
        component: {
          type: 4, custom_id: 'askcb_prev_context', style: 2, required: false, max_length: 1500,
          value: `Q: ${prevContext.query.substring(0, 300)}\nA: ${prevContext.reply.substring(0, 1000)}`,
          placeholder: 'Edit or clear this if not relevant'
        }
      }] : []),
      {
        type: 18,
        label: prevContext ? 'Refine or follow up' : 'What should change?',
        description: 'Describe the change — items, stores, actions, settings',
        component: {
          type: 4, custom_id: 'askcb_query', style: 2, required: true, max_length: 2000,
          placeholder: prevContext
            ? 'e.g., "Make the prices cheaper" or "Also add them to B3"'
            : 'e.g., "Create items bulbasaur, squirtle, charmander and add them to a new store called Pokestore"'
        }
      }
    ]
  };
}

export function buildWriteProgressContainer(query, progress = null) {
  const lines = [{ type: 10, content: `## 🛠️ Ask CastBot is planning your edit...` }];
  if (progress) {
    lines.push(
      { type: 10, content: `${progress.activity}` },
      { type: 14 },
      { type: 10, content: `-# ⏳ ${formatElapsed(progress.elapsedMs)} elapsed of ${formatElapsed(HARD_KILL_MS)} · ${progress.toolCount} check${progress.toolCount === 1 ? '' : 's'}` }
    );
  } else {
    lines.push({ type: 10, content: `🚀 Reading your Safari and drafting a plan` }, { type: 14 });
  }
  lines.push({ type: 10, content: `-# "${neutralizeMentions(truncate(query, 80))}"` });
  return { type: 17, accent_color: ACCENT, components: lines };
}

/**
 * Discord rejects a Components V2 message whose Text Displays exceed 4000 chars
 * COMBINED — per MESSAGE, not per component. Every builder below therefore budgets the
 * whole message and spills overflow lines into separate ephemeral follow-up messages.
 */
const MSG_CHAR_BUDGET = 3400;

/** Split lines into what fits the first message vs overflow chunks for follow-ups. */
function packLines(lines, firstBudget) {
  const first = [];
  let used = 0, i = 0;
  for (; i < lines.length; i++) {
    if (used + lines[i].length + 1 > firstBudget) break;
    first.push(lines[i]);
    used += lines[i].length + 1;
  }
  const overflow = [];
  let current = [], currentLen = 0;
  for (; i < lines.length; i++) {
    if (currentLen + lines[i].length + 1 > MSG_CHAR_BUDGET && current.length) {
      overflow.push(current); current = []; currentLen = 0;
    }
    current.push(lines[i]);
    currentLen += lines[i].length + 1;
  }
  if (current.length) overflow.push(current);
  return { first, overflow };
}

/** Overflow chunks → one continuation container per follow-up message. */
const continuationContainers = (overflow, label) => overflow.map((chunk, idx) => ({
  type: 17,
  accent_color: ACCENT,
  components: [{ type: 10, content: `-# ${label} (continued ${idx + 1}/${overflow.length})\n${chunk.join('\n')}` }]
}));

/**
 * The preview: model's short reply, itemized ops, warnings, then Apply / Refine / Cancel.
 * Ephemeral, so only the requesting admin can click — the Apply handler re-gates anyway.
 * Returns { main, followUps } — every message stays under the combined char cap.
 */
export function buildPreviewMessages({ reply, ops, names, warnings, planId, elapsed, model, coordChannels = {} }) {
  const opLines = ops.map((op, i) => neutralizeMentions(`${i + 1}. ${describeOp(op, names, coordChannels)}`));
  const replyText = reply ? neutralizeMentions(truncate(reply, 800)) : '';
  const warningText = warnings.length
    ? `⚠️ **Check these:**\n${warnings.slice(0, 6).map(w => `- ${neutralizeMentions(truncate(w, 200))}`).join('\n')}`
    : '';
  const { first, overflow } = packLines(opLines, MSG_CHAR_BUDGET - replyText.length - warningText.length - 300);
  const components = [
    { type: 10, content: `## 🛠️ Proposed changes (${ops.length} op${ops.length === 1 ? '' : 's'})` },
    ...(replyText ? [{ type: 10, content: replyText }, { type: 14 }] : []),
    { type: 10, content: first.join('\n') || '(see below)' },
    ...(overflow.length ? [{ type: 10, content: `-# …the remaining ${opLines.length - first.length} changes continue in the messages below.` }] : []),
    ...(warningText ? [{ type: 14 }, { type: 10, content: warningText }] : []),
    { type: 14 },
    { type: 10, content: `-# Nothing has been changed yet. Apply edits your LIVE Safari data (a snapshot is taken first). · ${elapsed} · ${modelLabel(model)}` },
    {
      type: 1,
      components: [
        { type: 2, custom_id: `askcb_plan_apply_${planId}`, label: 'Apply Changes', style: 4, emoji: { name: '🛠️' } },
        { type: 2, custom_id: `askcb_edit_ctx_${planId}`, label: 'Refine', style: 2, emoji: { name: '✏️' } },
        { type: 2, custom_id: `askcb_plan_cancel_${planId}`, label: 'Cancel', style: 2 }
      ]
    }
  ];
  return { main: { type: 17, accent_color: ACCENT, components }, followUps: continuationContainers(overflow, 'Proposed changes') };
}

/**
 * Shown when the CLI answered without a valid plan (conversational or errors).
 * Carries the SAME follow-up affordances as a normal answer — a declined request is
 * usually the start of a conversation ("no, I meant…"), and offering only "Try Again"
 * forced the admin to retype from scratch.
 */
export function buildNoPlanContainer({ reply, errors, planWasAttempted, isPublic, elapsed, model, exchangeId }) {
  const components = [
    { type: 10, content: `## 🛠️ Ask CastBot — Edit Safari` },
    { type: 10, content: neutralizeMentions(truncate(reply || "I couldn't turn that into a change plan.", 2000)) }
  ];
  if (planWasAttempted && errors?.length) {
    components.push(
      { type: 14 },
      { type: 10, content: `❌ **The proposed plan didn't validate:**\n${errors.slice(0, 8).map(e => `- ${e.opIndex >= 0 ? `Op ${e.opIndex + 1}: ` : ''}${neutralizeMentions(truncate(e.message, 160))}`).join('\n')}` },
      { type: 10, content: `-# Nothing was changed. Try again — often just rephrasing or naming things more precisely fixes it.` }
    );
  }
  components.push(
    { type: 14 },
    { type: 10, content: `-# ${elapsed} · ${modelLabel(model)}` },
    { type: 1, components: [
      ...(exchangeId ? [{ type: 2, custom_id: `askcb_edit_ctx_${exchangeId}`, label: 'Follow Up', style: 1, emoji: { name: '👾' } }] : []),
      { type: 2, custom_id: isPublic ? 'askcb_public_ask' : 'askcb_ask', label: 'New Question', style: exchangeId ? 2 : 1, emoji: { name: '💭' } }
    ]}
  );
  return { type: 17, accent_color: ACCENT, components };
}

/** The applied-result screen. Same message-budget contract as the preview. */
export function buildResultMessages({ summary, planId }) {
  const c = summary.created;
  const created = [c.items && `${c.items} item${c.items === 1 ? '' : 's'}`, c.stores && `${c.stores} store${c.stores === 1 ? '' : 's'}`, c.actions && `${c.actions} action${c.actions === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  const lines = summary.lines.map(l => neutralizeMentions(l));
  const warningText = summary.warnings.length
    ? `⚠️ ${summary.warnings.slice(0, 6).map(w => neutralizeMentions(truncate(w, 200))).join('\n⚠️ ')}`
    : '';
  const { first, overflow } = packLines(lines, MSG_CHAR_BUDGET - warningText.length - 300);
  const components = [
    { type: 10, content: `## ✅ Changes applied` },
    { type: 10, content: first.join('\n') || '(no mutations recorded)' },
    ...(overflow.length ? [{ type: 10, content: `-# …the remaining ${lines.length - first.length} changes continue in the messages below.` }] : []),
    { type: 14 },
    { type: 10, content: `-# ${created ? `Created ${created} · ` : ''}${summary.anchorsRefreshed ? `${summary.anchorsRefreshed} location card${summary.anchorsRefreshed === 1 ? '' : 's'} refreshed · ` : ''}${summary.channelsRenamed ? `${summary.channelsRenamed} channel${summary.channelsRenamed === 1 ? '' : 's'} renamed · ` : ''}snapshot ${summary.snapshot ? `taken (${summary.snapshot})` : 'unavailable'}` },
    ...(warningText ? [{ type: 10, content: warningText }] : []),
    { type: 1, components: [
      { type: 2, custom_id: `askcb_edit_ctx_${planId}`, label: 'Keep Editing', style: 1, emoji: { name: '🛠️' } }
    ]}
  ];
  return { main: { type: 17, accent_color: 0x2ecc71, components }, followUps: continuationContainers(overflow, 'Changes applied') };
}

/**
 * Error screen. When a failure happened AFTER some mutations committed, the caller
 * passes `committed` (the partial summary from error.summary) and this renders exactly
 * which changes ARE live — never the old "the lines above say which" with no lines.
 */
export function buildWriteErrorContainer(message, { stale = false, committed = null } = {}) {
  const committedLines = committed?.lines?.length
    ? committed.lines.slice(0, 20).map(l => neutralizeMentions(truncate(l, 150)))
    : null;
  const components = [
    { type: 10, content: `## 🛠️ ${stale ? 'The Safari changed under this plan' : "The edit couldn't be applied"}\n\n${neutralizeMentions(String(message || 'Unknown error').substring(0, 800))}` }
  ];
  if (committedLines) {
    components.push(
      { type: 14 },
      { type: 10, content: `**Applied before the failure (these ARE live):**\n${committedLines.join('\n')}${committed.lines.length > 20 ? `\n-# …+${committed.lines.length - 20} more` : ''}` }
    );
  }
  components.push(
    { type: 14 },
    { type: 10, content: stale
      ? `-# Nothing was changed — the game data moved between preview and Apply. Ask again for a fresh plan.`
      : committedLines
        ? `-# Everything else in the plan was NOT applied.${committed?.snapshot ? ` A pre-apply snapshot (${committed.snapshot}) exists if you need a rollback.` : ''}`
        : `-# No changes from this plan were recorded as applied.` },
    { type: 1, components: [
      { type: 2, custom_id: 'askcb_ask', label: 'Start Over', style: 1, emoji: { name: '👾' } }
    ]}
  );
  return { type: 17, accent_color: 0xe74c3c, components };
}


/** Public post-apply summary for the posted-card route (audit-by-visibility). One message, budgeted. */
export function buildPublicSummaryContainer({ userId, summary, query }) {
  const lines = summary.lines.map(l => neutralizeMentions(truncate(l, 150)));
  const { first } = packLines(lines, 2800);
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 📣 Safari updated` },
      { type: 10, content: `<@${userId}> applied ${summary.safariMutations + summary.playerMutations} change${summary.safariMutations + summary.playerMutations === 1 ? '' : 's'} via Ask CastBot:` },
      { type: 10, content: first.join('\n') + (lines.length > first.length ? `\n-# …+${lines.length - first.length} more` : '') },
      { type: 14 },
      { type: 10, content: `-# "${neutralizeMentions(truncate(query, 120))}"` }
    ]
  };
}

// ---------------------------------------------------------------------------
// display names for the preview
// ---------------------------------------------------------------------------

/** Coordinate → channelId map from the active map, for clickable <#channel> mentions. */
export function buildCoordChannelMap(guildSafari) {
  const activeMapId = guildSafari?.maps?.active;
  const coords = guildSafari?.maps?.[activeMapId]?.coordinates || {};
  const out = {};
  for (const [coord, cell] of Object.entries(coords)) {
    if (cell?.channelId) out[coord] = cell.channelId;
  }
  return out;
}

/** Map every id/$ref appearing in normalized ops to a human name for describeOp. */
export function buildNameMap(ops, guildSafari) {
  const names = {};
  const g = guildSafari || {};
  const learn = (key) => {
    if (typeof key !== 'string' || names[key]) return;
    if (key.startsWith('$')) return; // filled from create ops below
    const entity = g.items?.[key] || g.stores?.[key] || g.buttons?.[key];
    if (entity) names[key] = entity.name || entity.label || key;
  };
  for (const op of ops) {
    if (op.ref && op.fields?.name) names[`$${op.ref}`] = op.fields.name;
    for (const key of ['item', 'store', 'action']) learn(op[key]);
    for (const outcome of op.outcomes || []) {
      learn(outcome.config?.itemId);
      learn(outcome.config?.buttonId);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// inline edit capability for the READ route (👾 Ask CastBot)
// ---------------------------------------------------------------------------
// Reece's actual requirement: the Ask CastBot button ITSELF makes changes when the
// asker is an admin in an entitled guild — not a redirect to the 🛠️ button. The read
// prompt gets this capability section; the answer's plan block is stripped from the
// public reply and the asker receives a private (ephemeral) preview with Apply.

/** The prompt section that arms read-mode with the plan format + this guild's state. */
export async function buildEditCapabilitySection(guildId, client = null) {
  const digest = await buildGuildDigest(guildId, client);
  return `

EDIT CAPABILITY — ACTIVE (this server has Edit Safari and the asker is an admin):
When the request is a CHANGE (create/update/stock/rename/give — not a question), DO IT: emit exactly one \`\`\`castbot-plan block at the very END of your answer, per the format below. Do NOT tell the asker to click Edit Safari or walk them through menus — the plan IS the action. Your visible answer (before the block) should say in 1-3 sentences what the plan will do; the block is stripped from the public reply, and the asker privately receives an itemized preview with an Apply button.
If the request is a question, or doesn't map onto the supported ops, answer normally and emit no block.

${OPS_REFERENCE}

CURRENT STATE of this server's Safari (authoritative for entity ids and names):
${digest}

PLAN RULES: create missing dependencies explicitly with refs BEFORE using them; respect the limits shown in CURRENT STATE; content you invent (descriptions, dialogue, flavour) should be genuinely good.`;
}

/**
 * Handle a read-route answer that may carry an inline plan: extract, validate, cache,
 * and send the asker a private preview (ephemeral follow-ups). Returns the public
 * answer text with the plan block stripped. Never throws — a plan hiccup must not
 * lose a delivered answer.
 */
export async function processInlinePlan({ answer, guildId, userId, channelId, isPublicRoute, model, token, query, elapsed, logCtx = {} }) {
  // Inline events carry the READ turn's eid/cid, so a plan proposed from the 👾 button
  // joins back to the question that produced it.
  const ctx = { ...logCtx, gid: guildId, uid: userId, chan: channelId, model, inline: true };
  try {
    const { reply, planJson, parseError } = extractPlan(answer);
    if (!planJson && !parseError) return { publicAnswer: answer };
    const publicAnswer = reply || 'I prepared a change plan — see your private preview.';
    const { createFollowupMessage } = await import('./buttonHandlerFactory.js');

    if (!planJson) {
      logAskEvent('plan.rejected', { ...ctx, reason: 'malformed_json', reply, errors: [{ opIndex: -1, message: parseError }] });
      await createFollowupMessage(token, {
        components: [buildNoPlanContainer({ reply: 'I tried to prepare the change, but the plan came back malformed. Ask again.', errors: [{ opIndex: -1, message: parseError }], planWasAttempted: true, isPublic: isPublicRoute, elapsed, model })],
        ephemeral: true
      });
      return { publicAnswer };
    }

    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const validation = validatePlan(planJson, safariData[guildId] || null, null);
    if (!validation.ok) {
      console.log(`🛠️ Inline edit plan rejected (${validation.errors.length} errors)`);
      logAskEvent('plan.rejected', {
        ...ctx, reason: 'validation', reply,
        errors: validation.errors, plan: JSON.stringify(planJson)
      });
      await createFollowupMessage(token, {
        components: [buildNoPlanContainer({ reply, errors: validation.errors, planWasAttempted: true, isPublic: isPublicRoute, elapsed, model })],
        ephemeral: true
      });
      return { publicAnswer };
    }

    const planId = Date.now().toString(36);
    rememberPlan(planId, { plan: planJson, guildId, userId, channelId, isPublicRoute, query, reply, model, cid: ctx.cid, eid: ctx.eid, proposedAt: Date.now() });
    logAskEvent('plan.proposed', {
      ...ctx, pid: planId, reply, plan: JSON.stringify(planJson),
      op_count: validation.ops.length, op_types: validation.ops.map(o => o.op),
      warnings: validation.warnings
    });
    const names = buildNameMap(validation.ops, safariData[guildId]);
    const { main, followUps } = buildPreviewMessages({
      reply: '', ops: validation.ops, names, warnings: validation.warnings, planId, elapsed, model,
      coordChannels: buildCoordChannelMap(safariData[guildId])
    });
    await createFollowupMessage(token, { components: [main], ephemeral: true });
    for (const container of followUps) {
      await createFollowupMessage(token, { components: [container], ephemeral: true });
    }
    console.log(`🛠️ Inline edit plan ready from 👾 route: ${validation.ops.length} ops — awaiting Apply`);
    return { publicAnswer };
  } catch (error) {
    console.error('🛠️ Inline plan processing failed:', error.message);
    logAskEvent('ask.error', { ...ctx, phase: 'inline_plan', message: error.message });
    return { publicAnswer: answer };
  }
}

// ---------------------------------------------------------------------------
// entry-button dispatcher (thin app.js branches delegate here)
// ---------------------------------------------------------------------------

/**
 * The Refine button on an edit preview/result (askcb_edit_ctx_<planId>) — reopens the
 * private edit modal carrying the prior exchange. Ask CastBot (askcb_ask) is the single
 * menu entry point; this is a follow-up affordance, not a second feature.
 */
export async function handleEditEntry(context, customId) {
  if (!(await hasSafariEditAccess(context))) {
    return { content: '🛠️ Safari editing isn\'t available for you here.', ephemeral: true };
  }
  const prevId = customId.replace('askcb_edit_ctx_', '');
  const prev = recallWriteExchange(prevId);
  return { type: InteractionResponseType.MODAL, data: buildEditModal(prev, prevId, !!prev?.isPublicRoute) };
}

/** Apply/Cancel dispatcher for the askcb_plan_* buttons. */
export async function handlePlanButton(context) {
  return context.customId.startsWith('askcb_plan_apply_')
    ? handlePlanApply(context)
    : handlePlanCancel(context);
}

// ---------------------------------------------------------------------------
// the end-to-end modal handler
// ---------------------------------------------------------------------------

function denyModal(res, message) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: message, flags: InteractionResponseFlags.EPHEMERAL }
  });
}

/**
 * Handle the Edit-mode modal submit end-to-end: gate, ephemeral progress, run the CLI,
 * extract + validate the plan, preview with Apply/Cancel. Mirrors handleAskModalSubmit;
 * everything here is EPHEMERAL (only the requesting admin sees the flow).
 */
export async function handleEditModalSubmit(req, res, client = null) {
  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    if (inner?.custom_id) fields[inner.custom_id] = inner.value ?? inner.values?.[0];
  }
  const query = fields.askcb_query;
  const model = resolveModelChoice(fields.askcb_model);
  const guildId = req.body.guild_id;
  const userId = req.body.member?.user?.id || req.body.user?.id;
  const customId = String(req.body.data.custom_id || '');
  const isPublicRoute = customId.startsWith('askcb_editpub_modal');
  const parentPid = /_modal_(.+)$/.exec(customId)?.[1] || null;

  // Built before res.send so every event carries it (see the read route for why).
  const ctx = {
    eid: req.body.id,
    cid: recallPlan(parentPid)?.cid || req.body.id,
    gid: guildId,
    uid: userId,
    chan: req.body.channel_id,
    route: isPublicRoute ? 'edit_public' : 'edit',
    model,
    parent_pid: parentPid
  };
  const deny = (reason, message) => {
    logAskEvent('ask.denied', { ...ctx, reason, in_flight: writeInFlight });
    return denyModal(res, message);
  };

  if (!(await hasSafariEditAccess({ guildId, member: req.body.member }))) {
    return deny('access', '🛠️ Edit Safari isn\'t available here (needs the feature enabled for this server, and admin permissions).');
  }
  if (!query?.trim()) return deny('empty_query', '🛠️ Describe the change you want.');
  if (!canUseModel(model, userId)) {
    return deny('restricted_model', `⛔ ${modelLabel(model)} isn't available for general usage at this time — pick Sonnet, Haiku or Opus and try again. Contact Reece if you're interested in the details.`);
  }
  if (writeInFlight >= WRITE_MAX_CONCURRENT) {
    return deny('busy', '🛠️ An edit is already being planned — give it a minute and try again.');
  }

  // Ephemeral progress card as the initial response; heartbeats edit it in place.
  res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { components: [buildWriteProgressContainer(query)], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
  });

  const token = req.body.token;
  const channelId = req.body.channel_id;
  // Heartbeats and delivery both edit @original (no messageId) — the flow is ephemeral,
  // so a channel-post fallback is impossible by design; the 13-min hard kill keeps us
  // inside the 15-min token life.
  const beat = (data) => safeDeliver({ token, channelId, data, userId, fallback: false });

  writeInFlight++;
  let terminalLogged = false;
  try {
    console.log(`🛠️ Ask CastBot EDIT from ${req.body.member?.user?.username} in ${guildId} (${model}): "${truncate(query, 80)}"`);

    const digest = await buildGuildDigest(guildId, client);
    const prompt = buildWritePrompt({ query, digest, prevContextText: fields.askcb_prev_context });
    // The digest's COUNTS line is the guild's feature vector (how much content exists);
    // the full digest is not stored — see askLog's schema notes.
    ctx.digest_counts = /^COUNTS:.*$/m.exec(digest)?.[0] || null;
    ctx.digest_bytes = digest.length;
    ctx.prompt_bytes = prompt.length;
    logAskEvent('ask.request', { ...ctx, query, prev_ctx_len: (fields.askcb_prev_context || '').length });

    const { text, durationMs, usage, sessionId, apiDurationMs, toolTrace,
            costUsd, numTurns, modelUsed, fellBack } = await runClaudeJob({
      prompt,
      tools: 'Read,Glob,Grep',
      deny: resolveWriteDenyRules(guildId),
      onHeartbeat: (progress) => beat({ components: [buildWriteProgressContainer(query, progress)] }),
      model
    });

    const elapsed = formatElapsed(durationMs);
    const { reply, planJson, parseError } = extractPlan(text);
    // Every terminal branch below carries the run metrics, so cost/latency is joinable
    // to the outcome regardless of which way the request went.
    const runMeta = {
      duration_ms: durationMs, api_duration_ms: apiDurationMs, usage, session_id: sessionId,
      cost_usd: costUsd, num_turns: numTurns, tool_trace: toolTrace,
      model_used: modelUsed, fell_back: fellBack
    };

    if (!planJson) {
      const errors = parseError ? [{ opIndex: -1, message: parseError }] : [];
      logAskEvent(parseError ? 'plan.rejected' : 'plan.noplan',
        { ...ctx, ...runMeta, reply, ...(parseError ? { reason: 'malformed_json', errors } : {}) });
      terminalLogged = true;
      // Remember the exchange (no plan attached) so Follow Up can carry it forward.
      const exchangeId = Date.now().toString(36);
      rememberPlan(exchangeId, { plan: null, guildId, userId, channelId, isPublicRoute, query, reply, model, cid: ctx.cid, eid: ctx.eid });
      await beat({ components: [buildNoPlanContainer({ reply, errors, planWasAttempted: !!parseError, isPublic: isPublicRoute, elapsed, model, exchangeId })] });
      return;
    }

    // Preview-time validation against current data (re-validated inside the lock on Apply).
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const validation = validatePlan(planJson, safariData[guildId] || null, null);

    if (!validation.ok) {
      console.log(`🛠️ Ask CastBot EDIT plan rejected (${validation.errors.length} errors)`);
      // errors[] is the highest-value signal in the corpus: it says exactly where the op
      // schema fell short of what someone asked for.
      logAskEvent('plan.rejected', {
        ...ctx, ...runMeta, reason: 'validation', reply,
        errors: validation.errors, plan: JSON.stringify(planJson)
      });
      terminalLogged = true;
      const exchangeId = Date.now().toString(36);
      rememberPlan(exchangeId, { plan: null, guildId, userId, channelId, isPublicRoute, query, reply, model, cid: ctx.cid, eid: ctx.eid });
      await beat({ components: [buildNoPlanContainer({ reply, errors: validation.errors, planWasAttempted: true, isPublic: isPublicRoute, elapsed, model, exchangeId })] });
      return;
    }

    const planId = Date.now().toString(36);
    rememberPlan(planId, { plan: planJson, guildId, userId, channelId, isPublicRoute, query, reply, model, cid: ctx.cid, eid: ctx.eid, proposedAt: Date.now() });
    logAskEvent('plan.proposed', {
      ...ctx, ...runMeta, pid: planId, reply,
      plan: JSON.stringify(planJson), op_count: validation.ops.length,
      op_types: validation.ops.map(o => o.op), warnings: validation.warnings
    });
    terminalLogged = true;
    const names = buildNameMap(validation.ops, safariData[guildId]);
    console.log(`🛠️ Ask CastBot EDIT plan ready: ${validation.ops.length} ops (${elapsed}) — awaiting Apply`);

    const { main, followUps } = buildPreviewMessages({
      reply, ops: validation.ops, names, warnings: validation.warnings, planId, elapsed, model,
      coordChannels: buildCoordChannelMap(safariData[guildId])
    });
    await beat({ components: [main] });
    if (followUps.length) {
      const { createFollowupMessage } = await import('./buttonHandlerFactory.js');
      for (const container of followUps) {
        await createFollowupMessage(token, { components: [container], ephemeral: true });
      }
    }
  } catch (error) {
    console.error('🛠️ Ask CastBot EDIT error:', error.message);
    logAskEvent('ask.error', { ...ctx, phase: 'plan', message: error.message });
    terminalLogged = true;
    await beat({ components: [buildWriteErrorContainer(`Planning failed: ${error.message}. Nothing was changed.`)] });
  } finally {
    if (!terminalLogged) logAskEvent('ask.error', { ...ctx, phase: 'unknown', message: 'no terminal event' });
    writeInFlight--;
  }
}

// ---------------------------------------------------------------------------
// Apply / Cancel (invoked from thin ButtonHandlerFactory branches in app.js)
// ---------------------------------------------------------------------------

/**
 * Apply a previewed plan. Factory context (deferred + updateMessage) — the return value
 * replaces the ephemeral preview. Re-gates everything: the preview being ephemeral
 * already binds the clicker, but defense in depth is cheap.
 */
export async function handlePlanApply(context) {
  const planId = context.customId.replace('askcb_plan_apply_', '');
  const entry = recallPlan(planId);
  // Denials are logged against whatever we know: an expired plan has no entry, so the
  // clicker's own ids are the only context available.
  const denyCtx = (e) => ({
    eid: context.customId, pid: planId,
    cid: e?.cid, gid: context.guildId, uid: context.userId, route: 'apply'
  });
  if (!entry) {
    logAskEvent('plan.apply_denied', { ...denyCtx(), reason: 'expired' });
    return { components: [buildWriteErrorContainer('This plan expired or was already applied. Ask again for a fresh one.', { stale: true })] };
  }
  if (entry.guildId !== context.guildId || entry.userId !== context.userId
    || !(await hasSafariEditAccess({ guildId: context.guildId, member: context.member }))) {
    logAskEvent('plan.apply_denied', { ...denyCtx(entry), reason: 'wrong_requester' });
    return { components: [buildWriteErrorContainer('Only the admin who requested this plan can apply it, in the server it was made for.')] };
  }
  if (!entry.plan) {
    // The applied entry is re-remembered with plan:null for Keep Editing — a stray
    // Apply click on a stale preview must not crash into applyPlan(null).
    logAskEvent('plan.apply_denied', { ...denyCtx(entry), reason: 'already_applied' });
    return { components: [buildWriteErrorContainer('This plan was already applied. Use Keep Editing to make further changes.', { stale: true })] };
  }
  consumePlan(planId); // one-shot from here — a double-click gets "expired"
  const applyCtx = {
    eid: entry.eid || context.customId, cid: entry.cid, pid: planId,
    gid: entry.guildId, uid: context.userId, route: entry.isPublicRoute ? 'edit_public' : 'edit',
    model: entry.model, query: entry.query,
    latency_from_propose_ms: entry.proposedAt ? Date.now() - entry.proposedAt : null
  };

  const { applyPlan, PlanStaleError } = await import('./safariPlanApplier.js');
  try {
    const { summary } = await applyPlan(entry.guildId, entry.plan, { userId: context.userId, client: context.client, query: entry.query });

    // ✅ THE ACCEPT LABEL — the admin looked at the proposal and took it.
    logAskEvent('plan.applied', {
      ...applyCtx,
      safari_mutations: summary.safariMutations, player_mutations: summary.playerMutations,
      created: summary.created, lines: summary.lines, warnings: summary.warnings,
      anchors_refreshed: summary.anchorsRefreshed, snapshot: summary.snapshot
    });

    // Keep the exchange available for "Keep Editing" (the plan itself is gone).
    rememberPlan(planId, { ...entry, plan: null, applied: true });

    // Posted-card route: public audit trail in the channel it was requested from.
    if (entry.isPublicRoute && entry.channelId) {
      try {
        const { DiscordRequest } = await import('./utils.js');
        await DiscordRequest(`channels/${entry.channelId}/messages`, {
          method: 'POST',
          body: { components: [buildPublicSummaryContainer({ userId: context.userId, summary, query: entry.query })], flags: (1 << 15) }
        });
      } catch (error) {
        console.log(`🛠️ Public summary post failed: ${error.message}`);
      }
    }

    const { main, followUps } = buildResultMessages({ summary, planId });
    // Overflow lines ride as ephemeral follow-ups sent here (the factory PATCHes `main`
    // into the preview message when we return).
    if (followUps.length && context.token) {
      try {
        const { createFollowupMessage } = await import('./buttonHandlerFactory.js');
        for (const container of followUps) {
          await createFollowupMessage(context.token, { components: [container], ephemeral: true });
        }
      } catch (error) {
        console.log(`🛠️ Result overflow follow-up failed: ${error.message}`);
      }
    }
    return { components: [main] };
  } catch (error) {
    if (error instanceof PlanStaleError) {
      logAskEvent('plan.apply_failed', { ...applyCtx, reason: 'stale', errors: error.validation?.errors });
      const details = error.validation.errors.slice(0, 6).map(e => e.message).join('\n');
      return { components: [buildWriteErrorContainer(details || error.message, { stale: true })] };
    }
    logAskEvent('plan.apply_failed', {
      ...applyCtx, reason: 'partial_commit', message: error.message,
      committed_n: error.summary?.lines?.length || 0
    });
    console.error('🛠️ Ask CastBot APPLY error:', error);
    // error.summary (attached by applyPlan) records exactly what committed before the
    // failure — render it so the admin is never told less than the truth.
    return { components: [buildWriteErrorContainer(error.message, { committed: error.summary })] };
  }
}

export function handlePlanCancel(context) {
  const planId = context.customId.replace('askcb_plan_cancel_', '');
  // Bind to the requester — a forged custom_id must not cancel someone else's pending plan.
  const entry = recallPlan(planId);
  const matched = !!(entry && entry.userId === context.userId);
  if (matched) consumePlan(planId);
  // ❌ THE REJECT LABEL — the admin read the proposal and turned it down. Paired with
  // plan.applied on the same pid, this is the accept rate the corpus exists to measure.
  logAskEvent('plan.cancelled', {
    eid: entry?.eid || context.customId, cid: entry?.cid, pid: planId,
    gid: context.guildId, uid: context.userId, route: 'cancel',
    query: entry?.query, model: entry?.model, matched,
    latency_from_propose_ms: entry?.proposedAt ? Date.now() - entry.proposedAt : null
  });
  return {
    components: [{
      type: 17,
      accent_color: 0x95a5a6,
      components: [
        { type: 10, content: `## 🗑️ Plan discarded\nNothing was changed.` },
        { type: 1, components: [
          { type: 2, custom_id: 'askcb_ask', label: 'New Question', style: 1, emoji: { name: '👾' } }
        ]}
      ]
    }]
  };
}

/** Recall a prior exchange for the Refine / Keep Editing modal prefill. */
export function recallWriteExchange(planId) {
  if (!planId) return null;
  const entry = global.askCastBotPlans?.get(planId);
  if (!entry) return null;
  return { query: entry.query || '', reply: entry.reply || '', model: entry.model, isPublicRoute: !!entry.isPublicRoute };
}
