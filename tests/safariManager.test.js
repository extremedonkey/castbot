/**
 * safariManager — getCustomButton id backfill + follow-up custom_id integrity
 *
 * Regression for the "safari_{guild}_undefined_{ts}" bug: actions created via the
 * modern creation flow (app.js global_create_modal, ~48041) and the clone flow
 * (~48222) are stored WITHOUT an `id` property (legacy createCustomButton sets one).
 * executeFollowUpButton builds custom_ids from button.id → literal `undefined` →
 * clicking the follow-up button fails with "Button not found".
 * Fix: getCustomButton backfills `id` from the storage key (the authoritative id).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicated from safariManager.js getCustomButton (backfill core)
function lookupWithBackfill(buttons, buttonId) {
  const button = buttons?.[buttonId] || null;
  if (button && !button.id) {
    button.id = buttonId;
  }
  return button;
}

// Replicated from safariManager.js executeFollowUpButton custom_id selection
function followUpCustomId(guildId, followUpButton, now) {
  const isModalTriggered = ['modal', 'button_modal', 'button_input'].includes(followUpButton.trigger?.type);
  return isModalTriggered
    ? `modal_launcher_${guildId}_${followUpButton.id}_${now}`
    : `safari_${guildId}_${followUpButton.id}_${now}`;
}

describe('getCustomButton — id backfill from storage key', () => {
  it('backfills missing id (modern creation flow stores none)', () => {
    const buttons = { the_timer_1783848877767: { name: 'the timer', label: 'the timer', trigger: { type: 'schedule' } } };
    const b = lookupWithBackfill(buttons, 'the_timer_1783848877767');
    assert.equal(b.id, 'the_timer_1783848877767');
  });

  it('never overwrites an existing id (legacy createCustomButton sets one)', () => {
    const buttons = { ngg_815311: { id: 'ngg_815311', label: 'NGG' } };
    assert.equal(lookupWithBackfill(buttons, 'ngg_815311').id, 'ngg_815311');
  });

  it('missing button still returns null', () => {
    assert.equal(lookupWithBackfill({}, 'nope'), null);
    assert.equal(lookupWithBackfill(undefined, 'nope'), null);
  });
});

describe('executeFollowUpButton — custom_id integrity', () => {
  it('schedule-trigger target produces a valid safari_ custom_id after backfill', () => {
    const buttons = { the_timer_1: { name: 'timer', trigger: { type: 'schedule' } } };
    const target = lookupWithBackfill(buttons, 'the_timer_1');
    const id = followUpCustomId('g1', target, 123);
    assert.equal(id, 'safari_g1_the_timer_1_123');
    assert.ok(!id.includes('undefined'));
  });

  it('modal-family targets keep the modal_launcher_ prefix', () => {
    const buttons = { quiz_1: { name: 'quiz', trigger: { type: 'button_modal' } } };
    const target = lookupWithBackfill(buttons, 'quiz_1');
    assert.ok(followUpCustomId('g1', target, 5).startsWith('modal_launcher_g1_quiz_1_'));
  });
});
