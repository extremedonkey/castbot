/**
 * Per-location Blacklist + Reverse Blacklist modal — pure logic tests.
 *
 * Replicated inline from safariMapAdmin.js (getReverseBlacklistCandidates,
 * applyReverseBlacklistSelection) per Testing Standards: safariMapAdmin.js has
 * heavy static top-level imports (logger.js, storage.js, pointsManager.js,
 * safariPlayerUtils.js), so importing it directly would drag those in for a
 * test that only needs the pure data-shaping logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function getReverseBlacklistCandidates(items, coord) {
    const sortKey = (item) => item.metadata?.lastModified || item.metadata?.createdAt || 0;
    const entries = Object.entries(items).map(([id, item]) => ({ id, item }));

    const linked = entries
        .filter(({ item }) => Array.isArray(item.reverseBlacklist) && item.reverseBlacklist.includes(coord))
        .sort((a, b) => sortKey(b.item) - sortKey(a.item));

    const linkedIds = new Set(linked.map(e => e.id));
    const remainingSlots = Math.max(0, 25 - linked.length);
    const filler = entries
        .filter(({ id }) => !linkedIds.has(id))
        .sort((a, b) => sortKey(b.item) - sortKey(a.item))
        .slice(0, remainingSlots);

    return [...linked, ...filler]
        .slice(0, 25)
        .map(({ id, item }) => ({ id, item, linked: linkedIds.has(id) }));
}

function applyReverseBlacklistSelection(items, coord, presentedItemIds, selectedItemIds) {
    const selected = new Set(selectedItemIds);
    const changed = [];

    for (const itemId of presentedItemIds) {
        const item = items[itemId];
        if (!item) continue;

        const current = Array.isArray(item.reverseBlacklist) ? item.reverseBlacklist : [];
        const has = current.includes(coord);
        const shouldHave = selected.has(itemId);

        if (shouldHave && !has) {
            item.reverseBlacklist = [...current, coord];
            changed.push(itemId);
        } else if (!shouldHave && has) {
            item.reverseBlacklist = current.filter(c => c !== coord);
            changed.push(itemId);
        }
    }

    return changed;
}

// Compute logic replicated from handleLocationBlacklistModalSubmit's blacklist toggle
function computeNextBlacklist(currentBlacklist, coord, shouldBlacklist) {
    return shouldBlacklist
        ? [...currentBlacklist, coord]
        : currentBlacklist.filter(c => c !== coord);
}

describe('getReverseBlacklistCandidates — ordering', () => {
    it('puts already-linked items first, sorted by most-recently-updated', () => {
        const items = {
            old_link: { name: 'Old Boat', reverseBlacklist: ['B1'], metadata: { lastModified: 100 } },
            new_link: { name: 'New Boat', reverseBlacklist: ['B1'], metadata: { lastModified: 500 } },
            unrelated: { name: 'Sword', metadata: { lastModified: 999 } }
        };
        const result = getReverseBlacklistCandidates(items, 'B1');
        assert.equal(result[0].id, 'new_link');
        assert.equal(result[1].id, 'old_link');
        assert.equal(result[0].linked, true);
        assert.equal(result[1].linked, true);
    });

    it('fills remaining slots (25 - linked count) with most-recent non-linked items', () => {
        const items = {
            link_a: { name: 'A', reverseBlacklist: ['B1'], metadata: { lastModified: 10 } },
            other_new: { name: 'New', metadata: { lastModified: 900 } },
            other_old: { name: 'Old', metadata: { lastModified: 5 } }
        };
        const result = getReverseBlacklistCandidates(items, 'B1');
        assert.deepEqual(result.map(r => r.id), ['link_a', 'other_new', 'other_old']);
        assert.equal(result[1].linked, false);
    });

    it('falls back to createdAt when lastModified is absent (matches getSortedQuickCreateItems convention)', () => {
        const items = {
            never_edited: { name: 'Fresh', metadata: { createdAt: 5000 } },
            edited_older_create: { name: 'Edited', metadata: { createdAt: 100, lastModified: 4000 } }
        };
        const result = getReverseBlacklistCandidates(items, 'B1');
        assert.equal(result[0].id, 'never_edited'); // 5000 > 4000
    });

    it('caps total presented options at 25 even when linked items alone exceed it', () => {
        const items = {};
        for (let i = 0; i < 30; i++) {
            items[`item_${i}`] = { name: `Item ${i}`, reverseBlacklist: ['B1'], metadata: { lastModified: i } };
        }
        const result = getReverseBlacklistCandidates(items, 'B1');
        assert.equal(result.length, 25);
        assert.ok(result.every(r => r.linked));
    });

    it('only considers reverseBlacklist entries for the requested coordinate', () => {
        const items = {
            unlocks_a1: { name: 'Key', reverseBlacklist: ['A1'], metadata: { lastModified: 1 } }
        };
        const result = getReverseBlacklistCandidates(items, 'B1');
        assert.equal(result[0].linked, false);
    });

    it('returns empty array when the guild has no items', () => {
        assert.deepEqual(getReverseBlacklistCandidates({}, 'B1'), []);
    });
});

describe('applyReverseBlacklistSelection — scoped toggle, never a global wipe', () => {
    it('adds coord to selected items that did not have it', () => {
        const items = { boat: { name: 'Boat', reverseBlacklist: [] } };
        const changed = applyReverseBlacklistSelection(items, 'B1', ['boat'], ['boat']);
        assert.deepEqual(items.boat.reverseBlacklist, ['B1']);
        assert.deepEqual(changed, ['boat']);
    });

    it('removes coord from presented-but-deselected items', () => {
        const items = { boat: { name: 'Boat', reverseBlacklist: ['A1', 'B1'] } };
        const changed = applyReverseBlacklistSelection(items, 'B1', ['boat'], []);
        assert.deepEqual(items.boat.reverseBlacklist, ['A1']);
        assert.deepEqual(changed, ['boat']);
    });

    it('leaves items untouched if their selection state did not change', () => {
        const items = {
            already_linked: { name: 'A', reverseBlacklist: ['B1'] },
            already_unlinked: { name: 'B', reverseBlacklist: [] }
        };
        const changed = applyReverseBlacklistSelection(items, 'B1', ['already_linked', 'already_unlinked'], ['already_linked']);
        assert.deepEqual(changed, []);
    });

    it('NEVER touches items outside the presented set, even if selectedItemIds somehow includes them', () => {
        const items = {
            presented: { name: 'A', reverseBlacklist: [] },
            not_presented: { name: 'B', reverseBlacklist: [] }
        };
        applyReverseBlacklistSelection(items, 'B1', ['presented'], ['presented', 'not_presented']);
        assert.deepEqual(items.not_presented.reverseBlacklist, []);
    });

    it('handles items with no reverseBlacklist field yet (undefined → treated as empty)', () => {
        const items = { fresh_item: { name: 'Fresh' } };
        const changed = applyReverseBlacklistSelection(items, 'B1', ['fresh_item'], ['fresh_item']);
        assert.deepEqual(items.fresh_item.reverseBlacklist, ['B1']);
        assert.deepEqual(changed, ['fresh_item']);
    });

    it('deselecting all presented items with an empty selection clears them all', () => {
        const items = {
            a: { name: 'A', reverseBlacklist: ['B1'] },
            b: { name: 'B', reverseBlacklist: ['B1'] }
        };
        const changed = applyReverseBlacklistSelection(items, 'B1', ['a', 'b'], []);
        assert.deepEqual(items.a.reverseBlacklist, []);
        assert.deepEqual(items.b.reverseBlacklist, []);
        assert.deepEqual(changed.sort(), ['a', 'b']);
    });
});

describe('Blacklist toggle — reuses existing updateBlacklistedCoordinates data shape', () => {
    it('adds the coordinate when toggled on', () => {
        assert.deepEqual(computeNextBlacklist(['A1'], 'B1', true), ['A1', 'B1']);
    });

    it('removes the coordinate when toggled off', () => {
        assert.deepEqual(computeNextBlacklist(['A1', 'B1'], 'B1', false), ['A1']);
    });

    it('absent/null value defaults to NOT blacklisted (current documented behavior)', () => {
        // Radio value fallback: (blacklistComp?.component?.value || 'no') === 'yes'
        const value = undefined;
        const shouldBlacklist = (value || 'no') === 'yes';
        assert.equal(shouldBlacklist, false);
    });
});
