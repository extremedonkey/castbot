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
  const categories = new Map();
  for (const id of (selectedIds || [])) {
    const ch = byId.get(id) || resolved[id];
    if (!ch) continue;
    if (ch.type === 4) {
      categories.set(ch.id, { id: ch.id, name: ch.name });
      for (const kid of childrenOf(id)) picked.set(kid.id, { id: kid.id, name: kid.name, category: ch.name, categoryId: ch.id });
    } else if ([0, 5].includes(ch.type)) {
      picked.set(ch.id, { id: ch.id, name: ch.name, category: null, categoryId: null });
    }
  }
  return { channels: [...picked.values()], categoryCount: categories.size, categories: [...categories.values()] };
}

// Keep in sync with channelArchiver.js → ARCHIVE_MODES / getArchiveMode / DEFAULT_ARCHIVE_MODE.
const ARCHIVE_MODES = [
  { value: 'archive_only', label: 'Fast Archive', embed: false, deletes: false },
  { value: 'archive_embed', label: 'Full Archive', embed: true, deletes: false },
  { value: 'archive_delete', label: 'Fast Archive + Delete Channels', embed: false, deletes: true },
  { value: 'archive_embed_delete', label: 'Full Archive + Delete Channels', embed: true, deletes: true },
];
const DEFAULT_ARCHIVE_MODE = 'archive_embed';
function getArchiveMode(value) {
  return ARCHIVE_MODES.find(m => m.value === value) || ARCHIVE_MODES.find(m => m.value === DEFAULT_ARCHIVE_MODE);
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

  it('tags category children with the category name (for the divider) and loose channels with null', () => {
    const { channels } = expandArchiveSelection(['cat', 'loose'], GUILD);
    assert.equal(channels.find(c => c.id === 'c1').category, 'Season'); // child carries its category
    assert.equal(channels.find(c => c.id === 'loose').category, null);  // directly-picked → no divider
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

// Mirrors buildRetrieveScreen's selection: newest-first, capped at 25.
function pickRecent(runs) {
  return (runs || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 25);
}

describe('channelArchiver — retrieve list (cross-server)', () => {
  it('orders runs newest-first', () => {
    const runs = [
      { id: 'a', createdAt: '2026-06-01T00:00:00Z' },
      { id: 'b', createdAt: '2026-06-14T00:00:00Z' },
      { id: 'c', createdAt: '2026-06-10T00:00:00Z' },
    ];
    assert.deepEqual(pickRecent(runs).map(r => r.id), ['b', 'c', 'a']);
  });
  it('caps the list at 25 (string-select limit)', () => {
    const runs = Array.from({ length: 40 }, (_, i) => ({ id: String(i), createdAt: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` }));
    assert.equal(pickRecent(runs).length, 25);
  });
});

// Keep in sync with channelArchiver.js → estimateMessageBytes (token-aware split estimate).
function estimateMessageBytes(msg, imageData = null) {
  let n = 600;
  n += (msg.content?.length || 0) * 1.2;
  const tokens = msg.content?.match(/<a?:\w+:\d+>|<@[!&]?\d+>|<#\d+>|<t:\d+(?::\w)?>/g);
  if (tokens) n += tokens.length * 120;
  if (msg.components?.length) n += 400;
  for (const e of (msg.embeds || [])) n += (e.title?.length || 0) + (e.description?.length || 0) + 100;
  for (const a of (msg.attachments || [])) n += imageData?.[a.url] ? imageData[a.url].length : 300;
  return Math.ceil(n);
}

describe('channelArchiver — estimateMessageBytes (token-aware)', () => {
  it('plain text uses the 1.2x multiplier only', () => {
    assert.equal(estimateMessageBytes({ content: 'x'.repeat(100) }), 600 + 120);
  });
  it('custom emoji, mentions and timestamps add 120 bytes each (they render 4-6x larger)', () => {
    const content = '<a:party:123456789012345678> <@&123456789012345678> <#123456789012345678> <@!123456789012345678> <t:1700000000:F>';
    const plain = Math.ceil(600 + content.length * 1.2);
    assert.equal(estimateMessageBytes({ content }), plain + 5 * 120);
  });
  it('embedded image data-URI lengths are exact', () => {
    const uri = 'data:image/webp;base64,' + 'A'.repeat(1000);
    const est = estimateMessageBytes({ content: '', attachments: [{ url: 'u' }] }, { u: uri });
    assert.equal(est, 600 + uri.length);
  });
});

describe('channelArchiver — expandArchiveSelection returns the selected categories', () => {
  it('reports explicitly-picked categories so "+ Delete Channels" can tidy them up', () => {
    const { categories, categoryCount } = expandArchiveSelection(['cat', 'loose'], GUILD);
    assert.deepEqual(categories, [{ id: 'cat', name: 'Season' }]);
    assert.equal(categoryCount, 1); // a loose channel is not a category
  });

  it('stamps each expanded child with its categoryId (the name alone can be duplicated)', () => {
    const { channels } = expandArchiveSelection(['cat'], GUILD);
    assert.ok(channels.every(c => c.categoryId === 'cat'));
  });

  it('a directly-picked channel carries no categoryId — it never triggers category cleanup', () => {
    const { channels, categories } = expandArchiveSelection(['loose'], GUILD);
    assert.equal(channels[0].categoryId, null);
    assert.deepEqual(categories, []);
  });
});

describe('channelArchiver — ARCHIVE_MODES (Fast/Full × Delete)', () => {
  it('offers exactly the four real modes — no coming-soon stubs remain', () => {
    assert.equal(ARCHIVE_MODES.length, 4);
    assert.deepEqual(ARCHIVE_MODES.map(m => m.value),
      ['archive_only', 'archive_embed', 'archive_delete', 'archive_embed_delete']);
  });

  it('defaults to Full Archive — NOT a delete mode (a mis-click must never delete)', () => {
    const def = getArchiveMode(undefined);
    assert.equal(def.value, 'archive_embed');
    assert.equal(def.deletes, false);
    assert.equal(def.embed, true);
  });

  it('falls back to the safe default for an unknown/stale mode value', () => {
    assert.equal(getArchiveMode('category_archive_delete').value, 'archive_embed');
    assert.equal(getArchiveMode('').deletes, false);
  });

  it('exactly two modes delete, and each has an embed counterpart', () => {
    const deleting = ARCHIVE_MODES.filter(m => m.deletes);
    assert.equal(deleting.length, 2);
    assert.deepEqual(deleting.map(m => m.embed).sort(), [false, true]);
  });

  it('every delete mode label says "Delete Channels" out loud', () => {
    for (const m of ARCHIVE_MODES.filter(m => m.deletes)) {
      assert.ok(m.label.includes('Delete Channels'), `${m.value} label must name the deletion`);
    }
  });
});

// Keep in sync with channelArchiver.js → checkDeleteGates (gates 1–4 of verifyThenDelete).
// Gate 5 (re-GET the archive message) is I/O and lives in the runtime path only.
function checkDeleteGates({ channelId, invokedChannelId, hasGuild, partMessageIds, aborted }) {
  if (channelId === invokedChannelId) return { ok: false, reason: `it's this channel, where the archives live` };
  if (!hasGuild) return { ok: false, reason: 'guild not in cache, deletion skipped' };
  if (!partMessageIds?.length) return { ok: false, reason: 'archive did not post' };
  if (aborted) return { ok: false, reason: 'abandoned before deletion' };
  return { ok: true, reason: null };
}

describe('channelArchiver — checkDeleteGates (Archive & Delete safety)', () => {
  const OK = { channelId: 'c1', invokedChannelId: 'home', hasGuild: true, partMessageIds: ['m1'], aborted: false };

  it('permits deletion only when every gate passes', () => {
    assert.deepEqual(checkDeleteGates(OK), { ok: true, reason: null });
  });

  it('🔴 NEVER deletes the channel the archives were posted into', () => {
    const r = checkDeleteGates({ ...OK, channelId: 'home' });
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('archives live'));
  });

  it('refuses when the archive never posted (no file-message id)', () => {
    assert.equal(checkDeleteGates({ ...OK, partMessageIds: [] }).ok, false);
    assert.equal(checkDeleteGates({ ...OK, partMessageIds: undefined }).ok, false);
    assert.equal(checkDeleteGates({ ...OK, partMessageIds: null }).ok, false);
  });

  it('refuses when the guild is not in the bot cache', () => {
    assert.equal(checkDeleteGates({ ...OK, hasGuild: false }).ok, false);
  });

  it('refuses once the run has been abandoned', () => {
    const r = checkDeleteGates({ ...OK, aborted: true });
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('abandoned'));
  });

  it('the self-delete gate wins over every other condition', () => {
    // Even with everything else "fine", the invoking channel is never deletable.
    const r = checkDeleteGates({ channelId: 'home', invokedChannelId: 'home', hasGuild: true, partMessageIds: ['m1', 'm2'], aborted: false });
    assert.equal(r.ok, false);
  });

  it('fails closed on a completely empty argument object', () => {
    assert.equal(checkDeleteGates({}).ok, false);
  });
});
