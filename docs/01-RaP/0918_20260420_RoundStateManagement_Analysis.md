# Round State Management — Hide Prepared Challenge Actions Until Hosts Say Go

> **RaP #0918** | 2026-04-20
> **Status**: Specification — ready for design review
> **Related**: [Challenges RaP 0945](0945_20260316_Challenges_Analysis.md), [Challenge Actions RaP 0943](0943_20260316_ChallengeActions_Analysis.md), [Season Planner RaP 0947](0947_20260315_SeasonPlanner_Analysis.md), [SnowflakeTimer RaP 0925](0925_20260403_SnowflakeTimer_Analysis.md)
> **Depends on**: Challenges MVP (built), Challenge Actions Phase 1C (built), Season Planner (built)

---

## 1. Problem Statement

**Hosts can't prep challenge actions ahead of time.** The moment a Challenge Action is created and linked to a Challenge, it appears in the player's `/menu → 🏃 Challenges` select. In a Survivor-style ORG, advance knowledge of an upcoming challenge is a game-breaking advantage — prep and live visibility are coupled when they should be decoupled.

**Concrete pain**: for a 12-player "Spreadsheet Art" individual challenge, the host needs ~30 minutes to craft per-player actions with unique Google Sheet links. Today, that prep has to happen during the 60-second window before the challenge goes live, or players will snoop their menus and see the challenge name in advance.

CastBot also has **no generic concept of "what round is the game at"** — something multiple future features will want (leaderboards, placements, challenge scheduling, post-game analytics). Fixing the prep-secrecy problem is the catalyst for introducing global round state.

---

## 2. Design Goals

1. **Decouple prep from live visibility** — actions created in advance stay hidden from players until the host flips the round state to `active`.
2. **Global, reusable round state** — not a challenge-only hack. Any feature that needs to know "which round is active" can query a central API.
3. **Defence in depth** — hiding UI is not enough. Action execution re-checks state at invocation time.
4. **Reuse the existing Safari start/pause/resume visual pattern** — hosts already know it. Don't invent a new UI vocabulary.
5. **Graceful mid-flight handling** — if a host pauses while a player is mid-chain, fail cleanly with a clear message, not silently continue.

---

## 3. Data Model

### 3.1 Round state lives on the round

A round in Season Planner gets a `status` field. The **season guarantees at most one `active` round at a time** (enforced by state transition logic).

```javascript
// playerData[guildId].seasonRounds[seasonId][roundId]
{
  fNumber, seasonRoundNo, startDate, endDate, challengeIDs, ...,

  status: "notStarted" | "active" | "paused" | "completed",   // NEW
  startedAt: 1773520842818,                                   // NEW (epoch ms, set on notStarted→active)
  pausedAt: null,                                             // NEW (non-null while paused)
  completedAt: null,                                          // NEW (set on →completed)
  pauseHistory: [                                             // NEW (audit trail for timer math)
    { pausedAt: 1773520900000, resumedAt: 1773521100000, durationMs: 200000 }
  ]
}
```

**Default status**: `notStarted` — a round that has never been explicitly started is hidden from players, regardless of `startDate`. Auto-advance on `startDate` is explicitly NOT done in MVP (too many edge cases — server clock drift, hosts running late, etc.). Hosts click the button.

### 3.2 Season pointer for O(1) active-round lookup

```javascript
// playerData[guildId].applicationConfigs[configId]
{
  seasonId, seasonName, currentSeasonRoundID,  // existing (1-indexed seasonRoundNo)
  activeRoundId: "round_xyz" | null,            // NEW — denormalized pointer
}
```

This avoids scanning all rounds to answer "is any round active?". Invariant: `activeRoundId` is null OR points to a round with `status === 'active'`.

### 3.3 Challenge fallback state (standalone challenges)

Some guilds use Challenges without Season Planner. For those, state lives directly on the challenge:

```javascript
// playerData[guildId].challenges[challengeId]
{
  title, description, ..., actions, ...,
  status: "draft" | "active" | "paused" | "completed"   // NEW (defaults to "draft")
}
```

### 3.4 Effective visibility rule (single source of truth)

```javascript
// src/rounds/roundState.js
function getEffectiveChallengeStatus(challenge, guildId) {
  const playerData = await loadPlayerData();
  const rounds = playerData[guildId]?.seasonRounds || {};

  // Scan all rounds across all seasons for one linking to this challenge
  for (const seasonRounds of Object.values(rounds)) {
    for (const round of Object.values(seasonRounds)) {
      if (round.challengeIDs?.primary === challenge.id) {
        // Any linked active round → visible. Multiple links: permissive (any active wins).
        if (round.status === 'active') return 'active';
      }
    }
  }

  // No active round link — fall back to challenge's own status
  return challenge.status || 'draft';
}

function isChallengePlayable(challenge, guildId) {
  return getEffectiveChallengeStatus(challenge, guildId) === 'active';
}
```

---

## 4. The Reusable Primitive: `roundState.js`

Create `src/rounds/roundState.js` as the **single module** every other feature consults. This is the "don't reinvent" requirement.

### 4.1 Public API

```javascript
// Pure reads
getActiveRound(guildId, seasonId?) → { seasonId, roundId, round } | null
getRoundStatus(guildId, seasonId, roundId) → 'notStarted' | 'active' | 'paused' | 'completed'
isAnyRoundActive(guildId) → boolean
isChallengePlayable(challenge, guildId) → boolean

// State transitions (all async, all atomic-save, all log)
startRound(guildId, seasonId, roundId, userId) → { success, error? }
pauseRound(guildId, seasonId, roundId, userId, reason?) → { success, error? }
resumeRound(guildId, seasonId, roundId, userId) → { success, error? }
completeRound(guildId, seasonId, roundId, userId) → { success, error? }

// Validation
canTransition(currentStatus, targetStatus) → boolean
```

### 4.2 State machine

```
  notStarted ──start──▶ active ──pause──▶ paused ──resume──▶ active
                          │                  │
                          └──complete───────complete──▶ completed
                                                            │
                                                            └──[terminal]
```

- `notStarted → active`: only transition that allows a round to "go live". Enforces invariant (fails if another round is already active in same season — returns `{ success: false, error: "F18 is still active. Complete it first?" }`).
- `active → paused`: temporary halt. `pausedAt` set.
- `paused → active`: resume. Push entry to `pauseHistory`, clear `pausedAt`.
- `active → completed` OR `paused → completed`: permanent. Auto-clears `applicationConfigs[configId].activeRoundId`.
- No transition out of `completed` (terminal). Rollback would require explicit host override — out of scope for MVP.

### 4.3 Where other features plug in

| Feature | Hook | Behavior |
|---|---|---|
| **Challenge Action Player Menu** | `isChallengePlayable()` filter in `buildSuperSelect('challenges')` | Hide challenges whose effective status ≠ active |
| **Dynamic `challenge_*` handler** (`app.js:5111`) | Add round-state check alongside `verifyChallengeActionAccess` | Reject execution with ephemeral "⏸️ Round paused" |
| **`executeButtonActions`** | Entry-point re-check | Belt-and-braces in case the dynamic gate is bypassed |
| **Post to Channel** | Pre-flight check | Prompt host to start round if not active |
| **Season Planner round card** | Status badge + transition buttons | Primary host-facing control surface |
| **Future: Leaderboards** | `getActiveRound()` | Scope stats to current round |
| **Future: Placements** | `completeRound()` trigger | Freeze F-number placements on completion |

---

## 5. UI Design

### 5.1 Primary control surface: Season Planner round card

When a host opens a round in Season Planner, the detail view gets a new **Round Status** section with 3 contextual buttons:

```
## F17 — Spreadsheet Art
-# Runs: 2026-04-22 → 2026-04-24

### 🎯 Round Status
⚫ Not Started

[▶️ Start Round]

─────────────────
[... existing round actions ...]
```

State-dependent button row:

| Current state | Visible buttons | Emoji · Style |
|---|---|---|
| `notStarted` | Start Round | ▶️ · Success (green) |
| `active` | Pause Round · End Round | ⏸️ Secondary · ⏹️ Danger |
| `paused` | Resume Round · End Round | ▶️ Success · ⏹️ Danger |
| `completed` | _none_ (terminal) | — |

Status indicator text uses emoji: ⚫ Not Started · 🟢 Active · 🟡 Paused · ⚪ Completed.

### 5.2 Secondary: Challenge detail screen (for standalone challenges)

For challenges with no round link, mirror the same 3-button control using `challenge.status`. If the challenge *does* have a round link, show read-only inherited state with a link-out: `🔗 Status controlled by F17 — Open Season Planner →`.

### 5.3 Tertiary: Production Menu "Current Round" widget

Small section at the top of the production menu showing the active round at a glance, with a one-click link to manage it:

```
### 📍 Current Round
🟢 F17 · Spreadsheet Art (started 2h ago)    [⚙️ Manage →]
```

Hidden entirely when no round is active — no clutter for non-active seasons.

### 5.4 Post to Channel gate

Clicking **# Post to Channel** on a challenge whose effective status ≠ `active` opens a modal:

```
⚠️ Round Not Started

F17 "Spreadsheet Art" hasn't started yet. Posting now will
make the challenge visible before it should be.

[▶️ Start Round & Post]  [📝 Post Anyway (Draft)]  [Cancel]
```

"Post Anyway" exists for hosts who intentionally want to post a teaser — but it's the non-primary option.

---

## 6. Player-Facing Behavior

### 6.1 Menu filtering

`playerManagement.js:631` (the `case 'challenges'` branch of `buildSuperSelect`) gains a pre-filter:

```javascript
const visibleChallenges = Object.entries(challenges).filter(
  ([id, ch]) => isChallengePlayable({ ...ch, id }, guildId)
);
```

Actions tied to challenges in `notStarted`/`paused`/`completed`/`draft` state **don't render at all**. The select shows whatever *is* playable, or "No active challenges" if nothing is.

### 6.2 Execution gate (defence in depth)

Three layers:

1. **UI hide** — player menu doesn't render the option (primary).
2. **Dynamic handler gate** (`app.js:5111-5128`) — when a `challenge_*` custom_id arrives, check round state *and* access in the same block. Reject with ephemeral `⏸️ Round paused — check back when the host resumes.` or `⏸️ Round hasn't started yet.` depending on state.
3. **`executeButtonActions` entry check** — same check at the innermost layer, catching any path the dynamic gate missed (e.g. follow-up actions triggered by another action).

Layer 2 covers the "player already has the control visible" race — they click, server re-validates, polite rejection.

### 6.3 Mid-flight pause handling

**Action outcomes currently run as a synchronous chain** in `executeButtonActions`. For MVP:

- **Check at start**: if state ≠ active when execution begins → abort cleanly with rejection message. No side effects applied.
- **No mid-chain re-checks** in MVP (simpler; outcomes complete in <1 second typically).
- **For `follow-up` outcomes** (which re-enter `executeButtonActions` via a new action): each recursive call re-checks state. If paused between chain steps, subsequent steps abort with `⏸️ Round paused — some follow-up actions were skipped.`

**Explicit non-goals for MVP**:
- No transactional rollback of partially applied outcomes (give_currency already applied stays applied).
- No "queue for resume" — if aborted, the player just re-clicks after resume.

Phase 2 could add transactional execution if the pause-mid-chain race proves painful in practice.

### 6.4 Host actions exempt

`host` category actions stay visible and executable regardless of round state — hosts need controls to transition the round itself. This is handled by the existing `verifyChallengeActionAccess` permission tier; round-state check only runs for non-host categories.

---

## 7. Snowflake Timer Interaction

Timed challenges (`metadata.challengeTimer: 'timed'`) record start/end snowflakes from Discord interaction IDs. A mid-challenge pause distorts recorded times (wall-clock keeps running through the pause).

**MVP decision**: Document the caveat. Timed challenges should not be paused during live play — if they are, results show elapsed wall-clock including pause duration. Hosts can manually subtract pause windows from `pauseHistory` if precise timing matters.

**Phase 2**: Surface `pauseHistory` in the results UI so hosts can see adjusted times. Full "timer-aware pause" (which subtracts pause duration automatically) is deferred.

---

## 8. Implementation Phases

### Phase 1 — Core State Management (MVP)

1. Create `src/rounds/roundState.js` with read helpers + 4 transition methods + state-machine validation.
2. Add `status`/`startedAt`/`pausedAt`/`completedAt`/`pauseHistory` fields to `seasonRounds[seasonId][roundId]`.
3. Add `status` field to `challenges[challengeId]` (default `'draft'`).
4. Add `activeRoundId` pointer to `applicationConfigs[configId]`.
5. Lazy-init defaults for existing data (any round without `status` is treated as `notStarted` on read; any challenge without `status` is `'draft'`).
6. Wire `isChallengePlayable()` into `playerManagement.js:631` filter.
7. Wire round-state gate into `app.js:5111-5128` dynamic handler and `executeButtonActions` entry.
8. Tests: state machine transitions, invariants, effective-status resolution with various link configurations.

### Phase 2 — Host UI

1. Round Status section + 3-button control on Season Planner round card.
2. Mirror control on Challenge detail screen for standalone challenges.
3. "Current Round" widget on Production Menu (hidden when no active round).
4. Post to Channel pre-flight modal.
5. Register all new buttons in `BUTTON_REGISTRY`.

### Phase 3 — Integration & Polish

1. State-change audit logging to analytics channel.
2. Transition confirmation modals for destructive transitions (complete / reset).
3. Handle edge cases: challenge deleted while round active, round deleted while active, season deleted while active round.
4. Surface `pauseHistory` in post-game summary views.

### Phase 4 — Deferred / Future

1. Auto-start/auto-complete on schedule (requires distributed scheduler reliability work).
2. Transactional execution for mid-chain pause safety.
3. Timer-aware pause (automatic pause-duration subtraction from snowflake timing).
4. Per-round placements integration (ties into Season Planner Phase 5).

---

## 9. Open Questions

1. **Auto-advance?** Should `completeRound()` automatically set the next round to `notStarted` and offer a one-click "Start F16 now"? Recommendation: offer, don't auto-do.
2. **Multi-round overlap?** Current invariant: at most one active round per *season*. Should it be at most one per *guild*? A guild could theoretically run two seasons in parallel. Recommendation: per-season invariant (allows parallel seasons), per-guild warning in UI if 2+ are active.
3. **Pause visibility to players?** When a host pauses, do players see a message like "⏸️ The host has paused the round" in their menu, or does the menu just go empty? Recommendation: show the pause message — empty menu is confusing, transparency is better.
4. **Completed challenge archive?** Should completed-round challenge actions remain clickable in any context (e.g. post-game review)? Recommendation: no — treat completed same as paused from player side. Hosts can still view via the admin UI.
5. **Standalone challenge status toggle UX?** If no round link, does the host see the 3-button row immediately on the challenge detail, or a smaller `[🟢 Activate]` toggle? Recommendation: start with full 3-button row for consistency.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Existing challenges become invisible after migration (default `draft`) | High | Migration script sets all currently-posted challenges to `active` on deploy; prompt hosts to review |
| Hosts forget to start rounds → players confused why `/menu` is empty | Medium | "No active challenges" empty state with `-# Ask your host if the round has started` |
| Race: player clicks just as host pauses → partial outcome applied | Low | Defence-in-depth execution gate; accept partial-apply for MVP |
| Pause during chained follow-ups leaves player in weird state | Medium | Phase 1: clear error message + hosts can re-grant. Phase 4: transactional execution |
| `pauseHistory` array grows unbounded on frequently-paused rounds | Low | Cap at 100 entries; oldest dropped (unlikely to hit this) |
| Tycoons (legacy safari_rounds_menu) doesn't integrate with new round state | Low | Out of scope. Tycoons has its own `currentRound` on safariConfig; left alone. Document the non-interop |

---

## 11. Recommendation

**Build Phase 1 + Phase 2 together** (~1–2 days of work) and ship as a single release. The state layer without the UI is useless; the UI without the state layer is a lie. Skip Phase 3 polish until hosts have used it for a real season and report what actually hurts.

**Do reuse the start/pause/resume visual pattern**, but don't pretend it already exists as a reusable component — there's no shared module today. Build the 3-button row *inside* Season Planner for this work, and extract it into a shared helper only if/when a third consumer appears (YAGNI).

**Default standalone challenges to `draft`**, not `active`. Breaking change for the 2-3 guilds using standalone challenges, but worth it — the secrecy property should be the default. One-line migration sets existing posted challenges to `active` to avoid surprise.

---

## 12. Original Context (User Prompt, verbatim)

> So currently the actions feature has a design flaw whereby hosts cannot prepare player Challenge Actions ahead of time, due to the requirement to maintain secrecy around upcoming challenges. Knowledge of a challenge in advance is a huge advantage and never done. So we need a way to manage challenge state.
>
> See below for AI notes, create a RaP, tldr me the proposed design and flag any considerations and your recommendation ultrathink
> Challenge Feature / Round State Management Requirements
> High-level objective
>
> The challenges feature has the concept of rounds.
>
> Rounds themselves are which round is active in the Survivor game.
>
> What is needed is effectively to add state management to say:
>
> has the round started
> which round is active at the moment
> which round has not commenced
>
> The reason for that is so hosts can smartly change, hide, and remove different challenge actions that are relevant to the current round of the game.
>
> Core requirement: round state management
> Need to track, at minimum
> which round is active
> whether that round has started
> whether a round has not yet commenced
> potentially whether a round is paused / stopped / inactive
> Why
>
> So that the challenge system can respond to the current round state and:
>
> show relevant actions
> hide irrelevant actions
> remove actions that should no longer be available
> prevent players from invoking actions when the round state says they should not be available
> User interface requirement: where hosts manage round state
>
> One of the main things to work out is:
>
> at what stage / where in the user interface do hosts mark or notify that there is a different round active, or that a different round has started
>
> Current thinking
>
> Probably a button or a couple of buttons, because:
>
> string selects are already used quite a bit in this user interface
> more string selects might get confusing
> Reuse idea
>
> Potentially leverage the already built Safari pause / start / play function as a reusable component so that it dictates whether a round has started or not.
>
> So the likely direction is:
>
> reuse or adapt the Safari pause/start/play style component
> use it for challenge round state management
> avoid introducing yet another new UI pattern if the existing one already solves most of the problem
> Posting flow requirement
> Post to channel button behavior
>
> From a user experience perspective, the Post to Channel button should probably be changed so that:
>
> if the round has not been started, it prompts the user to start the round
>
> In other words:
>
> host clicks Post to Channel
> system checks whether the relevant round has started
> if not started, prompt the user to start the round
>
> This is mainly to avoid a host posting challenge content for a round that has not actually commenced yet.
>
> Global / reusable round tracking requirement
>
> This should not just be tied to challenges.
>
> You said:
>
> we probably need the global ability to track what round it is, so this shouldn't just be a thing that is tied to challenges
>
> Reason
>
> At the moment, the bot does not currently ever know what round the game is at.
>
> That has reusability considerations.
>
> Required design consideration
>
> Need to think about whether there should be:
>
> a generic round management method
> a generic round management component
> a generic round management data store
>
> The goal is to avoid creating:
>
> a new way to manage rounds every time
> feature-specific round logic for every new feature that needs to know what round is active
> Reusability goal
>
> Have one reusable mechanism so future features can leverage:
>
> what round is active
> whether a round has started
> whether it is paused / stopped / not commenced
>
> without having to reinvent round state management every time.
>
> Challenge actions integration requirement
>
> The challenge actions feature already has types of actions.
>
> Need to think about / consider the implications of pause round / start round / stop round from the perspective of the different action types.
>
> Main action types called out
> individual player action type
> makes actions available to all players
> all players action
> potentially any other existing action types as relevant
> Main concern
>
> The main one you care about / are worried about is the individual player action type.
>
> Requirement: what should happen to action controls when a round is paused
> Base behavior
>
> If a round is paused:
>
> action controls should probably disappear from the player's menu
> players should not be able to invoke them
> that should apply across the relevant action types
>
> You said:
>
> probably for all of them, they just disappear from the player's menu and they can't actually invoke them until the host unpauses
>
> So that is the default behavior requirement as currently described.
>
> Requirement: redundancy / defensive checks
>
> There needs to be some level of redundancy in the implementation.
>
> Why
>
> A player may already have:
>
> a UI control exposed
> a menu already rendered
> a button already visible
> an action flow already in progress
>
> If a host pauses the game / pauses the round after that, the player may still be able to click the already-exposed control.
>
> So the requirement is not just:
>
> hide controls from future renders
>
> It is also:
>
> defensively re-check state when actions are invoked
> Requirement: paused-state handling during execution
>
> This is one of the nuanced / complex considerations you called out.
>
> Problem
>
> If:
>
> a player is mid action
> or a player is executing a series of chained actions
> and the host pauses the round / game in the middle of that
>
> then the system needs to decide what happens to the player's input and action execution.
>
> Requirement
>
> Need to explicitly think through and define:
>
> how the bot handles a player who is mid action when the round is paused
> how the bot handles a player executing chained actions when the round is paused
> whether execution:
> stops immediately
> finishes the current sub-step
> fails gracefully
> tells the player the round has been paused
> blocks all future sub-actions until unpaused
> Minimum implication
>
> At a minimum, the system should not blindly continue processing if the round is now paused.
>
> There likely needs to be:
>
> a state check before execution
> and potentially repeated state checks between steps in chained actions
> Functional requirements list
> 1. Add round state management
>
> Need a way to track:
>
> current round
> whether round has started
> whether round has not commenced
> potentially paused / stopped state
> 2. Hosts need UI controls to manage round state
>
> Likely via:
>
> one button or a couple of buttons
> ideally reusing Safari pause/start/play style controls
> 3. Challenge actions need to respond to round state
>
> Challenge actions should be able to:
>
> show
> hide
> be removed
> based on the current round state
> 4. Post to Channel should check round state
>
> If round has not started:
>
> prompt host to start the round
> 5. Global round tracking should exist outside of challenges
>
> Need a reusable/global way to know:
>
> what round the game is at
> whether it has started
> whether it is paused/stopped/not commenced
> 6. Avoid feature-by-feature round logic duplication
>
> Should consider:
>
> generic round management method
> generic component
> generic data store
> 7. Pause should make challenge actions unavailable to players
>
> Especially for:
>
> individual player actions
> all players actions
> and likely other relevant action types
> 8. Hiding controls is not enough
>
> Need redundancy so that:
>
> even if a player still has an already-rendered control
> action execution still checks whether the round is paused before allowing it
> 9. Need defined behavior for mid-action pause
>
> Need to determine what happens if pause occurs:
>
> in the middle of an action
> in the middle of chained actions
> while player input is already underway
> Open design / implementation questions you explicitly raised
>
> These are not resolved requirements so much as things that need to be worked out.
>
> A. Where exactly in the UI do hosts set / change round state?
>
> You raised this directly.
>
> Need to determine:
>
> where the control lives
> whether it sits in challenge UI
> whether it belongs in a broader game / round management UI
> B. Should this reuse the Safari pause/start/play component?
>
> Current leaning:
>
> yes, probably reuse it
> because it already exists
> and avoids introducing another confusing UI pattern
> C. Should round management be challenge-specific or global?
>
> Your view:
>
> should be global / reusable
> not only challenge-specific
> D. What happens to actions when paused?
>
> Current leaning:
>
> they disappear from player menu
> cannot be invoked until unpaused
> E. What happens if the player already has the controls visible?
>
> Need extra redundancy / permission/state checks
>
> F. What happens if the player is mid-action or mid-chain when paused?
>
> Needs explicit design and implementation treatment
>
> Design principles implied by your wording
>
> Again, keeping close to your language and not over-interpreting:
>
> do not overcomplicate the UI further with more string selects if avoidable
> reuse existing components where possible
> avoid building a challenge-only solution if the same concept will clearly be needed elsewhere
> do not rely purely on UI visibility for enforcement
> round state needs to affect both:
> what players see
> and what the backend actually allows
> Condensed version for coding AI
> Requirement summary
>
> Implement round state management for challenges, with reusable/global round tracking rather than challenge-only tracking.
>
> Need to track:
>
> which round is active
> whether round has started
> whether round has not commenced
> likely paused/stopped state as well
>
> This is required so hosts can smartly show/hide/remove challenge actions based on the current round of the game.
>
> UI should likely use buttons (not more string selects), and ideally reuse the existing Safari pause/start/play style component.
>
> Post to Channel should prompt the host to start the round if it has not been started yet.
>
> Round tracking should be a reusable/global system, not something tied only to challenges, because the bot currently does not have a generic concept of "what round the game is at," and that will be reusable across other features.
>
> Need to consider action type implications, especially:
>
> individual player actions
> all players actions
>
> If a round is paused, relevant action controls should disappear from player menus and players should not be able to invoke them until unpaused.
>
> Need redundancy / backend checks because players may still have already-rendered UI controls visible when the host pauses the round.
>
> Need to explicitly design handling for:
>
> players mid-action
> players mid chained-actions
> host pausing in the middle of execution
>
> So backend execution should not rely purely on UI hiding; it should re-check round state during action execution as needed.
