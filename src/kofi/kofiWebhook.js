/**
 * 💰 Ko-fi webhook ingestion — Phase 2-lite of the premium pipeline (RaP 0891).
 *
 * Ko-fi POSTs application/x-www-form-urlencoded with a `data` field holding JSON
 * (verified 2026-08-08 against the live dashboard). Flow:
 *
 *   POST /kofi → verify token → dedupe by message_id → append logs/kofi-events.jsonl
 *     ├─ first subscription payment  → 💰 card in #💎premium with [Grant + Link] modal
 *     ├─ renewal, email LINKED       → auto-extend guild tier (max(current, paidAt+31d))
 *     ├─ renewal, email unlinked     → card again (subscriber was never linked)
 *     └─ tip / shop order / etc      → quiet FYI card, no entitlement action
 *
 * Exactly-once semantics: Ko-fi retries until it sees 200; we return 200 only after
 * the event is persisted, and replays are suppressed by message_id. Card-post failures
 * do NOT fail the request (the billing record is the thing that must never be lost —
 * a missed ping is recoverable from the JSONL, a 500-loop is not).
 *
 * Cancellations: none exist in Ko-fi's API — absence of renewal → grace → lapse
 * (entitlements.js). Refunds/chargebacks: manual revoke via the Entitlements panel.
 *
 * Top of file is import-light so tests can consume the pure helpers directly.
 */

import crypto from 'crypto';

export const RENEWAL_EXTEND_MS = 31 * 24 * 60 * 60 * 1000; // monthly cycle + slack; 7d grace absorbs drift
export const KOFI_CHANNEL_ID = '1535490010831265832';       // #💎premium (Reece's prod area, 2026-08-08)
const EVENTS_FILE = 'logs/kofi-events.jsonl';

// ---------- Pure helpers (unit-tested) ----------

/**
 * Extract and validate the Ko-fi payload from a parsed form body ({ data: '<json>' }).
 * @returns {{ok: true, event: Object} | {ok: false, error: string}}
 */
export function parseKofiPayload(body) {
  const raw = body?.data;
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'missing data field' };
  let event;
  try { event = JSON.parse(raw); } catch { return { ok: false, error: 'data is not valid JSON' }; }
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { ok: false, error: 'data is not an object' };
  if (!event.message_id) return { ok: false, error: 'missing message_id' };
  return { ok: true, event };
}

/** Constant-time token comparison (length mismatch handled without throwing). */
export function verifyKofiToken(event, expectedToken) {
  const got = String(event?.verification_token || '');
  const want = String(expectedToken || '');
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * Classify an event for routing. Ko-fi's `type` is Tip/Donation/Subscription/
 * Commission/Shop Order; the subscription booleans are the reliable signal.
 * @returns {'first_subscription'|'renewal'|'other'}
 */
export function classifyKofiEvent(event) {
  if (event?.is_subscription_payment) {
    return event.is_first_subscription_payment ? 'first_subscription' : 'renewal';
  }
  return 'other';
}

/**
 * New validUntil after a renewal payment: never shrink a manually-extended date,
 * never touch permanent (null) — caller skips those.
 */
export function computeRenewalValidUntil(currentValidUntil, paymentAtMs, extendMs = RENEWAL_EXTEND_MS) {
  return Math.max(Number.isFinite(currentValidUntil) ? currentValidUntil : 0, paymentAtMs + extendMs);
}

/** Compact audit record for the JSONL — enough to rebuild grants; no card data ever. */
export function toBillingRecord(event, receivedAt) {
  return {
    at: receivedAt,
    message_id: event.message_id,
    type: event.type || null,
    is_subscription_payment: !!event.is_subscription_payment,
    is_first_subscription_payment: !!event.is_first_subscription_payment,
    tier_name: event.tier_name || null,
    from_name: event.from_name || null,
    email: (event.email || '').toLowerCase() || null,
    amount: event.amount || null,
    currency: event.currency || null,
    is_public: event.is_public !== false,
    kofi_transaction_id: event.kofi_transaction_id || null,
    timestamp: event.timestamp || null
  };
}

// ---------- I/O ----------

let seenIds = null; // message_id dedupe set, lazily rebuilt from the JSONL on boot

async function loadSeenIds() {
  if (seenIds) return seenIds;
  seenIds = new Set();
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(EVENTS_FILE, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try { const rec = JSON.parse(line); if (rec.message_id) seenIds.add(rec.message_id); } catch { /* skip torn line */ }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('💰 [KOFI] Could not read events file (starting empty):', err.message);
  }
  return seenIds;
}

async function appendEvent(record) {
  const fs = await import('fs/promises');
  await fs.mkdir('logs', { recursive: true }).catch(() => {});
  await fs.appendFile(EVENTS_FILE, JSON.stringify(record) + '\n');
  (await loadSeenIds()).add(record.message_id);
}

/** Look a persisted event back up by message_id (Grant+Link modal round-trip). */
export async function findBillingRecord(messageId) {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(EVENTS_FILE, 'utf8');
    for (const line of content.split('\n').reverse()) {
      if (!line.includes(messageId)) continue;
      try { const rec = JSON.parse(line); if (rec.message_id === messageId) return rec; } catch { /* skip */ }
    }
  } catch { /* fall through */ }
  return null;
}

async function postToPremiumChannel(components, allowedMentions = { parse: [] }) {
  const { DiscordRequest } = await import('../../utils.js');
  return DiscordRequest(`channels/${KOFI_CHANNEL_ID}/messages`, {
    method: 'POST',
    body: { flags: 1 << 15, components, allowed_mentions: allowedMentions }
  }, 'Ko-fi premium channel post');
}

function money(event) {
  return event.amount ? `${event.amount} ${event.currency || ''}`.trim() : '?';
}

function subscriberCard(event, kind) {
  const lines = [
    `## 💰 ${kind === 'renewal_unlinked' ? 'Ko-fi renewal — NOT LINKED' : 'New CastBot Premium subscriber'}`,
    `**${event.from_name || 'Unknown'}** — ${event.tier_name || 'no tier'} — ${money(event)}`,
    `Email: \`${event.email || 'none provided'}\``,
    `-# ${kind === 'renewal_unlinked' ? 'A renewal arrived for an email with no linked guild — link it now and future renewals extend automatically.' : 'Grant + Link binds this email to a guild; every future renewal then extends it automatically.'}`
  ];
  if (event.message && event.is_public !== false) lines.splice(3, 0, `Message: ${String(event.message).slice(0, 200)}`);
  return [{
    type: 17, accent_color: 0xf1c40f,
    components: [
      { type: 10, content: lines.join('\n') },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `kofi_grant_${event.message_id}`, label: 'Grant + Link Guild', style: 3, emoji: { name: '⭐' } }
      ]}
    ]
  }];
}

function quietCard(event) {
  return [{
    type: 17, accent_color: 0x95a5a6,
    components: [{ type: 10, content: `💸 Ko-fi ${event.type || 'payment'}: **${event.from_name || 'Someone'}** — ${money(event)}${event.email ? ` — \`${event.email}\`` : ''}` }]
  }];
}

function renewalCard(event, guildName, newValidUntil) {
  return [{
    type: 17, accent_color: 0x2ecc71,
    components: [{ type: 10, content: `🔄 Ko-fi renewal: **${event.from_name || 'subscriber'}** (${money(event)}) → **${guildName}** premium extended to <t:${Math.floor(newValidUntil / 1000)}:D>` }]
  }];
}

/**
 * Express handler for POST /kofi (route-local urlencoded parser lives in app.js).
 * Returns 200 ONLY once the event is persisted (Ko-fi retries anything else).
 */
export async function handleKofiWebhook(req, res) {
  const token = process.env.KOFI_VERIFICATION_TOKEN;
  if (!token) {
    console.warn('💰 [KOFI] KOFI_VERIFICATION_TOKEN not set — webhook disabled on this instance');
    return res.status(503).send('kofi webhook not configured');
  }

  const parsed = parseKofiPayload(req.body);
  if (!parsed.ok) {
    console.warn(`💰 [KOFI] Bad payload: ${parsed.error}`);
    return res.status(400).send('bad request');
  }
  const event = parsed.event;

  if (!verifyKofiToken(event, token)) {
    console.warn(`💰 [KOFI] Invalid verification token (from_name=${event.from_name || '?'}) — dropped`);
    return res.status(401).send('invalid token');
  }

  const seen = await loadSeenIds();
  if (seen.has(event.message_id)) {
    console.log(`💰 [KOFI] Duplicate message_id ${event.message_id} — already processed, acking`);
    return res.status(200).send('ok (duplicate)');
  }

  // Persist FIRST — the billing record is the non-negotiable part.
  try {
    await appendEvent(toBillingRecord(event, Date.now()));
  } catch (err) {
    console.error('💰 [KOFI] Failed to persist event — returning 500 so Ko-fi retries:', err.message);
    return res.status(500).send('persist failed');
  }

  const kind = classifyKofiEvent(event);
  console.log(`💰 [KOFI] ${kind}: ${event.type} from ${event.from_name || '?'} (${money(event)}) tier=${event.tier_name || '-'} id=${event.message_id}`);

  // Notification / entitlement action — best-effort, never fails the webhook.
  try {
    if (kind === 'first_subscription') {
      await postToPremiumChannel(subscriberCard(event, 'first'));
    } else if (kind === 'renewal') {
      const { findGuildByKofiEmail, getGuildEntitlement, setTierValidUntil } = await import('../../entitlements.js');
      const guildId = event.email ? findGuildByKofiEmail(event.email) : null;
      const ent = guildId ? getGuildEntitlement(guildId) : null;
      if (ent?.exists && ent.tierState.state !== 'none' && !ent.tierState.permanent) {
        const paidAt = Date.parse(event.timestamp) || Date.now();
        const newValidUntil = computeRenewalValidUntil(ent.tierState.validUntil, paidAt);
        await setTierValidUntil(guildId, newValidUntil);
        await postToPremiumChannel(renewalCard(event, ent.name, newValidUntil));
      } else if (ent?.exists && ent.tierState.permanent) {
        console.log(`💰 [KOFI] Renewal for permanently-entitled guild ${guildId} — nothing to extend`);
        await postToPremiumChannel(quietCard(event));
      } else {
        await postToPremiumChannel(subscriberCard(event, 'renewal_unlinked'));
      }
    } else {
      await postToPremiumChannel(quietCard(event));
    }
  } catch (err) {
    console.error('💰 [KOFI] Notification/extension step failed (event IS persisted, recover from logs/kofi-events.jsonl):', err.message);
  }

  return res.status(200).send('ok');
}

// ---------- Grant + Link (button → modal → grant) ----------

/** The Grant + Link modal, carrying the billing event's message_id for round-trip. */
export function buildKofiLinkModal(messageId) {
  return {
    custom_id: `kofi_link_modal_${messageId}`,
    title: '⭐ Grant Premium + Link Ko-fi',
    components: [
      {
        type: 18,
        label: 'Guild ID',
        description: 'The server this subscription pays for',
        component: { type: 4, custom_id: 'kofi_guild_id', style: 1, required: true, min_length: 5, max_length: 25, placeholder: 'e.g. 1331657596087566398' }
      },
      {
        type: 18,
        label: 'Duration',
        description: 'Renewals auto-extend from here — 31d covers the first cycle',
        component: { type: 4, custom_id: 'kofi_duration', style: 1, required: false, max_length: 20, value: '31d' }
      }
    ]
  };
}

/** Modal submit: grant the tier, bind the email, confirm. Owner-gated HERE. */
export async function handleKofiLinkModal(req, res, client) {
  const { InteractionResponseType, InteractionResponseFlags } = await import('discord-interactions');
  const userId = req.body.member?.user?.id || req.body.user?.id;
  if (userId !== '391415444084490240') {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '💰 Reece only.', flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  const ephemeral = (content) => res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL }
  });

  const messageId = String(req.body.data.custom_id || '').replace('kofi_link_modal_', '');
  const record = await findBillingRecord(messageId);
  if (!record) return ephemeral(`💰 Couldn't find billing event \`${messageId}\` in the log — link manually via the Entitlements panel.`);

  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    if (inner?.custom_id) fields[inner.custom_id] = inner.value ?? inner.values?.[0];
  }
  const guildId = String(fields.kofi_guild_id || '').trim();
  if (!/^\d{5,}$/.test(guildId)) return ephemeral(`💰 "${guildId}" doesn't look like a guild ID.`);

  const { parseDuration, grantTier, linkKofiEmail, getGuildEntitlement } = await import('../../entitlements.js');
  const dur = parseDuration(fields.kofi_duration);
  if (!dur.ok) return ephemeral(`💰 ${dur.error}`);

  await grantTier(guildId, 'premium', {
    addedBy: userId,
    durationMs: dur.ms,
    reason: `Ko-fi: ${record.from_name || '?'} <${record.email || 'no email'}>`,
    name: client?.guilds?.cache?.get(guildId)?.name
  });
  if (record.email) await linkKofiEmail(guildId, record.email);

  const ent = getGuildEntitlement(guildId);
  const until = ent.tierState.permanent ? 'permanent' : `<t:${Math.floor(ent.tierState.validUntil / 1000)}:D>`;
  // Drop a confirmation into #💎premium so the card has a visible resolution trail
  try {
    await postToPremiumChannel([{
      type: 17, accent_color: 0x2ecc71,
      components: [{ type: 10, content: `✅ **${ent.name}** granted premium (${until})${record.email ? ` and linked to \`${record.email}\` — renewals now extend automatically` : ' — ⚠️ no email on the payment, renewals will NOT auto-extend'}` }]
    }]);
  } catch (err) {
    console.error('💰 [KOFI] Confirmation post failed (grant succeeded):', err.message);
  }
  return ephemeral(`✅ Granted premium to **${ent.name}** (${until})${record.email ? ` and linked \`${record.email}\`` : ''}.`);
}

/** Test seam — reset the dedupe cache (node:test only). */
export function __resetKofiCache() {
  seenIds = null;
}
