import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Regression guard for: "adding a store to a channel/anchor button fails with COMPONENT_INVALID_EMOJI".
// createAnchorMessageComponents() builds store buttons via createSafeEmoji(store.emoji), which
// validates emoji FORMAT but not render-time reachability. A store carrying a custom emoji from
// another guild (or a deleted one) produces a { name, id } the bot can't use, and Discord rejects
// the whole anchor. The builder now runs its finished tree through sanitizeComponentEmojis so the
// bad emoji falls back to 📦 on EVERY send path (PATCH via DiscordRequest AND channel.send in
// repostAnchorMessage). This test replicates the sanitizer + the exact anchor shape it must fix.

function makeValidate(cacheIds) {
  const cache = new Set(cacheIds);
  return function validateComponentEmoji(emoji, fallback = '📦') {
    if (!emoji) return { name: fallback };
    if (!emoji.id) return emoji;            // unicode always safe
    return cache.has(emoji.id) ? emoji : { name: fallback }; // custom must be reachable
  };
}
function makeSanitizer(validate) {
  const safe = (e, fb = '📦') => (!e || typeof e !== 'object') ? e : validate(e, fb);
  function sanitize(node, fb = '📦') {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) { for (const c of node) sanitize(c, fb); return node; }
    if (node.emoji && typeof node.emoji === 'object') node.emoji = safe(node.emoji, fb);
    if (Array.isArray(node.components)) sanitize(node.components, fb);
    return node;
  }
  return sanitize;
}

// Mirrors createAnchorMessageComponents output shape: Container(17) → ActionRow(1) → store buttons(2).
function buildAnchorTree(storeButtons) {
  return [{
    type: 17,
    components: [
      { type: 10, content: '# 🏝️ Location C3' },
      { type: 14 },
      { type: 1, components: storeButtons }
    ]
  }];
}

describe('Anchor store buttons — emoji safety', () => {
  const sanitize = makeSanitizer(makeValidate(['111'])); // only custom emoji id 111 is reachable

  it('falls a foreign/deleted store emoji back to 📦 instead of failing the anchor', () => {
    const tree = buildAnchorTree([
      { type: 2, custom_id: 'map_coord_store_C3_s1', label: 'Blacksmith', style: 2, emoji: { name: 'anvil', id: '999' } }
    ]);
    sanitize(tree);
    assert.deepEqual(tree[0].components[2].components[0].emoji, { name: '📦' });
  });

  it('keeps a reachable custom store emoji and plain unicode store emoji untouched', () => {
    const tree = buildAnchorTree([
      { type: 2, custom_id: 'map_coord_store_C3_s1', label: 'Armory', style: 2, emoji: { name: 'shield', id: '111' } },
      { type: 2, custom_id: 'map_coord_store_C3_s2', label: 'Market', style: 2, emoji: { name: '🛒' } }
    ]);
    sanitize(tree);
    const buttons = tree[0].components[2].components;
    assert.deepEqual(buttons[0].emoji, { name: 'shield', id: '111' });
    assert.deepEqual(buttons[1].emoji, { name: '🛒' });
  });

  it('leaves a button with no emoji (createSafeEmoji returned undefined) alone', () => {
    const tree = buildAnchorTree([
      { type: 2, custom_id: 'map_coord_store_C3_s1', label: 'Stall', style: 2, emoji: undefined }
    ]);
    assert.doesNotThrow(() => sanitize(tree));
    assert.equal(tree[0].components[2].components[0].emoji, undefined);
  });
});
