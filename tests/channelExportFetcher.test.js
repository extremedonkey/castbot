import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure logic replicated inline (TestingStandards.md convention — avoids importing
// the module's node-fetch/dotenv side-effects). Keep in sync with
// channelExportFetcher.js → computeRateLimitDelay.
function computeRateLimitDelay({ remaining, resetAfter }, bufferMs = 150) {
  if (remaining !== null && remaining <= 0) {
    return Math.ceil((resetAfter || 1) * 1000) + bufferMs;
  }
  return 0;
}

describe('channelExportFetcher — computeRateLimitDelay', () => {
  it('proceeds immediately when budget remains', () => {
    assert.equal(computeRateLimitDelay({ remaining: 4, resetAfter: 5 }), 0);
    assert.equal(computeRateLimitDelay({ remaining: 1, resetAfter: 5 }), 0);
  });

  it('waits for reset (+buffer) when bucket is exhausted', () => {
    // 5s reset → 5000ms + 150ms buffer
    assert.equal(computeRateLimitDelay({ remaining: 0, resetAfter: 5 }), 5150);
  });

  it('rounds fractional reset windows up', () => {
    // 4.5s → ceil(4500)=4500 + 150 buffer
    assert.equal(computeRateLimitDelay({ remaining: 0, resetAfter: 4.5005 }), 4501 + 150);
  });

  it('falls back to a 1s wait when resetAfter is missing but bucket empty', () => {
    assert.equal(computeRateLimitDelay({ remaining: 0, resetAfter: null }), 1000 + 150);
  });

  it('treats unknown remaining (null) as safe-to-proceed', () => {
    assert.equal(computeRateLimitDelay({ remaining: null, resetAfter: null }), 0);
  });

  it('honours a custom buffer', () => {
    assert.equal(computeRateLimitDelay({ remaining: 0, resetAfter: 5 }, 300), 5300);
  });
});

// Keep in sync with channelExportFetcher.js → computePostPacing.
// Governs the WRITE path: a 429 means "retry the same POST"; an exhausted bucket
// means "space out the next POST".
function computePostPacing({ status, remaining, resetAfter, retryAfter }, bufferMs = 200) {
  if (status === 429) {
    return { retry: true, waitMs: Math.ceil((retryAfter || resetAfter || 1) * 1000) + bufferMs };
  }
  if (remaining !== null && remaining <= 0) {
    return { retry: false, waitMs: Math.ceil((resetAfter || 1) * 1000) + bufferMs };
  }
  return { retry: false, waitMs: 0 };
}

describe('channelExportFetcher — computePostPacing', () => {
  it('fires immediately when budget remains', () => {
    assert.deepEqual(computePostPacing({ status: 200, remaining: 3, resetAfter: 5, retryAfter: null }), { retry: false, waitMs: 0 });
  });

  it('spaces out the next post when the bucket is exhausted (no retry)', () => {
    // matches the 0.3s retry_after seen in the live 429 storm: here via reset window
    assert.deepEqual(computePostPacing({ status: 200, remaining: 0, resetAfter: 5, retryAfter: null }), { retry: false, waitMs: 5200 });
  });

  it('retries the SAME post on 429 using retry_after', () => {
    // Discord returned retry_after: 0.3 → 300ms + 200 buffer
    assert.deepEqual(computePostPacing({ status: 429, remaining: 0, resetAfter: null, retryAfter: 0.3 }), { retry: true, waitMs: 500 });
  });

  it('on 429 falls back to resetAfter then 1s when retry_after missing', () => {
    assert.deepEqual(computePostPacing({ status: 429, remaining: 0, resetAfter: 0.445, retryAfter: null }), { retry: true, waitMs: 645 });
    assert.deepEqual(computePostPacing({ status: 429, remaining: 0, resetAfter: null, retryAfter: null }), { retry: true, waitMs: 1200 });
  });

  it('does not retry on non-429 errors like 413 (too large)', () => {
    assert.deepEqual(computePostPacing({ status: 413, remaining: 4, resetAfter: 5, retryAfter: null }), { retry: false, waitMs: 0 });
  });
});
