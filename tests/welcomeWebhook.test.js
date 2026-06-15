// Tests for the APPLICATION_AUTHORIZED welcome webhook (install → DM installing user).
// Pure logic is replicated inline per TestingStandards.md (avoids importing the heavy
// discordMessenger.js + Discord.js / fetch stack).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicated from app.js /webhooks route: decide what to do with a payload ──
// Returns one of: 'ping' | 'authorized' | 'ignore'
function routeWebhookPayload(payload) {
  if (payload.type === 0) return 'ping';        // verification handshake → 204
  if (payload.type === 1) {                      // event
    if (payload.event?.type === 'APPLICATION_AUTHORIZED') return 'authorized';
    return 'ignore';                             // some other subscribed event
  }
  return 'ignore';
}

// ── Replicated from DiscordMessenger.handleApplicationAuthorized: who gets a DM ──
// Returns { action: 'dm'|'skip', userId?, reason? }
function decideWelcome(data = {}) {
  const { integration_type, user } = data;
  if (integration_type !== 0) return { action: 'skip', reason: 'user_install' };
  if (!user?.id) return { action: 'skip', reason: 'no_user' };
  return { action: 'dm', userId: user.id };
}

describe('Welcome webhook — payload routing', () => {
  it('treats type 0 as the PING handshake', () => {
    assert.equal(routeWebhookPayload({ type: 0 }), 'ping');
  });

  it('routes APPLICATION_AUTHORIZED events to the handler', () => {
    const payload = { type: 1, event: { type: 'APPLICATION_AUTHORIZED', data: {} } };
    assert.equal(routeWebhookPayload(payload), 'authorized');
  });

  it('ignores other subscribed event types', () => {
    assert.equal(routeWebhookPayload({ type: 1, event: { type: 'ENTITLEMENT_CREATE' } }), 'ignore');
  });

  it('ignores unknown top-level types', () => {
    assert.equal(routeWebhookPayload({ type: 99 }), 'ignore');
  });

  it('does not throw on a malformed event object', () => {
    assert.equal(routeWebhookPayload({ type: 1 }), 'ignore');
  });
});

describe('Welcome webhook — who receives the DM', () => {
  it('DMs the installing user for a guild install (integration_type 0)', () => {
    const r = decideWelcome({ integration_type: 0, user: { id: '12345', username: 'reece' } });
    assert.deepEqual(r, { action: 'dm', userId: '12345' });
  });

  it('skips user installs (integration_type 1)', () => {
    const r = decideWelcome({ integration_type: 1, user: { id: '12345' } });
    assert.equal(r.action, 'skip');
    assert.equal(r.reason, 'user_install');
  });

  it('skips when no installing user is present', () => {
    const r = decideWelcome({ integration_type: 0 });
    assert.equal(r.action, 'skip');
    assert.equal(r.reason, 'no_user');
  });

  it('skips empty payloads without throwing', () => {
    assert.equal(decideWelcome().action, 'skip');
    assert.equal(decideWelcome({}).action, 'skip');
  });
});
