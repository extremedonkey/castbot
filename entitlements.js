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
      addedAt: entry?.addedAt || null
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
  return !!loadEntitlementsSync().guilds[guildId]?.features?.includes(feature);
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
 * features afterwards.
 * @returns {Promise<{guilds: Object}>}
 */
export async function revokeFeature(guildId, features) {
  const data = loadEntitlementsSync();
  const entry = data.guilds[guildId];
  if (!entry) return data;
  const list = Array.isArray(features) ? features : [features];
  entry.features = entry.features.filter(f => !list.includes(f));
  if (entry.features.length === 0) delete data.guilds[guildId];
  console.log(`🎟️ Entitlements: revoked ${list.join('+')} from guild ${guildId}`);
  return saveEntitlements(data);
}

/**
 * List guilds holding a feature, for the Entitlements UI.
 * @param {string} [feature] - omit for all guilds
 * @returns {Promise<Array<{guildId: string, name: string, features: string[]}>>}
 */
export async function listEntitledGuilds(feature = null) {
  const data = loadEntitlementsSync();
  return Object.entries(data.guilds)
    .filter(([, entry]) => !feature || entry.features.includes(feature))
    .map(([guildId, entry]) => ({ guildId, name: entry.name, features: entry.features }));
}

/** Test seam — reset the module cache (node:test only). */
export function __resetEntitlementsCache() {
  _cache = null;
}
