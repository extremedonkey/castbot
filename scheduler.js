/**
 * Scheduler - General-purpose job scheduler with disk persistence.
 *
 * Persists job intents (action, payload, executeAt) to scheduledJobs.json.
 * On startup, restore() rebuilds setTimeout timers from persisted data.
 * Overdue jobs are executed immediately.
 *
 * Usage:
 *   import { scheduler } from './scheduler.js';
 *
 *   scheduler.registerAction('process_round_results', async (payload, client) => { ... });
 *   scheduler.registerAction('send_reminder', async (payload, client) => { ... });
 *
 *   scheduler.init(client);
 *   await scheduler.restore();
 *
 *   await scheduler.schedule('process_round_results',
 *     { channelId: '123', guildId: '456' },
 *     { delayMs: 3600000, guildId: '456', channelId: '123',
 *       reminders: [{ offsetMs: 60000, message: '1 minute' }],
 *       reminderAction: 'send_reminder' }
 *   );
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JOBS_FILE = path.join(__dirname, 'scheduledJobs.json');

let client = null;
const actions = new Map();       // action name -> async handler(payload, client)
const jobs = new Map();          // jobId -> { ...jobData, _timeoutId, _reminderTimeoutIds }
let saveTimer = null;

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ---- Persistence ----

async function loadJobs() {
  try {
    const raw = await fs.readFile(JOBS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('❌ [SCHEDULER] Failed to load jobs:', err.message);
    return [];
  }
}

async function saveJobs() {
  const persistable = Array.from(jobs.values()).map(job => {
    const { _timeoutId, _reminderTimeoutIds, ...rest } = job;
    return rest;
  });
  try {
    const json = JSON.stringify(persistable, null, 2);
    const tmpPath = JOBS_FILE + '.tmp';
    await fs.writeFile(tmpPath, json);
    await fs.rename(tmpPath, JOBS_FILE);
    console.log(`💾 [SCHEDULER] Saved ${persistable.length} job(s)`);
  } catch (err) {
    console.error('❌ [SCHEDULER] Save failed:', err.message);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveJobs(), 500);
}

// ---- Timer Setup ----

function setupTimers(job) {
  const now = Date.now();
  const msUntilExecution = job.executeAt - now;

  // Main job timer
  if (msUntilExecution > 0) {
    job._timeoutId = setTimeout(() => executeJob(job), msUntilExecution);
  } else {
    // Overdue — execute soon
    const overdueMin = Math.round((now - job.executeAt) / 60000);
    console.log(`⏰ [SCHEDULER] Job ${job.id} was ${overdueMin}m overdue — executing now`);
    job._timeoutId = setTimeout(() => executeJob(job), 500);
  }

  // Reminder timers
  job._reminderTimeoutIds = [];
  if (job.reminders && job.reminderAction) {
    for (const reminder of job.reminders) {
      const msUntilReminder = job.executeAt - reminder.offsetMs - now;
      if (msUntilReminder > 0) {
        const timerId = setTimeout(async () => {
          const handler = actions.get(job.reminderAction);
          if (handler) {
            try {
              await handler({ ...job.payload, reminderMessage: reminder.message }, client);
              console.log(`🔔 [SCHEDULER] Reminder fired for ${job.id}: ${reminder.message}`);
            } catch (err) {
              console.error(`❌ [SCHEDULER] Reminder failed for ${job.id}:`, err.message);
            }
          }
        }, msUntilReminder);
        job._reminderTimeoutIds.push(timerId);
      }
    }
  }
}

async function executeJob(job) {
  const handler = actions.get(job.action);
  if (!handler) {
    console.error(`❌ [SCHEDULER] No handler registered for action "${job.action}"`);
    jobs.delete(job.id);
    scheduleSave();
    return;
  }

  try {
    console.log(`⏰ [SCHEDULER] Executing ${job.action} (job ${job.id})`);
    await handler(job.payload, client);
    console.log(`✅ [SCHEDULER] Job ${job.id} completed`);
  } catch (err) {
    console.error(`❌ [SCHEDULER] Job ${job.id} failed:`, err.message);
  } finally {
    // Clear any remaining reminder timers
    if (job._reminderTimeoutIds) {
      job._reminderTimeoutIds.forEach(id => clearTimeout(id));
    }
    jobs.delete(job.id);
    scheduleSave();
  }
}

// ---- Public API (singleton) ----

export const scheduler = {
  init(discordClient) {
    client = discordClient;
    console.log('✅ [SCHEDULER] Initialized with Discord client');
  },

  registerAction(name, handler) {
    actions.set(name, handler);
    console.log(`📋 [SCHEDULER] Registered action: ${name}`);
  },

  async schedule(actionName, payload, options = {}) {
    const {
      delayMs = 0,
      guildId = null,
      channelId = null,
      reminders = [],
      reminderAction = null,
      description = ''
    } = options;

    if (!actions.has(actionName)) {
      console.error(`❌ [SCHEDULER] Cannot schedule unknown action: ${actionName}`);
      return null;
    }

    const jobId = generateJobId();
    const job = {
      id: jobId,
      action: actionName,
      payload,
      guildId,
      channelId,
      executeAt: Date.now() + delayMs,
      reminders,
      reminderAction,
      description,
      createdAt: Date.now()
    };

    jobs.set(jobId, job);
    setupTimers(job);
    scheduleSave();

    const minutes = Math.round(delayMs / 60000);
    const reminderCount = reminders.filter(r => (delayMs - r.offsetMs) > 0).length;
    console.log(`⏰ [SCHEDULER] Scheduled ${actionName} (${jobId}) in ${minutes}m with ${reminderCount} reminder(s)`);
    return jobId;
  },

  cancel(jobId) {
    const job = jobs.get(jobId);
    if (!job) return false;

    clearTimeout(job._timeoutId);
    if (job._reminderTimeoutIds) {
      job._reminderTimeoutIds.forEach(id => clearTimeout(id));
    }

    jobs.delete(jobId);
    scheduleSave();
    console.log(`🗑️ [SCHEDULER] Cancelled job ${jobId}`);
    return true;
  },

  getJobs(filter = {}) {
    let result = Array.from(jobs.values());
    if (filter.guildId) {
      result = result.filter(j => j.guildId === filter.guildId);
    }
    if (filter.action) {
      result = result.filter(j => j.action === filter.action);
    }
    return result.sort((a, b) => a.executeAt - b.executeAt);
  },

  calculateRemainingTime(executeAt) {
    const diff = executeAt - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  },

  async restore() {
    const savedJobs = await loadJobs();
    if (savedJobs.length === 0) {
      console.log('📋 [SCHEDULER] No saved jobs to restore');
      return;
    }

    let restored = 0;
    let expired = 0;

    for (const jobData of savedJobs) {
      if (jobData.executeAt <= Date.now()) {
        expired++;
      } else {
        restored++;
      }
      jobs.set(jobData.id, jobData);
      setupTimers(jobData);
    }

    console.log(`✅ [SCHEDULER] Restored ${restored} future job(s), ${expired} overdue job(s) executing now`);
  }
};
