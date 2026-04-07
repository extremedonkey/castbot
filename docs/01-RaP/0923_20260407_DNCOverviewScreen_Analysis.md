# DNC Overview Screen — Analysis & Design

> **Status: SHIPPED** — Deployed to production 2026-04-07. Feature doc: [docs/03-features/DNCOverview.md](../03-features/DNCOverview.md)

## Original Context

> In Cast Ranking (plus the associated paginations), I'd like to add a button to the right of 'Personal Ranker' called 'DNC List'. On click, leveraging LEAN UI design it displays a new ephemeral message that highlights where a particular applicant has added to their DNC list (keeping in mind most people will have an empty list so we don't want to clutter the UI), it shows them in a list + any reasons. And up the top implement some smart matching logic to identify WHERE there are crossovers e.g. reece (username extremedonkey) does not want to play with Dave (username serviver).. Shows prominently up the top of the list. This is a semi confidential feature so be sure to double check we are following our permissions model so only admins can click the button. Feel free to take any liberties in designing the UI or bells and whistles beyond what I've stated. In the future we may evolve this to include other 'global' applicant considerations such as Accommodations for Blindness etc. But for now we can brand as DNC. Lets ultrathink design this as a RaP.

## 🤔 The Problem

Cast Ranking already shows DNC warnings **per applicant** — a one-liner like "⚠️ This applicant has listed **Dave** on their DNC". But there's no way to see the **full picture across all applicants at once**. When 40 people apply, an admin has to click through every single applicant to piece together who conflicts with whom. That's exactly the manual cross-referencing CastBot was supposed to eliminate.

### What's Missing

1. **Global DNC view** — "Show me everyone who has a DNC entry and who they listed"
2. **Conflict matrix** — "Which applicants have *mutual* or *overlapping* DNC entries?" (the casting bombs)
3. **Quick access** — Currently DNC info is buried in the per-applicant card's info text. No dedicated screen.
4. **Empty-list awareness** — Most applicants have 0 DNC entries. The overview shouldn't waste space on them.

### Why This Matters for Casting

DNC conflicts are **the single highest-risk factor** in casting. Getting this wrong doesn't just create drama — it can blow up an entire season. Hosts need a birds-eye view of the conflict landscape *before* they start making cast/tentative/reject decisions.

## 🏛️ Architecture Context

### Current DNC Integration in Cast Ranking

The Cast Ranking UI (`castRankingManager.js`) already imports and calls three DNC functions per applicant:

```javascript
// castRankingManager.js:249-253
const { findDncConflicts, buildDncWarnings, buildDncSummary } = await import('./dncManager.js');
const appData = playerData[guildId]?.applications?.[currentApp.channelId] || {};
const dncConflicts = findDncConflicts(appData, allApplications, playerData, guildId);
const dncWarningText = buildDncWarnings(dncConflicts);
const dncSummaryText = buildDncSummary(appData);
```

This produces a per-applicant summary in the applicant info block and warning text above it. Good for individual evaluation — useless for the global picture.

### Current UI Component Budget

From the production logs:
```
📋 Season App Ranking UI: 30-32/40 components
```

The button row where this lives (line 447-468 of castRankingManager.js):
```javascript
// Action Row: [✏️ Edit Player Notes] [🤸 Personal Ranker] [🗑️ Delete App]
```

This row has 3 buttons — space for 2 more. The new DNC List button slots in here.

### Existing Matching Logic (dncManager.js)

Three-tier matching already implemented:
- **Tier 1 (Exact)**: `entry.userId === otherApplicant.userId` — definitive
- **Tier 2 (Username)**: Case-insensitive username match — high confidence
- **Tier 3 (Fuzzy Name)**: Contains-match on display names — possible match

The `findDncConflicts()` function is bidirectional: checks both "A listed B" and "B listed A". This is exactly what we need for the overview — just run it for **every** applicant, then deduplicate.

## 💡 Solution Design

### Approach: New Ephemeral Message (Not UPDATE_MESSAGE)

The DNC overview is a **separate screen**, not a replacement for the Cast Ranking card. Clicking "DNC List" opens a **new ephemeral message** alongside the existing Cast Ranking message. This means:

- Admin doesn't lose their place in the ranking flow
- The overview can be dismissed independently
- No component budget conflict with the existing 30-32 component card
- Response type: `CHANNEL_MESSAGE_WITH_SOURCE` with ephemeral + Components V2 flags

### Button Placement

```
Current:  [✏️ Edit Player Notes] [🤸 Personal Ranker] [🗑️ Delete App]
Proposed: [✏️ Edit Player Notes] [🤸 Personal Ranker] [🚷 DNC List] [🗑️ Delete App]
```

DNC List goes between Personal Ranker and Delete App. Delete stays at the end as the danger action (progressive disclosure: safe → informational → destructive).

### Data Flow

```
Admin clicks "🚷 DNC List" button
         ↓
Permission check (Admin: ManageRoles OR ManageChannels OR ManageGuild OR Administrator)
         ↓
Load playerData, get allApplications for current season (via configId from button)
         ↓
Phase 1: Compute global conflict matrix
  - For each applicant with DNC entries:
    - Run findDncConflicts() against all other applicants
  - Deduplicate: A-listed-B and B-listed-A are ONE conflict pair
  - Classify each conflict pair by highest tier match
         ↓
Phase 2: Build UI
  - Section 1: 🔴 CONFLICTS (mutual/cross-listed DNC entries) — red accent, highest priority
  - Section 2: 📋 ALL DNC ENTRIES (every non-empty DNC list, grouped by applicant)
  - Section 3: Navigation (← Cast Ranking back button)
         ↓
Send new ephemeral message (CHANNEL_MESSAGE_WITH_SOURCE, not UPDATE_MESSAGE)
```

## 🎨 UI Design

### ASCII Mockup — With Conflicts

```
┌───────────────────────────────────────────────────────────────┐
│ ## 🚷 DNC Overview | Season 3 Applications                   │  accent: 0xe74c3c (red)
│───────────────────────────────────────────────────────────────│
│ ### ```⚠️ Conflicts Detected```                              │
│ -# These applicants have listed each other — casting them    │
│ -# together is high risk.                                    │
│                                                               │
│ 🔴 **Reece** ↔ **Dave** — mutual conflict                   │
│ > Reece: "Metagamed me in S4"                                │
│ > Dave: "He's toxic and manipulative"                        │
│                                                               │
│ 🟡 **Sarah** → **Jason** (one-way)                          │
│ > Sarah: "History of harassment"                             │
│───────────────────────────────────────────────────────────────│
│ ### ```📋 All DNC Entries```                                  │
│ -# 4 of 12 applicants have DNC entries                       │
│                                                               │
│ **Reece** — 2 entries                                        │
│ > 🚷 Dave (@serviver): "Metagamed me in S4"                 │
│ > 🚷 Mike: "Don't trust him"                                │
│                                                               │
│ **Dave** — 1 entry                                           │
│ > 🚷 Reece (@extremedonkey): "He's toxic and manipulative"  │
│                                                               │
│ **Sarah** — 1 entry                                          │
│ > 🚷 Jason (@jasondeez): "History of harassment"            │
│                                                               │
│ **Lily** — 1 entry                                           │
│ > 🚷 Someone from S2: (no details)                          │
│───────────────────────────────────────────────────────────────│
│ [← Cast Ranking]                                             │
└───────────────────────────────────────────────────────────────┘
```

**Component count**: 1 Container + 1 TextDisplay (header) + 1 Sep + 1 TextDisplay (conflicts heading) + 1 TextDisplay (conflicts body) + 1 Sep + 1 TextDisplay (entries heading) + 1 TextDisplay (entries body) + 1 Sep + 1 ActionRow (1 Button) = **10 components**. Well within budget even with long content.

### ASCII Mockup — No Conflicts, Some Entries

```
┌───────────────────────────────────────────────────────────────┐
│ ## 🚷 DNC Overview | Season 3 Applications                   │  accent: 0x3498DB (blue)
│───────────────────────────────────────────────────────────────│
│ ### ```✅ No Conflicts```                                     │
│ -# No cross-listed DNC entries found. Safe to cast freely.   │
│───────────────────────────────────────────────────────────────│
│ ### ```📋 All DNC Entries```                                  │
│ -# 2 of 12 applicants have DNC entries                       │
│                                                               │
│ **Reece** — 1 entry                                          │
│ > 🚷 Mike: "Don't trust him"                                │
│                                                               │
│ **Sarah** — 1 entry                                          │
│ > 🚷 Someone from S2: (no details)                          │
│───────────────────────────────────────────────────────────────│
│ [← Cast Ranking]                                             │
└───────────────────────────────────────────────────────────────┘
```

**Accent color shifts**: Red when conflicts exist, Blue when clean. Visual signal before reading a single word.

### ASCII Mockup — No DNC Entries At All

```
┌───────────────────────────────────────────────────────────────┐
│ ## 🚷 DNC Overview | Season 3 Applications                   │  accent: 0x27ae60 (green)
│───────────────────────────────────────────────────────────────│
│ ### ```✅ All Clear```                                        │
│ -# No applicants have submitted DNC entries this season.     │
│ -# You're free to cast without DNC constraints.              │
│───────────────────────────────────────────────────────────────│
│ [← Cast Ranking]                                             │
└───────────────────────────────────────────────────────────────┘
```

Minimal. No wasted space when there's nothing to show.

### Conflict Classification

Conflicts are displayed using a visual severity system:

| Symbol | Meaning | Description |
|--------|---------|-------------|
| 🔴 `↔` | **Mutual conflict** | Both applicants listed each other — highest risk |
| 🟡 `→` | **One-way conflict** | Only one listed the other — medium risk |

Within each category, conflicts are sorted by match tier confidence:
1. Exact (userId match) — no qualifier shown
2. Username match — `(username match)` suffix
3. Name match — `(possible match)` suffix

### Conflict Deduplication Algorithm

`findDncConflicts()` returns directional results. For the overview, we need to merge them into pairs:

```javascript
// Pseudocode
const conflictPairs = new Map(); // key = sorted pair of channelIds

for (const applicant of allApplications) {
  const appData = playerData[guildId].applications[applicant.channelId];
  const conflicts = findDncConflicts(appData, allApplications, playerData, guildId);
  
  for (const conflict of conflicts) {
    const pairKey = [applicant.channelId, conflict.otherChannelId].sort().join('_');
    
    if (!conflictPairs.has(pairKey)) {
      conflictPairs.set(pairKey, {
        applicantA: applicant,
        applicantB: { channelId: conflict.otherChannelId },
        directions: [],
        tier: conflict.tier
      });
    }
    
    const pair = conflictPairs.get(pairKey);
    pair.directions.push(conflict);
    // Upgrade tier to best (exact > username > name)
    if (tierRank(conflict.tier) > tierRank(pair.tier)) {
      pair.tier = conflict.tier;
    }
  }
}

// A pair with both 'current_listed_other' and 'other_listed_current' = mutual
// A pair with only one direction = one-way
```

## 🔒 Security

### Permission Model

Per `SecurityArchitecture.md`, this is a **Tier 1: Server Admin** feature. The button handler checks:

```javascript
const isAdmin = hasAdminPermissions(member);
// ManageRoles OR ManageChannels OR ManageGuild OR Administrator
```

This matches the existing Cast Ranking permission model — all Cast Ranking buttons already use this check. The DNC overview button inherits the same gate.

### Confidentiality

DNC data is sensitive by design — players list personal conflicts in confidence. The overview:
- Is **always ephemeral** (only the clicking admin sees it)
- Is a **new message** (doesn't update the shared Cast Ranking message that other admins might see)
- Shows DNC reasons/issues that players wrote in confidence — this is appropriate because the "🔒 Confidential — only hosts will see this" disclosure in the application flow explicitly tells applicants that hosts will see this data

### Why Not `updateMessage: true`?

If the Cast Ranking card is the shared (non-ephemeral) version, using `updateMessage: true` would replace it for ALL admins with the DNC overview. That leaks confidential DNC data into a message other admins might be looking at. Using a new ephemeral message is the safe choice.

**However**: If the admin is using the `_ephemeral` Personal Ranker variant, `updateMessage: true` would work since it's already their private message. For simplicity and consistency, we always create a new ephemeral message regardless. The "← Cast Ranking" back button can't navigate back to the original ranking card anyway (it's a different message), so it just serves as a dismissal hint / re-entry point.

## 🔧 Implementation Plan

### File Changes

| File | Change | Lines |
|------|--------|-------|
| `castRankingManager.js` | Add DNC List button to notes/ranker row | ~455-459 |
| `castRankingManager.js` | New `generateDncOverviewUI()` function | New function |
| `dncManager.js` | New `buildGlobalDncOverview()` function | New function |
| `app.js` | Add `dnc_overview_*` button handler | New handler |
| `buttonHandlerFactory.js` | Register `dnc_overview_*` in BUTTON_REGISTRY | New entry |

### Step 1: Add Button to Cast Ranking UI

In `castRankingManager.js` around line 447-468, add the DNC List button:

```javascript
// Current row: [Edit Notes] [Personal Ranker] [Delete App]
// New row:     [Edit Notes] [Personal Ranker] [DNC List] [Delete App]
{
  type: 1,
  components: [
    // ... existing Edit Player Notes button ...
    // ... existing Personal Ranker button ...
    new ButtonBuilder()
      .setCustomId(`dnc_overview_${configId}`)
      .setLabel('DNC List')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚷')
      .toJSON(),
    // ... existing Delete App button (stays last) ...
  ]
}
```

**Custom ID format**: `dnc_overview_{configId}` — configId scopes to the current season. No need for appIndex/channelId since this is a global overview.

### Step 2: New Function in dncManager.js — `buildGlobalDncOverview()`

This is the core logic. It computes the full conflict matrix and formats it for display.

```javascript
/**
 * Build global DNC overview for all applicants in a season.
 * Returns { conflictText, entriesText, hasConflicts, stats }
 */
export function buildGlobalDncOverview(allApplications, playerData, guildId) {
  const applicantsWithDnc = [];
  const conflictPairs = new Map();

  // Phase 1: Collect all DNC entries and compute conflicts
  for (const app of allApplications) {
    const appData = playerData[guildId]?.applications?.[app.channelId];
    if (!appData) continue;

    const entries = getDncEntries(appData);
    if (entries.length > 0) {
      applicantsWithDnc.push({
        name: appData.displayName || appData.username || 'Unknown',
        channelId: app.channelId,
        entries
      });
    }

    // Run conflict detection for this applicant
    const conflicts = findDncConflicts(appData, allApplications, playerData, guildId);
    for (const conflict of conflicts) {
      const pairKey = [app.channelId, conflict.otherChannelId].sort().join('_');
      if (!conflictPairs.has(pairKey)) {
        conflictPairs.set(pairKey, { directions: [], tier: conflict.tier });
      }
      const pair = conflictPairs.get(pairKey);
      pair.directions.push({
        ...conflict,
        fromName: appData.displayName || appData.username || 'Unknown',
        fromChannelId: app.channelId
      });
      // Keep best tier
      const tierOrder = { exact: 3, username: 2, name: 1 };
      if ((tierOrder[conflict.tier] || 0) > (tierOrder[pair.tier] || 0)) {
        pair.tier = conflict.tier;
      }
    }
  }

  // Phase 2: Classify conflict pairs as mutual or one-way
  const mutualConflicts = [];
  const oneWayConflicts = [];

  for (const [, pair] of conflictPairs) {
    const hasCurrentListedOther = pair.directions.some(d => d.direction === 'current_listed_other');
    const hasOtherListedCurrent = pair.directions.some(d => d.direction === 'other_listed_current');
    const isMutual = hasCurrentListedOther && hasOtherListedCurrent;

    const formatted = {
      directions: pair.directions,
      tier: pair.tier,
      isMutual
    };

    if (isMutual) {
      mutualConflicts.push(formatted);
    } else {
      oneWayConflicts.push(formatted);
    }
  }

  // Phase 3: Format conflict text
  // ... (see UI section above for formatting)

  // Phase 4: Format entries list
  // ... (grouped by applicant, showing each entry)

  return { conflictText, entriesText, hasConflicts, stats, accentColor };
}
```

### Step 3: UI Generator in castRankingManager.js — `generateDncOverviewUI()`

```javascript
export async function generateDncOverviewUI({ guildId, configId, guild }) {
  const playerData = await loadPlayerData();
  const { getApplicationsForSeason } = await import('./storage.js');
  const { buildGlobalDncOverview } = await import('./dncManager.js');

  const allApplications = await getApplicationsForSeason(guildId, configId);
  const seasonConfig = playerData[guildId]?.applicationConfigs?.[configId];
  const seasonName = seasonConfig?.seasonName || 'Current Season';

  const overview = buildGlobalDncOverview(allApplications, playerData, guildId);

  const components = [
    { type: 10, content: `## 🚷 DNC Overview | ${seasonName}` },
    { type: 14 }
  ];

  if (overview.hasConflicts) {
    components.push(
      { type: 10, content: `### \`\`\`⚠️ Conflicts Detected\`\`\`\n-# These applicants have cross-listed each other — casting them together is high risk.` },
      { type: 10, content: overview.conflictText }
    );
    if (overview.entriesText) {
      components.push(
        { type: 14 },
        { type: 10, content: `### \`\`\`📋 All DNC Entries\`\`\`\n-# ${overview.stats.withEntries} of ${overview.stats.total} applicants have DNC entries` },
        { type: 10, content: overview.entriesText }
      );
    }
  } else if (overview.stats.withEntries > 0) {
    components.push(
      { type: 10, content: `### \`\`\`✅ No Conflicts\`\`\`\n-# No cross-listed DNC entries found. Safe to cast freely.` },
      { type: 14 },
      { type: 10, content: `### \`\`\`📋 All DNC Entries\`\`\`\n-# ${overview.stats.withEntries} of ${overview.stats.total} applicants have DNC entries` },
      { type: 10, content: overview.entriesText }
    );
  } else {
    components.push(
      { type: 10, content: `### \`\`\`✅ All Clear\`\`\`\n-# No applicants have submitted DNC entries this season.\n-# You're free to cast without DNC constraints.` }
    );
  }

  // Navigation
  components.push(
    { type: 14 },
    {
      type: 1,
      components: [{
        type: 2,
        custom_id: `season_app_ranking_${configId}`,
        label: '← Cast Ranking',
        style: 2  // Secondary, no emoji (back button standard)
      }]
    }
  );

  const container = {
    type: 17,
    accent_color: overview.accentColor,
    components
  };

  return {
    flags: (1 << 15) | (1 << 6), // IS_COMPONENTS_V2 + EPHEMERAL — always private
    components: [container]
  };
}
```

**Component count (worst case — conflicts + entries)**: Container(1) + Header(2) + Sep(3) + ConflictHeading(4) + ConflictBody(5) + Sep(6) + EntriesHeading(7) + EntriesBody(8) + Sep(9) + ActionRow(10) + Button(11) = **11 components**. Extremely comfortable.

### Step 4: Button Handler in app.js

```javascript
} else if (custom_id.startsWith('dnc_overview_')) {
  return ButtonHandlerFactory.create({
    id: 'dnc_overview',
    ephemeral: true,     // New ephemeral message
    // NOT updateMessage — we want a new message alongside the existing ranking card
    handler: async (context) => {
      const { guildId, guild } = context;
      const configId = context.customId.replace('dnc_overview_', '');
      const { generateDncOverviewUI } = await import('./castRankingManager.js');
      return await generateDncOverviewUI({ guildId, configId, guild });
    }
  })(req, res, client);
}
```

### Step 5: BUTTON_REGISTRY Entry

```javascript
'dnc_overview': {
  label: '🚷 DNC List',
  description: 'View global DNC overview with conflict detection for all season applicants',
  emoji: '🚷',
  style: 'Secondary',
  category: 'casting_management',
  parent: 'season_app_ranking'
}
```

### Step 6: Dynamic Patterns (if wildcard)

Since the custom_id format is `dnc_overview_{configId}`, add `'dnc_overview'` to the `dynamicPatterns` array in app.js to prevent false `[🪨 LEGACY]` debug logs.

## ⚠️ Risk Assessment

### Low Risk
- **Component budget**: 11 components worst case — no danger of hitting 40
- **Data dependency**: Reads only, no writes. No risk of data corruption
- **Permission model**: Identical to existing Cast Ranking buttons — well-tested
- **UI isolation**: New ephemeral message — can't break existing Cast Ranking card

### Medium Risk
- **Performance with many applicants**: `findDncConflicts()` runs per-applicant (O(n²) in applications). With 40 applicants, that's ~1600 comparisons. Each comparison is lightweight (string matching), so this should be fine. If it becomes slow, add `deferred: true` to the factory config
- **Text length limits**: Discord's Text Display component has a 4096-char content limit. With 40 applicants each having 8 DNC entries with 500-char issues, the entries section could overflow. **Mitigation**: Truncate issues to ~100 chars in the overview, show full text only in per-applicant Cast Ranking view. Add pagination if entry count exceeds threshold

### Edge Cases
- **Applicant left the server**: DNC entry has a name/username but the user isn't fetchable. The overview uses stored `displayName` from application data, not live member fetch — so this works fine
- **Legacy dncList strings**: `getDncEntries()` already handles backwards compat — migrated entries appear in the overview
- **No applications yet**: `allApplications` is empty → "All Clear" state shown. Clean.
- **All applicants have empty DNC**: Stats show "0 of N applicants have DNC entries" → "All Clear" state

## 🔮 Future Evolution

The RaP mentions future expansion to "global applicant considerations" beyond DNC. The architecture supports this:

1. **Section-based design**: The overview uses `### Section Name` headers. Adding "🦮 Accommodations" or "⚕️ Medical Notes" is just another section with the same pattern
2. **Separate data paths**: Each consideration type has its own data source and formatting logic. `buildGlobalDncOverview()` becomes one of several functions called by a higher-level `generateApplicantConsiderationsUI()`
3. **Rename path**: If/when more sections are added, the button could be renamed from "DNC List" to "📋 Considerations" or "🔍 Insights" — the custom_id stays `dnc_overview` for backwards compat, or a new ID is added alongside

For now, the DNC-only branding is correct. Don't over-engineer for hypothetical future sections — just ensure the UI structure is clean enough to extend.

## ✅ Definition of Done

- [ ] "🚷 DNC List" button appears in Cast Ranking card between Personal Ranker and Delete App
- [ ] Clicking it opens a **new ephemeral message** (not updating the ranking card)
- [ ] Admin permission check enforced (ManageRoles/ManageChannels/ManageGuild/Administrator)
- [ ] Conflicts section shows mutual (🔴 ↔) and one-way (🟡 →) conflicts with reasons
- [ ] All DNC Entries section lists every applicant who has entries, with entry details
- [ ] Empty state ("All Clear") shows cleanly when no DNC entries exist
- [ ] Accent color reflects state: red (conflicts), blue (entries but no conflicts), green (all clear)
- [ ] "← Cast Ranking" back button navigates back to Cast Ranking entry point
- [ ] Button registered in BUTTON_REGISTRY
- [ ] Dynamic pattern added to prevent [🪨 LEGACY] false positive
- [ ] Component count logged and verified under 40
- [ ] Works in both shared and ephemeral (Personal Ranker) Cast Ranking contexts
- [ ] Test: `tests/dncOverview.test.js` covering conflict deduplication, tier classification, empty states

---

Related: [DNC Structured System](/docs/01-RaP/0932_20260324_DNCStructured_Analysis.md) | [Cast Ranking](/docs/03-features/CastRanking.md) | [Security Architecture](/docs/infrastructure-security/SecurityArchitecture.md)
