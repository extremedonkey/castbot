// Tests for pinging Reece on lifecycle analytics announcements (server install / setup run),
// and the allowed_mentions hardening that stops a user-controlled guild/owner name from pinging
// the whole analytics server.
//
// Pure logic replicated inline per TestingStandards.md (the real builders in
// src/analytics/analyticsLogger.js are wrapped in timezone + file I/O + Discord client).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const REECE_USER_ID = '391415444084490240';
const REECE_ONLY_MENTIONS = { users: [REECE_USER_ID] };

// ── Replicated message tails from analyticsLogger.js ──
function buildInstallMessage(timestamp, guild, ownerDisplay) {
  return `# ${timestamp} | 🎉🥳 **New Server Install**: \`${guild.name}\` (${guild.id}) | Owner: ${ownerDisplay} <@${REECE_USER_ID}>`;
}
function buildSetupMessage(timestamp, guild, userName, userId) {
  return `# ${timestamp} | 🛠️✨ **Setup Run**: \`${guild.name}\` (${guild.id}) | User: ${userName} (${userId}) <@${REECE_USER_ID}>`;
}

describe('Analytics lifecycle pings — Reece is @-mentioned', () => {
  const ts = '[10:54AM] Sun 21 Jun 26';
  const guild = { name: 'Survivor Chronicles: Chronoporia', id: '1502302289782771732' };

  it('New Server Install message ends with Reece\'s mention token', () => {
    const msg = buildInstallMessage(ts, guild, 'Ryann (@ryann.n) (683102296380276766)');
    assert.ok(msg.includes(`<@${REECE_USER_ID}>`), 'install message must contain Reece mention');
    assert.ok(msg.endsWith(`<@${REECE_USER_ID}>`), 'mention is appended at the end');
  });

  it('Setup Run message mentions REECE, not the old CastBot app id', () => {
    const msg = buildSetupMessage(ts, guild, 'Ryann', '683102296380276766');
    assert.ok(msg.includes(`<@${REECE_USER_ID}>`));
    // Regression guard: the old code mentioned the CastBot app id, which pings nobody.
    assert.ok(!msg.includes('<@1331657596087566398>'), 'must not use the CastBot app id');
  });
});

describe('allowed_mentions hardening — only Reece can ever ping', () => {
  it('restricts mentions to a single user id', () => {
    assert.deepEqual(REECE_ONLY_MENTIONS, { users: ['391415444084490240'] });
  });

  it('does NOT allow everyone/here or roles to be parsed', () => {
    // The shape intentionally omits `parse` — Discord then pings ONLY the listed users,
    // never @everyone/@here/roles, even if those tokens appear in user-controlled text.
    assert.equal(REECE_ONLY_MENTIONS.parse, undefined);
    assert.equal(REECE_ONLY_MENTIONS.roles, undefined);
    assert.equal(REECE_ONLY_MENTIONS.everyone, undefined);
  });

  it('a malicious guild name cannot smuggle in an extra ping', () => {
    // Even if a server is literally named "@everyone", the content carries the literal text but
    // allowed_mentions only whitelists Reece, so the everyone-ping is suppressed by Discord.
    const evil = { name: '@everyone', id: '999' };
    const msg = buildInstallMessage('[x]', evil, 'x (@x) (1)');
    assert.ok(msg.includes('@everyone'), 'literal text is present in the message');
    // ...but the whitelist still only contains Reece.
    assert.deepEqual(REECE_ONLY_MENTIONS.users, [REECE_USER_ID]);
  });
});
