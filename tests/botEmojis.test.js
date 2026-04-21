import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate expandBotEmojis inline — the real module reads process.env.PRODUCTION
// at load time, so we inject registry + isProd for deterministic tests.
function expandBotEmojisWith(text, registry, isProd) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/<:(\w+)>/g, (full, name) => {
    const entry = registry[name];
    if (!entry) return full;
    const id = isProd ? entry.prod : entry.dev;
    if (!id) return full;
    const marker = entry.animated ? 'a' : '';
    return `<${marker}:${name}:${id}>`;
  });
}

const REG = {
  cb_blue: { dev: 'DEV123', prod: 'PROD456' },
  cb_spin: { dev: 'DEVANIM', prod: 'PRODANIM', animated: true },
  prod_only: { prod: 'P1' },
  dev_only: { dev: 'D1' }
};

describe('expandBotEmojis — basic expansion', () => {
  it('expands a known name in dev mode', () => {
    assert.equal(
      expandBotEmojisWith('Click <:cb_blue> now', REG, false),
      'Click <:cb_blue:DEV123> now'
    );
  });

  it('expands a known name in prod mode', () => {
    assert.equal(
      expandBotEmojisWith('Click <:cb_blue> now', REG, true),
      'Click <:cb_blue:PROD456> now'
    );
  });

  it('expands animated entries with the a prefix', () => {
    assert.equal(
      expandBotEmojisWith('Spin <:cb_spin>', REG, false),
      'Spin <a:cb_spin:DEVANIM>'
    );
  });

  it('expands multiple occurrences in one string', () => {
    assert.equal(
      expandBotEmojisWith('<:cb_blue> and <:cb_blue>', REG, false),
      '<:cb_blue:DEV123> and <:cb_blue:DEV123>'
    );
  });

  it('expands mixed known names in one string', () => {
    assert.equal(
      expandBotEmojisWith('<:cb_blue> then <:cb_spin>', REG, true),
      '<:cb_blue:PROD456> then <a:cb_spin:PRODANIM>'
    );
  });
});

describe('expandBotEmojis — unresolved / edge cases', () => {
  it('leaves unknown names untouched', () => {
    assert.equal(
      expandBotEmojisWith('Hello <:not_a_bot_emoji> there', REG, false),
      'Hello <:not_a_bot_emoji> there'
    );
  });

  it('does not match full emoji codes <:name:id>', () => {
    const input = 'Real emoji <:cb_blue:9999999999999>';
    assert.equal(expandBotEmojisWith(input, REG, false), input);
  });

  it('does not match animated full emoji codes <a:name:id>', () => {
    const input = 'Real animated <a:cb_spin:9999999999999>';
    assert.equal(expandBotEmojisWith(input, REG, false), input);
  });

  it('leaves entry untouched when env-specific id is missing (prod mode, dev-only entry)', () => {
    assert.equal(
      expandBotEmojisWith('<:dev_only>', REG, true),
      '<:dev_only>'
    );
  });

  it('leaves entry untouched when env-specific id is missing (dev mode, prod-only entry)', () => {
    assert.equal(
      expandBotEmojisWith('<:prod_only>', REG, false),
      '<:prod_only>'
    );
  });

  it('handles text with no matches', () => {
    assert.equal(
      expandBotEmojisWith('plain text with no emoji', REG, false),
      'plain text with no emoji'
    );
  });

  it('handles empty string', () => {
    assert.equal(expandBotEmojisWith('', REG, false), '');
  });

  it('returns null unchanged', () => {
    assert.equal(expandBotEmojisWith(null, REG, false), null);
  });

  it('returns undefined unchanged', () => {
    assert.equal(expandBotEmojisWith(undefined, REG, false), undefined);
  });

  it('returns non-string input unchanged', () => {
    assert.equal(expandBotEmojisWith(42, REG, false), 42);
  });

  it('does not match names with hyphens (Discord emoji names disallow them anyway)', () => {
    const input = '<:has-hyphen>';
    assert.equal(expandBotEmojisWith(input, REG, false), input);
  });

  it('does not match empty name <:>', () => {
    const input = '<:>';
    assert.equal(expandBotEmojisWith(input, REG, false), input);
  });

  it('expands at start of string', () => {
    assert.equal(
      expandBotEmojisWith('<:cb_blue> at start', REG, false),
      '<:cb_blue:DEV123> at start'
    );
  });

  it('expands at end of string', () => {
    assert.equal(
      expandBotEmojisWith('at end <:cb_blue>', REG, false),
      'at end <:cb_blue:DEV123>'
    );
  });

  it('preserves surrounding markdown', () => {
    assert.equal(
      expandBotEmojisWith('**bold <:cb_blue>**', REG, false),
      '**bold <:cb_blue:DEV123>**'
    );
  });

  it('handles mixed known + unknown in one string', () => {
    assert.equal(
      expandBotEmojisWith('<:cb_blue> and <:unknown>', REG, false),
      '<:cb_blue:DEV123> and <:unknown>'
    );
  });
});

describe('expandBotEmojis — real module smoke test', () => {
  it('imports cleanly and exposes expandBotEmojis', async () => {
    const mod = await import('../botEmojis.js');
    assert.equal(typeof mod.expandBotEmojis, 'function');
    // cb_blue is registered — calling the real function should expand it
    const result = mod.expandBotEmojis('<:cb_blue>');
    assert.match(result, /^<:cb_blue:\d+>$/);
  });

  it('passes through unknown names via real function', async () => {
    const { expandBotEmojis } = await import('../botEmojis.js');
    assert.equal(expandBotEmojis('<:definitely_not_registered>'), '<:definitely_not_registered>');
  });
});
