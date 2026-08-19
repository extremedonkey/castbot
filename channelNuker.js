/**
 * Channel Nuker — bulk channel/category deletion (☢️ Nuke Channels + Archive & Delete).
 *
 * ONE deletion engine, two callers:
 *   1. ☢️ Nuke Channels (this file's handlers) — delete channels/categories outright.
 *   2. 🧹 Archiver "… + Delete Channels" modes (channelArchiver.js) — delete each channel
 *      only AFTER its archive file is verified posted.
 *
 * Why not `src/channels/channelOps.deleteChannels`? That one is id-in/id-out for the Channels
 * tab (create-then-tidy flows). Destructive bulk deletion needs three things it doesn't have:
 * mid-run abort, category-survivor checks (never orphan a protected channel), and named
 * per-item failure reasons for the summary. Extending it would have bent it out of shape for
 * its own caller, so the destructive path lives here.
 *
 * 🔴 SAFETY INVARIANTS (the whole point of this module):
 *   - `protectIds` are NEVER deleted. Archive & Delete always protects the channel receiving
 *     the archive files — deleting it would destroy the very archives just created.
 *   - Categories are deleted LAST, and only when nothing survives inside them (a protected or
 *     failed child means the category stays, rather than orphaning it).
 *   - The invoking channel is deleted last of all, so the progress message survives as long
 *     as possible.
 *   - `shouldAbort()` is checked before EVERY deletion — 🚧 Abandon stops the run cold.
 */
import { PermissionFlagsBits } from 'discord.js';
import { patchOriginal } from './src/channels/channelJob.js';

const IS_CV2 = 1 << 15;
const PACE = { n: 5, ms: 2000 };   // Discord channel-delete bucket: pause 2s every 5 deletions
const PROGRESS_THROTTLE_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Channel types offered in the Nuke select — everything a guild can hold except threads. */
export const NUKE_CHANNEL_TYPES = [0, 2, 4, 5, 13, 15, 16];

/** Human labels for the confirm screen's breakdown, keyed by Discord channel type. */
const TYPE_LABELS = { 0: 'text', 2: 'voice', 4: 'category', 5: 'announcement', 13: 'stage', 15: 'forum', 16: 'media' };

/**
 * Expand a Nuke selection into a flat, de-duplicated, delete-ordered item list.
 * Pure — unit tested in tests/channelNuker.test.js.
 *
 * Unlike expandArchiveSelection (text channels only — you can't archive a voice channel),
 * this keeps EVERY deletable type, because the point is to empty the category out.
 *
 * @param {string[]} selectedIds - ids picked in the channel select
 * @param {Array<{id,name,type,parent_id,position}>} allChannels - the guild's channels
 * @param {object} [resolved] - req.body.data.resolved.channels (fallback for picked items)
 * @returns {{items: Array, channelCount: number, categoryCount: number, viaCategoryCount: number}}
 *   `items` is ordered children-first, categories-last (deletion order).
 */
export function expandNukeSelection(selectedIds, allChannels, resolved = {}) {
  const byId = new Map((allChannels || []).map(c => [c.id, c]));
  const childrenOf = (catId) => (allChannels || [])
    .filter(c => c.parent_id === catId && c.type !== 4)
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const channels = new Map();   // id → item (Map = dedupe + insertion order)
  const categories = new Map();
  let viaCategoryCount = 0;

  for (const id of (selectedIds || [])) {
    const ch = byId.get(id) || resolved[id];
    if (!ch) continue;
    if (ch.type === 4) {
      categories.set(ch.id, { id: ch.id, name: ch.name, type: 4, category: null });
      for (const kid of childrenOf(id)) {
        if (!channels.has(kid.id)) viaCategoryCount++;
        channels.set(kid.id, { id: kid.id, name: kid.name, type: kid.type, category: ch.name });
      }
    } else {
      // A directly-picked channel wins over the category-expanded copy (same id, same outcome).
      channels.set(ch.id, { id: ch.id, name: ch.name, type: ch.type, category: channels.get(ch.id)?.category || null });
    }
  }

  return {
    items: [...channels.values(), ...categories.values()], // children first, categories last
    channelCount: channels.size,
    categoryCount: categories.size,
    viaCategoryCount,
  };
}

/**
 * Order items for deletion: plain channels → the invoking channel → categories.
 * Pure. Keeps the host's progress message alive as long as possible when they nuke the very
 * channel they are standing in.
 */
export function orderForDeletion(items, invokedChannelId = null) {
  const plain = [], self = [], cats = [];
  for (const it of (items || [])) {
    if (it.type === 4) cats.push(it);
    else if (it.id === invokedChannelId) self.push(it);
    else plain.push(it);
  }
  return [...plain, ...self, ...cats];
}

/**
 * Delete ONE channel, translating Discord's error codes into a stable outcome.
 * @returns {Promise<{status: 'deleted'|'gone'|'failed', error?: string}>}
 */
export async function deleteOneChannel(guild, item, reason = 'CastBot Nuke Channels') {
  try {
    const ch = guild.channels.cache.get(item.id) || (await guild.channels.fetch(item.id).catch(() => null));
    if (!ch) return { status: 'gone' }; // already deleted — the desired end state
    await ch.delete(reason);
    return { status: 'deleted' };
  } catch (error) {
    if (error?.code === 10003) return { status: 'gone' };                                    // Unknown Channel
    if (error?.code === 50013) return { status: 'failed', error: 'CastBot lacks Manage Channels here' };
    if (error?.code === 50074) return { status: 'failed', error: 'required by a Community server' };
    return { status: 'failed', error: error?.message || 'unknown error' };
  }
}

/**
 * Delete a list of channel/category items with pacing, protection, abort and survivor checks.
 * The shared engine behind ☢️ Nuke Channels and the Archiver's "+ Delete Channels" modes.
 *
 * @param {object} guild - discord.js Guild
 * @param {Array<{id,name,type,category}>} items
 * @param {object} [opts]
 * @param {string[]} [opts.protectIds] - NEVER deleted (e.g. the channel receiving archives)
 * @param {string} [opts.invokedChannelId] - deleted last (if selected at all)
 * @param {() => boolean} [opts.shouldAbort] - checked before every deletion
 * @param {(state) => Promise<void>|void} [opts.onProgress] - called after each item
 * @param {string} [opts.reason] - Discord audit-log reason
 * @param {{n:number, ms:number}} [opts.pace] - rate-limit pacing; tests pass {n:0} to skip the sleeps
 * @returns {Promise<{deleted:number, gone:number, failed:number, protected:Array, errors:Array, aborted:boolean, remaining:number}>}
 */
export async function deleteChannelItems(guild, items, {
  protectIds = [],
  invokedChannelId = null,
  shouldAbort = () => false,
  onProgress = null,
  reason = 'CastBot Nuke Channels',
  pace = PACE,
} = {}) {
  const protectedSet = new Set((protectIds || []).filter(Boolean));
  const ordered = orderForDeletion(items, invokedChannelId);
  const result = { deleted: 0, gone: 0, failed: 0, protected: [], errors: [], aborted: false, remaining: 0 };

  // Ids that will still exist when we reach the categories — a category with any of these
  // inside it is left alone rather than orphaning them.
  const survivors = new Set(protectedSet);
  let done = 0;

  for (const item of ordered) {
    if (shouldAbort()) {
      result.aborted = true;
      result.remaining = ordered.length - done;
      break;
    }
    done++;

    if (protectedSet.has(item.id)) {
      result.protected.push(item.name);
      continue;
    }

    // A category is only removed once it is genuinely empty (nothing protected/failed left in it).
    if (item.type === 4) {
      const stillInside = guild.channels.cache.filter(c => c.parentId === item.id);
      const blocked = [...stillInside.values()].filter(c => survivors.has(c.id) || !ordered.some(i => i.id === c.id));
      if (blocked.length > 0) {
        result.protected.push(`${item.name} (kept — ${blocked.length} channel${blocked.length !== 1 ? 's' : ''} still inside)`);
        continue;
      }
    }

    if (pace.n > 0 && done > 1 && done % pace.n === 0) await sleep(pace.ms);

    const outcome = await deleteOneChannel(guild, item, reason);
    if (outcome.status === 'deleted') { result.deleted++; console.log(`☢️ Deleted ${TYPE_LABELS[item.type] || 'channel'}: ${item.name} (${result.deleted})`); }
    else if (outcome.status === 'gone') { result.gone++; }
    else {
      result.failed++;
      survivors.add(item.id); // failed → still there → don't nuke its parent category out from under it
      result.errors.push(`${item.name}: ${outcome.error}`);
      console.error(`☢️ Failed to delete ${item.name}: ${outcome.error}`);
    }

    if (onProgress) await onProgress({ done, total: ordered.length, ...result });
  }

  return result;
}

// ── UI ──────────────────────────────────────────────────────────────────────────

/** The ☢️ Nuke Channels landing screen (channel + category multi-select). */
export function buildNukeScreen(note = '') {
  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## ☢️ Nuke Channels\n\nPermanently delete **channels** *and/or* **entire categories** from this server.${note ? `\n\n${note}` : ''}` },
      { type: 14 },
      { type: 10, content: `> ⚠️ **There is no undo.** Picking a **category** deletes every channel inside it *and* the category itself. All message history goes with them.\n> \n> 📦 Back it up first — **🧹 Archiver** saves full history as an HTML file, and its **Archive + Delete Channels** modes archive and delete in one pass.` },
      { type: 14 },
      { type: 10, content: `### \`\`\`☢️ Select Channels & Categories\`\`\`\n-# Up to 25. Categories expand to everything inside them (text, voice, forum, stage).` },
      { type: 1, components: [{
        type: 8,
        custom_id: 'nuke_chan_select',
        placeholder: 'Select channels and/or categories to delete...',
        channel_types: NUKE_CHANNEL_TYPES,
        min_values: 1,
        max_values: 25,
      }] },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 2, label: '← Tools', custom_id: 'castbot_tools' },
        { type: 2, style: 2, label: 'Archiver', custom_id: 'archive_channel', emoji: { name: '🧹' } },
      ] },
    ],
  };
}

/**
 * The ☢️ confirmation screen — the last thing between the host and permanent deletion.
 * Deliberately loud: exact counts, the actual channel names, and a red confirm button.
 */
export function buildNukeConfirmScreen({ items, channelCount, categoryCount, viaCategoryCount, invokedChannelId, botCanDelete = true }) {
  if (!botCanDelete) {
    return {
      type: 17,
      accent_color: 0xe74c3c,
      components: [
        { type: 10, content: `## ❌ CastBot can't delete channels\n\nCastBot is missing the **Manage Channels** permission in this server, so nothing was deleted.\n\n-# Give CastBot's role **Manage Channels** (Server Settings → Roles) and try again.` },
        { type: 14 },
        { type: 1, components: [{ type: 2, style: 2, label: '← Back', custom_id: 'prod_nuke_category' }] },
      ],
    };
  }

  const shown = items.slice(0, 20);
  const list = shown.map(i => (i.type === 4 ? `- 📁 **${i.name}** (category)` : `- #${i.name}`)).join('\n');
  const overflow = items.length > 20 ? `\n-# …and ${items.length - 20} more` : '';
  const catNote = viaCategoryCount > 0
    ? `\n-# ${viaCategoryCount} of these came from the ${categoryCount} selected categor${categoryCount !== 1 ? 'ies' : 'y'}.`
    : '';
  const selfWarning = items.some(i => i.id === invokedChannelId)
    ? `\n\n🫵 **This includes the channel you are using right now.** It is deleted LAST — this message will disappear along with it.`
    : '';

  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## ☢️ Permanently delete ${items.length} thing${items.length !== 1 ? 's' : ''}?` },
      { type: 14 },
      { type: 10, content: `**${channelCount}** channel${channelCount !== 1 ? 's' : ''}${categoryCount ? ` and **${categoryCount}** categor${categoryCount !== 1 ? 'ies' : 'y'}` : ''} will be **permanently deleted**, along with **every message ever posted in them**.\n\n☠️ **This cannot be undone.** Discord does not keep a copy. CastBot cannot get them back. Neither can Discord support.${selfWarning}` },
      { type: 14 },
      { type: 10, content: `${list}${overflow}${catNote}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 2, label: 'Cancel', custom_id: 'nuke_cat_cancel', emoji: { name: '❌' } },
        { type: 2, style: 4, label: `Yes, Delete ${items.length} Permanently`, custom_id: 'nuke_chan_confirm', emoji: { name: '☢️' } },
      ] },
    ],
  };
}

/** Live progress container for a nuke run (keeps 🚧 Abandon reachable throughout). */
export function buildNukeProgress({ done, total, deleted, failed, current = null }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  return {
    type: 17,
    accent_color: 0xe67e22,
    components: [
      { type: 10, content: `## ☢️ Nuking channels…\n\`${bar}\` ${done}/${total} (${pct}%)\n-# 🗑️ ${deleted} deleted${failed ? ` · ❌ ${failed} failed` : ''}${current ? `\n-# Now: **${current}**` : ''}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 4, label: 'Abandon Nuking', custom_id: 'nuke_chan_abandon', emoji: { name: '🚧' } },
      ] },
    ],
  };
}

/** Final summary container for a nuke run. */
export function buildNukeSummary(result, total) {
  const head = result.aborted ? '🛑 Nuking abandoned' : (result.failed ? '⚠️ Nuke complete' : '✅ Nuke complete');
  const lines = [
    `## ${head}`,
    ``,
    `🗑️ **${result.deleted}** deleted${result.gone ? ` · 👻 ${result.gone} already gone` : ''}${result.failed ? ` · ❌ ${result.failed} failed` : ''} (of ${total})`,
  ];
  if (result.aborted && result.remaining > 0) lines.push(`-# Stopped — ${result.remaining} item${result.remaining !== 1 ? 's' : ''} left untouched.`);
  if (result.protected.length) lines.push(`\n🛡️ **Kept:** ${result.protected.slice(0, 5).join(', ')}${result.protected.length > 5 ? ` +${result.protected.length - 5} more` : ''}`);
  if (result.errors.length) lines.push(`\n⚠️ **${result.errors.length} error(s):**\n${result.errors.slice(0, 5).map(e => `• ${e}`).join('\n')}`);

  return {
    type: 17,
    accent_color: result.aborted || result.failed ? 0xe67e22 : 0x27ae60,
    components: [
      { type: 10, content: lines.join('\n') },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 2, label: '← Tools', custom_id: 'castbot_tools' },
        { type: 2, style: 2, label: 'Nuke More', custom_id: 'prod_nuke_category', emoji: { name: '☢️' } },
      ] },
    ],
  };
}

// ── Handler bodies (app.js stays a router) ──────────────────────────────────────

/**
 * Can CastBot delete channels here? Used to hide the destructive button rather than let a host
 * confirm a run that cannot work.
 *
 * Defaults to TRUE when the answer is genuinely unknowable (bot member uncached AND unfetchable):
 * a false negative here makes the whole feature unusable, whereas a false positive just surfaces
 * per-channel "CastBot lacks Manage Channels here" in the summary. Fail permissive, report loudly.
 */
export async function botCanDeleteChannels(guild) {
  let me = guild?.members?.me;
  if (!me) {
    try { me = await guild.members.fetchMe(); } catch { return true; }
  }
  return !!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels);
}

/** Resolve the guild's channels once — bot cache (zero REST) → one REST call fallback. */
export async function resolveGuildChannels(client, guildId, DiscordRequest) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (guild && guild.channels.cache.size > 0) {
    return [...guild.channels.cache.values()].map(c => ({
      id: c.id, name: c.name, type: c.type, parent_id: c.parentId || null, position: c.rawPosition ?? 0,
    }));
  }
  return (await DiscordRequest(`guilds/${guildId}/channels`, { method: 'GET' })) || [];
}

/**
 * `nuke_chan_select` body — expand the selection, preflight the bot's permission, stash the
 * plan for the confirm click, and render the scary screen.
 */
export async function handleNukeSelect({ context, selectedIds, resolved, invokedChannelId, DiscordRequest }) {
  const { guildId, userId, client } = context;
  const allChannels = await resolveGuildChannels(client, guildId, DiscordRequest);
  const plan = expandNukeSelection(selectedIds, allChannels, resolved);

  if (plan.items.length === 0) {
    return buildNukeScreen('-# ⚠️ Nothing deletable in that selection — pick again.');
  }

  const guild = await client.guilds.fetch(guildId);
  const botCanDelete = await botCanDeleteChannels(guild);

  global.pendingNuke = global.pendingNuke || new Map();
  global.pendingNuke.set(`${guildId}:${userId}`, { ...plan, invokedChannelId });

  return buildNukeConfirmScreen({ ...plan, invokedChannelId, botCanDelete });
}

/**
 * The background nuke run. Streams progress into the ephemeral @original (which is why
 * `nuke_chan_confirm` answers instantly instead of blocking), and stops the moment
 * 🚧 Abandon sets the flag.
 */
export async function runNukeJob({ client, guildId, userId, plan, interactionToken, applicationId }) {
  const abortKey = `${guildId}:${userId}`;
  const guild = await client.guilds.fetch(guildId);
  let lastPatch = 0;

  const result = await deleteChannelItems(guild, plan.items, {
    invokedChannelId: plan.invokedChannelId,
    shouldAbort: () => !!global.abortNuke?.get(abortKey),
    reason: `CastBot Nuke Channels (by ${userId})`,
    onProgress: async (state) => {
      if (Date.now() - lastPatch < PROGRESS_THROTTLE_MS) return;
      lastPatch = Date.now();
      await patchOriginal(buildNukeProgress(state), { interactionToken, applicationId });
    },
  });

  global.abortNuke?.delete(abortKey);
  console.log(`☢️ Nuke run done: ${result.deleted} deleted, ${result.failed} failed${result.aborted ? ', ABANDONED' : ''} (of ${plan.items.length})`);
  await patchOriginal(buildNukeSummary(result, plan.items.length), { interactionToken, applicationId });
  return result;
}

export { IS_CV2 };
