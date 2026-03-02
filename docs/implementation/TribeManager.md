# Tribe Management System

## Overview

**Status**: ✅ IMPLEMENTED (Core Features)
**Designed**: November 2024
**Implemented**: February-March 2026
**Purpose**: Centralized tribe management via Castlist Manager hub with instant add/remove toggle and per-tribe edit modals

The original design proposed a monolithic `TribeManager` class. Implementation took a pragmatic **utilities + handlers** approach instead, distributing tribe logic across focused modules. The core UX (pre-selection toggle, pipe-delimited button IDs, edit modal, no "remove" field) was implemented exactly as designed.

## Architecture (As-Built)

### Module Responsibilities

```
castlistHub.js           → UI rendering (Sections, Role Select, member display)
castlistHandlers.js      → Interaction handlers (toggle, two-phase response)
castlistManager.js       → Data operations (link/unlink tribes to castlists)
castlistVirtualAdapter.js → Format compatibility (3-tier migration)
utils/tribeDataUtils.js  → Shared utilities (populateTribeData, formatPlayerList, SORT_STRATEGIES)
app.js                   → Button/modal routing (tribe_edit_button, tribe_edit_modal)
```

### Data Flow

```
User clicks Role Select
  → castlistHandlers.handleCastlistTribeSelect()
    → Compares newSelection vs previousSelection (toggle detection)
    → castlistManager.linkTribeToCastlist() / unlinkTribeFromCastlist()
    → twoPhaseHubResponse() rebuilds hub
      → Phase 1: Fast (skipMemberFetch, instant feedback)
      → Phase 2: Full (REST member fetch, player counts)

User clicks Edit button
  → app.js tribe_edit_button handler
    → Opens modal with tribe_name, tribe_emoji, tribe_color fields
    → Modal submit → app.js tribe_edit_modal handler
      → role.setName() if renamed
      → populateTribeData() for shared field initialization
      → twoPhaseHubResponse() with roleRenamed flag if applicable
```

## Key Implementation Details

### Button ID Format (Pipe Delimiters)

As designed — pipe delimiters avoid conflicts with castlist IDs containing underscores:

```javascript
// Button custom_id format
`tribe_edit_button|${roleId}|${castlistId}`

// Parsing (trivial, no ambiguity)
const [prefix, roleId, castlistId] = custom_id.split('|');
```

### Role Select Pre-Selection (Instant Toggle)

```javascript
// castlistHub.js — Role Select with default_values
{
  type: 6, // Role Select
  custom_id: `castlist_tribe_select_${castlist.id}`,
  placeholder: 'Add or remove tribes...',
  min_values: 0,   // Allow deselecting all (enables remove)
  max_values: 8,    // Component budget limit (was 6 in design, raised to 8)
  default_values: tribes.map(tribe => ({
    id: tribe.roleId,
    type: "role"
  }))
}
```

### Toggle Detection

```javascript
// castlistHandlers.js — Compare selections to detect add/remove
const previouslySelectedRoles = await castlistManager.getTribesUsingCastlist(guildId, castlistId);
const addedRoles = newlySelectedRoles.filter(r => !previouslySelectedRoles.includes(r));
const removedRoles = previouslySelectedRoles.filter(r => !newlySelectedRoles.includes(r));

// Deduplication prevents rapid double-clicks (5-second timeout)
if (!deduplicateInteraction(guildId, castlistId)) return;
```

### Two-Phase Hub Response

Centralizes the response pattern used by castlist_select, tribe_edit_modal, and tribe_select:

```javascript
// castlistHandlers.js
export async function twoPhaseHubResponse(token, guildId, hubOptions, client, flags = {}) {
  if (flags.roleRenamed) {
    // Phase 1: Hub WITHOUT Role Select (instant feedback, correct Section text)
    // Wait 1.5s for Discord GUILD_ROLE_UPDATE gateway propagation
    // Phase 2: Hub WITH Role Select (new component = fresh role data fetch)
    return;
  }

  // Normal path:
  // Phase 1: Fast hub (skipMemberFetch: true) — instant feedback
  // Phase 2: Full hub (REST member fetch) — accurate player counts
}
```

### Role Select Rename Fix

Discord's Role Select (type 6) renders names from the user's client cache, not our payload. PATCHing a message with an identical Role Select doesn't trigger re-render.

**Solution**: When a rename occurs, Phase 1 omits the Role Select (`skipRoleSelect: true`), then Phase 2 adds it after a 1.5s delay. Discord treats it as a new component and fetches fresh role data.

```javascript
// castlistHub.js options
const { skipRoleSelect = false } = options;

if (!skipRoleSelect) {
  container.components.push({ /* Role Select ActionRow */ });
}
```

### Tribe Data Format Priority

Three migration formats exist. `getTribesUsingCastlist()` checks with priority to avoid false positives from name collisions (e.g., two castlists named "OG Tribes"):

```javascript
// castlistVirtualAdapter.js
// Format 1: castlistIds array (modern) — AUTHORITATIVE when present
if (tribe.castlistIds?.includes(castlistId)) { match; continue; }
if (tribe.castlistIds) { continue; } // Skip legacy if modern format exists

// Format 2: castlistId string (transitional)
if (tribe.castlistId === castlistId) { match; continue; }

// Format 3: castlist name string (legacy, only if no modern format)
if (tribe.castlist === castlist.name) { match; }
```

Similarly, `unlinkTribeFromCastlist()` cleans up ALL castlist fields (`castlistIds`, `castlistId`, `castlist`) when removing to prevent stale references.

### Shared Utilities (tribeDataUtils.js)

**`populateTribeData(existingData, role, castlistId, castlistName)`**
Initializes tribe data with all required fields. Used by both tribe creation (Role Select add) and tribe edit (modal submit).

**`formatPlayerList(members, maxLength = 300)`**
Formats member names as comma-separated string with truncation. No count prefix — count is shown in the Section header instead.

**`SORT_STRATEGIES`**
Single source of truth for sort strategy labels, emojis, and descriptions. Used by both the hub display and all sort select menus (create modal, edit modal, order modal).

```javascript
export const SORT_STRATEGIES = {
  'placements':      { label: 'Alphabetical (A-Z), then Placement', emoji: '🏅', ... },
  'vanity_role':     { label: 'Vanity Role (Winners)', emoji: '🏆', ... },
  'alphabetical':    { label: 'Alphabetical (A-Z), no placements', emoji: '🔤', ... },
  // ... 7 more strategies
};
```

### REST API Member Fetch

Uses `guild.members.list({ limit: 1000 })` (REST API) instead of `guild.members.fetch()` (Gateway OP 8). Gateway fetch is unreliable and can hang 90+ seconds; REST is fast and predictable. Phase 1 uses `skipMemberFetch: true` for instant response, Phase 2 does the full REST fetch.

### Component Budget

Each tribe adds ~3 components (Section + accessory Button + TextDisplay). Base UI is ~10 components. Max 40 total.

- Conservative limit: 8 tribes (`max_values: 8` on Role Select)
- Dynamic reduction if estimated total > 38
- `countComponents()` utility validates every hub build

## Tribe Section Display

```
🏆 **Castbot MVP Supporters** (12 Players)
-# ReeceBot, DieselFuryy, Geo, Patrick, Natadwen, Serviver, kayl, Megan...   [Edit ✏️]
```

- Tribe emoji + bold name + player count in header (count omitted in fast/skipMemberFetch mode)
- Player names on second line with `-#` subtext formatting (up to 300 chars, truncated with `...`)
- Edit button as Section accessory (pipe-delimited custom_id)
- Section component (type 9) with one TextDisplay child + Button accessory

## Hub Info Display

```
-# **Season**: 📅 Pokevivor
-# **Sort Order**: 🏅 Alphabetical (A-Z), then Placement
```

Uses Discord `-#` subtext formatting with bold labels. Sort strategy display name pulled from `SORT_STRATEGIES` constant. Season line comes from a separate code path in the castlist display section of `castlistHub.js` (includes season stage emoji from `getSeasonStageEmoji()`).

## Edit Modal Fields

| Field | custom_id | Type | Notes |
|-------|-----------|------|-------|
| Tribe Name | `tribe_name` | Text Input | Pre-filled with Discord role name. Renames the role via `role.setName()` |
| Tribe Emoji | `tribe_emoji` | Text Input | Unicode or `<:name:id>`. Validated with non-ASCII check |
| Accent Color | `tribe_color` | Text Input | Hex format `#RRGGBB`. Validated with `validateHexColor()` |

- NO "remove" field — removal is via Role Select deselection (as designed)
- Rename is non-blocking — emoji/color saved even if rename fails (permission error)
- `roleRenamed` flag triggers skipRoleSelect two-phase pattern

## Testing Checklist

### Completed

- [x] Pre-selection: Role Select shows ticked roles for tribes on castlist
- [x] Empty castlist: No roles pre-selected
- [x] Add tribe: Select new role → tribe added instantly, Section appears
- [x] Remove single tribe: Deselect → tribe removed, Section disappears
- [x] Remove multiple tribes: Deselect all → all removed
- [x] Edit tribe: Click Edit → modal → submit → hub refreshes with changes
- [x] Rename tribe: Modal name change → role renamed, Role Select shows new name
- [x] Emoji edit: Updated in Section display
- [x] Color edit: Validated and saved
- [x] No "interaction failed" errors during normal operation
- [x] Component count logged and never exceeds 40
- [x] Pipe delimiter parsing handles castlistIds with underscores
- [x] Deduplication prevents rapid double-click issues
- [x] Two-phase response provides instant feedback + accurate member counts
- [x] REST member fetch prevents 90s+ gateway hangs
- [x] Format priority prevents false matches from castlist name collisions
- [x] Unlink cleans up all three castlist field formats

### Edge Cases Verified

- [x] Rename permission error (bot role too low) → non-blocking, other edits saved
- [x] Emoji validation accepts all Unicode blocks (not just basic range)
- [x] Two castlists with same name → no cross-contamination of tribe lists
- [x] Edit without rename → normal two-phase (no Role Select disappear)

## Related Documentation

- **[CastlistV3](../features/CastlistV3.md)** — Castlist system redesign
- **[Castlist Architecture](../features/CastlistArchitecture.md)** — Complete castlist reference
- **[Components V2](../standards/ComponentsV2.md)** — UI component patterns
- **[ButtonHandlerFactory](../enablers/ButtonHandlerFactory.md)** — Button patterns
- **[Role Select Rename Fix](../../.claude/projects/-home-reece-castbot/memory/role-select-rename.md)** — Detailed investigation notes

---

## Historical Backlog

> The sections below were part of the original November 2024 design but were not implemented.
> The utilities approach proved sufficient for current needs. These remain as potential future work.

### TribeManager Class (Not Implemented)

The original design proposed a monolithic `TribeManager` class with:
- Full CRUD operations with atomic save/rollback
- Centralized validation (emoji, color, displayName)
- Audit logging (1000-entry in-memory buffer)
- Event system with hooks for UI updates
- Bulk operations (updateMultipleTribes, clearAllEmojis, copyTribeSettings)
- Dependency checking before deletion
- Query methods (findTribesWithEmoji, getTribeStats, groupByType)

**Why not built**: The distributed utilities approach (`populateTribeData`, `CastlistManager`, inline validation) covered all current needs with less complexity. A class would add abstraction overhead without immediate benefit.

**When to revive**: If tribe operations grow beyond 3-4 handlers, or if audit/event requirements emerge.

### Season Planner Integration (Not Implemented)

```javascript
// Proposed: Auto-generate tribes for a new season
async generateTribesForSeason(guildId, {
  seasonId, playerCount, tribeCount,
  tribeNames, tribeColors, tribeEmojis,
  autoCreateRoles, autoAssignPlayers
})
```

Features:
- Specify player count and tribe count
- Auto-calculate distribution
- Generate Discord roles automatically
- Link to Season Manager and Castlist system
- "Sort into tribes" via Cast Ranking

**Dependencies**: TribeManager core, Season Management enhancements, role creation permissions

### Tribe Swap/Merge Automation (Not Implemented)

```javascript
// Proposed: Automated tribe swap with transaction safety
async performTribeSwap(guildId, {
  oldTribes, newTribes, archiveCastlist,
  reassignPlayers, randomize
})
```

Features:
- Archive old tribes to custom castlist
- Create new tribe roles automatically
- Randomize player assignments
- Transaction safety with rollback
- History preservation

**Note**: Basic swap/merge exists in the Castlist Manager UI (Swap/Merge button), but without the automation layer proposed here.

**Dependencies**: TribeManager core, Castlist archival system, bulk role operations

### Bulk Operations (Not Implemented)

- `updateMultipleTribes()` — Apply changes to many tribes at once
- `clearAllEmojis()` — Reset all tribe emojis in a guild
- `copyTribeSettings()` — Copy emoji/color/settings from one tribe to others

**When to revive**: If admins need to manage 10+ tribes simultaneously.

### Event System (Not Implemented)

```javascript
// Proposed: Pub/sub for tribe changes
tribeManager.on('tribeCreated', ({ guildId, roleId, tribe }) => { ... });
tribeManager.on('tribeUpdated', ({ guildId, roleId, changes }) => { ... });
tribeManager.on('tribeDeleted', ({ guildId, roleId }) => { ... });
```

**When to revive**: If multiple systems need to react to tribe changes (e.g., auto-update castlist display, trigger analytics, send notifications).

### Audit Logging (Not Implemented)

```javascript
// Proposed: In-memory audit trail
logAction('UPDATE', guildId, roleId, userId, { before, after, changes });
getAuditLog(guildId, limit);  // Last N entries
```

**When to revive**: If compliance or "who changed what" tracking becomes a requirement.
