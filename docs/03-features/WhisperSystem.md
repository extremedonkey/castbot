# Whisper System

**Status**: Active (Production)
**Modules**: `whisperManager.js` (core), `persistentStore.js` (durability), `app.js` handlers, `playerLocationManager.js` (location validation), `safariLogger.js` (Safari Log)
**Data file**: `data_whispers.json` (gitignored, Tier 2 — in `BACKUP_FILES`)
**Rewritten**: 2026-07-12 — the previous version of this doc described a dead architecture (`global.pendingWhispers` delivered on the recipient's next interaction). That code no longer exists; this doc describes what actually runs.

**Updated 2026-07-15** — Whisper feature toggle + dedicated spectator Whisper Log:
- **Feature toggle**: `safariConfig.whispersEnabled` — **absent = ON** (always read `!== false`). Toggled via `/menu` → Production Menu → Safari → 🗺️ Map Explorer → 🤫 Whispers (bottom-right; handler `whisper_log_config` — the id deliberately avoids the `safari_whisper_` prefix, which is routed to the player whisper flow). When off, the Whisper button is hidden from the player Location Actions screen (`app.js` `map_location_actions_`) and the admin map-cell UI (`entityManagementUI.js`), and `showWhisperPlayerSelect` refuses with "Whispers are currently disabled" (covers stale buttons). Accepted gap: Reply buttons on already-delivered whispers still work.
- **Dedicated Whisper Log**: `safariLogSettings.whisperLogChannelId` — a second, spectator-safe log channel that receives **only** whispers, independent of the main log's `enabled`/`logTypes.whispers` gates (dual delivery when both are on; deduped if both point at one channel). Target resolution: `getSafariLogTargets()` in `safariLogger.js`; delivery in `postToSafariLog()` (`src/analytics/analyticsLogger.js`). UI builders: `buildWhisperLogConfigUI` / `buildSafariLogConfigUI` in `safariConfigUI.js`.

---

## Overview

Players at the same Safari Map coordinate can send each other private messages. A whisper posts a **public notification** in the location channel (`💬 @sender whispers to @target` — no message body) with a **Read Message** button; only the target can open it, and the content arrives as an ephemeral message with a Reply button. Whispers are **one-time reads**: opening one deletes both the notification message and the stored record.

## Architecture

```
Send:  safari_whisper_{coord} → player select → modal → sendWhisper()
         1. store.set(whisperId, {senderId, senderName, targetUserId,
            recipientName, message, coordinate, timestamp})  + flush (write-through)
         2. channel.send(notification + Read Message button
            custom_id: whisper_read_{whisperId}_{targetUserId})
         3. store patch {messageId, channelId} + flush
         4. logWhisper() → Safari Log channel (full body, if whisper logging on)
         5. ephemeral confirmation to sender

Read:  whisper_read_* → handleReadWhisper()
         recipient guard → store.has(whisperId)
           miss → "❌ This whisper has expired or already been read." (+ warn log)
           hit  → ephemeral content + Reply button
                  → delete channel notification → store.delete + flush
```

- `whisperId = "{Date.now()}_{rand}"` — fully encoded in the Read button's custom_id, so the lookup key lives on the Discord message itself.
- Reply (`whisper_reply_{senderId}_{coordinate}`) reuses the send modal → `sendWhisper()`.
- Location is re-validated on modal submit (`arePlayersAtSameLocation`) — if the target moved, the send fails cleanly.

## Restart durability (added 2026-07-12)

Whispers are stored in `PersistentStore('whispers')` → `data_whispers.json` (atomic tmp+rename writes). Four mechanisms guarantee unread whispers survive restarts/outages:

1. **Write-through**: `sendWhisper`/`handleReadWhisper` call `store.flush()` after every mutation — the 1s save debounce no longer creates a loss window for whispers.
2. **Shutdown flush**: `installShutdownFlush()` (`persistentStore.js`) registers SIGINT/SIGTERM handlers that synchronously flush **all** PersistentStores plus the scheduler's pending `scheduledJobs.json` save (`scheduler.flushSync()`), then re-raise the signal. Wired in the ready handler in app.js. This closes the same gap for every current and future store consumer.
3. **Eager load**: `preloadWhisperStore()` runs in the ready handler, so the store is loaded before any Read click. `getWhisperStore()` caches the *load promise* (not the instance) — concurrent first callers can no longer race an unfinished disk load into a false "already been read".
4. **Discord backup**: `data_whispers.json` is in `BACKUP_FILES` (`src/monitoring/backupService.js`).

**Pruning**: unread whispers older than 30 days are deleted at startup (`WHISPER_MAX_AGE_MS` in `whisperManager.js`) — the store otherwise only shrinks on read.

A missing `whisperId` on Read now genuinely means "already read or >30 days old"; the miss is logged with the whisperId (`logger.warn`) for diagnosability.

## Handler IDs

| custom_id | Purpose |
|---|---|
| `safari_whisper_{coordinate}` | Whisper button on Location Actions |
| `whisper_player_select_{coordinate}` | Co-located player select (ephemeral) |
| `whisper_send_modal_{targetUserId}_{coordinate}` | Send/reply modal (1–1000 chars) |
| `whisper_read_{whisperId}_{targetUserId}` | Read Message button on the public notification |
| `whisper_reply_{senderId}_{coordinate}` | Reply button on the ephemeral whisper content |

## Logging

`logWhisper()` (`safariLogger.js`) posts the **full message body** to the Safari Log channel when the guild has whisper logging enabled (`safariLogSettings.logTypes.whispers`), and writes a content-free activity breadcrumb ("Whispered to X" + location) into the sender's `playerData` history. The Safari Log post is the only recoverable copy of a whisper's content after it's been read.

## Known limitations / notes

- **One-time read, no history** — content is deleted on read; the Safari Log channel is the transcript.
- **Whisper detection** ("👀 Players are whispering…", auto-deleting notice) exists in code (`postWhisperDetection`) but is **disabled** (call commented out in `sendWhisper`). Its auto-delete uses a raw `setTimeout`; if re-enabled, schedule the deletion through `scheduler.js` so it survives restarts.
- The `whisperSettings` config block (`detectionEnabled`, `logEnabled`, …) is only read by the disabled detection path; live logging is governed by `safariLogSettings`.
- Anyone at the location can *see* that a whisper happened (public notification); only the target can read it.
