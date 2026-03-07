# UI/UX Prototyping & Wireframing in Discord

## The Insight

We don't need wireframing tools. Discord **is** the wireframe tool.

CastBot's UI is built entirely with Discord Components V2 — containers, text displays, buttons, selects, separators. These are the same primitives in the mockup and the final product. There's no translation layer, no "this Figma rectangle becomes that Discord component" — what you see in the prototype is exactly what ships.

## Approach

Build UI mockups as **real Discord interactions** inside the `Reece's Stuff` experimental menu. Every mockup:

1. **Renders in Discord** — test layout, spacing, readability, and mobile behavior with real components
2. **Uses no-op handlers** — buttons and selects respond but don't modify data
3. **Lives in its own module** — extracted from app.js into a dedicated file (e.g., `selectStressTest.js`)
4. **Is clearly labelled** — button labels include `(Mockup)`, IDs include `_mockup`, comments reference this doc
5. **Validates limits** — `countComponents()` and `validateComponentLimit()` catch the 40-component ceiling during development, not after deployment

## Why This Works

| Traditional Wireframing | Discord-Native Prototyping |
|---|---|
| Static screenshots in Figma | Interactive prototype in Discord |
| Guess how 5 buttons fit in a row | See exactly how they render |
| Estimate text truncation | See real placeholder length limits |
| Hope mobile looks ok | Test on mobile immediately |
| Translate wireframe to code later | Mockup IS the code skeleton |
| Components counted manually | `validateComponentLimit()` enforces 40-cap |

## What You Learn From Prototyping

The Season Planner mockup discovered these constraints through iteration:

- **40 component limit** is the hard ceiling — every Container, ActionRow, Button, Select, Separator, and TextDisplay counts recursively
- **String Select placeholder** text is the primary information-dense element — it displays round number, date, event type, and status in a single line (e.g., `1. F24 ⦁ Sat 7 Mar ⦁ Marooning ⦁ Challenge 1`)
- **12 selects per page** is the practical max when you need a header, contextual action buttons, navigation, and separators (37/40 components)
- **Text Display content limit** is 4096 characters but multi-byte Unicode (like `⦁`) counts as 3 bytes in the payload — Discord may reject at fewer JS characters than expected
- **Pagination with prev/next** is simple: encode page number in `custom_id` (e.g., `stress_page_1`), disable at boundaries
- **Contextual buttons** (Edit, Schedule, Applications, Ranking) belong near the top — below the header, above the scrollable content

## Creating a New Mockup

### 1. Create the module

```javascript
// myFeatureMockup.js

/**
 * My Feature (Mockup) — UI prototype for [feature description]
 *
 * THIS IS A UI MOCKUP ONLY — not a real feature implementation.
 * All buttons and selects are no-ops with placeholder data.
 * See docs/ui/UIPrototyping.md for the prototyping approach.
 *
 * When productionizing: replace dummy data with real data,
 * wire buttons to actual handlers, and move to a feature module.
 */

import { countComponents, validateComponentLimit } from './utils.js';

export function buildMyFeaturePage() {
  const container = {
    type: 17, accent_color: 0x3498DB,
    components: [
      // Build your UI here
    ]
  };

  countComponents([container], { verbosity: "full", label: "My Feature (Mockup)" });
  validateComponentLimit([container], "My Feature (Mockup)");

  return { components: [container] };
}
```

### 2. Add button to Reece's Stuff

In `app.js`, add to the Experimental section:
```javascript
{ type: 2, custom_id: 'reeces_myfeature_mockup', label: 'My Feature (Mockup)', style: 1, emoji: { name: '🎨' } }
```

### 3. Add handler in app.js

```javascript
} else if (custom_id === 'reeces_myfeature_mockup') {
  // My Feature (Mockup) — UI prototype. See docs/ui/UIPrototyping.md
  return ButtonHandlerFactory.create({
    id: 'reeces_myfeature_mockup',
    updateMessage: true,
    handler: async (context) => {
      const { buildMyFeaturePage } = await import('./myFeatureMockup.js');
      return buildMyFeaturePage();
    }
  })(req, res, client);
}
```

### 4. Register in BUTTON_REGISTRY

```javascript
'reeces_myfeature_mockup': {
  label: 'My Feature (Mockup)',
  description: 'UI mockup: [description]. Not a real feature.',
  emoji: '🎨',
  style: 'Primary',
  parent: 'reeces_stuff',
  restrictedUser: '391415444084490240',
  category: 'experimental'
},
```

### 5. Iterate in Discord

Run `dev-restart.sh`, click the button, see the result, adjust, repeat. The feedback loop is seconds, not hours.

## Productionizing a Mockup

When a mockup is approved:

1. **Rename** — remove `(Mockup)` / `_mockup` from labels, IDs, and filenames
2. **Wire data** — replace dummy arrays with real data sources (e.g., `loadPlayerData()`, `loadSafariContent()`)
3. **Wire handlers** — replace no-op button/select handlers with real business logic
4. **Move module** — from root to appropriate feature location if needed
5. **Update registries** — BUTTON_REGISTRY descriptions, buttonDetection patterns
6. **Keep the component budget** — the mockup already validated layout fits within 40 components

The mockup's component structure, pagination logic, and navigation patterns carry forward unchanged.

## Season Planner — Date Calculation Rules

These rules govern how round dates are calculated. When productionized, dates should be computed dynamically from a season start date and round configuration.

### Core Concepts

A **season** consists of sequential **rounds**. Each round has a **finalist count** (F24, F23, ... F1) that decreases as players are eliminated. Rounds occupy real calendar days — the schedule is contiguous with no gaps.

### Round Types & Duration

| Round Type | Duration | Contains | Example |
|---|---|---|---|
| **Marooning** | 3 days | Marooning (day 1), Challenge (day 2), Tribal (day 3) | Sat 7 → Sun 8 → Mon 9 Mar |
| **Standard** | 2 days | Challenge (day 1), Tribal (day 2) | Tue 10 → Wed 11 Mar |
| **FTC** | 2 days | Final Tribal Council (day 1), deliberation (day 2) | — |
| **Reunion** | 1 day | Reunion event | — |

### Date Calculation Algorithm

```
Given: season_start_date (e.g., Sat 7 Mar 2026)

Round 1 (Marooning):
  round_date     = season_start_date              → Sat 7 Mar
  challenge_date = season_start_date + 1 day      → Sun 8 Mar
  tribal_date    = season_start_date + 2 days     → Mon 9 Mar
  next_available = season_start_date + 3 days     → Tue 10 Mar

Round N (N > 1, standard):
  round_date     = previous_round.next_available  → Tue 10 Mar (for round 2)
  challenge_date = round_date                     → same day
  tribal_date    = round_date + 1 day             → Wed 11 Mar
  next_available = round_date + 2 days            → Thu 12 Mar
```

In code (`selectStressTest.js`):
```javascript
function calcRoundStart(roundIndex) {
  if (roundIndex === 0) return startDay;                        // Marooning: day 1
  return startDay + 3 + (roundIndex - 1) * 2;                  // 3 days for marooning, then 2 per round
}

// Marooning round: challenge = start + 1, tribal = start + 2
// Standard round:  challenge = start,     tribal = start + 1
```

### String Select Option Structure Per Round

**Marooning round (F24)** — Marooning promoted to 2nd position:
```
1. 🏝️ F24 ⦁ Sat 7 Mar ⦁ Marooning ⦁ Challenge 1    [default selected]
2. 🏝️ Manage Marooning & Exile                        | Sat 7 Mar
3. 🤸 Edit Challenge 1 (TBC)                           | Sun 8 Mar ⦁ Reece
4. 🔥 Edit F24 Tribal (1 elim)                         | Mon 9 Mar ⦁ Reece
5.    ───────────────────                               | (divider)
6. 🔀 Add Swap / Merge
```

**Standard rounds (F23 onwards)** — Marooning below divider:
```
1.    F23 ⦁ Tue 10 Mar ⦁ Challenge 2 (TBC)            [default selected]
2. 🤸 Edit Challenge 2 (TBC)                           | Tue 10 Mar ⦁ Reece
3. 🔥 Edit F23 Tribal (1 elim)                         | Wed 11 Mar ⦁ Reece
4.    ───────────────────                               | (divider)
5. 🏝️ Manage Marooning & Exile
6. 🔀 Add Swap / Merge
```

**Special rounds:**
- **F2 (FTC)**: `F2 (FTC) ⦁ {date} ⦁ Final Tribal Council`
- **F1 (Reunion)**: `F1 ⦁ {date} ⦁ Reunion`

### Option Field Mapping

| Field | Usage |
|---|---|
| `label` | Primary action text (e.g., "Edit Challenge 2 (TBC)") |
| `description` | Date and assigned host (e.g., "Tue 10 Mar ⦁ Reece") |
| `emoji` | Action type icon (🏝️ marooning, 🤸 challenge, 🔥 tribal, 🔀 swap) |
| `default: true` | Round summary line — pre-selected so it displays as the select's visible value |
| `value` | Action identifier (`summary`, `edit_challenge`, `edit_tribal`, `marooning`, `swap_merge`, `divider`) |

### Productionization Notes

When building the real Season Planner:
- **Season start date** should come from season config data, not hardcoded
- **Round count** derives from cast size (e.g., 24 players = 24 rounds including FTC/Reunion)
- **Marooning flag** should be per-round config (not always round 1)
- **Host assignment** ("Reece") should pull from round config, not hardcoded
- **Eliminations per tribal** ("1 elim") should be configurable (double eliminations, no-elim rounds)
- **Swap/Merge events** could be flagged on specific rounds, changing the option layout
- **Challenge names** replace "(TBC)" as they're confirmed
- The divider option (`───────────────────`) separates contextual actions (edit this round) from structural actions (marooning/swap that could apply to any round)

## Existing Mockups

| Mockup | Module | Button ID | Components |
|---|---|---|---|
| Season Planner | `selectStressTest.js` | `reeces_season_planner_mockup` | 37/40 (2 pages, 12 selects each) |
| Rich Card Demo | inline in `app.js` | `richcard_demo` | ~15/40 |

## Related Documentation

- **[LeanUserInterfaceDesign.md](LeanUserInterfaceDesign.md)** — Visual standards all mockups must follow
- **[ComponentsV2.md](../standards/ComponentsV2.md)** — Component types and limits
- **[MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md)** — Menu patterns and `countComponents` logging
- **[ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)** — Handler patterns for mockup buttons
