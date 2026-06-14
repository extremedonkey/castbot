import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure logic replicated inline (TestingStandards convention — avoids importing channelRestore.js,
// which pulls channelArchiver → botEmojis side-effects). Keep in sync with channelRestore.js.
const ARCHIVE_CATEGORY_BASE = '📂 CastBot Archives';
const CATEGORY_CHILD_LIMIT = 50;

function pickArchiveCategory(allChannels) {
  const num = (n) => { const m = (n || '').match(/\((\d+)\)\s*$/); return m ? parseInt(m[1], 10) : 1; };
  const cats = (allChannels || [])
    .filter(c => c.type === 4 && (c.name === ARCHIVE_CATEGORY_BASE || (c.name || '').startsWith(`${ARCHIVE_CATEGORY_BASE} (`)))
    .sort((a, b) => num(a.name) - num(b.name));
  const childCount = (catId) => (allChannels || []).filter(c => c.parent_id === catId).length;
  for (const c of cats) if (childCount(c.id) < CATEGORY_CHILD_LIMIT) return { categoryId: c.id };
  if (!cats.length) return { createName: ARCHIVE_CATEGORY_BASE };
  const maxNum = Math.max(...cats.map(c => num(c.name)));
  return { createName: `${ARCHIVE_CATEGORY_BASE} (${maxNum + 1})` };
}

function splitContent(text, max = 1950) {
  const out = [];
  let s = String(text || '');
  while (s.length > max) {
    let cut = s.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    out.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  if (s.length) out.push(s);
  return out;
}

function extractArchiveData(html) {
  const m = (html || '').match(/<script id="cb-archive-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch { return null; }
}

describe('channelRestore — pickArchiveCategory', () => {
  it('creates the base category when none exist', () => {
    assert.deepEqual(pickArchiveCategory([]), { createName: '📂 CastBot Archives' });
  });

  it('reuses an existing base category with room', () => {
    const all = [{ id: 'cat', name: '📂 CastBot Archives', type: 4, parent_id: null },
                 { id: 'x', name: 'a', type: 0, parent_id: 'cat' }];
    assert.deepEqual(pickArchiveCategory(all), { categoryId: 'cat' });
  });

  it('creates "(2)" when the base is full (50 children)', () => {
    const children = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, type: 0, parent_id: 'cat' }));
    const all = [{ id: 'cat', name: '📂 CastBot Archives', type: 4, parent_id: null }, ...children];
    assert.deepEqual(pickArchiveCategory(all), { createName: '📂 CastBot Archives (2)' });
  });

  it('reuses "(2)" when base is full but (2) has room', () => {
    const children = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, type: 0, parent_id: 'cat' }));
    const all = [
      { id: 'cat', name: '📂 CastBot Archives', type: 4, parent_id: null },
      { id: 'cat2', name: '📂 CastBot Archives (2)', type: 4, parent_id: null },
      ...children,
    ];
    assert.deepEqual(pickArchiveCategory(all), { categoryId: 'cat2' });
  });

  it('creates "(3)" when base and (2) are both full', () => {
    const fill = (cat) => Array.from({ length: 50 }, (_, i) => ({ id: `${cat}-${i}`, name: `x`, type: 0, parent_id: cat }));
    const all = [
      { id: 'cat', name: '📂 CastBot Archives', type: 4, parent_id: null },
      { id: 'cat2', name: '📂 CastBot Archives (2)', type: 4, parent_id: null },
      ...fill('cat'), ...fill('cat2'),
    ];
    assert.deepEqual(pickArchiveCategory(all), { createName: '📂 CastBot Archives (3)' });
  });
});

describe('channelRestore — splitContent', () => {
  it('returns a single chunk for short text', () => {
    assert.deepEqual(splitContent('hello'), ['hello']);
  });

  it('splits long text into <=max chunks, preferring newlines', () => {
    const line = 'x'.repeat(1000);
    const chunks = splitContent(`${line}\n${line}\n${line}`, 1950);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every(c => c.length <= 1950));
  });

  it('hard-cuts a single oversized line', () => {
    const chunks = splitContent('y'.repeat(4000), 1950);
    assert.equal(chunks.length, 3);
    assert.ok(chunks.every(c => c.length <= 1950));
  });

  it('handles empty input', () => {
    assert.deepEqual(splitContent(''), []);
    assert.deepEqual(splitContent(null), []);
  });
});

function formatOriginallyPosted(isoTime) {
  const unix = Math.floor(new Date(isoTime).getTime() / 1000);
  if (Number.isNaN(unix)) return '';
  return `-# Originally Posted: <t:${unix}:f>`;
}

describe('channelRestore — formatOriginallyPosted', () => {
  it('renders a hammertime subtext line from an ISO timestamp', () => {
    assert.equal(formatOriginallyPosted('2026-05-03T08:08:00.000Z'), '-# Originally Posted: <t:1777795680:f>');
  });
  it('returns empty string for missing/invalid timestamps', () => {
    assert.equal(formatOriginallyPosted(undefined), '');
    assert.equal(formatOriginallyPosted('not-a-date'), '');
  });
});

describe('channelRestore — extractArchiveData', () => {
  it('parses the embedded payload (with escaped <)', () => {
    const payload = { v: 1, channel: 'x', messages: [{ n: 'A', a: 'u', c: 'hi <@123>' }] };
    const html = `<body>...<script id="cb-archive-data" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script></body>`;
    const data = extractArchiveData(html);
    assert.equal(data.channel, 'x');
    assert.equal(data.messages[0].c, 'hi <@123>'); // unescaped back to original
  });

  it('returns null when no embed is present (old archive)', () => {
    assert.equal(extractArchiveData('<body>no payload here</body>'), null);
  });

  it('returns null on malformed JSON', () => {
    assert.equal(extractArchiveData('<script id="cb-archive-data" type="application/json">{bad</script>'), null);
  });
});
