/**
 * Tests for src/ui/statusSelector.js — reusable status-picker Container builder.
 * Pure logic, no I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatusSelector } from '../src/ui/statusSelector.js';

describe('StatusSelector — structure', () => {
  const base = {
    customId: 'x_select',
    title: '## Pick one',
    options: [
      { value: 'a', label: 'Alpha', emoji: '🅰️' },
      { value: 'b', label: 'Beta', emoji: '🅱️', description: 'the second one' },
    ],
    backButton: { customId: 'x_back' },
  };

  it('wraps in Container (type 17) with components array', () => {
    const out = buildStatusSelector(base);
    assert.equal(out.components.length, 1);
    assert.equal(out.components[0].type, 17);
    assert.ok(Array.isArray(out.components[0].components));
  });

  it('builds heading + select + back button layout', () => {
    const out = buildStatusSelector(base);
    const inner = out.components[0].components;
    // heading, separator, actionrow(select), separator, actionrow(back)
    assert.equal(inner[0].type, 10);            // TextDisplay heading
    assert.equal(inner[1].type, 14);            // Separator
    assert.equal(inner[2].type, 1);             // ActionRow
    assert.equal(inner[2].components[0].type, 3); // StringSelect
    assert.equal(inner[3].type, 14);            // Separator
    assert.equal(inner[4].type, 1);             // ActionRow
    assert.equal(inner[4].components[0].type, 2); // Button
  });

  it('highlights current value with default: true', () => {
    const out = buildStatusSelector({ ...base, currentValue: 'b' });
    const selectOpts = out.components[0].components[2].components[0].options;
    const a = selectOpts.find(o => o.value === 'a');
    const b = selectOpts.find(o => o.value === 'b');
    assert.equal(a.default, undefined);
    assert.equal(b.default, true);
  });

  it('omits description slot when not provided', () => {
    const out = buildStatusSelector(base);
    // inner[0] is the title, no extra description TextDisplay
    const inner = out.components[0].components;
    assert.equal(inner[0].type, 10);
    assert.equal(inner[1].type, 14);
  });

  it('inserts description TextDisplay when provided', () => {
    const out = buildStatusSelector({ ...base, description: '-# hint' });
    const inner = out.components[0].components;
    assert.equal(inner[0].type, 10); // title
    assert.equal(inner[1].type, 10); // description
    assert.equal(inner[2].type, 14); // separator
  });

  it('passes through emoji as { name }', () => {
    const out = buildStatusSelector(base);
    const selectOpts = out.components[0].components[2].components[0].options;
    assert.deepEqual(selectOpts[0].emoji, { name: '🅰️' });
  });

  it('truncates labels to 100 chars', () => {
    const long = 'x'.repeat(150);
    const out = buildStatusSelector({
      ...base,
      options: [{ value: 'a', label: long }, { value: 'b', label: 'ok' }],
    });
    const selectOpts = out.components[0].components[2].components[0].options;
    assert.equal(selectOpts[0].label.length, 100);
  });
});

describe('StatusSelector — validation', () => {
  const valid = {
    customId: 'x',
    title: '## t',
    options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    backButton: { customId: 'back' },
  };

  it('throws on <2 options', () => {
    assert.throws(() => buildStatusSelector({ ...valid, options: [{ value: 'a', label: 'A' }] }), /2-25 entries/);
  });

  it('throws on >25 options', () => {
    const big = Array.from({ length: 26 }, (_, i) => ({ value: `v${i}`, label: `L${i}` }));
    assert.throws(() => buildStatusSelector({ ...valid, options: big }), /2-25 entries/);
  });

  it('throws when customId missing', () => {
    assert.throws(() => buildStatusSelector({ ...valid, customId: '' }), /customId is required/);
  });

  it('throws when backButton.customId missing', () => {
    assert.throws(() => buildStatusSelector({ ...valid, backButton: {} }), /backButton.customId is required/);
  });
});

describe('StatusSelector — current state badge', () => {
  const base = {
    customId: 'x',
    title: '## ✏️ Pick one',
    options: [
      { value: 'testing', label: 'Testing', emoji: '🧪' },
      { value: 'active',  label: 'Active',  emoji: '🏁' },
      { value: 'paused',  label: 'Paused',  emoji: '⏯️' },
    ],
    backButton: { customId: 'back' },
  };

  it('omitted when showCurrentStateBadge is false (default)', () => {
    const out = buildStatusSelector({ ...base, currentValue: 'testing' });
    const inner = out.components[0].components;
    // inner[0]=title, inner[1]=separator, inner[2]=actionrow(select)
    assert.equal(inner[1].type, 14, 'separator should come directly after title');
  });

  it('renders large emoji + code-block heading between description and separator', () => {
    const out = buildStatusSelector({
      ...base,
      description: 'Change who can see this.',
      currentValue: 'testing',
      showCurrentStateBadge: true,
    });
    const inner = out.components[0].components;
    // title, description, badge-emoji, badge-label, separator, select, separator, back
    assert.equal(inner[0].type, 10); // title
    assert.equal(inner[1].type, 10); // description
    assert.equal(inner[2].type, 10); // badge emoji (# heading)
    assert.ok(inner[2].content.includes('🧪'), 'badge emoji should be from the matching option');
    assert.ok(inner[2].content.startsWith('# '), 'badge emoji should be rendered as H1 for prominence');
    assert.equal(inner[3].type, 10); // badge label
    assert.ok(inner[3].content.includes('```Current Status```'), 'badge label wraps text in backticks');
    assert.equal(inner[4].type, 14); // separator
    assert.equal(inner[5].type, 1);  // action row with select
  });

  it('reflects the matching option emoji when currentValue changes', () => {
    const out = buildStatusSelector({
      ...base,
      currentValue: 'active',
      showCurrentStateBadge: true,
    });
    const inner = out.components[0].components;
    const badgeEmoji = inner.find(c => c.type === 10 && c.content.startsWith('# '));
    assert.ok(badgeEmoji.content.includes('🏁'), 'active → 🏁');
  });

  it('uses custom currentStateLabel when provided', () => {
    const out = buildStatusSelector({
      ...base,
      currentValue: 'testing',
      showCurrentStateBadge: true,
      currentStateLabel: 'Right Now',
    });
    const inner = out.components[0].components;
    const badgeLabel = inner.find(c => c.type === 10 && c.content.includes('```'));
    assert.ok(badgeLabel.content.includes('```Right Now```'));
  });

  it('badge not rendered when currentValue does not match any option', () => {
    const out = buildStatusSelector({
      ...base,
      currentValue: 'nonexistent',
      showCurrentStateBadge: true,
    });
    const inner = out.components[0].components;
    // Only title, separator, actionrow(select), separator, actionrow(back) — no badge
    const badgeEmoji = inner.find(c => c.type === 10 && c.content.startsWith('# '));
    assert.equal(badgeEmoji, undefined);
  });

  it('badge not rendered when matching option has no emoji', () => {
    const out = buildStatusSelector({
      ...base,
      options: [
        { value: 'plain', label: 'Plain' },
        { value: 'other', label: 'Other' },
      ],
      currentValue: 'plain',
      showCurrentStateBadge: true,
    });
    const inner = out.components[0].components;
    const badgeEmoji = inner.find(c => c.type === 10 && c.content.startsWith('# '));
    assert.equal(badgeEmoji, undefined);
  });
});

describe('StatusSelector — accent color', () => {
  it('uses provided accent', () => {
    const out = buildStatusSelector({
      customId: 'x', title: '## t',
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
      backButton: { customId: 'back' },
      accentColor: 0xff0000,
    });
    assert.equal(out.components[0].accent_color, 0xff0000);
  });

  it('falls back to default blurple when not provided', () => {
    const out = buildStatusSelector({
      customId: 'x', title: '## t',
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
      backButton: { customId: 'back' },
    });
    assert.equal(out.components[0].accent_color, 0x5865F2);
  });
});
