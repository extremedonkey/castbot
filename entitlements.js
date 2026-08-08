/**
 * 🎟️ Entitlements — runtime per-guild feature grants (the premium hook).
 *
 * Replaces hardcoded guild whitelists for gated features, starting with Ask CastBot's
 * Safari Editing (`safari_edit`). Reece grants/revokes guilds at runtime from the
 * Entitlements UI in Reece's Stuff — no deploy needed. When premium (ko-fi) lands,
 * the payment flow calls grantFeature() and everything downstream just works.
 *
 * Data file: entitlements.json (Tier 2 — gitignored, atomicSave, Discord-backed via
 * backupService). Shape (v2 — tier fields optional, v1 records unchanged):
 *   { "guilds": { "<guildId>": { "name": "…", "features": ["safari_edit"],
 *                               "addedBy": "<userId>", "addedAt": <ms>,
 *                               "tier": "premium", "validUntil": <ms>|null,
 *                               "source": "manual", "grantedBy": "…", "grantedAt": <ms>,
 *                               "reason": "…" } } }
 * Tier lifecycle: active → (validUntil passes) grace (GRACE_MS) → lapsed. Features from
 * a tier work through grace; à-la-carte `features` grants never expire (v1 semantics).
 *
 * SEEDING: on first load (file absent) the 7 ALLOWED_GUILD_IDS from askCastBot.js are
 * seeded with `safari_edit` — per Reece 2026-07-28: "all 7 whitelisted guilds but give
 * me somewhere in the UI to punch in a guild ID".
 *
 * CACHING: this process is the only writer, so the parsed file is cached forever and
 * invalidated on our own saves. A hand-edited file needs a bot restart to be seen.
 *
 * @module entitlements
 */

import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicSave } from './atomicSave.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTITLEMENTS_FILE = path.join(__dirname, 'entitlements.json');

/** Feature keys in use. Add new gated features here so typos fail loudly in review. */
export const FEATURES = {
  ASK_CASTBOT: 'ask_castbot',   // may use Ask CastBot at all (Q&A)
  SAFARI_EDIT: 'safari_edit'    // may additionally make changes (admins only)
};

/**
 * Tier → feature bundles (RaP 0891: tiers live in code, features are code anyway).
 * A guild's effective features = its à-la-carte `features` array (permanent, v1)
 * UNION its tier's bundle while the tier is active or in grace.
 */
export const TIERS = {
  premium: {
    label: 'Premium',
    emoji: '⭐',
    features: [FEATURES.ASK_CASTBOT, FEATURES.SAFARI_EDIT]
  }
};

/** Grace window after validUntil passes: features keep working, UI nags (RaP 0891). */
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parse a human duration ("30d", "12h", "45min", "2w", "3mo", bare number = days,
 * ""/"perm"/"permanent" = no expiry). Bare "m" is REJECTED as ambiguous (min vs month).
 * Minutes exist deliberately — they make expiry/grace testable in real time.
 * @returns {{ok: true, ms: number|null} | {ok: false, error: string}} ms null = permanent
 */
export function parseDuration(input) {
  const t = String(input ?? '').trim().toLowerCase();
  if (t === '' || t === 'perm' || t === 'permanent' || t === 'forever') return { ok: true, ms: null };
  const m = /^(\d+)\s*(min|h|d|w|mo)?$/.exec(t);
  if (!m) return { ok: false, error: `Can't parse "${String(input).trim()}" — use e.g. 30d, 12h, 45min, 2w, 3mo, or "permanent"` };
  const n = parseInt(m[1], 10);
  if (n <= 0) return { ok: false, error: 'Duration must be positive' };
  const UNIT_MS = { min: 60000, h: 3600000, d: 86400000, w: 604800000, mo: 2592000000 };
  return { ok: true, ms: n * UNIT_MS[m[2] || 'd'] };
}

/**
 * Resolve a guild entry's tier lifecycle state. Pure — the lazy-expiry heart of
 * RaP 0891: no cron needed for correctness, every gate just asks at check time.
 * @param {Object} entry - guild entry from the registry (may be undefined)
 * @param {number} [now]
 * @returns {{state: 'none'|'active'|'grace'|'lapsed', tier: string|null, permanent?: boolean,
 *            validUntil?: number|null, graceUntil?: number|null}}
 */
export function resolveTierState(entry, now = Date.now()) {
  if (!entry?.tier || !TIERS[entry.tier]) return { state: 'none', tier: null };
  const { tier, validUntil } = entry;
  if (validUntil == null) return { state: 'active', tier, permanent: true, validUntil: null, graceUntil: null };
  const graceUntil = validUntil + GRACE_MS;
  if (now <= validUntil) return { state: 'active', tier, permanent: false, validUntil, graceUntil };
  if (now <= graceUntil) return { state: 'grace', tier, permanent: false, validUntil, graceUntil };
  return { state: 'lapsed', tier, permanent: false, validUntil, graceUntil };
}

/**
 * First-run seed. This list OWNS no runtime behaviour once entitlements.json exists —
 * it only populates the registry the first time, after which the Entitlements UI is the
 * source of truth. (Lives here, not in askCastBot.js, to keep the import one-directional:
 * askCastBot → entitlements, never back.)
 */
export const SEED_GUILD_IDS = [
  '1331657596087566398',
  '1527107915637588059',
  '1385679393237635122',
  '1524773737973682267',
  '1512093418602364998',
  '974318870057848842',
  '1308581797915005029'
];

let _cache = null;

/** Shape guard for anything we load or are about to save. */
function normalize(data) {
  const guilds = (data && typeof data.guilds === 'object' && data.guilds) || {};
  const clean = {};
  for (const [guildId, entry] of Object.entries(guilds)) {
    if (!/^\d{5,}$/.test(guildId)) continue; // snowflakes only
    clean[guildId] = {
      name: String(entry?.name || guildId),
      features: Array.isArray(entry?.features) ? entry.features.filter(f => typeof f === 'string') : [],
      addedBy: entry?.addedBy || null,
      addedAt: entry?.addedAt || null,
      // v2 tier fields — carried only when the tier is a known one (unknown tier on a
      // hand-edited file degrades to feature-only rather than granting by accident)
      ...(entry?.tier && TIERS[entry.tier] ? {
        tier: entry.tier,
        validUntil: Number.isFinite(entry.validUntil) ? entry.validUntil : null,
        source: entry.source === 'subscription' ? 'subscription' : 'manual',
        grantedBy: entry.grantedBy || null,
        grantedAt: entry.grantedAt || null,
        ...(typeof entry.reason === 'string' && entry.reason ? { reason: entry.reason } : {})
      } : {}),
      // Ko-fi billing link — renewals from this email auto-extend this guild's tier
      ...(typeof entry?.kofiEmail === 'string' && entry.kofiEmail ? { kofiEmail: entry.kofiEmail.toLowerCase() } : {})
    };
  }
  return { guilds: clean };
}

function seedData() {
  const guilds = {};
  for (const guildId of SEED_GUILD_IDS) {
    guilds[guildId] = {
      name: guildId, // real names can be filled in from the Entitlements UI
      features: [FEATURES.ASK_CASTBOT, FEATURES.SAFARI_EDIT],
      addedBy: 'seed',
      addedAt: Date.now()
    };
  }
  return { guilds };
}

/**
 * Load the registry, SYNCHRONOUSLY, populating the cache on first touch.
 *
 * Sync on purpose: the menu builders are synchronous render functions and need to know
 * whether to draw the Ask CastBot buttons. The file is ~1KB and this process is its only
 * writer, so one readFileSync at first use is cheaper than threading async through every
 * render path (and safer than a cold-cache "false" that hides the button on first click).
 * @returns {{guilds: Object}}
 */
export function loadEntitlementsSync() {
  if (_cache) return _cache;
  try {
    _cache = normalize(JSON.parse(readFileSync(ENTITLEMENTS_FILE, 'utf8')));
    // BACKFILL (2026-07-29): registries written before `ask_castbot` existed hold only
    // `safari_edit`, and safari_edit was only ever granted to Ask CastBot guilds — so
    // every such guild is entitled to the Q&A too. Without this they'd lose the button
    // the moment the gate started reading this file.
    let backfilled = 0;
    for (const entry of Object.values(_cache.guilds)) {
      if (entry.features.includes(FEATURES.SAFARI_EDIT) && !entry.features.includes(FEATURES.ASK_CASTBOT)) {
        entry.features.unshift(FEATURES.ASK_CASTBOT);
        backfilled++;
      }
    }
    if (backfilled) {
      console.log(`🎟️ Entitlements: backfilled ask_castbot for ${backfilled} guild(s)`);
      saveEntitlements(_cache).catch(e => console.error('🎟️ Entitlements backfill save failed:', e.message));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // Corrupt file: refuse to guess — features stay OFF until a human looks.
      // (Failing open here would grant edit access on a parse error.) Not cached, so a
      // fixed file is picked up without a restart.
      console.error('🎟️ Entitlements file unreadable — features disabled until fixed:', error.message);
      return { guilds: {} };
    }
    console.log('🎟️ Entitlements: seeding first-run registry with the Ask CastBot guilds');
    _cache = seedData();
    saveEntitlements(_cache).catch(e => console.error('🎟️ Entitlements seed save failed:', e.message));
  }
  return _cache;
}

/**
 * Load (and lazily seed) the entitlements registry.
 * @returns {Promise<{guilds: Object}>}
 */
export async function loadEntitlements() {
  return loadEntitlementsSync();
}

async function saveEntitlements(data) {
  const clean = normalize(data);
  await atomicSave(ENTITLEMENTS_FILE, clean, {
    minSize: 15, // legitimately tiny file — this only blocks empty/garbage writes
    label: 'entitlements',
    validate: (d) => (d && typeof d.guilds === 'object')
      ? { ok: true } : { ok: false, reason: 'missing guilds object' },
    onSaved: () => { _cache = clean; }
  });
  return clean;
}

/**
 * Does this guild hold this feature?
 * @param {string} guildId
 * @param {string} feature - one of FEATURES
 * @returns {Promise<boolean>}
 */
export async function hasFeature(guildId, feature) {
  return hasFeatureSync(guildId, feature);
}

/** Sync variant — the real implementation (see loadEntitlementsSync). */
export function hasFeatureSync(guildId, feature) {
  if (!guildId || !feature) return false;
  const entry = loadEntitlementsSync().guilds[guildId];
  if (!entry) return false;
  if (entry.features?.includes(feature)) return true; // permanent à-la-carte grant (v1)
  const ts = resolveTierState(entry);
  if (ts.state !== 'active' && ts.state !== 'grace') return false; // grace keeps working (RaP 0891)
  return TIERS[ts.tier].features.includes(feature);
}

/**
 * Does this guild hold CastBot Premium right now? True while the tier is active OR in
 * grace (RaP 0891: grace keeps working). This is the PREMIUM MENU gate — deliberately
 * tier-only: à-la-carte feature grants (the comp'd Ask CastBot guilds) unlock their
 * specific features via `premium:` declarations, not the whole premium surface.
 * @param {string} guildId
 * @returns {boolean}
 */
export function hasPremiumAccessSync(guildId) {
  if (!guildId) return false;
  const ts = resolveTierState(loadEntitlementsSync().guilds[guildId]);
  return ts.state === 'active' || ts.state === 'grace';
}

/**
 * Full resolved view of one guild's entitlement — the admin-UI read model.
 * @returns {{guildId: string, exists: boolean, name?: string, features?: string[],
 *            tierState?: ReturnType<typeof resolveTierState>, effectiveFeatures?: string[],
 *            source?: string, grantedBy?: string|null, reason?: string|null}}
 */
export function getGuildEntitlement(guildId) {
  const entry = loadEntitlementsSync().guilds[guildId];
  if (!entry) return { guildId, exists: false };
  const tierState = resolveTierState(entry);
  const tierFeatures = (tierState.state === 'active' || tierState.state === 'grace')
    ? TIERS[tierState.tier].features : [];
  return {
    guildId,
    exists: true,
    name: entry.name,
    features: [...entry.features],
    tierState,
    effectiveFeatures: [...new Set([...entry.features, ...tierFeatures])],
    source: entry.source || null,
    grantedBy: entry.grantedBy || null,
    reason: entry.reason || null
  };
}

/**
 * Grant a feature to a guild (creates the guild entry if new).
 * @param {string} guildId
 * @param {string} feature
 * @param {{name?: string, addedBy?: string}} [meta]
 * @returns {Promise<{guilds: Object}>} the saved registry
 */
export async function grantFeature(guildId, features, { name, addedBy } = {}) {
  if (!/^\d{5,}$/.test(String(guildId))) throw new Error(`Invalid guild ID: ${guildId}`);
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId] || { name: name || guildId, features: [], addedBy: addedBy || null, addedAt: Date.now() };
  if (name) entry.name = name;
  for (const feature of (Array.isArray(features) ? features : [features])) {
    if (!entry.features.includes(feature)) entry.features.push(feature);
  }
  data.guilds[guildId] = entry;
  console.log(`🎟️ Entitlements: granted ${entry.features.join('+')} to guild ${guildId} (${entry.name}) by ${addedBy || 'unknown'}`);
  return saveEntitlements(data);
}

/**
 * Revoke a feature from a guild. Removes the guild entry entirely when it holds no
 * features AND no tier afterwards.
 * @returns {Promise<{guilds: Object}>}
 */
export async function revokeFeature(guildId, features) {
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId];
  if (!entry) return data;
  const list = Array.isArray(features) ? features : [features];
  entry.features = entry.features.filter(f => !list.includes(f));
  if (entry.features.length === 0 && !entry.tier) delete data.guilds[guildId];
  console.log(`🎟️ Entitlements: revoked ${list.join('+')} from guild ${guildId}`);
  return saveEntitlements(data);
}

/**
 * Grant (or update) a tier on a guild. Expiry: explicit `validUntil` (ms) wins when
 * given (payment-anchored grants — redeem/webhook); else `durationMs` from now;
 * both null = permanent. Creates the guild entry if new.
 * @returns {Promise<{guilds: Object}>}
 */
export async function grantTier(guildId, tier, { name, addedBy, durationMs = null, validUntil, reason, source } = {}) {
  if (!/^\d{5,}$/.test(String(guildId))) throw new Error(`Invalid guild ID: ${guildId}`);
  if (!TIERS[tier]) throw new Error(`Unknown tier: ${tier}`);
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId] || { name: name || guildId, features: [], addedBy: addedBy || null, addedAt: Date.now() };
  if (name) entry.name = name;
  entry.tier = tier;
  entry.validUntil = validUntil !== undefined ? validUntil : (durationMs == null ? null : Date.now() + durationMs);
  entry.source = source === 'subscription' ? 'subscription' : 'manual';
  entry.grantedBy = addedBy || null;
  entry.grantedAt = Date.now();
  if (reason) entry.reason = reason;
  data.guilds[guildId] = entry;
  console.log(`🎟️ Entitlements: granted tier ${tier} to guild ${guildId} (${entry.name}) ` +
    `${entry.validUntil ? `until ${new Date(entry.validUntil).toISOString()}` : 'permanently'} by ${addedBy || 'unknown'}`);
  return saveEntitlements(data);
}

/**
 * Push a tier's expiry forward by extendMs, from validUntil or now (whichever is later)
 * so extending a lapsed guild restarts from today, not from the stale date.
 * Extending a permanent tier is a no-op.
 */
export async function extendTier(guildId, extendMs) {
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId];
  if (!entry?.tier) throw new Error(`Guild ${guildId} holds no tier to extend`);
  if (entry.validUntil == null) return data; // permanent — nothing to extend
  entry.validUntil = Math.max(entry.validUntil, Date.now()) + extendMs;
  console.log(`🎟️ Entitlements: extended ${entry.tier} for guild ${guildId} to ${new Date(entry.validUntil).toISOString()}`);
  return saveEntitlements(data);
}

/**
 * Set a tier's validUntil directly. This is the TEST-STUB primitive: "Expire Now" is
 * validUntil = now-1s (→ grace); "Lapse Now" is now - GRACE_MS - 1s (→ fully lapsed).
 * Real code paths, real file, no mocks — what expires in test is what expires in prod.
 */
export async function setTierValidUntil(guildId, validUntil) {
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId];
  if (!entry?.tier) throw new Error(`Guild ${guildId} holds no tier`);
  entry.validUntil = validUntil;
  const ts = resolveTierState(entry);
  console.log(`🎟️ Entitlements: set ${entry.tier} validUntil for guild ${guildId} to ` +
    `${validUntil == null ? 'permanent' : new Date(validUntil).toISOString()} (state now: ${ts.state})`);
  return saveEntitlements(data);
}

/**
 * Bind a Ko-fi payment email to a guild — renewals from this email then auto-extend
 * the guild's tier (src/kofi/kofiWebhook.js). One email per guild; latest link wins.
 */
export async function linkKofiEmail(guildId, email) {
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId];
  if (!entry) throw new Error(`Guild ${guildId} has no entitlements entry to link`);
  entry.kofiEmail = String(email).toLowerCase();
  console.log(`🎟️ Entitlements: linked Ko-fi email for guild ${guildId}`);
  return saveEntitlements(data);
}

/** @returns {string|null} guildId whose entry is linked to this Ko-fi email */
export function findGuildByKofiEmail(email) {
  const target = String(email || '').toLowerCase();
  if (!target) return null;
  for (const [guildId, entry] of Object.entries(loadEntitlementsSync().guilds)) {
    if (entry.kofiEmail === target) return guildId;
  }
  return null;
}

/**
 * Remove the tier (and its metadata) from a guild; à-la-carte features stay.
 * Removes the entry entirely when nothing is left.
 */
export async function revokeTier(guildId) {
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId];
  if (!entry) return data;
  delete entry.tier; delete entry.validUntil; delete entry.source;
  delete entry.grantedBy; delete entry.grantedAt; delete entry.reason;
  delete entry.kofiEmail; // unlink billing too — a revoked guild must not auto-re-extend on renewal
  if (entry.features.length === 0) delete data.guilds[guildId];
  console.log(`🎟️ Entitlements: revoked tier from guild ${guildId}`);
  return saveEntitlements(data);
}

/**
 * List guilds holding a feature (directly or via an active/grace tier), for the
 * Entitlements UI.
 * @param {string} [feature] - omit for all guilds
 * @returns {Promise<Array<{guildId: string, name: string, features: string[],
 *   tierState: ReturnType<typeof resolveTierState>}>>}
 */
export async function listEntitledGuilds(feature = null) {
  const data = loadEntitlementsSync();
  return Object.entries(data.guilds)
    .map(([guildId, entry]) => {
      const tierState = resolveTierState(entry);
      const tierFeatures = (tierState.state === 'active' || tierState.state === 'grace')
        ? TIERS[tierState.tier].features : [];
      return { guildId, name: entry.name, features: entry.features, tierState,
               effectiveFeatures: [...new Set([...entry.features, ...tierFeatures])] };
    })
    .filter(g => !feature || g.effectiveFeatures.includes(feature));
}

/** Test seam — reset the module cache (node:test only). */
export function __resetEntitlementsCache() {
  _cache = null;
}
