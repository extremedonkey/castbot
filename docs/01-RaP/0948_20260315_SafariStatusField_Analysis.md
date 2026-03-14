# 0948 — Safari Player Status Field

**Date:** 2026-03-15
**Status:** Analysis Complete — Ready for Implementation
**Related:** [Safari Initialization](../03-features/SafariInitialization.md) | [Attributes](../03-features/Attributes.md) | [Safari Deinitialization](../03-features/SafariDeinitialization.md)

---

## Original Context / Trigger Prompt

After fixing a bug where the Safari Guide button appeared for de-initialized players (Task #9), Reece noted that the fix — checking `safari.points !== undefined` — felt fragile, and proposed a proper status field for tracking player state across initialization, pause, and de-initialization.

---

## 🤔 The Problem in Plain English

Right now, "is this player initialized?" is answered by checking whether `safari.points` exists. It's like checking whether someone is employed by looking for a desk in the office — it works, but it's a side effect, not a declaration. The actual state is **inferred** from data artifacts rather than **declared** explicitly.

This leads to:

1. **Fragile checks** — `safari.points !== undefined` is the canonical check, but it's not obvious *why* that's the marker. Developers copy the pattern without understanding it.
2. **Skeleton confusion** — De-initialization deletes the safari object, then recreates a skeleton (to preserve `startingLocation`). The skeleton has `currency`, `inventory`, `history`, etc. — all the fields of an initialized player, just zeroed out. Only the missing `points` field distinguishes it.
3. **Inconsistent checks** — At least two different patterns exist: the canonical `safari.points !== undefined` check and a looser `currency || inventory || points` check in bulk init.
4. **Pause is a separate boolean** — `safari.isPaused` lives alongside the inferred init state. There's no unified state machine.
5. **Pre-initialization is invisible** — Admins can give players currency/items before initialization. These players have a `.safari` object with data, but aren't "initialized." There's no way to distinguish "has some admin-granted stuff" from "was initialized and then de-initialized."

---

## 📊 Current State: Inferred State Machine

```mermaid
stateDiagram-v2
    [*] --> NoSafari: Player exists, no .safari
    NoSafari --> PreInit: Admin grants currency/items
    NoSafari --> Initialized: initializePlayerOnMap()
    PreInit --> Initialized: initializePlayerOnMap()
    Initialized --> Paused: safari.isPaused = true
    Paused --> Initialized: safari.isPaused = false
    Initialized --> DeInitSkeleton: deinitializePlayer()
    Paused --> DeInitSkeleton: deinitializePlayer()
    DeInitSkeleton --> Initialized: Re-initialize

    state NoSafari {
        note: ".safari is undefined"
    }
    state PreInit {
        note: ".safari exists, .points undefined\ncurrency/inventory may have data"
    }
    state Initialized {
        note: ".safari.points defined\n.isPaused falsy"
    }
    state Paused {
        note: ".safari.points defined\n.isPaused === true"
    }
    state DeInitSkeleton {
        note: ".safari exists (skeleton)\n.points undefined\nstartingLocation preserved"
    }
```

### How Each State Is Currently Detected

| State | Current Check | Reliable? |
|-------|--------------|-----------|
| No Safari data | `!player.safari` | ✅ Yes |
| Pre-initialized | `.safari` exists, `.points` undefined, has currency/items | ⚠️ Indistinguishable from de-init skeleton |
| Initialized | `safari.points !== undefined` | ✅ Yes (canonical) |
| Paused | `safari.points !== undefined && safari.isPaused === true` | ✅ Yes |
| De-initialized | `.safari` exists (skeleton), `.points` undefined | ⚠️ Looks like pre-init |

**The ambiguity**: Pre-initialized and de-initialized players look the same — both have a `.safari` object with no `.points`. The only difference is that de-init skeletons have `mapProgress[mapId].startingLocation`.

---

## 🔍 Current Usage Inventory

### Canonical Check Function

```javascript
// safariPlayerUtils.js:16-20
export function isPlayerInitialized(player) {
  const safari = player?.safari;
  if (!safari) return false;
  return safari.points !== undefined;
}
```

### All Callers and Inline Checks

| File | Check | Purpose |
|------|-------|---------|
| `safariPlayerUtils.js:19` | `safari.points !== undefined` | Canonical `isPlayerInitialized()` |
| `safariPlayerUtils.js:43` | `isPlayerInitialized(player)` | `getInitializedPlayers()` filter |
| `safariMapAdmin.js:134` | `safari && safari.points !== undefined` | Admin status display |
| `safariMapAdmin.js:985-986` | `currency \|\| inventory \|\| points` | Looser check in bulk init (catches pre-init stubs) |
| `safariMapAdmin.js:992` | `isPlayerInitialized(player)` | Skip already-initialized in bulk |
| `playerManagement.js:961` | `safariObj?.points !== undefined` | Activity Log/Guide button visibility |
| `playerCardMenu.js:583` | `safari.points !== undefined` | Player card location display |
| `safariManager.js:3512` | `isPlayerInitialized()` (internal) | Action outcome init/teleport |
| `mapMovement.js:17-30` | `player?.safari` + `mapProgress` | Movement — checks map state, not init |
| `pausedPlayersManager.js:23` | `player.safari?.isPaused === true` | Pause state (independent check) |
| `safariDeinitialization.js:213` | `!playerData[guildId]?.players?.[userId]?.safari` | Has data to de-init? |

### State Transitions

| Operation | File | What It Sets |
|-----------|------|-------------|
| **Initialize** | `mapMovement.js:initializePlayerOnMap()` | Creates `safari.points`, `mapProgress`, full structure |
| **Pause** | `pausedPlayersManager.js:pauseSinglePlayer()` | Sets `safari.isPaused = true` |
| **Unpause** | `pausedPlayersManager.js:unpauseSinglePlayer()` | Sets `safari.isPaused = false` |
| **De-initialize** | `safariDeinitialization.js:deinitializePlayer()` | Deletes `.safari`, recreates skeleton (no `.points`) |
| **Admin pre-init** | Various admin handlers | Sets `safari.currency`, `safari.inventory` without `.points` |

### All Entry Points That Call `initializePlayerOnMap()`

All 6 callers funnel through the single `initializePlayerOnMap()` function — so setting `safari.status` there covers all paths:

| # | File:Line | Entry Point | Context |
|---|-----------|-------------|---------|
| 1 | `safariMapAdmin.js:514` | Admin "Place Player" button | Single player init from Safari Map Admin |
| 2 | `safariMapAdmin.js:1010` | `bulkInitializePlayers()` | Start Safari bulk init (loop) |
| 3 | `safariManager.js:3516` | MANAGE_PLAYER_STATE, mode `'initialize'` | Custom Action outcome |
| 4 | `safariManager.js:3540` | MANAGE_PLAYER_STATE, mode `'init_or_teleport'` | Custom Action outcome (init branch) |
| 5 | `app.js:31608` | `safari_map_init_player` button | Player self-init from Start Safari UI |
| 6 | `app.js:32358` | `safari_admin_init_player_*` button | Admin single-player init from Player Admin |

---

## 💡 Solution: Explicit Status Field

### Option A: `safari.status` String Field (Recommended)

Add `safari.status` as the single source of truth for player state:

```javascript
// Possible values:
safari.status = 'initialized'    // Active player on the map
safari.status = 'paused'         // Paused by host (can't move, still on map)
safari.status = 'deinitialized'  // Was initialized, now removed (skeleton data preserved)
// No safari object = never touched Safari
```

**Benefits:**
- Explicit, readable, self-documenting
- Single field to check instead of inferring from `.points` existence
- `isPaused` boolean becomes redundant (subsumed by status)
- Easy to extend: `'spectating'`, `'eliminated'`, `'waiting'` etc.
- State transitions are obvious and auditable

**Migration path:**
```javascript
// isPlayerInitialized() becomes:
export function isPlayerInitialized(player) {
  return player?.safari?.status === 'initialized' || player?.safari?.status === 'paused';
}

// Or more granular:
export function getPlayerStatus(player) {
  return player?.safari?.status || (player?.safari ? 'unknown' : 'none');
}
```

### Option B: Keep `points` Check, Add Status As Supplementary

Keep the canonical `points` check but add `status` for display and future use. Both must agree.

**Risk:** Two sources of truth can diverge. Not recommended.

### Option C: Enum-Style Constants

```javascript
export const SAFARI_STATUS = {
  INITIALIZED: 'initialized',
  PAUSED: 'paused',
  DEINITIALIZED: 'deinitialized'
};
```

This is additive to Option A — use constants to avoid typos.

---

## 🏗️ Recommended Approach: Option A + C

### Design Principles

1. **`safari.status` is the new canonical source of truth** — replaces `points` existence check
2. **`isPlayerInitialized()` updated to check `status`** — all existing callers work unchanged
3. **`isPaused` boolean retained temporarily** for backward compatibility, deprecated
4. **Constants defined in safariPlayerUtils.js** to prevent typos
5. **De-init sets status to `'deinitialized'`** instead of relying on skeleton shape
6. **Backward-compatible**: Players without `.status` treated as legacy — infer from `.points`

### Backward Compatibility Strategy

Existing player data won't have `.status`. The check function handles this:

```javascript
export const SAFARI_STATUS = {
  INITIALIZED: 'initialized',
  PAUSED: 'paused',
  DEINITIALIZED: 'deinitialized'
};

export function getPlayerSafariStatus(player) {
  const safari = player?.safari;
  if (!safari) return null; // No safari data at all

  // New field takes priority
  if (safari.status) return safari.status;

  // Legacy inference for existing data without status field
  if (safari.points !== undefined) {
    return safari.isPaused === true ? SAFARI_STATUS.PAUSED : SAFARI_STATUS.INITIALIZED;
  }

  return SAFARI_STATUS.DEINITIALIZED; // Has skeleton but no points
}

export function isPlayerInitialized(player) {
  const status = getPlayerSafariStatus(player);
  return status === SAFARI_STATUS.INITIALIZED || status === SAFARI_STATUS.PAUSED;
}
```

### Migration: Where to Set Status

| Operation | File | Change |
|-----------|------|--------|
| `initializePlayerOnMap()` | `mapMovement.js` | Add `safari.status = 'initialized'` |
| `pauseSinglePlayer()` | `pausedPlayersManager.js` | Add `safari.status = 'paused'` |
| `unpauseSinglePlayer()` | `pausedPlayersManager.js` | Add `safari.status = 'initialized'` |
| `deinitializePlayer()` | `safariDeinitialization.js` | Add `safari.status = 'deinitialized'` to skeleton |
| `bulkInitializePlayers()` | `safariMapAdmin.js` | Set via `initializePlayerOnMap()` (automatic) |
| MANAGE_PLAYER_STATE action | `safariManager.js` | Set via respective functions (automatic) |

### Migration: Where to Read Status

All existing callers of `isPlayerInitialized()` work unchanged — the function signature doesn't change. Inline checks need updating:

| File | Line | Current | Updated |
|------|------|---------|---------|
| `safariMapAdmin.js` | 134 | `safari && safari.points !== undefined` | `isPlayerInitialized(player)` |
| `playerManagement.js` | 961 | `safariObj?.points !== undefined` | `isPlayerInitialized(player)` or `getPlayerSafariStatus(player)` |
| `playerCardMenu.js` | 583 | `safari.points !== undefined` | `isPlayerInitialized(player)` |
| `safariMapAdmin.js` | 985 | `currency \|\| inventory \|\| points` | Keep as-is (intentionally loose for bulk init) |

---

## ⚠️ Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing player data has no `.status` | Low | Backward-compat function infers from `.points` |
| `isPaused` and `.status` disagree | Low | Pause/unpause functions set both during transition period |
| Bulk init looser check breaks | Low | That check intentionally catches pre-init stubs — leave as-is |
| Missed a setter (status never set somewhere) | Medium | Audit all state transitions (table above); add console warnings for missing status |
| Performance impact | None | String comparison vs `!== undefined` is negligible |

---

## 📋 Implementation Plan

### Phase 1: Add Status Field (Non-Breaking)
- Add `SAFARI_STATUS` constants and `getPlayerSafariStatus()` to `safariPlayerUtils.js`
- Update `isPlayerInitialized()` to use new function (backward-compatible)
- Set `safari.status` in all 4 state transition points (init, pause, unpause, de-init)
- **Tests**: Unit test `getPlayerSafariStatus()` with all combinations (no safari, legacy without status, new with status, skeleton)

### Phase 2: Update Inline Checks
- Replace 3 inline `safari.points !== undefined` checks with `isPlayerInitialized(player)`
- Update admin status display to show status field
- **Tests**: Verify all UI elements show/hide correctly for each state

### Phase 3: Deprecate `isPaused` (Future)
- Once all data has `.status` field (after enough time in production), remove `isPaused` reads
- Keep setting `isPaused` for a full deprecation cycle
- Eventually remove `isPaused` entirely

### Estimated Scope
- **Phase 1**: ~30 lines across 4 files + tests
- **Phase 2**: ~10 lines across 3 files
- **Phase 3**: Future cleanup, no rush

---

## 🔮 Future Extensibility

A proper status field opens the door to:

| Status | Use Case |
|--------|----------|
| `'spectating'` | Eliminated players who can still watch |
| `'waiting'` | In queue for next round / season |
| `'eliminated'` | Explicitly knocked out (different from de-init) |
| `'locked'` | Temporarily frozen by host (different from paused — can't interact at all) |

These don't need to be built now, but the architecture supports them without further refactoring.
