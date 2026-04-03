import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate resolveEmoji inline to avoid importing heavy modules (storage.js, etc.)
function resolveEmoji(emojiStr, fallback = '📦', target = 'component') {
    if (!emojiStr || typeof emojiStr !== 'string' || !emojiStr.trim()) {
        return target === 'builder' ? fallback : { name: fallback };
    }

    const trimmed = emojiStr.trim();

    const customMatch = trimmed.match(/^<(a?):(\w+):(\d+)>$/);
    if (customMatch) {
        if (target === 'builder') {
            return trimmed;
        }
        return {
            name: customMatch[2],
            id: customMatch[3],
            ...(customMatch[1] === 'a' ? { animated: true } : {})
        };
    }

    // Malformed custom emoji (starts with < but doesn't match pattern) → fallback
    if (trimmed.startsWith('<')) {
        return target === 'builder' ? fallback : { name: fallback };
    }

    return target === 'builder' ? trimmed : { name: trimmed };
}

// === Component target (default) ===

describe('resolveEmoji — component target', () => {
    it('returns fallback for null', () => {
        assert.deepEqual(resolveEmoji(null), { name: '📦' });
    });

    it('returns fallback for undefined', () => {
        assert.deepEqual(resolveEmoji(undefined), { name: '📦' });
    });

    it('returns fallback for empty string', () => {
        assert.deepEqual(resolveEmoji(''), { name: '📦' });
    });

    it('returns fallback for whitespace-only string', () => {
        assert.deepEqual(resolveEmoji('   '), { name: '📦' });
    });

    it('returns custom fallback when specified', () => {
        assert.deepEqual(resolveEmoji(null, '⚡'), { name: '⚡' });
    });

    it('parses Unicode emoji', () => {
        assert.deepEqual(resolveEmoji('🎯'), { name: '🎯' });
    });

    it('parses static custom emoji', () => {
        assert.deepEqual(resolveEmoji('<:pokemart:123456>'), {
            name: 'pokemart',
            id: '123456'
        });
    });

    it('parses animated custom emoji', () => {
        assert.deepEqual(resolveEmoji('<a:spin:789012>'), {
            name: 'spin',
            id: '789012',
            animated: true
        });
    });

    it('does not include animated key for static emoji', () => {
        const result = resolveEmoji('<:sword:111>');
        assert.equal(result.animated, undefined);
    });

    it('trims whitespace around emoji', () => {
        assert.deepEqual(resolveEmoji('  🎯  '), { name: '🎯' });
    });

    it('trims whitespace around custom emoji', () => {
        assert.deepEqual(resolveEmoji('  <:test:999>  '), {
            name: 'test',
            id: '999'
        });
    });

    it('treats non-number types as fallback', () => {
        assert.deepEqual(resolveEmoji(42), { name: '📦' });
    });

    it('handles multi-codepoint emoji as plain text', () => {
        // Multi-codepoint emojis pass through as { name: str }
        assert.deepEqual(resolveEmoji('🏳️‍🌈'), { name: '🏳️‍🌈' });
    });

    it('rejects malformed custom emoji (no closing bracket) — falls back', () => {
        assert.deepEqual(resolveEmoji('<:broken:123', '📦'), { name: '📦' });
    });

    it('rejects custom emoji with extra text — falls back', () => {
        assert.deepEqual(resolveEmoji('<:test:123> extra', '📦'), { name: '📦' });
    });
});

// === Malformed emoji handling ===

describe('resolveEmoji — malformed custom emojis', () => {
    it('truncated custom emoji falls back', () => {
        assert.deepEqual(resolveEmoji('<:LinkGotI', '📊'), { name: '📊' });
    });

    it('incomplete custom emoji (no closing >) falls back', () => {
        assert.deepEqual(resolveEmoji('<:name:123', '📦'), { name: '📦' });
    });

    it('bare < falls back', () => {
        assert.deepEqual(resolveEmoji('<', '📦'), { name: '📦' });
    });

    it('malformed in builder mode falls back', () => {
        assert.equal(resolveEmoji('<:broken', '🏪', 'builder'), '🏪');
    });
});

// === Builder target ===

describe('resolveEmoji — builder target', () => {
    it('returns fallback string for null', () => {
        assert.equal(resolveEmoji(null, '🏪', 'builder'), '🏪');
    });

    it('returns Unicode emoji as string', () => {
        assert.equal(resolveEmoji('🎯', '📦', 'builder'), '🎯');
    });

    it('returns raw custom emoji string for ButtonBuilder', () => {
        assert.equal(resolveEmoji('<:pokemart:123>', '🏪', 'builder'), '<:pokemart:123>');
    });

    it('returns raw animated emoji string for ButtonBuilder', () => {
        assert.equal(resolveEmoji('<a:spin:789>', '⚡', 'builder'), '<a:spin:789>');
    });

    it('returns custom fallback for empty string', () => {
        assert.equal(resolveEmoji('', '⚡', 'builder'), '⚡');
    });
});
