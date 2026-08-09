// Tests for BULK "Update Status Only" on the ✒️ Bulk Offers modal (Marooning tab) — the options,
// the mode parser, and the bulk writer's invariants.
//
// Why this matters: these are the first code paths able to write offerStatus / placementResponse to
// MANY records at once. The single-applicant path has been the model's only real validator; a bulk
// writer that got it wrong could produce impossible states (accepted with no offer, an "accepted"
// Don't Cast) across a whole cast in one click.
//
// buildCastingInvitesModal / parseInviteMode / applyStatusOnlyUpdate are imported for real where
// they're pure; the locked bulk cycle is replicated inline (it needs storage.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_MODE_OPTIONS,
  parseInviteMode,
  applyStatusOnlyUpdate,
  buildStatusOnlySummary,
  buildInvitesConfirm,
  OFFER_FOR_STATUS,
  ACCEPTED_RESPONSE_FOR_STATUS
} from '../castRankingManager.js';

describe('Bulk invite modal — the option list', () => {
  it('has 12 options and Save as draft is the only default', () => {
    assert.equal(BULK_MODE_OPTIONS.length, 12);
    const defaults = BULK_MODE_OPTIONS.filter(o => o.default);
    assert.deepEqual(defaults.map(o => o.value), ['draft']);
  });

  it('NO LONGER offers "currently selected applicant" — bulk always ran it against applicant #0', () => {
    // The Marooning button hardcodes appIndex = 0, so this option fired at whoever sorted first.
    assert.equal(BULK_MODE_OPTIONS.some(o => o.value === 'selected'), false);
    assert.equal(BULK_MODE_OPTIONS.some(o => /currently selected/i.test(o.label)), false);
  });

  it('keeps the send values stable — they double as message-type keys in selectInviteTargets', () => {
    const sendValues = BULK_MODE_OPTIONS.map(o => o.value).filter(v => !v.startsWith('mark_') && v !== 'draft');
    assert.deepEqual(sendValues, ['all', 'successful', 'alternative', 'unsuccessful']);
  });

  it('offers a mark option for every group, offered and accepted', () => {
    const markValues = BULK_MODE_OPTIONS.map(o => o.value).filter(v => v.startsWith('mark_'));
    assert.deepEqual(markValues, [
      'mark_offered_all', 'mark_accepted_all',
      'mark_offered_cast', 'mark_accepted_cast',
      'mark_offered_alt', 'mark_accepted_alt',
      'mark_offered_reject'
    ]);
  });

  it('labels name the DECISION, not the internal template name', () => {
    const labels = BULK_MODE_OPTIONS.map(o => o.label).join(' | ');
    assert.match(labels, /Cast/);
    assert.match(labels, /Alternate/);
    assert.match(labels, /Don't Cast/);
    // "Successful"/"Unsuccessful"/"Alternative" are template names — hosts think in decisions.
    assert.doesNotMatch(labels, /Successful/);
    assert.doesNotMatch(labels, /Alternative/);
  });

  it('every option has a description, within Discord\'s 100-char cap', () => {
    for (const o of BULK_MODE_OPTIONS) {
      assert.ok(o.description, `${o.value} has no description`);
      assert.ok(o.description.length <= 100, `${o.value}: ${o.description.length} chars`);
      assert.ok(o.label.length <= 100, `${o.value}: label ${o.label.length} chars`);
    }
  });

  it('EVERY mark description says no message is sent', () => {
    // These sit one row below options that DO message the whole cast. The difference must be
    // legible without reading the label twice — an accept option that only said "as if they
    // clicked Accept" shipped in the first draft and read like it might notify them.
    for (const o of BULK_MODE_OPTIONS.filter(o => o.value.startsWith('mark_'))) {
      assert.match(o.description, /\b[Nn]o messages?\b/,
        `${o.value} must state that nothing is sent — got "${o.description}"`);
    }
  });

  it('no SEND description claims to be silent', () => {
    for (const o of BULK_MODE_OPTIONS.filter(o => !o.value.startsWith('mark_') && o.value !== 'draft')) {
      assert.doesNotMatch(o.description, /[Nn]o messages? sent/, o.value);
    }
  });
});

describe('parseInviteMode', () => {
  it('maps every mark value to the right scope and accept flag', () => {
    assert.deepEqual(parseInviteMode('mark_offered_all'), { kind: 'mark', scope: 'all', recordAccepted: false });
    assert.deepEqual(parseInviteMode('mark_accepted_all'), { kind: 'mark', scope: 'all', recordAccepted: true });
    assert.deepEqual(parseInviteMode('mark_offered_cast'), { kind: 'mark', scope: 'successful', recordAccepted: false });
    assert.deepEqual(parseInviteMode('mark_accepted_cast'), { kind: 'mark', scope: 'successful', recordAccepted: true });
    assert.deepEqual(parseInviteMode('mark_offered_alt'), { kind: 'mark', scope: 'alternative', recordAccepted: false });
    assert.deepEqual(parseInviteMode('mark_accepted_alt'), { kind: 'mark', scope: 'alternative', recordAccepted: true });
    assert.deepEqual(parseInviteMode('mark_offered_reject'), { kind: 'mark', scope: 'unsuccessful', recordAccepted: false });
  });

  it('scopes are expressed in selectInviteTargets\' existing vocabulary, so one selector serves both', () => {
    const scopes = BULK_MODE_OPTIONS.map(o => parseInviteMode(o.value).scope).filter(Boolean);
    for (const s of scopes) assert.ok(['all', 'successful', 'alternative', 'unsuccessful', 'selected'].includes(s), s);
  });

  it('send modes pass through unchanged', () => {
    for (const v of ['all', 'successful', 'alternative', 'unsuccessful']) {
      assert.deepEqual(parseInviteMode(v), { kind: 'send', scope: v, recordAccepted: false });
    }
  });

  it('the single-applicant "selected" mode is still a send', () => {
    assert.equal(parseInviteMode('selected').kind, 'send');
  });

  it('anything unrecognised degrades to draft — never to a destructive action', () => {
    for (const v of ['draft', 'status_only', 'nonsense', '', null, undefined, 'mark_offered_nobody', 'mark_deleted_all']) {
      assert.equal(parseInviteMode(v).kind, 'draft', `${v} should be inert`);
      assert.equal(parseInviteMode(v).recordAccepted, false);
    }
  });
});

// ── Replica of the applyStatusOnlyBulkLocked loop (the lock/save needs storage.js) ──
function bulkApply(playerData, guildId, apps, recordAccepted) {
  const out = { updated: [], accepted: [], skipped: [] };
  for (const app of apps) {
    let r = applyStatusOnlyUpdate(playerData, guildId, app, recordAccepted);
    if (!r.ok && recordAccepted) {
      const fallback = applyStatusOnlyUpdate(playerData, guildId, app, false);
      if (fallback.ok) { out.updated.push(fallback.name); continue; }
      r = fallback;
    }
    if (r.ok) (recordAccepted ? out.accepted : out.updated).push(r.name);
    else out.skipped.push({ name: app.displayName || 'Applicant', error: r.error });
  }
  return out;
}

const GUILD = 'g1';
function fixture() {
  return {
    [GUILD]: {
      applications: {
        c1: { userId: 'u1', castingStatus: 'cast' },
        c2: { userId: 'u2', castingStatus: 'alternative' },
        c3: { userId: 'u3', castingStatus: 'reject' },
        c4: { userId: 'u4' } // undecided
      }
    }
  };
}
const APP = (channelId, displayName) => ({ channelId, displayName });

describe('Bulk status writer — what it writes', () => {
  it('"Mark as Offered" stamps offerStatus + offerSentAt, never placementResponse', () => {
    const pd = fixture();
    const r = bulkApply(pd, GUILD, [APP('c1', 'A'), APP('c2', 'B'), APP('c3', 'C')], false);
    assert.deepEqual(r.updated, ['A', 'B', 'C']);
    assert.equal(pd[GUILD].applications.c1.offerStatus, 'offer');
    assert.equal(pd[GUILD].applications.c2.offerStatus, 'offer_alternative');
    assert.equal(pd[GUILD].applications.c3.offerStatus, 'offer_rejected');
    for (const c of ['c1', 'c2', 'c3']) {
      assert.ok(pd[GUILD].applications[c].offerSentAt, `${c} missing offerSentAt`);
      assert.equal(pd[GUILD].applications[c].placementResponse, undefined);
    }
  });

  it('"Mark as Offered + Accepted" writes the same values a real Accept click would', () => {
    const pd = fixture();
    const r = bulkApply(pd, GUILD, [APP('c1', 'A'), APP('c2', 'B')], true);
    assert.deepEqual(r.accepted, ['A', 'B']);
    assert.equal(pd[GUILD].applications.c1.placementResponse, 'accepted');
    assert.equal(pd[GUILD].applications.c2.placementResponse, 'accepted_alternative');
  });

  it('a Don\'t Cast applicant in an "Accepted" run falls back to notified, NOT an error', () => {
    // "Mark everyone as Offered + Accepted" includes Don't Cast; they have no accepted state, so
    // they should still get their offerStatus rather than failing the whole group.
    const pd = fixture();
    const r = bulkApply(pd, GUILD, [APP('c1', 'A'), APP('c3', 'C')], true);
    assert.deepEqual(r.accepted, ['A']);
    assert.deepEqual(r.updated, ['C'], 'Don\'t Cast reported as merely offered/notified');
    assert.equal(r.skipped.length, 0);
    assert.equal(pd[GUILD].applications.c3.offerStatus, 'offer_rejected');
    assert.equal(pd[GUILD].applications.c3.placementResponse, undefined, 'never "accepts" a rejection');
  });

  it('an undecided applicant is skipped and REPORTED, never silently dropped', () => {
    const pd = fixture();
    const r = bulkApply(pd, GUILD, [APP('c1', 'A'), APP('c4', 'D')], false);
    assert.deepEqual(r.updated, ['A']);
    assert.equal(r.skipped.length, 1);
    assert.equal(r.skipped[0].name, 'D');
    assert.equal(pd[GUILD].applications.c4.offerStatus, undefined);
  });

  it('one bad record does not abort the batch', () => {
    const pd = fixture();
    const r = bulkApply(pd, GUILD, [APP('c4', 'D'), APP('c1', 'A'), APP('c2', 'B')], false);
    assert.deepEqual(r.updated, ['A', 'B'], 'the failure was first and the rest still ran');
  });

  it('an existing acceptance SURVIVES a plain "Mark as Offered"', () => {
    const pd = fixture();
    pd[GUILD].applications.c1.placementResponse = 'accepted';
    bulkApply(pd, GUILD, [APP('c1', 'A')], false);
    assert.equal(pd[GUILD].applications.c1.placementResponse, 'accepted');
  });

  it('an empty target list writes nothing and reports nothing', () => {
    const pd = fixture();
    assert.deepEqual(bulkApply(pd, GUILD, [], false), { updated: [], accepted: [], skipped: [] });
  });
});

describe('Bulk status writer — invariants that keep the model coherent', () => {
  it('every written offerStatus equals OFFER_FOR_STATUS[castingStatus]', () => {
    const pd = fixture();
    bulkApply(pd, GUILD, [APP('c1'), APP('c2'), APP('c3')], true);
    for (const c of ['c1', 'c2', 'c3']) {
      const rec = pd[GUILD].applications[c];
      assert.equal(rec.offerStatus, OFFER_FOR_STATUS[rec.castingStatus], c);
    }
  });

  it('placementResponse is only ever the mapped accept value for that decision', () => {
    const pd = fixture();
    bulkApply(pd, GUILD, [APP('c1'), APP('c2'), APP('c3')], true);
    for (const c of ['c1', 'c2', 'c3']) {
      const rec = pd[GUILD].applications[c];
      if (rec.placementResponse !== undefined) {
        assert.equal(rec.placementResponse, ACCEPTED_RESPONSE_FOR_STATUS[rec.castingStatus], c);
      }
    }
  });

  it('never writes placementResponse without an offerStatus behind it', () => {
    const pd = fixture();
    bulkApply(pd, GUILD, [APP('c1'), APP('c2'), APP('c3'), APP('c4')], true);
    for (const rec of Object.values(pd[GUILD].applications)) {
      if (rec.placementResponse) assert.ok(rec.offerStatus, 'accepted with no offer is an impossible state');
    }
  });

  it('never invents a casting status', () => {
    const pd = fixture();
    bulkApply(pd, GUILD, [APP('c4')], true);
    assert.equal(pd[GUILD].applications.c4.castingStatus, undefined);
  });
});

describe('Confirm card — marks must not read like sends', () => {
  const targets = [
    { channelId: 'c1', messageType: 'successful' },
    { channelId: 'c2', messageType: 'alternative' }
  ];
  const textOf = (r) => r.components[0].components.filter(c => c.type === 10).map(c => c.content).join('\n');
  const buttons = (r) => (r.components[0].components.find(c => c.type === 1)?.components) || [];

  it('a mark says no messages are sent, and confirms "Update"', () => {
    const r = buildInvitesConfirm({ mode: 'mark_accepted_all', appIndex: 0, configId: 'cfg', targets });
    assert.match(textOf(r), /Update Statuses\?/);
    assert.match(textOf(r), /No messages are sent/);
    assert.equal(buttons(r)[1].label, 'Confirm Update');
  });

  it('a send still warns that it pings people', () => {
    const r = buildInvitesConfirm({ mode: 'all', appIndex: 0, configId: 'cfg', targets });
    assert.match(textOf(r), /Send Casting Invites\?/);
    assert.match(textOf(r), /pings each applicant/);
    assert.equal(buttons(r)[1].label, 'Confirm Send');
  });

  it('carries the mode through to the confirm button so the write matches what was shown', () => {
    const r = buildInvitesConfirm({ mode: 'mark_offered_cast', appIndex: 0, configId: 'cfg', targets });
    assert.equal(buttons(r)[1].custom_id, 'casting_invites_confirm:mark_offered_cast:0:cfg');
  });

  it('an empty target list offers no confirm button at all', () => {
    const r = buildInvitesConfirm({ mode: 'mark_offered_cast', appIndex: 0, configId: 'cfg', targets: [] });
    assert.equal(buttons(r).length, 0);
    assert.match(textOf(r), /never marked/);
  });

  it('counts are labelled by decision, matching the option labels', () => {
    const r = buildInvitesConfirm({ mode: 'mark_offered_all', appIndex: 0, configId: 'cfg', targets });
    assert.match(textOf(r), /Cast → \*\*1\*\*/);
    assert.match(textOf(r), /Alternate → \*\*1\*\*/);
  });
});

describe('buildStatusOnlySummary', () => {
  it('names who was accepted vs merely offered', () => {
    const s = buildStatusOnlySummary({ updated: ['C'], accepted: ['A', 'B'], skipped: [] });
    const text = s.components[0].components[0].content;
    assert.match(text, /\*\*3\*\* applicants updated/);
    assert.match(text, /no messages were sent/);
    assert.match(text, /accepted: A, B/);
    assert.match(text, /Marked offered: C/);
  });

  it('reports skips so a partial run can never read as a full one', () => {
    const s = buildStatusOnlySummary({ updated: ['A'], accepted: [], skipped: [{ name: 'D', error: 'x' }] });
    assert.match(s.components[0].components[0].content, /1 skipped: D/);
  });

  it('says so plainly when nothing matched', () => {
    const s = buildStatusOnlySummary({ updated: [], accepted: [], skipped: [] });
    assert.match(s.components[0].components[0].content, /Nothing to update/);
  });
});
