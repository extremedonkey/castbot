#!/usr/bin/env node
/**
 * 🎟️ Entitlements ops CLI — inspect and mutate entitlements.json from a shell.
 *
 *   node scripts/entitlements-cli.js list
 *   node scripts/entitlements-cli.js show   <guildId>
 *   node scripts/entitlements-cli.js grant  <guildId> [duration] [--reason "..."]   (premium tier; duration e.g. 30d/12h/45min/3mo, omit = permanent)
 *   node scripts/entitlements-cli.js extend <guildId> <duration>
 *   node scripts/entitlements-cli.js expire <guildId>          (→ grace; test stub)
 *   node scripts/entitlements-cli.js lapse  <guildId>          (past grace; test stub)
 *   node scripts/entitlements-cli.js revoke-tier <guildId>
 *
 * ⚠️ WRITE COMMANDS + A RUNNING BOT DON'T MIX. The bot caches the registry forever
 * (single-writer assumption) — it will NOT see CLI writes until restarted, and its own
 * next save would clobber them. `list`/`show` are always safe. On prod/test prefer the
 * Discord Entitlements panel; use writes here only with the bot stopped (or restart after).
 */
import {
  FEATURES, TIERS, GRACE_MS, loadEntitlementsSync, getGuildEntitlement, resolveTierState,
  grantTier, extendTier, setTierValidUntil, revokeTier, parseDuration
} from '../entitlements.js';

const [cmd, guildId, ...rest] = process.argv.slice(2);

const fmtWhen = (ms) => ms == null ? 'permanent' : `${new Date(ms).toISOString()} (${Math.round((ms - Date.now()) / 3600000)}h from now)`;

function describeEntry(guildId, entry) {
  const ts = resolveTierState(entry);
  const tier = ts.state === 'none' ? 'no tier'
    : `${ts.tier} [${ts.state}${ts.permanent ? ', permanent' : ''}]` +
      (ts.permanent ? '' : ` validUntil=${fmtWhen(ts.validUntil)} graceUntil=${fmtWhen(ts.graceUntil)}`);
  return `${guildId}  ${entry.name}\n    features: ${entry.features.join(', ') || '(none)'}\n    tier: ${tier}`;
}

async function main() {
  switch (cmd) {
    case 'list': {
      const { guilds } = loadEntitlementsSync();
      const entries = Object.entries(guilds);
      console.log(`${entries.length} entitled guild(s) · features: ${Object.values(FEATURES).join(', ')} · tiers: ${Object.keys(TIERS).join(', ')} · grace ${GRACE_MS / 86400000}d`);
      for (const [id, entry] of entries) console.log(describeEntry(id, entry));
      return;
    }
    case 'show': {
      const e = getGuildEntitlement(guildId);
      if (!e.exists) return console.log(`No entry for ${guildId}`);
      console.log(JSON.stringify(e, null, 2));
      return;
    }
    case 'grant': {
      const reasonIdx = rest.indexOf('--reason');
      const reason = reasonIdx >= 0 ? rest[reasonIdx + 1] : undefined;
      const durStr = rest.filter((_, i) => i !== reasonIdx && i !== reasonIdx + 1)[0] || '';
      const dur = parseDuration(durStr);
      if (!dur.ok) throw new Error(dur.error);
      await grantTier(guildId, 'premium', { addedBy: 'cli', durationMs: dur.ms, reason });
      break;
    }
    case 'extend': {
      const dur = parseDuration(rest[0]);
      if (!dur.ok || dur.ms == null) throw new Error(dur.error || 'extend needs a duration (e.g. 30d)');
      await extendTier(guildId, dur.ms);
      break;
    }
    case 'expire': await setTierValidUntil(guildId, Date.now() - 1000); break;
    case 'lapse': await setTierValidUntil(guildId, Date.now() - GRACE_MS - 1000); break;
    case 'revoke-tier': await revokeTier(guildId); break;
    default:
      console.log('Usage: entitlements-cli.js <list|show|grant|extend|expire|lapse|revoke-tier> [guildId] [args] — see file header');
      process.exit(cmd ? 1 : 0);
  }
  console.log(describeEntry(guildId, loadEntitlementsSync().guilds[guildId] || { name: '(entry removed)', features: [] }));
  console.log('\n⚠️ If the bot is running it will not see this write until restarted (forever-cache).');
}

main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
