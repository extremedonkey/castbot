// Tests for the Casting Lifecycle Chevron (RaP 0902) — resolveCastingChevron / renderCastingChevron /
// getCastingChevron in playerStatus.js. These are pure + log-free, so we import the real functions.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCastingChevron, renderCastingChevron, getCastingChevron } from '../playerStatus.js';

// Helper: signals for resolveCastingChevron (mirrors buildStatusSignals shape).
const sig = (o = {}) => ({ hasApplication: true, voteCount: 0, ...o });

describe('Chevron — resolveCastingChevron (segment + precedence)', () => {
  it('no application → null', () => {
    assert.equal(resolveCastingChevron({ hasApplication: false }), null);
    assert.equal(resolveCastingChevron({}), null);
  });
  it('New (app only) → index 0', () => {
    assert.deepEqual(resolveCastingChevron(sig()), { index: 0, emoji: '📝', label: 'New App', terminal: false });
  });
  it('Application Complete → index 1 (via completedAt OR submitted)', () => {
    assert.equal(resolveCastingChevron(sig({ completedAt: '2026-01-01' })).index, 1);
    assert.equal(resolveCastingChevron(sig({ submitted: true })).index, 1);
    assert.equal(resolveCastingChevron(sig({ submitted: true })).label, 'App Submission');
  });
  it('has votes → index 2 Casting Review', () => {
    assert.deepEqual(resolveCastingChevron(sig({ submitted: true, voteCount: 3 })),
      { index: 2, emoji: '🎥', label: 'Casting Review', terminal: false });
  });
  it('offer sent → index 3 (variants); offer_rejected is terminal', () => {
    assert.equal(resolveCastingChevron(sig({ voteCount: 2, offerStatus: 'offer' })).emoji, '🦸');
    assert.equal(resolveCastingChevron(sig({ offerStatus: 'offer_alternative' })).label, 'Alternate Offer');
    const rej = resolveCastingChevron(sig({ offerStatus: 'offer_rejected' }));
    assert.deepEqual(rej, { index: 3, emoji: '🙅', label: 'Not Cast', terminal: true });
  });
  it('placement response → index 4 (all terminal), incl. accepted_alternative', () => {
    assert.deepEqual(resolveCastingChevron(sig({ placementResponse: 'accepted' })),
      { index: 4, emoji: '🎉', label: 'Casting Accepted', terminal: true });
    assert.equal(resolveCastingChevron(sig({ placementResponse: 'accepted_alternative' })).label, 'Accepted (Alternate)');
    assert.equal(resolveCastingChevron(sig({ placementResponse: 'declined' })).emoji, '🚫');
  });
  it('withdrawn overrides everything (even placement)', () => {
    const r = resolveCastingChevron(sig({ withdrawn: true, submitted: true, placementResponse: 'accepted' }));
    assert.deepEqual(r, { withdrawn: true, completed: true });
  });
  it('precedence: placement > offer > votes > complete > new', () => {
    // offer set AND votes set → offer wins (index 3, not 2)
    assert.equal(resolveCastingChevron(sig({ voteCount: 5, offerStatus: 'offer' })).index, 3);
    // placement set AND offer set → placement wins (index 4)
    assert.equal(resolveCastingChevron(sig({ offerStatus: 'offer', placementResponse: 'accepted' })).index, 4);
  });
});

describe('Chevron — renderCastingChevron (formatting rules)', () => {
  it('null → empty string', () => {
    assert.equal(renderCastingChevron(null), '');
  });
  it('New — current chip + all future spoilered', () => {
    assert.equal(renderCastingChevron(resolveCastingChevron(sig())),
      '-# **`📝 New App`** ▷ ||App Submission|| ▷ ||Casting Review|| ▷ ||Casting Offer|| ▷ ||Casting Accepted||');
  });
  it('Casting Review — reached plain, current chip, future spoilered', () => {
    assert.equal(renderCastingChevron(resolveCastingChevron(sig({ submitted: true, voteCount: 1 }))),
      '-# New App ▶ App Submission ▶ **`🎥 Casting Review`** ▷ ||Casting Offer|| ▷ ||Casting Accepted||');
  });
  it('Offer (non-terminal) — one spoiler remains', () => {
    assert.equal(renderCastingChevron(resolveCastingChevron(sig({ voteCount: 2, offerStatus: 'offer' }))),
      '-# New App ▶ App Submission ▶ Casting Review ▶ **`🦸 Casting Offer`** ▷ ||Casting Accepted||');
  });
  it('Accepted — full trail, no future', () => {
    assert.equal(renderCastingChevron(resolveCastingChevron(sig({ placementResponse: 'accepted' }))),
      '-# New App ▶ App Submission ▶ Casting Review ▶ Casting Offer ▶ **`🎉 Casting Accepted`**');
  });
  it('adaptive terminal — Not Cast drops the unreachable future (no spoilers)', () => {
    const out = renderCastingChevron(resolveCastingChevron(sig({ offerStatus: 'offer_rejected' })));
    assert.equal(out, '-# New App ▶ App Submission ▶ Casting Review ▶ **`🙅 Not Cast`**');
    assert.ok(!out.includes('||'), 'no spoilers on a terminal-negative chevron');
  });
  it('adaptive terminal — Declined', () => {
    assert.equal(renderCastingChevron(resolveCastingChevron(sig({ placementResponse: 'declined' }))),
      '-# New App ▶ App Submission ▶ Casting Review ▶ Casting Offer ▶ **`🚫 Casting Declined`**');
  });
  it('withdrawn — completed shows New ▶ Submission ▶ Withdrawn; not-completed shows New ▶ Withdrawn', () => {
    assert.equal(renderCastingChevron({ withdrawn: true, completed: true }),
      '-# New App ▶ App Submission ▶ **`✖️ Withdrawn`**');
    assert.equal(renderCastingChevron({ withdrawn: true, completed: false }),
      '-# New App ▶ **`✖️ Withdrawn`**');
  });
});

describe('Chevron — getCastingChevron (app record → line, end to end)', () => {
  it('app with rankings → Casting Review', () => {
    const out = getCastingChevron({ rankings: { a: 5, b: 4 }, completedAt: '2026-01-01' }, '☑️someone-app');
    assert.ok(out.includes('**`🎥 Casting Review`**'));
  });
  it('app with offerStatus → Casting Offer', () => {
    const out = getCastingChevron({ offerStatus: 'offer', rankings: { a: 5 } }, '☑️x-app');
    assert.ok(out.includes('**`🦸 Casting Offer`**'));
  });
  it('withdrawn live channel → Withdrawn regardless of stored state', () => {
    const out = getCastingChevron({ placementResponse: 'accepted', completedAt: '2026-01-01' }, '✖️gone-app');
    assert.equal(out, '-# New App ▶ App Submission ▶ **`✖️ Withdrawn`**');
  });
  it('null app → empty string', () => {
    assert.equal(getCastingChevron(null, ''), '');
  });
});

describe('Chevron — offerStatus mapping (sendCastingInvites replica)', () => {
  // Replica of OFFER_FOR_TYPE in castRankingManager.sendCastingInvites — invite messageType → offerStatus.
  const OFFER_FOR_TYPE = { successful: 'offer', alternative: 'offer_alternative', unsuccessful: 'offer_rejected' };
  it('maps each send messageType to the right offerStatus', () => {
    assert.equal(OFFER_FOR_TYPE.successful, 'offer');
    assert.equal(OFFER_FOR_TYPE.alternative, 'offer_alternative');
    assert.equal(OFFER_FOR_TYPE.unsuccessful, 'offer_rejected');
  });
});
