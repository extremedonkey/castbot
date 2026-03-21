/**
 * Castlist System Tests
 * Pure logic tests for tribe data, color handling, navigation, sorting, and error resilience
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicate pure functions inline (avoids importing Discord-dependent modules) ──

function formatRoleColor(color) {
  if (!color || color === 0) return '#000000';
  const hex = color.toString(16).padStart(6, '0');
  return `#${hex}`;
}

function validateHexColor(color) {
  if (!color) return null;
  const hex = color.replace('#', '').trim();
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const fullHex = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  return `#${fullHex.toUpperCase()}`;
}

function sanitizeErrorMessage(error, maxLength = 500) {
  let message = typeof error === 'string' ? error : (error?.message || 'Unknown error');
  if (message.length > maxLength) message = message.substring(0, maxLength - 3) + '...';
  message = message.replace(/<[^>]*>/g, '').trim();
  if (!message || message.length === 0) message = 'Server error (Discord infrastructure issue)';
  return message;
}

function populateTribeData(existingData = {}, role, castlistId, castlistName) {
  return {
    ...existingData,
    castlistIds: existingData.castlistIds
      ? (existingData.castlistIds.includes(castlistId) ? existingData.castlistIds : [...existingData.castlistIds, castlistId])
      : [castlistId],
    castlist: castlistName,
    color: existingData.color || formatRoleColor(role.color),
    analyticsName: role.name,
    analyticsAdded: existingData.analyticsAdded || Date.now(),
    emoji: existingData.emoji || '🏕️',
    showPlayerEmojis: existingData.showPlayerEmojis ?? true,
    memberCount: role.members?.size ?? existingData.memberCount ?? 0
  };
}

function determineDisplayScenario(tribes) {
  const needsPagination = tribes.some(tribe => tribe.memberCount >= 9);
  return needsPagination ? 'multi-page' : 'ideal';
}

function reorderTribes(tribes, userId = null, strategy = 'default', castlistName = 'default') {
  switch (strategy) {
    case 'user-first': {
      if (!userId || castlistName !== 'default') return tribes;
      const userTribes = [];
      const otherTribes = [];
      for (const tribe of tribes) {
        const userInTribe = tribe.members && tribe.members.some(member => member.id === userId);
        if (userInTribe) userTribes.push(tribe); else otherTribes.push(tribe);
      }
      userTribes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      otherTribes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return [...userTribes, ...otherTribes];
    }
    case 'alphabetical':
      return [...tribes].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    case 'size':
      return [...tribes].sort((a, b) => b.memberCount - a.memberCount);
    case 'default':
    default:
      return tribes;
  }
}

function parseSeasonNumber(roleName) {
  if (!roleName) return null;
  const sxMatch = roleName.match(/^S(\d{1,2}(?:\.\d+)?)\s/i);
  if (sxMatch) return { type: 'season', number: parseFloat(sxMatch[1]) };
  const seasonMatch = roleName.match(/^Season\s+(\d{1,2}(?:\.\d+)?)/i);
  if (seasonMatch) return { type: 'season', number: parseFloat(seasonMatch[1]) };
  return null;
}

function categorizeRoleName(roleName) {
  if (!roleName) return { category: 'other', value: '' };
  const seasonData = parseSeasonNumber(roleName);
  if (seasonData) return { category: 'season', value: seasonData.number, original: roleName };
  const firstChar = roleName.charAt(0);
  if (/[a-z]/i.test(firstChar)) return { category: 'alpha', value: roleName.toLowerCase(), original: roleName };
  if (/\d/.test(firstChar)) {
    const numMatch = roleName.match(/^(\d+)/);
    return { category: 'numeric', value: numMatch ? parseInt(numMatch[1]) : 0, original: roleName };
  }
  if (!/[a-z0-9]/i.test(firstChar)) return { category: 'emoji', value: roleName, original: roleName };
  return { category: 'other', value: roleName, original: roleName };
}

// ── Tests ──

describe('formatRoleColor', () => {
  it('converts red (16711680) to #ff0000', () => {
    assert.equal(formatRoleColor(16711680), '#ff0000');
  });
  it('converts blue (255) to #0000ff', () => {
    assert.equal(formatRoleColor(255), '#0000ff');
  });
  it('converts green (65280) to #00ff00', () => {
    assert.equal(formatRoleColor(65280), '#00ff00');
  });
  it('returns #000000 for 0', () => {
    assert.equal(formatRoleColor(0), '#000000');
  });
  it('returns #000000 for null/undefined', () => {
    assert.equal(formatRoleColor(null), '#000000');
    assert.equal(formatRoleColor(undefined), '#000000');
  });
});

describe('validateHexColor', () => {
  it('accepts 6-char hex with #', () => {
    assert.equal(validateHexColor('#FF0000'), '#FF0000');
  });
  it('accepts 6-char hex without #', () => {
    assert.equal(validateHexColor('00FF00'), '#00FF00');
  });
  it('expands 3-char hex to 6-char', () => {
    assert.equal(validateHexColor('F00'), '#FF0000');
    assert.equal(validateHexColor('#0F0'), '#00FF00');
  });
  it('uppercases mixed case', () => {
    assert.equal(validateHexColor('#1a2b3c'), '#1A2B3C');
  });
  it('rejects invalid hex', () => {
    assert.equal(validateHexColor('xyz'), null);
    assert.equal(validateHexColor('#12G456'), null);
    assert.equal(validateHexColor('12345'), null);
  });
  it('returns null for empty/null', () => {
    assert.equal(validateHexColor(''), null);
    assert.equal(validateHexColor(null), null);
  });
});

describe('sanitizeErrorMessage', () => {
  it('passes through short strings', () => {
    assert.equal(sanitizeErrorMessage('Something broke'), 'Something broke');
  });
  it('extracts message from Error objects', () => {
    assert.equal(sanitizeErrorMessage(new Error('oops')), 'oops');
  });
  it('truncates long messages', () => {
    const long = 'x'.repeat(600);
    const result = sanitizeErrorMessage(long);
    assert.equal(result.length, 500);
    assert.ok(result.endsWith('...'));
  });
  it('strips HTML tags', () => {
    assert.equal(sanitizeErrorMessage('<div>Error</div>'), 'Error');
    assert.equal(sanitizeErrorMessage('<html><body><h1>502 Bad Gateway</h1></body></html>'), '502 Bad Gateway');
  });
  it('falls back for empty-after-strip', () => {
    assert.equal(sanitizeErrorMessage('<>'), 'Server error (Discord infrastructure issue)');
  });
  it('handles null/undefined error', () => {
    assert.equal(sanitizeErrorMessage({}), 'Unknown error');
    assert.equal(sanitizeErrorMessage(null), 'Unknown error');
  });
  it('respects custom maxLength', () => {
    const result = sanitizeErrorMessage('x'.repeat(100), 50);
    assert.equal(result.length, 50);
  });
});

describe('populateTribeData', () => {
  const mockRole = { name: 'Vatu', color: 16711680, members: { size: 5 } };

  it('creates fresh tribe with defaults', () => {
    const result = populateTribeData({}, mockRole, 'cl_1', 'default');
    assert.deepEqual(result.castlistIds, ['cl_1']);
    assert.equal(result.castlist, 'default');
    assert.equal(result.color, '#ff0000');
    assert.equal(result.analyticsName, 'Vatu');
    assert.equal(result.emoji, '🏕️');
    assert.equal(result.showPlayerEmojis, true);
    assert.equal(result.memberCount, 5);
  });

  it('preserves existing custom color', () => {
    const result = populateTribeData({ color: '#CUSTOM' }, mockRole, 'cl_1', 'default');
    assert.equal(result.color, '#CUSTOM');
  });

  it('preserves existing emoji', () => {
    const result = populateTribeData({ emoji: '🔥' }, mockRole, 'cl_1', 'default');
    assert.equal(result.emoji, '🔥');
  });

  it('does not duplicate castlistIds', () => {
    const result = populateTribeData({ castlistIds: ['cl_1'] }, mockRole, 'cl_1', 'default');
    assert.deepEqual(result.castlistIds, ['cl_1']);
  });

  it('appends new castlistId', () => {
    const result = populateTribeData({ castlistIds: ['cl_1'] }, mockRole, 'cl_2', 'custom');
    assert.deepEqual(result.castlistIds, ['cl_1', 'cl_2']);
  });

  it('preserves analyticsAdded timestamp', () => {
    const result = populateTribeData({ analyticsAdded: 12345 }, mockRole, 'cl_1', 'default');
    assert.equal(result.analyticsAdded, 12345);
  });
});

describe('determineDisplayScenario', () => {
  it('returns ideal for all tribes under 9 members', () => {
    const tribes = [{ memberCount: 5 }, { memberCount: 8 }];
    assert.equal(determineDisplayScenario(tribes), 'ideal');
  });

  it('returns multi-page for tribe with 9+ members', () => {
    const tribes = [{ memberCount: 5 }, { memberCount: 12 }];
    assert.equal(determineDisplayScenario(tribes), 'multi-page');
  });

  it('returns ideal for empty array', () => {
    assert.equal(determineDisplayScenario([]), 'ideal');
  });

  it('returns multi-page for exactly 9', () => {
    assert.equal(determineDisplayScenario([{ memberCount: 9 }]), 'multi-page');
  });

  it('returns ideal for single tribe with 0 members', () => {
    assert.equal(determineDisplayScenario([{ memberCount: 0 }]), 'ideal');
  });
});

describe('reorderTribes — user-first', () => {
  const tribes = [
    { name: 'Zebra', members: [{ id: 'user1' }], memberCount: 1 },
    { name: 'Alpha', members: [{ id: 'user2' }], memberCount: 1 },
    { name: 'Bravo', members: [{ id: 'user1' }, { id: 'user3' }], memberCount: 2 }
  ];

  it('puts user tribes first, both groups sorted alphabetically', () => {
    const result = reorderTribes(tribes, 'user1', 'user-first', 'default');
    assert.equal(result[0].name, 'Bravo');
    assert.equal(result[1].name, 'Zebra');
    assert.equal(result[2].name, 'Alpha');
  });

  it('returns original order when user is in no tribes', () => {
    const result = reorderTribes(tribes, 'nobody', 'user-first', 'default');
    assert.equal(result[0].name, 'Alpha');
    assert.equal(result[2].name, 'Zebra');
  });

  it('skips user-first for non-default castlists', () => {
    const result = reorderTribes(tribes, 'user1', 'user-first', 'custom_castlist');
    assert.equal(result[0].name, 'Zebra'); // Original order preserved
  });

  it('skips user-first when no userId', () => {
    const result = reorderTribes(tribes, null, 'user-first', 'default');
    assert.equal(result[0].name, 'Zebra');
  });
});

describe('reorderTribes — other strategies', () => {
  const tribes = [
    { name: 'Zebra', memberCount: 3 },
    { name: 'Alpha', memberCount: 10 },
    { name: 'Mike', memberCount: 1 }
  ];

  it('alphabetical sorts A-Z', () => {
    const result = reorderTribes(tribes, null, 'alphabetical');
    assert.equal(result[0].name, 'Alpha');
    assert.equal(result[1].name, 'Mike');
    assert.equal(result[2].name, 'Zebra');
  });

  it('size sorts descending', () => {
    const result = reorderTribes(tribes, null, 'size');
    assert.equal(result[0].name, 'Alpha');
    assert.equal(result[1].name, 'Zebra');
    assert.equal(result[2].name, 'Mike');
  });

  it('default preserves original order', () => {
    const result = reorderTribes(tribes, null, 'default');
    assert.equal(result[0].name, 'Zebra');
  });

  it('handles null names without crashing', () => {
    const nullTribes = [{ name: null, memberCount: 1 }, { name: 'Alpha', memberCount: 1 }];
    assert.doesNotThrow(() => reorderTribes(nullTribes, null, 'alphabetical'));
  });
});

describe('parseSeasonNumber', () => {
  it('parses S1 format', () => {
    assert.deepEqual(parseSeasonNumber('S1 - Winners'), { type: 'season', number: 1 });
  });
  it('parses S6.5 decimal', () => {
    assert.deepEqual(parseSeasonNumber('S6.5 - Losers'), { type: 'season', number: 6.5 });
  });
  it('parses S11 double digit', () => {
    assert.deepEqual(parseSeasonNumber('S11 Final'), { type: 'season', number: 11 });
  });
  it('parses Season 1 long format', () => {
    assert.deepEqual(parseSeasonNumber('Season 1'), { type: 'season', number: 1 });
  });
  it('parses Season with extra spaces', () => {
    assert.deepEqual(parseSeasonNumber('Season  3'), { type: 'season', number: 3 });
  });
  it('returns null for non-season', () => {
    assert.equal(parseSeasonNumber('Random Role'), null);
    assert.equal(parseSeasonNumber('Winners S1'), null); // S1 not at start
  });
  it('returns null for null/empty', () => {
    assert.equal(parseSeasonNumber(null), null);
    assert.equal(parseSeasonNumber(''), null);
  });
});

describe('categorizeRoleName', () => {
  it('categorizes season patterns', () => {
    assert.equal(categorizeRoleName('S5 Winners').category, 'season');
    assert.equal(categorizeRoleName('S5 Winners').value, 5);
  });
  it('categorizes alpha names', () => {
    assert.equal(categorizeRoleName('Alpha Team').category, 'alpha');
    assert.equal(categorizeRoleName('Alpha Team').value, 'alpha team');
  });
  it('categorizes numeric names', () => {
    assert.equal(categorizeRoleName('123 Squad').category, 'numeric');
    assert.equal(categorizeRoleName('123 Squad').value, 123);
  });
  it('categorizes emoji names', () => {
    assert.equal(categorizeRoleName('🏆 Winners').category, 'emoji');
  });
  it('handles null/empty', () => {
    assert.equal(categorizeRoleName(null).category, 'other');
    assert.equal(categorizeRoleName('').category, 'other');
  });
});

describe('Role deletion resilience — data layer', () => {
  it('populateTribeData works even if role has no members property', () => {
    const role = { name: 'Deleted Tribe', color: 0 };
    const result = populateTribeData({}, role, 'cl_1', 'default');
    assert.equal(result.memberCount, 0);
    assert.equal(result.analyticsName, 'Deleted Tribe');
  });

  it('determineDisplayScenario handles tribes with 0 members', () => {
    const tribes = [{ memberCount: 0 }, { memberCount: 0 }];
    assert.equal(determineDisplayScenario(tribes), 'ideal');
  });

  it('reorderTribes handles tribes with no members array', () => {
    const tribes = [
      { name: 'A', members: undefined, memberCount: 0 },
      { name: 'B', members: [], memberCount: 0 }
    ];
    // Should not crash on user-first with undefined members
    const result = reorderTribes(tribes, 'user1', 'user-first', 'default');
    assert.equal(result.length, 2);
  });

  it('reorderTribes with empty array returns empty', () => {
    const result = reorderTribes([], 'user1', 'user-first', 'default');
    assert.equal(result.length, 0);
  });
});
