/**
 * Scheduled Custom Action — result classification (app.js execute_custom_action handler)
 *
 * Regression test for the "returned error: unknown" bug: the scheduler used to treat
 * ANY result carrying the EPHEMERAL flag as an error, but executeButtonActions
 * (safariManager.js) sets EPHEMERAL on EVERY return path — success included — because
 * its interactive callers reply privately. The only failure signal in its contract is
 * an ❌-prefixed content string. That misclassification silently discarded the output
 * of every scheduled action (webhook post skipped).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const EPHEMERAL = 64;          // InteractionResponseFlags.EPHEMERAL
const IS_COMPONENTS_V2 = 1 << 15;

// Replicated from app.js execute_custom_action handler (pure logic)
function classifyScheduledResult(result) {
  const isError = typeof result?.content === 'string' && result.content.startsWith('❌');
  if (isError) return 'error';
  if (!result?.components && !result?.content) return 'no_output';
  return 'post';
}

// --- Real return shapes of executeButtonActions (safariManager.js) ---

// Success with rendered outcomes (e.g. display_text) — components, NO content
const successBundle = {
  flags: IS_COMPONENTS_V2 | EPHEMERAL,
  components: [{ type: 17, components: [{ type: 10, content: 'asdas' }] }]
};

// Success with no content-producing outcomes
const successPlain = { content: '✅ Button action completed successfully!', flags: EPHEMERAL };

// Conditions met but no outcomes configured
const successNoOutcomes = { content: '✅ Conditions met, but no actions are configured for this state.', flags: EPHEMERAL };

// Failure shapes
const errNotFound = { content: '❌ Button not found.', flags: EPHEMERAL };
const errRequirements = { content: '❌ You do not meet the requirements for this action.', flags: EPHEMERAL };
const errExecution = { content: '❌ Error executing button actions. Please try again.', flags: EPHEMERAL };

describe('Scheduled Custom Action — result classification', () => {
  it('posts a successful component bundle despite the EPHEMERAL flag (the original bug)', () => {
    assert.equal(classifyScheduledResult(successBundle), 'post');
  });

  it('posts plain ✅ success content despite the EPHEMERAL flag', () => {
    assert.equal(classifyScheduledResult(successPlain), 'post');
    assert.equal(classifyScheduledResult(successNoOutcomes), 'post');
  });

  it('classifies all ❌-prefixed returns as errors (webhook skipped)', () => {
    assert.equal(classifyScheduledResult(errNotFound), 'error');
    assert.equal(classifyScheduledResult(errRequirements), 'error');
    assert.equal(classifyScheduledResult(errExecution), 'error');
  });

  it('skips the webhook when there is nothing to post', () => {
    assert.equal(classifyScheduledResult(undefined), 'no_output');
    assert.equal(classifyScheduledResult(null), 'no_output');
    assert.equal(classifyScheduledResult({ flags: EPHEMERAL }), 'no_output');
  });

  it('does not crash on a components-only result when checking content prefix', () => {
    // content is undefined on bundles — startsWith must not be called on undefined
    assert.doesNotThrow(() => classifyScheduledResult(successBundle));
  });
});
