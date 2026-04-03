# Challenge ↔ Action Integration — Playable Challenges

> **RaP #0943** | 2026-03-16 (original), 2026-04-04 (Phase 1B update)
> **Status**: Phase 1 ✅ BUILT — Phase 1B SPECIFICATION
> **Related**: [Challenges RaP 0945](0945_20260316_Challenges_Analysis.md), [Challenge Library RaP 0944](0944_20260316_ChallengeLibrary_Analysis.md), [Action Terminology](0956_20260308_ActionTerminology_Analysis.md), [SafariCustomActions](../03-features/SafariCustomActions.md), [PlayerCommands](../03-features/PlayerCommands.md), [SnowflakeTimer RaP 0925](0925_20260403_SnowflakeTimer_Analysis.md), [Quick Create Actions](../03-features/QuickCreateActions.md)

---

## 1. Vision

Transform challenges from **content cards** (title + description + image) into **playable experiences** by linking Custom Actions to challenges. Players interact with challenges through buttons and text commands, and the Actions Engine handles all the game logic.

Pipeline: **Season Planner** (scheduling) → **Challenges** (content) → **Actions** (gameplay)

---

## 2. Phase 1 — Basic Linking (BUILT ✅)

<details>
<summary>Expand — Phase 1 is complete, kept for reference only</summary>

**What was built:**
- `actionIds: []` array on challenge entities
- ⚡ Actions button on challenge detail screen (conditionally styled blue/gray)
- Action selector with toggle link/unlink, search, back navigation
- Linked action count display on challenge detail
- "Post to Channel" includes linked action buttons with `challenge_` prefix
- Dynamic button execution via `executeButtonActions()` engine
- Emoji bug fix (2026-04-03): `resolveEmoji()` for action selector options + posted action buttons

**Data model (unchanged):**
```javascript
// playerData[guildId].challenges[challengeId]:
{
  actionIds: ["action_abc", "action_def"]  // flat array, many-to-many
}
```

**Key insight:** Outcomes are stateless and self-contained. The execution engine doesn't care whether an action was triggered from a challenge, map cell, or standalone button. No new outcome types or engine changes were needed — linking was purely data association + UI.

**Design decisions:**
- Button prefix: `challenge_{guildId}_{actionId}_{timestamp}` (not `safari_`)
- Modal triggers: `modal_launcher_{guildId}_{actionId}_{timestamp}` (already universal)
- No back-pointer from actions to challenges (challenge owns the forward reference)

</details>

---

## 3. The Problem Phase 1B Solves

Phase 1 treats all linked actions identically — a flat `actionIds[]` list. But in practice, hosts need **categorically different types** of challenge actions depending on the challenge design. The way hosts define them, and the way players use them, differs wildly:

| Challenge Type | What the Host Needs | Example |
|---|---|---|
| Simple text post | No actions at all | Scavenger hunt — list of 20 items, go take photos, 24 hours |
| Same action for all players | 1 action, all players share it | Jigsaw puzzle — same link for everyone, but can't leak early |
| Individual action per player | N actions, 1 per player | Spreadsheet Art — unique Google Sheets link per player |
| Per-tribe action | N actions, 1 per tribe | Verbal Jigsaw — each tribe gets separate attack action |
| Host automation action | Actions only hosts trigger | Random clue drop — host clicks, text posts at chosen time |

The flat `actionIds[]` can't express these distinctions. We need typed action categories on challenges.

### Carlbot Equivalence (Context for Labels)

These categories directly replace the Carlbot `?tag` system that ORGs currently rely on:

| CastBot Category | Carlbot Equivalent | Example Tag |
|---|---|---|
| Player Action — All | `?f15-jigsaw` | All players type the same command |
| Individual Player Action | `?fic-reece` | Per-player tag with unique content |
| Tribe Challenge Action | `?verbaljigsaw-balboa` | Per-tribe tag with unique content |
| Host Challenge Action | *(no direct equivalent)* | Manual host coordination |

---

## 4. Phase 1B — Action Categories

### 4.1 The Five Categories

#### ⚡ Player Action — All
> Use when all players need to use the same command, e.g., show the same jigsaw link in their subs

- **1 Action** linked to the challenge, available to all players
- Typically used in: Player submission channels (subs)
- Requires some level of **secrecy** — the action content can't be in the challenge display_text because players could cheat beforehand
- When posted, all players see the same button
- Example: Hosts prepare an online jigsaw puzzle. Challenge text says "go to your sub and click the button when you're ready." Button gives everyone the same jigsaw link. Combined with [Snowflake Timer (RaP 0925)](0925_20260403_SnowflakeTimer_Analysis.md) to capture start time.
- Carlbot equivalent: `?f15-jigsaw`

#### ⚡ Individual Player Action
> Use when you have individual commands for each player and you don't want players to see each other's commands

- **N Actions** (1 per player), each assigned to a specific player
- Typically used in: Player submission channels (subs)
- Each player gets a **unique** action with different content (e.g., unique link, unique instructions)
- Example: "Spreadsheet Art" — each player gets a private Google Sheets link. Reece's action shows his sheet, Sarah's shows hers.
- Carlbot equivalent: `?fic-reece`, `?fic-sarah`, `?fic-tom`

#### ⚡ Tribe Challenge Action
> Use when you have individual commands for each tribe and you don't want tribes to see each other's commands

- **N Actions** (1 per tribe), each assigned to a tribe/role
- Typically used in: Tribe challenge channels
- Each tribe gets a **unique** action scoped to their team
- Example: Verbal Jigsaw — each tribe gets a separate attack action with tribe-specific targets
- Carlbot equivalent: `?verbaljigsaw-balboa`, `?verbaljigsaw-drake`

#### ⚡ Host Challenge Action
> Use to automate some aspect of the challenge beyond what's needed in the challenge text

- **N Actions** for host use only, not player-facing
- Used in: Challenge channel, production tools
- Example: A challenge where hosts at a random time of their choosing post a `display_text` in a channel, and first tribe to respond gets points. The host needs a button to trigger this at the right moment.
- *(No direct Carlbot equivalent — this replaces manual host coordination)*

#### No Action (Existing — No Changes)
> Simple challenge post — just text, image, and instructions

- Uses the existing "Post to Channel" flow with no linked actions
- Example: Scavenger Hunt — display_text lists 20 real-world items, players have 24 hours to photograph them. No interactivity needed.

---

### 4.2 Data Model

Phase 1's flat `actionIds[]` can't express categories or assignments. **Option B (Categorized Object)** chosen for cleaner UI rendering and O(1) lookups:

```javascript
// playerData[guildId].challenges[challengeId]:
{
  // ...existing fields (title, description, image, accentColor, etc.)...
  actionIds: ["legacy_id"],  // Phase 1 legacy — lazy-migrated to playerAll

  actions: {
    playerAll: ["jigsaw_abc"],
    playerIndividual: {
      "391415444084490240": "sheet_reece",     // userId → actionId
      "123456789012345678": "sheet_sarah"
    },
    tribe: {
      "987654321098765432": "attack_balboa",   // roleId → actionId
      "876543210987654321": "attack_drake"
    },
    host: ["host_clue", "host_reveal"]
  }
}
```

**Lazy migration:** If `challenge.actions` doesn't exist, read from `actionIds[]` as `playerAll`. First write converts. No bulk migration needed.

---

### 4.3 Quick Create — Challenge Action Creation Flow

Follows the **Quick Create pattern** from `quickActionCreate.js` (Quick Item / Quick Currency), adapted for challenge actions instead of map coordinate actions.

#### How It Works

1. Host is on the **challenge detail screen** (entry: `challenge_select` → challenge ID)
2. Host clicks **⚡ Actions** button → opens Challenge Action Manager
3. Host clicks **➕ Create New** in any category → **Quick Create modal** opens

#### Quick Create Modal Design

A single modal that creates a shell action and links it to the challenge in one step. The modal adapts based on the selected category:

```
┌──────────────────────────────────────┐
│     Quick Challenge Action           │
├──────────────────────────────────────┤
│ Action Type                          │
│ [▼ String Select                  ]  │
│   ⚡ Player Action — All             │
│   👤 Individual Player Action        │
│   🏰 Tribe Challenge Action          │
│   🔧 Host Challenge Action           │
│                                      │
│ Action Name                          │
│ [                                 ]  │
│ -# e.g., "Start Jigsaw Puzzle"      │
│                                      │
│ Display Text                         │
│ [                                 ]  │
│ -# What the player sees when they    │
│ -# click. Markdown supported.        │
│                                      │
│ Button Emoji (Optional)              │
│ [                                 ]  │
│ -# e.g., 🧩                         │
│                                      │
│ Assign To (if Individual/Tribe)      │
│ [User Select / Role Select        ]  │
│ -# Multi-select for bulk creation    │
└──────────────────────────────────────┘
```

**Modal fields per category:**

| Field | Player All | Individual | Tribe | Host |
|---|---|---|---|---|
| Action Type | String Select (pre-selected) | String Select | String Select | String Select |
| Action Name | ✅ Text Input | ✅ Text Input | ✅ Text Input | ✅ Text Input |
| Display Text | ✅ Text Input (paragraph) | ✅ Text Input (paragraph) | ✅ Text Input (paragraph) | ✅ Text Input (paragraph) |
| Button Emoji | ✅ Text Input (optional) | ✅ Text Input (optional) | ✅ Text Input (optional) | ✅ Text Input (optional) |
| Assign To | *(not shown)* | User Select (multi) | Role Select (multi) | *(not shown)* |

**⚠️ Modal 5-component limit:** Discord modals allow 5 top-level components (Label wrappers). The above fits exactly: Type Select + Name + Display Text + Emoji + Assign To. For Player All and Host (no assignment), we have a spare slot — could add Button Color select.

#### Bulk Creation for Individual Player Actions

The **User Select** in the modal supports multi-select (`max_values: 25`). When a host selects 12 players:

1. Modal submits with `values: ["userId1", "userId2", ..., "userId12"]`
2. Handler creates **12 shell actions** — each with:
   - `name`: `"{actionName} ({displayName})"` — e.g., "Spreadsheet Art (Reece)"
   - `actions[0]`: `{ type: 'display_text', config: { text: displayTextFromModal } }`
   - `metadata.createdVia`: `'quick_challenge_individual'`
   - `metadata.challengeId`: the parent challenge ID
3. Each action is linked to its player in `challenge.actions.playerIndividual[userId] = actionId`
4. Host is returned to the Individual Player Actions section showing all 12 assigned

**The display_text is initially the same for all** — the host then edits each one individually (via the action editor) to paste the unique link per player. This is the minimum viable flow. Future: bulk-edit UI or CSV paste.

**Same pattern for Tribe Actions** with Role Select instead of User Select. Seasons rarely have more than 4-6 tribes, so this is always manageable.

#### Under the Hood — Reuse from Quick Create

| Quick Challenge Action needs | Existing function | Module |
|---|---|---|
| Create action shell | `createCustomButton()` | safariManager.js |
| Save action data | `loadSafariContent()` / `saveSafariContent()` | safariManager.js |
| Validate emoji | `createSafeEmoji()` | safariButtonHelper.js |
| Action Editor UI (for editing after creation) | `createCustomActionEditorUI()` | customActionUI.js |
| Resolve display names | `guild.members.fetch()` | Discord.js |

**New module:** `challengeActionCreate.js` — follows the composition pattern of `quickActionCreate.js`. Builds modals, handles submissions, creates actions, links to challenge. All logic in module, app.js is pure routing.

```
challengeActionCreate.js (~300-400 lines)
├── buildQuickChallengeActionModal(challengeId, categoryType?)
│   └── Modal with Type select, Name, Display Text, Emoji, Assignment
├── handleQuickChallengeActionSubmit(guildId, userId, challengeId, modalComponents)
│   ├── Reads category type from select
│   ├── Creates 1 action (player_all, host) or N actions (individual, tribe)
│   ├── Links to challenge.actions[category]
│   └── Returns updated Challenge Action Manager UI
├── unlinkChallengeAction(guildId, challengeId, actionId, category)
│   └── Removes from challenge.actions[category], keeps action alive
├── deleteChallengeAction(guildId, challengeId, actionId, category)
│   └── Removes from challenge.actions[category] AND deletes action entity
└── getChallengeActionSummary(guildId, challengeId)
    └── Returns counts and status per category for UI rendering
```

---

### 4.4 UI — Challenge Action Manager

#### Entry Point

From the challenge detail screen, the existing **⚡ Actions** button opens the action manager. Instead of the current flat selector, it shows categorized sections:

```
┌─────────────────────────────────────────────────────┐
│ ## ⚡ Challenge Actions                              │
│ -# Manage actions linked to Spreadsheet Art          │
│                                                      │
│ ### ```⚡ Player Action — All```                     │
│ -# Same command for all players (e.g., jigsaw link)  │
│ [▼ Select action or create new...               ]    │
│                                                      │
│ ─────────────────────────────────────────            │
│                                                      │
│ ### ```⚡ Individual Player Actions```               │
│ -# Unique command per player (e.g., private sheet)   │
│ [▼ 3 of 12 players assigned — manage...         ]    │
│                                                      │
│ ─────────────────────────────────────────            │
│                                                      │
│ ### ```⚡ Tribe Actions```                           │
│ -# Unique command per tribe (e.g., tribe attack)     │
│ [▼ 2 tribes assigned — manage...                ]    │
│                                                      │
│ ─────────────────────────────────────────            │
│                                                      │
│ ### ```⚡ Host Actions```                            │
│ -# Automation for hosts beyond challenge text        │
│ [▼ Select action or create new...               ]    │
│                                                      │
│ [← Back to Challenge]                                │
└─────────────────────────────────────────────────────┘
```

**Component budget:** 4 sections × (heading + description + select + separator) = ~20 + container + nav ≈ 22-25/40. Collapse empty categories to save budget.

#### CRUD Controls

| Operation | UI Pattern |
|---|---|
| **Create** | ➕ option in select → Quick Create modal (see 4.3) |
| **Read** | Select shows linked actions with status indicators |
| **Update** | Select linked action → ✏️ Edit → opens Action Editor |
| **Delete** | Select linked action → 🗑️ Delete (deletes the action entity) |
| **Link** | Select existing unlinked action → links to challenge category |
| **Unlink** | Select linked action → 🔗 Unlink (keeps action, removes association) |

**Important distinction:** Unlink keeps the action alive for reuse elsewhere. Delete destroys the action entity. Both options should be available.

---

### 4.5 Channel Creation + Post

Currently "Post to Channel" requires the channel to already exist. Enhancement:

**"📢 Create Channel & Post"** button on the challenge detail screen:
1. Creates a new Discord text channel (e.g., `#challenge-spreadsheet-art`)
2. Posts the challenge content (richCard) into it
3. Includes action buttons based on category context:
   - In challenge channel: Player Action — All buttons + Host Action buttons (host-only, permissions-gated)
   - In tribe channels: Tribe-specific action buttons
   - In player subs: Individual player action buttons (per-player)

Channel naming convention: `#challenge-{slug}` or host-specified.

**Channel permissions:** The created channel should inherit from category or be configurable (e.g., tribe channel only visible to that tribe's role).

**Post routing — host chooses per-post:** When clicking "Post to Channel" or "Create Channel & Post", the host selects which category of action buttons to include. The system doesn't auto-detect channel audience — the host knows which channel is for which purpose.

---

## 5. Results Tracking — Considerations (Build Later)

Results tracking is a natural extension of typed actions but is **not in scope for Phase 1B**. Captured here for future design.

### What Results Look Like Per Category

| Category | Result Type | Example |
|---|---|---|
| Player Action — All | Time-based (Snowflake Timer) | "Sarah: 35min, Reece: 43min" |
| Player Action — All | Score-based (action outcome) | "Sarah: 85pts, Reece: 72pts" |
| Individual Player Action | Completion status | "Reece: ✅ submitted, Tom: ⬜ pending" |
| Tribe Action | Aggregate score | "Balboa: 340pts, Drake: 285pts" |
| Host Action | Trigger log | "Clue 1 dropped at 3:42 PM" |

### Storage Options (TBD)

**Option 1: On the challenge entity**
```javascript
challenge.results = {
  "playerId": { time: 2580000, score: 85, completedAt: 1712345678 },
  ...
}
```
Pros: Self-contained, easy to display from challenge screen
Cons: Challenge entity grows, mixed concerns

**Option 2: On the player entity**
```javascript
playerData[guildId].players[playerId].challengeResults[challengeId] = { ... }
```
Pros: Player-centric queries, fits existing data patterns
Cons: Scattered across players, harder to aggregate

**Option 3: Separate results entity**
```javascript
playerData[guildId].challengeResults[challengeId] = { ... }
```
Pros: Clean separation, easy to aggregate
Cons: Another top-level key to manage

### Integration Points

- **Snowflake Timer (RaP 0925):** Auto-capture start/end times when players interact with challenge actions. Layer 3 of the timer system ("Challenge Integration") feeds directly into per-player time results.
- **Action outcomes:** `give_currency`, `modify_attribute`, `calculate_results` outcomes already produce numeric values. These could auto-feed into results.
- **Leaderboard rendering:** Aggregate results → sorted display → post to channel (future feature).

**Decision deferred** — build the action categories first, then results tracking becomes a natural next step once we see how hosts actually use the categories.

---

## 6. Implementation Phases (Updated)

| Phase | Scope | Status |
|---|---|---|
| **1** | Basic linking — `actionIds[]`, selector, toggle, post with buttons | ✅ **Built** |
| **1B** | Action categories, Quick Create modal, bulk creation, data model migration, CRUD with unlink/delete | **Specification** |
| **2** | Player menu integration — challenge section in `/menu`, active/paused/completed status, host controls | Not started |
| **3** | Results tracking — per-category results storage, Snowflake Timer integration, leaderboards | Not started |
| **4** | Action Templates in Library — export/import actions bundled with challenges as playable templates | Not started |
| **5** | Advanced — host vs player action roles, `round_results` outcome, `timed_action`, custom anchors | Not started |

### Phase 1B Implementation Order

1. **Data model** — add `challenge.actions` categorized object, lazy migration from `actionIds[]`
2. **`challengeActionCreate.js`** — Quick Create modal builder, submission handler, bulk creation logic, unlink/delete helpers, summary helper
3. **Challenge Action Manager UI** — categorized sections in `challengeManager.js`, replaces flat selector
4. **Button/modal handlers in app.js** — routing for quick create, CRUD, category navigation
5. **Channel creation + post** — create channel with `MANAGE_CHANNELS`, post with category-appropriate buttons
6. **Button registry** — register all new handlers in `buttonHandlerFactory.js`

---

## 7. Resolved Questions

| # | Question | Answer | Rationale |
|---|---|---|---|
| 1 | Where do tribe roles come from? | **Standard Role Select** (type 6) — hosts pick any guild role | Too complex to filter from castlist/safari config. Hosts know their tribe roles. Standard Discord component. |
| 2 | Action creation inline or full editor? | **Quick Create modal** — follows `quickActionCreate.js` pattern | Modal with Type + Name + Display Text + Emoji + Assignment. Creates shell action with `display_text` outcome. Host can open full Action Editor after to add conditions, follow-ups, etc. |
| 3 | 25+ player select limit? | **User Select in modal** (multi, `max_values: 25`) + bulk shell creation | User Select isn't limited to 25 like String Select options. Creates N shell actions in one submit. Most seasons are 18 players, rarely over 24. |
| 4 | Post routing by category? | **Host chooses per-post** | Host selects which action category to include when posting. No auto-detection — the host knows the channel purpose. |
| 5 | Bulk action creation? | **Yes, via multi-select User/Role Select** | Individual: multi-User Select → N shell actions with same display_text, host edits each individually. Tribe: multi-Role Select → N shell actions. Future: CSV paste for unique content per player. |

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Component budget for 4-category UI | High | Collapse empty categories, progressive disclosure |
| Data model migration breaks existing linked actions | Medium | Lazy migration — treat missing `actions` as `playerAll` from `actionIds[]` |
| Individual action CRUD is N× the work per player | Medium | Bulk creation via multi-select User Select in modal |
| Bulk-created shell actions all have same display_text | Low | Host edits each individually via Action Editor. Future: bulk-edit UI |
| Channel creation permissions | Low | Check `MANAGE_CHANNELS` before showing button |
| Host Action visibility leaking to players | Medium | Permission-gate host action buttons on posted messages |
| Quick Create modal at 5-component limit | Low | Fits exactly: Type + Name + Text + Emoji + Assignment. Player All/Host have spare slot for Button Color. |

---

## 9. Original Context (User Prompt — 2026-04-04)

> So the basic issue is: We need a way to segregate the /types/ of challenge actions, because how hosts define them, and the way in which players use them, differs wildly based on the challenge.
>
> What we built (pre action integration) is a basic: production team post a wall of text that explain the challenge to all players / tribes. For example: A Scavenger Hunt between two tribes - the display_text has a list of 20x real-world items, the items are posted in the display_text, players just need to go and take photos of these real world items within 24 hours. Simple! No Actions required. One post.
>
> Next up - Single Action for all players. No 'special stuff' needed per-player. Requires some level of secrecy. For example, the hosts prepare an online jigsaw puzzle. The challenge display_text simply says you'll be doing a puzzle, go into castbot in your private channel, click this button and you'll be given the link to the jigsaw puzzle and be timed from there (the jigsaw link can't be given in the display_text as players could cheat and do it beforehand)... The button will be the Action configured, when players in their normal daily lives (noting these people have jobs etc) have the time, they'll click the button, everyone gets the same jigsaw link, we can use our new Snowflake Timer to capture the start time, they do the puzzle on their browser and post a screenshot as proof when they're done - where we can measure the time taken. Easy!
>
> Next would be a per-player Individual Action. In this instance, we need to vary the action for each player somehow. For example, I'm currently prepping a challenge called Spreadsheet Art where each player is given a private Google Sheets link, and each link differs per player. In this instance we'd need 1x Action per Player, display_text with a special link per player, and in our UI we can manage / assign it per player.
>
> Then a per-tribe action. For example, we could use the Attack Outcome type in an action, and each tribe needs their own separate attack action.
>
> And then just a general Host Challenge action - any time where hosts need to automate some action beyond whats in the challenge text. For example, a challenge where hosts at a random time of their choosing post a display_text in a channel, and first tribe to respond gets the points. In this instance we'd need to give them the ability to use this from the challenge UI.
>
> In line with above, we need to think about the ability to store and track results based on each of the categories defined above. For example, a score calculated based on an action; a challenge time based on snowflake, etc. Probably a later problem, but we should think about this a bit up front.
>
> Labels/placeholder text for UI:
>
> ⚡ Player Action — All: Use when all players need to use the same command e.g., show the same jigsaw in their subs. Carlbot equivalent: `?f15-jigsaw`
>
> ⚡ Individual Player Action: Use when you have individual commands for each player and you don't want players to see each other's commands. Carlbot equivalent: `?fic-reece`. Typically used in: player subs.
>
> ⚡ Tribe Challenge Action: Use when you have individual commands for each tribe and you don't want tribes to see each other's commands. Carlbot equivalent: `?verbaljigsaw-balboa`. Typically used in: Tribe Challenge Channel.
>
> ⚡ Host Challenge Action: Use to automate some aspect of the challenge beyond what is needed in the challenge text.
>
> Other features: Automate channel creation and post (actually creates the channel and then posts the challenge text in it).
>
> CRUD controls: String Select / add is nice but how to delete? For actions — provide ability to 🔗 Unlink and 🗑️ Delete.
>
> Data model needs: `challenge { ..., actions { actionId, type: playerAction? } }`

### Follow-up Answers (2026-04-04)

> 1. Tribe roles: Just let them pick — standard Role Select (type 6) for guild roles, labelled as tribes. Hosts are used to this.
> 2. Action creation: Follow quickActionCreate.js pattern — pop up a modal with display_text characteristics + a String Select with the Challenge Action type. May evolve.
> 3. Player count limits: User Select in modal supports multi-select (unlimited). Bulk create N shell actions. Most seasons are 18 players, rarely over 24.
> 4. Post routing: Host chooses from the challenge detail/preview UI.
> 5. Bulk creation: Yes — build the logic/code in a reusable way. New module: challengeActionCreate.js.
