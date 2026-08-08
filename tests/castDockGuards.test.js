/**
 * CastDock privacy guards — the pure decisions behind the 2026-08-08 EpochORG S14 leak,
 * where a player self-activated CastDock in a shared map channel and their menu sat
 * publicly readable for four days.
 *
 * Covers: the setup screen's audience verdict, and the "someone else's sticky" refusal
 * that stops a bystander's own menu being published into a channel they don't own.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessCastDockAudience, isForeignCastDockSticky } from '../castDock.js';

describe('CastDock — assessCastDockAudience', () => {
  it('zero other players is the subs-channel case CastDock is designed for', () => {
    assert.deepEqual(assessCastDockAudience(0), { level: 'private', otherPlayerCount: 0 });
  });

  it('any other player at all makes it shared — one witness is still a leak', () => {
    assert.deepEqual(assessCastDockAudience(1), { level: 'shared', otherPlayerCount: 1 });
    assert.deepEqual(assessCastDockAudience(14), { level: 'shared', otherPlayerCount: 14 });
  });

  it('an uncountable audience degrades to unknown, never to a false all-clear', () => {
    assert.deepEqual(assessCastDockAudience(null), { level: 'unknown' });
    assert.deepEqual(assessCastDockAudience(undefined), { level: 'unknown' });
  });
});

describe('CastDock — isForeignCastDockSticky', () => {
  const entry = { enabled: true, lastMessageId: '555', targetUserId: '885136176883839026' };

  it('blocks a bystander clicking a self-scoped control on the live sticky', () => {
    assert.equal(isForeignCastDockSticky({ entry, messageId: '555', clickerUserId: '1187627604312862721' }), true);
  });

  it('allows the dock owner — it is their own dock in their own channel', () => {
    assert.equal(isForeignCastDockSticky({ entry, messageId: '555', clickerUserId: '885136176883839026' }), false);
  });

  it('compares ids as strings so a numeric id is not treated as a stranger', () => {
    assert.equal(isForeignCastDockSticky({ entry: { ...entry, targetUserId: 555111 }, messageId: '555', clickerUserId: '555111' }), false);
  });

  it('ignores clicks on any message that is not the current sticky', () => {
    assert.equal(isForeignCastDockSticky({ entry, messageId: '999', clickerUserId: '1187627604312862721' }), false);
    assert.equal(isForeignCastDockSticky({ entry, messageId: undefined, clickerUserId: '1187627604312862721' }), false);
  });

  it('ignores a disabled, missing, or never-posted dock', () => {
    assert.equal(isForeignCastDockSticky({ entry: { ...entry, enabled: false }, messageId: '555', clickerUserId: '1' }), false);
    assert.equal(isForeignCastDockSticky({ entry: undefined, messageId: '555', clickerUserId: '1' }), false);
    assert.equal(isForeignCastDockSticky({ entry: { ...entry, lastMessageId: null }, messageId: '555', clickerUserId: '1' }), false);
  });
});
