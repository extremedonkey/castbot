/**
 * Ko-fi webhook — pure-helper coverage (parse, verify, classify, renewal math,
 * billing-record shape). The Express handler and Discord I/O are not unit-tested;
 * the pure helpers ARE the decision logic. Helpers import clean (no fs at import).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKofiPayload, verifyKofiToken, classifyKofiEvent,
  computeRenewalValidUntil, toBillingRecord, RENEWAL_EXTEND_MS
} from '../src/kofi/kofiWebhook.js';

const TOKEN = 'f9048c30-e9c6-4416-bab0-5ce0e78564b6';
const sample = (over = {}) => ({
  verification_token: TOKEN,
  message_id: 'aaaa-bbbb-cccc',
  timestamp: '2026-08-08T02:00:00Z',
  type: 'Subscription',
  is_public: true,
  from_name: 'Jo Supporter',
  message: null,
  amount: '3.00',
  currency: 'AUD',
  email: 'Jo@Example.com',
  is_subscription_payment: true,
  is_first_subscription_payment: true,
  tier_name: 'CastBot Premium',
  kofi_transaction_id: 'tx-1',
  ...over
});

describe('Ko-fi — parseKofiPayload (form body → event)', () => {
  it('parses the data field JSON', () => {
    const r = parseKofiPayload({ data: JSON.stringify(sample()) });
    assert.equal(r.ok, true);
    assert.equal(r.event.tier_name, 'CastBot Premium');
  });

  it('rejects missing/empty/malformed data and non-objects, never throws', () => {
    assert.equal(parseKofiPayload({}).ok, false);
    assert.equal(parseKofiPayload({ data: '' }).ok, false);
    assert.equal(parseKofiPayload({ data: 'not json{' }).ok, false);
    assert.equal(parseKofiPayload({ data: '[1,2]' }).ok, false);
    assert.equal(parseKofiPayload({ data: '"str"' }).ok, false);
    assert.equal(parseKofiPayload(null).ok, false);
  });

  it('rejects an event with no message_id (dedupe key is mandatory)', () => {
    assert.equal(parseKofiPayload({ data: JSON.stringify(sample({ message_id: undefined })) }).ok, false);
  });
});

describe('Ko-fi — verifyKofiToken', () => {
  it('accepts the exact token and rejects everything else', () => {
    assert.equal(verifyKofiToken(sample(), TOKEN), true);
    assert.equal(verifyKofiToken(sample({ verification_token: 'wrong' }), TOKEN), false);
    assert.equal(verifyKofiToken(sample({ verification_token: '' }), TOKEN), false);
    assert.equal(verifyKofiToken({}, TOKEN), false);
  });

  it('fails closed when no expected token is configured', () => {
    assert.equal(verifyKofiToken(sample(), ''), false);
    assert.equal(verifyKofiToken(sample(), undefined), false);
  });

  it('handles length mismatches without throwing (timingSafeEqual guard)', () => {
    assert.equal(verifyKofiToken(sample({ verification_token: TOKEN + 'x' }), TOKEN), false);
  });
});

describe('Ko-fi — classifyKofiEvent', () => {
  it('first payment vs renewal vs everything else', () => {
    assert.equal(classifyKofiEvent(sample()), 'first_subscription');
    assert.equal(classifyKofiEvent(sample({ is_first_subscription_payment: false })), 'renewal');
    assert.equal(classifyKofiEvent(sample({ is_subscription_payment: false, is_first_subscription_payment: false, type: 'Tip' })), 'other');
    assert.equal(classifyKofiEvent(sample({ is_subscription_payment: false, type: 'Shop Order' })), 'other');
    assert.equal(classifyKofiEvent({}), 'other');
  });
});

describe('Ko-fi — computeRenewalValidUntil', () => {
  const PAID = 1_800_000_000_000;

  it('extends from the payment date when current expiry is behind it', () => {
    assert.equal(computeRenewalValidUntil(PAID - 5 * 86400000, PAID), PAID + RENEWAL_EXTEND_MS);
  });

  it('never shrinks a manually-extended future date', () => {
    const generous = PAID + 90 * 86400000;
    assert.equal(computeRenewalValidUntil(generous, PAID), generous);
  });

  it('treats null/undefined current as zero (lapsed guild re-linked)', () => {
    assert.equal(computeRenewalValidUntil(null, PAID), PAID + RENEWAL_EXTEND_MS);
    assert.equal(computeRenewalValidUntil(undefined, PAID), PAID + RENEWAL_EXTEND_MS);
  });
});

describe('Ko-fi — toBillingRecord (audit shape)', () => {
  it('lowercases email, defaults sanely, keeps the dedupe key', () => {
    const rec = toBillingRecord(sample(), 123);
    assert.equal(rec.at, 123);
    assert.equal(rec.message_id, 'aaaa-bbbb-cccc');
    assert.equal(rec.email, 'jo@example.com');
    assert.equal(rec.tier_name, 'CastBot Premium');
    assert.equal(rec.is_first_subscription_payment, true);
  });

  it('missing email/amount become null, is_public defaults true and honors explicit false', () => {
    const rec = toBillingRecord(sample({ email: undefined, amount: undefined, is_public: undefined }), 1);
    assert.equal(rec.email, null);
    assert.equal(rec.amount, null);
    assert.equal(rec.is_public, true);
    assert.equal(toBillingRecord(sample({ is_public: false }), 1).is_public, false);
  });
});
