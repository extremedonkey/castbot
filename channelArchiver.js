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
import { fetchAllChannelMessages, createMessagePoster } from './channelExportFetcher.js';
import { generateExportHTML } from './channelExport.js';
import { getBotEmoji } from './botEmojis.js';

const IS_CV2 = 1 << 15;
// Stay comfortably under Discord's base upload cap (~10 MiB at boost level 0).
const SAFE_UPLOAD_BYTES = 9 * 1024 * 1024;

/** Recursively find the resolved CDN URL inside a type-13 (File) component tree. */
function findType13Url(comps) {
  for (const c of (comps || [])) {
    if (c.type === 13 && c.file?.url && !c.file.url.startsWith('attachment://')) return c.file.url;
    const hit = findType13Url(c.components);
    if (hit) return hit;
  }
  return null;
}

/** Build the Components V2 container that wraps the archive file. */
function buildContainer(displayName, count, cbEmojiStr, filename, nowUnix) {
  return {
    type: 17,
    accent_color: 0x3498db,
    components: [
      { type: 10, content: `## 📂 #${displayName}\n-# ${cbEmojiStr} CastBot Archive` },
      { type: 14 },
      { type: 10, content: `📄 **${count} messages**\n📅 <t:${nowUnix}:F>` },
      { type: 14 },
      { type: 10, content: `## 🔍 Viewing the archive` },
      { type: 13, file: { url: `attachment://${filename}` } },
      { type: 10, content: `-# **Option 1** — Download and open the HTML file above\n-# **Option 2** — Use the link button below to view online *(expires ~24h)*` }
    ]
  };
}

/**
 * Post a single archive message (file + container) and its "View Online" button.
 * Both POSTs go through the paced/retrying `post`. Throws on a non-recoverable file
 * POST failure so the caller can report it (no silent skips).
 */
async function postOneArchive(post, channelName, msgs, cbEmojiStr, partLabel, precomputedHtml) {
  const displayName = partLabel ? `${channelName} (Part ${partLabel.i}/${partLabel.n})` : channelName;
  const html = precomputedHtml ?? generateExportHTML(displayName, msgs);
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${channelName}-export-${today}${partLabel ? `-part${partLabel.i}` : ''}.html`;
  const fileBuffer = Buffer.from(html, 'utf-8');
  const nowUnix = Math.floor(Date.now() / 1000);

  const container = buildContainer(displayName, msgs.length, cbEmojiStr, filename, nowUnix);

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
    const err = new Error(`file POST ${fileRes.status}: ${errText.slice(0, 200)}`);
    err.status = fileRes.status;
    throw err;
  }
  const postData = await fileRes.json();

  // Resolve CDN URL — for CV2 + type-13, Discord puts it inside the component, not attachments[].
  let cdnUrl = postData.attachments?.[0]?.url || findType13Url(postData.components);
  if (!cdnUrl) {
    console.warn(`⚠️ No CDN URL for #${displayName} — button skipped.`);
    return;
  }

  // POST 2 — separate message with the "View Online" link button
  const viewUrl = `https://htmlpreview.github.io/?${cdnUrl}`;
  const maxNameLen = 80 - 'View '.length - ' Online'.length; // 68 chars
  const truncName = displayName.length > maxNameLen ? displayName.slice(0, maxNameLen - 1) + '…' : displayName;

  const btnRes = await post({
    body: JSON.stringify({
      flags: IS_CV2,
      components: [{
        type: 17,
        components: [{ type: 1, components: [{ type: 2, style: 5, label: `View ${truncName} Online`, url: viewUrl }] }]
      }]
    }),
    headers: { 'Content-Type': 'application/json' }
  });
  if (!btnRes.ok) {
    console.error(`⚠️ Archive button POST failed for #${displayName}: ${btnRes.status} ${await btnRes.text()}`);
  } else {
    console.log(`✅ Archive complete: #${displayName} (${msgs.length} messages)`);
  }
}

/**
 * Archive a list of channels into the invoking channel.
 * @param {Array<{id:string,name:string}>} channels
 * @param {string} invokedChannelId - channel the archive messages are posted to
 */
export async function archiveChannels(channels, invokedChannelId) {
  const post = createMessagePoster(invokedChannelId);
  const cbEmoji = getBotEmoji('cb_blue');
  const cbEmojiStr = cbEmoji?.id ? `<:cb_blue:${cbEmoji.id}>` : '🗄️';

  let succeeded = 0;
  let failed = 0;

  for (const channel of channels) {
    try {
      console.log(`📥 START archive: #${channel.name} (${channel.id})`);

      const { messages, total429, batches } = await fetchAllChannelMessages(channel.id, {
        onProgress: (n) => { if (n % 500 === 0) console.log(`  📥 Fetched ${n} messages...`); }
      });
      console.log(`📥 Fetch complete: ${messages.length} messages in ${batches} batches (${total429} rate-limit waits)`);

      // Generate once to size; single message if it fits, else split into parts under the cap.
      const fullHtml = generateExportHTML(channel.name, messages);
      const fullBytes = Buffer.byteLength(fullHtml, 'utf-8');

      if (fullBytes <= SAFE_UPLOAD_BYTES || messages.length <= 1) {
        await postOneArchive(post, channel.name, messages, cbEmojiStr, null, fullHtml);
      } else {
        const parts = Math.ceil(fullBytes / SAFE_UPLOAD_BYTES);
        const perChunk = Math.ceil(messages.length / parts);
        console.log(`  ✂️ #${channel.name} is ${(fullBytes / 1048576).toFixed(1)} MB — splitting into ${parts} parts`);
        for (let i = 0; i < parts; i++) {
          const slice = messages.slice(i * perChunk, (i + 1) * perChunk);
          if (!slice.length) break;
          await postOneArchive(post, channel.name, slice, cbEmojiStr, { i: i + 1, n: parts });
        }
      }
      succeeded++;
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

  // Final summary so the run never "silently" ends.
  if (channels.length > 1) {
    try {
      await post({
        body: JSON.stringify({
          flags: IS_CV2,
          components: [{
            type: 17,
            accent_color: failed ? 0xe67e22 : 0x2ecc71,
            components: [{ type: 10, content: `## ${failed ? '⚠️' : '✅'} Archive run complete\n${succeeded} archived${failed ? `, ${failed} failed` : ''} (of ${channels.length}).` }]
          }]
        }),
        headers: { 'Content-Type': 'application/json' }
      });
    } catch { /* summary is best-effort */ }
  }

  console.log(`🏁 Archive run done: ${succeeded} ok, ${failed} failed (of ${channels.length})`);
  return { succeeded, failed, total: channels.length };
}
