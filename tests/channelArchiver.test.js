import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure logic replicated inline (TestingStandards convention — avoids importing
// channelArchiver.js, which pulls node-fetch/dotenv/botEmojis side-effects).
// Keep in sync with channelArchiver.js → expandArchiveSelection.
function expandArchiveSelection(selectedIds, allChannels, resolved = {}) {
  const byId = new Map((allChannels || []).map(c => [c.id, c]));
  const childrenOf = (catId) => (allChannels || [])
    .filter(c => c.parent_id === catId && [0, 5].includes(c.type))
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const picked = new Map();
  let categoryCount = 0;
  for (const id of (selectedIds || [])) {
    const ch = byId.get(id) || resolved[id];
    if (!ch) continue;
    if (ch.type === 4) {
      categoryCount++;
      for (const kid of childrenOf(id)) picked.set(kid.id, { id: kid.id, name: kid.name });
    } else if ([0, 5].includes(ch.type)) {
      picked.set(ch.id, { id: ch.id, name: ch.name });
    }
  }
  return { channels: [...picked.values()], categoryCount };
}

// Sample guild: category 'cat' with two text children + one announcement child; a loose channel; a voice channel.
const GUILD = [
  { id: 'cat', name: 'Season', type: 4, parent_id: null, position: 0 },
  { id: 'c2', name: 'beta', type: 0, parent_id: 'cat', position: 2 },
  { id: 'c1', name: 'alpha', type: 0, parent_id: 'cat', position: 1 },
  { id: 'c3', name: 'announce', type: 5, parent_id: 'cat', position: 3 },
  { id: 'voice', name: 'VC', type: 2, parent_id: 'cat', position: 4 },
  { id: 'loose', name: 'general', type: 0, parent_id: null, position: 0 },
];

describe('channelArchiver — expandArchiveSelection', () => {
  it('expands a category to its text/announcement children, sorted by position', () => {
    const { channels, categoryCount } = expandArchiveSelection(['cat'], GUILD);
    assert.deepEqual(channels.map(c => c.name), ['alpha', 'beta', 'announce']);
    assert.equal(categoryCount, 1);
  });

  it('excludes non-text channel types (voice) from a category', () => {
    const { channels } = expandArchiveSelection(['cat'], GUILD);
    assert.ok(!channels.some(c => c.id === 'voice'));
  });

  it('archives a single picked channel', () => {
    const { channels, categoryCount } = expandArchiveSelection(['loose'], GUILD);
    assert.deepEqual(channels.map(c => c.id), ['loose']);
    assert.equal(categoryCount, 0);
  });

  it('dedupes when a category AND a child inside it are both selected', () => {
    const { channels } = expandArchiveSelection(['cat', 'c1'], GUILD);
    const ids = channels.map(c => c.id);
    assert.equal(ids.filter(id => id === 'c1').length, 1); // c1 appears once
    assert.deepEqual(ids.sort(), ['c1', 'c2', 'c3']); // children only, no dupes
  });

  it('combines multiple categories and loose channels, deduped', () => {
    const { channels, categoryCount } = expandArchiveSelection(['cat', 'loose'], GUILD);
    assert.deepEqual(channels.map(c => c.id).sort(), ['c1', 'c2', 'c3', 'loose'].sort());
    assert.equal(categoryCount, 1);
  });

  it('falls back to resolved.channels when an id is not in the guild list', () => {
    const resolved = { x9: { id: 'x9', name: 'orphan', type: 0 } };
    const { channels } = expandArchiveSelection(['x9'], GUILD, resolved);
    assert.deepEqual(channels.map(c => c.name), ['orphan']);
  });

  it('ignores unknown ids and empty selections gracefully', () => {
    assert.deepEqual(expandArchiveSelection(['nope'], GUILD).channels, []);
    assert.deepEqual(expandArchiveSelection([], GUILD).channels, []);
    assert.deepEqual(expandArchiveSelection(undefined, GUILD).channels, []);
  });
});

// Keep in sync with channelArchiver.js → setLinkButtonUrl.
// Rewrites the first link button (type 2, style 5) URL anywhere in a components tree.
function setLinkButtonUrl(components, newUrl) {
  for (const c of (components || [])) {
    if (c?.type === 2 && c?.style === 5) { c.url = newUrl; return true; }
    if (Array.isArray(c?.components) && setLinkButtonUrl(c.components, newUrl)) return true;
  }
  return false;
}

describe('channelArchiver — setLinkButtonUrl (Refresh Link)', () => {
  const make = () => ([{
    type: 17,
    components: [{
      type: 1,
      components: [
        { type: 2, style: 2, custom_id: 'archive_refresh_123', label: 'Refresh Link' },
        { type: 2, style: 5, label: 'View #x Online', url: 'https://htmlpreview.github.io/?OLD' },
      ],
    }],
  }]);

  it('updates the link button url and leaves the refresh button untouched', () => {
    const comps = make();
    const ok = setLinkButtonUrl(comps, 'https://htmlpreview.github.io/?NEW');
    assert.equal(ok, true);
    const row = comps[0].components[0].components;
    assert.equal(row[1].url, 'https://htmlpreview.github.io/?NEW'); // link button updated
    assert.equal(row[0].custom_id, 'archive_refresh_123');         // refresh button intact
    assert.equal(row[0].url, undefined);                            // non-link button never gets a url
  });

  it('returns false when there is no link button', () => {
    const comps = [{ type: 17, components: [{ type: 1, components: [{ type: 2, style: 2, custom_id: 'x' }] }] }];
    assert.equal(setLinkButtonUrl(comps, 'https://new'), false);
  });

  it('handles empty/undefined input', () => {
    assert.equal(setLinkButtonUrl([], 'u'), false);
    assert.equal(setLinkButtonUrl(undefined, 'u'), false);
  });
});

// Keep in sync with channelArchiver.js → buildArchiveButtons.
function buildArchiveButtons(fileMsgId, { viewUrl = null } = {}) {
  const unarchive = { type: 2, style: 2, custom_id: `archive_restore_${fileMsgId}`, label: 'Unarchive', emoji: { name: '📤' } };
  if (viewUrl) {
    return { type: 17, components: [
      { type: 10, content: `-# 🔓 Link active for ~10 minutes` },
      { type: 1, components: [{ type: 2, style: 5, label: 'View Archive', url: viewUrl }, unarchive] },
    ] };
  }
  return { type: 17, components: [
    { type: 1, components: [
      { type: 2, style: 2, custom_id: `archive_unlock_${fileMsgId}`, label: 'Unlock Archive', emoji: { name: '🔐' } },
      unarchive,
    ] },
  ] };
}

describe('channelArchiver — buildArchiveButtons (Unlock ⇄ View)', () => {
  it('LOCKED: shows Unlock + Unarchive, no link button', () => {
    const c = buildArchiveButtons('500');
    const s = JSON.stringify(c);
    assert.match(s, /archive_unlock_500/);
    assert.match(s, /archive_restore_500/);
    assert.doesNotMatch(s, /"style":5/); // no link button while locked
  });
  it('UNLOCKED: shows a style-5 View Archive link + Unarchive + 10-min note', () => {
    const c = buildArchiveButtons('500', { viewUrl: 'https://htmlpreview.github.io/?u' });
    const s = JSON.stringify(c);
    assert.match(s, /"style":5/);
    assert.match(s, /View Archive/);
    assert.match(s, /htmlpreview\.github\.io/);
    assert.match(s, /archive_restore_500/);
    assert.match(s, /active for ~10 minutes/);
    assert.doesNotMatch(s, /archive_unlock_/); // unlock button gone while unlocked
  });
});
