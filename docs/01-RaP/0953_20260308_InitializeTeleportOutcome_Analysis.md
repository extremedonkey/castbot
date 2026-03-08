# RaP 0953 — Initialize / Teleport / De-initialize Outcome Type

**Date**: 2026-03-08
**Status**: Analysis complete, ready for implementation
**Related**: [SafariInitialization.md](../03-features/SafariInitialization.md), [SafariCustomActions.md](../03-features/SafariCustomActions.md), [ActionTerminology](0956_20260308_ActionTerminology_Analysis.md)

---

## Original Context

> Create a new Outcome of 'Initialize / De-initialize in Safari'. On click:
> - Follow the UI and interaction design of calculate_results as our best implementation
> - Provide an option to initialize at a specific coordinate (modal)
> - Consider teleport ability since we're half doing this already
> - Consider whether teleport should be separate or combined
> - Consider edge cases, additional options, tech debt

---

## 1. The Ask: What Are We Actually Building?

An admin creates an Action (e.g., "Welcome to Safari!") and adds an Outcome that, when a player triggers it, **initializes them onto the map**, **teleports them**, or **de-initializes them** — without any admin involvement at runtime.

This is the bridge between the **Action system** (player-facing triggers) and the **Initialization system** (currently admin-only). It enables self-service onboarding, location-based portals, elimination mechanics, and event resets.

---

## 2. Combined vs Separate: The Teleport Question

### Option A: One Combined Outcome (`manage_safari_state`)

```
🚀 Manage Safari State
├── Mode: Initialize / Teleport / De-initialize
├── Coordinate (optional, for init/teleport)
└── executeOn: true/false
```

**Pros:**
- Single select menu entry — less UI clutter
- Shared config UI (coordinate input reused)
- Conceptually they're all "change where the player is on the map"
- Fewer code paths to maintain

**Cons:**
- Mode select adds a click
- "Initialize + De-initialize" in one dropdown could confuse admins
- Different modes have different edge cases (init needs currency/items, teleport needs adjacency decisions, de-init needs cleanup)

### Option B: Two Separate Outcomes

```
🚀 Initialize / De-initialize    🌀 Teleport Player
├── Mode: Initialize / De-init   ├── Coordinate (required)
├── Coordinate (optional)        └── executeOn: true/false
└── executeOn: true/false
```

**Pros:**
- Clearer intent per outcome
- Simpler config per outcome
- Can evolve independently

**Cons:**
- Two entries in the already-9-item OUTCOME_TYPE_OPTIONS list (now 11)
- Duplicated coordinate config UI
- Admin building a "portal" Action needs two outcomes (init check + teleport) instead of one

### Option C: One Outcome with Sub-modes (Recommended)

```
🚀 Safari Player State
├── Mode select:
│   ├── 🚀 Initialize Player (place on map with full setup)
│   ├── 🌀 Teleport Player (move to coordinate, must be initialized)
│   ├── 🔄 Initialize or Teleport (init if new, teleport if existing)
│   └── ❌ De-initialize Player (remove from map)
├── Coordinate (shown for init/teleport modes, hidden for de-init)
└── executeOn: true/false
```

**Why this wins:**
- **One OUTCOME_TYPE_OPTIONS entry** — the select menu stays clean
- **Sub-modes are in the config UI** (like calculate_results has scope + displayMode)
- **"Initialize or Teleport" mode** is the killer feature — the Action doesn't need to know if the player is already on the map. It just works. This is what most admins actually want.
- De-init as a mode makes sense because it's the inverse operation
- Mirrors the calculate_results pattern exactly (one outcome type, config determines behavior)

---

## 3. Technical Design

### 3.1 Data Schema (stored in `action.actions[]`)

```javascript
{
  type: 'manage_player_state',
  order: 0,
  config: {
    mode: 'initialize',           // 'initialize' | 'teleport' | 'init_or_teleport' | 'deinitialize'
    coordinate: 'B3',             // Optional. Null = use standard resolution chain
    bypassStamina: true           // For teleport mode only. Always true for init.
  },
  executeOn: 'true'               // or 'false'
}
```

### 3.2 Config UI (customActionUI.js — new function)

Following calculate_results pattern: Container with select menus.

```
┌─────────────────────────────────────────────┐
│ 🚀 Safari Player State                     │
│                                             │
│ Choose what happens to the player when      │
│ this outcome executes.                      │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│ 📋 Mode                                    │
│ ┌─────────────────────────────────────┐     │
│ │ 🚀 Initialize Player           ▼   │     │
│ │ 🌀 Teleport Player                 │     │
│ │ 🔄 Initialize or Teleport          │     │
│ │ ❌ De-initialize Player             │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ 📍 Target Coordinate (optional)             │
│ Leave blank to use the standard starting    │
│ location (per-player > server default).     │
│ ┌─────────────────────────────────────┐     │
│ │ [Enter coordinate, e.g. B3]        │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│ ⚙️ Execute When                             │
│ ┌─────────────────────────────────────┐     │
│ │ ✅ Conditions Met               ▼  │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ [⬅️ Back]                    [🗑️ Delete]   │
└─────────────────────────────────────────────┘
```

**Note on coordinate input**: We considered reusing the existing `add_coord_modal` pattern (modal with text input), but the calculate_results pattern is better — everything in one Container with select menus and inline text inputs, no modal needed. However, Discord Components V2 doesn't support inline text inputs in messages (type 4 is modal-only). So coordinate entry needs one of:

**Option 1 (Recommended)**: Pre-set via a "Set Coordinate" button that opens a modal (same pattern as `add_coord_modal`). The current coordinate is shown in the config display. Default = blank (use standard resolution).

**Option 2**: Use the existing coordinate select pattern — but this requires listing all map coordinates in a select menu, which could be 49+ options (7x7 map).

Going with **Option 1** — a button that opens a small modal with one text input for the coordinate. The config Container shows the currently configured coordinate (or "Default" if none set).

### 3.3 Execution Logic (safariManager.js)

New function `executeManagePlayerState()`:

```javascript
async function executeManagePlayerState(config, guildId, userId, interaction) {
  const { mode, coordinate } = config;
  const client = interaction.client || interaction.guild?.client;
  const { isPlayerInitialized } = await import('./safariPlayerUtils.js');
  const playerData = await loadPlayerData();
  const player = playerData[guildId]?.players?.[userId];
  const initialized = isPlayerInitialized(player);

  switch (mode) {
    case 'initialize':
      if (initialized) return { content: '❌ You are already on the map!' };
      await initializePlayerOnMap(guildId, userId, coordinate || null, client);
      return { content: '✅ Welcome to the Safari!' };

    case 'teleport':
      if (!initialized) return { content: '❌ You must be on the map first!' };
      if (!coordinate) return { content: '❌ No destination configured.' };
      const result = await movePlayer(guildId, userId, coordinate, client, {
        bypassStamina: true, adminMove: true
      });
      return { content: result.message };

    case 'init_or_teleport':
      if (!initialized) {
        await initializePlayerOnMap(guildId, userId, coordinate || null, client);
        return { content: '✅ Welcome to the Safari!' };
      } else {
        if (!coordinate) return { content: 'ℹ️ You are already on the map.' };
        const result = await movePlayer(guildId, userId, coordinate, client, {
          bypassStamina: true, adminMove: true
        });
        return { content: result.message };
      }

    case 'deinitialize':
      if (!initialized) return { content: '❌ You are not on the map.' };
      const { deinitializePlayer } = await import('./safariDeinitialization.js');
      await deinitializePlayer(guildId, userId, client);
      return { content: '👋 You have been removed from the map.' };
  }
}
```

### 3.4 Dispatch (executeButtonActions switch)

```javascript
case 'manage_player_state':
    result = await executeManagePlayerState(action.config, guildId, userId, interaction);
    responses.push(result);
    break;
```

### 3.5 Logger (safariLogger.js)

```javascript
case 'manage_player_state': {
  const mode = cfg.mode || '?';
  const coord = cfg.coordinate || 'default';
  details.push(`Safari State: ${mode} → ${coord}`);
  break;
}
```

---

## 4. Coordinate Resolution: How It Interacts with Existing Config

When `config.coordinate` is set in the outcome:

```
Outcome coordinate set?
├── YES → Use it (overrides everything — this is the Action-specific override)
└── NO → Pass null to initializePlayerOnMap()
         └── Function resolves internally:
             ├── Per-player startingLocation (if exists)
             ├── Server default coordinate
             └── 'A1' fallback
```

This is clean because of Improvement B (from earlier this session) — `initializePlayerOnMap(guildId, userId, null, client)` now handles the full resolution chain internally.

For teleport mode, coordinate is **required** (what would "teleport to default" mean?). The config UI should validate this.

---

## 5. Edge Cases & Considerations

### 5.1 Permission Model

**Current state**: `initializePlayerOnMap()` and `deinitializePlayer()` have no internal permission checks — they trust the caller. Permission enforcement happens at the button handler level.

**For Action execution**: The Action system already handles its own condition gating (currency checks, role checks, etc). The execution function is called post-condition-evaluation, so no additional permission checks needed. **Any player can trigger these outcomes** if they can trigger the Action — which is exactly what we want for self-service init.

**Security consideration**: A malicious admin could create a de-init Action on every coordinate. This is an admin trust issue, not a code issue — admins can already delete player data via other means.

### 5.2 Re-initialization (init mode, player already initialized)

Return a friendly error. Don't silently re-init — that would grant duplicate currency/items (additive behavior from the initialization system).

### 5.3 Teleport to Invalid Coordinate

`movePlayer()` with `adminMove: true` bypasses adjacency checks but still validates the coordinate exists on the map. Invalid coordinates will return an error from the movement system.

### 5.4 De-init Then Init in Same Action

If an Action has both a de-init outcome and an init outcome (in that order), the player gets de-initialized then re-initialized in the same execution. This is intentional and valid — it's a "reset" pattern. Currency/items would be additive on re-init.

### 5.5 No Active Map

`initializePlayerOnMap()` handles this — it initializes the safari structure without map-specific data. The player gets currency/items but no location. This is fine.

### 5.6 Interaction with All Trigger Types

| Trigger | Works? | Notes |
|---------|--------|-------|
| Button Click | Yes | Player clicks button on map coordinate — affects only the clicking player |
| Text Command | Yes | Player types keyword — affects only the typing player |
| Select Menu | Yes | Player picks from select options — affects only the selecting player |
| Scheduled | Yes | Runs for the **scheduling admin's userId only** (not all players) |

**Scheduled trigger clarification**: The scheduler calls `executeButtonActions(guildId, actionId, userId, ...)` with the single userId of the admin who set up the schedule (app.js:1477). It does NOT iterate all players. The "all players" behavior in calculate_results is an outcome-internal decision (`scope: 'all_players'`), not a trigger-level loop. So a scheduled init Action would only try to init the scheduling admin — harmless if they're already initialized (caught by guard).

### 5.7 Per-Player Isolation — ALWAYS Single Player (Critical for Idol Hunts / Secret Locations)

**This outcome type has NO "all_players" scope option.** Unlike `calculate_results` and `calculate_attack` which offer `scope: 'all_players'` vs `scope: 'single_player'`, the `manage_player_state` outcome **always operates on the single triggering player's userId**. This is a hard design constraint, not a configuration option.

**Why no scope option:**
- **Bulk init already exists** as a separate admin feature (`bulkInitializePlayers` via Start Safari UI). This outcome is for player self-service, not admin bulk operations.
- **Teleporting all players** to one coordinate would be catastrophic in an idol hunt / competitive safari.
- **De-initializing all players** would wipe the entire game state.
- There is no use case where "all players get initialized/teleported/de-initialized by one player clicking a button" makes sense.

**How it's enforced**: `executeButtonActions` passes a single `userId` from the interaction (line 1477). The execution function receives this userId and operates on it alone. No iteration over players.

**Trigger-level safety by type:**
| Trigger | Who gets affected | Safe? |
|---------|------------------|-------|
| Button Click | The player who clicked | Yes — individual player |
| Text Command | The player who typed the keyword | Yes — individual player |
| Select Menu | The player who selected | Yes — individual player |
| Scheduled | The admin who scheduled it | Yes — only affects the scheduling admin's userId, harmless if already initialized |

**Risk mitigations built into the design:**
- **Init mode**: Returns "already initialized" if player is already on map — no duplicate currency/items
- **Teleport mode**: Moves only the triggering player — other players at the same coordinate are unaffected
- **De-init mode**: De-initializes only the triggering player
- **init_or_teleport mode**: Checks the triggering player's state individually

**Admin misconfiguration risks** (trust boundary — not code bugs):
- De-init Action with no conditions → any player who triggers it gets removed. Mitigated by Action conditions (require item/role/attribute).
- Init Action on wrong coordinate → players get initialized when they shouldn't. Mitigated by coordinate assignment in Action config.
- These are the same risks that exist for give_currency, give_item, etc. The Action condition system is the guard, not the outcome.

### 5.8 Display Text Integration

The outcome returns a `content` string. If the Action also has a `display_text` outcome, both messages will be collected in the `responses[]` array and displayed together. This works with the existing system.

---

## 6. Implementation Checklist

| # | Task | File | Effort |
|---|------|------|--------|
| 1 | Add `manage_player_state` to OUTCOME_TYPE_OPTIONS | customActionUI.js:14 | 2 min |
| 2 | Create `showManagePlayerStateConfig()` config UI | customActionUI.js (new function) | 30 min |
| 3 | Add dispatch case in `safari_action_type_select_*` handler | app.js:16948+ | 15 min |
| 4 | Add coordinate modal handler (reuse `add_coord_modal` pattern) | app.js | 15 min |
| 5 | Add `executeManagePlayerState()` execution function | safariManager.js | 20 min |
| 6 | Add dispatch case in `executeButtonActions` switch | safariManager.js:1696 | 5 min |
| 7 | Add ACTION_TYPES constant | safariManager.js:300 | 2 min |
| 8 | Add logger case | safariLogger.js | 5 min |
| 9 | Add to BUTTON_REGISTRY (config UI buttons) | buttonHandlerFactory.js | 5 min |
| 10 | Write unit tests | tests/safariManagePlayerState.test.js | 20 min |
| 11 | Update SafariCustomActions.md with new outcome docs | docs/03-features/ | 10 min |

**Total estimated effort**: ~2 hours

---

## 7. Existing Code Reuse

| What We Need | What Already Exists | Reuse? |
|-------------|-------------------|--------|
| Initialize player | `initializePlayerOnMap()` (safariMapAdmin.js) | Direct call |
| De-initialize player | `deinitializePlayer()` (safariDeinitialization.js) | Direct call |
| Teleport/move player | `movePlayer()` (mapMovement.js) with `{bypassStamina: true, adminMove: true}` | Direct call |
| Check if initialized | `isPlayerInitialized()` (safariPlayerUtils.js) | Direct call |
| Coordinate text input modal | `add_coord_modal` pattern (app.js) | Pattern copy (different custom_id) |
| Config UI layout | `showCalculateResultsConfig()` (customActionUI.js) | Pattern copy |
| Starting currency getter | `getStartingCurrency()` (safariManager.js) | Used internally by init |

**No new infrastructure needed.** This is pure composition of existing functions behind a new outcome type.

---

## 8. Future-Proofing / Tech Debt Considerations

### What NOT to do now:
- **Don't add "Initialize + Teleport" as an atomic operation** — the `init_or_teleport` mode handles this cleanly by checking state first
- **Don't add stamina cost config for teleport** — YAGNI. If needed later, add a `staminaCost` field to config
- **Don't refactor `movePlayer()` to expose bypass flags differently** — the `options` parameter pattern is fine
- **Don't create a "Teleport" trigger type** — teleport is an outcome, not a trigger. Triggers are how Actions are invoked; outcomes are what they do.

### What to watch for:
- **Starting location config changes** (mentioned in the ask): The coordinate in the outcome config is independent of the starting location system. If starting locations change in the future, Actions with explicit coordinates won't be affected. Actions with no coordinate (null) will automatically pick up the new defaults through the resolution chain.
- **Bulk operations**: If a future feature needs "init all players via Action," the scheduled trigger + init_or_teleport mode already handles this.

---

## 9. Recommendation

**Go with Option C (combined outcome, sub-modes).** Implementation order:

1. Start with `initialize` and `deinitialize` modes only
2. Add `teleport` and `init_or_teleport` modes (they're trivial once the config UI exists)
3. The config UI follows calculate_results exactly — mode select, coordinate button, execute-when select

The `init_or_teleport` mode is the most useful — it lets an admin put a "Join Safari" button on any coordinate, and it Just Works whether the player is new or returning.

---

## 10. Component Count Analysis

Config UI (Container + components):

```
Container (1)
├── Text Display - title (1)
├── Separator (1)
├── Text Display - mode label (1)
├── Action Row + Select (mode) (2)
├── Separator (1)
├── Text Display - coordinate display (1)
├── Action Row + Button (set coordinate) (2)
├── Separator (1)
├── Text Display - execute when label (1)
├── Action Row + Select (execute when) (2)
├── Separator (1)
├── Action Row + 2 Buttons (back, delete) (3)
Total: 18 components
```

Well within the 40-component limit. The parent Action editor adds ~25 base components + 2 per outcome, so even with 5 outcomes including this one, we're at 25 + 10 + 18 = 53... wait, the config UI **replaces** the editor view (same as calculate_results), it doesn't nest inside it. So 18 is the total when viewing this config. Safe.
