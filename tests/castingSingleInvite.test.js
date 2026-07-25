// Tests for the context-aware SINGLE invite (Send Offer/Decline/Alternate) + the single-modal variant +
// "Update Status Only" (status_only) offerStatus stamping. Pure logic replicated inline. RaP 0902 / 0906.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicas of the shipped pure logic ──
const CASTING_STATUS_TO_MESSAGE = { cast: 'successful', alternative: 'alternative', reject: 'unsuccessful' };
const OFFER_FOR_STATUS = { cast: 'offer', alternative: 'offer_alternative', reject: 'offer_rejected' };
const ACCEPTED_RESPONSE_FOR_STATUS = { cast: 'accepted', alternative: 'accepted_alternative' };
const SINGLE_SEND_WORD = { successful: 'Casting Offer', alternative: 'Alternate Message', unsuccessful: 'Unsuccessful Message' };
const SEND_INVITE_LABEL = { cast: 'Send Offer', reject: 'Send Decline', alternative: 'Send Alternate' };

// castRankingManager render: the Send Invite button (label/style/disabled by castingStatus).
function sendInviteButton(castingStatus) {
  const label = SEND_INVITE_LABEL[castingStatus];
  return { label: label || 'Send Invite', style: label ? 1 /*Primary*/ : 2 /*Secondary*/, disabled: !label, emoji: '✒️' };
}

// buildCastingInvitesModal single-variant invite_mode options. "Offered" for Cast/Alternate, "Notified"
// for Don't Cast (no spot to "offer"); the Accepted option only appears where an accept state exists.
function singleModeOptions(applicantName, castingStatus) {
  const messageType = CASTING_STATUS_TO_MESSAGE[castingStatus];
  const word = SINGLE_SEND_WORD[messageType] || 'Message';
  const sendLabel = `Send ${applicantName || 'this applicant'} ${word}`.slice(0, 100);
  const offeredLabel = messageType === 'unsuccessful' ? 'Update Status Only - Notified' : 'Update Status Only - Offered';
  const opts = [
    { value: 'draft', default: true },
    { value: 'selected', label: sendLabel, emoji: '📨' },
    { value: 'status_only', label: offeredLabel, emoji: '🕵️' }
  ];
  if (ACCEPTED_RESPONSE_FOR_STATUS[castingStatus]) {
    opts.push({ value: 'status_only_accepted', label: 'Update Status Only - Accepted', emoji: '🎉' });
  }
  return opts;
}

// Mirrors applyStatusOnlyUpdate (castRankingManager.js) — the shared write behind BOTH status_only
// variants, mutating a fake playerData tree in place (caller saves).
function applyStatusOnlyUpdate(playerData, guildId, app, recordAccepted) {
  const rec = app ? playerData[guildId]?.applications?.[app.channelId] : null;
  const offer = rec ? OFFER_FOR_STATUS[rec.castingStatus] : null;
  if (!rec || !offer) return { ok: false, error: 'no-decision' };
  const acceptedValue = recordAccepted ? ACCEPTED_RESPONSE_FOR_STATUS[rec.castingStatus] : null;
  if (recordAccepted && !acceptedValue) return { ok: false, error: 'no-accepted-state' };
  rec.offerStatus = offer;
  rec.offerSentAt = 'NOW';
  if (acceptedValue) rec.placementResponse = acceptedValue;
  return { ok: true, name: app.displayName || app.username || 'Applicant' };
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
  it('Cast/Alternate get 4 options: draft, selected, status_only (Offered), status_only_accepted', () => {
    for (const status of ['cast', 'alternative']) {
      const opts = singleModeOptions('Reece', status);
      assert.deepEqual(opts.map(o => o.value), ['draft', 'selected', 'status_only', 'status_only_accepted'], status);
      assert.equal(opts[0].default, true);
      assert.equal(opts[2].label, 'Update Status Only - Offered');
      assert.equal(opts[3].label, 'Update Status Only - Accepted');
      assert.equal(opts[3].emoji, '🎉');
    }
  });
  it("Don't Cast gets only 3 options — no accepted state, so no status_only_accepted", () => {
    const opts = singleModeOptions('Reece', 'reject');
    assert.deepEqual(opts.map(o => o.value), ['draft', 'selected', 'status_only']);
    assert.equal(opts[2].label, 'Update Status Only - Notified'); // not "Offered" — no spot exists to offer
  });
  it('undecided (no castingStatus) also gets only 3 options, generic "Offered" label', () => {
    const opts = singleModeOptions('Reece', undefined);
    assert.deepEqual(opts.map(o => o.value), ['draft', 'selected', 'status_only']);
    assert.equal(opts[2].label, 'Update Status Only - Offered');
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

describe('status_only_accepted — ACCEPTED_RESPONSE_FOR_STATUS mapping', () => {
  it('maps to the SAME placementResponse values a real Accept click writes', () => {
    // placement_accept handler (app.js): accepted ? (offerType === 'alternative' ? 'accepted_alternative' : 'accepted') : 'declined'
    assert.equal(ACCEPTED_RESPONSE_FOR_STATUS.cast, 'accepted');
    assert.equal(ACCEPTED_RESPONSE_FOR_STATUS.alternative, 'accepted_alternative');
  });
  it('Don\'t Cast has NO accepted state — deliberately absent, not mapped to null/undefined by convention', () => {
    assert.equal('reject' in ACCEPTED_RESPONSE_FOR_STATUS, false);
    assert.equal(ACCEPTED_RESPONSE_FOR_STATUS.reject, undefined);
  });
});

describe('applyStatusOnlyUpdate — the shared write behind both status_only variants', () => {
  const app = { channelId: 'ch1', displayName: 'Reece', username: 'reece' };
  function fixture(castingStatus) {
    return { g1: { applications: { ch1: { castingStatus } } } };
  }

  it('"Offered" (recordAccepted=false) stamps offerStatus/offerSentAt only', () => {
    const pd = fixture('cast');
    const r = applyStatusOnlyUpdate(pd, 'g1', app, false);
    assert.deepEqual(r, { ok: true, name: 'Reece' });
    assert.equal(pd.g1.applications.ch1.offerStatus, 'offer');
    assert.equal(pd.g1.applications.ch1.offerSentAt, 'NOW');
    assert.equal(pd.g1.applications.ch1.placementResponse, undefined);
  });

  it('"Accepted" (recordAccepted=true) stamps offerStatus AND placementResponse', () => {
    const pd = fixture('alternative');
    const r = applyStatusOnlyUpdate(pd, 'g1', app, true);
    assert.equal(r.ok, true);
    assert.equal(pd.g1.applications.ch1.offerStatus, 'offer_alternative');
    assert.equal(pd.g1.applications.ch1.placementResponse, 'accepted_alternative');
  });

  it('Cast + Accepted writes plain "accepted" (not "accepted_alternative")', () => {
    const pd = fixture('cast');
    applyStatusOnlyUpdate(pd, 'g1', app, true);
    assert.equal(pd.g1.applications.ch1.placementResponse, 'accepted');
  });

  it("Don't Cast + recordAccepted=true is rejected — no accepted state exists (defensive, UI shouldn't offer this)", () => {
    const pd = fixture('reject');
    const r = applyStatusOnlyUpdate(pd, 'g1', app, true);
    assert.equal(r.ok, false);
    assert.equal(pd.g1.applications.ch1.placementResponse, undefined); // no partial write
    assert.equal(pd.g1.applications.ch1.offerStatus, undefined); // atomic — Offered wasn't stamped either
  });

  it("Don't Cast + recordAccepted=false still works fine (the '- Notified' option)", () => {
    const pd = fixture('reject');
    const r = applyStatusOnlyUpdate(pd, 'g1', app, false);
    assert.equal(r.ok, true);
    assert.equal(pd.g1.applications.ch1.offerStatus, 'offer_rejected');
  });

  it('no casting decision at all → rejected, nothing written', () => {
    const pd = fixture(undefined);
    const r = applyStatusOnlyUpdate(pd, 'g1', app, false);
    assert.equal(r.ok, false);
  });

  it('missing/out-of-range app → rejected without throwing', () => {
    const pd = fixture('cast');
    assert.equal(applyStatusOnlyUpdate(pd, 'g1', undefined, false).ok, false);
  });

  it('falls back to username when displayName is missing, then to "Applicant"', () => {
    const pd = fixture('cast');
    assert.equal(applyStatusOnlyUpdate(pd, 'g1', { channelId: 'ch1', username: 'reece' }, false).name, 'reece');
    assert.equal(applyStatusOnlyUpdate(pd, 'g1', { channelId: 'ch1' }, false).name, 'Applicant');
  });
});
