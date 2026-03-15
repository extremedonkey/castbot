# Challenges — Content Cards for Season Rounds

> **RaP #0945** | 2026-03-16
> **Status**: Specification — ready to build
> **Related**: [SeasonPlanner RaP](0947_20260315_SeasonPlanner_Analysis.md), [Season Planner UI Prototype](../ui/SeasonPlannerUIPrototype.md), [RichCardUI](../enablers/RichCardUI.md)
> **Depends on**: Season Planner (built), richCardUI.js (built), Entity Edit Framework (built)

---

## 1. Problem Statement

Season Planner gives hosts the **when** — round schedule, dates, durations, swaps, merge. But the **what** (challenge title, description, image, host assignment) has no home. Currently rounds show "Challenge 3 (TBC)" because there's no challenge entity to link to.

Hosts currently plan challenge content externally (spreadsheets, Google Docs, Discord channels). CastBot should own this — a challenge is a content card that can be planned, previewed, and posted to a channel.

---

## 2. What a Challenge IS

A Challenge is a **content card** — like a richCard with host metadata:

- **Title**: "Tycoons of the Nile", "Forbidden Island", "Democracy"
- **Description**: Markdown rules, instructions, flavor text (up to 4000 chars)
- **Image**: URL for gallery display
- **Accent Color**: For the richCard container
- **Creation Host**: Who designs/plans the challenge (user select)
- **Running Host**: Who posts and manages it live (user select, can be same person)
- **Season link**: Optional association to a specific season

The Season Planner gives you the schedule. Challenges gives you the content. They link via `challengeIDs` on each round.

---

## 3. Data Model

### Storage: `playerData.json`

New guild-level key `challenges`:

```javascript
"challenges": {
  "challenge_a1b2c3d4e5f6": {
    "title": "Tycoons of the Nile",
    "description": "Build your trading empire along the Nile...",
    "image": "https://i.ibb.co/...",
    "accentColor": 14502932,
    "creationHost": "391415444084490240",
    "runningHost": "123456789012345678",
    "seasonId": "season_cac1b81de8914c79",    // optional season link
    "createdAt": 1773520842818,
    "lastUpdated": 1773520842818
  }
}
```

### Round Linkage

Each round already has `challengeIDs: {}`. MVP linkage:

```javascript
// In seasonRounds[seasonId][roundId]:
"challengeIDs": {
  "primary": "challenge_a1b2c3d4e5f6"  // links to challenges object
}
```

When a challenge is linked, the round's string select shows the challenge title and host instead of "Challenge N (TBC)".

---

## 4. UI Flow

### Entry Point — Production Menu

```
Castlists, Applications and Season Management
📋 Castlist Manager | 📅 Season Planner | 📝 Apps | 🧑‍🤝‍🧑 Players

Idol Hunts, Challenges and Safari
🏪 Stores | 📦 Items | 🧭 Player Admin | 🏃‍♀️ Challenges | 💰 Currency

Advanced Features
🗺️ Map Admin | ⚡ Actions | 🪛 Tools | ⚙️ Settings | 💎 Tycoons | ☕ Donate
```

- Rename current `safari_rounds_menu` (Challenges) to **💎 Tycoons**, move to Advanced Features
- New **🏃‍♀️ Challenges** button stays in Safari row

### Challenge Management Screen

Entity Edit Framework pattern (like `admin_manage_player`):

```
## 🏃‍♀️ Challenges

[String Select: Create New | Search | Challenge 1 | Challenge 2 ...]

───────────────────
[RichCard Preview — title, description, image, accent color]
───────────────────

✏️ Edit | 📅 Assign to Round | 📤 Post to Channel | 🗑️ Delete
← Menu
```

**String select ordering**: By linked round number (F18→F1), then by planned start date, then alphabetically by title.

### Create/Edit Challenge Modal (5 fields)

Uses richCard modal pattern + user select for host:

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | Challenge Title | TextInput (short) | Required, max 100 chars |
| 2 | Description | TextInput (paragraph) | Optional, max 4000 chars, markdown |
| 3 | Image URL | TextInput (short) | Optional, for gallery |
| 4 | Accent Color | TextInput (short) | Optional, hex or name (parseAccentColor) |
| 5 | Planning Host | User Select | Who designs this challenge |

Running Host set separately (or defaults to Planning Host).

### From Season Planner — Round Integration

Each round's string select already has `edit_challenge` (currently deferred). Wire it to:

1. If round has a linked challenge → show richCard preview with "Edit" and "Unlink" options
2. If no challenge linked → show challenge selector (existing challenges + "Create New")

The round's summary label changes from `Challenge N (TBC)` to the actual challenge title when linked.

### Post to Channel

RichCard rendered as a public Components V2 message:

```javascript
{
  type: 17,
  accent_color: challenge.accentColor,
  components: [
    { type: 10, content: `## ${challenge.title}\n\n${challenge.description}` },
    ...(challenge.image ? [{ type: 12, items: [{ media: { url: challenge.image } }] }] : []),
  ]
}
```

---

## 5. Implementation Phases

### Phase 1: Challenge Entity + CRUD (MVP)

1. Add `challenges` key to playerData at guild level
2. Build challenge management screen (entity select + richCard preview)
3. Create/Edit modal using richCardUI.js patterns
4. Post to Channel button
5. Button in Production Menu (new Challenges button in Safari row)
6. Rename safari_rounds_menu to Tycoons, move to Advanced Features

### Phase 2: Round Linkage

1. Wire `edit_challenge` in Season Planner round select
2. Challenge selector (assign existing or create new)
3. Update round display: title/host from linked challenge
4. Update schedule/calendar images: show challenge names from linked data
5. "Assign to Round" from challenge management screen

### Phase 3: Host Assignment

1. Running Host user select (separate from Creation Host)
2. Host display in round string select descriptions
3. Host filtering in challenge list

### Phase 4: Actions ↔ Challenges Integration (Backlog — the big vision)

The ultimate goal: **combine the Actions Engine with Challenges** so hosts can assign Custom Actions that automate challenge gameplay. This replaces the manual spreadsheet labor that hosts currently do.

**Architecture**: Many-to-many association between challenges and actions.

```javascript
// In challenge data:
"actionIds": ["action_abc", "action_def"]  // linked Custom Actions

// Each action can be reused across challenges
// Actions already support: give/take items, currency, conditions, schedules
```

**What this enables:**
- A "Tycoons" challenge links to actions for: dice roll, yield calculation, attack resolution
- A "Forbidden Island" challenge links to actions for: map movement, item pickup
- A "Democracy" challenge links to a single voting action
- Actions are reusable — "Give Currency" action works in any challenge

**Current state:** The existing Tycoons (`safari_rounds_menu`) is a hardcoded challenge with hardcoded actions (processRoundResults, calculateRoundProbability, processAttackQueue). The Action Editor already supports most of these as configurable outcomes. The gap is the linking layer.

**Backlog items under this phase:**
1. Challenge → Action association UI (multi-select from existing actions)
2. "Run Challenge" button that executes linked actions in sequence
3. Dice Rolls / probability configuration (currently hardcoded as good/bad events)
4. Per-round variable overrides (challenge variables scoped to a round)
5. Results posting (auto-format results as a public message)
6. Community library (export challenge + its actions as a template, import on another server)

### Phase 5: Placements Integration (Far Future)

Link round completions to player placements:

```javascript
// When a player is eliminated at F18:
playerData[guildId].applications[appId].placement = 18;
// "Final 18" — the round they were eliminated in
```

Placements are correlated with rounds via F-number. Season Planner's `currentSeasonRoundID` advances as the season progresses, and the eliminated player gets the F-number as their placement.

---

## 6. Key Architectural Decisions

### Challenges are standalone (soft dependency on rounds)

Challenges **do not require** a round to exist. A host can create challenges without any season or round setup. The round linkage is optional — `challengeIDs.primary` on a round points to a challenge, but the challenge doesn't point back (no `roundId` on the challenge). This means:
- Challenges work as a standalone content planning tool
- Rounds can optionally pull in challenge data
- A challenge can exist unassigned (planned but not scheduled)
- Deleting a round doesn't delete the challenge

### Entity Edit Framework for challenge management

The challenge list screen uses Entity Edit Framework (`entityManagementUI.js`) for:
- **Search**: Critical for servers with 25+ challenges (bypasses Discord's 25-option select limit)
- **CRUD pattern**: Consistent with stores, items, actions
- **Scalability**: Handles hundreds of challenges via search/filter

### Relationship to Existing Systems

| System | Relationship |
|---|---|
| **Season Planner** | Rounds optionally link to challenges via `challengeIDs.primary`. Challenge name/host shown in round selects and schedule images |
| **richCardUI.js** | Challenge create/edit uses `buildRichCardModal`, preview uses `buildRichCardContainer` |
| **Entity Edit Framework** | Challenge list screen uses entity select + search for 25+ challenges |
| **Custom Actions** | Future: many-to-many association. Challenges link to actions that automate gameplay |
| **Safari Rounds (Tycoons)** | Old hardcoded system stays as-is, renamed to Tycoons. Challenges is the decoupled replacement |
| **Placements** | Future: round F-number = player placement on elimination |

---

## 7. What NOT to Build (Yet)

- Challenge → Action association (Phase 4)
- "Run Challenge" automated execution
- Probability/dice roll configuration
- Good/bad event types
- Per-round variable overrides
- Community library import/export
- Tribal Council entity (far future)
- Placement tracking (Phase 5)

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Challenge count exceeds 25 (string select limit) | Medium | Entity Edit Framework with search |
| richCard modal at 5-field limit | Low | Host assignment as separate flow if needed |
| Challenge data bloats playerData.json | Low | ~500 bytes per challenge, negligible |
| Tycoons rename breaks existing buttons | Low | Keep handler ID `safari_rounds_menu`, just change label |
| Action association complexity | Low | Many-to-many is just an array of IDs, no schema changes needed |

---

## 9. Original Context

User's detailed spec covered both season rounds (now built as Season Planner) and challenges. Key quotes:

> "Introduce new challenge data structure per-server which allows title / description / media saving and posting / creation to a channel"

> "Enable a 0:1 association of a challenge to a Custom Action"

> "A seasonRound can have exactly one challenge (and vice versa)"

> "Use this new richCard UI as the base UI below the string select"

The season rounds portion is complete. This RaP covers the challenge entity layer that sits on top.
