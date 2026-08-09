/**
 * 🎟️ Self-service Premium Redeem — email-claim, Lite model (Reece steers 1-3, 2026-08-08).
 *
 * An admin runs Redeem INSIDE the server they want premium on (redeeming IS activating —
 * no subscriber/slot layer yet). They enter the email they paid with on Ko-fi; we match
 * it against the billing records the webhook already persisted, grant the tier anchored
 * to their latest payment (paidAt + 31d, same math as renewals), and bind the email so
 * future renewals extend this guild automatically.
 *
 * Anti-claim-jack posture (steer 2): first-come-first-served, ONE guild per email, and
 * every successful claim posts a card to #💎premium with a Reece-only Undo button.
 * Transfers between servers stay concierge (Entitlements panel) until the Full model.
 *
 * Top of file is import-light; pure eligibility logic is exported for tests.
 */

import { GRACE_MS } from '../../entitlements.js';
import { RENEWAL_EXTEND_MS, KOFI_CHANNEL_ID } from './kofiWebhook.js';

const REECE_ID = '391415444084490240';

// ---------- Pure helpers (unit-tested) ----------

/** Latest subscription payment record for an email (case-insensitive), or null. */
export function findLatestSubscriptionPayment(records, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  let latest = null;
  for (const rec of records || []) {
    if (!rec?.is_subscription_payment || rec.email !== target) continue;
    const at = Date.parse(rec.timestamp) || rec.at || 0;
    if (!latest || at > latest._paidAt) latest = { ...rec, _paidAt: at };
  }
  return latest;
}

/**
 * Decide what a redeem attempt may do. Pure — all I/O facts arrive as arguments.
 *
 * NO TRANSFER COOLDOWN (Reece, 2026-08-09: "I don't mind hosts ferrying things around").
 * The RaP's 7-day anti-slot-sharing lock was built and then deliberately removed — moves
 * are unlimited. Re-adding one means a new field + this branch + the confirm-screen copy.
 *
 * @param {Object} args
 * @param {Object|null} args.payment - findLatestSubscriptionPayment result
 * @param {string|null} args.linkedGuildId - guild currently linked to this email
 * @param {string} args.guildId - the guild being redeemed in
 * @param {{state: string, permanent?: boolean}} args.tierState - the target guild's current tier state
 * @param {number} [args.now]
 * @returns {{ok: true, validUntil: number}
 *         | {ok: false, reason: 'transfer_available', validUntil: number, oldGuildId: string}
 *         | {ok: false, reason: string}}
 */
export function evaluateRedeem({ payment, linkedGuildId, guildId, tierState, now = Date.now() }) {
  if (!payment) return { ok: false, reason: 'no_payment' };
  const validUntil = payment._paidAt + RENEWAL_EXTEND_MS;
  if (validUntil + GRACE_MS < now) return { ok: false, reason: 'inactive' };
  const foreignActive = linkedGuildId !== guildId
    && (tierState.state === 'active' || tierState.state === 'grace');
  if (foreignActive) return { ok: false, reason: 'guild_already_premium' };
  // Self-service transfer (2026-08-08): redeeming elsewhere OFFERS the move instead of denying
  if (linkedGuildId && linkedGuildId !== guildId) {
    return { ok: false, reason: 'transfer_available', validUntil, oldGuildId: linkedGuildId };
  }
  return { ok: true, validUntil };
}

/** Player-facing copy per denial reason. */
export function redeemDenialMessage(reason) {
  switch (reason) {
    case 'no_payment':
      return `🎟️ We can't find a CastBot Premium membership for that email yet.\n` +
        `-# Payments can take a minute to arrive. Also check which email your Ko-fi/PayPal receipt went to — that's the one we see.`;
    case 'inactive':
      return `🎟️ That membership looks inactive — its last payment has expired. Renew at ko-fi.com/CastBot, then redeem again.`;
    case 'guild_already_premium':
      return `🎟️ This server already has CastBot Premium — nothing to redeem here.`;
    default:
      return `🎟️ Couldn't redeem — try again, or ask in the CastBot server.`;
  }
}

// ---------- Pending-transfer cache (email can't ride in a custom_id) ----------

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingTransfers = new Map(); // userId → { email, oldGuildId, newGuildId, validUntil, at }

export function stashPendingTransfer(userId, transfer) {
  pendingTransfers.set(userId, { ...transfer, at: Date.now() });
}

export function takePendingTransfer(userId, newGuildId) {
  const t = pendingTransfers.get(userId);
  if (!t) return null;
  if (Date.now() - t.at > PENDING_TTL_MS || t.newGuildId !== newGuildId) {
    pendingTransfers.delete(userId);
    return null;
  }
  pendingTransfers.delete(userId);
  return t;
}

// ---------- UI ----------

/** The Redeem modal (opened from the upsell's 🎟️ Redeem button). */
export function buildRedeemModal() {
  return {
    custom_id: 'premium_redeem_modal',
    title: '🎟️ Redeem CastBot Premium',
    components: [{
      type: 18,
      label: 'Email used on Ko-fi',
      description: 'The email on your Ko-fi/PayPal receipt — premium lands on THIS server',
      component: { type: 4, custom_id: 'redeem_email', style: 1, required: true, min_length: 5, max_length: 100, placeholder: 'you@example.com' }
    }]
  };
}

function successScreen(guildName, validUntil) {
  return {
    type: 17, accent_color: 0x2ecc71,
    components: [
      { type: 10, content: `## ⭐ Premium Activated` },
      { type: 14 },
      { type: 10, content: `**${guildName}** now has CastBot Premium until <t:${Math.floor(validUntil / 1000)}:D>.\n` +
        `Renewals extend it automatically — nothing else to do.\n-# Thank you for supporting CastBot ❤️` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'premium_back', label: '← Premium', style: 2 }
      ]}
    ]
  };
}

// ---------- Handler ----------

/**
 * MODAL_SUBMIT: premium_redeem_modal. ManageRoles-gated (the modal opens from a
 * ManageRoles-gated button, but modal submits bypass the factory — re-check here).
 */
export async function handleRedeemModal(req, res, client) {
  const { InteractionResponseType, InteractionResponseFlags } = await import('discord-interactions');
  const ephemeral = (content) => res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL }
  });

  const { hasPermission } = await import('../../buttonHandlerFactory.js');
  const { PermissionFlagsBits } = await import('discord.js');
  // Global Access roles count here too (they're worth Manage Roles) — a producer trusted to run
  // the season can bind the host's Ko-fi code to it. Owner-tier features remain unreachable.
  if (!hasPermission(req.body.member, PermissionFlagsBits.ManageRoles, req.body.guild_id)) {
    return ephemeral('🎟️ You need Manage Roles in this server to redeem premium for it.');
  }
  const guildId = req.body.guild_id;
  const userId = req.body.member?.user?.id || req.body.user?.id;
  if (!guildId) return ephemeral('🎟️ Redeem must be run inside the server you want premium on.');

  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    if (inner?.custom_id) fields[inner.custom_id] = inner.value ?? inner.values?.[0];
  }
  const email = String(fields.redeem_email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ephemeral(`🎟️ "${email}" doesn't look like an email address.`);

  // Gather the facts, decide with the pure evaluator
  const records = await loadBillingRecords();
  const payment = findLatestSubscriptionPayment(records, email);
  const { findGuildByKofiEmail, getGuildEntitlement, grantTier, linkKofiEmail } = await import('../../entitlements.js');
  const linkedGuildId = findGuildByKofiEmail(email);
  const ent = getGuildEntitlement(guildId);
  const oldEnt = linkedGuildId && linkedGuildId !== guildId ? getGuildEntitlement(linkedGuildId) : null;
  const verdict = evaluateRedeem({
    payment, linkedGuildId, guildId,
    tierState: ent.exists ? ent.tierState : { state: 'none' }
  });

  console.log(`🎟️ [REDEEM] guild=${guildId} user=${userId} email=${email} → ${verdict.ok ? `OK until ${new Date(verdict.validUntil).toISOString()}` : verdict.reason}`);
  if (!verdict.ok && verdict.reason === 'transfer_available') {
    // Offer the move (Reece-approved 2026-08-08): stash facts, show the confirmation
    stashPendingTransfer(userId, { email, oldGuildId: verdict.oldGuildId, newGuildId: guildId, validUntil: verdict.validUntil });
    const oldName = client?.guilds?.cache?.get(verdict.oldGuildId)?.name || oldEnt?.name || verdict.oldGuildId;
    const newName = client?.guilds?.cache?.get(guildId)?.name || 'this server';
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { components: [transferConfirmScreen(oldName, newName, verdict.validUntil)], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
    });
  }
  if (!verdict.ok) return ephemeral(redeemDenialMessage(verdict.reason));

  const guildName = client?.guilds?.cache?.get(guildId)?.name;
  await grantTier(guildId, 'premium', {
    addedBy: userId,
    validUntil: verdict.validUntil,
    source: 'subscription',
    reason: `Self-redeem: ${payment.from_name || '?'} <${email}>`,
    name: guildName
  });
  await linkKofiEmail(guildId, email);

  // Claim card with Reece-only Undo (steer 2: first-come-first-served + notify + undo)
  try {
    const { DiscordRequest } = await import('../../utils.js');
    await DiscordRequest(`channels/${KOFI_CHANNEL_ID}/messages`, {
      method: 'POST',
      body: { flags: 1 << 15, components: [{
        type: 17, accent_color: 0x2ecc71,
        components: [
          { type: 10, content: `🎟️ **Self-redeem**: \`${email}\` → **${guildName || guildId}** by <@${userId}> — premium until <t:${Math.floor(verdict.validUntil / 1000)}:D>` },
          { type: 1, components: [
            { type: 2, custom_id: `kofi_unlink_${guildId}`, label: 'Undo (revoke + unlink)', style: 4, emoji: { name: '↩️' } }
          ]}
        ]
      }], allowed_mentions: { parse: [] } }
    }, 'Redeem claim card');
  } catch (err) {
    console.error('🎟️ [REDEEM] Claim card post failed (redeem succeeded):', err.message);
  }

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { components: [successScreen(guildName || 'This server', verdict.validUntil)], flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL }
  });
}

/** Read every persisted billing record (small file — payments only). */
async function loadBillingRecords() {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile('logs/kofi-events.jsonl', 'utf8');
    return content.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

/** Transfer confirmation — LEAN deletion-standard shape: computed facts, cancel-first. */
function transferConfirmScreen(oldName, newName, validUntil) {
  return {
    type: 17, accent_color: 0xf39c12,
    components: [
      { type: 10, content: `## 🔁 Move Premium Here?` },
      { type: 14 },
      { type: 10, content: `Your membership currently powers **${oldName}** (premium until <t:${Math.floor(validUntil / 1000)}:D>).\n\n` +
        `Moving it to **${newName}**:\n` +
        `• **${oldName} drops to free immediately**\n` +
        `• Renewals extend **${newName}** from now on\n` +
        `• You can move it back any time` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'premium_transfer_cancel', label: 'Cancel', style: 2, emoji: { name: '❌' } },
        { type: 2, custom_id: 'premium_transfer_confirm', label: 'Move Premium Here', style: 3, emoji: { name: '⭐' } }
      ]}
    ]
  };
}

/**
 * premium_transfer_confirm / premium_transfer_cancel (factory context, updateMessage).
 * Confirm re-validates against live state — the 10-min pending window is long enough
 * for the world to change (a renewal, a competing claim, Reece revoking).
 */
export async function handleTransferButton(context, customId) {
  if (customId === 'premium_transfer_cancel') {
    pendingTransfers.delete(context.userId);
    const { MenuBuilder } = await import('../../menuBuilder.js');
    return { components: [MenuBuilder.buildPremiumUpsell(context, false)] };
  }
  const t = takePendingTransfer(context.userId, context.guildId);
  if (!t) {
    return { components: [{ type: 17, accent_color: 0xf39c12, components: [
      { type: 10, content: `🎟️ That transfer offer expired — run **Redeem** again.` },
      { type: 1, components: [{ type: 2, custom_id: 'premium_back', label: '← Premium', style: 2 }] }
    ]}] };
  }

  // Re-validate: the link must still point at the old guild (10-min offer window — a
  // renewal, competing claim, or Reece revoke can land while the host is deciding)
  const { findGuildByKofiEmail, getGuildEntitlement, grantTier, linkKofiEmail, revokeTier } = await import('../../entitlements.js');
  const stillLinked = findGuildByKofiEmail(t.email);
  const oldEnt = stillLinked ? getGuildEntitlement(stillLinked) : null;
  if (stillLinked !== t.oldGuildId) {
    return { components: [{ type: 17, accent_color: 0xf39c12, components: [
      { type: 10, content: `🎟️ That membership's situation changed while you decided — run **Redeem** again.` },
      { type: 1, components: [{ type: 2, custom_id: 'premium_back', label: '← Premium', style: 2 }] }
    ]}] };
  }

  const oldName = context.client?.guilds?.cache?.get(t.oldGuildId)?.name || oldEnt?.name || t.oldGuildId;
  const newName = context.client?.guilds?.cache?.get(t.newGuildId)?.name;
  await revokeTier(t.oldGuildId); // old server → free tier, email unlinked
  await grantTier(t.newGuildId, 'premium', {
    addedBy: context.userId,
    validUntil: t.validUntil,
    source: 'subscription',
    reason: `Transfer from ${oldName}: <${t.email}>`,
    name: newName
  });
  await linkKofiEmail(t.newGuildId, t.email);
  console.log(`🎟️ [TRANSFER] ${t.email}: ${t.oldGuildId} (${oldName}) → ${t.newGuildId} by ${context.userId}`);

  try {
    const { DiscordRequest } = await import('../../utils.js');
    await DiscordRequest(`channels/${KOFI_CHANNEL_ID}/messages`, {
      method: 'POST',
      body: { flags: 1 << 15, components: [{
        type: 17, accent_color: 0xf39c12,
        components: [
          { type: 10, content: `🔁 **Transfer**: \`${t.email}\` moved **${oldName}** → **${newName || t.newGuildId}** by <@${context.userId}> — premium until <t:${Math.floor(t.validUntil / 1000)}:D>` },
          { type: 1, components: [
            { type: 2, custom_id: `kofi_unlink_${t.newGuildId}`, label: 'Undo (revoke + unlink)', style: 4, emoji: { name: '↩️' } }
          ]}
        ]
      }], allowed_mentions: { parse: [] } }
    }, 'Transfer card');
  } catch (err) {
    console.error('🎟️ [TRANSFER] Card post failed (transfer succeeded):', err.message);
  }

  return { components: [{ type: 17, accent_color: 0x2ecc71, components: [
    { type: 10, content: `## ⭐ Premium Moved` },
    { type: 14 },
    { type: 10, content: `**${newName || 'This server'}** now has CastBot Premium until <t:${Math.floor(t.validUntil / 1000)}:D>.\n**${oldName}** is back on the free tier.\n-# Renewals extend this server automatically. You can move it again any time.` },
    { type: 14 },
    { type: 1, components: [{ type: 2, custom_id: 'premium_back', label: '← Premium', style: 2 }] }
  ]}] };
}

/** kofi_unlink_<guildId> — Reece-only Undo from the claim card. */
export async function handleKofiUnlink(context, customId) {
  if (context.userId !== REECE_ID) return { content: '💰 Reece only.', ephemeral: true };
  const guildId = customId.replace('kofi_unlink_', '');
  const { revokeTier } = await import('../../entitlements.js');
  await revokeTier(guildId); // also clears kofiEmail — renewal auto-extend stops
  return { components: [{
    type: 17, accent_color: 0xe74c3c,
    components: [{ type: 10, content: `↩️ Undone — premium revoked and email unlinked for guild \`${guildId}\`.` }]
  }] };
}
