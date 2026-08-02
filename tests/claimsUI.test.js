/**
 * Claims manager footer — LEAN navigation layout.
 *
 * docs/ui/LeanUserInterfaceDesign.md: the back button gets its own ActionRow as the LAST row
 * (the `[← Menu]` row in the Analytics example). The Claims manager used to share that row with
 * the pagination arrows, which put page controls above unrelated action buttons and buried Back
 * mid-screen. Every claims screen re-renders through buildClaimsManagerUI or errorContainer, so
 * pinning the shared footer/back builders covers all of them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildClaimsFooterRows, buildClaimsBackRow } from '../claimsUI.js';

const ARGS = { buttonId: 'stray_dog_102331', actionIndex: 3, page: 0, totalPages: 1, hasClaims: true };

const labels = row => row.components.map(c => c.label);

describe('Claims footer — back button placement', () => {
  it('puts Back alone on the final ActionRow, with no pagination', () => {
    const rows = buildClaimsFooterRows(ARGS);
    const last = rows[rows.length - 1];
    assert.equal(last.type, 1, 'final row is an ActionRow');
    assert.equal(last.components.length, 1, 'Back is ALONE on its row');
    assert.equal(last.components[0].label, '← Back');
  });

  it('keeps Back alone and last even when paginating', () => {
    const rows = buildClaimsFooterRows({ ...ARGS, totalPages: 5, page: 2 });
    assert.deepEqual(rows.map(labels), [
      ['◀', '▶'],
      ['Manual Claim', 'Refresh', 'Reset All'],
      ['← Back']
    ]);
  });

  it('never mixes Back into a row with other buttons, in any state', () => {
    for (const totalPages of [1, 2, 9]) {
      for (const hasClaims of [true, false]) {
        for (const page of [0, 1]) {
          const rows = buildClaimsFooterRows({ ...ARGS, totalPages, page, hasClaims });
          for (const row of rows) {
            const backs = row.components.filter(c => c.label === '← Back');
            if (backs.length) {
              assert.equal(row.components.length, 1, `Back alone (pages=${totalPages}, claims=${hasClaims})`);
              assert.equal(row, rows[rows.length - 1], 'Back row is last');
            }
          }
        }
      }
    }
  });

  it('errorContainer and the manager share ONE back-row builder', () => {
    const row = buildClaimsBackRow('abc_123');
    assert.equal(row.type, 1);
    assert.equal(row.components.length, 1);
    assert.equal(row.components[0].custom_id, 'custom_action_editor_abc_123');
    assert.equal(row.components[0].style, 2, 'Secondary/grey per the nav standard');
    assert.deepEqual(row, buildClaimsFooterRows({ ...ARGS, buttonId: 'abc_123' }).at(-1));
  });
});

describe('Claims footer — pagination and actions', () => {
  it('hides pagination entirely on a single page', () => {
    const rows = buildClaimsFooterRows(ARGS);
    assert.equal(rows.length, 2, 'actions + back only');
    assert.equal(rows.flatMap(labels).includes('◀'), false);
  });

  it('disables the arrow that would leave the page range', () => {
    const first = buildClaimsFooterRows({ ...ARGS, totalPages: 3, page: 0 })[0].components;
    assert.equal(first[0].disabled, true, '◀ disabled on the first page');
    assert.equal(first[1].disabled, false);

    const last = buildClaimsFooterRows({ ...ARGS, totalPages: 3, page: 2 })[0].components;
    assert.equal(last[0].disabled, false);
    assert.equal(last[1].disabled, true, '▶ disabled on the last page');
  });

  it('disables Reset All when there is nothing to reset', () => {
    const actions = r => r.find(row => labels(row).includes('Reset All')).components.at(-1);
    assert.equal(actions(buildClaimsFooterRows({ ...ARGS, hasClaims: false })).disabled, true);
    assert.equal(actions(buildClaimsFooterRows({ ...ARGS, hasClaims: true })).disabled, false);
    assert.equal(actions(buildClaimsFooterRows(ARGS)).style, 4, 'Reset All is Danger/red');
  });

  it('stays within Discord\'s 5-buttons-per-row limit and 100-char custom_ids', () => {
    const rows = buildClaimsFooterRows({ ...ARGS, buttonId: 'a'.repeat(40), totalPages: 4, page: 1 });
    for (const row of rows) {
      assert.ok(row.components.length <= 5, 'max 5 buttons per ActionRow');
      for (const c of row.components) assert.ok(c.custom_id.length < 100, `custom_id under 100: ${c.custom_id}`);
    }
  });
});
