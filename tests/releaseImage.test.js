/**
 * Release-notes image generator — spec validation and layout maths.
 *
 * SVG has no text measurement, so the card layout is fixed-width by design and an over-long
 * `desc` line silently renders past the card edge. validateSpec is the guard rail that turns
 * that into an error at authoring time; computeHeight is what stops a newly-added card row
 * from clipping the footer off the bottom of the canvas.
 *
 * Only the pure parts are tested — rendering needs sharp and produces a binary.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateSpec, computeHeight } from '../scripts/release/releaseImage.js';

const card = (over = {}) => ({
  title: 'A Feature',
  badge: 'NEW',
  color: '#3498db',
  desc: ['a short line'],
  ...over
});

const spec = (over = {}) => ({
  period: 'AUGUST 2026',
  title: 'CastBot Update',
  subtitle: 'Something happened',
  cards: [card()],
  ...over
});

describe('releaseImage — validateSpec', () => {
  it('accepts a minimal valid spec', () => {
    assert.deepEqual(validateSpec(spec()), []);
  });

  it('names every missing top-level field at once, not one at a time', () => {
    const problems = validateSpec({ cards: [card()] });
    assert.equal(problems.length, 3);
    for (const f of ['period', 'title', 'subtitle']) {
      assert.ok(problems.some(p => p.includes(f)), `reports missing ${f}`);
    }
  });

  it('requires at least one card', () => {
    assert.ok(validateSpec(spec({ cards: [] }))[0].includes('non-empty'));
    assert.ok(validateSpec(spec({ cards: undefined }))[0].includes('non-empty'));
  });

  it('rejects a badge that has no colour scheme defined', () => {
    assert.deepEqual(validateSpec(spec({ cards: [card({ badge: 'SHIPPED' })] })), [
      'cards[0]: badge must be NEW, IMPROVED or FIXED (got "SHIPPED")'
    ]);
    for (const badge of ['NEW', 'IMPROVED', 'FIXED']) {
      assert.deepEqual(validateSpec(spec({ cards: [card({ badge })] })), [], `${badge} is valid`);
    }
  });

  it('catches desc lines too long for the card — the failure SVG cannot show you', () => {
    const problems = validateSpec(spec({ cards: [card({ desc: ['x'.repeat(63)] })] }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /cards\[0\]\.desc\[0\]: 63 chars/);
    assert.deepEqual(validateSpec(spec({ cards: [card({ desc: ['x'.repeat(62)] })] })), [], '62 fits');
  });

  it('measures the line as rendered — emoji are stripped before drawing, so they do not count', () => {
    const line = '🎉🦁🗺️ ' + 'x'.repeat(58);
    assert.deepEqual(validateSpec(spec({ cards: [card({ desc: [line] })] })), []);
  });

  it('caps a card at 4 desc lines', () => {
    assert.deepEqual(validateSpec(spec({ cards: [card({ desc: ['a', 'b', 'c', 'd'] })] })), []);
    assert.match(validateSpec(spec({ cards: [card({ desc: ['a', 'b', 'c', 'd', 'e'] })] }))[0], /5 desc lines/);
  });

  it('reports problems across every card, not just the first', () => {
    const problems = validateSpec(spec({ cards: [card({ badge: 'NOPE' }), card({ title: '' })] }));
    assert.ok(problems.some(p => p.startsWith('cards[0]')));
    assert.ok(problems.some(p => p.startsWith('cards[1]')));
  });

  it('requires a value and a label on every stat', () => {
    assert.deepEqual(validateSpec(spec({ stats: [{ value: '16', label: 'COMMITS' }] })), []);
    assert.equal(validateSpec(spec({ stats: [{ value: '16' }] })).length, 1);
  });

  it('handles junk input without throwing', () => {
    assert.deepEqual(validateSpec(null), ['spec is not an object']);
    assert.deepEqual(validateSpec('nope'), ['spec is not an object']);
    assert.ok(validateSpec(spec({ cards: [card({ desc: 'not an array' })] }))[0].includes('must be an array'));
  });
});

describe('releaseImage — computeHeight', () => {
  it('grows by one card row for every two cards', () => {
    const h = n => computeHeight(spec({ cards: Array.from({ length: n }, () => card()) }));
    assert.equal(h(1), h(2), 'two cards share a row');
    assert.ok(h(3) > h(2), 'a third card starts a new row');
    assert.equal(h(3), h(4));
    assert.equal(h(4) - h(2), h(6) - h(4), 'each row adds a constant height');
  });

  it('reserves space only for the sections a spec actually has', () => {
    const bare = computeHeight(spec());
    assert.ok(computeHeight(spec({ underHood: ['x'] })) > bare, 'under-the-hood strip adds height');
    assert.equal(computeHeight(spec({ underHood: [] })), bare, 'an empty strip costs nothing');
    assert.ok(computeHeight(spec({ stats: [{ value: '1', label: 'A' }] })) > bare, 'stats add height');
  });

  it('produces a sane canvas for the shipped August 2026 spec', () => {
    const h = computeHeight(spec({
      cards: Array.from({ length: 6 }, () => card()),
      underHood: ['a', 'b'],
      stats: Array.from({ length: 5 }, () => ({ value: '1', label: 'A' }))
    }));
    assert.equal(h, 934);
  });
});
