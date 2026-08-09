/**
 * Casting permission gate — source-of-truth + Administrator regression
 *
 * 2026-08-09: radicaldinosaur held the "Production" role, whose ONLY ticked permission is
 * Administrator. All 18 Casting/Marooning gates denied them.
 *
 * Root cause was the *source*, not the mask: every gate was fed a discord.js GuildMember from
 * guild.members.fetch(), whose `.permissions` getter is a raw OR of role bits (GuildMember.js:254).
 * Unlike Discord's own computation it does NOT expand Administrator, ignores channel overwrites,
 * and depends on guild.roles.cache. The member is now taken from the interaction payload
 * (context.member), which Discord computes itself.
 *
 * Logic replicated inline per TestingStandards (app.js is not importable in tests).
 * Keep in sync with hasCastRankingPermissions in app.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPEN_ACCESS_GUILD = '1331657596087566398';
const NORMAL_GUILD = '1400479796219215959';

function hasCastRankingPermissions(member, guildId) {
  if (!member || !member.permissions) return false;
  if (guildId === OPEN_ACCESS_GUILD) return true;
  const permissions = new PermissionsBitField(BigInt(member.permissions));
  return permissions.has(PermissionFlagsBits.ManageRoles)
    || permissions.has(PermissionFlagsBits.ManageChannels);
}

/** Interaction payload member: Discord has already computed the permission string. */
const payload = bits => ({ permissions: bits.toString() });
/** What Discord sends for an Administrator — the algorithm short-circuits to ALL. */
const ADMIN_PAYLOAD = payload(PermissionsBitField.All);

describe('Casting gate — the Administrator regression', () => {
  it('admits an Administrator (payload — Discord expands to all permissions)', () => {
    assert.equal(hasCastRankingPermissions(ADMIN_PAYLOAD, NORMAL_GUILD), true);
  });

  it('admits a bare Administrator bit too — .has() applies the override', () => {
    // Defence in depth: even if someone reintroduces a raw role-bit source (a fetched
    // GuildMember, which carries literally 0x8), .has() still grants it. A raw `&` would not.
    const bareAdminBit = payload(PermissionFlagsBits.Administrator);
    assert.equal(BigInt(bareAdminBit.permissions), 8n);
    assert.equal(hasCastRankingPermissions(bareAdminBit, NORMAL_GUILD), true);
  });

  it('a raw bitwise AND would have denied that member (documents the original bug)', () => {
    const bits = PermissionFlagsBits.Administrator;
    const mask = PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels;
    assert.equal((bits & mask) !== 0n, false, 'this is exactly why the old check failed');
  });
});

describe('Casting gate — permission masks', () => {
  it('admits Manage Roles', () => {
    assert.equal(hasCastRankingPermissions(payload(PermissionFlagsBits.ManageRoles), NORMAL_GUILD), true);
  });

  it('admits Manage Channels', () => {
    assert.equal(hasCastRankingPermissions(payload(PermissionFlagsBits.ManageChannels), NORMAL_GUILD), true);
  });

  it('requires only ONE of the two — has(A|B) would demand both', () => {
    const both = PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels;
    const onlyRoles = new PermissionsBitField(PermissionFlagsBits.ManageRoles);
    assert.equal(onlyRoles.has(both), false, 'has() on a combined mask is AND, not OR');
    assert.equal(hasCastRankingPermissions(payload(PermissionFlagsBits.ManageRoles), NORMAL_GUILD), true);
  });

  it('still denies a plain player', () => {
    const member = payload(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel);
    assert.equal(hasCastRankingPermissions(member, NORMAL_GUILD), false);
  });

  it('still denies Manage Guild alone (deliberately not in the mask)', () => {
    assert.equal(hasCastRankingPermissions(payload(PermissionFlagsBits.ManageGuild), NORMAL_GUILD), false);
  });

  it('denies members with no permissions, and null/undefined, without throwing', () => {
    assert.equal(hasCastRankingPermissions(payload(0n), NORMAL_GUILD), false);
    assert.equal(hasCastRankingPermissions(null, NORMAL_GUILD), false);
    assert.equal(hasCastRankingPermissions(undefined, NORMAL_GUILD), false);
    assert.equal(hasCastRankingPermissions({}, NORMAL_GUILD), false);
  });

  it('keeps the open-access guild exception ahead of the mask', () => {
    assert.equal(hasCastRankingPermissions(payload(PermissionFlagsBits.SendMessages), OPEN_ACCESS_GUILD), true);
  });

  it('open-access exception does not leak to other guilds', () => {
    assert.equal(hasCastRankingPermissions(payload(PermissionFlagsBits.SendMessages), NORMAL_GUILD), false);
  });
});

describe('Casting gate — parity with the /menu admin gate', () => {
  // hasAdminPermissions admits ManageChannels|ManageGuild|ManageRoles|Administrator. Casting
  // deliberately omits ManageGuild; every OTHER admin permission must be honoured, or a host
  // reaches the Production Menu and then hits a wall inside Casting.
  for (const [name, bit] of [
    ['Administrator', PermissionFlagsBits.Administrator],
    ['ManageRoles', PermissionFlagsBits.ManageRoles],
    ['ManageChannels', PermissionFlagsBits.ManageChannels]
  ]) {
    it(`${name} opens the Production Menu AND Casting`, () => {
      assert.equal(hasCastRankingPermissions(payload(bit), NORMAL_GUILD), true);
    });
  }
});

describe('Casting gate — no call site may read a fetched GuildMember', () => {
  // A permission read off guild.members.fetch() is discord.js recomputing locally, not Discord's
  // answer: no Administrator expansion, no channel overwrites, cache-dependent. Ratchet at zero —
  // if this fails, pass context.member instead of fetching the member.
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  it('every hasCastRankingPermissions() call passes context.member', () => {
    const calls = [...src.matchAll(/hasCastRankingPermissions\(\s*([A-Za-z_$][\w$.]*)/g)]
      .map(m => m[1])
      .filter(arg => arg !== 'member');   // the function's own declaration
    assert.ok(calls.length >= 18, `expected >=18 call sites, found ${calls.length}`);
    const bad = [...new Set(calls.filter(arg => arg !== 'context.member'))];
    assert.deepEqual(bad, [], `gates fed something other than context.member: ${bad.join(', ')}`);
  });

  it('no members.fetch result is passed to a casting gate', () => {
    // Catches the shape `const x = await guild.members.fetch(...)` followed within 3 lines by a
    // gate call on x — the exact pattern that caused the 2026-08-09 lockout.
    const lines = src.split(/\r?\n/);
    const offenders = [];
    lines.forEach((line, i) => {
      const bind = line.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+.*members\.fetch\(/);
      if (!bind) return;
      const window = lines.slice(i + 1, i + 4).join('\n');
      if (new RegExp(`hasCastRankingPermissions\\(\\s*${bind[1]}\\b`).test(window)) {
        offenders.push(`app.js:${i + 1} (${bind[1]})`);
      }
    });
    assert.deepEqual(offenders, [], `fetched member fed to a casting gate:\n  ${offenders.join('\n  ')}`);
  });
});
