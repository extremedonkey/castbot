/**
 * Tests for activityLogger.js — activity entry formatting (movement source + via pane)
 * and analyticsLogger.js SAFARI_MOVEMENT header selection.
 *
 * Pure logic replicated inline per TestingStandards.md (importing activityLogger
 * pulls in modules that log at module-load, which breaks the Node 18 test runner).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Replicated from activityLogger.js ---

const TYPE_EMOJI = {
  purchase: '🛒', currency: '🪙', item: '🧰', movement: '🗺️',
  action: '⚡', attack: '⚔️', whisper: '🤫', init: '🚀', admin: '🔧'
};

const TYPE_LABEL = {
  purchase: 'Purchase', currency: 'Currency', item: 'Item', movement: 'Movement',
  action: 'Action', attack: 'Attack', whisper: 'Whisper', init: 'Init', admin: 'Admin'
};

function formatActivityEntry(entry) {
  const emoji = TYPE_EMOJI[entry.type] || '📝';
  const label = TYPE_LABEL[entry.type] || entry.type;
  const srcPrefix = entry.src === 'admin' ? 'ADMIN ' : entry.src === 'teleport' ? 'TELEPORT ' : '';
  const ts = Math.floor(entry.t / 1000);
  const locTag = entry.loc ? ` (${entry.loc})` : '';
  let line = `<t:${ts}:R> ${emoji} **${srcPrefix}${label}**${locTag} — ${entry.desc}`;
  if (entry.via) line += ` \`via ${entry.via} pane\``;
  if (entry.stamina) line += ` \`⚡${entry.stamina}\``;
  if (entry.cd) line += ` \`cd: ${entry.cd}\``;
  return line;
}

// --- Replicated from analyticsLogger.js SAFARI_MOVEMENT case ---

function movementHeader(moveSource) {
  return moveSource === 'admin' ? 'ADMIN MOVEMENT'
    : moveSource === 'teleport' ? 'TELEPORT MOVEMENT' : 'MOVEMENT';
}

// --- Replicated from activityLogger.js backfill parser (movement segment regex) ---

const MOVEMENT_SEGMENT_REGEX = /^[\s*]*(.+?)[\s*]*\s+moved from\s+\*?\*?([A-Z]\d+)\*?\*?.*?\bto\s+\*?\*?([A-Z]\d+)\*?\*?/i;

describe('Activity Log — movement entry formatting', () => {
  const base = { t: 1783880000000, type: 'movement', desc: 'Moved from F1 to E2' };

  it('renders a plain player movement without a source prefix', () => {
    const line = formatActivityEntry(base);
    assert.ok(line.includes('🗺️ **Movement** — Moved from F1 to E2'));
    assert.ok(!line.includes('ADMIN'));
    assert.ok(!line.includes('TELEPORT'));
  });

  it('renders ADMIN prefix for admin-initiated moves', () => {
    const line = formatActivityEntry({ ...base, src: 'admin' });
    assert.ok(line.includes('🗺️ **ADMIN Movement** — Moved from F1 to E2'));
  });

  it('renders TELEPORT prefix for action-outcome teleports', () => {
    const line = formatActivityEntry({ ...base, src: 'teleport' });
    assert.ok(line.includes('🗺️ **TELEPORT Movement** — Moved from F1 to E2'));
  });

  it('ignores unknown src values (no prefix)', () => {
    const line = formatActivityEntry({ ...base, src: 'somethingelse' });
    assert.ok(line.includes('**Movement**'));
  });

  it('appends the via-pane tag when present', () => {
    const line = formatActivityEntry({ ...base, via: 'G1' });
    assert.ok(line.includes('`via G1 pane`'));
  });

  it('keeps via before stamina and cd tags', () => {
    const line = formatActivityEntry({ ...base, via: 'G1', stamina: '1/3', cd: '11h 59m' });
    const viaIdx = line.indexOf('`via G1 pane`');
    const stamIdx = line.indexOf('`⚡1/3`');
    const cdIdx = line.indexOf('`cd: 11h 59m`');
    assert.ok(viaIdx !== -1 && stamIdx !== -1 && cdIdx !== -1);
    assert.ok(viaIdx < stamIdx && stamIdx < cdIdx);
  });

  it('non-movement entries are unaffected by src/via absence', () => {
    const line = formatActivityEntry({ t: 1783880000000, type: 'currency', desc: 'Gained 7 Coins', loc: 'F1' });
    assert.ok(line.includes('🪙 **Currency** (F1) — Gained 7 Coins'));
  });
});

describe('Safari Log — SAFARI_MOVEMENT header selection', () => {
  it('maps sources to headers', () => {
    assert.equal(movementHeader(null), 'MOVEMENT');
    assert.equal(movementHeader(undefined), 'MOVEMENT');
    assert.equal(movementHeader('admin'), 'ADMIN MOVEMENT');
    assert.equal(movementHeader('teleport'), 'TELEPORT MOVEMENT');
  });
});

describe('Activity Log — char-budgeted paging (real module)', () => {
  // Importing the real module is safe now: storage.js's DST module-load log is guarded
  // under NODE_TEST_CONTEXT (tests/storageLock.test.js already imports storage directly).
  const PAGE_CHAR_BUDGET = 3400;

  const makePlayerData = (history) => ({ G: { players: { U: { safari: { history } } } } });

  it('packs more short entries per page than the old fixed 15, never exceeding the budget', async () => {
    const { getActivityPage, formatActivityEntry } = await import('../activityLogger.js');
    const short = Array.from({ length: 200 }, (_, i) => ({ t: 1783880000000 + i, type: 'currency', desc: `Gained ${i} Coins from Button: _772407`, loc: 'D4' }));
    const { entries, totalPages, totalEntries } = getActivityPage(makePlayerData(short), 'G', 'U', 1);
    assert.equal(totalEntries, 200);
    assert.ok(entries.length > 15, `expected >15 entries per page, got ${entries.length}`);
    const rendered = entries.map(formatActivityEntry).join('\n');
    assert.ok(rendered.length <= PAGE_CHAR_BUDGET, `page render ${rendered.length} exceeds budget`);
    assert.ok(totalPages < Math.ceil(200 / 15), 'char packing should produce fewer pages than fixed-15');
  });

  it('long entries produce smaller pages — every page stays within budget', async () => {
    const { getActivityPage, formatActivityEntry } = await import('../activityLogger.js');
    const long = Array.from({ length: 40 }, (_, i) => ({
      t: 1783880000000 + i, type: 'action', loc: 'D4',
      desc: `💰 $\n> • Currency: +14\n> • Text: "${'x'.repeat(160)}"\n> • Give Item: 📦 Society Endorsement (x1)`
    }));
    const pd = makePlayerData(long);
    const first = getActivityPage(pd, 'G', 'U', 1);
    for (let p = 1; p <= first.totalPages; p++) {
      const { entries } = getActivityPage(pd, 'G', 'U', p);
      const rendered = entries.map(formatActivityEntry).join('\n');
      assert.ok(rendered.length <= PAGE_CHAR_BUDGET, `page ${p} render ${rendered.length} exceeds budget`);
      assert.ok(entries.length >= 1, 'every page has at least one entry');
    }
  });

  it('pages are deterministic and cover all entries exactly once', async () => {
    const { getActivityPage } = await import('../activityLogger.js');
    const history = Array.from({ length: 57 }, (_, i) => ({ t: 1783880000000 + i, type: 'movement', desc: `Moved from A1 to A2 (#${i})`, loc: 'A2' }));
    const pd = makePlayerData(history);
    const first = getActivityPage(pd, 'G', 'U', 1);
    const seen = [];
    for (let p = 1; p <= first.totalPages; p++) {
      seen.push(...getActivityPage(pd, 'G', 'U', p).entries.map(e => e.desc));
    }
    assert.equal(seen.length, 57);
    assert.equal(new Set(seen).size, 57);
    assert.equal(seen[0], 'Moved from A1 to A2 (#56)'); // newest first
  });

  it('empty history yields one empty page; out-of-range page clamps', async () => {
    const { getActivityPage } = await import('../activityLogger.js');
    const empty = getActivityPage(makePlayerData([]), 'G', 'U', 1);
    assert.equal(empty.totalPages, 1);
    assert.deepEqual(empty.entries, []);
    const clamped = getActivityPage(makePlayerData([{ t: 1, type: 'currency', desc: 'x' }]), 'G', 'U', 99);
    assert.equal(clamped.page, 1);
  });
});

describe('Safari Log — backfill parser still matches new movement lines', () => {
  it('parses the player segment with stamina tag and via-pane suffix', () => {
    const playerSegment = '**gabi!** moved from **F1** (#🏘️f1-street) to **E2** (#🎭e2-theater) (⚡2/999 → 1/999 ♻️11h 59m) [via G1 pane]';
    const m = playerSegment.match(MOVEMENT_SEGMENT_REGEX);
    assert.ok(m);
    assert.equal(m[1].replace(/\*+/g, '').trim(), 'gabi!');
    assert.equal(m[2], 'F1');
    assert.equal(m[3], 'E2');
  });

  it('header line for ADMIN MOVEMENT still starts with the map emoji', () => {
    const header = '🗺️ **ADMIN MOVEMENT** | [9:59AM] | **gabi!** moved from **F1** to **E2**';
    assert.ok(header.startsWith('🗺️'));
    assert.equal(header.split('|').length >= 3, true);
  });
});
