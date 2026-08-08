/**
 * ButtonHandlerFactory `security:` tier enforcement.
 *
 * Until 2026-08-08 this field was inert decoration — 19 call sites declared it and the
 * factory never read it, so it read as a control while being a comment (incident 04
 * Recommendation 3, proposed but never built). These tests pin the enforcement AND the
 * additive contract: an absent tier must keep behaving exactly as before, because
 * default-deny across ~100 legacy handlers would be an outage, not a hardening.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { evaluateSecurityTier, SECURITY_TIERS } from '../buttonHandlerFactory.js';

const OWNER = '391415444084490240';
const member = (perms) => ({ permissions: String(perms) });
const admin = member(PermissionFlagsBits.ManageRoles);
const player = member(PermissionFlagsBits.SendMessages);

describe('SecurityTier — absent tier is a no-op', () => {
  it('undefined and null both pass, leaving legacy handlers untouched', () => {
    assert.equal(evaluateSecurityTier(undefined, { member: player, userId: '1' }).allowed, true);
    assert.equal(evaluateSecurityTier(null, { member: player, userId: '1' }).allowed, true);
  });
});

describe('SecurityTier — public', () => {
  it('lets anyone through, with no member object required', () => {
    assert.equal(evaluateSecurityTier('public', { member: player, userId: '1' }).allowed, true);
    assert.equal(evaluateSecurityTier('public', { member: undefined, userId: undefined }).allowed, true);
  });
});

describe('SecurityTier — admin', () => {
  it('admits Manage Roles and refuses a plain player', () => {
    assert.equal(evaluateSecurityTier('admin', { member: admin, userId: '1' }).allowed, true);
    const denied = evaluateSecurityTier('admin', { member: player, userId: '1' });
    assert.equal(denied.allowed, false);
    assert.equal(denied.permissionName, 'Manage Roles');
  });

  it('refuses when there is no member at all (DM / forged interaction)', () => {
    assert.equal(evaluateSecurityTier('admin', { member: undefined, userId: '1' }).allowed, false);
  });
});

describe('SecurityTier — owner', () => {
  it('admits only the bot owner, regardless of guild permissions', () => {
    assert.equal(evaluateSecurityTier('owner', { member: player, userId: OWNER }).allowed, true);
    const denied = evaluateSecurityTier('owner', { member: admin, userId: '999' });
    assert.equal(denied.allowed, false);
    assert.equal(denied.permissionName, 'Bot Owner');
  });
});

describe('SecurityTier — unknown tiers fail closed', () => {
  it('a typo is denied, never silently treated as public', () => {
    const verdict = evaluateSecurityTier('banana', { member: admin, userId: OWNER });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.reason, 'unknown_tier');
  });

  it('only the three documented tiers exist', () => {
    assert.deepEqual(Object.keys(SECURITY_TIERS).sort(), ['admin', 'owner', 'public']);
  });
});
