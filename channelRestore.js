/**
 * Channel Restore — 🧪 EXPERIMENTAL (designed to be easy to remove)
 *
 * Rebuilds a channel from an archive: reads the archive HTML's embedded restore payload,
 * creates a fresh channel under a "📂 CastBot Archives" category, and re-posts the messages
 * via a webhook (username/avatar per original author; best-effort — the bot can't truly
 * impersonate users or backdate messages, and pings are suppressed).
 *
 * ── Reversibility (how to undo this feature later) ───────────────────────────────
 *   1. Delete this file (channelRestore.js).
 *   2. Remove the `archive_restore_*` handler in app.js.
 *   3. Remove the `archive_restore_*` entry in buttonHandlerFactory.js BUTTON_REGISTRY.
 *   4. Remove the ✨ Restore button from the row in channelArchiver.js → postOneArchive.
 *   5. (Optional) Remove the `<script id="cb-archive-data">` embed in channelExport.js.
 *   6. (Cleanup of created content) Delete the "📂 CastBot Archives" categories — all
 *      restored channels live there, so nothing else is touched.
 * Nothing here is destructive: Restore only CREATES channels/messages; it never deletes.
 */
import 'dotenv/config';
import fetch from 'node-fetch';
import { DiscordRequest } from './utils.js';
import { computePostPacing } from './channelExportFetcher.js';
import { getArchiveFileUrl } from './channelArchiver.js';

const IS_CV2 = 1 << 15;
const ARCHIVE_CATEGORY_BASE = '📂 CastBot Archives';
const CATEGORY_CHILD_LIMIT = 50;        // Discord caps a category at 50 channels
const MAX_RESTORE_MESSAGES = 2000;      // safety cap for an experimental feature (raise if needed)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract the embedded restore payload from an archive HTML string.
 * Returns null for archives created before Restore support (no embed).
 */
export function extractArchiveData(html) {
  const m = (html || '').match(/<script id="cb-archive-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch { return null; }
}

/**
 * Pick an existing "📂 CastBot Archives" category with room (<50 channels), or decide the name
 * of the next one to create. Pure — unit tested. Returns { categoryId } or { createName }.
 */
export function pickArchiveCategory(allChannels) {
  const num = (n) => { const m = (n || '').match(/\((\d+)\)\s*$/); return m ? parseInt(m[1], 10) : 1; };
  const cats = (allChannels || [])
    .filter(c => c.type === 4 && (c.name === ARCHIVE_CATEGORY_BASE || (c.name || '').startsWith(`${ARCHIVE_CATEGORY_BASE} (`)))
    .sort((a, b) => num(a.name) - num(b.name));
  const childCount = (catId) => (allChannels || []).filter(c => c.parent_id === catId).length;
  for (const c of cats) if (childCount(c.id) < CATEGORY_CHILD_LIMIT) return { categoryId: c.id };
  if (!cats.length) return { createName: ARCHIVE_CATEGORY_BASE };
  const maxNum = Math.max(...cats.map(c => num(c.name)));
  return { createName: `${ARCHIVE_CATEGORY_BASE} (${maxNum + 1})` };
}

/** Format the "Originally Posted" subtext line (hammertime → viewer's local time). Pure — tested. */
export function formatOriginallyPosted(isoTime) {
  const unix = Math.floor(new Date(isoTime).getTime() / 1000);
  if (Number.isNaN(unix)) return '';
  return `-# Originally Posted: <t:${unix}:f>`;
}

// Permission bits (BigInt) — VIEW_CHANNEL, SEND_MESSAGES, MANAGE_WEBHOOKS
const VIEW = 1n << 10n, SEND = 1n << 11n, MANAGE_WH = 1n << 29n;

/** Overwrites that make a channel/category private: hide from @everyone, keep bot access. */
function privateOverwrites(guildId, botId) {
  const ow = [{ id: guildId, type: 0, deny: String(VIEW) }]; // @everyone: deny View Channel
  if (botId) ow.push({ id: botId, type: 1, allow: String(VIEW | SEND | MANAGE_WH) }); // bot: keep access
  return ow;
}

/** Split text into <=max-char chunks (webhook/message content cap is 2000). Pure — unit tested. */
export function splitContent(text, max = 1950) {
  const out = [];
  let s = String(text || '');
  while (s.length > max) {
    let cut = s.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max; // no usable newline → hard cut
    out.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  if (s.length) out.push(s);
  return out;
}

async function getGuildChannels(client, guildId) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (guild && guild.channels.cache.size > 0) {
    return [...guild.channels.cache.values()].map(c => ({ id: c.id, name: c.name, type: c.type, parent_id: c.parentId || null }));
  }
  return (await DiscordRequest(`guilds/${guildId}/channels`, { method: 'GET' })) || [];
}

async function ensureArchiveCategory(client, guildId) {
  const all = await getGuildChannels(client, guildId);
  const pick = pickArchiveCategory(all);
  if (pick.categoryId) return pick.categoryId;
  const created = await DiscordRequest(`guilds/${guildId}/channels`, {
    method: 'POST',
    body: { name: pick.createName, type: 4, permission_overwrites: privateOverwrites(guildId, client?.user?.id) },
  });
  return created.id;
}

/**
 * Paced webhook executor — header-aware + 429 retry (reuses the write-path `computePostPacing`).
 * `state.wait` carries pacing between calls so the whole restore self-throttles to one webhook.
 */
async function execWebhook(url, payload, state, maxRetries = 8) {
  for (let attempt = 0; ; attempt++) {
    if (state.wait > 0) { await sleep(state.wait); state.wait = 0; }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining'), 10);
    const resetAfter = parseFloat(res.headers.get('x-ratelimit-reset-after'));
    let retryAfter = null;
    if (res.status === 429) { const b = await res.clone().json().catch(() => ({})); retryAfter = b.retry_after; }
    const pacing = computePostPacing({
      status: res.status,
      remaining: Number.isNaN(remaining) ? null : remaining,
      resetAfter: Number.isNaN(resetAfter) ? null : resetAfter,
      retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
    });
    state.wait = pacing.waitMs;
    if (pacing.retry && attempt < maxRetries) continue;
    return res;
  }
}

const botPost = (channelId, container) =>
  DiscordRequest(`channels/${channelId}/messages`, { method: 'POST', body: { flags: IS_CV2, components: [container] } });

/**
 * Restore a channel from an archive's file message.
 * @param {object} args
 * @param {object} args.client - Discord client (for the guild cache)
 * @param {string} args.guildId
 * @param {string} args.archiveChannelId - channel the archive lives in (to GET the file message)
 * @param {string} args.fileMessageId - the type-13 file message id
 * @returns {Promise<{channelId, channelName, posted, failed, truncated}>}
 */
export async function restoreFromArchiveMessage({ client, guildId, archiveChannelId, fileMessageId }) {
  // 1. Re-fetch the archive file message → fresh HTML URL → download the HTML
  const fileMsg = await DiscordRequest(`channels/${archiveChannelId}/messages/${fileMessageId}`, { method: 'GET' });
  const htmlUrl = getArchiveFileUrl(fileMsg);
  if (!htmlUrl) throw new Error('Archive file not found (the file message may have been deleted).');
  const htmlText = await (await fetch(htmlUrl)).text();

  // 2. Parse the embedded restore payload
  const data = extractArchiveData(htmlText);
  if (!data || !Array.isArray(data.messages)) {
    throw new Error('This archive has no restore data — it was created before Restore support. Re-archive the channel to enable Restore.');
  }
  const channelName = (data.channel || 'restored-archive').slice(0, 100);
  const allMessages = data.messages;
  const messages = allMessages.slice(0, MAX_RESTORE_MESSAGES);
  const truncated = allMessages.length > messages.length;

  // 3. Ensure the archive category + create the new channel under it
  const categoryId = await ensureArchiveCategory(client, guildId);
  const newChannel = await DiscordRequest(`guilds/${guildId}/channels`, {
    method: 'POST',
    body: { name: channelName, type: 0, parent_id: categoryId, permission_overwrites: privateOverwrites(guildId, client?.user?.id) },
  });
  console.log(`♻️ Restore: created #${newChannel.name} (${newChannel.id}) — ${messages.length} messages`);

  // 4. Header marker (posted as the bot)
  await botPost(newChannel.id, {
    type: 17, accent_color: 0x9b59b6,
    components: [{ type: 10, content: `## ♻️ Restored archive — #${channelName}\n-# Rebuilt by CastBot from an archive. Reconstructed messages (not original timestamps); pings are suppressed.${truncated ? `\n-# ⚠️ Truncated to the first ${MAX_RESTORE_MESSAGES} of ${allMessages.length} messages.` : ''}` }],
  });

  // 5. Create a webhook and re-post messages through it (username/avatar per author), paced.
  const webhook = await DiscordRequest(`channels/${newChannel.id}/webhooks`, { method: 'POST', body: { name: 'CastBot Archive' } });
  const whUrl = `https://discord.com/api/v10/webhooks/${webhook.id}/${webhook.token}`;
  const state = { wait: 0 };
  let posted = 0, failed = 0, prevAuthor = null;
  for (const m of messages) {
    const text = (m.c || '').trim();
    if (!text) continue; // nothing recoverable for this message (image-only, etc.)
    const username = (m.n || 'Unknown').slice(0, 80);
    // New author = new visual group (webhook posts group by username) → stamp the original time once.
    const header = (m.n !== prevAuthor) ? formatOriginallyPosted(m.t) : '';
    prevAuthor = m.n;
    const body = header ? `${header}\n${text}` : text;
    for (const chunk of splitContent(body)) {
      const res = await execWebhook(whUrl, {
        username, avatar_url: m.a || undefined, content: chunk, allowed_mentions: { parse: [] },
      }, state);
      if (!res.ok) { failed++; console.log(`ℹ️ Restore: webhook post skipped (${res.status}) for "${username}"`); }
    }
    posted++;
  }

  // 6. Cleanup the webhook + footer marker
  try { await DiscordRequest(`webhooks/${webhook.id}/${webhook.token}`, { method: 'DELETE' }); } catch { /* best-effort */ }
  await botPost(newChannel.id, {
    type: 17, accent_color: 0x2ecc71,
    components: [{ type: 10, content: `## ✅ Restore complete\n-# ${posted} message${posted !== 1 ? 's' : ''} reconstructed${failed ? `, ${failed} skipped` : ''}.` }],
  });
  console.log(`♻️ Restore done: #${newChannel.name} — ${posted} posted, ${failed} skipped`);
  return { channelId: newChannel.id, channelName: newChannel.name, posted, failed, truncated };
}
