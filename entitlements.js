/**
 * 🎟️ Entitlements — runtime per-guild feature grants (the premium hook).
 *
 * Replaces hardcoded guild whitelists for gated features, starting with Ask CastBot's
 * Safari Editing (`safari_edit`). Reece grants/revokes guilds at runtime from the
 * Entitlements UI in Reece's Stuff — no deploy needed. When premium (ko-fi) lands,
 * the payment flow calls grantFeature() and everything downstream just works.
 *
 * Data file: entitlements.json (Tier 2 — gitignored, atomicSave, Discord-backed via
 * backupService). Shape:
 *   { "guilds": { "<guildId>": { "name": "…", "features": ["safari_edit"],
 *                               "addedBy": "<userId>", "addedAt": <ms> } } }
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
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicSave } from './atomicSave.js';
import { ALLOWED_GUILD_IDS } from './askCastBot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTITLEMENTS_FILE = path.join(__dirname, 'entitlements.json');

/** Feature keys in use. Add new gated features here so typos fail loudly in review. */
export const FEATURES = {
  SAFARI_EDIT: 'safari_edit'
};

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
      addedAt: entry?.addedAt || null
    };
  }
  return { guilds: clean };
}

function seedData() {
  const guilds = {};
  for (const guildId of ALLOWED_GUILD_IDS) {
    guilds[guildId] = {
      name: guildId, // real names can be filled in from the Entitlements UI
      features: [FEATURES.SAFARI_EDIT],
      addedBy: 'seed',
      addedAt: Date.now()
    };
  }
  return { guilds };
}

/**
 * Load (and lazily seed) the entitlements registry.
 * @returns {Promise<{guilds: Object}>}
 */
export async function loadEntitlements() {
  if (_cache) return _cache;
  try {
    const raw = await fs.readFile(ENTITLEMENTS_FILE, 'utf8');
    _cache = normalize(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // Corrupt file: refuse to guess — features stay OFF until a human looks.
      // (Failing open here would grant write access on a parse error.)
      console.error('🎟️ Entitlements file unreadable — features disabled until fixed:', error.message);
      return { guilds: {} }; // deliberately NOT cached, retried next call
    }
    console.log('🎟️ Entitlements: seeding first-run registry with Ask CastBot guilds');
    _cache = seedData();
    await saveEntitlements(_cache);
  }
  return _cache;
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
  if (!guildId || !feature) return false;
  const data = await loadEntitlements();
  return !!data.guilds[guildId]?.features?.includes(feature);
}

/**
 * Sync cached variant for SYNC render paths (menuBuilder display gates). Reads the
 * warm cache; on a cold cache it kicks off a background load and returns false — the
 * button appears from the next render on. Display-only: handlers use the async gate.
 */
export function hasFeatureSync(guildId, feature) {
  if (!guildId || !feature) return false;
  if (!_cache) {
    loadEntitlements().catch(() => {});
    return false;
  }
  return !!_cache.guilds[guildId]?.features?.includes(feature);
}

/**
 * Grant a feature to a guild (creates the guild entry if new).
 * @param {string} guildId
 * @param {string} feature
 * @param {{name?: string, addedBy?: string}} [meta]
 * @returns {Promise<{guilds: Object}>} the saved registry
 */
export async function grantFeature(guildId, feature, { name, addedBy } = {}) {
  if (!/^\d{5,}$/.test(String(guildId))) throw new Error(`Invalid guild ID: ${guildId}`);
  const data = await loadEntitlements();
  const entry = data.guilds[guildId] || { name: name || guildId, features: [], addedBy: addedBy || null, addedAt: Date.now() };
  if (name) entry.name = name;
  if (!entry.features.includes(feature)) entry.features.push(feature);
  data.guilds[guildId] = entry;
  console.log(`🎟️ Entitlements: granted ${feature} to guild ${guildId} (${entry.name}) by ${addedBy || 'unknown'}`);
  return saveEntitlements(data);
}

/**
 * Revoke a feature from a guild. Removes the guild entry entirely when it holds no
 * features afterwards.
 * @returns {Promise<{guilds: Object}>}
 */
export async function revokeFeature(guildId, feature) {
  const data = await loadEntitlements();
  const entry = data.guilds[guildId];
  if (!entry) return data;
  entry.features = entry.features.filter(f => f !== feature);
  if (entry.features.length === 0) delete data.guilds[guildId];
  console.log(`🎟️ Entitlements: revoked ${feature} from guild ${guildId}`);
  return saveEntitlements(data);
}

/**
 * List guilds holding a feature, for the Entitlements UI.
 * @param {string} [feature] - omit for all guilds
 * @returns {Promise<Array<{guildId: string, name: string, features: string[]}>>}
 */
export async function listEntitledGuilds(feature = null) {
  const data = await loadEntitlements();
  return Object.entries(data.guilds)
    .filter(([, entry]) => !feature || entry.features.includes(feature))
    .map(([guildId, entry]) => ({ guildId, name: entry.name, features: entry.features }));
}

/** Test seam — reset the module cache (node:test only). */
export function __resetEntitlementsCache() {
  _cache = null;
}
