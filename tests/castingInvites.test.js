// Tests for the Casting Invites feature (RaP 0906): @Player substitution + @everyone neutralization,
// status→message-type mapping, send-mode target selection, and the Alternate Casting Summary bucket.
// Pure logic replicated inline (mirrors castRankingManager.js) to avoid importing Discord/file-I/O.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const CASTING_STATUS_TO_MESSAGE = { cast: 'successful', alternative: 'alternative', reject: 'unsuccessful' };

function sanitizeTemplate(text) {
  return (text || '').replace(/@(everyone|here)/gi, '@​$1');
}
function renderInviteMessage(template, userId) {
  return (template || '').replace(/@Player\b/g, `<@${userId}>`);
}
function selectInviteTargets(allApplications, statusMap, mode, appIndex) {
  const statusOf = (app) => statusMap[app.channelId];
  const typeFor = (status) => CASTING_STATUS_TO_MESSAGE[status] || null;
  const make = (app, messageType) => ({ channelId: app.channelId, userId: app.userId, messageType });
  if (mode === 'selected') {
    const app = allApplications[appIndex];
    if (!app) return [];
    const mt = typeFor(statusOf(app));
    return mt ? [make(app, mt)] : [];
  }
  const wanted = mode === 'all' ? ['successful', 'alternative', 'unsuccessful'] : [mode];
  const targets = [];
  for (const app of allApplications) {
    const mt = typeFor(statusOf(app));
    if (mt && wanted.includes(mt)) targets.push(make(app, mt));
  }
  return targets;
}

// Fixtures: 5 applicants, one per status (+ undecided = no entry)
const APPS = [
  { channelId: 'c_cast', userId: 'u_cast' },
  { channelId: 'c_alt', userId: 'u_alt' },
  { channelId: 'c_rej', userId: 'u_rej' },
  { channelId: 'c_tent', userId: 'u_tent' },
  { channelId: 'c_und', userId: 'u_und' }
];
const STATUS = { c_cast: 'cast', c_alt: 'alternative', c_rej: 'reject', c_tent: 'tentative' /* c_und absent = undecided */ };

describe('Casting Invites — @Player substitution', () => {
  it('replaces @Player with the user mention', () => {
    assert.equal(renderInviteMessage('Hi @Player!', '123'), 'Hi <@123>!');
  });
  it('replaces multiple occurrences', () => {
    assert.equal(renderInviteMessage('@Player @Player', '9'), '<@9> <@9>');
  });
  it('does not touch text without the token', () => {
    assert.equal(renderInviteMessage('No token here', '1'), 'No token here');
  });
});

describe('Casting Invites — @everyone/@here neutralization', () => {
  it('breaks @everyone so it cannot mass-ping', () => {
    assert.notEqual(sanitizeTemplate('hey @everyone'), 'hey @everyone');
    assert.match(sanitizeTemplate('@everyone'), /@​everyone/);
  });
  it('breaks @here (case-insensitive)', () => {
    assert.match(sanitizeTemplate('@HERE go'), /@​HERE go/);
  });
});

describe('Casting Invites — status → message type', () => {
  it('maps cast/alternative/reject', () => {
    assert.equal(CASTING_STATUS_TO_MESSAGE.cast, 'successful');
    assert.equal(CASTING_STATUS_TO_MESSAGE.alternative, 'alternative');
    assert.equal(CASTING_STATUS_TO_MESSAGE.reject, 'unsuccessful');
  });
  it('tentative and undecided map to nothing', () => {
    assert.equal(CASTING_STATUS_TO_MESSAGE.tentative, undefined);
    assert.equal(CASTING_STATUS_TO_MESSAGE.undefined, undefined);
  });
});

describe('Casting Invites — send-mode target selection', () => {
  it('mode "all" → cast+alt+reject only (tentative & undecided skipped)', () => {
    const t = selectInviteTargets(APPS, STATUS, 'all');
    assert.deepEqual(t.map(x => x.channelId).sort(), ['c_alt', 'c_cast', 'c_rej']);
    assert.equal(t.find(x => x.channelId === 'c_cast').messageType, 'successful');
    assert.equal(t.find(x => x.channelId === 'c_alt').messageType, 'alternative');
    assert.equal(t.find(x => x.channelId === 'c_rej').messageType, 'unsuccessful');
  });
  it('mode "successful" → only cast applicants', () => {
    const t = selectInviteTargets(APPS, STATUS, 'successful');
    assert.deepEqual(t.map(x => x.channelId), ['c_cast']);
  });
  it('mode "alternative" → only alternative applicants', () => {
    const t = selectInviteTargets(APPS, STATUS, 'alternative');
    assert.deepEqual(t.map(x => x.channelId), ['c_alt']);
  });
  it('mode "unsuccessful" → only reject applicants', () => {
    const t = selectInviteTargets(APPS, STATUS, 'unsuccessful');
    assert.deepEqual(t.map(x => x.channelId), ['c_rej']);
  });
  it('mode "selected" → the indexed applicant, message by its status', () => {
    assert.deepEqual(selectInviteTargets(APPS, STATUS, 'selected', 1), [{ channelId: 'c_alt', userId: 'u_alt', messageType: 'alternative' }]);
  });
  it('mode "selected" on a Tentative applicant → nothing', () => {
    assert.deepEqual(selectInviteTargets(APPS, STATUS, 'selected', 3), []);
  });
  it('mode "selected" on an Undecided applicant → nothing', () => {
    assert.deepEqual(selectInviteTargets(APPS, STATUS, 'selected', 4), []);
  });
});

describe('Placement response — invite cards carry Accept/Decline only for Cast & Alternative', () => {
  const hasResponseButtons = (messageType) => messageType === 'successful' || messageType === 'alternative';
  it('successful (Cast) → buttons', () => assert.equal(hasResponseButtons('successful'), true));
  it('alternative → buttons', () => assert.equal(hasResponseButtons('alternative'), true));
  it('unsuccessful (Reject) → NO buttons', () => assert.equal(hasResponseButtons('unsuccessful'), false));
});

describe('Placement response — jump-select icon priority', () => {
  // Mirrors the icon logic: placementResponse beats castingStatus
  function icon({ pResp, cStatus, voteCount = 0 }) {
    if (pResp === 'accepted') return '🎉';
    if (pResp === 'declined') return '🚫';
    if (cStatus === 'cast') return '✅';
    if (cStatus === 'alternative') return '🔄';
    if (cStatus === 'reject') return '❌';
    if (voteCount >= 2) return '☑️';
    return '🗳️';
  }
  it('accepted → 🎉 (overrides cast)', () => assert.equal(icon({ pResp: 'accepted', cStatus: 'cast' }), '🎉'));
  it('declined → 🚫 (overrides reject)', () => assert.equal(icon({ pResp: 'declined', cStatus: 'reject' }), '🚫'));
  it('no response falls back to casting status', () => assert.equal(icon({ cStatus: 'alternative' }), '🔄'));
});

describe('Casting Summary — Alternate bucket', () => {
  // Mirrors the castGroups grouping in handleRankingNavigation
  function group(applicantData) {
    return {
      cast: applicantData.filter(a => a.castingStatus === 'cast'),
      alternative: applicantData.filter(a => a.castingStatus === 'alternative'),
      tentative: applicantData.filter(a => a.castingStatus === 'tentative'),
      reject: applicantData.filter(a => a.castingStatus === 'reject'),
      undecided: applicantData.filter(a => a.castingStatus === 'undecided')
    };
  }
  it('alternative applicants land in their own bucket (not lost)', () => {
    const data = [
      { castingStatus: 'cast' }, { castingStatus: 'alternative' }, { castingStatus: 'alternative' },
      { castingStatus: 'reject' }, { castingStatus: 'undecided' }
    ];
    const g = group(data);
    assert.equal(g.alternative.length, 2);
    // total across buckets equals input (nothing silently dropped)
    const total = g.cast.length + g.alternative.length + g.tentative.length + g.reject.length + g.undecided.length;
    assert.equal(total, data.length);
  });
});
