/**
 * Discord Status Watchdog — monitors Discord's OWN platform status, run from the TEST box.
 *
 * Why this exists: ProdWatchdog probes *our* endpoint, so a Discord-side outage (API/gateway/
 * interactions) looks like "prod healthy" while every user sees "This interaction failed".
 * This fills that blind spot by polling Discord's public Statuspage JSON API.
 *
 * Behaviour: every POLL_INTERVAL_MS fetch unresolved incidents, keep only ones relevant to
 * bot traffic (API/gateway/messaging components, or any major/critical incident). A newly
 * seen incident posts an AMBER card to #private-bugs (distinct from ProdWatchdog's red
 * "Prod Down" card); when the incident leaves the unresolved list, a GREEN resolved card
 * follows. Optionally mirrors a neutral, user-facing version of both cards to announce
 * channels listed in DISCORD_STATUS_PUBLIC_CHANNEL_IDS (comma-separated; unset = off).
 *
 * Seen-incident IDs persist to discordStatusState.json (Tier 3 — gitignored, no backup)
 * because every dev-restart redeploys TEST; without persistence each deploy during an
 * incident would re-post the cards, including to public announce channels.
 *
 * Bulletproof — all errors caught, never crashes blue. Gated to INSTANCE_ROLE=test.
 */

import path from 'path';
import fs from 'fs/promises';
import { atomicSave } from '../../atomicSave.js';

const REECE_USER_ID = '391415444084490240';
const BUGS_CHANNEL_ID = '1335678517907816530';   // #private-bugs in the community server
const STATUS_URL = 'https://discordstatus.com/api/v2/incidents/unresolved.json';
const STATE_FILE = path.join(process.cwd(), 'discordStatusState.json');

const POLL_INTERVAL_MS = Number(process.env.DISCORD_STATUS_INTERVAL_MS) || 120_000;
const FETCH_TIMEOUT_MS = 10_000;

/** Components/keywords that mean bot traffic is affected. */
const RELEVANCE = /\bapi\b|gateway|interaction|messag|media proxy|push/i;

/**
 * Pure: does this Statuspage incident plausibly affect bot interactions?
 * Relevant if any affected component or the incident name matches RELEVANCE,
 * or if Discord rates the impact major/critical (platform-wide pain).
 */
export function isRelevantIncident(incident) {
  if (!incident || typeof incident !== 'object') return false;
  if (['major', 'critical'].includes(incident.impact)) return true;
  if (RELEVANCE.test(incident.name || '')) return true;
  return (incident.components || []).some(c => RELEVANCE.test(c?.name || ''));
}

/**
 * Pure: diff currently-unresolved relevant incidents against the known map.
 * known: { [id]: { name } }. Returns new incidents to announce, resolved
 * entries (disappeared from the unresolved list), and the next known map.
 */
export function diffIncidents(known, incidents) {
  const current = incidents.filter(isRelevantIncident);
  const currentIds = new Set(current.map(i => i.id));
  const newIncidents = current.filter(i => !(i.id in known));
  const resolved = Object.entries(known)
    .filter(([id]) => !currentIds.has(id))
    .map(([id, meta]) => ({ id, name: meta?.name || 'Discord incident' }));
  const nextKnown = {};
  for (const i of current) nextKnown[i.id] = { name: i.name };
  return { newIncidents, resolved, nextKnown };
}

/** User-facing copy for public announce channels (neutral, no internals). */
export function publicIncidentText(name) {
  return `## 📡 Discord Platform Incident\nDiscord is reporting an issue on their end: **${name}**.\n` +
    `CastBot itself is online, but you may see "This interaction failed" or slow responses until Discord resolves it.\n` +
    `No action needed — buttons and commands will work normally once Discord resolves the issue.`;
}

export function publicResolvedText(name) {
  return `## ✅ Discord Incident Resolved\nDiscord has resolved: **${name}**. Normal service should be restored.`;
}

export class DiscordStatusWatchdog {
  constructor(client = null) {
    this.client = client;
    this.interval = null;
    this.known = null;          // loaded lazily from STATE_FILE on first tick
    this._busy = false;
    this.publicChannelIds = String(process.env.DISCORD_STATUS_PUBLIC_CHANNEL_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
  }

  async loadState() {
    try {
      const raw = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
      return raw?.known && typeof raw.known === 'object' ? raw.known : {};
    } catch {
      return {};   // first run / unreadable — start fresh
    }
  }

  async saveState() {
    try {
      await atomicSave(STATE_FILE, { known: this.known }, { minSize: 2, label: 'discordStatusState' });
    } catch (e) {
      console.error('[DiscordStatus] state save failed:', e.message);
    }
  }

  async fetchUnresolved() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(STATUS_URL, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data?.incidents) ? data.incidents : [];
    } finally {
      clearTimeout(t);
    }
  }

  /** Raw-REST Components V2 post (same pattern as ProdWatchdog — builders choke on raw V2 JSON). */
  async postCard(channelId, content, accentColor, mentionReece = false) {
    const { DiscordRequest } = await import('../../utils.js');
    await DiscordRequest(`channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        flags: 1 << 15, // IS_COMPONENTS_V2
        components: [{ type: 17, accent_color: accentColor, components: [{ type: 10, content }] }],
        allowed_mentions: mentionReece ? { users: [REECE_USER_ID] } : { parse: [] }
      }
    });
  }

  async announceIncident(incident) {
    const components = (incident.components || []).map(c => c?.name).filter(Boolean).join(', ') || 'unspecified';
    const link = incident.shortlink ? `\n${incident.shortlink}` : '';
    // Critical incidents ping Reece; the rest are informational amber.
    const critical = incident.impact === 'critical';
    const internal = `${critical ? `<@${REECE_USER_ID}>\n` : ''}## 🟠 Discord Platform Incident\n` +
      `Discord is reporting: **${incident.name}**\n` +
      `**Impact:** ${incident.impact || 'unknown'} · **Status:** ${incident.status || 'unknown'}\n` +
      `**Affected:** ${components}${link}\n` +
      `-# CastBot's own prod probe is separate — "interaction failed" reports during this window are likely Discord-side.`;
    try {
      await this.postCard(BUGS_CHANNEL_ID, internal, 0xf39c12, critical);
    } catch (e) {
      console.error('[DiscordStatus] internal incident post failed:', e.message);
    }
    for (const channelId of this.publicChannelIds) {
      try {
        await this.postCard(channelId, publicIncidentText(incident.name), 0xf39c12);
      } catch (e) {
        console.error(`[DiscordStatus] public incident post failed (${channelId}):`, e.message);
      }
    }
  }

  async announceResolved({ name }) {
    try {
      await this.postCard(BUGS_CHANNEL_ID, `## 🟢 Discord Incident Resolved\n**${name}** is no longer listed as unresolved.`, 0x27ae60);
    } catch (e) {
      console.error('[DiscordStatus] internal resolved post failed:', e.message);
    }
    for (const channelId of this.publicChannelIds) {
      try {
        await this.postCard(channelId, publicResolvedText(name), 0x27ae60);
      } catch (e) {
        console.error(`[DiscordStatus] public resolved post failed (${channelId}):`, e.message);
      }
    }
  }

  async tick() {
    if (this._busy) return;
    this._busy = true;
    try {
      if (this.known === null) this.known = await this.loadState();
      const incidents = await this.fetchUnresolved();
      const { newIncidents, resolved, nextKnown } = diffIncidents(this.known, incidents);
      if (!newIncidents.length && !resolved.length) { this.known = nextKnown; return; }

      for (const incident of newIncidents) {
        console.log(`[DiscordStatus] 🟠 New Discord incident: ${incident.name} (${incident.impact})`);
        await this.announceIncident(incident);
      }
      for (const r of resolved) {
        console.log(`[DiscordStatus] 🟢 Discord incident resolved: ${r.name}`);
        await this.announceResolved(r);
      }
      this.known = nextKnown;
      await this.saveState();
    } catch (e) {
      // Statuspage flakiness is not an incident — log and try again next tick.
      console.error('[DiscordStatus] tick error (isolated):', e.message);
    } finally {
      this._busy = false;
    }
  }

  start() {
    if (process.env.INSTANCE_ROLE !== 'test') {
      console.log('[DiscordStatus] Not the TEST instance — Discord status watchdog disabled');
      return;
    }
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.tick().catch((e) => console.error('[DiscordStatus] tick error (isolated):', e.message));
    }, POLL_INTERVAL_MS);
    console.log(`[DiscordStatus] ✅ Watching discordstatus.com every ${POLL_INTERVAL_MS / 1000}s → #private-bugs` +
      (this.publicChannelIds.length ? ` + ${this.publicChannelIds.length} public channel(s)` : ' (public mirror OFF)'));
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }
}

let instance = null;
export const getDiscordStatusWatchdog = (client = null) => {
  if (!instance) instance = new DiscordStatusWatchdog(client);
  else if (client && !instance.client) instance.client = client;
  return instance;
};

export default DiscordStatusWatchdog;
