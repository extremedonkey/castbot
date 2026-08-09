/**
 * Permission source ratchet — keeps the funnel closed
 *
 * Every permission decision must go through utils/effectivePermissions.js. Two ways to break that,
 * both of which have already happened once:
 *
 *   A. raw `BigInt(member.permissions) & X`  — skips the Administrator override (locked
 *      Administrator-only hosts out of all 18 Casting screens, 2026-08-09) AND skips the Global
 *      Access grant, so a whitelisted host works in some screens and not others.
 *   B. reading permissions off a `guild.members.fetch()` result — that's discord.js recomputing
 *      locally: no Administrator expansion, no channel overwrites, cache-dependent.
 *
 * Both ratchets sit at ZERO. If one fails, don't add to a baseline — route the check through
 * `memberHasAnyPermission(member, guildId, ...perms)`.
 *
 * Genuinely-exempt files are listed below with the reason. Add to that list only when there is no
 * interaction payload available at all (background jobs, gateway events).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Files scanned. Kept explicit so a new module can't silently opt out by living elsewhere. */
const SCANNED = [
  'app.js',
  'buttonHandlerFactory.js',
  'askCastBot.js',
  'askCastBotWrite.js',
  'castlistHandlers.js',
  'challengeActionCreate.js',
  'entityManagementUI.js',
  'mapMovement.js',
  'playerManagement.js',
  'safariManager.js',
  'castRankingManager.js',
  'utils/permissionUtils.js',
  'src/kofi/premiumRedeem.js'
];

/**
 * Lines that legitimately read permissions off a fetched member, because no interaction payload
 * exists at that point. Keyed by "file:substring-of-the-line".
 */
const EXEMPT = [
  // CastBot checking ITS OWN permissions. The bot is not the clicker, so there is no payload
  // member for it — `app_permissions` in the payload is channel-scoped and doesn't cover
  // guild-level checks like BanMembers. Fetching the bot member is the correct approach.
  { file: 'app.js', contains: 'guild.members.fetch(client.user.id)' },
  // Gateway reaction event — a reaction is not an interaction, so there is no payload member.
  { file: 'app.js', contains: 'member.permissions.has(PermissionFlagsBits.ManageRoles) || member.permissions.has(PermissionFlagsBits.Administrator)' },
  // Enumerates guild admins to DM them — there is no clicker at all.
  { file: 'discordMessenger.js', contains: 'admins' }
];

function readSource(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split(/\r?\n/) : null;
}

function isExempt(file, line) {
  return EXEMPT.some(e => e.file === file && line.includes(e.contains));
}

/** Strip comment lines and JSDoc so documentation about the anti-pattern isn't flagged as it. */
function isCode(line) {
  const t = line.trim();
  return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}

describe('Permission sources — raw bitwise checks (class A)', () => {
  it('no permission decision uses a raw & on member.permissions', () => {
    const offenders = [];
    for (const rel of SCANNED) {
      const lines = readSource(rel);
      if (!lines) continue;
      lines.forEach((line, i) => {
        if (!isCode(line) || isExempt(rel, line)) return;
        // BigInt(<anything>member.permissions<anything>) followed by a & on the same line
        if (/BigInt\([^)]*member[^)]*\.permissions[^)]*\)/.test(line) && line.includes('&')) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }
    assert.deepEqual(offenders, [],
      `\nRaw bitwise permission check(s) — these skip the Administrator override AND the Global Access grant:\n  ${offenders.join('\n  ')}\n\nUse: memberHasAnyPermission(member, guildId, PermissionFlagsBits.X)\n`);
  });
});

describe('Permission sources — fetched-member reads (class B)', () => {
  it('no permission check reads a guild.members.fetch() result', () => {
    const offenders = [];
    for (const rel of SCANNED) {
      const lines = readSource(rel);
      if (!lines) continue;
      lines.forEach((line, i) => {
        if (!isCode(line)) return;
        const bind = line.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+[^;]*members\.fetch\(/);
        if (!bind) return;
        const name = bind[1];
        // Does the fetched member's permissions get read within the next few lines?
        const window = lines.slice(i + 1, i + 8).filter(isCode).join('\n');
        const readsPerms = new RegExp(`\\b${name}\\.permissions\\b`).test(window);
        const feedsGate = new RegExp(`(hasAdminPermissions|hasCastRankingPermissions|memberHasAnyPermission|hasPermission)\\(\\s*${name}\\b`).test(window);
        if ((readsPerms || feedsGate) && !isExempt(rel, line)) {
          offenders.push(`${rel}:${i + 1}  (${name})`);
        }
      });
    }
    assert.deepEqual(offenders, [],
      `\nPermission read off a fetched GuildMember — that's discord.js recomputing locally (no Administrator expansion, no channel overwrites, cache-dependent):\n  ${offenders.join('\n  ')}\n\nUse context.member / req.body.member instead.\n`);
  });
});

describe('Permission sources — the gate helpers stay funnelled', () => {
  const helpers = [
    ['utils/permissionUtils.js', 'memberHasAnyPermission'],
    ['buttonHandlerFactory.js', 'memberHasAnyPermission'],
    ['app.js', 'memberHasAnyPermission']
  ];

  for (const [file, needle] of helpers) {
    it(`${file} imports the single reader`, () => {
      const src = readSource(file)?.join('\n') || '';
      assert.ok(src.includes(needle), `${file} should route permission checks through ${needle}`);
      assert.ok(/effectivePermissions\.js/.test(src), `${file} should import utils/effectivePermissions.js`);
    });
  }

  it('the dead permissionUtils primitives stay deleted', () => {
    const src = readSource('utils/permissionUtils.js').join('\n');
    assert.ok(!/export function requireAdminPermission/.test(src),
      'requireAdminPermission had zero call sites — do not reintroduce a fifth unused primitive');
    assert.ok(!/export function requireSpecificUser/.test(src),
      'requireSpecificUser had zero call sites — use the factory security: "owner" tier');
  });
});
