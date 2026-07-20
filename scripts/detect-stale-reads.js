#!/usr/bin/env node
/**
 * detect-stale-reads.js — scans CastBot logs for the incident-07 signature.
 *
 * Signature: a "Loaded playerData.json (X bytes)" whose size differs from the most
 * recent "Saved playerData (Y bytes)" in the same log. CastBot is a single process,
 * so between one save and the next, every disk read must return exactly the saved
 * bytes — any mismatch means the read raced a save (stale snapshot in flight).
 * That stale snapshot is what poisoned the request cache and erased a committed
 * map move (docs/incidents/07-CachePoisonedLostMove.md).
 *
 * Also counts the post-fix guard lines so you can correlate:
 *   "⚠️ Stale ... read discarded from cache"  → generation guard caught a racing read
 *   "🔒 Storage lock: dropped"/"🔒 Safari lock: dropped" → lock-entry cache drop fired
 * After the fix, every stale-read WINDOW flagged here should be harmless (guards fired,
 * nothing cached); before the fix, each one was a potential silent lost write.
 *
 * Usage:
 *   node scripts/detect-stale-reads.js <logfile> [more logfiles...]
 *   ssh <prod> 'cat ~/.pm2/logs/castbot-pm-out.log' | node scripts/detect-stale-reads.js -
 *
 * safariContent.json note: loads there don't log a byte size, so only its guard
 * counters appear — the size-mismatch check is playerData-only.
 */
import fs from 'fs';
import readline from 'readline';

const SAVED_RE = /Saved playerData \((\d+) bytes\)/;
const LOADED_RE = /Loaded playerData\.json \((\d+) bytes/;
const GUARD_DISCARD_RE = /Stale (playerData|safariContent) read discarded from cache/;
const GUARD_DROP_RE = /(Storage|Safari) lock: dropped (\d+) cached entr/;

async function scanStream(stream, label) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  let lastSaved = null; // { size, line }
  const findings = [];
  const guardCounts = { discarded: 0, lockDrops: 0 };

  for await (const line of rl) {
    lineNo++;
    let m;
    if ((m = line.match(SAVED_RE))) {
      lastSaved = { size: Number(m[1]), line: lineNo };
    } else if ((m = line.match(LOADED_RE))) {
      const size = Number(m[1]);
      if (lastSaved && size !== lastSaved.size) {
        findings.push({ line: lineNo, loaded: size, expected: lastSaved.size, savedLine: lastSaved.line });
      }
    } else if (GUARD_DISCARD_RE.test(line)) {
      guardCounts.discarded++;
    } else if (GUARD_DROP_RE.test(line)) {
      guardCounts.lockDrops++;
    }
  }

  console.log(`\n=== ${label} (${lineNo} lines) ===`);
  if (findings.length === 0) {
    console.log('✅ No stale-read windows detected (every load matched the last save).');
  } else {
    console.log(`🚨 ${findings.length} stale-read window(s) — a read returned bytes that differ from the last save:`);
    for (const f of findings) {
      const delta = f.loaded - f.expected;
      console.log(
        `  line ${f.line}: Loaded ${f.loaded} bytes but last save (line ${f.savedLine}) wrote ${f.expected}` +
        ` (${delta > 0 ? '+' : ''}${delta} — ${delta < 0 ? 'read raced the save: PRE-save snapshot' : 'unexpected larger read'})`
      );
    }
    console.log('  Pre-fix: each of these could silently erase a concurrent write (incident 07).');
    console.log('  Post-fix: cross-check that guard lines fired near each finding — then it was harmless.');
  }
  console.log(`Guard activity: ${guardCounts.discarded} stale read(s) discarded by generation guard, ` +
    `${guardCounts.lockDrops} lock-entry cache drop(s).`);
  return findings.length;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/detect-stale-reads.js <logfile...>   (or "-" for stdin)');
  process.exit(2);
}

let total = 0;
for (const arg of args) {
  if (arg === '-') {
    total += await scanStream(process.stdin, 'stdin');
  } else {
    total += await scanStream(fs.createReadStream(arg, { encoding: 'utf8' }), arg);
  }
}
process.exit(total > 0 ? 1 : 0);
