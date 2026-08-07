/**
 * 🚀 Deploy Prod button — TEST-box-only production deployment via the sanctioned pipeline.
 *
 * Design: RaP 0887 (docs/01-RaP → promoted to docs/02-implementation-wip/ProdDeployButton.md).
 * The LLM (Moai) never touches the trigger — Discord's signed interaction + a hard user-ID
 * whitelist in app.js is the auth layer, and the payload is the SAME deploy-remote-wsl.js
 * script laptop deploys use (all 8 safety steps, including remote backup and runtime-file
 * restoration). This module only: builds the confirm card, binds the approval to a commit
 * SHA with a 60s expiry, spawns the script, and streams its step banners to Discord via
 * the shared progress reporter (claudeRunner.js — same lifecycle as Ask CastBot / Moai).
 *
 * "One authorization = one action" is enforced structurally:
 *   - the confirm button's custom_id pins the origin/main SHA it was issued for; if main
 *     moves before the click, the deploy is refused and the card re-issued;
 *   - the confirm expires 60s after issue (phone-fat-finger window);
 *   - one deploy in flight at a time (in-memory flag + /tmp lockfile that box-restart.sh
 *     also honors, so a box restart can't kill a deploy mid-pull).
 *
 * @module prodDeploy
 */

import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { createProgressReporter, formatElapsed } from '../../claudeRunner.js';

const PROD_SSH_TARGET = 'bitnami@13.238.148.170';
const PROD_REPO_PATH = '/opt/bitnami/projects/castbot';
const PROD_HEALTH_URL = 'https://castbotaws.reecewagner.com/interactions';
const prodKeyPath = () => path.join(os.homedir(), '.ssh', 'castbot-prod');

/** How long a confirm card stays clickable. */
export const CONFIRM_TTL_MS = 60 * 1000;
/** The threshold the deploy script's own 🗿 gate uses — surfaced in the card instead. */
export const MOAI_GATE_COMMITS = 10;
/** Checked by scripts/dev/box-restart.sh — keep the two paths in sync. */
export const DEPLOY_LOCKFILE = '/tmp/castbot-prod-deploy.lock';
/** A lock older than this is a crash leftover, not a running deploy. */
export const LOCK_STALE_MS = 10 * 60 * 1000;
/** Hard ceiling for the deploy child — well inside the 15-min interaction token. */
const DEPLOY_HARD_KILL_MS = 8 * 60 * 1000;

const GREEN = 0x2ecc71;
const RED = 0xe74c3c;
const AMBER = 0xf39c12;

const backRow = () => ({ type: 1, components: [
  { type: 2, custom_id: 'reeces_stuff', label: '← Back', style: 2 }
] });

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/prodDeploy.test.js)
// ---------------------------------------------------------------------------

/** Bind an approval to the exact commit it previews. ts is base36 to fit the 100-char cap. */
export function encodeConfirmId(sha, nowMs) {
  return `deploy_prod_confirm_${sha}_${nowMs.toString(36)}`;
}

/**
 * Decode + validate a confirm custom_id.
 * @returns {{valid: boolean, reason?: 'malformed'|'expired', sha?: string, issuedAt?: number}}
 */
export function parseConfirmId(customId, nowMs, ttlMs = CONFIRM_TTL_MS) {
  const m = /^deploy_prod_confirm_([0-9a-f]{7,40})_([0-9a-z]+)$/.exec(String(customId || ''));
  if (!m) return { valid: false, reason: 'malformed' };
  const issuedAt = parseInt(m[2], 36);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return { valid: false, reason: 'malformed' };
  if (nowMs - issuedAt > ttlMs) return { valid: false, reason: 'expired', sha: m[1], issuedAt };
  return { valid: true, sha: m[1], issuedAt };
}

/**
 * Extract a step-progress label from one line of deploy-script output.
 * Banners look like "🔴 Step 3: Update Code" / "🟡 Step 3b: Restore Runtime Data Files".
 * @returns {{step: string, title: string}|null}
 */
export function parseDeployStep(line) {
  const m = /Step (\d+b?): (.+?)\s*$/.exec(String(line || ''));
  return m ? { step: m[1], title: m[2] } : null;
}

/** Cap the commit list for the card; oldest-first so it reads as a changelog. */
export function summarizeCommits(oneline, max = 12) {
  const lines = String(oneline || '').split('\n').map(l => l.trim()).filter(Boolean).reverse();
  const shown = lines.slice(0, max).map(l => `\`${l.slice(0, 10).split(' ')[0]}\` ${l.substring(l.indexOf(' ') + 1).substring(0, 80)}`);
  const extra = lines.length - shown.length;
  return shown.join('\n') + (extra > 0 ? `\n-# …and ${extra} more` : '');
}

/** Is a lockfile mtime "a deploy is running right now" vs a crash leftover? */
export function isLockFresh(mtimeMs, nowMs, staleMs = LOCK_STALE_MS) {
  return nowMs - mtimeMs < staleMs;
}

// ---------------------------------------------------------------------------
// Card builders (pure — exported for tests)
// ---------------------------------------------------------------------------

export function buildConfirmCard({ prodSha, mainSha, gap, commitSummary, shortstat, issuedAtMs }) {
  const gateWarning = gap > MOAI_GATE_COMMITS
    ? `\n⚠️ 🗿 **${gap} commits is a LOT for one deploy.** The script's Moai gate would normally stop here — this card is that gate. Be sure.`
    : '';
  return { type: 17, accent_color: RED, components: [
    { type: 10, content: `## 🚀 Deploy Production?\n\`${prodSha.substring(0, 10)}\` → \`${mainSha.substring(0, 10)}\` — **${gap} commit${gap === 1 ? '' : 's'}**\n-# ${shortstat || 'no diff stats available'}${gateWarning}` },
    { type: 14 },
    { type: 10, content: commitSummary || '-# (no commit summary available)' },
    { type: 14 },
    { type: 10, content: `-# Confirm expires in 60s and only fires if \`origin/main\` still matches. 🗿 Want a second opinion first? Ask the Moai what's in this deploy.` },
    { type: 1, components: [
      { type: 2, custom_id: encodeConfirmId(mainSha, issuedAtMs), label: `Confirm Deploy (${gap} commit${gap === 1 ? '' : 's'})`, style: 4, emoji: { name: '⚠️' } },
      { type: 2, custom_id: 'reeces_stuff', label: 'Cancel', style: 2 }
    ] }
  ] };
}

export function buildUpToDateCard(prodSha) {
  return { type: 17, accent_color: GREEN, components: [
    { type: 10, content: `## 🚀 Prod is up to date\nProd is already on \`${prodSha.substring(0, 10)}\` — nothing on \`origin/main\` to deploy.` },
    backRow()
  ] };
}

export function buildBlockedCard(reason) {
  return { type: 17, accent_color: AMBER, components: [
    { type: 10, content: `## 🚀 Deploy not started\n${reason}` },
    { type: 1, components: [
      { type: 2, custom_id: 'deploy_prod', label: 'Re-check', style: 1, emoji: { name: '🚀' } },
      { type: 2, custom_id: 'reeces_stuff', label: 'Cancel', style: 2 }
    ] }
  ] };
}

/** Replaces the confirm card the moment the deploy starts — consumes the approval. */
export function buildInitiatedCard({ userId, mainSha, gap }) {
  return { type: 17, accent_color: AMBER, components: [
    { type: 10, content: `## 🚀 Prod Deploy Initiated\n\`${mainSha.substring(0, 10)}\` (${gap} commit${gap === 1 ? '' : 's'}) — approved by <@${userId}>.\nProgress is streaming in the follow-up message below.` },
    backRow()
  ] };
}

export function buildProgressCard({ doneSteps, currentStep, elapsedMs, userId }) {
  const lines = doneSteps.map(s => `✅ Step ${s.step}: ${s.title}`);
  if (currentStep) lines.push(`▶️ Step ${currentStep.step}: ${currentStep.title}`);
  return { type: 17, accent_color: AMBER, components: [
    { type: 10, content: `## 🚀 Deploying to Production…` },
    { type: 10, content: lines.join('\n') || '🚀 Starting up' },
    { type: 14 },
    { type: 10, content: `-# ⏳ ${formatElapsed(elapsedMs)} · approved by <@${userId}>` }
  ] };
}

export function buildResultCard({ ok, mainSha, gap, elapsedMs, healthCode, outputTail, userId }) {
  const health = healthCode
    ? `🩺 Health check: HTTP ${healthCode} from \`/interactions\` — ${healthCode < 500 ? 'web layer responding' : 'NOT healthy'}`
    : '🩺 Health check: no HTTP response — check prod immediately';
  if (ok) {
    return { type: 17, accent_color: GREEN, components: [
      { type: 10, content: `## 🚀 Prod Deploy Complete\n\`${mainSha.substring(0, 10)}\` is live — ${gap} commit${gap === 1 ? '' : 's'} deployed in ${formatElapsed(elapsedMs)}.` },
      { type: 10, content: `${health}\n-# Approved by <@${userId}> · full record in #💎deploy · ProdWatchdog keeps watching` },
      backRow()
    ] };
  }
  return { type: 17, accent_color: RED, components: [
    { type: 10, content: `## 🚀 Prod Deploy FAILED\nAfter ${formatElapsed(elapsedMs)}. ${health}` },
    { type: 10, content: `\`\`\`\n${(outputTail || 'no output captured').slice(-1200)}\n\`\`\`` },
    { type: 10, content: `**Rollback:** the script took a backup before pulling — latest \`castbot-backup-*\` in \`/opt/bitnami/projects/\` on prod. Runbook: \`docs/03-features/ProdBoxMigration.md\`. If prod is down: Restart Prod button.` },
    backRow()
  ] };
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

function sshProd(command, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    execFile('ssh', [
      '-i', prodKeyPath(),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      PROD_SSH_TARGET, command
    ], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`prod ssh failed: ${(stderr || err.message).trim().substring(0, 200)}`));
      resolve(stdout);
    });
  });
}

function localGit(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: process.cwd(), timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`git ${args[0]} failed: ${(stderr || err.message).trim().substring(0, 200)}`));
      resolve(stdout);
    });
  });
}

/** HEAD the prod interactions endpoint; resolves the status code, 0 on no response. */
function checkProdHealth() {
  return new Promise((resolve) => {
    const req = https.request(PROD_HEALTH_URL, { method: 'HEAD', timeout: 10000 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Lock — one deploy at a time, visible across processes (box-restart.sh checks it)
// ---------------------------------------------------------------------------

let deployInFlight = false;

export function isDeployRunning() {
  if (deployInFlight) return true;
  try {
    const st = fs.statSync(DEPLOY_LOCKFILE);
    return isLockFresh(st.mtimeMs, Date.now());
  } catch { return false; }
}

function takeLock() {
  deployInFlight = true;
  try { fs.writeFileSync(DEPLOY_LOCKFILE, `${process.pid} ${new Date().toISOString()}\n`); } catch { /* lock is advisory */ }
}

function releaseLock() {
  deployInFlight = false;
  try { fs.unlinkSync(DEPLOY_LOCKFILE); } catch { /* already gone */ }
}

// ---------------------------------------------------------------------------
// The two handler entry points
// ---------------------------------------------------------------------------

/**
 * Click 1: gather the real prod→main gap and build the confirm card.
 * All reads: local fetch + rev-list, one read-only SSH for prod HEAD.
 */
export async function buildDeployConfirmScreen() {
  if (isDeployRunning()) {
    return { components: [buildBlockedCard('A prod deploy is already in flight — wait for its result card.')] };
  }
  try {
    await localGit(['fetch', 'origin', '--quiet']);
    const [prodSha, mainSha] = await Promise.all([
      sshProd(`cd ${PROD_REPO_PATH} && git rev-parse HEAD`).then(s => s.trim()),
      localGit(['rev-parse', 'origin/main']).then(s => s.trim())
    ]);
    const range = `${prodSha}..origin/main`;
    const gap = parseInt((await localGit(['rev-list', '--count', range])).trim(), 10) || 0;
    if (gap === 0) return { components: [buildUpToDateCard(prodSha)] };
    const [oneline, shortstat] = await Promise.all([
      localGit(['log', '--oneline', range]),
      localGit(['diff', '--shortstat', range]).then(s => s.trim())
    ]);
    return { components: [buildConfirmCard({
      prodSha, mainSha, gap,
      commitSummary: summarizeCommits(oneline),
      shortstat,
      issuedAtMs: Date.now()
    })] };
  } catch (error) {
    console.error('🚀 [PROD-DEPLOY] confirm screen failed:', error.message);
    return { components: [buildBlockedCard(`Could not read the deploy gap: ${error.message.substring(0, 300)}`)] };
  }
}

/**
 * Click 2: validate the pinned approval, then start the deploy in the background.
 * Returns the card that replaces the confirm screen IMMEDIATELY (consuming the
 * approval — the confirm buttons are gone before the deploy begins, so it cannot
 * be double-fired); progress + result arrive as a follow-up via the shared reporter.
 */
export async function startProdDeploy({ customId, token, channelId, userId }) {
  if (isDeployRunning()) {
    return { components: [buildBlockedCard('A prod deploy is already in flight — wait for its result card.')] };
  }
  const parsed = parseConfirmId(customId, Date.now());
  if (!parsed.valid) {
    return { components: [buildBlockedCard(parsed.reason === 'expired'
      ? 'That confirm expired (60s window). Re-check to get a fresh card.'
      : 'That confirm button was malformed — re-check to get a fresh card.')] };
  }
  // Take the lock BEFORE the async verification — two rapid confirm clicks would both
  // pass the isDeployRunning() check during the awaits below (no await between the
  // check above and here, so this check-and-take is atomic on the event loop).
  takeLock();
  let launched = false;
  try {
    // The approval is bound to a SHA — refuse if main moved since the card was issued.
    await localGit(['fetch', 'origin', '--quiet']);
    const mainNow = (await localGit(['rev-parse', 'origin/main'])).trim();
    if (mainNow !== parsed.sha) {
      return { components: [buildBlockedCard(`\`origin/main\` moved since you approved (\`${parsed.sha.substring(0, 10)}\` → \`${mainNow.substring(0, 10)}\`). What you approved is not what would ship — re-check.`)] };
    }
    const prodSha = (await sshProd(`cd ${PROD_REPO_PATH} && git rev-parse HEAD`)).trim();
    const gap = parseInt((await localGit(['rev-list', '--count', `${prodSha}..origin/main`])).trim(), 10) || 0;
    if (gap === 0) return { components: [buildUpToDateCard(prodSha)] };

    console.log(`🚀 [PROD-DEPLOY] approved by ${userId} — deploying ${parsed.sha.substring(0, 10)} (${gap} commits)`);
    // Fire and forget: the handler's return consumes the confirm card now; the deploy
    // reports through its own follow-up message. runDeployJob never throws and owns
    // the lock release from here.
    runDeployJob({ token, channelId, userId, mainSha: parsed.sha, gap });
    launched = true;
    return { components: [buildInitiatedCard({ userId, mainSha: parsed.sha, gap })] };
  } catch (error) {
    return { components: [buildBlockedCard(`Pre-deploy verification failed: ${error.message.substring(0, 300)}`)] };
  } finally {
    if (!launched) releaseLock();
  }
}

/** The background deploy: spawn the sanctioned script, stream its steps, report the result. */
async function runDeployJob({ token, channelId, userId, mainSha, gap }) {
  const startedAt = Date.now();
  const reporter = createProgressReporter({ token, channelId, userId });
  const doneSteps = [];
  let currentStep = null;

  const beat = () => reporter.beat({ components: [buildProgressCard({
    doneSteps, currentStep, elapsedMs: Date.now() - startedAt, userId
  })] });

  try {
    await reporter.start({ components: [buildProgressCard({ doneSteps, currentStep, elapsedMs: 0, userId })] });
    const elapsedTicker = setInterval(() => { beat(); }, 20000);

    const { code, output } = await new Promise((resolve) => {
      const child = spawn('node', ['deploy-remote-wsl.js', '--confirmed'], {
        cwd: process.cwd(),
        env: { ...process.env, LIGHTSAIL_SSH_KEY: prodKeyPath() },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      let buffer = '';
      const killTimer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref?.();
      }, DEPLOY_HARD_KILL_MS);
      const onData = (chunk) => {
        const text = chunk.toString();
        output += text;
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const step = parseDeployStep(line);
          if (step && step.title !== currentStep?.title) {
            if (currentStep) doneSteps.push(currentStep);
            currentStep = step;
            beat();
          }
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', (d) => { output += d.toString(); });
      child.on('close', (code) => { clearTimeout(killTimer); resolve({ code, output }); });
      child.on('error', (err) => { clearTimeout(killTimer); resolve({ code: -1, output: output + `\n[spawn error: ${err.message}]` }); });
    });

    clearInterval(elapsedTicker);
    if (currentStep) doneSteps.push(currentStep);
    const ok = code === 0;
    const healthCode = await checkProdHealth();
    const elapsedMs = Date.now() - startedAt;
    console.log(`🚀 [PROD-DEPLOY] ${ok ? 'SUCCESS' : `FAILED (exit ${code})`} in ${formatElapsed(elapsedMs)} — health HTTP ${healthCode}`);
    await reporter.deliver({ components: [buildResultCard({
      ok, mainSha, gap, elapsedMs, healthCode, outputTail: ok ? '' : output, userId
    })] });
  } catch (error) {
    console.error('🚀 [PROD-DEPLOY] job error:', error.message);
    await reporter.deliver({ components: [buildResultCard({
      ok: false, mainSha, gap, elapsedMs: Date.now() - startedAt, healthCode: 0,
      outputTail: `deploy job error: ${error.message}`, userId
    })] }).catch(() => {});
  } finally {
    releaseLock();
  }
}
