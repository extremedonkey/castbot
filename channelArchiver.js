/**
 * Channel Archiver — orchestrates the background archive run.
 *
 * For each selected channel: fetch all messages (rate-limit-safe read), render a
 * styled HTML file, and post it back to the invoking channel as a Components V2
 * type-13 file + a separate "View Online" link button.
 *
 * Rate limits (see RaP / docs/03-features/ChannelArchive.md):
 *  - READS  → paced inside fetchAllChannelMessages (per-channel GET bucket).
 *  - WRITES → every channel does 2 POSTs to the SAME (invoking) channel. Archiving a
 *    whole category fired ~2×N POSTs at one channel with no pacing/retry → 429 storms
 *    + silently-skipped channels. Fixed here by routing ALL writes through a single
 *    header-aware, self-retrying poster (createMessagePoster).
 *  - 413 (file too large) → Discord caps uploads at ~10 MiB. Oversized channels are
 *    split into multiple parts, each kept under SAFE_UPLOAD_BYTES.
 */
import FormData from 'form-data';
import fetch from 'node-fetch';
import { fetchAllChannelMessages, createMessagePoster, fetchGuildActiveThreads, fetchChannelThreads, fetchImageData } from './channelExportFetcher.js';
import { generateExportHTML } from './channelExport.js';
import { getBotEmoji } from './botEmojis.js';

const IS_CV2 = 1 << 15;
const EPHEMERAL = 1 << 6;
// Stay comfortably under Discord's base upload cap (~10 MiB at boost level 0).
const SAFE_UPLOAD_BYTES = 9 * 1024 * 1024;

/**
 * Archive modes shown in the "Archive Mode" string select on the main archive screen.
 * Only `archive_only` is implemented today; the rest are stubs for future expansion
 * (the select re-renders with a "coming soon" note and stays on Archive Only).
 */
export const ARCHIVE_MODES = [
  { value: 'archive_only', label: 'Archive', emoji: '📥', implemented: true,
    description: 'Save as HTML (fast, small; image links expire ~24h)' },
  { value: 'archive_embed', label: 'Archive (Self-Contained)', emoji: '🖼️', implemented: true,
    description: 'Embed images so they never expire — slower, larger; non-image files not kept' },
  { value: 'archive_delete', label: 'Archive + Delete', emoji: '🗑️',
    description: 'Archive, then delete the originals to free channel slots' },
  { value: 'category_archive', label: 'Category Archive', emoji: '📁',
    description: 'One archive channel per category; archives posted inside each' },
  { value: 'category_archive_delete', label: 'Category Archive + Delete', emoji: '🗂️',
    description: 'Per-category archive channel, then delete the originals' },
  { value: 'clone_archive', label: 'Clone Archive', emoji: '📋',
    description: 'Copy an existing archive into a new target channel' },
  { value: 'move_archive', label: 'Move Archive', emoji: '📦',
    description: 'Move an existing archive to a new channel (deletes the source)' },
];

/**
 * Build the main Archive Channels screen container (LEAN: sectioned, ephemeral menu).
 * Shared by the `archive_channel` button and the `archive_mode_select` re-render.
 * @param {string} mode - selected archive mode value (default 'archive_only')
 * @param {string} [note] - optional small note line (e.g. "coming soon")
 */
export function buildArchiveScreen(mode = 'archive_only', note = '') {
  const options = ARCHIVE_MODES.map(m => ({
    label: m.label,
    value: m.value,
    description: m.implemented ? m.description : `🚧 Coming soon — ${m.description}`.slice(0, 100),
    emoji: { name: m.emoji },
    default: m.value === mode,
  }));

  return {
    type: 17,
    accent_color: 0x3498db,
    components: [
      { type: 10, content: `## 🧹 Archive Channels\n\nArchive full message history as styled HTML files.${note ? `\n\n${note}` : ''}` },
      { type: 14 },
      { type: 10, content: `### \`\`\`⚙️ Archive Mode\`\`\`\n-# How images are stored: **Archive** keeps links (fast, small) · **Self-Contained** embeds them so they never expire (slower, larger).` },
      { type: 1, components: [{ type: 3, custom_id: 'archive_mode_select', placeholder: 'Archive mode...', min_values: 1, max_values: 1, options }] },
      { type: 14 },
      { type: 10, content: `### \`\`\`📁 Select Channels\`\`\`\n-# Up to 25 channels/categories — categories expand to all their text channels. Large/many channels take time (~1 min per 3,000 msgs). Needs the **Message Content Intent**, or text is blank.` },
      { type: 1, components: [{
        type: 8, // Channel Select
        custom_id: 'archive_channel_select',
        placeholder: 'Select channels and/or categories...',
        channel_types: [0, 4, 5],
        min_values: 1,
        max_values: 25,
      }] },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 2, label: '← Back', custom_id: 'data_admin' },
        { type: 2, custom_id: 'prod_nuke_category', label: 'Nuke Category', style: 2, emoji: { name: '☢️' } } // copy of Nuke/Delete Category button (self-contained flow)
      ] }
    ]
  };
}

/**
 * Build the archive's action-buttons container (posted as a 2nd message beside the file).
 * Two states solve the ~24h CDN-link expiry without a stale link ever sitting public:
 *  - LOCKED (default): [🔐 Unlock Archive] [✨ Unarchive] — no link present, nothing to go stale.
 *  - UNLOCKED (after Unlock mints a FRESH link): [🔓 View Archive] [✨ Unarchive] + "active ~10 min".
 * A durable scheduler job (archive_relock) reverts UNLOCKED → LOCKED after ~10 min.
 * @param {string} fileMsgId - the type-13 file message id (re-fetched for a fresh URL on Unlock)
 * @param {object} [opts]
 * @param {string} [opts.viewUrl] - present → render the UNLOCKED state with this link
 */
export function buildArchiveButtons(fileMsgId, { viewUrl = null } = {}) {
  const unarchive = { type: 2, style: 2, custom_id: `archive_restore_${fileMsgId}`, label: 'Unarchive', emoji: { name: '📤' } }; // grey
  if (viewUrl) {
    return {
      type: 17,
      components: [
        { type: 10, content: `-# 🔓 Link active for ~10 minutes` },
        { type: 1, components: [
          { type: 2, style: 5, label: 'View Archive', url: viewUrl },
          unarchive,
        ] },
      ],
    };
  }
  return {
    type: 17,
    components: [
      { type: 1, components: [
        { type: 2, style: 1, custom_id: `archive_unlock_${fileMsgId}`, label: 'Unlock Archive', emoji: { name: '🔐' } }, // blue
        unarchive,
      ] },
    ],
  };
}

/**
 * Expand an archive multi-selection into a flat, de-duplicated list of channels.
 * Pure function — unit tested in tests/channelArchiver.test.js.
 *
 * @param {string[]} selectedIds - the channel/category IDs picked in the select
 * @param {Array<{id,name,type,parent_id,position}>} allChannels - the guild's channels
 *   (from the bot cache or one REST call), normalized to these fields
 * @param {object} [resolved] - req.body.data.resolved.channels (fallback for selected items)
 * @returns {{channels: Array<{id,name}>, categoryCount: number}}
 *   channels de-duped by id (category + a child inside it won't archive twice)
 */
export function expandArchiveSelection(selectedIds, allChannels, resolved = {}) {
  const byId = new Map((allChannels || []).map(c => [c.id, c]));
  const childrenOf = (catId) => (allChannels || [])
    .filter(c => c.parent_id === catId && [0, 5].includes(c.type))
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const picked = new Map(); // id → {id, name} — Map gives us dedupe + insertion order
  let categoryCount = 0;
  for (const id of (selectedIds || [])) {
    const ch = byId.get(id) || resolved[id];
    if (!ch) continue;
    if (ch.type === 4) { // category → expand to its text/announcement children
      categoryCount++;
      for (const kid of childrenOf(id)) picked.set(kid.id, { id: kid.id, name: kid.name });
    } else if ([0, 5].includes(ch.type)) { // text / announcement channel
      picked.set(ch.id, { id: ch.id, name: ch.name });
    }
  }
  return { channels: [...picked.values()], categoryCount };
}

/** Recursively find the resolved CDN URL inside a type-13 (File) component tree. */
function findType13Url(comps) {
  for (const c of (comps || [])) {
    if (c.type === 13 && c.file?.url && !c.file.url.startsWith('attachment://')) return c.file.url;
    const hit = findType13Url(c.components);
    if (hit) return hit;
  }
  return null;
}

/**
 * Pull a FRESH signed CDN URL for the archive HTML out of a fetched message object.
 * Discord re-signs attachment URLs on every message GET, so this is how the Refresh Link
 * button mints a working URL again after the original expired (~24h). Returns null if gone.
 */
export function getArchiveFileUrl(message) {
  return findType13Url(message?.components) || message?.attachments?.[0]?.url || null;
}

/**
 * Recursively set the `url` of the first link button (type 2, style 5) found in a
 * components tree. Pure (mutates in place) — unit tested. Returns true if one was updated.
 * Used by the Refresh Link handler to rewrite the "View Online" button's URL on its own message.
 */
export function setLinkButtonUrl(components, newUrl) {
  for (const c of (components || [])) {
    if (c?.type === 2 && c?.style === 5) { c.url = newUrl; return true; }
    if (Array.isArray(c?.components) && setLinkButtonUrl(c.components, newUrl)) return true;
  }
  return false;
}

/** Build the Components V2 container that wraps the archive file. */
function buildContainer(displayName, count, cbEmojiStr, filename, nowUnix, firstUnix, lastUnix, threads = []) {
  const threadCount = threads.length;
  const threadMsgCount = threads.reduce((n, t) => n + (t.messages?.length || 0), 0);
  const threadLine = threadCount > 0 ? `\n🧵 Threads: **${threadCount}** (${threadMsgCount} messages)` : '';
  return {
    type: 17,
    accent_color: 0x3498db,
    components: [
      { type: 10, content: `## 📂 #${displayName}\n-# ${cbEmojiStr} CastBot Archive` },
      { type: 14 },
      { type: 10, content: `✉️ Number of Messages: **${count}**\n🗂️ Archive date: <t:${nowUnix}:F>\n📅 First message: <t:${firstUnix}:F>\n📅 Last message: <t:${lastUnix}:F>${threadLine}` },
      { type: 14 },
      { type: 10, content: `## 🔍 Viewing the archive` },
      { type: 13, file: { url: `attachment://${filename}` } },
      { type: 10, content: `-# **Option 1** — Download and open the HTML file above\n-# **Option 2** — Use the link button below to view online *(expires ~24h, use 🔄 Refresh Link)*\n-# **Option 3** — ✨ **Unarchive** recreates the entire channel. Very slow even for one channel — use sparingly, it defeats the purpose of archiving.` }
    ]
  };
}

/**
 * Rough per-message HTML byte estimate for byte-aware splitting. In Self-Contained mode the
 * embedded image **data-URI lengths are exact** (and dominate); text is small. Pure.
 */
export function estimateMessageBytes(msg, imageData = null) {
  let n = 600; // markup/header/avatar overhead
  n += (msg.content?.length || 0) * 1.2;
  if (msg.components?.length) n += 400;
  for (const e of (msg.embeds || [])) n += (e.title?.length || 0) + (e.description?.length || 0) + 100;
  for (const a of (msg.attachments || [])) n += imageData?.[a.url] ? imageData[a.url].length : 300;
  return Math.ceil(n);
}

/**
 * Post a single archive message (file + container) and its action buttons.
 * Both POSTs go through the paced/retrying `post`. A 413 (oversized part) is handled gracefully
 * in-place; other file-POST failures throw so the caller can report them.
 */
async function postOneArchive(post, channelName, msgs, cbEmojiStr, partLabel, precomputedHtml, resolver, threads = [], imageData = null) {
  const displayName = partLabel ? `${channelName} (Part ${partLabel.i}/${partLabel.n})` : channelName;
  const html = precomputedHtml ?? generateExportHTML(displayName, msgs, resolver, threads, { imageData });
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${channelName}-export-${today}${partLabel ? `-part${partLabel.i}` : ''}.html`;
  const fileBuffer = Buffer.from(html, 'utf-8');
  const nowUnix = Math.floor(Date.now() / 1000);
  // msgs are sorted oldest-first → first/last message timestamps for the metadata block.
  const toUnix = (ts) => { const u = Math.floor(new Date(ts).getTime() / 1000); return Number.isNaN(u) ? nowUnix : u; };
  const firstUnix = msgs.length ? toUnix(msgs[0].timestamp) : nowUnix;
  const lastUnix = msgs.length ? toUnix(msgs[msgs.length - 1].timestamp) : nowUnix;

  const container = buildContainer(displayName, msgs.length, cbEmojiStr, filename, nowUnix, firstUnix, lastUnix, threads);

  // POST 1 — multipart file + container
  const form = new FormData();
  form.append('files[0]', fileBuffer, { filename, contentType: 'text/html' });
  form.append('payload_json', JSON.stringify({
    flags: IS_CV2,
    components: [container],
    attachments: [{ id: 0, filename }]
  }));

  const fileRes = await post({ body: form, headers: form.getHeaders() });
  if (!fileRes.ok) {
    const errText = await fileRes.text();
    // 413 = this part still exceeded Discord's upload cap (rare after byte-split: a single message
    // with many big embedded images). Skip THIS part gracefully (note in-channel) — don't fail the
    // whole channel/run, so sibling parts still post.
    if (fileRes.status === 413) {
      console.warn(`⚠️ ${displayName}: part too large (413) — skipped. ${(fileBuffer.length / 1048576).toFixed(1)} MB`);
      try {
        await post({
          body: JSON.stringify({ flags: IS_CV2, components: [{ type: 17, accent_color: 0xe67e22, components: [{ type: 10, content: `## ⚠️ #${displayName} — part skipped\n-# This part (${(fileBuffer.length / 1048576).toFixed(1)} MB) exceeded Discord's upload limit. Try **📥 Archive** mode (image links instead of embeds) for this channel.` }] }] }),
          headers: { 'Content-Type': 'application/json' }
        });
      } catch { /* note is best-effort */ }
      return;
    }
    const err = new Error(`file POST ${fileRes.status}: ${errText.slice(0, 200)}`);
    err.status = fileRes.status;
    throw err;
  }
  const postData = await fileRes.json();
  const fileMsgId = postData.id;
  if (!fileMsgId) { console.warn(`⚠️ No message id for #${displayName} — buttons skipped.`); return; }

  // POST 2 — the action buttons in the LOCKED state ([🔐 Unlock Archive] [✨ Unarchive]).
  // No link is posted now → no stale ~24h link ever sits public. Unlock mints a fresh one
  // on demand (archive_unlock_* handler), and a scheduler job reverts it after ~10 min.
  const btnRes = await post({
    body: JSON.stringify({ flags: IS_CV2, components: [buildArchiveButtons(fileMsgId)] }),
    headers: { 'Content-Type': 'application/json' }
  });
  if (!btnRes.ok) {
    console.error(`⚠️ Archive button POST failed for #${displayName}: ${btnRes.status} ${await btnRes.text()}`);
  } else {
    console.log(`✅ Archive complete: #${displayName} (${msgs.length} messages)`);
  }
}

/**
 * Replace the original "📦 Archiving…" ephemeral (the interaction @original) with the run's
 * Archive-Complete summary — this both clears the now-stale Abandon button and shows the result.
 * Edits in place via PATCH /webhooks/{app}/{token}/messages/@original (stays ephemeral). On token
 * expiry (long run >15 min) it's logged and skipped — the per-channel archive posts remain.
 */
async function updateRunMessage(container, { interactionToken, applicationId }) {
  if (!interactionToken || !applicationId) {
    console.log('ℹ️ Archive: no interaction token — run message not updated.');
    return;
  }
  try {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: IS_CV2, components: [container] })
    });
    if (res.ok) return;
    const body = await res.text();
    if (res.status === 401) {
      console.log('ℹ️ Archive: run message not updated — interaction token expired on a long run.');
    } else {
      console.error(`⚠️ Archive: run message update failed: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error(`⚠️ Archive: run message update error: ${err.message}`);
  }
}

/**
 * Archive a list of channels into the invoking channel.
 * @param {Array<{id:string,name:string}>} channels
 * @param {string} invokedChannelId - channel the archive messages are posted to
 * @param {object} [opts]
 * @param {string} [opts.interactionToken] - to send the final summary as an ephemeral followup
 * @param {string} [opts.applicationId]
 * @param {object} [opts.client] - Discord client, for resolving role/channel mention names from cache
 * @param {string} [opts.guildId]
 * @param {boolean} [opts.embedImages] - base64-embed images so they never expire ("Self-Contained" mode)
 * @param {string} [opts.abortKey] - key into global.abortArchive; set true to halt the run (🚧 Abandon)
 */
export async function archiveChannels(channels, invokedChannelId, { interactionToken, applicationId, client, guildId, embedImages = false, abortKey = null } = {}) {
  const post = createMessagePoster(invokedChannelId);
  const cbEmoji = getBotEmoji('cb_blue');
  const cbEmojiStr = cbEmoji?.id ? `<:cb_blue:${cbEmoji.id}>` : '🗄️';
  const isAborted = () => !!(abortKey && global.abortArchive?.get(abortKey));
  let abandoned = false;

  // Build the mention name-resolver ONCE from the bot's in-memory guild cache (no REST).
  // User names are also auto-filled per-message from each message's `mentions[]` in the generator.
  const resolver = { users: {}, roles: {}, channels: {} };
  const guild = client?.guilds?.cache?.get(guildId);
  if (guild) {
    for (const r of guild.roles.cache.values()) resolver.roles[r.id] = { name: r.name, color: r.color };
    for (const c of guild.channels.cache.values()) resolver.channels[c.id] = c.name;
    for (const m of guild.members.cache.values()) resolver.users[m.id] = m.displayName || m.user?.globalName || m.user?.username;
    console.log(`🔖 Mention resolver: ${Object.keys(resolver.roles).length} roles, ${Object.keys(resolver.channels).length} channels, ${Object.keys(resolver.users).length} cached members`);
  } else {
    console.warn(`⚠️ No guild in cache for ${guildId} — role/channel mentions will fall back to generic labels`);
  }

  // Guild active threads — fetched once and reused across all channels in this run.
  let activeThreads = [];
  if (guild) { try { activeThreads = await fetchGuildActiveThreads(guildId); } catch (e) { console.warn(`⚠️ active threads fetch failed: ${e.message}`); } }

  let succeeded = 0;
  let failed = 0;
  let totalMsgs = 0, totalThreads = 0, totalThreadMsgs = 0; // aggregated for the completion summary

  for (const channel of channels) {
    if (isAborted()) { abandoned = true; break; } // 🚧 user abandoned → stop before the next channel
    try {
      console.log(`📥 START archive: #${channel.name} (${channel.id})`);

      const { messages, total429, batches } = await fetchAllChannelMessages(channel.id, {
        onProgress: (n) => { if (n % 500 === 0) console.log(`  📥 Fetched ${n} messages...`); },
        shouldAbort: isAborted,
      });
      console.log(`📥 Fetch complete: ${messages.length} messages in ${batches} batches (${total429} rate-limit waits)`);
      if (isAborted()) { abandoned = true; break; }

      // Discover + fetch this channel's threads (active + public/private archived). Each thread
      // is a channel → reuse fetchAllChannelMessages. Render-only (not restored).
      let threads = [];
      try {
        const threadChannels = await fetchChannelThreads(channel.id, { activeThreads });
        for (const tc of threadChannels) {
          if (isAborted()) break;
          const tr = await fetchAllChannelMessages(tc.id, { shouldAbort: isAborted });
          threads.push({ id: tc.id, name: tc.name, messages: tr.messages });
        }
        if (threads.length) {
          const tMsgs = threads.reduce((n, t) => n + t.messages.length, 0);
          console.log(`  🧵 ${threads.length} thread(s), ${tMsgs} messages`);
        }
      } catch (e) {
        console.warn(`⚠️ thread fetch failed for #${channel.name}: ${e.message}`);
      }

      // "Self-Contained" mode: base64-embed images so they never expire (slower, larger).
      let imageData = null;
      if (embedImages) {
        const all = [...messages, ...threads.flatMap(t => t.messages || [])];
        imageData = await fetchImageData(all);
        console.log(`  🖼️ embedded ${Object.keys(imageData).length} image(s)`);
      }

      // Generate once to size; single message if it fits, else split into parts under the cap.
      const fullHtml = generateExportHTML(channel.name, messages, resolver, threads, { imageData });
      const fullBytes = Buffer.byteLength(fullHtml, 'utf-8');

      if (fullBytes <= SAFE_UPLOAD_BYTES || messages.length <= 1) {
        await postOneArchive(post, channel.name, messages, cbEmojiStr, null, fullHtml, resolver, threads, imageData);
      } else {
        // Byte-aware greedy split: pack messages (incl. each one's attached thread) into parts that
        // each stay under the cap. Message-count splitting failed when embedded images clustered into
        // one half (→ a >10 MB part → 413). Embedded image data-URI lengths are known exactly.
        const TARGET = Math.floor(SAFE_UPLOAD_BYTES * 0.8); // headroom for CSS/template/overhead
        const parentIds = new Set(messages.map(m => m.id));
        const threadById = new Map(threads.map(t => [t.id, t]));
        const orphanThreads = threads.filter(t => !parentIds.has(t.id)); // parent not in any slice → last part
        const msgBytes = (m) => {
          let b = estimateMessageBytes(m, imageData);
          const thr = threadById.get(m.id);
          if (thr) for (const tm of (thr.messages || [])) b += estimateMessageBytes(tm, imageData);
          return b;
        };
        const chunks = [];
        let cur = [], curBytes = 0;
        for (const m of messages) {
          const b = msgBytes(m);
          if (cur.length && curBytes + b > TARGET) { chunks.push(cur); cur = []; curBytes = 0; }
          cur.push(m); curBytes += b;
        }
        if (cur.length) chunks.push(cur);
        console.log(`  ✂️ #${channel.name} is ${(fullBytes / 1048576).toFixed(1)} MB — splitting into ${chunks.length} parts`);
        for (let i = 0; i < chunks.length; i++) {
          const slice = chunks[i];
          const sliceIds = new Set(slice.map(m => m.id));
          let sliceThreads = threads.filter(t => sliceIds.has(t.id));
          if (i === chunks.length - 1) sliceThreads = sliceThreads.concat(orphanThreads);
          await postOneArchive(post, channel.name, slice, cbEmojiStr, { i: i + 1, n: chunks.length }, undefined, resolver, sliceThreads, imageData);
        }
      }
      succeeded++;
      totalMsgs += messages.length;
      totalThreads += threads.length;
      totalThreadMsgs += threads.reduce((n, t) => n + (t.messages?.length || 0), 0);
    } catch (err) {
      failed++;
      console.error(`❌ Archive error for #${channel.name}:`, err);
      try {
        await post({
          body: JSON.stringify({
            flags: IS_CV2,
            components: [{ type: 17, accent_color: 0xe74c3c, components: [{ type: 10, content: `❌ Archive failed for **#${channel.name}**: ${err.message}` }] }]
          }),
          headers: { 'Content-Type': 'application/json' }
        });
      } catch { /* posting the error failed too — nothing more to do */ }
    }
  }

  // Replace the "📦 Archiving…" ephemeral with the completion summary (clears the Abandon button,
  // styled like the archive posts) + [📂 Archive Another] [🧹 Nuke Category] actions.
  const remaining = channels.length - succeeded - failed;
  const head = abandoned ? '🛑 Archiving abandoned' : (failed ? '⚠️ Archive complete' : '✅ Archive complete');
  const tail = abandoned && remaining > 0 ? `\n-# Stopped — re-run to finish the remaining ${remaining} channel${remaining !== 1 ? 's' : ''}.` : '';
  const summaryContainer = {
    type: 17,
    accent_color: abandoned || failed ? 0xe67e22 : 0x2ecc71,
    components: [
      { type: 10, content: `## ${head}\n-# ${cbEmojiStr} CastBot Archive\n\n📂 **${succeeded}** channel${succeeded !== 1 ? 's' : ''} archived${failed ? `, ⚠️ ${failed} failed` : ''} (of ${channels.length})\n✉️ ${totalMsgs} message${totalMsgs !== 1 ? 's' : ''}${totalThreads ? `\n🧵 ${totalThreads} thread${totalThreads !== 1 ? 's' : ''} (${totalThreadMsgs} messages)` : ''}${tail}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 1, custom_id: 'archive_channel', label: 'Archive Another', emoji: { name: '📂' } },
        { type: 2, style: 2, custom_id: 'prod_nuke_category', label: 'Nuke Category', emoji: { name: '☢️' } },
      ] },
    ]
  };
  await updateRunMessage(summaryContainer, { interactionToken, applicationId });

  if (abortKey) global.abortArchive?.delete(abortKey);
  console.log(`🏁 Archive run done: ${succeeded} ok, ${failed} failed${abandoned ? ', ABANDONED' : ''} (of ${channels.length})`);
  return { succeeded, failed, total: channels.length, abandoned };
}
