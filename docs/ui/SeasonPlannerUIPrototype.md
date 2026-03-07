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
| **Swap / Merge** | 1 | Swap or Merge event | — | — |
| **Standard** | 2 | Challenge | Tribal Council | — |
| **FTC** | 2 | Final Tribal Council | Deliberation | — |
| **Reunion** | 1 | Reunion event | — | — |

### Date Calculation

Rounds are **contiguous** — no gaps between them. Each round starts the day after the previous round ends.

```
season_start = Sat 7 Feb 2026 (example)

Round 1 (F24, Marooning, 3 days):
  marooning_date = start                    → Sat 7 Feb
  challenge_date = start + 1                → Sun 8 Feb
  tribal_date    = start + 2                → Mon 9 Feb

Round 2 (F23, Standard, 2 days):
  challenge_date = prev_round_end + 1       → Tue 10 Feb
  tribal_date    = challenge_date + 1       → Wed 11 Feb

Round 3 (F22, Merge, 3 days):
  merge_date     = prev_round_end + 1       → Thu 12 Feb
  challenge_date = merge_date + 1           → Fri 13 Feb
  tribal_date    = challenge_date + 1       → Sat 14 Feb

Cumulative calculation:
  round_start(i) = start + sum(duration(round_1..round_i-1))
  duration = 3 for marooning/event rounds, 2 for standard, 1 for reunion
```

### Special Rounds

- **Marooning** (typically round 1): Only round with a 3-day span. Marooning event is promoted to 2nd option in its select dropdown.
- **Swap / Merge** (mid-game): Takes a full day. Inserted between rounds — pushes all subsequent dates forward by 1 day. No challenge or tribal on this day.
- **FTC** (F2): Labelled `F2 (FTC)`. Final Tribal Council replaces the normal challenge.
- **Reunion** (F1): Single event, no challenge or tribal.

### Defaults & Future Exceptions

The mockup uses these **defaults** which cover the majority of rounds:

| Default | Value | Notes |
|---|---|---|
| Marooning duration | 1 day (within a 3-day round) | The marooning event itself is 1 day; challenge + tribal add 2 more |
| Tribal duration | 1 day | Always the final day of a round |
| Tribal eliminations | 1 per round | F-number decreases by 1 each round |
| Swap/Merge duration | 1 day | Inserted as a standalone event day |

**Known exceptions to handle in production** (not yet modelled):

- **Double Tribal Council** — eliminates 2 players in one round (e.g., F17 → F15, skipping F16). Affects F-number progression for all subsequent rounds.
- **No-elimination rounds** — tribal happens but nobody goes home (e.g., a quit is reversed). F-number stays the same.
- **Double-length rounds** — a round could span 3+ days for special events beyond marooning.
- **Variable eliminations** — some rounds may eliminate 3+ players (tribe decimation, rock draws with multiple exits).

These exceptions change date calculations and F-number progression. We'll design the data model to support them when productionizing — for now, the mockup assumes 1 elimination per standard round.

## String Select Structure

Each round is one string select. The **first option is default-selected**, so the round summary displays as the select's visible value (placeholder is never seen).

### Option Ordering Rule

If a round has a **configured event** (marooning, swap, or merge), that event appears as the **2nd option** with a date in the description. Unconfigured structural actions stay below the divider without dates.

### Marooning Round (F24)
```
1. [default] 🏝️ F24 ⦁ Sat 7 Feb ⦁ Marooning ⦁ Challenge 1
2. 🏝️ Manage Marooning & Exile          | Sat 7 Feb
3. 🤸 Edit Challenge 1 (TBC)             | Sun 8 Feb ⦁ Reece
4. 🔥 Edit F24 Tribal (1 elim)           | Mon 9 Feb ⦁ Reece
5.    ─────────────────── (divider)
6. 🔀 Add Swap / Merge
```

### Event Round (F22 Merge, F16 Swap 1, F13 Swap 2)
```
1. [default] 🔀 F22 ⦁ Thu 12 Feb ⦁ Merge ⦁ Challenge 3 (TBC)
2. 🔀 Manage Merge                        | Thu 12 Feb
3. 🤸 Edit Challenge 3 (TBC)             | Fri 13 Feb ⦁ Reece
4. 🔥 Edit F22 Tribal (1 elim)           | Sat 14 Feb ⦁ Reece
5.    ─────────────────── (divider)
6. 🏝️ Manage Marooning & Exile
```

### Standard Round (F23, F21, etc.)
```
1. [default]  F23 ⦁ Tue 10 Feb ⦁ Challenge 2 (TBC)
2. 🤸 Edit Challenge 2 (TBC)             | Tue 10 Feb ⦁ Reece
3. 🔥 Edit F23 Tribal (1 elim)           | Wed 11 Feb ⦁ Reece
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

20 rounds across 2 pages (12 per page). Top action row provides season-level navigation.

## Data Model Options for Productionization

When productionizing, the key architectural decision is how to store round configuration so it survives cast size changes (e.g., host decides to drop from 20 to 16 players mid-planning).

### The Problem

The mockup keys events by **round number** (`ROUND_EVENTS[5] = Swap 1`). Round numbers are derived from cast size (`roundNum = castSize + 1 - finalists`). If the host changes cast size, round numbers shift and all event/challenge assignments break.

### Option A: Key Everything by F-Number

Store all round config keyed by F-number (finalist count). Compute round numbers at render time.

```javascript
// Season config
{
  castSize: 20,
  startDate: '2026-02-07',
  rounds: {
    20: { events: ['marooning'], challenge: 'Olympic Boot Camp', host: 'Reece', elims: 1 },
    19: { challenge: 'Verbal Jigsaw', host: 'Reece', elims: 1 },
    16: { events: ['swap'], swapLabel: 'Swap 1', challenge: 'Worthy Sacrifice', host: 'Reece', elims: 1 },
    13: { events: ['swap'], swapLabel: 'Swap 2', challenge: 'Stack Shit', host: 'Reece', elims: 1 },
    11: { events: ['merge'], challenge: null, host: 'Reece', elims: 1 },
    2:  { events: ['ftc'], host: 'Reece' },
    1:  { events: ['reunion'] },
  }
}
```

**Pros:** Events stay anchored to cast size. Dropping from F20→F16 = delete F20-F17 entries, everything below is untouched. Challenge names, hosts, and events are stable.

**Cons:** Need validation that F-numbers exist within cast range. Round ordering is implicit (sort by F-number descending). Sparse — rounds without config need defaults.

### Option B: Ordered Array of Round Objects

Each round is a fully self-contained config object in an ordered array.

```javascript
{
  castSize: 20,
  startDate: '2026-02-07',
  rounds: [
    { finalists: 20, type: 'marooning', challenge: 'Olympic Boot Camp', host: 'Reece', elims: 1 },
    { finalists: 19, challenge: 'Verbal Jigsaw', host: 'Reece', elims: 1 },
    { finalists: 16, events: ['swap'], swapLabel: 'Swap 1', challenge: 'Worthy Sacrifice', host: 'Reece', elims: 1 },
    // ...
  ]
}
```

**Pros:** Full flexibility. Round order is explicit. Each round is self-contained — no need for defaults. Easy to reorder, insert, or remove rounds. Supports non-standard F-progressions (double elims skip F-numbers).

**Cons:** More data to manage. Manual reordering on changes. Must keep `finalists` values consistent with `elims` (F20 with 1 elim → next must be F19).

### Option C: Template + Overrides

Store only cast size and structural rules. Auto-generate the default round list, then apply overrides.

```javascript
{
  castSize: 20,
  startDate: '2026-02-07',
  rules: {
    marooning: 'first',           // always round 1
    ftc: 'penultimate',           // always second-to-last
    reunion: 'last',              // always last
  },
  events: {
    16: { type: 'swap', label: 'Swap 1' },
    13: { type: 'swap', label: 'Swap 2' },
    11: { type: 'merge' },
  },
  challengeOverrides: {
    20: 'Olympic Boot Camp',
    19: 'Verbal Jigsaw',
    // ...
  }
}
```

**Pros:** Minimal data. Changing cast size auto-regenerates the full round list. Events and challenges are overrides, not the source of truth. Works well for "normal" seasons.

**Cons:** Less control over edge cases. Double tribals and non-standard progressions need special handling in the generator. The generator becomes complex logic that's hard to debug.

### Recommendation

**Option A (F-number keyed)** is the best balance for CastBot:
- F-numbers are the domain language hosts already think in ("the swap happens at F16")
- Survives cast size changes without data migration
- Sparse storage with sensible defaults means minimal config for standard rounds
- Challenge names and events stay bound to the right round automatically
- Delete top entries to shrink cast, add entries to grow it

Option B is better if we need non-standard F-progressions (double elims where F17→F15). Option C is better if seasons are highly templated with few overrides.

## Productionization Checklist

When building the real feature, these mockup values become dynamic:

- [ ] **Season start date** from season config (not hardcoded `Sat 7 Feb`)
- [ ] **Cast size / round count** from season data (not hardcoded 20)
- [ ] **Marooning flag** per-round config (not always round 1)
- [ ] **Host name** ("Reece") from round assignment data
- [ ] **Eliminations** ("1 elim") configurable per round (double elims, no-elim rounds)
- [ ] **Challenge names** from round config (mockup uses spreadsheet data for F20-F12, TBC for rest)
- [ ] **Swap/Merge** from round config (not hardcoded F16 Swap 1, F13 Swap 2, F11 Merge)
- [ ] **Top action buttons** wired to real handlers (Edit Season, Schedule, Apps, Ranking, Tribes)
- [ ] **Select handlers** perform actual edits instead of no-op responses
