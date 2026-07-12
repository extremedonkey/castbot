/**
 * Scheduled Action Manager — "armed on trigger" logic for Safari Custom Actions
 * with trigger.type === 'schedule'.
 *
 * Invoking a schedule-trigger action (posted button, linked action, player menu,
 * player command) does NOT execute its outcomes — it ARMS a one-shot scheduler job
 * that fires the action later for the invoking player. The scheduler's
 * 'execute_custom_action' handler runs the real execution with a bypass flag so
 * fired jobs never re-arm (see executeButtonActions interception in safariManager.js).
 *
 * Config shape: trigger.schedule = {
 *   channelId:   string|null   — results channel; null = channel where triggered
 *   delayMs:     number|null   — null/0 = unset, arming blocked until configured
 *   onRetrigger: 'block'|'replace'|'stack' — missing = 'block'
 * }
 *
 * Design: docs/01-RaP/0952_20260309_PlayerSelfServiceScheduling_Analysis.md
 */

import { scheduler } from './scheduler.js';
import { formatPeriod, formatCountdown } from './utils/periodUtils.js';
import { SAFARI_LIMITS } from './config/safariLimits.js';

const EPHEMERAL = 64;              // InteractionResponseFlags.EPHEMERAL
const IS_COMPONENTS_V2 = 1 << 15;

export const RETRIGGER_POLICIES = ['block', 'replace', 'stack'];

/** Logical dedup key: one namespace per (guild, action, player). */
export function buildJobKey(guildId, actionId, userId) {
  return `ca:${guildId}:${actionId}:${userId}`;
}

/** Missing/unknown policy = 'block' (migration-safe for legacy {channelId}-only configs). */
export function resolveRetriggerPolicy(schedule) {
  const policy = schedule?.onRetrigger;
  return RETRIGGER_POLICIES.includes(policy) ? policy : 'block';
}

/**
 * Decide what a retrigger does given the player's existing armed jobs.
 * @returns {{ verdict: 'block'|'arm', cancelJobIds: string[] }}
 */
export function applyRetriggerPolicy(existingJobs, policy, cap = SAFARI_LIMITS.MAX_STACKED_SCHEDULES) {
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

/** Configured results channel wins; otherwise the channel the trigger happened in. */
export function resolveTargetChannel(schedule, interaction) {
  return schedule?.channelId
    || interaction?.channel_id
    || interaction?.channelId
    || interaction?.channel?.id
    || null;
}

/** Arming requires a configured delay (legacy schedule configs have none). */
export function canArm(schedule) {
  if (!schedule?.delayMs || schedule.delayMs <= 0) {
    return { ok: false, reason: 'no_delay' };
  }
  return { ok: true };
}

function ephemeralText(content) {
  return {
    flags: IS_COMPONENTS_V2 | EPHEMERAL,
    components: [{ type: 17, components: [{ type: 10, content }] }]
  };
}

function actionDisplayName(action) {
  return action?.name || action?.label || action?.trigger?.button?.label || 'Custom Action';
}

/**
 * Arm (or block/replace/stack) a scheduled action for the invoking user.
 * Returns an ephemeral response object for the interactive caller to send.
 */
export async function armScheduledAction({ guildId, actionId, userId, action, interaction }) {
  const schedule = action?.trigger?.schedule;
  const name = actionDisplayName(action);

  const gate = canArm(schedule);
  if (!gate.ok) {
    return ephemeralText(
      `⚙️ **${name}** has no delay configured yet, so it can't be armed.\n-# Admins: Action Editor → Trigger → ⏱️ Set Delay.`
    );
  }

  const channelId = resolveTargetChannel(schedule, interaction);
  if (!channelId) {
    return ephemeralText(
      `⚙️ **${name}** has no results channel and none could be inferred.\n-# Admins: Action Editor → Trigger → select a results channel.`
    );
  }

  const key = buildJobKey(guildId, actionId, userId);
  const existing = scheduler.getJobs({ key, guildId });
  const policy = resolveRetriggerPolicy(schedule);
  const { verdict, cancelJobIds } = applyRetriggerPolicy(existing, policy, SAFARI_LIMITS.MAX_STACKED_SCHEDULES);

  if (verdict === 'block') {
    const soonest = existing[0]; // getJobs sorts by executeAt
    const remaining = formatCountdown(soonest.executeAt - Date.now());
    const capNote = policy === 'stack'
      ? `\n-# Limit of ${SAFARI_LIMITS.MAX_STACKED_SCHEDULES} armed at once reached (${existing.length} pending).`
      : '';
    return {
      flags: IS_COMPONENTS_V2 | EPHEMERAL,
      components: [{
        type: 17,
        components: [
          { type: 10, content: `⏰ **${name}** is already armed — fires in **${remaining}**.${capNote}` },
          {
            type: 1,
            components: [{
              type: 2,
              custom_id: `ca_arm_cancel_${soonest.id}`,
              label: 'Cancel Timer',
              style: 4,
              emoji: { name: '🗑️' }
            }]
          }
        ]
      }]
    };
  }

  for (const jobId of cancelJobIds) {
    scheduler.cancel(jobId);
  }

  await scheduler.schedule('execute_custom_action', {
    channelId,
    guildId,
    actionId,
    userId,
    actionName: name
  }, {
    delayMs: schedule.delayMs,
    key,
    guildId,
    channelId,
    description: name
  });

  const replacedNote = cancelJobIds.length > 0 ? ' (previous timer replaced)' : '';
  const stackNote = policy === 'stack' && existing.length > 0
    ? `\n-# ${existing.length + 1} timer(s) now armed.`
    : '';
  console.log(`⏰ [SCHEDULED-ACTION] Armed ${actionId} for user ${userId} in guild ${guildId}: fires in ${formatPeriod(schedule.delayMs)} → <#${channelId}>`);
  return ephemeralText(
    `⏰ **${name}** armed — fires in **${formatCountdown(schedule.delayMs)}** in <#${channelId}>.${replacedNote}${stackNote}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Guild Jobs Dashboard (Tools → Utilities → Scheduled Jobs)
// ─────────────────────────────────────────────────────────────────────────

const JOB_TYPE_LABELS = {
  process_round_results: { emoji: '🎲', label: 'Round Results' },
  execute_custom_action: { emoji: '⚡', label: 'Custom Action' },
  archive_relock: { emoji: '🔐', label: 'Archive Relock' }
};

export function describeJob(job) {
  const meta = JOB_TYPE_LABELS[job.action] || { emoji: '⏰', label: job.action };
  let label = job.description || meta.label;
  if (job.action === 'execute_custom_action' && job.payload?.userId) {
    label += ` — <@${job.payload.userId}>`;
  }
  return { emoji: meta.emoji, label };
}

/** Plain-text label for select options (no mentions/markdown). Max 100 chars. */
export function jobSelectOption(job, index) {
  const meta = JOB_TYPE_LABELS[job.action] || { emoji: '⏰', label: job.action };
  const remaining = formatCountdown(job.executeAt - Date.now());
  const label = `${index + 1}. ${job.description || meta.label} — ${remaining}`.slice(0, 100);
  return {
    label,
    value: job.id,
    description: `${meta.label}${job.channelId ? '' : ' (no channel)'}`.slice(0, 100),
    emoji: { name: meta.emoji }
  };
}

/**
 * Full dashboard UI for a guild's scheduled jobs (all job types).
 * Component budget stays ~12/40 regardless of job count (cancel via one select).
 */
export function buildScheduledJobsDashboardUI(guildId) {
  const jobs = scheduler.getJobs({ guildId }); // sorted by executeAt
  const shown = jobs.slice(0, 25);

  const components = [
    { type: 10, content: `## ⏰ Scheduled Jobs` },
    { type: 14 }
  ];

  if (jobs.length === 0) {
    components.push({ type: 10, content: '*No scheduled jobs in this server.*' });
  } else {
    const lines = shown.map((job, i) => {
      const { emoji, label } = describeJob(job);
      const remaining = formatCountdown(job.executeAt - Date.now());
      const channel = job.channelId ? ` — <#${job.channelId}>` : '';
      return `**${i + 1}.** ${emoji} ${label}${channel} — **${remaining}** remaining`;
    });
    if (jobs.length > shown.length) {
      lines.push(`-# Showing ${shown.length} of ${jobs.length} — cancel some to see more.`);
    }
    // Chunk into ≤3500-char Text Displays (Discord Text Display cap is 4000)
    let buffer = [];
    let bufferLen = 0;
    for (const line of lines) {
      if (bufferLen + line.length + 1 > 3500 && buffer.length) {
        components.push({ type: 10, content: buffer.join('\n') });
        buffer = [];
        bufferLen = 0;
      }
      buffer.push(line);
      bufferLen += line.length + 1;
    }
    if (buffer.length) components.push({ type: 10, content: buffer.join('\n') });

    components.push({
      type: 1,
      components: [{
        type: 3, // String Select
        custom_id: 'sched_dash_cancel_sel',
        placeholder: '🗑️ Cancel scheduled job(s)...',
        min_values: 0,
        max_values: shown.length,
        options: shown.map((job, i) => jobSelectOption(job, i))
      }]
    });
  }

  components.push(
    { type: 14 },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'castbot_tools', label: 'Tools', style: 2, emoji: { name: '⬅' } },
        { type: 2, custom_id: 'scheduled_jobs_dashboard', label: 'Refresh', style: 2, emoji: { name: '🔄' } }
      ]
    }
  );

  return {
    flags: IS_COMPONENTS_V2 | EPHEMERAL,
    components: [{ type: 17, accent_color: 0x3498DB, components }]
  };
}
