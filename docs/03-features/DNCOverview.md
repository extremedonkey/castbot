# DNC Overview Screen

**Version:** 1.0  
**Status:** Active  
**Dependencies:** Cast Ranking, Season Applications, dncManager.js  
**Permissions:** Admin (ManageRoles, ManageChannels, ManageGuild, Administrator)

## Overview

The DNC Overview provides a **global, season-wide view** of all Do Not Cast entries and cross-listed conflicts. Accessed via a button in the Cast Ranking card, it opens a new ephemeral message that highlights casting risks at a glance.

### Problem Solved

Cast Ranking already shows DNC warnings per-applicant, but with 40+ applicants an admin must click through every single card to piece together who conflicts with whom. The DNC Overview eliminates this manual cross-referencing by computing a full conflict matrix and presenting it in a single screen.

### Access Path

`/menu` > Production Menu > Season Applications > Cast Ranking > `🚷 DNC List` button

## Three UI States

The overview's accent color and content adapt based on the season's DNC landscape:

| State | Accent Color | Content |
|-------|-------------|---------|
| Conflicts exist | Red (`0xe74c3c`) | Conflicts section + All DNC Entries |
| Entries but no conflicts | Blue (`0x3498DB`) | "No Conflicts" banner + All DNC Entries |
| No DNC entries at all | Green (`0x27ae60`) | "All Clear" — minimal screen |

## Conflict Detection

### Matching Tiers (inherited from dncManager.js)

| Tier | Method | Confidence | Display |
|------|--------|-----------|---------|
| 1 (Exact) | `entry.userId === otherApplicant.userId` | Definitive | No suffix |
| 2 (Username) | Case-insensitive username match | High | `(username match)` |
| 3 (Name) | Contains-match on display names | Possible | `(possible match)` |

### Conflict Classification

| Symbol | Meaning | Description |
|--------|---------|-------------|
| 🔴 `↔` | **Mutual conflict** | Both applicants listed each other — highest casting risk |
| 🟡 `→` | **One-way conflict** | Only one applicant listed the other — medium risk |

### Deduplication Algorithm

`findDncConflicts()` returns directional results (A→B and B→A separately). The overview deduplicates into pairs using sorted channelId keys and tracks actual **listers** via a Map. A pair is mutual only when 2+ distinct listers exist — preventing false positives from the bidirectional iteration.

```
pairKey = [channelIdA, channelIdB].sort().join('_')
pair.listers = Map<listerChannelId, { entry, listerName, targetName }>
mutual = pair.listers.size >= 2
```

## Technical Design

### Architecture

```
Admin clicks 🚷 DNC List
        ↓
app.js handler (dnc_overview_)
        ↓
hasCastRankingPermissions() check
        ↓
castRankingManager.generateDncOverviewUI()
        ↓
dncManager.buildGlobalDncOverview()
  ├── Collects DNC entries for all applicants
  ├── Runs findDncConflicts() per applicant
  ├── Deduplicates into conflict pairs
  ├── Classifies mutual vs one-way
  └── Formats text with truncated reasons (~100 chars)
        ↓
New ephemeral message (CHANNEL_MESSAGE_WITH_SOURCE)
```

### Key Design Decisions

- **New ephemeral message** (not `updateMessage`) — admin keeps their place in the Cast Ranking flow, and confidential DNC data is never written to a shared message
- **Button placement**: `[Edit Notes] [Personal Ranker] [🚷 DNC List] [🗑️ Delete App]` — informational action before the danger action
- **Custom ID**: `dnc_overview_{configId}` — season-scoped, no per-applicant context needed
- **Component count**: ~11 worst case (well under 40 limit)
- **Reasons truncated to 100 chars** in overview — full text visible in per-applicant Cast Ranking view

### File Locations

| File | Purpose |
|------|---------|
| `dncManager.js` | `buildGlobalDncOverview()` — core conflict matrix + formatting |
| `castRankingManager.js` | `generateDncOverviewUI()` — UI container builder, button in action row |
| `app.js` | `dnc_overview_` handler — routing + permission check |
| `buttonHandlerFactory.js` | `dnc_overview` BUTTON_REGISTRY entry |
| `tests/dncOverview.test.js` | 21 tests covering dedup, tiers, empty states, formatting |

### Security

- **Permission**: `hasCastRankingPermissions()` — same gate as all Cast Ranking handlers (ManageRoles OR ManageChannels OR ManageGuild OR Administrator)
- **Always ephemeral** — only the clicking admin sees the DNC data
- **Confidentiality preserved** — DNC reasons were submitted by applicants under the "only hosts will see this" disclosure

## Future Evolution

The section-based UI structure supports expansion to other "global applicant considerations":
- Accommodations (e.g., accessibility needs)
- Medical notes
- Alliance/relationship tracking

When additional sections are added, the button could be renamed from "DNC List" to "Considerations" or "Insights". The custom_id remains `dnc_overview` for backwards compatibility.

---

**Related:** [DNC Structured System](../01-RaP/0932_20260324_DNCStructured_Analysis.md) | [Cast Ranking](CastRanking.md) | [Season Application Builder](SeasonAppBuilder.md)  
**Design Analysis:** [RaP 0923](../01-RaP/0923_20260407_DNCOverviewScreen_Analysis.md)
