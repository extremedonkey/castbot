# Challenge Status Management — Hide Prepared Actions Until Hosts Say Go

> **RaP #0918** | 2026-04-20 (rewritten 2026-04-20 after design pivot)
> **Status**: ✅ **Shipped** — challenge-only state, global round tracking deferred
> **Related**: [Challenges RaP 0945](0945_20260316_Challenges_Analysis.md), [Challenge Actions RaP 0943](0943_20260316_ChallengeActions_Analysis.md), [Season Planner](../03-features/SeasonPlanner.md), [ComponentInteractionFactory RaP 0933](0933_20260323_ComponentInteractionFactory_Analysis.md)

---

## 1. Problem Statement

**Hosts can't prep challenge actions ahead of time.** The moment a Challenge Action is created and linked to a Challenge, it appears in `/menu → 🏃 Challenges` for players. In Survivor-style ORGs, advance knowledge is game-breaking — prep work and live visibility are coupled when they should be decoupled. For a 12-player "Spreadsheet Art" individual challenge, the host needs ~30 minutes to craft per-player actions with unique Google Sheet links; today that prep must happen during the 60-second window before the challenge goes live or players will snoop their menus in advance.

---

## 2. Solution (As Built)

**Three states on `challenge.status`, with `testing` as the default for new challenges.** Admins bypass the testing gate so they can QA via their own `/menu` before going live. Three-layer defence: UI filter + dynamic handler gate + player menu execution gate. A **reusable `StatusSelector`** string-select component is available for future entities that need similar state transitions.

### State model

| Value | Emoji | Semantics | Player menu | Admin menu |
|---|---|---|---|---|
| `testing` | 🧪 | Soft launch / QA | Hidden | Visible |
| `active` | 🏁 | Live play | Visible | Visible |
| `paused` | ⏯️ | Temporarily stopped; can resume | Hidden | Hidden |

- **New challenges** (`createChallenge`, `importChallenge`): default `'testing'`
- **Existing challenges** (no field set): lazy-default to `'active'` on read — preserves current behaviour, **no migration script**
- **Admin** = `hasAdminPermissions(member)` = ManageChannels | ManageGuild | ManageRoles | Administrator (`app.js:686`)

### Timestamp metadata (analytics hooks for future)

```jsonc
{
  "status":            "testing | active | paused",
  "startedAt":         <ms> | null,  // first testing→active; set once, never overwritten
  "pauseOrStoppedAt":  <ms> | null,  // set on →paused; cleared on paused→active
  "completedAt":       null,         // reserved (no 4th state in MVP)
  "pauseHistory":      [ { pausedAt, resumedAt, durationMs } ]   // capped at 100
}
```

**Invariant**: `pauseOrStoppedAt === null` iff `status !== 'paused'`.

### Transition rules (`updateChallengeStatus` in `challengeManager.js`)

| Transition | `startedAt` | `pauseOrStoppedAt` | `pauseHistory` |
|---|---|---|---|
| `testing → active` | set to `now` if null | unchanged | — |
| `paused → active` (resume) | unchanged | cleared to null | patch last: `resumedAt=now`, `durationMs` |
| `active → paused` | unchanged | set to `now` | push new entry |
| `testing → paused` | unchanged | set to `now` | push new entry |
| `paused → testing` | unchanged | cleared to null | patch last |
| `active → testing` | unchanged | unchanged | — |

### Visibility rules (per action category)

Applied in **`playerManagement.js:631`** (`buildSuperSelect('challenges')` — UI filter) and **defence-in-depth** at execution time in **`app.js:5111`** (dynamic `challenge_*` handler) and **`app.js:9202`** (`player_menu_sel_challenges` handler).

| Category | status=testing | status=active | status=paused |
|---|---|---|---|
| `playerAll` | admin only | all players | hidden |
| `playerIndividual` | admin only | assigned player only | hidden |
| `tribe` | admin with role, or regular member with role | role-gated (unchanged) | hidden |
| `host` | admin only (unchanged) | admin only (unchanged) | admin only (unchanged) |

**Host actions bypass the status gate entirely** — `verifyChallengeActionAccess` already requires `MANAGE_ROLES`. Hosts need their controls regardless of state.

Tribe action description in Quick Create modal updated to: *"Unique command per tribe (e.g., tribe attack). Set prod role below if testing."* This hints the workflow: hosts link to a prod/admin-accessible role while testing, then rebind to the real tribe role when flipping to active.

---

## 3. UI (As Built)

Challenge detail screen (`buildChallengeScreen` in `challengeManager.js`) has been reordered:

```
# 🏃 Challenges
───
[Challenge picker string select]
[Edit] [Round] [🧪 Testing] [Post to Channel] [Delete]    ← action row moved up; new status button inserted
───
[Rich card preview: title/host/description/image]
───
[⚡ Challenge Actions select]
───
[← Menu] [📚 Library] [📤 Publish]
```

### Dynamic status button (`getStatusButtonConfig`)

| Status | Button | Style |
|---|---|---|
| `testing` | 🧪 Testing | 2 (Secondary) |
| `active` | 🏁 Active | 3 (Success) |
| `paused` | ⏯️ Paused | 4 (Danger) |

### Status selector (DEFERRED-UPDATE per RaP 0933)

Click button → `deferred: true, updateMessage: true` → same message renders a **StatusSelector** Container with 3 options (current highlighted via `default: true`) + Back button. Pick option → `deferred: true, updateMessage: true` → `updateChallengeStatus` mutates timestamps/pauseHistory, `savePlayerData`, rebuild challenge screen → UPDATE back in place.

---

## 4. Reusable Primitive: `src/ui/statusSelector.js`

Generic builder — not challenge-specific. Parameterisable labels, emojis, descriptions, accent colour, back-button target. Consumable by any future entity (seasons, tribes, etc.) that needs a 2-25 option state transition.

```js
buildStatusSelector({
  customId, title, description, accentColor,
  currentValue,            // highlights via default: true
  options: [{ value, label, emoji, description }],
  placeholder,
  backButton: { customId, label },
}) → { components: [Container] }
```

Validates 2-25 options, requires `customId` + `backButton.customId`, truncates labels to Discord's 100-char limit.

---

## 5. Files Modified (As Built)

| File | Change |
|---|---|
| `src/ui/statusSelector.js` | **NEW** — reusable status picker Container builder |
| `challengeManager.js` | `CHALLENGE_STATUS_VALUES` constant, `getStatusButtonConfig()`, `updateChallengeStatus()`, `buildChallengeStatusScreen()`; `createChallenge`/`importChallenge` init defaults; `buildChallengeScreen` reorder + dynamic status button |
| `challengeActionCreate.js` | `verifyChallengeStatus()` helper; `CATEGORY_TYPES.tribe.description` updated to hint prod-role workflow |
| `playerManagement.js` | `buildSuperSelect('challenges')` — per-challenge status filter + admin bypass (testing only, paused always hidden) |
| `app.js` | Dynamic `challenge_*` gate at L5111 — status check before access check, host actions bypass; `player_menu_sel_challenges` at L9202 — mirrored status check; two new handler blocks `challenge_status_*` and `challenge_status_select_*` |
| `buttonHandlerFactory.js` | `BUTTON_REGISTRY` entries for `challenge_status_*` + `challenge_status_select_*` |
| `tests/statusSelector.test.js` | **NEW** — 8 structure/validation suites |
| `tests/challengeStatus.test.js` | **NEW** — transition / gate / config suites (logic inlined per TestingStandards.md) |

---

## 6. What We Explicitly Did NOT Build

### Global round tracking — deferred

The original 0918 design introduced a full round-state machine living on `seasonRounds[seasonId][roundId]` with invariant enforcement, a denormalized `activeRoundId` pointer on the season config, and a new `roundState.js` module. We pulled back to challenge-only state because:

- The prep-secrecy pain point is solved by challenge state alone. Round state adds complexity without fixing anything new.
- CastBot genuinely does still lack "which round is the game at" — but that answer matters for *leaderboards, placements, analytics*, not for hiding a prepared action. Those features aren't blocked by this RaP.
- Dual-layer state (round + challenge) created an ambiguous OR/AND resolver that would have been hard to reason about.

**Open problem for a future RaP**: global round tracking. When a feature lands that genuinely needs it (e.g. per-round leaderboards, F-number placements on elimination), this should be picked up with clean scope.

### Completed state — deferred

The previous 4-state model had `completed` as a terminal. MVP ships 3 states; hosts use `paused` for "done for now, might reuse." `completedAt` field is reserved in the schema, unused in code. If archival semantics become meaningful, add a 4th state without breaking the current design.

### Mid-chain transactional execution — deferred

If a host pauses while a player is mid-chain, current behaviour aborts at the next chain boundary (follow-up outcome re-enters the gate and rejects). No rollback of partially-applied outcomes. Acceptable for MVP because chains are typically sub-second. Phase 2 could add transactional execution if the pause-mid-chain race proves painful.

### Tycoons / legacy `safari_rounds_menu` — out of scope

The old hardcoded Safari rounds system (`processRoundResults`, `calculateRoundProbability`, `processAttackQueue`) has its own `currentRound` on `safariConfig` and is deliberately not integrated with this feature. Two parallel round concepts coexist.

---

## 7. Acceptance Tests (as verified)

1. ✅ **Player Action — All** visible in `/menu → 🏃 Challenges` only when `status === 'active'` OR viewer has admin perms.
2. ✅ **Individual Player Action** visible only to the assigned player when `status === 'active'` OR to any admin.
3. ✅ **Tribe Challenge Action** visible to role members when status allows; during `testing` the admin bypass still requires the admin to have the tribe role. Hosts use a prod role for QA per the updated description hint.
4. ✅ **Host Challenge Action** unchanged — always admin-only regardless of status (regression test).
5. ✅ **Paused** hides all non-host actions from everyone including admins.
6. ✅ **Mid-session pause**: player with cached menu gets ephemeral `⏯️ This challenge is currently paused.` on click.
7. ✅ **Legacy challenges** without `status` field stay visible (lazy-defaulted to `active`).
8. ✅ **Newly created / imported challenges** default to `testing`.
9. ✅ **Dynamic button** reflects state with emoji + label + style.
10. ✅ **State transitions**: timestamps set correctly per transition table; `pauseHistory` entries patch on resume; invariant (`pauseOrStoppedAt === null` iff status !== paused) holds.
11. ✅ **949 regression tests** pass after the change.
12. ✅ **Component count** stays under 40 in `buildChallengeScreen` with 5-button action row + all other sections.

---

## 8. Original Context (User Prompt, verbatim)

> So currently the actions feature has a design flaw whereby hosts cannot prepare player Challenge Actions ahead of time, due to the requirement to maintain secrecy around upcoming challenges. Knowledge of a challenge in advance is a huge advantage and never done. So we need a way to manage challenge state.

(Full original prompt — including the round-state framing that was subsequently superseded — preserved in [git history of this file](../../).)

The design pivot conversation that produced the current shipped implementation began with: *"You're right about the round state, this isn't really to do with that other than the fact we still have no good ability to track 'which round' it is. But I feel it needs more broader thought before we implement anything."* — leading to the challenge-centric three-state model above.
