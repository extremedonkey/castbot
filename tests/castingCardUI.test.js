// Tests for the Casting card's applicant jump-select: always-rendered rule + state-aware placeholder.
// Pure logic replicated inline (mirrors castRankingManager.js generateSeasonAppRankingUI) to avoid
// importing the Discord/file-I/O-heavy module.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ITEMS_PER_PAGE = 23;

// The select is rendered whenever the card renders — i.e. whenever there's >=1 applicant.
// (0 applicants is the separate empty-state screen; Discord selects require >=1 option.)
function selectIsRendered(total) {
  return total >= 1;
}

// Placeholder doubles as the position indicator. N = SORTED position (display order),
// not the insertion-order appIndex, so it agrees with the option numbering below it.
function selectPlaceholder(total, sortedPos, name) {
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const currentPage = Math.floor(sortedPos / ITEMS_PER_PAGE);
  let placeholder = `Applicant ${sortedPos + 1} of ${total} - ${name}`;
  if (totalPages > 1) placeholder += ` · page ${currentPage + 1}/${totalPages}`;
  return placeholder;
}

describe('Casting card — jump-select is always rendered (>=1 applicant)', () => {
  it('renders for a single applicant (previously hidden)', () => {
    assert.equal(selectIsRendered(1), true);
  });
  it('renders for many applicants', () => {
    assert.equal(selectIsRendered(42), true);
  });
  it('not rendered with zero applicants (empty-state screen instead)', () => {
    assert.equal(selectIsRendered(0), false);
  });
});

describe('Casting card — position-indicator select placeholder (sorted position)', () => {
  it('single applicant, single page → no page suffix', () => {
    assert.equal(selectPlaceholder(1, 0, 'Tuckie'), 'Applicant 1 of 1 - Tuckie');
  });
  it('exactly one full page (23) → still no page suffix', () => {
    assert.equal(selectPlaceholder(23, 4, 'Alice'), 'Applicant 5 of 23 - Alice');
  });
  it('24 applicants → paginated, page suffix appears', () => {
    assert.equal(selectPlaceholder(24, 0, 'Alice'), 'Applicant 1 of 24 - Alice · page 1/2');
  });
  it('deep sorted position reflects the correct current page', () => {
    // sortedPos 30 → currentPage 1 (0-based) → "page 2/3"
    assert.equal(selectPlaceholder(50, 30, 'Bob'), 'Applicant 31 of 50 - Bob · page 2/3');
  });
  it('N is the SORTED position, not the insertion index', () => {
    // An applicant who applied first (insertionIndex 0) but sorts last of 30
    assert.equal(selectPlaceholder(30, 29, 'Zed'), 'Applicant 30 of 30 - Zed · page 2/2');
  });
});

// Unified "Status:" line — collapses placementResponse / castingStatus / votes / withdrawn
// into one salient status. Mirrors deriveApplicationStatus in castRankingManager.js.
function deriveApplicationStatus(app = {}, liveChannelName = '') {
  const castingStatus = app.castingStatus;
  const placementResponse = app.placementResponse;
  const voteCount = Object.keys(app.rankings || {}).length;
  if (/^✖️/.test(liveChannelName)) return { icon: '✖️', name: 'Withdrawn' };
  if (placementResponse === 'accepted') return { icon: '🎉', name: 'Accepted Placement' };
  if (placementResponse === 'declined') return { icon: '🚫', name: 'Declined Placement' };
  if (castingStatus === 'cast')        return { icon: '✅', name: 'Cast' };
  if (castingStatus === 'alternative') return { icon: '🔄', name: 'Alternate' };
  if (castingStatus === 'reject')      return { icon: '❌', name: 'Not Cast' };
  if (voteCount >= 2)                  return { icon: '☑️', name: 'Reviewed' };
  if (voteCount >= 1)                  return { icon: '🗳️', name: `Scoring (${voteCount} vote${voteCount === 1 ? '' : 's'})` };
  return { icon: '📝', name: 'Awaiting Votes' };
}

describe('Casting card — derived Status line priority', () => {
  it('withdrawn channel prefix overrides everything', () => {
    const s = deriveApplicationStatus({ castingStatus: 'cast', placementResponse: 'accepted' }, '✖️arei-app');
    assert.deepEqual(s, { icon: '✖️', name: 'Withdrawn' });
  });
  it('accepted placement beats castingStatus', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'cast', placementResponse: 'accepted' }).name, 'Accepted Placement');
  });
  it('declined placement beats castingStatus', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'cast', placementResponse: 'declined' }).icon, '🚫');
  });
  it('castingStatus beats votes', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'reject', rankings: { a: 5, b: 4, c: 3 } }).name, 'Not Cast');
  });
  it('cast / alternate / reject map correctly', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'cast' }).icon, '✅');
    assert.equal(deriveApplicationStatus({ castingStatus: 'alternative' }).name, 'Alternate');
    assert.equal(deriveApplicationStatus({ castingStatus: 'reject' }).name, 'Not Cast');
  });
  it('legacy tentative falls through to the vote ladder (RaP 0902 removal)', () => {
    assert.equal(deriveApplicationStatus({ castingStatus: 'tentative' }).name, 'Awaiting Votes');
  });
  it('>=2 votes → Reviewed', () => {
    assert.deepEqual(deriveApplicationStatus({ rankings: { a: 5, b: 3 } }), { icon: '☑️', name: 'Reviewed' });
  });
  it('exactly 1 vote → Scoring (singular)', () => {
    assert.equal(deriveApplicationStatus({ rankings: { a: 5 } }).name, 'Scoring (1 vote)');
  });
  it('no votes / no decision → Awaiting Votes', () => {
    assert.deepEqual(deriveApplicationStatus({}), { icon: '📝', name: 'Awaiting Votes' });
  });
  it('a non-withdrawn channel prefix (☑️) does NOT trigger withdrawn', () => {
    assert.equal(deriveApplicationStatus({ rankings: { a: 5, b: 4 } }, '☑️arei-app').name, 'Reviewed');
  });
});
