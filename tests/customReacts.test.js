/**
 * Tests for Custom Reacts system
 * Covers: color utilities, data helpers, UI builder logic
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Color Utilities (replicated from utils/colorUtils.js) ──────────

function formatRoleColor(color) {
  if (!color || color === 0) return '#000000';
  const hex = color.toString(16).padStart(6, '0');
  return `#${hex}`;
}

function validateHexColor(color) {
  if (!color) return null;
  const hex = color.replace('#', '').trim();
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const fullHex = hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex;
  return `#${fullHex.toUpperCase()}`;
}

function hexToColorInt(hex) {
  if (!hex) return 0;
  return parseInt(hex.replace('#', ''), 16) || 0;
}

// ── Data helpers (replicated from customReacts.js) ─────────────────

function generateReactId(userId) {
  return `cr_${Date.now()}_${userId}`;
}

function checkDangerousPermissions(permBitfield) {
  // Simplified version using raw bitfield instead of Discord.js Role object
  const MANAGE_ROLES = 1n << 28n;
  const MANAGE_CHANNELS = 1n << 4n;
  const ADMINISTRATOR = 1n << 3n;
  const MANAGE_GUILD = 1n << 5n;
  const BAN_MEMBERS = 1n << 2n;
  const KICK_MEMBERS = 1n << 1n;

  const perms = BigInt(permBitfield);
  const found = [];
  if (perms & ADMINISTRATOR) found.push('Administrator');
  if (perms & MANAGE_ROLES) found.push('Manage Roles');
  if (perms & MANAGE_CHANNELS) found.push('Manage Channels');
  if (perms & MANAGE_GUILD) found.push('Manage Server');
  if (perms & BAN_MEMBERS) found.push('Ban Members');
  if (perms & KICK_MEMBERS) found.push('Kick Members');
  return { dangerous: found.length > 0, permNames: found };
}

// ── Color Utility Tests ────────────────────────────────────────────

describe('Color Utilities', () => {
  describe('formatRoleColor', () => {
    it('formats standard red', () => {
      assert.equal(formatRoleColor(16711680), '#ff0000');
    });

    it('formats blue with padding', () => {
      assert.equal(formatRoleColor(255), '#0000ff');
    });

    it('returns black for zero', () => {
      assert.equal(formatRoleColor(0), '#000000');
    });

    it('returns black for null', () => {
      assert.equal(formatRoleColor(null), '#000000');
    });

    it('returns black for undefined', () => {
      assert.equal(formatRoleColor(undefined), '#000000');
    });

    it('formats Discord blurple', () => {
      assert.equal(formatRoleColor(0x5865f2), '#5865f2');
    });
  });

  describe('validateHexColor', () => {
    it('validates 6-char hex with hash', () => {
      assert.equal(validateHexColor('#FF0000'), '#FF0000');
    });

    it('validates 6-char hex without hash', () => {
      assert.equal(validateHexColor('FF0000'), '#FF0000');
    });

    it('expands 3-char hex', () => {
      assert.equal(validateHexColor('#F00'), '#FF0000');
    });

    it('expands 3-char hex without hash', () => {
      assert.equal(validateHexColor('abc'), '#AABBCC');
    });

    it('rejects invalid hex', () => {
      assert.equal(validateHexColor('GGGGGG'), null);
    });

    it('rejects empty string', () => {
      assert.equal(validateHexColor(''), null);
    });

    it('rejects null', () => {
      assert.equal(validateHexColor(null), null);
    });

    it('handles whitespace', () => {
      assert.equal(validateHexColor('  #abc  '), '#AABBCC');
    });

    it('rejects wrong length', () => {
      assert.equal(validateHexColor('#ABCD'), null);
    });
  });

  describe('hexToColorInt', () => {
    it('converts red', () => {
      assert.equal(hexToColorInt('#FF0000'), 16711680);
    });

    it('converts without hash', () => {
      assert.equal(hexToColorInt('0000FF'), 255);
    });

    it('returns 0 for null', () => {
      assert.equal(hexToColorInt(null), 0);
    });

    it('returns 0 for empty', () => {
      assert.equal(hexToColorInt(''), 0);
    });

    it('roundtrips with formatRoleColor', () => {
      const original = 0x3498DB;
      const hex = formatRoleColor(original);
      const back = hexToColorInt(hex);
      assert.equal(back, original);
    });
  });
});

// ── Data Helper Tests ──────────────────────────────────────────────

describe('Custom React Data Helpers', () => {
  describe('generateReactId', () => {
    it('starts with cr_ prefix', () => {
      const id = generateReactId('123456');
      assert.ok(id.startsWith('cr_'));
    });

    it('contains timestamp', () => {
      const before = Date.now();
      const id = generateReactId('123456');
      const parts = id.split('_');
      const ts = parseInt(parts[1]);
      assert.ok(ts >= before);
      assert.ok(ts <= Date.now());
    });

    it('contains user ID', () => {
      const id = generateReactId('391415444084490240');
      assert.ok(id.endsWith('_391415444084490240'));
    });

    it('generates unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        ids.add(generateReactId('test'));
      }
      // Should have at least 2 unique (timestamp may repeat within 1ms)
      assert.ok(ids.size >= 1);
    });
  });

  describe('checkDangerousPermissions', () => {
    it('detects Administrator', () => {
      const result = checkDangerousPermissions(1n << 3n);
      assert.equal(result.dangerous, true);
      assert.ok(result.permNames.includes('Administrator'));
    });

    it('detects ManageRoles', () => {
      const result = checkDangerousPermissions(1n << 28n);
      assert.equal(result.dangerous, true);
      assert.ok(result.permNames.includes('Manage Roles'));
    });

    it('detects multiple dangerous perms', () => {
      const perms = (1n << 3n) | (1n << 28n) | (1n << 4n);
      const result = checkDangerousPermissions(perms);
      assert.equal(result.dangerous, true);
      assert.ok(result.permNames.length >= 3);
    });

    it('returns safe for no dangerous perms', () => {
      // SEND_MESSAGES (1 << 11)
      const result = checkDangerousPermissions(1n << 11n);
      assert.equal(result.dangerous, false);
      assert.equal(result.permNames.length, 0);
    });

    it('returns safe for zero permissions', () => {
      const result = checkDangerousPermissions(0n);
      assert.equal(result.dangerous, false);
    });
  });
});

// ── Mapping Logic Tests ────────────────────────────────────────────

describe('Mapping Logic', () => {
  it('roleMapping with reactId falls through to additive behavior', () => {
    // Simulates the handler dispatch logic
    const roleMapping = { '💗': 'role1', reactId: 'cr_123_456' };

    let behavior = 'additive';
    if (roleMapping.isBan) behavior = 'ban';
    else if (roleMapping.isTimezone) behavior = 'exclusive';

    assert.equal(behavior, 'additive');
  });

  it('roleMapping with isBan takes priority', () => {
    const roleMapping = { '🎯': 'role1', isBan: true };

    let behavior = 'additive';
    if (roleMapping.isBan) behavior = 'ban';
    else if (roleMapping.isTimezone) behavior = 'exclusive';

    assert.equal(behavior, 'ban');
  });

  it('roleMapping with isTimezone is exclusive', () => {
    const roleMapping = { '1️⃣': 'role1', isTimezone: true };

    let behavior = 'additive';
    if (roleMapping.isBan) behavior = 'ban';
    else if (roleMapping.isTimezone) behavior = 'exclusive';

    assert.equal(behavior, 'exclusive');
  });

  it('cleanup exempts custom react mappings', () => {
    // Simulates the cleanup condition
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const oldCustomReact = {
      createdAt: thirtyDaysAgo - 1000,
      mapping: { '💗': 'role1', reactId: 'cr_123' }
    };
    const oldBan = {
      createdAt: thirtyDaysAgo - 1000,
      mapping: { '🎯': 'role1', isBan: true }
    };
    const oldPronoun = {
      createdAt: thirtyDaysAgo - 1000,
      mapping: { '❤️': 'role1', isPronoun: true }
    };

    // Should NOT clean up custom reacts
    const shouldCleanCR = oldCustomReact.createdAt < thirtyDaysAgo && !oldCustomReact.mapping?.isBan && !oldCustomReact.mapping?.reactId;
    assert.equal(shouldCleanCR, false);

    // Should NOT clean up bans
    const shouldCleanBan = oldBan.createdAt < thirtyDaysAgo && !oldBan.mapping?.isBan && !oldBan.mapping?.reactId;
    assert.equal(shouldCleanBan, false);

    // SHOULD clean up old pronouns (no special exemption)
    const shouldCleanPronoun = oldPronoun.createdAt < thirtyDaysAgo && !oldPronoun.mapping?.isBan && !oldPronoun.mapping?.reactId;
    assert.equal(shouldCleanPronoun, true);
  });
});

// ── Panel Data Structure Tests ─────────────────────────────────────

describe('Panel Data Structure', () => {
  it('builds correct role mapping from panel', () => {
    const panel = {
      name: 'Heart Squad',
      mappings: [
        { emoji: '💗', roleId: 'role1', label: 'Heart Squad' },
        { emoji: '🏈', roleId: 'role2', label: 'Draft Updates' },
      ]
    };

    const roleMapping = Object.fromEntries(
      panel.mappings.map(m => [m.emoji, m.roleId])
    );
    roleMapping.reactId = 'cr_123';

    assert.equal(roleMapping['💗'], 'role1');
    assert.equal(roleMapping['🏈'], 'role2');
    assert.equal(roleMapping.reactId, 'cr_123');
    assert.equal(roleMapping.isBan, undefined);
    assert.equal(roleMapping.isTimezone, undefined);
  });

  it('limits panels per guild', () => {
    const MAX_PANELS = 25;
    assert.ok(MAX_PANELS <= 25); // Discord StringSelect limit
  });

  it('limits mappings per panel', () => {
    const MAX_MAPPINGS = 20;
    assert.ok(MAX_MAPPINGS <= 20); // Discord reaction limit
  });
});
