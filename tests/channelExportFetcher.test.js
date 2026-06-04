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
