/**
 * Tests for the Moai's context-aware Ask plumbing (moai_ask_msg button):
 * extractMessageText (read the clicked card back as the modal prefill),
 * buildContextAskModal (Label-wrapped inputs, truncation, submit-route reuse),
 * buildPrompt attached-message section, and the DEV/TEST environment gate.
 *
 * moai.js has no top-level side effects, so we import the real module.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMoaiEnvironment,
  extractMessageText,
  buildContextAskModal,
  buildPrompt,
  buildQuestionContainer
} from '../moai.js';

describe('Moai — isMoaiEnvironment (DEV/TEST always; PROD behind CLAUDE_PROD_FEATURES)', () => {
  const withEnv = (vars, fn) => {
    const prev = {};
    for (const [k, v] of Object.entries(vars)) {
      prev[k] = process.env[k];
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    try { fn(); } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  };

  it('is true when PRODUCTION is not TRUE', () => {
    withEnv({ PRODUCTION: undefined, CLAUDE_PROD_FEATURES: undefined }, () => {
      assert.equal(isMoaiEnvironment(), true);
    });
  });

  it('is false in production without the opt-in flag', () => {
    withEnv({ PRODUCTION: 'TRUE', CLAUDE_PROD_FEATURES: undefined }, () => {
      assert.equal(isMoaiEnvironment(), false);
    });
  });

  it('is true in production WITH CLAUDE_PROD_FEATURES=TRUE (2026-07-28 rollout)', () => {
    withEnv({ PRODUCTION: 'TRUE', CLAUDE_PROD_FEATURES: 'TRUE' }, () => {
      assert.equal(isMoaiEnvironment(), true);
    });
  });

  it('opt-in must be exactly TRUE — "true"/"1" do not count', () => {
    for (const bad of ['true', '1', 'yes']) {
      withEnv({ PRODUCTION: 'TRUE', CLAUDE_PROD_FEATURES: bad }, () => {
        assert.equal(isMoaiEnvironment(), false, `value "${bad}"`);
      });
    }
  });
});

describe('Moai — extractMessageText', () => {
  it('collects nested Text Displays from a Components V2 container', () => {
    const message = {
      components: [{
        type: 17,
        components: [
          { type: 10, content: '## 🔴 PM2 Errors · PROD' },
          { type: 10, content: '```\nTypeError: boom\n```' },
          { type: 14 },
          { type: 1, components: [{ type: 2, custom_id: 'moai_ask_msg', label: 'Ask Moai' }] }
        ]
      }]
    };
    const text = extractMessageText(message);
    assert.ok(text.includes('PM2 Errors'));
    assert.ok(text.includes('TypeError: boom'));
    assert.ok(!text.includes('Ask Moai')); // buttons are not text content
  });

  it('falls back to legacy plain content', () => {
    assert.equal(extractMessageText({ content: 'plain old message' }), 'plain old message');
  });

  it('returns empty string for a message with no text', () => {
    assert.equal(extractMessageText({ components: [{ type: 17, components: [{ type: 14 }] }] }), '');
    assert.equal(extractMessageText(null), '');
  });
});

describe('Moai — buildContextAskModal', () => {
  it('reuses the moai_ask_modal submit route and Label-wraps the model select plus both inputs', () => {
    const modal = buildContextAskModal('some error text');
    assert.equal(modal.custom_id, 'moai_ask_modal');
    assert.equal(modal.components.length, 3);
    for (const label of modal.components) assert.equal(label.type, 18); // Label, not ActionRow
    const [model, ctx, query] = modal.components.map(l => l.component);
    assert.equal(model.type, 3); // String Select
    assert.equal(model.custom_id, 'moai_model');
    assert.equal(ctx.type, 4);
    assert.equal(ctx.custom_id, 'moai_msg_context');
    assert.equal(ctx.required, false);
    assert.equal(ctx.value, 'some error text');
    assert.equal(query.custom_id, 'moai_query');
    assert.equal(query.required, true);
  });

  it('defaults the model select to sonnet, or re-selects a prior pick', () => {
    const fresh = buildContextAskModal('text').components[0].component;
    assert.equal(fresh.options.find(o => o.default).value, 'sonnet');
    const carried = buildContextAskModal('text', 'opus').components[0].component;
    assert.equal(carried.options.find(o => o.default).value, 'opus');
  });

  it('truncates long context under the 4000-char input cap', () => {
    const modal = buildContextAskModal('x'.repeat(5000));
    const ctx = modal.components[1].component;
    assert.ok(ctx.value.length <= ctx.max_length);
    assert.ok(ctx.value.endsWith('...'));
  });

  it('omits value entirely when the message had no text', () => {
    const ctx = buildContextAskModal('').components[1].component;
    assert.equal('value' in ctx, false);
    assert.ok(ctx.placeholder);
  });
});

describe('Moai — buildQuestionContainer (message 1 of the two-message flow)', () => {
  it('shows the asker and the full question, aligned with Ask CastBot', () => {
    const card = buildQuestionContainer({ askerName: 'Reece', query: 'why did the deploy fail?' });
    assert.equal(card.type, 17);
    const texts = card.components.filter(c => c.type === 10).map(c => c.content);
    assert.ok(texts[0].includes('🗿'));
    assert.ok(texts[0].includes('Reece'));
    assert.equal(texts[1], 'why did the deploy fail?');
  });

  it('adds a context footnote only when message context is attached', () => {
    const withCtx = buildQuestionContainer({ askerName: 'R', query: 'q', hasMsgContext: true });
    assert.ok(withCtx.components.some(c => c.type === 10 && c.content.includes('📎')));
    const without = buildQuestionContainer({ askerName: 'R', query: 'q' });
    assert.ok(!without.components.some(c => c.type === 10 && c.content.includes('📎')));
  });
});

describe('Moai — buildPrompt attached-message section', () => {
  it('includes the attached message as the subject when provided', () => {
    const prompt = buildPrompt('why did this break?', '', 'ERROR: TypeError at foo.js');
    assert.ok(prompt.includes('ATTACHED MESSAGE'));
    assert.ok(prompt.includes('ERROR: TypeError at foo.js'));
    assert.ok(prompt.includes('why did this break?'));
  });

  it('omits the section when no message context is given', () => {
    assert.ok(!buildPrompt('a question').includes('ATTACHED MESSAGE'));
    assert.ok(!buildPrompt('a question', 'prev convo').includes('ATTACHED MESSAGE'));
  });

  it('keeps the previous-conversation section independent of message context', () => {
    const prompt = buildPrompt('q', 'Q: old\nA: answer', 'card text');
    assert.ok(prompt.includes('PREVIOUS CONVERSATION'));
    assert.ok(prompt.includes('ATTACHED MESSAGE'));
  });
});
