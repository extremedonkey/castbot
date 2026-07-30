/**
 * Google Sheets Sync — the side-effecting half: turns sheet rows into real application channels.
 *
 * An "external" applicant has no Discord account, so this deliberately diverges from
 * applicationManager.createApplicationChannel in three ways:
 *   1. NO per-applicant permission overwrite. There's nobody to grant access to, and passing a
 *      synthetic id to Discord would 400 the channel create outright.
 *   2. A SYNTHETIC userId (`ext_<hex>`), never blank. Several consumers key maps on userId
 *      (dncManager, channelRoster, castlistManager) — two applicants both holding `undefined`
 *      would silently collapse into one. A unique synthetic id kills that whole class of bug, and
 *      `guild.members.fetch('ext_…')` simply throws into the fallback path that already exists.
 *   3. Answers are POSTED, not stored. Same as a native application: playerData holds the record,
 *      Discord holds the content.
 *
 * See sheetsSync.js for the pure half (header resolution, chunking, script generation).
 */

import crypto from 'crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import fetch from 'node-fetch';
import { loadPlayerData, savePlayerData, withStorageLock } from '../../storage.js';
import { getRoleAccessOverwrites, APPLICATION_CHANNEL_ACCESS } from '../../utils/roleAccessUtils.js';
import { sanitizeChannelName } from '../../applicationManager.js';
import { resolveHeaders, rowKeyFor, answerPairs, buildAnswerMessages } from './sheetsSync.js';

/**
 * A season only gets a `categoryId` once its Apply button has been configured and posted. Without
 * one there is nowhere to put applicant channels, so both the preview and the import refuse with
 * this — the preview being the important one, since it fires BEFORE the host commits.
 */
export const NO_CATEGORY = 'This season has no application category yet. In CastBot open Season Manager -> Apps, create the Apply button and choose a category, then run this sync again.';

/** Discord's default avatar set — externals have no CDN avatar of their own. */
const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

/** Pause between channel creations. Channel create is one of Discord's tightest buckets. */
const CREATE_PACING_MS = 700;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Deterministic synthetic user id for an external applicant. Derived from the row key so a row
 * re-imported after a channel deletion keeps the same identity.
 */
export function syntheticUserId(rowKey) {
  return `ext_${crypto.createHash('sha256').update(String(rowKey)).digest('hex').slice(0, 20)}`;
}

/** Read (never create) the sync block for a season. */
export function getSyncConfig(playerData, guildId, configId) {
  return playerData?.[guildId]?.applicationConfigs?.[configId]?.sheetsSync || null;
}

/**
 * Plan a sync without touching anything — powers the preview dialog the host confirms inside their
 * own spreadsheet. Pure apart from the playerData read.
 * @returns {{ok: boolean, error?: string, nameHeader?: string, toCreate?: number, ...}}
 */
export async function planSync(guildId, configId, rows) {
  const playerData = await loadPlayerData();
  const sync = getSyncConfig(playerData, guildId, configId);
  if (!sync) return { ok: false, error: 'This season is no longer connected to Google Sheets. Generate a fresh script in CastBot.' };

  // Check the category HERE, not just at import time — the preview is the whole point of the dry
  // run, so anything that would abort the import must surface before the host confirms.
  if (!playerData[guildId]?.applicationConfigs?.[configId]?.categoryId) return { ok: false, error: NO_CATEGORY };

  const headers = Object.keys(rows?.[0]?.cells || {});
  const resolved = resolveHeaders(headers);
  if (resolved.fatal) return { ok: false, error: resolved.fatal.replace(/\*\*/g, '"').replace(/`/g, '') };

  const known = sync.rowKeys || {};
  let toCreate = 0, toSkip = 0;
  const sampleNames = [];
  for (const row of rows || []) {
    const key = rowKeyFor(row.cells, resolved.nameHeader);
    const name = String(row.cells?.[resolved.nameHeader] ?? '').trim();
    if (!name) continue;
    if (known[key]) { toSkip++; continue; }
    toCreate++;
    if (sampleNames.length < 4) sampleNames.push(name);
  }

  return {
    ok: true,
    nameHeader: resolved.nameHeader,
    ageHeader: resolved.ageHeader,
    pronounsHeader: resolved.pronounsHeader,
    warnings: resolved.warnings,
    toCreate, toSkip, sampleNames
  };
}

/**
 * Import a batch of rows: create one channel per new applicant, post their answers, record them.
 *
 * STORAGE LOCK SHAPE — the Discord work happens OUTSIDE the lock and only the write is inside it
 * (storage.js rule: nothing slow inside the lock, or every other request queues behind a channel
 * create). We re-check the dedupe key inside the lock so two hosts hitting Sync at once can't
 * double-import; the loser deletes the channel it just made rather than leaving an orphan.
 *
 * @param {Object} client - discord.js client
 * @param {string} guildId
 * @param {string} configId
 * @param {Array<{cells: Object}>} rows
 * @returns {{ok: boolean, created: number, skipped: number, failed: number, errors: string[]}}
 */
export async function ingestRows(client, guildId, configId, rows) {
  // Every refusal below logs AND returns a human-readable `error`. The first version did neither —
  // a missing categoryId returned a bare ok:false, the script rendered it as "Failed: 1", and the
  // actual reason existed nowhere. A silent failure is worse than a loud one.
  const refuse = (error) => {
    console.warn(`⚠️ [SHEETS] Import refused for ${guildId}/${configId}: ${error}`);
    return { ok: false, error, created: 0, skipped: 0, failed: 0, errors: [error] };
  };

  const snapshot = await loadPlayerData();
  const sync = getSyncConfig(snapshot, guildId, configId);
  if (!sync) return refuse('This season is no longer connected to Google Sheets. Generate a fresh script in CastBot.');

  const config = snapshot[guildId]?.applicationConfigs?.[configId];
  if (!config?.categoryId) return refuse(NO_CATEGORY);

  const headers = Object.keys(rows?.[0]?.cells || {});
  const resolved = resolveHeaders(headers);
  if (resolved.fatal) return refuse(resolved.fatal.replace(/\*\*/g, '"').replace(/`/g, ''));

  const guild = await client.guilds.fetch(guildId);
  const excluded = sync.excludeHeaders || [];

  let created = 0, skipped = 0, failed = 0;
  const errors = [];

  for (const row of rows || []) {
    const name = String(row.cells?.[resolved.nameHeader] ?? '').trim();
    if (!name) { skipped++; continue; }

    const rowKey = rowKeyFor(row.cells, resolved.nameHeader);

    // Cheap pre-check against the snapshot — the authoritative check happens inside the lock.
    const fresh = await loadPlayerData();
    if (getSyncConfig(fresh, guildId, configId)?.rowKeys?.[rowKey]) { skipped++; continue; }

    let channel;
    try {
      channel = await createExternalChannel(guild, config, name, fresh);
      const age = resolved.ageHeader ? String(row.cells[resolved.ageHeader] ?? '').trim() : '';
      const pronouns = resolved.pronounsHeader ? String(row.cells[resolved.pronounsHeader] ?? '').trim() : '';
      const pairs = answerPairs(row.cells, resolved, excluded);

      for (const message of buildAnswerMessages({ name, age, pronouns, pairs })) {
        await postRaw(channel.id, message);
      }

      const claimed = await claimRow({ guildId, configId, rowKey, channel, name, age, pronouns });
      if (!claimed) {
        // Lost a race with a concurrent sync — bin the duplicate channel rather than orphan it.
        await channel.delete('CastBot: duplicate Google Sheets import').catch(() => {});
        skipped++;
        continue;
      }
      created++;
      await sleep(CREATE_PACING_MS);
    } catch (error) {
      failed++;
      errors.push(`${name}: ${error.message}`);
      console.error(`❌ [SHEETS] Failed to import "${name}":`, error.message);
      if (channel) await channel.delete('CastBot: failed Google Sheets import').catch(() => {});
    }
  }

  console.log(`📜 [SHEETS] Sync batch for ${configId}: ${created} created, ${skipped} skipped, ${failed} failed`);
  return { ok: true, created, skipped, failed, errors };
}

/**
 * Create the applicant's channel. Mirrors applicationManager's permission model minus the
 * applicant overwrite (there is no applicant to grant).
 */
async function createExternalChannel(guild, config, name, playerData) {
  const category = await guild.channels.fetch(config.categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('Application category no longer exists');
  }

  const base = sanitizeChannelName(name) || 'applicant';
  const channelName = (config.channelFormat || '📝%name%-app').replace('%name%', base);

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...await getRoleAccessOverwrites(guild, APPLICATION_CHANNEL_ACCESS, { playerData, logPrefix: 'SHEETS' })
  ];
  if (config.productionRole) {
    permissionOverwrites.push({
      id: config.productionRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites
  });
}

/**
 * Write the application record + dedupe key under the storage lock. Returns false if another sync
 * claimed this row first.
 */
async function claimRow({ guildId, configId, rowKey, channel, name, age, pronouns }) {
  let won = false;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    const sync = playerData?.[guildId]?.applicationConfigs?.[configId]?.sheetsSync;
    if (!sync) return;
    if (!sync.rowKeys) sync.rowKeys = {};
    if (sync.rowKeys[rowKey]) return; // lost the race

    if (!playerData[guildId].applications) playerData[guildId].applications = {};
    playerData[guildId].applications[channel.id] = {
      userId: syntheticUserId(rowKey),
      channelId: channel.id,
      username: name,
      displayName: name,
      avatarURL: DEFAULT_AVATAR,
      channelName: channel.name,
      createdAt: new Date().toISOString(),
      configId,
      // Marks this as a non-Discord applicant. Read by castRankingManager's demographics resolver —
      // pronouns/timezone can't come from roles when there's no member to carry them.
      source: 'googleSheets',
      external: {
        rowKey,
        age: age || undefined,
        pronounName: pronouns || undefined,
        timezoneName: undefined
      }
    };

    sync.rowKeys[rowKey] = channel.id;
    sync.lastSyncAt = new Date().toISOString();
    await savePlayerData(playerData);
    won = true;
  });
  return won;
}

/** Components V2 needs the raw REST route — discord.js builders reject type 17 containers. */
async function postRaw(channelId, payload) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
