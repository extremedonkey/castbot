// Tests for the Safari map-create bot-permission pre-flight.
// Map creation makes a category + N private channels with @everyone overwrites,
// needing BOTH Manage Channels and Manage Roles. Without them every channels.create()
// throws DiscordAPIError 50013, so we fail fast with a clear message.
// Pure logic replicated inline per TestingStandards.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicated from mapExplorer.createMapGridWithCustomImage pre-flight ──
function mapPreflightMissing(me) {
  const missing = [];
  if (!me?.permissions?.has('ManageChannels')) missing.push('Manage Channels');
  if (!me?.permissions?.has('ManageRoles')) missing.push('Manage Roles');
  return missing;
}

// Minimal stand-in for guild.members.me.permissions (.has(flag))
const memberWithPerms = (flags) => ({ permissions: { has: (f) => flags.includes(f) } });

describe('Map create — bot permission pre-flight', () => {
  it('no missing perms when the bot has both Manage Channels and Manage Roles', () => {
    assert.deepEqual(mapPreflightMissing(memberWithPerms(['ManageChannels', 'ManageRoles'])), []);
  });

  it('reports Manage Roles when only Manage Channels is present', () => {
    assert.deepEqual(mapPreflightMissing(memberWithPerms(['ManageChannels'])), ['Manage Roles']);
  });

  it('reports Manage Channels when only Manage Roles is present', () => {
    assert.deepEqual(mapPreflightMissing(memberWithPerms(['ManageRoles'])), ['Manage Channels']);
  });

  it('reports both when the bot has neither (the 50013 case from the screenshot)', () => {
    assert.deepEqual(mapPreflightMissing(memberWithPerms([])), ['Manage Channels', 'Manage Roles']);
  });

  it('reports both when the bot member cannot be resolved (no me)', () => {
    assert.deepEqual(mapPreflightMissing(null), ['Manage Channels', 'Manage Roles']);
    assert.deepEqual(mapPreflightMissing(undefined), ['Manage Channels', 'Manage Roles']);
  });
});
