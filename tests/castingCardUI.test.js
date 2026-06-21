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

function selectPlaceholder(total, appIndex) {
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const currentPage = Math.floor(appIndex / ITEMS_PER_PAGE);
  if (total === 1) return '🔍 1 applicant so far';
  if (totalPages === 1) return `🔍 Jump to applicant… (${total} total)`;
  return `🔍 Jump to applicant… (page ${currentPage + 1}/${totalPages}, ${total} total)`;
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

describe('Casting card — state-aware select placeholder', () => {
  it('single applicant → "1 applicant so far"', () => {
    assert.equal(selectPlaceholder(1, 0), '🔍 1 applicant so far');
  });
  it('few applicants, single page → total only', () => {
    assert.equal(selectPlaceholder(5, 0), '🔍 Jump to applicant… (5 total)');
  });
  it('exactly one full page (23) → single page, no pagination', () => {
    assert.equal(selectPlaceholder(23, 0), '🔍 Jump to applicant… (23 total)');
  });
  it('24 applicants → paginated, page 1/2', () => {
    assert.equal(selectPlaceholder(24, 0), '🔍 Jump to applicant… (page 1/2, 24 total)');
  });
  it('deep index reflects the correct current page', () => {
    // idx 30 → currentPage 1 (0-based) → "page 2/3"
    assert.equal(selectPlaceholder(50, 30), '🔍 Jump to applicant… (page 2/3, 50 total)');
  });
});
