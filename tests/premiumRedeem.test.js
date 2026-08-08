/**
 * 🎟️ Self-service Premium Redeem — pure eligibility coverage.
 * findLatestSubscriptionPayment / evaluateRedeem / redeemDenialMessage are pure exports
 * (no fs at import); the modal submit handler is Discord-I/O and not unit-tested.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findLatestSubscriptionPayment, evaluateRedeem, redeemDenialMessage } from '../src/kofi/premiumRedeem.js';
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

  it('email linked to a DIFFERENT guild → linked_elsewhere (first-come-first-served)', () => {
    assert.equal(evaluateRedeem({ ...base, linkedGuildId: 'g2' }).reason, 'linked_elsewhere');
  });

  it('re-redeem in the SAME linked guild is allowed (idempotent refresh)', () => {
    assert.equal(evaluateRedeem({ ...base, linkedGuildId: 'g1', tierState: { state: 'active' } }).ok, true);
  });

  it('guild already premium from another source → guild_already_premium; lapsed/none is fine', () => {
    assert.equal(evaluateRedeem({ ...base, tierState: { state: 'active' } }).reason, 'guild_already_premium');
    assert.equal(evaluateRedeem({ ...base, tierState: { state: 'grace' } }).reason, 'guild_already_premium');
    assert.equal(evaluateRedeem({ ...base, tierState: { state: 'lapsed' } }).ok, true);
  });

  it('every denial reason has player-facing copy', () => {
    for (const reason of ['no_payment', 'inactive', 'linked_elsewhere', 'guild_already_premium', 'unknown']) {
      assert.ok(redeemDenialMessage(reason).length > 10);
    }
  });
});
