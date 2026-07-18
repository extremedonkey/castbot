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
  buildPrompt
} from '../moai.js';

describe('Moai — isMoaiEnvironment (DEV/TEST only)', () => {
  it('is true when PRODUCTION is not TRUE', () => {
    const prev = process.env.PRODUCTION;
    delete process.env.PRODUCTION;
    assert.equal(isMoaiEnvironment(), true);
    if (prev !== undefined) process.env.PRODUCTION = prev;
  });

  it('is false in production', () => {
    const prev = process.env.PRODUCTION;
    process.env.PRODUCTION = 'TRUE';
    assert.equal(isMoaiEnvironment(), false);
    if (prev === undefined) delete process.env.PRODUCTION;
    else process.env.PRODUCTION = prev;
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
  it('reuses the moai_ask_modal submit route and Label-wraps both inputs', () => {
    const modal = buildContextAskModal('some error text');
    assert.equal(modal.custom_id, 'moai_ask_modal');
    assert.equal(modal.components.length, 2);
    for (const label of modal.components) assert.equal(label.type, 18); // Label, not ActionRow
    const [ctx, query] = modal.components.map(l => l.component);
    assert.equal(ctx.type, 4);
    assert.equal(ctx.custom_id, 'moai_msg_context');
    assert.equal(ctx.required, false);
    assert.equal(ctx.value, 'some error text');
    assert.equal(query.custom_id, 'moai_query');
    assert.equal(query.required, true);
  });

  it('truncates long context under the 4000-char input cap', () => {
    const modal = buildContextAskModal('x'.repeat(5000));
    const ctx = modal.components[0].component;
    assert.ok(ctx.value.length <= ctx.max_length);
    assert.ok(ctx.value.endsWith('...'));
  });

  it('omits value entirely when the message had no text', () => {
    const ctx = buildContextAskModal('').components[0].component;
    assert.equal('value' in ctx, false);
    assert.ok(ctx.placeholder);
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
