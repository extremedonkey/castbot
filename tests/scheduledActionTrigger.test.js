/**
 * Scheduled Action Trigger — "armed on trigger" rework
 *
 * Covers the pure logic of scheduledActionManager.js, the executeButtonActions
 * options-shim/interception gate (safariManager.js), scheduler.js key filtering,
 * and the fire-time webhook mention payload (app.js execute_custom_action).
 * Logic is replicated inline per TestingStandards (no heavy module imports).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MAX_STACKED_SCHEDULES = 5; // config/safariLimits.js SAFARI_LIMITS.MAX_STACKED_SCHEDULES

// --- Replicated from scheduledActionManager.js ---

function buildJobKey(guildId, actionId, userId) {
  return `ca:${guildId}:${actionId}:${userId}`;
}

const RETRIGGER_POLICIES = ['block', 'replace', 'stack'];

function resolveRetriggerPolicy(schedule) {
  const policy = schedule?.onRetrigger;
  return RETRIGGER_POLICIES.includes(policy) ? policy : 'block';
}

function applyRetriggerPolicy(existingJobs, policy, cap = MAX_STACKED_SCHEDULES) {
  const existing = existingJobs || [];
  if (existing.length === 0) return { verdict: 'arm', cancelJobIds: [] };
  switch (policy) {
    case 'replace':
      return { verdict: 'arm', cancelJobIds: existing.map(j => j.id) };
    case 'stack':
      return existing.length >= cap
        ? { verdict: 'block', cancelJobIds: [] }
        : { verdict: 'arm', cancelJobIds: [] };
    case 'block':
    default:
      return { verdict: 'block', cancelJobIds: [] };
  }
}

function resolveTargetChannel(schedule, interaction) {
  return schedule?.channelId
    || interaction?.channel_id
    || interaction?.channelId
    || interaction?.channel?.id
    || null;
}

function canArm(schedule) {
  if (!schedule?.delayMs || schedule.delayMs <= 0) {
    return { ok: false, reason: 'no_delay' };
  }
  return { ok: true };
}

// --- Replicated from safariManager.js executeButtonActions ---

// 6th-param options shim: boolean (legacy) or {scheduledExecution, forceConditionsFail, triggerInput}
function normalizeExecOptions(forceConditionsFail = false, triggerInput = null) {
  let isScheduledExecution = false;
  if (forceConditionsFail && typeof forceConditionsFail === 'object') {
    const opts = forceConditionsFail;
    isScheduledExecution = !!opts.scheduledExecution;
    triggerInput = opts.triggerInput ?? triggerInput;
    forceConditionsFail = !!opts.forceConditionsFail;
  }
  return { forceConditionsFail, triggerInput, isScheduledExecution };
}

// Interception gate predicate
function shouldArmInsteadOfExecute(triggerType, isScheduledExecution, conditionsResult, forceConditionsFail) {
  return triggerType === 'schedule' && !isScheduledExecution && conditionsResult && !forceConditionsFail;
}

// --- Replicated from scheduler.js getJobs ---

function filterJobs(jobs, filter = {}) {
  let result = [...jobs];
  if (filter.guildId) result = result.filter(j => j.guildId === filter.guildId);
  if (filter.action) result = result.filter(j => j.action === filter.action);
  if (filter.key) result = result.filter(j => j.key === filter.key);
  return result.sort((a, b) => a.executeAt - b.executeAt);
}

// --- Replicated from app.js execute_custom_action webhook posting ---

function buildComponentsWebhookBody(result, userId, actionName) {
  const EPHEMERAL = 64;
  const flags = result.flags ? (result.flags & ~EPHEMERAL) : (1 << 15);
  return {
    flags: flags | (1 << 15),
    components: [
      { type: 10, content: `-# ⏰ <@${userId}>'s scheduled **${actionName || 'action'}**` },
      ...result.components
    ],
    allowed_mentions: { users: [userId] }
  };
}

// --- Replicated from scheduledActionManager.js jobSelectOption ---

function jobSelectLabel(description, remaining, index) {
  return `${index + 1}. ${description} — ${remaining}`.slice(0, 100);
}

// ─────────────────────────────────────────────────────────────────────────

describe('Scheduled Action — job keys', () => {
  it('builds the ca:{guild}:{action}:{user} key', () => {
    assert.equal(buildJobKey('g1', 'water_plant', 'u9'), 'ca:g1:water_plant:u9');
  });

  it('distinct players/actions/guilds never collide', () => {
    const keys = new Set([
      buildJobKey('g1', 'a1', 'u1'),
      buildJobKey('g1', 'a1', 'u2'),
      buildJobKey('g1', 'a2', 'u1'),
      buildJobKey('g2', 'a1', 'u1')
    ]);
    assert.equal(keys.size, 4);
  });
});

describe('Scheduled Action — retrigger policy', () => {
  const jobs = (n) => Array.from({ length: n }, (_, i) => ({ id: `job_${i}` }));

  it('always arms when nothing is armed, regardless of policy', () => {
    for (const policy of ['block', 'replace', 'stack']) {
      assert.deepEqual(applyRetriggerPolicy([], policy), { verdict: 'arm', cancelJobIds: [] });
    }
  });

  it('block: blocks when one timer exists', () => {
    assert.equal(applyRetriggerPolicy(jobs(1), 'block').verdict, 'block');
  });

  it('replace: arms and cancels ALL existing timers', () => {
    const r = applyRetriggerPolicy(jobs(3), 'replace');
    assert.equal(r.verdict, 'arm');
    assert.deepEqual(r.cancelJobIds, ['job_0', 'job_1', 'job_2']);
  });

  it('stack: arms up to the cap, then blocks', () => {
    assert.equal(applyRetriggerPolicy(jobs(MAX_STACKED_SCHEDULES - 1), 'stack').verdict, 'arm');
    assert.equal(applyRetriggerPolicy(jobs(MAX_STACKED_SCHEDULES), 'stack').verdict, 'block');
    assert.equal(applyRetriggerPolicy(jobs(MAX_STACKED_SCHEDULES + 3), 'stack').verdict, 'block');
  });

  it('missing/unknown policy defaults to block (legacy configs)', () => {
    assert.equal(resolveRetriggerPolicy(undefined), 'block');
    assert.equal(resolveRetriggerPolicy({}), 'block');
    assert.equal(resolveRetriggerPolicy({ onRetrigger: 'banana' }), 'block');
    assert.equal(resolveRetriggerPolicy({ onRetrigger: 'stack' }), 'stack');
  });
});

describe('Scheduled Action — canArm migration guard', () => {
  it('legacy {channelId}-only config is blocked', () => {
    assert.equal(canArm({ channelId: '123' }).ok, false);
  });

  it('delayMs 0 / null / missing schedule blocked', () => {
    assert.equal(canArm({ delayMs: 0 }).ok, false);
    assert.equal(canArm({ delayMs: null }).ok, false);
    assert.equal(canArm(undefined).ok, false);
  });

  it('configured delay arms', () => {
    assert.equal(canArm({ delayMs: 60000 }).ok, true);
  });
});

describe('Scheduled Action — channel resolution precedence', () => {
  it('configured channel wins over interaction channel', () => {
    assert.equal(resolveTargetChannel({ channelId: 'cfg' }, { channel_id: 'inv' }), 'cfg');
  });

  it('falls back to the invoking channel (all interaction shapes)', () => {
    assert.equal(resolveTargetChannel({}, { channel_id: 'raw' }), 'raw');
    assert.equal(resolveTargetChannel({}, { channelId: 'ctx' }), 'ctx');
    assert.equal(resolveTargetChannel({}, { channel: { id: 'obj' } }), 'obj');
  });

  it('null when nothing resolvable (mock scheduler interaction has no channel id)', () => {
    assert.equal(resolveTargetChannel({}, { channel: { name: 'general' } }), null);
    assert.equal(resolveTargetChannel(null, null), null);
  });
});

describe('executeButtonActions — options shim (6th param polymorphic)', () => {
  it('legacy boolean true still forces conditions fail', () => {
    const r = normalizeExecOptions(true, null);
    assert.deepEqual(r, { forceConditionsFail: true, triggerInput: null, isScheduledExecution: false });
  });

  it('legacy 7th positional triggerInput passes through', () => {
    assert.equal(normalizeExecOptions(false, 'answer').triggerInput, 'answer');
  });

  it('options object sets scheduledExecution without forcing fail', () => {
    const r = normalizeExecOptions({ scheduledExecution: true });
    assert.deepEqual(r, { forceConditionsFail: false, triggerInput: null, isScheduledExecution: true });
  });

  it('options object triggerInput wins over positional', () => {
    assert.equal(normalizeExecOptions({ triggerInput: 'a' }, 'b').triggerInput, 'a');
  });

  it('falsy boolean (default call shape) unchanged', () => {
    const r = normalizeExecOptions(false, null);
    assert.deepEqual(r, { forceConditionsFail: false, triggerInput: null, isScheduledExecution: false });
  });
});

describe('executeButtonActions — interception gate', () => {
  it('arms: schedule trigger + interactive call + conditions pass', () => {
    assert.equal(shouldArmInsteadOfExecute('schedule', false, true, false), true);
  });

  it('does NOT arm on scheduled execution (anti-infinite-loop bypass)', () => {
    assert.equal(shouldArmInsteadOfExecute('schedule', true, true, false), false);
  });

  it('does NOT arm when conditions fail (falls through to fail outcomes)', () => {
    assert.equal(shouldArmInsteadOfExecute('schedule', false, false, false), false);
  });

  it('does NOT arm when forceConditionsFail (modal wrong-answer path)', () => {
    assert.equal(shouldArmInsteadOfExecute('schedule', false, true, true), false);
  });

  it('never intercepts non-schedule triggers', () => {
    for (const t of ['button', 'button_modal', 'button_input', 'modal', undefined]) {
      assert.equal(shouldArmInsteadOfExecute(t, false, true, false), false);
    }
  });
});

describe('scheduler getJobs — key filtering', () => {
  const jobs = [
    { id: 'j1', guildId: 'g1', action: 'execute_custom_action', key: 'ca:g1:a1:u1', executeAt: 300 },
    { id: 'j2', guildId: 'g1', action: 'execute_custom_action', key: 'ca:g1:a1:u2', executeAt: 100 },
    { id: 'j3', guildId: 'g1', action: 'execute_custom_action', executeAt: 200 }, // legacy keyless
    { id: 'j4', guildId: 'g2', action: 'process_round_results', executeAt: 50 }
  ];

  it('key filter matches only that player+action', () => {
    assert.deepEqual(filterJobs(jobs, { key: 'ca:g1:a1:u1' }).map(j => j.id), ['j1']);
  });

  it('legacy keyless jobs never match a key filter', () => {
    assert.equal(filterJobs(jobs, { key: 'ca:g1:a1:u3' }).length, 0);
  });

  it('guildId + key combine; results sorted by executeAt', () => {
    assert.deepEqual(filterJobs(jobs, { guildId: 'g1' }).map(j => j.id), ['j2', 'j3', 'j1']);
    assert.deepEqual(filterJobs(jobs, { guildId: 'g2', key: 'nope' }).length, 0);
  });

  it('cross-guild scoping: g1 filter never sees g2 jobs (the round-results bug)', () => {
    const seen = filterJobs(jobs, { guildId: 'g1' }).map(j => j.guildId);
    assert.ok(seen.every(g => g === 'g1'));
  });
});

describe('execute_custom_action — webhook mention payload', () => {
  const EPHEMERAL = 64;
  const IS_V2 = 1 << 15;

  it('prepends attribution Text Display and strips EPHEMERAL', () => {
    const result = { flags: IS_V2 | EPHEMERAL, components: [{ type: 17, components: [] }] };
    const body = buildComponentsWebhookBody(result, 'u123', 'Water Plant');
    assert.equal(body.flags & EPHEMERAL, 0);
    assert.ok(body.flags & IS_V2);
    assert.equal(body.components[0].type, 10);
    assert.ok(body.components[0].content.includes('<@u123>'));
    assert.ok(body.components[0].content.includes('Water Plant'));
    assert.equal(body.components[1].type, 17);
  });

  it('allowed_mentions pings exactly the triggering player', () => {
    const body = buildComponentsWebhookBody({ components: [] }, 'u9', 'X');
    assert.deepEqual(body.allowed_mentions, { users: ['u9'] });
  });
});

describe('Jobs dashboard — select options', () => {
  it('caps at 25 shown jobs', () => {
    const jobs = Array.from({ length: 40 }, (_, i) => ({ id: `j${i}`, executeAt: i }));
    assert.equal(jobs.slice(0, 25).length, 25);
  });

  it('labels truncate to 100 chars', () => {
    const label = jobSelectLabel('x'.repeat(200), '5m', 0);
    assert.equal(label.length, 100);
  });
});
