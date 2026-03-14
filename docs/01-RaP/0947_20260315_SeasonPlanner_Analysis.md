# Season Planner — Transform & Decouple from Applications

> **RaP #0947** | 2026-03-15
> **Status**: Specification — ready to build
> **Related**: [SeasonPlannerUIPrototype.md](../ui/SeasonPlannerUIPrototype.md) (working mockup), [SeasonLifecycle.md](../concepts/SeasonLifecycle.md), [SeasonAppBuilder.md](../03-features/SeasonAppBuilder.md)
> **Mockup**: `selectStressTest.js` | Button: `reeces_season_planner_mockup` in Reece's Stuff

---

## Original Context (User Prompt)

> Transform and decouple the existing Season concept tied to applications to a general "Season Planner", allowing hosts to plan out how long their season will be, how many rounds, how many challenges, etc.

---

## 1. Problem Statement

Seasons are currently tightly coupled to the application system. The data lives inside `applicationConfigs` in `playerData.json`, and the UI entry point is the "Apps" button (`season_management_menu`). This means:

- You can't plan a season without setting up applications first
- Season structure (rounds, swaps, merge, FTC) has no home in the data model
- The "Apps" button name doesn't communicate what the feature actually does
- Round scheduling, challenge assignment, and tribal configuration are all manual/external

The Season Planner decouples season **planning** from season **applications**, introducing a round-based data structure that supports scheduling, challenge linking, and future features like placements.

---

## 2. Development Approach — Parallel Build

**The existing Season Apps flow is untouched.** The Season Planner is built as a completely separate, parallel feature accessible from Reece's Stuff. This allows:

- Zero risk to production Season Apps flow
- Iterative development behind an existing experimental button
- Feature toggle to Production Menu when ready (just move the button)
- Easy rollback — delete the new code, existing flow is unaffected

### Architecture

```
EXISTING (unchanged):
  Production Menu → 📝 Apps → season_management_menu
    → entity_select_seasons → buildQuestionManagementUI

NEW (parallel):
  Reece's Stuff → 📝 Season Planner → reeces_season_planner_mockup
    → entity_select_seasons (reused) OR new season selector
      ├─ [Existing season WITHOUT planner data] → Force setup modal (collect new fields)
      ├─ [Existing season WITH planner data] → Season Planner view (rounds UI)
      └─ [Create New Season] → New create modal (5 fields) → auto-generate rounds → Planner view
```

### Migration Path for Existing Seasons

If a user selects an existing season (created via Apps) that has no planner data (`estimatedTotalPlayers` etc.), the Season Planner flow forces the setup modal so they enter the required fields. This only happens in the parallel planner — the Apps flow is completely unaffected.

---

## 3. UI Flow

### Entry Point

The `reeces_season_planner_mockup` button in Reece's Stuff becomes the real entry point. On click:

1. Show season selector (reuse `seasonSelector.js` or build new)
2. Route based on season state (see architecture above)

### Create New Season — Modal (5 Fields)

All fields use the Label component (type 18) per ComponentsV2.md. Discord modals support exactly 5 text inputs — we're at the limit.

| # | Field | Label Text | Placeholder | Validation | Notes |
|---|---|---|---|---|---|
| 1 | Season Name | *(existing, no changes)* | — | Required | Nest in Label component |
| 2 | Estimated Number of Players | Enter your total estimated players you will cast | `18` | Required, max 2 chars, >0 | Includes FTC players (separate concept) |
| 3 | Estimated Number of Swaps | Enter number of swaps you have planned, no need to include merge | `2` | Required, max 1 char, >=0 | 0 is valid |
| 4 | Estimated FTC Players | Enter '2' for Final 2, '3' for final 3 — used to pre-populate data | `3` | Required, max 1 char, >0 | Determines where FTC round sits |
| 5 | Estimated Start Date | Enter in mm/dd/yyyy | `03/07/2026` | Required, date format | See timezone section below |

**Note:** Season Description (`explanatoryText`) is dropped from the modal — no room. Keep creating/storing with empty string default. Can be added as a separate edit flow later if needed.

### Post-Creation

On modal submit:
1. Create `applicationConfigs` entry with existing + new fields
2. Auto-generate `seasonRounds` skeleton (no confirmation step — make editing rounds easy instead)
3. Navigate directly to the Season Planner view (rounds UI)

---

## 4. Data Model

### Storage: `playerData.json`

All data stays in `playerData.json`. `seasonRounds` is a new guild-level key, **not** nested under `applicationConfigs` — allows future decoupling.

### Modified: `applicationConfigs` Entry

Existing fields unchanged. New fields added on creation:

```javascript
"config_1759634522896_391415444084490240": {
  // === EXISTING (no changes) ===
  "seasonId": "season_cac1b81de8914c79",       // UUID, used for cross-referencing
  "seasonName": "Season 12: Sacred Band",       // User-provided name
  "explanatoryText": "",                         // Removed from UI, stored as empty string

  // === NEW FIELDS ===
  "estimatedStartDate": 1772956800,             // Unix timestamp — display converted per user timezone
  "estimatedTotalPlayers": 18,                  // Total cast size INCLUDING FTC players. Enforced >0
  "estimatedSwaps": 2,                          // Number of planned tribe swaps (0 valid)
  "estimatedFTCPlayers": 3,                     // FTC size — separate concept from total players
  "currentSeasonRoundID": 1                     // Current active round, defaults to 1. Future: placements feature
}
```

### New: `seasonRounds`

```javascript
"seasonRounds": {
  "season_cac1b81de8914c79": {                  // Keyed by seasonId
    "r1": {                                      // Round ID: "r" + seasonRoundNo (human-readable, no insertion)
      "seasonRoundNo": 1,                        // Sequential round number, never changes
      "fNumber": 18,                             // F-number: players remaining at round start (= placement value)
      "exiledPlayers": 0,                        // Players in exile (future — not implemented)
      "marooningDays": 1,                        // 1 for round 1, 0 for all others
      "challengeIDs": {},                        // Future: linked challenge IDs
      "tribalCouncilIDs": {},                    // Future: linked tribal IDs
      "ftcRound": false,                         // Is this the Final Tribal Council round
      "swapRound": false,                        // Tribe swap occurs this round
      "mergeRound": false,                       // Tribe merge occurs this round
      "juryStart": false                         // Data-only: does jury start this round
    },
    "r2": {
      "seasonRoundNo": 2,
      "fNumber": 17,
      // ...
    },
    // ... through to reunion
    "r18": {
      "seasonRoundNo": 18,
      "fNumber": 1,                              // F1 = Reunion
      // ...
    }
  }
}
```

### Round ID Convention

**`r{seasonRoundNo}`** — e.g., `r1`, `r2`, `r14`, `r18`. Human-readable, sequential, no insertion needed. If the season structure changes, regenerate all rounds. This is simpler than UUIDs or zero-padded IDs and matches how hosts think ("round 5").

---

## 5. Auto-Generation Logic

### Round Generation

```javascript
function generateSeasonRounds(totalPlayers, numSwaps, ftcPlayers) {
  const rounds = {};
  // totalPlayers includes FTC players
  // Rounds: F{totalPlayers} down to F{ftcPlayers} (FTC), then F1 (reunion)
  // Total playable rounds = totalPlayers - ftcPlayers + 1 (FTC) + 1 (reunion)

  const swapFNumbers = getSwapFNumbers(totalPlayers, numSwaps);
  const mergeFNumber = getMergeFNumber(totalPlayers);

  let roundNo = 1;
  for (let f = totalPlayers; f >= ftcPlayers; f--) {
    rounds[`r${roundNo}`] = {
      seasonRoundNo: roundNo,
      fNumber: f,
      exiledPlayers: 0,
      marooningDays: (roundNo === 1) ? 1 : 0,
      challengeIDs: {},
      tribalCouncilIDs: {},
      ftcRound: (f === ftcPlayers),
      swapRound: swapFNumbers.includes(f),
      mergeRound: (f === mergeFNumber),
      juryStart: false
    };
    roundNo++;
  }

  // F1 Reunion
  rounds[`r${roundNo}`] = {
    seasonRoundNo: roundNo,
    fNumber: 1,
    exiledPlayers: 0,
    marooningDays: 0,
    challengeIDs: {},
    tribalCouncilIDs: {},
    ftcRound: false,
    swapRound: false,
    mergeRound: false,
    juryStart: false
  };

  return rounds;
}
```

### Swap Placement Algorithm

Swaps happen early — within the first few rounds after marooning. Pattern from real Survivor:

```javascript
function getSwapFNumbers(totalPlayers, numSwaps) {
  if (numSwaps === 0) return [];

  // First swap: 2-3 rounds in (after 2 eliminations typically)
  // e.g., 18 players → first swap at F16 (round 3)
  const firstSwapOffset = 2;  // 2 eliminations before first swap
  const swapSpacing = 2;      // 2 rounds between swaps

  const swaps = [];
  for (let i = 0; i < numSwaps; i++) {
    const fNumber = totalPlayers - firstSwapOffset - (i * swapSpacing);
    if (fNumber > 1) swaps.push(fNumber);
  }
  return swaps;
}

// Examples:
// 18 players, 2 swaps → [F16, F14]
// 20 players, 2 swaps → [F18, F16]
// 16 players, 1 swap  → [F14]
// 24 players, 2 swaps → [F22, F20]
```

### Merge Placement

Merge is typically between F12 and F10, regardless of cast size:

```javascript
function getMergeFNumber(totalPlayers) {
  // Merge at roughly 55-60% through the game
  // Clamp between F10 and F12 for standard seasons
  const target = Math.round(totalPlayers * 0.58);
  return Math.max(10, Math.min(12, target));
}

// Examples:
// 18 players → F10 (round(18 * 0.58) = 10)
// 20 players → F12 (round(20 * 0.58) = 12)
// 16 players → F10 (clamped from 9)
// 24 players → F12 (clamped from 14)
```

**These are best guesses.** Hosts will adjust via the Season Planner UI. The goal is a reasonable starting point, not perfection.

---

## 6. Timezone-Aware Date Display

### Approach

```
Input:  User enters date string in modal
Store:  Convert to Unix timestamp (midnight UTC of that date)
Display: Convert to user's timezone using their stored timezone role

Date FORMAT by region:
  If user timezone is UTC-3:30 to UTC-10 → mm/dd/yyyy (US convention)
  Else → dd/mm/yyyy (international convention)
```

Use Node.js `Intl.DateTimeFormat` with the user's IANA timezone from their timezone role mapping.

**Backlog item** — not blocking for initial build. Can hardcode mm/dd/yyyy for MVP.

---

## 7. Field Reference

| Field | Purpose | Default | Future Use |
|---|---|---|---|
| `currentSeasonRoundID` | Which round the season is currently in | `1` | Placements feature — determines who's still in the game |
| `exiledPlayers` | Players eliminated but not permanently out (Exile/Redemption Island) | `0` | Exile mechanics — don't count toward active player count |
| `challengeIDs` | Linked challenge objects | `{}` | Challenges feature (next major feature, 0-7 day horizon). MVP 1:1 per round |
| `tribalCouncilIDs` | Linked tribal council objects | `{}` | Far future (2-6+ months). Usually 1, can be 0 or multiple |
| `ftcRound` | Is this the Final Tribal Council round | `false` | Future FTC-specific structure |
| `juryStart` | Does the jury phase begin this round | `false` | Data-only for now — no feature planned |

---

## 8. What NOT to Change

- **Existing Apps flow** — `season_management_menu`, `buildQuestionManagementUI`, `create_new_season` modal all stay as-is
- **`applicationConfigs` key name** — remains for backwards compatibility
- **`seasonSelector.js`** — works as-is, can be reused
- **Button IDs** — `season_management_menu` keeps its current custom_id

---

## 9. Implementation Phases

### Phase 1: Parallel Build — Modal + Data + View

1. Build new create modal (`create_season_planner` or similar) with 5 fields
2. On submit: write new fields to `applicationConfigs` + auto-generate `seasonRounds`
3. Wire `reeces_season_planner_mockup` to show season selector → route to planner view
4. Handle existing seasons without planner data: force setup modal on selection
5. Wire mockup (`selectStressTest.js`) to read from real `seasonRounds` data
6. Tests: round generation, swap placement, date parsing

### Phase 2: Round Editing

1. Implement select handlers for round-specific actions (edit challenge, edit tribal, manage swap/merge)
2. Connect "Edit Season" modal to modify `applicationConfigs` fields
3. Make changing rounds easy (the whole point of skipping a confirmation step)

### Phase 3: Production Toggle

1. Add Season Planner button to Production Menu (alongside or replacing Apps)
2. Retire the mockup button from Reece's Stuff
3. Update `season_management_menu` label if replacing Apps entirely

### Phase 4: Challenge Integration (Future)

1. Link `challengeIDs` to the new Challenges system
2. Populate challenge names in Season Planner round selects
3. Host assignment per round

---

## 10. Backlog

- [ ] Timezone-aware date format detection (mm/dd vs dd/mm)
- [ ] Bulk cast size change — recalculate all rounds when `estimatedTotalPlayers` changes
- [ ] Live/hybrid tribal support in round data (see [mockup exceptions](../ui/SeasonPlannerUIPrototype.md#defaults--future-exceptions))
- [ ] Double tribal support (`fNumber` skips a value)
- [ ] FTC round structure (`ftcRound: true` → dedicated FTC data)
- [ ] Exile Island / Redemption mechanics via `exiledPlayers`
- [ ] Jury tracking via `juryStart`
- [ ] Season Description edit flow (dropped from modal due to 5-field limit)

---

## 11. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Modal field count (5) hits Discord limit | Low | At limit but all fields fit. Description dropped — add edit flow later |
| `seasonRounds` size in `playerData.json` | Low | ~1KB per season (18 rounds × ~60 bytes). Negligible |
| Existing seasons missing new fields | Medium | Planner flow forces setup modal. Apps flow unaffected |
| Swap/merge placement algorithm wrong | Low | Best-guess defaults, hosts adjust easily. Not permanent |
| Date parsing edge cases | Medium | Store as Unix timestamp. Hardcode mm/dd for MVP |
| Two create-season flows diverge | Low | Parallel build is temporary. Merge when planner replaces Apps |
| Round regeneration destroys edits | Medium | Warn user before regenerating. Only triggered by explicit action |
