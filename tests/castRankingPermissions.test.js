/**
 * Casting permission gate — Administrator regression
 *
 * 2026-08-09: radicaldinosaur held the "Production" role, whose ONLY ticked permission is
 * Administrator. All 18 Casting/Marooning gates denied them.
 *
 * Cause: the gate is fed a discord.js GuildMember from guild.members.fetch(), whose
 * `.permissions` getter is a raw OR of role bits (GuildMember.js:254) — unlike Discord's own
 * computation, it does NOT expand Administrator into "all permissions". So the member's bits are
 * literally just 0x8, which ANDs to zero against ManageRoles|ManageChannels.
 *
 * Logic replicated inline per TestingStandards (app.js is not importable in tests).
 * Keep in sync with hasCastRankingPermissions in app.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';

const OPEN_ACCESS_GUILD = '1331657596087566398';
const NORMAL_GUILD = '1400479796219215959';

function hasCastRankingPermissions(member, guildId) {
  if (!member || !member.permissions) return false;
  if (guildId === OPEN_ACCESS_GUILD) return true;
  const permissions = BigInt(member.permissions);
  const castRankingPermissions =
    PermissionFlagsBits.ManageRoles |
    PermissionFlagsBits.ManageChannels |
    PermissionFlagsBits.Administrator;
  return (permissions & BigInt(castRankingPermissions)) !== 0n;
}

/** A fetched GuildMember exposes raw role bits — no Administrator expansion. */
const memberWith = (...bits) => ({ permissions: bits.reduce((a, b) => a | b, 0n).toString() });

describe('Casting gate — permission masks', () => {
  it('admits an Administrator-only member (the 2026-08-09 regression)', () => {
    const member = memberWith(PermissionFlagsBits.Administrator);
    assert.equal(BigInt(member.permissions), 8n, 'a fetched member really does carry only 0x8');
    assert.equal(hasCastRankingPermissions(member, NORMAL_GUILD), true);
  });

  it('admits Manage Roles', () => {
    assert.equal(hasCastRankingPermissions(memberWith(PermissionFlagsBits.ManageRoles), NORMAL_GUILD), true);
  });

  it('admits Manage Channels', () => {
    assert.equal(hasCastRankingPermissions(memberWith(PermissionFlagsBits.ManageChannels), NORMAL_GUILD), true);
  });

  it('admits a member holding several admin-ish permissions', () => {
    const member = memberWith(PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild);
    assert.equal(hasCastRankingPermissions(member, NORMAL_GUILD), true);
  });

  it('still denies a plain player', () => {
    const member = memberWith(PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel);
    assert.equal(hasCastRankingPermissions(member, NORMAL_GUILD), false);
  });

  it('still denies Manage Guild alone (deliberately not in the mask)', () => {
    assert.equal(hasCastRankingPermissions(memberWith(PermissionFlagsBits.ManageGuild), NORMAL_GUILD), false);
  });

  it('denies a member with no permissions at all', () => {
    assert.equal(hasCastRankingPermissions({ permissions: '0' }, NORMAL_GUILD), false);
  });

  it('denies null/undefined/permission-less members without throwing', () => {
    assert.equal(hasCastRankingPermissions(null, NORMAL_GUILD), false);
    assert.equal(hasCastRankingPermissions(undefined, NORMAL_GUILD), false);
    assert.equal(hasCastRankingPermissions({}, NORMAL_GUILD), false);
  });

  it('keeps the open-access guild exception ahead of the mask', () => {
    assert.equal(hasCastRankingPermissions(memberWith(PermissionFlagsBits.SendMessages), OPEN_ACCESS_GUILD), true);
  });

  it('open-access exception does not leak to other guilds', () => {
    assert.equal(hasCastRankingPermissions(memberWith(PermissionFlagsBits.SendMessages), NORMAL_GUILD), false);
  });
});

describe('Casting gate — mask parity with the /menu admin gate', () => {
  // hasAdminPermissions accepts ManageChannels|ManageGuild|ManageRoles|Administrator.
  // Casting deliberately omits ManageGuild; every OTHER admin permission must be honoured,
  // or a host reaches the Production Menu and then hits a wall inside Casting.
  const ADMIN_GATE = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels
  ];

  for (const bit of ADMIN_GATE) {
    it(`permission ${bit} opens the Production Menu AND Casting`, () => {
      assert.equal(hasCastRankingPermissions(memberWith(bit), NORMAL_GUILD), true);
    });
  }
});
