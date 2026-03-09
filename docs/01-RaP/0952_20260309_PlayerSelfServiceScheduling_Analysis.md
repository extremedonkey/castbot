# RaP 0952 — Player Self-Service Scheduling via Posted Buttons

**Date**: 2026-03-09
**Status**: Analysis complete, awaiting decision
**Related**: [SafariCustomActions.md](../03-features/SafariCustomActions.md), [ActionTerminology](0956_20260308_ActionTerminology_Analysis.md)

---

## Original Context

> Just how hard would it be to make a button posted from a custom action of scheduled task type allow the end user (e.g. player) to click the button and almost self-service schedule their task? It could have all sorts of use cases: farming sim, plant watering cooldown, grow my plant, etc.

---

## 1. The Ask: What Are We Actually Building?

An admin creates a Scheduled Action (e.g., "Water My Plant") and posts it to a channel. When a player clicks the button, instead of executing immediately, it **schedules the action to run later for that specific player**. The player is essentially self-service scheduling — they click "Water My Plant" and in 4 hours they get a harvest result posted to the channel.

This is the bridge between the **Scheduled Action system** (currently admin-only, single-execution) and the **player-facing button system** (currently immediate-execution). It enables farming sims, timed crafting, cooldown-gated progression, and any "start now, harvest later" mechanic.

---

## 2. Current State: How Scheduling Works Today

### The Admin-Only Model

```
Admin opens Action Editor → Schedule trigger
  → Selects channel
  → Clicks "Schedule Task" → Modal: hours + minutes
  → scheduler.schedule('execute_custom_action', {
      userId: ADMIN_ID,     ← Always the admin
      channelId, guildId, actionId
    })
  → Timer fires → executeButtonActions(guildId, actionId, ADMIN_ID, ...)
  → Results posted via webhook to channel
```

**Key constraints:**
- `userId` is always the admin who clicked "Schedule Task"
- One-shot: executes once, then the job is deleted
- No per-player context — conditions evaluate against the admin's data
- Channel is hardcoded at config time, not at trigger time
- Jobs stored in `scheduledJobs.json` (flat file, restored on restart)

### What executeButtonActions Already Supports

The execution function `executeButtonActions(guildId, actionId, userId, interactionData, client)` already accepts any `userId`. It evaluates conditions and runs outcomes against that player. So **the execution side already supports per-player scheduling** — we just need to change who triggers the schedule and whose `userId` gets passed.

---

## 3. Options

### Option A: "Player-Scheduled" — Button Click Schedules for the Clicking Player

```
Admin creates Action:
  - Trigger: Schedule
  - Configures: delay (e.g., 4 hours), channel, outcomes
  - Posts to channel (or adds to map/menu)

Player clicks button → System schedules action for THAT player
  → Timer fires → executeButtonActions(guildId, actionId, PLAYER_ID, ...)
  → Results posted to configured channel

Player sees: "⏰ Your plant will be ready in 4 hours!"
```

**How it works:**
1. Admin configures delay duration in the Action's schedule config (new field: `defaultDelayMs`)
2. When posted as a button, clicking it creates a scheduler job with `userId = clickingPlayer`
3. Timer fires, executes with that player's context
4. Result posts to the channel configured in `action.trigger.schedule.channelId`

**Pros:**
- Simplest mental model: "click button = schedule for me"
- Reuses existing scheduler infrastructure completely
- Per-player conditions work naturally (currency check, item check, etc.)
- Admin configures the delay once, players just click

**Cons:**
- Player can't choose their own delay (fixed by admin config)
- Need to handle "what if player clicks twice?" (duplicate protection)
- Need to handle "what if player de-initializes before timer fires?"
- Posted button needs to work differently than other trigger types (currently `safari_` buttons execute immediately)

**Effort**: Medium (~3-4 hours)

### Option B: "Player-Scheduled with Duration Choice" — Player Picks Delay

```
Player clicks button → Modal opens: "When should this run?"
  → Player enters hours/minutes
  → System schedules for that player
  → Timer fires → Results posted
```

**Pros:**
- More flexible for players
- Could enable different outcomes for different delays (e.g., "quick grow" vs "slow grow")

**Cons:**
- More complex UI — modal for every click
- Admin loses control of timing (players could abuse short delays)
- Extra modal step slows down the interaction
- Hard to balance game mechanics when timing is player-controlled

**Verdict**: YAGNI. The admin should control timing. If needed later, add a config option for "player can choose duration."

### Option C: "Recurring Schedule" — Auto-Repeat

```
Player clicks button → Schedules first run
  → Timer fires → Executes → Automatically schedules next run
  → Repeats until cancelled or conditions fail
```

**Pros:**
- True farming sim feel: "set it and forget it"
- Plant watering runs every 6 hours automatically

**Cons:**
- Dangerous: if many players do this, `scheduledJobs.json` grows indefinitely
- Resource management nightmare (hundreds of timers)
- When does it stop? Needs explicit cancellation or condition-based auto-stop
- Currently no per-player scheduler UI for cancellation

**Verdict**: Don't build this now. Option A covers the 80% use case. Recurring can be added later by adding an `apply_cooldown` + `follow_up_button` chain (player clicks again manually).

---

## 4. Recommended: Option A with Safeguards

### 4.1 New Config Fields

Add to `action.trigger.schedule`:

```javascript
{
  type: 'schedule',
  schedule: {
    channelId: '123456789',         // Where results post (existing)
    defaultDelayMs: 14400000,       // 4 hours — admin-configured (NEW)
    allowPlayerSchedule: true,      // Enable player self-service (NEW)
    maxActivePerPlayer: 1,          // Prevent spam (NEW, default 1)
    resultVisibility: 'channel'     // 'channel' | 'dm' (NEW, future)
  }
}
```

### 4.2 Button Click Flow

When a player clicks a posted button for a `schedule` trigger action:

```
Player clicks safari_{guildId}_{actionId} button
  │
  ├── Is trigger.type === 'schedule' AND schedule.allowPlayerSchedule?
  │   ├── YES:
  │   │   ├── Check: player already has active schedule for this action?
  │   │   │   ├── YES → "⏰ Already scheduled! Ready in 2h 15m"
  │   │   │   └── NO → Continue
  │   │   ├── Evaluate conditions (currency, items, etc.)
  │   │   │   ├── FAIL → Execute fail outcomes (display_text: "You need X first")
  │   │   │   └── PASS → Continue
  │   │   ├── scheduler.schedule('execute_custom_action', {
  │   │   │     userId: PLAYER_ID,  ← The clicking player
  │   │   │     channelId: schedule.channelId,
  │   │   │     guildId, actionId
  │   │   │   }, { delayMs: schedule.defaultDelayMs })
  │   │   └── Respond: "⏰ Scheduled! Your harvest will be ready in 4 hours."
  │   │
  │   └── NO (schedule trigger but not player-schedulable):
  │       └── "❌ This action can only be scheduled by an admin."
  │
  └── Is trigger.type !== 'schedule'?
      └── Normal execution (existing code)
```

### 4.3 Condition Evaluation: Before vs After

**Critical decision**: When do conditions evaluate?

| Option | When | Pros | Cons |
|--------|------|------|------|
| **At click time only** | Player clicks → check conditions → schedule | Player knows immediately if they qualify | Player could gain/lose items before timer fires |
| **At execution time only** | Player clicks → schedule (no check) → timer fires → check conditions | Ensures player still qualifies | Player waits 4 hours only to fail |
| **Both (recommended)** | Check at click → schedule → check again at execution | Best of both worlds | Slightly more complex |

**Recommendation**: Evaluate conditions **at both times**. At click time, run conditions to gate entry (and execute fail outcomes immediately if they don't qualify). At execution time, run conditions again — if they now fail, execute fail outcomes and post to channel.

This is actually **how it already works** — `executeButtonActions` always evaluates conditions. We just need to add the condition check at click time too (for immediate feedback).

### 4.4 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Player clicks twice | Check `scheduler.getJobs()` for existing job with same `actionId + userId`. Block if `maxActivePerPlayer` reached. |
| Player de-initializes | `executeButtonActions` handles this — conditions like `isPlayerInitialized` will fail at execution time, running fail outcomes. |
| Bot restarts | Existing `scheduler.restore()` handles this — jobs are persisted to disk and restored with correct remaining time. |
| Player leaves server | `execute_custom_action` handler tries to fetch member. If member not found, it warns but still tries to execute. Outcomes that need member data will fail gracefully. |
| Channel deleted | Webhook creation fails → error logged, no crash. Existing error handling covers this. |
| Action deleted after scheduling | `executeButtonActions` returns error when action not found. Logged, no crash. |
| 100+ players schedule same action | `scheduledJobs.json` grows. Each job is lightweight (~200 bytes). 1000 jobs = ~200KB. Timer management uses setTimeout per job — Node handles this fine up to ~10K timers. For very large games, consider batching. |

### 4.5 UI Changes Needed

**Action Editor — Schedule Trigger Config:**
```
## 🚀 Trigger Configuration

Action is activated through..
[⏰ Scheduled Action ▼]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Player Self-Service
[✅ Allow players to schedule ▼]

### Default Delay
⏱️ 4 hours, 0 minutes
[Set Delay]              ← Opens modal for hours + minutes

### Results Channel
#game-events
[Select Channel ▼]

### Max Active Per Player
[1 ▼]                    ← 1, 2, 3, 5, or unlimited

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Admin Scheduled Tasks (2)
1. 🕐 2h 30m remaining [Cancel]
2. 🕐 5h 12m remaining [Cancel]

[Schedule Task]          ← Admin manual schedule (existing)

[⬅ Back]
```

**Player-Facing Posted Button:**
- Same as any other posted action button (uses `safari_{guildId}_{actionId}` pattern)
- Clicking it enters the schedule flow instead of immediate execution
- Response is ephemeral: "⏰ Scheduled! Your harvest will be ready in 4 hours."

**Post to Channel:**
- Currently disabled for `schedule` trigger type (same as `modal`)
- Would need to be **enabled** for this feature
- The button renders the same as a standard action button

### 4.6 Player Status Check

Players need a way to see their pending schedules. Options:

**Option 1 (Simple)**: Click the button again → "⏰ Already scheduled! Ready in 2h 15m. Click again to cancel?" with a confirm button.

**Option 2 (Player Menu)**: Add a "Pending Tasks" section to `/menu` → My Profile showing active scheduled actions.

**Option 3 (Both)**: Start with Option 1, add Option 2 later.

**Recommendation**: Start with Option 1 — it's natural (player clicks same button to check status) and requires minimal UI work.

---

## 5. Implementation Checklist

| # | Task | File | Effort |
|---|------|------|--------|
| 1 | Add `defaultDelayMs`, `allowPlayerSchedule`, `maxActivePerPlayer` to schedule config | customActionUI.js | 30 min |
| 2 | Add "Set Delay" modal + handler | customActionUI.js, app.js | 20 min |
| 3 | Add "Allow Players" toggle + "Max Active" select to schedule config UI | customActionUI.js | 20 min |
| 4 | Enable Post to Channel button for schedule trigger (remove disabled check) | customActionUI.js | 5 min |
| 5 | Modify `safari_` button handler to detect `trigger.type === 'schedule'` + route to scheduling flow | app.js | 30 min |
| 6 | Add duplicate check + scheduling logic in button handler | app.js | 20 min |
| 7 | Add "already scheduled" status response with cancel option | app.js | 20 min |
| 8 | Modify `execute_custom_action` handler to support per-player context (already works, just verify) | app.js | 10 min |
| 9 | Update anchor message rendering to show schedule buttons (currently skips non-button triggers) | anchorMessageManager.js | 15 min |
| 10 | Write unit tests | tests/ | 30 min |

**Total estimated effort**: ~3-4 hours

---

## 6. What This Enables

### Farming Sim Example

```
Admin creates: "🌱 Water My Plant"
  Trigger: Schedule (4-hour delay, player self-service ON)
  Conditions: Has item "Seed Packet"
  Pass Outcomes:
    - Remove item "Seed Packet"
    - Give item "Grown Plant"
    - Give currency 50
    - Display text "🌻 Your plant has grown! +50 coins"
  Fail Outcomes:
    - Display text "🥀 Your plant withered... (you no longer have the seed)"

Player flow:
  1. Player gets "Seed Packet" from a store or another action
  2. Player clicks "🌱 Water My Plant" button
  3. Conditions pass (has seed) → "⏰ Your plant will be ready in 4 hours!"
  4. 4 hours later → Conditions check again (still has seed?) → Yes → harvest!
  5. Result posts to #game-events: "🌻 @Player's plant has grown! +50 coins"
```

### Cooldown-Gated Progression Example

```
Admin creates: "⛏️ Mine Resources"
  Trigger: Schedule (1-hour delay, player self-service ON, max 1 active)
  Conditions: Attribute "energy" ≥ 10
  Pass Outcomes:
    - Modify attribute "energy" -10
    - Random outcome:
      - 60%: Give currency 100, Display "Found 100 coins!"
      - 30%: Give item "Iron Ore", Display "Found iron ore!"
      - 10%: Give item "Diamond", Display "💎 Found a diamond!"
```

### Timed Challenge Example

```
Admin creates: "🏃 Marathon Training"
  Trigger: Schedule (24-hour delay, player self-service ON, max 1)
  Conditions: None
  Pass Outcomes:
    - Modify attribute "fitness" +5
    - Display "Your training is complete! Fitness +5"
```

---

## 7. What NOT to Build Now

| Feature | Why Not |
|---------|---------|
| **Player-chosen delay** | YAGNI — admin controls timing for game balance |
| **Recurring schedules** | Resource management complexity, can be simulated with re-clicking |
| **DM results** | Would need DiscordMessenger integration, separate from channel posting |
| **Schedule cancellation by admin for specific players** | Admin can cancel all jobs for an action, per-player filtering is complexity for minimal benefit |
| **Schedule history / log** | Existing Safari Logger captures execution, no need for separate history |
| **Batch timer optimization** | Only needed at scale (1000+ concurrent timers), premature optimization |

---

## 8. Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Timer buildup (many players) | Low | `scheduledJobs.json` is lightweight, Node handles 10K+ timers. Add `maxActivePerPlayer` limit. |
| Bot restart during busy period | Low | Existing `scheduler.restore()` handles overdue jobs (executes within 500ms). |
| Race condition on double-click | Low | Check existing jobs before scheduling. Use job deduplication key: `${actionId}_${userId}`. |
| Stale conditions (player loses items between click and execution) | Medium | Double-check conditions at execution time (already happens via `executeButtonActions`). Show fail outcomes if conditions no longer met. |
| Channel permissions change | Low | Webhook creation will fail gracefully. Existing error handling logs the issue. |

---

## 9. Recommendation

**Go with Option A** — Player clicks button, system schedules with admin-configured delay, timer fires with player context.

Implementation order:
1. Add `defaultDelayMs` and `allowPlayerSchedule` config fields + UI
2. Modify safari button handler to route schedule triggers to scheduling flow
3. Add duplicate protection and status check (click again = see status)
4. Enable Post to Channel / map location for schedule triggers
5. Test with farming sim scenario

The existing scheduler and execution infrastructure handles 90% of this. The main new code is the routing logic in the button handler (detecting schedule trigger → schedule instead of execute) and the admin config UI for delay/permissions.
