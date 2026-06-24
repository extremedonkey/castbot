import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Inline replicas of utils/emojiUtils.js logic (avoids importing the storage chain).
// validateComponentEmoji: custom emoji (has id) must exist in `cache`, else fall back.
function makeValidate(cacheIds) {
  const cache = new Set(cacheIds);
  return function validateComponentEmoji(emoji, fallback = '📦') {
    if (!emoji) return { name: fallback };
    if (!emoji.id) return emoji;
    return cache.has(emoji.id) ? emoji : { name: fallback };
  };
}
// Minimal resolveEmoji for the name-as-raw-string path
function resolveEmoji(str, fallback = '📦') {
  if (!str || typeof str !== 'string') return { name: fallback };
  const m = str.trim().match(/^<(a?):(\w+):(\d+)>$/);
  if (m) return { name: m[2], id: m[3], ...(m[1] === 'a' ? { animated: true } : {}) };
  if (str.startsWith('<')) return { name: fallback };
  if (/^:\w+:$/.test(str)) return { name: fallback }; // unmapped shortcode
  return { name: str };
}
function makeSanitizer(validate) {
  function safe(emoji, fallback = '📦') {
    if (!emoji || typeof emoji !== 'object') return emoji;
    if (!emoji.id && typeof emoji.name === 'string' && (emoji.name.includes('<') || /^:\w+:$/.test(emoji.name))) {
      return validate(resolveEmoji(emoji.name, fallback), fallback);
    }
    return validate(emoji, fallback);
  }
  function sanitize(node, fallback = '📦') {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) { for (const c of node) sanitize(c, fallback); return node; }
    if (node.emoji && typeof node.emoji === 'object') node.emoji = safe(node.emoji, fallback);
    if (Array.isArray(node.options)) for (const o of node.options) if (o?.emoji && typeof o.emoji === 'object') o.emoji = safe(o.emoji, fallback);
    if (Array.isArray(node.components)) sanitize(node.components, fallback);
    if (node.accessory) sanitize(node.accessory, fallback);
    if (node.component) sanitize(node.component, fallback);
    return node;
  }
  return sanitize;
}

describe('sanitizeComponentEmojis', () => {
  const sanitize = makeSanitizer(makeValidate(['111'])); // only emoji id 111 is accessible

  it('keeps unicode and cached custom emoji, falls back deleted/foreign custom', () => {
    const opts = [
      { emoji: { name: '🍎' } },
      { emoji: { name: 'sword', id: '111' } },
      { emoji: { name: 'ghost', id: '999' } }
    ];
    sanitize([{ type: 1, components: [{ type: 3, options: opts }] }]);
    assert.deepEqual(opts[0].emoji, { name: '🍎' });
    assert.deepEqual(opts[1].emoji, { name: 'sword', id: '111' });
    assert.deepEqual(opts[2].emoji, { name: '📦' });
  });

  it('normalises AND cache-validates a raw custom string crammed into name', () => {
    const node = { emoji: { name: '<:foo:999>' } }; // 999 not cached → fallback
    sanitize(node);
    assert.deepEqual(node.emoji, { name: '📦' });
    const ok = { emoji: { name: '<:bar:111>' } }; // 111 cached → resolved + kept
    sanitize(ok);
    assert.deepEqual(ok.emoji, { name: 'bar', id: '111' });
  });

  it('falls back an unmapped :shortcode: in name', () => {
    const node = { emoji: { name: ':rocket:' } };
    sanitize(node);
    assert.deepEqual(node.emoji, { name: '📦' });
  });

  it('recurses into containers, action rows, section accessories, and modal labels', () => {
    const tree = [{
      type: 17, components: [
        { type: 1, components: [{ type: 2, emoji: { name: 'x', id: '999' } }] },                 // button in row
        { type: 9, components: [{ type: 10, content: 't' }], accessory: { type: 2, emoji: { name: 'y', id: '999' } } }, // section accessory
        { type: 18, component: { type: 2, emoji: { name: 'z', id: '999' } } }                     // label child
      ]
    }];
    sanitize(tree);
    assert.deepEqual(tree[0].components[0].components[0].emoji, { name: '📦' });
    assert.deepEqual(tree[0].components[1].accessory.emoji, { name: '📦' });
    assert.deepEqual(tree[0].components[2].component.emoji, { name: '📦' });
  });

  it('is a no-op on null/empty and components without emoji', () => {
    assert.doesNotThrow(() => sanitize(null));
    const clean = [{ type: 10, content: 'just text' }];
    sanitize(clean);
    assert.deepEqual(clean, [{ type: 10, content: 'just text' }]);
  });
});
