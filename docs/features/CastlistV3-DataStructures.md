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
Tribes maintain BOTH fields:
- `castlist`: String (legacy) - NEVER removed for safety
- `castlistId`: Entity ID (new) - Added during migration

### 2. Default Castlist Special Handling
The "default" castlist is both:
- A magic string in legacy system
- A real entity with `id: "default"` in new system

### 3. Inconsistent ID Storage
Some tribes have:
- `castlistId` (singular) - Correct
- `castlistIds` (array) - Incorrect, legacy artifact

### 4. Migration Only Through Hub
- Virtual → Real migration ONLY happens via CastlistV3 Hub
- Hub restricted to Reece prevents production users from triggering
- Legacy systems continue using strings indefinitely

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

**Note**: This document reflects the ACTUAL implementation as of November 2025, not the planned architecture. The system successfully maintains three overlapping data models to ensure backwards compatibility while enabling new features.