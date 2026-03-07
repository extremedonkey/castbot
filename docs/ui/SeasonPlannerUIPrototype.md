# Season Planner UI Prototype

> **Prototyping approach**: See [UIPrototyping.md](UIPrototyping.md) for the general Discord-native prototyping methodology.
> **Implementation**: `selectStressTest.js` | Button: `reeces_season_planner_mockup` | 37-38/40 components per page

## Purpose

A paginated round-by-round planner for Survivor-style seasons. Each round is a **string select** whose default-selected option shows the round summary, and whose dropdown reveals contextual edit actions.

## Domain Context

### What is a Season?

A season (e.g., "S12: Sacred Band of Thebes") is a series of sequential rounds where players are eliminated. Seasons have:
- A **cast** of players (e.g., 24)
- A **start date** (marooning day)
- A **host** (person running each challenge/tribal)
- **Rounds** that count down from F{cast_size} to F1

### Finalist Count (F-Number)

`F` = number of players remaining at the start of a round. F24 means 24 players, F1 is the reunion. The count decreases by the number of eliminations per round (usually 1).

## Round Types & Scheduling Rules

### Duration by Type

| Round Type | Days | Day 1 | Day 2 | Day 3 |
|---|---|---|---|---|
| **Marooning** | 3 | Marooning event | Challenge | Tribal Council |
| **Standard** | 2 | Challenge | Tribal Council | — |
| **FTC** | 2 | Final Tribal Council | Deliberation | — |
| **Reunion** | 1 | Reunion event | — | — |

### Date Calculation

Rounds are **contiguous** — no gaps between them. Each round starts the day after the previous round ends.

```
season_start = Sat 7 Mar 2026 (example)

Round 1 (Marooning, 3 days):
  marooning_date = start                    → Sat 7 Mar
  challenge_date = start + 1                → Sun 8 Mar
  tribal_date    = start + 2                → Mon 9 Mar

Round 2+ (Standard, 2 days each):
  challenge_date = prev_round_end + 1       → Tue 10 Mar
  tribal_date    = challenge_date + 1       → Wed 11 Mar

Formula: round_start(i) = start + 3 + (i-1) * 2  [for i > 0]
```

### Special Rounds

- **Marooning** (typically round 1): Only round with a 3-day span. Marooning event is promoted to 2nd option in its select dropdown.
- **FTC** (F2): Labelled `F2 (FTC)`. Final Tribal Council replaces the normal challenge.
- **Reunion** (F1): Single event, no challenge or tribal.

## String Select Structure

Each round is one string select. The **first option is default-selected**, so the round summary displays as the select's visible value (placeholder is never seen).

### Marooning Round (F24)
```
1. [default] 🏝️ F24 ⦁ Sat 7 Mar ⦁ Marooning ⦁ Challenge 1
2. 🏝️ Manage Marooning & Exile          | Sat 7 Mar
3. 🤸 Edit Challenge 1 (TBC)             | Sun 8 Mar ⦁ Reece
4. 🔥 Edit F24 Tribal (1 elim)           | Mon 9 Mar ⦁ Reece
5.    ─────────────────── (divider)
6. 🔀 Add Swap / Merge
```

### Standard Round (F23, F22, etc.)
```
1. [default]  F23 ⦁ Tue 10 Mar ⦁ Challenge 2 (TBC)
2. 🤸 Edit Challenge 2 (TBC)             | Tue 10 Mar ⦁ Reece
3. 🔥 Edit F23 Tribal (1 elim)           | Wed 11 Mar ⦁ Reece
4.    ─────────────────── (divider)
5. 🏝️ Manage Marooning & Exile
6. 🔀 Add Swap / Merge
```

### Option Fields

| Field | Purpose | Example |
|---|---|---|
| `label` | Action text | `Edit Challenge 2 (TBC)` |
| `description` | Date + host | `Tue 10 Mar ⦁ Reece` |
| `emoji` | Type icon | 🤸 challenge, 🔥 tribal, 🏝️ marooning, 🔀 swap |
| `default` | Pre-selects round summary | Only on option 1 |

The **divider** separates round-specific actions (top) from structural actions (bottom) that could apply to any round.

## Page Layout (37-38/40 components)

```
## 📝 Season Planner | S12: Sacred Band of Thebes
━━━━━━━━━━
[✏️ Edit] [📅 Schedule] [📝 Apps] [🏆 Ranking] [🔥 Tribes]
[12 string selects — rounds for this page]
━━━━━━━━━━
[← Reece's Stuff] [◀ Previous] [Next ▶]
```

24 rounds across 2 pages (12 per page). Top action row provides season-level navigation.

## Productionization Checklist

When building the real feature, these mockup values become dynamic:

- [ ] **Season start date** from season config (not hardcoded `Sat 7 Mar`)
- [ ] **Cast size / round count** from season data (not hardcoded 24)
- [ ] **Marooning flag** per-round config (not always round 1)
- [ ] **Host name** ("Reece") from round assignment data
- [ ] **Eliminations** ("1 elim") configurable per round (double elims, no-elim rounds)
- [ ] **Challenge names** replace "(TBC)" as confirmed
- [ ] **Swap/Merge** flagged on specific rounds, changing option layout
- [ ] **Top action buttons** wired to real handlers (Edit Season, Schedule, Apps, Ranking, Tribes)
- [ ] **Select handlers** perform actual edits instead of no-op responses
