// Tests for the Ultrathink Health Monitor environment labeling.
// Pure logic replicated inline per TestingStandards.md (healthMonitor.js imports
// botEmojis/restartTracker which log at module load — unsafe to import here).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicated from src/monitoring/healthMonitor.getEnvName (single source of truth) ──
// Three-way env detection matching scripts/notify-restart.js: the always-on test box
// (castbot-blue) runs INSTANCE_ROLE=test with PRODUCTION=FALSE, so a two-way
// PRODUCTION check mislabels it "Dev" (the bug this guards against).
function getEnvName(env = {}) {
  return env.INSTANCE_ROLE === 'test' ? 'Test' : env.PRODUCTION === 'TRUE' ? 'Prod' : 'Dev';
}

describe('Health Monitor — environment label (getEnvName)', () => {
  it('test box (INSTANCE_ROLE=test, PRODUCTION=FALSE) labels Test — the reported bug', () => {
    assert.equal(getEnvName({ INSTANCE_ROLE: 'test', PRODUCTION: 'FALSE' }), 'Test');
  });

  it('INSTANCE_ROLE=test wins even if PRODUCTION=TRUE (blue/green flip safety)', () => {
    assert.equal(getEnvName({ INSTANCE_ROLE: 'test', PRODUCTION: 'TRUE' }), 'Test');
  });

  it('production labels Prod', () => {
    assert.equal(getEnvName({ PRODUCTION: 'TRUE' }), 'Prod');
  });

  it('dev laptop (no flags / PRODUCTION=FALSE) labels Dev', () => {
    assert.equal(getEnvName({}), 'Dev');
    assert.equal(getEnvName({ PRODUCTION: 'FALSE' }), 'Dev');
  });

  it('webhook author renders as CastBot Health Monitor - <Env>', () => {
    const name = (env) => `CastBot Health Monitor - ${getEnvName(env)}`;
    assert.equal(name({ INSTANCE_ROLE: 'test' }), 'CastBot Health Monitor - Test');
    assert.equal(name({ PRODUCTION: 'TRUE' }), 'CastBot Health Monitor - Prod');
    assert.equal(name({}), 'CastBot Health Monitor - Dev');
  });
});

// ── Replicated from src/monitoring/healthMonitor.calculateHealthScores (keep in sync) ──
// Self-calibrating scoring introduced post-migration (2026-07-28): heap % of its own V8
// limit, swap/system caps, loop-lag caps, crash-restarts-in-24h stability (typed).
function calculateHealthScores(metrics) {
  const scores = { memory: 100, performance: 100, stability: 100, overall: 100 };

  const heapPct = metrics.bot.heapPercent ?? 0;
  if (heapPct < 50) scores.memory = 100;
  else if (heapPct < 70) scores.memory = 75;
  else if (heapPct < 85) scores.memory = 40;
  else scores.memory = 0;
  if ((metrics.system.memoryPercent || 0) > 90) scores.memory = Math.min(scores.memory, 50);
  const swapUsed = metrics.system.swapUsed;
  if (Number.isFinite(swapUsed)) {
    if (swapUsed > 300) scores.memory = 0;
    else if (swapUsed > 100) scores.memory = Math.min(scores.memory, 40);
  }

  const cpu = metrics.bot.cpu || 0;
  if (cpu < 5) scores.performance = 100;
  else if (cpu < 20) scores.performance = 75;
  else if (cpu < 50) scores.performance = 50;
  else scores.performance = 0;
  const loopP99 = metrics.bot.loopP99;
  if (Number.isFinite(loopP99)) {
    if (loopP99 > 1000) scores.performance = 0;
    else if (loopP99 > 250) scores.performance = Math.min(scores.performance, 50);
    else if (loopP99 > 100) scores.performance = Math.min(scores.performance, 75);
  }

  const unplanned = metrics.bot.crashes24h ?? 0;
  if (unplanned === 0) scores.stability = 100;
  else if (unplanned === 1) scores.stability = 75;
  else if (unplanned === 2) scores.stability = 50;
  else if (unplanned === 3) scores.stability = 25;
  else scores.stability = 0;
  if (metrics.bot.status !== 'online') scores.stability = 0;

  scores.overall = Math.round(scores.memory * 0.4 + scores.performance * 0.3 + scores.stability * 0.3);
  return scores;
}

const m = (bot = {}, system = {}) => ({
  bot: { status: 'online', cpu: 1, heapPercent: 10, crashes24h: 0, ...bot },
  system: { memoryPercent: 40, ...system }
});

describe('Health Monitor — self-calibrating scores (post-migration)', () => {
  it('the incident that prompted this: 401MB RSS on a 2GB box with 11% heap scores 100, not 0', () => {
    // Old code: RSS > 250MB → memory 0/100 + false CRITICAL. RSS no longer factors in.
    const s = calculateHealthScores(m({ heapPercent: 11 }, { memoryPercent: 37, swapUsed: 0 }));
    assert.equal(s.memory, 100);
    assert.equal(s.overall, 100);
  });

  it('heap tiers score against the V8 limit: 50/70/85% boundaries', () => {
    assert.equal(calculateHealthScores(m({ heapPercent: 49 })).memory, 100);
    assert.equal(calculateHealthScores(m({ heapPercent: 69 })).memory, 75);
    assert.equal(calculateHealthScores(m({ heapPercent: 84 })).memory, 40);
    assert.equal(calculateHealthScores(m({ heapPercent: 85 })).memory, 0);
  });

  it('swap caps the memory score even with a healthy heap (incident-08 tripwire)', () => {
    assert.equal(calculateHealthScores(m({}, { swapUsed: 150 })).memory, 40, '>100MB swap caps at 40');
    assert.equal(calculateHealthScores(m({}, { swapUsed: 301 })).memory, 0, '>300MB swap zeroes');
    assert.equal(calculateHealthScores(m({}, { swapUsed: 0 })).memory, 100, 'zero swap is clean');
  });

  it('missing swap data (non-Linux dev) does not penalize', () => {
    assert.equal(calculateHealthScores(m({}, { swapUsed: undefined })).memory, 100);
  });

  it('system memory >90% caps memory score at 50', () => {
    assert.equal(calculateHealthScores(m({}, { memoryPercent: 95 })).memory, 50);
  });

  it('event-loop lag caps performance (frozen-loop detector)', () => {
    assert.equal(calculateHealthScores(m({ loopP99: 50 })).performance, 100);
    assert.equal(calculateHealthScores(m({ loopP99: 150 })).performance, 75);
    assert.equal(calculateHealthScores(m({ loopP99: 400 })).performance, 50);
    assert.equal(calculateHealthScores(m({ loopP99: 1500 })).performance, 0);
  });

  it('stability counts CRASH restarts in 24h, not the lifetime PM2 counter', () => {
    // Old code: lifetime counter ≥25 → 0/100 forever. A box with 30 lifetime restarts but a
    // quiet day is healthy; a box with 4 crashes today is not.
    assert.equal(calculateHealthScores(m({ restarts: 33, crashes24h: 0 })).stability, 100);
    assert.equal(calculateHealthScores(m({ crashes24h: 1 })).stability, 75);
    assert.equal(calculateHealthScores(m({ crashes24h: 2 })).stability, 50);
    assert.equal(calculateHealthScores(m({ crashes24h: 4 })).stability, 0);
  });

  it('offline status zeroes stability regardless of restart history', () => {
    assert.equal(calculateHealthScores(m({ status: 'stopped', crashes24h: 0 })).stability, 0);
  });

  it('incident-06 replay: heap pinned at 98% of limit scores CRITICAL overall (<50)', () => {
    const s = calculateHealthScores(m({ heapPercent: 98, loopP99: 2000 }, { swapUsed: 495 }));
    assert.equal(s.memory, 0);
    assert.equal(s.performance, 0);
    assert.ok(s.overall < 50, `overall ${s.overall} must page`);
  });
});

// ── Replicated from src/monitoring/healthMonitor.formatDrift (keep in sync) ──
function formatDrift(bot) {
  if (!Number.isFinite(bot.driftMbPerHour)) return 'warming up (<30m uptime)';
  if (bot.driftMbPerHour <= 0.5) return `${bot.driftMbPerHour >= 0 ? '+' : ''}${bot.driftMbPerHour}MB/h (stable)`;
  const eta = Number.isFinite(bot.ceilingEtaHours)
    ? (bot.ceilingEtaHours > 168 ? ' (ceiling >1 week away)' : ` → 85% ceiling in ~${bot.ceilingEtaHours}h`)
    : '';
  return `+${bot.driftMbPerHour}MB/h${eta}`;
}

describe('Health Monitor — drift line formatting', () => {
  it('warming up under 30m uptime', () => {
    assert.equal(formatDrift({}), 'warming up (<30m uptime)');
  });
  it('stable at ≤0.5MB/h (incl. negative drift after GC)', () => {
    assert.equal(formatDrift({ driftMbPerHour: 0.2 }), '+0.2MB/h (stable)');
    assert.equal(formatDrift({ driftMbPerHour: -1.3 }), '-1.3MB/h (stable)');
  });
  it('shows ceiling ETA when drift is real (incident-06 metric)', () => {
    assert.equal(formatDrift({ driftMbPerHour: 13, ceilingEtaHours: 58 }), '+13MB/h → 85% ceiling in ~58h');
  });
  it('relaxes when the ceiling is >1 week out', () => {
    assert.equal(formatDrift({ driftMbPerHour: 2, ceilingEtaHours: 380 }), '+2MB/h (ceiling >1 week away)');
  });
});
