# Castlist Architecture

**Status**: 🟢 Production (As-Built)
**Last Updated**: November 2025
**Purpose**: Authoritative reference for CastBot's castlist system architecture

## Executive Summary

The castlist system is the heart of CastBot, displaying organized groups of players (tribes) across multiple interfaces. The architecture achieves **100% unified data access** through `getTribesForCastlist()` while maintaining separate lightweight menu generation for performance.

### Key Achievements
- **Unified Display**: Single data access function for all display operations
- **Smart Caching**: 80% threshold bulk member fetching (367ms for 578 members)
- **Virtual Adapter**: Legacy castlists appear as modern entities transparently
- **Deferred Responses**: 15-minute timeout window for heavy operations
- **Position-Based Parsing**: Handles arbitrary underscores in castlist IDs

## Core Architecture

```mermaid
graph TB
    subgraph "User Entry Points"
        CMD["/castlist Command"]
        MENU["/menu Command"]
        HUB["Castlist Hub"]
        BTN["show_castlist2 Buttons"]
    end

    subgraph "Two-Phase System"
        direction TB
        MG["Menu Generation<br/>(Lightweight Metadata)"]
        DD["Display Operations<br/>(Heavy Data Loading)"]
    end

    subgraph "Data Access Layer"
        VA["Virtual Adapter<br/>(Legacy Bridge)"]
        GTF["getTribesForCastlist()<br/>(Unified Display)"]
        ECD["extractCastlistData()<br/>(Menu Metadata)"]
    end

    subgraph "Storage"
        PD["playerData.json"]
        LC["Legacy: tribe.castlist"]
        NC["Modern: castlistConfigs"]
    end

    %% Entry to Phase System
    CMD --> DD
    BTN --> DD
    MENU --> MG
    HUB --> MG

    %% Phase to Data Access
    MG --> ECD
    DD --> GTF

    %% Data Access to Storage
    ECD --> VA
    GTF --> VA
    VA --> PD
    PD --> LC
    PD --> NC

    style GTF fill:#4ade80,stroke:#22c55e,stroke-width:3px
    style VA fill:#60a5fa,stroke:#3b82f6,stroke-width:2px
    style DD fill:#fbbf24,stroke:#f59e0b,stroke-width:2px
    style MG fill:#a78bfa,stroke:#8b5cf6,stroke-width:2px
```

## Data Flow Architecture

### Phase 1: Menu Generation (Lightweight)

```mermaid
sequenceDiagram
    participant User
    participant Menu as Production Menu
    participant Extract as extractCastlistData()
    participant VA as Virtual Adapter
    participant Storage

    User->>Menu: Open /menu
    Menu->>Extract: Request castlist metadata
    Extract->>VA: getAllCastlists(guildId)
    VA->>Storage: Load minimal data
    Note over VA: Creates virtual entities<br/>for legacy castlists
    VA-->>Extract: Map of castlist info
    Extract->>Extract: createCastlistRows()
    Extract-->>Menu: Button components
    Menu-->>User: Display menu with buttons
```

**Purpose**: Generate menu buttons without loading member data
**Performance**: <100ms for any number of castlists
**Data Loaded**: Names, IDs, metadata only

### Phase 2: Display Operations (Heavy)

```mermaid
sequenceDiagram
    participant User
    participant Handler as Display Handler
    participant GTF as getTribesForCastlist()
    participant Cache as Smart Cache
    participant Discord
    participant Display

    User->>Handler: Click castlist button
    Handler->>Handler: Defer response (15 min window)
    Handler->>GTF: Load full tribe data

    GTF->>Cache: Check member cache
    alt Cache < 80% full
        Cache->>Discord: guild.members.fetch()
        Note over Cache: Bulk fetch all members
        Discord-->>Cache: 578 members (367ms)
    end

    GTF->>GTF: Enrich with placements
    GTF->>GTF: Apply sorting
    GTF-->>Handler: Enriched tribes

    Handler->>Display: Build response
    Display-->>User: Show castlist via webhook
```

**Purpose**: Display castlist with full member data
**Performance**: 367ms cold cache, 0ms warm
**Data Loaded**: All members, roles, placements, metadata

## Key Components

### 1. Unified Data Access (`castlistDataAccess.js`)

The single source of truth for castlist display:

```javascript
export async function getTribesForCastlist(guildId, castlistIdentifier, client) {
  // Step 1: Resolve identifier to entity (via Virtual Adapter)
  const castlist = await castlistManager.getCastlist(guildId, castlistIdentifier);

  // Step 2: Get tribe role IDs (supports all 3 formats)
  const roleIds = await castlistManager.getTribesUsingCastlist(guildId, castlist.id);

  // Step 3: Smart cache check (80% threshold)
  if (guild.members.cache.size < guild.memberCount * 0.8) {
    await guild.members.fetch({ timeout: 10000 });
  }

  // Step 4: Enrich with Discord data and placements
  return enrichedTribes;
}
```

**Used By**: All display operations
**Key Features**: Smart caching, placement integration, Virtual Adapter support

### 2. Virtual Adapter Pattern

Bridges legacy string-based castlists with modern entity system:

```mermaid
graph LR
    subgraph "Legacy System"
        LS["tribe.castlist = 'Season 13'"]
    end

    subgraph "Virtual Adapter"
        VE["Virtual Entity<br/>id: virtual_U2Vhc29uIDEz<br/>name: 'Season 13'"]
    end

    subgraph "Modern System"
        RE["Real Entity<br/>id: castlist_123_system<br/>name: 'Season 13'"]
    end

    LS -->|Runtime| VE
    VE -->|On Edit| RE

    style VE fill:#ddd,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5
```

**States**:
- **Virtual**: Exists only in memory, no database changes
- **Materialized**: Converted to real entity on first edit
- **Transparent**: Code doesn't need to know which type

### 3. Navigation Parsing

Position-based parsing handles variable-length castlist IDs:

```javascript
// Button: castlist2_nav_next_page_0_0_castlist_1759638936214_system_view

const parts = withoutPrefix.split('_');
// ["next", "page", "0", "0", "castlist", "1759638936214", "system", "view"]

// Position-based extraction (action is ALWAYS 2 parts)
const displayMode = parts[parts.length - 1];           // "view"
const action = `${parts[0]}_${parts[1]}`;              // "next_page"
const currentTribeIndex = parseInt(parts[2]);          // 0
const currentTribePage = parseInt(parts[3]);           // 0
const castlistId = parts.slice(4, parts.length - 1).join('_');
// "castlist_1759638936214_system"
```

**Key Insight**: Actions are always 2 words, mode is always last → extract variable-length ID from middle

For detailed parsing documentation, see [CastlistNavigationParsing.md](CastlistNavigationParsing.md).

### 4. Placement Editor Integration

Edit mode allows inline placement editing for alumni/ranking displays:

```mermaid
graph TB
    subgraph "Edit Mode Flow"
        HUB[Castlist Hub]
        TP[Tribes & Placements Button]
        EM[Edit Mode Display]
        BTN[Placement Button]
        MOD[Modal Input]
        SAV[Save Handler]
    end

    HUB -->|Select castlist| TP
    TP -->|show_castlist2_id_edit| EM
    EM -->|Shows buttons not thumbnails| BTN
    BTN -->|Click "14th"| MOD
    MOD -->|Enter placement| SAV
    SAV -->|UPDATE_MESSAGE| EM

    style EM fill:#fbbf24,stroke:#f59e0b
    style SAV fill:#4ade80,stroke:#22c55e
```

**Storage**: Global namespace `playerData[guildId].placements.global[playerId]`
**Not** per-tribe (survives tribe changes)
**Full Documentation**: [Placements.md](Placements.md)

### 5. Sorting System (`castlistSorter.js`)

Configurable sorting strategies set via Castlist Hub:

```javascript
export function sortCastlistMembers(members, tribeData, options = {}) {
  // Clear stale placement data
  members.forEach(member => {
    delete member.displayPrefix;
    delete member.placement;
  });

  // Determine strategy from castlistSettings
  const sortingStrategy = tribeData.castlistSettings?.sortStrategy || 'alphabetical';

  switch (sortingStrategy) {
    case 'placements':       // Alumni rankings (1st, 2nd, 3rd...)
    case 'alphabetical':     // A-Z by display name
    case 'reverse_alpha':    // Z-A by display name
    case 'vanity_role':      // By vanity role (S1, S2, then alpha)
    // Legacy strategies (age, timezone, join_date) are deprecated
  }
}
```

**Placement Sorting**: Shows active players first, then ranked by placement
**Vanity Sorting**: Prioritizes season roles (S1, S2) before alphabetical

## Season & Tribe Management Integration

### Active Season Context

The active season provides default context for all castlist operations:

```javascript
// From SeasonLifecycle.md
{
  "activeSeason": {
    "id": "config_1751549410029_391415444084490240",
    "name": "Season 47: Redemption Island",
    "stage": "applications"
  }
}
```

**Impact**: Default castlist automatically tied to active season
**Display**: Production Menu header shows active season name
**Documentation**: [SeasonLifecycle.md](../concepts/SeasonLifecycle.md)

### Tribe Swap/Merge Operations

Dramatic reorganizations that affect castlist structure:

```mermaid
graph LR
    subgraph "Before Swap"
        OT1[TribeA - 7 players]
        OT2[TribeB - 7 players]
    end

    subgraph "After Swap"
        AR[Archive: Pre-Swap]
        NT1[NewX - 7 players]
        NT2[NewY - 7 players]
    end

    OT1 -->|Archive| AR
    OT2 -->|Archive| AR
    OT1 -.->|Players reassigned| NT1
    OT1 -.->|Players reassigned| NT2
    OT2 -.->|Players reassigned| NT1
    OT2 -.->|Players reassigned| NT2
```

**Features**:
- Creates archive castlist with old tribes
- Optional vanity roles keep old tribes visible
- Auto-randomize with 15-second dramatic reveals
- Updates default castlist with new configuration

**Documentation**: [TribeSwapMerge.md](TribeSwapMerge.md)

## Legacy System (Being Retired)

The original castlist system used simple string matching:

```javascript
// Legacy storage in playerData.json
{
  "tribes": {
    "roleId_123": {
      "castlist": "Season 13",  // Simple string
      "emoji": "🏝️",
      "color": "#4A90E2"
    }
  }
}

// Legacy lookup
function getGuildTribes(guildId, castlistName) {
  return tribes.filter(t => t.castlist === castlistName);
}
```

**Migration Path**: Virtual Adapter creates entities on-demand, materializes on edit
**Backwards Compatible**: Both systems work simultaneously
**Future**: Remove `tribe.castlist` field when all servers migrated

## Performance Characteristics

| Operation | Cold Cache | Warm Cache | Notes |
|-----------|------------|------------|-------|
| Menu Generation | <100ms | <100ms | Metadata only |
| Display (50 members) | ~150ms | 0ms | Quick fetch |
| Display (578 members) | ~367ms | 0ms | Bulk fetch triggered |
| Display (1000+ members) | ~800ms | 0ms | May need deferred |
| Navigation | 0ms | 0ms | Uses cached data |
| Placement Edit | ~200ms | ~200ms | Database write |

## Entry Point Summary

| Entry Point | Data Function | Response Pattern | Documentation |
|-------------|---------------|------------------|---------------|
| `/castlist` | getTribesForCastlist() | Direct response | Built-in command |
| `/menu` → Castlist Hub | extractCastlistData() | Ephemeral menu | [MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md) |
| `show_castlist2_` buttons | getTribesForCastlist() | Deferred + webhook | [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) |
| Navigation buttons | getTribesForCastlist() | UPDATE_MESSAGE | [CastlistNavigationParsing.md](CastlistNavigationParsing.md) |
| Placement edit | getTribesForCastlist() | UPDATE_MESSAGE | [Placements.md](Placements.md) |

## Critical Implementation Notes

### Discord.js Member Caching
- `role.members` is a **filtered view** of cache, not complete list
- Must bulk fetch if cache < 80% full
- Cache resets on bot restart (hence November 2024 incident)

### Button ID Limits
- Discord maximum: 100 characters
- Entity IDs can be long: `castlist_1759638936214_system`
- Solution: Use type suffix instead of full guild/user ID

### Component Limits
- Maximum 40 components per message (recursive count)
- Castlist display limit: 4 custom + 1 default
- Solution: Sort by most recent, hide overflow

### Deferred Response Requirements
- Discord timeout: 3 seconds for direct response
- Member fetch alone can take 367ms
- Solution: Always defer for display operations

## Related Documentation

### Core Systems
- [Placements.md](Placements.md) - Placement editor system
- [CastlistNavigationParsing.md](CastlistNavigationParsing.md) - Button parsing details
- [SeasonLifecycle.md](../concepts/SeasonLifecycle.md) - Active season context
- [TribeSwapMerge.md](TribeSwapMerge.md) - Tribe reorganization

### Technical Infrastructure
- [ComponentsV2.md](../standards/ComponentsV2.md) - UI component standards
- [DiscordInteractionAPI.md](../standards/DiscordInteractionAPI.md) - Interaction patterns
- [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) - Button implementation

### Migration & Analysis
- [RaP/0978](../../RaP/0978_20251115_CastlistArchitecture_AuditReport.md) - Architecture audit
- [DataArchitecture.md](DataArchitecture.md) - Legacy data structures

## Castlist Ordering Logic

### Overview
The castlist system employs two distinct ordering mechanisms that operate at different levels:
1. **Tribe Ordering** - Which tribes appear first in the castlist
2. **Player Sorting** - How players are ordered within each tribe

### Tribe Ordering (User-First Logic)

When displaying the default castlist, CastBot applies "user-first" ordering to improve UX:

```mermaid
graph LR
    subgraph "Before User-First"
        T1[Alpha Tribe]
        T2[Bravo Tribe]
        T3[Charlie Tribe]
        T4[Delta Tribe]
    end

    subgraph "After User-First (User in Charlie)"
        UT1[Charlie Tribe - Your Tribe]
        OT1[Alpha Tribe]
        OT2[Bravo Tribe]
        OT3[Delta Tribe]
    end

    T1 --> OT1
    T2 --> OT2
    T3 --> UT1
    T4 --> OT3

    style UT1 fill:#4ade80,stroke:#22c55e,stroke-width:3px
```

#### Implementation Details

**Location**: `castlistV2.js:136-176` (`reorderTribes()` function)

**When Applied**:
- **Default castlist only** (`castlistId === 'default'`)
- **User must be authenticated** (has valid userId)
- Applied consistently in both initial display (app.js:5227) and navigation handlers

**Algorithm**:
1. Identify tribes containing the viewing user
2. Sort user's tribes alphabetically
3. Sort remaining tribes alphabetically
4. Concatenate: `[...userTribes, ...otherTribes]`

**Special Cases**:
- **Production team members** (not in any tribe): See all tribes in alphabetical order
- **Multiple tribes**: User's tribes appear first, sorted alphabetically among themselves
- **Custom castlists**: No user-first ordering applied (straight alphabetical or creation order)

### Player Sorting Within Tribes

Once tribes are ordered, players within each tribe are sorted based on the castlist's sort strategy:

**Location**: `castlistSorter.js` (entire file)

**Available Strategies**:
| Strategy | Description | Implementation |
|----------|-------------|----------------|
| `alphabetical` | A-Z by display name | Default for all castlists |
| `placements` | Alumni ranking (1st, 2nd, 3rd...) | Active players first, then eliminated by placement |
| `reverse_alpha` | Z-A by display name | Simple reverse sort |
| `vanity_role` | By vanity roles (S1, S2...) | Season roles → Alpha → Numeric → Emoji → No role |
| `placements_alpha` | Placements + alphabetical ties | Combines placement and alphabetical sorting |

**Strategy Selection**:
```javascript
// castlistSorter.js:34-36
const sortingStrategy = tribeData.castlistSettings?.sortStrategy
                     || (tribeData.type === 'alumni_placements' ? 'placements' : null)
                     || 'alphabetical';
```

### Pagination Logic

When tribes exceed 8 players, pagination is applied:

**Trigger**: Any tribe with 9+ players triggers multi-page scenario
**Distribution**: Players distributed evenly across pages (higher count on first page for odd numbers)
**Max per page**: 8 players (with separators)

```mermaid
graph TB
    subgraph "Single Tribe with 18 Players"
        P1[Page 1: 6 players]
        P2[Page 2: 6 players]
        P3[Page 3: 6 players]
    end

    subgraph "Navigation Buttons"
        B1[◀ Last Page]
        B2[📋 Menu]
        B3[Next Page ▶]
    end

    P1 --> B3
    B3 --> P2
    P2 --> B1
    P2 --> B3
    B3 --> P3
    P3 --> B1
```

**Button Label Logic** (castlistV2.js:554-583):
- Shows "Next/Last Page" when navigating within a multi-page tribe
- Shows "Next/Last Tribe" when navigating between tribes
- Buttons disabled at boundaries (first page of first tribe, last page of last tribe)

### Navigation State Preservation

**Button ID Format**: `castlist2_nav_{action}_{tribeIndex}_{tribePage}_{castlistId}_{displayMode}`

Example: `castlist2_nav_next_tribe_0_0_default_view`

**Parsed Components**:
- `action`: next_tribe, last_tribe, next_page, last_page
- `currentTribeIndex`: 0-based index in tribes array
- `currentTribePage`: 0-based page within tribe
- `castlistId`: Entity ID or legacy name
- `displayMode`: view or edit

### Known Issues & Edge Cases

1. **Historical Issue (Fixed November 2024)**: Initial display and navigation used different ordering
   - **Symptom**: First "next" click appeared to do nothing
   - **Cause**: Initial display didn't apply user-first, navigation did
   - **Fix**: Applied consistent ordering strategy (app.js:5227)

2. **Custom Castlist Detection**: Previously, using `/castlist` when user was in a non-default castlist would show that castlist instead
   - **Status**: Feature removed for consistency
   - **Current**: `/castlist` always shows default castlist

3. **Virtual Adapter Ordering**: Legacy castlists (isVirtual=true) appear after modern castlists
   - **Impact**: Gradual migration as servers create modern castlists
   - **See**: Virtual Adapter Pattern section

### Configuration & Future Enhancements

**Planned**: Make user-first ordering configurable per guild
- Add toggle in Castlist Hub settings
- Store preference in `guildSettings.castlistUserFirst`
- Default: true for backwards compatibility

**Considered**: Remember user's last viewed tribe/page
- Store in session or user preferences
- Resume position on next view
- Challenge: Bot restarts clear memory

## Future Considerations

### Complete Virtual Adapter Migration
- Remove `tribe.castlist` field when all servers migrated
- Simplify storage to only use `tribe.castlistId`
- Estimated: Q2 2025

### Enhanced Sorting
- Implement timezone and join_date sorting
- Add custom order support for manual arrangement
- Player preference memory

### Performance Optimization
- Implement request-level caching for navigation
- Pre-warm cache for scheduled events
- CDN for avatar images

---

This document serves as the authoritative reference for CastBot's castlist architecture. For implementation details on specific subsystems, follow the linked documentation.