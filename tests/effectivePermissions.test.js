/**
 * Effective Permissions — the single permission reader + Global Access grant
 *
 * Covers the two 2026-08-09 findings and the new escalation path:
 *   • Administrator must satisfy any admin-ish check (the Casting lockout)
 *   • a Global Access role must count exactly as Manage Roles + Manage Channels
 *   • @everyone must NEVER grant it — one click would make a whole server admin
 *   • the check must stay synchronous (see the module header for why)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import {
  effectivePermissions,
  memberHasAnyPermission,
  hasGlobalRoleAccess,
  hydrateGlobalRoleAccess,
  setGuildRoleAccess,
  getGuildRoleAccess,
  sanitizeRoleAccessIds,
  GLOBAL_ACCESS_GRANT,
  __resetGlobalRoleAccessCache
} from '../utils/effectivePermissions.js';

const GUILD = '1400479796219215959';
const PROD_ROLE = '1530478047881330789';
const OTHER_ROLE = '999999999999999999';

/** Interaction payload member: permissions is a string, roles is an array of IDs. */
const payload = (bits, roles = []) => ({ permissions: bits.toString(), roles });

beforeEach(() => __resetGlobalRoleAccessCache());

describe('sanitizeRoleAccessIds — @everyone can never be whitelisted', () => {
  it('drops @everyone (its role ID equals the guild ID)', () => {
    assert.deepEqual(sanitizeRoleAccessIds([PROD_ROLE, GUILD], GUILD), [PROD_ROLE]);
  });

  it('drops it even when it is the only entry', () => {
    assert.deepEqual(sanitizeRoleAccessIds([GUILD], GUILD), []);
  });

  it('dedupes and drops falsy entries', () => {
    assert.deepEqual(sanitizeRoleAccessIds([PROD_ROLE, PROD_ROLE, null, '', undefined], GUILD), [PROD_ROLE]);
  });

  it('tolerates non-arrays', () => {
    assert.deepEqual(sanitizeRoleAccessIds(null, GUILD), []);
    assert.deepEqual(sanitizeRoleAccessIds('nope', GUILD), []);
  });
});

describe('Global Access — grant semantics', () => {
  it('is worth exactly Manage Roles + Manage Channels', () => {
    assert.equal(GLOBAL_ACCESS_GRANT, PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels);
  });

  it('does NOT include Administrator — a guild admin must not be able to mint god-mode', () => {
    assert.equal((GLOBAL_ACCESS_GRANT & PermissionFlagsBits.Administrator), 0n);
  });

  it('turns a permissionless member into a CastBot host', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    const member = payload(PermissionFlagsBits.SendMessages, [PROD_ROLE]);

    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageRoles), true);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageChannels), true);
  });

  it('does not grant permissions outside the two it confers', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    const member = payload(0n, [PROD_ROLE]);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageGuild), false);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.BanMembers), false);
  });

  it('ignores members who do not hold a whitelisted role', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    const member = payload(0n, [OTHER_ROLE]);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageRoles), false);
  });

  it('does not leak across guilds', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    const member = payload(0n, [PROD_ROLE]);
    assert.equal(memberHasAnyPermission(member, 'some-other-guild', PermissionFlagsBits.ManageRoles), false);
  });

  it('is skipped entirely when guildId is omitted', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    const member = payload(0n, [PROD_ROLE]);
    assert.equal(memberHasAnyPermission(member, undefined, PermissionFlagsBits.ManageRoles), false);
  });

  it('@everyone in the whitelist grants nothing', () => {
    setGuildRoleAccess(GUILD, [GUILD]);
    const member = payload(0n, [GUILD]);
    assert.equal(hasGlobalRoleAccess(member, GUILD), false);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageRoles), false);
  });

  it('revoking takes effect immediately, not at next boot', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    const member = payload(0n, [PROD_ROLE]);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageRoles), true);

    setGuildRoleAccess(GUILD, []);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageRoles), false);
  });
});

describe('Global Access — hydration from playerData', () => {
  it('loads every guild and reports counts', () => {
    const stats = hydrateGlobalRoleAccess({
      [GUILD]: { permissions: { globalRoleAccess: [PROD_ROLE, OTHER_ROLE] } },
      'g2': { permissions: { globalRoleAccess: ['r1'] } },
      'g3': { permissions: {} },
      'g4': {}
    });
    assert.deepEqual(stats, { guilds: 2, roles: 3 });
    assert.deepEqual(getGuildRoleAccess(GUILD), [PROD_ROLE, OTHER_ROLE]);
  });

  it('sanitises on hydration too — a stored @everyone never becomes live', () => {
    hydrateGlobalRoleAccess({ [GUILD]: { permissions: { globalRoleAccess: [GUILD] } } });
    assert.deepEqual(getGuildRoleAccess(GUILD), []);
  });

  it('replaces rather than merges, and survives junk input', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    hydrateGlobalRoleAccess({});
    assert.deepEqual(getGuildRoleAccess(GUILD), []);
    assert.doesNotThrow(() => hydrateGlobalRoleAccess(null));
  });
});

describe('memberHasAnyPermission — combined masks are ANY-OF, not all-of', () => {
  // Regression: 9 handlers declare `requiresPermission: ManageRoles | ManageChannels | ManageGuild`
  // meaning "any of these three". PermissionsBitField.has(A|B|C) is ALL-OF, so routing that through
  // .has() silently required all three and denied every host holding only Manage Roles.
  // Caught on TEST via season_manager, 2026-08-09.
  const TRIPLE = PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageGuild;

  it('a host with ONLY Manage Roles passes a three-permission mask', () => {
    assert.equal(memberHasAnyPermission(payload(PermissionFlagsBits.ManageRoles), GUILD, TRIPLE), true);
  });

  it('a host with ONLY Manage Channels passes it', () => {
    assert.equal(memberHasAnyPermission(payload(PermissionFlagsBits.ManageChannels), GUILD, TRIPLE), true);
  });

  it('a host with ONLY Manage Server passes it', () => {
    assert.equal(memberHasAnyPermission(payload(PermissionFlagsBits.ManageGuild), GUILD, TRIPLE), true);
  });

  it('a Global Access member passes it (grant covers 2 of the 3 bits)', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    assert.equal(memberHasAnyPermission(payload(0n, [PROD_ROLE]), GUILD, TRIPLE), true);
  });

  it('a plain player still fails it', () => {
    assert.equal(memberHasAnyPermission(payload(PermissionFlagsBits.SendMessages), GUILD, TRIPLE), false);
  });

  it('documents why .has() cannot be used here', () => {
    const onlyRoles = new PermissionsBitField(PermissionFlagsBits.ManageRoles);
    assert.equal(onlyRoles.has(TRIPLE), false, 'has() on a combined mask is all-of — the bug');
    assert.equal((onlyRoles.bitfield & TRIPLE) !== 0n, true, 'a raw & is any-of — the fix');
  });
});

describe('effectivePermissions — Discord semantics', () => {
  it('Administrator satisfies any permission (.has() override)', () => {
    const admin = payload(PermissionFlagsBits.Administrator);
    assert.equal(memberHasAnyPermission(admin, GUILD, PermissionFlagsBits.ManageRoles), true);
    assert.equal(memberHasAnyPermission(admin, GUILD, PermissionFlagsBits.BanMembers), true);
  });

  it('accepts a discord.js-style bitfield as well as a payload string', () => {
    const fetched = { permissions: new PermissionsBitField(PermissionFlagsBits.ManageRoles) };
    assert.equal(memberHasAnyPermission(fetched, GUILD, PermissionFlagsBits.ManageRoles), true);
  });

  it('any-of semantics: one match is enough', () => {
    const member = payload(PermissionFlagsBits.ManageChannels);
    assert.equal(
      memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels),
      true
    );
  });

  it('accepts an array of permissions (REQUIRED_PERMISSIONS style)', () => {
    const member = payload(PermissionFlagsBits.ManageGuild);
    assert.equal(
      memberHasAnyPermission(member, GUILD, [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild]),
      true
    );
  });

  it('returns a usable bitfield for junk input instead of throwing', () => {
    for (const bad of [null, undefined, {}, { permissions: 'not-a-number' }, { permissions: null }]) {
      assert.doesNotThrow(() => effectivePermissions(bad, GUILD));
      assert.equal(memberHasAnyPermission(bad, GUILD, PermissionFlagsBits.ManageRoles), false);
    }
  });

  it('denies a plain player', () => {
    const member = payload(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel);
    assert.equal(memberHasAnyPermission(member, GUILD, PermissionFlagsBits.ManageRoles), false);
  });
});

describe('effectivePermissions — the check must stay synchronous', () => {
  // A permission check that returns a Promise fails OPEN: `if (promise)` is always true, so a
  // single forgotten `await` at any of ~440 call sites would silently grant admin to everyone.
  // These assertions exist so nobody can quietly make the reader async.
  const isPromise = v => typeof v?.then === 'function';

  it('memberHasAnyPermission returns a boolean, never a Promise', () => {
    const result = memberHasAnyPermission(payload(PermissionFlagsBits.ManageRoles), GUILD, PermissionFlagsBits.ManageRoles);
    assert.equal(typeof result, 'boolean');
    assert.equal(isPromise(result), false);
  });

  it('hasGlobalRoleAccess returns a boolean, never a Promise', () => {
    setGuildRoleAccess(GUILD, [PROD_ROLE]);
    const result = hasGlobalRoleAccess(payload(0n, [PROD_ROLE]), GUILD);
    assert.equal(typeof result, 'boolean');
    assert.equal(isPromise(result), false);
  });

  it('effectivePermissions returns a bitfield, never a Promise', () => {
    assert.equal(isPromise(effectivePermissions(payload(0n), GUILD)), false);
  });
});
