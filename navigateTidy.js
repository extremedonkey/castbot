/**
 * navigateTidy.js - Bulk cleanup of stale Safari navigation panels (Map Explorer → 🛠️ Utilities → Navigate Tidy)
 *
 * Stale panel = a bot-posted "has arrived" / "admin move" card whose owner no longer has
 * VIEW_CHANNEL on that map-cell channel (they moved on, were de-initialized, or left the guild).
 * Panels are undeletable by players once the owner leaves the cell — see mapNavigationUI.js.
 *
 * Flow: nav_tidy_open → scan (read-only Discord fetches, no playerData writes → no storage lock
 * needed) → results screen with confirm → nav_tidy_confirm deletes from the CACHED scan.
 * Deleting from cache is race-safe: panels posted after the scan are never in the cache, and a
 * cached stale panel stays clutter even if its owner has since returned.
 *
 * Top of file is import-free so tests can consume the pure helpers directly.
 */

const VIEW_CHANNEL = 1n << 10n; // PermissionFlagsBits.ViewChannel (kept literal: module top stays import-free)
const SCAN_TTL_MS = 10 * 60 * 1000;
// 1000 messages/channel: welcome/init cards sit at the very BOTTOM of busy channels (game start),
// so shallow paging (was 3) missed them — pagination walks newest → oldest.
const MAX_PAGES_PER_CHANNEL = 10;
const LISTING_CHAR_BUDGET = 2600; // stay well under the 4000-char combined Text Display limit

// guildId → { at, channels: [{coord, channelId, channelName, stale: [{messageId, userId}], keptCount}] }
const scanCache = new Map();
// guilds with a scan or delete currently running (double-click / concurrent-admin guard)
const running = new Set();

// ---------- Pure helpers (unit-tested) ----------

/**
 * Pull navigation panels out of raw channel-message JSON.
 * Matches arrival cards (safari_navigate_{userId}_{coord}) and admin-move cards
 * (safari_show_movement_{userId}_{coord}); ignores safari_navigate_refresh_* (ephemeral-only).
 */
export function extractNavPanels(messages) {
  const panels = [];
  for (const msg of messages || []) {
    const container = msg.components?.[0];
    if (container?.type !== 17) continue;
    for (const row of container.components || []) {
      if (row.type !== 1) continue;
      for (const btn of row.components || []) {
        const id = btn.custom_id || '';
        let userId = null;
        if (id.startsWith('safari_navigate_') && !id.startsWith('safari_navigate_refresh_')) {
          userId = id.split('_')[2];
        } else if (id.startsWith('safari_show_movement_')) {
          userId = id.split('_')[3];
        }
        if (userId) {
          panels.push({ messageId: msg.id, userId });
        }
      }
    }
  }
  // A card has exactly one nav button, but dedupe by messageId defensively
  return [...new Map(panels.map(p => [p.messageId, p])).values()];
}

/** Split panels into stale/kept given the set of userIds with VIEW_CHANNEL on the channel. */
export function classifyPanels(panels, presentUserIds) {
  const stale = [], kept = [];
  for (const p of panels) (presentUserIds.has(p.userId) ? kept : stale).push(p);
  return { stale, kept };
}

/** userIds whose member permission overwrite ALLOWS ViewChannel (raw overwrite array form). */
export function presentUserIdsFromOverwrites(overwrites) {
  const present = new Set();
  for (const ow of overwrites || []) {
    // type 1 = member overwrite; allow bitfield as string
    if (ow.type === 1 && (BigInt(ow.allow || 0) & VIEW_CHANNEL) !== 0n) present.add(ow.id);
  }
  return present;
}

/** Char-budgeted "#channel → @a, @b" listing, sorted by coordinate. */
export function buildStaleListing(channels) {
  const withStale = channels.filter(c => c.stale.length > 0).sort((a, b) => a.coord.localeCompare(b.coord));
  const lines = [];
  let used = 0, shown = 0;
  for (const c of withStale) {
    const line = `<#${c.channelId}> → ${c.stale.map(p => `<@${p.userId}>`).join(', ')}`;
    if (used + line.length + 1 > LISTING_CHAR_BUDGET) break;
    lines.push(line);
    used += line.length + 1;
    shown++;
  }
  if (shown < withStale.length) lines.push(`-# …plus ${withStale.length - shown} more channels`);
  return lines.join('\n');
}

export function totalStale(channels) {
  return channels.reduce((n, c) => n + c.stale.length, 0);
}

/** Scan-results screen: description + listing + Cancel/Confirm (confirm omitted when clean). */
export function buildTidyScanUI(scan) {
  const staleCount = totalStale(scan.channels);
  const keptCount = scan.channels.reduce((n, c) => n + c.keptCount, 0);
  const summary = `**Channels scanned:** ${scan.channels.length}\n**Stale panels:** ${staleCount}\n**Active panels kept:** ${keptCount}`;
  const components = [
    { type: 10, content: `## 🗺️ Navigate Tidy` },
    { type: 14 },
    {
      type: 10,
      content: staleCount === 0
        ? `${summary}\n\n✅ Nothing to tidy — every navigation panel belongs to a player still in its channel.`
        : `Deletes leftover **Navigate** panels (arrival, 🎉 welcome, and admin-move cards) from map channels. A panel is stale when its owner can no longer view the channel (moved on, reset, or left the server). Panels for players currently in their channel are kept.\n\n${summary}\n\n${buildStaleListing(scan.channels)}`
    },
    { type: 14 },
    {
      type: 1,
      components: staleCount === 0
        ? [{ type: 2, custom_id: 'nav_tidy_cancel', label: 'Close', style: 2, emoji: { name: '❌' } }]
        : [
            { type: 2, custom_id: 'nav_tidy_cancel', label: 'Cancel', style: 2, emoji: { name: '❌' } },
            { type: 2, custom_id: 'nav_tidy_confirm', label: `Delete ${staleCount} Panels`, style: 4, emoji: { name: '🧹' } }
          ]
    }
  ];
  return {
    components: [{ type: 17, accent_color: staleCount === 0 ? 0x27ae60 : 0xf39c12, components }],
    flags: 1 << 15,
    ephemeral: true
  };
}

/** Post-deletion report (PATCHes the same ephemeral). */
export function buildTidyResultUI({ deleted, failed, channels }) {
  return {
    components: [{
      type: 17,
      accent_color: failed > 0 ? 0xe74c3c : 0x27ae60,
      components: [
        { type: 10, content: `## 🗺️ Navigate Tidy` },
        { type: 14 },
        { type: 10, content: `🧹 Deleted **${deleted}** stale panels across **${channels}** channels.${failed > 0 ? `\n⚠️ ${failed} could not be deleted (already gone?).` : ''}` }
      ]
    }],
    flags: 1 << 15,
    ephemeral: true
  };
}

export function buildTidyBusyUI() {
  return {
    components: [{
      type: 17, accent_color: 0xf39c12,
      components: [{ type: 10, content: '⚠️ A Navigate Tidy run is already in progress for this server. Try again shortly.' }]
    }],
    flags: 1 << 15,
    ephemeral: true
  };
}

// ---------- Execution (Discord I/O) ----------

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Scan all map-cell channels for stale panels; caches and returns the results UI. */
export async function runTidyScan(guildId, client) {
  if (running.has(guildId)) return buildTidyBusyUI();
  running.add(guildId);
  try {
    const { loadSafariContent } = await import('./safariManager.js');
    const { DiscordRequest, countComponents } = await import('./utils.js');
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    const coordinates = safariData[guildId]?.maps?.[activeMapId]?.coordinates || {};

    const guild = await client.guilds.fetch(guildId);
    console.log(`🗺️ NavigateTidy scan starting: guild ${guildId} — ${Object.keys(coordinates).length} coordinates on map ${activeMapId}`);
    const channels = [];
    for (const [coord, coordData] of Object.entries(coordinates)) {
      if (!coordData?.channelId) continue;
      let channel;
      try { channel = await guild.channels.fetch(coordData.channelId); } catch { continue; }
      if (!channel) continue;

      // Presence = member overwrite allowing ViewChannel (mirrors the movement permission model)
      const present = new Set();
      for (const [id, ow] of channel.permissionOverwrites.cache) {
        if (ow.type === 1 && (BigInt(ow.allow.bitfield) & VIEW_CHANNEL) !== 0n) present.add(id);
      }

      // Page bot messages (components on our own messages are exempt from the intent redaction)
      const messages = [];
      let before = null;
      for (let page = 0; page < MAX_PAGES_PER_CHANNEL; page++) {
        const batch = await DiscordRequest(`channels/${coordData.channelId}/messages?limit=100${before ? `&before=${before}` : ''}`, { method: 'GET' });
        if (!Array.isArray(batch) || batch.length === 0) break;
        messages.push(...batch);
        if (batch.length < 100) break;
        before = batch[batch.length - 1].id;
      }

      const { stale, kept } = classifyPanels(extractNavPanels(messages), present);
      channels.push({ coord, channelId: coordData.channelId, channelName: channel.name, stale, keptCount: kept.length });
      await sleep(150); // pace channel sweeps
    }

    const scan = { at: Date.now(), channels };
    scanCache.set(guildId, scan);
    console.log(`🗺️ NavigateTidy scan: guild ${guildId} — ${channels.length} channels, ${totalStale(channels)} stale panels`);
    const ui = buildTidyScanUI(scan);
    countComponents(ui.components, { verbosity: 'summary', label: 'Navigate Tidy Scan' });
    return ui;
  } finally {
    running.delete(guildId);
  }
}

/** Delete every stale panel from the cached scan; returns the result UI. */
export async function runTidyDelete(guildId) {
  const scan = scanCache.get(guildId);
  if (!scan || Date.now() - scan.at > SCAN_TTL_MS) {
    return {
      components: [{
        type: 17, accent_color: 0xf39c12,
        components: [{ type: 10, content: '⚠️ Scan results expired — please run Navigate Tidy again.' }]
      }],
      flags: 1 << 15,
      ephemeral: true
    };
  }
  if (running.has(guildId)) return buildTidyBusyUI();
  running.add(guildId);
  try {
    const { DiscordRequest } = await import('./utils.js');
    const staleTotal = totalStale(scan.channels);
    const channelTotal = scan.channels.filter(c => c.stale.length > 0).length;
    console.log(`🗺️ NavigateTidy delete starting: guild ${guildId} — ${staleTotal} stale panels across ${channelTotal} channels (~${Math.ceil(staleTotal * 0.35 / 60)} min at 350ms pacing)`);
    let deleted = 0, failed = 0, touched = 0;
    for (const c of scan.channels) {
      if (c.stale.length === 0) continue;
      touched++;
      let chDeleted = 0, chFailed = 0;
      for (const p of c.stale) {
        const res = await DiscordRequest(`channels/${c.channelId}/messages/${p.messageId}`, { method: 'DELETE' });
        if (res?.success) { deleted++; chDeleted++; }
        else {
          failed++; chFailed++;
          console.log(`⚠️ NavigateTidy: delete failed for message ${p.messageId} (owner ${p.userId}) in #${c.channelName}`);
        }
        await sleep(350); // stay friendly with the delete rate bucket
      }
      console.log(`🗺️ NavigateTidy: #${c.channelName} (${c.coord}) — ${chDeleted}/${c.stale.length} deleted${chFailed ? `, ${chFailed} failed` : ''} [${touched}/${channelTotal} channels, ${deleted + failed}/${staleTotal} total]`);
    }
    scanCache.delete(guildId);
    console.log(`🗺️ NavigateTidy delete: guild ${guildId} — ${deleted} deleted, ${failed} failed`);
    return buildTidyResultUI({ deleted, failed, channels: touched });
  } finally {
    running.delete(guildId);
  }
}
