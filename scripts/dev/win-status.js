#!/usr/bin/env node
/**
 * win-status.js — Windows-native counterpart of dev-status.sh
 *
 * Read-only status for the Windows working tree: local git state vs
 * origin/main, then one SSH call to castbot-blue for box HEAD, tree
 * dirtiness, and pm2 state. No ngrok/local-bot checks — Windows mode
 * has no local bot (the TEST instance is your dev bot).
 *
 * Usage: node scripts/dev/win-status.js
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(REPO_ROOT);

function gitOut(gitArgs) {
  const r = spawnSync('git', gitArgs, { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

console.log('=== CastBot Win Status ===\n');

// ── Local tree ──
console.log('📂 Local tree:');
console.log(gitOut(['status', '-sb']) || '(clean)');

spawnSync('git', ['fetch', '--quiet', 'origin', 'main'], { encoding: 'utf8' });
const counts = gitOut(['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
const [ahead = '?', behind = '?'] = counts.split(/\s+/);
console.log(`\n🔀 vs origin/main: ${ahead} ahead, ${behind} behind`);
console.log(`   local HEAD:  ${gitOut(['log', '-1', '--oneline'])}`);
console.log(`   origin/main: ${gitOut(['log', '-1', '--oneline', 'origin/main'])}`);

// ── Test box ──
console.log('\n🟦 TEST box (castbot-blue):');
const remoteScript = [
  'cd /home/ubuntu/castbot',
  'echo "   box HEAD:    $(git log -1 --oneline)"',
  'DIRTY=$(git status --porcelain --untracked-files=no)',
  'if [ -n "$DIRTY" ]; then echo "   ⚠️  box tree DIRTY:"; echo "$DIRTY" | sed "s/^/      /"; else echo "   ✅ box tree clean"; fi',
  'pm2 status castbot-pm'
].join('\n');

const box = spawnSync('ssh', ['-o', 'ConnectTimeout=15', 'castbot-blue', remoteScript], { stdio: 'inherit' });
if (box.status !== 0) {
  console.log('   ❌ Could not reach castbot-blue (check ssh config / network)');
}
