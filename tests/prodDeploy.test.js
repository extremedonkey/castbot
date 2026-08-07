/**
 * Tests for the Deploy Prod button's pure logic (src/monitoring/prodDeploy.js):
 * SHA-pinned confirm custom_ids (encode/parse round-trip, expiry, forgery),
 * deploy-script step-banner parsing, commit-list summarizing, lock freshness,
 * and the confirm card's Moai-gate surfacing.
 *
 * prodDeploy.js has no top-level side effects, so we import the real module.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeConfirmId,
  parseConfirmId,
  parseDeployStep,
  summarizeCommits,
  isLockFresh,
  buildConfirmCard,
  buildResultCard,
  CONFIRM_TTL_MS,
  MOAI_GATE_COMMITS
} from '../src/monitoring/prodDeploy.js';

const SHA = 'ebf0bebb1234567890abcdef1234567890abcdef';

describe('Deploy Prod — confirm custom_id (SHA pin + expiry)', () => {
  it('round-trips sha and issue time', () => {
    const now = 1754650000000;
    const id = encodeConfirmId(SHA, now);
    const parsed = parseConfirmId(id, now + 1000);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.sha, SHA);
    assert.equal(parsed.issuedAt, now);
  });

  it('stays inside Discord\'s 100-char custom_id cap', () => {
    assert.ok(encodeConfirmId(SHA, Date.now()).length <= 100);
  });

  it('expires after the TTL', () => {
    const now = 1754650000000;
    const id = encodeConfirmId(SHA, now);
    const parsed = parseConfirmId(id, now + CONFIRM_TTL_MS + 1);
    assert.equal(parsed.valid, false);
    assert.equal(parsed.reason, 'expired');
    assert.equal(parsed.sha, SHA); // still reported, for the "re-check" message
  });

  it('is valid right up to the TTL boundary', () => {
    const now = 1754650000000;
    const id = encodeConfirmId(SHA, now);
    assert.equal(parseConfirmId(id, now + CONFIRM_TTL_MS).valid, true);
  });

  it('rejects malformed and forged ids', () => {
    for (const bad of [
      'deploy_prod_confirm_',
      'deploy_prod_confirm_nothex_123',
      'deploy_prod_confirm_ZZZZZZZ_abc',        // uppercase = not a sha
      `deploy_prod_confirm_${SHA}`,             // missing timestamp
      `deploy_prod_confirm_${SHA}_`,            // empty timestamp
      'restart_prod_confirm',                    // different button entirely
      '', null, undefined
    ]) {
      assert.equal(parseConfirmId(bad, Date.now()).valid, false, `should reject: ${bad}`);
    }
  });
});

describe('Deploy Prod — step banner parsing', () => {
  it('parses numbered and lettered step banners', () => {
    assert.deepEqual(parseDeployStep('🔴 Step 3: Update Code'), { step: '3', title: 'Update Code' });
    assert.deepEqual(parseDeployStep('🟡 Step 3b: Restore Runtime Data Files'), { step: '3b', title: 'Restore Runtime Data Files' });
    assert.deepEqual(parseDeployStep('🟢 Step 7: Verify Status'), { step: '7', title: 'Verify Status' });
  });

  it('ignores non-banner lines', () => {
    assert.equal(parseDeployStep('✅ Deployment completed successfully!'), null);
    assert.equal(parseDeployStep('============'), null);
    assert.equal(parseDeployStep(''), null);
    assert.equal(parseDeployStep(null), null);
  });
});

describe('Deploy Prod — commit summary', () => {
  const oneline = [
    'ccc3333 Newest commit',
    'bbb2222 Middle commit',
    'aaa1111 Oldest commit'
  ].join('\n');

  it('renders oldest-first as a changelog', () => {
    const out = summarizeCommits(oneline);
    assert.ok(out.indexOf('Oldest commit') < out.indexOf('Newest commit'));
    assert.ok(out.includes('`aaa1111`'));
  });

  it('caps the list and counts the overflow', () => {
    const many = Array.from({ length: 20 }, (_, i) => `abc${String(i).padStart(4, '0')} Commit number ${i}`).join('\n');
    const out = summarizeCommits(many, 12);
    assert.equal(out.split('\n').filter(l => l.startsWith('`')).length, 12);
    assert.ok(out.includes('…and 8 more'));
  });

  it('handles empty input', () => {
    assert.equal(summarizeCommits(''), '');
  });
});

describe('Deploy Prod — lock freshness', () => {
  it('a recent lock means a deploy is running', () => {
    assert.equal(isLockFresh(1000000, 1000000 + 5 * 60 * 1000), true);
  });
  it('an old lock is a crash leftover', () => {
    assert.equal(isLockFresh(1000000, 1000000 + 11 * 60 * 1000), false);
  });
});

describe('Deploy Prod — confirm card', () => {
  const base = {
    prodSha: '660fca05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    mainSha: SHA,
    gap: 4,
    commitSummary: '`aaa1111` Oldest commit',
    shortstat: '8 files changed, 315 insertions(+), 59 deletions(-)',
    issuedAtMs: 1754650000000
  };

  const flatten = (card) => JSON.stringify(card);

  it('pins the confirm button to the main sha', () => {
    const card = buildConfirmCard(base);
    const confirmBtn = card.components.at(-1).components[0];
    assert.ok(confirmBtn.custom_id.startsWith(`deploy_prod_confirm_${SHA}_`));
    assert.equal(confirmBtn.style, 4);
  });

  it('surfaces the Moai gate only above the threshold', () => {
    assert.ok(!flatten(buildConfirmCard(base)).includes('Moai gate'));
    assert.ok(flatten(buildConfirmCard({ ...base, gap: MOAI_GATE_COMMITS + 1 })).includes('Moai gate'));
  });
});

describe('Deploy Prod — result card', () => {
  const base = { mainSha: SHA, gap: 4, elapsedMs: 151000, healthCode: 200, outputTail: '', userId: '391415444084490240' };

  it('success card is green and mentions the health check', () => {
    const card = buildResultCard({ ...base, ok: true });
    assert.equal(card.accent_color, 0x2ecc71);
    assert.ok(JSON.stringify(card).includes('HTTP 200'));
  });

  it('failure card is red and carries the output tail + rollback pointer', () => {
    const card = buildResultCard({ ...base, ok: false, outputTail: 'x'.repeat(2000) + 'THE-END' });
    assert.equal(card.accent_color, 0xe74c3c);
    const s = JSON.stringify(card);
    assert.ok(s.includes('THE-END'));           // tail kept
    assert.ok(!s.includes('x'.repeat(1300)));   // but capped
    assert.ok(s.includes('castbot-backup-'));   // rollback pointer
  });
});
