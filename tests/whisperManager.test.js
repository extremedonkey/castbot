/**
 * Whisper system — pure-logic tests (restart persistence work, 2026-07-12).
 * Logic replicated inline per TestingStandards.md (whisperManager.js imports
 * heavy Discord/storage modules).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated from whisperManager.js shouldPruneWhisper (RaP 0893: read whispers
// persist for a 24h re-read window instead of being deleted on read)
const WHISPER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const READ_RETENTION_MS = 24 * 60 * 60 * 1000;
function shouldPrune(whisper, nowMs) {
  if (!whisper?.timestamp) return true;
  if (whisper.readAt) return nowMs - whisper.readAt > READ_RETENTION_MS;
  return nowMs - whisper.timestamp > WHISPER_MAX_AGE_MS;
}

// Replicated from whisperManager.js claimWhisper (RaP 0893: sync check+mark —
// closes the double-click race that produced duplicate read receipts)
function claimWhisper(store, whisperId, nowMs) {
  const data = store.get(whisperId);
  if (!data) return { status: 'missing' };
  if (data.readAt) return { status: 'already', data };
  data.readAt = nowMs;
  store.set(whisperId, data);
  return { status: 'unread', data };
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

  it('keeps read whispers inside the 24h re-read window', () => {
    assert.equal(shouldPrune({ timestamp: now - 60000, readAt: now - 23 * 60 * 60 * 1000 }, now), false);
  });

  it('prunes read whispers past the 24h retention', () => {
    assert.equal(shouldPrune({ timestamp: now - 60000, readAt: now - 25 * 60 * 60 * 1000 }, now), true);
  });

  it('a FRESH but read whisper still prunes on readAt, not timestamp', () => {
    // read retention governs read whispers even when the whisper itself is recent
    assert.equal(shouldPrune({ timestamp: now - 2 * 60 * 60 * 1000, readAt: now - 25 * 60 * 60 * 1000 }, now), true);
  });
});

describe('Whisper read — claim idempotency (RaP 0893)', () => {
  const now = 1780000000000;
  const freshStore = () => {
    const m = new Map();
    m.set('w_1', { senderId: 's', targetUserId: 't', message: 'hi', timestamp: now - 1000 });
    return m;
  };

  it('first claim marks readAt and reports unread', () => {
    const store = freshStore();
    const claim = claimWhisper(store, 'w_1', now);
    assert.equal(claim.status, 'unread');
    assert.equal(store.get('w_1').readAt, now);
  });

  it('second claim re-delivers the same data without re-claiming (double-click)', () => {
    const store = freshStore();
    claimWhisper(store, 'w_1', now);
    const second = claimWhisper(store, 'w_1', now + 500);
    assert.equal(second.status, 'already');
    assert.equal(second.data.message, 'hi');
    assert.equal(store.get('w_1').readAt, now, 'readAt must not be overwritten by re-clicks');
  });

  it('N rapid claims produce exactly ONE unread (one receipt, one notification delete)', () => {
    // Models the prod 4-clicks-in-2.2s burst: only the first click may trigger side effects
    const store = freshStore();
    const results = [1, 2, 3, 4].map(i => claimWhisper(store, 'w_1', now + i).status);
    assert.deepEqual(results.filter(s => s === 'unread').length, 1);
    assert.deepEqual(results.filter(s => s === 'already').length, 3);
  });

  it('missing whisper reports missing (pruned or lost)', () => {
    const store = freshStore();
    assert.equal(claimWhisper(store, 'nope', now).status, 'missing');
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
