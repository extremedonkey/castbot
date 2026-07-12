/**
 * Whisper system — pure-logic tests (restart persistence work, 2026-07-12).
 * Logic replicated inline per TestingStandards.md (whisperManager.js imports
 * heavy Discord/storage modules).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated from whisperManager.js preloadWhisperStore prune logic
const WHISPER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
function shouldPrune(whisper, nowMs) {
  return !whisper?.timestamp || nowMs - whisper.timestamp > WHISPER_MAX_AGE_MS;
}

// Replicated from app.js whisper_read_* custom_id parsing:
// whisper_read_{whisperId}_{targetUserId} where whisperId = "{ts}_{rand}"
function parseReadCustomId(customId) {
  const parts = customId.replace('whisper_read_', '').split('_');
  return { whisperId: `${parts[0]}_${parts[1]}`, targetUserId: parts[2] };
}

describe('Whisper store — stale-entry pruning', () => {
  const now = 1780000000000;

  it('prunes whispers older than 30 days', () => {
    assert.equal(shouldPrune({ timestamp: now - 31 * 24 * 60 * 60 * 1000 }, now), true);
  });

  it('keeps fresh whispers', () => {
    assert.equal(shouldPrune({ timestamp: now - 60 * 1000 }, now), false);
    assert.equal(shouldPrune({ timestamp: now - 29 * 24 * 60 * 60 * 1000 }, now), false);
  });

  it('prunes malformed entries with no timestamp', () => {
    assert.equal(shouldPrune({}, now), true);
    assert.equal(shouldPrune(null, now), true);
  });
});

describe('Whisper read button — custom_id round trip', () => {
  it('parses whisperId (contains an underscore) and target from the custom_id', () => {
    const whisperId = '1780000000000_ab12cd34e';
    const parsed = parseReadCustomId(`whisper_read_${whisperId}_391415444084490240`);
    assert.equal(parsed.whisperId, whisperId);
    assert.equal(parsed.targetUserId, '391415444084490240');
  });

  it('custom_id stays under Discord 100-char limit with worst-case snowflakes', () => {
    const customId = `whisper_read_${Date.now()}_abcdefghi_9999999999999999999`;
    assert.ok(customId.length <= 100, `custom_id is ${customId.length} chars`);
  });
});
