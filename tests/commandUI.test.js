import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Replicated pure functions (avoids importing modules with heavy deps) ───

function buildCommandModal({ coord, isAdmin = false, prefixes = [] }) {
  const customId = isAdmin
    ? `admin_command_modal_${coord}`
    : `player_command_modal_${coord}`;

  const title = isAdmin ? 'Test Command (Admin)' : 'Enter Command';

  const components = [];

  components.push({
    type: 18,
    label: 'Command',
    description: 'Type a command to interact with this location',
    component: {
      type: 4,
      custom_id: 'command',
      style: 1,
      required: true,
      placeholder: 'e.g., climb tree, inspect rock, open chest',
      min_length: 1,
      max_length: 100
    }
  });

  return {
    type: 9,
    data: {
      custom_id: customId,
      title,
      components
    }
  };
}

describe('buildCommandModal — Structure', () => {
  it('returns a type 9 MODAL response', () => {
    const result = buildCommandModal({ coord: 'F7' });
    assert.equal(result.type, 9);
    assert.ok(result.data);
  });

  it('has a data object with custom_id, title, and components', () => {
    const result = buildCommandModal({ coord: 'F7' });
    assert.ok(result.data.custom_id);
    assert.ok(result.data.title);
    assert.ok(Array.isArray(result.data.components));
    assert.ok(result.data.components.length > 0);
  });

  it('uses Label (type 18) wrapper, not legacy ActionRow', () => {
    const result = buildCommandModal({ coord: 'A1' });
    const label = result.data.components[0];
    assert.equal(label.type, 18, 'First component should be Label (type 18)');
    assert.equal(label.component.type, 4, 'Label should wrap a TextInput (type 4)');
  });

  it('text input has correct configuration', () => {
    const result = buildCommandModal({ coord: 'B3' });
    const input = result.data.components[0].component;
    assert.equal(input.custom_id, 'command');
    assert.equal(input.style, 1);
    assert.equal(input.required, true);
    assert.equal(input.min_length, 1);
    assert.equal(input.max_length, 100);
    assert.ok(input.placeholder.length > 0);
  });
});

describe('buildCommandModal — Player Mode', () => {
  it('uses player_command_modal_ prefix for custom_id', () => {
    const result = buildCommandModal({ coord: 'E7' });
    assert.equal(result.data.custom_id, 'player_command_modal_E7');
  });

  it('uses "Enter Command" as title', () => {
    const result = buildCommandModal({ coord: 'E7' });
    assert.equal(result.data.title, 'Enter Command');
  });

  it('handles global coordinate', () => {
    const result = buildCommandModal({ coord: 'global' });
    assert.equal(result.data.custom_id, 'player_command_modal_global');
    assert.equal(result.data.title, 'Enter Command');
  });
});

describe('buildCommandModal — Admin Mode', () => {
  it('uses admin_command_modal_ prefix for custom_id', () => {
    const result = buildCommandModal({ coord: 'F7', isAdmin: true });
    assert.equal(result.data.custom_id, 'admin_command_modal_F7');
  });

  it('uses "Test Command (Admin)" as title', () => {
    const result = buildCommandModal({ coord: 'F7', isAdmin: true });
    assert.equal(result.data.title, 'Test Command (Admin)');
  });
});

describe('buildCommandModal — Consistency', () => {
  it('player and admin modals have identical component structure', () => {
    const player = buildCommandModal({ coord: 'C3' });
    const admin = buildCommandModal({ coord: 'C3', isAdmin: true });

    // Same number of components
    assert.equal(player.data.components.length, admin.data.components.length);

    // Same text input config
    const playerInput = player.data.components[0].component;
    const adminInput = admin.data.components[0].component;
    assert.equal(playerInput.custom_id, adminInput.custom_id);
    assert.equal(playerInput.style, adminInput.style);
    assert.equal(playerInput.max_length, adminInput.max_length);
    assert.equal(playerInput.required, adminInput.required);
  });

  it('different coordinates produce different custom_ids', () => {
    const a = buildCommandModal({ coord: 'A1' });
    const b = buildCommandModal({ coord: 'B2' });
    assert.notEqual(a.data.custom_id, b.data.custom_id);
  });

  it('global and location produce different custom_ids', () => {
    const global = buildCommandModal({ coord: 'global' });
    const location = buildCommandModal({ coord: 'E7' });
    assert.notEqual(global.data.custom_id, location.data.custom_id);
  });
});

// ─── Replicated prefix logic ───

const MAX_COMMAND_PREFIXES = 8;

function addPrefixToList(prefixes, label, emoji) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return { success: false, error: 'Prefix cannot be empty.' };
  if (prefixes.some(p => p.label.toLowerCase() === normalized)) {
    return { success: false, error: `Prefix "${label.trim()}" already exists.` };
  }
  if (prefixes.length >= MAX_COMMAND_PREFIXES) {
    return { success: false, error: `Maximum ${MAX_COMMAND_PREFIXES} prefixes allowed.` };
  }
  prefixes.push({ label: label.trim(), ...(emoji?.trim() ? { emoji: emoji.trim() } : {}) });
  return { success: true };
}

function buildAddPrefixModal() {
  return {
    type: 9,
    data: {
      custom_id: 'command_prefix_add_modal',
      title: 'Add Command Prefix',
      components: [
        {
          type: 18, label: 'Prefix',
          component: { type: 4, custom_id: 'prefix_label', style: 1, required: true, min_length: 1, max_length: 30 }
        },
        {
          type: 18, label: 'Emoji (optional)',
          component: { type: 4, custom_id: 'prefix_emoji', style: 1, required: false, max_length: 50 }
        }
      ]
    }
  };
}

describe('buildAddPrefixModal — Structure', () => {
  it('returns a type 9 MODAL response', () => {
    const result = buildAddPrefixModal();
    assert.equal(result.type, 9);
    assert.equal(result.data.custom_id, 'command_prefix_add_modal');
  });

  it('uses Label (type 18) wrappers for both fields', () => {
    const result = buildAddPrefixModal();
    assert.equal(result.data.components[0].type, 18);
    assert.equal(result.data.components[1].type, 18);
  });

  it('prefix field is required, emoji is optional', () => {
    const result = buildAddPrefixModal();
    assert.equal(result.data.components[0].component.required, true);
    assert.equal(result.data.components[1].component.required, false);
  });
});

describe('addPrefixToList — Validation', () => {
  it('adds a valid prefix', () => {
    const prefixes = [];
    const result = addPrefixToList(prefixes, 'Climb', '🧗');
    assert.equal(result.success, true);
    assert.equal(prefixes.length, 1);
    assert.equal(prefixes[0].label, 'Climb');
    assert.equal(prefixes[0].emoji, '🧗');
  });

  it('rejects empty prefix', () => {
    const result = addPrefixToList([], '  ', null);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('empty'));
  });

  it('rejects duplicate prefix (case-insensitive)', () => {
    const prefixes = [{ label: 'Climb' }];
    const result = addPrefixToList(prefixes, 'climb', null);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('already exists'));
  });

  it('rejects when at 8 prefix limit', () => {
    const prefixes = Array.from({ length: 8 }, (_, i) => ({ label: `prefix${i}` }));
    const result = addPrefixToList(prefixes, 'one_more', null);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Maximum'));
  });

  it('omits emoji property when not provided', () => {
    const prefixes = [];
    addPrefixToList(prefixes, 'Inspect', '');
    assert.equal(prefixes[0].emoji, undefined);
  });

  it('trims whitespace from label and emoji', () => {
    const prefixes = [];
    addPrefixToList(prefixes, '  Dive  ', '  🤿  ');
    assert.equal(prefixes[0].label, 'Dive');
    assert.equal(prefixes[0].emoji, '🤿');
  });
});

// ─── Phrase Management ───

const MAX_PHRASES = 8;

function detectPhrasePrefix(phrase, prefixes) {
  if (!prefixes?.length) return null;
  const sorted = [...prefixes].sort((a, b) => b.label.length - a.label.length);
  const phraseLower = phrase.toLowerCase();
  for (const prefix of sorted) {
    const prefixLower = prefix.label.toLowerCase();
    if (phraseLower.startsWith(prefixLower + ' ') && phrase.length > prefixLower.length + 1) {
      return { prefix, remainder: phrase.substring(prefix.label.length + 1) };
    }
  }
  return null;
}

function addPhraseToList(phrases, phrase) {
  const trimmed = phrase.trim();
  if (!trimmed) return { success: false, error: 'Phrase cannot be empty.' };
  if (phrases.length >= MAX_PHRASES) return { success: false, error: `Maximum ${MAX_PHRASES} phrases allowed.` };
  if (phrases.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: `Phrase "${trimmed}" already exists.` };
  }
  phrases.push(trimmed);
  return { success: true };
}

function buildAddPhraseModal({ actionId, prefixes = [] }) {
  const options = [{ label: 'Freeform (no prefix)', value: 'freeform', emoji: { name: '♾️' }, default: true }];
  for (const p of prefixes) {
    options.push({ label: p.label, value: p.label.toLowerCase(), emoji: { name: p.emoji || '🏷️' } });
  }
  return {
    type: 9,
    data: {
      custom_id: `action_phrase_add_modal_${actionId}`,
      title: 'Add Command Phrase',
      components: [
        { type: 18, label: 'Prefix', component: { type: 3, custom_id: 'phrase_prefix', min_values: 1, max_values: 1, options } },
        { type: 18, label: 'Command Phrase', component: { type: 4, custom_id: 'phrase_text', style: 1, required: true, min_length: 1, max_length: 100 } }
      ]
    }
  };
}

describe('detectPhrasePrefix', () => {
  const prefixes = [
    { label: 'climb', emoji: '🧗' },
    { label: 'climb up', emoji: '⬆️' },
    { label: 'inspect', emoji: '���' }
  ];

  it('detects a matching prefix', () => {
    const result = detectPhrasePrefix('climb tree', prefixes);
    assert.ok(result);
    assert.equal(result.prefix.label, 'climb');
    assert.equal(result.remainder, 'tree');
  });

  it('prefers longest matching prefix', () => {
    const result = detectPhrasePrefix('climb up ladder', prefixes);
    assert.ok(result);
    assert.equal(result.prefix.label, 'climb up');
    assert.equal(result.remainder, 'ladder');
  });

  it('returns null for freeform phrases', () => {
    const result = detectPhrasePrefix('my-secret-idol', prefixes);
    assert.equal(result, null);
  });

  it('returns null when prefix matches but no remainder', () => {
    const result = detectPhrasePrefix('climb', prefixes);
    assert.equal(result, null);
  });

  it('returns null with empty prefix list', () => {
    const result = detectPhrasePrefix('climb tree', []);
    assert.equal(result, null);
  });

  it('is case-insensitive', () => {
    const result = detectPhrasePrefix('Climb Tree', prefixes);
    assert.ok(result);
    assert.equal(result.prefix.label, 'climb');
    assert.equal(result.remainder, 'Tree');
  });
});

describe('buildAddPhraseModal — Structure', () => {
  it('returns a type 9 MODAL with correct custom_id', () => {
    const result = buildAddPhraseModal({ actionId: 'test_123' });
    assert.equal(result.type, 9);
    assert.equal(result.data.custom_id, 'action_phrase_add_modal_test_123');
  });

  it('uses Label (type 18) wrappers', () => {
    const result = buildAddPhraseModal({ actionId: 'test_123' });
    assert.equal(result.data.components[0].type, 18);
    assert.equal(result.data.components[1].type, 18);
  });

  it('includes freeform option by default', () => {
    const result = buildAddPhraseModal({ actionId: 'test_123' });
    const options = result.data.components[0].component.options;
    assert.equal(options[0].value, 'freeform');
    assert.equal(options[0].default, true);
  });

  it('includes guild prefixes as additional options', () => {
    const result = buildAddPhraseModal({
      actionId: 'test_123',
      prefixes: [{ label: 'climb', emoji: '🧗' }, { label: 'inspect' }]
    });
    const options = result.data.components[0].component.options;
    assert.equal(options.length, 3); // freeform + 2 prefixes
    assert.equal(options[1].value, 'climb');
    assert.equal(options[2].label, 'inspect');
  });
});

describe('addPhraseToList — Validation', () => {
  it('adds a valid phrase', () => {
    const phrases = [];
    const result = addPhraseToList(phrases, 'climb tree');
    assert.equal(result.success, true);
    assert.equal(phrases.length, 1);
    assert.equal(phrases[0], 'climb tree');
  });

  it('rejects empty phrase', () => {
    const result = addPhraseToList([], '  ');
    assert.equal(result.success, false);
  });

  it('rejects duplicate phrase (case-insensitive)', () => {
    const phrases = ['climb tree'];
    const result = addPhraseToList(phrases, 'Climb Tree');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('already exists'));
  });

  it('rejects when at phrase limit', () => {
    const phrases = Array.from({ length: 8 }, (_, i) => `phrase${i}`);
    const result = addPhraseToList(phrases, 'one more');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Maximum'));
  });

  it('trims whitespace', () => {
    const phrases = [];
    addPhraseToList(phrases, '  climb tree  ');
    assert.equal(phrases[0], 'climb tree');
  });
});
