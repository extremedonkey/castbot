# Snowflake Timer System

## Overview

The Snowflake Timer extracts timestamps from Discord message IDs (snowflakes) to calculate durations between events. Every Discord ID encodes a millisecond-precision creation timestamp — no storage, no special commands, just math on IDs that already exist.

**Primary use case**: Timing how long players take to complete challenges in ORGs. Replaces carl-bot's `?tag snowflake` workflow.

**Spec/History**: [RaP 0925](../01-RaP/0925_20260403_SnowflakeTimer_Analysis.md) | **Discord API**: [Application Commands](../standards/DiscordApplicationCommands.md)

---

## How It Works

Discord snowflakes are 64-bit IDs encoding milliseconds since Discord Epoch (2015-01-01):

```
 63                         22  21    17  16    12  11          0
+-----------------------------+--------+--------+--------------+
|     Timestamp (ms)          |Worker  |Process |  Increment   |
|     (42 bits)               |(5 bits)|(5 bits)|  (12 bits)   |
+-----------------------------+--------+--------+--------------+
```

Every message, interaction, user, channel, and role ID is a snowflake. The timer system extracts and compares these timestamps.

---

## Three Interface Paradigms

| Paradigm | Who starts | Who ends | Storage | Status |
|---|---|---|---|---|
| **A) Context Menu** | Host right-clicks a message | Host right-clicks another message | In-memory pending starts | **Built** |
| **B) Menu Calculator** | Host pastes message ID(s) via modal | Host pastes second ID | None (stateless) | **Built** |
| **C) Live Inline** | Bot posts a message (snowflake = start) | Player interacts with it (snowflake = end) | None (messages ARE the data) | **Not built** |

---

## What's Built

### Core Utilities (`timerUtils.js`)

Pure functions, zero dependencies, 31 tests in `tests/timerUtils.test.js`.

```javascript
import {
  snowflakeToTimestamp,    // ID → unix ms
  parseSnowflake,         // ID → { timestamp, date, workerId, processId, increment }
  timeBetweenSnowflakes,  // (startId, endId) → { durationMs, formatted, startTime, endTime, reversed }
  formatDuration,         // ms → "3m 30s"
  discordTimestamp,       // (ms, style) → "<t:1775088000:T>"
  setPendingStart,        // (hostId, playerId, messageId, timestamp, channelId)
  getPendingStart,        // (hostId, playerId) → { messageId, timestamp, channelId } | null
  clearPendingStart,      // (hostId, playerId)
  getAllPendingStarts,    // (hostId) → Map
  clearAllPendingStarts,  // (hostId)
} from './timerUtils.js';
```

**Duration formatting** scales automatically: `500ms` → `45.2s` → `12m 34s` → `1h 23m 45s` → `1d 2h 15m`

**Hammertime** (Discord auto-localizing timestamps):

| Style | Output | Code |
|---|---|---|
| `F` | April 3, 2026 3:42:15 PM | `discordTimestamp(ms, 'F')` |
| `T` | 3:42:15 PM | `discordTimestamp(ms, 'T')` |
| `R` | 2 minutes ago (live-updating) | `discordTimestamp(ms, 'R')` |

### Paradigm A: Context Menu Commands

Three MESSAGE context menu commands (right-click message → Apps):

| Command | What it does |
|---|---|
| `❄ Start Timer` | Stores message snowflake as pending start for the message author |
| `❄ Stop Timer` | Calculates duration from pending start, shows result with Post Publicly button |
| `❄ Snowflake Info` | Decodes message snowflake — timestamp, relative time, worker/process/increment |

**Registration**: `commands.js` as `type: 3` commands. Currently deployed to dev guild only (instant). Global deploy via `npm run deploy-commands`.

**Pending starts** are in-memory (`Map<hostId, Map<playerId, ...>>`), lost on restart. Supports interleaved timing of multiple players by one host.

**Handler location**: Top of `APPLICATION_COMMAND` section in `app.js` — must be BEFORE analytics logging to avoid 3-second timeout.

### Paradigm B: Tools Menu

`/menu` → Tools → **❄ Snowflake** section with two buttons:

| Button | Opens | Result |
|---|---|---|
| Calculator | Modal: Start ID + End ID (optional, supports both pasted in one field) | Public message: duration + hammertime timestamps + "Calculate Again" button |
| Lookup | Modal: Message ID | Public message: decoded snowflake info + "Look Up Another" button |

**Smart parsing**: Pasting `1234567890 9876543210` (space-separated) in the Start field works — handler splits and uses both.

### Button Registry

```javascript
// In buttonHandlerFactory.js BUTTON_REGISTRY
'snowflake_calculator': { requiresModal: true, category: 'timers', parent: 'setup_menu' }
'snowflake_lookup':     { requiresModal: true, category: 'timers', parent: 'setup_menu' }
'timer_post_*':         { category: 'timers' }  // Post Publicly (wildcard, pipe-separated)
```

---

## What's NOT Built (Roadmap)

### Paradigm C: Live Inline Timer

The carl-bot killer. Bot posts a message with a component, player interacts, duration calculated from `message.id` vs `interaction.id`.

```javascript
// Inside ANY component interaction handler:
const startTime = snowflakeToTimestamp(req.body.message.id);   // when message was posted
const endTime   = snowflakeToTimestamp(req.body.id);           // when player interacted
const result    = timeBetweenSnowflakes(req.body.message.id, req.body.id);
const player    = req.body.member.user.id;
```

Works with any component type (button, select, modal, file upload). For modals, encode original message ID in `custom_id`.

**Pending decisions**: Where the "Post Timer" trigger lives, how results display per player, leaderboard format.

### Session Persistence

`playerData[guildId].timerSessions` — named sessions with per-player results, leaderboards, DNF tracking. Data model designed in RaP but not implemented.

### Challenge Integration

`timerConfig` field in challenge data model. Auto-create timed messages when challenges are executed. Depends on challenge execution system.

### Handler Extraction

Context menu + button + modal handlers are currently inline in `app.js` (~230 lines across 3 sections). Should be extracted to `timerHandler.js` per the "app.js is a router, not a processor" rule.

---

## Technical Details

### Files

| File | What | Lines |
|---|---|---|
| `timerUtils.js` | Pure utility functions + in-memory pending starts | ~120 |
| `tests/timerUtils.test.js` | 31 unit tests | ~200 |
| `commands.js` | 3 context menu command definitions (type 3) | ~5 |
| `app.js` | Context menu dispatch + button handlers + modal submit handlers | ~230 |
| `menuBuilder.js` | ❄ Snowflake section in Tools menu | ~8 |
| `buttonHandlerFactory.js` | 3 BUTTON_REGISTRY entries | ~5 |

### Permissions

All timer features are open to all users. No permission checks. Snowflake timestamps are public data — restricting would hinder player self-service.

### Context Menu Handler Placement

Context menu handlers MUST be the first thing in the `APPLICATION_COMMAND` block, before analytics logging. The analytics code (channel fetch, `loadPlayerData`, `logInteraction`) takes >3 seconds and causes Discord timeout.

```
APPLICATION_COMMAND received
  ├─ data.type === 3? → Context menu handler (instant, returns immediately)
  ├─ Analytics logging (slow: channel fetch, DB load, logInteraction)
  ├─ Permission guard
  └─ Slash command handlers (/castlist, /menu)
```

---

## Gotchas Discovered

### Emoji Variation Selector

Discord strips the variation selector (U+FE0F) from emoji in command names. Register as `❄️` but match in code as `❄` (bare, without U+FE0F). They look identical but `===` fails.

```javascript
// ❌ WRONG — includes invisible variation selector
if (name === '❄️ Start Timer') { ... }

// ✅ CORRECT — bare snowflake emoji, matches Discord's response
if (name === '❄ Start Timer') { ... }
```

### Guild vs Global Command Duplicates

Guild commands and global commands with the same name both appear in Discord — causing duplicates. When testing context menus via guild deploy, only deploy type 3 commands to the guild:

```javascript
const contextMenusOnly = ALL_COMMANDS.filter(c => c.type === 3);
await InstallGlobalCommands(appId, contextMenusOnly, guildId);
```

### Modal Label Description Limit

Discord Label component `description` field has a 100-character max. Exceeding it causes "This interaction failed" with no useful error message.

### Context Menu Sort Order

Discord sorts context menu commands alphabetically by name. Current names sort correctly: Snowflake Info → Start Timer → Stop Timer.

---

## Related Documentation

- [RaP 0925: Analysis & Design](../01-RaP/0925_20260403_SnowflakeTimer_Analysis.md) — Original analysis, design decisions, Paradigm C spec
- [Application Commands Reference](../standards/DiscordApplicationCommands.md) — Command types, registration, payloads
- [Components V2](../standards/ComponentsV2.md) — UI component patterns
- [Challenges](Challenges.md) — Future timer integration target
