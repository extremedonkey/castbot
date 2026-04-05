# Challenge ↔ Action Integration — Playable Challenges

> **RaP #0943** | 2026-03-16 (original), 2026-04-04 (Phase 1B spec), 2026-04-05 (prototype + build plan)
> **Status**: Phase 1 ✅ BUILT — Phase 1B data model ✅ BUILT — Phase 1B UI PROTOTYPED → ready to build
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

**Data model:**
```javascript
// playerData[guildId].challenges[challengeId]:
{
  actionIds: ["action_abc", "action_def"]  // flat array, many-to-many
}
```

**Key insight:** Outcomes are stateless and self-contained. The execution engine doesn't care whether an action was triggered from a challenge, map cell, or standalone button. No new outcome types or engine changes were needed — linking was purely data association + UI.

</details>

---

## 3. The Problem Phase 1B Solves

Phase 1 treats all linked actions identically — a flat `actionIds[]` list. But in practice, hosts need **categorically different types** of challenge actions. The way hosts define them, and the way players use them, differs wildly:

| Challenge Type | What the Host Needs | Example |
|---|---|---|
| Simple text post | No actions at all | Scavenger hunt — list of 20 items, go take photos |
| Same action for all players | 1 action, all players share it | Jigsaw puzzle — same link for everyone, can't leak early |
| Individual action per player | N actions, 1 per player | Spreadsheet Art — unique Google Sheets link per player |
| Per-tribe action | N actions, 1 per tribe | Verbal Jigsaw — each tribe gets separate attack action |
| Host automation action | Actions only hosts trigger | Random clue drop — host clicks, text posts at chosen time |

### Carlbot Equivalence

These categories directly replace the Carlbot `?tag` system that ORGs currently rely on:

| CastBot Category | Carlbot Equivalent | Example Tag |
|---|---|---|
| Player Action — All | `?f15-jigsaw` | All players type the same command |
| Individual Player Action | `?fic-reece` | Per-player tag with unique content |
| Tribe Challenge Action | `?verbaljigsaw-balboa` | Per-tribe tag with unique content |
| Host Challenge Action | *(no direct equivalent)* | Manual host coordination |

---

## 4. Phase 1B — What's Built

### 4.1 Data Model (BUILT ✅)

**Module:** `challengeActionCreate.js` (production code, 44 tests passing)

Categorized `actions` object coexists with legacy `actionIds[]`:

```javascript
// playerData[guildId].challenges[challengeId]:
{
  actionIds: ["id1", "id2"],  // kept in sync — backwards compat for all 14 existing consumers

  actions: {
    playerAll: ["jigsaw_abc"],
    playerIndividual: { "userId": "sheet_reece" },
    tribe: { "roleId": "attack_balboa" },
    host: ["host_clue"]
  }
}
```

**Key functions:**
- `getChallengeActions(challenge)` — reads `actions` or falls back to `actionIds` as `playerAll`
- `syncActionIds(challenge)` — flat union of all categories → `actionIds[]`. Called after every write.
- `ensureActions(challenge)` — lazy init from legacy `actionIds` on first categorized write

**Backwards compat guarantee:** `syncActionIds()` writes to `actionIds` after every mutation. All 14 existing reference sites (`buildChallengePost`, `buildChallengeScreen`, `buildActionSelector`, `toggleChallengeAction`, app.js:8678) continue reading `actionIds` unchanged.

### 4.2 Business Logic (BUILT ✅)

**Module:** `challengeActionCreate.js`

| Function | Purpose |
|---|---|
| `buildQuickChallengeActionModal(challengeId, category)` | 5-field modal: Type Select + Name + Display Text + Emoji + Assignment (User/Role Select or Color) |
| `handleQuickChallengeActionSubmit(guildId, userId, challengeId, modalComponents, guild?)` | Creates 1 or N shell actions, links to category, syncs actionIds |
| `linkChallengeAction(guildId, challengeId, actionId, category, assignmentId?)` | Link existing action to a category |
| `unlinkChallengeAction(guildId, challengeId, actionId, category)` | Remove from category, keep action entity |
| `deleteChallengeAction(guildId, challengeId, actionId, category)` | Remove from category AND delete action entity |
| `getChallengeActionSummary(guildId, challengeId)` | Counts per category for UI rendering |

Bulk creation: `handleQuickChallengeActionSubmit` with `playerIndividual` creates N actions from User Select multi-values. Same for `tribe` with Role Select.

### 4.3 Prototype — Host UI (PROTOTYPED, in `poc/challengeActionMockup.js`)

Tested with real challenge: **Hurley's Lotto Sweepstakes** (`challenge_a38ccad9c8e3`)

#### Design Decision: Unified Select (NOT 4 separate sections)

**❌ Original 4-section design (rejected during prototyping):**
```
[▼ Player All select...]
[▼ Individual select...]
[▼ Tribe select...]
[▼ Host select...]
```
Used ~22 components, most sections empty, visually overwhelming.

**✅ Final design: ONE unified select**
```
### ```⚡ Challenge Actions```
-# Equivalent to carlbot ?tags (but better!)
[▼ 3 actions · 🏃 Player  🦸 Host  🔥 Tribe     ]
  ➕ Create New Challenge Action
  🔄 Clone Action
  🎰 Buy Lottery Tickets — Player enters ticket count · ⌨️ User Input · 3 outcomes
  ✋ Done                 — Player ends their run · 🖱️ Button · 2 outcomes
  📊 Reveal Results       — Post final earnings · 🖱️ Button · 2 outcomes
```

**Key decisions from prototyping:**
- **One section, not four.** Categories are metadata on each action, not separate UI sections. Saves ~14 components.
- **Action's own emoji in select** (🎰, ✋, 📊) — not the type emoji. Action identity is primary, type is secondary context in the description.
- **Follows `createCustomActionSelectionUI()` pattern** from `customActionUI.js`: ➕ Create New, 🔍 Search (if >10), 🔄 Clone, then actions sorted by `metadata.lastModified` (newest first).
- **Inline on challenge detail screen** — not a separate screen. The challenge preview (title, description, image, Edit/Round/Post/Publish/Delete buttons) stays above. The action select is below.
- **Component budget: ~26/40** with full challenge detail + action select + nav. Plenty of headroom.

#### Challenge Detail Layout (with actions integrated)

```
┌─ Container (accent: from challenge) ──────────────┐
│ # 🏃 Challenges                                    │
│ ─────────────────────────────────────              │
│ [▼ Challenge select...                          ]  │
│ ─────────────────────────────────────              │
│ # 🎟️Hurleys Lotto Sweepstakes 🎟️                 │
│ -# Host: @Reece                                    │
│ [full challenge description text...]               │
│ [challenge image]                                  │
│ ─────────────────────────────────────              │
│ [✏️ Edit] [🔥 Round] [#️⃣ Post to Channel]          │
│ [📤 Publish] [🗑️ Delete]                           │
│ ─────────────────────────────────────              │
│ ### ```⚡ Challenge Actions```                      │
│ -# Equivalent to carlbot ?tags (but better!)       │
│ [▼ 3 actions · 🏃 Player  🦸 Host  🔥 Tribe    ]  │
│ ─────────────────────────────────────              │
│ [← Menu] [📚 Challenge Library]                    │
└────────────────────────────────────────────────────┘
```

### 4.4 Prototype — Player Menu (PROTOTYPED, in `playerCardMenu.js`)

Integrated into the Player Card prototype as a hot-swap category button.

**Design decision: Players don't see challenge text.** The challenge description was already posted in the challenge channel. The player menu shows only executable actions.

```
> **`🏃 Challenges`**
[🏃 Challenges]                              ← category button

Hot-swap area when clicked:
[▼ Select a challenge action...                    ]
  🎰 Buy Lottery Tickets — 🟢 Hurleys Lotto · F11
  ✋ Done                 — 🟢 Hurleys Lotto · F11
  ✅ Tribal Jigsaw Race — 34m 22s — ✅ Completed · F12
```

**Key decisions:**
- Actions from all active challenges in one select, grouped by challenge
- Active challenges show executable actions (🟢 prefix in description)
- Completed challenges show results (✅ prefix, time/score)
- Challenge name + round shown in description field
- Selecting an action triggers execution via the standard action engine

---

## 5. Build Plan — From Prototype to Production

### 5.1 What's Already Production Code (keep)

| File | Status | Notes |
|---|---|---|
| `challengeActionCreate.js` | ✅ Production | 8 exports, data model + business logic |
| `tests/challengeActionCreate.test.js` | ✅ Production | 44 tests, all pure logic |
| `playerCardMenu.js` (Challenges row) | ✅ Refine | Row + `case 'challenges'` added, swap stub data for real |

### 5.2 What's Throwaway (delete when real UI ships)

| File/Change | How to Clean Up |
|---|---|
| `poc/challengeActionMockup.js` | Delete entire file |
| `poc/playerChallengeMockup.js` | Delete entire file (already unwired) |
| `app.js` — `camock_*` handler block | Remove ~10 lines |
| `app.js` — `pcmock_*` handler block | Remove ~10 lines |
| `menuBuilder.js` — `camock_open` button | Remove 1 line from Experimental section |
| `buttonHandlerFactory.js` — `camock_*`, `pcmock_*` entries | Remove ~16 lines |
| `scripts/buttonDetection.js` — `challenge_mockup`, `player_card` entries | Swap to point at real buttons |

**Signal:** everything with `camock_` or `poc/` prefix is throwaway. One grep, one purge commit.

### 5.3 Build Steps (Production)

**Step 1: Wire host UI into `challengeManager.js`**
- Update `buildChallengeScreen()` to add the `⚡ Challenge Actions` select below existing buttons
- Reuse `createCustomActionSelectionUI` pattern from `customActionUI.js:38` for option building (Create New, Search, Clone, sorted by lastModified)
- Read action data via `getChallengeActions()` from `challengeActionCreate.js`
- Replace the current ⚡ Actions button (and the entire `buildActionSelector` flat selector) with the inline select
- The old `buildActionSelector` and `challenge_actions_*` handler become dead code — remove

**Step 2: Wire Quick Create modal handler in `app.js`**
- Add handler for `challenge_action_create_modal_*` modal submit
- Route to `handleQuickChallengeActionSubmit()` from `challengeActionCreate.js`
- After submission, return updated `buildChallengeScreen()` showing the new action in the select

**Step 3: Wire action manage (Edit/Unlink/Delete) in `app.js`**
- When host selects an existing action from the challenge actions select:
  - Show action detail sub-screen (Edit in Action Editor / Unlink / Delete buttons)
  - Edit → opens `createCustomActionEditorUI()` from `customActionUI.js`
  - Unlink → calls `unlinkChallengeAction()`, returns updated challenge screen
  - Delete → confirmation → calls `deleteChallengeAction()`, returns updated challenge screen

**Step 4: Wire player menu with real data**
- Update `playerCardMenu.js` `case 'challenges'` to load from `playerData` + `safariData`
- For each active challenge: get `getChallengeActions()`, filter to actions visible to this player
  - `playerAll` → show to everyone
  - `playerIndividual[thisPlayerId]` → show only to that player
  - `tribe[playerRoleId]` → show if player has that tribe role
  - `host` → never show to players
- Selecting an action triggers execution (same `challenge_{guildId}_{actionId}_{timestamp}` pattern)

**Step 5: Cleanup**
- Delete `poc/challengeActionMockup.js`, `poc/playerChallengeMockup.js`
- Remove `camock_*`/`pcmock_*` from app.js, menuBuilder.js, buttonHandlerFactory.js
- Remove dead code: `buildActionSelector()`, `challenge_actions_*` handler, `challenge_action_toggle_*` handler
- Update buttonDetection.js to point at real challenge buttons

### 5.4 What NOT to Build Yet

- Channel creation + post (Section 4.5 in old spec) — deferred
- Results tracking (Section 5) — deferred
- Library action templates — deferred
- Host vs player action roles — deferred

---

## 6. Implementation Phases (Updated)

| Phase | Scope | Status |
|---|---|---|
| **1** | Basic linking — `actionIds[]`, selector, toggle, post with buttons | ✅ **Built** |
| **1B data** | Categorized `actions` object, `challengeActionCreate.js`, lazy migration, sync | ✅ **Built** |
| **1B prototype** | Host + player mockups validating UI design in Discord | ✅ **Prototyped** |
| **1B UI** | Wire real UI: challenge detail select, Quick Create modal, action manage, player menu | **Ready to build** |
| **2** | Channel creation + post with category-appropriate buttons | Not started |
| **3** | Results tracking — per-category storage, Snowflake Timer integration, leaderboards | Not started |
| **4** | Action Templates in Library — export/import actions bundled with challenges | Not started |
| **5** | Advanced — host vs player action roles, `round_results` outcome, custom anchors | Not started |

---

## 7. Resolved Questions

| # | Question | Answer | Rationale |
|---|---|---|---|
| 1 | Where do tribe roles come from? | **Standard Role Select** (type 6) | Hosts know their tribe roles. Too complex to filter. |
| 2 | Action creation inline or full editor? | **Quick Create modal** following `quickActionCreate.js` | Shell action with `display_text`, host refines in Action Editor after. |
| 3 | 25+ player limit? | **User Select multi** (`max_values: 25`) + bulk creation | Most seasons 18 players, rarely over 24. |
| 4 | Post routing by category? | **Host chooses per-post** | No auto-detection. |
| 5 | Bulk action creation? | **Yes, via multi-select** | N shell actions with same display_text, edit individually. |
| 6 | 4 sections or 1 select? | **1 unified select** | 4 sections used ~22 components, most empty. 1 select uses ~3. Validated in prototype. |
| 7 | Type indication in select? | **Action's own emoji** (🎰, ✋, 📊), type in description | Action identity is primary. Type is context. |
| 8 | Player menu: show challenge text? | **No** — actions only | Challenge text already posted in channel. Menu shows executable actions. |
| 9 | Reuse existing action editor? | **Yes** — `createCustomActionSelectionUI` pattern | Same Create/Search/Clone + sorted-by-lastModified. Add filter param. |

---

## 8. Security — Action Visibility & Execution Gating

Challenge actions must be **visible only to** and **executable only by** the assigned audience. Two enforcement points:

### 8.1 Player Menu (visibility)

When building the player's challenge action select, filter by assignment:

| Category | Who sees it | Check |
|---|---|---|
| `playerAll` | Everyone | No check needed |
| `playerIndividual` | Only the assigned player | `actions.playerIndividual[thisPlayerId]` exists |
| `tribe` | Only members of that tribe role | Player has the role ID in their `member.roles` |
| `host` | Never shown to players | Always filter out |

### 8.2 Posted Challenge Buttons (execution)

When a player clicks an action button from a posted challenge message, the execution handler must verify before running outcomes:

| Category | Execution gate | On failure |
|---|---|---|
| `playerAll` | None — anyone can execute | — |
| `playerIndividual` | `challenge.actions.playerIndividual[clickingUserId] === actionId` | Ephemeral "This action isn't assigned to you" |
| `tribe` | Clicking user has the tribe role (check `member.roles.cache.has(roleId)`) | Ephemeral "This action is for [tribe name] only" |
| `host` | User has host/production permissions | Ephemeral "Host-only action" |

**Implementation:** Add a `verifyChallengeActionAccess(challenge, actionId, member)` function to `challengeActionCreate.js`. Call it in the `challenge_{guildId}_{actionId}_{timestamp}` dynamic handler (app.js ~4801) before `executeButtonActions()`.

### 8.3 Channel Permissions (defence in depth)

When posting per-tribe actions to tribe channels, the channel itself should already restrict visibility via Discord permissions (only tribe role can see the channel). This is the host's responsibility, not CastBot's — but CastBot should warn if posting tribe actions to a public channel.

---

## 9. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Data model migration breaks existing | Medium | Lazy migration + `syncActionIds()`. 44 tests verify. |
| Bulk-created shell actions all have same display_text | Low | Host edits individually via Action Editor. |
| Prototype code left behind | Low | All throwaway code uses `camock_`/`poc/` prefix. One grep to purge. |
| `buildActionSelector` dead code after migration | Low | Remove in cleanup step alongside `challenge_actions_*` handler. |
| Player action visibility leak | **High** | Two gates: menu filtering (Section 8.1) + execution gating (Section 8.2). `verifyChallengeActionAccess()` in handler. |
| Tribe action posted to public channel | Medium | Warn host if posting tribe-scoped actions to a non-tribe channel. Defence in depth. |

---

## 9. Original Context

<details>
<summary>Expand — User prompts from 2026-04-04</summary>

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

**Follow-up (2026-04-04):**
> 1. Tribe roles: Just let them pick — standard Role Select for guild roles. Hosts are used to this.
> 2. Action creation: Follow quickActionCreate.js pattern.
> 3. Player count: User Select multi-select. Bulk create N shell actions.
> 4. Post routing: Host chooses from challenge detail UI.
> 5. Bulk creation: Build in a reusable way. New module: challengeActionCreate.js.

**UI refinement (2026-04-05):**
> Combine all actions into one section: ```⚡ Challenge Actions``` with `-# Equivalent to carlbot ?tags (but better!)`. String select with Create New, Search, Clone then list of all actions ordered by last modified. Emoji rendered from action's own button emoji. Description shows action description + trigger type + outcome count.

</details>
