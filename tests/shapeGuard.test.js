/**
 * SHAPE-GUARD — content-only responses onto Components V2 messages
 *
 * Regression cover for the 2026-08-09 season_app_ranking / season_marooning failure:
 * both are `deferred: true, updateMessage: true` handlers whose permission-denied branch
 * returned `{ content, ephemeral }`. PATCHing @original with bare content drops
 * IS_COMPONENTS_V2, so Discord replied 50035 MESSAGE_CANNOT_REMOVE_COMPONENTS_V2_FLAG and
 * the message never updated. The guard existed on the immediate UPDATE_MESSAGE path but
 * not on the deferred webhook PATCH path.
 *
 * See scripts/scan-interaction-shapes.js + tests/interactionResponseShape.test.js (ratchet).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wrapBareContentForV2 } from '../buttonHandlerFactory.js';

const V2 = 1 << 15;
const EPHEMERAL_V2_MESSAGE = { flags: V2 | (1 << 6) };
const LEGACY_MESSAGE = { flags: 0 };

describe('SHAPE-GUARD — wrapBareContentForV2', () => {
  it('wraps bare content into a Container when the parent is Components V2', () => {
    const data = { content: '❌ You need Manage Roles or Manage Channels permissions to access Casting.', ephemeral: true };
    const wrapped = wrapBareContentForV2(data, EPHEMERAL_V2_MESSAGE, 'webhook PATCH');

    assert.equal(wrapped, true);
    assert.equal(data.content, undefined, 'content must be removed — V2 forbids it');
    assert.deepEqual(data.components, [{
      type: 17,
      components: [{ type: 10, content: '❌ You need Manage Roles or Manage Channels permissions to access Casting.' }]
    }]);
    assert.equal(data.ephemeral, true, 'ephemeral must survive the wrap');
  });

  it('leaves non-V2 parents alone (bare content is legal there)', () => {
    const data = { content: 'plain text' };
    assert.equal(wrapBareContentForV2(data, LEGACY_MESSAGE, 'webhook PATCH'), false);
    assert.equal(data.content, 'plain text');
    assert.equal(data.components, undefined);
  });

  it('leaves a proper V2 container response untouched', () => {
    const container = [{ type: 17, components: [{ type: 10, content: 'real UI' }] }];
    const data = { components: container };
    assert.equal(wrapBareContentForV2(data, EPHEMERAL_V2_MESSAGE, 'webhook PATCH'), false);
    assert.equal(data.components, container);
  });

  it('does not clobber a response that has both content and components', () => {
    const data = { content: 'hi', components: [{ type: 17, components: [] }] };
    assert.equal(wrapBareContentForV2(data, EPHEMERAL_V2_MESSAGE, 'webhook PATCH'), false);
    assert.equal(data.content, 'hi');
  });

  it('leaves embed-bearing responses alone', () => {
    const data = { content: 'hi', embeds: [{ title: 'x' }] };
    assert.equal(wrapBareContentForV2(data, EPHEMERAL_V2_MESSAGE, 'webhook PATCH'), false);
    assert.equal(data.content, 'hi');
  });

  it('tolerates a missing/undefined parent message (no flags to read)', () => {
    const data = { content: 'hi' };
    assert.equal(wrapBareContentForV2(data, null, 'webhook PATCH'), false);
    assert.equal(wrapBareContentForV2(data, undefined, 'webhook PATCH'), false);
    assert.equal(data.content, 'hi');
  });

  it('ignores an empty-string content (nothing meaningful to wrap)', () => {
    const data = { content: '' };
    assert.equal(wrapBareContentForV2(data, EPHEMERAL_V2_MESSAGE, 'webhook PATCH'), false);
  });

  it('names the handler, so the warning is actionable', () => {
    // Without this it read "some handler somewhere returned the wrong shape" — you cannot grep
    // for a handler the message never identifies (Reece, 2026-08-09).
    const data = { content: 'hi' };
    const warned = [];
    const orig = console.warn;
    console.warn = (m) => warned.push(m);
    try { wrapBareContentForV2(data, EPHEMERAL_V2_MESSAGE, 'webhook PATCH', 'season_marooning'); }
    finally { console.warn = orig; }
    assert.match(warned[0], /season_marooning/);
  });
});

// ── The two-line rule that decides whether the guard runs at all (buttonHandlerFactory deferred path) ──
// @original means different things depending on which deferred ACK was sent, and the guard inspects
// `context.message` (the card the button sits on) which is V2 in BOTH cases. Guarding unconditionally
// fired on handlers that were never broken and paged prod once a minute off a live Safari game.
const shouldGuardDeferred = (config) => config.updateMessage === false ? 'followup-no-guard' : (config.updateMessage ? 'guard' : 'no-guard');

describe('SHAPE-GUARD — only guards the path where @original is the V2 parent', () => {
  it('updateMessage: true → DEFERRED_UPDATE_MESSAGE, @original IS the V2 parent → guard', () => {
    assert.equal(shouldGuardDeferred({ deferred: true, updateMessage: true }), 'guard');
  });

  it('updateMessage unset → deferred NEW message, @original is a fresh non-V2 ephemeral → do NOT guard', () => {
    // whisper_read / apply: `deferred: true, ephemeral: true`, no updateMessage. Bare content was
    // always legal for them; the guard wrapped needlessly and warned about a working handler.
    assert.equal(shouldGuardDeferred({ deferred: true, ephemeral: true }), 'no-guard');
  });

  it('updateMessage: false → follow-up POST, no inherited flag → no guard (unchanged)', () => {
    assert.equal(shouldGuardDeferred({ deferred: true, updateMessage: false }), 'followup-no-guard');
  });
});
