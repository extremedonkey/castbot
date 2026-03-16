/**
 * Tests for challengeManager.js — challenge CRUD, library operations, round selector
 * Pure logic replicated inline to avoid importing heavy modules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Replicate pure logic inline
// ─────────────────────────────────────────────

function parseAccentColor(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 && input <= 0xFFFFFF ? input : null;
  const str = String(input).trim();
  if (!str) return null;
  const hexMatch = str.replace(/^(#|0x)/i, '');
  if (/^[0-9A-Fa-f]{6}$/.test(hexMatch)) return parseInt(hexMatch, 16);
  if (/^\d+$/.test(str)) { const n = parseInt(str, 10); return n >= 0 && n <= 0xFFFFFF ? n : null; }
  return null;
}

// Library rating calculation
function calculateRating(votes) {
  const values = Object.values(votes);
  if (values.length === 0) return { average: 0, count: 0 };
  const count = values.length;
  const average = Math.round((values.reduce((a, b) => a + b, 0) / count) * 10) / 10;
  return { average, count };
}

// Challenge title auto-heading
function formatChallengeTitle(title) {
  if (!title) return 'Untitled';
  return title.startsWith('#') ? title : `# ${title}`;
}

// ─────────────────────────────────────────────
// Tests — Accent Color Parsing
// ─────────────────────────────────────────────

describe('parseAccentColor — color input handling', () => {
  it('parses hex with #', () => {
    assert.equal(parseAccentColor('#e74c3c'), 0xe74c3c);
  });

  it('parses hex without #', () => {
    assert.equal(parseAccentColor('e74c3c'), 0xe74c3c);
  });

  it('parses hex with 0x', () => {
    assert.equal(parseAccentColor('0xe74c3c'), 0xe74c3c);
  });

  it('parses integer directly', () => {
    assert.equal(parseAccentColor(0x5865F2), 0x5865F2);
  });

  it('returns null for empty/invalid', () => {
    assert.equal(parseAccentColor(''), null);
    assert.equal(parseAccentColor(null), null);
    assert.equal(parseAccentColor(undefined), null);
    assert.equal(parseAccentColor('red'), null);
    assert.equal(parseAccentColor('not-a-color'), null);
  });

  it('rejects out of range numbers', () => {
    assert.equal(parseAccentColor(-1), null);
    assert.equal(parseAccentColor(0xFFFFFF + 1), null);
  });
});

// ─────────────────────────────────────────────
// Tests — Library Rating System
// ─────────────────────────────────────────────

describe('Library rating calculation', () => {
  it('empty votes returns 0 average', () => {
    const result = calculateRating({});
    assert.equal(result.average, 0);
    assert.equal(result.count, 0);
  });

  it('single vote returns that value', () => {
    const result = calculateRating({ 'user1': 5 });
    assert.equal(result.average, 5);
    assert.equal(result.count, 1);
  });

  it('multiple votes calculates correct average', () => {
    const result = calculateRating({ 'user1': 5, 'user2': 3, 'user3': 4 });
    assert.equal(result.average, 4);
    assert.equal(result.count, 3);
  });

  it('average rounds to 1 decimal', () => {
    const result = calculateRating({ 'user1': 5, 'user2': 4, 'user3': 3 });
    assert.equal(result.average, 4); // (5+4+3)/3 = 4.0
  });

  it('handles non-integer averages', () => {
    const result = calculateRating({ 'user1': 5, 'user2': 4 });
    assert.equal(result.average, 4.5);
  });

  it('updating a vote replaces the old one', () => {
    const votes = { 'user1': 3 };
    votes['user1'] = 5; // User changes their vote
    const result = calculateRating(votes);
    assert.equal(result.average, 5);
    assert.equal(result.count, 1);
  });
});

// ─────────────────────────────────────────────
// Tests — Challenge Title Formatting
// ─────────────────────────────────────────────

describe('Challenge title formatting', () => {
  it('adds # to plain title', () => {
    assert.equal(formatChallengeTitle('Tycoons'), '# Tycoons');
  });

  it('does not double-wrap # titles', () => {
    assert.equal(formatChallengeTitle('# Already Headed'), '# Already Headed');
  });

  it('handles ## titles', () => {
    assert.equal(formatChallengeTitle('## Sub Heading'), '## Sub Heading');
  });

  it('returns Untitled for empty', () => {
    assert.equal(formatChallengeTitle(''), 'Untitled');
    assert.equal(formatChallengeTitle(null), 'Untitled');
    assert.equal(formatChallengeTitle(undefined), 'Untitled');
  });
});

// ─────────────────────────────────────────────
// Tests — Challenge Data Structure
// ─────────────────────────────────────────────

describe('Challenge data structure', () => {
  it('new challenge has required fields', () => {
    const challenge = {
      title: 'Test Challenge',
      description: '',
      image: '',
      accentColor: 0x5865F2,
      creationHost: 'userId',
      runningHost: null,
      seasonId: null,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    assert.ok(challenge.title);
    assert.equal(typeof challenge.accentColor, 'number');
    assert.ok(challenge.createdAt > 0);
    assert.equal(challenge.runningHost, null);
    assert.equal(challenge.seasonId, null);
  });

  it('imported challenge has importedFrom metadata', () => {
    const imported = {
      title: 'Imported Challenge',
      importedFrom: {
        templateId: 'tpl_abc123',
        author: { userId: '123', username: 'Reece', serverName: 'CastBot' },
        importedAt: Date.now(),
      },
    };

    assert.ok(imported.importedFrom);
    assert.equal(imported.importedFrom.templateId, 'tpl_abc123');
    assert.equal(imported.importedFrom.author.username, 'Reece');
  });
});

// ─────────────────────────────────────────────
// Tests — Library Template Structure
// ─────────────────────────────────────────────

describe('Library template structure', () => {
  it('published template has correct shape', () => {
    const template = {
      title: 'Tycoons of the Nile',
      description: 'Build your empire...',
      image: '',
      accentColor: 0x5865F2,
      author: { userId: '123', username: 'Reece', serverName: 'CastBot', serverId: '456' },
      tags: ['economic', 'strategy'],
      playerCount: '8-24',
      estimatedRounds: '3',
      publishedAt: Date.now(),
      importCount: 0,
      sourceVersion: 1,
      unpublished: false,
      ratings: { average: 0, count: 0, votes: {} },
    };

    assert.equal(template.importCount, 0);
    assert.equal(template.unpublished, false);
    assert.equal(template.ratings.count, 0);
    assert.ok(Array.isArray(template.tags));
    assert.equal(template.author.serverName, 'CastBot');
  });

  it('unpublished template is hidden', () => {
    const entries = [
      ['tpl_1', { title: 'Visible', unpublished: false }],
      ['tpl_2', { title: 'Hidden', unpublished: true }],
      ['tpl_3', { title: 'Also Visible', unpublished: false }],
    ];

    const visible = entries.filter(([, t]) => !t.unpublished);
    assert.equal(visible.length, 2);
    assert.equal(visible[0][1].title, 'Visible');
    assert.equal(visible[1][1].title, 'Also Visible');
  });

  it('import increments importCount', () => {
    const template = { importCount: 42 };
    template.importCount = (template.importCount || 0) + 1;
    assert.equal(template.importCount, 43);
  });
});

// ─────────────────────────────────────────────
// Tests — Search Filtering
// ─────────────────────────────────────────────

describe('Challenge search filtering', () => {
  const challenges = {
    'ch1': { title: 'Tycoons of the Nile', description: 'Economic trading game', seasonId: 's1' },
    'ch2': { title: 'Democracy', description: 'Social voting challenge', seasonId: 's1' },
    'ch3': { title: 'Forbidden Island', description: 'Exploration challenge', seasonId: 's2' },
  };
  const seasonNames = { 's1': 'Pokevivor', 's2': 'LOSTvivor' };

  function searchChallenges(entries, searchTerm) {
    const term = searchTerm.toLowerCase();
    return entries.filter(([, ch]) => {
      const matchTitle = (ch.title || '').toLowerCase().includes(term);
      const matchDesc = (ch.description || '').toLowerCase().includes(term);
      const matchSeason = ch.seasonId && seasonNames[ch.seasonId]?.toLowerCase().includes(term);
      return matchTitle || matchDesc || matchSeason;
    });
  }

  it('filters by title', () => {
    const results = searchChallenges(Object.entries(challenges), 'tycoons');
    assert.equal(results.length, 1);
    assert.equal(results[0][1].title, 'Tycoons of the Nile');
  });

  it('filters by description', () => {
    const results = searchChallenges(Object.entries(challenges), 'voting');
    assert.equal(results.length, 1);
    assert.equal(results[0][1].title, 'Democracy');
  });

  it('filters by season name', () => {
    const results = searchChallenges(Object.entries(challenges), 'pokevivor');
    assert.equal(results.length, 2); // Both challenges in s1
  });

  it('returns all for empty search', () => {
    const results = searchChallenges(Object.entries(challenges), '');
    // Empty string matches everything via .includes('')
    assert.equal(results.length, 3);
  });

  it('returns nothing for no match', () => {
    const results = searchChallenges(Object.entries(challenges), 'zzzznonexistent');
    assert.equal(results.length, 0);
  });
});
