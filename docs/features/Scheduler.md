# Scheduler & PersistentStore — Persistent In-Memory Services

**RaP #0956** | **Date**: 2026-03-01
**Status**: Implemented
**Related**: [RaP 0998 — Scheduling Architecture Analysis](0998_20250927_Scheduling_Architecture_Analysis.md) (analyzed the problem; this RaP implements the solution)

---

## Original Context

Two CastBot features used in-memory-only storage (Maps) and lost state on every restart:

1. **Safari Schedule Results** — "Execute round results in X hours" with reminders at 30/5/1 min before. Stored in `scheduledSafariTasks` Map in app.js.
2. **Whispers** — Player-to-player secret messages stored in `global.activeWhispers` Map until recipient clicks "Read Message".

User requirement: persist both across restarts, build reusable services for future features (challenge rounds with nested timers, recurring health checks, etc.).

---

## Solution: Two New Services

### 1. Scheduler (`scheduler.js`)

General-purpose job scheduler. Persists **intent** (action name + payload + executeAt) to `scheduledJobs.json`. On startup, rebuilds `setTimeout` timers from persisted data. Overdue jobs execute immediately.

**API:**
```javascript
import { scheduler } from './scheduler.js';

// Register named actions (at module load)
scheduler.registerAction('process_round_results', async (payload, client) => { ... });
scheduler.registerAction('send_reminder', async (payload, client) => { ... });

// Initialize with Discord client + restore persisted jobs (in client.once('ready'))
scheduler.init(client);
await scheduler.restore();

// Schedule a job
const jobId = await scheduler.schedule('process_round_results',
  { channelId: '123', guildId: '456' },
  {
    delayMs: 3600000,
    guildId: '456',
    channelId: '123',
    reminders: [
      { offsetMs: 1800000, message: '30 minutes' },
      { offsetMs: 300000, message: '5 minutes' },
      { offsetMs: 60000, message: '1 minute' }
    ],
    reminderAction: 'send_reminder',
    description: 'Safari Round Results'
  }
);

// Cancel, query, utility
scheduler.cancel(jobId);
scheduler.getJobs({ guildId: '456', action: 'process_round_results' });
scheduler.calculateRemainingTime(executeAt);  // Returns "4h 30m"
```

**Persistence format** (`scheduledJobs.json`):
```json
[
  {
    "id": "job_1709234567890_a1b2c3d4e",
    "action": "process_round_results",
    "payload": { "channelId": "123", "guildId": "456" },
    "guildId": "456",
    "channelId": "123",
    "executeAt": 1709238167890,
    "reminders": [
      { "offsetMs": 1800000, "message": "30 minutes" },
      { "offsetMs": 300000, "message": "5 minutes" },
      { "offsetMs": 60000, "message": "1 minute" }
    ],
    "reminderAction": "send_reminder",
    "description": "Safari Round Results",
    "createdAt": 1709234567890
  }
]
```

**Key design decisions:**
- Reminders stored as **offsets** (ms before executeAt), not absolute times — self-describing and recalculated on restore
- `_timeoutId` and `_reminderTimeoutIds` stripped from persistence (ephemeral timer handles)
- Overdue jobs (executeAt in the past) execute after 500ms delay on restore
- Debounced save (500ms) prevents disk thrashing
- Atomic writes via `.tmp` + `rename`

### 2. PersistentStore (`persistentStore.js`)

Named, disk-backed Map stores. Synchronous reads from memory, debounced async writes to disk.

**API:**
```javascript
import { PersistentStore } from './persistentStore.js';

const store = PersistentStore.create('whispers');  // Singleton per name
await store.load();                                 // Read from data_whispers.json

store.set(key, value);   // Sync write to Map + schedule disk save
store.get(key);          // Sync read from Map
store.delete(key);       // Sync delete + schedule disk save
store.has(key);
store.values();
store.entries();
store.size;
await store.flush();     // Force immediate save (graceful shutdown)
```

**Files**: `data_{name}.json` in project root (e.g., `data_whispers.json`)

---

## Migration Summary

### Safari Scheduling (app.js)
- **Removed**: 8 functions (~200 lines) — `scheduledSafariTasks` Map, `generateTaskId`, `calculateRemainingTime`, `scheduleSafariTask`, `sendReminderMessage`, `clearSafariTask`, `getAllScheduledSafariTasks`, `executeSafariRoundResults`
- **Added**: 2 action registrations (~50 lines) — `process_round_results`, `send_reminder`
- **Updated**: Button handler (`safari_schedule_results`) and modal handler (`safari_schedule_modal_*`) to use `scheduler.getJobs()`, `scheduler.cancel()`, `scheduler.schedule()`
- **Added**: `scheduler.init(client)` + `await scheduler.restore()` in `client.once('ready')`

### Whispers (whisperManager.js)
- **Removed**: All `global.activeWhispers` references (7 locations)
- **Added**: `PersistentStore` import + lazy-init `getWhisperStore()` function
- **Updated**: `sendWhisper()` and `handleReadWhisper()` to use `store.get/set/delete/has`

---

## Custom Action Scheduled Trigger

### Overview

Custom Actions can be scheduled to execute at a future time in a specific channel. This is the 4th trigger type alongside Button Click, Text Command, and Select Menu.

**Registered action**: `execute_custom_action`

**Payload**:
```json
{
  "channelId": "123456",
  "guildId": "789012",
  "actionId": "action_abc",
  "userId": "345678",
  "actionName": "My Custom Action"
}
```

### User Flow

1. Host opens Custom Action Editor → Trigger → selects "⏰ Scheduled Action"
2. Below-divider UI shows:
   - **Existing tasks** for this action: channel, time remaining, cancel button per task
   - **Create new** section: Channel Select + green "Schedule Task" button
3. Host selects a channel → saved to `action.trigger.schedule.channelId`
4. Host clicks "Schedule Task" → modal opens with Hours + Minutes inputs
5. Modal submit → `scheduler.schedule('execute_custom_action', ...)` creates job
6. When timer fires:
   - Fetches channel and guild member (scheduling user, for condition evaluation)
   - Calls `executeButtonActions(guildId, actionId, userId, syntheticInteraction, client)`
   - Posts result to channel via webhook (same pattern as `process_round_results`)

### Trigger Config Data Structure

```javascript
action.trigger = {
  type: 'schedule',
  schedule: {
    channelId: '123456789'  // Last-selected channel for quick re-scheduling
  }
};
```

### Scheduled Execution Pattern

```javascript
scheduler.registerAction('execute_custom_action', async (payload, schedulerClient) => {
  const { channelId, guildId, actionId, userId, actionName } = payload;

  // 1. Fetch context
  const channel = await schedulerClient.channels.fetch(channelId);
  const guild = await schedulerClient.guilds.fetch(guildId);
  let member = null;
  try { member = await guild.members.fetch(userId); } catch {}

  // 2. Build synthetic interaction (no token in scheduled context)
  const interactionData = {
    token: null,
    applicationId: process.env.APP_ID,
    client: schedulerClient,
    member,
    user: { id: userId },
    channel: { name: channel.name }
  };

  // 3. Execute the Custom Action's action list
  const result = await executeButtonActions(guildId, actionId, userId, interactionData, schedulerClient);

  // 4. Post result via webhook (stripped of ephemeral flags)
  const webhook = await channel.createWebhook({ name: actionName || 'Scheduled Action' });
  if (result?.components) {
    await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: (1 << 15), components: result.components })
    });
  } else if (result?.content) {
    await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: result.content })
    });
  }
  setTimeout(() => webhook.delete().catch(() => {}), 5000);
});
```

### Handler Reference

| Custom ID Pattern | Type | Purpose |
|---|---|---|
| `custom_action_trigger_type_*` (value: `schedule`) | String Select | Selects "Scheduled Action" trigger type |
| `ca_schedule_channel_*` | Channel Select | Picks target channel for scheduled execution |
| `ca_schedule_task_*` | Button (Green) | Opens time-input modal |
| `ca_schedule_cancel_*` | Button (Danger) | Cancels a scheduled task inline |
| `ca_schedule_modal_*` | Modal submit | Creates the scheduler job |

### UI Components (Below-Divider)

```
┌─────────────────────────────────────────┐
│ ### Scheduled Tasks                      │
│ 1. #general — 2h 15m remaining    [🗑️] │
│ 2. #announcements — 45m remaining [🗑️] │
├─────────────────────────────────────────┤
│ ### Create a New Scheduled Run           │
│ [Channel Select: #general         ▼]    │
│ [🟢 Schedule Task]                      │
├─────────────────────────────────────────┤
│ [⬅ Back]                                │
└─────────────────────────────────────────┘
```

---

## Future Extensions

### Challenge Rounds with Nested Timers
The Scheduler's action + payload pattern supports chained execution:

```javascript
scheduler.registerAction('advance_challenge_round', async (payload, client) => {
  const { challengeId, guildId, round, actions, nextRound } = payload;

  for (const action of actions) {
    await executeCustomAction(action, { challengeId, guildId });
  }

  if (nextRound) {
    await scheduler.schedule('advance_challenge_round', nextRound.payload, {
      delayMs: nextRound.delayMs,
      guildId,
      channelId: nextRound.channelId
    });
  }
});
```

### Recurring Jobs (Health Monitor)
The scheduler currently supports one-time jobs only. For recurring jobs, a handler can re-schedule itself:

```javascript
scheduler.registerAction('health_check', async (payload, client) => {
  await runHealthCheck(payload);
  // Re-schedule for next interval
  await scheduler.schedule('health_check', payload, {
    delayMs: payload.intervalMs,
    guildId: payload.guildId
  });
});
```

### Additional PersistentStore Use Cases
- Session data, temporary player state, draft messages, undo history

---

## As-Built Code References

| File | Purpose |
|------|---------|
| `scheduler.js` | Scheduler singleton — actions, scheduling, persistence, restore |
| `persistentStore.js` | PersistentStore class — named Map stores with disk persistence |
| `scheduledJobs.json` | Scheduler persistence file (auto-created) |
| `data_whispers.json` | Whisper store persistence file (auto-created) |
| `app.js` ~line 87 | `import { scheduler } from './scheduler.js'` |
| `app.js` ~line 1456 | Action registrations (`process_round_results`, `send_reminder`) |
| `app.js` ~line 1524 | `scheduler.init(client)` + `await scheduler.restore()` in `client.once('ready')` |
| `app.js` ~line 13584 | Button handler uses `scheduler.getJobs()` + `scheduler.calculateRemainingTime()` |
| `app.js` ~line 41121 | Modal handler uses `scheduler.cancel()` + `scheduler.schedule()` |
| `whisperManager.js` ~line 26 | PersistentStore import + `getWhisperStore()` lazy init |
| `whisperManager.js` ~line 211 | `sendWhisper()` uses `store.set()` |
| `whisperManager.js` ~line 475 | `handleReadWhisper()` uses `store.has()`, `store.get()`, `store.delete()` |

---

*Last Updated: 2026-03-01 — Initial implementation*
