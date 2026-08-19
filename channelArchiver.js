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
 * Two orthogonal axes, four combinations — no stubs, everything here runs:
 *   `embed`   — base64-embed images into the HTML (permanent) vs. keep CDN links (expire ~24h)
 *   `deletes` — delete each source channel after its archive is VERIFIED posted
 *
 * 🔴 Full Archive is the DEFAULT: if a mode deletes the source, embedded images are the only
 * ones that survive it — a Fast archive of a deleted channel loses its images within a day.
 */
export const ARCHIVE_MODES = [
  { value: 'archive_only', label: 'Fast Archive', emoji: '📥', implemented: true, embed: false, deletes: false,
    description: 'Archives fast; text permanent but images expire in 24hrs. HTML file that can also be viewed online.' },
  { value: 'archive_embed', label: 'Full Archive', emoji: '🖼️', implemented: true, embed: true, deletes: false,
    description: 'Slower but permanently saves images which last forever and survive channel deletion.' },
  { value: 'archive_delete', label: 'Fast Archive + Delete Channels', emoji: '🗑️', implemented: true, embed: false, deletes: true,
    description: '☠️ Fast archive, then PERMANENTLY DELETES each channel. Images expire in 24hrs — gone for good.' },
  { value: 'archive_embed_delete', label: 'Full Archive + Delete Channels', emoji: '☠️', implemented: true, embed: true, deletes: true,
    description: '☠️ Embeds images permanently, then PERMANENTLY DELETES each channel. The safest way to delete.' },
];

/** The mode used when nothing is chosen (and the fallback for an unknown value). */
export const DEFAULT_ARCHIVE_MODE = 'archive_embed';

/** Look up a mode by value, always returning a usable mode object. Pure. */
export function getArchiveMode(value) {
  return ARCHIVE_MODES.find(m => m.value === value)
    || ARCHIVE_MODES.find(m => m.value === DEFAULT_ARCHIVE_MODE);
}

/**
 * Build the main Archive Channels screen container (LEAN: sectioned, ephemeral menu).
 * Shared by the `archive_channel` button and the `archive_mode_select` re-render.
 * Picking a "+ Delete Channels" mode turns the whole card red and swaps the blurb for a
 * warning — the mode select is the first place the host can find out deletion is armed.
 * @param {string} mode - selected archive mode value (default 'archive_embed' = Full Archive)
 * @param {string} [note] - optional small note line
 */
export function buildArchiveScreen(mode = DEFAULT_ARCHIVE_MODE, note = '') {
  const selected = getArchiveMode(mode);
  const options = ARCHIVE_MODES.map(m => ({
    label: m.label,
    value: m.value,
    description: m.description.slice(0, 100), // Discord caps option descriptions at 100
    emoji: { name: m.emoji },
    default: m.value === selected.value,
  }));

  const modeBlurb = selected.deletes
    ? `### \`\`\`☠️ Archive Mode — DELETION ARMED\`\`\`\n-# **${selected.label}** archives each channel and then **permanently deletes it**. There is no undo. You'll get one more confirmation before anything is deleted.`
    : `### \`\`\`⚙️ Archive Mode\`\`\`\n-# How images are stored: **Fast Archive** keeps links (fast; images expire ~24h) · **Full Archive** embeds them so they never expire (slower, larger).`;

  return {
    type: 17,
    accent_color: selected.deletes ? 0xe74c3c : 0x3498db,
    components: [
      { type: 10, content: `## 🧹 Archive Channels\n\nArchive full message history as styled HTML files.${note ? `\n\n${note}` : ''}` },
      { type: 14 },
      { type: 10, content: modeBlurb },
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
        { type: 2, style: 2, label: '← Back', custom_id: 'castbot_tools' },
        { type: 2, custom_id: 'archive_retrieve', label: 'Retrieve Archive', style: 2, emoji: { name: '📥' } },
        { type: 2, custom_id: 'prod_nuke_category', label: 'Nuke Channels', style: 2, emoji: { name: '☢️' } }
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
 * Build a full-width "category" divider banner posted above a category's channel archives.
 * Uses the notify-restart.js trick: `> # \`text + padding\`` renders an H1 monospace bar.
 */
function buildCategoryBanner(name) {
  const clean = String(name || 'Category').replace(/`/g, '');
  const padded = `${clean}${' '.repeat(Math.max(0, 40 - clean.length))}`;
  return { type: 17, accent_color: 0x3498db, components: [{ type: 10, content: `> # \`📂 ${padded}\`` }] };
}

/**
 * Expand an archive multi-selection into a flat, de-duplicated list of channels.
 * Pure function — unit tested in tests/channelArchiver.test.js.
 *
 * @param {string[]} selectedIds - the channel/category IDs picked in the select
 * @param {Array<{id,name,type,parent_id,position}>} allChannels - the guild's channels
 *   (from the bot cache or one REST call), normalized to these fields
 * @param {object} [resolved] - req.body.data.resolved.channels (fallback for selected items)
 * @returns {{channels: Array<{id,name,category,categoryId}>, categoryCount: number, categories: Array<{id,name}>}}
 *   channels de-duped by id (category + a child inside it won't archive twice).
 *   `categories` lists the EXPLICITLY selected categories — the "+ Delete Channels" modes use
 *   it to tidy up a category once every channel inside it has been archived and deleted.
 */
export function expandArchiveSelection(selectedIds, allChannels, resolved = {}) {
  const byId = new Map((allChannels || []).map(c => [c.id, c]));
  const childrenOf = (catId) => (allChannels || [])
    .filter(c => c.parent_id === catId && [0, 5].includes(c.type))
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const picked = new Map();     // id → {id, name, category, categoryId} — dedupe + insertion order
  const categories = new Map(); // id → {id, name} — explicitly selected categories only
  for (const id of (selectedIds || [])) {
    const ch = byId.get(id) || resolved[id];
    if (!ch) continue;
    if (ch.type === 4) { // category → expand to its text/announcement children (tagged with the category name)
      categories.set(ch.id, { id: ch.id, name: ch.name });
      for (const kid of childrenOf(id)) picked.set(kid.id, { id: kid.id, name: kid.name, category: ch.name, categoryId: ch.id });
    } else if ([0, 5].includes(ch.type)) { // directly-picked channel → no category divider
      picked.set(ch.id, { id: ch.id, name: ch.name, category: null, categoryId: null });
    }
  }
  return { channels: [...picked.values()], categoryCount: categories.size, categories: [...categories.values()] };
}

/**
 * Build the pre-flight confirmation screen shown after channels are picked.
 *
 * Two very different cards from one builder, because they are the same decision at two
 * stakes: a plain archive is reversible (delete the file), an archive+delete is not. The
 * delete card therefore states the blast radius, names the channel that is protected from
 * deletion, and only then offers a red button that says what it does.
 *
 * @param {object} args
 * @param {Array} args.channels - expanded channel list
 * @param {number} args.categoryCount
 * @param {Array} [args.categories] - explicitly selected categories (deleted if emptied)
 * @param {string} args.mode - archive mode value
 * @param {string} args.invokedChannelId - where archives are posted; never deleted
 * @param {boolean} [args.botCanDelete] - false → render the missing-permission card instead
 */
export function buildArchiveConfirmScreen({ channels, categoryCount = 0, categories = [], mode, invokedChannelId, botCanDelete = true }) {
  const selected = getArchiveMode(mode);
  const displayChannels = channels.slice(0, 20);
  const channelList = displayChannels.map(c => `- #${c.name}`).join('\n');
  const overflow = channels.length > 20 ? `\n-# ...and ${channels.length - 20} more` : '';
  const estMin = channels.length === 1 ? '1–5 min' : `${channels.length * 1}–${channels.length * 5} min`;
  const catNote = categoryCount > 0 ? ` (incl. ${categoryCount} categor${categoryCount !== 1 ? 'ies' : 'y'} expanded)` : '';
  const backRow = { type: 1, components: [{ type: 2, style: 2, label: '← Back', custom_id: 'archive_channel' }] };

  if (!selected.deletes) {
    const modeNote = selected.embed ? `\n-# 🖼️ Full Archive: images embedded as compressed WebP (survives source deletion; slower; non-image files not kept).` : '';
    return {
      type: 17,
      accent_color: 0x3498db,
      components: [
        { type: 10, content: `## 🧹 Archive Channels\n\n**${channels.length} channel${channels.length !== 1 ? 's' : ''}** will be archived${catNote}:\n\n${channelList}${overflow}\n\n-# ⏱️ Estimated time: ${estMin} (varies by message count)${modeNote}` },
        { type: 14 },
        { type: 1, components: [
          { type: 2, style: 4, label: '📦 Archive', custom_id: 'archive_confirm' },
          { type: 2, style: 2, label: '← Back', custom_id: 'archive_channel' }
        ]}
      ]
    };
  }

  // ── Delete modes ──────────────────────────────────────────────────────────────
  if (!botCanDelete) {
    return {
      type: 17,
      accent_color: 0xe74c3c,
      components: [
        { type: 10, content: `## ❌ CastBot can't delete channels\n\nCastBot is missing the **Manage Channels** permission, so **${selected.label}** cannot run. Nothing has been archived or deleted.\n\n-# Give CastBot's role **Manage Channels** (Server Settings → Roles), or switch to a plain archive mode.` },
        { type: 14 },
        backRow,
      ],
    };
  }

  const deletable = channels.filter(c => c.id !== invokedChannelId);
  const selfProtected = deletable.length !== channels.length;
  const protectionLine = selfProtected
    ? `\n\n🛡️ **This channel is protected.** The archives are posted here, so it is archived but **never deleted** — ${deletable.length} of the ${channels.length} will actually be deleted.`
    : '';
  const catLine = categories.length
    ? `\n📁 The ${categories.length} selected categor${categories.length !== 1 ? 'ies are' : 'y is'} deleted too, but **only** once empty — anything left inside keeps it alive.`
    : '';
  const imageLine = selected.embed
    ? `-# 🖼️ Images are embedded into the HTML first, so they survive the deletion permanently.`
    : `-# ⚠️ **Fast mode keeps image _links_, and those links die with the channel.** Images will be gone within ~24 hours. Use **Full Archive + Delete Channels** to keep them.`;

  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## ☠️ Archive AND DELETE ${channels.length} channel${channels.length !== 1 ? 's' : ''}?` },
      { type: 14 },
      { type: 10, content: `Each channel is archived into **this** channel, and then **permanently deleted**${catNote}.\n\n☠️ **This cannot be undone.** Once a channel is deleted, the HTML archive posted here is the ONLY copy of its history that exists.${protectionLine}${catLine}` },
      { type: 14 },
      { type: 10, content: `${channelList}${overflow}\n\n-# ⏱️ Estimated time: ${estMin} · a channel is deleted only after CastBot re-reads its archive from Discord and confirms it is really there.\n${imageLine}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 2, label: 'Cancel', custom_id: 'archive_channel', emoji: { name: '❌' } },
        { type: 2, style: 4, label: `Archive & Delete ${deletable.length}`, custom_id: 'archive_confirm', emoji: { name: '☠️' } },
      ]}
    ]
  };
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
      { type: 10, content: `-# **Option 1: 💽 Download and view** — download the file above and open it locally on your computer.\n-# **Option 2: 🌍 View Online** (recommended) — click the **🔐 Unlock Archive** button, then **View Archive** to view it online without downloading.\n-# **Option 3: 📤 Unarchive** — recreates the entire channel. Very slow even for one channel (hours for a large channel) — use sparingly, it defeats the purpose of archiving.` }
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
  // Emoji/mention/timestamp tokens render 4-6× their source length (e.g. <:name:id> → a ~140-char
  // <img> tag) — a token-dense channel measured 3.1× under the plain 1.2× estimate, blowing the
  // 10 MiB cap on split parts. +120 bytes per token keeps the estimate conservative.
  const tokens = msg.content?.match(/<a?:\w+:\d+>|<@[!&]?\d+>|<#\d+>|<t:\d+(?::\w)?>/g);
  if (tokens) n += tokens.length * 120;
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

  // getBuffer(), not the stream: a form-data stream is single-use, so the poster's 429
  // retry would re-send an already-drained body and hang. A Buffer is re-sendable.
  const fileRes = await post({ body: form.getBuffer(), headers: form.getHeaders() });
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
      return null;
    }
    const err = new Error(`file POST ${fileRes.status}: ${errText.slice(0, 200)}`);
    err.status = fileRes.status;
    throw err;
  }
  const postData = await fileRes.json();
  const fileMsgId = postData.id;
  if (!fileMsgId) { console.warn(`⚠️ No message id for #${displayName} — buttons skipped.`); return null; }

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
  return fileMsgId; // captured into the cross-server archive registry
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
    return false;
  }
  try {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: IS_CV2, components: [container] })
    });
    if (res.ok) return true;
    const body = await res.text();
    // 401/404 = the 15-minute token is gone for good; anything else may well be transient, so the
    // caller must not treat a one-off 500 as "stop updating for the rest of the run".
    if (res.status === 401 || res.status === 404) {
      console.log('ℹ️ Archive: run message not updated — interaction token expired on a long run.');
      return 'dead';
    }
    console.error(`⚠️ Archive: run message update failed: ${res.status} ${body}`);
  } catch (err) {
    console.error(`⚠️ Archive: run message update error: ${err.message}`);
  }
  return false;
}

/**
 * The "started" card the confirm click replaces itself with — the first frame of the run, and
 * the first place the 🚧 Abandon button appears.
 */
export function buildArchiveStarted(channelCount, mode) {
  const selected = getArchiveMode(mode);
  const modeLine = selected.embed ? `-# 🖼️ Full Archive (images embedded — slower).\n` : '';
  return {
    type: 17,
    accent_color: selected.deletes ? 0xe74c3c : 0x2ecc71,
    components: [
      { type: 10, content: `## ${selected.deletes ? '☠️' : '📦'} ${selected.deletes ? 'Archiving & deleting' : 'Archiving'} **${channelCount} channel${channelCount !== 1 ? 's' : ''}**\n${modeLine}-# Archive messages appear in this channel as each one completes.${selected.deletes ? ' Each channel is deleted immediately after its archive is verified.' : ''}\n-# 🚧 **Abandon** stops the run — nothing after that point is touched.` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 4, label: 'Abandon Archiving', custom_id: 'archive_abandon', emoji: { name: '🚧' } },
        { type: 2, style: 2, label: '← Data', custom_id: 'data_admin' }
      ] }
    ]
  };
}

/**
 * Live progress card for the ephemeral run message. Re-posts the 🚧 Abandon button on EVERY
 * update — it is the only way to stop a delete-mode run, so it must never be edited away.
 *
 * The interaction token dies at 15 minutes and these PATCHes stop landing; the button on the
 * last-rendered card keeps working regardless, because clicking it is a brand-new interaction.
 */
function buildProgressContainer({ done, total, succeeded, failed, deleted, current, deletes }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const stats = `-# 📂 ${succeeded} archived${deletes ? ` · 🗑️ ${deleted} deleted` : ''}${failed ? ` · ❌ ${failed} failed` : ''}`;
  return {
    type: 17,
    accent_color: deletes ? 0xe74c3c : 0x2ecc71,
    components: [
      { type: 10, content: `## ${deletes ? '☠️ Archiving & deleting…' : '📦 Archiving…'}\n\`${bar}\` ${done}/${total} (${pct}%)\n${stats}${current ? `\n-# Now: **#${current}**` : ''}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 4, label: 'Abandon Archiving', custom_id: 'archive_abandon', emoji: { name: '🚧' } },
        { type: 2, style: 2, label: '← Data', custom_id: 'data_admin' }
      ] }
    ]
  };
}

/**
 * 🔴 The ONLY gate between "archived" and "deleted" — every condition must hold or the channel
 * lives. Conditions are ordered cheapest-first so the REST verify only runs once the local
 * guards pass. Anything unexpected keeps the channel: a surplus channel is an inconvenience,
 * a wrongly-deleted one is unrecoverable.
 *
 * Gates 1–4 are pure and live in `checkDeleteGates` so they can be tested without a network —
 * gate 1 in particular ("never delete the channel holding the archives") is the invariant that,
 * if it ever broke, would destroy the archives at the exact moment they became the only copy.
 *
 * @returns {Promise<void>} — outcomes are recorded into `deleteStats`
 */
export function checkDeleteGates({ channelId, invokedChannelId, hasGuild, partMessageIds, aborted }) {
  // 1. NEVER delete the channel the archives were posted into — that destroys the archives.
  if (channelId === invokedChannelId) return { ok: false, reason: `it's this channel, where the archives live` };
  // 2. No guild object (bot cache miss) → we cannot resolve or delete anything safely.
  if (!hasGuild) return { ok: false, reason: 'guild not in cache, deletion skipped' };
  // 3. No file-message id → the archive never posted → there is nothing to fall back on.
  if (!partMessageIds?.length) return { ok: false, reason: 'archive did not post' };
  // 4. Abandoned between archiving and deleting → honour the abort.
  if (aborted) return { ok: false, reason: 'abandoned before deletion' };
  return { ok: true, reason: null };
}

async function verifyThenDelete(channel, { partMessageIds, invokedChannelId, guild, deleteStats, isAborted, userId }) {
  const gate = checkDeleteGates({
    channelId: channel.id, invokedChannelId, hasGuild: !!guild, partMessageIds, aborted: isAborted(),
  });
  if (!gate.ok) {
    deleteStats.skipped.push(`#${channel.name} — ${gate.reason}`);
    console.warn(`🛡️ Refused to delete #${channel.name}: ${gate.reason}`);
    return;
  }
  // 5. Re-fetch the LAST part straight from Discord. The POST returning 200 is not quite proof
  //    the message survives (auto-mod/webhook edge cases); this is. One GET per channel is a
  //    cheap price for an irreversible action.
  try {
    const lastId = partMessageIds[partMessageIds.length - 1];
    const res = await fetch(`https://discord.com/api/v10/channels/${invokedChannelId}/messages/${lastId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
    });
    if (!res.ok) {
      deleteStats.skipped.push(`#${channel.name} — archive could not be verified (${res.status})`);
      console.warn(`🛡️ Refused to delete #${channel.name}: archive verify returned ${res.status}`);
      return;
    }
    const msg = await res.json();
    if (!getArchiveFileUrl(msg)) {
      deleteStats.skipped.push(`#${channel.name} — archive file missing from its message`);
      console.warn(`🛡️ Refused to delete #${channel.name}: no archive file on message ${lastId}`);
      return;
    }
  } catch (err) {
    deleteStats.skipped.push(`#${channel.name} — archive verify failed (${err.message})`);
    console.warn(`🛡️ Refused to delete #${channel.name}: verify threw ${err.message}`);
    return;
  }

  // Verified. Delete it.
  const { deleteOneChannel } = await import('./channelNuker.js');
  const outcome = await deleteOneChannel(guild, channel, `CastBot Archive & Delete (by ${userId || 'unknown'})`);
  if (outcome.status === 'deleted' || outcome.status === 'gone') {
    deleteStats.deleted++;
    console.log(`🗑️ Archived & deleted #${channel.name} (${deleteStats.deleted})`);
  } else {
    deleteStats.failed++;
    deleteStats.skipped.push(`#${channel.name} — ${outcome.error}`);
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
 * @param {string} [opts.userId] - host who ran it; the run is registered under their player record for cross-server retrieval
 * @param {boolean} [opts.deleteAfter] - "+ Delete Channels" modes: delete each source channel once its archive is VERIFIED posted
 * @param {Array<{id,name}>} [opts.selectedCategories] - explicitly-picked categories; removed at the end if deleteAfter emptied them
 */
export async function archiveChannels(channels, invokedChannelId, { interactionToken, applicationId, client, guildId, embedImages = false, abortKey = null, userId = null, deleteAfter = false, selectedCategories = [] } = {}) {
  const post = createMessagePoster(invokedChannelId);
  const cbEmoji = getBotEmoji('cb_blue');
  const cbEmojiStr = cbEmoji?.id ? `<:cb_blue:${cbEmoji.id}>` : '🗄️';
  const isAborted = () => !!(abortKey && global.abortArchive?.get(abortKey));
  let abandoned = false;
  const runChannels = []; // { name, category, partMessageIds } — for the cross-server archive registry
  const deleteStats = { deleted: 0, failed: 0, skipped: [] }; // "+ Delete Channels" outcomes

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

  // Live progress on the ephemeral run message. Throttled, and self-disarming once the 15-minute
  // interaction token dies (further PATCHes would 401 on every channel for the rest of the run).
  // Only a definitive 'dead' disarms it — a transient 5xx must not silence the rest of the run.
  let progressDead = false, lastProgressAt = 0;
  const showProgress = async (current) => {
    if (progressDead) return;
    if (Date.now() - lastProgressAt < 5000) return;
    lastProgressAt = Date.now();
    const result = await updateRunMessage(
      buildProgressContainer({ done: succeeded + failed, total: channels.length, succeeded, failed, deleted: deleteStats.deleted, current, deletes: deleteAfter }),
      { interactionToken, applicationId }
    );
    if (result === 'dead') progressDead = true;
  };

  let lastCategory = null;
  for (const channel of channels) {
    if (isAborted()) { abandoned = true; break; } // 🚧 user abandoned → stop before the next channel
    await showProgress(channel.name);

    // Entering a new category (channels are grouped by category) → post a divider banner above it.
    if (channel.category && channel.category !== lastCategory) {
      lastCategory = channel.category;
      try {
        await post({ body: JSON.stringify({ flags: IS_CV2, components: [buildCategoryBanner(channel.category)] }), headers: { 'Content-Type': 'application/json' } });
      } catch (e) { console.warn(`⚠️ category banner failed for "${channel.category}": ${e.message}`); }
    }

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

      const partMessageIds = []; // file-message ids for the cross-server archive registry
      if (fullBytes <= SAFE_UPLOAD_BYTES || messages.length <= 1) {
        const id = await postOneArchive(post, channel.name, messages, cbEmojiStr, null, fullHtml, resolver, threads, imageData);
        if (id) partMessageIds.push(id);
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
          const id = await postOneArchive(post, channel.name, slice, cbEmojiStr, { i: i + 1, n: chunks.length }, undefined, resolver, sliceThreads, imageData);
          if (id) partMessageIds.push(id);
        }
      }
      if (partMessageIds.length) runChannels.push({ name: channel.name, category: channel.category || null, partMessageIds });
      succeeded++;
      totalMsgs += messages.length;
      totalThreads += threads.length;
      totalThreadMsgs += threads.reduce((n, t) => n + (t.messages?.length || 0), 0);

      // "+ Delete Channels" modes — per channel, and only through verifyThenDelete's gate.
      // Deleting here (rather than in a sweep at the end) keeps archive+delete atomic per
      // channel: whatever the run does next, this channel is either both or neither.
      if (deleteAfter) {
        await verifyThenDelete(channel, { partMessageIds, invokedChannelId, guild, deleteStats, isAborted, userId });
      }
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

  // "+ Delete Channels": a selected category whose channels have all just been deleted is now an
  // empty shell — remove it too, so the run actually frees the slots the host came here for.
  // deleteChannelItems' survivor check does the guarding: anything still inside (a protected
  // channel, a voice channel we never archived, a failed delete) keeps the category alive.
  if (deleteAfter && !abandoned && guild && selectedCategories.length) {
    try {
      const { deleteChannelItems } = await import('./channelNuker.js');
      const catItems = selectedCategories.map(c => ({ id: c.id, name: c.name, type: 4, category: null }));
      const catResult = await deleteChannelItems(guild, catItems, {
        protectIds: [invokedChannelId],
        shouldAbort: isAborted,
        reason: `CastBot Archive & Delete (by ${userId || 'unknown'})`,
      });
      deleteStats.deleted += catResult.deleted + catResult.gone;
      deleteStats.failed += catResult.failed;
      deleteStats.skipped.push(...catResult.protected.map(n => `📁 ${n}`), ...catResult.errors);
    } catch (e) {
      console.warn(`⚠️ Category cleanup failed: ${e.message}`);
    }
  }

  // Register the run under the host's player record so they can re-post it in ANOTHER server
  // (cross-server retrieval). Pointers only (source guild + per-channel file-message ids).
  if (userId && runChannels.length) {
    try {
      const { withStorageLock, loadPlayerData, savePlayerData } = await import('./storage.js');
      const cats = new Set(runChannels.map(c => c.category).filter(Boolean));
      const label = cats.size === 1 ? [...cats][0]
        : (runChannels.length === 1 ? runChannels[0].name : `${runChannels.length} channels`);
      const sourceGuildName = guild?.name || guildId;
      await withStorageLock(async () => {
        const data = await loadPlayerData();
        const g = data[guildId] = data[guildId] || {};
        g.players = g.players || {};
        const p = g.players[userId] = g.players[userId] || {};
        p.archives = Array.isArray(p.archives) ? p.archives : [];
        p.archives.push({
          id: `${Date.now()}`,
          label,
          sourceGuildId: guildId,
          sourceGuildName,
          archiveChannelId: invokedChannelId,
          createdAt: new Date().toISOString(),
          channels: runChannels,
        });
        if (p.archives.length > 50) p.archives = p.archives.slice(-50); // keep it lightweight
        await savePlayerData(data);
      });
      console.log(`🗂️ Registered archive run "${label}" (${runChannels.length} channels) for user ${userId}`);
    } catch (e) {
      console.error(`⚠️ Archive registry write failed: ${e.message}`);
    }
  }

  // Replace the "📦 Archiving…" ephemeral with the completion summary (clears the Abandon button,
  // styled like the archive posts) + [📂 Archive Another] [🧹 Nuke Category] actions.
  const remaining = channels.length - succeeded - failed;
  const head = abandoned ? '🛑 Archiving abandoned' : (failed ? '⚠️ Archive complete' : '✅ Archive complete');
  const tail = abandoned && remaining > 0 ? `\n-# Stopped — re-run to finish the remaining ${remaining} channel${remaining !== 1 ? 's' : ''}.` : '';
  // Deletion is the irreversible half — report it in full, including everything deliberately kept.
  const deleteLine = deleteAfter
    ? `\n🗑️ **${deleteStats.deleted}** deleted${deleteStats.failed ? `, ❌ ${deleteStats.failed} could not be deleted` : ''}`
    : '';
  const keptLine = deleteAfter && deleteStats.skipped.length
    ? `\n\n🛡️ **Kept (not deleted):**\n${deleteStats.skipped.slice(0, 5).map(s => `-# • ${s}`).join('\n')}${deleteStats.skipped.length > 5 ? `\n-# • …and ${deleteStats.skipped.length - 5} more` : ''}`
    : '';
  const summaryContainer = {
    type: 17,
    accent_color: abandoned || failed ? 0xe67e22 : 0x2ecc71,
    components: [
      { type: 10, content: `## ${head}\n-# ${cbEmojiStr} CastBot Archive\n\n📂 **${succeeded}** channel${succeeded !== 1 ? 's' : ''} archived${failed ? `, ⚠️ ${failed} failed` : ''} (of ${channels.length})\n✉️ ${totalMsgs} message${totalMsgs !== 1 ? 's' : ''}${totalThreads ? `\n🧵 ${totalThreads} thread${totalThreads !== 1 ? 's' : ''} (${totalThreadMsgs} messages)` : ''}${deleteLine}${tail}${keptLine}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 1, custom_id: 'archive_channel', label: 'Archive Another', emoji: { name: '📂' } },
        { type: 2, style: 2, custom_id: 'prod_nuke_category', label: 'Nuke Channels', emoji: { name: '☢️' } },
      ] },
    ]
  };
  await updateRunMessage(summaryContainer, { interactionToken, applicationId });

  if (abortKey) global.abortArchive?.delete(abortKey);
  console.log(`🏁 Archive run done: ${succeeded} ok, ${failed} failed${deleteAfter ? `, ${deleteStats.deleted} deleted` : ''}${abandoned ? ', ABANDONED' : ''} (of ${channels.length})`);
  return { succeeded, failed, total: channels.length, abandoned, ...deleteStats };
}

// ── Cross-server retrieval ──────────────────────────────────────────────────────
// An archive run created in Server A is registered under the host's player record. The same
// host, in Server B, picks it from a string select and we re-post the original containers here.

/** Recursively reset the first type-13 (File) component back to the attachment:// protocol for re-upload. */
function setType13Attachment(comps, filename) {
  for (const c of (comps || [])) {
    if (c?.type === 13 && c.file) { c.file = { url: `attachment://${filename}` }; return true; }
    if (Array.isArray(c?.components) && setType13Attachment(c.components, filename)) return true;
  }
  return false;
}

/**
 * Build the "Retrieve Archive" screen — a string select of the host's registered runs (newest first,
 * max 25). Each option re-posts a whole run into the current channel. Pure.
 * @param {Array} runs - registry records (with `_sourceGuildId` injected for the select value)
 */
export function buildRetrieveScreen(runs) {
  const recent = (runs || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 25);
  const components = [
    { type: 10, content: `## 📥 Retrieve Archive\n-# Re-post an archive **you created** (in any server) into **this** channel — containers, banners and all.` },
    { type: 14 },
  ];
  if (!recent.length) {
    components.push({ type: 10, content: `-# No archives found. Run an archive first (its run is remembered against your account).` });
  } else {
    components.push({
      type: 1,
      components: [{
        type: 3, custom_id: 'archive_retrieve_select', placeholder: 'Pick an archive to re-post here…',
        min_values: 1, max_values: 1,
        options: recent.map(r => ({
          label: `${r.label}`.slice(0, 100),
          value: `${r._sourceGuildId}:${r.id}`,
          description: `${r.sourceGuildName} · ${(r.channels || []).length} channel(s) · ${(r.createdAt || '').slice(0, 10)}`.slice(0, 100),
          emoji: { name: '📂' },
        })),
      }],
    });
  }
  components.push({ type: 14 }, { type: 1, components: [{ type: 2, style: 2, label: '← Back', custom_id: 'archive_channel' }] });
  return { type: 17, accent_color: 0x3498db, components };
}

/**
 * Re-post a registered archive run into `destChannelId` (in any server the bot is in). Re-fetches
 * each original file message (fresh signed URL), downloads the HTML, and re-uploads it under the
 * ORIGINAL container (verbatim) + a fresh Unlock/Unarchive button set, with category banners.
 * @returns {Promise<{posted:number, failed:number}>}
 */
export async function repostArchiveRun(run, destChannelId) {
  const token = process.env.DISCORD_TOKEN;
  const post = createMessagePoster(destChannelId);
  let lastCategory = null, posted = 0, failed = 0;
  for (const ch of (run.channels || [])) {
    if (ch.category && ch.category !== lastCategory) {
      lastCategory = ch.category;
      try { await post({ body: JSON.stringify({ flags: IS_CV2, components: [buildCategoryBanner(ch.category)] }), headers: { 'Content-Type': 'application/json' } }); } catch { /* banner best-effort */ }
    }
    for (const msgId of (ch.partMessageIds || [])) {
      try {
        const srcRes = await fetch(`https://discord.com/api/v10/channels/${run.archiveChannelId}/messages/${msgId}`, { headers: { Authorization: `Bot ${token}` } });
        if (!srcRes.ok) { failed++; console.log(`ℹ️ Retrieve: source message ${msgId} unavailable (${srcRes.status})`); continue; }
        const src = await srcRes.json();
        const url = getArchiveFileUrl(src);
        const filename = src.attachments?.[0]?.filename || `${ch.name}-archive.html`;
        if (!url) { failed++; continue; }
        const dlRes = await fetch(url);
        if (!dlRes.ok) { failed++; console.warn(`⚠️ Retrieve: HTML download failed for #${ch.name} (${dlRes.status})`); continue; }
        const buf = Buffer.from(await dlRes.arrayBuffer());
        const container = JSON.parse(JSON.stringify(src.components?.[0] || { type: 17, components: [] }));
        setType13Attachment(container.components, filename); // re-point the file component for re-upload
        const form = new FormData();
        form.append('files[0]', buf, { filename, contentType: 'text/html' });
        form.append('payload_json', JSON.stringify({ flags: IS_CV2, components: [container], attachments: [{ id: 0, filename }] }));
        const res = await post({ body: form.getBuffer(), headers: form.getHeaders() });
        if (!res.ok) { failed++; console.error(`⚠️ Retrieve: re-post failed for #${ch.name}: ${res.status}`); continue; }
        const newId = (await res.json()).id;
        if (newId) await post({ body: JSON.stringify({ flags: IS_CV2, components: [buildArchiveButtons(newId)] }), headers: { 'Content-Type': 'application/json' } });
        posted++;
      } catch (e) { failed++; console.error(`⚠️ Retrieve error for #${ch.name}: ${e.message}`); }
    }
  }
  console.log(`📥 Retrieve done: ${posted} re-posted, ${failed} failed (from "${run.label}")`);
  return { posted, failed };
}
