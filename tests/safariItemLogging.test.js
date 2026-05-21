import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Pure logic replicated from safariManager.js addItemToInventory logging block ---

// Mirrors: const logCtx = logContext || (existingPlayerData && typeof ... === 'object' ? existingPlayerData : {})
function resolveLogCtx(logContext, existingPlayerData) {
  return logContext || (existingPlayerData && typeof existingPlayerData === 'object' ? existingPlayerData : {});
}

// Mirrors the name/source resolution used for the pickup log.
function resolvePickupFields(logCtx) {
  const username = logCtx.username || 'Unknown';
  return {
    username,
    displayName: logCtx.displayName || username,
    source: logCtx.source || 'manual',
    channelId: logCtx.channelId || null
  };
}

// Mirrors executeGiveItem's logContext derivation from a raw Discord interaction.
function deriveGiveItemContext(interaction) {
  return {
    username: interaction?.member?.user?.username || interaction?.user?.username || 'Unknown',
    displayName: interaction?.member?.nick || interaction?.member?.user?.global_name || interaction?.member?.user?.username || interaction?.user?.username || 'Unknown',
    channelId: interaction?.channel_id || null,
    source: 'action_give'
  };
}

describe('addItemToInventory — logging context resolution', () => {
  it('prefers explicit logContext over existingPlayerData', () => {
    const ctx = resolveLogCtx({ username: 'alice' }, { username: 'bob' });
    assert.equal(ctx.username, 'alice');
  });

  it('falls back to bolted-on fields on existingPlayerData (store path)', () => {
    const ctx = resolveLogCtx(null, { username: 'bob', channelId: '123' });
    assert.equal(ctx.username, 'bob');
    assert.equal(ctx.channelId, '123');
  });

  it('yields empty object when neither is provided (context-less caller → Unknown)', () => {
    const fields = resolvePickupFields(resolveLogCtx(null, null));
    assert.equal(fields.username, 'Unknown');
    assert.equal(fields.displayName, 'Unknown');
    assert.equal(fields.source, 'manual');
    assert.equal(fields.channelId, null);
  });

  it('does not treat null existingPlayerData as a context object', () => {
    assert.deepEqual(resolveLogCtx(null, null), {});
  });

  it('displayName falls back to username when only username present', () => {
    const fields = resolvePickupFields({ username: 'carol' });
    assert.equal(fields.displayName, 'carol');
  });
});

describe('executeGiveItem — context derived from interaction (fixes Unknown logs)', () => {
  it('resolves nick > global_name > username for displayName', () => {
    const ctx = deriveGiveItemContext({
      member: { nick: 'Nicky', user: { username: 'realname', global_name: 'Global' } },
      channel_id: 'chan1'
    });
    assert.equal(ctx.username, 'realname');
    assert.equal(ctx.displayName, 'Nicky');
    assert.equal(ctx.channelId, 'chan1');
    assert.equal(ctx.source, 'action_give');
  });

  it('falls back to global_name when no nick', () => {
    const ctx = deriveGiveItemContext({ member: { user: { username: 'u', global_name: 'G' } } });
    assert.equal(ctx.displayName, 'G');
    assert.equal(ctx.channelId, null);
  });

  it('falls back to username when no nick or global_name', () => {
    const ctx = deriveGiveItemContext({ member: { user: { username: 'u' } } });
    assert.equal(ctx.displayName, 'u');
  });

  it('returns Unknown (not a crash) when interaction is empty', () => {
    const ctx = deriveGiveItemContext({});
    assert.equal(ctx.username, 'Unknown');
    assert.equal(ctx.displayName, 'Unknown');
  });
});

describe('skipPickupLog — buyItem avoids double-logging', () => {
  // The real code wraps the pickup log in `if (!logCtx.skipPickupLog)`.
  function shouldLogPickup(logCtx) {
    return !logCtx.skipPickupLog;
  }

  it('skips the generic pickup log when caller logs SAFARI_PURCHASE itself', () => {
    assert.equal(shouldLogPickup({ skipPickupLog: true }), false);
  });

  it('logs the pickup normally for ordinary callers', () => {
    assert.equal(shouldLogPickup({ username: 'alice' }), true);
    assert.equal(shouldLogPickup({}), true);
  });
});
