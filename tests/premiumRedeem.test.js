/**
 * 🎟️ Self-service Premium Redeem — pure eligibility coverage.
 * findLatestSubscriptionPayment / evaluateRedeem / redeemDenialMessage are pure exports
 * (no fs at import); the modal submit handler is Discord-I/O and not unit-tested.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findLatestSubscriptionPayment, evaluateRedeem, redeemDenialMessage, TRANSFER_COOLDOWN_MS } from '../src/kofi/premiumRedeem.js';
import { RENEWAL_EXTEND_MS } from '../src/kofi/kofiWebhook.js';
import { GRACE_MS } from '../entitlements.js';

const NOW = 1_800_000_000_000;
const rec = (over = {}) => ({
  message_id: 'm1', is_subscription_payment: true, email: 'jo@example.com',
  timestamp: new Date(NOW - 5 * 86400000).toISOString(), at: NOW - 5 * 86400000,
  from_name: 'Jo', ...over
});

describe('Redeem — findLatestSubscriptionPayment', () => {
  it('matches case-insensitively and picks the newest subscription payment', () => {
    const records = [
      rec({ message_id: 'old', timestamp: new Date(NOW - 40 * 86400000).toISOString() }),
      rec({ message_id: 'new', email: 'jo@example.com', timestamp: new Date(NOW - 2 * 86400000).toISOString() })
    ];
    assert.equal(findLatestSubscriptionPayment(records, 'JO@Example.COM').message_id, 'new');
  });

  it('ignores tips and other emails; empty inputs → null', () => {
    assert.equal(findLatestSubscriptionPayment([rec({ is_subscription_payment: false })], 'jo@example.com'), null);
    assert.equal(findLatestSubscriptionPayment([rec()], 'other@example.com'), null);
    assert.equal(findLatestSubscriptionPayment([], 'jo@example.com'), null);
    assert.equal(findLatestSubscriptionPayment(undefined, ''), null);
  });
});

describe('Redeem — evaluateRedeem', () => {
  const payment = () => findLatestSubscriptionPayment([rec()], 'jo@example.com');
  const base = { payment: payment(), linkedGuildId: null, guildId: 'g1', tierState: { state: 'none' }, now: NOW };

  it('grants with validUntil anchored to the payment (+31d)', () => {
    const v = evaluateRedeem(base);
    assert.equal(v.ok, true);
    assert.equal(v.validUntil, (NOW - 5 * 86400000) + RENEWAL_EXTEND_MS);
  });

  it('no payment → no_payment', () => {
    assert.equal(evaluateRedeem({ ...base, payment: null }).reason, 'no_payment');
  });

  it('stale payment (past expiry + grace) → inactive', () => {
    const stale = findLatestSubscriptionPayment(
      [rec({ timestamp: new Date(NOW - RENEWAL_EXTEND_MS - GRACE_MS - 1000).toISOString() })], 'jo@example.com');
    assert.equal(evaluateRedeem({ ...base, payment: stale }).reason, 'inactive');
  });

  it('email linked to a DIFFERENT guild → transfer OFFER, carrying the old guild + expiry', () => {
    const v = evaluateRedeem({ ...base, linkedGuildId: 'g2' });
    assert.equal(v.reason, 'transfer_available');
    assert.equal(v.oldGuildId, 'g2');
    assert.equal(v.validUntil, (NOW - 5 * 86400000) + RENEWAL_EXTEND_MS);
  });

  it('transfer inside the 7-day cooldown → transfer_cooldown with the unlock time', () => {
    const unlockAt = NOW + 3 * 86400000;
    const v = evaluateRedeem({ ...base, linkedGuildId: 'g2', linkedGuildTransferLockedUntil: unlockAt });
    assert.equal(v.reason, 'transfer_cooldown');
    assert.equal(v.unlockAt, unlockAt);
  });

  it('an EXPIRED cooldown stamp no longer blocks the move', () => {
    const v = evaluateRedeem({ ...base, linkedGuildId: 'g2', linkedGuildTransferLockedUntil: NOW - 1000 });
    assert.equal(v.reason, 'transfer_available');
  });

  it('target guild already premium from another source beats the transfer offer', () => {
    const v = evaluateRedeem({ ...base, linkedGuildId: 'g2', tierState: { state: 'active' } });
    assert.equal(v.reason, 'guild_already_premium');
  });

  it('re-redeem in the SAME linked guild is allowed (idempotent refresh)', () => {
    assert.equal(evaluateRedeem({ ...base, linkedGuildId: 'g1', tierState: { state: 'active' } }).ok, true);
  });

  it('guild already premium from another source → guild_already_premium; lapsed/none is fine', () => {
    assert.equal(evaluateRedeem({ ...base, tierState: { state: 'active' } }).reason, 'guild_already_premium');
    assert.equal(evaluateRedeem({ ...base, tierState: { state: 'grace' } }).reason, 'guild_already_premium');
    assert.equal(evaluateRedeem({ ...base, tierState: { state: 'lapsed' } }).ok, true);
  });

  it('every denial reason has player-facing copy (cooldown names its unlock date)', () => {
    for (const reason of ['no_payment', 'inactive', 'guild_already_premium', 'unknown']) {
      assert.ok(redeemDenialMessage(reason).length > 10);
    }
    assert.ok(redeemDenialMessage('transfer_cooldown', { unlockAt: NOW }).includes(`<t:${Math.floor(NOW / 1000)}:R>`));
    assert.ok(TRANSFER_COOLDOWN_MS === 7 * 24 * 60 * 60 * 1000);
  });
});
