/**
 * Tests for button_modal trigger type (Button + Secret Code).
 *
 * Validates:
 * - Phrase matching logic (case-insensitive, multiple phrases)
 * - Interaction with conditions system (phrase gate + condition gate)
 * - Pass/fail outcome branching
 * - Trigger type rendering decisions (modal_launcher_ vs safari_ prefix)
 * - Action data schema for button_modal
 *
 * Tests use extracted logic patterns to avoid importing the full module graph.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Replicate phrase matching logic from modal_answer_ handler
// ---------------------------------------------------------------------------
function matchPhrase(userAnswer, phrases) {
  if (!userAnswer || !phrases || phrases.length === 0) return false;
  return phrases.some(phrase =>
    phrase.toLowerCase().trim() === userAnswer.toLowerCase().trim()
  );
}

// ---------------------------------------------------------------------------
// Replicate condition evaluation result determination
// Two gates: phrase match (pre-gate) + conditions (standard gate)
// Wrong phrase → forceConditionsFail → executeOn:'false' outcomes
// Right phrase → evaluate conditions normally
// ---------------------------------------------------------------------------
function resolveButtonModalExecution(userAnswer, phrases, conditions, conditionsResult) {
  const phraseMatch = matchPhrase(userAnswer, phrases);

  if (!phraseMatch) {
    // Wrong code → force fail, skip condition evaluation
    return { gate: 'fail', reason: 'wrong_code', conditionsEvaluated: false };
  }

  // Right code → evaluate conditions
  if (conditions && conditions.length > 0) {
    return {
      gate: conditionsResult ? 'pass' : 'fail',
      reason: conditionsResult ? 'all_gates_passed' : 'conditions_failed',
      conditionsEvaluated: true
    };
  }

  // Right code + no conditions → pass
  return { gate: 'pass', reason: 'all_gates_passed', conditionsEvaluated: false };
}

// ---------------------------------------------------------------------------
// Replicate outcome filtering from executeButtonActions
// ---------------------------------------------------------------------------
function filterOutcomes(outcomes, conditionsResult) {
  return outcomes.filter(outcome => {
    const executeOn = outcome.executeOn || 'true'; // Default to true
    return executeOn === conditionsResult.toString();
  });
}

// ---------------------------------------------------------------------------
// Replicate button rendering decision from safariButtonHelper
// ---------------------------------------------------------------------------
function getButtonCustomIdPrefix(triggerType) {
  if (triggerType === 'button_modal') return 'modal_launcher_';
  if (triggerType === 'button') return 'safari_';
  return null; // Non-renderable trigger types
}

function shouldRenderAsButton(triggerType) {
  return triggerType === 'button' || triggerType === 'button_modal' || triggerType === 'button_input';
}

// Variable substitution for display_text outcomes
function substituteVariables(text, parentAction) {
  if (!text) return text;
  if (parentAction?._triggerInput) {
    text = text.replaceAll('{triggerInput}', parentAction._triggerInput);
  }
  return text;
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('button_modal trigger — Phrase Matching', () => {
  it('matches exact phrase (case-insensitive)', () => {
    assert.ok(matchPhrase('solemnly swear', ['solemnly swear']));
    assert.ok(matchPhrase('SOLEMNLY SWEAR', ['solemnly swear']));
    assert.ok(matchPhrase('Solemnly Swear', ['solemnly swear']));
  });

  it('matches any of multiple phrases', () => {
    const phrases = ['open sesame', 'abracadabra', 'please'];
    assert.ok(matchPhrase('open sesame', phrases));
    assert.ok(matchPhrase('ABRACADABRA', phrases));
    assert.ok(matchPhrase('please', phrases));
  });

  it('rejects non-matching input', () => {
    assert.ok(!matchPhrase('wrong answer', ['correct answer']));
    assert.ok(!matchPhrase('open sesam', ['open sesame'])); // Partial match fails
  });

  it('trims whitespace', () => {
    assert.ok(matchPhrase('  open sesame  ', ['open sesame']));
    assert.ok(matchPhrase('open sesame', ['  open sesame  ']));
  });

  it('handles empty/null inputs', () => {
    assert.ok(!matchPhrase('', ['phrase']));
    assert.ok(!matchPhrase(null, ['phrase']));
    assert.ok(!matchPhrase('answer', []));
    assert.ok(!matchPhrase('answer', null));
  });
});

describe('button_modal trigger — Two-Gate Execution', () => {
  it('wrong code → fail (conditions not evaluated)', () => {
    const result = resolveButtonModalExecution(
      'wrong_code',
      ['correct_code'],
      [{ type: 'currency', operator: 'gte', value: 100 }],
      true // conditions would pass
    );
    assert.equal(result.gate, 'fail');
    assert.equal(result.reason, 'wrong_code');
    assert.equal(result.conditionsEvaluated, false);
  });

  it('right code + conditions pass → pass', () => {
    const result = resolveButtonModalExecution(
      'correct_code',
      ['correct_code'],
      [{ type: 'item', itemId: 'sword', operator: 'has' }],
      true
    );
    assert.equal(result.gate, 'pass');
    assert.equal(result.reason, 'all_gates_passed');
    assert.equal(result.conditionsEvaluated, true);
  });

  it('right code + conditions fail → fail', () => {
    const result = resolveButtonModalExecution(
      'correct_code',
      ['correct_code'],
      [{ type: 'item', itemId: 'sword', operator: 'has' }],
      false // player doesn't have item
    );
    assert.equal(result.gate, 'fail');
    assert.equal(result.reason, 'conditions_failed');
    assert.equal(result.conditionsEvaluated, true);
  });

  it('right code + no conditions → pass', () => {
    const result = resolveButtonModalExecution(
      'correct_code',
      ['correct_code'],
      [], // no conditions
      true
    );
    assert.equal(result.gate, 'pass');
    assert.equal(result.reason, 'all_gates_passed');
  });

  it('right code + null conditions → pass', () => {
    const result = resolveButtonModalExecution(
      'correct_code',
      ['correct_code'],
      null,
      true
    );
    assert.equal(result.gate, 'pass');
  });
});

describe('button_modal trigger — Outcome Filtering', () => {
  const outcomes = [
    { type: 'display_text', executeOn: 'true', config: { content: 'Welcome!' } },
    { type: 'give_currency', executeOn: 'true', config: { amount: 50 } },
    { type: 'display_text', executeOn: 'false', config: { content: 'Wrong code!' } },
    { type: 'give_currency', executeOn: 'false', config: { amount: -10 } }
  ];

  it('pass → only executeOn:true outcomes', () => {
    const result = filterOutcomes(outcomes, true);
    assert.equal(result.length, 2);
    assert.ok(result.every(o => o.executeOn === 'true'));
    assert.equal(result[0].config.content, 'Welcome!');
  });

  it('fail → only executeOn:false outcomes', () => {
    const result = filterOutcomes(outcomes, false);
    assert.equal(result.length, 2);
    assert.ok(result.every(o => o.executeOn === 'false'));
    assert.equal(result[0].config.content, 'Wrong code!');
  });

  it('default executeOn is true', () => {
    const mixed = [
      { type: 'display_text', config: { content: 'Default' } }, // No executeOn
      { type: 'display_text', executeOn: 'false', config: { content: 'Fail' } }
    ];
    const passResults = filterOutcomes(mixed, true);
    assert.equal(passResults.length, 1);
    assert.equal(passResults[0].config.content, 'Default');
  });

  it('no fail outcomes → empty array (default message shown)', () => {
    const passOnly = [
      { type: 'display_text', executeOn: 'true', config: { content: 'Success' } }
    ];
    const failResults = filterOutcomes(passOnly, false);
    assert.equal(failResults.length, 0);
  });
});

describe('button_modal trigger — Button Rendering', () => {
  it('button_modal renders as button on anchors', () => {
    assert.ok(shouldRenderAsButton('button_modal'));
  });

  it('button renders as button on anchors', () => {
    assert.ok(shouldRenderAsButton('button'));
  });

  it('modal does NOT render as button on anchors', () => {
    assert.ok(!shouldRenderAsButton('modal'));
  });

  it('schedule does NOT render as button on anchors', () => {
    assert.ok(!shouldRenderAsButton('schedule'));
  });

  it('button_modal uses modal_launcher_ prefix', () => {
    assert.equal(getButtonCustomIdPrefix('button_modal'), 'modal_launcher_');
  });

  it('button uses safari_ prefix', () => {
    assert.equal(getButtonCustomIdPrefix('button'), 'safari_');
  });

  it('modal returns null (not rendered)', () => {
    assert.equal(getButtonCustomIdPrefix('modal'), null);
  });
});

describe('button_modal trigger — Data Schema', () => {
  it('validates complete button_modal action structure', () => {
    const action = {
      id: 'secret_door_123',
      name: 'Secret Door',
      emoji: '🚪',
      trigger: {
        type: 'button_modal',
        button: { label: 'Secret Door', emoji: '🚪', style: 'Primary' },
        phrases: ['open sesame', 'friend']
      },
      actions: [
        { type: 'display_text', executeOn: 'true', config: { content: 'The door opens!' } },
        { type: 'display_text', executeOn: 'false', config: { content: 'The door remains sealed.' } }
      ],
      conditions: [],
      coordinates: ['A1', 'B2']
    };

    // Trigger type
    assert.equal(action.trigger.type, 'button_modal');

    // Has button appearance
    assert.ok(action.trigger.button);
    assert.equal(action.trigger.button.style, 'Primary');

    // Has phrases
    assert.ok(Array.isArray(action.trigger.phrases));
    assert.equal(action.trigger.phrases.length, 2);

    // Has pass and fail outcomes
    const passOutcomes = action.actions.filter(a => a.executeOn === 'true');
    const failOutcomes = action.actions.filter(a => a.executeOn === 'false');
    assert.equal(passOutcomes.length, 1);
    assert.equal(failOutcomes.length, 1);

    // Should render as button
    assert.ok(shouldRenderAsButton(action.trigger.type));
    assert.equal(getButtonCustomIdPrefix(action.trigger.type), 'modal_launcher_');
  });

  it('button_modal with conditions — triple gate', () => {
    // "Enter the right code AND have the Marauder\'s Map"
    const action = {
      trigger: {
        type: 'button_modal',
        phrases: ['i solemnly swear that i am up to no good']
      },
      conditions: [
        { type: 'item', itemId: 'marauders_map', operator: 'has' }
      ],
      actions: [
        { type: 'display_text', executeOn: 'true', config: { content: 'Mischief managed!' } },
        { type: 'display_text', executeOn: 'false', config: { content: 'Nothing happened.' } }
      ]
    };

    // Wrong code → fail
    const wrongCode = resolveButtonModalExecution(
      'expecto patronum',
      action.trigger.phrases,
      action.conditions,
      true
    );
    assert.equal(wrongCode.gate, 'fail');

    // Right code, no item → fail
    const noItem = resolveButtonModalExecution(
      'i solemnly swear that i am up to no good',
      action.trigger.phrases,
      action.conditions,
      false // conditions fail (no item)
    );
    assert.equal(noItem.gate, 'fail');
    assert.equal(noItem.reason, 'conditions_failed');

    // Right code + has item → pass
    const allGood = resolveButtonModalExecution(
      'i solemnly swear that i am up to no good',
      action.trigger.phrases,
      action.conditions,
      true // conditions pass (has item)
    );
    assert.equal(allGood.gate, 'pass');
  });
});

describe('button_modal trigger — Edge Cases', () => {
  it('no phrases configured → always fails', () => {
    const result = resolveButtonModalExecution(
      'anything',
      [], // no phrases
      [],
      true
    );
    assert.equal(result.gate, 'fail');
    assert.equal(result.reason, 'wrong_code');
  });

  it('preserves phrases when switching from modal to button_modal', () => {
    // Simulate trigger type change
    const trigger = { type: 'modal', phrases: ['existing phrase'] };
    trigger.type = 'button_modal';
    trigger.button = { label: 'Click Me', style: 'Primary' };
    // phrases should be preserved
    assert.deepEqual(trigger.phrases, ['existing phrase']);
    assert.equal(trigger.type, 'button_modal');
  });

  it('preserves button config when switching from button to button_modal', () => {
    const trigger = { type: 'button', button: { label: 'My Button', style: 'Danger' } };
    trigger.type = 'button_modal';
    trigger.phrases = [];
    // button config should be preserved
    assert.equal(trigger.button.label, 'My Button');
    assert.equal(trigger.button.style, 'Danger');
  });
});
