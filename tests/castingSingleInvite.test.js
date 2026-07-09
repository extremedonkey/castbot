// Tests for the context-aware SINGLE invite (Send Offer/Decline/Alternate) + the single-modal variant +
// "Update Status Only" (status_only) offerStatus stamping. Pure logic replicated inline. RaP 0902 / 0906.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicas of the shipped pure logic ──
const CASTING_STATUS_TO_MESSAGE = { cast: 'successful', alternative: 'alternative', reject: 'unsuccessful' };
const OFFER_FOR_STATUS = { cast: 'offer', alternative: 'offer_alternative', reject: 'offer_rejected' };
const SINGLE_SEND_WORD = { successful: 'Casting Offer', alternative: 'Alternate Message', unsuccessful: 'Unsuccessful Message' };
const SEND_INVITE_LABEL = { cast: 'Send Offer', reject: 'Send Decline', alternative: 'Send Alternate' };

// castRankingManager render: the Send Invite button (label/style/disabled by castingStatus).
function sendInviteButton(castingStatus) {
  const label = SEND_INVITE_LABEL[castingStatus];
  return { label: label || 'Send Invite', style: label ? 1 /*Primary*/ : 2 /*Secondary*/, disabled: !label, emoji: '✒️' };
}

// buildCastingInvitesModal single-variant invite_mode options.
function singleModeOptions(applicantName, castingStatus) {
  const word = SINGLE_SEND_WORD[CASTING_STATUS_TO_MESSAGE[castingStatus]] || 'Message';
  const sendLabel = `Send ${applicantName || 'this applicant'} ${word}`.slice(0, 100);
  return [
    { value: 'draft', default: true },
    { value: 'selected', label: sendLabel, emoji: '📨' },
    { value: 'status_only', emoji: '🕵️' }
  ];
}

describe('Send Invite button — context-aware label/style/disabled', () => {
  it('no casting decision → grey, disabled, "Send Invite"', () => {
    assert.deepEqual(sendInviteButton(undefined), { label: 'Send Invite', style: 2, disabled: true, emoji: '✒️' });
    assert.deepEqual(sendInviteButton('tentative'), { label: 'Send Invite', style: 2, disabled: true, emoji: '✒️' }); // legacy value → treated as no decision
  });
  it('Cast → blue, active, "Send Offer"', () => {
    assert.deepEqual(sendInviteButton('cast'), { label: 'Send Offer', style: 1, disabled: false, emoji: '✒️' });
  });
  it("Don't Cast → blue, active, \"Send Decline\"", () => {
    assert.deepEqual(sendInviteButton('reject'), { label: 'Send Decline', style: 1, disabled: false, emoji: '✒️' });
  });
  it('Alternate → blue, active, "Send Alternate"', () => {
    assert.deepEqual(sendInviteButton('alternative'), { label: 'Send Alternate', style: 1, disabled: false, emoji: '✒️' });
  });
});

describe('Single invite modal — invite_mode options', () => {
  it('has exactly 3 options: draft (default), selected, status_only', () => {
    const opts = singleModeOptions('Reece', 'cast');
    assert.deepEqual(opts.map(o => o.value), ['draft', 'selected', 'status_only']);
    assert.equal(opts[0].default, true);
    assert.equal(opts[2].emoji, '🕵️');
  });
  it('the "Send {name}" label reflects the casting decision', () => {
    assert.equal(singleModeOptions('Reece', 'cast').find(o => o.value === 'selected').label, 'Send Reece Casting Offer');
    assert.equal(singleModeOptions('Reece', 'reject').find(o => o.value === 'selected').label, 'Send Reece Unsuccessful Message');
    assert.equal(singleModeOptions('Reece', 'alternative').find(o => o.value === 'selected').label, 'Send Reece Alternate Message');
  });
  it('caps the send label at 100 chars for a very long name', () => {
    const label = singleModeOptions('A'.repeat(200), 'cast').find(o => o.value === 'selected').label;
    assert.ok(label.length <= 100, `len ${label.length}`);
  });
});

describe('status_only — offerStatus stamping (castingStatus → offerStatus)', () => {
  it('maps each decision to the same offerStatus the send path would stamp', () => {
    assert.equal(OFFER_FOR_STATUS.cast, 'offer');
    assert.equal(OFFER_FOR_STATUS.alternative, 'offer_alternative');
    assert.equal(OFFER_FOR_STATUS.reject, 'offer_rejected');
  });
  it('no decision → no offerStatus to stamp (no-op)', () => {
    assert.equal(OFFER_FOR_STATUS[undefined], undefined);
    assert.equal(OFFER_FOR_STATUS.tentative, undefined);
  });
  it('is consistent with the send-path chain castingStatus → messageType → offerStatus', () => {
    // send path: castingStatus → CASTING_STATUS_TO_MESSAGE → OFFER_FOR_TYPE; status_only shortcuts to OFFER_FOR_STATUS.
    const OFFER_FOR_TYPE = { successful: 'offer', alternative: 'offer_alternative', unsuccessful: 'offer_rejected' };
    for (const status of ['cast', 'alternative', 'reject']) {
      assert.equal(OFFER_FOR_STATUS[status], OFFER_FOR_TYPE[CASTING_STATUS_TO_MESSAGE[status]], `chain for ${status}`);
    }
  });
});
