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
    // Strip U+FE0F only when it follows a codepoint ≥ U+1F000 (Discord rejects those)
    if (!emoji.id && typeof emoji.name === 'string' && emoji.name.includes('️')) {
      const cps = [...emoji.name];
      const cleaned = cps.filter((c, i) => !(c === '️' && i > 0 && cps[i - 1].codePointAt(0) >= 0x1F000)).join('');
      if (cleaned !== emoji.name) emoji = { ...emoji, name: cleaned };
    }
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

  it('strips U+FE0F after emoji-presentation codepoints (≥U+1F000), keeps it after BMP symbols', () => {
    // Discord 400s 🎣+FE0F (COMPONENT_INVALID_EMOJI) but accepts ❤+FE0F / ☀+FE0F — verified live 2026-07-19
    const node = { type: 1, components: [
      { type: 2, emoji: { name: '\u{1F3A3}️' } }, // 🎣️ → 🎣
      { type: 2, emoji: { name: '❤️' } },    // ❤️ kept as-is (BMP text-default base)
      { type: 2, emoji: { name: '☀️' } },    // ☀️ kept as-is
      { type: 2, emoji: { name: '❤️‍\u{1F525}' } } // ❤️‍🔥 ZWJ seq — FE0F follows BMP, kept
    ]};
    sanitize(node);
    assert.deepEqual(node.components[0].emoji, { name: '\u{1F3A3}' });
    assert.deepEqual(node.components[1].emoji, { name: '❤️' });
    assert.deepEqual(node.components[2].emoji, { name: '☀️' });
    assert.deepEqual(node.components[3].emoji, { name: '❤️‍\u{1F525}' });
  });

  it('is a no-op on null/empty and components without emoji', () => {
    assert.doesNotThrow(() => sanitize(null));
    const clean = [{ type: 10, content: 'just text' }];
    sanitize(clean);
    assert.deepEqual(clean, [{ type: 10, content: 'just text' }]);
  });
});

// Inline replica of stripErroredComponentEmojis (reactive self-heal from a 50035 error body)
function makeStripper() {
  const rejected = new Set();
  function strip(bodyNode, errorNode) {
    let count = 0;
    if (!bodyNode || !errorNode || typeof errorNode !== 'object') return count;
    for (const key of Object.keys(errorNode)) {
      if (key === '_errors') continue;
      if (key === 'emoji') {
        if (bodyNode.emoji && typeof bodyNode.emoji === 'object' && !bodyNode.emoji.id && typeof bodyNode.emoji.name === 'string') rejected.add(bodyNode.emoji.name);
        if (bodyNode.emoji !== undefined) { bodyNode.emoji = { name: '📦' }; count++; }
        continue;
      }
      const errChild = errorNode[key];
      if (!errChild || typeof errChild !== 'object') continue;
      const bodyChild = Array.isArray(bodyNode) ? bodyNode[Number(key)] : bodyNode[key];
      if (bodyChild != null) count += strip(bodyChild, errChild);
    }
    return count;
  }
  return { strip, rejected };
}

describe('stripErroredComponentEmojis (reactive 50035 self-heal)', () => {
  const emojiErr = { emoji: { name: { _errors: [{ code: 'COMPONENT_INVALID_EMOJI' }] } } };

  it('replaces exactly the Discord-flagged option emojis with the fallback, leaves others', () => {
    const { strip, rejected } = makeStripper();
    const body = { flags: 32768, components: [{ type: 17, components: [
      { type: 10, content: 'Items' },
      { type: 1, components: [{ type: 3, options: [
        { value: 'a', emoji: { name: '🍆' } },
        { value: 'b', emoji: { name: '👻' } },
        { value: 'c', emoji: { name: '🪎' } },
        { value: 'd', emoji: { name: '🪎' } }
      ]}]}
    ]}]};
    const errors = { components: { '0': { components: { '1': { components: { '0': { options: {
      '2': emojiErr, '3': emojiErr
    }}}}}}}};
    const removed = strip(body, errors);
    const opts = body.components[0].components[1].components[0].options;
    assert.equal(removed, 2);
    assert.deepEqual(opts[0].emoji, { name: '🍆' });   // untouched
    assert.deepEqual(opts[1].emoji, { name: '👻' });   // untouched
    assert.deepEqual(opts[2].emoji, { name: '📦' });   // flagged → fallback
    assert.deepEqual(opts[3].emoji, { name: '📦' });   // flagged → fallback
    assert.ok(rejected.has('🪎'));                      // learned for proactive future stripping
  });

  it('handles a flagged button emoji (not just options)', () => {
    const { strip } = makeStripper();
    const body = { components: [{ type: 1, components: [{ type: 2, emoji: { name: '🪎' } }] }] };
    const errors = { components: { '0': { components: { '0': emojiErr } } } };
    assert.equal(strip(body, errors), 1);
    assert.deepEqual(body.components[0].components[0].emoji, { name: '📦' });
  });

  it('returns 0 and mutates nothing when there are no emoji errors', () => {
    const { strip } = makeStripper();
    const body = { components: [{ type: 1, components: [{ type: 3, options: [{ value: 'a', emoji: { name: '🍎' } }] }] }] };
    assert.equal(strip(body, { some_other_field: { _errors: [{ code: 'X' }] } }), 0);
    assert.deepEqual(body.components[0].components[0].options[0].emoji, { name: '🍎' });
  });
});
