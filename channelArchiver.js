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
import { fetchAllChannelMessages, createMessagePoster } from './channelExportFetcher.js';
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
  { value: 'archive_only', label: 'Archive Only', emoji: '📥', implemented: true,
    description: 'Save channels/categories as HTML, posted in this channel' },
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
      { type: 10, content: `### \`\`\`⚙️ Archive Mode\`\`\`` },
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
        { type: 2, custom_id: 'prod_nuke_category', label: 'Nuke Category', style: 4, emoji: { name: '🧹' } } // copy of Nuke/Delete Category button (self-contained flow)
      ] }
    ]
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
async function postOneArchive(post, channelName, msgs, cbEmojiStr, partLabel, precomputedHtml, resolver) {
  const displayName = partLabel ? `${channelName} (Part ${partLabel.i}/${partLabel.n})` : channelName;
  const html = precomputedHtml ?? generateExportHTML(displayName, msgs, resolver);
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
  const maxNameLen = 80 - 'View #'.length - ' Online'.length; // 67 chars (account for the # prefix)
  const truncName = displayName.length > maxNameLen ? displayName.slice(0, maxNameLen - 1) + '…' : displayName;

  const btnRes = await post({
    body: JSON.stringify({
      flags: IS_CV2,
      components: [{
        type: 17,
        components: [{ type: 1, components: [{ type: 2, style: 5, label: `View #${truncName} Online`, url: viewUrl }] }]
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
 * Post the run summary as an EPHEMERAL interaction followup (only the invoking user
 * sees it) — the archives themselves are public by design, but this status message is
 * not. Falls back to a public channel post if the interaction token is missing/expired
 * (tokens live ~15 min; a very long run could outlast it), so a run never ends silently.
 */
async function postSummary(container, { interactionToken, applicationId, post }) {
  if (interactionToken && applicationId) {
    try {
      const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: IS_CV2 | EPHEMERAL, components: [container] })
      });
      if (res.ok) return;
      const body = await res.text();
      // 401 / code 50027 (Invalid Webhook Token) = the interaction token expired because the
      // run outlasted the 15-min window. Expected on long runs — log as info (not an error, so
      // the PM2 error logger ignores it) and fall back to a public summary post.
      if (res.status === 401) {
        console.log(`ℹ️ Archive summary: interaction token expired (long run) — posting summary publicly instead.`);
      } else {
        console.error(`⚠️ Ephemeral summary followup failed: ${res.status} ${body} — falling back to public post`);
      }
    } catch (err) {
      console.error(`⚠️ Ephemeral summary followup error: ${err.message} — falling back to public post`);
    }
  }
  try {
    await post({ body: JSON.stringify({ flags: IS_CV2, components: [container] }), headers: { 'Content-Type': 'application/json' } });
  } catch { /* summary is best-effort */ }
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
 */
export async function archiveChannels(channels, invokedChannelId, { interactionToken, applicationId, client, guildId } = {}) {
  const post = createMessagePoster(invokedChannelId);
  const cbEmoji = getBotEmoji('cb_blue');
  const cbEmojiStr = cbEmoji?.id ? `<:cb_blue:${cbEmoji.id}>` : '🗄️';

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
      const fullHtml = generateExportHTML(channel.name, messages, resolver);
      const fullBytes = Buffer.byteLength(fullHtml, 'utf-8');

      if (fullBytes <= SAFE_UPLOAD_BYTES || messages.length <= 1) {
        await postOneArchive(post, channel.name, messages, cbEmojiStr, null, fullHtml, resolver);
      } else {
        const parts = Math.ceil(fullBytes / SAFE_UPLOAD_BYTES);
        const perChunk = Math.ceil(messages.length / parts);
        console.log(`  ✂️ #${channel.name} is ${(fullBytes / 1048576).toFixed(1)} MB — splitting into ${parts} parts`);
        for (let i = 0; i < parts; i++) {
          const slice = messages.slice(i * perChunk, (i + 1) * perChunk);
          if (!slice.length) break;
          await postOneArchive(post, channel.name, slice, cbEmojiStr, { i: i + 1, n: parts }, undefined, resolver);
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

  // Final summary (ephemeral — only the invoking user) so the run never "silently" ends.
  if (channels.length > 1) {
    const summaryContainer = {
      type: 17,
      accent_color: failed ? 0xe67e22 : 0x2ecc71,
      components: [{ type: 10, content: `## ${failed ? '⚠️' : '✅'} Archive run complete\n${succeeded} archived${failed ? `, ${failed} failed` : ''} (of ${channels.length}).` }]
    };
    await postSummary(summaryContainer, { interactionToken, applicationId, post });
  }

  console.log(`🏁 Archive run done: ${succeeded} ok, ${failed} failed (of ${channels.length})`);
  return { succeeded, failed, total: channels.length };
}
