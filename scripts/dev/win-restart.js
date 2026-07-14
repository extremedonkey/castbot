#!/usr/bin/env node
/**
 * win-restart.js — Windows-native counterpart of dev-restart.sh
 *
 * Cross-platform Node port of the dev loop for the Windows working tree
 * (C:\Users\extre\castbot). Same pipeline as dev-restart.sh MINUS the
 * local-bot + ngrok stages: in Windows mode there is NO local dev bot —
 * the always-on TEST instance (castbot-blue / CastBot Test Discord app)
 * is your dev bot.
 *
 * Pipeline (identical ordering + notify contract to dev-restart.sh):
 *   git add -A → commit → pull --rebase → push → tests → deploy TEST → notify
 *
 * Usage: node scripts/dev/win-restart.js [-skip-tests] "commit message" ["Discord message"]
 *
 * See docs/02-implementation-wip/WindowsNativeDevWorkflow.md
 * The bash scripts (scripts/dev/*.sh) are untouched — this is a parallel
 * implementation; WSL remains the rollback path.
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Always operate from the repo root, never the caller's cwd ──
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(REPO_ROOT);

console.log('=== CastBot Win Restart (deploy target: TEST / castbot-blue) ===');

// ── Flag parsing (mirrors dev-restart.sh) ──
const args = process.argv.slice(2);
let runTests = true;
while (args.length && args[0].startsWith('-')) {
  const flag = args.shift();
  if (flag === '-skip-tests') {
    runTests = false;
  } else if (flag === '-dev-only') {
    console.error('❌ -dev-only makes no sense in Windows mode: there is no local dev bot here.');
    console.error('   The TEST instance (castbot-blue) IS your dev bot. Re-run without -dev-only.');
    process.exit(1);
  } else {
    console.log(`⚠️  Unknown flag: ${flag}`);
  }
}

const now = new Date();
const timestamp = now.toTimeString().slice(0, 8);
const commitMessage = args[0] || `Dev checkpoint - ${timestamp}`;
const customMessage = args[1] || '';

// ── Small helpers ──
function git(gitArgs, opts = {}) {
  return spawnSync('git', gitArgs, { encoding: 'utf8', ...opts });
}
function gitOut(gitArgs) {
  return (git(gitArgs).stdout || '').trim();
}

const currentBranch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']);

// ── Git operations (safety net) ──
console.log('🔄 Handling git operations...');
// ⚠️ MULTI-AGENT COLLISION: `git add -A` stages the ENTIRE working tree. If another
// Claude/agent session shares this tree, THEIR changes get bundled into THIS commit
// and pushed. If you suspect a concurrent session, stage only your own files first
// (`git add <file> ...`) and commit manually, then run this with no new changes.
// See RaP 0913 (RemoteDevTestBox).
git(['add', '-A'], { stdio: 'inherit' });

// Capture changed files BEFORE commit (--cached is empty after commit)
const gitFilesChanged = gitOut(['diff', '--cached', '--name-only']).split('\n').filter(Boolean).join(',');
const statLines = gitOut(['diff', '--cached', '--stat']).split('\n').filter(Boolean);
const gitStats = (statLines[statLines.length - 1] || '').trim();

const hasStagedChanges = git(['diff', '--staged', '--quiet']).status !== 0;
if (hasStagedChanges) {
  console.log(`📝 Committing: ${commitMessage}`);
  const commit = git(['commit', '-m', commitMessage], { stdio: 'inherit' });
  if (commit.status !== 0) {
    console.error('❌ Commit failed (pre-commit hook rejection?) — nothing pushed or deployed.');
    process.exit(1);
  }

  console.log(`🚀 Pushing to GitHub (${currentBranch})...`);
  // MULTI-WORKING-TREE SAFETY (RaP 0913): the test-box tree (and the WSL tree) also
  // push to main. Reconcile with any remote commits via rebase BEFORE pushing, so a
  // diverged remote can't silently reject our push and leave deploy targets STALE.
  git(['fetch', '--quiet', 'origin', currentBranch]);
  const rebase = git(['pull', '--rebase', 'origin', currentBranch], { stdio: 'inherit' });
  if (rebase.status !== 0) {
    console.error(`❌ Rebase onto origin/${currentBranch} hit conflicts — resolve them, then re-run.`);
    console.error('ℹ️  Your changes are committed locally; nothing was pushed or deployed.');
    process.exit(1);
  }
  const push = git(['push', 'origin', currentBranch], { stdio: 'inherit' });
  if (push.status !== 0) {
    console.error('❌ Push FAILED — deploy targets would receive STALE code. Aborting.');
    console.error("💡 Fix auth / 'git push' manually, then re-run win-restart.");
    process.exit(1);
  }
  console.log('✅ Changes pushed to GitHub successfully');
} else {
  console.log('📝 No changes to commit');
}

// ── Unit tests (gate the TEST deploy, exactly like dev-restart.sh) ──
let testSummary = '';
if (runTests) {
  console.log('\n🧪 Running unit tests...');
  // PowerShell/cmd don't glob tests/*.test.js — enumerate explicitly.
  const testFiles = fs.readdirSync(path.join(REPO_ROOT, 'tests'))
    .filter(f => f.endsWith('.test.js'))
    .map(f => path.join('tests', f));

  const result = spawnSync(process.execPath, ['--test', ...testFiles], { encoding: 'utf8' });
  const testOutput = `${result.stdout || ''}${result.stderr || ''}`;

  // Extract counts + duration from the TAP summary footer
  const tap = (key) => {
    const m = testOutput.match(new RegExp(`^# ${key} (\\S+)`, 'm'));
    return m ? m[1] : '0';
  };
  const pass = tap('pass');
  const fail = tap('fail');
  const suites = tap('suites');
  const total = tap('tests');
  const duration = `${(parseFloat(tap('duration_ms')) / 1000 || 0).toFixed(2)}s`;
  testSummary = `${pass} pass, ${fail} fail (${suites} suites)`;

  if (result.status === 0) {
    console.log(`✅ Tests passed: ${pass}/${total} (${suites} suites in ${duration})\n`);
  } else {
    console.error(`❌ Tests FAILED: ${pass}/${total} (${fail} failed, ${suites} suites in ${duration})\n`);
    console.error('Failing tests:');
    // Print each `not ok` block + its YAML diagnostic (--- ... ...) — port of the awk block
    let inBlock = false, inYaml = false;
    for (const line of testOutput.split('\n')) {
      if (/^\s*not ok \d+/.test(line)) { console.error(line); inBlock = true; inYaml = false; continue; }
      if (inBlock && /^\s*---\s*$/.test(line)) { console.error(line); inYaml = true; continue; }
      if (inYaml) {
        console.error(line);
        if (/^\s*\.\.\.\s*$/.test(line)) { inYaml = false; inBlock = false; console.error(''); }
      }
    }
    console.error('(Run `node --test tests/` for the full TAP output)\n');
    process.exit(1);
  }
}

// ── Deploy to TEST instance (castbot-blue) ──
// Same remote block as dev-restart.sh — kept verbatim so behavior is identical.
// Built with join('\n') so the payload is LF-only regardless of how this file
// was checked out (also enforced by .gitattributes).
console.log('🟦 Deploying to TEST (castbot-blue)...');
const remoteScript = [
  'set -e',
  'cd /home/ubuntu/castbot',
  '# Guard: if Claude edited files ON the box and forgot to commit (should have used',
  '# box-restart.sh), auto-stash so this pull never clobbers that work. Recover via',
  '# `git stash list` on the box.',
  'if [ -n "$(git status --porcelain --untracked-files=no)" ]; then',
  '    echo "  ⚠️  uncommitted tracked changes on box — auto-stashing before pull (git stash list to recover)"',
  '    git stash push -m "win-restart auto-stash" >/dev/null',
  'fi',
  'BEFORE=$(git rev-parse HEAD)',
  'git pull --quiet origin main',
  'AFTER=$(git rev-parse HEAD)',
  'if [ "$BEFORE" != "$AFTER" ]; then',
  '    if ! git diff --quiet "$BEFORE" "$AFTER" -- package-lock.json package.json; then',
  '        echo "  📦 deps changed → npm install"; npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1',
  '    fi',
  '    if ! git diff --quiet "$BEFORE" "$AFTER" -- commands.js; then',
  '        echo "  ⌨️  commands changed → deploy-commands"; npm run deploy-commands >/dev/null 2>&1',
  '    fi',
  'fi',
  'pm2 restart castbot-pm >/dev/null'
].join('\n');

let testDeployStatus;
const deploy = spawnSync('ssh', ['-o', 'ConnectTimeout=15', 'castbot-blue', remoteScript], { stdio: 'inherit' });
if (deploy.status === 0) {
  console.log('✅ TEST deployed (castbot-blue)');
  testDeployStatus = 'deployed';
} else {
  console.log('⚠️  TEST deploy failed — push already succeeded. Retry with: npm run deploy-test');
  testDeployStatus = 'failed';
}

// ── Discord notification (best-effort, detached) ──
if (fs.existsSync(path.join(REPO_ROOT, '.env'))) {
  console.log('🔔 Sending restart notification to Discord...');
  if (customMessage) console.log(`📝 Including custom message: ${customMessage}`);
  const notify = spawn(process.execPath,
    ['scripts/notify-restart.js', customMessage, commitMessage, gitFilesChanged, gitStats, testSummary, testDeployStatus],
    { detached: true, stdio: 'ignore', cwd: REPO_ROOT });
  notify.unref();
  console.log('📤 Notification sent in background');
} else {
  console.log('🔕 No .env in this tree — skipping Discord notification');
}

console.log('');
console.log('=== Done ===');
console.log('🟦 Your changes are live on TEST: test in Discord via the CastBot Test app');
console.log('📜 Logs:   npm run logs-test');
console.log('📊 Status: node scripts/dev/win-status.js');
