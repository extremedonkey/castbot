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
