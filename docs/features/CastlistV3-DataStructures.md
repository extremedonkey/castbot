# CastlistV3 Data Structures - Implementation Reality

**Created**: November 2025
**Purpose**: Document the ACTUAL data structures and implementation of the castlist system as it exists in production

## 📊 Data Model Overview

The castlist system has THREE overlapping data models working simultaneously:

1. **Legacy Model** (What users actually use today)
2. **Virtual Entity Model** (Backwards compatibility layer)
3. **Real Entity Model** (CastlistV3 - restricted to Reece only)

## 1️⃣ Legacy Castlist Model (Production Reality)

### Data Structure
```javascript
// In playerData[guildId].tribes
"tribes": {
  "1297206459301367914": {  // Role ID
    "emoji": "🔥",
    "castlist": "production",  // STRING identifier (legacy)
    "showPlayerEmojis": false,
    "color": "#e74c3c",
    "analyticsName": "🔥 Production Team",
    "analyticsAdded": 1749987859643
  }
}
```

### Key Characteristics
- **Castlist is just a STRING** - not an ID reference
- **No central castlist storage** - duplicated across tribes
- **Typos break everything** - "Alumni" vs "Almuni" = different castlists
- **No metadata** - No creation date, owner, or settings

### How Users Create Legacy Castlists

1. **Via Production Menu** (`/menu` → Production Menu → Tribes)
   - Button: `prod_manage_tribes` → `prod_add_tribe`
   - Flow: Select role → Choose/create castlist name → Add emoji
   - Creates: String-based castlist in `tribe.castlist`

2. **Via Slash Command** (deprecated but exists)
   - Command: `/add_tribe @role castlist_name emoji`
   - Direct creation of string-based castlist

### Functions That Create/Manage Legacy Castlists
- `prod_add_tribe` - Main button handler (line ~10850 in app.js)
- `prod_add_tribe_role_select` - Role selection step
- `prod_add_tribe_castlist_select_*` - Castlist name selection
- `prod_add_tribe_modal_*` - Final submission with emoji

## 2️⃣ Virtual Entity Model (Bridge Layer)

### How It Works
The Virtual Adapter (`castlistVirtualAdapter.js`) makes legacy string castlists APPEAR as entities:

```javascript
// Virtual Entity Structure (not saved, generated on-the-fly)
{
  "id": "virtual_SGFzem8",  // base64("Haszo")
  "name": "Haszo",
  "type": "legacy",
  "isVirtual": true,  // Flag indicating it's not real
  "tribes": ["1391142520787832904"],  // Tribes using this castlist
  "settings": {
    "sortStrategy": "alphabetical"
  }
}
```

### Virtual ID Generation
```javascript
// How virtual IDs are created
virtualId = `virtual_${Buffer.from(castlistName).toString('base64')}`
// Example: "Haszo" → "virtual_SGFzem8"
```

### Automatic Materialization
When a virtual castlist is edited, it becomes real:

```javascript
// Before (Virtual - not saved)
"Haszo" string in tribes → generates virtual_SGFzem8

// After materialization (Real entity saved)
"castlistConfigs": {
  "castlist_1758812609810_system": {
    "id": "castlist_1758812609810_system",
    "name": "Haszo",
    "type": "legacy",
    "metadata": {
      "migratedFrom": "virtual_SGFzem8",
      "migrationDate": 1758812609810
    }
  }
}

// Tribe updated with BOTH for backwards compatibility
"tribes": {
  "1391142520787832904": {
    "castlist": "Haszo",  // KEPT for legacy
    "castlistId": "castlist_1758812609810_system"  // NEW
  }
}
```

### 🔄 Virtual Castlist Upgrade Flow (Materialization Deep-Dive)

This section documents the COMPLETE journey from legacy string castlist → virtual entity → real entity.

#### Trigger Event

**User clicks "Edit Info" button** on a virtual castlist in CastlistV3 Hub

```javascript
// Hub shows castlist with virtual ID
castlistId = "virtual_SGFzem8"  // base64("Haszo")

// User clicks "Edit Info" button
custom_id = "castlist_edit_info_virtual_SGFzem8"
```

#### Step-by-Step Materialization Process

**Step 1: Virtual ID Detection**
```javascript
// castlistManager.js:144-148
if (castlistVirtualAdapter.isVirtualId(castlistId)) {  // "virtual_SGFzem8"
  console.log(`[CASTLIST] Materializing virtual castlist before update`);
  castlistId = await castlistVirtualAdapter.materializeCastlist(guildId, castlistId);
  // castlistId NOW = "castlist_1757445788734_system"
}
```

**Step 2: Generate Real ID**
```javascript
// castlistVirtualAdapter.js:223-270
const realId = `castlist_${Date.now()}_system`;
// Example: "castlist_1757445788734_system"
```

**Step 3: Build Real Entity**
```javascript
const realCastlist = {
  ...virtual,                    // Copy virtual properties
  id: realId,
  isVirtual: false,              // Mark as real
  createdAt: Date.now(),
  createdBy: 'migration',
  metadata: {
    ...virtual.metadata,
    migratedFrom: virtualId,     // "virtual_SGFzem8" - preserve origin
    migrationDate: Date.now()
  }
};
```

**Step 4: Save to castlistConfigs**
```javascript
playerData[guildId].castlistConfigs[realId] = realCastlist;
```

**Step 5: Update All Tribes Using This Castlist**
```javascript
for (const tribeId of virtual.tribes) {
  tribes[tribeId].castlistId = realId;  // ADD new field
  // tribes[tribeId].castlist stays "Haszo" for backwards compat
}
```

**Step 6: Persist Everything**
```javascript
await savePlayerData(playerData);
return realId;  // Return to manager for subsequent updates
```

#### Before & After Data Comparison

**BEFORE Materialization (Virtual - No Storage):**
```javascript
// Nothing in castlistConfigs - virtual entity exists only in memory

"tribes": {
  "1391142520787832904": {
    "castlist": "Haszo",  // String matching only
    "emoji": "🔥"
  }
}
```

**AFTER Materialization (Real Entity):**
```javascript
"castlistConfigs": {
  "castlist_1757445788734_system": {
    "id": "castlist_1757445788734_system",
    "name": "Haszo2",  // User's update applied after materialization
    "type": "legacy",
    "createdAt": 1757445788734,
    "createdBy": "migration",
    "settings": {
      "sortStrategy": "alphabetical"
    },
    "metadata": {
      "migratedFrom": "virtual_SGFzem8",  // Tracks origin
      "migrationDate": 1757445788734
    }
  }
}

"tribes": {
  "1391142520787832904": {
    "castlist": "Haszo",                          // Legacy field KEPT
    "castlistId": "castlist_1757445788734_system",  // NEW
    "emoji": "🔥"
  }
}
```

#### Virtual ID Encoding/Decoding

**Encoding Process:**
```
Original Name: "Haszo"
  ↓
Buffer.from("Haszo").toString('base64')
  ↓
Base64 Result: "SGFzem8="
  ↓
Remove padding: "SGFzem8"
  ↓
Add prefix: "virtual_SGFzem8"
```

**Decoding Process (Reversible):**
```
Virtual ID: "virtual_SGFzem8"
  ↓
Remove prefix: "SGFzem8"
  ↓
Add padding: "SGFzem8="
  ↓
Buffer.from("SGFzem8=", 'base64').toString('utf-8')
  ↓
Original Name: "Haszo"
```

**Why this matters:** The adapter can ALWAYS find the original castlist name, enabling seamless backwards compatibility.

#### Materialization Triggers

**ANY write operation triggers materialization:**
- ✅ Edit Info (name/emoji/description)
- ✅ Add/Remove Tribes
- ✅ Change Sort Strategy
- ✅ Change Season Association
- ✅ Any metadata update

**Read operations NEVER materialize:**
- ❌ View castlist display
- ❌ Display in dropdown
- ❌ Show details
- ❌ Navigation between castlists

**Why:** Materialization is EXPENSIVE (writes to disk), so it only happens when user explicitly modifies data.

## 3️⃣ Real Entity Model (CastlistV3)

### Data Structure
```javascript
// In playerData[guildId].castlistConfigs
"castlistConfigs": {
  "castlist_1759638936214_system": {
    "id": "castlist_1759638936214_system",
    "name": "Castbot MVPs",
    "type": "custom",  // or "alumni_placements", "winners", "system"
    "seasonId": "season_cac1b81de8914c79",  // Optional season link
    "createdAt": 1759638936215,
    "createdBy": "391415444084490240",  // User ID or "system"/"migration"
    "settings": {
      "sortStrategy": "placements",  // or "alphabetical", "reverse_alpha", etc.
      "showRankings": true,
      "maxDisplay": 25,
      "visibility": "public"
    },
    "metadata": {
      "description": "The best players ever!",
      "emoji": "🏆",
      "accentColor": 0x9b59b6,
      "migratedFrom": "virtual_Q2FzdGJvdCBNVlBz",  // If migrated
      "migrationDate": 1759638936215
    },
    "modifiedAt": 1762006373273,
    "modifiedBy": "system"
  }
}
```

### Tribe Relationship (New)
```javascript
"tribes": {
  "1333822520737927281": {
    "castlist": "Castbot MVPs",  // Legacy (kept for compatibility)
    "castlistId": "castlist_1759638936214_system",  // New reference
    "castlistIds": [  // Some have arrays (inconsistent)
      "castlist_1759638936214_system"
    ]
  }
}
```

## 4️⃣ Season Model

**IMPORTANT**: Seasons are NOT separate entities! They're application configs with optional castlist links.

### Season Application Config
```javascript
// In playerData[guildId].seasonApplicationConfigs
"config_1751549410029_391415444084490240": {
  "buttonText": "Apply to ReeceVivor S15!",
  "explanatoryText": "Join the adventure!",
  "stage": "accepting_applications",
  "seasonId": "season_cac1b81de8914c79",  // Internal season ID
  "seasonName": "ReeceVivor S15!",
  "questions": [...],
  "createdBy": "391415444084490240",
  "createdAt": 1751549410029
}
```

### Active Season Tracking
```javascript
// In playerData[guildId].activeSeason
"activeSeason": {
  "id": "config_1751549410029_391415444084490240",
  "name": "ReeceVivor S15!",
  "stage": "planning"  // or "active", "completed"
}
```

### Season-Castlist Relationship
Castlists can optionally link to seasons:
```javascript
"castlistConfigs": {
  "castlist_xyz": {
    "seasonId": "season_cac1b81de8914c79",  // Links to season
    // ... rest of castlist
  }
}
```

### 🔑 Season ID vs Config ID - CRITICAL DISTINCTION

**IMPORTANT**: `applicationConfigs` is the current storage location for season data, but each config contains its own **seasonId** field. These are DIFFERENT values!

#### Data Structure Reality
```javascript
"applicationConfigs": {
  "config_1762659148974_391415444084490240": {  // ← Config key (internal identifier)
    "seasonId": "season_b11e9917a01a4955",      // ← Actual season ID (THIS is what we use!)
    "seasonName": "Lostvivor S1",
    "stage": "active",
    "createdAt": 1762659148974,
    "lastUpdated": 1762659148974,
    "questions": []
  }
}
```

#### What Castlists Store

**Castlists store the SEASON ID, not the config ID:**

```javascript
"castlistConfigs": {
  "castlist_123_system": {
    "seasonId": "season_b11e9917a01a4955"  // ← Links to applicationConfig.seasonId
  }
}
```

#### Why This Matters - Future-Proofing

When seasons are eventually moved to their own top-level structure (planned but not yet implemented), castlists won't need migration:

```javascript
// FUTURE structure (not implemented yet)
{
  "seasons": {
    "season_b11e9917a01a4955": {  // ← seasonId becomes the key
      "name": "Lostvivor S1",
      "stage": "active"
    }
  },
  "applicationConfigs": {
    "config_123": {
      "seasonId": "season_b11e9917a01a4955",  // ← Still links to season
      "questions": []
    }
  },
  "castlistConfigs": {
    "castlist_456": {
      "seasonId": "season_b11e9917a01a4955"  // ← No migration needed!
    }
  }
}
```

**Result**: Castlists won't need migration when seasons are split out into their own top-level structure.

#### Lookup Pattern

**Finding a season by seasonId in current implementation:**

```javascript
// Current implementation (nested in applicationConfigs)
const season = Object.values(playerData[guildId]?.applicationConfigs || {})
  .find(config => config.seasonId === castlist.seasonId);

// Future implementation (seasons as top-level) - no code change needed!
const season = playerData[guildId]?.seasons?.[castlist.seasonId];
```

**Implementation Evidence** (from castlistHandlers.js:1112-1121):
```javascript
else if (innerComp.custom_id === 'season_id') {
  // Extract season selection (String Select)
  const selectedValues = innerComp.values || [];

  if (selectedValues.length === 0) {
    fields.seasonId = 'none';  // User deselected all
  } else {
    fields.seasonId = selectedValues[0];  // Stores seasonId, NOT configId!
  }
}
```

### Placement Namespaces (Global vs Per-Season)

#### Current Reality: Global Namespace

**What "global" means in placements:**
It's a **temporary placeholder namespace** until season-specific placements are implemented.

**Current Structure:**
```javascript
placements: {
  global: {  // ← Temporary - not tied to any season
    playerId: {
      placement: 24,  // INTEGER not string
      updatedBy: userId,
      updatedAt: timestamp
    }
  }
}
```

**Why "global" exists:**
1. **Placement Persistence**: Players keep placement when switching tribes (Korok → Hylian → Eliminated = still 11th)
2. **Data Integrity**: Survives tribe deletion (no data loss)
3. **Alumni Support**: Alumni castlists work (single "Season 13" tribe with all players)
4. **Migration Path**: Clear path to per-season placements: `placements.global` → `placements[seasonId]`

#### Future Structure: Per-Season Namespaces

**Planned (not yet implemented):**
```javascript
placements: {
  "season_b11e9917a01a4955": {  // ← Per-season namespace
    playerId: {
      placement: 1,
      updatedBy: userId,
      updatedAt: timestamp
    }
  },
  "season_cac1b81de8914c79": {  // ← Different season
    playerId: {
      placement: 3,
      updatedBy: userId,
      updatedAt: timestamp
    }
  }
}
```

**Benefits when implemented:**
- Player can have placement 3 in Season 12, placement 1 in Season 15
- Castlist with `seasonId: "season_abc"` reads from that season's placements
- Cross-season castlists (Winners) can aggregate from multiple seasons
- Data integrity: one placement per player per season enforced

**Migration Path**: `placements.global` → `placements[seasonId]` when per-season placements are implemented.

## 🔄 System Integration Points

### 1. Legacy Access Methods (What Users Use)
- `/castlist` command - Shows castlist, uses string matching
- `show_castlist2` button handler - Navigation between castlists
- `determineCastlistToShow()` - Finds castlists by scanning tribe strings
- Production Menu (`prod_manage_tribes`) - Creates string-based castlists

### 2. Virtual Adapter Integration (Partial)
- **CastlistV3 Hub** (`castlist_hub_main`) - ONLY place using full virtual adapter
- **Restricted to Reece** (user ID `391415444084490240`)
- Triggers automatic migration when editing virtual castlists

### 3. Not Using Virtual Adapter (Most Systems)
- `/castlist` command - Direct string access
- `show_castlist2` handler - Direct string access
- Production tribe management - Creates strings only
- All user-facing features - String-based

## 📦 Key Implementation Files

### Core Files
- **castlistManager.js** (405 lines) - Entity CRUD operations
- **castlistVirtualAdapter.js** (273 lines) - Virtual entity bridge
- **castlistHub.js** (528 lines) - Management UI (Reece only)
- **castlistHandlers.js** (388 lines) - Button handlers for Hub
- **castlistV2.js** (767+ lines) - Display engine
- **app.js** (~21,000 lines) - Contains legacy handlers

### Key Functions

#### Creating Castlists
```javascript
// Legacy (what users use)
prod_add_tribe → prod_add_tribe_role_select → prod_add_tribe_modal_*

// CastlistV3 (Reece only)
castlistManager.createCastlist(guildId, config)
```

#### Getting Castlists
```javascript
// Legacy
playerData[guildId].tribes[roleId].castlist  // Direct string access

// Virtual Adapter (returns both real + virtual)
castlistManager.getAllCastlists(guildId)  // Returns Map
```

#### Materialization Trigger
```javascript
// In castlistManager.updateCastlist()
if (castlistVirtualAdapter.isVirtualId(castlistId)) {
  castlistId = await castlistVirtualAdapter.materializeCastlist(guildId, castlistId);
}
```

## 🚨 Critical Implementation Notes

### 1. Dual Storage During Migration

Tribes maintain BOTH fields during and after migration for maximum backwards compatibility:

```javascript
"tribes": {
  "roleId": {
    "castlist": "Season 15 Alumni",           // Legacy string (NEVER removed)
    "castlistId": "castlist_1758812609810_system"  // New entity reference
  }
}
```

**Why both fields are kept:**
- **Safety Net**: If new system fails, old system still works
- **Gradual Migration**: Allows features to migrate at different rates
- **No Breaking Changes**: Legacy code continues working unchanged
- **Reversibility**: Can roll back by simply ignoring `castlistId`

**Critical Rule**: `castlist` field is NEVER removed, even after full migration completes.

### 2. Default Castlist Special Handling

The "default" castlist has **special behavior** in the system:

**Identity:**
- **ID**: Always `"default"` (not a generated ID like `castlist_123_system`)
- **Name**: `"Active Castlist"` (fallback if not materialized)
- **Type**: `system` (cannot be deleted)

**Virtual State:**
- May NOT exist in `castlistConfigs` until first edit
- Starts virtual, materializes on first modification
- Tribes marked with `castlist: 'default'` or `castlistId: 'default'`

**Critical Pattern for Code:**
```javascript
// ✅ CORRECT: Handle undefined entity gracefully
const castlistEntity = playerData[guildId]?.castlistConfigs?.[castlistId];
const castlistName = castlistEntity?.name || (castlistId === 'default' ? 'Active Castlist' : castlistId);

// ❌ WRONG: Assumes entity always exists
const castlistName = playerData[guildId].castlistConfigs[castlistId].name;  // May throw!
```

### 3. Multi-Castlist Support (Partial Implementation)

Tribes can theoretically belong to multiple castlists:

```javascript
"tribes": {
  "roleId": {
    "castlist": "Active Castlist",     // Display name (first castlist)
    "castlistIds": [                   // Array of castlist IDs
      "default",
      "castlist_alumni_id",
      "castlist_hall_of_fame"
    ]
  }
}
```

**Current Reality:**
- `castlistIds` array exists in some tribes (legacy artifact)
- Most code only uses `castlistId` (singular)
- Full multi-castlist support NOT implemented
- First ID in array determines `castlist` field value

**When to use:**
- Active season castlist + specialty castlists (Alumni, Hall of Fame)
- Player appears in multiple views simultaneously
- Cross-season aggregate castlists (Winners from all seasons)

### 4. Inconsistent ID Storage

**Three patterns exist in production data:**

```javascript
// Pattern 1: Legacy only (pre-migration)
"castlist": "Season 13"

// Pattern 2: Single ID (most common after migration)
"castlist": "Season 13",
"castlistId": "castlist_123_system"

// Pattern 3: Array (inconsistent, legacy artifact)
"castlist": "Season 13",
"castlistId": "castlist_123_system",
"castlistIds": ["castlist_123_system"]
```

**Correct Pattern**: Use `castlistId` (singular) for single castlist assignment.

### 5. Migration Triggers (When Materialization Happens)

**Materialization ONLY happens on WRITE operations:**

✅ **Write Operations (trigger materialization):**
- Edit Info (name, emoji, description)
- Change season association
- Change sort strategy
- Add/remove tribes
- Any metadata update

❌ **Read Operations (NEVER materialize):**
- View castlist display
- Display in dropdown
- Show castlist details
- Navigate between castlists

**Why this matters:** Materialization writes to disk (expensive). Read-only operations use in-memory virtual entities for performance.

### 6. Hub Restriction (Production Safety)

**Current Access:**
- CastlistV3 Hub restricted to user ID `391415444084490240` (Reece)
- Virtual → Real migration ONLY happens via Hub
- Production users continue using legacy string system

**Why restricted:**
- Prevents untested migration scenarios in production
- Allows gradual feature testing
- Ensures backward compatibility maintained
- Can be opened to all users once fully tested

## 🎯 Current State Summary

### What Works
- ✅ Legacy string system (100% of user interactions)
- ✅ Virtual adapter (creates virtual entities from strings)
- ✅ Automatic migration (when editing through Hub)
- ✅ Backwards compatibility (both fields maintained)

### What Doesn't Work
- ❌ Users cannot access entity features
- ❌ Most code still uses direct string matching
- ❌ No unified castlist access layer
- ❌ Manual ordering UI (placeholder only)
- ❌ Swap/merge features (not implemented)

### Production Safety
- Virtual adapter never breaks legacy functionality
- Migration is transparent and maintains both fields
- Restricted to single user prevents untested scenarios
- Can roll back by simply ignoring castlistId field

## 📋 Migration Path

### Current Approach: Lazy Migration
1. **Read**: Virtual entities created on-the-fly (not saved)
2. **Edit**: Triggers materialization to real entity
3. **Dual Storage**: Both string and ID maintained
4. **Gradual**: Only migrates what's touched

### Why This Works
- Zero breaking changes
- No forced migration
- Natural progression through usage
- Always reversible

### Future Steps
1. Enable virtual adapter in `/castlist` command
2. Update `show_castlist2` to use entities
3. Eventually deprecate string matching
4. Remove user restriction on CastlistV3 Hub

---

## 📚 Related Documentation

**Core Castlist Documentation:**
- [CastlistV3.md](CastlistV3.md) - Complete CastlistV3 architecture and feature overview
- [CastlistArchitecture.md](../architecture/CastlistArchitecture.md) - System architecture and integration points
- [Placements.md](Placements.md) - Placement editing system (modal submission patterns, virtual entity handling)

**Season Documentation:**
- [SeasonLifecycle.md](../concepts/SeasonLifecycle.md) - Active season system and lifecycle
- [SeasonAppBuilder.md](SeasonAppBuilder.md) - Season application configuration

**Implementation Guides:**
- [castlistManager.js](../../castlistManager.js) - Entity CRUD operations
- [castlistVirtualAdapter.js](../../castlistVirtualAdapter.js) - Virtual entity bridge
- [castlistHandlers.js](../../castlistHandlers.js) - Button/modal handlers (season selector implementation)

---

## 📋 Document Change Log

**November 15, 2025** - Major consolidation and enhancement:
- ✅ **Consolidated 4 WIP design docs** into single source of truth:
  - Merged Season ID vs Config ID distinction (from 000-editCastlistSeasonModalSelector.md)
  - Merged Virtual Castlist Upgrade Flow (from 000-editCastlistSeason.md)
  - Merged Placement Namespaces explanation (from 000-editCastlistSeason.md)
  - Merged Multi-Castlist Support insights (from 000-editCastlistSeason.md)
- ✅ **Enhanced Critical Implementation Notes** with 6 detailed subsections
- ✅ **Added implementation evidence** from actual code (castlistHandlers.js)
- ✅ **Documented future-proofing** strategy for season top-level migration
- 📦 **Archived superseded docs**: 000-editCastlistSeason.md, 000-editCastlistSeasonModalSelector.md

**November 2025** - Initial creation:
- Documented three overlapping data models (Legacy, Virtual, Real)
- Captured actual production implementation (not planned architecture)
- Documented materialization process and virtual adapter pattern

---

## 📝 Document Metadata

**Created**: November 2025
**Last Updated**: November 15, 2025
**Status**: ✅ **Consolidated Source of Truth** (all WIP docs merged)
**Purpose**: Document the ACTUAL data structures and implementation of the castlist system as it exists in production
**Audience**: Developers working on castlist features, future Claude Code instances needing zero-context understanding

**Key Insight**: This document reflects the ACTUAL implementation as of November 2025, not the planned architecture. The system successfully maintains three overlapping data models (Legacy, Virtual, Real) to ensure backwards compatibility while enabling new features. Season integration uses `seasonId` (not config IDs) to future-proof for eventual top-level season structure migration.