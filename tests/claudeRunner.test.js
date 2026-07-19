/**
 * claudeRunner — timing budget, activity labels, elapsed formatting.
 *
 * The timing constants encode a hard external fact (Discord kills an interaction token
 * 15 minutes after the deferred response), so they get a test: if someone "optimises"
 * HARD_KILL_MS past the token window, every long answer silently fails to deliver.
 *
 * Pure logic replicated inline per TestingStandards — importing claudeRunner.js pulls in
 * child_process.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const DELIVERY_MARGIN_MS = 2 * 60 * 1000;
const HARD_KILL_MS = TOKEN_LIFETIME_MS - DELIVERY_MARGIN_MS;

function formatElapsed(ms) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function baseName(p) {
  return typeof p === 'string' ? p.split('/').filter(Boolean).pop() || p : '';
}

function describeActivity(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'system' && event.subtype === 'init') return '🚀 Starting up';
  const content = event.message?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'tool_use') {
      const input = block.input || {};
      switch (block.name) {
        case 'Read': return `📖 Reading ${baseName(input.file_path) || 'a file'}`;
        case 'Grep': return `🔍 Searching for "${String(input.pattern ?? '').substring(0, 40)}"`;
        case 'Glob': return `📂 Looking for ${String(input.pattern ?? 'files').substring(0, 40)}`;
        default: return `🔧 Using ${block.name}`;
      }
    }
    if (block.type === 'thinking') return '💭 Thinking it through';
    if (block.type === 'text' && String(block.text || '').trim()) return '✍️ Writing the answer';
  }
  return null;
}

describe('claudeRunner — timing budget', () => {
  it('kills the job before the Discord interaction token expires', () => {
    assert.ok(HARD_KILL_MS < TOKEN_LIFETIME_MS,
      'a job outliving the token can never deliver its answer');
  });

  it('leaves enough margin to render and PATCH the answer', () => {
    assert.ok(TOKEN_LIFETIME_MS - HARD_KILL_MS >= 60 * 1000,
      'need at least a minute to chunk and deliver');
  });

  it('uses far more of the budget than the old 4-minute kill', () => {
    assert.ok(HARD_KILL_MS > 4 * 60 * 1000 * 2);
    assert.equal(HARD_KILL_MS, 13 * 60 * 1000);
  });
});

describe('claudeRunner — formatElapsed', () => {
  it('renders sub-minute as seconds', () => {
    assert.equal(formatElapsed(0), '0s');
    assert.equal(formatElapsed(45_000), '45s');
  });

  it('renders minutes with zero-padded seconds', () => {
    assert.equal(formatElapsed(65_000), '1m 05s');
    assert.equal(formatElapsed(125_000), '2m 05s');
    assert.equal(formatElapsed(600_000), '10m 00s');
  });

  it('renders the hard-kill budget readably', () => {
    assert.equal(formatElapsed(HARD_KILL_MS), '13m 00s');
  });
});

describe('claudeRunner — describeActivity', () => {
  it('reports the file being read, not the full path', () => {
    assert.equal(
      describeActivity({ message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/home/reece/castbot/docs/03-features/Safari.md' } }] } }),
      '📖 Reading Safari.md'
    );
  });

  it('reports searching and globbing', () => {
    assert.equal(
      describeActivity({ message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'blacklist' } }] } }),
      '🔍 Searching for "blacklist"'
    );
    assert.equal(
      describeActivity({ message: { content: [{ type: 'tool_use', name: 'Glob', input: { pattern: '*.md' } }] } }),
      '📂 Looking for *.md'
    );
  });

  it('reports thinking and writing', () => {
    assert.equal(describeActivity({ message: { content: [{ type: 'thinking', thinking: 'hmm' }] } }), '💭 Thinking it through');
    assert.equal(describeActivity({ message: { content: [{ type: 'text', text: 'The answer is' }] } }), '✍️ Writing the answer');
  });

  it('reports startup', () => {
    assert.equal(describeActivity({ type: 'system', subtype: 'init' }), '🚀 Starting up');
  });

  it('returns null for events that should not change the display', () => {
    assert.equal(describeActivity(null), null);
    assert.equal(describeActivity({ type: 'result' }), null);
    assert.equal(describeActivity({ message: { content: [{ type: 'text', text: '   ' }] } }), null);
    assert.equal(describeActivity({ message: { content: 'not-an-array' } }), null);
  });

  it('never throws on malformed tool input', () => {
    assert.equal(describeActivity({ message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } }), '📖 Reading a file');
    assert.equal(describeActivity({ message: { content: [{ type: 'tool_use', name: 'Weird' }] } }), '🔧 Using Weird');
  });
});

// --- model selection (Moai / Ask CastBot model dropdown) ---
const MODEL_OPTIONS = [
  { value: 'haiku', label: 'Haiku', description: 'Fastest, cheapest — quick lookups', emoji: { name: '🍃' } },
  { value: 'sonnet', label: 'Sonnet', description: 'Balanced speed and intelligence', emoji: { name: '⚖️' }, default: true },
  { value: 'opus', label: 'Opus', description: 'Most capable — hard problems', emoji: { name: '🧠' } },
  { value: 'fable', label: 'Fable', description: "Anthropic's most capable model", emoji: { name: '📖' } }
];
const DEFAULT_MODEL = 'sonnet';
const MODEL_VALUES = new Set(MODEL_OPTIONS.map(m => m.value));

function resolveModelChoice(value) {
  return MODEL_VALUES.has(value) ? value : DEFAULT_MODEL;
}

function modelLabel(value) {
  return (MODEL_OPTIONS.find(m => m.value === value) || MODEL_OPTIONS.find(m => m.value === DEFAULT_MODEL)).label;
}

function buildModelSelectField(customId, chosen = DEFAULT_MODEL) {
  return {
    type: 18,
    label: 'Model',
    description: 'Which Claude model should answer?',
    component: {
      type: 3,
      custom_id: customId,
      required: false,
      options: MODEL_OPTIONS.map(({ value, label, description, emoji }) => ({
        value, label, description, emoji, default: value === chosen
      }))
    }
  };
}

describe('Model selection — resolveModelChoice', () => {
  it('accepts every known variant', () => {
    assert.equal(resolveModelChoice('haiku'), 'haiku');
    assert.equal(resolveModelChoice('sonnet'), 'sonnet');
    assert.equal(resolveModelChoice('opus'), 'opus');
    assert.equal(resolveModelChoice('fable'), 'fable');
  });

  it('falls back to sonnet for a forged, stale, or missing value', () => {
    assert.equal(resolveModelChoice('claude-3-opus-20240229'), DEFAULT_MODEL);
    assert.equal(resolveModelChoice('__proto__'), DEFAULT_MODEL);
    assert.equal(resolveModelChoice(undefined), DEFAULT_MODEL);
    assert.equal(resolveModelChoice(''), DEFAULT_MODEL);
  });
});

describe('Model selection — modelLabel', () => {
  it('renders the display label for each variant', () => {
    assert.equal(modelLabel('haiku'), 'Haiku');
    assert.equal(modelLabel('opus'), 'Opus');
    assert.equal(modelLabel('fable'), 'Fable');
  });

  it('falls back to the Sonnet label for an unknown value', () => {
    assert.equal(modelLabel('not-a-model'), 'Sonnet');
    assert.equal(modelLabel(undefined), 'Sonnet');
  });
});

describe('Model selection — buildModelSelectField', () => {
  it('marks the chosen option as default and no other', () => {
    const field = buildModelSelectField('moai_model', 'opus');
    const opts = field.component.options;
    assert.equal(opts.find(o => o.value === 'opus').default, true);
    assert.equal(opts.filter(o => o.default).length, 1);
  });

  it('defaults to sonnet when no prior choice exists', () => {
    const field = buildModelSelectField('askcb_model');
    assert.equal(field.component.options.find(o => o.value === 'sonnet').default, true);
  });

  it('uses the given custom_id so multiple modals do not collide', () => {
    const field = buildModelSelectField('askcb_model', 'haiku');
    assert.equal(field.component.custom_id, 'askcb_model');
  });
});

// --- route detection (Tools menu vs posted button) ---
const isPublicRoute = (customId) => String(customId || '').startsWith('askcb_pub_modal');

describe('Ask CastBot — modal route detection', () => {
  it('treats posted-button modals as the public route', () => {
    assert.equal(isPublicRoute('askcb_pub_modal'), true);
    assert.equal(isPublicRoute('askcb_pub_modal_abc123'), true);
  });

  it('treats Tools-menu modals as the gated route', () => {
    assert.equal(isPublicRoute('askcb_ask_modal'), false);
    assert.equal(isPublicRoute('askcb_ask_modal_abc123'), false);
  });

  it('defaults to the gated route on junk input', () => {
    assert.equal(isPublicRoute(undefined), false);
    assert.equal(isPublicRoute(''), false);
  });
});
