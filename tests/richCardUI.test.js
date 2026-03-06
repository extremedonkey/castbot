import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAccentColor,
  buildRichCardModal,
  extractRichCardValues,
  buildRichCardContainer,
  buildRichCardResponse,
} from '../richCardUI.js';

// ---------------------------------------------------------------------------
// parseAccentColor
// ---------------------------------------------------------------------------
describe('parseAccentColor', () => {
  it('parses hex with hash', () => {
    assert.equal(parseAccentColor('#3498db'), 0x3498db);
  });

  it('parses hex without hash', () => {
    assert.equal(parseAccentColor('ff5722'), 0xff5722);
  });

  it('parses 0x prefix', () => {
    assert.equal(parseAccentColor('0x3498DB'), 0x3498db);
  });

  it('parses decimal string', () => {
    assert.equal(parseAccentColor('3447003'), 3447003);
  });

  it('passes through integer', () => {
    assert.equal(parseAccentColor(0xe74c3c), 0xe74c3c);
  });

  it('returns null for empty/null/undefined', () => {
    assert.equal(parseAccentColor(null), null);
    assert.equal(parseAccentColor(undefined), null);
    assert.equal(parseAccentColor(''), null);
    assert.equal(parseAccentColor('   '), null);
  });

  it('returns null for invalid hex', () => {
    assert.equal(parseAccentColor('ZZZZZZ'), null);
    assert.equal(parseAccentColor('#GGG'), null);
  });

  it('returns null for out-of-range integer', () => {
    assert.equal(parseAccentColor(0xFFFFFF + 1), null);
    assert.equal(parseAccentColor(-1), null);
  });

  it('rejects short hex (3-char)', () => {
    // We only accept 6-char hex
    assert.equal(parseAccentColor('abc'), null);
  });
});

// ---------------------------------------------------------------------------
// buildRichCardModal
// ---------------------------------------------------------------------------
describe('buildRichCardModal', () => {
  it('returns type 9 modal response', () => {
    const result = buildRichCardModal({
      customId: 'test_modal',
      modalTitle: 'Test Modal',
    });
    assert.equal(result.type, 9);
    assert.equal(result.data.custom_id, 'test_modal');
    assert.equal(result.data.title, 'Test Modal');
  });

  it('creates 4 core fields by default', () => {
    const result = buildRichCardModal({
      customId: 'test',
      modalTitle: 'Test',
    });
    assert.equal(result.data.components.length, 4);
    // ActionRow-wrapped by default
    const ids = result.data.components.map(c => c.components[0].custom_id);
    assert.deepEqual(ids, ['title', 'content', 'color', 'image']);
  });

  it('pre-fills values', () => {
    const result = buildRichCardModal({
      customId: 'test',
      modalTitle: 'Test',
      values: { title: 'Hello', content: 'World', color: '#ff0000', image: 'https://img.png' },
    });
    const vals = result.data.components.map(c => c.components[0].value);
    assert.deepEqual(vals, ['Hello', 'World', '#ff0000', 'https://img.png']);
  });

  it('applies field overrides', () => {
    const result = buildRichCardModal({
      customId: 'test',
      modalTitle: 'Test',
      fields: {
        title: { label: 'Location Title', required: true },
        content: { label: 'Description', maxLength: 1000 },
      },
    });
    const titleField = result.data.components[0].components[0];
    assert.equal(titleField.label, 'Location Title');
    assert.equal(titleField.required, true);

    const contentField = result.data.components[1].components[0];
    assert.equal(contentField.label, 'Description');
    assert.equal(contentField.max_length, 1000);
  });

  it('appends extra fields', () => {
    const result = buildRichCardModal({
      customId: 'test',
      modalTitle: 'Test',
      extraFields: [
        { customId: 'clues', label: 'Clues', style: 2, value: 'hint1\nhint2' },
      ],
    });
    assert.equal(result.data.components.length, 5);
    const last = result.data.components[4].components[0];
    assert.equal(last.custom_id, 'clues');
    assert.equal(last.value, 'hint1\nhint2');
  });

  it('uses Label wrap when requested', () => {
    const result = buildRichCardModal({
      customId: 'test',
      modalTitle: 'Test',
      useLabelWrap: true,
    });
    // Should use type 18 (Label) instead of type 1 (ActionRow)
    assert.equal(result.data.components[0].type, 18);
    assert.equal(result.data.components[0].component.type, 4);
    assert.equal(result.data.components[0].component.custom_id, 'title');
  });
});

// ---------------------------------------------------------------------------
// extractRichCardValues
// ---------------------------------------------------------------------------
describe('extractRichCardValues', () => {
  it('extracts from ActionRow-wrapped modal', () => {
    const formData = {
      components: [
        { components: [{ custom_id: 'title', value: 'My Title' }] },
        { components: [{ custom_id: 'content', value: 'Body text' }] },
        { components: [{ custom_id: 'color', value: '#ff0000' }] },
        { components: [{ custom_id: 'image', value: 'https://img.png' }] },
      ],
    };
    const result = extractRichCardValues(formData);
    assert.equal(result.title, 'My Title');
    assert.equal(result.content, 'Body text');
    assert.equal(result.color, '#ff0000');
    assert.equal(result.image, 'https://img.png');
  });

  it('extracts from Label-wrapped modal', () => {
    const formData = {
      components: [
        { component: { custom_id: 'title', value: 'Hello' } },
        { component: { custom_id: 'content', value: 'World' } },
        { component: { custom_id: 'color', value: '' } },
        { component: { custom_id: 'image', value: '' } },
      ],
    };
    const result = extractRichCardValues(formData);
    assert.equal(result.title, 'Hello');
    assert.equal(result.content, 'World');
    assert.equal(result.color, '');
    assert.equal(result.image, '');
  });

  it('puts unknown fields into extra', () => {
    const formData = {
      components: [
        { components: [{ custom_id: 'title', value: 'T' }] },
        { components: [{ custom_id: 'content', value: 'C' }] },
        { components: [{ custom_id: 'color', value: '' }] },
        { components: [{ custom_id: 'image', value: '' }] },
        { components: [{ custom_id: 'clues', value: 'hint1' }] },
      ],
    };
    const result = extractRichCardValues(formData);
    assert.equal(result.extra.clues, 'hint1');
  });

  it('trims whitespace', () => {
    const formData = {
      components: [
        { components: [{ custom_id: 'title', value: '  spaced  ' }] },
        { components: [{ custom_id: 'content', value: 'ok' }] },
      ],
    };
    const result = extractRichCardValues(formData);
    assert.equal(result.title, 'spaced');
  });
});

// ---------------------------------------------------------------------------
// buildRichCardContainer
// ---------------------------------------------------------------------------
describe('buildRichCardContainer', () => {
  it('builds container with all fields', () => {
    const container = buildRichCardContainer({
      title: 'Hello',
      content: 'World',
      color: '#3498db',
      image: 'https://example.com/img.png',
    });
    assert.equal(container.type, 17);
    assert.equal(container.accent_color, 0x3498db);
    assert.equal(container.components.length, 3); // title + content + gallery
    assert.equal(container.components[0].type, 10);
    assert.equal(container.components[0].content, '# Hello');
    assert.equal(container.components[1].type, 10);
    assert.equal(container.components[1].content, 'World');
    assert.equal(container.components[2].type, 12);
    assert.equal(container.components[2].items[0].media.url, 'https://example.com/img.png');
  });

  it('omits title when empty', () => {
    const container = buildRichCardContainer({ content: 'Just text' });
    assert.equal(container.components.length, 1);
    assert.equal(container.components[0].content, 'Just text');
  });

  it('omits image when empty', () => {
    const container = buildRichCardContainer({ title: 'T', content: 'C' });
    assert.equal(container.components.length, 2);
  });

  it('omits accent_color when no color', () => {
    const container = buildRichCardContainer({ content: 'C' });
    assert.equal(container.accent_color, undefined);
  });

  it('accepts integer color', () => {
    const container = buildRichCardContainer({ content: 'C', color: 0xe74c3c });
    assert.equal(container.accent_color, 0xe74c3c);
  });

  it('appends extraComponents', () => {
    const container = buildRichCardContainer({
      content: 'C',
      extraComponents: [{ type: 14 }], // separator
    });
    assert.equal(container.components.length, 2);
    assert.equal(container.components[1].type, 14);
  });
});

// ---------------------------------------------------------------------------
// buildRichCardResponse
// ---------------------------------------------------------------------------
describe('buildRichCardResponse', () => {
  it('sets IS_COMPONENTS_V2 flag', () => {
    const resp = buildRichCardResponse({ content: 'Test' });
    assert.equal(resp.flags & (1 << 15), 1 << 15);
  });

  it('adds ephemeral flag', () => {
    const resp = buildRichCardResponse({ content: 'Test' }, { ephemeral: true });
    assert.equal(resp.flags & (1 << 6), 1 << 6);
    assert.equal(resp.flags & (1 << 15), 1 << 15);
  });

  it('wraps container in array', () => {
    const resp = buildRichCardResponse({ title: 'T', content: 'C', color: '#ff0000' });
    assert.equal(resp.components.length, 1);
    assert.equal(resp.components[0].type, 17);
    assert.equal(resp.components[0].accent_color, 0xff0000);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: modal -> extract -> container
// ---------------------------------------------------------------------------
describe('Round-trip', () => {
  it('modal values survive extract and render correctly', () => {
    const modal = buildRichCardModal({
      customId: 'roundtrip',
      modalTitle: 'Test',
      values: { title: 'Adventure', content: 'Enter the cave...', color: '9b59b6', image: 'https://cdn.discord.com/img.png' },
    });

    // Simulate modal submit by extracting from the modal's pre-filled components
    const simulatedFormData = {
      components: modal.data.components.map(row => ({
        components: [{ custom_id: row.components[0].custom_id, value: row.components[0].value || '' }],
      })),
    };

    const extracted = extractRichCardValues(simulatedFormData);
    assert.equal(extracted.title, 'Adventure');
    assert.equal(extracted.content, 'Enter the cave...');
    assert.equal(extracted.color, '9b59b6');
    assert.equal(extracted.image, 'https://cdn.discord.com/img.png');

    const container = buildRichCardContainer(extracted);
    assert.equal(container.type, 17);
    assert.equal(container.accent_color, 0x9b59b6);
    assert.equal(container.components.length, 3);
    assert.equal(container.components[0].content, '# Adventure');
    assert.equal(container.components[2].items[0].media.url, 'https://cdn.discord.com/img.png');
  });
});
