/**
 * Google Sheets Sync — handler bodies and the HTTP ingest route.
 *
 * Lives here rather than in app.js because app.js is a ROUTER, not a processor (CLAUDE.md golden
 * rule): every function below is the *body* of a thin `ButtonHandlerFactory.create` block or an
 * Express route. app.js keeps only the dispatch.
 *
 * Split of the three sheets modules:
 *   sheetsSync.js    — pure logic, UI builders, the Apps Script generator
 *   sheetsIngest.js  — side effects (channel creation, playerData writes)
 *   sheetsHandlers.js (this) — glue between Discord/HTTP and the two above
 */

import { InteractionResponseFlags } from 'discord-interactions';
import { loadPlayerData, savePlayerData, withStorageLock } from '../../storage.js';
import { buildSeasonNavRow, buildSeasonBottomRow } from '../../seasonSelector.js';
import {
  buildSheetsScreen, buildPrivacyScreen, buildRotateConfirm, sheetsError,
  generateAppsScript, generateSecret, publicBaseUrl, verifySignature
} from './sheetsSync.js';
import { planSync, ingestRows, getSyncConfig } from './sheetsIngest.js';

/**
 * Resolve a `sheets_*` custom_id to its handler config. Lives here (not as a table in app.js) so
 * the router keeps `ButtonHandlerFactory.create` within three lines of the dispatch branch — the
 * pre-commit legacy-handler scanner treats anything further away as an unmigrated handler.
 *
 * Order matters: `sheets_rotate_confirm_` MUST be tested before `sheets_rotate_`.
 *
 * @param {string} customId
 * @param {Object} body - the raw interaction body (select values live on it)
 * @returns {{id: string, configId: string, updateMessage: boolean, ephemeral: boolean, run: Function}}
 */
export function routeSheets(customId, body) {
  const routes = [
    ['sheets_open_', 'sheets_open', (c, id) => openScreen(c, id)],
    ['sheets_script_', 'sheets_script', (c, id) => getScript(c, id, body)],
    ['sheets_rotate_confirm_', 'sheets_rotate_confirm', (c, id) => rotateConfirm(c, id)],
    ['sheets_rotate_', 'sheets_rotate', (c, id) => rotatePrompt(c, id)],
    ['sheets_privacy_', 'sheets_privacy', (c, id) => privacyScreen(c, id)],
    ['sheets_exclude_select_', 'sheets_exclude_select', (c, id) => excludeSelect(c, id, body?.data?.values)]
  ];
  const hit = routes.find(([prefix]) => customId.startsWith(prefix));
  if (!hit) return { id: 'sheets_unknown', configId: '', updateMessage: true, ephemeral: false, run: async () => sheetsError('Unknown Google Sheets action') };
  const [prefix, id, run] = hit;
  return { id, configId: customId.replace(prefix, ''), updateMessage: id !== 'sheets_script', ephemeral: id === 'sheets_script', run };
}

/** Read a season config, or null. */
async function loadConfig(guildId, configId) {
  const playerData = await loadPlayerData();
  return playerData?.[guildId]?.applicationConfigs?.[configId] || null;
}

/** Render the main 📜 screen for a season. */
async function screenFor(context, configId) {
  const config = await loadConfig(context.guildId, configId);
  if (!config) return sheetsError('Season not found');
  const container = buildSheetsScreen(
    { configId, seasonName: config.seasonName || 'Season', sync: config.sheetsSync },
    buildSeasonNavRow(configId, 'apps', context.userId),
    buildSeasonBottomRow(configId, 'apps')
  );
  const { countComponents } = await import('../../utils.js');
  countComponents([container], { verbosity: 'summary', label: 'Google Sheets Sync' });
  return { components: [container] };
}

/** 📜 button on the Apps tab, and the Cancel target of the Reset Link confirm. */
export const openScreen = (context, configId) => screenFor(context, configId);

/**
 * 📜 Get Script — mints the per-season secret on first use, then uploads the generated `.gs`.
 * The file goes out as a separate ephemeral FOLLOWUP (see sendScriptFile) while this returns the
 * step-by-step instructions, so the host has both on screen at once.
 */
export async function getScript(context, configId, interaction) {
  const base = publicBaseUrl();
  if (!base) {
    return sheetsError('This CastBot instance has no public URL configured, so a working script can\'t be generated here. Try on the test or production bot.');
  }

  let secret, seasonName;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    const config = playerData?.[context.guildId]?.applicationConfigs?.[configId];
    if (!config) return;
    if (!config.sheetsSync?.secret) {
      config.sheetsSync = { secret: generateSecret(), createdAt: new Date().toISOString(), rowKeys: {}, excludeHeaders: [] };
      await savePlayerData(playerData);
    }
    secret = config.sheetsSync.secret;
    seasonName = config.seasonName || 'Season';
  });
  if (!secret) return sheetsError('Season not found');

  const script = generateAppsScript({ baseUrl: `${base}/api/sheets-sync`, guildId: context.guildId, configId, secret, seasonName });
  await sendScriptFile(interaction, script);

  return {
    components: [{
      type: 17, accent_color: 0x34a853,
      components: [{ type: 10, content: `## 📜 Script ready\n\nThe \`castbot-sync.gs\` file is attached below.\n\n**1.** In your Google Sheet: **Extensions → Apps Script**\n**2.** Delete anything already in the editor, paste the file's contents in, press **Save**\n**3.** Reload the spreadsheet — a **CastBot** menu appears in the toolbar\n**4.** **CastBot → Sync applications**\n\n-# This file contains a private key for this season. Don't post it anywhere public.` }]
    }]
  };
}

/** 🔑 Reset Link — step 1 (confirmation). */
export async function rotatePrompt(context, configId) {
  const config = await loadConfig(context.guildId, configId);
  if (!config) return sheetsError('Season not found');
  return { components: [buildRotateConfirm(configId, config.seasonName || 'Season')] };
}

/** 🔑 Reset Link — step 2. Irreversibly invalidates the host's installed script. */
export async function rotateConfirm(context, configId) {
  let found = false;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    const config = playerData?.[context.guildId]?.applicationConfigs?.[configId];
    if (!config?.sheetsSync) return;
    config.sheetsSync.secret = generateSecret();
    config.sheetsSync.rotatedAt = new Date().toISOString();
    await savePlayerData(playerData);
    found = true;
  });
  if (!found) return sheetsError('Season not found');
  console.log(`🔑 [SHEETS] Secret rotated for ${configId} by ${context.userId}`);
  return screenFor(context, configId);
}

/** 🔒 Hide Columns screen. */
export async function privacyScreen(context, configId) {
  const config = await loadConfig(context.guildId, configId);
  if (!config) return sheetsError('Season not found');
  return { components: [buildPrivacyScreen(configId, config.seasonName || 'Season', config.sheetsSync)] };
}

/** 🔒 Hide Columns — persist the multi-select. */
export async function excludeSelect(context, configId, values) {
  let config;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    config = playerData?.[context.guildId]?.applicationConfigs?.[configId];
    if (!config?.sheetsSync) return;
    config.sheetsSync.excludeHeaders = (values || []).filter(v => v !== '__none__');
    await savePlayerData(playerData);
  });
  if (!config) return sheetsError('Season not found');
  return { components: [buildPrivacyScreen(configId, config.seasonName || 'Season', config.sheetsSync)] };
}

/**
 * Upload the generated Apps Script as a type-13 File on an ephemeral interaction FOLLOWUP.
 * A followup POST rather than a PATCH of the deferred message — multipart on the webhook PATCH
 * route is unreliable; the precedent for this shape is the screenshot gallery in app.js.
 */
async function sendScriptFile(interaction, script) {
  const FormData = (await import('form-data')).default;
  const fetchFn = (await import('node-fetch')).default;
  const filename = 'castbot-sync.gs';

  const form = new FormData();
  form.append('files[0]', Buffer.from(script, 'utf8'), { filename, contentType: 'text/plain' });
  form.append('payload_json', JSON.stringify({
    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
    attachments: [{ id: 0, filename }],
    components: [{ type: 17, accent_color: 0x34a853, components: [{ type: 13, file: { url: `attachment://${filename}` } }] }]
  }));

  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  const response = await fetchFn(url, { method: 'POST', body: form, headers: form.getHeaders() });
  if (!response.ok) {
    console.error(`❌ [SHEETS] Script upload failed ${response.status}:`, (await response.text()).slice(0, 300));
  } else {
    console.log('📜 [SHEETS] Apps Script file delivered');
  }
}

/**
 * POST /api/sheets-sync — the ONLY inbound path for external (non-Discord) applicants.
 *
 * Authenticated by the per-season HMAC secret baked into the host's Apps Script, verified over the
 * RAW body. Deliberately NOT Discord's signed /webhooks route: this traffic originates from the
 * host's Google account.
 *
 * `dryRun` resolves headers and counts what WOULD happen so the host can confirm a preview inside
 * their own spreadsheet — there's no interaction token on this path, so the confirmation has to
 * live at the Sheets end. Otherwise it imports the batch.
 *
 * @param {Object} client - discord.js client
 * @param {Buffer} rawBody
 * @param {string} signature - X-CastBot-Signature header
 * @returns {{status: number, body: Object}}
 */
export async function handleSyncRequest(client, rawBody, signature) {
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { return { status: 400, body: { ok: false, error: 'Malformed request body.' } }; }

  const { guildId, configId, rows, dryRun } = payload || {};
  if (!guildId || !configId || !Array.isArray(rows)) {
    return { status: 400, body: { ok: false, error: 'Missing guildId, configId or rows.' } };
  }

  const playerData = await loadPlayerData();
  const sync = getSyncConfig(playerData, guildId, configId);
  if (!sync?.secret) {
    return { status: 404, body: { ok: false, error: 'This season is not connected to Google Sheets (or the link was reset). Generate a fresh script in CastBot.' } };
  }
  if (!verifySignature(rawBody, signature, sync.secret)) {
    console.warn(`🚫 [SHEETS] Bad signature for ${guildId}/${configId}`);
    return { status: 401, body: { ok: false, error: 'This script is no longer valid. Ask your host for a fresh one from CastBot (Reset Link was used).' } };
  }

  if (dryRun) {
    // Remember the column names so 🔒 Hide Columns has something to offer. This is the ONLY way
    // CastBot ever learns the sheet's shape — it cannot read the spreadsheet itself.
    const headers = Object.keys(rows[0]?.cells || {});
    if (headers.length) {
      await withStorageLock(async () => {
        const fresh = await loadPlayerData();
        const cfg = fresh[guildId]?.applicationConfigs?.[configId];
        if (!cfg?.sheetsSync) return;
        cfg.sheetsSync.seenHeaders = headers;
        await savePlayerData(fresh);
      });
    }
    return { status: 200, body: await planSync(guildId, configId, rows) };
  }

  return { status: 200, body: await ingestRows(client, guildId, configId, rows) };
}
