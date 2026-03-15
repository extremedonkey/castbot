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

### Phase 4: Challenge Variables (Backlog — old Tycoons mechanics)

1. Dice Rolls configuration per challenge
2. Events (good/bad probability)
3. Action linkage (Custom Actions per challenge)
4. Per-round variable overrides
5. Community library (import/export)

---

## 6. Relationship to Existing Systems

| System | Relationship |
|---|---|
| **Season Planner** | Rounds link to challenges via `challengeIDs.primary`. Challenge name/host shown in round selects and schedule images |
| **richCardUI.js** | Challenge create/edit uses `buildRichCardModal`, preview uses `buildRichCardContainer` |
| **Entity Edit Framework** | Challenge management screen follows entity select + detail pattern |
| **Custom Actions** | Future: challenges can trigger actions. Not MVP |
| **Safari Rounds (Tycoons)** | Old system stays as-is, renamed to Tycoons. Challenges is the new, decoupled replacement |

---

## 7. What NOT to Build (Yet)

- Challenge rounds/sub-rounds (1:many actions per challenge)
- Probability/dice roll configuration
- Good/bad event types
- Per-round variable overrides
- Community library import/export
- Tribal Council entity (far future)
- Placement tracking (separate feature)

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Challenge count exceeds 25 (string select limit) | Medium | Pagination or search, same as season selector |
| richCard modal at 5-field limit | Low | Host assignment as separate flow if needed |
| Challenge data bloats playerData.json | Low | ~500 bytes per challenge, negligible |
| Tycoons rename breaks existing buttons | Low | Keep handler ID `safari_rounds_menu`, just change label |

---

## 9. Original Context

User's detailed spec covered both season rounds (now built as Season Planner) and challenges. Key quotes:

> "Introduce new challenge data structure per-server which allows title / description / media saving and posting / creation to a channel"

> "Enable a 0:1 association of a challenge to a Custom Action"

> "A seasonRound can have exactly one challenge (and vice versa)"

> "Use this new richCard UI as the base UI below the string select"

The season rounds portion is complete. This RaP covers the challenge entity layer that sits on top.
