// Regression guard for the map-cell "emoji edit → This interaction failed" bug.
//
// Root cause: deriveChannelName puts the cell EMOJI at the front of the Discord channel
// name. So any emoji change always produces a different name → the entity_modal_submit
// handler always calls channel.setName → Discord rate-limits renames to 2/10min →
// discord.js blocks for minutes → the (previously un-deferred) interaction blew the 3s
// ack window. The handler now defers first and fires the rename without awaiting; this
// test documents the property that makes emoji edits special so it isn't "optimized" away.
//
// Pure logic replicated inline per TestingStandards.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicated from mapExplorer.deriveChannelName ──
function deriveChannelName(coord, title, emoji) {
  const effectiveEmoji = emoji ?? '📍';
  const prefix = effectiveEmoji ? `${effectiveEmoji}${coord.toLowerCase()}` : coord.toLowerCase();
  if (!title) return prefix;
  const cleanTitle = title
    .replace(/^[\p{Emoji_Presentation}\p{Emoji}️]+\s*/gu, '')
    .replace(new RegExp(`^${coord}\\s*`, 'i'), '')
    .replace(/^\|\s*/, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/^-+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
  return cleanTitle ? `${prefix}-${cleanTitle}` : prefix;
}

describe('deriveChannelName — emoji is the name prefix (rename trigger)', () => {
  it('changing the emoji changes the derived name (always triggers setName)', () => {
    const before = deriveChannelName('A1', 'Kansas', '🌾');
    const after = deriveChannelName('A1', 'Kansas', '🏔️');
    assert.notEqual(before, after, 'an emoji change must alter the name → rename fires');
    assert.equal(before, '🌾a1-kansas');
    assert.equal(after, '🏔️a1-kansas');
  });

  it('same title with no field change yields the same name (rename skipped)', () => {
    assert.equal(
      deriveChannelName('A1', 'Kansas', '🌾'),
      deriveChannelName('A1', 'Kansas', '🌾')
    );
  });

  it('empty emoji drops the prefix; falls back to 📍 only when undefined/null', () => {
    assert.equal(deriveChannelName('B2', '', ''), 'b2');
    assert.equal(deriveChannelName('B2', '', undefined), '📍b2');
    assert.equal(deriveChannelName('B2', '', null), '📍b2');
  });
});
