/**
 * Channel Administration — PURE planning logic.
 *
 * Zero Discord/storage imports on purpose: this is the entire unit-test surface for the
 * framework (tests/channelPlan.test.js replicates nothing — it imports these directly).
 * Everything that can be decided without talking to Discord is decided here.
 *
 * Pure module — NO top-level console.log (see feedback_node_test_stdout).
 */
import {
  GUILD_CHANNEL_LIMIT,
  GUILD_CATEGORY_LIMIT,
  MAX_CHANNELS_PER_CATEGORY,
  GUILD_ROLE_LIMIT,
  CHANNEL_KINDS,
  PACE_CREATE
} from './channelAdminConfig.js';

/**
 * Slugify a Discord display name for use in a channel name.
 *
 * Deliberately NOT applicationManager.sanitizeChannelName: that one strips whitespace
 * entirely ("User Name" → "username"), returns '' for emoji-only names, and truncates to
 * 90 — which makes `${name}-confessional` 103 chars and Discord rejects it with a 400.
 *
 * @param {string} displayName
 * @param {Object} [opts]
 * @param {number} [opts.max=80] - max slug length BEFORE any suffix
 * @param {string} [opts.userId] - fallback discriminator source when the name slugs to nothing
 * @returns {string} a non-empty [a-z0-9-] slug
 */
export function toSlug(displayName, { max = 80, userId = '' } = {}) {
  const slug = String(displayName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // fold accents: José -> Jose
    .replace(/[^a-zA-Z0-9]+/g, '-')    // everything else (incl. spaces/emoji) → hyphen
    .replace(/-+/g, '-')               // collapse runs
    .replace(/^-|-$/g, '')             // trim
    .toLowerCase()
    .slice(0, max)
    .replace(/-$/, '');                // slice may have left a trailing hyphen

  // Emoji-only / punctuation-only names slug to '' — Discord rejects an empty name.
  if (!slug) return `player-${String(userId).slice(-4) || '0000'}`;
  return slug;
}

/**
 * 🏝️ Tribe Channels — resolve a host-supplied name template into a valid Discord channel name.
 * `%tribe%` is replaced with the tribe's name, then the WHOLE result is normalised: lowercase,
 * whitespace runs → single dash, dash runs collapsed, edges trimmed, ≤100 chars. Unlike toSlug,
 * emoji/unicode are KEPT — `💬%tribe%-chat` is the whole point of the template (Discord channel
 * names accept emoji; only spaces/uppercase are illegal). A template without `%tribe%` gets the
 * tribe appended — two tribes must never resolve to one name (adopt-by-name would merge them).
 * A template that normalises to nothing falls back to `{tribe}-{fallbackSuffix}`.
 * @param {string} template - e.g. '💬%tribe%-chat'
 * @param {string} tribeName - e.g. 'Balboa Tribe'
 * @param {Object} [opts]
 * @param {string} [opts.fallbackSuffix='chat'] - used when the template is empty/garbage
 * @returns {string} a non-empty, Discord-legal channel name
 */
export function formatTribeChannelName(template, tribeName, { fallbackSuffix = 'chat' } = {}) {
  const normalise = (s) => String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')            // spaces (incl. runs) → single dash
    .replace(/[#@:`"'<>]/g, '')      // the characters Discord/markdown actually choke on
    .replace(/-+/g, '-')             // collapse dash runs
    .replace(/^-|-$/g, '')           // trim edges
    .slice(0, 100)
    .replace(/-$/, '');

  const tpl = String(template ?? '').trim();

  const tribe = String(tribeName ?? '').trim() || 'tribe';
  const fallback = () => normalise(`${tribe}-${fallbackSuffix}`) || `tribe-${fallbackSuffix}`;

  // A template that contributes NOTHING of its own ('', '###', bare '%tribe%') would resolve
  // chat and challenges to the SAME name — and adopt-by-name would then merge the two channels.
  // Force the per-kind fallback instead, which keeps the pair distinct.
  if (!normalise(tpl.replaceAll('%tribe%', ''))) return fallback();

  const withTribe = tpl.includes('%tribe%') ? tpl.replaceAll('%tribe%', tribe) : `${tpl}-${tribe}`;
  return normalise(withTribe) || fallback();
}

/**
 * Build a channel name for a given kind, guaranteed ≤100 chars (Discord's hard limit).
 * @param {'confessional'|'subs'|'oneonone'} kind
 * @param {Array<{displayName: string, userId: string}>} parts - 1 member, or 2 for a 1on1
 * @param {Object} [opts]
 * @param {string} [opts.discriminator] - appended when a batch detects a slug collision
 * @returns {string}
 */
export function channelName(kind, parts, { discriminator = '' } = {}) {
  const cfg = CHANNEL_KINDS[kind];
  if (!cfg) throw new Error(`channelName: unknown kind '${kind}'`);

  const disc = discriminator ? `-${discriminator}` : '';
  const slugs = parts.map(p => toSlug(p.displayName, { max: cfg.slugMax, userId: p.userId }));
  const base = slugs.join('-');
  const name = `${base}${cfg.suffix}${disc}`;

  // Belt-and-braces: the per-kind budgets already guarantee this, but never emit >100.
  return name.slice(0, 100).replace(/-$/, '');
}

/**
 * Stable identity for an unordered pair of players.
 *
 * MUST compare as BigInt: snowflakes vary in length, and lexicographically
 * '999999999999999999' (17 digits) > '1000000000000000000' (18 digits), which would
 * yield two different keys for the same pair across runs → duplicate channels.
 *
 * @param {string} a
 * @param {string} b
 * @returns {string} `${lo}_${hi}`
 */
export function pairKey(a, b) {
  const [x, y] = [String(a), String(b)];
  return BigInt(x) <= BigInt(y) ? `${x}_${y}` : `${y}_${x}`;
}

/**
 * All unordered pairs from a member list. n<2 → []. Duplicates removed.
 * @param {string[]} memberIds
 * @returns {Array<{pairKey: string, a: string, b: string}>}
 */
export function enumeratePairs(memberIds) {
  const ids = [...new Set((memberIds || []).map(String))];
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i], ids[j]);
      const [a, b] = key.split('_');
      pairs.push({ pairKey: key, a, b });
    }
  }
  return pairs;
}

/**
 * Collapse permission overwrites so no Discord ID appears twice.
 *
 * MANDATORY before every create/edit: a duplicate overwrite ID makes Discord reject the
 * ENTIRE channels.create() with a 400. This is not hypothetical — the Trusted Spectator
 * role is very likely also in permissions.globalRoleAccess, and getRoleAccessOverwrites
 * only dedupes @everyone (roleAccessUtils.js:51).
 *
 * Semantics: allow/deny bits are unioned per id; a bit denied anywhere wins over allow.
 * Insertion order is preserved (the @everyone deny stays first).
 *
 * @param {Array<{id: string, allow?: bigint[], deny?: bigint[]}>} entries
 * @returns {Array<{id: string, allow: bigint[], deny: bigint[]}>}
 */
export function mergeOverwrites(entries) {
  const byId = new Map();
  for (const e of entries || []) {
    if (!e?.id) continue;
    const cur = byId.get(e.id) || { id: e.id, allow: new Set(), deny: new Set() };
    for (const bit of e.allow || []) cur.allow.add(bit);
    for (const bit of e.deny || []) cur.deny.add(bit);
    byId.set(e.id, cur);
  }
  return [...byId.values()].map(({ id, allow, deny }) => {
    // deny wins: a bit present in both is denied only.
    const allowBits = [...allow].filter(bit => !deny.has(bit));
    return { id, allow: allowBits, deny: [...deny] };
  });
}

/**
 * Assemble the full overwrite array for one channel.
 *
 * Order matters for determinism: @everyone deny first, host entries last (per
 * getRoleAccessOverwrites' contract — it never carries deny bits and must follow the deny).
 *
 * @param {Object} p
 * @param {string} p.everyoneId - guild.roles.everyone.id (=== guild id)
 * @param {Array<{id: string, allow: bigint[]}>} p.principals - the player(s): role and/or user entries
 * @param {string|null} [p.spectatorRoleId] - Trusted Spectator (confessionals only)
 * @param {bigint[]} [p.spectatorAccess]
 * @param {Array<{id: string, allow: bigint[]}>} [p.roleAccessEntries] - from getRoleAccessOverwrites
 * @param {bigint} p.viewChannelBit - PermissionFlagsBits.ViewChannel (injected to keep this module pure)
 * @returns {Array<{id: string, allow: bigint[], deny: bigint[]}>}
 */
export function buildOverwrites({
  everyoneId,
  principals = [],
  spectatorRoleId = null,
  spectatorAccess = [],
  roleAccessEntries = [],
  viewChannelBit
}) {
  return mergeOverwrites([
    { id: everyoneId, deny: [viewChannelBit] },
    ...principals,
    ...(spectatorRoleId ? [{ id: spectatorRoleId, allow: spectatorAccess }] : []),
    ...roleAccessEntries
  ]);
}

/**
 * Check a planned run against Discord's guild ceilings BEFORE touching the API.
 * Categories count toward the 500-channel limit as well as their own 50 limit.
 *
 * @param {Object} p
 * @param {{channels: number, categories: number, roles: number}} p.existing
 * @param {{channels: number, categories: number, roles: number}} p.create
 * @returns {{ok: boolean, violations: Array, after: Object, etaSeconds: number}}
 */
export function preflightBudget({ existing, create }) {
  const ex = { channels: 0, categories: 0, roles: 0, ...(existing || {}) };
  const cr = { channels: 0, categories: 0, roles: 0, ...(create || {}) };

  // Every category IS a channel as far as the 500 limit is concerned.
  const after = {
    channels: ex.channels + cr.channels + cr.categories,
    categories: ex.categories + cr.categories,
    roles: ex.roles + cr.roles
  };

  const violations = [];
  if (after.channels > GUILD_CHANNEL_LIMIT) {
    violations.push({ ceiling: 'channels', limit: GUILD_CHANNEL_LIMIT, current: ex.channels, after: after.channels });
  }
  if (after.categories > GUILD_CATEGORY_LIMIT) {
    violations.push({ ceiling: 'categories', limit: GUILD_CATEGORY_LIMIT, current: ex.categories, after: after.categories });
  }
  if (after.roles > GUILD_ROLE_LIMIT) {
    violations.push({ ceiling: 'roles', limit: GUILD_ROLE_LIMIT, current: ex.roles, after: after.roles });
  }

  // Creation is paced at PACE_CREATE.n per PACE_CREATE.ms (~1/sec).
  const units = cr.channels + cr.categories + cr.roles;
  const etaSeconds = Math.ceil((units / PACE_CREATE.n) * (PACE_CREATE.ms / 1000));

  return { ok: violations.length === 0, violations, after, etaSeconds };
}

/**
 * Distribute items into categories, honouring the 50-children-per-category ceiling and
 * topping up a partially-filled existing category first.
 *
 * No existing code handles this — mapExplorer chunks by index only and never checks the
 * guild's category ceiling.
 *
 * @param {Array} items
 * @param {Object} p
 * @param {string} p.baseName - e.g. '1 on 1s' → '1 on 1s', '1 on 1s 2', …
 * @param {number} [p.capacity=50]
 * @param {Array<{id: string, name: string, childCount: number}>} [p.existing] - our known categories, in order
 * @returns {Array<{categoryName: string, categoryId: string|null, items: Array}>}
 */
export function planCategoryBuckets(items, { baseName, capacity = MAX_CHANNELS_PER_CATEGORY, existing = [] } = {}) {
  const list = items || [];
  if (list.length === 0) return [];

  const buckets = [];
  let cursor = 0;

  // Fill existing categories that still have room, in order.
  for (const cat of existing) {
    if (cursor >= list.length) break;
    const room = Math.max(0, capacity - (cat.childCount || 0));
    if (room === 0) continue;
    buckets.push({
      categoryName: cat.name,
      categoryId: cat.id,
      items: list.slice(cursor, cursor + room)
    });
    cursor += room;
  }

  // Overflow into new categories, numbered after however many we already have.
  let index = existing.length;
  while (cursor < list.length) {
    index += 1;
    buckets.push({
      categoryName: index === 1 ? baseName : `${baseName} ${index}`,
      categoryId: null,
      items: list.slice(cursor, cursor + capacity)
    });
    cursor += capacity;
  }

  return buckets;
}

/**
 * Category base name from the modal's free-text input. Categories allow spaces/caps/emoji, so
 * this is NOT channel-slugging — just whitespace collapse + a length cap that leaves room for
 * overflow suffixes (' 2') and tribe-name prefixes under Discord's 100-char channel-name limit.
 */
export function sanitizeCategoryBase(input, fallback = 'Subs') {
  const s = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s || fallback;
}

/**
 * Subs category placement (RaP 0881): where do subs channels live?
 *
 *   keep      — today's behaviour: default buckets via planCategoryBuckets, NEVER moves anything
 *   single    — one category tree named `baseName`; existing channels elsewhere are MOVED in
 *   per_tribe — one category per draft tribe (`{Tribe} {baseName}`); tribe-less players fall
 *               back to the single-category tree; existing channels are MOVED to match
 *
 * Pure — carries the unit-test surface. Movement here is a PLAN (for the confirm screen);
 * exec re-checks the live parent before actually moving.
 *
 * Tribe buckets are keyed by tribeRoleId, never name: duplicate tribe names are legal in
 * Discord and name-keying could merge two tribes' categories (RaP 0892 adopt-by-name hazard).
 *
 * @param {Array<{userId: string}>} items - members (or convert items) being planned
 * @param {Object} p
 * @param {'keep'|'single'|'per_tribe'} [p.placement]
 * @param {string} [p.baseName] - already-sanitized category base (callers pass the default for 'keep')
 * @param {Map<string, Array<{roleId: string, name: string}>>} [p.tribesByUser] - draft tribes per user
 * @param {Object<string, {id: string, childCount: number}>} [p.tribeCategories] - live registry categories per tribeRoleId
 * @param {Array<{id: string, name: string, childCount: number}>} [p.existing] - live default-tree categories
 * @param {Map<string, {channelId: string, parentId: string|null}>} [p.channelsByUser] - live existing channels
 * @param {number} [p.capacity]
 * @returns {{buckets: Array<{categoryName, categoryId, tribeRoleId, items}>,
 *            moves: Array<{userId, channelId, fromParentId, toName}>,
 *            tribeless: Array, multiTribe: Array<{userId, displayName, tribes}>}}
 */
export function planSubsPlacement(items, {
  placement = 'keep',
  baseName = 'Subs',
  tribesByUser = new Map(),
  tribeCategories = {},
  existing = [],
  channelsByUser = new Map(),
  capacity = MAX_CHANNELS_PER_CATEGORY
} = {}) {
  const list = items || [];
  const tagged = (buckets, tribeRoleId = null) => buckets.map((b) => ({ ...b, tribeRoleId }));

  if (placement === 'keep' || !list.length) {
    return {
      buckets: tagged(planCategoryBuckets(list, { baseName, existing, capacity })),
      moves: [], tribeless: [], multiTribe: []
    };
  }

  // A custom name must not top up categories from a DIFFERENT tree — only the exact name and
  // its numeric overflow buckets ('Subs 2') count. A bare startsWith would swallow siblings
  // like 'Subs HQ Notes'.
  const isOverflow = (n) => n.startsWith(`${baseName} `) && /^\d+$/.test(n.slice(baseName.length + 1));
  const matched = existing.filter((c) => c.name === baseName || isOverflow(c.name));

  let buckets;
  let tribeless = [];
  const multiTribe = [];

  if (placement === 'single') {
    buckets = tagged(planCategoryBuckets(list, { baseName, existing: matched, capacity }));
  } else {
    // per_tribe — group by FIRST draft tribe; collect the ambiguous and the tribe-less.
    const byTribe = new Map(); // roleId → { name, items }
    for (const m of list) {
      const tribes = tribesByUser.get(m.userId) || [];
      if (!tribes.length) {
        tribeless.push(m);
        continue;
      }
      if (tribes.length > 1) multiTribe.push({ userId: m.userId, displayName: m.displayName, tribes: tribes.map((t) => t.name) });
      const t = tribes[0];
      if (!byTribe.has(t.roleId)) byTribe.set(t.roleId, { name: t.name, items: [] });
      byTribe.get(t.roleId).items.push(m);
    }

    buckets = [...byTribe.entries()].map(([roleId, t]) => ({
      categoryName: `${t.name} ${baseName}`.slice(0, 100),
      categoryId: tribeCategories[roleId]?.id || null,
      tribeRoleId: roleId,
      items: t.items
    }));
    buckets.push(...tagged(planCategoryBuckets(tribeless, { baseName, existing: matched, capacity })));
  }

  // Existing channels not already under their planned category get moved (null categoryId =
  // the category doesn't exist yet, so an existing channel can't be in it).
  const moves = [];
  for (const b of buckets) {
    for (const m of b.items) {
      const ch = channelsByUser.get(m.userId);
      if (!ch) continue;
      if (!b.categoryId || ch.parentId !== b.categoryId) {
        moves.push({ userId: m.userId, channelId: ch.channelId, fromParentId: ch.parentId || null, toName: b.categoryName });
      }
    }
  }

  return { buckets, moves, tribeless, multiTribe };
}

/**
 * Assign collision discriminators so no two members in one batch produce the same channel name.
 * Deterministic: ties are broken by userId order, so re-runs derive identical names.
 *
 * @param {Array<{userId: string, displayName: string}>} members
 * @param {'confessional'|'subs'} kind
 * @returns {Map<string, string>} userId → final channel name
 */
export function assignChannelNames(members, kind) {
  const byName = new Map();
  for (const m of [...(members || [])].sort((a, b) => String(a.userId).localeCompare(String(b.userId)))) {
    const base = channelName(kind, [m]);
    const seen = byName.get(base);
    if (!seen) byName.set(base, [m]);
    else seen.push(m);
  }

  const result = new Map();
  for (const [base, members_] of byName) {
    if (members_.length === 1) {
      result.set(members_[0].userId, base);
      continue;
    }
    // Collision (e.g. two "José") — discriminate by the tail of each userId.
    for (const m of members_) {
      result.set(m.userId, channelName(kind, [m], { discriminator: String(m.userId).slice(-4) }));
    }
  }
  return result;
}

/**
 * The guild's most recently touched season.
 *
 * Season-LESS entry points need *a* configId: the ⭐ Premium menu's Channels section (which has
 * no season context at all) and the player alliance-request flow. `activeSeason` is NOT usable
 * for this — only 1 of 190 guilds has ever set it — so recency is the best available signal, and
 * it's the same ordering castlistHandlers.js:98-110 already uses to pick a default season.
 *
 * Pure on purpose: takes the already-loaded playerData rather than loading it, so it unit-tests
 * and so callers keep control of their own load (no hidden I/O inside a render path).
 *
 * @param {Object} playerData
 * @param {string} guildId
 * @returns {string|null} configId, or null when the guild has no seasons at all
 */
export function mostRecentConfigId(playerData, guildId) {
  const configs = Object.entries(playerData?.[guildId]?.applicationConfigs || {});
  if (!configs.length) return null;
  configs.sort(([, a], [, b]) => (b?.lastUpdated || b?.createdAt || 0) - (a?.lastUpdated || a?.createdAt || 0));
  return configs[0][0];
}
