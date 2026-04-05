# Challenge ↔ Action Integration — Playable Challenges

> **RaP #0943** | 2026-03-16 (original), 2026-04-05 (Phase 1B as-built), 2026-04-05 (Phase 1C spec)
> **Status**: Phase 1 ✅ — Phase 1B ✅ — Phase 1C SPECIFICATION (Individual Player Actions)
> **Related**: [Challenges RaP 0945](0945_20260316_Challenges_Analysis.md), [Challenge Library RaP 0944](0944_20260316_ChallengeLibrary_Analysis.md), [SnowflakeTimer RaP 0925](0925_20260403_SnowflakeTimer_Analysis.md), [Super Player Menu RaP 0924](0924_20260405_SuperPlayerMenu_Analysis.md), [SafariCustomActions](../03-features/SafariCustomActions.md)

---

## 1. Vision

Transform challenges from **content cards** into **playable experiences** by linking Custom Actions to challenges. Pipeline: **Season Planner** → **Challenges** → **Actions** (gameplay).

---

## 2. What's Built (Phases 1 + 1B) ✅

<details>
<summary>Expand — all built, kept for reference</summary>

### Data Model (`challengeActionCreate.js`)
- Categorized `actions` object: `playerAll`, `playerIndividual`, `tribe`, `host`
- `getChallengeActions()` with lazy migration from legacy `actionIds[]`
- `syncActionIds()` backwards compat — flat union for all existing consumers
- `verifyChallengeActionAccess()` — security gating per category
- `buildChallengeActionSelect()` — unified select with Create/Clone/actions
- Quick Create modal builder + submission handler with bulk creation
- Link/unlink/delete CRUD helpers
- 53 tests passing

### Host UI (Challenge Detail Screen)
- `⚡ Challenge Actions` unified string select inline on challenge detail
- ➕ Create New, 🔄 Clone, then actions sorted by lastModified
- Action manage sub-screen: Edit in Action Editor / Unlink / Delete
- `::` separator in custom IDs for reliable parsing
- Button row: [✏️ Edit] [🔥 Round] [#️⃣ Post] [🗑️ Delete]
- Nav row: [← Menu] [📚 Library] [📤 Publish]
- Challenge select sorted by last updated

### Player Menu (Super Player Menu)
- 🏃 Challenges button in Section B (Safari)
- Hot-swap string select with visible challenge actions
- Visibility: playerAll (everyone), playerIndividual (assigned), tribe (role check), never host
- Action execution via `player_menu_sel_challenges` handler

### Security
- `verifyChallengeActionAccess()` in dynamic `challenge_*` handler
- Player menu filters by visibility before rendering
- display_text bug fix: `config.text` fallback + empty content guard

</details>

---

## 3. Phase 1C — Individual Player Action Improvements (CURRENT)

### 3.1 The Use Case: Spreadsheet Art Challenge

> Each player receives a unique Google Sheets link. Player goes to `/menu` → Challenges → selects "🎨 Spreadsheet Art - Reece". Timer starts on select. Player receives their unique link + image. They recreate the art, screenshot it, ping production. Time = snowflake difference.

**What the host needs to do today (painful):**
1. Create 1 action per player manually in Quick Create modal
2. Each action needs a unique name, display text with unique link
3. No timer integration
4. No bulk creation from a player list

**What we're building:**
1. Revised Quick Create modal with Mentionable Select for bulk player/tribe assignment
2. Bulk-create N actions from one modal submit
3. Snowflake timer toggle (data structure only for now)
4. Streamlined modal (remove Button Color, remove Button Emoji, make Display Text optional)

### 3.2 Revised Quick Create Modal

```
┌──────────────────────────────────────┐
│     Quick Challenge Action           │
├──────────────────────────────────────┤
│ Action Name                          │
│ [                                 ]  │
│ -# e.g., "Spreadsheet Art"          │
│                                      │
│ Action Type                          │
│ [▼ String Select                  ]  │
│   ⚡ Player Action — All             │
│   👤 Individual Player Action        │
│   🏰 Tribe Challenge Action          │
│   🔧 Host Challenge Action           │
│                                      │
│ Associated Players / Tribes          │
│ -# Only use if you need special      │
│ -# commands per user/tribe, else     │
│ -# leave blank.                      │
│ [Mentionable Select (multi)       ]  │
│                                      │
│ Display Text (Optional)              │
│ [                                 ]  │
│ -# What the player sees on click.    │
│ -# Leave blank to configure later.   │
│                                      │
│ ⏱️ Challenge Timer                   │
│ [▼ String Select                  ]  │
│   ♾️ No Timer (default)              │
│   ⏱️ Timed                           │
└──────────────────────────────────────┘
```

**Modal fields (5 components — fits Discord limit):**

| # | Component | Type | Notes |
|---|---|---|---|
| 1 | Action Name | Text Input (type 4) | Required, max 80 chars |
| 2 | Action Type | String Select (type 3) in Label | 4 options, pre-selected if category known |
| 3 | Associated Players / Tribes | Mentionable Select (type 7) in Label | Multi-select, min 0, max 25. Optional. |
| 4 | Display Text | Text Input (type 4) paragraph | **Optional** (required: false). If empty, NO display_text outcome created. |
| 5 | Challenge Timer | String Select (type 3) in Label | 2 options: No Timer (default), Timed |

**Changes from current modal:**
- ❌ Removed: Button Color (unnecessary — string select UI, can edit in Action Editor)
- ❌ Removed: Button Emoji (moved to post-creation, can edit in Action Editor)
- ✅ Added: Mentionable Select for bulk player/tribe assignment
- ✅ Added: Challenge Timer select
- ✅ Changed: Display Text is now optional
- ✅ Changed: Action Name moved to first position (was second)

### 3.3 Mentionable Select Behavior Per Category

| Category | Mentionable Values | Behavior |
|---|---|---|
| **Individual Player Action** | Users selected → bulk create N actions | Each action named `{playerName} - {actionName}` (truncated to 100 chars) |
| **Tribe Challenge Action** | Roles selected → bulk create N actions | Each action named `{roleName} - {actionName}` |
| **Player Action — All** | Any selections → warn + still create 1 action | Ephemeral warning: "Player Action — All doesn't support per-player assignment. Created 1 shared action." |
| **Host Challenge Action** | Any selections → warn + still create 1 action | Same warning pattern |

**Name format:** `{assigneeName} - {actionName}` (e.g., "Reece - Spreadsheet Art"). Truncated to 100 chars (Discord label limit). If assigneeName can't be resolved, fall back to `<@userId>` mention format.

### 3.4 Challenge Timer Data Structure

```javascript
// In challenge.actions metadata (on the challenge entity):
{
  actions: {
    playerAll: ["jigsaw_abc"],
    playerIndividual: { "userId": "sheet_reece" },
    // ...
  },
  timerMode: 'none' | 'timed',  // NEW: set per-challenge from modal
}

// On each action entity (safariData[guildId].buttons[actionId]):
{
  metadata: {
    // ...existing fields...
    challengeTimer: 'none' | 'timed',  // NEW: copied from modal
  }
}
```

**MVP:** Just store the flag. Snowflake timing is calculated at execution time from interaction IDs — no storage needed for the timer itself. The `timed` flag will later control:
- Whether the player menu shows a timer icon
- Whether the action execution captures start/end snowflakes
- Whether results tracking aggregates timing data

**Not built now:** Actual timer capture/display. Just the data structure so we don't need to re-modal later.

### 3.5 On Submit — Individual Player Action Flow

1. Parse modal: actionName, category, mentionableValues, displayText, timerMode
2. Validate: actionName required, category required
3. **For each user in mentionableValues:**
   a. Resolve display name via `guild.members.fetch(userId)` → `member.displayName`
   b. Build action name: `{displayName} - {actionName}`.substring(0, 100)
   c. Create action shell in `safariData[guildId].buttons[actionId]`
   d. If displayText is non-empty: add `display_text` outcome. If empty: no outcomes (host edits later)
   e. Set `metadata.challengeTimer = timerMode`
   f. Link to `challenge.actions.playerIndividual[userId] = actionId`
4. `syncActionIds(challenge)` + save both stores
5. **Return ephemeral summary:**

```
## ✅ Created 12 Individual Player Actions
-# 🎨 Spreadsheet Art · ⏱️ Timed

👤 Reece — Reece - Spreadsheet Art
👤 Sarah — Sarah - Spreadsheet Art
👤 Tom — Tom - Spreadsheet Art
...

-# Each player will see their action in /menu → Challenges.
-# Edit individual actions via the ⚡ Challenge Actions select.
```

### 3.6 On Submit — Tribe Action Flow

Same as Individual but:
- Resolve role names via `guild.roles.cache.get(roleId)` → `role.name`
- Link to `challenge.actions.tribe[roleId] = actionId`
- Name: `{roleName} - {actionName}`

### 3.7 Display Text Optional Logic

```javascript
// In handleQuickChallengeActionSubmit:
if (displayText && displayText.trim()) {
  action.actions.push({
    type: 'display_text',
    order: 0,
    config: { text: displayText.trim() },
    executeOn: 'true',
  });
} else {
  action.actions = []; // No outcomes — host configures via Action Editor
}
```

---

## 4. Implementation Phases (Updated)

| Phase | Scope | Status |
|---|---|---|
| **1** | Basic linking — `actionIds[]`, selector, toggle, post with buttons | ✅ **Built** |
| **1B** | Categories, unified select, Quick Create, manage UI, player menu, access gating | ✅ **Built** |
| **1C** | Individual Player Action bulk create, Mentionable Select, timer data, optional display text | **Specification** |
| **2** | Channel creation + post with category-appropriate buttons | Not started |
| **3** | Results tracking — Snowflake Timer capture, leaderboards | Not started |
| **4** | Action Templates in Library | Not started |

---

## 5. Security — Action Visibility & Execution Gating (BUILT ✅)

| Category | Player Menu | Execution Gate |
|---|---|---|
| `playerAll` | Everyone | None |
| `playerIndividual` | Assigned player only | `actions.playerIndividual[userId] === actionId` |
| `tribe` | Members with tribe role | `member.roles.cache.has(roleId)` |
| `host` | Never shown | ManageRoles permission |

Implemented in `verifyChallengeActionAccess()` + player menu filtering.

---

## 6. Original Context

<details>
<summary>Expand — User prompts (2026-04-04 and 2026-04-05)</summary>

**Phase 1C prompt (2026-04-05) — Spreadsheet Art use case:**

> The most pressing need is to revise / improve the logic / functionality of 'Individual Player Action' for a pending challenge soon. Here's the actual challenge writeup:
>
> You will be racing to recreate an image by coloring in cells in a provided Google Spreadsheet. You will be starting this challenge from CastBot. In your subs: 1. Type `/menu` 2. Click 🏃 Challenges 3. Select 🎨 Spreadsheet Art - Your Name. Your timer starts as soon as you select Spreadsheet Art in step 3.
>
> What we need: bulk-create per-player Individual Player Action from one Quick Create modal. Use Mentionable Select for player/tribe assignment. Remove Button Color (string-select UI, unnecessary). Remove Button Emoji (post-creation). Make Display Text optional. Add Challenge Timer toggle (⏱️ Timed / ♾️ No Timer) leveraging Snowflake Timer (RaP 0925).
>
> For each User selected: create action named `{playerName} - {actionName}`, with display text + timer flag. Display Text empty = no outcome created. Timer = just data flag for now, MVP snowflake comparison at execution time.
>
> Use Mentionable Select (type 7) — handles both users (Individual) and roles (Tribe) in one component. Player Action All and Host should warn if mentionables selected but still create 1 action.

**Original Phase 1B prompts (2026-04-04):** See collapsed section in previous version.

</details>
