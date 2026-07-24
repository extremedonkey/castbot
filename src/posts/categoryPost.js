/**
 * 🖼️ Category Post — general-purpose saved rich cards, posted to chosen channels/categories.
 *
 * Grew out of the Rich Card demo (Reece's Stuff → retired): admins compose a card
 * (title/content/color/image), save it per-guild, and post it to up to 25 picked
 * channels/categories (categories expand to their text channels) with a confirm
 * screen showing the true blast radius, then a paced, streamed send.
 *
 * Reuses, deliberately:
 *   - richCardUI.js            — buildRichCardModal / extractRichCardValues / buildRichCardContainer
 *   - channelArchiver.js       — expandArchiveSelection (pure category expansion, dedupes)
 *   - src/channels/channelJob  — runPacedJob / renderProgress / job locks (paced streamed sends)
 *   - src/images/modalImageUpload — resolveUploadedImageField (image is ALWAYS a File Upload here;
 *     the legacy paste-URL format is intentionally removed for this feature)
 *
 * NOT copied: the channels feature's Reece whitelist — Category Post is a standard
 * ManageRoles admin feature (every handler declares requiresPermission in app.js).
 */
import crypto from 'crypto';
import { PermissionFlagsBits } from 'discord.js';
import { loadPlayerData, savePlayerData, withStorageLock } from '../../storage.js';
import { PACE_SEND, PLAN_TTL_MS } from '../channels/channelAdminConfig.js';

export const ACCENT = 0x9b59b6;

/** Refuse plans that expand past this many channels — a 25-category pick could otherwise
 * balloon into an unbounded run (at PACE_SEND 5/2s, 200 channels ≈ 80s — well inside the
 * 15-minute interaction-token window the progress stream rides on). */
export const MAX_EXPANDED_CHANNELS = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

function getPosts(playerData, guildId) {
  return playerData[guildId]?.categoryPosts || {};
}

export function newPostId() {
  return `catpost_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
}

/** Create or update a post. Full load→mutate→save cycle — storage-locked. */
export async function saveCategoryPost(guildId, postId, fields, userId) {
  let saved;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    if (!playerData[guildId]) playerData[guildId] = {};
    const posts = (playerData[guildId].categoryPosts ||= {});
    const existing = posts[postId];
    saved = {
      ...(existing || { createdBy: userId, createdAt: Date.now() }),
      title: fields.title || '',
      content: fields.content || '',
      color: fields.color || '',
      image: fields.image || '',
      lastModified: Date.now()
    };
    posts[postId] = saved;
    await savePlayerData(playerData);
  });
  console.log(`🖼️ [CATPOST] Saved "${saved.title || 'Untitled'}" (${postId}) in guild ${guildId}`);
  return saved;
}

export async function deleteCategoryPost(guildId, postId) {
  let deleted = false;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    if (playerData[guildId]?.categoryPosts?.[postId]) {
      delete playerData[guildId].categoryPosts[postId];
      deleted = true;
      await savePlayerData(playerData);
    }
  });
  return deleted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure — screen components from a posts map (exported for tests; the async
 * wrapper below loads playerData). Layout mirrors the Challenges screen:
 * select → action row above the divider → preview → nav.
 */
export function buildScreenFromPosts(posts, selectedId = null, searchTerm = '') {
  let entries = Object.entries(posts);

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    entries = entries.filter(([, p]) =>
      (p.title || '').toLowerCase().includes(term) || (p.content || '').toLowerCase().includes(term));
  }
  entries.sort(([, a], [, b]) => (b.lastModified || 0) - (a.lastModified || 0));

  const options = [];
  if (searchTerm) {
    options.push({ label: '🔙 Back to all', value: 'catpost_back_to_all', description: 'Return to full list' });
  }
  if (Object.keys(posts).length > 10 || searchTerm) {
    options.push({
      label: '🔍 Search Posts', value: 'catpost_do_search',
      description: searchTerm ? `Searching: "${searchTerm}"` : 'Search by title or content',
      emoji: { name: '🔍' }
    });
  }
  for (const [id, post] of entries) {
    if (options.length >= 25) break;
    options.push({
      label: (post.title || 'Untitled').substring(0, 100),
      value: id,
      description: (post.content || 'No content').substring(0, 100),
      emoji: { name: '🖼️' },
      ...(id === selectedId ? { default: true } : {})
    });
  }

  const selected = selectedId ? posts[selectedId] : null;
  const components = [
    { type: 10, content: '# 🖼️ Category Post\n-# Compose a card, save it, and post it to chosen channels or whole categories.' },
    { type: 14 }
  ];

  if (options.length) {
    components.push({ type: 1, components: [{
      type: 3,
      custom_id: 'catpost_select',
      placeholder: 'Select a saved post...',
      options
    }]});
  } else {
    components.push({ type: 10, content: '*No saved posts yet — create one with ➕ New.*' });
  }

  // Action row — above the divider. Edit/Delete/Post need a selection.
  components.push({ type: 1, components: [
    { type: 2, custom_id: 'catpost_new', label: 'New', style: 1, emoji: { name: '➕' } },
    { type: 2, custom_id: `catpost_edit_${selectedId || 'none'}`, label: 'Edit', style: 2, emoji: { name: '✏️' }, disabled: !selected },
    { type: 2, custom_id: `catpost_delete_${selectedId || 'none'}`, label: 'Delete', style: 4, emoji: { name: '🗑️' }, disabled: !selected },
    { type: 2, custom_id: `catpost_post_${selectedId || 'none'}`, label: 'Post', style: 1, emoji: { name: '#️⃣' }, disabled: !selected }
  ]});

  components.push({ type: 14 });

  if (selected) {
    const titleText = (selected.title || 'Untitled').startsWith('#') ? selected.title : `# ${selected.title || 'Untitled'}`;
    components.push({ type: 10, content: titleText });
    if (selected.content) components.push({ type: 10, content: selected.content });
    if (selected.image) {
      try {
        new URL(selected.image);
        components.push({ type: 12, items: [{ media: { url: selected.image }, description: selected.title || 'Post image' }] });
      } catch { /* invalid URL, skip */ }
    }
  } else {
    components.push({ type: 10, content: '-# Select a saved post above to preview, edit, or post it.' });
  }

  components.push(
    { type: 14 },
    { type: 1, components: [{ type: 2, custom_id: 'castbot_tools', label: '← Tools', style: 2 }] }
  );

  let accent = ACCENT;
  if (selected?.color) {
    // parseAccentColor lives in richCardUI — inline the cheap hex path to keep this pure/synchronous
    const hex = String(selected.color).trim().replace(/^(#|0x)/i, '');
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) accent = parseInt(hex, 16);
  }

  return { components: [{ type: 17, accent_color: accent, components }] };
}

/** The screen, from storage. */
export async function buildCategoryPostScreen(guildId, selectedId = null, searchTerm = '') {
  const playerData = await loadPlayerData();
  return buildScreenFromPosts(getPosts(playerData, guildId), selectedId, searchTerm);
}

// ─────────────────────────────────────────────────────────────────────────────
// Card modal (New / Edit) — image is ALWAYS a File Upload (no paste-URL variant)
// ─────────────────────────────────────────────────────────────────────────────

export async function buildCatpostCardModal(postId, post = null) {
  const { buildRichCardModal } = await import('../../richCardUI.js');
  return buildRichCardModal({
    customId: `catpost_save_${postId || 'new'}`,
    modalTitle: post ? 'Edit Category Post' : 'New Category Post',
    values: post ? { title: post.title, content: post.content, color: post.color, image: post.image } : {},
    fields: { image: { label: 'Image (optional)' } },
    imageUploadMode: 'uploadComponent' // by design: this feature has no legacy URL text input
  });
}

/** catpost_save_{id|new} modal submit — deferred (image re-host is network work). */
export async function handleCatpostSave({ guildId, userId, customId, data, client }) {
  const { extractRichCardValues } = await import('../../richCardUI.js');
  const { resolveUploadedImageField } = await import('../images/modalImageUpload.js');

  const raw = customId.replace('catpost_save_', '');
  const postId = raw === 'new' ? newPostId() : raw;

  const values = extractRichCardValues(data);

  // Network (download + re-host) stays OUTSIDE the storage lock.
  const playerData = await loadPlayerData();
  const existing = getPosts(playerData, guildId)[raw === 'new' ? '' : raw] || null;
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
  await resolveUploadedImageField({
    fields: values, data, guild,
    context: postId,
    fieldKey: 'image',
    currentValue: existing?.image || '',
    description: `Category Post image (${postId})`
  });

  await saveCategoryPost(guildId, postId, values, userId);
  return await buildCategoryPostScreen(guildId, postId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete (two-step confirm)
// ─────────────────────────────────────────────────────────────────────────────

export function buildDeleteConfirm(postId, post) {
  return { components: [{ type: 17, accent_color: 0xe74c3c, components: [
    { type: 10, content: `## ⚠️ Delete "${post?.title || 'Untitled'}"?\nThis removes the saved card. Messages already posted with it stay where they are.` },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'category_post', label: 'Cancel', style: 2 },
      { type: 2, custom_id: `catpost_delete_confirm_${postId}`, label: 'Yes, Delete', style: 4, emoji: { name: '🗑️' } }
    ]}
  ]}]};
}

// ─────────────────────────────────────────────────────────────────────────────
// Post flow: modal → plan (expand + preflight) → confirm → paced exec
// ─────────────────────────────────────────────────────────────────────────────

/** The Post modal — a Label-wrapped Channel Select that accepts categories. */
export function buildCatpostPostModal(postId, post) {
  return {
    type: 9, // MODAL
    data: {
      custom_id: `catpost_post_modal_${postId}`,
      title: `Post "${(post?.title || 'Untitled').substring(0, 30)}"`,
      components: [
        {
          type: 18, // Label
          label: 'Post to channels',
          description: 'Picking a category posts to every text channel inside it.',
          component: {
            type: 8, // Channel Select
            custom_id: 'post_targets',
            channel_types: [0, 4, 5], // text, category, announcement
            min_values: 1,
            max_values: 25,
            required: true
          }
        }
      ]
    }
  };
}

/**
 * Pending plans (token → plan). The plan can't ride in the custom_id (100-char cap).
 * Same TTL + single-use semantics as the channels broadcast (stale screens and
 * double-clicks land on a friendly "expired" message, never a second run).
 */
const pendingPlans = new Map();

export function stashPlan(userId, plan, now = Date.now()) {
  for (const [k, v] of pendingPlans) if (now - v.at > PLAN_TTL_MS) pendingPlans.delete(k);
  const token = `${userId}_${now.toString(36)}`;
  pendingPlans.set(token, { ...plan, at: now, userId: String(userId) });
  return token;
}

export function takePlan(token, userId, now = Date.now()) {
  const plan = pendingPlans.get(token);
  if (!plan) return null;
  if (plan.userId !== String(userId)) return null;
  if (now - plan.at > PLAN_TTL_MS) {
    pendingPlans.delete(token);
    return null;
  }
  pendingPlans.delete(token); // single-use
  return plan;
}

/** Expand picked channels/categories via channelArchiver's pure expander. */
async function expandTargets(guild, targets, resolved = {}) {
  const { expandArchiveSelection } = await import('../../channelArchiver.js');
  const all = await guild.channels.fetch(); // cache holds only ~50 — must fetch
  const normalized = [...all.values()].filter(Boolean).map((c) => ({
    id: c.id, name: c.name, type: c.type, parent_id: c.parentId, position: c.position
  }));
  return expandArchiveSelection(targets || [], normalized, resolved);
}

const errScreen = (msg) => ({ components: [{ type: 17, accent_color: 0xe74c3c, components: [
  { type: 10, content: `## ❌ ${msg}` },
  { type: 14 },
  { type: 1, components: [{ type: 2, custom_id: 'category_post', label: '← Category Post', style: 2 }] }
]}]});

/** Pure — the refusal copy for an over-cap expansion (exported for tests). */
export function capRefusalMessage(count) {
  return `That selection expands to **${count}** channels — the limit is **${MAX_EXPANDED_CHANNELS}**. Pick fewer categories or channels.`;
}

/** catpost_post_modal_{id} submit — expand, preflight, stash, confirm. Deferred. */
export async function planCatpostBroadcast({ guildId, userId, customId, data, client }) {
  const postId = customId.replace('catpost_post_modal_', '');
  const playerData = await loadPlayerData();
  const post = getPosts(playerData, guildId)[postId];
  if (!post) return errScreen('That post no longer exists.');

  // Label-wrapped select: values live on the inner component
  let targets = [];
  for (const row of (data.components || [])) {
    const comp = row?.component || row?.components?.[0];
    if (comp?.custom_id === 'post_targets') targets = comp.values || [];
  }
  if (!targets.length) return errScreen('Pick at least one channel or category.');

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
  const { channels, categoryCount } = await expandTargets(guild, targets, data.resolved?.channels);
  if (!channels.length) return errScreen('That selection expands to no text channels.');
  if (channels.length > MAX_EXPANDED_CHANNELS) return errScreen(capRefusalMessage(channels.length));

  // Fail fast rather than posting half the list and 403ing on the rest.
  const me = guild.members?.me ?? (await guild.members.fetchMe().catch(() => null));
  const blocked = channels.filter((c) => {
    const ch = guild.channels.cache.get(c.id);
    return ch && me && !ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages);
  });
  const sendable = channels.filter((c) => !blocked.some((b) => b.id === c.id));
  if (!sendable.length) return errScreen('CastBot cannot post in any of the selected channels.');

  const etaSeconds = Math.ceil((sendable.length / PACE_SEND.n) * (PACE_SEND.ms / 1000));
  const token = stashPlan(userId, {
    postId, guildId,
    channels: sendable.map((c) => ({ id: c.id, name: c.name })),
    card: { title: post.title, content: post.content, color: post.color, image: post.image }
  });

  const s = sendable.length === 1 ? '' : 's';
  return { components: [{ type: 17, accent_color: 0xe67e22, components: [
    { type: 10, content: [
      `## ⚠️ Post "${post.title || 'Untitled'}" to ${sendable.length} channel${s}?`,
      `> **${sendable.length}** channel${s}${categoryCount ? ` · **${categoryCount}** categor${categoryCount === 1 ? 'y' : 'ies'} expanded` : ''}`,
      `> Estimated time: **~${etaSeconds < 60 ? `${etaSeconds}s` : `${Math.ceil(etaSeconds / 60)} min`}**`,
      '',
      ...sendable.slice(0, 15).map((c) => `> • #${c.name}`),
      ...(sendable.length > 15 ? [`> -# …and ${sendable.length - 15} more`] : []),
      ...(blocked.length ? ['', `> ⚠️ **${blocked.length}** skipped — CastBot can't post there: ${blocked.slice(0, 5).map((c) => `#${c.name}`).join(', ')}`] : []),
      '',
      '-# **This cannot be undone** — players see it immediately. Re-sending posts a SECOND copy.'
    ].join('\n') },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'category_post', label: 'Cancel', style: 2 },
      { type: 2, custom_id: `catpost_exec_${token}`, label: `Post to ${sendable.length} channel${s}`, style: 4 }
    ]}
  ]}]};
}

/** catpost_exec_{token} — the ONLY step that posts. Deferred; paced + streamed. */
export async function execCatpostBroadcast({ token, guildId, userId, client, interactionToken, applicationId }) {
  const { runPacedJob, acquireJobLock, releaseJobLock, JobBusyError } = await import('../channels/channelJob.js');

  const plan = takePlan(token, userId);
  if (!plan) {
    return errScreen('That plan expired — nothing was posted. Re-open Post and try again.');
  }

  let summary;
  try {
    acquireJobLock(guildId, 'category_post', userId);
  } catch (e) {
    if (e instanceof JobBusyError) return errScreen(e.message);
    throw e;
  }

  try {
    const { DiscordRequest } = await import('../../utils.js');
    const { buildRichCardContainer } = await import('../../richCardUI.js');
    const container = buildRichCardContainer(plan.card);

    summary = await runPacedJob({
      items: plan.channels,
      pace: PACE_SEND,
      progress: { interactionToken, applicationId, title: '🖼️ Posting card' },
      step: async (ch) => {
        try {
          await DiscordRequest(`channels/${ch.id}/messages`, {
            method: 'POST',
            body: { flags: (1 << 15), components: [container] } // IS_COMPONENTS_V2
          });
          return { ok: true, label: ch.name };
        } catch (e) {
          return { ok: false, error: `#${ch.name}: ${e.message}` };
        }
      }
    });
  } finally {
    releaseJobLock(guildId, 'category_post');
  }

  console.log(`🖼️ [CATPOST] Posted "${plan.card.title || 'Untitled'}" to ${summary.created}/${plan.channels.length} channels in guild ${guildId}`);
  return { components: [{ type: 17, accent_color: summary.failed ? 0xf39c12 : 0x2ecc71, components: [
    { type: 10, content: [
      `## ${summary.failed ? '⚠️' : '✅'} Posted "${plan.card.title || 'Untitled'}"`,
      `> ✅ **${summary.created}** posted`,
      ...(summary.failed ? [`> ❌ **${summary.failed}** failed`] : []),
      ...(summary.errors?.length ? ['', ...summary.errors.slice(0, 5).map((e) => `-# ❌ ${e}`)] : []),
      '',
      '-# ⚠️ Already sent — posting again sends **another** copy to every channel.'
    ].join('\n') },
    { type: 14 },
    { type: 1, components: [{ type: 2, custom_id: 'category_post', label: '← Category Post', style: 2 }] }
  ]}]};
}

// ─────────────────────────────────────────────────────────────────────────────
// Routers — app.js routes the whole catpost_* family here (channels-router style)
// ─────────────────────────────────────────────────────────────────────────────

/** Every catpost button/select. app.js picks the ack (modal / deferred / update) by custom_id. */
export async function routeCatpostButton({ context, req, client }) {
  const { guildId, userId, customId } = context;

  if (customId === 'catpost_select') {
    const value = req.body.data.values?.[0];
    if (value === 'catpost_do_search') {
      return { type: 9, data: { custom_id: 'catpost_search_modal', title: 'Search Posts', components: [
        { type: 18, label: 'Search', description: 'Matches title and content. Leave empty to clear.', component: {
          type: 4, custom_id: 'search_term', style: 1, required: false, max_length: 100 } }
      ]}};
    }
    const selectedId = value && value !== 'catpost_back_to_all' ? value : null;
    return await buildCategoryPostScreen(guildId, selectedId);
  }

  if (customId === 'catpost_new') return await buildCatpostCardModal(null);

  if (customId.startsWith('catpost_edit_')) {
    const postId = customId.replace('catpost_edit_', '');
    const post = (await loadPlayerData())[guildId]?.categoryPosts?.[postId];
    if (!post) return { content: '❌ That post no longer exists.', ephemeral: true };
    return await buildCatpostCardModal(postId, post);
  }

  if (customId.startsWith('catpost_delete_confirm_')) {
    await deleteCategoryPost(guildId, customId.replace('catpost_delete_confirm_', ''));
    return await buildCategoryPostScreen(guildId);
  }

  if (customId.startsWith('catpost_delete_')) {
    const postId = customId.replace('catpost_delete_', '');
    const post = (await loadPlayerData())[guildId]?.categoryPosts?.[postId];
    if (!post) return await buildCategoryPostScreen(guildId);
    return buildDeleteConfirm(postId, post);
  }

  if (customId.startsWith('catpost_exec_')) {
    return await execCatpostBroadcast({
      token: customId.replace('catpost_exec_', ''),
      guildId, userId, client,
      interactionToken: req.body.token,
      applicationId: process.env.APP_ID
    });
  }

  if (customId.startsWith('catpost_post_')) {
    const postId = customId.replace('catpost_post_', '');
    const post = (await loadPlayerData())[guildId]?.categoryPosts?.[postId];
    if (!post) return { content: '❌ That post no longer exists.', ephemeral: true };
    return buildCatpostPostModal(postId, post);
  }

  // category_post itself (and anything unrecognized) → the screen
  return await buildCategoryPostScreen(guildId);
}

/** catpost_save_* / catpost_post_modal_* / catpost_search_modal submits. */
export async function routeCatpostModalSubmit({ context, data, client }) {
  const { guildId, userId, customId } = context;

  if (customId.startsWith('catpost_save_')) {
    return await handleCatpostSave({ guildId, userId, customId, data, client });
  }
  if (customId.startsWith('catpost_post_modal_')) {
    return await planCatpostBroadcast({ guildId, userId, customId, data, client });
  }
  // catpost_search_modal
  const { collectModalFields } = await import('../images/modalImageUpload.js');
  const term = (collectModalFields(data.components).search_term || '').trim();
  return await buildCategoryPostScreen(guildId, null, term);
}
