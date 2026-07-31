/**
 * Post a message into a channel under an arbitrary display name — the "service user" look you see
 * on `CastBot Health Monitor - Test` and on Carl-bot's announcement posts. Discord renders these
 * with an APP tag and the webhook's name/avatar rather than the bot's own identity.
 *
 * WHY A REUSED WEBHOOK, NOT create-post-delete
 * healthMonitor.js creates a webhook, posts, then deletes it 5s later. That is fine for a once-a-day
 * scheduled report, but wrong here for three reasons:
 *   1. `username` and `avatar_url` are per-EXECUTE overrides — one webhook can post under any name,
 *      so there is nothing to gain from a fresh one each time. This is the whole trick.
 *   2. Webhook creation is an audit-log entry and a rate-limited operation; doing it per message is
 *      noisy and slow.
 *   3. Discord caps 15 webhooks per channel. Any failed delete in a create/delete loop leaks one,
 *      and the 16th post then fails permanently.
 * So: find a webhook this bot already owns in the channel, else create one, and keep it.
 */

import fetch from 'node-fetch';
import { DiscordRequest } from '../../utils.js';

/** The webhook we look for / create. Its name is irrelevant to what viewers see — that's the
 *  per-message `username` override — but a stable name is how we find ours again. */
export const WEBHOOK_NAME = 'CastBot Persona';

/** Discord rejects webhook usernames containing these, with an unhelpful 400. Catch it ourselves. */
const BANNED_SUBSTRINGS = ['discord', 'clyde'];

/**
 * Validate a display name against Discord's webhook-username rules. Pure.
 *
 * Discord returns a bare 400 for a banned name with no indication of which rule was broken, so the
 * check lives here and produces a message a host can act on.
 *
 * @param {string} raw
 * @param {string} fallback - used when raw is empty
 * @returns {{ok: boolean, name?: string, error?: string}}
 */
export function validatePersonaName(raw, fallback = 'CastBot') {
  const name = String(raw ?? '').trim() || fallback;
  if (name.length > 80) return { ok: false, error: 'Display name must be 80 characters or fewer.' };
  const lower = name.toLowerCase();
  for (const banned of BANNED_SUBSTRINGS) {
    if (lower.includes(banned)) {
      return { ok: false, error: `Discord doesn't allow "${banned}" in a webhook display name. Pick a different name.` };
    }
  }
  return { ok: true, name };
}

/**
 * Modal DATA for composing a persona post (wrap in `{ type: 9, data }` or res.send yourself).
 * Display Name is optional — blank falls back to the bot's own name, which is the common case.
 * @param {string} customId
 * @param {string} [title]
 * @returns {Object} modal data
 */
export function buildPersonaModal(customId, title = 'Post as…') {
  return {
    custom_id: customId,
    title,
    components: [
      { type: 18, label: 'Display Name', description: 'Who the message appears to come from (blank = CastBot)', component: {
        type: 4, custom_id: 'persona_name', style: 1, max_length: 80, required: false,
        placeholder: 'e.g. Melbourne Survivor Production'
      }},
      { type: 18, label: 'Message', description: 'Posted into the current channel under that name', component: {
        type: 4, custom_id: 'message_text', style: 2, min_length: 1, max_length: 2000, required: true,
        placeholder: 'Type what the persona should say...'
      }}
    ]
  };
}

/**
 * Find the webhook this bot owns in a channel, creating it if absent.
 *
 * Only webhooks CREATED BY THIS APP come back with a token from the list endpoint, so the
 * `w.token` check is load-bearing, not defensive — a webhook made by a human in the UI is
 * unusable to us even though it appears in the list.
 *
 * @param {Object} client - discord.js client (for the bot's own id)
 * @param {string} channelId
 * @returns {Promise<{id: string, token: string}>}
 */
export async function getPersonaWebhook(client, channelId) {
  const existing = await DiscordRequest(`channels/${channelId}/webhooks`, { method: 'GET' });
  const botId = client?.user?.id;
  const mine = (existing || []).find(w => w?.token && w?.name === WEBHOOK_NAME && (!botId || w?.user?.id === botId));
  if (mine) return { id: mine.id, token: mine.token };

  const created = await DiscordRequest(`channels/${channelId}/webhooks`, {
    method: 'POST',
    body: { name: WEBHOOK_NAME }
  });
  console.log(`🪝 [PERSONA] Created webhook ${created.id} in channel ${channelId}`);
  return { id: created.id, token: created.token };
}

/**
 * Post `content` into a channel as `username`.
 *
 * Mentions are neutralized (`allowed_mentions: { parse: [] }`) — a webhook post is trivially
 * scriptable and would otherwise be an unauthenticated @everyone. Loosen deliberately, not by
 * default.
 *
 * @param {Object} p
 * @param {Object} p.client
 * @param {string} p.guildId - only used to build the jump URL
 * @param {string} p.channelId
 * @param {string} p.username - display name (validate with validatePersonaName first)
 * @param {string} p.content
 * @param {string} [p.avatarUrl] - defaults to the bot's own avatar so it doesn't render as a blank
 *   grey default, matching how the health monitor's posts look
 * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
 */
export async function postAsPersona({ client, guildId, channelId, username, content, avatarUrl }) {
  let webhook;
  try {
    webhook = await getPersonaWebhook(client, channelId);
  } catch (error) {
    // 50013 = Missing Permissions. Everything else is unexpected and worth surfacing verbatim.
    const missingPerms = error?.message?.includes('50013') || error?.code === 50013;
    console.error(`❌ [PERSONA] Could not obtain webhook for ${channelId}:`, error.message);
    return {
      ok: false,
      error: missingPerms
        ? 'CastBot needs the **Manage Webhooks** permission in this channel to post under a custom name.'
        : `Could not create a webhook here: ${error.message}`
    };
  }

  const res = await fetch(`https://discord.com/api/v10/webhooks/${webhook.id}/${webhook.token}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      avatar_url: avatarUrl || client?.user?.displayAvatarURL?.() || undefined,
      content,
      allowed_mentions: { parse: [] }
    })
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error(`❌ [PERSONA] Webhook post failed ${res.status}: ${detail}`);
    return { ok: false, error: `Discord rejected the message (${res.status}). ${detail}` };
  }

  // ?wait=true makes Discord return the created message, which is the only way to get its id for
  // a jump link — without it the response is a bare 204.
  const message = await res.json();
  return { ok: true, url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}` };
}
